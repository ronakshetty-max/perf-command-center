-- Function to refresh the joined performance table
CREATE OR REPLACE FUNCTION refresh_performance_data(
  p_start_date DATE,
  p_end_date DATE
) RETURNS INTEGER AS $$
DECLARE
  rows_affected INTEGER;
BEGIN
  -- Delete existing rows for the date range (we'll re-insert)
  DELETE FROM daily_campaign_performance
  WHERE date BETWEEN p_start_date AND p_end_date;

  -- Insert joined data
  INSERT INTO daily_campaign_performance (
    campaign_id, business_id, category, platform, date, device,
    spend, impressions, clicks, reported_conversions, impression_share, cpc, ctr,
    backend_leads, backend_payments, backend_l2, backend_mtu,
    cpl_reported, cpl_backend, cpp_reported, cpp_backend, l2p_rate, cpp_vs_cap
  )
  SELECT
    c.id AS campaign_id,
    c.business_id,
    c.category,
    c.platform,
    am.date,
    am.device,
    -- Ad metrics
    COALESCE(am.spend, 0),
    COALESCE(am.impressions, 0),
    COALESCE(am.clicks, 0),
    COALESCE(am.reported_conversions, 0),
    am.impression_share,
    am.cpc,
    am.ctr,
    -- Backend metrics
    COALESCE(bm.leads, bm.signups, 0),
    COALESCE(bm.payments, 0),
    COALESCE(bm.l2, 0),
    COALESCE(bm.mtu, 0),
    -- Derived: CPL reported
    CASE WHEN am.reported_conversions > 0
      THEN am.spend / am.reported_conversions END,
    -- Derived: CPL backend
    CASE WHEN COALESCE(bm.leads, bm.signups, 0) > 0
      THEN am.spend / COALESCE(bm.leads, bm.signups, 0) END,
    -- Derived: CPP reported
    CASE WHEN am.reported_conversions > 0
      THEN am.spend / am.reported_conversions END,
    -- Derived: CPP backend (uses payments for Rize, mtu for Curlec)
    CASE
      WHEN b.primary_conversion = 'payment' AND COALESCE(bm.payments, 0) > 0
        THEN am.spend / bm.payments
      WHEN b.primary_conversion = 'mtu' AND COALESCE(bm.mtu, 0) > 0
        THEN am.spend / bm.mtu
      WHEN b.primary_conversion = 'l2' AND COALESCE(bm.l2, 0) > 0
        THEN am.spend / bm.l2
      END,
    -- Derived: L2P rate
    CASE
      WHEN b.primary_conversion = 'payment' AND COALESCE(bm.leads, 0) > 0
        THEN COALESCE(bm.payments, 0)::NUMERIC / bm.leads
      WHEN b.primary_conversion = 'mtu' AND COALESCE(bm.signups, 0) > 0
        THEN COALESCE(bm.mtu, 0)::NUMERIC / bm.signups
      WHEN b.primary_conversion = 'l2' AND COALESCE(bm.signups, 0) > 0
        THEN COALESCE(bm.l2, 0)::NUMERIC / bm.signups
      END,
    -- Derived: CPP vs cap
    CASE WHEN b.cpp_cap IS NOT NULL AND b.cpp_cap > 0 THEN
      CASE
        WHEN b.primary_conversion = 'payment' AND COALESCE(bm.payments, 0) > 0
          THEN ((am.spend / bm.payments) - b.cpp_cap) / b.cpp_cap
        WHEN b.primary_conversion = 'mtu' AND COALESCE(bm.mtu, 0) > 0
          THEN ((am.spend / bm.mtu) - b.cpp_cap) / b.cpp_cap
        END
      END
  FROM daily_ad_metrics am
  JOIN campaigns c ON c.id = am.campaign_id
  JOIN businesses b ON b.id = c.business_id
  LEFT JOIN daily_backend_metrics bm ON (
    bm.campaign_id = c.id
    AND bm.date = am.date
    AND COALESCE(bm.device, 'all') = COALESCE(am.device, 'all')
  )
  WHERE am.date BETWEEN p_start_date AND p_end_date;

  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected;
END;
$$ LANGUAGE plpgsql;
