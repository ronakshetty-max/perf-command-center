"use client";

import { useEffect, useState } from "react";
import { formatCurrency, formatPercent } from "@/lib/constants";

interface Props {
  product?: string;
}

const PREBUILT_VIEWS = [
  { id: "monthly_trend", label: "Monthly Trend", icon: "📈", desc: "6-month spend, conversions, and efficiency" },
  { id: "wow", label: "WoW Performance", icon: "📊", desc: "This week vs last week across all metrics" },
  { id: "category_scorecard", label: "Category Scorecard", icon: "🏆", desc: "All categories ranked by efficiency" },
  { id: "campaign_health", label: "Campaign Health", icon: "🩺", desc: "All campaigns color-coded by performance" },
  { id: "funnel_leakage", label: "Funnel Leakage", icon: "🔻", desc: "Where conversions drop off at each stage" },
  { id: "top_movers", label: "Top Movers", icon: "🚀", desc: "Campaigns with biggest WoW changes (+/-)" },
];

const METRICS = ["Spend", "Signups/Leads", "L2", "MTU/Payments", "CPP/CP-MTU", "CPC", "CTR", "Impression Share"];
const TIME_RANGES = ["Last 7 Days", "Last 14 Days", "Last 30 Days", "Last 3 Months", "Last 6 Months"];
const GROUP_BY = ["By Category", "By Campaign", "By Platform", "By Day", "By Week", "By Month"];

interface ViewData {
  title: string;
  rows: any[];
  columns: string[];
}

export default function DynamicViewTab({ product = "domestic_pg" }: Props) {
  const [activeView, setActiveView] = useState<string | null>(null);
  const [viewData, setViewData] = useState<ViewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [customMetric, setCustomMetric] = useState("Spend");
  const [customTime, setCustomTime] = useState("Last 14 Days");
  const [customGroup, setCustomGroup] = useState("By Category");
  const [customQuery, setCustomQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadPrebuiltView = async (viewId: string) => {
    setActiveView(viewId);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/custom-view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ view: viewId, product }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); }
      else { setViewData(data); }
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  const loadCustomView = async () => {
    setActiveView("custom_builder");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/custom-view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ view: "custom", product, metric: customMetric, time: customTime, groupBy: customGroup }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); }
      else { setViewData(data); }
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  const loadAIView = async () => {
    if (!customQuery.trim()) return;
    setActiveView("ai_query");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/dynamic-view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: customQuery, product }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); }
      else { setViewData({ title: data.title, rows: data.data, columns: data.columns }); }
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  const formatCell = (val: any, col: string) => {
    if (val === null || val === undefined) return "—";
    const num = Number(val);
    if (isNaN(num) || col.includes("name") || col.includes("campaign") || col.includes("category") || col.includes("platform") || col.includes("date") || col.includes("month") || col.includes("week") || col.includes("period")) return String(val);
    if (col.includes("spend") || col.includes("cost") || col.includes("cpp") || col.includes("cpl") || col.includes("cpc") || col.includes("budget")) return formatCurrency(num);
    if (col.includes("rate") || col.includes("ctr") || col.includes("share") || col.includes("pct") || col.includes("change")) {
      const pctVal = Math.abs(num) < 1 ? num * 100 : num;
      return pctVal.toFixed(1) + "%";
    }
    if (col.includes("score") || col.includes("health")) return num.toFixed(0);
    if (num > 10000000) return (num / 10000000).toFixed(2) + " Cr";
    if (num > 100000) return (num / 100000).toFixed(2) + "L";
    if (num > 1000) return (num / 1000).toFixed(1) + "K";
    return num.toLocaleString("en-IN", { maximumFractionDigits: 1 });
  };

  const getChangeColor = (val: any, col: string) => {
    const num = Number(val);
    if (isNaN(num)) return "";
    if (col.includes("change") || col.includes("growth") || col.includes("delta")) {
      if (col.includes("cpp") || col.includes("cpc") || col.includes("cost")) {
        return num > 0 ? "text-red-400" : num < 0 ? "text-green-400" : "";
      }
      return num > 0 ? "text-green-400" : num < 0 ? "text-red-400" : "";
    }
    if (col.includes("health") || col.includes("score")) {
      return num >= 7 ? "text-green-400" : num >= 4 ? "text-amber-400" : "text-red-400";
    }
    return "";
  };

  return (
    <div className="space-y-4">
      {/* Pre-built Views */}
      <div className="card p-4">
        <h3 className="text-[0.9rem] font-semibold text-white mb-3">Quick Views</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {PREBUILT_VIEWS.map(view => (
            <button
              key={view.id}
              onClick={() => loadPrebuiltView(view.id)}
              className={`p-3 rounded-lg border text-left transition-all ${
                activeView === view.id
                  ? "bg-blue-600/20 border-blue-500/50 text-white"
                  : "bg-bg-elevated border-border-medium text-text-secondary hover:border-blue-500/30 hover:bg-bg-hover"
              }`}
            >
              <div className="text-[1rem] mb-1">{view.icon}</div>
              <div className="text-[0.72rem] font-medium">{view.label}</div>
              <div className="text-[0.62rem] text-text-dimmed mt-0.5">{view.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Custom View Builder */}
      <div className="card p-4">
        <h3 className="text-[0.82rem] font-semibold text-white mb-3">Build Your Own View</h3>
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="text-[0.65rem] text-text-dimmed uppercase tracking-wide block mb-1">Metric</label>
            <select value={customMetric} onChange={e => setCustomMetric(e.target.value)} className="bg-bg-elevated border border-border-medium rounded-lg px-3 py-2 text-[0.78rem] text-white">
              {METRICS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[0.65rem] text-text-dimmed uppercase tracking-wide block mb-1">Time Range</label>
            <select value={customTime} onChange={e => setCustomTime(e.target.value)} className="bg-bg-elevated border border-border-medium rounded-lg px-3 py-2 text-[0.78rem] text-white">
              {TIME_RANGES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[0.65rem] text-text-dimmed uppercase tracking-wide block mb-1">Group By</label>
            <select value={customGroup} onChange={e => setCustomGroup(e.target.value)} className="bg-bg-elevated border border-border-medium rounded-lg px-3 py-2 text-[0.78rem] text-white">
              {GROUP_BY.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <button onClick={loadCustomView} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-[0.78rem] font-medium hover:bg-blue-700 transition-colors">
            Generate
          </button>
        </div>
      </div>

      {/* AI Query (secondary) */}
      <div className="card p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={customQuery}
            onChange={e => setCustomQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && loadAIView()}
            placeholder="Or ask anything custom: 'show me top 5 campaigns by MTU with their CPC trend'..."
            className="flex-1 bg-bg-elevated border border-border-medium rounded-lg px-3 py-2 text-[0.75rem] text-white placeholder-text-dimmed focus:outline-none focus:border-blue-500"
          />
          <button onClick={loadAIView} disabled={!customQuery.trim()} className="px-3 py-2 rounded-lg bg-bg-elevated border border-border-medium text-text-muted text-[0.75rem] hover:text-white hover:border-blue-500/50 disabled:opacity-40">
            Ask AI
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="card p-8 text-center">
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-text-muted text-sm">Generating view...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card p-4 border border-red-500/30 bg-red-950/20">
          <p className="text-red-400 text-[0.8rem]">{error}</p>
        </div>
      )}

      {/* Results Table */}
      {viewData && !loading && (
        <div className="card p-4">
          <h4 className="text-[0.9rem] font-semibold text-white mb-1">{viewData.title}</h4>
          <p className="text-[0.68rem] text-text-dimmed mb-3">{viewData.rows.length} rows</p>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-[0.75rem]">
              <thead className="sticky top-0 bg-bg-elevated z-10">
                <tr className="border-b border-border-subtle">
                  {viewData.columns.map(col => (
                    <th key={col} className="text-left py-2 px-2 text-text-muted font-medium text-[0.68rem] uppercase tracking-wide whitespace-nowrap">
                      {col.replace(/_/g, " ")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {viewData.rows.map((row, i) => (
                  <tr key={i} className="border-b border-border-subtle/50 hover:bg-bg-hover/30">
                    {viewData.columns.map(col => (
                      <td key={col} className={`py-2 px-2 text-white whitespace-nowrap ${getChangeColor(row[col], col)}`}>
                        {formatCell(row[col], col)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
