import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_ADS_REFRESH_TOKEN;
const DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
const LOGIN_CUSTOMER_ID = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "9786800965";
const CUSTOMER_ID = process.env.GOOGLE_ADS_CUSTOMER_IDS || "9786800965";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://localhost:5432/perf_marketing",
});

async function getAccessToken(): Promise<string> {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      refresh_token: REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function queryGoogleAds(accessToken: string, query: string): Promise<any[]> {
  const formattedId = CUSTOMER_ID.replace(/-/g, "").padStart(10, "0");
  const resp = await fetch(
    `https://googleads.googleapis.com/v19/customers/${formattedId}/googleAds:search`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "developer-token": DEVELOPER_TOKEN!,
        "login-customer-id": LOGIN_CUSTOMER_ID.replace(/-/g, "").padStart(10, "0"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, pageSize: 1000 }),
    }
  );
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Google Ads API ${resp.status}: ${err.slice(0, 300)}`);
  }
  const result = await resp.json();
  return result.results || [];
}

export async function GET(request: NextRequest) {
  if (!REFRESH_TOKEN || !CLIENT_ID) {
    return NextResponse.json({ error: "Google Ads credentials not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const product = searchParams.get("product") || "rize";
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const lookback = parseInt(searchParams.get("lookback") || "14");

  const end = dateTo || new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const start = dateFrom || new Date(Date.now() - lookback * 86400000).toISOString().split("T")[0];

  const campaignFilter: Record<string, string> = {
    rize: "Rize",
    domestic_pg: "RPSME",
    cards: "RPIPC",
  };
  const filter = campaignFilter[product] || "Rize";

  try {
    const accessToken = await getAccessToken();

    const query = `
      SELECT
        campaign.name,
        campaign.id,
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.ctr,
        metrics.average_cpc,
        segments.date
      FROM campaign
      WHERE segments.date >= '${start}' AND segments.date <= '${end}'
        AND campaign.name LIKE '%${filter}%'
        AND campaign.status = 'ENABLED'
      ORDER BY metrics.cost_micros DESC
    `;

    const rows = await queryGoogleAds(accessToken, query);

    // Also get backend leads/payments from PostgreSQL
    const backendResult = await pool.query(`
      SELECT c.campaign_name, SUM(p.backend_leads) as leads, SUM(p.backend_payments) as payments
      FROM daily_campaign_performance p
      JOIN campaigns c ON c.id = p.campaign_id
      WHERE p.platform != 'meta' AND p.business_id = $1
        AND p.date >= $2 AND p.date <= $3
      GROUP BY c.campaign_name
    `, [product === "rize" ? "rize" : "eb", start, end]);
    const backendMap: Record<string, { leads: number; payments: number }> = {};
    for (const row of backendResult.rows) {
      backendMap[row.campaign_name] = { leads: parseInt(row.leads) || 0, payments: parseInt(row.payments) || 0 };
    }

    // Aggregate by campaign
    const campaignMap: Record<string, any> = {};
    for (const row of rows) {
      const name = row.campaign?.name || "";
      if (!campaignMap[name]) {
        campaignMap[name] = { campaign_name: name, campaign_id: row.campaign?.id, spend: 0, impressions: 0, clicks: 0, conversions: 0 };
      }
      campaignMap[name].spend += (row.metrics?.costMicros || 0) / 1000000;
      campaignMap[name].impressions += parseInt(row.metrics?.impressions || "0");
      campaignMap[name].clicks += parseInt(row.metrics?.clicks || "0");
      campaignMap[name].conversions += parseFloat(row.metrics?.conversions || "0");
    }

    // Merge backend data
    for (const [name, backend] of Object.entries(backendMap)) {
      if (campaignMap[name]) {
        campaignMap[name].leads = backend.leads;
        campaignMap[name].payments = backend.payments;
      } else {
        campaignMap[name] = { campaign_name: name, campaign_id: null, spend: 0, impressions: 0, clicks: 0, conversions: 0, leads: backend.leads, payments: backend.payments };
      }
    }

    const campaigns = Object.values(campaignMap).map((c: any) => ({
      ...c,
      leads: c.leads || 0,
      payments: c.payments || 0,
      cpc: c.clicks > 0 ? c.spend / c.clicks : null,
      cpl: (c.leads || 0) > 0 ? c.spend / c.leads : null,
      cpp: (c.payments || 0) > 0 ? c.spend / c.payments : null,
      ctr: c.impressions > 0 ? c.clicks / c.impressions : null,
      l2p_rate: (c.leads || 0) > 0 ? (c.payments || 0) / c.leads : null,
    })).sort((a: any, b: any) => b.spend - a.spend);

    const summary = {
      campaign_count: campaigns.length,
      total_spend: campaigns.reduce((s: number, c: any) => s + c.spend, 0),
      total_impressions: campaigns.reduce((s: number, c: any) => s + c.impressions, 0),
      total_clicks: campaigns.reduce((s: number, c: any) => s + c.clicks, 0),
      total_leads: campaigns.reduce((s: number, c: any) => s + (c.leads || 0), 0),
      total_payments: campaigns.reduce((s: number, c: any) => s + (c.payments || 0), 0),
      cpl: null as number | null,
      cpp: null as number | null,
      ctr: null as number | null,
      l2p_rate: null as number | null,
      click_to_lead: null as number | null,
    };
    summary.cpl = summary.total_leads > 0 ? summary.total_spend / summary.total_leads : null;
    summary.cpp = summary.total_payments > 0 ? summary.total_spend / summary.total_payments : null;
    summary.ctr = summary.total_impressions > 0 ? summary.total_clicks / summary.total_impressions : null;
    summary.l2p_rate = summary.total_leads > 0 ? summary.total_payments / summary.total_leads : null;
    summary.click_to_lead = summary.total_clicks > 0 ? summary.total_leads / summary.total_clicks : null;

    return NextResponse.json({ summary, campaigns, period: { start, end } });
  } catch (error: any) {
    console.error("Google Ads API Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
