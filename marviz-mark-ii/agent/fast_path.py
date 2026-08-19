"""Optional latency shortcut for a small set of unambiguous, unfiltered
queries. Skips Claude's first (tool-decision) call by fetching data directly
and letting Claude only compose the spoken answer — one Claude call instead
of two.

SAFETY: this module is deliberately narrow. It must never guess at filtering
intent (campaign names, channel types) — that's exactly the class of mistake
that produces a confident, wrong number. A match here requires:
  1. The query maps to one of a few fixed intents (spend/ROAS/campaign list).
  2. The query contains NONE of the filter-signal words (BLOCK_WORDS) that
     would mean the user wants a subset of campaigns, not everything.
  3. The date range is one of the four the tools already support.

If any of these don't hold, `match()` returns None and the caller must fall
back to the normal MarvizAgent.handle_user_turn tool-calling loop. A missed
fast-path opportunity just costs the extra latency it was trying to save —
never wrong data. A wrongly *taken* fast-path could return a plausible but
incorrect number, which is the failure mode this module is built to avoid.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Any of these words anywhere in the query means the user is asking about a
# subset of campaigns (by name, channel type, or specific campaign) rather
# than an account-wide total — never fast-path those, always let Claude
# apply real filtering via the tool schema.
BLOCK_WORDS = {
    "contain", "contains", "containing", "with", "named", "call", "called",
    "search", "display", "shopping", "video", "brand", "branding",
    "performance", "max", "local", "smart", "discovery", "demand",
    "travel", "hotel", "id", "specific", "only", "just", "except",
    "excluding", "compare",
}

# Digits that AREN'T part of a recognized date phrase (e.g. "last 30 days")
# mean the query references something specific — most plausibly a campaign
# ID — that the fast path can't safely resolve. Strip known date-phrase
# digits first, then block on whatever digits remain.
_DATE_PHRASE_DIGITS_RE = re.compile(r"(last|past)\s*(7|30)\s*days?")
_HAS_DIGITS_RE = re.compile(r"\d")

_DATE_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\btoday\b"), "today"),
    (re.compile(r"\byesterday\b"), "yesterday"),
    (re.compile(r"\b(last|past)\s*(7\s*days?|week)\b"), "last_7d"),
    (re.compile(r"\bthis\s*week\b"), "last_7d"),
    (re.compile(r"\b(last|past)\s*(30\s*days?|month)\b"), "last_30d"),
    (re.compile(r"\bthis\s*month\b"), "last_30d"),
]

_SPEND_RE = re.compile(
    r"\b(how much (did|have|has) (we|i)?\s*spen[dt]"
    r"|what('s| is| was| did) (we|i|our|my|the)?\s*(total )?spen[dt]"
    r"|(total |our |my )spend\b)"
)
_ROAS_RE = re.compile(r"\broas\b")
_LIST_CAMPAIGNS_RE = re.compile(
    r"\b(list|show( me)?|what are)\s+(my|our|the|all)?\s*(active\s+)?campaigns\b"
)


@dataclass
class FastPathMatch:
    intent: str  # "spend" | "roas" | "list_campaigns"
    date_range: str  # "today" | "yesterday" | "last_7d" | "last_30d"


def match(user_text: str) -> FastPathMatch | None:
    text = user_text.strip().lower()
    words = set(re.findall(r"[a-z_]+", text))

    if words & BLOCK_WORDS:
        return None
    text_without_date_digits = _DATE_PHRASE_DIGITS_RE.sub("", text)
    if _HAS_DIGITS_RE.search(text_without_date_digits):
        return None

    date_range = "last_7d"  # tools' own default when no date phrase is given
    for pattern, resolved in _DATE_PATTERNS:
        if pattern.search(text):
            date_range = resolved
            break

    if _ROAS_RE.search(text):
        return FastPathMatch(intent="roas", date_range=date_range)
    if _SPEND_RE.search(text):
        return FastPathMatch(intent="spend", date_range=date_range)
    if _LIST_CAMPAIGNS_RE.search(text):
        # Campaign lists aren't date-scoped; date_range is unused for this intent.
        return FastPathMatch(intent="list_campaigns", date_range=date_range)

    return None
