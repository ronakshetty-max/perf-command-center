"use client";

import { useEffect, useState, useMemo } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { CATEGORIES, CATEGORY_COLORS, formatCurrency } from "@/lib/constants";
import type { DateRange } from "@/components/layout/TimeRangeSelector";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface Props {
  filters: { categories: string[]; platform: string; device: string; product?: string };
  dateRange: DateRange;
}

type Metric = "spend" | "payments" | "cpp" | "l2p_rate" | "cpc";
type Granularity = "daily" | "weekly" | "monthly";

interface TrendRow {
  period: string;
  category: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  payments: number;
  cpp: number | null;
  l2p_rate: number | null;
  cpc: number | null;
}

const METRIC_OPTIONS: { id: Metric; label: string; formatter: (v: number) => string }[] = [
  { id: "spend", label: "Spend", formatter: (v) => formatCurrency(v) },
  { id: "payments", label: "Payments", formatter: (v) => v.toString() },
  { id: "cpp", label: "CPP", formatter: (v) => formatCurrency(v) },
  { id: "l2p_rate", label: "L2P Rate", formatter: (v) => `${(v * 100).toFixed(1)}%` },
  { id: "cpc", label: "CPC", formatter: (v) => formatCurrency(v) },
];

export default function TrendsTab({ filters, dateRange }: Props) {
  const [data, setData] = useState<TrendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<Metric>("payments");
  const [granularity, setGranularity] = useState<Granularity>("daily");
  const [showByCategory, setShowByCategory] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      view: "trends",
      business: "eb", product: filters.product || "domestic_pg",
      granularity,
      dateFrom: dateRange.dateFrom,
      dateTo: dateRange.dateTo,
    });

    fetch(`/api/metrics?${params}`)
      .then(r => r.json())
      .then(res => { setData(res.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [dateRange, granularity, (filters as any).product]);

  const chartData = useMemo(() => {
    if (!data.length) return null;

    const filteredRows = filters.categories.length > 0
      ? data.filter(r => filters.categories.includes(r.category))
      : data;

    if (showByCategory) {
      const categories = [...new Set(filteredRows.map(r => r.category))];
      const periods = [...new Set(filteredRows.map(r => r.period))].sort();

      const datasets = categories.map(cat => {
        const catRows = filteredRows.filter(r => r.category === cat);
        const catColor = CATEGORY_COLORS[cat] || "#8b8fa7";

        return {
          label: CATEGORIES.find(c => c.id === cat)?.label || cat,
          data: periods.map(p => {
            const row = catRows.find(r => r.period === p);
            if (!row) return null;
            const val = row[metric];
            return val !== null && val !== undefined ? Number(val) : null;
          }),
          borderColor: catColor,
          backgroundColor: catColor + "20",
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 5,
          fill: false,
        };
      });

      return {
        labels: periods.map(p => {
          const d = new Date(p);
          return granularity === "daily" ? `${d.getDate()}/${d.getMonth() + 1}` : `${d.toLocaleString("en", { month: "short" })} ${d.getDate()}`;
        }),
        datasets,
      };
    } else {
      const periods = [...new Set(filteredRows.map(r => r.period))].sort();
      const aggregated = periods.map(p => {
        const periodRows = filteredRows.filter(r => r.period === p);
        const totalSpend = periodRows.reduce((s, r) => s + Number(r.spend || 0), 0);
        const totalPayments = periodRows.reduce((s, r) => s + (r.payments || 0), 0);
        const totalLeads = periodRows.reduce((s, r) => s + (r.leads || 0), 0);
        const totalClicks = periodRows.reduce((s, r) => s + (r.clicks || 0), 0);

        if (metric === "spend") return totalSpend;
        if (metric === "payments") return totalPayments;
        if (metric === "cpp") return totalPayments > 0 ? totalSpend / totalPayments : null;
        if (metric === "l2p_rate") return totalLeads > 0 ? totalPayments / totalLeads : null;
        if (metric === "cpc") return totalClicks > 0 ? totalSpend / totalClicks : null;
        return null;
      });

      return {
        labels: periods.map(p => {
          const d = new Date(p);
          return granularity === "daily" ? `${d.getDate()}/${d.getMonth() + 1}` : `${d.toLocaleString("en", { month: "short" })} ${d.getDate()}`;
        }),
        datasets: [{
          label: METRIC_OPTIONS.find(m => m.id === metric)?.label || metric,
          data: aggregated,
          borderColor: "#38bdf8",
          backgroundColor: "#38bdf820",
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true,
        }],
      };
    }
  }, [data, metric, filters.categories, showByCategory, granularity]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top" as const,
        labels: { color: "#a1a5b7", font: { size: 11 } },
      },
      tooltip: {
        mode: "index" as const,
        intersect: false,
        backgroundColor: "#1e1f2e",
        borderColor: "#2d2e3f",
        borderWidth: 1,
        titleColor: "#fff",
        bodyColor: "#a1a5b7",
      },
    },
    scales: {
      x: {
        grid: { color: "#2d2e3f30" },
        ticks: { color: "#6b7094", font: { size: 10 } },
      },
      y: {
        grid: { color: "#2d2e3f50" },
        ticks: { color: "#6b7094", font: { size: 10 } },
      },
    },
    interaction: { mode: "nearest" as const, axis: "x" as const, intersect: false },
  };

  if (loading) {
    return <div className="text-text-muted text-center py-10">Loading trends...</div>;
  }

  return (
    <div>
      {/* Controls */}
      <div className="card p-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[0.7rem] text-text-dimmed font-semibold uppercase mr-1">Metric:</span>
          {METRIC_OPTIONS.map(m => (
            <button
              key={m.id}
              onClick={() => setMetric(m.id)}
              className={`px-3 py-1.5 rounded-md text-[0.75rem] font-medium transition-all ${
                metric === m.id
                  ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                  : "bg-bg-hover text-text-muted hover:text-text-secondary border border-transparent"
              }`}
            >
              {m.label}
            </button>
          ))}

          <div className="w-px h-7 bg-border-medium mx-2" />

          <span className="text-[0.7rem] text-text-dimmed font-semibold uppercase mr-1">Grain:</span>
          {(["daily", "weekly", "monthly"] as Granularity[]).map(g => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`px-3 py-1.5 rounded-md text-[0.75rem] font-medium ${
                granularity === g
                  ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                  : "bg-bg-hover text-text-muted border border-transparent"
              }`}
            >
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}

          <div className="w-px h-7 bg-border-medium mx-2" />

          <button
            onClick={() => setShowByCategory(!showByCategory)}
            className={`px-3 py-1.5 rounded-md text-[0.75rem] font-medium ${
              showByCategory
                ? "bg-green-500/20 text-green-400 border border-green-500/40"
                : "bg-bg-hover text-text-muted border border-transparent"
            }`}
          >
            {showByCategory ? "By Category" : "Aggregate"}
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="card p-4 mb-4">
        <div className="h-[400px]">
          {chartData ? (
            <Line data={chartData} options={chartOptions} />
          ) : (
            <div className="text-text-muted text-center py-20">No data for this range</div>
          )}
        </div>
      </div>

      {/* Data Table */}
      {data.length > 0 && (
        <div className="card">
          <h3 className="text-[0.85rem] font-semibold text-text-secondary mb-3">
            Raw Data — {METRIC_OPTIONS.find(m => m.id === metric)?.label} ({granularity})
          </h3>
          <div className="overflow-x-auto max-h-[300px] rounded-lg">
            <table className="w-full text-[0.72rem]">
              <thead className="sticky top-0 bg-bg-card">
                <tr>
                  <th className="text-left p-2 text-text-dimmed uppercase font-semibold">Period</th>
                  <th className="text-left p-2 text-text-dimmed uppercase font-semibold">Category</th>
                  <th className="text-right p-2 text-text-dimmed uppercase font-semibold">Spend</th>
                  <th className="text-right p-2 text-text-dimmed uppercase font-semibold">Pmts</th>
                  <th className="text-right p-2 text-text-dimmed uppercase font-semibold">CPP</th>
                  <th className="text-right p-2 text-text-dimmed uppercase font-semibold">L2P</th>
                </tr>
              </thead>
              <tbody>
                {(filters.categories.length > 0 ? data.filter(r => filters.categories.includes(r.category)) : data).map((row, i) => (
                  <tr key={i} className="border-t border-border-subtle/50 hover:bg-bg-hover/30">
                    <td className="p-2 text-text-muted">{row.period}</td>
                    <td className="p-2" style={{ color: CATEGORY_COLORS[row.category] || "#8b8fa7" }}>
                      {CATEGORIES.find(c => c.id === row.category)?.label || row.category}
                    </td>
                    <td className="p-2 text-right">{formatCurrency(Number(row.spend))}</td>
                    <td className="p-2 text-right font-semibold">{row.payments}</td>
                    <td className="p-2 text-right">{row.cpp ? formatCurrency(Number(row.cpp)) : "—"}</td>
                    <td className="p-2 text-right">{row.l2p_rate ? `${(Number(row.l2p_rate) * 100).toFixed(1)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
