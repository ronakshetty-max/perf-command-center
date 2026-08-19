"use client";

import { TABS } from "@/lib/constants";

interface Props {
  activeTab: string;
  setActiveTab: (t: string) => void;
}

export default function TabNav({ activeTab, setActiveTab }: Props) {
  return (
    <div className="flex gap-0.5 mb-4 overflow-x-auto bg-bg-card rounded-xl p-1">
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`tab-btn ${activeTab === tab.id ? "tab-btn-active" : ""}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
