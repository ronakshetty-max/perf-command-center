import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
const ANTHROPIC_CUSTOM_HEADERS = process.env.ANTHROPIC_CUSTOM_HEADERS;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://localhost:5432/perf_marketing",
});

const PRODUCT_CONFIG: Record<string, { business: string; filter: string; conversionCol: string; funnelLabel: string }> = {
  domestic_pg: { business: "eb", filter: "campaign_name ILIKE '%rpsme%' OR campaign_name ILIKE '%rphql%'", conversionCol: "backend_mtu", funnelLabel: "Signups → L2 → New MTU" },
  rize: { business: "rize", filter: "campaign_name ILIKE '%rize%'", conversionCol: "backend_payments", funnelLabel: "Leads → Payments" },
  cards: { business: "crossborder", filter: "campaign_name ILIKE '%rpipc%'", conversionCol: "backend_mtu", funnelLabel: "Signups → L2 → MTU" },
};

const META_ADS_ACCESS_TOKEN = process.env.META_ADS_ACCESS_TOKEN;
const META_ADS_ACCOUNT_ID = process.env.META_ADS_ACCOUNT_ID || "act_2610976695640512";

async function fetchMetaInsightsForBrain(product: string): Promise<any[]> {
  if (!META_ADS_ACCESS_TOKEN) return [];
  const filterMap: Record<string, string> = { rize: "Rize", domestic_pg: "RPSME", cards: "RPIPC" };
  const filterValue = filterMap[product] || "Rize";
  const end = new Date(); end.setDate(end.getDate() - 1);
  const start = new Date(end); start.setDate(start.getDate() - 13);
  const timeRange = JSON.stringify({ since: start.toISOString().split("T")[0], until: end.toISOString().split("T")[0] });

  try {
    const url = new URL(`https://graph.facebook.com/v22.0/${META_ADS_ACCOUNT_ID}/insights`);
    url.searchParams.set("access_token", META_ADS_ACCESS_TOKEN);
    url.searchParams.set("fields", "campaign_id,campaign_name,spend,impressions,clicks,actions,cpc,ctr,reach");
    url.searchParams.set("time_range", timeRange);
    url.searchParams.set("time_increment", "all_days");
    url.searchParams.set("level", "campaign");
    url.searchParams.set("filtering", JSON.stringify([{ field: "campaign.name", operator: "CONTAIN", value: filterValue }]));
    url.searchParams.set("limit", "50");
    const resp = await fetch(url.toString());
    if (!resp.ok) return [];
    const result = await resp.json();
    return (result.data || []).map((r: any) => {
      const actions = r.actions || [];
      let leads = 0, conversions = 0;
      for (const a of actions) {
        const v = parseInt(a.value || "0");
        if (a.action_type === "lead" || a.action_type === "offsite_conversion.fb_pixel_lead") leads += v;
        if (["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase", "complete_registration"].includes(a.action_type)) conversions += v;
      }
      return { name: r.campaign_name, platform: "meta", spend: Math.round(parseFloat(r.spend || "0")), impressions: parseInt(r.impressions || "0"), clicks: parseInt(r.clicks || "0"), leads, conversions, cpc: parseFloat(r.cpc || "0").toFixed(1), reach: parseInt(r.reach || "0") };
    });
  } catch { return []; }
}

const SYSTEM_PROMPT = `You are the performance marketing lead at Razorpay. You OWN these campaigns. Your job is to maximize conversions at target unit economics. You have full authority to make decisions.

You analyze campaigns across Google Ads AND Meta Ads, in 5 categories:
- **bidding**: budget allocation, bid strategy changes, scale up/down, pause/shift (both platforms)
- **keywords**: add new keywords (from converting search terms), negate wasted terms, match type changes (Google)
- **tracking**: conversion action issues, attribution gaps, setup fixes (both platforms)
- **creative**: ad copy tests, landing page issues (from QS data), extension suggestions (both platforms)
- **cross-platform**: budget reallocation between Google and Meta, audience overlap, channel mix optimization

You think like an independent growth marketer:
- Makes decisive calls, not suggestions. "Add X as negative" not "Consider adding"
- Quantifies everything with exact numbers
- For keywords: analyze search terms — terms with spend + 0 conversions = negate them. Terms converting under broad match = add as exact/phrase.
- For bidding: identify inefficient spend, IS gaps, and reallocation opportunities

You MUST respond with a JSON array of action objects. Each object:
{
  "priority": "high" | "medium" | "low",
  "category": "bidding" | "keywords" | "tracking" | "creative" | "cross-platform",
  "confidence": "high" | "medium",
  "campaign": "exact campaign name or 'Account-level'",
  "level": "campaign" | "search_term" | "keyword" | "account" | "ad_group",
  "title": "one-line action (imperative, specific, e.g. 'Add payment gateway as exact match keyword')",
  "action": "specific step-by-step instruction to implement in Google Ads",
  "reasoning": "2-3 sentences with exact numbers",
  "expected_impact": "quantified outcome"
}

Return 10-15 actions across all categories. Include at least 3 keyword suggestions (negatives or additions from search term data).
ONLY output the JSON array, no other text.`;

async function buildContext(product: string) {
  const config = PRODUCT_CONFIG[product] || PRODUCT_CONFIG.domestic_pg;
  const { business, filter, conversionCol } = config;

  const campaignPerf = await pool.query(`
    SELECT c.campaign_name, c.category, c.platform,
      SUM(p.spend)::numeric as spend, SUM(p.impressions) as impressions, SUM(p.clicks) as clicks,
      SUM(p.backend_leads) as leads, SUM(p.${conversionCol}) as conversions,
      CASE WHEN SUM(p.backend_leads) > 0 THEN (SUM(p.spend) / SUM(p.backend_leads))::numeric END as cpl,
      CASE WHEN SUM(p.${conversionCol}) > 0 THEN (SUM(p.spend) / SUM(p.${conversionCol}))::numeric END as cpp,
      CASE WHEN SUM(p.backend_leads) > 0 THEN (SUM(p.${conversionCol})::numeric / SUM(p.backend_leads)) END as conversion_rate,
      AVG(p.impression_share)::numeric as avg_is,
      CASE WHEN SUM(p.clicks) > 0 THEN (SUM(p.spend) / SUM(p.clicks))::numeric END as cpc,
      COUNT(DISTINCT p.date) as active_days
    FROM daily_campaign_performance p
    JOIN campaigns c ON c.id = p.campaign_id
    WHERE c.business_id = '${business}' AND (${filter})
      AND p.date >= (SELECT MAX(date) - 13 FROM daily_campaign_performance WHERE business_id = '${business}')
    GROUP BY c.campaign_name, c.category, c.platform
    ORDER BY spend DESC
  `);

  const dailyTrend = await pool.query(`
    SELECT p.date, SUM(p.spend)::numeric as spend, SUM(p.backend_leads) as leads,
      SUM(p.${conversionCol}) as conversions,
      CASE WHEN SUM(p.${conversionCol}) > 0 THEN (SUM(p.spend) / SUM(p.${conversionCol}))::numeric END as cpp
    FROM daily_campaign_performance p
    JOIN campaigns c ON c.id = p.campaign_id
    WHERE c.business_id = '${business}' AND (${filter})
      AND p.date >= (SELECT MAX(date) - 13 FROM daily_campaign_performance WHERE business_id = '${business}')
    GROUP BY p.date ORDER BY p.date
  `);

  const categoryBreakdown = await pool.query(`
    SELECT c.category, SUM(p.spend)::numeric as spend, SUM(p.backend_leads) as leads,
      SUM(p.${conversionCol}) as conversions,
      CASE WHEN SUM(p.${conversionCol}) > 0 THEN (SUM(p.spend) / SUM(p.${conversionCol}))::numeric END as cpp,
      CASE WHEN SUM(p.backend_leads) > 0 THEN (SUM(p.${conversionCol})::numeric / SUM(p.backend_leads)) END as conv_rate,
      AVG(p.impression_share)::numeric as avg_is
    FROM daily_campaign_performance p
    JOIN campaigns c ON c.id = p.campaign_id
    WHERE c.business_id = '${business}' AND (${filter})
      AND p.date >= (SELECT MAX(date) - 13 FROM daily_campaign_performance WHERE business_id = '${business}')
    GROUP BY c.category ORDER BY spend DESC
  `);

  const zeroDays = await pool.query(`
    SELECT c.campaign_name, COUNT(*) as zero_days, SUM(p.spend)::numeric as spend_wasted
    FROM daily_campaign_performance p
    JOIN campaigns c ON c.id = p.campaign_id
    WHERE c.business_id = '${business}' AND (${filter})
      AND p.${conversionCol} = 0 AND p.spend > 0
      AND p.date >= (SELECT MAX(date) - 6 FROM daily_campaign_performance WHERE business_id = '${business}')
    GROUP BY c.campaign_name
    HAVING COUNT(*) >= 3 AND SUM(p.spend) > 5000
    ORDER BY spend_wasted DESC
  `);

  let playbook = "";
  try {
    playbook = readFileSync(join(process.cwd(), "../../packages/pipeline/src/brain/playbook.md"), "utf-8");
  } catch {
    try {
      playbook = readFileSync(join(process.cwd(), "../pipeline/src/brain/playbook.md"), "utf-8");
    } catch { /* playbook not found, proceed without */ }
  }

  // Fetch past lessons from memory
  let pastLessons: any[] = [];
  let institutionalPatterns: string = "";
  try {
    const memResult = await pool.query(`
      SELECT action_taken, campaign, outcome, lesson, date_acted
      FROM brain_memory WHERE product = $1 AND outcome != 'pending' AND lesson IS NOT NULL
      AND action_taken != 'PATTERN_RECOGNITION'
      ORDER BY created_at DESC LIMIT 10
    `, [product]);
    pastLessons = memResult.rows;

    // Get institutional patterns
    const patternResult = await pool.query(`
      SELECT lesson FROM brain_memory
      WHERE product = $1 AND action_taken = 'PATTERN_RECOGNITION'
      ORDER BY created_at DESC LIMIT 1
    `, [product]);
    if (patternResult.rows.length > 0) {
      institutionalPatterns = patternResult.rows[0].lesson;
    }
  } catch { /* no memory yet */ }

  let searchTerms: any[] = [];
  let qualityScores: any[] = [];
  try {
    const cachePath = join(process.cwd(), "../../packages/pipeline/.signals_cache.json");
    if (existsSync(cachePath)) {
      const cache = JSON.parse(readFileSync(cachePath, "utf-8"));
      const prefix = product === "rize" ? "rize" : product === "cards" ? "rpipc" : "rpsme";
      searchTerms = (cache.search_terms || []).filter((t: any) => (t.campaign || "").toLowerCase().includes(prefix));
      qualityScores = (cache.quality_scores || []).filter((t: any) => (t.campaign || "").toLowerCase().includes(prefix));
    }
  } catch { /* no cache */ }

  return {
    product,
    funnel: config.funnelLabel,
    playbook: playbook.slice(0, 2000),
    campaigns: campaignPerf.rows,
    daily_trend: dailyTrend.rows,
    category_breakdown: categoryBreakdown.rows,
    zero_conversion_campaigns: zeroDays.rows,
    search_terms: searchTerms,
    quality_scores: qualityScores,
    past_lessons: pastLessons,
    institutional_patterns: institutionalPatterns,
  };
}

export async function POST(request: NextRequest) {
  const { product = "domestic_pg" } = await request.json();

  try {
    const context = await buildContext(product);
    const metaCampaigns = await fetchMetaInsightsForBrain(product);

    const topCampaigns = context.campaigns.slice(0, 20).map((c: any) => ({
      name: c.campaign_name, cat: c.category, spend: Math.round(c.spend), leads: c.leads, conv: c.conversions,
      cpl: c.cpl ? Math.round(c.cpl) : null, cpp: c.cpp ? Math.round(c.cpp) : null,
      conv_rate: c.conversion_rate ? (c.conversion_rate * 100).toFixed(1) + "%" : null, is: c.avg_is ? (c.avg_is * 100).toFixed(0) + "%" : null,
    }));

    const wasteTerms = context.search_terms
      .filter((t: any) => (t.conversions || 0) === 0 && (t.spend || 0) > 200)
      .sort((a: any, b: any) => b.spend - a.spend)
      .slice(0, 10)
      .map((t: any) => ({ term: t.search_term, campaign: t.campaign, spend: Math.round(t.spend), clicks: t.clicks }));

    const convertingTerms = context.search_terms
      .filter((t: any) => (t.conversions || 0) > 0)
      .sort((a: any, b: any) => b.conversions - a.conversions)
      .slice(0, 10)
      .map((t: any) => ({ term: t.search_term, campaign: t.campaign, conv: t.conversions, spend: Math.round(t.spend), match: t.match_status }));

    const lowQS = context.quality_scores
      .filter((qs: any) => qs.quality_score <= 5)
      .slice(0, 8)
      .map((qs: any) => ({ keyword: qs.keyword, campaign: qs.campaign, qs: qs.quality_score, ad_rel: qs.ad_relevance, lp: qs.landing_page_exp, spend: Math.round(qs.spend || 0) }));

    const userMessage = `Analyze and produce categorized optimization recommendations.

PRODUCT: ${context.product} (${context.funnel})

KEY RULES: Scale if CPP<70% cap + IS<80%. Pause if 0 conversions 5+ days. Negate search terms with spend>₹200 and 0 conversions. Add converting broad-match terms as exact/phrase.

TOP 20 CAMPAIGNS (14 days):
${JSON.stringify(topCampaigns)}

CATEGORIES: ${JSON.stringify(context.category_breakdown.map((c: any) => ({ cat: c.category, spend: Math.round(c.spend), conv: c.conversions, cpp: c.cpp ? Math.round(c.cpp) : null, is: c.avg_is ? (c.avg_is * 100).toFixed(0) + "%" : null })))}

ZERO-CONV CAMPAIGNS (7d): ${JSON.stringify(context.zero_conversion_campaigns.map((c: any) => ({ name: c.campaign_name, spend_wasted: Math.round(c.spend_wasted), days: c.zero_days })))}

SEARCH TERMS — WASTED (spend > ₹200, 0 conversions — suggest as negatives):
${JSON.stringify(wasteTerms)}

SEARCH TERMS — CONVERTING (add as exact/phrase match if on broad):
${JSON.stringify(convertingTerms)}

LOW QUALITY SCORE KEYWORDS (QS ≤ 5 — fix ad relevance or landing page):
${JSON.stringify(lowQS)}

PAST ACTIONS & LESSONS (what worked/didn't work historically — use this to calibrate confidence):
${context.past_lessons.length > 0 ? JSON.stringify(context.past_lessons.map((l: any) => ({ action: l.action_taken, campaign: l.campaign, outcome: l.outcome, lesson: l.lesson }))) : "No history yet — first analysis."}

INSTITUTIONAL KNOWLEDGE (proven patterns from repeated observations):
${context.institutional_patterns || "None yet — will build as more actions are tracked and measured."}

META ADS CAMPAIGNS (14 days — analyze alongside Google campaigns for cross-platform optimization):
${metaCampaigns.length > 0 ? JSON.stringify(metaCampaigns) : "No Meta data available for this product."}

Produce 10-15 categorized actions as a JSON array. Include Meta-specific recommendations if Meta data is available (budget reallocation between Google and Meta, audience overlap, creative refresh). Factor in past lessons — if something failed before, don't repeat it. If something worked, recommend similar actions with higher confidence. No code fences, ONLY the raw JSON array.`;

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
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return NextResponse.json({ error: `Claude API error: ${errBody.slice(0, 200)}` }, { status: 500 });
    }

    const result = await response.json();
    const contentBlocks = result.content || [];
    const types = contentBlocks.map((c: any) => c.type);
    console.log("Brain: content block types:", types, "stop_reason:", result.stop_reason);
    const textBlock = contentBlocks.find((c: any) => c.type === "text");
    console.log("Brain: text block length:", textBlock?.text?.length || 0);
    const text = textBlock?.text
      || result.choices?.[0]?.message?.content
      || (typeof result.content === "string" ? result.content : "");

    let actions = [];
    try {
      const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        let jsonStr = jsonMatch[0];
        // Handle truncated JSON by closing any open objects/arrays
        const openBraces = (jsonStr.match(/{/g) || []).length;
        const closeBraces = (jsonStr.match(/}/g) || []).length;
        if (openBraces > closeBraces) {
          // Truncate to last complete object
          const lastCompleteObj = jsonStr.lastIndexOf("},");
          if (lastCompleteObj > 0) {
            jsonStr = jsonStr.slice(0, lastCompleteObj + 1) + "]";
          }
        }
        actions = JSON.parse(jsonStr);
      } else {
        console.log("Brain: No JSON array found. Text:", cleaned.slice(0, 200));
        actions = [{ priority: "P2", action_type: "FIX", campaign: "System", title: "Analysis completed — see raw output", reasoning: cleaned.slice(0, 400), expected_impact: "Review manually", risk_if_ignored: "N/A", timeframe: "Now" }];
      }
    } catch (e: any) {
      console.log("Brain: JSON parse error:", e.message);
      const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      actions = [{ priority: "P2", action_type: "FIX", campaign: "System", title: "Analysis completed (partial)", reasoning: cleaned.slice(0, 400), expected_impact: "Review manually", risk_if_ignored: "N/A", timeframe: "Now" }];
    }

    return NextResponse.json({ actions, generated_at: new Date().toISOString(), product });
  } catch (error: any) {
    console.error("Brain API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
