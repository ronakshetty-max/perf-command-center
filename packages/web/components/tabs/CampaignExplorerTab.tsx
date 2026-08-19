"use client";

import { useEffect, useState } from "react";
import { CATEGORIES, CATEGORY_COLORS, formatCurrency, formatPercent } from "@/lib/constants";
import type { DateRange } from "@/components/layout/TimeRangeSelector";

interface Props {
  filters: { categories: string[]; platform: string; device: string; product?: string };
  dateRange: DateRange;
  searchQuery: string;
}

interface CampaignRow {
  campaign_name: string;
  category: string;
  platform: string;
  sub_category: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  payments: number;
  cpp: number | null;
  cpl: number | null;
  l2p_rate: number | null;
  cpc: number | null;
  ctr: number | null;
  avg_is: number | null;
  active_days: number;
}

interface DailyRow {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  payments: number;
  cpp: number | null;
  cpl: number | null;
  impression_share: number | null;
}

type SortCol = "spend" | "impressions" | "clicks" | "leads" | "payments" | "cpp" | "cpl" | "l2p_rate" | "cpc" | "avg_is";

const CPP_CAPS: Record<string, number> = { brand: 2000, high_intent: 3000, generic: 2700, pmax: 2700, competitor: 4000, retargeting: 4000 };

function getCppColor(cpp: number | null, category: string): string {
  if (!cpp) return "#8b8fa7";
  const cap = CPP_CAPS[category] || 2700;
  if (cpp <= cap * 0.85) return "#4ade80";
  if (cpp <= cap) return "#facc15";
  return "#f87171";
}

function shortName(name: string): string {
  return name
    .replace(/RRize-RPPerf-/g, "")
    .replace(/GSearch-Prospect-/g, "")
    .replace(/AllDevices-/g, "")
    .replace(/WebsiteTraffic-NB-Registration-/g, "")
    .replace(/WebsiteLead-NB-Registration-/g, "")
    .replace(/-Clicks-India/g, "")
    .replace(/-Conv-India/g, "")
    .replace(/G-Pmax-Prospect-/g, "PMax-");
}

function getDeviceTarget(name: string): string {
  if (name.toLowerCase().includes("mweb")) return "Mweb";
  if (name.toLowerCase().includes("dweb")) return "Dweb";
  if (name.toLowerCase().includes("alldev")) return "AllDev";
  return "—";
}

const DEVICE_TARGETS = [
  { id: "all", label: "All Devices" },
  { id: "Dweb", label: "Dweb" },
  { id: "Mweb", label: "Mweb" },
  { id: "AllDev", label: "AllDev" },
];

export default function CampaignExplorerTab({ filters, dateRange, searchQuery }: Props) {
  const [data, setData] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortCol>("spend");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [dailyData, setDailyData] = useState<DailyRow[]>([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [deviceFilter, setDeviceFilter] = useState("all");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      business: "eb", product: (filters as any).product || "domestic_pg",
      sortBy,
      sortDir,
      dateFrom: dateRange.dateFrom,
      dateTo: dateRange.dateTo,
    });
    if (searchQuery) params.set("search", searchQuery);
    if (filters.categories.length === 1) params.set("category", filters.categories[0]);

    fetch(`/api/campaigns?${params}`)
      .then(r => r.json())
      .then(res => { setData(res.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [dateRange, sortBy, sortDir, searchQuery, filters.categories, (filters as any).product]);

  const handleSort = (col: SortCol) => {
    if (sortBy === col) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortBy(col);
      setSortDir("desc");
    }
  };

  const handleExpand = async (campaignName: string) => {
    if (expandedCampaign === campaignName) {
      setExpandedCampaign(null);
      return;
    }
    setExpandedCampaign(campaignName);
    setDailyLoading(true);
    const params = new URLSearchParams({
      business: "eb", product: (filters as any).product || "domestic_pg",
      view: "daily",
      campaign: campaignName,
      dateFrom: dateRange.dateFrom,
      dateTo: dateRange.dateTo,
    });
    const res = await fetch(`/api/campaigns?${params}`).then(r => r.json());
    setDailyData(res.data || []);
    setDailyLoading(false);
  };

  const filteredData = data.filter(row => {
    if (filters.categories.length > 0 && !filters.categories.includes(row.category)) return false;
    if (deviceFilter !== "all" && getDeviceTarget(row.campaign_name) !== deviceFilter) return false;
    return true;
  });

  const totalSpend = filteredData.reduce((s, r) => s + Number(r.spend || 0), 0);
  const totalPayments = filteredData.reduce((s, r) => s + (r.payments || 0), 0);
  const totalLeads = filteredData.reduce((s, r) => s + (r.leads || 0), 0);
  const blendedCpp = totalPayments > 0 ? totalSpend / totalPayments : 0;

  if (loading) {
    return <div className="text-text-muted text-center py-10">Loading campaign data...</div>;
  }

  const SortHeader = ({ col, label }: { col: SortCol; label: string }) => (
    <th
      className="text-left p-2.5 text-[0.66rem] text-text-dimmed uppercase tracking-wider font-semibold cursor-pointer hover:text-text-secondary select-none"
      onClick={() => handleSort(col)}
    >
      {label} {sortBy === col && (sortDir === "desc" ? "↓" : "↑")}
    </th>
  );

  return (
    <div>
      {/* Device Target Filter */}
      <div className="card p-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[0.7rem] text-text-dimmed font-semibold uppercase">Device Target:</span>
          {DEVICE_TARGETS.map(dt => (
            <button
              key={dt.id}
              onClick={() => setDeviceFilter(dt.id)}
              className={`px-3 py-1.5 rounded-md text-[0.75rem] font-medium transition-all ${
                deviceFilter === dt.id
                  ? "bg-orange-500/20 text-orange-400 border border-orange-500/40"
                  : "bg-bg-hover text-text-muted hover:text-text-secondary border border-transparent"
              }`}
            >
              {dt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="card p-3">
          <p className="text-[0.68rem] text-text-dimmed uppercase">Total Spend</p>
          <p className="text-[1.2rem] font-bold text-white">{formatCurrency(totalSpend)}</p>
        </div>
        <div className="card p-3">
          <p className="text-[0.68rem] text-text-dimmed uppercase">Payments</p>
          <p className="text-[1.2rem] font-bold text-green-400">{totalPayments}</p>
        </div>
        <div className="card p-3">
          <p className="text-[0.68rem] text-text-dimmed uppercase">Blended CPP</p>
          <p className="text-[1.2rem] font-bold" style={{ color: getCppColor(blendedCpp, "generic") }}>
            {blendedCpp > 0 ? formatCurrency(blendedCpp) : "—"}
          </p>
        </div>
        <div className="card p-3">
          <p className="text-[0.68rem] text-text-dimmed uppercase">Campaigns Active</p>
          <p className="text-[1.2rem] font-bold text-blue-400">{filteredData.length}</p>
        </div>
      </div>

      {/* Campaign Table */}
      <div className="card">
        <div className="overflow-x-auto rounded-lg">
          <table className="w-full text-[0.78rem]">
            <thead>
              <tr className="bg-bg-hover">
                <th className="text-left p-2.5 text-[0.66rem] text-text-dimmed uppercase tracking-wider font-semibold w-8"></th>
                <th className="text-left p-2.5 text-[0.66rem] text-text-dimmed uppercase tracking-wider font-semibold">Campaign</th>
                <th className="text-left p-2.5 text-[0.66rem] text-text-dimmed uppercase tracking-wider font-semibold">Cat</th>
                <th className="text-left p-2.5 text-[0.66rem] text-text-dimmed uppercase tracking-wider font-semibold">Device</th>
                <SortHeader col="spend" label="Spend" />
                <SortHeader col="impressions" label="Impr" />
                <SortHeader col="clicks" label="Clicks" />
                <SortHeader col="leads" label="Leads" />
                <SortHeader col="payments" label="Pmts" />
                <SortHeader col="cpl" label="CPL" />
                <SortHeader col="cpp" label="CPP" />
                <SortHeader col="l2p_rate" label="L2P" />
                <SortHeader col="cpc" label="CPC" />
                <SortHeader col="avg_is" label="IS%" />
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row, i) => {
                const catColor = CATEGORY_COLORS[row.category] || "#8b8fa7";
                const isExpanded = expandedCampaign === row.campaign_name;
                return (
                  <>
                    <tr
                      key={i}
                      className={`border-t border-border-subtle hover:bg-bg-hover transition-colors cursor-pointer ${isExpanded ? "bg-bg-hover" : ""}`}
                      onClick={() => handleExpand(row.campaign_name)}
                    >
                      <td className="p-2.5 text-text-dimmed text-[0.7rem]">{isExpanded ? "▼" : "▶"}</td>
                      <td className="p-2.5 font-medium text-text-secondary max-w-[240px] truncate" title={row.campaign_name}>
                        {shortName(row.campaign_name)}
                      </td>
                      <td className="p-2.5">
                        <span className="text-[0.65rem] font-semibold px-1.5 py-0.5 rounded" style={{ color: catColor, background: `${catColor}20` }}>
                          {row.category}
                        </span>
                      </td>
                      <td className="p-2.5">
                        <span className={`text-[0.65rem] font-medium px-1.5 py-0.5 rounded ${
                          getDeviceTarget(row.campaign_name) === "Mweb" ? "bg-purple-500/15 text-purple-400" :
                          getDeviceTarget(row.campaign_name) === "Dweb" ? "bg-cyan-500/15 text-cyan-400" :
                          getDeviceTarget(row.campaign_name) === "AllDev" ? "bg-yellow-500/15 text-yellow-400" :
                          "text-text-dimmed"
                        }`}>
                          {getDeviceTarget(row.campaign_name)}
                        </span>
                      </td>
                      <td className="p-2.5">{formatCurrency(Number(row.spend))}</td>
                      <td className="p-2.5 text-text-muted">{(Number(row.impressions) / 1000).toFixed(1)}K</td>
                      <td className="p-2.5 text-text-muted">{row.clicks}</td>
                      <td className="p-2.5">{row.leads || 0}</td>
                      <td className="p-2.5 font-semibold text-white">{row.payments || 0}</td>
                      <td className="p-2.5">{row.cpl ? formatCurrency(Number(row.cpl)) : "—"}</td>
                      <td className="p-2.5 font-semibold" style={{ color: getCppColor(row.cpp ? Number(row.cpp) : null, row.category) }}>
                        {row.cpp ? formatCurrency(Number(row.cpp)) : "—"}
                      </td>
                      <td className="p-2.5">{row.l2p_rate ? `${(Number(row.l2p_rate) * 100).toFixed(1)}%` : "—"}</td>
                      <td className="p-2.5">{row.cpc ? formatCurrency(Number(row.cpc)) : "—"}</td>
                      <td className="p-2.5">
                        {row.avg_is ? (
                          <span className={`font-medium ${Number(row.avg_is) < 0.5 ? "text-yellow-400" : "text-text-muted"}`}>
                            {(Number(row.avg_is) * 100).toFixed(0)}%
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${i}-detail`} className="bg-bg-elevated/50">
                        <td colSpan={14} className="p-4">
                          {dailyLoading ? (
                            <p className="text-text-dimmed text-[0.75rem]">Loading daily breakdown...</p>
                          ) : (
                            <div className="overflow-x-auto">
                              <p className="text-[0.72rem] text-text-dimmed mb-2 font-semibold uppercase">Daily Breakdown</p>
                              <table className="w-full text-[0.72rem]">
                                <thead>
                                  <tr className="text-text-dimmed">
                                    <th className="text-left p-1.5">Date</th>
                                    <th className="text-left p-1.5">Spend</th>
                                    <th className="text-left p-1.5">Impr</th>
                                    <th className="text-left p-1.5">Clicks</th>
                                    <th className="text-left p-1.5">Leads</th>
                                    <th className="text-left p-1.5">Pmts</th>
                                    <th className="text-left p-1.5">CPP</th>
                                    <th className="text-left p-1.5">IS%</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {dailyData.map((d, j) => (
                                    <tr key={j} className="border-t border-border-subtle/50">
                                      <td className="p-1.5 text-text-muted">{d.date}</td>
                                      <td className="p-1.5">{formatCurrency(Number(d.spend))}</td>
                                      <td className="p-1.5 text-text-muted">{d.impressions}</td>
                                      <td className="p-1.5 text-text-muted">{d.clicks}</td>
                                      <td className="p-1.5">{d.leads || 0}</td>
                                      <td className="p-1.5 font-semibold">{d.payments || 0}</td>
                                      <td className="p-1.5" style={{ color: getCppColor(d.cpp ? Number(d.cpp) : null, row.category) }}>
                                        {d.cpp ? formatCurrency(Number(d.cpp)) : "—"}
                                      </td>
                                      <td className="p-1.5">{d.impression_share ? `${(Number(d.impression_share) * 100).toFixed(0)}%` : "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {/* Totals */}
              <tr className="border-t-2 border-border-subtle bg-bg-hover font-semibold">
                <td className="p-2.5"></td>
                <td className="p-2.5 text-white">TOTAL ({filteredData.length} campaigns)</td>
                <td className="p-2.5"></td>
                <td className="p-2.5 text-white">{formatCurrency(totalSpend)}</td>
                <td className="p-2.5 text-text-muted">{(filteredData.reduce((s, r) => s + Number(r.impressions || 0), 0) / 1000).toFixed(0)}K</td>
                <td className="p-2.5 text-text-muted">{filteredData.reduce((s, r) => s + (r.clicks || 0), 0)}</td>
                <td className="p-2.5">{totalLeads}</td>
                <td className="p-2.5 text-white">{totalPayments}</td>
                <td className="p-2.5">{totalLeads > 0 ? formatCurrency(totalSpend / totalLeads) : "—"}</td>
                <td className="p-2.5 text-white" style={{ color: getCppColor(blendedCpp, "generic") }}>
                  {blendedCpp > 0 ? formatCurrency(blendedCpp) : "—"}
                </td>
                <td className="p-2.5">{totalLeads > 0 ? `${((totalPayments / totalLeads) * 100).toFixed(1)}%` : "—"}</td>
                <td className="p-2.5">{filteredData.reduce((s, r) => s + (r.clicks || 0), 0) > 0 ? formatCurrency(totalSpend / filteredData.reduce((s, r) => s + (r.clicks || 0), 0)) : "—"}</td>
                <td className="p-2.5">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
