import sys
from dataclasses import dataclass, field
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent.confirmation import STATUS_AWAITING, STATUS_CONFIRMED
from agent.tool_dispatch import ToolDispatcher
from tools.aggregation import MetricsRow


@dataclass
class FakeSettings:
    write_actions_enabled: bool = True
    confirmation_timeout_seconds: int = 30
    google_ads_customer_id: str = "123"
    meta_ad_account_id: str = "act_123"
    meta_access_token: str = "fake"


def _rows():
    return [
        MetricsRow(
            platform="google",
            campaign_id="g1",
            campaign_name="Campaign 1",
            spend=100.0,
            clicks=50,
            impressions=1000,
            conversions=5.0,
            conversion_value=250.0,
        )
    ]


def test_get_metrics_sets_last_dashboard_payload():
    dispatcher = ToolDispatcher(FakeSettings())
    with patch("agent.tool_dispatch.google_ads.get_metrics", return_value=_rows()):
        result = dispatcher.run(
            "get_metrics", {"platform": "google", "date_range": "last_7d"}
        )

    assert "error" not in result
    payload = dispatcher.last_dashboard_payload
    assert payload is not None
    assert payload["type"] == "metrics"
    assert payload["by_platform"]["google"]["spend"] == 100.0
    assert payload["combined"]["spend"] == 100.0


def test_get_aggregate_summary_sets_last_dashboard_payload():
    meta_row = MetricsRow(
        platform="meta",
        campaign_id="m1",
        campaign_name="Meta Campaign 1",
        spend=40.0,
        clicks=20,
        impressions=500,
        conversions=2.0,
        conversion_value=100.0,
    )
    dispatcher = ToolDispatcher(FakeSettings())
    with patch("agent.tool_dispatch.google_ads.get_metrics", return_value=_rows()), patch(
        "agent.tool_dispatch.meta_ads.get_insights", return_value=[meta_row]
    ):
        dispatcher.run(
            "get_aggregate_summary",
            {"platforms": ["google", "meta"], "date_range": "last_7d"},
        )

    payload = dispatcher.last_dashboard_payload
    assert payload["type"] == "metrics"
    # summarize_by_platform only includes platforms that actually returned rows —
    # a platform with zero rows for the date range correctly won't appear here.
    assert set(payload["by_platform"].keys()) == {"google", "meta"}


def test_two_dispatchers_have_independent_confirmation_state():
    """Two ToolDispatcher instances (i.e. two MarvizSessions / two browser
    connections) must never share pending-action state — one viewer's
    proposed action must not be confirmable by another viewer's 'yes'."""
    settings = FakeSettings()
    dispatcher_a = ToolDispatcher(settings)
    dispatcher_b = ToolDispatcher(settings)

    result_a = dispatcher_a.run(
        "propose_action",
        {
            "action_type": "pause_campaign",
            "platform": "google",
            "campaign_id": "g1",
            "campaign_name": "Campaign 1",
        },
    )
    pending_id_a = result_a["pending_action_id"]

    assert dispatcher_a.confirmation_mgr.get_pending() is not None
    assert dispatcher_b.confirmation_mgr.get_pending() is None

    # Session B has no pending action at all, so confirming session A's id
    # through session B's dispatcher must fail rather than executing anything.
    exec_result = dispatcher_b.run(
        "confirm_and_execute_action", {"pending_action_id": pending_id_a}
    )
    assert "error" in exec_result


def test_two_dispatchers_have_independent_last_dashboard_payload():
    dispatcher_a = ToolDispatcher(FakeSettings())
    dispatcher_b = ToolDispatcher(FakeSettings())

    with patch("agent.tool_dispatch.google_ads.get_metrics", return_value=_rows()):
        dispatcher_a.run("get_metrics", {"platform": "google"})

    assert dispatcher_a.last_dashboard_payload is not None
    assert dispatcher_b.last_dashboard_payload is None


def test_confirm_and_execute_still_requires_orchestrator_confirmation():
    """Same invariant as the ported test_confirmation.py regression test,
    re-checked against this file's ToolDispatcher construction (FakeSettings
    with write_actions_enabled=True) to guard the dashboard_payload changes
    didn't loosen it."""
    dispatcher = ToolDispatcher(FakeSettings())
    result = dispatcher.run(
        "propose_action",
        {
            "action_type": "pause_campaign",
            "platform": "google",
            "campaign_id": "g1",
            "campaign_name": "Campaign 1",
        },
    )
    pending_id = result["pending_action_id"]

    exec_result = dispatcher.run(
        "confirm_and_execute_action", {"pending_action_id": pending_id}
    )
    assert "error" in exec_result
    pending = dispatcher.confirmation_mgr.get_pending()
    assert pending.status == STATUS_AWAITING

    # Only after the orchestrator directly calls confirm() does execution succeed.
    dispatcher.confirmation_mgr.confirm(pending_id)
    with patch(
        "agent.tool_dispatch.google_ads.pause_campaign",
        return_value=type("C", (), {"id": "g1", "name": "Campaign 1", "status": "PAUSED"})(),
    ):
        exec_result = dispatcher.run(
            "confirm_and_execute_action", {"pending_action_id": pending_id}
        )
    assert exec_result.get("executed") is True
    assert dispatcher.last_dashboard_payload["type"] == "action"
    assert dispatcher.last_dashboard_payload["result"] == "success"


def _named_rows():
    return [
        MetricsRow(
            platform="google", campaign_id="g1",
            campaign_name="RPSME-Rbranding-Meta-Prospect-AllDevices",
            spend=100.0, clicks=50, impressions=1000, conversions=5.0, conversion_value=250.0,
        ),
        MetricsRow(
            platform="google", campaign_id="g2",
            # Deliberately contains "rpsme" but NOT "brand" as a substring, to
            # test the AND semantics actually excludes a partial match.
            campaign_name="RPSME-Performance-Generic-Search",
            spend=200.0, clicks=100, impressions=2000, conversions=10.0, conversion_value=500.0,
        ),
        MetricsRow(
            platform="google", campaign_id="g3",
            campaign_name="Unrelated-Campaign",
            spend=50.0, clicks=25, impressions=500, conversions=1.0, conversion_value=50.0,
        ),
    ]


def test_get_metrics_name_contains_filters_case_insensitive_and_match():
    """The exact scenario reported: 'campaigns which contains rpsme and brand
    in their name' must actually filter, not just be echoed back or ignored.
    Confirms AND semantics: g2 has "rpsme" but not "brand" as a substring, so
    it's correctly excluded even though it shares one of the two terms."""
    dispatcher = ToolDispatcher(FakeSettings())
    with patch("agent.tool_dispatch.google_ads.get_metrics", return_value=_named_rows()):
        result = dispatcher.run(
            "get_metrics",
            {
                "platform": "google",
                "date_range": "yesterday",
                "name_contains": ["rpsme", "brand"],
            },
        )

    assert result["matched_campaign_count"] == 1
    assert result["campaigns"][0]["campaign_id"] == "g1"
    assert result["filters_applied"]["name_contains"] == ["rpsme", "brand"]
    assert dispatcher.last_dashboard_payload["filters_applied"]["name_contains"] == ["rpsme", "brand"]


def test_get_metrics_name_contains_empty_match_reports_zero_not_error():
    dispatcher = ToolDispatcher(FakeSettings())
    with patch("agent.tool_dispatch.google_ads.get_metrics", return_value=_named_rows()):
        result = dispatcher.run(
            "get_metrics",
            {"platform": "google", "name_contains": ["doesnotexist"]},
        )

    assert "error" not in result
    assert result["matched_campaign_count"] == 0
    assert result["campaigns"] == []
    assert result["summary"]["spend"] == 0


def test_get_metrics_channel_type_passed_through_to_google_ads_tool():
    dispatcher = ToolDispatcher(FakeSettings())
    with patch(
        "agent.tool_dispatch.google_ads.get_metrics", return_value=_named_rows()
    ) as mock_get_metrics:
        dispatcher.run(
            "get_metrics",
            {"platform": "google", "date_range": "yesterday", "channel_type": "SEARCH"},
        )

    mock_get_metrics.assert_called_once()
    _, kwargs = mock_get_metrics.call_args
    assert kwargs["channel_type"] == "SEARCH"


def test_channel_type_rejected_for_meta():
    dispatcher = ToolDispatcher(FakeSettings())
    result = dispatcher.run(
        "get_metrics",
        {"platform": "meta", "channel_type": "SEARCH"},
    )
    assert "error" in result
    assert "channel_type" in result["error"]


def test_get_aggregate_summary_name_contains_filters_across_platforms():
    meta_row = MetricsRow(
        platform="meta", campaign_id="m1", campaign_name="RPSME-Brand-Meta-Awareness",
        spend=40.0, clicks=20, impressions=500, conversions=2.0, conversion_value=100.0,
    )
    dispatcher = ToolDispatcher(FakeSettings())
    with patch("agent.tool_dispatch.google_ads.get_metrics", return_value=_named_rows()), patch(
        "agent.tool_dispatch.meta_ads.get_insights", return_value=[meta_row]
    ):
        result = dispatcher.run(
            "get_aggregate_summary",
            {
                "platforms": ["google", "meta"],
                "date_range": "yesterday",
                "name_contains": ["rpsme", "brand"],
            },
        )

    assert result["matched_campaign_count"] == 2  # g1 (google) + m1 (meta)
    assert "Unrelated-Campaign" not in result["matched_campaign_names"]


def test_invalid_google_channel_type_raises_before_network_call():
    """tools/google_ads.py validates channel_type locally (VALID_CHANNEL_TYPES)
    so a bad value fails fast rather than reaching the Google Ads API."""
    from tools import google_ads

    settings = FakeSettings()
    with patch.object(google_ads, "_client") as mock_client:
        try:
            google_ads.get_metrics(settings, channel_type="NOT_A_REAL_TYPE")
            assert False, "expected ValueError"
        except ValueError as e:
            assert "Invalid channel_type" in str(e)
        # _client should never have been constructed — validation happens first.
        mock_client.assert_not_called()


def test_propose_action_disabled_when_write_actions_off():
    settings = FakeSettings(write_actions_enabled=False)
    dispatcher = ToolDispatcher(settings)
    result = dispatcher.run(
        "propose_action",
        {
            "action_type": "pause_campaign",
            "platform": "google",
            "campaign_id": "g1",
            "campaign_name": "Campaign 1",
        },
    )
    assert "error" in result
    assert dispatcher.confirmation_mgr.get_pending() is None


def test_get_metrics_start_end_date_uses_between_not_date_range_literal():
    """A month-to-date / custom-window question can't be expressed by the
    fixed date_range literals — start_date/end_date must take precedence and
    reach google_ads.get_metrics as an explicit window, not fall back to the
    last_7d default."""
    dispatcher = ToolDispatcher(FakeSettings())
    with patch(
        "agent.tool_dispatch.google_ads.get_metrics", return_value=_rows()
    ) as mock_get_metrics:
        result = dispatcher.run(
            "get_metrics",
            {"platform": "google", "start_date": "2026-08-01", "end_date": "2026-08-19"},
        )

    mock_get_metrics.assert_called_once()
    _, kwargs = mock_get_metrics.call_args
    assert kwargs["start_date"] == "2026-08-01"
    assert kwargs["end_date"] == "2026-08-19"
    assert result["date_range"] == "2026-08-01_to_2026-08-19"


def test_get_metrics_start_end_date_for_meta_builds_time_range():
    dispatcher = ToolDispatcher(FakeSettings())
    meta_row = MetricsRow(
        platform="meta", campaign_id="m1", campaign_name="Meta Campaign 1",
        spend=40.0, clicks=20, impressions=500, conversions=2.0, conversion_value=100.0,
    )
    with patch(
        "agent.tool_dispatch.meta_ads.get_insights", return_value=[meta_row]
    ) as mock_get_insights:
        result = dispatcher.run(
            "get_metrics",
            {"platform": "meta", "start_date": "2026-08-01", "end_date": "2026-08-19"},
        )

    mock_get_insights.assert_called_once()
    _, kwargs = mock_get_insights.call_args
    assert kwargs["time_range"] == {"since": "2026-08-01", "until": "2026-08-19"}
    assert result["date_range"] == "2026-08-01_to_2026-08-19"


def test_get_metrics_start_end_date_rejects_channel_type_for_meta():
    dispatcher = ToolDispatcher(FakeSettings())
    result = dispatcher.run(
        "get_metrics",
        {
            "platform": "meta",
            "start_date": "2026-08-01",
            "end_date": "2026-08-19",
            "channel_type": "SEARCH",
        },
    )
    assert "error" in result
    assert "channel_type" in result["error"]


def test_get_aggregate_summary_start_end_date_passed_through_concurrently():
    dispatcher = ToolDispatcher(FakeSettings())
    meta_row = MetricsRow(
        platform="meta", campaign_id="m1", campaign_name="Meta Campaign 1",
        spend=40.0, clicks=20, impressions=500, conversions=2.0, conversion_value=100.0,
    )
    with patch(
        "agent.tool_dispatch.google_ads.get_metrics", return_value=_rows()
    ) as mock_get_metrics, patch(
        "agent.tool_dispatch.meta_ads.get_insights", return_value=[meta_row]
    ) as mock_get_insights:
        result = dispatcher.run(
            "get_aggregate_summary",
            {
                "platforms": ["google", "meta"],
                "start_date": "2026-08-01",
                "end_date": "2026-08-19",
            },
        )

    assert mock_get_metrics.call_args.kwargs["start_date"] == "2026-08-01"
    assert mock_get_insights.call_args.kwargs["time_range"] == {"since": "2026-08-01", "until": "2026-08-19"}
    assert result["date_range"] == "2026-08-01_to_2026-08-19"
