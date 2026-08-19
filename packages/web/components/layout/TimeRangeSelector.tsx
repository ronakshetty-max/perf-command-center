"use client";

import { useState, useMemo } from "react";
import { format, subDays, startOfMonth, subMonths, endOfMonth } from "date-fns";
import { TIME_PRESETS } from "@/lib/constants";

interface DateRange {
  dateFrom: string;
  dateTo: string;
}

interface Props {
  onChange: (range: DateRange) => void;
  currentRange: DateRange;
  anchorDate?: string;
}

function getPresetRange(presetId: string, anchorDate?: string): DateRange {
  const anchor = anchorDate ? new Date(anchorDate + "T12:00:00") : subDays(new Date(), 1);

  switch (presetId) {
    case "today":
      return { dateFrom: format(anchor, "yyyy-MM-dd"), dateTo: format(anchor, "yyyy-MM-dd") };
    case "yesterday":
      return { dateFrom: format(subDays(anchor, 1), "yyyy-MM-dd"), dateTo: format(subDays(anchor, 1), "yyyy-MM-dd") };
    case "7d":
      return { dateFrom: format(subDays(anchor, 6), "yyyy-MM-dd"), dateTo: format(anchor, "yyyy-MM-dd") };
    case "14d":
      return { dateFrom: format(subDays(anchor, 13), "yyyy-MM-dd"), dateTo: format(anchor, "yyyy-MM-dd") };
    case "mtd":
      return { dateFrom: format(startOfMonth(anchor), "yyyy-MM-dd"), dateTo: format(anchor, "yyyy-MM-dd") };
    case "last_month": {
      const lastMonth = subMonths(anchor, 1);
      return { dateFrom: format(startOfMonth(lastMonth), "yyyy-MM-dd"), dateTo: format(endOfMonth(lastMonth), "yyyy-MM-dd") };
    }
    case "3m":
      return { dateFrom: format(subDays(anchor, 89), "yyyy-MM-dd"), dateTo: format(anchor, "yyyy-MM-dd") };
    default:
      return { dateFrom: format(subDays(anchor, 13), "yyyy-MM-dd"), dateTo: format(anchor, "yyyy-MM-dd") };
  }
}

export default function TimeRangeSelector({ onChange, currentRange, anchorDate }: Props) {
  const [activePreset, setActivePreset] = useState("14d");
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState(currentRange.dateFrom);
  const [customTo, setCustomTo] = useState(currentRange.dateTo);

  const handlePresetClick = (presetId: string) => {
    if (presetId === "custom") {
      setShowCustom(true);
      setActivePreset("custom");
      return;
    }
    setShowCustom(false);
    setActivePreset(presetId);
    onChange(getPresetRange(presetId, anchorDate));
  };

  const handleCustomApply = () => {
    if (customFrom && customTo) {
      onChange({ dateFrom: customFrom, dateTo: customTo });
    }
  };

  const rangeLabel = useMemo(() => {
    if (!currentRange.dateFrom || !currentRange.dateTo) return "";
    return `${currentRange.dateFrom} → ${currentRange.dateTo}`;
  }, [currentRange]);

  return (
    <div className="card p-3 mb-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-text-dimmed text-[0.7rem] font-semibold uppercase tracking-wider mr-1">Period:</span>
        {TIME_PRESETS.map(preset => (
          <button
            key={preset.id}
            onClick={() => handlePresetClick(preset.id)}
            className={`px-3 py-1.5 rounded-md text-[0.75rem] font-medium transition-all ${
              activePreset === preset.id
                ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                : "bg-bg-hover text-text-muted hover:text-text-secondary border border-transparent"
            }`}
          >
            {preset.label}
          </button>
        ))}
        {rangeLabel && (
          <span className="ml-auto text-[0.7rem] text-text-dimmed font-mono">{rangeLabel}</span>
        )}
      </div>

      {showCustom && (
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border-subtle">
          <label className="text-[0.72rem] text-text-dimmed">From:</label>
          <input
            type="date"
            value={customFrom}
            onChange={e => setCustomFrom(e.target.value)}
            className="bg-bg-hover border border-border-subtle rounded px-2 py-1 text-[0.8rem] text-text-secondary"
          />
          <label className="text-[0.72rem] text-text-dimmed">To:</label>
          <input
            type="date"
            value={customTo}
            onChange={e => setCustomTo(e.target.value)}
            className="bg-bg-hover border border-border-subtle rounded px-2 py-1 text-[0.8rem] text-text-secondary"
          />
          <button
            onClick={handleCustomApply}
            className="px-3 py-1.5 rounded-md text-[0.75rem] font-semibold bg-blue-600 text-white hover:bg-blue-500 transition-colors"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}

export { getPresetRange };
export type { DateRange };
