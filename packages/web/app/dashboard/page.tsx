"use client";

import { useState, useEffect } from "react";
import { format, subDays } from "date-fns";
import { CATEGORIES, TABS } from "@/lib/constants";
import Header from "@/components/layout/Header";
import FilterBar from "@/components/layout/FilterBar";
import TabNav from "@/components/layout/TabNav";
import TimeRangeSelector, { getPresetRange, type DateRange } from "@/components/layout/TimeRangeSelector";
import OverallTab from "@/components/tabs/OverallTab";
import OverviewTab from "@/components/tabs/OverviewTab";
import CampaignExplorerTab from "@/components/tabs/CampaignExplorerTab";
import CompareTab from "@/components/tabs/CompareTab";
import TrendsTab from "@/components/tabs/TrendsTab";
import CompetitiveIntelTab from "@/components/tabs/CompetitiveIntelTab";
import DynamicViewTab from "@/components/tabs/DynamicViewTab";
import AuditTab from "@/components/tabs/AuditTab";
import AgentTab from "@/components/tabs/AgentTab";
import RoleDashboardTab from "@/components/tabs/RoleDashboardTab";

const PRODUCTS = [
  { id: "domestic_pg", label: "Domestic PG", funnel: "Signups → L2 → New MTU" },
  { id: "rize", label: "Rize", funnel: "Leads → Payments" },
  { id: "cards", label: "Cards International", funnel: "Signups → L2 → MTU" },
];

const SOURCES = [
  { id: "all", label: "All", color: "#60a5fa" },
  { id: "google", label: "Google Ads", color: "#4ade80" },
  { id: "meta", label: "Meta", color: "#a78bfa" },
];

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState("overall");
  const [activeProduct, setActiveProduct] = useState("rize");
  const [activeSource, setActiveSource] = useState("all");
  const [activeCategories, setActiveCategories] = useState<string[]>([]);
  const [activePlatform, setActivePlatform] = useState("all");
  const [activeDevice, setActiveDevice] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dataAnchor, setDataAnchor] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<DateRange>(getPresetRange("14d"));

  useEffect(() => {
    fetch(`/api/metrics?view=overall&product=${activeProduct}`)
      .then(r => r.json())
      .then(d => {
        if (d.summary?.campaign_count && parseInt(d.summary.campaign_count) > 0) return;
      })
      .catch(() => {});
    fetch(`/api/health?product=${activeProduct}`)
      .then(r => r.json())
      .then(d => { if (d.maxDate) { setDataAnchor(d.maxDate); setDateRange(getPresetRange("14d", d.maxDate)); } })
      .catch(() => {});
  }, [activeProduct]);

  const currentProduct = PRODUCTS.find(p => p.id === activeProduct) || PRODUCTS[0];

  const filters = {
    categories: activeCategories,
    platform: activePlatform,
    device: activeDevice,
    source: activeSource,
  };

  const renderTab = () => {
    const productFilters = { product: activeProduct, ...filters };
    switch (activeTab) {
      case "overall":
        return <OverallTab filters={{ business: "eb", ...productFilters }} dateRange={dateRange} product={activeProduct} />;
      case "overview":
        return <OverviewTab filters={{ business: "eb", ...productFilters }} dateRange={dateRange} />;
      case "campaigns":
        return <CampaignExplorerTab filters={productFilters} dateRange={dateRange} searchQuery={searchQuery} />;
      case "competitive":
        return <CompetitiveIntelTab filters={productFilters} />;
      case "dynamic":
        return <DynamicViewTab product={activeProduct} />;
      case "compare":
        return <CompareTab filters={productFilters} />;
      case "trends":
        return <TrendsTab filters={productFilters} dateRange={dateRange} />;
      case "audit":
        return <AuditTab product={activeProduct} />;
      case "agent":
        return <AgentTab product={activeProduct} />;
      case "roles":
        return <RoleDashboardTab product={activeProduct} dateRange={dateRange} />;
      default:
        return <OverallTab filters={{ business: "eb", ...productFilters }} dateRange={dateRange} product={activeProduct} />;
    }
  };

  const showTimeRange = activeTab !== "compare" && activeTab !== "agent";
  const showFilters = activeTab !== "agent";

  return (
    <div className="min-h-screen bg-bg-primary p-5 max-w-[1520px] mx-auto">
      <Header funnel={currentProduct.funnel} productLabel={currentProduct.label} />

      {/* Product Selector */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-text-muted text-[0.75rem] uppercase tracking-wider font-medium">Product:</span>
        {PRODUCTS.map(p => (
          <button
            key={p.id}
            onClick={() => setActiveProduct(p.id)}
            className={`px-3.5 py-1.5 rounded-lg text-[0.78rem] font-medium transition-all ${
              activeProduct === p.id
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-bg-elevated border border-border-medium text-text-secondary hover:bg-bg-hover"
            }`}
          >
            {p.label}
          </button>
        ))}

        <div className="w-px h-6 bg-border-medium mx-3" />

        <span className="text-text-muted text-[0.75rem] uppercase tracking-wider font-medium">Source:</span>
        {SOURCES.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSource(s.id)}
            className={`px-3.5 py-1.5 rounded-lg text-[0.78rem] font-medium transition-all ${
              activeSource === s.id
                ? "text-white shadow-sm"
                : "bg-bg-elevated border border-border-medium text-text-secondary hover:bg-bg-hover"
            }`}
            style={activeSource === s.id ? { backgroundColor: s.color } : {}}
          >
            {s.label}
          </button>
        ))}
      </div>

      {showTimeRange && (
        <TimeRangeSelector onChange={setDateRange} currentRange={dateRange} anchorDate={dataAnchor} />
      )}

      {showFilters && (
        <FilterBar
          activeCategories={activeCategories}
          setActiveCategories={setActiveCategories}
          activePlatform={activePlatform}
          setActivePlatform={setActivePlatform}
          activeDevice={activeDevice}
          setActiveDevice={setActiveDevice}
          searchQuery={activeTab === "campaigns" ? searchQuery : undefined}
          setSearchQuery={activeTab === "campaigns" ? setSearchQuery : undefined}
        />
      )}

      <TabNav activeTab={activeTab} setActiveTab={setActiveTab} />

      {renderTab()}

      <p className="text-text-dimmed text-[0.7rem] mt-7 pt-3 border-t border-border-subtle text-center">
        Performance Command Center v2.0 — Data: Google Ads API + DataGaaru Backend | AI: Claude
      </p>
    </div>
  );
}
