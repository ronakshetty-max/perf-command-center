"""Main pipeline orchestrator.

Runs on a 4-hour cron schedule:
1. Fetch Google Ads data (last 7 days)
2. Fetch Tableau backend data (last 7 days)
3. Parse campaign names, upsert to campaigns table
4. Upsert ad metrics and backend metrics
5. Join into daily_campaign_performance
6. Run insights engine
7. Log sync results
"""

import sys
from datetime import date, datetime, timedelta

from .config import BUSINESS_CONFIG
from .db.connection import get_supabase_client
from .db.upsert import (
    upsert_campaigns,
    upsert_daily_ad_metrics,
    upsert_backend_metrics,
    refresh_daily_performance,
    get_campaign_id_map,
)
from .google_ads.client import get_google_ads_client
from .google_ads.fetch import fetch_all_accounts
from .google_ads.transform import transform_ad_rows
from .meta_ads.fetch import fetch_meta_campaign_insights, transform_meta_insights
from .tableau.fetch import fetch_rize_leads, fetch_curlec_funnel
from .insights.engine import run_insights_engine, save_insights


def run_pipeline(lookback_days: int = 7):
    """Execute the full data pipeline."""
    started_at = datetime.utcnow()
    print(f"[{started_at.isoformat()}] Pipeline started (lookback: {lookback_days} days)")

    supabase = get_supabase_client()
    end_date = date.today() - timedelta(days=1)
    start_date = end_date - timedelta(days=lookback_days - 1)

    # --- Step 1: Google Ads ---
    print("  [1/6] Fetching Google Ads data...")
    try:
        google_client = get_google_ads_client()
        raw_rows = fetch_all_accounts(google_client, lookback_days=lookback_days)
        campaigns, ad_metrics = transform_ad_rows(raw_rows)
        print(f"        Fetched {len(raw_rows)} rows, {len(campaigns)} campaigns")
    except Exception as e:
        print(f"        ERROR: Google Ads fetch failed: {e}")
        _log_sync(supabase, "google_ads", "failed", error=str(e), started_at=started_at)
        campaigns, ad_metrics = [], []

    # --- Step 2: Upsert campaigns ---
    print("  [2/6] Upserting campaigns...")
    if campaigns:
        count = upsert_campaigns(supabase, campaigns)
        print(f"        Upserted {count} campaigns")

    # --- Step 3: Upsert ad metrics ---
    print("  [3/6] Upserting ad metrics...")
    if ad_metrics:
        campaign_id_map = get_campaign_id_map(supabase)
        count = upsert_daily_ad_metrics(supabase, ad_metrics, campaign_id_map)
        print(f"        Upserted {count} metric rows")
    _log_sync(supabase, "google_ads", "completed", len(raw_rows) if campaigns else 0, started_at=started_at)

    # --- Step 3b: Meta Ads ---
    print("  [3b/7] Fetching Meta Ads data...")
    try:
        meta_raw = fetch_meta_campaign_insights(lookback_days=lookback_days)
        meta_rows = transform_meta_insights(meta_raw)
        print(f"        Meta: {len(meta_raw)} raw rows → {len(meta_rows)} transformed")
        if meta_rows:
            # Upsert Meta campaigns and metrics using same pattern
            meta_campaigns = [
                {"campaign_name": r["campaign_name"], "platform": "meta", "source": "meta_ads_api"}
                for r in meta_rows
            ]
            # Deduplicate by campaign_name
            seen = set()
            unique_meta_campaigns = []
            for mc in meta_campaigns:
                if mc["campaign_name"] not in seen:
                    seen.add(mc["campaign_name"])
                    unique_meta_campaigns.append(mc)
            upsert_campaigns(supabase, unique_meta_campaigns)
            campaign_id_map = get_campaign_id_map(supabase)
            count = upsert_daily_ad_metrics(supabase, meta_rows, campaign_id_map)
            print(f"        Upserted {count} Meta metric rows")
        _log_sync(supabase, "meta_ads", "completed", len(meta_raw), started_at=started_at)
    except Exception as e:
        print(f"        ERROR: Meta Ads fetch failed: {e}")
        _log_sync(supabase, "meta_ads", "failed", error=str(e), started_at=started_at)

    # --- Step 4: Tableau backend data ---
    print("  [4/7] Fetching Tableau backend data...")
    backend_rows = []
    try:
        rize_leads = fetch_rize_leads(start_date=start_date, end_date=end_date)
        backend_rows.extend(rize_leads)
        print(f"        Rize leads: {len(rize_leads)} rows")

        curlec_funnel = fetch_curlec_funnel(start_date=start_date, end_date=end_date)
        backend_rows.extend(curlec_funnel)
        print(f"        Curlec funnel: {len(curlec_funnel)} rows")
    except Exception as e:
        print(f"        ERROR: Tableau fetch failed: {e}")
        _log_sync(supabase, "tableau", "failed", error=str(e), started_at=started_at)

    if backend_rows:
        count = upsert_backend_metrics(supabase, backend_rows)
        print(f"        Upserted {count} backend metric rows")
        _log_sync(supabase, "tableau", "completed", len(backend_rows), started_at=started_at)

    # --- Step 5: Join into performance table ---
    print("  [5/6] Refreshing daily_campaign_performance...")
    try:
        count = refresh_daily_performance(
            supabase, start_date.isoformat(), end_date.isoformat()
        )
        print(f"        Refreshed performance data: {count}")
    except Exception as e:
        print(f"        ERROR: Performance refresh failed: {e}")
        print(f"        (This may require the refresh_performance_data SQL function)")

    # --- Step 6: Run insights ---
    print("  [6/6] Running insights engine...")
    all_insights = []
    for business_id in BUSINESS_CONFIG:
        if BUSINESS_CONFIG[business_id].get("phase", 1) > 1:
            continue
        insights = run_insights_engine(supabase, business_id, end_date.isoformat())
        all_insights.extend(insights)

    if all_insights:
        count = save_insights(supabase, all_insights)
        print(f"        Generated {count} insights")
    else:
        print("        No new insights")

    elapsed = (datetime.utcnow() - started_at).total_seconds()
    print(f"\n  Pipeline completed in {elapsed:.1f}s")


def _log_sync(client, source: str, status: str, records: int = 0, error: str = None, started_at=None):
    """Log sync result."""
    try:
        client.table("sync_log").insert(
            {
                "source": source,
                "status": status,
                "records_fetched": records,
                "error_message": error,
                "started_at": started_at.isoformat() if started_at else datetime.utcnow().isoformat(),
                "completed_at": datetime.utcnow().isoformat(),
            }
        ).execute()
    except Exception:
        pass


if __name__ == "__main__":
    lookback = int(sys.argv[1]) if len(sys.argv) > 1 else 7
    run_pipeline(lookback_days=lookback)
