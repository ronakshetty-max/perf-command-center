"use client";

import { useEffect, useState } from "react";
import StatCard from "@/components/cards/StatCard";
import { CATEGORIES, CATEGORY_COLORS, formatCurrency } from "@/lib/constants";

interface Props {
  filters: { business: string; categories: string[]; platform: string; device: string };
}

interface MtdRow {
  category: string;
  current_spend: number | null;
  current_leads: number | null;
  current_payments: number | null;
  current_cpp: number | null;
  current_l2p: number | null;
  prev_spend: number | null;
  prev_leads: number | null;
  prev_payments: number | null;
  prev_cpp: number | null;
  prev_l2p: number | null;
}

export default function MTDTab({ filters }: Props) {
  const [data, setData] = useState<MtdRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/metrics?view=mtd&business=${filters.business}`)
      .then(r => r.json())
      .then(res => { setData(res.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filters.business]);

  if (loading) return <div className="text-text-muted text-center py-10">Loading...</div>;
  if (!data.length) return <div className="text-text-muted text-center py-10">No data available</div>;

  const filteredData = filters.categories.length > 0
    ? data.filter(d => filters.categories.includes(d.category))
    : data;

  const curTotalSpend = filteredData.reduce((s, d) => s + Number(d.current_spend || 0), 0);
  const curTotalPmts = filteredData.reduce((s, d) => s + Number(d.current_payments || 0), 0);
  const curTotalLeads = filteredData.reduce((s, d) => s + Number(d.current_leads || 0), 0);
  const prevTotalPmts = filteredData.reduce((s, d) => s + Number(d.prev_payments || 0), 0);
  const curCpp = curTotalPmts > 0 ? curTotalSpend / curTotalPmts : null;

  const pmtsGrowth = prevTotalPmts > 0 ? ((curTotalPmts - prevTotalPmts) / prevTotalPmts * 100).toFixed(0) : "—";

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-1">MTD vs Same Period Last Month — By Category</h2>
      <p className="text-text-muted text-[0.8rem] mb-4">Current month-to-date vs same # of days last month | Real backend data</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
        <StatCard label="MTD SPEND" value={formatCurrency(curTotalSpend)} change={`${filters.business} total`} changeDirection="neutral" borderColor="#60a5fa" />
        <StatCard label="MTD PAYMENTS" value={String(curTotalPmts)} change={pmtsGrowth !== "—" ? `${Number(pmtsGrowth) > 0 ? "+" : ""}${pmtsGrowth}% vs last month` : "—"} changeDirection={Number(pmtsGrowth) >= 0 ? "up" : "down"} borderColor="#4ade80" />
        <StatCard label="MTD CPP" value={curCpp ? formatCurrency(curCpp) : "—"} change="Real backend CPP" changeDirection="neutral" borderColor="#facc15" />
        <StatCard label="MTD L2P" value={curTotalLeads > 0 ? (curTotalPmts / curTotalLeads * 100).toFixed(1) + "%" : "—"} change="Lead-to-payment" changeDirection="neutral" borderColor="#a78bfa" />
      </div>

      {/* Comparison cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-4">
        {filteredData.map((row, i) => {
          const catColor = CATEGORY_COLORS[row.category] || "#8b8fa7";
          const catLabel = CATEGORIES.find(c => c.id === row.category)?.label || row.category;
          const curP = Number(row.current_payments || 0);
          const prevP = Number(row.prev_payments || 0);
          const change = prevP > 0 ? ((curP - prevP) / prevP * 100).toFixed(0) : (curP > 0 ? "+∞" : "0");
          const cppDir = row.current_cpp && row.prev_cpp ? (Number(row.current_cpp) <= Number(row.prev_cpp) ? "down" : "up") : null;

          return (
            <div key={i} className="card p-4">
              <div className="flex justify-between items-center mb-2.5">
                <h4 className="text-[0.85rem] font-semibold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: catColor }} />
                  <span style={{ color: catColor }}>{catLabel}</span>
                </h4>
                <span className={`text-[0.68rem] font-semibold px-2 py-0.5 rounded ${Number(change) > 0 ? "bg-green-950/50 text-green-400" : Number(change) < 0 ? "bg-red-950/50 text-red-400" : "bg-yellow-950/50 text-yellow-400"}`}>
                  {Number(change) > 0 ? "+" : ""}{change}% pmts
                </span>
              </div>
              <table className="w-full text-[0.74rem]">
                <tbody>
                  <tr><td className="text-text-dimmed py-0.5">Pmts</td><td className="font-semibold">{curP} <span className="text-text-muted font-normal">vs {prevP}</span></td></tr>
                  <tr><td className="text-text-dimmed py-0.5">CPP</td><td style={{ color: cppDir === "down" ? "#4ade80" : cppDir === "up" ? "#f87171" : "#8b8fa7" }}>{row.current_cpp ? formatCurrency(Number(row.current_cpp)) : "—"} <span className="text-text-muted">vs {row.prev_cpp ? formatCurrency(Number(row.prev_cpp)) : "—"}</span></td></tr>
                  <tr><td className="text-text-dimmed py-0.5">Spend</td><td>{row.current_spend ? formatCurrency(Number(row.current_spend)) : "—"} <span className="text-text-muted">vs {row.prev_spend ? formatCurrency(Number(row.prev_spend)) : "—"}</span></td></tr>
                  <tr><td className="text-text-dimmed py-0.5">L2P</td><td>{row.current_l2p ? (Number(row.current_l2p) * 100).toFixed(1) + "%" : "—"} <span className="text-text-muted">vs {row.prev_l2p ? (Number(row.prev_l2p) * 100).toFixed(1) + "%" : "—"}</span></td></tr>
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      {/* Full table */}
      <div className="card">
        <h3 className="text-[0.95rem] font-semibold text-text-secondary mb-3">Full MTD Comparison — By Category</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[0.78rem]">
            <thead>
              <tr className="bg-bg-hover">
                <th className="p-2.5 text-left text-[0.64rem] text-text-dimmed uppercase font-semibold">Category</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">This MTD Spend</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">Last MTD Spend</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">This Pmts</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">Last Pmts</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">This CPP</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">Last CPP</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">CPP Change</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">Interpretation</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row, i) => {
                const catColor = CATEGORY_COLORS[row.category] || "#8b8fa7";
                const catLabel = CATEGORIES.find(c => c.id === row.category)?.label || row.category;
                const cppDir = row.current_cpp && row.prev_cpp ? (Number(row.current_cpp) <= Number(row.prev_cpp) ? "down" : "up") : null;
                const cppChange = row.current_cpp && row.prev_cpp
                  ? ((Number(row.current_cpp) - Number(row.prev_cpp)) / Number(row.prev_cpp) * 100).toFixed(1)
                  : "—";

                let interpretation = "—";
                if (cppDir === "down") interpretation = "Scaling efficiently";
                else if (cppDir === "up") interpretation = "CPC inflation / quality drop";

                return (
                  <tr key={i} className="border-t border-border-subtle hover:bg-bg-hover">
                    <td className="p-2.5 font-semibold" style={{ color: catColor }}>{catLabel}</td>
                    <td className="p-2">{row.current_spend ? formatCurrency(Number(row.current_spend)) : "—"}</td>
                    <td className="p-2 text-text-muted">{row.prev_spend ? formatCurrency(Number(row.prev_spend)) : "—"}</td>
                    <td className="p-2 font-semibold text-green-400">{row.current_payments || 0}</td>
                    <td className="p-2 text-text-muted">{row.prev_payments || 0}</td>
                    <td className="p-2 font-semibold" style={{ color: cppDir === "down" ? "#4ade80" : cppDir === "up" ? "#f87171" : "#8b8fa7" }}>{row.current_cpp ? formatCurrency(Number(row.current_cpp)) : "—"}</td>
                    <td className="p-2 text-text-muted">{row.prev_cpp ? formatCurrency(Number(row.prev_cpp)) : "—"}</td>
                    <td className="p-2" style={{ color: cppDir === "down" ? "#4ade80" : "#f87171" }}>{cppChange !== "—" ? `${Number(cppChange) > 0 ? "+" : ""}${cppChange}%` : "—"}</td>
                    <td className="p-2 text-text-muted">{interpretation}</td>
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
