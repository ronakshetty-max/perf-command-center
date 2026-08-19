"use client";

import { useState } from "react";

interface Action {
  priority: string;
  category: string;
  confidence: string;
  campaign: string;
  level: string;
  title: string;
  action: string;
  reasoning: string;
  expected_impact: string;
}

interface Props {
  actions: Action[];
  loading: boolean;
  onRefresh: () => void;
  generatedAt?: string;
  product?: string;
}

const PRODUCT_LABELS: Record<string, string> = {
  domestic_pg: "Domestic PG",
  rize: "Rize",
  cards: "Cards International",
};

const PRIORITY_STYLES: Record<string, { dot: string; text: string; bg: string }> = {
  high: { dot: "bg-red-500", text: "text-red-400", bg: "border-red-500/30" },
  medium: { dot: "bg-amber-500", text: "text-amber-400", bg: "border-amber-500/30" },
  low: { dot: "bg-blue-500", text: "text-blue-400", bg: "border-blue-500/30" },
};

const CATEGORY_LABELS: Record<string, string> = {
  bidding: "Bidding",
  keywords: "Keywords",
  tracking: "Tracking",
  creative: "Creative",
};

const CONFIDENCE_BADGE: Record<string, string> = {
  high: "bg-green-500/20 text-green-400 border-green-500/30",
  medium: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

export default function InsightsPanel({ actions, loading, onRefresh, generatedAt, product }: Props) {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [actionStatuses, setActionStatuses] = useState<Record<number, string>>({});
  const productLabel = PRODUCT_LABELS[product || "domestic_pg"] || product;

  const setStatus = (idx: number, status: string) => {
    setActionStatuses(prev => ({ ...prev, [idx]: status }));
    const action = actions[idx];
    if (status === "done" || status === "skip") {
      fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product,
          action_taken: action.title,
          campaign: action.campaign,
          category: action.category,
          outcome: status === "done" ? "pending" : "neutral",
          lesson: status === "skip" ? "Skipped — not actionable or low priority" : null,
          context_before: { reasoning: action.reasoning, expected_impact: action.expected_impact },
        }),
      }).catch(() => {});
    }
  };

  if (loading) {
    return (
      <div className="card p-8 mb-6">
        <div className="flex items-center justify-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-text-muted text-sm">Generating optimisation suggestions for <strong className="text-white">{productLabel}</strong>...</span>
        </div>
      </div>
    );
  }

  if (!actions.length) return null;

  const categoryCounts: Record<string, number> = {};
  actions.forEach(a => { categoryCounts[a.category] = (categoryCounts[a.category] || 0) + 1; });

  const filtered = activeCategory === "all" ? actions : actions.filter(a => a.category === activeCategory);
  const priorityGroups = { high: filtered.filter(a => a.priority === "high"), medium: filtered.filter(a => a.priority === "medium"), low: filtered.filter(a => a.priority === "low") };

  return (
    <div className="mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-[0.95rem] font-semibold text-white">Campaign Optimiser — {productLabel}</h3>
          {generatedAt && <span className="text-[0.68rem] text-text-dimmed">Last generated: {new Date(generatedAt).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={onRefresh} className="text-[0.72rem] px-3 py-1.5 rounded-lg bg-bg-elevated border border-border-medium text-text-secondary hover:bg-bg-hover transition-colors">
            Regenerate
          </button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-0 mb-4">
        <button
          onClick={() => setActiveCategory("all")}
          className={`flex-1 py-2 text-[0.75rem] font-medium rounded-l-lg border ${activeCategory === "all" ? "bg-blue-600 text-white border-blue-600" : "bg-bg-elevated border-border-medium text-text-muted hover:bg-bg-hover"}`}
        >
          All ({actions.length})
        </button>
        {Object.entries(categoryCounts).map(([cat, count]) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`flex-1 py-2 text-[0.75rem] font-medium border-t border-b border-r ${activeCategory === cat ? "bg-blue-600 text-white border-blue-600" : "bg-bg-elevated border-border-medium text-text-muted hover:bg-bg-hover"}`}
          >
            {CATEGORY_LABELS[cat] || cat} ({count})
          </button>
        ))}
      </div>

      {/* Priority Groups */}
      {(["high", "medium", "low"] as const).map(priority => {
        const group = priorityGroups[priority];
        if (!group.length) return null;
        const style = PRIORITY_STYLES[priority];
        return (
          <div key={priority} className="mb-4">
            <h4 className={`text-[0.82rem] font-semibold ${style.text} mb-2 flex items-center gap-2`}>
              <span className={`w-3 h-3 rounded-full ${style.dot}`} />
              {priority.charAt(0).toUpperCase() + priority.slice(1)} Priority ({group.length})
            </h4>
            <div className="space-y-2">
              {group.map((action, i) => {
                const globalIdx = actions.indexOf(action);
                const status = actionStatuses[globalIdx];
                return (
                  <div key={i} className={`card border ${style.bg} p-4`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Title row */}
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
                          <h5 className="text-[0.82rem] font-semibold text-white">{action.title}</h5>
                          <span className={`text-[0.6rem] px-1.5 py-0.5 rounded border font-medium ${CONFIDENCE_BADGE[action.confidence] || CONFIDENCE_BADGE.medium}`}>
                            {action.confidence} conf
                          </span>
                        </div>
                        {/* Meta */}
                        <p className="text-[0.68rem] text-text-dimmed mb-1.5">
                          Campaign: {action.campaign} | Level: {action.level} | Category: {action.category}
                        </p>
                        {/* Action instruction */}
                        <p className="text-[0.75rem] text-slate-300">
                          <strong className="text-text-muted">Action:</strong> {action.action}
                        </p>
                        {/* Reasoning (collapsed by default) */}
                        <details className="mt-1.5">
                          <summary className="text-[0.68rem] text-blue-400 cursor-pointer hover:text-blue-300">Why?</summary>
                          <p className="text-[0.72rem] text-text-secondary mt-1">{action.reasoning}</p>
                          {action.expected_impact && <p className="text-[0.68rem] text-green-400 mt-0.5">Impact: {action.expected_impact}</p>}
                        </details>
                      </div>
                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => setStatus(globalIdx, "done")}
                          className={`text-[0.68rem] px-2.5 py-1.5 rounded border transition-colors ${status === "done" ? "bg-green-600/30 text-green-400 border-green-500/50" : "bg-bg-elevated border-border-medium text-text-muted hover:bg-bg-hover"}`}
                        >
                          {status === "done" ? "✓ " : ""}Done
                        </button>
                        <button
                          onClick={() => setStatus(globalIdx, "in_progress")}
                          className={`text-[0.68rem] px-2.5 py-1.5 rounded border transition-colors ${status === "in_progress" ? "bg-amber-600/30 text-amber-400 border-amber-500/50" : "bg-bg-elevated border-border-medium text-text-muted hover:bg-bg-hover"}`}
                        >
                          In Progress
                        </button>
                        <button
                          onClick={() => setStatus(globalIdx, "skip")}
                          className={`text-[0.68rem] px-2.5 py-1.5 rounded border transition-colors ${status === "skip" ? "bg-slate-600/30 text-slate-400 border-slate-500/50" : "bg-bg-elevated border-border-medium text-text-muted hover:bg-bg-hover"}`}
                        >
                          Skip
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
