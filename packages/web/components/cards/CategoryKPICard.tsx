"use client";

import { CATEGORY_COLORS } from "@/lib/constants";

interface Props {
  category: string;
  categoryLabel: string;
  payments: number;
  spend: string;
  cpp: string;
  cppColor?: string;
  note: string;
  noteDirection: "up" | "down" | "neutral";
}

export default function CategoryKPICard({ category, categoryLabel, payments, spend, cpp, cppColor, note, noteDirection }: Props) {
  const color = CATEGORY_COLORS[category] || "#8b8fa7";
  const noteColors = { up: "text-green-400", down: "text-red-400", neutral: "text-yellow-400" };

  return (
    <div className="stat-card" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="flex justify-between items-center">
        <div>
          <div className="text-[0.7rem] text-text-muted uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: color }} />
            {categoryLabel}
          </div>
          <div className="text-[1.4rem] font-bold text-white">{payments}</div>
          <div className="text-[0.7rem] text-text-muted">payments | {spend} spend</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold" style={{ color: cppColor || color }}>{cpp}</div>
          <div className="text-[0.7rem] text-text-muted">CPP</div>
        </div>
      </div>
      <div className={`text-[0.72rem] mt-1.5 font-medium ${noteColors[noteDirection]}`}>{note}</div>
    </div>
  );
}
