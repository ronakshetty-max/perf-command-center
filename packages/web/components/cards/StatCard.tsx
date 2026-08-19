"use client";

interface Props {
  label: string;
  value: string;
  change?: string;
  changeDirection?: "up" | "down" | "neutral";
  borderColor?: string;
}

export default function StatCard({ label, value, change, changeDirection = "neutral", borderColor }: Props) {
  const changeColors = {
    up: "text-green-400",
    down: "text-red-400",
    neutral: "text-yellow-400",
  };

  return (
    <div
      className="stat-card"
      style={borderColor ? { borderLeft: `3px solid ${borderColor}` } : {}}
    >
      <div className="text-[0.7rem] text-text-muted uppercase tracking-wider">{label}</div>
      <div className="text-[1.4rem] font-bold text-white mt-0.5">{value}</div>
      {change && (
        <div className={`text-[0.72rem] mt-1 font-medium ${changeColors[changeDirection]}`}>
          {change}
        </div>
      )}
    </div>
  );
}
