"""Insights and opportunity detection engine."""

from dataclasses import dataclass
from typing import Optional
from supabase import Client


@dataclass
class Insight:
    business_id: str
    campaign_id: Optional[int]
    category: Optional[str]
    date: str
    insight_type: str
    severity: str
    title: str
    description: str
    metric_context: Optional[dict] = None


def run_insights_engine(client: Client, business_id: str, target_date: str) -> list[Insight]:
    """Run all insight rules and return generated insights."""
    insights = []

    # Fetch recent performance data for analysis
    perf_data = _fetch_performance_window(client, business_id, target_date)
    if not perf_data:
        return insights

    # Get targets/caps for this business
    targets = _fetch_targets(client, business_id)
    cpp_cap = targets.get("cpp_cap", 2700)

    # Group by category
    by_category = {}
    for row in perf_data:
        cat = row["category"]
        if cat not in by_category:
            by_category[cat] = []
        by_category[cat].append(row)

    # Run rules
    insights.extend(_check_scale_opportunities(by_category, cpp_cap, business_id, target_date))
    insights.extend(_check_cpp_above_cap(by_category, cpp_cap, business_id, target_date))
    insights.extend(_check_breakout_campaigns(by_category, business_id, target_date))
    insights.extend(_check_zero_conversions(perf_data, business_id, target_date))
    insights.extend(_check_l2p_degradation(by_category, business_id, target_date))

    return insights


def _check_scale_opportunities(by_category: dict, cpp_cap: float, business_id: str, target_date: str) -> list[Insight]:
    """Campaigns with CPP under cap AND low impression share → can scale."""
    insights = []
    for category, rows in by_category.items():
        recent = [r for r in rows if r["date"] == target_date]
        if not recent:
            continue

        total_spend = sum(r["spend"] for r in recent)
        total_payments = sum(r["backend_payments"] for r in recent)
        avg_is = _safe_avg([r["impression_share"] for r in recent if r["impression_share"]])

        if total_payments > 0:
            cpp = total_spend / total_payments
            if cpp < cpp_cap * 0.9 and avg_is and avg_is < 0.6:
                insights.append(Insight(
                    business_id=business_id,
                    campaign_id=None,
                    category=category,
                    date=target_date,
                    insight_type="scale_opportunity",
                    severity="positive",
                    title=f"{category} has room to scale (IS: {avg_is:.0%})",
                    description=f"CPP ₹{cpp:,.0f} is {((cpp_cap - cpp)/cpp_cap)*100:.0f}% below cap with only {avg_is:.0%} impression share. Increasing budget could capture more volume efficiently.",
                    metric_context={"cpp": cpp, "cpp_cap": cpp_cap, "impression_share": avg_is},
                ))
    return insights


def _check_cpp_above_cap(by_category: dict, cpp_cap: float, business_id: str, target_date: str) -> list[Insight]:
    """Categories with CPP consistently above cap."""
    insights = []
    for category, rows in by_category.items():
        # Look at last 3 days
        recent_3d = sorted(rows, key=lambda r: r["date"], reverse=True)[:3]
        if len(recent_3d) < 3:
            continue

        total_spend = sum(r["spend"] for r in recent_3d)
        total_payments = sum(r["backend_payments"] for r in recent_3d)

        if total_payments > 0:
            cpp_3d = total_spend / total_payments
            if cpp_3d > cpp_cap * 1.15:
                insights.append(Insight(
                    business_id=business_id,
                    campaign_id=None,
                    category=category,
                    date=target_date,
                    insight_type="degrading",
                    severity="warning",
                    title=f"{category}: CPP ₹{cpp_3d:,.0f} is {((cpp_3d - cpp_cap)/cpp_cap)*100:.0f}% above cap",
                    description=f"CPP has been above ₹{cpp_cap:,.0f} cap for 3+ days. Consider reducing budget or pausing low-performing campaigns in this category.",
                    metric_context={"cpp_3d": cpp_3d, "cpp_cap": cpp_cap},
                ))
    return insights


def _check_breakout_campaigns(by_category: dict, business_id: str, target_date: str) -> list[Insight]:
    """Categories with >20% WoW payment growth and improving CPP."""
    insights = []
    for category, rows in by_category.items():
        sorted_rows = sorted(rows, key=lambda r: r["date"])
        if len(sorted_rows) < 14:
            continue

        # This week vs last week (last 7 vs prior 7)
        this_week = sorted_rows[-7:]
        last_week = sorted_rows[-14:-7]

        tw_payments = sum(r["backend_payments"] for r in this_week)
        lw_payments = sum(r["backend_payments"] for r in last_week)

        if lw_payments > 0 and tw_payments > 0:
            wow_pct = ((tw_payments - lw_payments) / lw_payments) * 100
            tw_spend = sum(r["spend"] for r in this_week)
            lw_spend = sum(r["spend"] for r in last_week)
            tw_cpp = tw_spend / tw_payments
            lw_cpp = lw_spend / lw_payments
            cpp_change = ((tw_cpp - lw_cpp) / lw_cpp) * 100

            if wow_pct > 20 and cpp_change < -3:
                insights.append(Insight(
                    business_id=business_id,
                    campaign_id=None,
                    category=category,
                    date=target_date,
                    insight_type="breakout",
                    severity="positive",
                    title=f"{category} breaking out: +{wow_pct:.0f}% payments WoW",
                    description=f"Payments grew {wow_pct:.0f}% WoW while CPP improved {cpp_change:.1f}%. This category is scaling efficiently — consider accelerating budget.",
                    metric_context={"wow_pct": wow_pct, "cpp_change": cpp_change},
                ))
    return insights


def _check_zero_conversions(perf_data: list[dict], business_id: str, target_date: str) -> list[Insight]:
    """Campaigns spending but getting zero backend conversions for 3+ days."""
    insights = []
    # Group by campaign
    by_campaign = {}
    for row in perf_data:
        cid = row["campaign_id"]
        if cid not in by_campaign:
            by_campaign[cid] = []
        by_campaign[cid].append(row)

    for campaign_id, rows in by_campaign.items():
        recent = sorted(rows, key=lambda r: r["date"], reverse=True)[:3]
        if len(recent) < 3:
            continue

        total_spend = sum(r["spend"] for r in recent)
        total_payments = sum(r["backend_payments"] for r in recent)

        if total_spend > 5000 and total_payments == 0:
            campaign_name = recent[0].get("campaign_name", f"Campaign #{campaign_id}")
            insights.append(Insight(
                business_id=business_id,
                campaign_id=campaign_id,
                category=recent[0].get("category"),
                date=target_date,
                insight_type="alert",
                severity="critical",
                title=f"CRITICAL: {campaign_name} — 0 payments for 3 days (₹{total_spend:,.0f} spent)",
                description=f"This campaign spent ₹{total_spend:,.0f} in the last 3 days with zero backend conversions. Check if conversion tracking is broken or if lead quality has degraded.",
                metric_context={"spend_3d": total_spend, "payments_3d": 0},
            ))
    return insights


def _check_l2p_degradation(by_category: dict, business_id: str, target_date: str) -> list[Insight]:
    """L2P rate dropped significantly vs 30-day average."""
    insights = []
    for category, rows in by_category.items():
        if len(rows) < 14:
            continue

        sorted_rows = sorted(rows, key=lambda r: r["date"])
        recent_7d = sorted_rows[-7:]
        prior_period = sorted_rows[:-7]

        recent_leads = sum(r["backend_leads"] for r in recent_7d)
        recent_payments = sum(r["backend_payments"] for r in recent_7d)
        prior_leads = sum(r["backend_leads"] for r in prior_period)
        prior_payments = sum(r["backend_payments"] for r in prior_period)

        if recent_leads > 0 and prior_leads > 0:
            recent_l2p = recent_payments / recent_leads
            prior_l2p = prior_payments / prior_leads
            drop_pp = (prior_l2p - recent_l2p) * 100

            if drop_pp > 5:
                insights.append(Insight(
                    business_id=business_id,
                    campaign_id=None,
                    category=category,
                    date=target_date,
                    insight_type="degrading",
                    severity="warning",
                    title=f"{category}: L2P dropped {drop_pp:.1f}pp (now {recent_l2p:.1%})",
                    description=f"Lead-to-payment rate fell from {prior_l2p:.1%} to {recent_l2p:.1%}. This suggests lead quality is degrading at current scale. Review search terms and audience targeting.",
                    metric_context={"recent_l2p": recent_l2p, "prior_l2p": prior_l2p},
                ))
    return insights


def save_insights(client: Client, insights: list[Insight]) -> int:
    """Save generated insights to database."""
    if not insights:
        return 0

    rows = [
        {
            "business_id": i.business_id,
            "campaign_id": i.campaign_id,
            "category": i.category,
            "date": i.date,
            "insight_type": i.insight_type,
            "severity": i.severity,
            "title": i.title,
            "description": i.description,
            "metric_context": i.metric_context,
        }
        for i in insights
    ]

    result = client.table("insights").upsert(rows).execute()
    return len(result.data)


def _fetch_performance_window(client: Client, business_id: str, target_date: str) -> list[dict]:
    """Fetch last 30 days of performance data for a business."""
    result = (
        client.table("daily_campaign_performance")
        .select("*")
        .eq("business_id", business_id)
        .gte("date", _subtract_days(target_date, 30))
        .lte("date", target_date)
        .execute()
    )
    return result.data


def _fetch_targets(client: Client, business_id: str) -> dict:
    """Fetch performance targets for a business."""
    result = (
        client.table("businesses")
        .select("cpp_cap")
        .eq("id", business_id)
        .single()
        .execute()
    )
    return result.data if result.data else {"cpp_cap": 2700}


def _subtract_days(date_str: str, days: int) -> str:
    from datetime import datetime, timedelta
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    return (dt - timedelta(days=days)).strftime("%Y-%m-%d")


def _safe_avg(values: list) -> Optional[float]:
    filtered = [v for v in values if v is not None]
    return sum(filtered) / len(filtered) if filtered else None
