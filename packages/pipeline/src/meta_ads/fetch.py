"""Fetch Meta Ads campaign metrics — mirrors the Google Ads fetch pattern."""

from datetime import date, timedelta
from typing import List, Dict, Any

from .client import get_ad_account_id, meta_api_get, paginate_all


def fetch_meta_campaigns(account_id: str = None) -> List[Dict[str, Any]]:
    """Fetch all campaigns from the Meta ad account."""
    account_id = account_id or get_ad_account_id()
    return paginate_all(
        f"{account_id}/campaigns",
        params={
            "fields": "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time",
            "limit": "100",
        },
    )


def fetch_meta_campaign_insights(
    account_id: str = None,
    lookback_days: int = 14,
    campaign_filter: str = None,
) -> List[Dict[str, Any]]:
    """Fetch daily campaign-level insights from Meta Ads.

    Returns rows with: campaign_id, campaign_name, date, spend, impressions,
    clicks, conversions (actions), cpc, ctr, cpp.
    """
    account_id = account_id or get_ad_account_id()
    end_date = date.today() - timedelta(days=1)
    start_date = end_date - timedelta(days=lookback_days - 1)

    params = {
        "fields": ",".join([
            "campaign_id", "campaign_name",
            "spend", "impressions", "clicks",
            "actions", "cost_per_action_type",
            "cpc", "ctr", "cpp",
            "reach", "frequency",
        ]),
        "time_range": f'{{"since":"{start_date.isoformat()}","until":"{end_date.isoformat()}"}}',
        "time_increment": "1",
        "level": "campaign",
        "limit": "500",
    }

    if campaign_filter:
        params["filtering"] = f'[{{"field":"campaign.name","operator":"CONTAIN","value":"{campaign_filter}"}}]'

    all_rows = paginate_all(f"{account_id}/insights", params=params)
    return all_rows


def fetch_meta_adset_insights(
    account_id: str = None,
    lookback_days: int = 14,
    campaign_filter: str = None,
) -> List[Dict[str, Any]]:
    """Fetch daily ad-set-level insights."""
    account_id = account_id or get_ad_account_id()
    end_date = date.today() - timedelta(days=1)
    start_date = end_date - timedelta(days=lookback_days - 1)

    params = {
        "fields": ",".join([
            "campaign_id", "campaign_name",
            "adset_id", "adset_name",
            "spend", "impressions", "clicks",
            "actions", "cost_per_action_type",
            "cpc", "ctr",
        ]),
        "time_range": f'{{"since":"{start_date.isoformat()}","until":"{end_date.isoformat()}"}}',
        "time_increment": "1",
        "level": "adset",
        "limit": "500",
    }

    if campaign_filter:
        params["filtering"] = f'[{{"field":"campaign.name","operator":"CONTAIN","value":"{campaign_filter}"}}]'

    return paginate_all(f"{account_id}/insights", params=params)


def transform_meta_insights(raw_rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Transform Meta insights into the same shape as Google Ads data for the DB.

    Maps Meta's 'actions' array to lead/conversion counts.
    """
    transformed = []
    for row in raw_rows:
        # Extract conversions from Meta's actions array
        actions = row.get("actions") or []
        leads = 0
        conversions = 0
        for action in actions:
            action_type = action.get("action_type", "")
            value = int(action.get("value", 0))
            if action_type == "lead":
                leads += value
            elif action_type in ("offsite_conversion.fb_pixel_purchase", "purchase", "omni_purchase"):
                conversions += value
            elif action_type == "offsite_conversion.fb_pixel_lead":
                leads += value
            elif action_type in ("offsite_conversion.fb_pixel_complete_registration", "complete_registration"):
                conversions += value

        spend = float(row.get("spend", 0))
        impressions = int(row.get("impressions", 0))
        clicks = int(row.get("clicks", 0))

        transformed.append({
            "campaign_id_external": row.get("campaign_id"),
            "campaign_name": row.get("campaign_name", ""),
            "date": row.get("date_start"),
            "spend": spend,
            "impressions": impressions,
            "clicks": clicks,
            "reported_conversions": conversions,
            "reported_leads": leads,
            "cpc": float(row.get("cpc", 0)) if row.get("cpc") else (spend / clicks if clicks > 0 else 0),
            "ctr": float(row.get("ctr", 0)) if row.get("ctr") else (clicks / impressions * 100 if impressions > 0 else 0),
            "reach": int(row.get("reach", 0)),
            "frequency": float(row.get("frequency", 0)),
            "platform": "meta",
            "source": "meta_ads_api",
        })

    return transformed
