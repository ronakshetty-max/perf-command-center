-- Category-level daily aggregation
CREATE OR REPLACE VIEW v_category_daily AS
SELECT
  business_id,
  category,
  date,
  SUM(spend) AS total_spend,
  SUM(impressions) AS total_impressions,
  SUM(clicks) AS total_clicks,
  SUM(backend_leads) AS total_leads,
  SUM(backend_payments) AS total_payments,
  SUM(backend_l2) AS total_l2,
  SUM(backend_mtu) AS total_mtu,
  CASE WHEN SUM(backend_leads) > 0
    THEN SUM(spend) / SUM(backend_leads) END AS cpl,
  CASE WHEN SUM(backend_payments) > 0
    THEN SUM(spend) / SUM(backend_payments) END AS cpp,
  CASE WHEN SUM(backend_leads) > 0
    THEN SUM(backend_payments)::NUMERIC / SUM(backend_leads) END AS l2p_rate,
  CASE WHEN SUM(clicks) > 0
    THEN SUM(spend) / SUM(clicks) END AS avg_cpc,
  CASE WHEN SUM(impressions) > 0
    THEN SUM(clicks)::NUMERIC / SUM(impressions) END AS avg_ctr,
  AVG(impression_share) AS avg_impression_share
FROM daily_campaign_performance
GROUP BY business_id, category, date;

-- Business-level daily aggregation
CREATE OR REPLACE VIEW v_business_daily AS
SELECT
  business_id,
  date,
  SUM(spend) AS total_spend,
  SUM(impressions) AS total_impressions,
  SUM(clicks) AS total_clicks,
  SUM(backend_leads) AS total_leads,
  SUM(backend_payments) AS total_payments,
  CASE WHEN SUM(backend_leads) > 0
    THEN SUM(spend) / SUM(backend_leads) END AS cpl,
  CASE WHEN SUM(backend_payments) > 0
    THEN SUM(spend) / SUM(backend_payments) END AS cpp,
  CASE WHEN SUM(backend_leads) > 0
    THEN SUM(backend_payments)::NUMERIC / SUM(backend_leads) END AS l2p_rate
FROM daily_campaign_performance
GROUP BY business_id, date;

-- Weekly aggregation by category
CREATE OR REPLACE VIEW v_category_weekly AS
SELECT
  business_id,
  category,
  DATE_TRUNC('week', date)::DATE AS week_start,
  SUM(spend) AS total_spend,
  SUM(backend_leads) AS total_leads,
  SUM(backend_payments) AS total_payments,
  CASE WHEN SUM(backend_payments) > 0
    THEN SUM(spend) / SUM(backend_payments) END AS cpp,
  CASE WHEN SUM(backend_leads) > 0
    THEN SUM(backend_payments)::NUMERIC / SUM(backend_leads) END AS l2p_rate
FROM daily_campaign_performance
GROUP BY business_id, category, DATE_TRUNC('week', date);

-- Monthly aggregation by category
CREATE OR REPLACE VIEW v_category_monthly AS
SELECT
  business_id,
  category,
  DATE_TRUNC('month', date)::DATE AS month_start,
  SUM(spend) AS total_spend,
  SUM(impressions) AS total_impressions,
  SUM(clicks) AS total_clicks,
  SUM(backend_leads) AS total_leads,
  SUM(backend_payments) AS total_payments,
  CASE WHEN SUM(backend_payments) > 0
    THEN SUM(spend) / SUM(backend_payments) END AS cpp,
  CASE WHEN SUM(backend_leads) > 0
    THEN SUM(backend_payments)::NUMERIC / SUM(backend_leads) END AS l2p_rate,
  CASE WHEN SUM(clicks) > 0
    THEN SUM(spend) / SUM(clicks) END AS avg_cpc,
  CASE WHEN SUM(impressions) > 0
    THEN SUM(clicks)::NUMERIC / SUM(impressions) END AS avg_ctr
FROM daily_campaign_performance
GROUP BY business_id, category, DATE_TRUNC('month', date);
