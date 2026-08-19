"use client";

import { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/constants";

interface Props {
  product?: string;
}

interface AuditData {
  summary: string;
  highlights: { title: string; detail: string; metric: string }[];
  lowlights: { title: string; detail: string; metric: string }[];
  changes_detected: { campaign: string; change: string; impact: string }[];
  recommendations: { priority: string; action: string; reasoning: string }[];
  health_score: number;
  week_over_week: { spend_change_pct: number; conversion_change_pct: number; cpp_change_pct: number };
}

interface AuditResult {
  audit: AuditData;
  generated_at: string;
  product: string;
  period: { this_week: any; last_week: any };
}

interface PastAudit {
  id: number;
  product: string;
  week_start: string;
  health_score: number;
  created_at: string;
  audit_data: AuditData;
}

const PRODUCT_LABELS: Record<string, string> = {
  domestic_pg: "Domestic PG",
  rize: "Rize",
  cards: "Cards International",
};

export default function AuditTab({ product = "domestic_pg" }: Props) {
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [pastAudits, setPastAudits] = useState<PastAudit[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewingPast, setViewingPast] = useState<AuditData | null>(null);

  const runAudit = async () => {
    setLoading(true);
    setViewingPast(null);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product }),
      });
      const data = await res.json();
      if (data.audit) {
        setAudit(data);
        // Save to history
        fetch("/api/audit/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product, audit_data: data.audit, health_score: data.audit.health_score }),
        }).catch(() => {});
      }
    } catch { /* silent */ }
    setLoading(false);
  };

  useEffect(() => {
    // Load past audits
    fetch(`/api/audit/history?product=${product}`)
      .then(r => r.json())
      .then(d => setPastAudits(d.audits || []))
      .catch(() => {});
  }, [product]);

  const currentAudit = viewingPast || audit?.audit;
  const productLabel = PRODUCT_LABELS[product] || product;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[0.95rem] font-semibold text-white">Weekly Audit — {productLabel}</h3>
            <p className="text-[0.72rem] text-text-dimmed">Automated performance review: highlights, lowlights, changes, and recommendations</p>
          </div>
          <button
            onClick={runAudit}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-[0.78rem] font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Running Audit..." : "Run Audit Now"}
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="card p-8 text-center">
          <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-text-muted text-sm">Auditing {productLabel} campaigns...</p>
          <p className="text-text-dimmed text-xs mt-1">Comparing this week vs last week, analyzing changes and impact</p>
        </div>
      )}

      {/* Audit Report */}
      {currentAudit && !loading && (
        <div className="space-y-4">
          {/* Health Score + Summary */}
          <div className="card p-4">
            <div className="flex items-center gap-4 mb-3">
              <div className={`w-16 h-16 rounded-xl flex items-center justify-center text-2xl font-bold ${
                currentAudit.health_score >= 7 ? "bg-green-500/20 text-green-400" :
                currentAudit.health_score >= 4 ? "bg-amber-500/20 text-amber-400" :
                "bg-red-500/20 text-red-400"
              }`}>
                {currentAudit.health_score}/10
              </div>
              <div className="flex-1">
                <h4 className="text-[0.88rem] font-semibold text-white mb-1">Health Score</h4>
                <p className="text-[0.78rem] text-text-secondary">{currentAudit.summary}</p>
              </div>
            </div>
            {/* WoW Deltas */}
            {currentAudit.week_over_week && (
              <div className="flex gap-4 pt-3 border-t border-border-subtle">
                <WoWStat label="Spend" value={currentAudit.week_over_week.spend_change_pct} invertColor />
                <WoWStat label="Conversions" value={currentAudit.week_over_week.conversion_change_pct} />
                <WoWStat label="CPP" value={currentAudit.week_over_week.cpp_change_pct} invertColor />
              </div>
            )}
          </div>

          {/* Highlights & Lowlights side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Highlights */}
            <div className="card p-4">
              <h4 className="text-[0.82rem] font-semibold text-green-400 mb-3 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Highlights ({currentAudit.highlights?.length || 0})
              </h4>
              <div className="space-y-2">
                {(currentAudit.highlights || []).map((h, i) => (
                  <div key={i} className="bg-green-950/20 border border-green-800/30 rounded-lg p-3">
                    <div className="text-[0.78rem] text-white font-medium">{h.title}</div>
                    <div className="text-[0.7rem] text-text-secondary mt-0.5">{h.detail}</div>
                    {h.metric && <div className="text-[0.65rem] text-green-400 mt-1">{h.metric}</div>}
                  </div>
                ))}
                {(!currentAudit.highlights || currentAudit.highlights.length === 0) && (
                  <p className="text-text-dimmed text-[0.72rem]">No highlights this period</p>
                )}
              </div>
            </div>

            {/* Lowlights */}
            <div className="card p-4">
              <h4 className="text-[0.82rem] font-semibold text-red-400 mb-3 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Lowlights ({currentAudit.lowlights?.length || 0})
              </h4>
              <div className="space-y-2">
                {(currentAudit.lowlights || []).map((l, i) => (
                  <div key={i} className="bg-red-950/20 border border-red-800/30 rounded-lg p-3">
                    <div className="text-[0.78rem] text-white font-medium">{l.title}</div>
                    <div className="text-[0.7rem] text-text-secondary mt-0.5">{l.detail}</div>
                    {l.metric && <div className="text-[0.65rem] text-red-400 mt-1">{l.metric}</div>}
                  </div>
                ))}
                {(!currentAudit.lowlights || currentAudit.lowlights.length === 0) && (
                  <p className="text-text-dimmed text-[0.72rem]">No lowlights this period</p>
                )}
              </div>
            </div>
          </div>

          {/* Changes Detected */}
          {currentAudit.changes_detected && currentAudit.changes_detected.length > 0 && (
            <div className="card p-4">
              <h4 className="text-[0.82rem] font-semibold text-amber-400 mb-3">Changes Detected</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-[0.73rem]">
                  <thead>
                    <tr className="border-b border-border-subtle text-text-muted">
                      <th className="text-left py-2 px-2">Campaign</th>
                      <th className="text-left py-2 px-2">Change</th>
                      <th className="text-left py-2 px-2">Impact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentAudit.changes_detected.map((c, i) => (
                      <tr key={i} className="border-b border-border-subtle/50">
                        <td className="py-2 px-2 text-white">{c.campaign}</td>
                        <td className="py-2 px-2 text-text-secondary">{c.change}</td>
                        <td className="py-2 px-2 text-text-secondary">{c.impact}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Recommendations */}
          {currentAudit.recommendations && currentAudit.recommendations.length > 0 && (
            <div className="card p-4">
              <h4 className="text-[0.82rem] font-semibold text-blue-400 mb-3">Recommendations</h4>
              <div className="space-y-2">
                {currentAudit.recommendations.map((r, i) => (
                  <div key={i} className={`border rounded-lg p-3 ${
                    r.priority === "high" ? "border-red-500/30 bg-red-950/10" :
                    r.priority === "medium" ? "border-amber-500/30 bg-amber-950/10" :
                    "border-blue-500/30 bg-blue-950/10"
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[0.6rem] px-1.5 py-0.5 rounded font-medium ${
                        r.priority === "high" ? "bg-red-500/20 text-red-400" :
                        r.priority === "medium" ? "bg-amber-500/20 text-amber-400" :
                        "bg-blue-500/20 text-blue-400"
                      }`}>{r.priority}</span>
                      <span className="text-[0.78rem] text-white font-medium">{r.action}</span>
                    </div>
                    <p className="text-[0.7rem] text-text-secondary">{r.reasoning}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Past Audits */}
      {pastAudits.length > 0 && (
        <div className="card p-4">
          <h4 className="text-[0.82rem] font-semibold text-text-secondary mb-2">Audit History</h4>
          <div className="space-y-1">
            {pastAudits.map((pa) => (
              <button
                key={pa.id}
                onClick={() => setViewingPast(pa.audit_data)}
                className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-bg-hover text-left transition-colors"
              >
                <span className="text-[0.72rem] text-text-muted">{new Date(pa.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                <span className={`text-[0.72rem] font-medium ${pa.health_score >= 7 ? "text-green-400" : pa.health_score >= 4 ? "text-amber-400" : "text-red-400"}`}>
                  Score: {pa.health_score}/10
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!currentAudit && !loading && (
        <div className="card p-8 text-center">
          <p className="text-text-muted text-sm mb-2">No audit run yet for {productLabel}</p>
          <p className="text-text-dimmed text-xs">Click "Run Audit Now" to generate a week-over-week performance review</p>
        </div>
      )}
    </div>
  );
}

function WoWStat({ label, value, invertColor = false }: { label: string; value: number; invertColor?: boolean }) {
  if (value === null || value === undefined) return null;
  const isPositive = invertColor ? value < 0 : value > 0;
  const color = isPositive ? "text-green-400" : value === 0 ? "text-text-muted" : "text-red-400";
  return (
    <div className="flex-1 text-center">
      <div className="text-[0.65rem] text-text-dimmed uppercase">{label} WoW</div>
      <div className={`text-[0.88rem] font-bold ${color}`}>
        {value > 0 ? "+" : ""}{typeof value === 'number' ? value.toFixed(1) : value}%
      </div>
    </div>
  );
}
