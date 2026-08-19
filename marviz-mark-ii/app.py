from __future__ import annotations

import asyncio
import json
import logging
from typing import Callable

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from agent.claude_agent import MarvizAgent
from agent.confirmation import is_affirmative, is_negative
from agent.known_query_cache import KnownQueryCache
from agent.tool_dispatch import ToolDispatcher
from config import ConfigError, Settings, load_settings
from stt.gemini_client import GeminiTranscriber

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("marviz")

app = FastAPI(title="Marviz Mark II")

_settings: Settings | None = None
_config_errors: list[str] = []
_known_query_cache: KnownQueryCache | None = None
_known_query_refresh_task: asyncio.Task | None = None


@app.on_event("startup")
def _load_settings() -> None:
    global _settings, _config_errors
    try:
        _settings = load_settings(require_anthropic=True)
        _config_errors = []
    except ConfigError as e:
        _settings = None
        _config_errors = str(e).splitlines()
        logger.warning("Marviz starting with incomplete config:\n%s", e)


@app.on_event("startup")
async def _start_known_query_cache() -> None:
    """Runs after _load_settings (registration order = execution order for
    FastAPI startup handlers). Builds the shared, background-refreshed cache
    for the fixed known-question catalog (agent/known_queries.py) and kicks
    off the refresh loop as a background task WITHOUT awaiting its first
    cycle — refreshing all ~24 entries against live APIs takes tens of
    seconds, and FastAPI doesn't finish starting (won't even answer
    /health) until every startup handler returns, so awaiting it here would
    make every server restart hang for that long. Known questions just miss
    the cache and fall through to the normal live path (slower, never wrong)
    until the first background cycle finishes populating it."""
    global _known_query_cache, _known_query_refresh_task
    if _settings is None:
        return
    _known_query_cache = KnownQueryCache(_settings)
    _known_query_refresh_task = asyncio.create_task(_known_query_refresh_loop())


async def _known_query_refresh_loop() -> None:
    assert _settings is not None and _known_query_cache is not None
    while True:
        try:
            await run_in_threadpool(_known_query_cache.refresh_all)
        except Exception:
            logger.exception("known-query cache refresh failed; keeping previous cache")
        await asyncio.sleep(_settings.known_query_refresh_seconds)


@app.on_event("shutdown")
async def _stop_known_query_cache() -> None:
    if _known_query_refresh_task is None:
        return
    _known_query_refresh_task.cancel()
    try:
        await _known_query_refresh_task
    except asyncio.CancelledError:
        pass


class MarvizSession:
    """One per accepted WebSocket connection. Owns its own agent, dispatcher,
    and confirmation state so concurrent viewers on the shared ad accounts
    never see or confirm each other's pending write actions."""

    def __init__(self, settings: Settings, known_query_cache: KnownQueryCache | None = None):
        self.dispatcher = ToolDispatcher(settings)
        self.agent = MarvizAgent(
            settings, dispatcher=self.dispatcher, known_query_cache=known_query_cache
        )
        self.transcriber = (
            GeminiTranscriber(settings) if settings.gemini_api_key else None
        )

    def handle_text(
        self, user_text: str, on_text_chunk: Callable[[str], None] | None = None
    ) -> dict:
        # Orchestrator-level confirm/cancel gate: only this method (never a tool
        # handler) may transition a pending action to "confirmed"/"cancelled",
        # per the invariant in agent/confirmation.py.
        pending = self.agent.confirmation_mgr.get_pending()
        if pending is not None:
            if is_affirmative(user_text):
                self.agent.confirmation_mgr.confirm(pending.id)
            elif is_negative(user_text):
                self.agent.confirmation_mgr.cancel(pending.id)

        text_response = self.agent.handle_user_turn(user_text, on_text_chunk=on_text_chunk)
        dashboard_payload = self.dispatcher.last_dashboard_payload
        return {
            "transcript": user_text,
            "text_response": text_response,
            "dashboard_payload": dashboard_payload,
            "audio_base64": None,
        }


def _error_response(transcript: str, error: Exception) -> dict:
    """Build a client-facing error reply instead of letting an exception
    propagate up through the WebSocket handler and kill the connection —
    a single failed turn (e.g. an exhausted API quota) must not take down
    the whole session for that viewer."""
    message = str(error)
    if "insufficient_quota" in message or "credit_balance_exhausted" in message or "RESOURCE_EXHAUSTED" in message:
        text_response = (
            "Voice transcription is unavailable right now — the Google API "
            "quota is exhausted. Check the Gemini API quota in Google Cloud "
            "console, or use text input in the meantime."
        )
    else:
        text_response = f"Something went wrong processing that: {type(error).__name__}: {error}"
    return {
        "transcript": transcript,
        "text_response": text_response,
        "dashboard_payload": None,
        "audio_base64": None,
    }


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok" if _settings is not None else "misconfigured",
        "config_errors": _config_errors,
    }


@app.websocket("/ws/marviz")
async def marviz_stream_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()

    if _settings is None:
        await websocket.send_json(
            {
                "transcript": "",
                "text_response": (
                    "Marviz Mark II is not configured yet. Missing: "
                    + "; ".join(_config_errors)
                ),
                "dashboard_payload": None,
                "audio_base64": None,
            }
        )
        await websocket.close()
        return

    session = MarvizSession(_settings, known_query_cache=_known_query_cache)
    loop = asyncio.get_running_loop()

    def make_chunk_forwarder() -> Callable[[str], None]:
        """handle_text runs in a worker thread (via run_in_threadpool), but
        WebSocket.send_json is a coroutine that must run on the event loop.
        on_text_chunk is called from that worker thread, so it can't just
        `await` — it schedules the send onto the loop via
        run_coroutine_threadsafe and blocks the worker thread until the send
        completes, which keeps chunks in order and applies backpressure
        instead of queuing unboundedly if the client is slow to receive."""

        def on_text_chunk(text: str) -> None:
            future = asyncio.run_coroutine_threadsafe(
                websocket.send_json({"type": "text_chunk", "text": text}), loop
            )
            future.result()

        return on_text_chunk

    try:
        while True:
            message = await websocket.receive()

            if message["type"] == "websocket.disconnect":
                break

            if "text" in message and message["text"] is not None:
                try:
                    payload = json.loads(message["text"])
                except json.JSONDecodeError:
                    await websocket.send_json(
                        {"transcript": "", "text_response": "Invalid message.", "dashboard_payload": None, "audio_base64": None}
                    )
                    continue

                if payload.get("type") != "text" or "text" not in payload:
                    await websocket.send_json(
                        {
                            "transcript": "",
                            "text_response": 'Expected {"type": "text", "text": "..."} for text input.',
                            "dashboard_payload": None,
                            "audio_base64": None,
                        }
                    )
                    continue

                user_text = payload["text"]
                try:
                    response = await run_in_threadpool(
                        session.handle_text, user_text, make_chunk_forwarder()
                    )
                except Exception as e:
                    logger.exception("Error handling text turn")
                    response = _error_response(user_text, e)
                await websocket.send_json(response)

            elif "bytes" in message and message["bytes"] is not None:
                if session.transcriber is None:
                    await websocket.send_json(
                        {
                            "transcript": "",
                            "text_response": (
                                "Voice input isn't available yet — GEMINI_API_KEY "
                                "is not configured. Use text input for now."
                            ),
                            "dashboard_payload": None,
                            "audio_base64": None,
                        }
                    )
                    continue

                audio_bytes = message["bytes"]
                try:
                    user_text = await run_in_threadpool(
                        session.transcriber.transcribe, audio_bytes
                    )
                    response = await run_in_threadpool(
                        session.handle_text, user_text, make_chunk_forwarder()
                    )
                except Exception as e:
                    logger.exception("Error handling voice turn")
                    response = _error_response("", e)
                await websocket.send_json(response)

    except WebSocketDisconnect:
        logger.info("Marviz client disconnected.")


app.mount("/", StaticFiles(directory="static", html=True), name="static")
