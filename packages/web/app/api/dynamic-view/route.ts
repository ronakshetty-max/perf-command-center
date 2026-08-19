import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://localhost:5432/perf_marketing",
});

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
const ANTHROPIC_CUSTOM_HEADERS = process.env.ANTHROPIC_CUSTOM_HEADERS;

const SYSTEM_PROMPT = `You are a SQL-generating assistant for a performance marketing dashboard. You translate natural language requests into PostgreSQL queries.

DATABASE SCHEMA:
- Table: daily_campaign_performance
  Columns: campaign_id, business_id, category, platform, date, device, spend (numeric), impressions (int), clicks (int), backend_leads (int), backend_payments (int), backend_l2 (int), backend_mtu (int), cpl_backend (numeric), cpp_backend (numeric), l2p_rate (numeric), impression_share (numeric)

- Table: campaigns
  Columns: id, campaign_name, business_id, platform, category, sub_category, device_target, is_active

- Table: monthly_targets (may be empty)
  Columns: business_id, month (date), budget_target (numeric), payment_target (int), cpp_cap (numeric)

PRODUCT MAPPING:
- Domestic PG: business_id = 'eb', campaigns WHERE campaign_name ILIKE '%rpsme%' OR campaign_name ILIKE '%rphql%'
  Funnel: Signups (backend_leads) → L2 (backend_l2) → New MTU (backend_mtu)
- Rize: business_id = 'rize', campaigns WHERE campaign_name ILIKE '%rize%'
  Funnel: Leads (backend_leads) → Payments (backend_payments)
- Cards International: business_id = 'crossborder', campaigns WHERE campaign_name ILIKE '%rpipc%'
  Funnel: Signups (backend_leads) → L2 (backend_l2) → MTU (backend_mtu)

RULES:
1. Always JOIN campaigns c ON c.id = p.campaign_id when filtering by product
2. For "target vs achieved" — use monthly_targets table if data exists, otherwise note that targets aren't set
3. For time aggregations: use date_trunc('month', date) for monthly, date_trunc('week', date) for weekly
4. Return data in a format suitable for charting — columns should be clear labels
5. Always include the product filter based on campaign_name patterns
6. For "all products" — group by product using CASE WHEN on campaign_name

You MUST respond with a JSON object:
{
  "sql": "the PostgreSQL query",
  "chart_type": "table" | "line" | "bar" | "kpi",
  "title": "descriptive title for the view",
  "columns": ["col1", "col2", ...],
  "description": "one-line description of what this shows"
}

ONLY output the JSON object, no other text, no code fences.`;

export async function POST(request: NextRequest) {
  const { query, product = "domestic_pg" } = await request.json();

  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  try {
    // Call Claude to generate SQL
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    };
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
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Product context: ${product}\n\nUser request: ${query}` }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return NextResponse.json({ error: `LLM error: ${errBody.slice(0, 200)}` }, { status: 500 });
    }

    const result = await response.json();
    const textBlock = result.content?.find((c: any) => c.type === "text");
    const text = textBlock?.text || "";

    // Parse the JSON response
    let viewConfig;
    try {
      const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        viewConfig = JSON.parse(jsonMatch[0]);
      } else {
        return NextResponse.json({ error: "Could not parse AI response", raw: text.slice(0, 300) }, { status: 500 });
      }
    } catch (e: any) {
      return NextResponse.json({ error: `JSON parse error: ${e.message}`, raw: text.slice(0, 300) }, { status: 500 });
    }

    // Execute the generated SQL
    const sqlResult = await pool.query(viewConfig.sql);

    return NextResponse.json({
      title: viewConfig.title,
      description: viewConfig.description,
      chart_type: viewConfig.chart_type,
      columns: viewConfig.columns || sqlResult.fields.map((f: any) => f.name),
      data: sqlResult.rows,
      row_count: sqlResult.rowCount,
      sql: viewConfig.sql,
    });
  } catch (error: any) {
    console.error("Dynamic View Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
