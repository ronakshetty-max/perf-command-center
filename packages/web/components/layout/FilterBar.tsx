"use client";

import { CATEGORIES, PLATFORMS, DEVICES } from "@/lib/constants";

interface Props {
  activeCategories: string[];
  setActiveCategories: (c: string[]) => void;
  activePlatform: string;
  setActivePlatform: (p: string) => void;
  activeDevice: string;
  setActiveDevice: (d: string) => void;
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
}

export default function FilterBar({
  activeCategories, setActiveCategories,
  activePlatform, setActivePlatform,
  activeDevice, setActiveDevice,
  searchQuery, setSearchQuery,
}: Props) {

  const toggleCategory = (catId: string) => {
    if (activeCategories.includes(catId)) {
      setActiveCategories(activeCategories.filter(c => c !== catId));
    } else {
      setActiveCategories([...activeCategories, catId]);
    }
  };

  return (
    <div className="bg-bg-card border border-border-subtle rounded-xl p-3.5 mb-4">
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="text-[0.7rem] text-text-dimmed uppercase tracking-wider font-semibold min-w-[70px]">Category</span>
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setActiveCategories([])}
            className={`filter-chip ${activeCategories.length === 0 ? "filter-chip-active" : ""}`}
          >
            All
          </button>
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => toggleCategory(cat.id)}
              className={`filter-chip ${activeCategories.includes(cat.id) ? "filter-chip-active" : ""}`}
              style={activeCategories.includes(cat.id) ? { borderColor: cat.color, color: cat.color, background: `${cat.color}15` } : {}}
            >
              <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${cat.dotClass}`} />
              {cat.label}
            </button>
          ))}
        </div>

        <div className="w-px h-7 bg-border-medium mx-1.5" />

        <span className="text-[0.7rem] text-text-dimmed uppercase tracking-wider font-semibold">Platform</span>
        <div className="flex gap-1.5">
          {PLATFORMS.map(p => (
            <button
              key={p.id}
              onClick={() => setActivePlatform(p.id)}
              className={`filter-chip ${activePlatform === p.id ? "filter-chip-active" : ""}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="w-px h-7 bg-border-medium mx-1.5" />

        <span className="text-[0.7rem] text-text-dimmed uppercase tracking-wider font-semibold">Device</span>
        <div className="flex gap-1.5">
          {DEVICES.map(d => (
            <button
              key={d.id}
              onClick={() => setActiveDevice(d.id)}
              className={`filter-chip ${activeDevice === d.id ? "filter-chip-active" : ""}`}
            >
              {d.label}
            </button>
          ))}
        </div>

        {setSearchQuery && (
          <>
            <div className="w-px h-7 bg-border-medium mx-1.5" />
            <input
              type="text"
              placeholder="Search campaigns..."
              value={searchQuery || ""}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-bg-hover border border-border-subtle rounded-lg px-3 py-1.5 text-[0.78rem] text-text-secondary placeholder:text-text-dimmed w-48 focus:outline-none focus:border-blue-500/50"
            />
          </>
        )}
      </div>
    </div>
  );
}
