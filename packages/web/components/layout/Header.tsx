"use client";

interface HeaderProps {
  funnel?: string;
  productLabel?: string;
}

export default function Header({ funnel = "Signups → L2 → New MTU", productLabel = "Domestic PG" }: HeaderProps) {
  const today = new Date();
  const day = today.getDate();
  const monthDays = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  return (
    <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
      <div>
        <h1 className="text-[1.55rem] font-bold text-white">
          {productLabel} <span className="text-blue-400">Performance Command Center</span>
        </h1>
        <p className="text-text-muted text-[0.8rem]">
          Google Ads + Meta Campaigns — Real-time Analytics + AI-Powered Insights
        </p>
      </div>
      <div className="flex items-center gap-2.5">
        <span className="bg-green-950/60 border border-green-800/40 text-green-400 text-[0.68rem] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full animate-pulse">
          LIVE
        </span>
        <div className="bg-bg-elevated border border-border-medium rounded-lg px-3.5 py-1.5 text-[0.78rem] text-text-secondary">
          {today.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })} | MTD Day {day}/{monthDays}
        </div>
        <div className="bg-blue-950/40 border border-blue-800/30 rounded-lg px-3 py-1.5 text-[0.7rem] text-blue-300 font-medium">
          Funnel: {funnel}
        </div>
      </div>
    </div>
  );
}
