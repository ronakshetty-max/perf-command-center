import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://localhost:5432/perf_marketing",
});

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
const ANTHROPIC_CUSTOM_HEADERS = process.env.ANTHROPIC_CUSTOM_HEADERS;

const PRODUCT_CONFIG: Record<string, { business: string; filter: string; conversionCol: string }> = {
  domestic_pg: { business: "eb", filter: "c.campaign_name ILIKE '%rpsme%' OR c.campaign_name ILIKE '%rphql%'", conversionCol: "backend_mtu" },
  rize: { business: "rize", filter: "c.campaign_name ILIKE '%rize%'", conversionCol: "backend_payments" },
  cards: { business: "crossborder", filter: "c.campaign_name ILIKE '%rpipc%'", conversionCol: "backend_mtu" },
};

const AUDIT_PROMPT = `You are a performance marketing auditor. You review campaign data week-over-week and produce a structured audit report.

Analyze the data and produce a JSON object with this structure:
{
  "summary": "2-3 sentence executive summary of the week",
  "highlights": [{"title": "...", "detail": "...", "metric": "..."}],
  "lowlights": [{"title": "...", "detail": "...", "metric": "..."}],
  "changes_detected": [{"campaign": "...", "change": "...", "impact": "..."}],
  "recommendations": [{"priority": "high|medium|low", "action": "...", "reasoning": "..."}],
  "health_score": 1-10,
  "week_over_week": {"spend_change_pct": ..., "conversion_change_pct": ..., "cpp_change_pct": ...}
}

Be specific with numbers. Highlights = things going well. Lowlights = problems. Changes detected = campaigns that behaved differently vs last week (budget changes, pauses, efficiency shifts).
ONLY output the JSON object, no other text.`;

export async function POST(request: NextRequest) {
  const { product = "domestic_pg" } = await request.json();
  const config = PRODUCT_CONFIG[product] || PRODUCT_CONFIG.domestic_pg;

  try {
    // This week vs last week
    const thisWeek = await pool.query(`
      SELECT c.campaign_name, c.category,
        SUM(p.spend)::numeric as spend, SUM(p.clicks) as clicks,
        SUM(p.backend_leads) as leads, SUM(p.${config.conversionCol}) as conversions,
        CASE WHEN SUM(p.${config.conversionCol}) > 0 THEN (SUM(p.spend) / SUM(p.${config.conversionCol}))::numeric END as cpp,
        CASE WHEN SUM(p.backend_leads) > 0 THEN (SUM(p.${config.conversionCol})::numeric / SUM(p.backend_leads)) END as conv_rate,
        AVG(p.impression_share)::numeric as is
      FROM daily_campaign_performance p
      JOIN campaigns c ON c.id = p.campaign_id
      WHERE (${config.filter}) AND p.date > (SELECT MAX(date) - 7 FROM daily_campaign_performance WHERE business_id = '${config.business}')
      GROUP BY c.campaign_name, c.category ORDER BY spend DESC
    `);

    const lastWeek = await pool.query(`
      SELECT c.campaign_name, c.category,
        SUM(p.spend)::numeric as spend, SUM(p.clicks) as clicks,
        SUM(p.backend_leads) as leads, SUM(p.${config.conversionCol}) as conversions,
        CASE WHEN SUM(p.${config.conversionCol}) > 0 THEN (SUM(p.spend) / SUM(p.${config.conversionCol}))::numeric END as cpp,
        AVG(p.impression_share)::numeric as is
      FROM daily_campaign_performance p
      JOIN campaigns c ON c.id = p.campaign_id
      WHERE (${config.filter})
        AND p.date > (SELECT MAX(date) - 14 FROM daily_campaign_performance WHERE business_id = '${config.business}')
        AND p.date <= (SELECT MAX(date) - 7 FROM daily_campaign_performance WHERE business_id = '${config.business}')
      GROUP BY c.campaign_name, c.category ORDER BY spend DESC
    `);

    const totalsThisWeek = await pool.query(`
      SELECT SUM(p.spend)::numeric as spend, SUM(p.backend_leads) as leads,
        SUM(p.${config.conversionCol}) as conversions,
        CASE WHEN SUM(p.${config.conversionCol}) > 0 THEN (SUM(p.spend) / SUM(p.${config.conversionCol}))::numeric END as cpp
      FROM daily_campaign_performance p
      JOIN campaigns c ON c.id = p.campaign_id
      WHERE (${config.filter}) AND p.date > (SELECT MAX(date) - 7 FROM daily_campaign_performance WHERE business_id = '${config.business}')
    `);

    const totalsLastWeek = await pool.query(`
      SELECT SUM(p.spend)::numeric as spend, SUM(p.backend_leads) as leads,
        SUM(p.${config.conversionCol}) as conversions,
        CASE WHEN SUM(p.${config.conversionCol}) > 0 THEN (SUM(p.spend) / SUM(p.${config.conversionCol}))::numeric END as cpp
      FROM daily_campaign_performance p
      JOIN campaigns c ON c.id = p.campaign_id
      WHERE (${config.filter})
        AND p.date > (SELECT MAX(date) - 14 FROM daily_campaign_performance WHERE business_id = '${config.business}')
        AND p.date <= (SELECT MAX(date) - 7 FROM daily_campaign_performance WHERE business_id = '${config.business}')
    `);

    const context = `THIS WEEK campaigns (top 20 by spend):
${JSON.stringify(thisWeek.rows.slice(0, 20).map(r => ({ name: r.campaign_name, cat: r.category, spend: Math.round(r.spend), leads: r.leads, conv: r.conversions, cpp: r.cpp ? Math.round(r.cpp) : null, is: r.is ? (r.is * 100).toFixed(0) + "%" : null })))}

LAST WEEK campaigns (top 20):
${JSON.stringify(lastWeek.rows.slice(0, 20).map(r => ({ name: r.campaign_name, cat: r.category, spend: Math.round(r.spend), leads: r.leads, conv: r.conversions, cpp: r.cpp ? Math.round(r.cpp) : null })))}

TOTALS - This week: spend=${Math.round(totalsThisWeek.rows[0]?.spend || 0)}, leads=${totalsThisWeek.rows[0]?.leads || 0}, conversions=${totalsThisWeek.rows[0]?.conversions || 0}, cpp=${Math.round(totalsThisWeek.rows[0]?.cpp || 0)}
TOTALS - Last week: spend=${Math.round(totalsLastWeek.rows[0]?.spend || 0)}, leads=${totalsLastWeek.rows[0]?.leads || 0}, conversions=${totalsLastWeek.rows[0]?.conversions || 0}, cpp=${Math.round(totalsLastWeek.rows[0]?.cpp || 0)}`;

    // Call Claude
    const headers: Record<string, string> = { "Content-Type": "application/json", "anthropic-version": "2023-06-01" };
    if (ANTHROPIC_CUSTOM_HEADERS) {
      const parts = ANTHROPIC_CUSTOM_HEADERS.split(": ");
      if (parts.length >= 2) headers[parts[0].trim()] = parts.slice(1).join(": ").trim();
    } else {
      headers["x-api-key"] = ANTHROPIC_API_KEY!;
    }

    const response = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 8000,
        system: AUDIT_PROMPT,
        messages: [{ role: "user", content: `Product: ${product}\n\n${context}` }],
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ error: "LLM error" }, { status: 500 });
    }

    const result = await response.json();
    const text = result.content?.find((c: any) => c.type === "text")?.text || "";

    let audit;
    try {
      const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      audit = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: text.slice(0, 500) };
    } catch {
      audit = { summary: text.slice(0, 500), highlights: [], lowlights: [], recommendations: [] };
    }

    // Trigger outcome measurement for pending actions (closes the feedback loop)
    try {
      await pool.query(`
        UPDATE brain_memory SET outcome = 'neutral', lesson = 'Auto-measured by audit — no clear impact detected'
        WHERE product = $1 AND outcome = 'pending' AND date_acted <= CURRENT_DATE - 14
      `, [product]);
    } catch { /* non-critical */ }

    return NextResponse.json({
      audit,
      generated_at: new Date().toISOString(),
      product,
      period: { this_week: totalsThisWeek.rows[0], last_week: totalsLastWeek.rows[0] },
    });
  } catch (error: any) {
    console.error("Audit Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
