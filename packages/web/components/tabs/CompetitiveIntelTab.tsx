"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/constants";

interface Props {
  filters: { categories: string[]; platform: string; device: string; product?: string };
}

interface ISRow {
  campaign_name: string;
  category: string;
  platform: string;
  impression_share: string;
  top_is: string | null;
  lost_is_budget: string | null;
  lost_is_rank: string | null;
  spend: string;
  clicks: number;
  impressions: number;
}

interface SearchTerm {
  campaign: string;
  search_term: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  ctr: number;
}

interface QualityScore {
  campaign: string;
  keyword: string;
  quality_score: number;
  ad_relevance: string;
  landing_page_exp: string;
  expected_ctr: string;
  spend: number;
}

export default function CompetitiveIntelTab({ filters }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<"is" | "search" | "quality">("is");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/competitive?product=${(filters as any).product || "domestic_pg"}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [(filters as any).product]);

  if (loading) return <div className="text-text-muted text-center py-10">Loading competitive intelligence...</div>;
  if (!data) return <div className="text-text-muted text-center py-10">No data available</div>;

  const { impression_share, search_terms, quality_scores, scale_opportunities } = data;

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex gap-2 border-b border-border-subtle pb-2">
        {[
          { id: "is", label: "Impression Share", icon: "📊" },
          { id: "search", label: "Search Term Battleground", icon: "🔍" },
          { id: "quality", label: "Quality Scores", icon: "⭐" },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id as any)}
            className={`px-3 py-1.5 rounded-t-lg text-[0.78rem] font-medium transition-colors ${
              activeSection === tab.id
                ? "bg-blue-600/20 text-blue-400 border-b-2 border-blue-400"
                : "text-text-muted hover:text-white"
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Impression Share Section */}
      {activeSection === "is" && (
        <div className="space-y-4">
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-white mb-1">Campaign-Level Competitive Pressure</h3>
            <p className="text-[0.72rem] text-text-dimmed mb-4">
              Impression Share shows how often your ads appear when eligible. Low IS = you're missing auctions.
              <strong className="text-amber-400"> Lost IS (Budget)</strong> = you ran out of money.
              <strong className="text-red-400"> Lost IS (Rank)</strong> = competitors outbid you.
            </p>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-[0.73rem]">
                <thead className="sticky top-0 bg-bg-elevated z-10">
                  <tr className="border-b border-border-subtle text-text-muted">
                    <th className="text-left py-2 px-2">Campaign</th>
                    <th className="text-left py-2 px-2">Category</th>
                    <th className="text-right py-2 px-2">Spend (7D)</th>
                    <th className="text-right py-2 px-2">Your IS</th>
                    <th className="text-right py-2 px-2">Top IS</th>
                    <th className="text-right py-2 px-2">Lost (Budget)</th>
                    <th className="text-right py-2 px-2">Lost (Rank)</th>
                    <th className="text-right py-2 px-2">Opportunity</th>
                  </tr>
                </thead>
                <tbody>
                  {(impression_share || []).map((row: ISRow, i: number) => {
                    const is_val = parseFloat(row.impression_share) || 0;
                    const isColor = is_val > 0.8 ? "text-green-400" : is_val > 0.5 ? "text-amber-400" : "text-red-400";
                    const lostBudget = row.lost_is_budget ? parseFloat(row.lost_is_budget) : 0;
                    const lostRank = row.lost_is_rank ? parseFloat(row.lost_is_rank) : 0;
                    const shortName = row.campaign_name.replace(/^RPSME-RPPerf-|^RPHQL-RPPerf-|^RRize-RPPerf-|^RPIPC-RPPerf-/i, "");

                    return (
                      <tr key={i} className="border-b border-border-subtle/50 hover:bg-bg-hover/30">
                        <td className="py-2 px-2 text-white max-w-[250px] truncate" title={row.campaign_name}>{shortName}</td>
                        <td className="py-2 px-2 text-text-secondary">{row.category}</td>
                        <td className="py-2 px-2 text-right text-white">{formatCurrency(parseFloat(row.spend))}</td>
                        <td className={`py-2 px-2 text-right font-medium ${isColor}`}>{(is_val * 100).toFixed(1)}%</td>
                        <td className="py-2 px-2 text-right text-text-secondary">{row.top_is ? (parseFloat(row.top_is) * 100).toFixed(1) + "%" : "—"}</td>
                        <td className="py-2 px-2 text-right text-amber-400">{lostBudget > 0 ? (lostBudget * 100).toFixed(1) + "%" : "—"}</td>
                        <td className="py-2 px-2 text-right text-red-400">{lostRank > 0 ? (lostRank * 100).toFixed(1) + "%" : "—"}</td>
                        <td className="py-2 px-2 text-right">
                          {is_val < 0.7 ? (
                            <span className="text-[0.65rem] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">Scale</span>
                          ) : is_val < 0.9 ? (
                            <span className="text-[0.65rem] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">Monitor</span>
                          ) : (
                            <span className="text-[0.65rem] px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-400 border border-slate-500/30">Saturated</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Scale Opportunities */}
          {scale_opportunities?.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-white mb-3">🚀 Scale Opportunities</h3>
              <p className="text-[0.72rem] text-text-dimmed mb-3">Campaigns with IS &lt; 70% — room to grow by increasing budget or bids.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {scale_opportunities.slice(0, 6).map((opp: any, i: number) => {
                  const shortName = opp.campaign_name.replace(/^RPSME-RPPerf-|^RPHQL-RPPerf-|^RRize-RPPerf-|^RPIPC-RPPerf-/i, "");
                  return (
                    <div key={i} className="bg-green-950/20 border border-green-800/30 rounded-lg p-3">
                      <div className="text-[0.75rem] text-white font-medium truncate" title={opp.campaign_name}>{shortName}</div>
                      <div className="flex gap-3 mt-1 text-[0.68rem]">
                        <span className="text-text-muted">IS: <strong className="text-amber-400">{(parseFloat(opp.impression_share) * 100).toFixed(0)}%</strong></span>
                        <span className="text-text-muted">Spend: <strong className="text-white">{formatCurrency(parseFloat(opp.spend))}</strong></span>
                        <span className="text-text-muted">Lost(Rank): <strong className="text-red-400">{opp.lost_is_rank ? (parseFloat(opp.lost_is_rank) * 100).toFixed(0) + "%" : "—"}</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search Term Section */}
      {activeSection === "search" && (
        <div className="space-y-4">
          {/* Top Performers */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-green-400 mb-1">✅ Top Performing Search Terms</h3>
            <p className="text-[0.72rem] text-text-dimmed mb-3">Terms driving conversions — protect and expand these.</p>
            {search_terms?.top_performers?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[0.73rem]">
                  <thead>
                    <tr className="border-b border-border-subtle text-text-muted">
                      <th className="text-left py-2 px-2">Search Term</th>
                      <th className="text-left py-2 px-2">Campaign</th>
                      <th className="text-right py-2 px-2">Clicks</th>
                      <th className="text-right py-2 px-2">Spend</th>
                      <th className="text-right py-2 px-2">Conv</th>
                      <th className="text-right py-2 px-2">CPA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {search_terms.top_performers.map((t: SearchTerm, i: number) => (
                      <tr key={i} className="border-b border-border-subtle/50">
                        <td className="py-2 px-2 text-white">{t.search_term}</td>
                        <td className="py-2 px-2 text-text-secondary text-[0.68rem] max-w-[150px] truncate">{(t.campaign || "").replace(/^RPSME-RPPerf-/i, "")}</td>
                        <td className="py-2 px-2 text-right">{t.clicks}</td>
                        <td className="py-2 px-2 text-right">{formatCurrency(t.spend)}</td>
                        <td className="py-2 px-2 text-right text-green-400 font-medium">{t.conversions}</td>
                        <td className="py-2 px-2 text-right text-white">{t.conversions > 0 ? formatCurrency(t.spend / t.conversions) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-text-dimmed text-[0.75rem]">No converting search terms in cache. Run the signals pipeline to refresh.</p>
            )}
          </div>

          {/* Waste / Bleed */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-red-400 mb-1">🚨 Wasted Spend — Zero Conversion Terms</h3>
            <p className="text-[0.72rem] text-text-dimmed mb-3">Terms spending money with 0 conversions — consider adding as negatives.</p>
            {search_terms?.waste?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[0.73rem]">
                  <thead>
                    <tr className="border-b border-border-subtle text-text-muted">
                      <th className="text-left py-2 px-2">Search Term</th>
                      <th className="text-left py-2 px-2">Campaign</th>
                      <th className="text-right py-2 px-2">Clicks</th>
                      <th className="text-right py-2 px-2">Spend Wasted</th>
                      <th className="text-right py-2 px-2">Conv</th>
                      <th className="text-center py-2 px-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {search_terms.waste.map((t: SearchTerm, i: number) => (
                      <tr key={i} className="border-b border-border-subtle/50">
                        <td className="py-2 px-2 text-white">{t.search_term}</td>
                        <td className="py-2 px-2 text-text-secondary text-[0.68rem] max-w-[150px] truncate">{(t.campaign || "").replace(/^RPSME-RPPerf-/i, "")}</td>
                        <td className="py-2 px-2 text-right">{t.clicks}</td>
                        <td className="py-2 px-2 text-right text-red-400 font-medium">{formatCurrency(t.spend)}</td>
                        <td className="py-2 px-2 text-right text-red-400">0</td>
                        <td className="py-2 px-2 text-center">
                          <span className="text-[0.62rem] px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">Add Negative</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-text-dimmed text-[0.75rem]">No wasted terms found in cache.</p>
            )}
          </div>
        </div>
      )}

      {/* Quality Scores Section */}
      {activeSection === "quality" && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-white mb-1">Keyword Quality Scores</h3>
          <p className="text-[0.72rem] text-text-dimmed mb-3">
            Low QS = you're paying more per click. Fix ad relevance or landing page to reduce CPC.
            <strong className="text-red-400"> QS 1-4</strong> = critical,
            <strong className="text-amber-400"> QS 5-6</strong> = needs work,
            <strong className="text-green-400"> QS 7+</strong> = good.
          </p>
          {quality_scores?.length > 0 ? (
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-[0.73rem]">
                <thead className="sticky top-0 bg-bg-elevated z-10">
                  <tr className="border-b border-border-subtle text-text-muted">
                    <th className="text-left py-2 px-2">Keyword</th>
                    <th className="text-left py-2 px-2">Campaign</th>
                    <th className="text-center py-2 px-2">QS</th>
                    <th className="text-center py-2 px-2">Ad Relevance</th>
                    <th className="text-center py-2 px-2">Landing Page</th>
                    <th className="text-center py-2 px-2">Expected CTR</th>
                    <th className="text-right py-2 px-2">Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {quality_scores.map((qs: QualityScore, i: number) => {
                    const qsColor = qs.quality_score <= 4 ? "text-red-400 bg-red-500/20" : qs.quality_score <= 6 ? "text-amber-400 bg-amber-500/20" : "text-green-400 bg-green-500/20";
                    const statusColor = (s: string) => s === "ABOVE_AVERAGE" ? "text-green-400" : s === "BELOW_AVERAGE" ? "text-red-400" : "text-amber-400";
                    return (
                      <tr key={i} className="border-b border-border-subtle/50">
                        <td className="py-2 px-2 text-white">{qs.keyword}</td>
                        <td className="py-2 px-2 text-text-secondary text-[0.68rem] max-w-[150px] truncate">{(qs.campaign || "").replace(/^RPSME-RPPerf-/i, "")}</td>
                        <td className="py-2 px-2 text-center"><span className={`px-2 py-0.5 rounded font-bold ${qsColor}`}>{qs.quality_score}</span></td>
                        <td className={`py-2 px-2 text-center text-[0.68rem] ${statusColor(qs.ad_relevance)}`}>{(qs.ad_relevance || "").replace("_", " ")}</td>
                        <td className={`py-2 px-2 text-center text-[0.68rem] ${statusColor(qs.landing_page_exp)}`}>{(qs.landing_page_exp || "").replace("_", " ")}</td>
                        <td className={`py-2 px-2 text-center text-[0.68rem] ${statusColor(qs.expected_ctr)}`}>{(qs.expected_ctr || "").replace("_", " ")}</td>
                        <td className="py-2 px-2 text-right">{qs.spend ? formatCurrency(qs.spend) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-text-dimmed text-[0.75rem]">No quality score data in cache. Run the signals pipeline to refresh.</p>
          )}
        </div>
      )}
    </div>
  );
}
