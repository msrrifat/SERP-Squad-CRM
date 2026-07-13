/* Tools — full-page dashboard (opened from Personal Dashboard → Tools),
   with its own sidebar exactly like Company settings. Hosts the agency-level
   Research & Audit tools and the Growth & Prospects suite. */
import React, { useState } from "react";
import { ArrowLeft, Building2, FileText, FolderOpen, Globe, MapPin, Search, Send, Target } from "lucide-react";
import { BrandMark, DarkToggle, FONT_CSS } from "../../ui/primitives.jsx";
import { ResearchToolsView } from "../research/tools.jsx";
import { GrowthView } from "../growth/prospects.jsx";

const GROUPS = [
  {
    label: "Research & Audit",
    items: [
      { key: "profile", area: "research", label: "Business Profile Audit", icon: Building2, sub: "GBP · Bing · Apple, scored" },
      { key: "website", area: "research", label: "Website Audit", icon: Globe, sub: "Real crawl from the sitemap" },
      { key: "listings", area: "research", label: "Listings Checker", icon: MapPin, sub: "Citations & NAP, any business" },
      { key: "index", area: "research", label: "Index Checker", icon: Search, sub: "Real Google index checks" },
      { key: "report", area: "research", label: "Audit Report", icon: FileText, sub: "Branded PDF proposal builder" },
    ],
  },
  {
    label: "Growth & Prospects",
    items: [
      { key: "finder", area: "growth", label: "Lead Finder", icon: Target, sub: "Every business in a city" },
      { key: "prospects", area: "growth", label: "Prospect List", icon: FolderOpen, sub: "Folders, NAP & scraped emails" },
      { key: "outreach", area: "growth", label: "Outreach Campaigns", icon: Send, sub: "Cold email + follow-ups" },
    ],
  },
];
const ALL = GROUPS.flatMap((g) => g.items);

export function ToolsPage({ company, onChange, accent, aiConfig, placesKey, dfs, onBack, dark, setDark }) {
  const [sel, setSel] = useState("profile");
  const active = ALL.find((t) => t.key === sel) || ALL[0];
  return (
    <div className={`ll-root ${dark ? "ll-dark" : ""} flex min-h-screen items-stretch bg-[#F5F6F8]`}>
      <style>{FONT_CSS}</style>
      <aside className="sticky top-0 z-30 hidden h-screen w-64 shrink-0 flex-col self-start border-r border-gray-200 bg-white md:flex">
        <div className="flex items-center gap-2 px-4 py-5">
          <BrandMark name={company.name} logo={company.logo} accent={accent} />
          <span className="ll-display text-[16px] font-bold tracking-tight">{company.name}</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {GROUPS.map((g) => (
            <div key={g.label} className="mb-1">
              <div className="px-4 pb-1 pt-2 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">{g.label}</div>
              <div className="space-y-1 px-2.5">
                {g.items.map((t) => (
                  <button key={t.key} onClick={() => setSel(t.key)}
                    className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left hover:bg-gray-50"
                    style={sel === t.key ? { background: accent + "12" } : {}}>
                    <t.icon size={16} className="mt-0.5 shrink-0" style={{ color: sel === t.key ? accent : "#9CA3AF" }} />
                    <span>
                      <span className="block text-[13px] font-semibold" style={{ color: sel === t.key ? accent : "#374151" }}>{t.label}</span>
                      <span className="block text-[10.5px] text-gray-400">{t.sub}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="p-3">
          <button onClick={onBack} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2.5 text-[13px] font-medium text-gray-600 hover:border-gray-300">
            <ArrowLeft size={14} /> Back to dashboard
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 bg-white/90 px-5 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            {/* small screens have no sidebar — a select keeps every tool reachable */}
            <select value={sel} onChange={(e) => setSel(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-[12px] font-semibold text-gray-700 md:hidden">
              {ALL.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <div className="hidden md:block">
              <div className="ll-display text-[17px] font-semibold leading-tight">{active.label}</div>
              <div className="text-[11.5px] text-gray-400">{active.sub}</div>
            </div>
          </div>
          <DarkToggle dark={dark} setDark={setDark} />
        </div>
        {active.area === "research" ? (
          <ResearchToolsView tab={sel} setTab={setSel} showTabs={false}
            company={company} accent={accent} aiConfig={aiConfig} placesKey={placesKey} dfs={dfs} />
        ) : (
          <GrowthView tab={sel} setTab={setSel} showTabs={false}
            company={company} onUpdateCompany={onChange} accent={accent} aiConfig={aiConfig} placesKey={placesKey} />
        )}
      </main>
    </div>
  );
}
