/* Tools — full-page dashboard (opened from Personal Dashboard → Tools),
   with its own sidebar like Company settings. The sidebar lists the three
   tool GROUPS; the selected group's subsections appear as a top-bar tab
   strip inside the window. */
import React, { useState } from "react";
import { ArrowLeft, Building2, Crosshair, FileText, FolderOpen, Globe, History, MapPin, PenLine, Search, Send, Target, TrendingUp } from "lucide-react";
import { BrandMark, DarkToggle, FONT_CSS, GoTopButton } from "../../ui/primitives.jsx";
import { ResearchToolsView } from "../research/tools.jsx";
import { GrowthView } from "../growth/prospects.jsx";
import { GuestListView, GuestPostFinder } from "../growth/guestpost.jsx";
import { OutreachSuite } from "../growth/outreach.jsx";
import { KeywordFinderView } from "./kwfinder.jsx";
import { MapRankCheck, WebsiteRankCheck } from "./rankcheck.jsx";

const GROUPS = [
  {
    key: "growth", label: "Growth Finder", icon: Target, area: "growth",
    sub: "Find leads, save prospects, run outreach",
    items: [
      { key: "finder", label: "Lead Finder", icon: Target },
      { key: "prospects", label: "Prospect List", icon: FolderOpen },
      { key: "outreach", label: "Outreach Campaigns", icon: Send },
    ],
  },
  {
    key: "research", label: "Research & Audit", icon: Search, area: "research",
    sub: "Audit profiles, sites & listings; build proposals",
    items: [
      { key: "profile", label: "Business Profile Audit", icon: Building2 },
      { key: "website", label: "Website Audit", icon: Globe },
      { key: "listings", label: "Listings Checker", icon: MapPin },
      { key: "index", label: "Index Checker", icon: Search },
      { key: "report", label: "Audit Report", icon: FileText },
    ],
  },
  {
    key: "guest", label: "Guest Post Finder", icon: PenLine, area: "guest",
    sub: "Prospect niche blogs, save & pitch for guest posts",
    items: [
      { key: "guestposts", label: "Guest Post Finder", icon: PenLine },
      { key: "guestlist", label: "Guest Post List", icon: FolderOpen },
      { key: "guestoutreach", label: "Guest Outreach", icon: Send },
    ],
  },
  {
    key: "kw", label: "Keyword Research", icon: TrendingUp, area: "kw",
    sub: "Local & national keywords, KD, volume, SERP",
    /* no redundant "Keyword Finder" tab — the finder IS the section; the strip
       only offers the zero-credit history of past searches */
    items: [
      { key: "kwsaved", label: "Saved keyword searches", icon: History },
    ],
  },
  {
    key: "rank", label: "Rank Checker", icon: Crosshair, area: "rank",
    sub: "One-time website & map ranks, any business",
    items: [
      { key: "rankweb", label: "Website Rank Check", icon: TrendingUp },
      { key: "rankmap", label: "Map Rank Check (geo grid)", icon: MapPin },
    ],
  },
  {
    /* also reachable inside Research & Audit — this top-level entry keeps the
       index checker one click away, same tool & saved results */
    key: "indexchk", label: "Index Checker", icon: Search, area: "research",
    sub: "Bulk-check any URLs' Google index status",
    items: [
      { key: "index", label: "Index Checker", icon: Search },
    ],
  },
];

export function ToolsPage({ company, onChange, accent, aiConfig, placesKey, dfs, clients = [], onUpdateProjectById = null, onBack, dark, setDark }) {
  const [groupKey, setGroupKey] = useState("growth");
  const group = GROUPS.find((g) => g.key === groupKey) || GROUPS[0];
  /* the active subsection is tracked per group so switching back restores it */
  const [selByGroup, setSelByGroup] = useState({ growth: "finder", guest: "guestposts", kw: "kwfinder", rank: "rankweb", research: "profile", indexchk: "index" });

  /* Keyword Finder → project. Always records to the keyword bank (deduped,
     kept sorted by volume high→low). When a specific page/post/mapping node
     is chosen, ALSO attaches the keywords there as its target keywords. */
  const addKeywordsToProject = (clientId, projectId, rows, meta, target = { kind: "bank" }) => onUpdateProjectById?.(clientId, projectId, (p) => {
    const cur = p.keywordBank || [];
    const seen = new Set(cur.map((k) => `${k.keyword}|${k.locationName || ""}`.toLowerCase()));
    const fresh = rows.filter((r) => !seen.has(`${r.keyword}|${meta.locationName}`.toLowerCase())).map((r, i) => ({
      id: "kb" + Date.now().toString(36) + i, keyword: r.keyword, volume: r.volume, cpc: r.cpc, kd: r.kd,
      location: meta.location, locationName: meta.locationName, demo: !!meta.demo, addedAt: Date.now(),
    }));
    const patch = { keywordBank: [...cur, ...fresh].sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1)) };
    if (target.kind === "bank") return patch;

    /* rows arrive volume-sorted (high → low) from the finder */
    const kws = rows.map((r) => r.keyword);
    const w = p.opt?.website || {};
    if (target.kind === "map") {
      const setNode = (nodes) => (nodes || []).map((n) => {
        if (n.id !== target.id) return { ...n, children: setNode(n.children) };
        const seo = n.seo || {};
        const existingSec = String(seo.secondaryKws || "").split(",").map((s) => s.trim()).filter(Boolean);
        const primary = seo.primaryKw?.trim() || kws[0];
        const rest = kws.filter((k) => k !== primary);
        const secondary = [...new Set([...existingSec, ...rest])];
        return { ...n, seo: { ...seo, primaryKw: primary, secondaryKws: secondary.join(", ") } };
      });
      return { ...patch, opt: { ...p.opt, website: { ...w, architecture: { ...(w.architecture || {}), tree: setNode(w.architecture?.tree) } } } };
    }
    if (target.kind === "page") {
      return { ...patch, opt: { ...p.opt, website: { ...w, pages: (w.pages || []).map((pg) => pg.id === target.id ? { ...pg, keywords: [...new Set([...(pg.keywords || []), ...kws])] } : pg) } } };
    }
    if (target.kind === "post") {
      return { ...patch, opt: { ...p.opt, website: { ...w, blogs: (w.blogs || []).map((b) => b.id === target.id ? { ...b, keywords: [...new Set([...(b.keywords || []), ...kws])] } : b) } } };
    }
    return patch;
  });
  const sel = selByGroup[group.key];
  const setSel = (k) => setSelByGroup((cur) => ({ ...cur, [group.key]: k }));

  return (
    <div className={`ll-root ${dark ? "ll-dark" : ""} flex min-h-screen items-stretch bg-[#F5F6F8]`}>
      <style>{FONT_CSS}</style>
      {/* sidebar: main tool groups only */}
      <aside className="sticky top-0 z-30 hidden h-screen w-64 shrink-0 flex-col self-start border-r border-gray-200 bg-white md:flex">
        <div className="flex items-center gap-2 px-4 py-5">
          <BrandMark name={company.name} logo={company.logo} accent={accent} />
          <span className="ll-display text-[16px] font-bold tracking-tight">{company.name}</span>
        </div>
        <div className="px-4 pb-1 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Tools</div>
        <div className="flex-1 space-y-1 overflow-y-auto px-2.5">
          {GROUPS.map((g) => (
            <button key={g.key} onClick={() => setGroupKey(g.key)}
              className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left hover:bg-gray-50"
              style={groupKey === g.key ? { background: accent + "12" } : {}}>
              <g.icon size={16} className="mt-0.5 shrink-0" style={{ color: groupKey === g.key ? accent : "#9CA3AF" }} />
              <span>
                <span className="block text-[13px] font-semibold" style={{ color: groupKey === g.key ? accent : "#374151" }}>{g.label}</span>
                <span className="block text-[10.5px] text-gray-400">{g.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="p-3">
          <button onClick={onBack} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2.5 text-[13px] font-medium text-gray-600 hover:border-gray-300">
            <ArrowLeft size={14} /> Back to dashboard
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        {/* header: group name + the subsection tab strip */}
        <div className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 px-5 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {/* phones have no sidebar — a group select stands in */}
              <select value={groupKey} onChange={(e) => setGroupKey(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-[12px] font-semibold text-gray-700 md:hidden">
                {GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
              </select>
              <div className="ll-display hidden text-[16px] font-semibold leading-tight md:block">{group.label}</div>
            </div>
            <DarkToggle dark={dark} setDark={setDark} />
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {group.items.map((t) => (
              <button key={t.key}
                onClick={() => setSel(sel === t.key && group.key === "kw" ? "kwfinder" : t.key)}
                className="flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold"
                style={sel === t.key ? { background: accent, borderColor: accent, color: "#fff" } : { background: "#fff", borderColor: "#E5E7EB", color: "#4B5563" }}>
                <t.icon size={13} /> {t.label}
                {t.key === "kwsaved" && (company.kwSearches || []).length > 0 && <span className="ll-mono rounded-full px-1.5 text-[9.5px] font-bold" style={sel === t.key ? { background: "rgba(255,255,255,.25)" } : { background: "#F3F4F6", color: "#6B7280" }}>{(company.kwSearches || []).length}</span>}
              </button>
            ))}
          </div>
        </div>

        {group.area === "research" ? (
          <ResearchToolsView tab={sel} setTab={setSel} showTabs={false}
            company={company} onUpdateCompany={onChange} accent={accent} aiConfig={aiConfig} placesKey={placesKey} dfs={dfs} />
        ) : group.area === "kw" ? (
          <div className="mx-auto max-w-6xl p-5">
            <KeywordFinderView company={company} accent={accent} onUpdateCompany={onChange}
              savedView={sel === "kwsaved"} onExitSaved={() => setSel("kwfinder")}
              clients={clients.filter((c) => c.projects.some((p) => !p.archived))
                .map((c) => ({ ...c, projects: c.projects.filter((p) => !p.archived) }))}
              onAddToProject={addKeywordsToProject} />
          </div>
        ) : group.area === "rank" ? (
          <div className="mx-auto max-w-5xl p-5">
            {sel === "rankweb" && <WebsiteRankCheck company={company} accent={accent} />}
            {sel === "rankmap" && <MapRankCheck accent={accent} dfs={dfs} placesKey={placesKey} />}
          </div>
        ) : group.area === "guest" ? (
          <div className="mx-auto max-w-5xl p-5">
            {sel === "guestposts" && <GuestPostFinder company={company} onUpdateCompany={onChange} accent={accent} dfs={dfs}
              cse={company.apis?.googleCse?.values} oprKey={company.apis?.openPageRank?.values?.apiKey} />}
            {sel === "guestlist" && <GuestListView company={company} onUpdateCompany={onChange} accent={accent} />}
            {sel === "guestoutreach" && <OutreachSuite company={company} onUpdateCompany={onChange} accent={accent} aiConfig={aiConfig} scope="guest" />}
          </div>
        ) : (
          <GrowthView tab={sel} setTab={setSel} showTabs={false}
            company={company} onUpdateCompany={onChange} accent={accent} aiConfig={aiConfig} placesKey={placesKey} />
        )}
      </main>
      <GoTopButton />
    </div>
  );
}
