# Project MJ MARVIZ — Multi-Product Performance Marketing Dashboard

## Overview
AI-powered performance marketing command center that stitches Google Ads spend data with backend conversion metrics across multiple products. Features an autonomous AI brain that acts as an independent performance marketer — analyzing campaigns, suggesting optimizations, learning from outcomes, and running weekly audits.

**Stack:** Next.js 14 + PostgreSQL + Google Ads API + DataGaaru (Trino) + Claude AI  
**URL:** http://localhost:3000/dashboard

---

## Products Supported

| Product | Campaign Identifier | Funnel | Backend Source |
|---------|-------------------|--------|----------------|
| Domestic PG | `RPSME` or `RPHQL` | Signups → L2 → New MTU | `merchant_fact_hourly_incremental` |
| Rize | `RIZE` / `RRize` | Leads → Payments (incorporation) | `rize_perf_marketing_dashboard_v1` |
| Cards International | `RPIPC` | Signups → L2 → MTU | `merchant_fact_hourly_incremental` |

---

## Quick Start

```bash
# 1. Install dependencies
cd packages/web && npm install

# 2. Create .env.local (copy from .env.example and fill in credentials)
cp .env.example .env.local

# 3. Start PostgreSQL
/opt/homebrew/opt/postgresql@16/bin/pg_ctl -D /opt/homebrew/var/postgresql@16 start

# 4. Create database and run migrations
createdb perf_marketing
psql -d perf_marketing -f supabase/migrations/001_create_tables.sql
psql -d perf_marketing -f supabase/migrations/002_create_views.sql
psql -d perf_marketing -f supabase/migrations/003_create_functions.sql

# 5. Start the dashboard
npx next dev -p 3000

# 6. Open
open http://localhost:3000/dashboard
```

---

## Required Credentials (.env.local)

```env
# Google Ads API
GOOGLE_ADS_DEVELOPER_TOKEN=<your token>
GOOGLE_ADS_CLIENT_ID=<oauth client id>
GOOGLE_ADS_CLIENT_SECRET=<oauth client secret>
GOOGLE_ADS_REFRESH_TOKEN=<oauth refresh token>
GOOGLE_ADS_LOGIN_CUSTOMER_ID=9786800965
GOOGLE_ADS_CUSTOMER_IDS=9786800965

# LLM Gateway (for AI Brain)
ANTHROPIC_API_KEY=<razorpay llm gateway key>
ANTHROPIC_BASE_URL=https://llm-gateway.razorpay.com
ANTHROPIC_CUSTOM_HEADERS=x-litellm-api-key: Bearer <key>

# Database
DATABASE_URL=postgresql://localhost:5432/perf_marketing
```

---

## Dashboard Tabs

| Tab | What It Shows |
|-----|---------------|
| **Overall** | Product funnel (all channels vs PM), KPI cards, attribution funnel viz, campaign table with CPC/CTR |
| **Overview** | Category-level KPI cards with efficiency grading, auto-detected insights |
| **Campaign Explorer** | Full campaign table with daily breakdowns, search, sort |
| **Competitive Intel** | Impression Share, Search Term Battleground, Quality Scores |
| **Custom View** | Pre-built views (Monthly Trend, WoW, Category Scorecard, Campaign Health, Funnel Leakage, Top Movers) + Build Your Own (dropdowns) + AI query |
| **Compare Periods** | WoW, MTD, MoM, custom period comparison with delta % |
| **Trends** | Chart.js line charts by category (Spend, Conversions, CPP, CPC) |
| **Weekly Audit** | AI-generated audit: health score, highlights, lowlights, changes detected, recommendations |
| **AI Agent** | Brain Memory panel + Campaign Optimiser (categorized suggestions) + Chat |

---

## Filters

| Filter | Options |
|--------|---------|
| **Product** | Domestic PG / Rize / Cards International (top-level toggle) |
| **Category** | Brand, Generic, Competitor, PMax/Auto, App (GUAC), DemandGen |
| **Platform** | Google Search, Google PMax, Google App, Youtube, DemandGen, Meta |
| **Time Range** | 7D, 14D, MTD, Last Month, 3M, Custom (auto-anchors to latest data date) |

---

## AI Brain — Campaign Optimiser

The brain acts as an autonomous performance marketer:

### What It Does
1. Reads campaign performance + search terms + quality scores
2. Applies playbook rules (scale/pause/shift/test thresholds per product)
3. Generates 10-15 categorized optimization suggestions
4. Learns from past actions (tracks outcomes, detects patterns)

### Suggestion Categories
- **Bidding** — budget allocation, scale up/down, pause, shift between campaigns
- **Keywords** — add negatives (wasted terms), add exact/phrase match (converting broad terms)
- **Tracking** — conversion action issues, attribution gaps
- **Creative** — ad copy, landing page (from QS data)

### Self-Learning Loop
```
Brain recommends → You click "Done" → 7 days pass →
Outcome measured (CPP before/after) → Lesson stored →
Brain reads lessons + detected patterns → Better recommendations
```

### Key Files
- `packages/pipeline/src/brain/playbook.md` — decision rules, thresholds, market benchmarks
- `packages/web/app/api/brain/route.ts` — brain API endpoint
- `packages/web/components/tabs/InsightsPanel.tsx` — action cards UI
- `packages/web/components/tabs/BrainMemoryPanel.tsx` — memory/learning UI

---

## Data Pipeline

### Google Ads (Spend Side)
```bash
cd packages/pipeline
python3 -c "
from src.google_ads.client import get_google_ads_client
from src.google_ads.fetch import fetch_campaign_metrics
client = get_google_ads_client()
rows = fetch_campaign_metrics(client, '9786800965', lookback_days=14)
# Then upsert to PostgreSQL...
"
```
- Account: MCC 9786800965 (only this one works)
- Fields: spend, impressions, clicks, conversions, impression_share, CPC, CTR

### Backend Conversions
Queried from DataGaaru (Trino) and loaded into local PostgreSQL:
- **Domestic PG**: `aggregate_pa.merchant_fact_hourly_incremental` → signups, l2, mtu by `acquisition_campaign`
- **Rize**: `aggregate_pa.rize_perf_marketing_dashboard_v1` → leads, payments by `utm_campaign`
- **Cards**: `aggregate_pa.merchant_fact_hourly_incremental` → signups, l2, mtu by `acquisition_campaign`

### Signals Cache
```bash
cd packages/pipeline
python3 fetch_live_signals.py --refresh
```
Fetches: search terms (200), quality scores (100), hourly performance, budget/bid data, device splits

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ Next.js Frontend (localhost:3000)                    │
│  ├─ app/dashboard/page.tsx (main page + routing)    │
│  ├─ components/tabs/ (all tab components)           │
│  └─ app/api/                                        │
│       ├─ /metrics         (campaign performance)    │
│       ├─ /campaigns       (campaign explorer)       │
│       ├─ /compare         (period comparison)       │
│       ├─ /competitive     (IS + search terms + QS)  │
│       ├─ /custom-view     (pre-built views)         │
│       ├─ /dynamic-view    (AI-generated SQL views)  │
│       ├─ /funnel-overview (overall vs PM funnel)    │
│       ├─ /brain           (AI Campaign Optimiser)   │
│       ├─ /audit           (weekly audit)            │
│       ├─ /memory          (brain learning system)   │
│       ├─ /health          (max data date)           │
│       └─ /agent           (AI chat)                 │
├─────────────────────────────────────────────────────┤
│ PostgreSQL (localhost:5432/perf_marketing)           │
│  ├─ daily_campaign_performance (main joined table)  │
│  ├─ daily_ad_metrics (raw Google Ads)               │
│  ├─ campaigns (registry + category/platform)        │
│  ├─ overall_funnel (all-channel totals by month)    │
│  ├─ channel_breakdown (channel contribution %)      │
│  ├─ brain_memory (actions + outcomes + lessons)     │
│  ├─ audit_history (weekly audit reports)            │
│  └─ insights (AI-generated alerts)                  │
├─────────────────────────────────────────────────────┤
│ Python Pipeline (packages/pipeline/)                │
│  ├─ src/google_ads/ (API fetch + signals)           │
│  ├─ src/brain/ (playbook + analysis)                │
│  ├─ src/db/ (upsert + refresh functions)            │
│  └─ src/parsers/ (campaign name parser)             │
├─────────────────────────────────────────────────────┤
│ External Services                                   │
│  ├─ Google Ads API (spend data)                     │
│  ├─ DataGaaru / Trino (backend conversions)         │
│  └─ Razorpay LLM Gateway (Claude for AI features)  │
└─────────────────────────────────────────────────────┘
```

---

## Key Technical Decisions

1. **Product-specific backend tables** — Rize uses its own funnel table (`rize_perf_marketing_dashboard_v1`) because "payments" means incorporation payments, not PG transactions
2. **Dynamic conversion column** — API routes use `conversionCol` (backend_mtu for PG/Cards, backend_payments for Rize) so the same SQL works for all products
3. **Time anchor** — date picker anchors to max data date (not today) via `/api/health` so presets always show available data
4. **Channel attribution** — `overall_funnel` table stores all-channel totals so we can show PM's contribution %
5. **Brain memory** — actions tracked in DB with outcome measurement after 7 days, patterns detected via Claude

---

## File Structure

```
perf-marketing-dashboard/
├── packages/
│   ├── web/                    # Next.js frontend
│   │   ├── app/
│   │   │   ├── dashboard/page.tsx      # Main page
│   │   │   └── api/                    # All API routes
│   │   ├── components/
│   │   │   ├── tabs/                   # Tab components
│   │   │   ├── cards/                  # Card components
│   │   │   └── layout/                 # Header, FilterBar, etc.
│   │   ├── lib/constants.ts            # Categories, platforms, formatters
│   │   └── styles/globals.css          # Tailwind + custom styles
│   └── pipeline/               # Python data pipeline
│       ├── src/
│       │   ├── google_ads/             # API fetch + signals
│       │   ├── brain/                  # AI analysis + playbook
│       │   ├── db/                     # PostgreSQL operations
│       │   └── parsers/                # Campaign name parser
│       └── requirements.txt
├── supabase/migrations/        # Database schema
└── .env.example                # Required credentials template
```

---

## To Refresh Data

```bash
# 1. Refresh Google Ads spend (last 14 days)
cd packages/pipeline
python3 -c "
from src.google_ads.client import get_google_ads_client
from src.google_ads.fetch import fetch_campaign_metrics
from src.db.connection import get_db
from src.db.upsert import get_campaign_id_map, refresh_daily_performance
# ... fetch and upsert (see memory docs for full script)
"

# 2. Refresh signals cache
python3 fetch_live_signals.py --refresh

# 3. Backend data loaded via DataGaaru queries
# (query merchant_fact_hourly_incremental for PG/Cards)
# (query rize_perf_marketing_dashboard_v1 for Rize)
# Then UPDATE daily_campaign_performance with results
```

---

## Contributing

- All API routes are in `packages/web/app/api/`
- UI components in `packages/web/components/tabs/`
- Brain playbook rules in `packages/pipeline/src/brain/playbook.md`
- To add a new product: add to `PRODUCT_CONFIG` in API routes + `PRODUCTS` array in dashboard page
- To add new categories: update `lib/constants.ts`
