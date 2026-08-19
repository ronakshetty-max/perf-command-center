"use client";

import { useEffect, useState } from "react";
import { formatCurrency, formatPercent, CATEGORY_COLORS } from "@/lib/constants";
import StatCard from "@/components/cards/StatCard";
import FunnelOverview from "@/components/cards/FunnelOverview";
import type { DateRange } from "@/components/layout/TimeRangeSelector";

interface Props {
  filters: { business: string; categories: string[]; platform: string; device: string; product?: string; source?: string };
  dateRange?: DateRange;
  product?: string;
}

const FUNNEL_LABELS: Record<string, { lead: string; conversion: string; cpl: string; cpp: string; rate: string }> = {
  domestic_pg: { lead: "Signups", conversion: "New MTU", cpl: "CPS", cpp: "CP-MTU", rate: "L2→MTU" },
  rize: { lead: "Leads", conversion: "Payments", cpl: "CPL", cpp: "CPP", rate: "L2P" },
  cards: { lead: "Signups", conversion: "MTU", cpl: "CPS", cpp: "CP-MTU", rate: "L2→MTU" },
};

interface Summary {
  campaign_count: string;
  total_spend: string;
  total_impressions: string;
  total_clicks: string;
  total_leads: string;
  total_payments: string;
  cpl: string | null;
  cpp: string | null;
  l2p_rate: string | null;
  ctr: string | null;
  click_to_lead_rate: string | null;
}

interface CampaignRow {
  campaign_name: string;
  category: string;
  platform: string;
  spend: string;
  impressions: string;
  clicks: string;
  leads: string;
  payments: string;
  cpp: string | null;
  cpl: string | null;
  l2p_rate: string | null;
  cpc: string | null;
}

type SortKey = "spend" | "impressions" | "clicks" | "leads" | "payments" | "cpp" | "cpl" | "l2p_rate" | "cpc" | "ctr";

export default function OverallTab({ filters, dateRange, product }: Props) {
  const labels = FUNNEL_LABELS[product || filters.product || "domestic_pg"] || FUNNEL_LABELS.domestic_pg;
  const [summary, setSummary] = useState<Summary | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDesc, setSortDesc] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSummary(null);
    setCampaigns([]);
    const source = (filters as any).source || "all";
    const productId = filters.product || "domestic_pg";

    const fetchGoogle = () => {
      const params = new URLSearchParams({ product: productId });
      if (dateRange?.dateFrom) params.set("dateFrom", dateRange.dateFrom);
      if (dateRange?.dateTo) params.set("dateTo", dateRange.dateTo);
      return fetch(`/api/google-ads?${params}`).then(r => r.json()).then(res => {
        if (res.error) throw new Error(res.error);
        return {
          summary: {
            campaign_count: String(res.summary?.campaign_count || 0),
            total_spend: String(res.summary?.total_spend || 0),
            total_impressions: String(res.summary?.total_impressions || 0),
            total_clicks: String(res.summary?.total_clicks || 0),
            total_leads: String(res.summary?.total_leads || 0),
            total_payments: String(res.summary?.total_payments || 0),
            cpl: res.summary?.cpl ? String(res.summary.cpl) : null,
            cpp: res.summary?.cpp ? String(res.summary.cpp) : null,
            l2p_rate: res.summary?.l2p_rate ? String(res.summary.l2p_rate) : null,
            ctr: res.summary?.ctr ? String(res.summary.ctr) : null,
            click_to_lead_rate: res.summary?.click_to_lead ? String(res.summary.click_to_lead) : null,
          },
          campaigns: (res.campaigns || []).map((c: any) => ({
            campaign_name: c.campaign_name,
            category: "generic",
            platform: "google",
            spend: String(c.spend || 0),
            impressions: String(c.impressions || 0),
            clicks: String(c.clicks || 0),
            leads: String(c.leads || 0),
            payments: String(c.payments || 0),
            cpp: c.cpp ? String(c.cpp) : null,
            cpl: c.cpl ? String(c.cpl) : null,
            l2p_rate: c.l2p_rate ? String(c.l2p_rate) : null,
            cpc: c.cpc ? String(c.cpc) : null,
          })),
        };
      }).catch(() => {
        // Fallback to PostgreSQL if Google Ads API fails
        const p = new URLSearchParams({ view: "overall", business: filters.business, product: productId });
        if (dateRange?.dateFrom) p.set("dateFrom", dateRange.dateFrom);
        if (dateRange?.dateTo) p.set("dateTo", dateRange.dateTo);
        return fetch(`/api/metrics?${p}`).then(r => r.json());
      });
    };

    const fetchMeta = () => {
      const params = new URLSearchParams({ action: "overall", product: productId });
      if (dateRange?.dateFrom) params.set("dateFrom", dateRange.dateFrom);
      if (dateRange?.dateTo) params.set("dateTo", dateRange.dateTo);
      return fetch(`/api/meta?${params}`).then(r => r.json());
    };

    if (source === "google") {
      fetchGoogle().then(res => {
        if (cancelled) return;
        setSummary(res.summary || null);
        setCampaigns(res.campaigns || []);
        setLoading(false);
      }).catch(() => { if (!cancelled) setLoading(false); });
    } else if (source === "meta") {
      fetchMeta().then(res => {
        if (cancelled) return;
        if (res.summary) {
          setSummary({
            campaign_count: String(res.summary.campaign_count || 0),
            total_spend: String(res.summary.total_spend || 0),
            total_impressions: String(res.summary.total_impressions || 0),
            total_clicks: String(res.summary.total_clicks || 0),
            total_leads: String(res.summary.total_leads || 0),
            total_payments: String(res.summary.total_conversions || 0),
            cpl: res.summary.cpl ? String(res.summary.cpl) : null,
            cpp: res.summary.cpp ? String(res.summary.cpp) : null,
            l2p_rate: res.summary.l2p_rate ? String(res.summary.l2p_rate) : null,
            ctr: res.summary.ctr ? String(res.summary.ctr) : null,
            click_to_lead_rate: res.summary.click_to_lead ? String(res.summary.click_to_lead) : null,
          });
          setCampaigns((res.campaigns || []).map((c: any) => ({
            campaign_name: c.campaign_name,
            category: c.category || "generic",
            platform: "meta",
            spend: String(c.spend || 0),
            impressions: String(c.impressions || 0),
            clicks: String(c.clicks || 0),
            leads: String(c.leads || 0),
            payments: String(c.conversions || 0),
            cpp: c.cpp ? String(c.cpp) : null,
            cpl: c.cpl ? String(c.cpl) : null,
            l2p_rate: c.l2p_rate ? String(c.l2p_rate) : null,
            cpc: c.cpc ? String(c.cpc) : null,
          })));
        }
        setLoading(false);
      }).catch(() => { if (!cancelled) setLoading(false); });
    } else {
      // "all" — fetch both and merge
      Promise.all([fetchGoogle().catch(() => null), fetchMeta().catch(() => null)]).then(([gRes, mRes]) => {
        if (cancelled) return;
        const gSummary = gRes?.summary;
        const mSummary = mRes?.summary;

        const gSpend = parseFloat(gSummary?.total_spend) || 0;
        const mSpend = mSummary?.total_spend || 0;
        const gImpr = parseInt(gSummary?.total_impressions) || 0;
        const mImpr = mSummary?.total_impressions || 0;
        const gClicks = parseInt(gSummary?.total_clicks) || 0;
        const mClicks = mSummary?.total_clicks || 0;
        const gLeads = parseInt(gSummary?.total_leads) || 0;
        const mLeads = mSummary?.total_leads || 0;
        const gPay = parseInt(gSummary?.total_payments) || 0;
        const mPay = mSummary?.total_conversions || 0;

        const totalSpend = gSpend + mSpend;
        const totalImpr = gImpr + mImpr;
        const totalClicks = gClicks + mClicks;
        const totalLeads = gLeads + mLeads;
        const totalPay = gPay + mPay;

        setSummary({
          campaign_count: String((parseInt(gSummary?.campaign_count) || 0) + (mSummary?.campaign_count || 0)),
          total_spend: String(totalSpend),
          total_impressions: String(totalImpr),
          total_clicks: String(totalClicks),
          total_leads: String(totalLeads),
          total_payments: String(totalPay),
          cpl: totalLeads > 0 ? String(totalSpend / totalLeads) : null,
          cpp: totalPay > 0 ? String(totalSpend / totalPay) : null,
          l2p_rate: totalLeads > 0 ? String(totalPay / totalLeads) : null,
          ctr: totalImpr > 0 ? String(totalClicks / totalImpr) : null,
          click_to_lead_rate: totalClicks > 0 ? String(totalLeads / totalClicks) : null,
        });

        // Deduplicate: merge Google (DB with leads) + Meta (API with spend) by campaign_name
        const mergedMap: Record<string, any> = {};
        for (const c of (gRes?.campaigns || [])) {
          const name = c.campaign_name;
          mergedMap[name] = { ...c, platform: c.platform || "google" };
        }
        for (const c of (mRes?.campaigns || [])) {
          const name = c.campaign_name;
          if (mergedMap[name]) {
            // Merge: take spend/impressions/clicks from Meta API, keep leads/payments from DB
            const existing = mergedMap[name];
            mergedMap[name] = {
              ...existing,
              spend: String(Math.max(parseFloat(existing.spend || "0"), c.spend || 0)),
              impressions: String(Math.max(parseInt(existing.impressions || "0"), c.impressions || 0)),
              clicks: String(Math.max(parseInt(existing.clicks || "0"), c.clicks || 0)),
              platform: existing.platform || "meta",
            };
          } else {
            mergedMap[name] = {
              campaign_name: name,
              category: c.category || "generic",
              platform: "meta",
              spend: String(c.spend || 0),
              impressions: String(c.impressions || 0),
              clicks: String(c.clicks || 0),
              leads: String(c.leads || 0),
              payments: String(c.conversions || 0),
              cpp: c.cpp ? String(c.cpp) : null,
              cpl: c.cpl ? String(c.cpl) : null,
              l2p_rate: c.l2p_rate ? String(c.l2p_rate) : null,
              cpc: c.cpc ? String(c.cpc) : null,
            };
          }
        }
        setCampaigns(Object.values(mergedMap));
        setLoading(false);
      });
    }

    return () => { cancelled = true; };
  }, [filters.business, (filters as any).product, (filters as any).source, filters.categories, filters.platform, dateRange?.dateFrom, dateRange?.dateTo]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDesc(!sortDesc);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  const sortedCampaigns = [...campaigns].sort((a, b) => {
    const av = parseFloat((a as any)[sortKey]) || 0;
    const bv = parseFloat((b as any)[sortKey]) || 0;
    return sortDesc ? bv - av : av - bv;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-text-muted text-sm">Loading overall metrics...</div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-text-muted text-sm">No data available for selected period</div>
      </div>
    );
  }

  const spend = parseFloat(summary.total_spend) || 0;
  const impressions = parseInt(summary.total_impressions) || 0;
  const clicks = parseInt(summary.total_clicks) || 0;
  const leads = parseInt(summary.total_leads) || 0;
  const payments = parseInt(summary.total_payments) || 0;
  const cpl = summary.cpl ? parseFloat(summary.cpl) : null;
  const cpp = summary.cpp ? parseFloat(summary.cpp) : null;
  const l2pRate = summary.l2p_rate ? parseFloat(summary.l2p_rate) : null;
  const ctr = summary.ctr ? parseFloat(summary.ctr) : null;
  const clickToLead = summary.click_to_lead_rate ? parseFloat(summary.click_to_lead_rate) : null;

  return (
    <div className="space-y-6">
      {/* Overall Product Funnel vs PM Attribution */}
      <FunnelOverview product={product || "domestic_pg"} dateFrom={dateRange?.dateFrom} dateTo={dateRange?.dateTo} />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total Spend" value={formatCurrency(spend)} borderColor="#60a5fa" />
        <StatCard label="Impressions" value={formatNumber(impressions)} borderColor="#a78bfa" />
        <StatCard label="Clicks" value={formatNumber(clicks)} borderColor="#38bdf8" />
        <StatCard label={labels.lead} value={leads.toLocaleString()} borderColor="#4ade80" />
        <StatCard label={labels.conversion} value={payments.toLocaleString()} borderColor="#f97316" />
        <StatCard label={`${labels.cpp} (Overall)`} value={cpp ? formatCurrency(cpp) : "—"} borderColor="#f87171" />
      </div>

      {/* Funnel Visualization */}
      <div className="card">
        <h3 className="text-sm font-semibold text-text-secondary mb-4">Attribution Funnel</h3>
        <div className="flex items-center gap-2">
          <FunnelStage label="Impressions" value={impressions} color="#a78bfa" width={100} />
          <FunnelArrow rate={ctr} label="CTR" />
          <FunnelStage label="Clicks" value={clicks} color="#38bdf8" width={getWidth(clicks, impressions)} />
          <FunnelArrow rate={clickToLead} label="Click→Lead" />
          <FunnelStage label={labels.lead} value={leads} color="#4ade80" width={getWidth(leads, impressions)} />
          <FunnelArrow rate={l2pRate} label={labels.rate} />
          <FunnelStage label={labels.conversion} value={payments} color="#f97316" width={getWidth(payments, impressions)} />
        </div>
        <div className="grid grid-cols-4 gap-4 mt-5 pt-4 border-t border-border-subtle">
          <MiniStat label={labels.cpl} value={cpl ? formatCurrency(cpl) : "—"} />
          <MiniStat label={labels.cpp} value={cpp ? formatCurrency(cpp) : "—"} />
          <MiniStat label="L2P Rate" value={formatPercent(l2pRate)} />
          <MiniStat label="CTR" value={formatPercent(ctr)} />
        </div>
      </div>

      {/* Campaign Performance Table */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-secondary">Campaign Breakdown</h3>
          <span className="text-[0.7rem] text-text-dimmed">{campaigns.length} campaigns</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[0.75rem]">
            <thead>
              <tr className="border-b border-border-subtle text-text-muted">
                <th className="text-left py-2 px-2 font-medium">Campaign</th>
                <th className="text-left py-2 px-2 font-medium">Category</th>
                <th className="text-left py-2 px-2 font-medium">Platform</th>
                <SortableHeader label="Spend" sortKey="spend" currentKey={sortKey} desc={sortDesc} onClick={handleSort} />
                <SortableHeader label="Impressions" sortKey="impressions" currentKey={sortKey} desc={sortDesc} onClick={handleSort} />
                <SortableHeader label="Clicks" sortKey="clicks" currentKey={sortKey} desc={sortDesc} onClick={handleSort} />
                <SortableHeader label={labels.lead} sortKey="leads" currentKey={sortKey} desc={sortDesc} onClick={handleSort} />
                <SortableHeader label={labels.conversion} sortKey="payments" currentKey={sortKey} desc={sortDesc} onClick={handleSort} />
                <SortableHeader label="CPC" sortKey="cpc" currentKey={sortKey} desc={sortDesc} onClick={handleSort} />
                <SortableHeader label="CTR" sortKey="ctr" currentKey={sortKey} desc={sortDesc} onClick={handleSort} />
                <SortableHeader label={labels.cpl} sortKey="cpl" currentKey={sortKey} desc={sortDesc} onClick={handleSort} />
                <SortableHeader label={labels.cpp} sortKey="cpp" currentKey={sortKey} desc={sortDesc} onClick={handleSort} />
                <SortableHeader label={labels.rate} sortKey="l2p_rate" currentKey={sortKey} desc={sortDesc} onClick={handleSort} />
              </tr>
            </thead>
            <tbody>
              {sortedCampaigns.map((row, i) => (
                <tr key={i} className="border-b border-border-subtle/50 hover:bg-bg-elevated/50 transition-colors">
                  <td className="py-2.5 px-2 text-text-secondary max-w-[220px] truncate" title={row.campaign_name}>
                    {row.campaign_name}
                  </td>
                  <td className="py-2.5 px-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[row.category] || "#666" }} />
                      <span className="text-text-muted capitalize">{row.category.replace("_", " ")}</span>
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-text-muted capitalize">{row.platform.replace("_", " ")}</td>
                  <td className="py-2.5 px-2 text-text-secondary font-medium">{formatCurrency(parseFloat(row.spend) || 0)}</td>
                  <td className="py-2.5 px-2 text-text-muted">{formatNumber(parseInt(row.impressions) || 0)}</td>
                  <td className="py-2.5 px-2 text-text-muted">{formatNumber(parseInt(row.clicks) || 0)}</td>
                  <td className="py-2.5 px-2 text-text-secondary">{parseInt(row.leads) || 0}</td>
                  <td className="py-2.5 px-2 text-text-secondary font-medium">{parseInt(row.payments) || 0}</td>
                  <td className="py-2.5 px-2 text-text-muted">{row.cpc ? formatCurrency(parseFloat(row.cpc)) : "—"}</td>
                  <td className="py-2.5 px-2 text-text-muted">{parseInt(row.clicks) > 0 && parseInt(row.impressions) > 0 ? ((parseInt(row.clicks) / parseInt(row.impressions)) * 100).toFixed(1) + "%" : "—"}</td>
                  <td className="py-2.5 px-2 text-text-muted">{row.cpl ? formatCurrency(parseFloat(row.cpl)) : "—"}</td>
                  <td className="py-2.5 px-2 text-text-muted">{row.cpp ? formatCurrency(parseFloat(row.cpp)) : "—"}</td>
                  <td className="py-2.5 px-2 text-text-muted">{row.l2p_rate ? formatPercent(parseFloat(row.l2p_rate)) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border-medium font-semibold text-text-secondary">
                <td className="py-2.5 px-2">Total</td>
                <td className="py-2.5 px-2" />
                <td className="py-2.5 px-2" />
                <td className="py-2.5 px-2">{formatCurrency(spend)}</td>
                <td className="py-2.5 px-2">{formatNumber(impressions)}</td>
                <td className="py-2.5 px-2">{formatNumber(clicks)}</td>
                <td className="py-2.5 px-2">{leads.toLocaleString()}</td>
                <td className="py-2.5 px-2">{payments.toLocaleString()}</td>
                <td className="py-2.5 px-2">{cpl ? formatCurrency(cpl) : "—"}</td>
                <td className="py-2.5 px-2">{cpp ? formatCurrency(cpp) : "—"}</td>
                <td className="py-2.5 px-2">{l2pRate ? formatPercent(l2pRate) : "—"}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function FunnelStage({ label, value, color, width }: { label: string; value: number; color: string; width: number }) {
  return (
    <div className="flex-1 min-w-0">
      <div
        className="rounded-md py-3 px-3 text-center transition-all"
        style={{ backgroundColor: `${color}15`, border: `1px solid ${color}40`, minWidth: `${Math.max(width, 20)}%` }}
      >
        <div className="text-[1.1rem] font-bold text-white">{formatNumber(value)}</div>
        <div className="text-[0.65rem] text-text-muted mt-0.5">{label}</div>
      </div>
    </div>
  );
}

function FunnelArrow({ rate, label }: { rate: number | null; label: string }) {
  return (
    <div className="flex flex-col items-center px-1 shrink-0">
      <span className="text-[0.6rem] text-text-dimmed">{label}</span>
      <span className="text-text-muted">→</span>
      <span className="text-[0.7rem] font-medium text-blue-400">{rate !== null ? formatPercent(rate) : "—"}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-[0.65rem] text-text-dimmed uppercase tracking-wider">{label}</div>
      <div className="text-sm font-semibold text-text-secondary mt-0.5">{value}</div>
    </div>
  );
}

function SortableHeader({ label, sortKey, currentKey, desc, onClick }: {
  label: string; sortKey: SortKey; currentKey: SortKey; desc: boolean; onClick: (k: SortKey) => void;
}) {
  const active = currentKey === sortKey;
  return (
    <th
      className="text-right py-2 px-2 font-medium cursor-pointer hover:text-blue-400 transition-colors select-none"
      onClick={() => onClick(sortKey)}
    >
      {label} {active ? (desc ? "↓" : "↑") : ""}
    </th>
  );
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function getWidth(value: number, max: number): number {
  if (max === 0) return 20;
  return Math.max(20, (value / max) * 100);
}
