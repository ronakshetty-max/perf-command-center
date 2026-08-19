import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://localhost:5432/perf_marketing",
});

const PRODUCT_CONFIG: Record<string, { business: string; filter: string }> = {
  domestic_pg: { business: "eb", filter: "c.campaign_name ILIKE '%rpsme%' OR c.campaign_name ILIKE '%rphql%'" },
  rize: { business: "rize", filter: "c.campaign_name ILIKE '%rize%'" },
  cards: { business: "crossborder", filter: "c.campaign_name ILIKE '%rpipc%'" },
};

export async function GET(request: NextRequest) {
  const product = request.nextUrl.searchParams.get("product") || "domestic_pg";
  const config = PRODUCT_CONFIG[product] || PRODUCT_CONFIG.domestic_pg;

  try {
    // 1. Impression Share by Campaign (last 7 days avg)
    const isData = await pool.query(`
      SELECT c.campaign_name, c.category, c.platform,
        AVG(am.impression_share)::numeric as impression_share,
        AVG(am.top_impression_share)::numeric as top_is,
        AVG(am.search_lost_is_budget)::numeric as lost_is_budget,
        AVG(am.search_lost_is_rank)::numeric as lost_is_rank,
        SUM(am.spend)::numeric as spend,
        SUM(am.clicks) as clicks,
        SUM(am.impressions) as impressions
      FROM daily_ad_metrics am
      JOIN campaigns c ON c.id = am.campaign_id
      WHERE (${config.filter})
        AND am.date >= (SELECT MAX(date) - 6 FROM daily_ad_metrics am2 JOIN campaigns c2 ON c2.id = am2.campaign_id WHERE ${config.filter.replace(/c\./g, 'c2.')})
        AND am.impression_share IS NOT NULL
      GROUP BY c.campaign_name, c.category, c.platform
      ORDER BY spend DESC
    `);

    // 2. Search Terms from signals cache
    let searchTerms: any[] = [];
    let qualityScores: any[] = [];
    try {
      const cachePath = join(process.cwd(), "../../packages/pipeline/.signals_cache.json");
      if (existsSync(cachePath)) {
        const cache = JSON.parse(readFileSync(cachePath, "utf-8"));
        const productPrefix = product === "rize" ? "rize" : product === "cards" ? "rpipc" : "rpsme";

        searchTerms = (cache.search_terms || [])
          .filter((t: any) => (t.campaign || "").toLowerCase().includes(productPrefix))
          .sort((a: any, b: any) => (b.spend || 0) - (a.spend || 0))
          .slice(0, 50);

        qualityScores = (cache.quality_scores || [])
          .filter((t: any) => (t.campaign || "").toLowerCase().includes(productPrefix))
          .sort((a: any, b: any) => (a.quality_score || 10) - (b.quality_score || 10))
          .slice(0, 30);
      }
    } catch { /* signals cache not available */ }

    // 3. Opportunity Score: campaigns with low IS + good efficiency = scale opportunity
    const opportunities = isData.rows
      .filter((r: any) => r.impression_share && parseFloat(r.impression_share) < 0.7)
      .map((r: any) => ({
        ...r,
        opportunity_score: ((1 - parseFloat(r.impression_share)) * parseFloat(r.spend || 0)).toFixed(0),
      }))
      .sort((a: any, b: any) => parseFloat(b.opportunity_score) - parseFloat(a.opportunity_score));

    return NextResponse.json({
      impression_share: isData.rows,
      search_terms: {
        top_performers: searchTerms.filter((t: any) => (t.conversions || 0) > 0).slice(0, 15),
        waste: searchTerms.filter((t: any) => (t.conversions || 0) === 0 && (t.spend || 0) > 100).slice(0, 15),
      },
      quality_scores: qualityScores,
      scale_opportunities: opportunities.slice(0, 10),
    });
  } catch (error: any) {
    console.error("Competitive API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
