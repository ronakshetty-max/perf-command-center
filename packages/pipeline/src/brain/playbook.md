# Performance Marketing Playbook — Decision Framework

## Product Thresholds

### Domestic PG (RPSME + RPHQL)
- Funnel: Signups → L2 → New MTU
- Target CP-MTU: ₹3,500
- Target CPS (Cost per Signup): ₹350
- Target L2 Rate (L2/Signups): 40%+
- Target MTU Rate (MTU/L2): 12%+
- Category caps: Brand ₹2,500 | Generic ₹4,000 | Competitor ₹5,000 | PMax ₹3,500 | App ₹4,000

### Rize
- Funnel: Leads → Payments
- Target CPP (Cost per Payment): ₹2,700
- Target CPL (Cost per Lead): ₹400
- Target L2P Rate: 15%+
- Category caps: Brand ₹2,000 | High-Intent ₹3,000 | Generic ₹2,700 | Competitor ₹4,000 | Retargeting ₹4,000 | PMax ₹2,700

### Cards International (RPIPC)
- Funnel: Signups → L2 → MTU
- Target CP-MTU: ₹8,000 (higher ticket, lower volume)
- Target CPS: ₹800
- Target L2 Rate: 45%+
- Target MTU Rate: 15%+

## Decision Rules

### SCALE (increase budget 20-50%)
Conditions (ALL must be true):
- CP-MTU/CPP < 70% of category cap
- Impression Share < 80% (room to grow)
- Campaign has been running 7+ days (not too new)
- Daily spend > ₹5,000 (not a test campaign)
Expected: 20-40% more volume at similar efficiency

### PAUSE (zero budget immediately)
Conditions (ANY is sufficient):
- Zero conversions for 5+ consecutive days AND spend > ₹20,000 in that period
- CP-MTU/CPP > 200% of cap for 7+ consecutive days
- Quality Score dropped to 1-2 with no recovery path
- Search terms showing 80%+ irrelevant queries

### SHIFT BUDGET (reallocate from A to B)
Conditions:
- Campaign A and B are in same category/product
- A's CP-MTU is 2x+ worse than B's
- B has IS < 70% (can absorb more spend)
- Shift amount: min(A's daily spend × 50%, B's headroom based on IS gap)

### TEST (new experiment)
Triggers:
- A keyword theme with high volume but no dedicated campaign
- Quality Score degradation suggesting landing page mismatch
- Competitor gaining IS rapidly (>10pp in 7 days)
- Device split showing 3x+ efficiency difference → device-specific campaign
Budget: 10% of category daily spend, min 7 days

### FIX (technical/operational)
Triggers:
- Tracking discrepancy: Google conversions ≠ backend conversions (>30% gap)
- Budget capping: campaign hitting daily cap before 6pm IST
- Bid strategy mismatch: using tCPA on campaign with <15 conversions/week
- Quality Score dropping: investigate landing page, ad relevance

## Market Benchmarks (India Fintech/SaaS B2B, 2024-2026)

### Google Search
- Brand CPC: ₹15-35
- Generic/Category CPC: ₹80-200
- Competitor CPC: ₹100-300
- Average CTR (Search): Brand 8-15%, Generic 2-5%, Competitor 3-6%
- Typical L2P/L2MTU: 8-18% (depends on funnel complexity)

### Performance Max
- Average CPC: ₹30-80
- Typical conversion rate: 2-5%
- Quality of traffic: usually 20-30% lower intent than Search

### App (UAC/GUAC)
- Cost per Install: ₹30-80
- Install to Signup: 40-60%
- Effective CPS via app: ₹50-150

## Thinking Framework

When analyzing campaigns, think in this order:
1. **Where is money being wasted?** (zero-conversion campaigns, high CPP above cap, irrelevant search terms)
2. **Where is the best marginal ROI?** (next ₹1L → which campaign gives most incremental MTU)
3. **What's the competitive landscape doing?** (auction pressure changes, new entrants, IS shifts)
4. **What structural changes would unlock scale?** (new campaign types, device splits, landing page tests)
5. **What risks need mitigation?** (single-campaign dependency, QS degradation, seasonal drops)

## Output Format
Every recommendation MUST include:
- Exact campaign name(s)
- Exact numbers (spend, conversions, rates)
- Specific action with magnitude ("increase budget by ₹50K/day" not "increase budget")
- Expected impact quantified ("should yield ~15 additional MTU/week")
- Risk if we DON'T act ("losing ~₹2L/week to waste")
- Timeframe ("implement today, evaluate after 5 days")
