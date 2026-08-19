import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://localhost:5432/perf_marketing",
});

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
const ANTHROPIC_CUSTOM_HEADERS = process.env.ANTHROPIC_CUSTOM_HEADERS || "";

const SYSTEM_PROMPT = `You are the Rize Performance Marketing AI Analyst — a senior performance marketer embedded in the Razorpay growth team. You have access to real campaign data from Google Ads and backend conversion metrics.

KEY BUSINESS CONTEXT:
- Business: Rize (Razorpay's SMB/startup product)
- Primary conversion: Payment (not just lead/signup)
- CPP Cap: ₹2,700 (cost per payment ceiling)
- Funnel: Click → Lead/Signup → Payment
- L2P Rate: Lead-to-Payment conversion (backend truth)
- Categories: Brand, High-Intent, Generic, Competitor, Retargeting, PMax
- Platforms: Google Search, Google PMax, Meta

DEVICE TARGETING (from campaign names):
- Campaign name contains "Mweb" or "mweb" → Mobile Web campaign
- Campaign name contains "Dweb" or "dweb" → Desktop Web campaign
- Campaign name contains "AllDev" or "AllDevices" → All Devices (both mobile + desktop)
When user asks about "dweb", "mweb", "mobile", "desktop" performance — segment by these campaign name patterns.

YOUR CAPABILITIES:
1. Analyze campaign performance at any granularity (daily, weekly, monthly)
2. Identify scaling opportunities (low CPP + low impression share = room to grow)
3. Flag efficiency issues (CPP above cap, declining L2P, CPC inflation)
4. Recommend budget reallocation between campaigns/categories
5. Assess competitive dynamics using impression share gaps
6. Project targets — given a target, reverse-engineer required spend/efficiency
7. Segment performance by device (Mweb vs Dweb vs AllDevices) using campaign name patterns

RESPONSE STYLE:
- Be specific with numbers: "Increase IncorpTypes budget by ₹5K/day" not "increase budget"
- Quantify expected impact: "+12-15 payments at ~₹2,200 CPP"
- Use the actual data provided — never hallucinate campaign names or numbers
- When asked about targets, do the math: target payments × current CPP = required spend
- Format tables using markdown when showing comparisons
- Keep responses concise but data-rich
- Use ₹ for INR amounts, format lakhs as "₹X.XL"

CATEGORY CPP CAPS:
- Brand: ₹2,000
- High-Intent: ₹3,000
- Generic: ₹2,700
- Competitor: ₹4,000
- Retargeting: ₹4,000
- PMax: ₹2,700`;

interface Message {
  role: "user" | "assistant";
  content: string;
}

function loadLiveSignals(): string | null {
  const PIPELINE_DIR = join(process.cwd(), "..", "pipeline");
  const CACHE_FILE = join(PIPELINE_DIR, ".signals_cache.json");

  try {
    // Ensure cache exists (fetch if not)
    if (!existsSync(CACHE_FILE)) {
      try {
        execSync(`cd ${PIPELINE_DIR} && python3 fetch_live_signals.py`, {
          timeout: 25000,
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch { return null; }
    }

    if (!existsSync(CACHE_FILE)) return null;

    const raw = JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
    const sections: string[] = ["\n## LIVE GOOGLE ADS SIGNALS (Real-time from API)"];

    // Search terms (Rize only)
    const searchTerms = (raw.search_terms || []).filter((r: any) => r.campaign?.includes("RRize"));
    if (searchTerms.length > 0) {
      sections.push("\n### Search Terms (Top by spend — what queries trigger Rize ads)");
      sections.push("| Campaign | Search Term | Clicks | Spend | Conversions | CTR |");
      sections.push("|----------|-------------|--------|-------|-------------|-----|");
      for (const t of searchTerms.slice(0, 15)) {
        const name = t.campaign.replace("RRize-RPPerf-", "").substring(0, 30);
        sections.push(`| ${name} | ${t.search_term} | ${t.clicks} | ₹${Math.round(t.spend).toLocaleString()} | ${t.conversions} | ${(t.ctr * 100).toFixed(1)}% |`);
      }
    }

    // Quality scores (Rize only)
    const qs = (raw.quality_scores || []).filter((r: any) => r.campaign?.includes("RRize"));
    if (qs.length > 0) {
      sections.push("\n### Keyword Quality Scores");
      sections.push("| Campaign | Keyword | QS | Ad Relevance | Landing Page | Expected CTR | Spend |");
      sections.push("|----------|---------|----|----|---|---|---|");
      for (const q of qs.slice(0, 12)) {
        const name = q.campaign.replace("RRize-RPPerf-", "").substring(0, 25);
        sections.push(`| ${name} | ${q.keyword} | ${q.quality_score}/10 | ${q.ad_relevance} | ${q.landing_page_exp} | ${q.expected_ctr} | ₹${Math.round(q.spend).toLocaleString()} |`);
      }
    }

    // Budget & bid data (Rize only)
    const budgets = (raw.budget_bid_data || []).filter((r: any) => r.campaign?.includes("RRize"));
    if (budgets.length > 0) {
      sections.push("\n### Budget & Bid Strategy (Live)");
      sections.push("| Campaign | Daily Budget | Bid Strategy | Target CPA | 7d Spend | IS% | Lost IS (Budget) | Lost IS (Rank) |");
      sections.push("|----------|-------------|---|---|---|---|---|---|");
      for (const b of budgets) {
        const name = b.campaign.replace("RRize-RPPerf-", "").substring(0, 30);
        sections.push(`| ${name} | ₹${b.daily_budget?.toLocaleString() || "—"} | ${b.bid_strategy} | ₹${b.target_cpa?.toLocaleString() || "—"} | ₹${Math.round(b.actual_spend_7d).toLocaleString()} | ${((b.impression_share || 0) * 100).toFixed(0)}% | ${((b.lost_is_budget || 0) * 100).toFixed(0)}% | ${((b.lost_is_rank || 0) * 100).toFixed(0)}% |`);
      }
    }

    // Device splits (Rize only)
    const devices = (raw.device_splits || []).filter((r: any) => r.campaign?.includes("RRize"));
    if (devices.length > 0) {
      // Aggregate by device
      const byDevice: Record<string, { spend: number; clicks: number; conversions: number }> = {};
      for (const d of devices) {
        if (!byDevice[d.device]) byDevice[d.device] = { spend: 0, clicks: 0, conversions: 0 };
        byDevice[d.device].spend += d.spend;
        byDevice[d.device].clicks += d.clicks;
        byDevice[d.device].conversions += d.conversions;
      }
      sections.push("\n### Device Performance (Rize, 14-day aggregate)");
      sections.push("| Device | Spend | Clicks | Conversions | CPC |");
      sections.push("|--------|-------|--------|-------------|-----|");
      for (const [device, agg] of Object.entries(byDevice)) {
        const cpc = agg.clicks > 0 ? Math.round(agg.spend / agg.clicks) : 0;
        sections.push(`| ${device} | ₹${Math.round(agg.spend).toLocaleString()} | ${agg.clicks} | ${agg.conversions.toFixed(1)} | ₹${cpc} |`);
      }
    }

    // Hourly patterns (aggregate for Rize)
    const hourly = (raw.hourly_performance || []).filter((r: any) => r.campaign?.includes("RRize"));
    if (hourly.length > 0) {
      const byHour: Record<number, { spend: number; conversions: number }> = {};
      for (const h of hourly) {
        if (!byHour[h.hour]) byHour[h.hour] = { spend: 0, conversions: 0 };
        byHour[h.hour].spend += h.spend;
        byHour[h.hour].conversions += h.conversions;
      }
      sections.push("\n### Hourly Conversion Pattern (Rize aggregate)");
      sections.push("| Hour | Spend | Conversions | CPA |");
      sections.push("|------|-------|-------------|-----|");
      const sortedHours = Object.keys(byHour).map(Number).sort((a, b) => a - b);
      for (const hour of sortedHours) {
        const agg = byHour[hour];
        const cpa = agg.conversions > 0 ? Math.round(agg.spend / agg.conversions) : 0;
        sections.push(`| ${hour}:00 | ₹${Math.round(agg.spend).toLocaleString()} | ${agg.conversions.toFixed(1)} | ₹${cpa || "—"} |`);
      }
    }

    return sections.length > 1 ? sections.join("\n") : null;
  } catch (e) {
    return null;
  }
}

async function buildDataContext(): Promise<string> {
  const sections: string[] = [];

  try {
    // Campaign performance summary (last 30 days)
    const perfResult = await pool.query(`
      SELECT
        c.campaign_name,
        p.category,
        SUM(p.spend)::numeric(12,2) as spend,
        SUM(p.impressions) as impressions,
        SUM(p.clicks) as clicks,
        SUM(p.backend_leads) as leads,
        SUM(p.backend_payments) as payments,
        CASE WHEN SUM(p.backend_payments) > 0
          THEN ROUND((SUM(p.spend) / SUM(p.backend_payments))::numeric, 0) END as cpp,
        CASE WHEN SUM(p.backend_leads) > 0
          THEN ROUND((SUM(p.spend) / SUM(p.backend_leads))::numeric, 0) END as cpl,
        CASE WHEN SUM(p.backend_leads) > 0
          THEN ROUND((SUM(p.backend_payments)::numeric / SUM(p.backend_leads)) * 100, 1) END as l2p_pct,
        CASE WHEN SUM(p.clicks) > 0
          THEN ROUND((SUM(p.spend) / SUM(p.clicks))::numeric, 0) END as cpc,
        ROUND(AVG(p.impression_share)::numeric * 100, 1) as is_pct
      FROM daily_campaign_performance p
      JOIN campaigns c ON c.id = p.campaign_id
      WHERE p.business_id = 'eb'
        AND p.date >= (SELECT MAX(date) - 29 FROM daily_campaign_performance WHERE business_id = 'eb')
      GROUP BY c.campaign_name, p.category
      ORDER BY spend DESC
    `);

    if (perfResult.rows.length > 0) {
      sections.push("## CAMPAIGN PERFORMANCE (Last 14 Days)");
      sections.push("| Campaign | Category | Spend | Leads | Payments | CPL | CPP | L2P% | CPC | IS% |");
      sections.push("|----------|----------|-------|-------|----------|-----|-----|------|-----|-----|");
      for (const r of perfResult.rows) {
        const name = r.campaign_name.replace(/RRize-RPPerf-/g, "").replace(/-/g, " ").substring(0, 40);
        sections.push(
          `| ${name} | ${r.category} | ₹${Number(r.spend).toLocaleString()} | ${r.leads || 0} | ${r.payments || 0} | ₹${r.cpl || "—"} | ₹${r.cpp || "—"} | ${r.l2p_pct || "—"}% | ₹${r.cpc || "—"} | ${r.is_pct || "—"}% |`
        );
      }
    }

    // Daily trend (last 7 days)
    const trendResult = await pool.query(`
      SELECT
        date,
        SUM(spend)::numeric(12,2) as spend,
        SUM(backend_leads) as leads,
        SUM(backend_payments) as payments,
        CASE WHEN SUM(backend_payments) > 0
          THEN ROUND((SUM(spend) / SUM(backend_payments))::numeric, 0) END as cpp
      FROM daily_campaign_performance
      WHERE business_id = 'eb'
        AND date >= (SELECT MAX(date) - 6 FROM daily_campaign_performance WHERE business_id = 'eb')
      GROUP BY date
      ORDER BY date
    `);

    if (trendResult.rows.length > 0) {
      sections.push("\n## DAILY TREND (Last 7 Days)");
      sections.push("| Date | Spend | Leads | Payments | CPP |");
      sections.push("|------|-------|-------|----------|-----|");
      for (const r of trendResult.rows) {
        sections.push(`| ${r.date} | ₹${Number(r.spend).toLocaleString()} | ${r.leads} | ${r.payments} | ₹${r.cpp || "—"} |`);
      }
    }

    // Category totals
    const catResult = await pool.query(`
      SELECT
        category,
        SUM(spend)::numeric(12,2) as spend,
        SUM(backend_payments) as payments,
        CASE WHEN SUM(backend_payments) > 0
          THEN ROUND((SUM(spend) / SUM(backend_payments))::numeric, 0) END as cpp,
        ROUND(AVG(impression_share)::numeric * 100, 1) as avg_is
      FROM daily_campaign_performance
      WHERE business_id = 'eb'
      GROUP BY category
      ORDER BY spend DESC
    `);

    if (catResult.rows.length > 0) {
      sections.push("\n## CATEGORY TOTALS (All Time)");
      sections.push("| Category | Total Spend | Payments | CPP | Avg IS% |");
      sections.push("|----------|-------------|----------|-----|---------|");
      for (const r of catResult.rows) {
        sections.push(`| ${r.category} | ₹${Number(r.spend).toLocaleString()} | ${r.payments} | ₹${r.cpp || "—"} | ${r.avg_is || "—"}% |`);
      }
      const totalSpend = catResult.rows.reduce((s: number, r: any) => s + Number(r.spend), 0);
      const totalPayments = catResult.rows.reduce((s: number, r: any) => s + Number(r.payments || 0), 0);
      const blendedCpp = totalPayments > 0 ? Math.round(totalSpend / totalPayments) : 0;
      sections.push(`\n**TOTALS: Spend ₹${Math.round(totalSpend).toLocaleString()} | Payments: ${totalPayments} | Blended CPP: ₹${blendedCpp}**`);
    }

    // Device-segmented performance (by campaign name pattern)
    const deviceResult = await pool.query(`
      SELECT
        CASE
          WHEN c.campaign_name ILIKE '%mweb%' THEN 'Mweb'
          WHEN c.campaign_name ILIKE '%dweb%' THEN 'Dweb'
          WHEN c.campaign_name ILIKE '%alldev%' THEN 'AllDevices'
          ELSE 'Other'
        END as device_target,
        c.campaign_name,
        p.category,
        SUM(p.spend)::numeric(12,2) as spend,
        SUM(p.impressions) as impressions,
        SUM(p.clicks) as clicks,
        SUM(p.backend_leads) as leads,
        SUM(p.backend_payments) as payments,
        CASE WHEN SUM(p.backend_payments) > 0
          THEN ROUND((SUM(p.spend) / SUM(p.backend_payments))::numeric, 0) END as cpp,
        CASE WHEN SUM(p.backend_leads) > 0
          THEN ROUND((SUM(p.backend_payments)::numeric / SUM(p.backend_leads)) * 100, 1) END as l2p_pct,
        ROUND(AVG(p.impression_share)::numeric * 100, 1) as is_pct
      FROM daily_campaign_performance p
      JOIN campaigns c ON c.id = p.campaign_id
      WHERE p.business_id = 'eb'
        AND p.date >= (SELECT MAX(date) - 29 FROM daily_campaign_performance WHERE business_id = 'eb')
      GROUP BY device_target, c.campaign_name, p.category
      ORDER BY device_target, spend DESC
    `);

    if (deviceResult.rows.length > 0) {
      sections.push("\n## DEVICE TARGETING BREAKDOWN (Last 30 Days)");
      sections.push("(Mweb = mobile web campaigns, Dweb = desktop campaigns, AllDevices = both)");

      // Aggregate by device target
      const deviceAgg: Record<string, { spend: number; leads: number; payments: number; clicks: number }> = {};
      for (const r of deviceResult.rows) {
        const dt = r.device_target;
        if (!deviceAgg[dt]) deviceAgg[dt] = { spend: 0, leads: 0, payments: 0, clicks: 0 };
        deviceAgg[dt].spend += Number(r.spend);
        deviceAgg[dt].leads += Number(r.leads || 0);
        deviceAgg[dt].payments += Number(r.payments || 0);
        deviceAgg[dt].clicks += Number(r.clicks || 0);
      }

      sections.push("\n### Summary by Device Target");
      sections.push("| Device | Spend | Leads | Payments | CPP | L2P% |");
      sections.push("|--------|-------|-------|----------|-----|------|");
      for (const [dt, agg] of Object.entries(deviceAgg)) {
        const cpp = agg.payments > 0 ? Math.round(agg.spend / agg.payments) : 0;
        const l2p = agg.leads > 0 ? ((agg.payments / agg.leads) * 100).toFixed(1) : "—";
        sections.push(`| ${dt} | ₹${Math.round(agg.spend).toLocaleString()} | ${agg.leads} | ${agg.payments} | ₹${cpp || "—"} | ${l2p}% |`);
      }

      sections.push("\n### Campaigns by Device Target");
      sections.push("| Device | Campaign | Category | Spend | Pmts | CPP | IS% |");
      sections.push("|--------|----------|----------|-------|------|-----|-----|");
      for (const r of deviceResult.rows) {
        const name = r.campaign_name.replace(/RRize-RPPerf-/g, "").replace(/GSearch-Prospect-/g, "").substring(0, 35);
        sections.push(`| ${r.device_target} | ${name} | ${r.category} | ₹${Math.round(Number(r.spend)).toLocaleString()} | ${r.payments || 0} | ₹${r.cpp || "—"} | ${r.is_pct || "—"}% |`);
      }
    }

    // Monthly summary (full history)
    const monthlyResult = await pool.query(`
      SELECT
        TO_CHAR(date_trunc('month', date), 'YYYY-MM') as month,
        SUM(spend)::numeric(12,2) as spend,
        SUM(backend_leads) as leads,
        SUM(backend_payments) as payments,
        CASE WHEN SUM(backend_payments) > 0
          THEN ROUND((SUM(spend) / SUM(backend_payments))::numeric, 0) END as cpp,
        COUNT(DISTINCT campaign_id) as active_campaigns
      FROM daily_campaign_performance
      WHERE business_id = 'eb'
      GROUP BY date_trunc('month', date)
      ORDER BY month
    `);

    if (monthlyResult.rows.length > 0) {
      sections.push("\n## MONTHLY SUMMARY (Full History)");
      sections.push("| Month | Spend | Leads | Payments | CPP | Active Campaigns |");
      sections.push("|-------|-------|-------|----------|-----|-----------------|");
      for (const r of monthlyResult.rows) {
        sections.push(`| ${r.month} | ₹${Math.round(Number(r.spend)).toLocaleString()} | ${r.leads || 0} | ${r.payments || 0} | ₹${r.cpp || "—"} | ${r.active_campaigns} |`);
      }
    }

    // Data availability note
    const rangeResult = await pool.query(`
      SELECT MIN(date) as earliest, MAX(date) as latest, COUNT(DISTINCT date) as days
      FROM daily_campaign_performance WHERE business_id = 'eb'
    `);
    if (rangeResult.rows[0]) {
      const r = rangeResult.rows[0];
      sections.push(`\n**DATA AVAILABLE: ${r.earliest} to ${r.latest} (${r.days} days). Google Ads + Backend metrics joined.**`);
    }

    // Live Google Ads signals
    const signalsContext = loadLiveSignals();
    if (signalsContext) {
      sections.push(signalsContext);
    }

  } catch (error) {
    sections.push("\n[Data context partially unavailable — answering based on available information]");
  }

  return sections.join("\n");
}

export async function POST(request: NextRequest) {
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { message, history = [] } = body as { message: string; history: Message[] };

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const dataContext = await buildDataContext();

    const messages = [
      ...history.slice(-10).map((m: Message) => ({
        role: m.role,
        content: m.content,
      })),
      {
        role: "user" as const,
        content: `Here is the current campaign data for context:\n\n${dataContext}\n\n---\n\nUser question: ${message}`,
      },
    ];

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    };

    // Support Razorpay's LLM gateway with custom headers
    if (ANTHROPIC_CUSTOM_HEADERS) {
      // Parse "x-litellm-api-key: Bearer sk-xxx" format
      const parts = ANTHROPIC_CUSTOM_HEADERS.split(": ");
      if (parts.length >= 2) {
        headers[parts[0].trim()] = parts.slice(1).join(": ").trim();
      }
    } else {
      headers["x-api-key"] = ANTHROPIC_API_KEY!;
    }

    const response = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 16000,
        thinking: { type: "enabled", budget_tokens: 5000 },
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("Anthropic API error:", errBody);
      return NextResponse.json(
        { error: "AI service error", detail: errBody },
        { status: 502 }
      );
    }

    const rawText = await response.text();
    console.log("AI Raw Response:", rawText.substring(0, 800));
    let aiResponse: any;
    try {
      aiResponse = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ response: rawText.substring(0, 2000), dataContextUsed: true });
    }

    // Handle Anthropic format — content array may have thinking blocks before text
    let assistantMessage: string | null = null;

    if (Array.isArray(aiResponse.content)) {
      const textBlock = aiResponse.content.find((b: any) => b.type === "text");
      if (textBlock) assistantMessage = textBlock.text;
    }

    // Fallback for other gateway formats
    if (!assistantMessage) {
      assistantMessage =
        aiResponse.choices?.[0]?.message?.content ||
        aiResponse.text ||
        null;
    }

    if (!assistantMessage) {
      assistantMessage = "I couldn't generate a response. Please try again.";
    }

    return NextResponse.json({
      response: assistantMessage,
      dataContextUsed: true,
    });
  } catch (error: any) {
    console.error("Agent API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
