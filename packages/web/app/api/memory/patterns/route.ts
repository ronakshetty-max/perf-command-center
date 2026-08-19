import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://localhost:5432/perf_marketing",
});

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
const ANTHROPIC_CUSTOM_HEADERS = process.env.ANTHROPIC_CUSTOM_HEADERS;

export async function POST(request: NextRequest) {
  const { product = "domestic_pg" } = await request.json();

  try {
    // Get all resolved memories
    const memories = await pool.query(`
      SELECT action_taken, campaign, category, outcome, impact, lesson, date_acted
      FROM brain_memory
      WHERE product = $1 AND outcome != 'pending'
      ORDER BY date_acted DESC
      LIMIT 50
    `, [product]);

    if (memories.rows.length < 3) {
      return NextResponse.json({ patterns: [], message: "Not enough history to detect patterns (need 3+ resolved actions)" });
    }

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
        max_tokens: 4000,
        system: `You analyze a history of marketing actions and their outcomes to identify recurring patterns. Output a JSON array of patterns:
[{"pattern": "description of the pattern", "confidence": "high|medium", "evidence": "what actions showed this", "recommendation": "how to use this pattern going forward"}]
Only include patterns supported by 2+ data points. Be specific with campaign names and numbers.`,
        messages: [{ role: "user", content: `Product: ${product}\n\nAction history:\n${JSON.stringify(memories.rows)}` }],
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ patterns: [], message: "LLM unavailable" });
    }

    const result = await response.json();
    const text = result.content?.find((c: any) => c.type === "text")?.text || "";

    let patterns = [];
    try {
      const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
      if (jsonMatch) patterns = JSON.parse(jsonMatch[0]);
    } catch { /* parse failed */ }

    // Store patterns as institutional knowledge
    if (patterns.length > 0) {
      await pool.query(`
        INSERT INTO brain_memory (product, action_taken, campaign, category, outcome, lesson)
        VALUES ($1, 'PATTERN_RECOGNITION', 'Institutional', 'system', 'positive', $2)
      `, [product, JSON.stringify(patterns)]);
    }

    return NextResponse.json({ patterns, analyzed_actions: memories.rows.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
