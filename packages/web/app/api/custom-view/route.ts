import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://localhost:5432/perf_marketing",
});

const PRODUCT_CONFIG: Record<string, { business: string; filter: string; conversionCol: string; leadLabel: string; convLabel: string }> = {
  domestic_pg: { business: "eb", filter: "c.campaign_name ILIKE '%rpsme%' OR c.campaign_name ILIKE '%rphql%'", conversionCol: "backend_mtu", leadLabel: "signups", convLabel: "new_mtu" },
  rize: { business: "rize", filter: "c.campaign_name ILIKE '%rize%'", conversionCol: "backend_payments", leadLabel: "leads", convLabel: "payments" },
  cards: { business: "crossborder", filter: "c.campaign_name ILIKE '%rpipc%'", conversionCol: "backend_mtu", leadLabel: "signups", convLabel: "mtu" },
};

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { view, product = "domestic_pg", metric, time, groupBy } = body;
  const config = PRODUCT_CONFIG[product] || PRODUCT_CONFIG.domestic_pg;
  const { business, filter, conversionCol, leadLabel, convLabel } = config;

  try {
    let result: { title: string; rows: any[]; columns: string[] };

    switch (view) {
      case "monthly_trend": {
        const res = await pool.query(`
          SELECT date_trunc('month', p.date)::date as month,
            SUM(p.spend)::numeric as spend, SUM(p.backend_leads) as ${leadLabel},
            SUM(p.${conversionCol}) as ${convLabel},
            CASE WHEN SUM(p.${conversionCol}) > 0 THEN (SUM(p.spend) / SUM(p.${conversionCol}))::numeric END as cost_per_conversion,
            CASE WHEN SUM(p.backend_leads) > 0 THEN (SUM(p.${conversionCol})::numeric / SUM(p.backend_leads)) END as conversion_rate
          FROM daily_campaign_performance p
          JOIN campaigns c ON c.id = p.campaign_id
          WHERE (${filter})
          GROUP BY 1 ORDER BY 1
        `);
        result = { title: `Monthly Trend — ${product === "domestic_pg" ? "Domestic PG" : product === "rize" ? "Rize" : "Cards"}`, rows: res.rows, columns: ["month", "spend", leadLabel, convLabel, "cost_per_conversion", "conversion_rate"] };
        break;
      }

      case "wow": {
        const res = await pool.query(`
          WITH date_ranges AS (
            SELECT MAX(date) as latest FROM daily_campaign_performance p JOIN campaigns c ON c.id = p.campaign_id WHERE (${filter})
          )
          SELECT
            CASE WHEN p.date > dr.latest - 7 THEN 'This Week' ELSE 'Last Week' END as period,
            SUM(p.spend)::numeric as spend,
            SUM(p.impressions) as impressions,
            SUM(p.clicks) as clicks,
            SUM(p.backend_leads) as ${leadLabel},
            SUM(p.${conversionCol}) as ${convLabel},
            CASE WHEN SUM(p.${conversionCol}) > 0 THEN (SUM(p.spend) / SUM(p.${conversionCol}))::numeric END as cost_per_conversion,
            CASE WHEN SUM(p.clicks) > 0 THEN (SUM(p.spend) / SUM(p.clicks))::numeric END as cpc,
            CASE WHEN SUM(p.impressions) > 0 THEN (SUM(p.clicks)::numeric / SUM(p.impressions)) END as ctr
          FROM daily_campaign_performance p
          JOIN campaigns c ON c.id = p.campaign_id
          CROSS JOIN date_ranges dr
          WHERE (${filter}) AND p.date > dr.latest - 14
          GROUP BY 1 ORDER BY 1 DESC
        `);
        result = { title: "Week-over-Week Performance", rows: res.rows, columns: ["period", "spend", "impressions", "clicks", leadLabel, convLabel, "cost_per_conversion", "cpc", "ctr"] };
        break;
      }

      case "category_scorecard": {
        const res = await pool.query(`
          WITH date_ranges AS (
            SELECT MAX(date) as latest FROM daily_campaign_performance p JOIN campaigns c ON c.id = p.campaign_id WHERE (${filter})
          )
          SELECT c.category,
            COUNT(DISTINCT c.id) as campaigns,
            SUM(p.spend)::numeric as spend,
            SUM(p.backend_leads) as ${leadLabel},
            SUM(p.${conversionCol}) as ${convLabel},
            CASE WHEN SUM(p.${conversionCol}) > 0 THEN (SUM(p.spend) / SUM(p.${conversionCol}))::numeric END as cost_per_conversion,
            CASE WHEN SUM(p.backend_leads) > 0 THEN (SUM(p.${conversionCol})::numeric / SUM(p.backend_leads)) END as conversion_rate,
            AVG(p.impression_share)::numeric as avg_impression_share,
            CASE WHEN SUM(p.clicks) > 0 THEN (SUM(p.spend) / SUM(p.clicks))::numeric END as cpc,
            CASE
              WHEN SUM(p.${conversionCol}) > 0 AND (SUM(p.spend) / SUM(p.${conversionCol})) < 3000 THEN 'Efficient'
              WHEN SUM(p.${conversionCol}) > 0 AND (SUM(p.spend) / SUM(p.${conversionCol})) < 5000 THEN 'Moderate'
              WHEN SUM(p.${conversionCol}) > 0 THEN 'Expensive'
              ELSE 'No Conversions'
            END as health_grade
          FROM daily_campaign_performance p
          JOIN campaigns c ON c.id = p.campaign_id
          CROSS JOIN date_ranges dr
          WHERE (${filter}) AND p.date > dr.latest - 14
          GROUP BY c.category ORDER BY spend DESC
        `);
        result = { title: "Category Scorecard (Last 14D)", rows: res.rows, columns: ["category", "campaigns", "spend", leadLabel, convLabel, "cost_per_conversion", "conversion_rate", "avg_impression_share", "cpc", "health_grade"] };
        break;
      }

      case "campaign_health": {
        const res = await pool.query(`
          WITH date_ranges AS (
            SELECT MAX(date) as latest FROM daily_campaign_performance p JOIN campaigns c ON c.id = p.campaign_id WHERE (${filter})
          )
          SELECT c.campaign_name, c.category,
            SUM(p.spend)::numeric as spend,
            SUM(p.${conversionCol}) as conversions,
            CASE WHEN SUM(p.${conversionCol}) > 0 THEN (SUM(p.spend) / SUM(p.${conversionCol}))::numeric END as cost_per_conversion,
            AVG(p.impression_share)::numeric as impression_share,
            COUNT(DISTINCT p.date) FILTER (WHERE p.${conversionCol} = 0 AND p.spend > 0) as zero_conv_days,
            CASE
              WHEN SUM(p.${conversionCol}) = 0 THEN 1
              WHEN SUM(p.${conversionCol}) > 0 AND (SUM(p.spend) / SUM(p.${conversionCol})) > 8000 THEN 3
              WHEN SUM(p.${conversionCol}) > 0 AND (SUM(p.spend) / SUM(p.${conversionCol})) > 5000 THEN 5
              WHEN SUM(p.${conversionCol}) > 0 AND (SUM(p.spend) / SUM(p.${conversionCol})) > 3000 THEN 7
              ELSE 9
            END as health_score
          FROM daily_campaign_performance p
          JOIN campaigns c ON c.id = p.campaign_id
          CROSS JOIN date_ranges dr
          WHERE (${filter}) AND p.date > dr.latest - 7
          GROUP BY c.campaign_name, c.category
          HAVING SUM(p.spend) > 1000
          ORDER BY health_score ASC, spend DESC
        `);
        result = { title: "Campaign Health (Last 7D)", rows: res.rows, columns: ["campaign_name", "category", "spend", "conversions", "cost_per_conversion", "impression_share", "zero_conv_days", "health_score"] };
        break;
      }

      case "funnel_leakage": {
        const res = await pool.query(`
          WITH date_ranges AS (
            SELECT MAX(date) as latest FROM daily_campaign_performance p JOIN campaigns c ON c.id = p.campaign_id WHERE (${filter})
          )
          SELECT c.category,
            SUM(p.impressions) as impressions,
            SUM(p.clicks) as clicks,
            SUM(p.backend_leads) as ${leadLabel},
            SUM(p.backend_l2) as l2_submits,
            SUM(p.${conversionCol}) as ${convLabel},
            CASE WHEN SUM(p.impressions) > 0 THEN (SUM(p.clicks)::numeric / SUM(p.impressions)) END as click_rate,
            CASE WHEN SUM(p.clicks) > 0 THEN (SUM(p.backend_leads)::numeric / SUM(p.clicks)) END as lead_rate,
            CASE WHEN SUM(p.backend_leads) > 0 THEN (SUM(p.backend_l2)::numeric / SUM(p.backend_leads)) END as l2_rate,
            CASE WHEN SUM(p.backend_l2) > 0 THEN (SUM(p.${conversionCol})::numeric / SUM(p.backend_l2)) END as conversion_rate
          FROM daily_campaign_performance p
          JOIN campaigns c ON c.id = p.campaign_id
          CROSS JOIN date_ranges dr
          WHERE (${filter}) AND p.date > dr.latest - 14
          GROUP BY c.category ORDER BY impressions DESC
        `);
        result = { title: "Funnel Leakage by Category (Last 14D)", rows: res.rows, columns: ["category", "impressions", "clicks", leadLabel, "l2_submits", convLabel, "click_rate", "lead_rate", "l2_rate", "conversion_rate"] };
        break;
      }

      case "top_movers": {
        const res = await pool.query(`
          WITH date_ranges AS (
            SELECT MAX(date) as latest FROM daily_campaign_performance p JOIN campaigns c ON c.id = p.campaign_id WHERE (${filter})
          ),
          this_week AS (
            SELECT c.campaign_name, SUM(p.spend)::numeric as spend, SUM(p.${conversionCol}) as conv
            FROM daily_campaign_performance p JOIN campaigns c ON c.id = p.campaign_id CROSS JOIN date_ranges dr
            WHERE (${filter}) AND p.date > dr.latest - 7 GROUP BY c.campaign_name
          ),
          last_week AS (
            SELECT c.campaign_name, SUM(p.spend)::numeric as spend, SUM(p.${conversionCol}) as conv
            FROM daily_campaign_performance p JOIN campaigns c ON c.id = p.campaign_id CROSS JOIN date_ranges dr
            WHERE (${filter}) AND p.date > dr.latest - 14 AND p.date <= dr.latest - 7 GROUP BY c.campaign_name
          )
          SELECT COALESCE(t.campaign_name, l.campaign_name) as campaign_name,
            COALESCE(t.spend, 0) as this_week_spend, COALESCE(l.spend, 0) as last_week_spend,
            CASE WHEN COALESCE(l.spend, 0) > 0 THEN ((COALESCE(t.spend, 0) - l.spend) / l.spend) END as spend_change_pct,
            COALESCE(t.conv, 0) as this_week_conv, COALESCE(l.conv, 0) as last_week_conv,
            CASE WHEN COALESCE(l.conv, 0) > 0 THEN ((COALESCE(t.conv, 0) - l.conv)::numeric / l.conv) END as conv_change_pct
          FROM this_week t FULL OUTER JOIN last_week l ON t.campaign_name = l.campaign_name
          WHERE COALESCE(t.spend, 0) + COALESCE(l.spend, 0) > 5000
          ORDER BY ABS(COALESCE(t.spend, 0) - COALESCE(l.spend, 0)) DESC
          LIMIT 15
        `);
        result = { title: "Top Movers — Biggest WoW Changes", rows: res.rows, columns: ["campaign_name", "this_week_spend", "last_week_spend", "spend_change_pct", "this_week_conv", "last_week_conv", "conv_change_pct"] };
        break;
      }

      case "custom": {
        const metricCol = getMetricColumn(metric || "Spend", config);
        const timeFilter = getTimeFilter(time || "Last 14 Days");
        const groupCol = getGroupColumn(groupBy || "By Category");

        const res = await pool.query(`
          WITH date_ranges AS (
            SELECT MAX(date) as latest FROM daily_campaign_performance p JOIN campaigns c ON c.id = p.campaign_id WHERE (${filter})
          )
          SELECT ${groupCol} as group_label, ${metricCol}
          FROM daily_campaign_performance p
          JOIN campaigns c ON c.id = p.campaign_id
          CROSS JOIN date_ranges dr
          WHERE (${filter}) AND ${timeFilter}
          GROUP BY 1 ORDER BY 2 DESC
        `);
        const cols = res.fields.map((f: any) => f.name);
        result = { title: `${metric} — ${time} — ${groupBy}`, rows: res.rows, columns: cols };
        break;
      }

      default:
        return NextResponse.json({ error: "Unknown view" }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Custom View Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function getMetricColumn(metric: string, config: any): string {
  switch (metric) {
    case "Spend": return "SUM(p.spend)::numeric as value";
    case "Signups/Leads": return "SUM(p.backend_leads) as value";
    case "L2": return "SUM(p.backend_l2) as value";
    case "MTU/Payments": return `SUM(p.${config.conversionCol}) as value`;
    case "CPP/CP-MTU": return `CASE WHEN SUM(p.${config.conversionCol}) > 0 THEN (SUM(p.spend) / SUM(p.${config.conversionCol}))::numeric END as value`;
    case "CPC": return "CASE WHEN SUM(p.clicks) > 0 THEN (SUM(p.spend) / SUM(p.clicks))::numeric END as value";
    case "CTR": return "CASE WHEN SUM(p.impressions) > 0 THEN (SUM(p.clicks)::numeric / SUM(p.impressions)) END as value";
    case "Impression Share": return "AVG(p.impression_share)::numeric as value";
    default: return "SUM(p.spend)::numeric as value";
  }
}

function getTimeFilter(time: string): string {
  switch (time) {
    case "Last 7 Days": return "p.date > dr.latest - 7";
    case "Last 14 Days": return "p.date > dr.latest - 14";
    case "Last 30 Days": return "p.date > dr.latest - 30";
    case "Last 3 Months": return "p.date > dr.latest - 90";
    case "Last 6 Months": return "p.date > dr.latest - 180";
    default: return "p.date > dr.latest - 14";
  }
}

function getGroupColumn(groupBy: string): string {
  switch (groupBy) {
    case "By Category": return "c.category";
    case "By Campaign": return "c.campaign_name";
    case "By Platform": return "c.platform";
    case "By Day": return "p.date::text";
    case "By Week": return "date_trunc('week', p.date)::date::text";
    case "By Month": return "date_trunc('month', p.date)::date::text";
    default: return "c.category";
  }
}
