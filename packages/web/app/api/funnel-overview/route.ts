import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://localhost:5432/perf_marketing",
});

const PRODUCT_MAP: Record<string, { dbProduct: string; filter: string; convCol: string }> = {
  domestic_pg: { dbProduct: "domestic_pg", filter: "c.campaign_name ILIKE '%rpsme%' OR c.campaign_name ILIKE '%rphql%'", convCol: "backend_mtu" },
  rize: { dbProduct: "rize", filter: "c.campaign_name ILIKE '%rize%'", convCol: "backend_payments" },
  cards: { dbProduct: "cards", filter: "c.campaign_name ILIKE '%rpipc%'", convCol: "backend_mtu" },
};

export async function GET(request: NextRequest) {
  const product = request.nextUrl.searchParams.get("product") || "domestic_pg";
  const dateFrom = request.nextUrl.searchParams.get("dateFrom");
  const dateTo = request.nextUrl.searchParams.get("dateTo");
  const config = PRODUCT_MAP[product] || PRODUCT_MAP.domestic_pg;

  try {
    // Overall funnel (all channels) from stored data
    const overallResult = await pool.query(`
      SELECT SUM(total_leads) as total_leads, SUM(total_l2) as total_l2,
        SUM(total_conversions) as total_conversions, SUM(pm_leads) as pm_leads
      FROM overall_funnel
      WHERE product = $1
        ${dateFrom ? `AND month >= date_trunc('month', '${dateFrom}'::date)` : ""}
        ${dateTo ? `AND month <= '${dateTo}'::date` : ""}
    `, [config.dbProduct]);

    // PM attributed from campaign performance data
    const pmResult = await pool.query(`
      SELECT SUM(backend_leads) as pm_leads, SUM(backend_l2) as pm_l2, SUM(${config.convCol}) as pm_conversions,
        SUM(spend)::numeric as pm_spend
      FROM daily_campaign_performance dcp
      JOIN campaigns c ON c.id = dcp.campaign_id
      WHERE (${config.filter})
        ${dateFrom ? `AND dcp.date >= '${dateFrom}'` : ""}
        ${dateTo ? `AND dcp.date <= '${dateTo}'` : ""}
    `);

    const overall = overallResult.rows[0] || {};
    const pm = pmResult.rows[0] || {};

    const totalLeads = parseInt(overall.total_leads) || 0;
    const totalConversions = parseInt(overall.total_conversions) || 0;
    const pmLeads = parseInt(pm.pm_leads) || 0;
    const pmConversions = parseInt(pm.pm_conversions) || 0;

    // Channel breakdown
    const channelResult = await pool.query(`
      SELECT channel, leads, pct FROM channel_breakdown
      WHERE product = $1
      ORDER BY leads DESC
    `, [config.dbProduct]);

    return NextResponse.json({
      overall: {
        leads: totalLeads,
        l2: parseInt(overall.total_l2) || 0,
        conversions: totalConversions,
      },
      pm_attributed: {
        leads: pmLeads,
        l2: parseInt(pm.pm_l2) || 0,
        conversions: pmConversions,
        spend: parseFloat(pm.pm_spend) || 0,
      },
      attribution_pct: {
        leads: totalLeads > 0 ? ((pmLeads / totalLeads) * 100).toFixed(1) : "0",
        conversions: totalConversions > 0 ? ((pmConversions / totalConversions) * 100).toFixed(1) : "0",
      },
      channels: channelResult.rows,
      product,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
