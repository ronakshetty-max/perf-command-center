# Performance Command Center

AI-powered unified performance marketing dashboard for Razorpay — stitches Google Ads + Meta Ads spend data with backend conversion metrics from DataGaaru (Trino), powered by a voice AI agent (Marviz Mark II).

## Live Demo

```bash
cd packages/web && npm install && npx next dev -p 3000
# Open http://localhost:3000/dashboard
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Next.js Dashboard (localhost:3000)                           │
│  ├─ /dashboard          Main dashboard with source selector │
│  ├─ /dynamic-view.html  Role-based view (Int/Mgr/Lead)     │
│  └─ /api/                                                   │
│       ├─ /metrics       PostgreSQL (DataGaaru backend data) │
│       ├─ /meta          Meta Marketing API (live spend)     │
│       └─ /google-ads    Google Ads API (live spend)         │
├─────────────────────────────────────────────────────────────┤
│ Marviz Mark II (localhost:8000)                             │
│  Voice/text AI agent — Claude tool-calling over ads APIs    │
│  Browser mic → Gemini STT → Claude → live metrics push     │
├─────────────────────────────────────────────────────────────┤
│ Data Sources                                                │
│  ├─ Google Ads API    → spend, impressions, clicks          │
│  ├─ Meta Marketing API → spend, impressions, clicks         │
│  ├─ DataGaaru (Trino) → backend leads, payments (ground    │
│  │                       truth from rize_perf_marketing)    │
│  └─ PostgreSQL        → cached merged data                  │
└─────────────────────────────────────────────────────────────┘
```

## Features

- **Source Selector**: All | Google Ads | Meta — switch between platforms
- **Dynamic View Tab**: Role-based dashboards (Internal/Manager/Leadership) with graphic/table toggle
- **Live Data**: Spend from ad platform APIs + backend conversions from DataGaaru
- **Voice Agent**: Ask questions naturally — "What's my ROAS?", "Show top campaigns"
- **Funnel Visualization**: Impressions → Clicks → Leads → Payments with conversion rates
- **Campaign Table**: Sortable by spend, leads, payments, CPP, L2P rate

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL (local)
- Python 3.9+ (for Marviz voice agent)

### 1. Dashboard

```bash
cd packages/web
npm install
cp ../../.env.example .env.local  # Fill in credentials
npx next dev -p 3000
```

### 2. Database

```bash
createdb perf_marketing
psql -d perf_marketing -f supabase/migrations/001_create_tables.sql
psql -d perf_marketing -f supabase/migrations/002_create_views.sql
psql -d perf_marketing -f supabase/migrations/003_create_functions.sql
```

### 3. Voice Agent (Marviz)

See `/marviz-mark-ii/README.md` for full setup.

```bash
cd marviz-mark-ii
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Fill in Anthropic + Google + Meta credentials
uvicorn app:app --port 8000
```

### 4. Data Refresh (DataGaaru → PostgreSQL)

```bash
cd packages/pipeline
# Uses DataGaaru MCP or direct Trino queries
# See docs in perf-dashboard-docs.md
```

## Required Credentials (.env.local)

```env
# Google Ads API
GOOGLE_ADS_DEVELOPER_TOKEN=<your token>
GOOGLE_ADS_CLIENT_ID=<oauth client id>
GOOGLE_ADS_CLIENT_SECRET=<oauth client secret>
GOOGLE_ADS_REFRESH_TOKEN=<oauth refresh token>
GOOGLE_ADS_LOGIN_CUSTOMER_ID=<MCC account id>

# Meta Ads
META_ADS_ACCESS_TOKEN=<marketing api token>
META_ADS_ACCOUNT_ID=act_<digits>

# Database
DATABASE_URL=postgresql://localhost:5432/perf_marketing

# LLM (for AI features)
ANTHROPIC_API_KEY=<key>
```

## Products Supported

| Product | Backend Source | Funnel |
|---------|--------------|--------|
| Rize | `rize_perf_marketing_dashboard_v1` | Leads → Payments |
| Domestic PG | `merchant_fact_hourly_incremental` | Signups → L2 → MTU |

## MCP Integrations

- **DataGaaru MCP** — queries Trino for backend conversions
- **Google Ads MCP** — official `github.com/googleads/google-ads-mcp`
- **Meta Ads MCP** — custom Node.js server for Marketing API

## Tech Stack

- **Frontend**: Next.js 14 + Tailwind CSS + Chart.js
- **Backend**: PostgreSQL + Python pipelines
- **AI**: Claude (tool-calling agent) + Gemini (speech-to-text)
- **APIs**: Google Ads REST API v25, Meta Marketing API v22
