"use client";

import type { DateRange } from "@/components/layout/TimeRangeSelector";

interface Props {
  product: string;
  dateRange: DateRange;
}

export default function RoleDashboardTab({ product, dateRange }: Props) {
  return (
    <div className="-mx-5 -mb-5">
      <div className="px-5 py-3 flex items-center justify-between bg-bg-card border-b border-border-subtle">
        <div>
          <span className="text-sm text-text-secondary font-medium">Dynamic View</span>
          <span className="text-[0.7rem] text-text-dimmed ml-3">Role-based dashboard with AI voice agent</span>
        </div>
        <div className="flex gap-2">
          <a href="/dynamic-view.html" target="_blank" className="px-3 py-1.5 rounded-lg text-[0.75rem] font-medium bg-blue-600 text-white hover:bg-blue-500">
            Open Full Screen ↗
          </a>
          <span className="px-3 py-1.5 rounded-lg text-[0.75rem] font-medium bg-green-900/40 border border-green-700/40 text-green-400">
            🎤 Voice Agent: localhost:8000
          </span>
        </div>
      </div>
      <iframe
        src="/dynamic-view.html"
        className="w-full border-0"
        style={{ height: "calc(100vh - 240px)", minHeight: "800px" }}
      />
    </div>
  );
}
