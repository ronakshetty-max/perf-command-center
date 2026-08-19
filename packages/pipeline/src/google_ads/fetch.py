"""Fetch campaign-level daily metrics from Google Ads API."""

from datetime import date, timedelta
from typing import Optional
from google.ads.googleads.client import GoogleAdsClient
from ..config import GoogleAdsConfig


CAMPAIGN_METRICS_QUERY = """
    SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        segments.date,
        segments.device,
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.conversions_value,
        metrics.search_impression_share,
        metrics.search_top_impression_share,
        metrics.search_budget_lost_impression_share,
        metrics.search_rank_lost_impression_share,
        metrics.average_cpc,
        metrics.ctr
    FROM campaign
    WHERE segments.date BETWEEN '{start_date}' AND '{end_date}'
        AND campaign.status != 'REMOVED'
    ORDER BY segments.date DESC
"""


def fetch_campaign_metrics(
    client: GoogleAdsClient,
    customer_id: str,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    lookback_days: int = 7,
) -> list[dict]:
    """Fetch daily campaign metrics for a given customer account.

    Args:
        client: Authenticated Google Ads API client
        customer_id: Google Ads Customer ID (no dashes)
        start_date: Start of date range (default: lookback_days ago)
        end_date: End of date range (default: yesterday)
        lookback_days: Days to look back if no start_date given

    Returns:
        List of row dicts with campaign metrics
    """
    if end_date is None:
        end_date = date.today() - timedelta(days=1)
    if start_date is None:
        start_date = end_date - timedelta(days=lookback_days - 1)

    query = CAMPAIGN_METRICS_QUERY.format(
        start_date=start_date.strftime("%Y-%m-%d"),
        end_date=end_date.strftime("%Y-%m-%d"),
    )

    ga_service = client.get_service("GoogleAdsService")
    response = ga_service.search(customer_id=customer_id, query=query)

    rows = []
    for row in response:
        spend = row.metrics.cost_micros / 1_000_000  # Convert micros to currency

        rows.append(
            {
                "campaign_id_external": str(row.campaign.id),
                "campaign_name": row.campaign.name,
                "campaign_status": row.campaign.status.name,
                "channel_type": row.campaign.advertising_channel_type.name,
                "date": row.segments.date,
                "device": row.segments.device.name,
                "spend": round(spend, 2),
                "impressions": row.metrics.impressions,
                "clicks": row.metrics.clicks,
                "conversions": round(row.metrics.conversions, 2),
                "conversion_value": round(row.metrics.conversions_value, 2),
                "impression_share": row.metrics.search_impression_share or None,
                "top_impression_share": row.metrics.search_top_impression_share
                or None,
                "lost_is_budget": row.metrics.search_budget_lost_impression_share
                or None,
                "lost_is_rank": row.metrics.search_rank_lost_impression_share or None,
                "cpc": round(row.metrics.average_cpc / 1_000_000, 2)
                if row.metrics.average_cpc
                else None,
                "ctr": round(row.metrics.ctr, 6) if row.metrics.ctr else None,
            }
        )

    return rows


def fetch_all_accounts(client: GoogleAdsClient, lookback_days: int = 7) -> list[dict]:
    """Fetch metrics from all configured customer accounts."""
    all_rows = []
    for customer_id in GoogleAdsConfig.customer_ids:
        rows = fetch_campaign_metrics(
            client, customer_id, lookback_days=lookback_days
        )
        for row in rows:
            row["ad_account_id"] = customer_id
        all_rows.extend(rows)
    return all_rows
