"use client";

import { useEffect, useState } from "react";
import { CATEGORIES, CATEGORY_COLORS, formatCurrency } from "@/lib/constants";

interface Props {
  filters: { business: string; categories: string[]; platform: string; device: string };
}

interface CampaignRow {
  campaign_name: string;
  category: string;
  platform: string;
  sub_category: string | null;
  device_target: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  payments: number;
  cpp: number | null;
  cpl: number | null;
  l2p_rate: number | null;
  cpc: number | null;
  avg_is: number | null;
}

export default function DeepDiveTab({ filters }: Props) {
  const [data, setData] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/metrics?view=campaigns&business=${filters.business}`)
      .then(r => r.json())
      .then(res => { setData(res.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filters.business]);

  if (loading) return <div className="text-text-muted text-center py-10">Loading...</div>;
  if (!data.length) return <div className="text-text-muted text-center py-10">No campaign data available</div>;

  const categories = [...new Set(data.map(d => d.category))];
  const filteredCategories = filters.categories.length > 0
    ? categories.filter(c => filters.categories.includes(c))
    : categories;

  // Sort categories by total spend
  const catsBySpend = filteredCategories.sort((a, b) => {
    const aSpend = data.filter(d => d.category === a).reduce((s, d) => s + Number(d.spend), 0);
    const bSpend = data.filter(d => d.category === b).reduce((s, d) => s + Number(d.spend), 0);
    return bSpend - aSpend;
  });

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-1">Category Deep Dive</h2>
      <p className="text-text-muted text-[0.8rem] mb-4">Campaign-level breakdown — Real backend CPP, sorted by spend</p>

      {catsBySpend.map(cat => {
        const catData = data.filter(d => d.category === cat).sort((a, b) => Number(b.spend) - Number(a.spend));
        const catColor = CATEGORY_COLORS[cat] || "#8b8fa7";
        const catLabel = CATEGORIES.find(c => c.id === cat)?.label || cat;
        const totalSpend = catData.reduce((s, d) => s + Number(d.spend), 0);
        const totalPmts = catData.reduce((s, d) => s + (d.payments || 0), 0);
        const totalLeads = catData.reduce((s, d) => s + (d.leads || 0), 0);

        const alerts: string[] = [];
        catData.forEach(c => {
          if (Number(c.spend) > 5000 && c.payments === 0) {
            alerts.push(`${c.campaign_name}: ${formatCurrency(Number(c.spend))} spent with 0 payments`);
          }
        });

        return (
          <div key={cat} className="card mb-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-[0.95rem] font-semibold text-text-secondary">
                <span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{ background: catColor }} />
                {catLabel} — {catData.length} campaigns
              </h3>
              <div className="text-[0.74rem] text-text-muted">
                {formatCurrency(totalSpend)} spend | {totalPmts} pmts | CPP: {totalPmts > 0 ? formatCurrency(totalSpend / totalPmts) : "—"}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[0.76rem]">
                <thead>
                  <tr className="bg-bg-hover">
                    <th className="p-2.5 text-left text-[0.64rem] text-text-dimmed uppercase font-semibold">Campaign</th>
                    <th className="p-2 text-[0.64rem] text-text-dimmed">Spend</th>
                    <th className="p-2 text-[0.64rem] text-text-dimmed">Leads</th>
                    <th className="p-2 text-[0.64rem] text-text-dimmed">Pmts</th>
                    <th className="p-2 text-[0.64rem] text-text-dimmed">CPL</th>
                    <th className="p-2 text-[0.64rem] text-text-dimmed">CPP (Real)</th>
                    <th className="p-2 text-[0.64rem] text-text-dimmed">L2P</th>
                    <th className="p-2 text-[0.64rem] text-text-dimmed">CPC</th>
                    <th className="p-2 text-[0.64rem] text-text-dimmed">IS%</th>
                  </tr>
                </thead>
                <tbody>
                  {catData.slice(0, 15).map((row, i) => {
                    const caps: Record<string, number> = { brand: 2000, high_intent: 3000, generic: 2700, pmax: 2700, competitor: 4000, retargeting: 4000 };
                    const cap = caps[cat] || 2700;
                    const cppColor = row.cpp ? (Number(row.cpp) <= cap * 0.85 ? "#4ade80" : Number(row.cpp) <= cap ? "#facc15" : "#f87171") : "#8b8fa7";

                    return (
                      <tr key={i} className="border-t border-border-subtle hover:bg-bg-hover">
                        <td className="p-2.5 font-semibold text-white max-w-[200px] truncate" title={row.campaign_name}>
                          {row.campaign_name.length > 40 ? row.campaign_name.slice(0, 40) + "..." : row.campaign_name}
                        </td>
                        <td className="p-2">{formatCurrency(Number(row.spend))}</td>
                        <td className="p-2">{row.leads || 0}</td>
                        <td className="p-2 font-semibold">{row.payments || 0}</td>
                        <td className="p-2">{row.cpl ? formatCurrency(Number(row.cpl)) : "—"}</td>
                        <td className="p-2 font-semibold" style={{ color: cppColor }}>{row.cpp ? formatCurrency(Number(row.cpp)) : "—"}</td>
                        <td className="p-2">{row.l2p_rate ? (Number(row.l2p_rate) * 100).toFixed(1) + "%" : "—"}</td>
                        <td className="p-2">{row.cpc ? formatCurrency(Number(row.cpc)) : "—"}</td>
                        <td className="p-2">{row.avg_is ? (Number(row.avg_is) * 100).toFixed(0) + "%" : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {alerts.length > 0 && (
              <div className="mt-2.5">
                {alerts.map((a, i) => (
                  <p key={i} className="text-[0.74rem] text-red-400">⚠ {a}</p>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
