import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const META_ADS_ACCESS_TOKEN = process.env.META_ADS_ACCESS_TOKEN;
const META_ADS_ACCOUNT_ID = process.env.META_ADS_ACCOUNT_ID || "act_2610976695640512";
const API_VERSION = "v22.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://localhost:5432/perf_marketing",
});

async function metaGet(endpoint: string, params: Record<string, string> = {}) {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.searchParams.set("access_token", META_ADS_ACCESS_TOKEN!);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const resp = await fetch(url.toString());
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Meta API ${resp.status}: ${err.slice(0, 200)}`);
  }
  return resp.json();
}

async function paginateAll(endpoint: string, params: Record<string, string> = {}) {
  let url: string | null = `${BASE_URL}/${endpoint}`;
  const allParams = { ...params, access_token: META_ADS_ACCESS_TOKEN! };
  const all: any[] = [];

  const firstUrl = new URL(url);
  for (const [k, v] of Object.entries(allParams)) firstUrl.searchParams.set(k, v);
  let resp = await fetch(firstUrl.toString());
  if (!resp.ok) throw new Error(`Meta API ${resp.status}`);
  let result = await resp.json();
  all.push(...(result.data || []));

  while (result.paging?.next) {
    resp = await fetch(result.paging.next);
    if (!resp.ok) break;
    result = await resp.json();
    all.push(...(result.data || []));
  }
  return all;
}

function classifyCampaign(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("brand")) return "brand";
  if (lower.includes("competitor") || lower.includes("comp")) return "competitor";
  if (lower.includes("retarget") || lower.includes("remarket") || lower.includes("rtg")) return "retargeting";
  if (lower.includes("lookalike") || lower.includes("lal") || lower.includes("lla")) return "lookalike";
  if (lower.includes("prospect") || lower.includes("cold")) return "prospecting";
  if (lower.includes("pmax") || lower.includes("asc") || lower.includes("advantage")) return "pmax";
  return "generic";
}

function parseActions(actions: any[]): { leads: number; conversions: number } {
  let leads = 0, conversions = 0;
  for (const a of actions) {
    const v = parseInt(a.value || "0");
    if (a.action_type === "lead" || a.action_type === "offsite_conversion.fb_pixel_lead") leads += v;
    if (["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase", "complete_registration", "offsite_conversion.fb_pixel_complete_registration"].includes(a.action_type)) conversions += v;
  }
  return { leads, conversions };
}

export async function GET(request: NextRequest) {
  if (!META_ADS_ACCESS_TOKEN) {
    return NextResponse.json({ error: "META_ADS_ACCESS_TOKEN not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "campaigns";
  const product = searchParams.get("product") || "rize";
  const lookback = parseInt(searchParams.get("lookback") || "14");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  const end = dateTo ? new Date(dateTo) : new Date();
  if (!dateTo) end.setDate(end.getDate() - 1);
  const start = dateFrom ? new Date(dateFrom) : new Date(end);
  if (!dateFrom) start.setDate(start.getDate() - lookback + 1);

  const timeRange = JSON.stringify({
    since: start.toISOString().split("T")[0],
    until: end.toISOString().split("T")[0],
  });

  const productFilters: Record<string, string> = {
    rize: "Rize",
    domestic_pg: "RPSME",
    cards: "RPIPC",
  };
  const filterValue = productFilters[product] || "Rize";

  try {
    if (action === "overall") {
      // 1. Get ad metrics from Meta API (spend, impressions, clicks)
      const insights = await paginateAll(`${META_ADS_ACCOUNT_ID}/insights`, {
        fields: "campaign_id,campaign_name,spend,impressions,clicks,actions,cost_per_action_type,cpc,ctr,reach,frequency",
        time_range: timeRange,
        time_increment: "1",
        level: "campaign",
        filtering: JSON.stringify([{ field: "campaign.name", operator: "CONTAIN", value: filterValue }]),
        limit: "500",
      });

      // 2. Get backend leads/payments from PostgreSQL (DataGaaru data)
      const backendResult = await pool.query(`
        SELECT c.campaign_name, SUM(p.backend_leads) as leads, SUM(p.backend_payments) as payments
        FROM daily_campaign_performance p
        JOIN campaigns c ON c.id = p.campaign_id
        WHERE p.platform = 'meta' AND p.business_id = $1
          AND p.date >= $2 AND p.date <= $3
        GROUP BY c.campaign_name
      `, [product === "rize" ? "rize" : "eb", start.toISOString().split("T")[0], end.toISOString().split("T")[0]]);
      const backendMap: Record<string, { leads: number; payments: number }> = {};
      for (const row of backendResult.rows) {
        backendMap[row.campaign_name] = { leads: parseInt(row.leads) || 0, payments: parseInt(row.payments) || 0 };
      }

      // 3. Merge: Meta API metrics + backend leads/payments
      const campaignMap: Record<string, any> = {};
      for (const row of insights) {
        const name = row.campaign_name;
        if (!campaignMap[name]) {
          campaignMap[name] = { campaign_name: name, campaign_id: row.campaign_id, category: classifyCampaign(name), spend: 0, impressions: 0, clicks: 0, leads: 0, conversions: 0, reach: 0 };
        }
        campaignMap[name].spend += parseFloat(row.spend || "0");
        campaignMap[name].impressions += parseInt(row.impressions || "0");
        campaignMap[name].clicks += parseInt(row.clicks || "0");
        campaignMap[name].reach += parseInt(row.reach || "0");
      }
      // Overlay backend leads/payments onto campaigns
      for (const [name, backend] of Object.entries(backendMap)) {
        if (campaignMap[name]) {
          campaignMap[name].leads = backend.leads;
          campaignMap[name].conversions = backend.payments;
        } else {
          campaignMap[name] = { campaign_name: name, campaign_id: null, category: classifyCampaign(name), spend: 0, impressions: 0, clicks: 0, leads: backend.leads, conversions: backend.payments, reach: 0 };
        }
      }

      // 4. Compute summary from merged data
      const allCampaigns = Object.values(campaignMap);
      const summary = {
        campaign_count: allCampaigns.length,
        total_spend: allCampaigns.reduce((s: number, r: any) => s + r.spend, 0),
        total_impressions: allCampaigns.reduce((s: number, r: any) => s + r.impressions, 0),
        total_clicks: allCampaigns.reduce((s: number, r: any) => s + r.clicks, 0),
        total_leads: allCampaigns.reduce((s: number, r: any) => s + r.leads, 0),
        total_conversions: allCampaigns.reduce((s: number, r: any) => s + r.conversions, 0),
        total_reach: allCampaigns.reduce((s: number, r: any) => s + r.reach, 0),
        cpl: null as number | null,
        cpp: null as number | null,
        ctr: null as number | null,
        l2p_rate: null as number | null,
        click_to_lead: null as number | null,
      };
      summary.cpl = summary.total_leads > 0 ? summary.total_spend / summary.total_leads : null;
      summary.cpp = summary.total_conversions > 0 ? summary.total_spend / summary.total_conversions : null;
      summary.ctr = summary.total_impressions > 0 ? summary.total_clicks / summary.total_impressions : null;
      summary.l2p_rate = summary.total_leads > 0 ? summary.total_conversions / summary.total_leads : null;
      summary.click_to_lead = summary.total_clicks > 0 ? summary.total_leads / summary.total_clicks : null;
      const campaigns = allCampaigns
        .map((c: any) => ({
          ...c,
          cpc: c.clicks > 0 ? c.spend / c.clicks : null,
          cpl: c.leads > 0 ? c.spend / c.leads : null,
          cpp: c.conversions > 0 ? c.spend / c.conversions : null,
          ctr: c.impressions > 0 ? c.clicks / c.impressions : null,
          l2p_rate: c.leads > 0 ? c.conversions / c.leads : null,
        }))
        .sort((a: any, b: any) => b.spend - a.spend);

      // Group by category from merged campaigns
      const categoryMap: Record<string, any> = {};
      for (const c of allCampaigns) {
        const cat = c.category;
        if (!categoryMap[cat]) {
          categoryMap[cat] = { category: cat, spend: 0, impressions: 0, clicks: 0, leads: 0, conversions: 0, campaign_count: 0 };
        }
        categoryMap[cat].spend += c.spend;
        categoryMap[cat].impressions += c.impressions;
        categoryMap[cat].clicks += c.clicks;
        categoryMap[cat].leads += c.leads;
        categoryMap[cat].conversions += c.conversions;
        categoryMap[cat].campaign_count += 1;
      }
      const categories = Object.values(categoryMap)
        .map((c: any) => ({
          ...c,
          cpc: c.clicks > 0 ? c.spend / c.clicks : null,
          cpl: c.leads > 0 ? c.spend / c.leads : null,
          cpp: c.conversions > 0 ? c.spend / c.conversions : null,
          ctr: c.impressions > 0 ? c.clicks / c.impressions : null,
          l2p_rate: c.leads > 0 ? c.conversions / c.leads : null,
        }))
        .sort((a: any, b: any) => b.spend - a.spend);

      return NextResponse.json({
        summary,
        campaigns,
        categories,
        period: { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] },
      });
    }

    if (action === "campaigns") {
      const campaigns = await paginateAll(`${META_ADS_ACCOUNT_ID}/campaigns`, {
        fields: "id,name,status,objective,daily_budget,lifetime_budget,start_time",
        filtering: JSON.stringify([{ field: "name", operator: "CONTAIN", value: filterValue }]),
        limit: "100",
      });
      return NextResponse.json({ campaigns, account_id: META_ADS_ACCOUNT_ID });
    }

    if (action === "insights") {
      const insights = await paginateAll(`${META_ADS_ACCOUNT_ID}/insights`, {
        fields: "campaign_id,campaign_name,spend,impressions,clicks,actions,cost_per_action_type,cpc,ctr,reach,frequency",
        time_range: timeRange,
        time_increment: "1",
        level: "campaign",
        filtering: JSON.stringify([{ field: "campaign.name", operator: "CONTAIN", value: filterValue }]),
        limit: "500",
      });

      const transformed = insights.map((row: any) => {
        const { leads, conversions } = parseActions(row.actions || []);
        return {
          date: row.date_start,
          campaign_id: row.campaign_id,
          campaign_name: row.campaign_name,
          spend: parseFloat(row.spend || "0"),
          impressions: parseInt(row.impressions || "0"),
          clicks: parseInt(row.clicks || "0"),
          leads,
          conversions,
          cpc: parseFloat(row.cpc || "0"),
          ctr: parseFloat(row.ctr || "0"),
          reach: parseInt(row.reach || "0"),
          frequency: parseFloat(row.frequency || "0"),
          platform: "meta",
        };
      });

      return NextResponse.json({ insights: transformed, period: { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] } });
    }

    if (action === "account") {
      const account = await metaGet(META_ADS_ACCOUNT_ID, {
        fields: "id,name,account_status,currency,business_name,amount_spent,balance",
      });
      return NextResponse.json({ account });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: any) {
    console.error("Meta API Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
