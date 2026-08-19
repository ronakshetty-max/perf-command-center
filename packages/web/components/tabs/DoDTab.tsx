"use client";

import { useEffect, useState } from "react";
import StatCard from "@/components/cards/StatCard";
import { CATEGORIES, CATEGORY_COLORS, formatCurrency } from "@/lib/constants";

interface Props {
  filters: { business: string; categories: string[]; platform: string; device: string };
}

interface DayRow {
  category: string;
  date: string;
  spend: number;
  clicks: number;
  impressions: number;
  leads: number;
  payments: number;
  cpp: number | null;
  l2p_rate: number | null;
}

interface TrendRow {
  category: string;
  date: string;
  spend: number;
  leads: number;
  payments: number;
  cpp: number | null;
}

export default function DoDTab({ filters }: Props) {
  const [dodData, setDodData] = useState<DayRow[]>([]);
  const [trendData, setTrendData] = useState<TrendRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/metrics?view=dod&business=${filters.business}`).then(r => r.json()),
      fetch(`/api/metrics?view=dod_trend&business=${filters.business}`).then(r => r.json()),
    ]).then(([dod, trend]) => {
      setDodData(dod.data || []);
      setTrendData(trend.data || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [filters.business]);

  if (loading) return <div className="text-text-muted text-center py-10">Loading...</div>;
  if (!dodData.length) return <div className="text-text-muted text-center py-10">No data available</div>;

  const dates = [...new Set(dodData.map(d => d.date))].sort();
  const today = dates[dates.length - 1];
  const yesterday = dates.length > 1 ? dates[dates.length - 2] : null;

  const todayData = dodData.filter(d => d.date === today);
  const yesterdayData = dodData.filter(d => d.date === yesterday);

  const categories = [...new Set(dodData.map(d => d.category))];
  const filteredCategories = filters.categories.length > 0
    ? categories.filter(c => filters.categories.includes(c))
    : categories;

  const todayTotals = {
    spend: todayData.reduce((s, d) => s + Number(d.spend), 0),
    leads: todayData.reduce((s, d) => s + (d.leads || 0), 0),
    payments: todayData.reduce((s, d) => s + (d.payments || 0), 0),
  };
  const yesterdayTotals = {
    spend: yesterdayData.reduce((s, d) => s + Number(d.spend), 0),
    leads: yesterdayData.reduce((s, d) => s + (d.leads || 0), 0),
    payments: yesterdayData.reduce((s, d) => s + (d.payments || 0), 0),
  };

  const spendChange = yesterdayTotals.spend > 0 ? ((todayTotals.spend - yesterdayTotals.spend) / yesterdayTotals.spend * 100).toFixed(1) : "—";
  const leadsChange = yesterdayTotals.leads > 0 ? ((todayTotals.leads - yesterdayTotals.leads) / yesterdayTotals.leads * 100).toFixed(1) : "—";
  const pmtsChange = yesterdayTotals.payments > 0 ? ((todayTotals.payments - yesterdayTotals.payments) / yesterdayTotals.payments * 100).toFixed(1) : "—";
  const todayCpp = todayTotals.payments > 0 ? todayTotals.spend / todayTotals.payments : null;
  const yesterdayCpp = yesterdayTotals.payments > 0 ? yesterdayTotals.spend / yesterdayTotals.payments : null;
  const cppChange = todayCpp && yesterdayCpp ? ((todayCpp - yesterdayCpp) / yesterdayCpp * 100).toFixed(1) : "—";

  // Build 7-day CPP trend per category
  const trendDates = [...new Set(trendData.map(d => d.date))].sort();
  const cppTrend: Record<string, (number | null)[]> = {};
  for (const cat of filteredCategories) {
    cppTrend[cat] = trendDates.map(date => {
      const row = trendData.find(d => d.category === cat && d.date === date);
      return row?.cpp ? Number(row.cpp) : null;
    });
  }

  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { month: "short", day: "numeric" });

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-1">Day-on-Day by Campaign Category</h2>
      <p className="text-text-muted text-[0.8rem] mb-4">{formatDate(today)} vs {yesterday ? formatDate(yesterday) : "—"} | Real backend CPP</p>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 mb-4">
        <StatCard label="TODAY SPEND" value={formatCurrency(todayTotals.spend)} change={spendChange !== "—" ? `${Number(spendChange) > 0 ? "+" : ""}${spendChange}% vs yesterday` : "—"} changeDirection={Number(spendChange) >= 0 ? "up" : "down"} />
        <StatCard label="TODAY LEADS" value={String(todayTotals.leads)} change={leadsChange !== "—" ? `${Number(leadsChange) > 0 ? "+" : ""}${leadsChange}% vs yesterday` : "—"} changeDirection={Number(leadsChange) >= 0 ? "up" : "down"} />
        <StatCard label="TODAY PAYMENTS" value={String(todayTotals.payments)} change={pmtsChange !== "—" ? `${Number(pmtsChange) > 0 ? "+" : ""}${pmtsChange}% vs yesterday` : "—"} changeDirection={Number(pmtsChange) >= 0 ? "up" : "down"} />
        <StatCard label="TODAY CPP" value={todayCpp ? formatCurrency(todayCpp) : "—"} change={cppChange !== "—" ? `${Number(cppChange) > 0 ? "+" : ""}${cppChange}% vs yesterday` : "—"} changeDirection={Number(cppChange) <= 0 ? "up" : "down"} />
        <StatCard label="7D AVG CPP" value={(() => { const allCpps = trendData.filter(d => d.cpp); const totalS = allCpps.reduce((s, d) => s + Number(d.spend || 0), 0); const totalP = allCpps.reduce((s, d) => s + (d.payments || 0), 0); return totalP > 0 ? formatCurrency(totalS / totalP) : "—"; })()} change="Trailing avg" changeDirection="neutral" />
      </div>

      {/* DoD Table */}
      <div className="card mb-4">
        <h3 className="text-[0.95rem] font-semibold text-text-secondary mb-3">Today vs Yesterday — By Category (Real Backend)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[0.78rem]">
            <thead>
              <tr className="bg-bg-hover">
                <th className="p-2.5 text-left text-[0.64rem] text-text-dimmed uppercase font-semibold">Category</th>
                <th className="p-2 text-left text-[0.64rem] text-text-dimmed uppercase font-semibold" colSpan={2}>Spend</th>
                <th className="p-2 text-left text-[0.64rem] text-text-dimmed uppercase font-semibold" colSpan={2}>Leads</th>
                <th className="p-2 text-left text-[0.64rem] text-text-dimmed uppercase font-semibold" colSpan={2}>Payments</th>
                <th className="p-2 text-left text-[0.64rem] text-text-dimmed uppercase font-semibold" colSpan={2}>CPP (Real)</th>
                <th className="p-2 text-left text-[0.64rem] text-text-dimmed uppercase font-semibold" colSpan={2}>L2P</th>
              </tr>
              <tr className="bg-bg-primary/50">
                <th></th>
                <th className="p-1.5 text-[0.6rem] text-text-dimmed">Today</th><th className="p-1.5 text-[0.6rem] text-text-dimmed">Yest</th>
                <th className="p-1.5 text-[0.6rem] text-text-dimmed">Today</th><th className="p-1.5 text-[0.6rem] text-text-dimmed">Yest</th>
                <th className="p-1.5 text-[0.6rem] text-text-dimmed">Today</th><th className="p-1.5 text-[0.6rem] text-text-dimmed">Yest</th>
                <th className="p-1.5 text-[0.6rem] text-text-dimmed">Today</th><th className="p-1.5 text-[0.6rem] text-text-dimmed">Yest</th>
                <th className="p-1.5 text-[0.6rem] text-text-dimmed">Today</th><th className="p-1.5 text-[0.6rem] text-text-dimmed">Yest</th>
              </tr>
            </thead>
            <tbody>
              {filteredCategories.map((cat, i) => {
                const t = todayData.find(d => d.category === cat);
                const y = yesterdayData.find(d => d.category === cat);
                const catColor = CATEGORY_COLORS[cat] || "#8b8fa7";
                const catLabel = CATEGORIES.find(c => c.id === cat)?.label || cat;
                const tCpp = t?.payments ? Number(t.spend) / t.payments : null;
                const yCpp = y?.payments ? Number(y.spend) / y.payments : null;
                const tL2p = t?.leads ? ((t.payments || 0) / t.leads * 100).toFixed(1) + "%" : "—";
                const yL2p = y?.leads ? ((y.payments || 0) / y.leads * 100).toFixed(1) + "%" : "—";

                return (
                  <tr key={i} className="border-t border-border-subtle hover:bg-bg-hover">
                    <td className="p-2.5 font-semibold" style={{ color: catColor }}>{catLabel}</td>
                    <td className="p-2">{t ? formatCurrency(Number(t.spend)) : "—"}</td>
                    <td className="p-2 text-text-muted">{y ? formatCurrency(Number(y.spend)) : "—"}</td>
                    <td className="p-2">{t?.leads ?? "—"}</td>
                    <td className="p-2 text-text-muted">{y?.leads ?? "—"}</td>
                    <td className="p-2 font-semibold text-green-400">{t?.payments ?? "—"}</td>
                    <td className="p-2 text-text-muted">{y?.payments ?? "—"}</td>
                    <td className="p-2 font-semibold" style={{ color: catColor }}>{tCpp ? formatCurrency(tCpp) : "—"}</td>
                    <td className="p-2 text-text-muted">{yCpp ? formatCurrency(yCpp) : "—"}</td>
                    <td className="p-2">{tL2p}</td>
                    <td className="p-2 text-text-muted">{yL2p}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* CPP 7-day movement */}
      <div className="card">
        <h3 className="text-[0.95rem] font-semibold text-text-secondary mb-3">CPP Movement — Last 7 Days by Category</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[0.78rem]">
            <thead>
              <tr className="bg-bg-hover">
                <th className="p-2.5 text-left text-[0.64rem] text-text-dimmed uppercase font-semibold">Category</th>
                {trendDates.map(d => (
                  <th key={d} className="p-2 text-[0.64rem] text-text-dimmed">{formatDate(d)}</th>
                ))}
                <th className="p-2 text-[0.64rem] text-text-dimmed">Avg</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">Direction</th>
              </tr>
            </thead>
            <tbody>
              {filteredCategories.map((cat, i) => {
                const vals = cppTrend[cat] || [];
                const validVals = vals.filter((v): v is number => v !== null);
                const avg = validVals.length > 0 ? validVals.reduce((a, b) => a + b, 0) / validVals.length : null;
                const catColor = CATEGORY_COLORS[cat] || "#8b8fa7";
                const catLabel = CATEGORIES.find(c => c.id === cat)?.label || cat;

                let direction = "—";
                let dirColor = "#8b8fa7";
                if (validVals.length >= 3) {
                  const recent = validVals.slice(-3).reduce((a, b) => a + b, 0) / 3;
                  const earlier = validVals.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, validVals.length);
                  const pctChange = ((recent - earlier) / earlier) * 100;
                  if (pctChange < -5) { direction = "Improving"; dirColor = "#4ade80"; }
                  else if (pctChange > 10) { direction = "Rising"; dirColor = "#f87171"; }
                  else if (Math.abs(pctChange) <= 5) { direction = "Stable"; dirColor = "#4ade80"; }
                  else { direction = "Volatile"; dirColor = "#facc15"; }
                }

                return (
                  <tr key={i} className="border-t border-border-subtle hover:bg-bg-hover">
                    <td className="p-2.5 font-semibold" style={{ color: catColor }}>{catLabel}</td>
                    {vals.map((v, j) => (
                      <td key={j} className="p-2 text-text-secondary">{v ? formatCurrency(v) : "—"}</td>
                    ))}
                    <td className="p-2 font-semibold text-white">{avg ? formatCurrency(avg) : "—"}</td>
                    <td className="p-2 font-semibold" style={{ color: dirColor }}>{direction}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
