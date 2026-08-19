"use client";

import { useEffect, useState } from "react";
import StatCard from "@/components/cards/StatCard";
import { CATEGORIES, CATEGORY_COLORS, formatCurrency } from "@/lib/constants";

interface Props {
  filters: { business: string; categories: string[]; platform: string; device: string };
}

interface WowRow {
  category: string;
  week_period: string;
  spend: number;
  leads: number;
  payments: number;
  cpp: number | null;
  l2p_rate: number | null;
}

function getSignal(twCpp: number | null, lwCpp: number | null, twPmts: number, lwPmts: number): { label: string; color: string } {
  const pmtsGrowth = lwPmts > 0 ? ((twPmts - lwPmts) / lwPmts) * 100 : 0;
  const cppChange = twCpp && lwCpp ? ((twCpp - lwCpp) / lwCpp) * 100 : 0;

  if (pmtsGrowth > 15 && cppChange < 0) return { label: "BREAKOUT", color: "#4ade80" };
  if (cppChange < -3 && pmtsGrowth > 0) return { label: "SCALING WELL", color: "#4ade80" };
  if (cppChange > 10) return { label: "CPP RISING", color: "#f87171" };
  if (Math.abs(cppChange) <= 5 && Math.abs(pmtsGrowth) <= 5) return { label: "STABLE", color: "#facc15" };
  if (pmtsGrowth > 5) return { label: "GROWING", color: "#4ade80" };
  if (pmtsGrowth < -5) return { label: "DECLINING", color: "#f87171" };
  return { label: "WATCH", color: "#facc15" };
}

export default function WoWTab({ filters }: Props) {
  const [data, setData] = useState<WowRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/metrics?view=wow&business=${filters.business}`)
      .then(r => r.json())
      .then(res => { setData(res.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filters.business]);

  if (loading) return <div className="text-text-muted text-center py-10">Loading...</div>;
  if (!data.length) return <div className="text-text-muted text-center py-10">No data available</div>;

  const categories = [...new Set(data.map(d => d.category))];
  const filteredCategories = filters.categories.length > 0
    ? categories.filter(c => filters.categories.includes(c))
    : categories;

  const twTotal = data.filter(d => d.week_period === "this_week");
  const lwTotal = data.filter(d => d.week_period === "last_week");

  const twSpend = twTotal.reduce((s, d) => s + Number(d.spend), 0);
  const lwSpend = lwTotal.reduce((s, d) => s + Number(d.spend), 0);
  const twPmts = twTotal.reduce((s, d) => s + (d.payments || 0), 0);
  const lwPmts = lwTotal.reduce((s, d) => s + (d.payments || 0), 0);
  const twCpp = twPmts > 0 ? twSpend / twPmts : null;
  const twLeads = twTotal.reduce((s, d) => s + (d.leads || 0), 0);
  const twL2p = twLeads > 0 ? (twPmts / twLeads * 100).toFixed(1) : "—";

  const spendWow = lwSpend > 0 ? ((twSpend - lwSpend) / lwSpend * 100).toFixed(1) : "—";
  const pmtsWow = lwPmts > 0 ? ((twPmts - lwPmts) / lwPmts * 100).toFixed(1) : "—";

  // Find best performer
  let bestCat = "";
  let bestGrowth = -Infinity;
  for (const cat of categories) {
    const tw = data.find(d => d.category === cat && d.week_period === "this_week");
    const lw = data.find(d => d.category === cat && d.week_period === "last_week");
    if (tw && lw && lw.payments > 0) {
      const growth = ((tw.payments - lw.payments) / lw.payments) * 100;
      if (growth > bestGrowth) { bestGrowth = growth; bestCat = cat; }
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-1">Week-over-Week by Campaign Category</h2>
      <p className="text-text-muted text-[0.8rem] mb-4">This Week vs Last Week | Real backend CPP</p>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 mb-4">
        <StatCard label="THIS WEEK SPEND" value={formatCurrency(twSpend)} change={spendWow !== "—" ? `${Number(spendWow) > 0 ? "+" : ""}${spendWow}% WoW` : "—"} changeDirection="up" />
        <StatCard label="THIS WEEK PMTS" value={String(twPmts)} change={pmtsWow !== "—" ? `${Number(pmtsWow) > 0 ? "+" : ""}${pmtsWow}% WoW` : "—"} changeDirection="up" />
        <StatCard label="WEEKLY CPP" value={twCpp ? formatCurrency(twCpp) : "—"} change="Real backend" changeDirection="neutral" />
        <StatCard label="WEEKLY L2P" value={twL2p + "%"} change="Lead-to-payment" changeDirection="neutral" />
        <StatCard label="BEST PERFORMER" value={CATEGORIES.find(c => c.id === bestCat)?.label || bestCat} change={bestGrowth > -Infinity ? `+${bestGrowth.toFixed(0)}% pmts WoW` : "—"} changeDirection="up" />
      </div>

      <div className="card">
        <h3 className="text-[0.95rem] font-semibold text-text-secondary mb-3">WoW Performance — Category Level (Real Backend CPP)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[0.76rem]">
            <thead>
              <tr className="bg-bg-hover">
                <th className="p-2.5 text-left text-[0.64rem] text-text-dimmed uppercase font-semibold">Category</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">TW Spend</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">LW Spend</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">WoW%</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">TW Pmts</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">LW Pmts</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">WoW%</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">TW CPP</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">LW CPP</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">WoW%</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">TW L2P</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">Signal</th>
              </tr>
            </thead>
            <tbody>
              {filteredCategories.map((cat, i) => {
                const tw = data.find(d => d.category === cat && d.week_period === "this_week");
                const lw = data.find(d => d.category === cat && d.week_period === "last_week");
                const catColor = CATEGORY_COLORS[cat] || "#8b8fa7";
                const catLabel = CATEGORIES.find(c => c.id === cat)?.label || cat;

                const twS = Number(tw?.spend || 0);
                const lwS = Number(lw?.spend || 0);
                const twP = tw?.payments || 0;
                const lwP = lw?.payments || 0;
                const twCppCat = twP > 0 ? twS / twP : null;
                const lwCppCat = lwP > 0 ? lwS / lwP : null;
                const twL2pCat = (tw?.leads || 0) > 0 ? ((tw?.payments || 0) / (tw?.leads || 1) * 100).toFixed(1) : "—";

                const spendWowCat = lwS > 0 ? ((twS - lwS) / lwS * 100).toFixed(1) : "—";
                const pmtsWowCat = lwP > 0 ? ((twP - lwP) / lwP * 100).toFixed(1) : "—";
                const cppWowCat = twCppCat && lwCppCat ? ((twCppCat - lwCppCat) / lwCppCat * 100).toFixed(1) : "—";

                const signal = getSignal(twCppCat, lwCppCat, twP, lwP);

                return (
                  <tr key={i} className="border-t border-border-subtle hover:bg-bg-hover">
                    <td className="p-2.5 font-semibold" style={{ color: catColor }}>{catLabel}</td>
                    <td className="p-2">{formatCurrency(twS)}</td>
                    <td className="p-2 text-text-muted">{formatCurrency(lwS)}</td>
                    <td className="p-2" style={{ color: Number(spendWowCat) > 0 ? "#4ade80" : "#f87171" }}>{spendWowCat !== "—" ? `${Number(spendWowCat) > 0 ? "+" : ""}${spendWowCat}%` : "—"}</td>
                    <td className="p-2 font-semibold text-green-400">{twP}</td>
                    <td className="p-2 text-text-muted">{lwP}</td>
                    <td className="p-2" style={{ color: Number(pmtsWowCat) > 0 ? "#4ade80" : "#f87171" }}>{pmtsWowCat !== "—" ? `${Number(pmtsWowCat) > 0 ? "+" : ""}${pmtsWowCat}%` : "—"}</td>
                    <td className="p-2 font-semibold">{twCppCat ? formatCurrency(twCppCat) : "—"}</td>
                    <td className="p-2 text-text-muted">{lwCppCat ? formatCurrency(lwCppCat) : "—"}</td>
                    <td className="p-2" style={{ color: cppWowCat !== "—" && Number(cppWowCat) < 0 ? "#4ade80" : "#f87171" }}>{cppWowCat !== "—" ? `${Number(cppWowCat) > 0 ? "+" : ""}${cppWowCat}%` : "—"}</td>
                    <td className="p-2">{twL2pCat}%</td>
                    <td className="p-2">
                      <span className="text-[0.66rem] font-semibold px-2 py-0.5 rounded" style={{ color: signal.color, background: `${signal.color}20` }}>{signal.label}</span>
                    </td>
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
