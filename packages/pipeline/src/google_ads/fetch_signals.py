"""Fetch deep campaign signals for the AI brain.

Pulls data the rule engine can't process but an LLM marketer can:
- Auction insights (who's competing, overlap rate, outranking share)
- Search term report (what queries are triggering ads, irrelevant terms)
- Quality Score components (ad relevance, landing page, expected CTR)
- Bid & budget data (target CPA, max CPC, budget utilization)
- Hour-of-day performance (when do conversions cluster)
- Device splits (is mobile dragging CPP up?)
- Ad copy performance (which headlines/descriptions win)
"""

from datetime import date, timedelta
from google.ads.googleads.client import GoogleAdsClient


# Auction Insights — who are we competing against?
AUCTION_INSIGHTS_QUERY = """
    SELECT
        campaign.name,
        auction_insight.display_domain,
        auction_insight.impression_share,
        auction_insight.overlap_rate,
        auction_insight.outranking_share,
        auction_insight.position_above_rate,
        auction_insight.top_of_page_rate,
        segments.date
    FROM campaign_auction_insight_report
    WHERE segments.date DURING LAST_7_DAYS
        AND campaign.status = 'ENABLED'
"""

# Search Terms — what queries trigger our ads?
SEARCH_TERMS_QUERY = """
    SELECT
        campaign.name,
        search_term_view.search_term,
        search_term_view.status,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.ctr
    FROM search_term_view
    WHERE segments.date DURING LAST_14_DAYS
        AND metrics.impressions > 10
    ORDER BY metrics.cost_micros DESC
    LIMIT 200
"""

# Quality Score + Ad Relevance
QUALITY_SCORE_QUERY = """
    SELECT
        campaign.name,
        ad_group.name,
        ad_group_criterion.keyword.text,
        ad_group_criterion.quality_info.quality_score,
        ad_group_criterion.quality_info.creative_quality_score,
        ad_group_criterion.quality_info.post_click_quality_score,
        ad_group_criterion.quality_info.search_predicted_ctr,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.cost_micros
    FROM keyword_view
    WHERE segments.date DURING LAST_30_DAYS
        AND campaign.status = 'ENABLED'
        AND ad_group_criterion.status = 'ENABLED'
        AND metrics.impressions > 50
    ORDER BY metrics.cost_micros DESC
    LIMIT 100
"""

# Hour of Day performance
HOUR_OF_DAY_QUERY = """
    SELECT
        campaign.name,
        segments.hour,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.cost_micros
    FROM campaign
    WHERE segments.date DURING LAST_14_DAYS
        AND campaign.status = 'ENABLED'
"""

# Budget & Bid Strategy details
BUDGET_BID_QUERY = """
    SELECT
        campaign.name,
        campaign.campaign_budget,
        campaign_budget.amount_micros,
        campaign_budget.total_amount_micros,
        campaign.bidding_strategy_type,
        campaign.target_cpa.target_cpa_micros,
        campaign.maximize_conversions.target_cpa_micros,
        metrics.cost_micros,
        metrics.impressions,
        metrics.conversions,
        metrics.search_impression_share,
        metrics.search_budget_lost_impression_share,
        metrics.search_rank_lost_impression_share
    FROM campaign
    WHERE segments.date DURING LAST_7_DAYS
        AND campaign.status = 'ENABLED'
"""

# Device-level performance
DEVICE_SPLIT_QUERY = """
    SELECT
        campaign.name,
        segments.device,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.cost_micros,
        metrics.ctr,
        metrics.average_cpc
    FROM campaign
    WHERE segments.date DURING LAST_14_DAYS
        AND campaign.status = 'ENABLED'
"""


def fetch_auction_insights(client: GoogleAdsClient, customer_id: str) -> list[dict]:
    """Fetch auction insight data — who's competing and how."""
    ga_service = client.get_service("GoogleAdsService")
    try:
        response = ga_service.search(customer_id=customer_id, query=AUCTION_INSIGHTS_QUERY)
        rows = []
        for row in response:
            rows.append({
                "campaign": row.campaign.name,
                "competitor_domain": row.auction_insight.display_domain,
                "their_impression_share": round(row.auction_insight.impression_share, 4),
                "overlap_rate": round(row.auction_insight.overlap_rate, 4),
                "outranking_share": round(row.auction_insight.outranking_share, 4),
                "position_above_rate": round(row.auction_insight.position_above_rate, 4),
                "top_of_page_rate": round(row.auction_insight.top_of_page_rate, 4),
            })
        return rows
    except Exception as e:
        print(f"  Auction insights fetch failed: {e}")
        return []


def fetch_search_terms(client: GoogleAdsClient, customer_id: str) -> list[dict]:
    """Fetch top search terms by spend — find waste and opportunity."""
    ga_service = client.get_service("GoogleAdsService")
    try:
        response = ga_service.search(customer_id=customer_id, query=SEARCH_TERMS_QUERY)
        rows = []
        for row in response:
            rows.append({
                "campaign": row.campaign.name,
                "search_term": row.search_term_view.search_term,
                "match_status": row.search_term_view.status.name,
                "impressions": row.metrics.impressions,
                "clicks": row.metrics.clicks,
                "spend": round(row.metrics.cost_micros / 1_000_000, 2),
                "conversions": round(row.metrics.conversions, 2),
                "ctr": round(row.metrics.ctr, 4),
            })
        return rows
    except Exception as e:
        print(f"  Search terms fetch failed: {e}")
        return []


def fetch_quality_scores(client: GoogleAdsClient, customer_id: str) -> list[dict]:
    """Fetch keyword quality scores — find ad relevance issues."""
    ga_service = client.get_service("GoogleAdsService")
    try:
        response = ga_service.search(customer_id=customer_id, query=QUALITY_SCORE_QUERY)
        rows = []
        for row in response:
            rows.append({
                "campaign": row.campaign.name,
                "ad_group": row.ad_group.name,
                "keyword": row.ad_group_criterion.keyword.text,
                "quality_score": row.ad_group_criterion.quality_info.quality_score,
                "ad_relevance": row.ad_group_criterion.quality_info.creative_quality_score.name,
                "landing_page_exp": row.ad_group_criterion.quality_info.post_click_quality_score.name,
                "expected_ctr": row.ad_group_criterion.quality_info.search_predicted_ctr.name,
                "impressions": row.metrics.impressions,
                "conversions": round(row.metrics.conversions, 2),
                "spend": round(row.metrics.cost_micros / 1_000_000, 2),
            })
        return rows
    except Exception as e:
        print(f"  Quality scores fetch failed: {e}")
        return []


def fetch_hourly_performance(client: GoogleAdsClient, customer_id: str) -> list[dict]:
    """Fetch hour-of-day performance to find optimal bid scheduling."""
    ga_service = client.get_service("GoogleAdsService")
    try:
        response = ga_service.search(customer_id=customer_id, query=HOUR_OF_DAY_QUERY)
        rows = []
        for row in response:
            rows.append({
                "campaign": row.campaign.name,
                "hour": row.segments.hour,
                "impressions": row.metrics.impressions,
                "clicks": row.metrics.clicks,
                "conversions": round(row.metrics.conversions, 2),
                "spend": round(row.metrics.cost_micros / 1_000_000, 2),
            })
        return rows
    except Exception as e:
        print(f"  Hourly performance fetch failed: {e}")
        return []


def fetch_budget_bid_data(client: GoogleAdsClient, customer_id: str) -> list[dict]:
    """Fetch budget utilization and bid strategy details."""
    ga_service = client.get_service("GoogleAdsService")
    try:
        response = ga_service.search(customer_id=customer_id, query=BUDGET_BID_QUERY)
        rows = []
        for row in response:
            rows.append({
                "campaign": row.campaign.name,
                "daily_budget": round(row.campaign_budget.amount_micros / 1_000_000, 2) if row.campaign_budget.amount_micros else None,
                "bid_strategy": row.campaign.bidding_strategy_type.name,
                "target_cpa": round(row.campaign.target_cpa.target_cpa_micros / 1_000_000, 2) if row.campaign.target_cpa.target_cpa_micros else None,
                "actual_spend_7d": round(row.metrics.cost_micros / 1_000_000, 2),
                "impressions_7d": row.metrics.impressions,
                "conversions_7d": round(row.metrics.conversions, 2),
                "impression_share": row.metrics.search_impression_share,
                "lost_is_budget": row.metrics.search_budget_lost_impression_share,
                "lost_is_rank": row.metrics.search_rank_lost_impression_share,
            })
        return rows
    except Exception as e:
        print(f"  Budget/bid fetch failed: {e}")
        return []


def fetch_device_splits(client: GoogleAdsClient, customer_id: str) -> list[dict]:
    """Fetch device-level performance splits."""
    ga_service = client.get_service("GoogleAdsService")
    try:
        response = ga_service.search(customer_id=customer_id, query=DEVICE_SPLIT_QUERY)
        rows = []
        for row in response:
            rows.append({
                "campaign": row.campaign.name,
                "device": row.segments.device.name,
                "impressions": row.metrics.impressions,
                "clicks": row.metrics.clicks,
                "conversions": round(row.metrics.conversions, 2),
                "spend": round(row.metrics.cost_micros / 1_000_000, 2),
                "ctr": round(row.metrics.ctr, 4),
                "avg_cpc": round(row.metrics.average_cpc / 1_000_000, 2) if row.metrics.average_cpc else None,
            })
        return rows
    except Exception as e:
        print(f"  Device splits fetch failed: {e}")
        return []


def fetch_all_signals(client: GoogleAdsClient, customer_id: str) -> dict:
    """Fetch all deep signals for the AI brain."""
    return {
        "auction_insights": fetch_auction_insights(client, customer_id),
        "search_terms": fetch_search_terms(client, customer_id),
        "quality_scores": fetch_quality_scores(client, customer_id),
        "hourly_performance": fetch_hourly_performance(client, customer_id),
        "budget_bid_data": fetch_budget_bid_data(client, customer_id),
        "device_splits": fetch_device_splits(client, customer_id),
    }
