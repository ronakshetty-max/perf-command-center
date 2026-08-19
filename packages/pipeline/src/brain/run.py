"""Run the AI marketing brain as a pipeline step.

This is separate from the data sync pipeline because:
1. It uses Claude API (costs money per call)
2. It only needs to run 1-2x per day (not every 4 hours)
3. It needs ALL signals collected first before it can analyze
"""

from datetime import date, timedelta

from ..config import GoogleAdsConfig, BUSINESS_CONFIG
from ..db.connection import get_supabase_client
from ..db.upsert import get_campaign_id_map
from ..google_ads.client import get_google_ads_client
from ..google_ads.fetch_signals import fetch_all_signals
from .analyst import CampaignContext, analyze_campaigns, opportunities_to_db_format


def run_brain(business_id: str = "rize"):
    """Run the full AI analysis for a business."""
    print(f"\n  [BRAIN] Running AI analysis for: {business_id}")

    supabase = get_supabase_client()
    biz_config = BUSINESS_CONFIG[business_id]
    target_date = (date.today() - timedelta(days=1)).isoformat()

    # 1. Fetch campaign performance from our DB (already synced)
    perf_result = supabase.table("daily_campaign_performance").select(
        "*, campaigns!inner(campaign_name, sub_category)"
    ).eq("business_id", business_id).gte(
        "date", (date.today() - timedelta(days=30)).isoformat()
    ).execute()

    # Aggregate by campaign
    campaign_perf = _aggregate_by_campaign(perf_result.data or [])
    print(f"  [BRAIN] Performance data: {len(campaign_perf)} campaigns")

    # 2. Fetch deep signals from Google Ads
    google_client = get_google_ads_client()
    all_signals = {}
    for customer_id in GoogleAdsConfig.customer_ids:
        signals = fetch_all_signals(google_client, customer_id)
        for key, value in signals.items():
            all_signals.setdefault(key, []).extend(value)
    print(f"  [BRAIN] Signals: {sum(len(v) for v in all_signals.values())} total rows")

    # 3. Fetch backend metrics for ground truth
    backend_result = supabase.table("daily_backend_metrics").select("*").eq(
        "business_id", business_id
    ).gte("date", (date.today() - timedelta(days=30)).isoformat()).execute()
    backend_metrics = _aggregate_backend(backend_result.data or [], campaign_perf)

    # 4. Get monthly targets
    month_start = date.today().replace(day=1).isoformat()
    targets_result = supabase.table("monthly_targets").select("*").eq(
        "business_id", business_id
    ).eq("month", month_start).execute()
    targets = targets_result.data[0] if targets_result.data else {}

    # 5. Build context and run analysis
    context = CampaignContext(
        business_id=business_id,
        business_name=biz_config["name"],
        cpp_cap=biz_config.get("cpp_cap", 2700),
        monthly_budget=targets.get("budget_target", 2000000),
        monthly_payment_target=targets.get("payment_target", 760),
        campaign_performance=campaign_perf,
        auction_insights=all_signals.get("auction_insights", []),
        search_terms=all_signals.get("search_terms", []),
        quality_scores=all_signals.get("quality_scores", []),
        hourly_performance=all_signals.get("hourly_performance", []),
        budget_bid_data=all_signals.get("budget_bid_data", []),
        device_splits=all_signals.get("device_splits", []),
        backend_metrics=backend_metrics,
    )

    opportunities = analyze_campaigns(context)
    print(f"  [BRAIN] Generated {len(opportunities)} opportunities")

    # 6. Save to database
    if opportunities:
        db_rows = opportunities_to_db_format(opportunities, business_id, target_date)
        supabase.table("insights").insert(db_rows).execute()
        print(f"  [BRAIN] Saved {len(db_rows)} insights to database")

    # 7. Print summary
    for i, opp in enumerate(opportunities, 1):
        print(f"\n  [{opp.priority}] {opp.title}")
        print(f"      Action: {opp.action}")
        print(f"      Impact: {opp.expected_impact}")
        print(f"      Timeframe: {opp.timeframe}")

    return opportunities


def _aggregate_by_campaign(perf_data: list[dict]) -> list[dict]:
    """Aggregate 30-day performance by campaign."""
    campaigns = {}
    for row in perf_data:
        name = row.get("campaigns", {}).get("campaign_name", "Unknown")
        if name not in campaigns:
            campaigns[name] = {
                "campaign_name": name,
                "spend": 0, "leads": 0, "payments": 0,
                "impressions": 0, "clicks": 0,
                "impression_share_sum": 0, "impression_share_count": 0,
                "lost_is_budget_sum": 0, "lost_is_rank_sum": 0,
            }
        c = campaigns[name]
        c["spend"] += row.get("spend", 0) or 0
        c["leads"] += row.get("backend_leads", 0) or 0
        c["payments"] += row.get("backend_payments", 0) or 0
        c["impressions"] += row.get("impressions", 0) or 0
        c["clicks"] += row.get("clicks", 0) or 0
        if row.get("impression_share"):
            c["impression_share_sum"] += row["impression_share"]
            c["impression_share_count"] += 1

    result = []
    for c in campaigns.values():
        c["cpl"] = c["spend"] / c["leads"] if c["leads"] > 0 else 0
        c["cpp"] = c["spend"] / c["payments"] if c["payments"] > 0 else 0
        c["l2p"] = c["payments"] / c["leads"] if c["leads"] > 0 else 0
        c["impression_share"] = (c["impression_share_sum"] / c["impression_share_count"]) if c["impression_share_count"] > 0 else 0
        c["lost_is_budget"] = 0
        c["lost_is_rank"] = 0
        result.append(c)

    return sorted(result, key=lambda x: x["spend"], reverse=True)


def _aggregate_backend(backend_data: list[dict], campaign_perf: list[dict]) -> list[dict]:
    """Build backend truth comparison."""
    # Group backend by campaign
    by_campaign = {}
    for row in backend_data:
        name = row.get("campaign_name_raw", "")
        if name not in by_campaign:
            by_campaign[name] = {"leads": 0, "payments": 0}
        by_campaign[name]["leads"] += row.get("leads", 0) or 0
        by_campaign[name]["payments"] += row.get("payments", 0) or 0

    result = []
    for perf in campaign_perf[:15]:
        name = perf["campaign_name"]
        backend = by_campaign.get(name, {"leads": 0, "payments": 0})
        real_cpp = perf["spend"] / backend["payments"] if backend["payments"] > 0 else 0
        real_l2p = backend["payments"] / backend["leads"] if backend["leads"] > 0 else 0
        result.append({
            "campaign_name": name,
            "leads": backend["leads"],
            "payments": backend["payments"],
            "real_cpp": real_cpp,
            "real_l2p": real_l2p,
            "vs_reported": f"{'Higher' if real_cpp > perf['cpp'] else 'Lower'} than reported" if perf['cpp'] > 0 else "N/A",
        })

    return result


if __name__ == "__main__":
    import sys
    biz = sys.argv[1] if len(sys.argv) > 1 else "rize"
    run_brain(biz)
