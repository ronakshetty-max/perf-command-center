"""Transform raw Google Ads data into structured format for database."""

from ..parsers.campaign_name import parse_campaign_name


def transform_ad_rows(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    """Transform raw API rows into campaigns and daily metrics.

    Returns:
        (campaigns_to_upsert, metrics_to_upsert)
    """
    campaigns = {}
    metrics = []

    for row in rows:
        campaign_name = row["campaign_name"]

        # Parse campaign name to get structured fields
        if campaign_name not in campaigns:
            parsed = parse_campaign_name(campaign_name)
            campaigns[campaign_name] = {
                "campaign_name": campaign_name,
                "campaign_id_external": row["campaign_id_external"],
                "business_id": parsed.business,
                "platform": parsed.platform,
                "category": parsed.category,
                "sub_category": parsed.sub_category,
                "device_target": parsed.device_target,
                "audience_type": parsed.audience_type,
                "objective": parsed.objective,
                "geo": parsed.geo,
                "ad_account_id": row["ad_account_id"],
                "is_active": row["campaign_status"] == "ENABLED",
                "last_seen": row["date"],
            }

        # Build metric row
        metrics.append(
            {
                "campaign_name": campaign_name,
                "date": row["date"],
                "device": _normalize_device(row["device"]),
                "spend": row["spend"],
                "impressions": row["impressions"],
                "clicks": row["clicks"],
                "reported_conversions": row["conversions"],
                "reported_conversion_value": row["conversion_value"],
                "impression_share": row["impression_share"],
                "top_impression_share": row["top_impression_share"],
                "search_lost_is_budget": row["lost_is_budget"],
                "search_lost_is_rank": row["lost_is_rank"],
                "cpc": row["cpc"],
                "ctr": row["ctr"],
                "source": "google_ads_api",
            }
        )

    return list(campaigns.values()), metrics


def _normalize_device(device: str) -> str:
    """Normalize Google Ads device enum to simple string."""
    mapping = {
        "DESKTOP": "desktop",
        "MOBILE": "mobile",
        "TABLET": "tablet",
        "CONNECTED_TV": "connected_tv",
        "OTHER": "other",
    }
    return mapping.get(device, "other")
