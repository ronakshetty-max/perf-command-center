"""Fixed catalog of 24 known (platform, date-range, campaign-filter, metric)
questions that get a background-refreshed cached answer instead of a live
tool-calling round trip — see agent/known_query_cache.py for the cache and
agent/claude_agent.py for where match() is consulted.

SAFETY (same philosophy as agent/fast_path.py): match() is a closed-world,
deterministic matcher — no LLM call, no fuzzy scoring. It extracts platform,
metric, comparison, date_kind, campaign-name filter tokens, and channel_type
from the question text, then looks that exact structured tuple up against
KNOWN_QUERIES. Anything that doesn't land on an exact tuple match returns
None, and the caller falls back to the normal live tool-calling loop. A
missed match just costs the latency this module was built to save — it can
never produce a wrong number by guessing at intent.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Literal campaign-name filter tokens this account's known questions use.
# These are matched as whole words in the QUESTION text, then used verbatim
# as case-insensitive substring filters against real campaign names (see
# agent/tool_dispatch.py::_filter_by_name) — same AND semantics already
# established there.
_FILTER_VOCAB = ("rpsme", "brand", "rize", "rpbrand", "rbranding")
_FILTER_TOKEN_RE = re.compile(r"\b(" + "|".join(_FILTER_VOCAB) + r")\b")

_GOOGLE_RE = re.compile(r"\bgoogle\b")
_META_RE = re.compile(r"\bmeta\b")
_CPC_RE = re.compile(r"\bcpc\b")
_SPEND_RE = re.compile(r"\bspends?\b")
_COMPARISON_RE = re.compile(r"\bcompar\w*\b|\bimprovement\b")
_YESTERDAY_RE = re.compile(r"\byesterday\b")
_LAST_7_DAYS_RE = re.compile(r"\blast\s*7\s*days\b")
_MTD_RE = re.compile(r"\bmonth\s*till\s*date\b|\bmtd\b")
_SEARCH_RE = re.compile(r"\bsearch\b")


@dataclass(frozen=True)
class KnownQuery:
    id: str
    platform: str  # "google" | "meta"
    metric: str  # "spend" | "avg_cpc"
    comparison: bool
    date_kind: str  # "yesterday" | "last_7_days" | "mtd" | "mtd_vs_prev_month"
    name_contains: tuple[str, ...]
    channel_type: str | None = None


def _q(
    id: str,
    platform: str,
    metric: str,
    comparison: bool,
    date_kind: str,
    name_contains: tuple[str, ...],
    channel_type: str | None = None,
) -> KnownQuery:
    return KnownQuery(id, platform, metric, comparison, date_kind, name_contains, channel_type)


KNOWN_QUERIES: tuple[KnownQuery, ...] = (
    # Spend — yesterday
    _q("g_yesterday_rpsme_brand_spend", "google", "spend", False, "yesterday", ("rpsme", "brand")),
    _q("g_yesterday_rize_spend", "google", "spend", False, "yesterday", ("rize",)),
    _q("m_yesterday_rize_spend", "meta", "spend", False, "yesterday", ("rize",)),
    _q("m_yesterday_rpbrand_spend", "meta", "spend", False, "yesterday", ("rpbrand",)),
    _q("m_yesterday_rbranding_spend", "meta", "spend", False, "yesterday", ("rbranding",)),
    # Spend — last 7 days
    _q("g_last7_rpsme_brand_spend", "google", "spend", False, "last_7_days", ("rpsme", "brand")),
    _q("g_last7_rize_spend", "google", "spend", False, "last_7_days", ("rize",)),
    _q("m_last7_rize_spend", "meta", "spend", False, "last_7_days", ("rize",)),
    _q("m_last7_rpbrand_spend", "meta", "spend", False, "last_7_days", ("rpbrand",)),
    _q("m_last7_rbranding_spend", "meta", "spend", False, "last_7_days", ("rbranding",)),
    # Spend — month till date
    _q("g_mtd_rpsme_brand_spend", "google", "spend", False, "mtd", ("rpsme", "brand")),
    _q("g_mtd_rize_spend", "google", "spend", False, "mtd", ("rize",)),
    _q("m_mtd_rize_spend", "meta", "spend", False, "mtd", ("rize",)),
    _q("m_mtd_rpbrand_spend", "meta", "spend", False, "mtd", ("rpbrand",)),
    _q("m_mtd_rbranding_spend", "meta", "spend", False, "mtd", ("rbranding",)),
    # Spend — MTD vs same duration of previous month
    _q("g_cmp_rpsme_brand_spend", "google", "spend", True, "mtd_vs_prev_month", ("rpsme", "brand")),
    _q("m_cmp_rbranding_spend", "meta", "spend", True, "mtd_vs_prev_month", ("rbranding",)),
    _q("g_cmp_rize_spend", "google", "spend", True, "mtd_vs_prev_month", ("rize",)),
    _q("m_cmp_rpbrand_spend", "meta", "spend", True, "mtd_vs_prev_month", ("rpbrand",)),
    _q("m_cmp_rize_spend", "meta", "spend", True, "mtd_vs_prev_month", ("rize",)),
    _q("m_cmp_rpsme_spend", "meta", "spend", True, "mtd_vs_prev_month", ("rpsme",)),
    # Avg CPC — Google search campaigns. No date range was stated in these
    # questions; defaulted to month-to-date for consistency with the other
    # RPSME+brand / Rize MTD spend questions above.
    _q("g_cpc_rpsme_brand_search", "google", "avg_cpc", False, "mtd", ("rpsme", "brand"), "SEARCH"),
    _q("g_cpc_rize_search", "google", "avg_cpc", False, "mtd", ("rize",), "SEARCH"),
    # Avg CPC improvement, July vs August MTD — same computation as the spend
    # MTD-vs-prev-month comparisons above (this month's MTD vs the same
    # duration of the previous calendar month), just for CPC instead of spend.
    _q("g_cpc_cmp_rpsme_brand_search", "google", "avg_cpc", True, "mtd_vs_prev_month", ("rpsme", "brand"), "SEARCH"),
)

_BY_KEY: dict[tuple, KnownQuery] = {
    (q.platform, q.metric, q.comparison, q.date_kind, frozenset(q.name_contains), q.channel_type): q
    for q in KNOWN_QUERIES
}


def _extract_platform(text: str) -> str | None:
    is_google = bool(_GOOGLE_RE.search(text))
    is_meta = bool(_META_RE.search(text))
    if is_google and not is_meta:
        return "google"
    if is_meta and not is_google:
        return "meta"
    return None  # both or neither — ambiguous, don't guess


def _extract_metric(text: str) -> str | None:
    if _CPC_RE.search(text):
        return "avg_cpc"
    if _SPEND_RE.search(text):
        return "spend"
    return None


def _extract_date_kind(text: str, comparison: bool, metric: str) -> str | None:
    if comparison:
        # Every comparison question in this catalog is a month-to-date vs
        # previous-month-same-duration comparison (including the "July to
        # August" one, which resolves to exactly that as of today's date) —
        # there's no yesterday/last-7-days comparison variant to disambiguate.
        return "mtd_vs_prev_month"
    if _YESTERDAY_RE.search(text):
        return "yesterday"
    if _LAST_7_DAYS_RE.search(text):
        return "last_7_days"
    if _MTD_RE.search(text):
        return "mtd"
    if metric == "avg_cpc":
        # The two non-comparison CPC questions never state a date range.
        return "mtd"
    return None


def _extract_name_contains(text: str) -> frozenset[str]:
    return frozenset(_FILTER_TOKEN_RE.findall(text))


def _extract_channel_type(text: str, metric: str) -> str | None:
    if metric == "avg_cpc" and _SEARCH_RE.search(text):
        return "SEARCH"
    return None


def match(user_text: str) -> KnownQuery | None:
    text = user_text.strip().lower()

    platform = _extract_platform(text)
    if platform is None:
        return None

    metric = _extract_metric(text)
    if metric is None:
        return None

    comparison = bool(_COMPARISON_RE.search(text))

    date_kind = _extract_date_kind(text, comparison, metric)
    if date_kind is None:
        return None

    name_contains = _extract_name_contains(text)
    if not name_contains:
        return None

    channel_type = _extract_channel_type(text, metric)

    key = (platform, metric, comparison, date_kind, name_contains, channel_type)
    return _BY_KEY.get(key)
