import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("ANTHROPIC_API_KEY", "sk-ant-fake-for-tests")
os.environ.setdefault("GOOGLE_ADS_DEVELOPER_TOKEN", "fake")
os.environ.setdefault("GOOGLE_ADS_CLIENT_ID", "fake")
os.environ.setdefault("GOOGLE_ADS_CLIENT_SECRET", "fake")
os.environ.setdefault("GOOGLE_ADS_REFRESH_TOKEN", "fake")
os.environ.setdefault("GOOGLE_ADS_CUSTOMER_ID", "1234567890")
os.environ.setdefault("META_APP_ID", "fake")
os.environ.setdefault("META_APP_SECRET", "fake")
os.environ.setdefault("META_ACCESS_TOKEN", "fake")
os.environ.setdefault("META_AD_ACCOUNT_ID", "act_1234567890")

from starlette.testclient import TestClient

import app as app_module
from config import load_settings


def _configured_app():
    app_module._settings = load_settings(require_anthropic=True)
    app_module._config_errors = []
    return app_module.app


def _fake_text_response(text: str):
    block = MagicMock()
    block.type = "text"
    block.text = text
    response = MagicMock()
    response.content = [block]
    return response


def _receive_final(ws):
    """Reads WebSocket messages until the final turn response (the one with
    a "transcript" key), discarding any streamed {"type": "text_chunk", ...}
    messages along the way. Turns emitting no text (e.g. an error before any
    streaming starts) produce zero chunk messages, so this also works for
    those unchanged."""
    while True:
        data = ws.receive_json()
        if "transcript" in data:
            return data


def _fake_stream(text: str):
    """Builds a MagicMock usable as `with client.messages.stream(...) as stream:` —
    iterating `stream.text_stream` yields `text` as a single chunk, and
    `stream.get_final_message()` returns the same fake response
    `_fake_text_response` would have, so existing response-shape assertions
    stay valid after the create->stream migration for token-by-token output."""
    stream = MagicMock()
    stream.text_stream = iter([text]) if text else iter([])
    stream.get_final_message.return_value = _fake_text_response(text)
    context_manager = MagicMock()
    context_manager.__enter__.return_value = stream
    context_manager.__exit__.return_value = False
    return context_manager


def test_text_escape_hatch_round_trip():
    app = _configured_app()
    with patch("agent.claude_agent.anthropic.Anthropic") as MockAnthropic:
        MockAnthropic.return_value.messages.stream.return_value = _fake_stream(
            "Your spend is $100."
        )
        with TestClient(app) as client:
            with client.websocket_connect("/ws/marviz") as ws:
                ws.send_json({"type": "text", "text": "how much did we spend"})
                data = _receive_final(ws)

    assert data["transcript"] == "how much did we spend"
    assert data["text_response"] == "Your spend is $100."
    assert data["dashboard_payload"] is None


def test_clean_disconnect_does_not_raise():
    """Regression test: websocket.receive() returns a raw ASGI
    {"type": "websocket.disconnect"} message on close, which is NOT the same
    as WebSocketDisconnect being raised. The handler must check for this
    explicitly and break, or it loops back into receive() and crashes with
    'Cannot call "receive" once a disconnect message has been received.'"""
    app = _configured_app()
    with patch("agent.claude_agent.anthropic.Anthropic") as MockAnthropic:
        MockAnthropic.return_value.messages.stream.return_value = _fake_stream("ok")
        with TestClient(app) as client:
            with client.websocket_connect("/ws/marviz") as ws:
                ws.send_json({"type": "text", "text": "hi"})
                _receive_final(ws)
            # Exiting the `with` block above closes the socket; a second
            # connection succeeding confirms the server didn't crash on close.
            with client.websocket_connect("/ws/marviz") as ws2:
                ws2.send_json({"type": "text", "text": "hi again"})
                data2 = _receive_final(ws2)
                assert data2["text_response"] == "ok"


def test_turn_error_is_reported_not_fatal():
    """Regression test: a real prod crash. A failure mid-turn (e.g. Anthropic
    or Gemini transcription raising — here simulated via a quota-style error)
    must be caught and sent back as a normal response, not propagate up and
    kill the WebSocket connection. Before this fix, one failed turn made every
    subsequent message on the same connection (including plain text turns)
    silently do nothing, because the socket was already dead."""
    app = _configured_app()
    quota_error = Exception(
        "Error code: 429 - {'error': {'code': 'credit_balance_exhausted'}}"
    )
    with patch("agent.claude_agent.anthropic.Anthropic") as MockAnthropic:
        MockAnthropic.return_value.messages.stream.side_effect = quota_error
        with TestClient(app) as client:
            with client.websocket_connect("/ws/marviz") as ws:
                ws.send_json({"type": "text", "text": "how much did we spend"})
                data = _receive_final(ws)
                assert "credits" in data["text_response"] or "quota" in data["text_response"]

    # Connection must still be usable afterward for a fresh session.
    with patch("agent.claude_agent.anthropic.Anthropic") as MockAnthropic:
        MockAnthropic.return_value.messages.stream.return_value = _fake_stream("ok")
        with TestClient(app) as client:
            with client.websocket_connect("/ws/marviz") as ws2:
                ws2.send_json({"type": "text", "text": "still there?"})
                data2 = _receive_final(ws2)
                assert data2["text_response"] == "ok"


def test_invalid_text_frame_shape_is_rejected_gracefully():
    app = _configured_app()
    with TestClient(app) as client:
        with client.websocket_connect("/ws/marviz") as ws:
            ws.send_json({"type": "not_text", "foo": "bar"})
            data = ws.receive_json()
            assert "Expected" in data["text_response"]


def test_health_reports_missing_config():
    from config import ConfigError

    with patch(
        "app.load_settings",
        side_effect=ConfigError(
            "Invalid configuration:\n  - Missing required env var: ANTHROPIC_API_KEY"
        ),
    ):
        with TestClient(app_module.app) as client:
            resp = client.get("/health")

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "misconfigured"
    assert any("ANTHROPIC_API_KEY" in line for line in body["config_errors"])
