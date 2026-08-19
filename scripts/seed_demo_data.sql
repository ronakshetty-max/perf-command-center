-- Seed script: loads realistic sample data so the dashboard works without live API credentials.
-- Run: psql -d perf_marketing -f scripts/seed_demo_data.sql

-- Ensure businesses exist
INSERT INTO businesses (id, name, currency, primary_conversion, funnel_stages, phase)
VALUES
  ('rize', 'Rize', 'INR', 'payment', '["lead", "payment"]', 1),
  ('eb', 'EB', 'INR', 'l2', '["signup", "l2"]', 2)
ON CONFLICT (id) DO NOTHING;

-- Seed Rize campaigns (Google + Meta)
INSERT INTO campaigns (campaign_name, business_id, platform, category, first_seen, last_seen) VALUES
  ('RRize-RPPerf-GSearch-Prospect-AllDevices-WebsiteTraffic-NB-Registration-Brand', 'rize', 'google_search', 'generic', '2026-08-05', '2026-08-18'),
  ('RRize-RPPerf-GSearch-Prospect-AllDevices-WebsiteTraffic-NB-Registration-IncorpTypes', 'rize', 'google_search', 'generic', '2026-08-05', '2026-08-18'),
  ('RRize-RPPerf-G-Pmax-Prospect-AllDevices-WebsiteLead-NB-Registration', 'rize', 'google_pmax', 'generic', '2026-08-05', '2026-08-18'),
  ('RRize-RPPerf-GSearch-Prospect-WebsiteTraffic-Generic-Broad', 'rize', 'google_search', 'generic', '2026-08-05', '2026-08-18'),
  ('RRize-RPPerf-GSearch-Prospect-WebsiteTraffic-Generic-Dweb', 'rize', 'google_search', 'generic', '2026-08-05', '2026-08-18'),
  ('RRize-RPPerf-GSearch-Prospect-WebsiteTraffic-Generic-Mweb', 'rize', 'google_search', 'generic', '2026-08-05', '2026-08-18'),
  ('Rize-RPPerf-Meta-Prospect-Sales-Conv-Int_Aud-CBO', 'rize', 'meta', 'generic', '2026-08-05', '2026-08-18'),
  ('Rize-RPPerf-Meta-Prospect-Sales-Conv-WebVisitors-CBO', 'rize', 'meta', 'generic', '2026-08-05', '2026-08-18'),
  ('Rize-RPPerf-Meta-Prospect-Sales-Purch-Advant-CBO', 'rize', 'meta', 'generic', '2026-08-05', '2026-08-18')
ON CONFLICT (campaign_name) DO NOTHING;

-- Seed daily performance data (14 days, realistic numbers)
-- Google Search - Brand (top campaign)
INSERT INTO daily_campaign_performance (campaign_id, business_id, category, platform, date, device, spend, impressions, clicks, backend_leads, backend_payments, reported_conversions, cpc, ctr)
SELECT c.id, 'rize', 'generic', 'google_search', d::date, 'all',
  28000 + (random()*5000)::int, -- spend ~28-33K/day
  45000 + (random()*10000)::int, -- impressions
  800 + (random()*200)::int, -- clicks
  15 + (random()*8)::int, -- leads
  4 + (random()*5)::int, -- payments
  0, 35, 0.018
FROM campaigns c, generate_series('2026-08-05'::date, '2026-08-18'::date, '1 day') d
WHERE c.campaign_name = 'RRize-RPPerf-GSearch-Prospect-AllDevices-WebsiteTraffic-NB-Registration-Brand'
ON CONFLICT (campaign_id, date, device) DO NOTHING;

-- Google Search - IncorpTypes
INSERT INTO daily_campaign_performance (campaign_id, business_id, category, platform, date, device, spend, impressions, clicks, backend_leads, backend_payments, reported_conversions, cpc, ctr)
SELECT c.id, 'rize', 'generic', 'google_search', d::date, 'all',
  25000 + (random()*6000)::int,
  40000 + (random()*8000)::int,
  750 + (random()*250)::int,
  30 + (random()*15)::int,
  6 + (random()*4)::int,
  0, 33, 0.019
FROM campaigns c, generate_series('2026-08-05'::date, '2026-08-18'::date, '1 day') d
WHERE c.campaign_name = 'RRize-RPPerf-GSearch-Prospect-AllDevices-WebsiteTraffic-NB-Registration-IncorpTypes'
ON CONFLICT (campaign_id, date, device) DO NOTHING;

-- Google Pmax
INSERT INTO daily_campaign_performance (campaign_id, business_id, category, platform, date, device, spend, impressions, clicks, backend_leads, backend_payments, reported_conversions, cpc, ctr)
SELECT c.id, 'rize', 'generic', 'google_pmax', d::date, 'all',
  18000 + (random()*4000)::int,
  120000 + (random()*30000)::int,
  600 + (random()*150)::int,
  25 + (random()*15)::int,
  4 + (random()*3)::int,
  0, 30, 0.005
FROM campaigns c, generate_series('2026-08-05'::date, '2026-08-18'::date, '1 day') d
WHERE c.campaign_name = 'RRize-RPPerf-G-Pmax-Prospect-AllDevices-WebsiteLead-NB-Registration'
ON CONFLICT (campaign_id, date, device) DO NOTHING;

-- Google Search - Generic Broad
INSERT INTO daily_campaign_performance (campaign_id, business_id, category, platform, date, device, spend, impressions, clicks, backend_leads, backend_payments, reported_conversions, cpc, ctr)
SELECT c.id, 'rize', 'generic', 'google_search', d::date, 'all',
  12000 + (random()*3000)::int, 30000 + (random()*5000)::int, 400 + (random()*100)::int,
  18 + (random()*10)::int, 1 + (random()*2)::int, 0, 30, 0.013
FROM campaigns c, generate_series('2026-08-05'::date, '2026-08-18'::date, '1 day') d
WHERE c.campaign_name = 'RRize-RPPerf-GSearch-Prospect-WebsiteTraffic-Generic-Broad'
ON CONFLICT (campaign_id, date, device) DO NOTHING;

-- Google Search - Dweb
INSERT INTO daily_campaign_performance (campaign_id, business_id, category, platform, date, device, spend, impressions, clicks, backend_leads, backend_payments, reported_conversions, cpc, ctr)
SELECT c.id, 'rize', 'generic', 'google_search', d::date, 'all',
  10000 + (random()*3000)::int, 25000 + (random()*5000)::int, 350 + (random()*100)::int,
  14 + (random()*6)::int, 2 + (random()*3)::int, 0, 29, 0.014
FROM campaigns c, generate_series('2026-08-05'::date, '2026-08-18'::date, '1 day') d
WHERE c.campaign_name = 'RRize-RPPerf-GSearch-Prospect-WebsiteTraffic-Generic-Dweb'
ON CONFLICT (campaign_id, date, device) DO NOTHING;

-- Google Search - Mweb
INSERT INTO daily_campaign_performance (campaign_id, business_id, category, platform, date, device, spend, impressions, clicks, backend_leads, backend_payments, reported_conversions, cpc, ctr)
SELECT c.id, 'rize', 'generic', 'google_search', d::date, 'all',
  8000 + (random()*2000)::int, 20000 + (random()*5000)::int, 300 + (random()*80)::int,
  12 + (random()*6)::int, 1 + (random()*2)::int, 0, 27, 0.015
FROM campaigns c, generate_series('2026-08-05'::date, '2026-08-18'::date, '1 day') d
WHERE c.campaign_name = 'RRize-RPPerf-GSearch-Prospect-WebsiteTraffic-Generic-Mweb'
ON CONFLICT (campaign_id, date, device) DO NOTHING;

-- Meta - Interest Audience
INSERT INTO daily_campaign_performance (campaign_id, business_id, category, platform, date, device, spend, impressions, clicks, backend_leads, backend_payments, reported_conversions, cpc, ctr)
SELECT c.id, 'rize', 'generic', 'meta', d::date, 'all',
  2200 + (random()*500)::int, 28000 + (random()*5000)::int, 320 + (random()*80)::int,
  7 + (random()*5)::int, 0 + (random()*2)::int, 0, 7, 0.011
FROM campaigns c, generate_series('2026-08-05'::date, '2026-08-18'::date, '1 day') d
WHERE c.campaign_name = 'Rize-RPPerf-Meta-Prospect-Sales-Conv-Int_Aud-CBO'
ON CONFLICT (campaign_id, date, device) DO NOTHING;

-- Meta - WebVisitors
INSERT INTO daily_campaign_performance (campaign_id, business_id, category, platform, date, device, spend, impressions, clicks, backend_leads, backend_payments, reported_conversions, cpc, ctr)
SELECT c.id, 'rize', 'generic', 'meta', d::date, 'all',
  1200 + (random()*300)::int, 12000 + (random()*3000)::int, 150 + (random()*50)::int,
  4 + (random()*3)::int, 0 + (random()*1)::int, 0, 8, 0.012
FROM campaigns c, generate_series('2026-08-05'::date, '2026-08-18'::date, '1 day') d
WHERE c.campaign_name = 'Rize-RPPerf-Meta-Prospect-Sales-Conv-WebVisitors-CBO'
ON CONFLICT (campaign_id, date, device) DO NOTHING;

-- Meta - Payments focused
INSERT INTO daily_campaign_performance (campaign_id, business_id, category, platform, date, device, spend, impressions, clicks, backend_leads, backend_payments, reported_conversions, cpc, ctr)
SELECT c.id, 'rize', 'generic', 'meta', d::date, 'all',
  500 + (random()*200)::int, 5000 + (random()*2000)::int, 80 + (random()*30)::int,
  2 + (random()*2)::int, 0 + (random()*1)::int, 0, 6, 0.016
FROM campaigns c, generate_series('2026-08-05'::date, '2026-08-18'::date, '1 day') d
WHERE c.campaign_name = 'Rize-RPPerf-Meta-Prospect-Sales-Purch-Advant-CBO'
ON CONFLICT (campaign_id, date, device) DO NOTHING;

-- Done
DO $$ BEGIN RAISE NOTICE 'Demo data seeded! Dashboard will show ~₹9L spend, ~1900 leads, ~280 payments for Rize (14 days)'; END $$;
