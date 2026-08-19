"use client";

import { useEffect, useState } from "react";
import { CATEGORIES, CATEGORY_COLORS, formatCurrency } from "@/lib/constants";

interface Props {
  filters: { business: string; categories: string[]; platform: string; device: string };
}

interface MomRow {
  category: string;
  month: string;
  spend: number;
  leads: number;
  payments: number;
  cpp: number | null;
  l2p_rate: number | null;
}

export default function MoMTab({ filters }: Props) {
  const [data, setData] = useState<MomRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/metrics?view=mom&business=${filters.business}`)
      .then(r => r.json())
      .then(res => { setData(res.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filters.business]);

  if (loading) return <div className="text-text-muted text-center py-10">Loading...</div>;
  if (!data.length) return <div className="text-text-muted text-center py-10">No data available</div>;

  const months = [...new Set(data.map(d => d.month))].sort();
  const categories = [...new Set(data.map(d => d.category))];
  const filteredCategories = filters.categories.length > 0
    ? categories.filter(c => filters.categories.includes(c))
    : categories;

  const monthLabels = months.map(m => {
    const date = new Date(m);
    return date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  });

  // Build per-category monthly data
  const categoryMonthly = filteredCategories.map(cat => {
    const catRows = data.filter(d => d.category === cat);
    const pmtsByMonth = months.map(m => catRows.find(r => r.month === m)?.payments || 0);
    const cppByMonth = months.map(m => {
      const row = catRows.find(r => r.month === m);
      return row?.cpp ? Number(row.cpp) : null;
    });
    const totalPmtsByMonth = months.map(m => data.filter(r => r.month === m).reduce((s, r) => s + (r.payments || 0), 0));
    const shareByMonth = months.map((m, i) => totalPmtsByMonth[i] > 0 ? ((pmtsByMonth[i] / totalPmtsByMonth[i]) * 100).toFixed(1) + "%" : "—");

    // Trend
    const validPmts = pmtsByMonth.filter(p => p > 0);
    let trend = "—";
    let trendColor = "#8b8fa7";
    if (validPmts.length >= 2) {
      const first = validPmts[0];
      const last = validPmts[validPmts.length - 1];
      const growth = ((last - first) / first) * 100;
      if (growth > 30) { trend = "Strong growth"; trendColor = "#4ade80"; }
      else if (growth > 10) { trend = "Growing"; trendColor = "#4ade80"; }
      else if (growth < -10) { trend = "Declining"; trendColor = "#f87171"; }
      else { trend = "Stable"; trendColor = "#facc15"; }
    }

    // CPP trend
    const validCpps = cppByMonth.filter((c): c is number => c !== null);
    if (validCpps.length >= 2) {
      const cppGrowth = ((validCpps[validCpps.length - 1] - validCpps[0]) / validCpps[0]) * 100;
      if (cppGrowth < -10) { trend += " (CPP improving)"; }
      else if (cppGrowth > 15) { trend += " (CPP rising)"; trendColor = trendColor === "#4ade80" ? "#facc15" : trendColor; }
    }

    return { category: cat, pmtsByMonth, cppByMonth, shareByMonth, trend, trendColor };
  });

  // Key takeaways
  const growing = categoryMonthly.filter(c => c.trend.includes("growth") || c.trend.includes("Growing"));
  const declining = categoryMonthly.filter(c => c.trend.includes("Declining") || c.trend.includes("CPP rising"));

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-1">Month-on-Month Trends by Category</h2>
      <p className="text-text-muted text-[0.8rem] mb-4">
        {monthLabels[0]} — {monthLabels[monthLabels.length - 1]} | Real backend payments & CPP
      </p>

      <div className="card mb-4">
        <h3 className="text-[0.95rem] font-semibold text-text-secondary mb-3">Category MoM Detail — Payments, CPP, Share</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[0.78rem]">
            <thead>
              <tr className="bg-bg-hover">
                <th className="p-2.5 text-left text-[0.64rem] text-text-dimmed uppercase font-semibold">Category</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">Metric</th>
                {monthLabels.map(m => <th key={m} className="p-2 text-[0.64rem] text-text-dimmed">{m}</th>)}
                <th className="p-2 text-[0.64rem] text-text-dimmed">Trend</th>
              </tr>
            </thead>
            <tbody>
              {categoryMonthly.map((row, i) => {
                const catColor = CATEGORY_COLORS[row.category] || "#8b8fa7";
                const catLabel = CATEGORIES.find(c => c.id === row.category)?.label || row.category;

                return (
                  <tbody key={i}>
                    <tr className="border-t border-border-subtle hover:bg-bg-hover">
                      <td className="p-2.5 font-semibold" style={{ color: catColor }} rowSpan={3}>{catLabel}</td>
                      <td className="p-2 text-text-muted">Payments</td>
                      {row.pmtsByMonth.map((m, j) => (
                        <td key={j} className={`p-2 ${j === row.pmtsByMonth.length - 1 ? "font-semibold text-white" : ""}`}>{m || "—"}</td>
                      ))}
                      <td className="p-2 font-medium" style={{ color: row.trendColor }} rowSpan={3}>{row.trend}</td>
                    </tr>
                    <tr className="hover:bg-bg-hover">
                      <td className="p-2 text-text-muted">CPP</td>
                      {row.cppByMonth.map((c, j) => <td key={j} className="p-2">{c ? formatCurrency(c) : "—"}</td>)}
                    </tr>
                    <tr className="hover:bg-bg-hover">
                      <td className="p-2 text-text-muted">Share %</td>
                      {row.shareByMonth.map((s, j) => <td key={j} className="p-2">{s}</td>)}
                    </tr>
                  </tbody>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Key takeaways */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {growing.length > 0 && (
          <div className="card border-l-[3px] border-l-green-500">
            <h4 className="text-green-400 font-semibold text-sm mb-2">Growing Categories</h4>
            <ul className="text-[0.8rem] text-text-secondary space-y-1.5">
              {growing.map((c, i) => {
                const catLabel = CATEGORIES.find(cat => cat.id === c.category)?.label || c.category;
                const catColor = CATEGORY_COLORS[c.category] || "#8b8fa7";
                const validPmts = c.pmtsByMonth.filter(p => p > 0);
                const growth = validPmts.length >= 2 ? (((validPmts[validPmts.length - 1] - validPmts[0]) / validPmts[0]) * 100).toFixed(0) : "—";
                return (
                  <li key={i}><strong style={{ color: catColor }}>{catLabel}:</strong> +{growth}% payments growth, {c.trend}</li>
                );
              })}
            </ul>
          </div>
        )}
        {declining.length > 0 && (
          <div className="card border-l-[3px] border-l-red-500">
            <h4 className="text-red-400 font-semibold text-sm mb-2">Declining / At Risk</h4>
            <ul className="text-[0.8rem] text-text-secondary space-y-1.5">
              {declining.map((c, i) => {
                const catLabel = CATEGORIES.find(cat => cat.id === c.category)?.label || c.category;
                const catColor = CATEGORY_COLORS[c.category] || "#8b8fa7";
                return (
                  <li key={i}><strong style={{ color: catColor }}>{catLabel}:</strong> {c.trend}</li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
