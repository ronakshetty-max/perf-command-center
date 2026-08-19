import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://localhost:5432/perf_marketing",
});

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const view = params.get("view") || "overview";
  const category = params.get("category");
  const categories = params.get("categories");
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  const product = params.get("product") || "domestic_pg";

  const productConfig: Record<string, { business: string; filter: string; conversionCol: string }> = {
    domestic_pg: { business: "eb", filter: "campaign_id IN (SELECT id FROM campaigns WHERE campaign_name ILIKE '%rpsme%' OR campaign_name ILIKE '%rphql%')", conversionCol: "backend_mtu" },
    rize: { business: "rize", filter: "campaign_id IN (SELECT id FROM campaigns WHERE campaign_name ILIKE '%rize%')", conversionCol: "backend_payments" },
    cards: { business: "crossborder", filter: "campaign_id IN (SELECT id FROM campaigns WHERE campaign_name ILIKE '%rpipc%')", conversionCol: "backend_mtu" },
  };
  const { business, filter: rpsmeFilter, conversionCol } = productConfig[product] || productConfig.domestic_pg;

  try {

    const platform = params.get("platform");
    const categoryFilter = categories ? `campaign_id IN (SELECT id FROM campaigns WHERE category IN (${categories.split(",").map(c => `'${c}'`).join(",")}))` : null;

    if (view === "overall") {
      const conditions = ["business_id = $1", rpsmeFilter];
      const values: any[] = [business];
      let idx = 2;
      if (dateFrom) { conditions.push(`date >= $${idx}`); values.push(dateFrom); idx++; }
      if (dateTo) { conditions.push(`date <= $${idx}`); values.push(dateTo); idx++; }
      if (categoryFilter) conditions.push(categoryFilter);
      if (platform) conditions.push(`campaign_id IN (SELECT id FROM campaigns WHERE platform = '${platform}')`);

      const summaryResult = await pool.query(`
        SELECT
          COUNT(DISTINCT campaign_id) as campaign_count,
          SUM(spend)::numeric as total_spend,
          SUM(impressions) as total_impressions,
          SUM(clicks) as total_clicks,
          SUM(backend_leads) as total_leads,
          SUM(${conversionCol}) as total_payments,
          CASE WHEN SUM(backend_leads) > 0
            THEN (SUM(spend) / SUM(backend_leads))::numeric END as cpl,
          CASE WHEN SUM(${conversionCol}) > 0
            THEN (SUM(spend) / SUM(${conversionCol}))::numeric END as cpp,
          CASE WHEN SUM(backend_leads) > 0
            THEN (SUM(${conversionCol})::numeric / SUM(backend_leads)) END as l2p_rate,
          CASE WHEN SUM(impressions) > 0
            THEN (SUM(clicks)::numeric / SUM(impressions)) END as ctr,
          CASE WHEN SUM(clicks) > 0
            THEN (SUM(backend_leads)::numeric / SUM(clicks)) END as click_to_lead_rate
        FROM daily_campaign_performance
        WHERE ${conditions.join(" AND ")}
      `, values);

      const campaignResult = await pool.query(`
        SELECT
          c.campaign_name,
          p.category,
          p.platform,
          SUM(p.spend)::numeric as spend,
          SUM(p.impressions) as impressions,
          SUM(p.clicks) as clicks,
          SUM(p.backend_leads) as leads,
          SUM(p.${conversionCol}) as payments,
          CASE WHEN SUM(p.${conversionCol}) > 0
            THEN (SUM(p.spend) / SUM(p.${conversionCol}))::numeric END as cpp,
          CASE WHEN SUM(p.backend_leads) > 0
            THEN (SUM(p.spend) / SUM(p.backend_leads))::numeric END as cpl,
          CASE WHEN SUM(p.backend_leads) > 0
            THEN (SUM(p.${conversionCol})::numeric / SUM(p.backend_leads)) END as l2p_rate,
          CASE WHEN SUM(p.clicks) > 0
            THEN (SUM(p.spend) / SUM(p.clicks))::numeric END as cpc
        FROM daily_campaign_performance p
        JOIN campaigns c ON c.id = p.campaign_id
        WHERE ${conditions.map(c => c.replace('business_id', 'p.business_id').replace('date', 'p.date')).join(" AND ")}
        GROUP BY c.campaign_name, p.category, p.platform
        ORDER BY spend DESC
      `, values);

      return NextResponse.json({
        summary: summaryResult.rows[0],
        campaigns: campaignResult.rows,
      });
    }

    if (view === "overview") {
      const conditions = ["business_id = $1", rpsmeFilter];
      const values: any[] = [business];
      let idx = 2;
      if (dateFrom) { conditions.push(`date >= $${idx}`); values.push(dateFrom); idx++; }
      if (dateTo) { conditions.push(`date <= $${idx}`); values.push(dateTo); idx++; }
      if (categoryFilter) conditions.push(categoryFilter);
      if (platform) conditions.push(`campaign_id IN (SELECT id FROM campaigns WHERE platform = '${platform}')`);

      const result = await pool.query(`
        SELECT
          category,
          COUNT(DISTINCT campaign_id) as campaign_count,
          SUM(spend)::numeric as total_spend,
          SUM(impressions) as total_impressions,
          SUM(clicks) as total_clicks,
          SUM(backend_leads) as total_leads,
          SUM(${conversionCol}) as total_payments,
          CASE WHEN SUM(backend_leads) > 0
            THEN (SUM(spend) / SUM(backend_leads))::numeric END as cpl,
          CASE WHEN SUM(${conversionCol}) > 0
            THEN (SUM(spend) / SUM(${conversionCol}))::numeric END as cpp,
          CASE WHEN SUM(backend_leads) > 0
            THEN (SUM(${conversionCol})::numeric / SUM(backend_leads)) END as l2p_rate,
          CASE WHEN SUM(impressions) > 0
            THEN (SUM(clicks)::numeric / SUM(impressions)) END as ctr,
          AVG(impression_share)::numeric as avg_is
        FROM daily_campaign_performance
        WHERE ${conditions.join(" AND ")}
        GROUP BY category
        ORDER BY total_spend DESC
      `, values);

      return NextResponse.json({ data: result.rows });
    }

    if (view === "dod") {
      const result = await pool.query(`
        WITH dates AS (
          SELECT MAX(date) as today FROM daily_campaign_performance WHERE business_id = $1 AND ${rpsmeFilter}
        )
        SELECT
          category,
          date,
          SUM(spend)::numeric as spend,
          SUM(clicks) as clicks,
          SUM(impressions) as impressions,
          SUM(backend_leads) as leads,
          SUM(${conversionCol}) as payments,
          CASE WHEN SUM(${conversionCol}) > 0
            THEN (SUM(spend) / SUM(${conversionCol}))::numeric END as cpp,
          CASE WHEN SUM(backend_leads) > 0
            THEN (SUM(${conversionCol})::numeric / SUM(backend_leads)) END as l2p_rate
        FROM daily_campaign_performance
        CROSS JOIN dates d
        WHERE business_id = $1 AND ${rpsmeFilter} AND date >= d.today - 1
        GROUP BY category, date
        ORDER BY category, date
      `, [business]);

      return NextResponse.json({ data: result.rows });
    }

    if (view === "dod_trend") {
      const result = await pool.query(`
        SELECT
          category,
          date,
          SUM(spend)::numeric as spend,
          SUM(backend_leads) as leads,
          SUM(${conversionCol}) as payments,
          CASE WHEN SUM(${conversionCol}) > 0
            THEN (SUM(spend) / SUM(${conversionCol}))::numeric END as cpp
        FROM daily_campaign_performance
        WHERE business_id = $1 AND ${rpsmeFilter} AND date >= (SELECT MAX(date) - 7 FROM daily_campaign_performance WHERE business_id = $1 AND ${rpsmeFilter})
        GROUP BY category, date
        ORDER BY date, category
      `, [business]);

      return NextResponse.json({ data: result.rows });
    }

    if (view === "wow") {
      const result = await pool.query(`
        WITH date_range AS (
          SELECT MAX(date) as latest FROM daily_campaign_performance WHERE business_id = $1 AND ${rpsmeFilter}
        ),
        weeks AS (
          SELECT
            category,
            CASE
              WHEN date > (SELECT latest - 7 FROM date_range) THEN 'this_week'
              ELSE 'last_week'
            END as week_period,
            SUM(spend)::numeric as spend,
            SUM(backend_leads) as leads,
            SUM(${conversionCol}) as payments,
            CASE WHEN SUM(${conversionCol}) > 0
              THEN (SUM(spend) / SUM(${conversionCol}))::numeric END as cpp,
            CASE WHEN SUM(backend_leads) > 0
              THEN (SUM(${conversionCol})::numeric / SUM(backend_leads)) END as l2p_rate
          FROM daily_campaign_performance
          CROSS JOIN date_range dr
          WHERE business_id = $1 AND ${rpsmeFilter} AND date > dr.latest - 14
          GROUP BY category, week_period
        )
        SELECT * FROM weeks ORDER BY category, week_period
      `, [business]);

      return NextResponse.json({ data: result.rows });
    }

    if (view === "mtd") {
      const result = await pool.query(`
        WITH date_range AS (
          SELECT MAX(date) as latest FROM daily_campaign_performance WHERE business_id = $1 AND ${rpsmeFilter}
        ),
        current_month AS (
          SELECT
            category,
            SUM(spend)::numeric as spend,
            SUM(backend_leads) as leads,
            SUM(${conversionCol}) as payments,
            CASE WHEN SUM(${conversionCol}) > 0
              THEN (SUM(spend) / SUM(${conversionCol}))::numeric END as cpp,
            CASE WHEN SUM(backend_leads) > 0
              THEN (SUM(${conversionCol})::numeric / SUM(backend_leads)) END as l2p_rate
          FROM daily_campaign_performance
          CROSS JOIN date_range dr
          WHERE business_id = $1 AND ${rpsmeFilter}
            AND date >= date_trunc('month', dr.latest)
          GROUP BY category
        ),
        prev_month AS (
          SELECT
            category,
            SUM(spend)::numeric as spend,
            SUM(backend_leads) as leads,
            SUM(${conversionCol}) as payments,
            CASE WHEN SUM(${conversionCol}) > 0
              THEN (SUM(spend) / SUM(${conversionCol}))::numeric END as cpp,
            CASE WHEN SUM(backend_leads) > 0
              THEN (SUM(${conversionCol})::numeric / SUM(backend_leads)) END as l2p_rate
          FROM daily_campaign_performance
          CROSS JOIN date_range dr
          WHERE business_id = $1 AND ${rpsmeFilter}
            AND date >= date_trunc('month', dr.latest) - interval '1 month'
            AND date < date_trunc('month', dr.latest) - interval '1 month' + (dr.latest - date_trunc('month', dr.latest))
          GROUP BY category
        )
        SELECT
          COALESCE(c.category, p.category) as category,
          c.spend as current_spend, c.leads as current_leads, c.payments as current_payments, c.cpp as current_cpp, c.l2p_rate as current_l2p,
          p.spend as prev_spend, p.leads as prev_leads, p.payments as prev_payments, p.cpp as prev_cpp, p.l2p_rate as prev_l2p
        FROM current_month c
        FULL OUTER JOIN prev_month p ON c.category = p.category
        ORDER BY COALESCE(c.spend, 0) DESC
      `, [business]);

      return NextResponse.json({ data: result.rows });
    }

    if (view === "mom") {
      const result = await pool.query(`
        SELECT
          category,
          date_trunc('month', date)::date as month,
          SUM(spend)::numeric as spend,
          SUM(backend_leads) as leads,
          SUM(${conversionCol}) as payments,
          CASE WHEN SUM(${conversionCol}) > 0
            THEN (SUM(spend) / SUM(${conversionCol}))::numeric END as cpp,
          CASE WHEN SUM(backend_leads) > 0
            THEN (SUM(${conversionCol})::numeric / SUM(backend_leads)) END as l2p_rate
        FROM daily_campaign_performance
        WHERE business_id = $1 AND ${rpsmeFilter}
        GROUP BY category, date_trunc('month', date)
        ORDER BY month, category
      `, [business]);

      return NextResponse.json({ data: result.rows });
    }

    if (view === "trends") {
      const granularity = params.get("granularity") || "daily";
      const dateCol = granularity === "monthly" ? "date_trunc('month', date)::date"
        : granularity === "weekly" ? "date_trunc('week', date)::date"
        : "date";

      const conditions = ["business_id = $1", rpsmeFilter];
      const values: any[] = [business];
      let idx = 2;
      if (dateFrom) { conditions.push(`date >= $${idx}`); values.push(dateFrom); idx++; }
      if (dateTo) { conditions.push(`date <= $${idx}`); values.push(dateTo); idx++; }
      if (category) { conditions.push(`category = $${idx}`); values.push(category); idx++; }

      const result = await pool.query(`
        SELECT
          ${dateCol} as period,
          category,
          SUM(spend)::numeric as spend,
          SUM(impressions) as impressions,
          SUM(clicks) as clicks,
          SUM(backend_leads) as leads,
          SUM(${conversionCol}) as payments,
          CASE WHEN SUM(${conversionCol}) > 0
            THEN (SUM(spend) / SUM(${conversionCol}))::numeric END as cpp,
          CASE WHEN SUM(backend_leads) > 0
            THEN (SUM(${conversionCol})::numeric / SUM(backend_leads)) END as l2p_rate,
          CASE WHEN SUM(clicks) > 0
            THEN (SUM(spend) / SUM(clicks))::numeric END as cpc
        FROM daily_campaign_performance
        WHERE ${conditions.join(" AND ")}
        GROUP BY ${dateCol}, category
        ORDER BY period ASC, category
      `, values);

      return NextResponse.json({ data: result.rows });
    }

    if (view === "campaigns") {
      const result = await pool.query(`
        SELECT
          c.campaign_name,
          p.category,
          p.platform,
          c.sub_category,
          c.device_target,
          SUM(p.spend)::numeric as spend,
          SUM(p.impressions) as impressions,
          SUM(p.clicks) as clicks,
          SUM(p.backend_leads) as leads,
          SUM(p.${conversionCol}) as payments,
          CASE WHEN SUM(p.${conversionCol}) > 0
            THEN (SUM(p.spend) / SUM(p.${conversionCol}))::numeric END as cpp,
          CASE WHEN SUM(p.backend_leads) > 0
            THEN (SUM(p.spend) / SUM(p.backend_leads))::numeric END as cpl,
          CASE WHEN SUM(p.backend_leads) > 0
            THEN (SUM(p.${conversionCol})::numeric / SUM(p.backend_leads)) END as l2p_rate,
          CASE WHEN SUM(p.clicks) > 0
            THEN (SUM(p.spend) / SUM(p.clicks))::numeric END as cpc,
          AVG(p.impression_share)::numeric as avg_is
        FROM daily_campaign_performance p
        JOIN campaigns c ON c.id = p.campaign_id
        WHERE p.business_id = $1
        ${category ? "AND p.category = $2" : ""}
        GROUP BY c.campaign_name, p.category, p.platform, c.sub_category, c.device_target
        ORDER BY spend DESC
      `, category ? [business, category] : [business]);

      return NextResponse.json({ data: result.rows });
    }

    return NextResponse.json({ data: [] });
  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
