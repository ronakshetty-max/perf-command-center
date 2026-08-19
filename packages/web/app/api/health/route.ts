import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://localhost:5432/perf_marketing",
});

export async function GET(request: NextRequest) {
  const product = request.nextUrl.searchParams.get("product") || "domestic_pg";

  const productFilters: Record<string, string> = {
    domestic_pg: "campaign_name ILIKE '%rpsme%' OR campaign_name ILIKE '%rphql%'",
    rize: "campaign_name ILIKE '%rize%'",
    cards: "campaign_name ILIKE '%rpipc%'",
  };
  const filter = productFilters[product] || productFilters.domestic_pg;

  try {
    const result = await pool.query(`
      SELECT MAX(date)::text as max_date FROM daily_campaign_performance
      WHERE campaign_id IN (SELECT id FROM campaigns WHERE ${filter})
    `);
    return NextResponse.json({ status: "ok", maxDate: result.rows[0]?.max_date, timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
  }
}
