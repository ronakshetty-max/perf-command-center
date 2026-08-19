import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://localhost:5432/perf_marketing",
});

export async function GET(request: NextRequest) {
  const product = request.nextUrl.searchParams.get("product") || "domestic_pg";

  try {
    const result = await pool.query(`
      SELECT id, product, week_start, health_score, audit_data, created_at
      FROM audit_history
      WHERE product = $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [product]);

    return NextResponse.json({ audits: result.rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { product, audit_data, health_score } = await request.json();

  try {
    await pool.query(`
      INSERT INTO audit_history (product, week_start, audit_data, health_score)
      VALUES ($1, date_trunc('week', CURRENT_DATE)::date, $2, $3)
    `, [product, JSON.stringify(audit_data), health_score || 0]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
