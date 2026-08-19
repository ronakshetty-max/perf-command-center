"""Standalone Meta Ads sync script.

Usage:
  python3 sync_meta.py [--lookback 14] [--product rize]

Fetches Meta Ads campaign insights and upserts into PostgreSQL
(same tables the dashboard reads from).
"""

import os
import sys
import json
import psycopg2
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(__file__))
from src.meta_ads.client import get_meta_access_token, get_ad_account_id, paginate_all
from src.meta_ads.fetch import fetch_meta_campaign_insights, transform_meta_insights

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://localhost:5432/perf_marketing")

PRODUCT_FILTERS = {
    "rize": "Rize",
    "domestic_pg": "RPSME",
    "cards": "RPIPC",
    "all": None,
}


def get_db():
    return psycopg2.connect(DATABASE_URL)


def upsert_meta_campaigns(conn, rows):
    """Ensure all Meta campaigns exist in the campaigns table."""
    cur = conn.cursor()
    count = 0
    for row in rows:
        name = row["campaign_name"]
        # Parse business_id from campaign name
        name_lower = name.lower()
        if "rize" in name_lower:
            business_id = "rize"
            category = "generic"
        elif "rpsme" in name_lower or "rphql" in name_lower:
            business_id = "eb"
            category = "brand" if "brand" in name_lower else "generic"
        elif "rpipc" in name_lower:
            business_id = "crossborder"
            category = "generic"
        else:
            business_id = "rize"
            category = "generic"

        cur.execute("""
            INSERT INTO campaigns (campaign_name, campaign_id_external, business_id, platform, category, first_seen, last_seen)
            VALUES (%s, %s, %s, 'meta', %s, %s, %s)
            ON CONFLICT (campaign_name) DO UPDATE SET
                last_seen = EXCLUDED.last_seen,
                campaign_id_external = COALESCE(EXCLUDED.campaign_id_external, campaigns.campaign_id_external)
        """, (name, row.get("campaign_id_external"), business_id, category, row["date"], row["date"]))
        count += 1
    conn.commit()
    cur.close()
    return count


def upsert_meta_metrics(conn, rows):
    """Insert daily metrics from Meta into daily_ad_metrics and daily_campaign_performance."""
    cur = conn.cursor()

    # Build campaign_id map
    cur.execute("SELECT campaign_name, id FROM campaigns")
    campaign_map = {r[0]: r[1] for r in cur.fetchall()}

    count = 0
    for row in rows:
        campaign_id = campaign_map.get(row["campaign_name"])
        if not campaign_id:
            continue

        # Upsert into daily_ad_metrics
        cur.execute("""
            INSERT INTO daily_ad_metrics (campaign_id, date, spend, impressions, clicks, reported_conversions, cpc, ctr, source)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'meta_ads_api')
            ON CONFLICT (campaign_id, date, device) DO UPDATE SET
                spend = EXCLUDED.spend,
                impressions = EXCLUDED.impressions,
                clicks = EXCLUDED.clicks,
                reported_conversions = EXCLUDED.reported_conversions,
                cpc = EXCLUDED.cpc,
                ctr = EXCLUDED.ctr,
                synced_at = NOW()
        """, (campaign_id, row["date"], row["spend"], row["impressions"], row["clicks"],
              row["reported_conversions"], row["cpc"], row["ctr"]))

        # Also upsert into daily_campaign_performance (what the dashboard reads)
        # Get business_id and category from campaigns table
        cur.execute("SELECT business_id, category, platform FROM campaigns WHERE id = %s", (campaign_id,))
        camp_info = cur.fetchone()
        if not camp_info:
            continue
        biz_id, category, platform = camp_info

        cur.execute("""
            INSERT INTO daily_campaign_performance
                (campaign_id, business_id, category, platform, date, spend, impressions, clicks,
                 reported_conversions, backend_leads, backend_payments, cpc, ctr)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (campaign_id, date, device) DO UPDATE SET
                spend = EXCLUDED.spend,
                impressions = EXCLUDED.impressions,
                clicks = EXCLUDED.clicks,
                reported_conversions = EXCLUDED.reported_conversions,
                backend_leads = EXCLUDED.backend_leads,
                backend_payments = EXCLUDED.backend_payments,
                cpc = EXCLUDED.cpc,
                ctr = EXCLUDED.ctr
        """, (campaign_id, biz_id, category, platform, row["date"],
              row["spend"], row["impressions"], row["clicks"],
              row["reported_conversions"], row.get("reported_leads", 0),
              row["reported_conversions"], row["cpc"], row["ctr"]))
        count += 1

    conn.commit()
    cur.close()
    return count


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Sync Meta Ads data to local PostgreSQL")
    parser.add_argument("--lookback", type=int, default=14, help="Days of data to fetch")
    parser.add_argument("--product", default="all", choices=list(PRODUCT_FILTERS.keys()), help="Product filter")
    args = parser.parse_args()

    print(f"Meta Ads Sync — lookback: {args.lookback} days, product: {args.product}")
    print(f"Account: {get_ad_account_id()}")

    # Fetch from Meta API
    campaign_filter = PRODUCT_FILTERS[args.product]
    print(f"Fetching insights{' for ' + campaign_filter if campaign_filter else ' (all campaigns)'}...")
    raw_rows = fetch_meta_campaign_insights(lookback_days=args.lookback, campaign_filter=campaign_filter)
    print(f"  Got {len(raw_rows)} raw insight rows")

    if not raw_rows:
        print("  No data returned. Check token and account access.")
        return

    # Transform
    transformed = transform_meta_insights(raw_rows)
    print(f"  Transformed to {len(transformed)} rows")

    # Upsert to DB
    conn = get_db()
    print("Upserting campaigns...")
    camp_count = upsert_meta_campaigns(conn, transformed)
    print(f"  {camp_count} campaign records")

    print("Upserting daily metrics...")
    metric_count = upsert_meta_metrics(conn, transformed)
    print(f"  {metric_count} metric rows upserted")

    conn.close()
    print(f"\nDone! Meta data is now available in the dashboard.")
    print(f"  Start dashboard: cd packages/web && npx next dev -p 3000")
    print(f"  Filter by platform: 'Meta' in the Platform dropdown")


if __name__ == "__main__":
    main()
