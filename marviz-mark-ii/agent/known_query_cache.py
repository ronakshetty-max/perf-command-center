"""Background-refreshed cache for the fixed 24-question catalog in
agent/known_queries.py. One instance is owned by the FastAPI app itself
(app.py), not per-session — all concurrent viewers read the same cache, and
only a single periodic refresh loop ever writes to it (see app.py's startup
task). This is what lets a matched known question answer in ~6-7s instead of
the ~15-20s a live Google/Meta Ads + Claude round trip takes: no live API
call happens on the request path at all, just a dict lookup.

Thread-safety note: refresh_all() runs in a worker thread (via
run_in_threadpool) while request-handling threads concurrently call get().
No explicit lock is used — each cache slot is replaced with a fully-built
CachedAnswer via a single dict item assignment, which CPython's GIL makes an
atomic pointer swap; readers only ever see a complete previous or complete
new value, never a partially-built one.
"""

from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

from agent.known_queries import KNOWN_QUERIES, KnownQuery
from agent.tool_dispatch import ToolDispatcher
from config import Settings
from tools import date_ranges

# Refreshing all 24 catalog entries means up to ~33 individual live API calls
# (comparison entries need two fetches — current period + prior period). Run
# them concurrently rather than one after another — sequential would make
# every refresh cycle (and the blocking initial refresh at startup) take
# roughly 33x a single call's latency instead of ~33/N x. Kept modest (not
# e.g. 16+) because Meta's Marketing API enforces an app-level request-rate
# limit that a burst of concurrent calls can trip — a tripped call just
# leaves that one entry stale/uncached until the next cycle (see
# refresh_all's docstring), never wrong, but a lower number here means it
# happens less often.
_MAX_CONCURRENT_FETCHES = 4

logger = logging.getLogger("marviz.known_query_cache")


@dataclass
class CachedAnswer:
    query: KnownQuery
    # {"current": <get_metrics result dict>} for a plain query, or
    # {"current": ..., "prior": ...} for a comparison query.
    result: dict
    computed_at: float


class KnownQueryCache:
    def __init__(self, settings: Settings, dispatcher: ToolDispatcher | None = None):
        self.settings = settings
        self.dispatcher = dispatcher or ToolDispatcher(settings)
        self._answers: dict[str, CachedAnswer] = {}

    def get(self, query_id: str) -> CachedAnswer | None:
        return self._answers.get(query_id)

    def refresh_all(self) -> None:
        """Recomputes every catalog entry against live data, fetching all
        (query, period) combinations concurrently. Call this once at startup
        (synchronously, before serving traffic) and then periodically from a
        background loop. A single fetch failing (API hiccup, quota, etc.)
        logs and leaves that whole query's previous cached value in place
        rather than blanking it or aborting the rest of the batch — and for a
        comparison query, both the current-period and prior-period fetch
        must succeed or neither is applied, so a cached answer is never a mix
        of a fresh current period and a stale prior period."""
        anchor = date_ranges.today()

        # (query, role, date_range) for every individual fetch this refresh needs —
        # comparison queries contribute two rows (current + prior), plain ones one.
        jobs: list[tuple[KnownQuery, str, date_ranges.DateRange]] = []
        for q in KNOWN_QUERIES:
            if q.comparison:
                current_range, prior_range = date_ranges.month_to_date_vs_prev_month(anchor)
                jobs.append((q, "current", current_range))
                jobs.append((q, "prior", prior_range))
            else:
                jobs.append((q, "current", date_ranges.resolve(q.date_kind, anchor)))

        parts_by_query: dict[str, dict] = {}
        failed_query_ids: set[str] = set()
        with ThreadPoolExecutor(max_workers=_MAX_CONCURRENT_FETCHES) as pool:
            future_to_job = {
                pool.submit(self._fetch, q, date_range): (q, role) for (q, role, date_range) in jobs
            }
            for future in future_to_job:
                q, role = future_to_job[future]
                try:
                    result = future.result()
                except Exception:
                    logger.exception("known-query cache refresh failed for %r (%s)", q.id, role)
                    failed_query_ids.add(q.id)
                    continue
                parts_by_query.setdefault(q.id, {})[role] = result

        now = time.time()
        for q in KNOWN_QUERIES:
            if q.id in failed_query_ids:
                continue
            parts = parts_by_query.get(q.id)
            if not parts or "current" not in parts:
                continue
            if q.comparison and "prior" not in parts:
                continue
            self._answers[q.id] = CachedAnswer(query=q, result=parts, computed_at=now)

    def _fetch(self, q: KnownQuery, date_range: date_ranges.DateRange) -> dict:
        start, end = date_range
        tool_input = {
            "platform": q.platform,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "name_contains": list(q.name_contains),
        }
        if q.channel_type:
            tool_input["channel_type"] = q.channel_type
        # Goes through the same ToolDispatcher.run() path a live Claude tool
        # call would use — no divergent fetch logic, same filter/date-window
        # semantics either way.
        result = self.dispatcher.run("get_metrics", tool_input)
        if "error" in result:
            raise RuntimeError(result["error"])
        return result
