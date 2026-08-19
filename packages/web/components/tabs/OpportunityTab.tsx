"use client";

interface Props {
  filters: { business: string; categories: string[]; platform: string; device: string };
}

interface Opportunity {
  priority: number;
  category: string;
  campaign: string;
  title: string;
  reasoning: string;
  action: string;
  expected_impact: string;
  risk: string;
  timeframe: string;
  signals_used: string[];
}

const DEMO_OPPORTUNITIES: Opportunity[] = [
  {
    priority: 1,
    category: "scale",
    campaign: "IncorpTypes",
    title: "Increase IncorpTypes daily budget from ₹18K to ₹25K — capturing only 52% of available impressions",
    reasoning: "IS is 52% with 28% lost to budget constraints. Competitors (IndiaFilings at 38% IS, ClearTax at 25% IS) are absorbing your lost traffic. Your CPP (₹2,109) is 22% below the ₹2,700 cap, giving you room to absorb CPC inflation from higher bids. L2P has been stable at 18.1% for 4 weeks — quality holds at scale.",
    action: "Increase daily budget from ₹18,500 to ₹25,000. Do NOT change bids — let the budget uncap naturally. Monitor for 5 days. If CPP stays under ₹2,400, push to ₹30K.",
    expected_impact: "+15-20 payments/week at ₹2,200-2,400 CPP. Monthly: +60-80 incremental payments.",
    risk: "CPC may rise 5-10% as you enter more competitive auctions. If CPP crosses ₹2,500 within first week, revert to ₹20K. Watch for quality score drops on expanded queries.",
    timeframe: "immediate",
    signals_used: ["impression_share (52%)", "lost_is_budget (28%)", "auction_insights (IndiaFilings overlap 62%)", "quality_score stable", "L2P holding at 18.1%", "backend CPP ₹2,109 vs cap ₹2,700"],
  },
  {
    priority: 2,
    category: "fix",
    campaign: "Meta_Payments",
    title: "URGENT: Meta payment conversion event broken — ₹29K spent with 0 tracked conversions in 5 days",
    reasoning: "The payment event pixel stopped firing around Jul 31. Meta's algorithm is now optimizing blind — it has no signal to learn from. Meanwhile ₹5,800/day is being spent against a broken feedback loop. The longer this persists, the more the algorithm degrades. IntAud and WebVisitors campaigns are also affected downstream as Meta loses payment signal across the account.",
    action: "1) Check Meta Events Manager → Test Events → verify 'Purchase' event fires on payment page. 2) If pixel is present but not firing: check if the payment confirmation page URL changed. 3) If code issue: redeploy pixel with Conversions API (CAPI) as backup. 4) PAUSE Meta_Payments campaign immediately until event is verified — saves ₹5.8K/day.",
    expected_impact: "Fixing unlocks +15-20 payments/month from Meta. Every day unfixed costs ₹5.8K in wasted spend + algorithm degradation across ALL Meta campaigns.",
    risk: "If the event fix takes >1 week, consider pausing all Meta spend and reallocating to Search (which is budget-limited). Don't let a broken pixel drain budget.",
    timeframe: "immediate",
    signals_used: ["0 conversions for 5 consecutive days", "spend ₹29K with zero signal", "Meta algorithm degradation risk", "CAPI not configured as fallback"],
  },
  {
    priority: 3,
    category: "optimize",
    campaign: "Generic_Mweb",
    title: "Add 47 negative keywords from search term report — ₹18,200 wasted on non-converting queries last 14 days",
    reasoning: "Search term report shows 47 queries with 0 conversions spending ₹18,200 in 14 days. Top offenders: 'free company registration' (₹2,100, 0 conv), 'government registration portal' (₹1,800, 0 conv), 'registration form download' (₹1,400, 0 conv). These informational queries will never convert for a paid service. Generic_Mweb CPP is already ₹3,429 (27% over cap) — cleaning waste brings it down to ₹2,900.",
    action: "Add these as exact-match negatives at campaign level: [free company registration], [government registration portal], [registration form download], [company registration documents list], [how to register company in india free]... (full list of 47 terms in appendix). Estimated savings: ₹1,300/day.",
    expected_impact: "CPP drops from ₹3,429 to ~₹2,900 (-15%) by eliminating ₹40K/month in waste. No volume loss — these queries never converted.",
    risk: "Minimal. These are clearly non-commercial queries. Double-check the 3 terms with highest impressions aren't navigational queries that convert on second visit.",
    timeframe: "this_week",
    signals_used: ["search_term_report (47 zero-conv terms)", "₹18,200 waste in 14 days", "Generic_Mweb CPP 27% above cap", "all terms are informational intent"],
  },
  {
    priority: 4,
    category: "scale",
    campaign: "PMax",
    title: "Increase PMax budget by 20% weekly — algorithm has stabilized at ₹2,419 CPP after 6 weeks of learning",
    reasoning: "PMax launched 8 weeks ago. First 4 weeks were volatile (CPP ₹2,100-₹3,200). Last 4 weeks have stabilized at ₹2,350-₹2,500 range. The algorithm is now in 'learned' state. L2P improved from 8.5% to 10.7% in the last 2 weeks — it's finding better audiences. Current daily budget ₹8K is sub-scale for PMax (Google recommends 10x target CPA minimum).",
    action: "Increase budget 20% per week: ₹8K → ₹10K → ₹12K → ₹14.5K. Cap at ₹15K and hold for 2 weeks to confirm CPP stays under ₹2,600. Use conversion-based bidding (tCPA at ₹2,500).",
    expected_impact: "+18-25 payments/month at ₹2,400-2,600 CPP. PMax could become 3rd largest volume contributor by September.",
    risk: "PMax algorithms can degrade when budget is increased too fast (>30% per week). If CPP crosses ₹2,800 after any increase, hold for 2 weeks before next push. Watch for asset group fatigue (check asset performance weekly).",
    timeframe: "this_week",
    signals_used: ["CPP stability (₹2,350-₹2,500 for 4 weeks)", "L2P improving (8.5% → 10.7%)", "budget sub-scale vs Google recommendation", "device_splits show 68% of conversions from mobile (good signal diversity)"],
  },
  {
    priority: 5,
    category: "optimize",
    campaign: "IncorpTypes",
    title: "Shift 15% of budget from 10pm-6am to 9am-1pm — conversions are 3.2x cheaper during business hours",
    reasoning: "Hour-of-day data shows 64% of conversions happen 9am-5pm but only 48% of spend is allocated there. Late night (10pm-6am) gets 22% of spend but delivers only 7% of conversions at 4.8x higher CPA. The business audience (registering companies) isn't searching at midnight — those are low-intent researchers.",
    action: "Add ad schedule: reduce bids -40% for 10pm-6am. Increase bids +15% for 9am-1pm (peak conversion window). Don't fully pause nighttime — some conversions still come in. Net effect: same budget, better allocation.",
    expected_impact: "+8-12 payments/month at ZERO additional spend. Effectively reduces CPP by ₹150-200 through better time allocation.",
    risk: "Low risk — you're not cutting budget, just reallocating to higher-converting hours. If you see impression share drop during business hours after the change, it means competitors are also bidding there — increase budget instead of reverting.",
    timeframe: "this_week",
    signals_used: ["hourly_performance (9am-1pm: 3.2x conversion rate vs overnight)", "22% spend at night for 7% conversions", "B2B audience behavior pattern"],
  },
  {
    priority: 6,
    category: "cut",
    campaign: "Generic_Broad + India_Generic",
    title: "Reduce Generic_Broad to ₹5K/day and pause India_Generic — combined CPP ₹7,500 with declining L2P",
    reasoning: "Generic_Broad CPP is ₹10,000 (3.7x cap) with L2P at 3.8% (vs account avg 16%). India_Generic CPP is ₹6,667 with L2P at 7.5%. Both are bleeding money into low-quality leads that never convert. Quality scores are 3-4/10 on most keywords — Google is charging premium CPCs for poor relevance. Budget here would generate 3-4x more payments if moved to IncorpTypes.",
    action: "1) Generic_Broad: reduce daily budget from ₹3K to ₹1K immediately. Pause after 1 week if no improvement. 2) India_Generic: pause entirely — the ₹2K/day savings funds 1 extra payment in IncorpTypes. 3) Redirect ₹5K/day combined savings to IncorpTypes and StartUp_Dweb.",
    expected_impact: "Save ₹1.5L/month in wasted spend. Redirected budget generates +30-40 payments at ₹2,200 CPP vs the 6-8 payments these campaigns produce at ₹7,500 CPP.",
    risk: "You lose 6-8 low-quality payments per month but gain 30-40 from reallocation. Net gain: +22-32 payments. The 'generic awareness' argument doesn't hold — these audiences aren't converting downstream either (L2P proves it).",
    timeframe: "immediate",
    signals_used: ["CPP ₹10,000 and ₹6,667 (3.7x and 2.5x cap)", "L2P 3.8% and 7.5% (vs 16% avg)", "quality_score 3-4/10", "search_terms show irrelevant queries", "backend confirms low L2P (not an attribution issue)"],
  },
  {
    priority: 7,
    category: "test",
    campaign: "Brand",
    title: "Test exact-match competitor conquesting in Brand campaign — ClearTax and IndiaFilings are bidding on 'Razorpay Rize'",
    reasoning: "Auction insights show ClearTax appearing in 18% of your brand searches (overlap rate) and IndiaFilings at 12%. They're conquesting your brand terms. Your brand IS dropped from 82% to 76% over 4 weeks — this is why. Currently you're losing these clicks to competitors. A defensive bid increase on exact brand terms costs very little (brand CPCs are ₹15-25) but protects high-intent traffic.",
    action: "1) Check if competitors are showing on '[razorpay rize]' exact — run search term report for brand campaign. 2) If yes: increase brand exact bids to ensure position 1 (absolute top IS > 95%). 3) Consider adding competitor names as keywords in a separate ad group with tailored 'why choose Rize over X' messaging.",
    expected_impact: "Recover 5-8% brand IS (₹76% → ₹82%). At brand's ₹1,284 CPP, each recovered percentage point ≈ 2 payments. Net: +8-12 payments/month at ₹1,200-1,400 CPP.",
    risk: "Almost zero risk. Brand CPCs are ₹15-25 — even 2x the bid is still the cheapest traffic in the account. The only risk is triggering a bidding war, which is unlikely given the low CPCs.",
    timeframe: "next_2_weeks",
    signals_used: ["auction_insights (ClearTax 18% overlap, IndiaFilings 12%)", "brand IS declining 82% → 76%", "brand CPP ₹1,284 (lowest in account)", "competitor bidding on brand terms"],
  },
];

const categoryStyles: Record<string, { bg: string; border: string; badge: string; label: string }> = {
  scale: { bg: "bg-green-950/20", border: "border-green-800/40", badge: "bg-green-950/50 text-green-400", label: "SCALE" },
  fix: { bg: "bg-red-950/20", border: "border-red-800/40", badge: "bg-red-950/50 text-red-400", label: "FIX" },
  optimize: { bg: "bg-blue-950/20", border: "border-blue-800/40", badge: "bg-blue-950/50 text-blue-400", label: "OPTIMIZE" },
  cut: { bg: "bg-yellow-950/20", border: "border-yellow-800/40", badge: "bg-yellow-950/50 text-yellow-400", label: "CUT" },
  test: { bg: "bg-purple-950/20", border: "border-purple-800/40", badge: "bg-purple-950/50 text-purple-400", label: "TEST" },
};

const timeframeLabels: Record<string, { text: string; color: string }> = {
  immediate: { text: "Do Today", color: "text-red-400" },
  this_week: { text: "This Week", color: "text-yellow-400" },
  next_2_weeks: { text: "Next 2 Weeks", color: "text-blue-400" },
  next_month: { text: "Next Month", color: "text-text-muted" },
};

export default function OpportunityTab({ filters }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-white">AI Marketing Brain — Opportunities</h2>
          <p className="text-text-muted text-[0.8rem]">Powered by Claude | Analyzes: auction insights, search terms, quality scores, bids, device splits, hourly patterns, backend conversions</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[0.7rem] text-text-dimmed">Last analysis: 2h ago</span>
          <button className="filter-chip filter-chip-active text-[0.72rem]">Re-analyze</button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="card p-3 mb-4 flex gap-4 flex-wrap items-center text-[0.78rem]">
        <span className="text-text-dimmed font-semibold">SIGNALS ANALYZED:</span>
        <span className="text-text-secondary">Auction Insights (42 competitors)</span>
        <span className="text-border-medium">|</span>
        <span className="text-text-secondary">Search Terms (200 queries)</span>
        <span className="text-border-medium">|</span>
        <span className="text-text-secondary">Quality Scores (100 keywords)</span>
        <span className="text-border-medium">|</span>
        <span className="text-text-secondary">Hourly Data (14 days)</span>
        <span className="text-border-medium">|</span>
        <span className="text-text-secondary">Device Splits</span>
        <span className="text-border-medium">|</span>
        <span className="text-text-secondary">Backend Payments (Tableau)</span>
      </div>

      {/* Opportunities */}
      <div className="space-y-4">
        {DEMO_OPPORTUNITIES.map((opp, i) => {
          const style = categoryStyles[opp.category] || categoryStyles.optimize;
          const tf = timeframeLabels[opp.timeframe] || timeframeLabels.next_month;

          return (
            <div key={i} className={`${style.bg} border ${style.border} rounded-xl p-5`}>
              {/* Header */}
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-white font-bold text-lg w-7 h-7 flex items-center justify-center bg-white/10 rounded-full text-sm">
                    {opp.priority}
                  </span>
                  <span className={`text-[0.66rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${style.badge}`}>
                    {style.label}
                  </span>
                  <span className="text-[0.76rem] text-text-muted">{opp.campaign}</span>
                </div>
                <span className={`text-[0.72rem] font-semibold ${tf.color}`}>{tf.text}</span>
              </div>

              {/* Title */}
              <h3 className="text-[0.92rem] font-semibold text-white mb-3">{opp.title}</h3>

              {/* Reasoning */}
              <p className="text-[0.8rem] text-text-secondary mb-4 leading-relaxed">{opp.reasoning}</p>

              {/* Action + Impact */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div className="bg-black/20 rounded-lg p-3">
                  <div className="text-[0.68rem] text-text-dimmed uppercase font-semibold mb-1">ACTION</div>
                  <p className="text-[0.78rem] text-text-secondary">{opp.action}</p>
                </div>
                <div className="bg-black/20 rounded-lg p-3">
                  <div className="text-[0.68rem] text-text-dimmed uppercase font-semibold mb-1">EXPECTED IMPACT</div>
                  <p className="text-[0.78rem] text-green-400 font-medium">{opp.expected_impact}</p>
                  <div className="text-[0.68rem] text-text-dimmed uppercase font-semibold mt-2 mb-1">RISK</div>
                  <p className="text-[0.74rem] text-text-muted">{opp.risk}</p>
                </div>
              </div>

              {/* Signals used */}
              <div className="flex flex-wrap gap-1.5">
                {opp.signals_used.map((signal, j) => (
                  <span key={j} className="text-[0.66rem] bg-white/5 border border-white/10 rounded px-2 py-0.5 text-text-muted">
                    {signal}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
