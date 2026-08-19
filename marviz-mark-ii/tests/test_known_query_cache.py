from __future__ import annotations

from dataclasses import dataclass
from unittest.mock import patch

from agent.known_query_cache import KnownQueryCache


@dataclass
class FakeSettings:
    google_ads_customer_id: str = "123"
    meta_ad_account_id: str = "act_123"
    meta_access_token: str = "fake"
    confirmation_timeout_seconds: int = 30


def _ok_result(spend: float, cpc: float | None = None) -> dict:
    return {
        "matched_campaign_count": 1,
        "summary": {"spend": spend, "clicks": 10, "cpc": cpc},
    }


def test_refresh_all_populates_every_reachable_entry():
    cache = KnownQueryCache(FakeSettings())
    with patch.object(cache, "_fetch", return_value=_ok_result(100.0)):
        cache.refresh_all()

    from agent.known_queries import KNOWN_QUERIES

    for q in KNOWN_QUERIES:
        cached = cache.get(q.id)
        assert cached is not None, f"expected {q.id} to be cached"
        assert "current" in cached.result
        if q.comparison:
            assert "prior" in cached.result


def test_non_comparison_entry_uses_a_single_fetch():
    cache = KnownQueryCache(FakeSettings())
    with patch.object(cache, "_fetch", return_value=_ok_result(100.0)) as mock_fetch:
        cache.refresh_all()

    cached = cache.get("g_yesterday_rize_spend")
    assert cached is not None
    assert list(cached.result.keys()) == ["current"]
    # sanity: _fetch was actually invoked (not e.g. a no-op stub the mock never called)
    mock_fetch.assert_called()


def test_failed_fetch_does_not_clobber_previous_cached_value():
    cache = KnownQueryCache(FakeSettings())
    with patch.object(cache, "_fetch", return_value=_ok_result(100.0)):
        cache.refresh_all()
    first = cache.get("g_yesterday_rize_spend")
    assert first is not None

    with patch.object(cache, "_fetch", side_effect=RuntimeError("API quota exhausted")):
        cache.refresh_all()

    second = cache.get("g_yesterday_rize_spend")
    assert second is first  # unchanged — stale-but-present beats dropped entirely


def test_comparison_entry_requires_both_fetches_to_succeed():
    """A comparison query must never end up cached with only its current-period
    fetch succeeding and its prior-period fetch failing (or vice versa) — that
    would silently compare a real number against nothing, or worse, against a
    stale leftover from an unrelated earlier refresh."""
    cache = KnownQueryCache(FakeSettings())

    call_count = {"n": 0}

    def flaky_fetch(query, date_range):
        call_count["n"] += 1
        # Fail on the second call for the target comparison query specifically —
        # simulate exactly one of its two (current/prior) fetches failing.
        if query.id == "g_cmp_rize_spend" and call_count["n"] % 2 == 0:
            raise RuntimeError("transient failure")
        return _ok_result(100.0)

    with patch.object(cache, "_fetch", side_effect=flaky_fetch):
        cache.refresh_all()

    # It's possible (depending on dict/thread ordering) that neither half landed
    # as the "failing" call — but if the query IS present, both halves must be.
    cached = cache.get("g_cmp_rize_spend")
    if cached is not None:
        assert "current" in cached.result and "prior" in cached.result


def test_error_dict_result_is_treated_as_a_failure():
    """dispatcher.run() never raises — it returns {"error": ...} on failure.
    _fetch must translate that into a real exception so refresh_all's
    failure handling actually engages instead of silently caching an error
    payload as if it were real data."""
    cache = KnownQueryCache(FakeSettings())
    with patch.object(cache.dispatcher, "run", return_value={"error": "boom"}):
        cache.refresh_all()

    assert cache.get("g_yesterday_rize_spend") is None
