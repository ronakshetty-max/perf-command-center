from __future__ import annotations

from dataclasses import dataclass

from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException

from config import Settings
from tools.aggregation import MetricsRow

CAMPAIGN_STATUS_ENABLED = "ENABLED"
CAMPAIGN_STATUS_PAUSED = "PAUSED"

# Common Google Ads campaign.advertising_channel_type values. Validated against
# here (rather than a live enum lookup) so an invalid value fails fast, before
# ever constructing a client or making a network call.
VALID_CHANNEL_TYPES = {
    "SEARCH",
    "DISPLAY",
    "SHOPPING",
    "VIDEO",
    "MULTI_CHANNEL",
    "LOCAL",
    "SMART",
    "PERFORMANCE_MAX",
    "LOCAL_SERVICES",
    "DISCOVERY",
    "DEMAND_GEN",
    "TRAVEL",
    "HOTEL",
}


@dataclass
class Campaign:
    id: str
    name: str
    status: str


def _client(settings: Settings) -> GoogleAdsClient:
    config = {
        "developer_token": settings.google_ads_developer_token,
        "client_id": settings.google_ads_client_id,
        "client_secret": settings.google_ads_client_secret,
        "refresh_token": settings.google_ads_refresh_token,
        "use_proto_plus": True,
    }
    if settings.google_ads_login_customer_id:
        config["login_customer_id"] = settings.google_ads_login_customer_id
    return GoogleAdsClient.load_from_dict(config)


def get_campaigns(settings: Settings) -> list[Campaign]:
    client = _client(settings)
    service = client.get_service("GoogleAdsService")
    query = """
        SELECT campaign.id, campaign.name, campaign.status
        FROM campaign
        ORDER BY campaign.name
    """
    rows = service.search(customer_id=settings.google_ads_customer_id, query=query)
    return [
        Campaign(
            id=str(row.campaign.id),
            name=row.campaign.name,
            status=row.campaign.status.name,
        )
        for row in rows
    ]


def get_metrics(
    settings: Settings,
    campaign_id: str | None = None,
    date_range: str = "LAST_7_DAYS",
    channel_type: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[MetricsRow]:
    """date_range accepts GAQL DURING literals, e.g. LAST_7_DAYS, LAST_30_DAYS, TODAY, YESTERDAY.
    If start_date AND end_date are both given (YYYY-MM-DD), they take precedence over
    date_range and query an explicit BETWEEN window instead — use this for ranges the
    DURING literals can't express (month-to-date, a specific prior-month window, etc).
    channel_type, if given, must be a value from VALID_CHANNEL_TYPES (e.g. SEARCH, DISPLAY,
    PERFORMANCE_MAX) and filters to campaigns of that advertising_channel_type."""
    if channel_type and channel_type not in VALID_CHANNEL_TYPES:
        raise ValueError(
            f"Invalid channel_type: {channel_type!r}. "
            f"Must be one of: {', '.join(sorted(VALID_CHANNEL_TYPES))}"
        )

    client = _client(settings)
    service = client.get_service("GoogleAdsService")

    if start_date and end_date:
        where_clause = f"WHERE segments.date BETWEEN '{start_date}' AND '{end_date}'"
    else:
        where_clause = f"WHERE segments.date DURING {date_range}"
    if campaign_id:
        where_clause += f" AND campaign.id = {campaign_id}"
    if channel_type:
        where_clause += f" AND campaign.advertising_channel_type = '{channel_type}'"

    query = f"""
        SELECT
            campaign.id,
            campaign.name,
            metrics.cost_micros,
            metrics.clicks,
            metrics.impressions,
            metrics.conversions,
            metrics.conversions_value
        FROM campaign
        {where_clause}
    """
    rows = service.search(customer_id=settings.google_ads_customer_id, query=query)

    totals: dict[str, MetricsRow] = {}
    for row in rows:
        cid = str(row.campaign.id)
        if cid not in totals:
            totals[cid] = MetricsRow(
                platform="google",
                campaign_id=cid,
                campaign_name=row.campaign.name,
                spend=0.0,
                clicks=0,
                impressions=0,
                conversions=0.0,
                conversion_value=0.0,
            )
        agg = totals[cid]
        agg.spend += row.metrics.cost_micros / 1_000_000
        agg.clicks += row.metrics.clicks
        agg.impressions += row.metrics.impressions
        agg.conversions += row.metrics.conversions
        agg.conversion_value += row.metrics.conversions_value

    return list(totals.values())


def set_campaign_status(settings: Settings, campaign_id: str, status: str) -> Campaign:
    """status must be CAMPAIGN_STATUS_ENABLED or CAMPAIGN_STATUS_PAUSED."""
    if status not in (CAMPAIGN_STATUS_ENABLED, CAMPAIGN_STATUS_PAUSED):
        raise ValueError(f"Invalid campaign status: {status!r}")

    client = _client(settings)
    campaign_service = client.get_service("CampaignService")
    campaign_operation = client.get_type("CampaignOperation")

    campaign = campaign_operation.update
    campaign.resource_name = campaign_service.campaign_path(
        settings.google_ads_customer_id, campaign_id
    )
    campaign.status = client.enums.CampaignStatusEnum[status]
    client.copy_from(
        campaign_operation.update_mask,
        client.get_type("FieldMask")(paths=["status"]),
    )

    response = campaign_service.mutate_campaigns(
        customer_id=settings.google_ads_customer_id,
        operations=[campaign_operation],
    )
    resource_name = response.results[0].resource_name

    campaigns = get_campaigns(settings)
    for c in campaigns:
        if c.id == campaign_id:
            return c
    raise RuntimeError(
        f"Updated {resource_name} but could not re-fetch campaign {campaign_id}"
    )


def pause_campaign(settings: Settings, campaign_id: str) -> Campaign:
    return set_campaign_status(settings, campaign_id, CAMPAIGN_STATUS_PAUSED)


def enable_campaign(settings: Settings, campaign_id: str) -> Campaign:
    return set_campaign_status(settings, campaign_id, CAMPAIGN_STATUS_ENABLED)


def update_budget(settings: Settings, campaign_id: str, daily_budget_amount: float) -> str:
    """daily_budget_amount is in the account's currency units (e.g. dollars, not micros)."""
    client = _client(settings)
    service = client.get_service("GoogleAdsService")
    query = f"""
        SELECT campaign.campaign_budget
        FROM campaign
        WHERE campaign.id = {campaign_id}
    """
    rows = list(service.search(customer_id=settings.google_ads_customer_id, query=query))
    if not rows:
        raise ValueError(f"Campaign {campaign_id} not found")
    budget_resource_name = rows[0].campaign.campaign_budget

    budget_service = client.get_service("CampaignBudgetService")
    budget_operation = client.get_type("CampaignBudgetOperation")
    budget = budget_operation.update
    budget.resource_name = budget_resource_name
    budget.amount_micros = int(daily_budget_amount * 1_000_000)
    client.copy_from(
        budget_operation.update_mask,
        client.get_type("FieldMask")(paths=["amount_micros"]),
    )

    response = budget_service.mutate_campaign_budgets(
        customer_id=settings.google_ads_customer_id,
        operations=[budget_operation],
    )
    return response.results[0].resource_name
