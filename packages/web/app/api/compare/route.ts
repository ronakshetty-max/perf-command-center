import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://localhost:5432/perf_marketing",
});

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const periodAFrom = params.get("periodA_from");
  const periodATo = params.get("periodA_to");
  const periodBFrom = params.get("periodB_from");
  const periodBTo = params.get("periodB_to");
  const groupBy = params.get("groupBy") || "category";
  const product = params.get("product") || "domestic_pg";

  if (!periodAFrom || !periodATo || !periodBFrom || !periodBTo) {
    return NextResponse.json(
      { error: "All period parameters required: periodA_from, periodA_to, periodB_from, periodB_to" },
      { status: 400 }
    );
  }

  const productConfig: Record<string, { business: string; filter: string }> = {
    domestic_pg: { business: "eb", filter: "p.campaign_id IN (SELECT id FROM campaigns WHERE campaign_name ILIKE '%rpsme%' OR campaign_name ILIKE '%rphql%')" },
    rize: { business: "rize", filter: "p.campaign_id IN (SELECT id FROM campaigns WHERE campaign_name ILIKE '%rize%')" },
    cards: { business: "crossborder", filter: "p.campaign_id IN (SELECT id FROM campaigns WHERE campaign_name ILIKE '%rpipc%')" },
  };
  const { business, filter: campaignFilter } = productConfig[product] || productConfig.domestic_pg;

  const groupCol = groupBy === "campaign" ? "c.campaign_name" : "p.category";
  const groupAlias = groupBy === "campaign" ? "campaign_name" : "category";

  try {
    const result = await pool.query(`
      WITH period_a AS (
        SELECT
          ${groupCol} as group_key,
          SUM(p.spend)::numeric as spend,
          SUM(p.impressions) as impressions,
          SUM(p.clicks) as clicks,
          SUM(p.backend_leads) as leads,
          SUM(p.backend_mtu) as payments,
          CASE WHEN SUM(p.backend_mtu) > 0
            THEN (SUM(p.spend) / SUM(p.backend_mtu))::numeric END as cpp,
          CASE WHEN SUM(p.backend_leads) > 0
            THEN (SUM(p.spend) / SUM(p.backend_leads))::numeric END as cpl,
          CASE WHEN SUM(p.backend_leads) > 0
            THEN (SUM(p.backend_mtu)::numeric / SUM(p.backend_leads)) END as l2p_rate,
          CASE WHEN SUM(p.clicks) > 0
            THEN (SUM(p.spend) / SUM(p.clicks))::numeric END as cpc,
          AVG(p.impression_share)::numeric as avg_is
        FROM daily_campaign_performance p
        JOIN campaigns c ON c.id = p.campaign_id
        WHERE p.business_id = $1 AND ${campaignFilter} AND p.date >= $2 AND p.date <= $3
        GROUP BY ${groupCol}
      ),
      period_b AS (
        SELECT
          ${groupCol} as group_key,
          SUM(p.spend)::numeric as spend,
          SUM(p.impressions) as impressions,
          SUM(p.clicks) as clicks,
          SUM(p.backend_leads) as leads,
          SUM(p.backend_mtu) as payments,
          CASE WHEN SUM(p.backend_mtu) > 0
            THEN (SUM(p.spend) / SUM(p.backend_mtu))::numeric END as cpp,
          CASE WHEN SUM(p.backend_leads) > 0
            THEN (SUM(p.spend) / SUM(p.backend_leads))::numeric END as cpl,
          CASE WHEN SUM(p.backend_leads) > 0
            THEN (SUM(p.backend_mtu)::numeric / SUM(p.backend_leads)) END as l2p_rate,
          CASE WHEN SUM(p.clicks) > 0
            THEN (SUM(p.spend) / SUM(p.clicks))::numeric END as cpc,
          AVG(p.impression_share)::numeric as avg_is
        FROM daily_campaign_performance p
        JOIN campaigns c ON c.id = p.campaign_id
        WHERE p.business_id = $1 AND ${campaignFilter} AND p.date >= $4 AND p.date <= $5
        GROUP BY ${groupCol}
      )
      SELECT
        COALESCE(a.group_key, b.group_key) as ${groupAlias},
        a.spend as a_spend, a.impressions as a_impressions, a.clicks as a_clicks,
        a.leads as a_leads, a.payments as a_payments, a.cpp as a_cpp,
        a.cpl as a_cpl, a.l2p_rate as a_l2p, a.cpc as a_cpc, a.avg_is as a_is,
        b.spend as b_spend, b.impressions as b_impressions, b.clicks as b_clicks,
        b.leads as b_leads, b.payments as b_payments, b.cpp as b_cpp,
        b.cpl as b_cpl, b.l2p_rate as b_l2p, b.cpc as b_cpc, b.avg_is as b_is
      FROM period_a a
      FULL OUTER JOIN period_b b ON a.group_key = b.group_key
      ORDER BY COALESCE(a.spend, 0) + COALESCE(b.spend, 0) DESC
    `, [business, periodAFrom, periodATo, periodBFrom, periodBTo]);

    const data = result.rows.map(row => {
      const metrics = ["spend", "impressions", "clicks", "leads", "payments", "cpp", "cpl", "l2p", "cpc", "is"];
      const enriched: any = { [groupAlias]: row[groupAlias] };

      for (const m of metrics) {
        const a = Number(row[`a_${m}`]) || 0;
        const b = Number(row[`b_${m}`]) || 0;
        enriched[`a_${m}`] = a;
        enriched[`b_${m}`] = b;
        enriched[`delta_${m}`] = a - b;
        enriched[`pct_${m}`] = b !== 0 ? ((a - b) / b) * 100 : (a > 0 ? 100 : 0);
      }

      return enriched;
    });

    return NextResponse.json({
      data,
      meta: {
        periodA: { from: periodAFrom, to: periodATo },
        periodB: { from: periodBFrom, to: periodBTo },
        groupBy,
      },
    });
  } catch (error: any) {
    console.error("Compare API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
