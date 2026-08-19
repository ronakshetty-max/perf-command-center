import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://localhost:5432/perf_marketing",
});

const PRODUCT_CONFIG: Record<string, { filter: string; conversionCol: string }> = {
  domestic_pg: { filter: "c.campaign_name ILIKE '%rpsme%' OR c.campaign_name ILIKE '%rphql%'", conversionCol: "backend_mtu" },
  rize: { filter: "c.campaign_name ILIKE '%rize%'", conversionCol: "backend_payments" },
  cards: { filter: "c.campaign_name ILIKE '%rpipc%'", conversionCol: "backend_mtu" },
};

export async function POST(request: NextRequest) {
  try {
    // Find all "pending" actions that are 7+ days old — time to measure their impact
    const pending = await pool.query(`
      SELECT id, product, action_taken, campaign, category, date_acted, context_before
      FROM brain_memory
      WHERE outcome = 'pending' AND date_acted <= CURRENT_DATE - 7
    `);

    if (pending.rows.length === 0) {
      return NextResponse.json({ message: "No pending actions to measure", measured: 0 });
    }

    let measured = 0;

    for (const action of pending.rows) {
      const config = PRODUCT_CONFIG[action.product] || PRODUCT_CONFIG.domestic_pg;

      if (!action.campaign || action.campaign === "Account-level" || action.campaign === "Portfolio-level") {
        // Portfolio-level: compare overall metrics before/after
        const before = await pool.query(`
          SELECT SUM(p.spend)::numeric as spend, SUM(p.${config.conversionCol}) as conv,
            CASE WHEN SUM(p.${config.conversionCol}) > 0 THEN (SUM(p.spend) / SUM(p.${config.conversionCol}))::numeric END as cpp
          FROM daily_campaign_performance p
          JOIN campaigns c ON c.id = p.campaign_id
          WHERE (${config.filter}) AND p.date >= $1::date - 7 AND p.date < $1::date
        `, [action.date_acted]);

        const after = await pool.query(`
          SELECT SUM(p.spend)::numeric as spend, SUM(p.${config.conversionCol}) as conv,
            CASE WHEN SUM(p.${config.conversionCol}) > 0 THEN (SUM(p.spend) / SUM(p.${config.conversionCol}))::numeric END as cpp
          FROM daily_campaign_performance p
          JOIN campaigns c ON c.id = p.campaign_id
          WHERE (${config.filter}) AND p.date >= $1::date AND p.date < $1::date + 7
        `, [action.date_acted]);

        const bCpp = parseFloat(before.rows[0]?.cpp) || 0;
        const aCpp = parseFloat(after.rows[0]?.cpp) || 0;
        const bConv = parseInt(before.rows[0]?.conv) || 0;
        const aConv = parseInt(after.rows[0]?.conv) || 0;

        const outcome = aCpp < bCpp * 0.95 ? "positive" : aCpp > bCpp * 1.1 ? "negative" : "neutral";
        const impact = `CPP: ₹${Math.round(bCpp)} → ₹${Math.round(aCpp)} (${((aCpp - bCpp) / bCpp * 100).toFixed(1)}%). Conversions: ${bConv} → ${aConv}`;
        const lesson = outcome === "positive"
          ? `Action "${action.action_taken}" improved CPP by ${((bCpp - aCpp) / bCpp * 100).toFixed(0)}%. Repeat similar actions.`
          : outcome === "negative"
          ? `Action "${action.action_taken}" degraded CPP by ${((aCpp - bCpp) / bCpp * 100).toFixed(0)}%. Avoid in future.`
          : `Action "${action.action_taken}" had minimal impact on CPP. May need more time or different approach.`;

        await pool.query(`
          UPDATE brain_memory SET outcome = $1, impact = $2, lesson = $3, context_after = $4
          WHERE id = $5
        `, [outcome, impact, lesson, JSON.stringify(after.rows[0]), action.id]);

        measured++;
      } else {
        // Campaign-level: compare that specific campaign before/after
        const before = await pool.query(`
          SELECT SUM(p.spend)::numeric as spend, SUM(p.${config.conversionCol}) as conv,
            CASE WHEN SUM(p.${config.conversionCol}) > 0 THEN (SUM(p.spend) / SUM(p.${config.conversionCol}))::numeric END as cpp
          FROM daily_campaign_performance p
          JOIN campaigns c ON c.id = p.campaign_id
          WHERE c.campaign_name ILIKE $1 AND p.date >= $2::date - 7 AND p.date < $2::date
        `, [`%${action.campaign}%`, action.date_acted]);

        const after = await pool.query(`
          SELECT SUM(p.spend)::numeric as spend, SUM(p.${config.conversionCol}) as conv,
            CASE WHEN SUM(p.${config.conversionCol}) > 0 THEN (SUM(p.spend) / SUM(p.${config.conversionCol}))::numeric END as cpp
          FROM daily_campaign_performance p
          JOIN campaigns c ON c.id = p.campaign_id
          WHERE c.campaign_name ILIKE $1 AND p.date >= $2::date AND p.date < $2::date + 7
        `, [`%${action.campaign}%`, action.date_acted]);

        const bSpend = parseFloat(before.rows[0]?.spend) || 0;
        const aSpend = parseFloat(after.rows[0]?.spend) || 0;
        const bConv = parseInt(before.rows[0]?.conv) || 0;
        const aConv = parseInt(after.rows[0]?.conv) || 0;

        let outcome = "neutral";
        if (action.action_taken.toLowerCase().includes("pause") && aSpend < bSpend * 0.5) outcome = "positive";
        else if (action.action_taken.toLowerCase().includes("scale") && aConv > bConv * 1.1) outcome = "positive";
        else if (aSpend > bSpend * 1.5 && aConv <= bConv) outcome = "negative";

        const impact = `Spend: ₹${Math.round(bSpend)} → ₹${Math.round(aSpend)}. Conversions: ${bConv} → ${aConv}`;
        const lesson = outcome === "positive"
          ? `"${action.action_taken}" on ${action.campaign} delivered positive results.`
          : outcome === "negative"
          ? `"${action.action_taken}" on ${action.campaign} didn't work — conversions flat despite spend change.`
          : `"${action.action_taken}" on ${action.campaign} — inconclusive, need more data.`;

        await pool.query(`
          UPDATE brain_memory SET outcome = $1, impact = $2, lesson = $3, context_after = $4
          WHERE id = $5
        `, [outcome, impact, lesson, JSON.stringify(after.rows[0]), action.id]);

        measured++;
      }
    }

    return NextResponse.json({ message: `Measured ${measured} actions`, measured });
  } catch (error: any) {
    console.error("Measure Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
