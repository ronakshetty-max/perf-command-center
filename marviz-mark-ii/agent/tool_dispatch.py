from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from agent.confirmation import STATUS_CONFIRMED, STATUS_EXPIRED, ConfirmationManager
from config import Settings
from tools import google_ads, meta_ads
from tools.aggregation import MetricsRow, summarize, summarize_by_platform

_DATE_RANGE_TO_GOOGLE = {
    "today": "TODAY",
    "yesterday": "YESTERDAY",
    "last_7d": "LAST_7_DAYS",
    "last_30d": "LAST_30_DAYS",
}

_DATE_RANGE_TO_META = {
    "today": "today",
    "yesterday": "yesterday",
    "last_7d": "last_7d",
    "last_30d": "last_30d",
}


class ToolDispatchError(Exception):
    pass


def _resolve_date_range(date_range: str | None) -> str:
    return (date_range or "last_7d").strip().lower()


def _fetch_metrics(
    settings: Settings,
    platform: str,
    campaign_id: str | None,
    date_range: str,
    channel_type: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[MetricsRow]:
    if start_date and end_date:
        if platform == "google":
            return google_ads.get_metrics(
                settings,
                campaign_id=campaign_id,
                channel_type=channel_type,
                start_date=start_date,
                end_date=end_date,
            )
        elif platform == "meta":
            if channel_type:
                raise ToolDispatchError(
                    "channel_type filtering is only supported for platform='google' "
                    "(Google Ads campaign types like SEARCH/DISPLAY/PERFORMANCE_MAX). "
                    "Meta doesn't have this concept — omit channel_type for Meta."
                )
            return meta_ads.get_insights(
                settings,
                campaign_id=campaign_id,
                time_range={"since": start_date, "until": end_date},
            )
        raise ToolDispatchError(f"Unsupported platform: {platform!r}")

    resolved = _resolve_date_range(date_range)
    if platform == "google":
        google_range = _DATE_RANGE_TO_GOOGLE.get(resolved)
        if not google_range:
            raise ToolDispatchError(f"Unsupported date_range: {date_range!r}")
        return google_ads.get_metrics(
            settings, campaign_id=campaign_id, date_range=google_range, channel_type=channel_type
        )
    elif platform == "meta":
        if channel_type:
            raise ToolDispatchError(
                "channel_type filtering is only supported for platform='google' "
                "(Google Ads campaign types like SEARCH/DISPLAY/PERFORMANCE_MAX). "
                "Meta doesn't have this concept — omit channel_type for Meta."
            )
        meta_preset = _DATE_RANGE_TO_META.get(resolved)
        if not meta_preset:
            raise ToolDispatchError(f"Unsupported date_range: {date_range!r}")
        return meta_ads.get_insights(settings, campaign_id=campaign_id, date_preset=meta_preset)
    raise ToolDispatchError(f"Unsupported platform: {platform!r}")


def _filter_by_name(rows: list[MetricsRow], name_contains: list[str] | None) -> list[MetricsRow]:
    """Keep only rows whose campaign_name contains EVERY term in name_contains,
    case-insensitively. E.g. name_contains=["rpsme", "brand"] keeps a campaign
    named "RPSME-Rbranding-Meta-..." (contains both "rpsme" and "brand" as
    substrings) and drops one that only contains one of the two."""
    if not name_contains:
        return rows
    terms = [t.lower() for t in name_contains if t.strip()]
    if not terms:
        return rows
    return [r for r in rows if all(term in r.campaign_name.lower() for term in terms)]


def _summary_dict(summary) -> dict:
    return {
        "spend": summary.spend,
        "clicks": summary.clicks,
        "impressions": summary.impressions,
        "conversions": summary.conversions,
        "conversion_value": summary.conversion_value,
        "cpc": summary.cpc,
        "ctr": summary.ctr,
        "roas": summary.roas,
    }


class ToolDispatcher:
    """Dispatches Claude tool calls to the ad-platform SDKs and the confirmation
    state machine. One instance is owned by a single MarvizSession (one browser
    connection) — nothing here is shared across sessions.

    last_dashboard_payload holds the most recent metrics/action result this
    dispatcher produced, in the shape the WebSocket handler pushes to the
    client as `dashboard_payload`. It replaces the old file-based dashboard
    store: instead of writing to a shared JSON file (unsafe with concurrent
    viewers), each session pushes its own latest payload directly over its
    own socket.
    """

    def __init__(self, settings: Settings, confirmation_mgr: ConfirmationManager | None = None):
        self.settings = settings
        self.confirmation_mgr = confirmation_mgr or ConfirmationManager(
            timeout_seconds=settings.confirmation_timeout_seconds
        )
        self.last_dashboard_payload: dict | None = None

    def run(self, tool_name: str, tool_input: dict) -> dict:
        try:
            if tool_name == "list_campaigns":
                return self._list_campaigns(**tool_input)
            elif tool_name == "get_metrics":
                return self._get_metrics(**tool_input)
            elif tool_name == "get_aggregate_summary":
                return self._get_aggregate_summary(**tool_input)
            elif tool_name == "propose_action":
                return self._propose_action(**tool_input)
            elif tool_name == "confirm_and_execute_action":
                return self._confirm_and_execute_action(**tool_input)
            elif tool_name == "cancel_pending_action":
                return self._cancel_pending_action(**tool_input)
            else:
                return {"error": f"Unknown tool: {tool_name}"}
        except ToolDispatchError as e:
            return {"error": str(e)}
        except Exception as e:
            return {"error": f"{type(e).__name__}: {e}"}

    def _list_campaigns(self, platform: str) -> dict:
        if platform == "google":
            campaigns = google_ads.get_campaigns(self.settings)
        elif platform == "meta":
            campaigns = meta_ads.get_campaigns(self.settings)
        else:
            raise ToolDispatchError(f"Unsupported platform: {platform!r}")
        return {
            "campaigns": [
                {"id": c.id, "name": c.name, "status": c.status} for c in campaigns
            ]
        }

    def _get_metrics(
        self,
        platform: str,
        campaign_id: str | None = None,
        date_range: str | None = None,
        name_contains: list[str] | None = None,
        channel_type: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> dict:
        rows = _fetch_metrics(
            self.settings,
            platform,
            campaign_id,
            date_range or "last_7d",
            channel_type=channel_type,
            start_date=start_date,
            end_date=end_date,
        )
        rows = _filter_by_name(rows, name_contains)
        summary = summarize(rows)
        resolved_range = f"{start_date}_to_{end_date}" if start_date and end_date else _resolve_date_range(date_range)
        result = {
            "platform": platform,
            "date_range": resolved_range,
            "filters_applied": {
                "name_contains": name_contains or None,
                "channel_type": channel_type,
            },
            "matched_campaign_count": len(rows),
            "campaigns": [
                {
                    "campaign_id": r.campaign_id,
                    "campaign_name": r.campaign_name,
                    "spend": r.spend,
                    "clicks": r.clicks,
                    "impressions": r.impressions,
                    "conversions": r.conversions,
                    "conversion_value": r.conversion_value,
                }
                for r in rows
            ],
            "summary": _summary_dict(summary),
        }
        self.last_dashboard_payload = {
            "type": "metrics",
            "date_range": resolved_range,
            "filters_applied": result["filters_applied"],
            "by_platform": {platform: result["summary"]},
            "combined": result["summary"],
        }
        return result

    def _get_aggregate_summary(
        self,
        platforms: list[str],
        date_range: str | None = None,
        name_contains: list[str] | None = None,
        channel_type: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> dict:
        # Google Ads and Meta Ads are independent network calls (different
        # APIs, different creds) — fetch them concurrently instead of one
        # after another. Halves wall-clock time when both platforms are
        # requested (the common case for "combined"/"total" questions).
        resolved_date_range = date_range or "last_7d"
        with ThreadPoolExecutor(max_workers=max(len(platforms), 1)) as pool:
            futures = [
                pool.submit(
                    _fetch_metrics,
                    self.settings,
                    platform,
                    None,
                    resolved_date_range,
                    channel_type=channel_type,
                    start_date=start_date,
                    end_date=end_date,
                )
                for platform in platforms
            ]
            all_rows: list[MetricsRow] = []
            for future in futures:
                all_rows.extend(future.result())
        all_rows = _filter_by_name(all_rows, name_contains)

        by_platform = summarize_by_platform(all_rows)
        combined = summarize(all_rows)
        resolved_range = f"{start_date}_to_{end_date}" if start_date and end_date else _resolve_date_range(date_range)

        result = {
            "date_range": resolved_range,
            "filters_applied": {
                "name_contains": name_contains or None,
                "channel_type": channel_type,
            },
            "matched_campaign_count": len(all_rows),
            "matched_campaign_names": sorted({r.campaign_name for r in all_rows}),
            "by_platform": {platform: _summary_dict(s) for platform, s in by_platform.items()},
            "combined": _summary_dict(combined),
        }
        self.last_dashboard_payload = {
            "type": "metrics",
            "date_range": resolved_range,
            "filters_applied": result["filters_applied"],
            "by_platform": result["by_platform"],
            "combined": result["combined"],
        }
        return result

    def _propose_action(
        self,
        action_type: str,
        platform: str,
        campaign_id: str,
        campaign_name: str,
        daily_budget_amount: float | None = None,
    ) -> dict:
        if not self.settings.write_actions_enabled:
            return {
                "error": (
                    "Write actions are disabled on this deployment "
                    "(WRITE_ACTIONS_ENABLED=false). No action was staged."
                )
            }

        params = {}
        if action_type == "update_budget":
            if daily_budget_amount is None:
                raise ToolDispatchError("daily_budget_amount is required for update_budget.")
            params["daily_budget_amount"] = daily_budget_amount

        action = self.confirmation_mgr.stage(action_type, platform, campaign_id, params)

        if action_type == "update_budget":
            verb = f"change the daily budget to ${daily_budget_amount:.2f} for"
        elif action_type == "enable_campaign":
            verb = "enable"
        else:
            verb = "pause"

        return {
            "pending_action_id": action.id,
            "confirmation_prompt": (
                f"I'm about to {verb} campaign '{campaign_name}' on "
                f"{platform.title()} Ads. Please confirm — say yes to proceed."
            ),
            "expires_in_seconds": self.confirmation_mgr.timeout_seconds,
        }

    def _confirm_and_execute_action(self, pending_action_id: str) -> dict:
        # This handler NEVER calls confirmation_mgr.confirm() itself — that transition
        # may only be made by orchestrator code (app.py's WebSocket handler) after it
        # has observed an explicit affirmative reply from the user. Here we only check
        # that the action already reached "confirmed" via that path.
        action = self.confirmation_mgr.get_pending()
        if action is None or action.id != pending_action_id:
            return {
                "error": (
                    "No such pending action, or it is no longer current. "
                    "The user has not confirmed anything yet — ask them again."
                )
            }
        if action.status == STATUS_EXPIRED:
            return {"error": "This proposal expired. Propose the action again if still relevant."}
        if action.status != STATUS_CONFIRMED:
            return {
                "error": (
                    "The user has not explicitly confirmed this action yet. "
                    "Do not call this tool until the user has clearly said yes."
                )
            }

        try:
            result = self._execute(action)
        except Exception as e:
            self.last_dashboard_payload = {
                "type": "action",
                "action_type": action.action_type,
                "platform": action.platform,
                "campaign_id": action.campaign_id,
                "result": f"failed: {e}",
            }
            return {"error": f"Action confirmed but execution failed: {type(e).__name__}: {e}"}

        self.confirmation_mgr.mark_executed(action.id)
        self.last_dashboard_payload = {
            "type": "action",
            "action_type": action.action_type,
            "platform": action.platform,
            "campaign_id": action.campaign_id,
            "campaign_name": result.get("name"),
            "result": "success",
        }
        return {"executed": True, "result": result}

    def _cancel_pending_action(self, pending_action_id: str) -> dict:
        action = self.confirmation_mgr.cancel(pending_action_id)
        if action is None:
            return {"error": "No matching pending action to cancel."}
        return {"cancelled": True, "pending_action_id": action.id}

    def _execute(self, action) -> dict:
        module = google_ads if action.platform == "google" else meta_ads

        if action.action_type == "pause_campaign":
            result = module.pause_campaign(self.settings, action.campaign_id)
            return {"id": result.id, "name": result.name, "status": result.status}
        elif action.action_type == "enable_campaign":
            result = module.enable_campaign(self.settings, action.campaign_id)
            return {"id": result.id, "name": result.name, "status": result.status}
        elif action.action_type == "update_budget":
            amount = action.params["daily_budget_amount"]
            if action.platform == "google":
                resource_name = module.update_budget(self.settings, action.campaign_id, amount)
                return {"budget_resource": resource_name, "daily_budget_amount": amount}
            else:
                result = module.update_budget(self.settings, action.campaign_id, amount)
                return {"id": result.id, "name": result.name, "daily_budget_amount": amount}
        raise ToolDispatchError(f"Unsupported action_type: {action.action_type!r}")
