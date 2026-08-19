import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://localhost:5432/perf_marketing",
});

export async function GET(request: NextRequest) {
  const product = request.nextUrl.searchParams.get("product") || "domestic_pg";
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "20");

  try {
    const memories = await pool.query(`
      SELECT * FROM brain_memory
      WHERE product = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [product, limit]);

    const lessons = await pool.query(`
      SELECT action_taken, campaign, impact, outcome, lesson, date_acted
      FROM brain_memory
      WHERE product = $1 AND outcome != 'pending' AND lesson IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 20
    `, [product]);

    const stats = await pool.query(`
      SELECT
        COUNT(*) as total_actions,
        COUNT(*) FILTER (WHERE outcome = 'positive') as positive,
        COUNT(*) FILTER (WHERE outcome = 'negative') as negative,
        COUNT(*) FILTER (WHERE outcome = 'neutral') as neutral,
        COUNT(*) FILTER (WHERE outcome = 'pending') as pending
      FROM brain_memory WHERE product = $1
    `, [product]);

    return NextResponse.json({
      memories: memories.rows,
      lessons: lessons.rows,
      stats: stats.rows[0],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { product, action_taken, campaign, category, context_before, impact, outcome, lesson } = body;

  if (!product || !action_taken) {
    return NextResponse.json({ error: "product and action_taken are required" }, { status: 400 });
  }

  try {
    const result = await pool.query(`
      INSERT INTO brain_memory (product, action_taken, campaign, category, context_before, impact, outcome, lesson)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [product, action_taken, campaign, category, context_before ? JSON.stringify(context_before) : null, impact, outcome || "pending", lesson]);

    return NextResponse.json({ id: result.rows[0].id, success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, outcome, impact, lesson, context_after } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const sets: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (outcome) { sets.push(`outcome = $${idx}`); values.push(outcome); idx++; }
    if (impact) { sets.push(`impact = $${idx}`); values.push(impact); idx++; }
    if (lesson) { sets.push(`lesson = $${idx}`); values.push(lesson); idx++; }
    if (context_after) { sets.push(`context_after = $${idx}`); values.push(JSON.stringify(context_after)); idx++; }

    values.push(id);
    await pool.query(`UPDATE brain_memory SET ${sets.join(", ")} WHERE id = $${idx}`, values);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
