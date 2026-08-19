"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/constants";

interface Props {
  product: string;
  dateFrom?: string;
  dateTo?: string;
}

interface ChannelData {
  channel: string;
  leads: number;
  pct: string;
}

interface FunnelData {
  overall: { leads: number; l2: number; conversions: number };
  pm_attributed: { leads: number; l2: number; conversions: number; spend: number };
  attribution_pct: { leads: string; conversions: string };
  channels: ChannelData[];
}

const PRODUCT_LABELS: Record<string, { lead: string; conv: string }> = {
  domestic_pg: { lead: "Signups", conv: "New MTU" },
  rize: { lead: "Leads", conv: "Payments" },
  cards: { lead: "Signups", conv: "MTU" },
};

export default function FunnelOverview({ product, dateFrom, dateTo }: Props) {
  const [data, setData] = useState<FunnelData | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ product });
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    fetch(`/api/funnel-overview?${params}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); })
      .catch(() => {});
  }, [product, dateFrom, dateTo]);

  if (!data || (data.overall.leads === 0 && data.pm_attributed.leads === 0)) return null;

  const labels = PRODUCT_LABELS[product] || PRODUCT_LABELS.domestic_pg;
  const showL2 = product !== "rize";

  return (
    <div className="card p-4 mb-4">
      <h3 className="text-[0.82rem] font-semibold text-text-secondary mb-3">Product Funnel — Overall vs Performance Marketing</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Overall (All Channels) */}
        <div className="bg-bg-elevated rounded-lg p-4 border border-border-subtle">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[0.68rem] px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-300 border border-slate-500/30 font-medium">All Channels</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-[0.62rem] text-text-dimmed uppercase">{labels.lead}</div>
              <div className="text-[1rem] font-bold text-white">{data.overall.leads.toLocaleString("en-IN")}</div>
            </div>
            {showL2 && (
              <div>
                <div className="text-[0.62rem] text-text-dimmed uppercase">L2</div>
                <div className="text-[1rem] font-bold text-white">{data.overall.l2.toLocaleString("en-IN")}</div>
              </div>
            )}
            <div>
              <div className="text-[0.62rem] text-text-dimmed uppercase">{labels.conv}</div>
              <div className="text-[1rem] font-bold text-white">{data.overall.conversions.toLocaleString("en-IN")}</div>
            </div>
          </div>
        </div>

        {/* PM Attributed */}
        <div className="bg-blue-950/20 rounded-lg p-4 border border-blue-800/30">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[0.68rem] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 font-medium">Performance Marketing</span>
            <span className="text-[0.62rem] text-text-dimmed">
              {data.attribution_pct.leads}% of {labels.lead.toLowerCase()} | {data.attribution_pct.conversions}% of {labels.conv.toLowerCase()}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-[0.62rem] text-text-dimmed uppercase">{labels.lead}</div>
              <div className="text-[1rem] font-bold text-blue-400">{data.pm_attributed.leads.toLocaleString("en-IN")}</div>
            </div>
            {showL2 && (
              <div>
                <div className="text-[0.62rem] text-text-dimmed uppercase">L2</div>
                <div className="text-[1rem] font-bold text-blue-400">{data.pm_attributed.l2.toLocaleString("en-IN")}</div>
              </div>
            )}
            <div>
              <div className="text-[0.62rem] text-text-dimmed uppercase">{labels.conv}</div>
              <div className="text-[1rem] font-bold text-blue-400">{data.pm_attributed.conversions.toLocaleString("en-IN")}</div>
            </div>
          </div>
          {data.pm_attributed.spend > 0 && (
            <div className="mt-2 pt-2 border-t border-blue-800/20 text-[0.68rem] text-text-dimmed">
              PM Spend: <span className="text-white font-medium">{formatCurrency(data.pm_attributed.spend)}</span>
              {data.pm_attributed.conversions > 0 && (
                <span className="ml-3">Cost/{labels.conv}: <span className="text-white font-medium">{formatCurrency(data.pm_attributed.spend / data.pm_attributed.conversions)}</span></span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Channel Breakdown */}
      {data.channels && data.channels.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border-subtle">
          <h4 className="text-[0.72rem] font-medium text-text-muted mb-2 uppercase tracking-wide">Channel Contribution</h4>
          <div className="space-y-1.5">
            {data.channels.map((ch, i) => {
              const pct = parseFloat(ch.pct) || 0;
              const colors = ["bg-blue-500", "bg-slate-400", "bg-purple-500", "bg-green-500", "bg-amber-500", "bg-cyan-500"];
              const barColor = i === 0 ? colors[0] : colors[Math.min(i, colors.length - 1)];
              return (
                <div key={ch.channel} className="flex items-center gap-3">
                  <div className="w-[140px] text-[0.7rem] text-text-secondary truncate">{ch.channel}</div>
                  <div className="flex-1 h-5 bg-bg-elevated rounded overflow-hidden">
                    <div className={`h-full ${barColor} rounded opacity-70`} style={{ width: `${Math.max(pct, 1)}%` }} />
                  </div>
                  <div className="w-[80px] text-right text-[0.7rem] text-white font-medium">{ch.leads.toLocaleString("en-IN")}</div>
                  <div className="w-[40px] text-right text-[0.65rem] text-text-dimmed">{pct}%</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
