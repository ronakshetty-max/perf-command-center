"use client";

import { useEffect, useState } from "react";

interface Props {
  product: string;
}

interface MemoryStats {
  total_actions: number;
  positive: number;
  negative: number;
  neutral: number;
  pending: number;
}

interface Lesson {
  action_taken: string;
  campaign: string;
  outcome: string;
  lesson: string;
  date_acted: string;
}

interface Pattern {
  pattern: string;
  confidence: string;
  evidence: string;
  recommendation: string;
}

export default function BrainMemoryPanel({ product }: Props) {
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(false);
  const [measuringMsg, setMeasuringMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/memory?product=${product}`)
      .then(r => r.json())
      .then(d => {
        setStats(d.stats);
        setLessons(d.lessons || []);
      })
      .catch(() => {});
  }, [product]);

  const runPatternRecognition = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/memory/patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product }),
      });
      const data = await res.json();
      setPatterns(data.patterns || []);
    } catch { /* silent */ }
    setLoading(false);
  };

  const measureOutcomes = async () => {
    setMeasuringMsg("Measuring...");
    try {
      const res = await fetch("/api/memory/measure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setMeasuringMsg(data.message || `Measured ${data.measured} actions`);
      // Refresh stats
      const memRes = await fetch(`/api/memory?product=${product}`);
      const memData = await memRes.json();
      setStats(memData.stats);
      setLessons(memData.lessons || []);
    } catch { setMeasuringMsg("Error measuring"); }
    setTimeout(() => setMeasuringMsg(null), 3000);
  };

  return (
    <div className="card p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[0.9rem] font-semibold text-white flex items-center gap-2">
          🧠 Brain Memory
          <span className="text-[0.62rem] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
            Self-Learning
          </span>
        </h3>
        <div className="flex gap-2">
          <button onClick={measureOutcomes} className="text-[0.68rem] px-2.5 py-1.5 rounded-lg bg-bg-elevated border border-border-medium text-text-muted hover:text-white transition-colors">
            Measure Outcomes
          </button>
          <button onClick={runPatternRecognition} disabled={loading} className="text-[0.68rem] px-2.5 py-1.5 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-400 hover:bg-purple-600/30 transition-colors disabled:opacity-50">
            {loading ? "Analyzing..." : "Detect Patterns"}
          </button>
        </div>
      </div>

      {measuringMsg && <p className="text-[0.72rem] text-amber-400 mb-2">{measuringMsg}</p>}

      {/* Stats */}
      {stats && (
        <div className="flex gap-3 mb-4">
          <StatBadge label="Total Actions" value={stats.total_actions} color="text-white" />
          <StatBadge label="Positive" value={stats.positive} color="text-green-400" />
          <StatBadge label="Negative" value={stats.negative} color="text-red-400" />
          <StatBadge label="Neutral" value={stats.neutral} color="text-slate-400" />
          <StatBadge label="Pending" value={stats.pending} color="text-amber-400" />
        </div>
      )}

      {stats && stats.total_actions === 0 && (
        <p className="text-[0.72rem] text-text-dimmed">No actions recorded yet. Mark suggestions as "Done" or "Skip" in the Campaign Optimiser above — the brain will start learning from your actions.</p>
      )}

      {/* Lessons Learned */}
      {lessons.length > 0 && (
        <div className="mb-4">
          <h4 className="text-[0.78rem] font-medium text-text-secondary mb-2">Recent Lessons</h4>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {lessons.map((l, i) => (
              <div key={i} className={`text-[0.7rem] p-2 rounded border ${
                l.outcome === "positive" ? "border-green-800/30 bg-green-950/10" :
                l.outcome === "negative" ? "border-red-800/30 bg-red-950/10" :
                "border-border-subtle bg-bg-elevated"
              }`}>
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    l.outcome === "positive" ? "bg-green-500" :
                    l.outcome === "negative" ? "bg-red-500" :
                    "bg-slate-500"
                  }`} />
                  <span className="text-white font-medium">{l.action_taken}</span>
                  <span className="text-text-dimmed">• {l.campaign}</span>
                </div>
                {l.lesson && <p className="text-text-secondary mt-0.5 ml-3.5">{l.lesson}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detected Patterns */}
      {patterns.length > 0 && (
        <div>
          <h4 className="text-[0.78rem] font-medium text-purple-400 mb-2">Detected Patterns (Institutional Knowledge)</h4>
          <div className="space-y-2">
            {patterns.map((p, i) => (
              <div key={i} className="border border-purple-800/30 bg-purple-950/10 rounded-lg p-3">
                <div className="text-[0.75rem] text-white font-medium">{p.pattern}</div>
                <div className="text-[0.68rem] text-text-secondary mt-1">Evidence: {p.evidence}</div>
                <div className="text-[0.68rem] text-purple-400 mt-0.5">→ {p.recommendation}</div>
                <span className={`text-[0.6rem] mt-1 inline-block px-1.5 py-0.5 rounded ${
                  p.confidence === "high" ? "bg-green-500/20 text-green-400" : "bg-amber-500/20 text-amber-400"
                }`}>{p.confidence} confidence</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-bg-elevated border border-border-subtle rounded-lg px-3 py-1.5 text-center">
      <div className={`text-[0.88rem] font-bold ${color}`}>{value}</div>
      <div className="text-[0.6rem] text-text-dimmed">{label}</div>
    </div>
  );
}
