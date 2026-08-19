-- Performance Marketing Dashboard Schema

-- Business registry
CREATE TABLE businesses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  primary_conversion TEXT NOT NULL,
  funnel_stages JSONB NOT NULL,
  cpp_cap NUMERIC(12,2),
  phase INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO businesses (id, name, currency, primary_conversion, funnel_stages, cpp_cap, phase) VALUES
  ('rize', 'Rize', 'INR', 'payment', '["lead","payment"]', 2700, 1),
  ('curlec', 'Curlec', 'MYR', 'mtu', '["signup","l2","activated","mtu"]', NULL, 1),
  ('crossborder', 'Crossborder', 'INR', 'l2', '["signup","l2"]', NULL, 2),
  ('eb', 'EB', 'INR', 'l2', '["signup","l2"]', NULL, 2);

-- Google Ads / Meta accounts
CREATE TABLE ad_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'google',
  businesses TEXT[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Campaign registry (auto-parsed from campaign names)
CREATE TABLE campaigns (
  id SERIAL PRIMARY KEY,
  campaign_name TEXT NOT NULL UNIQUE,
  campaign_id_external TEXT,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  platform TEXT NOT NULL,
  category TEXT NOT NULL,
  sub_category TEXT,
  device_target TEXT DEFAULT 'all',
  audience_type TEXT,
  objective TEXT,
  geo TEXT DEFAULT 'India',
  ad_account_id TEXT REFERENCES ad_accounts(id),
  is_active BOOLEAN DEFAULT TRUE,
  first_seen DATE,
  last_seen DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_campaigns_business ON campaigns(business_id);
CREATE INDEX idx_campaigns_category ON campaigns(category);
CREATE INDEX idx_campaigns_platform ON campaigns(platform);
CREATE INDEX idx_campaigns_active ON campaigns(is_active) WHERE is_active = TRUE;

-- Daily campaign metrics from Google Ads
CREATE TABLE daily_ad_metrics (
  id BIGSERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
  date DATE NOT NULL,
  device TEXT,
  -- Spend & volume
  spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  -- Reported conversions (from ad platform)
  reported_conversions NUMERIC(10,2) DEFAULT 0,
  reported_conversion_value NUMERIC(12,2) DEFAULT 0,
  -- Competitive
  impression_share NUMERIC(5,4),
  top_impression_share NUMERIC(5,4),
  search_lost_is_budget NUMERIC(5,4),
  search_lost_is_rank NUMERIC(5,4),
  -- Computed at ingest
  cpc NUMERIC(10,2),
  cpm NUMERIC(10,2),
  ctr NUMERIC(8,6),
  -- Source
  source TEXT DEFAULT 'google_ads_api',
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, date, device)
);

CREATE INDEX idx_daily_metrics_date ON daily_ad_metrics(date);
CREATE INDEX idx_daily_metrics_campaign_date ON daily_ad_metrics(campaign_id, date);

-- Backend conversion data (from Tableau)
CREATE TABLE daily_backend_metrics (
  id BIGSERIAL PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  campaign_id INTEGER REFERENCES campaigns(id),
  campaign_name_raw TEXT NOT NULL,
  date DATE NOT NULL,
  device TEXT,
  -- Funnel metrics (varies by business)
  leads INTEGER DEFAULT 0,
  signups INTEGER DEFAULT 0,
  l2 INTEGER DEFAULT 0,
  activated INTEGER DEFAULT 0,
  payments INTEGER DEFAULT 0,
  mtu INTEGER DEFAULT 0,
  -- Source
  source TEXT DEFAULT 'tableau_api',
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_name_raw, date, device)
);

CREATE INDEX idx_backend_date ON daily_backend_metrics(date);
CREATE INDEX idx_backend_campaign ON daily_backend_metrics(campaign_id, date);
CREATE INDEX idx_backend_business ON daily_backend_metrics(business_id, date);

-- Joined daily performance (the dashboard reads from this)
CREATE TABLE daily_campaign_performance (
  id BIGSERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
  business_id TEXT NOT NULL REFERENCES businesses(id),
  category TEXT NOT NULL,
  platform TEXT NOT NULL,
  date DATE NOT NULL,
  device TEXT,
  -- Ad platform metrics
  spend NUMERIC(12,2) DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  reported_conversions NUMERIC(10,2) DEFAULT 0,
  impression_share NUMERIC(5,4),
  cpc NUMERIC(10,2),
  ctr NUMERIC(8,6),
  -- Backend metrics
  backend_leads INTEGER DEFAULT 0,
  backend_payments INTEGER DEFAULT 0,
  backend_l2 INTEGER DEFAULT 0,
  backend_mtu INTEGER DEFAULT 0,
  -- Derived metrics
  cpl_reported NUMERIC(10,2),
  cpl_backend NUMERIC(10,2),
  cpp_reported NUMERIC(10,2),
  cpp_backend NUMERIC(10,2),
  l2p_rate NUMERIC(8,6),
  cpp_vs_cap NUMERIC(8,4),
  UNIQUE(campaign_id, date, device)
);

CREATE INDEX idx_perf_date ON daily_campaign_performance(date);
CREATE INDEX idx_perf_biz_cat_date ON daily_campaign_performance(business_id, category, date);
CREATE INDEX idx_perf_biz_date ON daily_campaign_performance(business_id, date);

-- Auto-generated insights
CREATE TABLE insights (
  id SERIAL PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  campaign_id INTEGER REFERENCES campaigns(id),
  category TEXT,
  date DATE NOT NULL,
  insight_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  metric_context JSONB,
  is_acknowledged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_insights_business_date ON insights(business_id, date);
CREATE INDEX idx_insights_type ON insights(insight_type);

-- Performance targets (configurable caps)
CREATE TABLE performance_targets (
  id SERIAL PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  category TEXT,
  metric TEXT NOT NULL,
  target_value NUMERIC(12,2) NOT NULL,
  threshold_warning NUMERIC(12,2),
  threshold_critical NUMERIC(12,2),
  effective_from DATE NOT NULL,
  effective_to DATE,
  UNIQUE(business_id, category, metric, effective_from)
);

-- Monthly budget targets
CREATE TABLE monthly_targets (
  id SERIAL PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  month DATE NOT NULL,
  budget_target NUMERIC(12,2),
  payment_target INTEGER,
  cpp_cap NUMERIC(12,2),
  UNIQUE(business_id, month)
);

-- Pipeline sync log
CREATE TABLE sync_log (
  id SERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  records_fetched INTEGER DEFAULT 0,
  records_upserted INTEGER DEFAULT 0,
  date_range_start DATE,
  date_range_end DATE,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);
