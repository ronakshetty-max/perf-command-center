# Performance Command Center

AI-powered unified performance marketing dashboard for Razorpay Rize — stitches **Google Ads + Meta Ads** spend data with **backend conversion metrics** from DataGaaru (Trino), powered by a **voice AI agent** (Marviz Mark II).

## Quick Start (3 commands)

```bash
git clone https://github.com/ronakshetty-max/perf-command-center.git
cd perf-command-center
bash scripts/setup.sh
```

Then: `cd packages/web && npx next dev -p 3000`

Open: **http://localhost:3000/dashboard**

> Works immediately with seeded sample data — no API credentials needed for demo mode.

---

## Two Dashboards

| URL | What | Voice Agent |
|-----|------|-------------|
| `localhost:3000/dashboard` | Main tab-based dashboard (Overall, Campaigns, Trends, Dynamic View) | Via "Dynamic View" tab |
| `localhost:3000/dynamic-view.html` | Role-based dashboard (Internal/Manager/Leadership) + voice dock | Built-in at bottom |

---

## Voice Agent (Marviz Mark II)

AI voice assistant that answers questions about ad performance naturally:

- *"What's my ROAS this week?"*
- *"Show top performing campaigns"*
- *"How much did we spend on Meta?"*

### How it works

```
Browser mic → WebSocket → FastAPI → Gemini STT → Claude tool-calling → Google Ads + Meta APIs → Live response + TTS
```

### Running the voice agent

```bash
cd marviz-mark-ii
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # Fill in credentials
uvicorn app:app --port 8000
```

The voice dock at bottom of `dynamic-view.html` connects automatically.
Standalone Marviz UI also at: **http://localhost:8000/**

### Voice Agent Credentials (`marviz-mark-ii/.env`)

```env
ANTHROPIC_API_KEY=<Claude API key>
GEMINI_API_KEY=<from aistudio.google.com/apikey>
GOOGLE_ADS_DEVELOPER_TOKEN=<from ads.google.com → API Center>
GOOGLE_ADS_CLIENT_ID=<OAuth desktop app>
GOOGLE_ADS_CLIENT_SECRET=<OAuth secret>
GOOGLE_ADS_REFRESH_TOKEN=<from get_refresh_token.py>
GOOGLE_ADS_CUSTOMER_ID=<10 digits, no dashes>
META_APP_ID=<from developers.facebook.com>
META_APP_SECRET=<app secret>
META_ACCESS_TOKEN=<Marketing API token>
META_AD_ACCOUNT_ID=act_XXXXXXXXXX
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Next.js Dashboard (localhost:3000)                           │
│  ├─ /dashboard            Main tabbed dashboard             │
│  ├─ /dynamic-view.html    Role-based + voice agent          │
│  └─ /api/                                                   │
│       ├─ /metrics         PostgreSQL (backend data)         │
│       ├─ /meta            Meta Marketing API (live)         │
│       └─ /google-ads      Google Ads API (live)             │
├─────────────────────────────────────────────────────────────┤
│ Marviz Mark II (localhost:8000)                             │
│  ├─ /ws/marviz   WebSocket (voice + text AI agent)          │
│  ├─ Gemini STT   Speech-to-text                            │
│  └─ Claude Agent  Tool-calling over ads APIs                │
├─────────────────────────────────────────────────────────────┤
│ Data Sources                                                │
│  ├─ Google Ads API     → spend, impressions, clicks         │
│  ├─ Meta Marketing API → spend, impressions, clicks         │
│  ├─ DataGaaru (Trino)  → backend leads & payments           │
│  └─ PostgreSQL         → cached merged data                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Features

### Dashboard
- **Source Selector**: All | Google Ads | Meta
- **Dynamic View**: Role-based (Internal/Manager/Leadership) + graphic/table toggle
- **Funnel Visualization**: Impressions → Clicks → Leads → Payments
- **Campaign Table**: Sortable by spend, leads, payments, CPP, L2P, share %
- **Platform Breakdown**: Charts + tables (Search / Meta / Pmax)
- **Period Comparison**: WoW and MTD with delta %
- **Trends**: Chart.js line graphs by category

### Voice Agent
- **Hold-to-talk mic** with live waveform
- **Text input** for typed queries
- **Streaming responses** with browser TTS
- **Dashboard auto-refresh** on metrics returned
- **Write actions** (disabled by default) — pause/enable campaigns with confirmation

---

## Connect Live APIs (optional)

### Dashboard Credentials (`packages/web/.env.local`)

```env
DATABASE_URL=postgresql://localhost:5432/perf_marketing

# Meta Ads
META_ADS_ACCESS_TOKEN=<Marketing API token>
META_ADS_ACCOUNT_ID=act_XXXXXXXXXX

# Google Ads
GOOGLE_ADS_DEVELOPER_TOKEN=<token>
GOOGLE_ADS_CLIENT_ID=<OAuth client>
GOOGLE_ADS_CLIENT_SECRET=<OAuth secret>
GOOGLE_ADS_REFRESH_TOKEN=<refresh token>
GOOGLE_ADS_LOGIN_CUSTOMER_ID=<MCC ID>
GOOGLE_ADS_CUSTOMER_IDS=<account ID>
```

### Getting Google Ads Refresh Token

```bash
export GOOGLE_ADS_CLIENT_ID=<your client id>
export GOOGLE_ADS_CLIENT_SECRET=<your secret>
python3 get_refresh_token.py
# Sign in with Google account that has Ads access
```

### Google Ads MCP (Official)

```bash
gcloud auth application-default login \
  --scopes="https://www.googleapis.com/auth/adwords,https://www.googleapis.com/auth/cloud-platform" \
  --client-id-file=<your_client.json>
```

---

## MCP Integrations

| MCP | Purpose |
|-----|---------|
| **DataGaaru** | Query Trino for backend leads/payments |
| **Google Ads MCP** | [github.com/googleads/google-ads-mcp](https://github.com/googleads/google-ads-mcp) |
| **Meta Ads MCP** | Custom Node.js Marketing API server |

---

## Data Ground Truth

| Source | Provides | Freshness |
|--------|----------|-----------|
| Google Ads API | Spend, clicks, impressions | Live |
| Meta Marketing API | Spend, clicks, reach | Live |
| DataGaaru (Trino) | Backend leads & payments | Via MCP refresh |
| PostgreSQL | Merged cache | On startup/refresh |

**Key table**: `hive.aggregate_pa.rize_perf_marketing_dashboard_v1`

---

## Project Structure

```
perf-command-center/
├── packages/web/                  # Next.js dashboard
│   ├── app/dashboard/page.tsx     # Main dashboard
│   ├── app/api/{metrics,meta,google-ads}/  # API routes
│   ├── components/tabs/           # Tab components
│   ├── public/dynamic-view.html   # Role-based + voice
│   └── lib/constants.ts           # Formatters
├── marviz-mark-ii/                # Voice AI agent
│   ├── app.py                     # FastAPI WebSocket server
│   ├── agent/claude_agent.py      # Claude tool-calling
│   ├── tools/{google_ads,meta_ads}.py  # API wrappers
│   ├── stt/gemini_client.py       # Speech-to-text
│   └── static/                    # Standalone voice UI
├── packages/pipeline/             # Data pipeline
├── supabase/migrations/           # DB schema
├── scripts/setup.sh               # One-command setup
├── scripts/seed_demo_data.sql     # Demo data
└── .env.example                   # Credential template
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, Tailwind CSS, Chart.js |
| Database | PostgreSQL |
| AI Agent | Claude (Anthropic) — tool-calling |
| Speech | Gemini (Google) — STT |
| Ad Platforms | Google Ads API v25, Meta Marketing API v22 |
| Data Warehouse | DataGaaru / Trino |

---

Built for **Day0 Hackathon 2026** @ Razorpay
