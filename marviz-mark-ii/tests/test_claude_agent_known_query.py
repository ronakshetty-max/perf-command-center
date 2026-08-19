from __future__ import annotations

from dataclasses import dataclass
from unittest.mock import MagicMock, patch

from agent.claude_agent import MarvizAgent
from agent.known_query_cache import CachedAnswer, KnownQueryCache
from agent.known_queries import KNOWN_QUERIES


@dataclass
class FakeSettings:
    anthropic_api_key: str = "sk-ant-fake"
    anthropic_model: str = "claude-sonnet-4-6"
    max_tool_iterations: int = 8


def _fake_dispatcher():
    dispatcher = MagicMock()
    dispatcher.confirmation_mgr = MagicMock()
    dispatcher.confirmation_mgr.get_pending.return_value = None
    return dispatcher


def _fake_stream(text: str):
    block = MagicMock()
    block.type = "text"
    block.text = text
    response = MagicMock()
    response.content = [block]

    stream = MagicMock()
    stream.text_stream = iter([text]) if text else iter([])
    stream.get_final_message.return_value = response
    context_manager = MagicMock()
    context_manager.__enter__.return_value = stream
    context_manager.__exit__.return_value = False
    return context_manager


_G_YESTERDAY_RIZE = next(q for q in KNOWN_QUERIES if q.id == "g_yesterday_rize_spend")
_G_CMP_RIZE = next(q for q in KNOWN_QUERIES if q.id == "g_cmp_rize_spend")

_QUESTION_TEXT = "tell me the spends of google for yesterday where campaign name contains Rize"


def _seeded_cache(cached_answer: CachedAnswer) -> KnownQueryCache:
    cache = KnownQueryCache.__new__(KnownQueryCache)  # skip __init__, no real dispatcher needed
    cache._answers = {cached_answer.query.id: cached_answer}
    return cache


def test_cache_hit_skips_tool_loop_entirely():
    cached = CachedAnswer(
        query=_G_YESTERDAY_RIZE,
        result={"current": {"date_range": "2026-08-18_to_2026-08-18", "filters_applied": {}, "summary": {"spend": 7600.0, "cpc": None}}},
        computed_at=0.0,
    )
    cache = _seeded_cache(cached)
    dispatcher = _fake_dispatcher()

    with patch("agent.claude_agent.anthropic.Anthropic") as MockAnthropic:
        MockAnthropic.return_value.messages.stream.return_value = _fake_stream("You spent ₹7.6K yesterday on Rize.")
        agent = MarvizAgent(FakeSettings(), dispatcher=dispatcher, known_query_cache=cache)
        answer = agent.handle_user_turn(_QUESTION_TEXT)

    assert answer == "You spent ₹7.6K yesterday on Rize."
    # The composer call must never have been given tools — it can only speak,
    # never decide to fetch live data — and dispatcher.run must never be
    # called at all: the whole point is zero live API calls on this path.
    stream_kwargs = MockAnthropic.return_value.messages.stream.call_args.kwargs
    assert "tools" not in stream_kwargs
    dispatcher.run.assert_not_called()
    assert dispatcher.last_dashboard_payload is not None
    assert dispatcher.last_dashboard_payload["combined"]["spend"] == 7600.0


def test_cache_hit_sets_comparison_dashboard_payload():
    cached = CachedAnswer(
        query=_G_CMP_RIZE,
        result={
            "current": {"date_range": "2026-08-01_to_2026-08-19", "filters_applied": {}, "summary": {"spend": 50000.0, "cpc": None}},
            "prior": {"date_range": "2026-07-01_to_2026-07-19", "filters_applied": {}, "summary": {"spend": 40000.0, "cpc": None}},
        },
        computed_at=0.0,
    )
    cache = _seeded_cache(cached)
    dispatcher = _fake_dispatcher()

    with patch("agent.claude_agent.anthropic.Anthropic") as MockAnthropic:
        MockAnthropic.return_value.messages.stream.return_value = _fake_stream("Up 25% month over month.")
        agent = MarvizAgent(FakeSettings(), dispatcher=dispatcher, known_query_cache=cache)
        agent.handle_user_turn(
            "Compare the spends of google campaigns from month till date of this month with "
            "the same duration of previous month, where campaign name contains Rize"
        )

    payload = dispatcher.last_dashboard_payload
    assert payload["combined"]["spend"] == 50000.0
    assert payload["comparison"]["prior"]["spend"] == 40000.0


def test_composer_failure_falls_back_to_plain_template_not_an_exception():
    cached = CachedAnswer(
        query=_G_YESTERDAY_RIZE,
        result={"current": {"date_range": "2026-08-18_to_2026-08-18", "filters_applied": {}, "summary": {"spend": 7600.0, "cpc": None}}},
        computed_at=0.0,
    )
    cache = _seeded_cache(cached)
    dispatcher = _fake_dispatcher()

    with patch("agent.claude_agent.anthropic.Anthropic") as MockAnthropic:
        MockAnthropic.return_value.messages.stream.side_effect = RuntimeError("transient API error")
        agent = MarvizAgent(FakeSettings(), dispatcher=dispatcher, known_query_cache=cache)
        answer = agent.handle_user_turn(_QUESTION_TEXT)

    assert "7,600.00" in answer  # plain-template fallback, still the right number
    assert dispatcher.last_dashboard_payload is not None


def test_known_question_with_cold_cache_falls_through_to_normal_loop():
    """kq_match.id has no entry yet (e.g. right after startup, before the
    first background refresh completes) — must fall through to the normal
    tool-calling loop rather than erroring or returning nothing."""
    empty_cache = KnownQueryCache.__new__(KnownQueryCache)
    empty_cache._answers = {}
    dispatcher = _fake_dispatcher()
    dispatcher.run.return_value = {"summary": {"spend": 1.0}}

    with patch("agent.claude_agent.anthropic.Anthropic") as MockAnthropic:
        MockAnthropic.return_value.messages.stream.return_value = _fake_stream("Fell through to live path.")
        agent = MarvizAgent(FakeSettings(), dispatcher=dispatcher, known_query_cache=empty_cache)
        answer = agent.handle_user_turn(_QUESTION_TEXT)

    assert answer == "Fell through to live path."
    # This time tools WERE offered — the normal loop path, not the cache path.
    stream_kwargs = MockAnthropic.return_value.messages.stream.call_args.kwargs
    assert "tools" in stream_kwargs


def test_no_cache_instance_behaves_exactly_like_before():
    """known_query_cache=None (the default) must not change existing
    behavior at all — this is the case for every session until app.py wires
    a real shared cache in."""
    dispatcher = _fake_dispatcher()

    with patch("agent.claude_agent.anthropic.Anthropic") as MockAnthropic:
        MockAnthropic.return_value.messages.stream.return_value = _fake_stream("Normal answer.")
        agent = MarvizAgent(FakeSettings(), dispatcher=dispatcher)  # no known_query_cache kwarg
        answer = agent.handle_user_turn(_QUESTION_TEXT)

    assert answer == "Normal answer."
