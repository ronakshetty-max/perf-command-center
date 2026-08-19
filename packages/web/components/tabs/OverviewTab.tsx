"use client";

import { useEffect, useState } from "react";
import CategoryKPICard from "@/components/cards/CategoryKPICard";
import InsightCard from "@/components/cards/InsightCard";
import { CATEGORIES, CATEGORY_COLORS, formatCurrency, formatPercent } from "@/lib/constants";
import type { DateRange } from "@/components/layout/TimeRangeSelector";

interface Props {
  filters: { business: string; categories: string[]; platform: string; device: string };
  dateRange?: DateRange;
}

interface CategoryData {
  category: string;
  campaign_count: number;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_leads: number;
  total_payments: number;
  cpl: number | null;
  cpp: number | null;
  l2p_rate: number | null;
  ctr: number | null;
  avg_is: number | null;
}

function getCppColor(cpp: number | null, category: string): string {
  if (!cpp) return "#8b8fa7";
  const caps: Record<string, number> = { brand: 2000, high_intent: 3000, generic: 2700, pmax: 2700, competitor: 4000, retargeting: 4000 };
  const cap = caps[category] || 2700;
  if (cpp <= cap * 0.85) return "#4ade80";
  if (cpp <= cap) return "#facc15";
  return "#f87171";
}

function getCppNote(row: CategoryData, totalPayments: number): { note: string; dir: "up" | "down" | "neutral" } {
  const share = totalPayments > 0 ? ((row.total_payments / totalPayments) * 100).toFixed(1) : "0";
  const caps: Record<string, number> = { brand: 2000, high_intent: 3000, generic: 2700, pmax: 2700, competitor: 4000, retargeting: 4000 };
  const cap = caps[row.category] || 2700;
  if (!row.cpp) return { note: `${share}% of total payments`, dir: "neutral" };
  if (row.cpp <= cap * 0.85) return { note: `${share}% of pmts — well under cap`, dir: "up" };
  if (row.cpp <= cap) return { note: `${share}% of pmts — near cap boundary`, dir: "neutral" };
  return { note: `${share}% of pmts — above cap`, dir: "down" };
}

export default function OverviewTab({ filters, dateRange }: Props) {
  const [data, setData] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ view: "overview", business: filters.business, product: (filters as any).product || "domestic_pg" });
    if (dateRange?.dateFrom) params.set("dateFrom", dateRange.dateFrom);
    if (dateRange?.dateTo) params.set("dateTo", dateRange.dateTo);
    if (filters.categories?.length) params.set("categories", filters.categories.join(","));
    if (filters.platform && filters.platform !== "all") params.set("platform", filters.platform);
    fetch(`/api/metrics?${params}`)
      .then(r => r.json())
      .then(res => { setData(res.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filters.business, (filters as any).product, filters.categories, filters.platform, dateRange?.dateFrom, dateRange?.dateTo]);

  if (loading) {
    return <div className="text-text-muted text-center py-10">Loading real data...</div>;
  }

  if (!data.length) {
    return <div className="text-text-muted text-center py-10">No data available for {filters.business}</div>;
  }

  const totalPayments = data.reduce((sum, d) => sum + (d.total_payments || 0), 0);
  const totalSpend = data.reduce((sum, d) => sum + Number(d.total_spend || 0), 0);
  const totalLeads = data.reduce((sum, d) => sum + (d.total_leads || 0), 0);
  const filteredData = filters.categories.length > 0 ? data.filter(d => filters.categories.includes(d.category)) : data;

  const insights = generateInsights(data);

  return (
    <div>
      {/* Category mapping legend */}
      <div className="card p-3 mb-4">
        <div className="flex gap-4 flex-wrap items-center text-[0.76rem]">
          <span className="text-text-dimmed font-semibold">CATEGORY MAPPING:</span>
          {CATEGORIES.map(cat => (
            <span key={cat.id} className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${cat.dotClass}`} />
              <strong style={{ color: cat.color }}>{cat.label}</strong>
            </span>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-4">
        {filteredData.map(row => {
          const catLabel = CATEGORIES.find(c => c.id === row.category)?.label || row.category;
          const { note, dir } = getCppNote(row, totalPayments);
          return (
            <CategoryKPICard
              key={row.category}
              category={row.category}
              categoryLabel={catLabel}
              payments={row.total_payments || 0}
              spend={formatCurrency(Number(row.total_spend))}
              cpp={row.cpp ? formatCurrency(Number(row.cpp)) : "—"}
              cppColor={getCppColor(row.cpp ? Number(row.cpp) : null, row.category)}
              note={note}
              noteDirection={dir}
            />
          );
        })}
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div className="card mb-4">
          <h3 className="text-[0.95rem] font-semibold text-text-secondary mb-3">Auto-Detected Insights & Opportunities</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {insights.map((insight, i) => (
              <InsightCard key={i} {...insight} />
            ))}
          </div>
        </div>
      )}

      {/* Summary Table */}
      <div className="card">
        <h3 className="text-[0.95rem] font-semibold text-text-secondary mb-3">
          Category Summary — Rize {dateRange ? `(${dateRange.dateFrom} → ${dateRange.dateTo})` : ""}
        </h3>
        <div className="overflow-x-auto rounded-lg">
          <table className="w-full text-[0.8rem]">
            <thead>
              <tr className="bg-bg-hover">
                <th className="text-left p-2.5 text-[0.66rem] text-text-dimmed uppercase tracking-wider font-semibold">Category</th>
                <th className="text-left p-2.5 text-[0.66rem] text-text-dimmed uppercase tracking-wider font-semibold">Campaigns</th>
                <th className="text-left p-2.5 text-[0.66rem] text-text-dimmed uppercase tracking-wider font-semibold">Spend</th>
                <th className="text-left p-2.5 text-[0.66rem] text-text-dimmed uppercase tracking-wider font-semibold">% Spend</th>
                <th className="text-left p-2.5 text-[0.66rem] text-text-dimmed uppercase tracking-wider font-semibold">Leads</th>
                <th className="text-left p-2.5 text-[0.66rem] text-text-dimmed uppercase tracking-wider font-semibold">Pmts</th>
                <th className="text-left p-2.5 text-[0.66rem] text-text-dimmed uppercase tracking-wider font-semibold">CPL</th>
                <th className="text-left p-2.5 text-[0.66rem] text-text-dimmed uppercase tracking-wider font-semibold">CPP (Real)</th>
                <th className="text-left p-2.5 text-[0.66rem] text-text-dimmed uppercase tracking-wider font-semibold">L2P</th>
                <th className="text-left p-2.5 text-[0.66rem] text-text-dimmed uppercase tracking-wider font-semibold">vs Cap</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row, i) => {
                const catLabel = CATEGORIES.find(c => c.id === row.category)?.label || row.category;
                const catColor = CATEGORY_COLORS[row.category] || "#8b8fa7";
                const pctSpend = totalSpend > 0 ? ((Number(row.total_spend) / totalSpend) * 100).toFixed(1) + "%" : "—";
                const caps: Record<string, number> = { brand: 2000, high_intent: 3000, generic: 2700, pmax: 2700, competitor: 4000, retargeting: 4000 };
                const cap = caps[row.category] || 2700;
                const vsCap = row.cpp ? (((Number(row.cpp) - cap) / cap) * 100).toFixed(0) : null;
                const vsCapColor = vsCap ? (Number(vsCap) <= 0 ? "#4ade80" : "#f87171") : "#8b8fa7";

                return (
                  <tr key={i} className="border-t border-border-subtle hover:bg-bg-hover transition-colors">
                    <td className="p-2.5 font-semibold" style={{ color: catColor }}>{catLabel}</td>
                    <td className="p-2.5 text-text-muted">{row.campaign_count}</td>
                    <td className="p-2.5">{formatCurrency(Number(row.total_spend))}</td>
                    <td className="p-2.5 text-text-muted">{pctSpend}</td>
                    <td className="p-2.5">{row.total_leads || 0}</td>
                    <td className="p-2.5 font-semibold">{row.total_payments || 0}</td>
                    <td className="p-2.5">{row.cpl ? formatCurrency(Number(row.cpl)) : "—"}</td>
                    <td className="p-2.5 font-semibold" style={{ color: getCppColor(row.cpp ? Number(row.cpp) : null, row.category) }}>
                      {row.cpp ? formatCurrency(Number(row.cpp)) : "—"}
                    </td>
                    <td className="p-2.5">{row.l2p_rate ? (Number(row.l2p_rate) * 100).toFixed(1) + "%" : "—"}</td>
                    <td className="p-2.5">
                      {vsCap ? (
                        <span className="text-[0.68rem] font-semibold px-2 py-0.5 rounded" style={{ color: vsCapColor, background: `${vsCapColor}20` }}>
                          {Number(vsCap) > 0 ? "+" : ""}{vsCap}%
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
              {/* Totals row */}
              <tr className="border-t-2 border-border-subtle bg-bg-hover font-semibold">
                <td className="p-2.5 text-white">TOTAL</td>
                <td className="p-2.5 text-text-muted">{data.reduce((s, d) => s + d.campaign_count, 0)}</td>
                <td className="p-2.5 text-white">{formatCurrency(totalSpend)}</td>
                <td className="p-2.5 text-text-muted">100%</td>
                <td className="p-2.5">{totalLeads}</td>
                <td className="p-2.5 text-white">{totalPayments}</td>
                <td className="p-2.5">{totalLeads > 0 ? formatCurrency(totalSpend / totalLeads) : "—"}</td>
                <td className="p-2.5 text-white">{totalPayments > 0 ? formatCurrency(totalSpend / totalPayments) : "—"}</td>
                <td className="p-2.5">{totalLeads > 0 ? ((totalPayments / totalLeads) * 100).toFixed(1) + "%" : "—"}</td>
                <td className="p-2.5">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function generateInsights(data: CategoryData[]): { type: string; severity: string; title: string; description: string }[] {
  const insights: { type: string; severity: string; title: string; description: string }[] = [];
  const caps: Record<string, number> = { brand: 2000, high_intent: 3000, generic: 2700, pmax: 2700, competitor: 4000, retargeting: 4000 };

  for (const row of data) {
    const cap = caps[row.category] || 2700;
    const catLabel = CATEGORIES.find(c => c.id === row.category)?.label || row.category;

    if (row.cpp && Number(row.cpp) < cap * 0.85 && row.avg_is && Number(row.avg_is) < 0.7) {
      insights.push({
        type: "scale_opportunity",
        severity: "positive",
        title: `${catLabel} has room to scale (IS: ${(Number(row.avg_is) * 100).toFixed(0)}%)`,
        description: `CPP ${formatCurrency(Number(row.cpp))} is ${((1 - Number(row.cpp) / cap) * 100).toFixed(0)}% below cap with only ${(Number(row.avg_is) * 100).toFixed(0)}% impression share. Increasing budget could capture more volume.`,
      });
    }

    if (row.cpp && Number(row.cpp) > cap * 1.15) {
      insights.push({
        type: "alert",
        severity: "warning",
        title: `${catLabel}: CPP ${formatCurrency(Number(row.cpp))} is ${(((Number(row.cpp) - cap) / cap) * 100).toFixed(0)}% above cap`,
        description: `Spending ${formatCurrency(Number(row.total_spend))} but CPP well over the ${formatCurrency(cap)} cap. Consider reducing budget or reviewing keyword strategy.`,
      });
    }

    if (row.total_spend > 10000 && row.total_payments === 0) {
      insights.push({
        type: "alert",
        severity: "critical",
        title: `${catLabel}: ${formatCurrency(Number(row.total_spend))} spent with 0 payments`,
        description: `Campaign spending with zero backend conversions. Check if tracking/event is broken or if the category genuinely has no conversion path.`,
      });
    }

    if (row.l2p_rate && Number(row.l2p_rate) > 0.20 && row.cpp && Number(row.cpp) < cap) {
      insights.push({
        type: "breakout",
        severity: "positive",
        title: `${catLabel}: Strong L2P at ${(Number(row.l2p_rate) * 100).toFixed(1)}%`,
        description: `High lead-to-payment conversion with CPP under cap. This category is performing efficiently — consider scaling.`,
      });
    }
  }

  return insights.slice(0, 6);
}
