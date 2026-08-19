import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://localhost:5432/perf_marketing",
});

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  const category = params.get("category");
  const search = params.get("search");
  const sortBy = params.get("sortBy") || "spend";
  const sortDir = params.get("sortDir") || "desc";
  const view = params.get("view") || "summary";
  const product = params.get("product") || "domestic_pg";

  const productConfig: Record<string, { business: string; filter: string }> = {
    domestic_pg: { business: "eb", filter: "p.campaign_id IN (SELECT id FROM campaigns WHERE campaign_name ILIKE '%rpsme%' OR campaign_name ILIKE '%rphql%')" },
    rize: { business: "rize", filter: "p.campaign_id IN (SELECT id FROM campaigns WHERE campaign_name ILIKE '%rize%')" },
    cards: { business: "crossborder", filter: "p.campaign_id IN (SELECT id FROM campaigns WHERE campaign_name ILIKE '%rpipc%')" },
  };
  const { business, filter: campaignFilter } = productConfig[product] || productConfig.domestic_pg;

  const allowedSorts = ["spend", "impressions", "clicks", "leads", "payments", "cpp", "cpl", "l2p_rate", "cpc", "ctr", "avg_is", "campaign_name"];
  const sortCol = allowedSorts.includes(sortBy) ? sortBy : "spend";
  const sortDirection = sortDir === "asc" ? "ASC" : "DESC";

  try {
    if (view === "summary") {
      const conditions = ["p.business_id = $1", campaignFilter];
      const values: any[] = [business];
      let paramIdx = 2;

      if (dateFrom) {
        conditions.push(`p.date >= $${paramIdx}`);
        values.push(dateFrom);
        paramIdx++;
      }
      if (dateTo) {
        conditions.push(`p.date <= $${paramIdx}`);
        values.push(dateTo);
        paramIdx++;
      }
      if (category) {
        conditions.push(`p.category = $${paramIdx}`);
        values.push(category);
        paramIdx++;
      }

      const whereClause = conditions.join(" AND ");

      let query = `
        SELECT
          c.campaign_name,
          p.category,
          p.platform,
          c.sub_category,
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
          CASE WHEN SUM(p.impressions) > 0
            THEN (SUM(p.clicks)::numeric / SUM(p.impressions)) END as ctr,
          AVG(p.impression_share)::numeric as avg_is,
          MIN(p.date) as first_date,
          MAX(p.date) as last_date,
          COUNT(DISTINCT p.date) as active_days
        FROM daily_campaign_performance p
        JOIN campaigns c ON c.id = p.campaign_id
        WHERE ${whereClause}
        GROUP BY c.campaign_name, p.category, p.platform, c.sub_category
        ORDER BY ${sortCol} ${sortDirection} NULLS LAST
      `;

      if (search) {
        query = `SELECT * FROM (${query}) sub WHERE LOWER(campaign_name) LIKE LOWER($${paramIdx})`;
        values.push(`%${search}%`);
      }

      const result = await pool.query(query, values);
      return NextResponse.json({ data: result.rows });
    }

    if (view === "daily") {
      const campaignName = params.get("campaign");
      if (!campaignName) {
        return NextResponse.json({ error: "campaign param required for daily view" }, { status: 400 });
      }

      const conditions = ["p.business_id = $1", "c.campaign_name = $2"];
      const values: any[] = [business, campaignName];
      let paramIdx = 3;

      if (dateFrom) {
        conditions.push(`p.date >= $${paramIdx}`);
        values.push(dateFrom);
        paramIdx++;
      }
      if (dateTo) {
        conditions.push(`p.date <= $${paramIdx}`);
        values.push(dateTo);
        paramIdx++;
      }

      const result = await pool.query(`
        SELECT
          p.date,
          p.spend::numeric,
          p.impressions,
          p.clicks,
          p.backend_leads as leads,
          p.backend_mtu as payments,
          p.cpc::numeric,
          p.ctr::numeric,
          p.impression_share::numeric,
          CASE WHEN p.backend_mtu > 0
            THEN (p.spend / p.backend_mtu)::numeric END as cpp,
          CASE WHEN p.backend_leads > 0
            THEN (p.spend / p.backend_leads)::numeric END as cpl
        FROM daily_campaign_performance p
        JOIN campaigns c ON c.id = p.campaign_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY p.date ASC
      `, values);

      return NextResponse.json({ data: result.rows });
    }

    return NextResponse.json({ data: [] });
  } catch (error: any) {
    console.error("Campaigns API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
