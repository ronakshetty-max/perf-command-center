import { NextRequest } from "next/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "dummy";
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
const CUSTOM_HEADERS = process.env.ANTHROPIC_CUSTOM_HEADERS || "";

export async function POST(req: NextRequest) {
  const { prompt } = await req.json();
  if (!prompt) return Response.json({ error: "Missing prompt" }, { status: 400 });

  // Fetch live data for context
  let dataContext = "";
  try {
    const base = "http://localhost:3000";
    const [metaRes, googleRes] = await Promise.all([
      fetch(`${base}/api/meta?action=overall&product=rize`).then(r => r.json()).catch(() => null),
      fetch(`${base}/api/metrics?view=overall&business=rize&product=rize`).then(r => r.json()).catch(() => null),
    ]);
    const gS = googleRes?.summary || {};
    const mS = metaRes?.summary || {};
    const camps = [...(googleRes?.campaigns || []).slice(0, 6).map((c: any) => ({ name: c.campaign_name?.slice(0, 35), source: "Google", spend: parseFloat(c.spend || 0), leads: parseInt(c.leads || 0), payments: parseInt(c.payments || 0) })),
      ...(metaRes?.campaigns || []).slice(0, 3).map((c: any) => ({ name: c.campaign_name?.slice(0, 35), source: "Meta", spend: c.spend || 0, leads: c.leads || 0, payments: c.conversions || 0 }))];

    dataContext = `LIVE DATA:
Google Ads: Spend ₹${(parseFloat(gS.total_spend) || 0).toFixed(0)}, Leads ${gS.total_leads || 0}, Payments ${gS.total_payments || 0}
Meta Ads: Spend ₹${(mS.total_spend || 0).toFixed(0)}, Leads ${mS.total_leads || 0}, Payments ${mS.total_conversions || 0}
Total: Spend ₹${((parseFloat(gS.total_spend) || 0) + (mS.total_spend || 0)).toFixed(0)}, Leads ${(parseInt(gS.total_leads) || 0) + (mS.total_leads || 0)}, Payments ${(parseInt(gS.total_payments) || 0) + (mS.total_conversions || 0)}
Rize AOP Targets (Aug 2026): Budget ₹18.78L | Payments Target 686 | Leads 6,051 | CPP ₹2,738 | CPL ₹310 | L2P 11.3%
Unit Economics: Revenue ₹1,499/payment + Cross-sell LTV ₹15K = Total LTV ₹16.5K
Campaigns: ${JSON.stringify(camps)}`;
  } catch (e) {
    dataContext = "Use realistic sample data for Rize performance marketing (INR currency).";
  }

  const systemPrompt = `You are Marviz, an AI dashboard builder for Razorpay's Rize performance marketing. Generate a JSON dashboard spec.

${dataContext}

Return ONLY valid JSON (no markdown, no backticks) with this exact structure:
{
  "title": "short title",
  "components": [
    {
      "type": "kpi|bar|line|pie|doughnut|table",
      "title": "widget title",
      "w": 4|6|12,
      "data": { ... type-specific }
    }
  ]
}

Component data formats:
- kpi: {"items":[{"label":"Metric","value":"₹9.14L","hint":"vs target","direction":"up|down|neutral"}]}
- bar/line: {"labels":["A","B","C"],"datasets":[{"label":"Series","data":[1,2,3],"color":"#6366f1"}]}
- pie/doughnut: {"labels":["A","B"],"data":[60,40],"colors":["#6366f1","#8b5cf6"]}
- table: {"headers":["Col1","Col2"],"rows":[["val1","val2"]]}

Rules:
- Use REAL numbers from the live data above
- Generate 4-7 components
- KPIs: w=4, Charts: w=6 or 12, Tables: w=12
- Currency is INR (₹), use ₹XL or ₹XK format
- Be concise — titles under 25 chars`;

  // Build headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
  };
  if (CUSTOM_HEADERS) {
    CUSTOM_HEADERS.split(",").forEach(h => {
      const [k, ...v] = h.split(":");
      if (k && v.length) headers[k.trim()] = v.join(":").trim();
    });
  }

  // Stream from Claude
  const response = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      stream: true,
      messages: [{ role: "user", content: systemPrompt + "\n\nUser request: " + prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return Response.json({ error: `Claude API error: ${err.slice(0, 200)}` }, { status: 500 });
  }

  // Forward the stream
  return new Response(response.body, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}
