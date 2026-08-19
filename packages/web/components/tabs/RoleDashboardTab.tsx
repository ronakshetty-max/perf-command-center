"use client";

import type { DateRange } from "@/components/layout/TimeRangeSelector";

interface Props {
  product: string;
  dateRange: DateRange;
}

export default function RoleDashboardTab({ product, dateRange }: Props) {
  return (
    <div className="-mx-5 -mb-5">
      <iframe
        src="/dynamic-view.html"
        className="w-full border-0"
        style={{ height: "calc(100vh - 200px)", minHeight: "800px" }}
      />
    </div>
  );
}
