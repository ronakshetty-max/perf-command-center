export const CATEGORIES = [
  { id: "brand", label: "Brand", color: "#4ade80", dotClass: "bg-cat-brand" },
  { id: "generic", label: "Generic", color: "#facc15", dotClass: "bg-cat-generic" },
  { id: "competitor", label: "Competitor", color: "#f87171", dotClass: "bg-cat-competitor" },
  { id: "pmax", label: "PMax / Auto", color: "#f97316", dotClass: "bg-cat-pmax" },
  { id: "app", label: "App (GUAC)", color: "#38bdf8", dotClass: "bg-cat-highintent" },
  { id: "demandgen", label: "DemandGen", color: "#a78bfa", dotClass: "bg-cat-retargeting" },
] as const;

export const BUSINESSES = [
  { id: "eb", label: "Rize", currency: "INR" },
  { id: "curlec", label: "Curlec", currency: "MYR" },
] as const;

export const PLATFORMS = [
  { id: "all", label: "All" },
  { id: "google_search", label: "Google Search" },
  { id: "google_pmax", label: "Google PMax" },
  { id: "google_app", label: "Google App" },
  { id: "google_youtube", label: "Youtube" },
  { id: "google_demandgen", label: "DemandGen" },
  { id: "meta", label: "Meta" },
] as const;

export const DEVICES = [
  { id: "all", label: "All" },
  { id: "desktop", label: "Desktop" },
  { id: "mobile", label: "Mobile" },
] as const;

export const TABS = [
  { id: "overall", label: "Overall" },
  { id: "overview", label: "Overview" },
  { id: "campaigns", label: "Campaign Explorer" },
  { id: "roles", label: "Dynamic View" },
  { id: "competitive", label: "Competitive Intel" },
  { id: "dynamic", label: "Custom View" },
  { id: "compare", label: "Compare Periods" },
  { id: "trends", label: "Trends" },
  { id: "audit", label: "Weekly Audit" },
  { id: "agent", label: "AI Agent" },
] as const;

export const TIME_PRESETS = [
  { id: "today", label: "Today", days: 0 },
  { id: "yesterday", label: "Yesterday", days: 1 },
  { id: "7d", label: "Last 7D", days: 7 },
  { id: "14d", label: "Last 14D", days: 14 },
  { id: "mtd", label: "MTD", days: -1 },
  { id: "last_month", label: "Last Month", days: -2 },
  { id: "3m", label: "Last 3M", days: 90 },
  { id: "custom", label: "Custom", days: -99 },
] as const;

export const CATEGORY_COLORS: Record<string, string> = {
  brand: "#4ade80",
  high_intent: "#38bdf8",
  generic: "#facc15",
  competitor: "#f87171",
  retargeting: "#a78bfa",
  pmax: "#f97316",
};

export function formatCurrency(value: number, currency = "INR"): string {
  if (currency === "INR") {
    if (value >= 100000) return `₹${(value / 100000).toFixed(2)}L`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
    return `₹${value.toFixed(0)}`;
  }
  return `RM ${value.toFixed(0)}`;
}

export function formatPercent(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export function formatChange(current: number, previous: number): { text: string; direction: "up" | "down" | "neutral" } {
  if (previous === 0) return { text: "—", direction: "neutral" };
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 1) return { text: "Flat", direction: "neutral" };
  return {
    text: `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`,
    direction: pct > 0 ? "up" : "down",
  };
}
