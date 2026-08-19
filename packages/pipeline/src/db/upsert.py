"""Upsert operations for all tables — using direct PostgreSQL."""

from datetime import date
from .connection import get_db, execute_query
import psycopg2.extras


def upsert_campaigns(campaigns: list[dict]) -> int:
    """Upsert campaign registry. Returns count of upserted rows."""
    if not campaigns:
        return 0

    with get_db() as conn:
        with conn.cursor() as cur:
            for c in campaigns:
                cur.execute("""
                    INSERT INTO campaigns (campaign_name, campaign_id_external, business_id, platform, category, sub_category, device_target, audience_type, objective, geo, ad_account_id, is_active, first_seen, last_seen)
                    VALUES (%(campaign_name)s, %(campaign_id_external)s, %(business_id)s, %(platform)s, %(category)s, %(sub_category)s, %(device_target)s, %(audience_type)s, %(objective)s, %(geo)s, %(ad_account_id)s, %(is_active)s, %(first_seen)s, %(last_seen)s)
                    ON CONFLICT (campaign_name) DO UPDATE SET
                        is_active = EXCLUDED.is_active,
                        last_seen = EXCLUDED.last_seen,
                        campaign_id_external = COALESCE(EXCLUDED.campaign_id_external, campaigns.campaign_id_external)
                """, {
                    "campaign_name": c["campaign_name"],
                    "campaign_id_external": c.get("campaign_id_external"),
                    "business_id": c["business_id"],
                    "platform": c["platform"],
                    "category": c["category"],
                    "sub_category": c.get("sub_category"),
                    "device_target": c.get("device_target", "all"),
                    "audience_type": c.get("audience_type"),
                    "objective": c.get("objective"),
                    "geo": c.get("geo", "India"),
                    "ad_account_id": c.get("ad_account_id"),
                    "is_active": c.get("is_active", True),
                    "first_seen": c.get("first_seen", str(date.today())),
                    "last_seen": c.get("last_seen", str(date.today())),
                })
    return len(campaigns)


def upsert_daily_ad_metrics(metrics: list[dict], campaign_id_map: dict) -> int:
    """Upsert daily ad metrics."""
    if not metrics:
        return 0

    count = 0
    with get_db() as conn:
        with conn.cursor() as cur:
            for m in metrics:
                campaign_id = campaign_id_map.get(m["campaign_name"])
                if not campaign_id:
                    continue
                cur.execute("""
                    INSERT INTO daily_ad_metrics (campaign_id, date, device, spend, impressions, clicks, reported_conversions, reported_conversion_value, impression_share, top_impression_share, search_lost_is_budget, search_lost_is_rank, cpc, ctr, source)
                    VALUES (%(campaign_id)s, %(date)s, %(device)s, %(spend)s, %(impressions)s, %(clicks)s, %(reported_conversions)s, %(reported_conversion_value)s, %(impression_share)s, %(top_impression_share)s, %(search_lost_is_budget)s, %(search_lost_is_rank)s, %(cpc)s, %(ctr)s, %(source)s)
                    ON CONFLICT (campaign_id, date, device) DO UPDATE SET
                        spend = EXCLUDED.spend,
                        impressions = EXCLUDED.impressions,
                        clicks = EXCLUDED.clicks,
                        reported_conversions = EXCLUDED.reported_conversions,
                        impression_share = EXCLUDED.impression_share,
                        cpc = EXCLUDED.cpc,
                        ctr = EXCLUDED.ctr,
                        synced_at = NOW()
                """, {
                    "campaign_id": campaign_id,
                    "date": m["date"],
                    "device": m["device"].upper() if m.get("device") else "UNKNOWN",
                    "spend": m["spend"],
                    "impressions": m["impressions"],
                    "clicks": m["clicks"],
                    "reported_conversions": m["reported_conversions"],
                    "reported_conversion_value": m.get("reported_conversion_value", 0),
                    "impression_share": m.get("impression_share"),
                    "top_impression_share": m.get("top_impression_share"),
                    "search_lost_is_budget": m.get("search_lost_is_budget"),
                    "search_lost_is_rank": m.get("search_lost_is_rank"),
                    "cpc": m.get("cpc"),
                    "ctr": m.get("ctr"),
                    "source": m.get("source", "google_ads_api"),
                })
                count += 1
    return count


def upsert_backend_metrics(metrics: list[dict]) -> int:
    """Upsert backend metrics from Tableau."""
    if not metrics:
        return 0

    with get_db() as conn:
        with conn.cursor() as cur:
            for m in metrics:
                cur.execute("""
                    INSERT INTO daily_backend_metrics (business_id, campaign_name_raw, date, device, leads, signups, l2, activated, payments, mtu, source)
                    VALUES (%(business_id)s, %(campaign_name_raw)s, %(date)s, %(device)s, %(leads)s, %(signups)s, %(l2)s, %(activated)s, %(payments)s, %(mtu)s, %(source)s)
                    ON CONFLICT (campaign_name_raw, date, device) DO UPDATE SET
                        leads = EXCLUDED.leads,
                        payments = EXCLUDED.payments,
                        signups = EXCLUDED.signups,
                        l2 = EXCLUDED.l2,
                        mtu = EXCLUDED.mtu,
                        synced_at = NOW()
                """, {
                    "business_id": m["business_id"],
                    "campaign_name_raw": m["campaign_name_raw"],
                    "date": m["date"],
                    "device": (m.get("device") or "ALL").upper(),
                    "leads": m.get("leads", 0),
                    "signups": m.get("signups", 0),
                    "l2": m.get("l2", 0),
                    "activated": m.get("activated", 0),
                    "payments": m.get("payments", 0),
                    "mtu": m.get("mtu", 0),
                    "source": m.get("source", "tableau_api"),
                })
    return len(metrics)


def refresh_daily_performance(start_date: str, end_date: str) -> int:
    """Run the join function to refresh daily_campaign_performance."""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT refresh_performance_data(%s::date, %s::date)", (start_date, end_date))
            result = cur.fetchone()
            return result[0] if result else 0


def get_campaign_id_map() -> dict:
    """Get mapping of campaign_name → campaign.id."""
    rows = execute_query("SELECT id, campaign_name FROM campaigns")
    return {row["campaign_name"]: row["id"] for row in rows}


def save_insights(insights: list[dict]) -> int:
    """Save generated insights to database."""
    if not insights:
        return 0

    with get_db() as conn:
        with conn.cursor() as cur:
            for i in insights:
                cur.execute("""
                    INSERT INTO insights (business_id, campaign_id, category, date, insight_type, severity, title, description, metric_context)
                    VALUES (%(business_id)s, %(campaign_id)s, %(category)s, %(date)s, %(insight_type)s, %(severity)s, %(title)s, %(description)s, %(metric_context)s)
                """, {
                    "business_id": i["business_id"],
                    "campaign_id": i.get("campaign_id"),
                    "category": i.get("category"),
                    "date": i["date"],
                    "insight_type": i["insight_type"],
                    "severity": i["severity"],
                    "title": i["title"],
                    "description": i["description"],
                    "metric_context": psycopg2.extras.Json(i.get("metric_context")),
                })
    return len(insights)


def log_sync(source: str, status: str, records: int = 0, error: str = None) -> None:
    """Log a sync operation."""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO sync_log (source, status, records_fetched, error_message, started_at, completed_at)
                VALUES (%s, %s, %s, %s, NOW(), NOW())
            """, (source, status, records, error))
