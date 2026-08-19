from __future__ import annotations

import json
from dataclasses import dataclass

import requests

from config import Settings
from tools.aggregation import MetricsRow

GRAPH_API_VERSION = "v21.0"
GRAPH_API_BASE = f"https://graph.facebook.com/{GRAPH_API_VERSION}"

CAMPAIGN_STATUS_ACTIVE = "ACTIVE"
CAMPAIGN_STATUS_PAUSED = "PAUSED"


class MetaApiError(Exception):
    pass


@dataclass
class Campaign:
    id: str
    name: str
    status: str


def _get(settings: Settings, path: str, params: dict | None = None) -> dict:
    params = dict(params or {})
    params["access_token"] = settings.meta_access_token
    resp = requests.get(f"{GRAPH_API_BASE}/{path}", params=params, timeout=30)
    data = resp.json()
    if "error" in data:
        raise MetaApiError(data["error"].get("message", str(data["error"])))
    return data


def _post(settings: Settings, path: str, params: dict) -> dict:
    params = dict(params)
    params["access_token"] = settings.meta_access_token
    resp = requests.post(f"{GRAPH_API_BASE}/{path}", data=params, timeout=30)
    data = resp.json()
    if "error" in data:
        raise MetaApiError(data["error"].get("message", str(data["error"])))
    return data


def get_campaigns(settings: Settings) -> list[Campaign]:
    data = _get(
        settings,
        f"{settings.meta_ad_account_id}/campaigns",
        {"fields": "id,name,status", "limit": 200},
    )
    return [
        Campaign(id=c["id"], name=c["name"], status=c["status"])
        for c in data.get("data", [])
    ]


def get_insights(
    settings: Settings,
    campaign_id: str | None = None,
    date_preset: str = "last_7d",
    time_range: dict | None = None,
) -> list[MetricsRow]:
    """date_preset accepts Meta insights presets, e.g. last_7d, last_30d, today, yesterday.
    If time_range is given (e.g. {"since": "2026-08-01", "until": "2026-08-19"}), it takes
    precedence over date_preset and queries that explicit window instead — use this for
    ranges the presets can't express (month-to-date, a specific prior-month window, etc)."""
    path = f"{campaign_id}/insights" if campaign_id else f"{settings.meta_ad_account_id}/insights"
    params = {
        "fields": "campaign_id,campaign_name,spend,clicks,impressions,actions,action_values",
    }
    if time_range:
        params["time_range"] = json.dumps(time_range)
    else:
        params["date_preset"] = date_preset
    if not campaign_id:
        params["level"] = "campaign"

    data = _get(settings, path, params)

    rows: list[MetricsRow] = []
    for row in data.get("data", []):
        conversions = 0.0
        conversion_value = 0.0
        for action in row.get("actions", []):
            if action.get("action_type") == "offsite_conversion":
                conversions += float(action.get("value", 0))
        for av in row.get("action_values", []):
            if av.get("action_type") == "offsite_conversion":
                conversion_value += float(av.get("value", 0))

        rows.append(
            MetricsRow(
                platform="meta",
                campaign_id=row.get("campaign_id", campaign_id or ""),
                campaign_name=row.get("campaign_name", ""),
                spend=float(row.get("spend", 0)),
                clicks=int(row.get("clicks", 0)),
                impressions=int(row.get("impressions", 0)),
                conversions=conversions,
                conversion_value=conversion_value,
            )
        )
    return rows


def set_campaign_status(settings: Settings, campaign_id: str, status: str) -> Campaign:
    """status must be CAMPAIGN_STATUS_ACTIVE or CAMPAIGN_STATUS_PAUSED."""
    if status not in (CAMPAIGN_STATUS_ACTIVE, CAMPAIGN_STATUS_PAUSED):
        raise ValueError(f"Invalid campaign status: {status!r}")

    _post(settings, campaign_id, {"status": status})

    data = _get(settings, campaign_id, {"fields": "id,name,status"})
    return Campaign(id=data["id"], name=data["name"], status=data["status"])


def pause_campaign(settings: Settings, campaign_id: str) -> Campaign:
    return set_campaign_status(settings, campaign_id, CAMPAIGN_STATUS_PAUSED)


def enable_campaign(settings: Settings, campaign_id: str) -> Campaign:
    return set_campaign_status(settings, campaign_id, CAMPAIGN_STATUS_ACTIVE)


def update_budget(settings: Settings, campaign_id: str, daily_budget_amount: float) -> Campaign:
    """daily_budget_amount is in the account's currency major units (e.g. dollars).
    Meta's daily_budget field is in the account's minor currency unit (e.g. cents for USD)."""
    daily_budget_minor_units = int(round(daily_budget_amount * 100))
    _post(settings, campaign_id, {"daily_budget": daily_budget_minor_units})

    data = _get(settings, campaign_id, {"fields": "id,name,status"})
    return Campaign(id=data["id"], name=data["name"], status=data["status"])
