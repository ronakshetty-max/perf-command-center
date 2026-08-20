#!/bin/bash
# Run this daily to refresh Google Ads spend + DataGaaru backend data into PostgreSQL
# Usage: bash scripts/refresh_data.sh

echo "🔄 Refreshing data..."

echo "  [1/2] Google Ads spend (last 7 days)..."
cd /Users/ronak.shetty/Downloads/google-ads-mcp && GOOGLE_APPLICATION_CREDENTIALS="/Users/ronak.shetty/.config/gcloud/application_default_credentials.json" GOOGLE_ADS_DEVELOPER_TOKEN="hxj1QcWFEcaxABCrMUpIZg" GOOGLE_ADS_LOGIN_CUSTOMER_ID="9786800965" /Users/ronak.shetty/.local/bin/uv run --with . --with psycopg2-binary python -c "
from ads_mcp.utils import _get_googleads_client
import psycopg2
client = _get_googleads_client()
ga_service = client.get_service('GoogleAdsService')
response = ga_service.search(customer_id='9786800965', query=\"\"\"SELECT campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, segments.date FROM campaign WHERE segments.date DURING LAST_7_DAYS AND campaign.name LIKE '%Rize%' AND campaign.status = 'ENABLED'\"\"\")
conn = psycopg2.connect('postgresql://localhost:5432/perf_marketing')
cur = conn.cursor()
count=0
for row in response:
    name,dt,spend=row.campaign.name,row.segments.date,row.metrics.cost_micros/1000000
    impr,clicks=row.metrics.impressions,row.metrics.clicks
    cur.execute(\"INSERT INTO campaigns (campaign_name,business_id,platform,category,first_seen,last_seen) VALUES (%s,'rize','google_search','generic',%s,%s) ON CONFLICT (campaign_name) DO UPDATE SET last_seen=GREATEST(campaigns.last_seen,EXCLUDED.last_seen)\",(name,dt,dt))
    cur.execute('SELECT id FROM campaigns WHERE campaign_name=%s',(name,))
    cid=cur.fetchone()[0]
    cpc=spend/clicks if clicks>0 else 0
    ctr=clicks/impr if impr>0 else 0
    cur.execute(\"INSERT INTO daily_campaign_performance (campaign_id,business_id,category,platform,date,device,spend,impressions,clicks,reported_conversions,cpc,ctr) VALUES (%s,'rize','generic','google_search',%s,'all',%s,%s,%s,0,%s,%s) ON CONFLICT (campaign_id,date,device) DO UPDATE SET spend=EXCLUDED.spend,impressions=EXCLUDED.impressions,clicks=EXCLUDED.clicks,cpc=EXCLUDED.cpc,ctr=EXCLUDED.ctr\",(cid,dt,spend,impr,clicks,cpc,ctr))
    count+=1
conn.commit()
print(f'  ✅ Google Ads: {count} rows synced')
" 2>&1

echo "  [2/2] DataGaaru backend leads/payments (last 7 days)..."
cd /Users/ronak.shetty/Downloads/datagaaru-mcp && DATAGAARU_BASE_URL="https://datagaaru-assistant.ai.razorpay.in" DATAGAARU_EMAIL="ronak.shetty@razorpay.com" DATAGAARU_DATUM_TOKEN="J7ThuTFa7zk44ET" /Users/ronak.shetty/.local/bin/uv run --with psycopg2-binary python -c "
import datagaaru_mcp as dg; import psycopg2
r=dg._post('/mcp/execute-sql',{'sql_query':\"SELECT activity_date AS dt, utm_campaign, CASE WHEN LOWER(utm_campaign) LIKE '%meta%' THEN 'meta' ELSE 'google_search' END AS platform, COUNT(DISTINCT CASE WHEN event_type='Lead' THEN merchant_id END) AS leads, COUNT(DISTINCT CASE WHEN event_type IN ('Payment','M0 Payment') THEN merchant_id END) AS payments FROM hive.aggregate_pa.rize_perf_marketing_dashboard_v1 WHERE activity_date>=CURRENT_DATE-INTERVAL '7' DAY AND utm_campaign IS NOT NULL GROUP BY 1,2,3 HAVING COUNT(DISTINCT CASE WHEN event_type='Lead' THEN merchant_id END)>0 OR COUNT(DISTINCT CASE WHEN event_type IN ('Payment','M0 Payment') THEN merchant_id END)>0\"})
conn=psycopg2.connect('postgresql://localhost:5432/perf_marketing'); cur=conn.cursor(); count=0
for row in r.get('data',[]):
    campaign,dt,platform=row['utm_campaign'],row['dt'],row['platform']
    leads,payments=int(row.get('leads',0)),int(row.get('payments',0))
    cur.execute(\"INSERT INTO campaigns (campaign_name,business_id,platform,category,first_seen,last_seen) VALUES (%s,'rize',%s,'generic',%s,%s) ON CONFLICT (campaign_name) DO UPDATE SET last_seen=GREATEST(campaigns.last_seen,EXCLUDED.last_seen)\",(campaign,platform,dt,dt))
    cur.execute('SELECT id FROM campaigns WHERE campaign_name=%s',(campaign,))
    cid=cur.fetchone()[0]
    cur.execute(\"INSERT INTO daily_campaign_performance (campaign_id,business_id,category,platform,date,device,backend_leads,backend_payments,spend,impressions,clicks,reported_conversions,cpc,ctr) VALUES (%s,'rize','generic',%s,%s,'all',%s,%s,0,0,0,0,0,0) ON CONFLICT (campaign_id,date,device) DO UPDATE SET backend_leads=EXCLUDED.backend_leads,backend_payments=EXCLUDED.backend_payments\",(cid,platform,dt,leads,payments))
    count+=1
conn.commit()
print(f'  ✅ DataGaaru: {count} rows synced')
" 2>&1

echo "✅ Done! Dashboard will show fresh data."
