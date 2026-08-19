"use client";

import { useState } from "react";
import { format, subDays, startOfMonth, subMonths, endOfMonth } from "date-fns";
import { CATEGORIES, CATEGORY_COLORS, formatCurrency } from "@/lib/constants";

interface Props {
  filters: { categories: string[]; platform: string; device: string; product?: string };
}

interface CompareRow {
  category?: string;
  campaign_name?: string;
  a_spend: number;
  b_spend: number;
  delta_spend: number;
  pct_spend: number;
  a_payments: number;
  b_payments: number;
  delta_payments: number;
  pct_payments: number;
  a_cpp: number;
  b_cpp: number;
  delta_cpp: number;
  pct_cpp: number;
  a_leads: number;
  b_leads: number;
  delta_leads: number;
  pct_leads: number;
  a_l2p: number;
  b_l2p: number;
  delta_l2p: number;
  pct_l2p: number;
  a_cpc: number;
  b_cpc: number;
  delta_cpc: number;
  pct_cpc: number;
  a_is: number;
  b_is: number;
}

const COMPARE_PRESETS = [
  { id: "wow", label: "This Week vs Last Week" },
  { id: "mtd_prev", label: "MTD vs Prev Month MTD" },
  { id: "mom", label: "Last Month vs Month Before" },
  { id: "custom", label: "Custom" },
];

function getComparePresetDates(presetId: string) {
  const today = new Date();
  const yesterday = subDays(today, 1);

  switch (presetId) {
    case "wow":
      return {
        periodAFrom: format(subDays(yesterday, 6), "yyyy-MM-dd"),
        periodATo: format(yesterday, "yyyy-MM-dd"),
        periodBFrom: format(subDays(yesterday, 13), "yyyy-MM-dd"),
        periodBTo: format(subDays(yesterday, 7), "yyyy-MM-dd"),
      };
    case "mtd_prev": {
      const thisMonthStart = startOfMonth(today);
      const lastMonthStart = startOfMonth(subMonths(today, 1));
      const dayOfMonth = today.getDate() - 1;
      return {
        periodAFrom: format(thisMonthStart, "yyyy-MM-dd"),
        periodATo: format(yesterday, "yyyy-MM-dd"),
        periodBFrom: format(lastMonthStart, "yyyy-MM-dd"),
        periodBTo: format(subDays(lastMonthStart, -dayOfMonth + 1), "yyyy-MM-dd"),
      };
    }
    case "mom": {
      const lastMonth = subMonths(today, 1);
      const monthBefore = subMonths(today, 2);
      return {
        periodAFrom: format(startOfMonth(lastMonth), "yyyy-MM-dd"),
        periodATo: format(endOfMonth(lastMonth), "yyyy-MM-dd"),
        periodBFrom: format(startOfMonth(monthBefore), "yyyy-MM-dd"),
        periodBTo: format(endOfMonth(monthBefore), "yyyy-MM-dd"),
      };
    }
    default:
      return {
        periodAFrom: format(subDays(yesterday, 6), "yyyy-MM-dd"),
        periodATo: format(yesterday, "yyyy-MM-dd"),
        periodBFrom: format(subDays(yesterday, 13), "yyyy-MM-dd"),
        periodBTo: format(subDays(yesterday, 7), "yyyy-MM-dd"),
      };
  }
}

function DeltaCell({ value, pct, inverse = false }: { value: number; pct: number; inverse?: boolean }) {
  if (value === 0 && pct === 0) return <span className="text-text-dimmed">—</span>;
  const isPositive = inverse ? pct < 0 : pct > 0;
  const color = Math.abs(pct) < 5 ? "#facc15" : isPositive ? "#4ade80" : "#f87171";
  return (
    <span className="text-[0.72rem] font-semibold" style={{ color }}>
      {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

export default function CompareTab({ filters }: Props) {
  const [activePreset, setActivePreset] = useState("wow");
  const [groupBy, setGroupBy] = useState<"category" | "campaign">("category");
  const [data, setData] = useState<CompareRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState<any>(null);
  const [customDates, setCustomDates] = useState(getComparePresetDates("wow"));
  const [showCustom, setShowCustom] = useState(false);

  const fetchComparison = async (preset?: string) => {
    setLoading(true);
    const dates = preset === "custom" ? customDates : getComparePresetDates(preset || activePreset);
    const params = new URLSearchParams({
      business: "eb", product: filters.product || "domestic_pg",
      periodA_from: dates.periodAFrom,
      periodA_to: dates.periodATo,
      periodB_from: dates.periodBFrom,
      periodB_to: dates.periodBTo,
      groupBy,
    });

    const res = await fetch(`/api/compare?${params}`).then(r => r.json());
    setData(res.data || []);
    setMeta(res.meta || null);
    setLoading(false);
  };

  const handlePresetClick = (presetId: string) => {
    setActivePreset(presetId);
    setShowCustom(presetId === "custom");
    if (presetId !== "custom") {
      fetchComparison(presetId);
    }
  };

  const filteredData = data.filter(row => {
    if (filters.categories.length === 0) return true;
    const cat = row.category || "";
    return filters.categories.includes(cat);
  });

  const totalAPmts = filteredData.reduce((s, r) => s + (r.a_payments || 0), 0);
  const totalBPmts = filteredData.reduce((s, r) => s + (r.b_payments || 0), 0);
  const totalASpend = filteredData.reduce((s, r) => s + (r.a_spend || 0), 0);
  const totalBSpend = filteredData.reduce((s, r) => s + (r.b_spend || 0), 0);

  return (
    <div>
      {/* Controls */}
      <div className="card p-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-[0.7rem] text-text-dimmed font-semibold uppercase mr-1">Compare:</span>
          {COMPARE_PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => handlePresetClick(p.id)}
              className={`px-3 py-1.5 rounded-md text-[0.75rem] font-medium transition-all ${
                activePreset === p.id
                  ? "bg-purple-500/20 text-purple-400 border border-purple-500/40"
                  : "bg-bg-hover text-text-muted hover:text-text-secondary border border-transparent"
              }`}
            >
              {p.label}
            </button>
          ))}

          <div className="w-px h-7 bg-border-medium mx-2" />

          <span className="text-[0.7rem] text-text-dimmed font-semibold uppercase mr-1">Group by:</span>
          <button
            onClick={() => { setGroupBy("category"); }}
            className={`px-3 py-1.5 rounded-md text-[0.75rem] font-medium ${groupBy === "category" ? "bg-blue-500/20 text-blue-400 border border-blue-500/40" : "bg-bg-hover text-text-muted border border-transparent"}`}
          >
            Category
          </button>
          <button
            onClick={() => { setGroupBy("campaign"); }}
            className={`px-3 py-1.5 rounded-md text-[0.75rem] font-medium ${groupBy === "campaign" ? "bg-blue-500/20 text-blue-400 border border-blue-500/40" : "bg-bg-hover text-text-muted border border-transparent"}`}
          >
            Campaign
          </button>
        </div>

        {showCustom && (
          <div className="flex items-center gap-3 pt-3 border-t border-border-subtle">
            <span className="text-[0.7rem] text-purple-400 font-semibold">Period A:</span>
            <input type="date" value={customDates.periodAFrom} onChange={e => setCustomDates(d => ({ ...d, periodAFrom: e.target.value }))} className="bg-bg-hover border border-border-subtle rounded px-2 py-1 text-[0.78rem] text-text-secondary" />
            <span className="text-text-dimmed">→</span>
            <input type="date" value={customDates.periodATo} onChange={e => setCustomDates(d => ({ ...d, periodATo: e.target.value }))} className="bg-bg-hover border border-border-subtle rounded px-2 py-1 text-[0.78rem] text-text-secondary" />
            <span className="text-[0.7rem] text-blue-400 font-semibold ml-3">Period B:</span>
            <input type="date" value={customDates.periodBFrom} onChange={e => setCustomDates(d => ({ ...d, periodBFrom: e.target.value }))} className="bg-bg-hover border border-border-subtle rounded px-2 py-1 text-[0.78rem] text-text-secondary" />
            <span className="text-text-dimmed">→</span>
            <input type="date" value={customDates.periodBTo} onChange={e => setCustomDates(d => ({ ...d, periodBTo: e.target.value }))} className="bg-bg-hover border border-border-subtle rounded px-2 py-1 text-[0.78rem] text-text-secondary" />
            <button onClick={() => fetchComparison("custom")} className="px-3 py-1.5 rounded-md text-[0.75rem] font-semibold bg-purple-600 text-white hover:bg-purple-500">
              Compare
            </button>
          </div>
        )}

        {!showCustom && data.length === 0 && !loading && (
          <p className="text-text-dimmed text-[0.78rem] mt-2">Click a comparison preset to load data.</p>
        )}
      </div>

      {loading && <div className="text-text-muted text-center py-10">Loading comparison...</div>}

      {!loading && data.length > 0 && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="card p-3">
              <p className="text-[0.68rem] text-text-dimmed uppercase">Payments (Period A)</p>
              <p className="text-[1.1rem] font-bold text-white">{totalAPmts}</p>
              <DeltaCell value={totalAPmts - totalBPmts} pct={totalBPmts > 0 ? ((totalAPmts - totalBPmts) / totalBPmts) * 100 : 0} />
            </div>
            <div className="card p-3">
              <p className="text-[0.68rem] text-text-dimmed uppercase">Payments (Period B)</p>
              <p className="text-[1.1rem] font-bold text-text-muted">{totalBPmts}</p>
            </div>
            <div className="card p-3">
              <p className="text-[0.68rem] text-text-dimmed uppercase">Spend (Period A)</p>
              <p className="text-[1.1rem] font-bold text-white">{formatCurrency(totalASpend)}</p>
              <DeltaCell value={totalASpend - totalBSpend} pct={totalBSpend > 0 ? ((totalASpend - totalBSpend) / totalBSpend) * 100 : 0} />
            </div>
            <div className="card p-3">
              <p className="text-[0.68rem] text-text-dimmed uppercase">Blended CPP Change</p>
              <p className="text-[1.1rem] font-bold">
                {totalAPmts > 0 && totalBPmts > 0 ? (
                  <DeltaCell
                    value={(totalASpend / totalAPmts) - (totalBSpend / totalBPmts)}
                    pct={((totalASpend / totalAPmts) - (totalBSpend / totalBPmts)) / (totalBSpend / totalBPmts) * 100}
                    inverse
                  />
                ) : "—"}
              </p>
            </div>
          </div>

          {/* Comparison Table */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[0.9rem] font-semibold text-text-secondary">
                {meta?.periodA?.from} → {meta?.periodA?.to} vs {meta?.periodB?.from} → {meta?.periodB?.to}
              </h3>
            </div>
            <div className="overflow-x-auto rounded-lg">
              <table className="w-full text-[0.76rem]">
                <thead>
                  <tr className="bg-bg-hover">
                    <th className="text-left p-2.5 text-[0.66rem] text-text-dimmed uppercase tracking-wider font-semibold">{groupBy === "campaign" ? "Campaign" : "Category"}</th>
                    <th className="text-center p-2.5 text-[0.66rem] text-purple-400 uppercase font-semibold" colSpan={2}>Spend</th>
                    <th className="text-center p-2.5 text-[0.66rem] text-purple-400 uppercase font-semibold" colSpan={2}>Payments</th>
                    <th className="text-center p-2.5 text-[0.66rem] text-purple-400 uppercase font-semibold" colSpan={2}>CPP</th>
                    <th className="text-center p-2.5 text-[0.66rem] text-purple-400 uppercase font-semibold" colSpan={2}>L2P</th>
                    <th className="text-center p-2.5 text-[0.66rem] text-purple-400 uppercase font-semibold">Δ Pmts</th>
                  </tr>
                  <tr className="bg-bg-hover/50">
                    <th></th>
                    <th className="text-center p-1 text-[0.6rem] text-text-dimmed">A</th>
                    <th className="text-center p-1 text-[0.6rem] text-text-dimmed">B</th>
                    <th className="text-center p-1 text-[0.6rem] text-text-dimmed">A</th>
                    <th className="text-center p-1 text-[0.6rem] text-text-dimmed">B</th>
                    <th className="text-center p-1 text-[0.6rem] text-text-dimmed">A</th>
                    <th className="text-center p-1 text-[0.6rem] text-text-dimmed">B</th>
                    <th className="text-center p-1 text-[0.6rem] text-text-dimmed">A</th>
                    <th className="text-center p-1 text-[0.6rem] text-text-dimmed">B</th>
                    <th className="text-center p-1 text-[0.6rem] text-text-dimmed">%</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((row, i) => {
                    const label = row.category || row.campaign_name || "Unknown";
                    const catColor = row.category ? CATEGORY_COLORS[row.category] || "#8b8fa7" : "#8b8fa7";
                    return (
                      <tr key={i} className="border-t border-border-subtle hover:bg-bg-hover/50">
                        <td className="p-2.5 font-medium" style={{ color: catColor }}>
                          {groupBy === "campaign" ? (label.replace(/RRize-RPPerf-/g, "").substring(0, 35)) : (CATEGORIES.find(c => c.id === label)?.label || label)}
                        </td>
                        <td className="p-2.5 text-center">{formatCurrency(row.a_spend)}</td>
                        <td className="p-2.5 text-center text-text-muted">{formatCurrency(row.b_spend)}</td>
                        <td className="p-2.5 text-center font-semibold">{row.a_payments}</td>
                        <td className="p-2.5 text-center text-text-muted">{row.b_payments}</td>
                        <td className="p-2.5 text-center">{row.a_cpp ? formatCurrency(row.a_cpp) : "—"}</td>
                        <td className="p-2.5 text-center text-text-muted">{row.b_cpp ? formatCurrency(row.b_cpp) : "—"}</td>
                        <td className="p-2.5 text-center">{row.a_l2p ? `${(row.a_l2p * 100).toFixed(1)}%` : "—"}</td>
                        <td className="p-2.5 text-center text-text-muted">{row.b_l2p ? `${(row.b_l2p * 100).toFixed(1)}%` : "—"}</td>
                        <td className="p-2.5 text-center">
                          <DeltaCell value={row.delta_payments} pct={row.pct_payments} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
