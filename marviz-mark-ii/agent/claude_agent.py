from __future__ import annotations

import json
import time
from typing import Callable

import anthropic

from agent import fast_path, known_queries, tool_schemas
from agent.known_query_cache import CachedAnswer, KnownQueryCache
from agent.tool_dispatch import ToolDispatcher
from config import Settings

SYSTEM_PROMPT = """You are Marviz, a voice-activated ad analytics agent for Google Ads \
and Meta Ads. You help the user query campaign metrics (spend, clicks, CPC, CTR, ROAS, \
conversions) across both platforms, and can suggest optimizations.

Keep spoken answers concise and conversational — the user is listening, not reading. \
Round dollar amounts and percentages to sensible precision. When comparing platforms, \
lead with the headline number, then the breakdown.

CURRENCY: all spend/cost/CPC/CPM/budget figures from these ad accounts are in INR \
(Indian Rupees). Always show them with the ₹ symbol (e.g. ₹10.08, ₹144.6K) — never $, \
never any other currency symbol, and never state a currency unit in words instead of ₹.

ANSWER SCOPE: answer ONLY the specific metric(s) and date range the user actually asked \
for — do not volunteer additional metrics, breakdowns, or date ranges they didn't request, \
and do not pad the answer with unrequested context. If you think another metric or a \
different date range would be useful to them, end your answer with a short follow-up \
question offering it (e.g. "Want me to check last 7 days too?" or "Want spend and clicks \
as well?") — offer it, don't just show it.

CRITICAL — filtering: whenever the user describes campaigns rather than asking for \
everything (e.g. "campaigns containing X", "with X and Y in the name", "search \
campaigns", "brand campaigns", a specific campaign family), you MUST pass that as a real \
filter — name_contains and/or channel_type — on get_metrics/get_aggregate_summary. Never \
answer by guessing or recalling campaign names from memory; always let the tool do the \
matching. Check matched_campaign_count in the response before answering — if it's 0, tell \
the user nothing matched that description rather than inventing a number. If you're not \
sure what filter terms to use, ask the user to clarify rather than guessing.

You are read-only right now — you cannot pause/enable campaigns or change budgets. If \
the user asks you to make such a change, tell them that action isn't available yet and \
offer to show them the relevant metrics instead."""


class MarvizAgent:
    """One instance per browser connection (see app.MarvizSession). Holds its own
    conversation history and its own ToolDispatcher/ConfirmationManager, so
    concurrent viewers on the shared ad accounts never see or confirm each
    other's in-flight actions."""

    def __init__(
        self,
        settings: Settings,
        dispatcher: ToolDispatcher | None = None,
        known_query_cache: KnownQueryCache | None = None,
    ):
        self.settings = settings
        self.client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        self.dispatcher = dispatcher or ToolDispatcher(settings)
        self.confirmation_mgr = self.dispatcher.confirmation_mgr
        self.known_query_cache = known_query_cache
        self.messages: list[dict] = []

    def handle_user_turn(
        self, user_text: str, on_text_chunk: Callable[[str], None] | None = None
    ) -> str:
        """on_text_chunk, if given, is called with each incremental text delta
        as Claude generates it (streaming), before the full response is known.
        Only the text Claude actually emits is forwarded — thinking blocks and
        tool_use blocks never reach it. Intermediate tool-calling turns rarely
        emit visible text, so in practice this fires during the final,
        answer-composing turn — reducing perceived latency for that turn even
        though total wall-clock time is roughly unchanged. Return value is
        always the full accumulated text, same as before streaming was added.
        """
        self.confirmation_mgr.sweep_expired()

        if self.known_query_cache is not None:
            kq_match = known_queries.match(user_text)
            if kq_match is not None:
                cached = self.known_query_cache.get(kq_match.id)
                if cached is not None:
                    # Known question, cache already has an answer — skip the tool-calling
                    # loop entirely (no live Google/Meta API call on this request path at
                    # all) and go straight to a single no-tools composition call. This is
                    # what gets these 24 questions to ~6-7s instead of the ~15-20s a live
                    # round trip takes. If it's a known question but the cache hasn't been
                    # populated yet (e.g. right after startup, before the first background
                    # refresh completes), kq_match.id has no cached entry and we fall
                    # through to the normal live path below — same fail-open-to-latency,
                    # never-fail-open-to-wrong-data principle as agent/fast_path.py.
                    return self._answer_from_cache(user_text, cached, on_text_chunk)

        fast_match = fast_path.match(user_text)
        if fast_match is not None:
            user_text = self._augment_with_fast_path_data(user_text, fast_match)
            # Falls through into the normal loop below rather than returning
            # early. If the appended data doesn't actually answer the question
            # (fast_path.match misjudged something), Claude still has its
            # tools available on this same call and can call one for real —
            # the only cost is losing the latency win for that turn, never a
            # wrong answer.

        self.messages.append({"role": "user", "content": user_text})

        for _ in range(self.settings.max_tool_iterations):
            with self.client.messages.stream(
                model=self.settings.anthropic_model,
                max_tokens=1024,
                system=SYSTEM_PROMPT,
                tools=self._tools(),
                messages=self.messages,
            ) as stream:
                for text in stream.text_stream:
                    if on_text_chunk is not None:
                        on_text_chunk(text)
                response = stream.get_final_message()

            self.messages.append({"role": "assistant", "content": response.content})

            tool_uses = [b for b in response.content if b.type == "tool_use"]
            if not tool_uses:
                text_parts = [b.text for b in response.content if b.type == "text"]
                return "".join(text_parts).strip()

            tool_results = []
            for tu in tool_uses:
                result = self.dispatcher.run(tu.name, tu.input)
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": tu.id,
                        "content": json.dumps(result),
                    }
                )
            self.messages.append({"role": "user", "content": tool_results})

        return "I wasn't able to finish that — too many steps needed. Try rephrasing."

    def _augment_with_fast_path_data(
        self, user_text: str, fast_match: fast_path.FastPathMatch
    ) -> str:
        """Pre-fetches data for a recognized simple/unfiltered query via the
        SAME dispatcher.run() path a normal tool call would use — no
        divergent fetch logic — and appends it as context after the user's
        actual question in a single user-turn message. When the appended
        data genuinely answers the question, Claude responds with text on
        its first call instead of also calling a tool, cutting one full
        Claude round trip. Tools remain available on that same call, so a
        misjudged fast-path match just costs the latency saving, not
        correctness — Claude can still call get_metrics/etc. for real if the
        pre-fetched data doesn't actually cover what was asked."""
        if fast_match.intent in ("spend", "roas"):
            tool_input = {
                "platforms": ["google", "meta"],
                "date_range": fast_match.date_range,
            }
            result = self.dispatcher.run("get_aggregate_summary", tool_input)
            data_note = (
                f"[Pre-fetched get_aggregate_summary({tool_input}) result, in case it "
                f"answers this — if it doesn't (e.g. you actually need a specific "
                f"platform, campaign, or filter this fetch didn't apply), call a tool "
                f"yourself instead of using it:]\n{json.dumps(result)}"
            )
        elif fast_match.intent == "list_campaigns":
            google = self.dispatcher.run("list_campaigns", {"platform": "google"})
            meta = self.dispatcher.run("list_campaigns", {"platform": "meta"})
            data_note = (
                "[Pre-fetched list_campaigns for both platforms, in case it answers "
                "this — if it doesn't, call a tool yourself instead of using it:]\n"
                f"google: {json.dumps(google)}\nmeta: {json.dumps(meta)}"
            )
        else:
            return user_text

        return f"{user_text}\n\n{data_note}"

    def _answer_from_cache(
        self,
        user_text: str,
        cached: CachedAnswer,
        on_text_chunk: Callable[[str], None] | None,
    ) -> str:
        """Phrases a background-refreshed cached answer (agent/known_query_cache.py)
        into a spoken response — ONE Claude call, no tools attached, so this call
        cannot itself decide to make a live tool/API call no matter what. If even
        that single call fails (network hiccup, rate limit), falls back to a plain
        templated sentence built directly from the cached numbers — still correct,
        just less conversational."""
        cache_age_seconds = round(time.time() - cached.computed_at)
        composer_messages = [
            {
                "role": "user",
                "content": (
                    f"{user_text}\n\n[Pre-computed answer data for this exact question, "
                    f"refreshed {cache_age_seconds}s ago — answer using ONLY these "
                    f"numbers. Do not call a tool (none are available on this turn), "
                    f"do not add metrics or date ranges beyond what's given here:]\n"
                    f"{json.dumps(cached.result, default=str)}"
                ),
            }
        ]
        try:
            with self.client.messages.stream(
                model=self.settings.anthropic_model,
                max_tokens=256,
                system=SYSTEM_PROMPT,
                messages=composer_messages,
            ) as stream:
                for text in stream.text_stream:
                    if on_text_chunk is not None:
                        on_text_chunk(text)
                response = stream.get_final_message()
            text_parts = [b.text for b in response.content if b.type == "text"]
            answer = "".join(text_parts).strip()
            if not answer:
                answer = _format_cache_fallback(cached)
        except Exception:
            answer = _format_cache_fallback(cached)

        self.messages.append({"role": "user", "content": user_text})
        self.messages.append({"role": "assistant", "content": answer})
        self.dispatcher.last_dashboard_payload = _dashboard_payload_from_cache(cached)
        return answer

    def _tools(self) -> list[dict]:
        # Write tools (propose_action/confirm_and_execute_action/cancel_pending_action)
        # are deliberately withheld from Claude for now — read/view only. The dispatch
        # code and confirmation gate are still intact in tool_dispatch.py/confirmation.py;
        # switch this back to tool_schemas.ALL when write actions are wanted again.
        return tool_schemas.READ_TOOLS


def _metric_value(get_metrics_result: dict, metric: str) -> float | None:
    summary = get_metrics_result.get("summary") or {}
    return summary.get("cpc") if metric == "avg_cpc" else summary.get("spend")


def _format_cache_fallback(cached: CachedAnswer) -> str:
    """Deterministic, no-LLM answer built directly from the cached numbers —
    used only if the single composition Claude call in _answer_from_cache
    itself fails. Less conversational than the normal answer, never wrong."""
    q = cached.query
    label = "Avg CPC" if q.metric == "avg_cpc" else "Spend"
    current = _metric_value(cached.result["current"], q.metric)
    current_str = f"₹{current:,.2f}" if current is not None else "no data"
    if not q.comparison:
        return f"{label}: {current_str}."
    prior = _metric_value(cached.result["prior"], q.metric)
    prior_str = f"₹{prior:,.2f}" if prior is not None else "no data"
    return f"{label} — this month to date: {current_str}, same duration last month: {prior_str}."


def _dashboard_payload_from_cache(cached: CachedAnswer) -> dict:
    current = cached.result["current"]
    payload = {
        "type": "metrics",
        "date_range": current.get("date_range"),
        "filters_applied": current.get("filters_applied"),
        "by_platform": {cached.query.platform: current.get("summary")},
        "combined": current.get("summary"),
    }
    if cached.query.comparison:
        payload["comparison"] = {"prior": cached.result["prior"].get("summary")}
    return payload
