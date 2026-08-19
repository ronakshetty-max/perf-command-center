"use client";

import StatCard from "@/components/cards/StatCard";

interface Props {
  filters: { business: string; categories: string[]; platform: string; device: string };
}

const ACTION_MATRIX = [
  { cat: "Brand", catColor: "#4ade80", cpp: "₹1,284", vsCap: "-52%", l2pTrend: "+3.5pp MoM", volTrend: "+5.7% MoM", cppTrend: "+6.5% MoM", rec: "Protect at all costs — CPP anchor", action: "PROTECT & SCALE", actionColor: "#4ade80" },
  { cat: "High-Intent", catColor: "#38bdf8", cpp: "₹2,167", vsCap: "-20%", l2pTrend: "+0.7pp MoM", volTrend: "+10.9% MoM", cppTrend: "+4.8% MoM", rec: "Primary growth engine — push IS to 60%+", action: "SCALE HARD", actionColor: "#4ade80" },
  { cat: "PMax / Auto", catColor: "#f97316", cpp: "₹2,419", vsCap: "-10%", l2pTrend: "+4.2pp MoM", volTrend: "+19.2% MoM", cppTrend: "-3.3% MoM", rec: "Algorithm improving — test at 2x budget", action: "SCALE (TEST)", actionColor: "#60a5fa" },
  { cat: "Generic", catColor: "#facc15", cpp: "₹3,175", vsCap: "+18%", l2pTrend: "-0.3pp MoM", volTrend: "-7.4% MoM", cppTrend: "+8.0% MoM", rec: "Split: keep Dweb, cut Mweb/Broad/India", action: "OPTIMIZE & CUT", actionColor: "#facc15" },
  { cat: "Competitor", catColor: "#f87171", cpp: "₹3,810", vsCap: "+41%", l2pTrend: "+2.8pp MoM", volTrend: "+20.0% MoM", cppTrend: "-5.0% MoM", rec: "Strategic — CPP declining, keep investing", action: "HOLD & WATCH", actionColor: "#facc15" },
  { cat: "Retargeting", catColor: "#a78bfa", cpp: "₹4,681", vsCap: "+73%", l2pTrend: "Volatile", volTrend: "+46.9% MoM", cppTrend: "Volatile", rec: "Fix Meta event first — then reassess", action: "FIX THEN SCALE", actionColor: "#f87171" },
];

const BUDGET_SHIFT = [
  { cat: "Brand", catColor: "#4ade80", current: "₹1.90L (10.9%)", recommended: "₹2.20L (10.8%)", shift: "+₹0.30L", shiftColor: "#4ade80", impact: "+12 payments at ₹1,400 CPP" },
  { cat: "High-Intent", catColor: "#38bdf8", current: "₹7.30L (41.7%)", recommended: "₹9.50L (46.8%)", shift: "+₹2.20L", shiftColor: "#4ade80", impact: "+48 payments at ₹2,292 CPP" },
  { cat: "PMax / Auto", catColor: "#f97316", current: "₹1.50L (8.6%)", recommended: "₹2.10L (10.3%)", shift: "+₹0.60L", shiftColor: "#4ade80", impact: "+18 payments at ₹2,500 CPP" },
  { cat: "Generic", catColor: "#facc15", current: "₹4.00L (22.9%)", recommended: "₹3.00L (14.8%)", shift: "-₹1.00L", shiftColor: "#f87171", impact: "-15 payments saved at ₹3,500+ CPP" },
  { cat: "Competitor", catColor: "#f87171", current: "₹1.60L (9.1%)", recommended: "₹1.80L (8.9%)", shift: "+₹0.20L", shiftColor: "#4ade80", impact: "+5 payments at ₹3,600 CPP" },
  { cat: "Retargeting", catColor: "#a78bfa", current: "₹2.20L (12.6%)", recommended: "₹1.70L (8.4%)", shift: "-₹0.50L", shiftColor: "#f87171", impact: "Hold until Meta event fixed" },
];

export default function EfficiencyTab({ filters }: Props) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-1">Category Efficiency Matrix</h2>
      <p className="text-text-muted text-[0.8rem] mb-4">Where is each category relative to CPP cap? Which should scale, hold, or reduce?</p>

      {/* CPP Guardrail */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
        <StatCard label="BLENDED CPP" value="₹2,468" change="₹232 under cap" changeDirection="up" borderColor="#4ade80" />
        <StatCard label="HIGHEST CAMP. CPP" value="₹10,000" change="Generic_Broad — 3.7x cap" changeDirection="down" borderColor="#f87171" />
        <StatCard label="LOWEST CAMP. CPP" value="₹1,284" change="Brand — 52% under cap" changeDirection="up" borderColor="#4ade80" />
        <StatCard label="CATEGORIES UNDER CAP" value="3 / 6" change="Brand, High-Intent, PMax" changeDirection="neutral" />
      </div>

      {/* Action Matrix */}
      <div className="card mb-4">
        <h3 className="text-[0.95rem] font-semibold text-text-secondary mb-3">Category Action Matrix</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[0.76rem]">
            <thead>
              <tr className="bg-bg-hover">
                <th className="p-2.5 text-left text-[0.64rem] text-text-dimmed uppercase font-semibold">Category</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">CPP</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">vs Cap</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">L2P Trend</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">Volume Trend</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">CPP Trend</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">Recommendation</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">Action</th>
              </tr>
            </thead>
            <tbody>
              {ACTION_MATRIX.map((row, i) => (
                <tr key={i} className="border-t border-border-subtle hover:bg-bg-hover">
                  <td className="p-2.5 font-semibold" style={{ color: row.catColor }}>{row.cat}</td>
                  <td className="p-2 font-semibold">{row.cpp}</td>
                  <td className="p-2" style={{ color: row.vsCap.startsWith("-") ? "#4ade80" : "#f87171" }}>{row.vsCap}</td>
                  <td className="p-2" style={{ color: row.l2pTrend.startsWith("+") ? "#4ade80" : row.l2pTrend.startsWith("-") ? "#f87171" : "#facc15" }}>{row.l2pTrend}</td>
                  <td className="p-2" style={{ color: row.volTrend.startsWith("+") ? "#4ade80" : "#f87171" }}>{row.volTrend}</td>
                  <td className="p-2" style={{ color: row.cppTrend.startsWith("-") ? "#4ade80" : row.cppTrend.startsWith("+") ? "#f87171" : "#facc15" }}>{row.cppTrend}</td>
                  <td className="p-2 text-text-secondary text-[0.72rem]">{row.rec}</td>
                  <td className="p-2"><span className="text-[0.66rem] font-semibold px-2 py-0.5 rounded" style={{ color: row.actionColor, background: `${row.actionColor}20` }}>{row.action}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Budget Reallocation */}
      <div className="card">
        <h3 className="text-[0.95rem] font-semibold text-text-secondary mb-3">Recommended Budget Shift — Next Month</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[0.76rem]">
            <thead>
              <tr className="bg-bg-hover">
                <th className="p-2.5 text-left text-[0.64rem] text-text-dimmed uppercase font-semibold">Category</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">Current Alloc.</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">Recommended</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">Shift</th>
                <th className="p-2 text-[0.64rem] text-text-dimmed">Expected Impact</th>
              </tr>
            </thead>
            <tbody>
              {BUDGET_SHIFT.map((row, i) => (
                <tr key={i} className="border-t border-border-subtle hover:bg-bg-hover">
                  <td className="p-2.5 font-semibold" style={{ color: row.catColor }}>{row.cat}</td>
                  <td className="p-2">{row.current}</td>
                  <td className="p-2 font-semibold">{row.recommended}</td>
                  <td className="p-2 font-semibold" style={{ color: row.shiftColor }}>{row.shift}</td>
                  <td className="p-2 text-text-secondary">{row.impact}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-border-medium bg-bg-hover font-semibold">
                <td className="p-2.5">TOTAL</td>
                <td className="p-2">₹17.50L</td>
                <td className="p-2">₹20.30L</td>
                <td className="p-2 text-green-400">+₹2.80L</td>
                <td className="p-2 text-green-400">+68 net payments at ₹2,500 blended</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
