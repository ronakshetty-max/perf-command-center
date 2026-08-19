"""AI Marketing Brain — Analyzes all campaign signals and generates
actionable opportunities like a senior performance marketer.

This is NOT a rule engine. It feeds comprehensive campaign data to Claude
and gets back structured, prioritized recommendations that consider:
- Impression share & auction dynamics
- Competitor behavior changes
- Quality score degradation
- Budget utilization & bid headroom
- Search term waste
- Device & time-of-day patterns
- Backend conversion quality (L2P trends)
- Cross-campaign interactions (budget cannibalization)
"""

import json
import os
from dataclasses import dataclass, asdict
from typing import Optional

import anthropic


ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

SYSTEM_PROMPT = """You are a senior performance marketing analyst managing Google Ads and Meta campaigns for a B2B SaaS company. You think in terms of:

1. AUCTION DYNAMICS — not just "IS is low" but WHY (budget-limited vs rank-limited vs new competitors entering)
2. INCREMENTAL VOLUME — where can we get the next 50 payments without blowing CPP cap
3. QUALITY SIGNALS — quality score degradation = future CPC inflation, fix proactively
4. SEARCH TERM WASTE — money bleeding to irrelevant queries that will never convert
5. BID STRATEGY — is the current strategy (manual CPC vs tCPA vs max conv) optimal for this campaign's maturity
6. CROSS-CAMPAIGN EFFECTS — is scaling campaign A cannibalizing campaign B's cheaper traffic
7. DEVICE & TIME PATTERNS — are we overpaying for mobile traffic that converts at half the rate
8. BACKEND REALITY — Google-reported conversions ≠ real payments. Always anchor to backend CPP.

Your recommendations must be:
- SPECIFIC (not "increase budget" but "increase IncorpTypes daily budget from ₹18K to ₹25K")
- QUANTIFIED (expected impact: "+15-20 payments at ₹2,200-2,400 CPP")
- PRIORITIZED (what moves the needle most, what's easy vs hard)
- TIME-BOUND (do this week vs monitor for 2 weeks then decide)
- RISK-AWARE (what could go wrong, what to watch for)

Output format: Return a JSON array of opportunities, each with:
{
  "priority": 1-5 (1=highest),
  "category": "scale|optimize|cut|test|fix",
  "campaign": "specific campaign name or category",
  "title": "one-line recommendation",
  "reasoning": "2-3 sentences explaining WHY based on the data signals",
  "action": "exactly what to do — specific numbers, settings to change",
  "expected_impact": "quantified: +/- payments, CPP change, spend change",
  "risk": "what could go wrong and how to mitigate",
  "timeframe": "immediate|this_week|next_2_weeks|next_month",
  "signals_used": ["list of data signals that informed this recommendation"]
}"""


@dataclass
class CampaignContext:
    """All data the brain needs to analyze."""
    business_id: str
    business_name: str
    cpp_cap: float
    monthly_budget: float
    monthly_payment_target: int

    # Performance data (last 30 days aggregated by campaign)
    campaign_performance: list[dict]

    # Deep signals
    auction_insights: list[dict]
    search_terms: list[dict]
    quality_scores: list[dict]
    hourly_performance: list[dict]
    budget_bid_data: list[dict]
    device_splits: list[dict]

    # Backend truth
    backend_metrics: list[dict]


@dataclass
class Opportunity:
    priority: int
    category: str
    campaign: str
    title: str
    reasoning: str
    action: str
    expected_impact: str
    risk: str
    timeframe: str
    signals_used: list[str]


def analyze_campaigns(context: CampaignContext) -> list[Opportunity]:
    """Feed all campaign data to Claude and get structured opportunities back."""
    if not ANTHROPIC_API_KEY:
        print("  WARNING: ANTHROPIC_API_KEY not set — skipping AI analysis")
        return []

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    # Build the data prompt
    data_prompt = _build_data_prompt(context)

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": f"""Analyze the following campaign performance data for {context.business_name} and generate prioritized opportunities.

CONSTRAINTS:
- CPP cap: ₹{context.cpp_cap:,.0f}
- Monthly budget: ₹{context.monthly_budget:,.0f}
- Monthly payment target: {context.monthly_payment_target}

{data_prompt}

Based on ALL the signals above, what are the top 5-8 opportunities? Think holistically — consider auction dynamics, search term waste, quality score issues, device patterns, budget constraints, and backend conversion quality.

Return ONLY a JSON array of opportunity objects. No other text."""
            }
        ],
    )

    # Parse response
    try:
        content = response.content[0].text
        # Extract JSON from response (handle markdown code blocks)
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]

        opportunities_raw = json.loads(content)
        return [Opportunity(**opp) for opp in opportunities_raw]
    except (json.JSONDecodeError, TypeError, KeyError) as e:
        print(f"  WARNING: Failed to parse AI response: {e}")
        return []


def _build_data_prompt(context: CampaignContext) -> str:
    """Build a comprehensive data summary for the LLM."""
    sections = []

    # Campaign performance summary
    sections.append("## CAMPAIGN PERFORMANCE (Last 30 Days)")
    sections.append("Campaign | Spend | Leads | Payments | CPL | CPP (Backend) | L2P | IS% | Lost IS (Budget) | Lost IS (Rank)")
    for camp in context.campaign_performance[:20]:
        sections.append(
            f"{camp.get('campaign_name', 'Unknown')} | "
            f"₹{camp.get('spend', 0):,.0f} | "
            f"{camp.get('leads', 0)} | "
            f"{camp.get('payments', 0)} | "
            f"₹{camp.get('cpl', 0):,.0f} | "
            f"₹{camp.get('cpp', 0):,.0f} | "
            f"{camp.get('l2p', 0):.1%} | "
            f"{camp.get('impression_share', 0):.0%} | "
            f"{camp.get('lost_is_budget', 0):.0%} | "
            f"{camp.get('lost_is_rank', 0):.0%}"
        )

    # Auction insights
    if context.auction_insights:
        sections.append("\n## AUCTION INSIGHTS (Competitors)")
        sections.append("Campaign | Competitor | Their IS | Overlap Rate | Outranking Share | Position Above Rate")
        for ai in context.auction_insights[:30]:
            sections.append(
                f"{ai['campaign']} | {ai['competitor_domain']} | "
                f"{ai['their_impression_share']:.0%} | {ai['overlap_rate']:.0%} | "
                f"{ai['outranking_share']:.0%} | {ai['position_above_rate']:.0%}"
            )

    # Search terms (top spenders with no/low conversions = waste)
    if context.search_terms:
        sections.append("\n## SEARCH TERMS (Top by spend — look for waste)")
        sections.append("Campaign | Search Term | Clicks | Spend | Conversions | CTR")
        waste_terms = [t for t in context.search_terms if t['conversions'] == 0 and t['spend'] > 100]
        converting_terms = [t for t in context.search_terms if t['conversions'] > 0]
        for t in (waste_terms[:15] + converting_terms[:10]):
            sections.append(
                f"{t['campaign']} | {t['search_term']} | "
                f"{t['clicks']} | ₹{t['spend']:,.0f} | "
                f"{t['conversions']} | {t['ctr']:.2%}"
            )

    # Quality scores
    if context.quality_scores:
        sections.append("\n## QUALITY SCORES (Keywords with issues)")
        sections.append("Campaign | Keyword | QS | Ad Relevance | Landing Page | Expected CTR | Spend")
        low_qs = [q for q in context.quality_scores if q.get('quality_score', 10) <= 5]
        for q in low_qs[:15]:
            sections.append(
                f"{q['campaign']} | {q['keyword']} | "
                f"{q.get('quality_score', '?')}/10 | {q.get('ad_relevance', '?')} | "
                f"{q.get('landing_page_exp', '?')} | {q.get('expected_ctr', '?')} | "
                f"₹{q.get('spend', 0):,.0f}"
            )

    # Budget & Bid data
    if context.budget_bid_data:
        sections.append("\n## BUDGET & BID STRATEGY")
        sections.append("Campaign | Daily Budget | Bid Strategy | Target CPA | 7d Spend | 7d Conv | IS% | Lost IS (Budget) | Lost IS (Rank)")
        for b in context.budget_bid_data:
            sections.append(
                f"{b['campaign']} | "
                f"₹{b.get('daily_budget', 0):,.0f} | "
                f"{b.get('bid_strategy', '?')} | "
                f"₹{b.get('target_cpa', 0):,.0f} | "
                f"₹{b.get('actual_spend_7d', 0):,.0f} | "
                f"{b.get('conversions_7d', 0)} | "
                f"{b.get('impression_share', 0):.0%} | "
                f"{b.get('lost_is_budget', 0):.0%} | "
                f"{b.get('lost_is_rank', 0):.0%}"
            )

    # Device splits
    if context.device_splits:
        sections.append("\n## DEVICE PERFORMANCE (14-day)")
        sections.append("Campaign | Device | Spend | Clicks | Conversions | CPC | CTR")
        for d in context.device_splits[:20]:
            sections.append(
                f"{d['campaign']} | {d['device']} | "
                f"₹{d.get('spend', 0):,.0f} | {d.get('clicks', 0)} | "
                f"{d.get('conversions', 0)} | ₹{d.get('avg_cpc', 0):,.0f} | "
                f"{d.get('ctr', 0):.2%}"
            )

    # Hourly patterns (summarized)
    if context.hourly_performance:
        sections.append("\n## HOURLY CONVERSION PATTERN (aggregated)")
        hourly_agg = {}
        for h in context.hourly_performance:
            hour = h['hour']
            if hour not in hourly_agg:
                hourly_agg[hour] = {"spend": 0, "conversions": 0}
            hourly_agg[hour]["spend"] += h["spend"]
            hourly_agg[hour]["conversions"] += h["conversions"]
        sections.append("Hour | Spend | Conversions | CPA")
        for hour in sorted(hourly_agg.keys()):
            agg = hourly_agg[hour]
            cpa = agg["spend"] / agg["conversions"] if agg["conversions"] > 0 else 0
            sections.append(f"{hour}:00 | ₹{agg['spend']:,.0f} | {agg['conversions']:.1f} | ₹{cpa:,.0f}")

    # Backend metrics
    if context.backend_metrics:
        sections.append("\n## BACKEND TRUTH (Real conversions from Tableau)")
        sections.append("Campaign | Backend Leads | Backend Payments | Real CPP | Real L2P | vs Google Reported")
        for bm in context.backend_metrics[:15]:
            sections.append(
                f"{bm.get('campaign_name', '?')} | "
                f"{bm.get('leads', 0)} | {bm.get('payments', 0)} | "
                f"₹{bm.get('real_cpp', 0):,.0f} | {bm.get('real_l2p', 0):.1%} | "
                f"{bm.get('vs_reported', '?')}"
            )

    return "\n".join(sections)


def opportunities_to_db_format(opportunities: list[Opportunity], business_id: str, target_date: str) -> list[dict]:
    """Convert AI opportunities to the insights table format."""
    severity_map = {
        "scale": "positive",
        "optimize": "info",
        "cut": "warning",
        "test": "info",
        "fix": "critical",
    }

    return [
        {
            "business_id": business_id,
            "campaign_id": None,
            "category": opp.category,
            "date": target_date,
            "insight_type": f"ai_{opp.category}",
            "severity": severity_map.get(opp.category, "info"),
            "title": opp.title,
            "description": f"{opp.reasoning}\n\nAction: {opp.action}\n\nExpected Impact: {opp.expected_impact}",
            "metric_context": {
                "priority": opp.priority,
                "risk": opp.risk,
                "timeframe": opp.timeframe,
                "signals_used": opp.signals_used,
                "full_action": opp.action,
                "expected_impact": opp.expected_impact,
            },
        }
        for opp in opportunities
    ]
