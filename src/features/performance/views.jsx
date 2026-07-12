import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  MapPin, Phone, Globe, Star, Search, Users, Eye, Settings, Plus, X,
  Building2, LayoutDashboard, Target, Palette, Link2, CheckCircle2,
  Printer, ArrowUpRight, ArrowDownRight, Minus, Navigation, Upload,
  MousePointerClick, BarChart3, Smartphone, Monitor, RefreshCw, Clock,
  Trash2, ChevronDown, ChevronRight, Folder, FolderOpen, Zap, KeyRound,
  LogIn, LogOut, ChevronUp, Copy, Settings2, Type, AlignLeft, Table2,
  PieChart as PieIcon, Activity, FileText as FileTextIcon, ArrowLeft, ClipboardPaste,
  Calendar, Sun, Moon, Shield, History, UserPlus, Wallet, Receipt, ListTodo, MessageSquare,
  Rocket, Share2, Lock, Send, ImagePlus, List, ListOrdered, Quote, Facebook, Instagram, Linkedin, Twitter, Youtube, Music2, Pin,
} from "lucide-react";
import { Apple as AppleLogo } from "lucide-react";
import { INTENT_STYLE, OPP_STYLE, genPageQueries } from "../../lib/seo.js";
import { ACCENTS, Card, DateRangeBar, Delta, Labeled, LogoUpload, PosChange, RankChip, SectionHeader, Seg, Spark, StatCard, Toggle, inputCls, tooltipStyle } from "../../ui/primitives.jsx";
import { ALL_CITIES, COUNTRY_LABEL, cityKey, cityLabel, urlSlug } from "../../lib/geo.js";
import { LABELS, rangeIdx } from "../../lib/months.jsx";
import { avgPosDaysAgo } from "../../data/gen.js";
import { fmt, pctDelta } from "../../lib/format.jsx";

export function OverviewView({ project, data, tracking, cmp: cmpDefault = 3, accent, clientView }) {
  const [metric, setMetric] = useState("gbpViews");
  /* the comparison window lives here now (moved out of the top bar);
     the AI agent still drives it through the cmp prop */
  const [cmp, setCmp] = useState(cmpDefault);
  useEffect(() => { setCmp(cmpDefault); }, [cmpDefault]);
  const cur = data.months[12], prev = data.months[12 - cmp];
  const W = project.widgets, I = project.integrations;

  const avgNow = tracking.length ? avgPosDaysAgo(tracking, 0) : 0;
  const avgPrev = tracking.length ? avgPosDaysAgo(tracking, cmp * 30) : null;
  const top3 = tracking.filter((t) => t.stats.cur <= 3).length;
  const top3Prev = tracking.filter((t) => {
    const i = t.positions.length - 1 - cmp * 30;
    return i >= 0 && t.positions[i] <= 3; // a keyword not yet tracked back then wasn't in the top 3
  }).length;

  /* combined business-profile metrics: Google + Bing + Apple (only the connected
     ones), and phone calls additionally include GA4's call_click events */
  const anyProfile = I.gbp || I.bing || I.apple;
  const profileSources = [I.gbp && "Google", I.bing && "Bing", I.apple && "Apple Maps"].filter(Boolean);
  const callEvt = data.events.find((e) => e.name === "call_click")?.series || [];
  const profileViewsSeries = data.months.map((m) =>
    (I.gbp ? m.gbp.views : 0) + (I.bing ? m.bing?.impressions || 0 : 0) + (I.apple ? m.apple?.views || 0 : 0));
  const callsSeries = data.months.map((m, i) =>
    (I.gbp ? m.gbp.calls : 0) + (I.bing ? m.bing?.calls || 0 : 0) + (I.apple ? m.apple?.calls || 0 : 0) + (I.ga ? Math.round(callEvt[i] || 0) : 0));

  const METRICS = {
    gbpViews: { label: "Profile views", get: (m, i) => profileViewsSeries[i], show: anyProfile, color: accent },
    gaUsers: { label: "Website users", get: (m) => m.ga.users, show: I.ga, color: "#0EA5E9" },
    gscClicks: { label: "Search clicks", get: (m) => m.gsc.clicks, show: I.gsc, color: "#8B5CF6" },
    avgRank: { label: "Avg. ranking", get: (_, i) => { const v = avgPosDaysAgo(tracking, (12 - i) * 30); return v == null ? null : +v.toFixed(1); }, invert: true, show: tracking.length > 0, color: "#F59E0B" },
  };
  const activeMetric = METRICS[metric].show ? metric : Object.keys(METRICS).find((k) => METRICS[k].show) || "gbpViews";
  const mCfg = METRICS[activeMetric];

  /* range-aware trend: the visible window follows the "Compare vs" selection in
     the top bar — cmp=3 shows the last 3 months, cmp=12 shows the full year.
     get() still receives the ABSOLUTE month index so avgRank lookups stay correct. */
  const rangeStart = Math.max(0, 12 - cmp);
  const chartData = data.months.map((m, i) => ({ label: m.label, value: mCfg.get(m, i) })).slice(rangeStart);
  const windowSpan = `${data.months[rangeStart].label} – ${data.months[12].label}`;
  const trendTitle = cmp === 1 ? "Month-over-month trend" : `${cmp}-month trend`;

  const movers = [...tracking]
    .map((t) => ({ ...t, change: t.stats.d30 ?? t.stats.life ?? 0 }))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 5); // biggest movers either direction
  const topEvents = [...data.events].sort((a, b) => b.series[12] - a.series[12]).slice(0, 4);

  /* insight highlights — shown to everyone (compact for agency, framed for client) */
  const summary = [];
  if (anyProfile) {
    const d = pctDelta(profileViewsSeries[12], profileViewsSeries[12 - cmp]);
    summary.push(`Business profiles were seen ${fmt(profileViewsSeries[12])} times across ${profileSources.join(", ")} — ${d >= 0 ? "up" : "down"} ${Math.abs(d).toFixed(0)}% vs ${cmp} month${cmp > 1 ? "s" : ""} ago.`);
  }
  if (I.gbp) summary.push(`Customers took ${fmt(cur.gbp.calls + cur.gbp.directions + cur.gbp.websiteClicks)} actions this month — calls, directions and website visits.`);
  if (tracking.length) summary.push(`${top3} of ${tracking.length} tracked keywords rank in Google's top 3${top3 - top3Prev > 0 ? `, ${top3 - top3Prev} more than ${cmp} month${cmp > 1 ? "s" : ""} ago` : ""}.`);

  const cmpPicker = (
    <span className="ml-auto flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1">
      <span className="px-1.5 text-[10.5px] font-medium text-gray-400">Compare vs</span>
      {[1, 3, 6, 12].map((m) => (
        <button key={m} onClick={() => setCmp(m)} className="ll-mono rounded-lg px-2 py-0.5 text-[11.5px] font-semibold"
          style={cmp === m ? { background: accent, color: "#fff" } : { color: "var(--chip-fg, #6B7280)" }}>
          {m}mo
        </button>
      ))}
      <select value={cmp} onChange={(e) => setCmp(+e.target.value)} className="ll-mono rounded-lg border-0 bg-transparent py-0.5 pl-1 pr-1 text-[11.5px] font-semibold text-gray-500">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m} mo</option>)}
      </select>
    </span>
  );

  return (
    <div className="ll-fade space-y-5">
      {/* the comparison picker must always be reachable — standalone when the insight strip is empty */}
      {summary.length === 0 && <div className="flex">{cmpPicker}</div>}
      {/* insight strip */}
      {summary.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="flex items-center gap-2 px-5 pt-4">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg" style={{ background: accent + "18", color: accent }}><Activity size={13} /></span>
            <span className="ll-display text-[14.5px] font-semibold">{clientView ? "This month at a glance" : "Snapshot"}</span>
            {cmpPicker}
          </div>
          <div className="grid gap-px bg-gray-100 p-px sm:grid-cols-3">
            {summary.map((s, i) => (
              <div key={i} className="flex items-start gap-2 bg-white px-4 py-3 text-[12.5px] leading-relaxed text-gray-600">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0" style={{ color: accent }} /> {s}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {anyProfile && W.gbp.views && (
          <StatCard icon={Eye} label="Profile views" source={[I.gbp && "GBP", I.bing && "BING", I.apple && "APPLE"].filter(Boolean).join("+")} accent={accent}
            value={fmt(profileViewsSeries[12])} pct={pctDelta(profileViewsSeries[12], profileViewsSeries[12 - cmp])}
            spark={profileViewsSeries} sub="all business profiles" />
        )}
        {(anyProfile || I.ga) && W.gbp.calls && (
          <StatCard icon={Phone} label="Phone calls" source={[anyProfile && "PROFILES", I.ga && "GA4"].filter(Boolean).join("+")} accent={accent}
            value={fmt(callsSeries[12])} pct={pctDelta(callsSeries[12], callsSeries[12 - cmp])}
            spark={callsSeries} sub="profiles + call events" />
        )}
        {I.ga && W.ga.users && (
          <StatCard icon={Users} label="Website users" source="GA4" accent={accent}
            value={fmt(cur.ga.users)} pct={pctDelta(cur.ga.users, prev.ga.users)}
            spark={data.months.map((m) => m.ga.users)} />
        )}
        {I.gsc && W.gsc.clicks && (
          <StatCard icon={MousePointerClick} label="Search clicks" source="GSC" accent={accent}
            value={fmt(cur.gsc.clicks)} pct={pctDelta(cur.gsc.clicks, prev.gsc.clicks)}
            spark={data.months.map((m) => m.gsc.clicks)} />
        )}
        {tracking.length > 0 && W.ranks.insights && (
          <StatCard icon={Target} label="Avg. rank position" source="Ranks" accent={accent}
            value={"#" + avgNow.toFixed(1)} pct={avgPrev != null ? pctDelta(avgNow, avgPrev) : null} invert
            spark={LABELS.map((_, i) => avgPosDaysAgo(tracking, (12 - i) * 30)).filter((v) => v != null)} />
        )}
        {tracking.length > 0 && W.ranks.insights && (
          <StatCard icon={Target} label="Keywords in top 3" source="Ranks" accent={accent}
            value={top3} pct={top3 - top3Prev} deltaSuffix="" sub="vs comparison" />
        )}
        {I.ga && W.ga.events && (
          <StatCard icon={Zap} label={topEvents[0]?.name || "events"} source="GA4" accent={accent}
            value={fmt(topEvents[0]?.series[12])} pct={pctDelta(topEvents[0]?.series[12], topEvents[0]?.series[12 - cmp])}
            spark={topEvents[0]?.series} sub="top event" />
        )}
        {I.ga && W.ga.conversions && (
          <StatCard icon={BarChart3} label="Conversions" source="GA4" accent={accent}
            value={fmt(cur.ga.conversions)} pct={pctDelta(cur.ga.conversions, prev.ga.conversions)}
            spark={data.months.map((m) => m.ga.conversions)} />
        )}
      </div>

      {/* range-aware trend */}
      <Card className="p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="ll-display text-[15px] font-semibold">{trendTitle}</div>
            <div className="ll-mono text-[11px] text-gray-400">{windowSpan} · {chartData.length} month{chartData.length > 1 ? "s" : ""}</div>
          </div>
          <div className="flex flex-wrap gap-1.5 no-print">
            {Object.entries(METRICS).filter(([, m]) => m.show).map(([key, m]) => (
              <button key={key} onClick={() => setMetric(key)}
                className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                style={activeMetric === key
                  ? { background: m.color, borderColor: m.color, color: "#fff" }
                  : { borderColor: "#E5E7EB", color: "var(--chip-fg, #4B5563)", background: "var(--chip-bg, #fff)" }}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="ovGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={mCfg.color} stopOpacity={0.24} />
                <stop offset="100%" stopColor={mCfg.color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} reversed={!!mCfg.invert} width={44}
              domain={mCfg.invert ? ["dataMin - 1", "dataMax + 1"] : undefined} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [mCfg.invert ? "#" + v : fmt(v), mCfg.label]} />
            <Area type="monotone" dataKey="value" name={mCfg.label} stroke={mCfg.color} strokeWidth={2.4} fill="url(#ovGrad)" dot={chartData.length <= 6 ? { r: 3, fill: mCfg.color } : false} activeDot={{ r: 5 }} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* movers + events */}
      <div className="grid gap-4 lg:grid-cols-2">
        {tracking.length > 0 && (
          <Card className="p-5">
            <div className="ll-display mb-3 text-[15px] font-semibold">Top keyword movers <span className="text-xs font-normal text-gray-400">last 30 days</span></div>
            <div className="space-y-2">
              {movers.map((t, i) => (
                <div key={i} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-gray-800">{t.keyword}</div>
                    <div className="flex items-center gap-1 text-[11px] text-gray-400"><MapPin size={11} /> {cityLabel(t.city)}</div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <RankChip pos={t.stats.cur} />
                    <PosChange value={t.change} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
        {I.ga && W.ga.events && (
          <Card className="p-5">
            <div className="ll-display mb-3 text-[15px] font-semibold">Key events <span className="text-xs font-normal text-gray-400">GA4 · this month</span></div>
            <div className="space-y-2">
              {topEvents.map((e, i) => (
                <div key={i} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2">
                  <span className="ll-mono truncate text-[12.5px] text-gray-700">{e.name}</span>
                  <span className="flex items-center gap-2.5">
                    <span className="ll-display text-[15px] font-semibold">{fmt(e.series[12])}</span>
                    <Delta pct={pctDelta(e.series[12], e.series[12 - cmp])} />
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}


export function CitySelect({ value, onChange }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  useEffect(() => {
    const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return ALL_CITIES.slice(0, 8);
    return ALL_CITIES.filter((c) =>
      c.city.toLowerCase().includes(s) || c.region.toLowerCase().includes(s) || c.country.toLowerCase().includes(s)
    ).slice(0, 8);
  }, [q]);

  return (
    <div ref={boxRef} className="relative">
      <button onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-[13px]">
        {value ? (
          <span className="flex items-center gap-1.5">
            <MapPin size={13} className="text-gray-400" />
            {cityLabel(value)} <span className="text-[11px] text-gray-400">· {COUNTRY_LABEL[value.country]}</span>
          </span>
        ) : <span className="text-gray-400">Search & select a city…</span>}
        <ChevronDown size={14} className="text-gray-400" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Type a city — USA, Canada, England, Australia"
            className="mb-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px]" />
          <div className="max-h-52 overflow-y-auto">
            {results.length === 0 && <div className="px-3 py-2 text-[12px] text-gray-400">No city found — try another spelling.</div>}
            {results.map((c) => (
              <button key={cityKey(c)} onClick={() => { onChange(c); setOpen(false); setQ(""); }}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] hover:bg-gray-50">
                <span><span className="font-medium">{c.city}</span><span className="text-gray-400">, {c.region}</span></span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">{COUNTRY_LABEL[c.country]}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AddKeywordModal({ project, dfsConnected, onClose, onAdd, accent }) {
  const [domain, setDomain] = useState(project.website);
  const [keywords, setKeywords] = useState("");
  const [engine, setEngine] = useState("Google");
  const [city, setCity] = useState(null);
  const [device, setDevice] = useState("Mobile");
  const [reportingType, setReportingType] = useState("Recurring");
  const [rerunDays, setRerunDays] = useState(1);
  const [scrape, setScrape] = useState(dfsConnected ? "DataForSEO SERP API" : "My Own IP");
  const valid = domain.trim() && keywords.trim() && city;
  const kwCount = keywords.split(/\n|,/).filter((k) => k.trim()).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="ll-display text-lg font-semibold">Add keywords to track</div>
            <div className="text-[12px] text-gray-400">Each keyword is checked at its city level for accurate local rankings.</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="space-y-3.5">
          <Labeled label="Domain">
            <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" className={inputCls} />
          </Labeled>
          <Labeled label="Keywords — one per line">
            <textarea value={keywords} onChange={(e) => setKeywords(e.target.value)} rows={3}
              placeholder={"dentist near me\nteeth whitening"} className={inputCls} />
          </Labeled>
          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Search engine">
              <Seg options={["Google", "Bing"]} value={engine} onChange={setEngine} accent={accent} />
            </Labeled>
            <Labeled label="Search device">
              <Seg options={["Mobile", "Desktop"]} value={device} onChange={setDevice} icons={[Smartphone, Monitor]} accent={accent} />
            </Labeled>
          </div>
          <Labeled label="Targeted city">
            <CitySelect value={city} onChange={setCity} />
          </Labeled>
          <Labeled label="Reporting type">
            <Seg options={["One time", "Recurring"]} value={reportingType} onChange={setReportingType} accent={accent} />
          </Labeled>
          {reportingType === "Recurring" && (
            <Labeled label={`Rerun every ${rerunDays} day${rerunDays > 1 ? "s" : ""}`}>
              <div className="flex items-center gap-3">
                <input type="range" min={1} max={30} value={rerunDays} onChange={(e) => setRerunDays(+e.target.value)}
                  className="w-full" style={{ accentColor: accent }} />
                <input type="number" min={1} max={30} value={rerunDays}
                  onChange={(e) => setRerunDays(Math.min(30, Math.max(1, +e.target.value || 1)))}
                  className="ll-mono w-16 rounded-lg border border-gray-200 px-2 py-1.5 text-center text-[13px]" />
              </div>
            </Labeled>
          )}
          <Labeled label="Scrape SERP with">
            <div className="space-y-1.5">
              {["DataForSEO SERP API", "My Own IP"].map((opt) => {
                const disabled = opt === "DataForSEO SERP API" && !dfsConnected;
                return (
                  <button key={opt} disabled={disabled} onClick={() => setScrape(opt)}
                    className="flex w-full items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-left disabled:opacity-50"
                    style={{ borderColor: scrape === opt ? accent : "#E5E7EB", background: scrape === opt ? accent + "0A" : "#fff" }}>
                    <span className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2" style={{ borderColor: scrape === opt ? accent : "#D1D5DB" }}>
                      {scrape === opt && <span className="h-2 w-2 rounded-full" style={{ background: accent }} />}
                    </span>
                    <span>
                      <span className="block text-[13px] font-medium">{opt}</span>
                      <span className="block text-[11px] text-gray-400">
                        {opt === "My Own IP"
                          ? "Fetches SERPs from your server's IP — free, but results can be blocked or personalized."
                          : disabled
                            ? "Add your company DataForSEO API in Company Settings → API settings."
                            : "Uses your company DataForSEO API — geo-precise and never blocked. Recommended."}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Labeled>
          <button disabled={!valid}
            onClick={() => {
              const list = keywords.split(/\n|,/).map((k) => k.trim()).filter(Boolean);
              onAdd(list.map((kw) => ({
                id: "t" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
                domain: domain.trim().replace(/^https?:\/\//, ""),
                keyword: kw, engine, city, device, reportingType,
                rerunDays: reportingType === "Recurring" ? rerunDays : null,
                scrape, days: 1,
              })));
            }}
            className="w-full rounded-xl py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-40"
            style={{ background: accent }}>
            Start tracking {kwCount || ""} keyword{kwCount === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RankTrackingView({ project, tracking, dfsConnected, accent, onAdd, onDelete, onRerun, readOnly = false, dfs }) {
  const [cityFilter, setCityFilter] = useState("All cities");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const W = project.widgets.ranks;
  const [selected, setSelected] = useState(new Set());
  const [rerunning, setRerunning] = useState(false);
  const [rerunResult, setRerunResult] = useState(null); // { ok: number, ts: number } | { error: string }

  const cities = [...new Set(tracking.map((t) => cityLabel(t.city)))];
  const rows = tracking.filter((t) =>
    (cityFilter === "All cities" || cityLabel(t.city) === cityFilter) &&
    (!search.trim() || t.keyword.toLowerCase().includes(search.trim().toLowerCase()))
  );

  const toggleSelect = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(rows.length === selected.size && rows.every((r) => selected.has(r.id)) ? new Set() : new Set(rows.map((r) => r.id)));
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const doRerun = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    setRerunning(true); setRerunResult(null);
    try {
      /* REAL path first: the API server runs one live SERP request per keyword
         through DataForSEO and parses the true rank (server/index.js). */
      const entries = ids.map((id) => tracking.find((t) => t.id === id)).filter(Boolean)
        .map((e) => ({ id: e.id, keyword: e.keyword, city: e.city, device: e.device, engine: e.engine, domain: e.domain }));
      let updates = null, live = false;
      try {
        const res = await fetch("/api/rerun", {
          method: "POST", headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(90000),
          body: JSON.stringify({ entries, dfs: dfs?.login && dfs?.password && !dfs.login.includes("demo@serpsquad") ? dfs : undefined }),
        });
        if (res.ok) {
          const data = await res.json();
          updates = data.updated.filter((u) => !u.error).map((u) => ({ id: u.id, newPos: u.position ?? 60 })); // null = not in top 100
          live = true;
        } else if (res.status !== 503) throw new Error(await res.text());
      } catch { /* API server down / unconfigured → demo fallback below */ }

      if (!updates) {
        /* DEMO fallback: deterministic-ish nudge, clearly labeled in the result toast */
        await new Promise((r) => setTimeout(r, 800 + Math.random() * 1200));
        updates = entries.map((e) => {
          const entry = tracking.find((t) => t.id === e.id);
          const shift = Math.round((Math.random() - 0.45) * 3);
          return { id: e.id, newPos: Math.max(1, Math.min(60, entry.stats.cur + shift)) };
        });
      }
      onRerun?.(updates);
      setRerunResult({ ok: updates.length, ts: Date.now(), live });
      setSelected(new Set());
    } catch (err) {
      setRerunResult({ error: err.message });
    } finally {
      setRerunning(false);
    }
  };

  const avg = rows.length ? rows.reduce((a, t) => a + t.stats.cur, 0) / rows.length : 0;
  const top3 = rows.filter((t) => t.stats.cur <= 3).length;
  const top10 = rows.filter((t) => t.stats.cur <= 10).length;
  const top20 = rows.filter((t) => t.stats.cur <= 20).length;
  const improved30 = rows.filter((t) => (t.stats.d30 ?? 0) > 0).length;
  const declined30 = rows.filter((t) => (t.stats.d30 ?? 0) < 0).length;
  const dist = [
    { name: "Top 3", value: rows.filter((t) => t.stats.cur <= 3).length },
    { name: "4–10", value: rows.filter((t) => t.stats.cur > 3 && t.stats.cur <= 10).length },
    { name: "11–20", value: rows.filter((t) => t.stats.cur > 10 && t.stats.cur <= 20).length },
    { name: "21+", value: rows.filter((t) => t.stats.cur > 20).length },
  ];

  return (
    <div className="ll-fade space-y-5">
      {W.insights && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <StatCard icon={Target} label="Keywords tracked" source="Ranks" accent={accent} value={rows.length} sub={`${cities.length} cit${cities.length === 1 ? "y" : "ies"}`} />
          <StatCard icon={Target} label="Avg. position" source="Ranks" accent={accent} value={rows.length ? "#" + avg.toFixed(1) : "–"} />
          <StatCard icon={Target} label="Top 3" source="Ranks" accent={accent} value={top3} sub={rows.length ? `${Math.round((top3 / rows.length) * 100)}% of tracked` : ""} />
          <StatCard icon={Target} label="Top 10" source="Ranks" accent={accent} value={top10} sub={rows.length ? `${Math.round((top10 / rows.length) * 100)}% of tracked` : ""} />
          <StatCard icon={Target} label="Top 20" source="Ranks" accent={accent} value={top20} sub={rows.length ? `${Math.round((top20 / rows.length) * 100)}% of tracked` : ""} />
          <StatCard icon={ArrowUpRight} label="Movement (30d)" source="Ranks" accent={accent} value={`↑${improved30} / ↓${declined30}`} sub="up / down" />
        </div>
      )}

      {W.distribution && rows.length > 0 && (
        <Card className="p-5">
          <div className="ll-display mb-3 text-[15px] font-semibold">Ranking distribution</div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={dist} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={48} tick={{ fontSize: 12, fill: "#6B7280" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill={accent} radius={[0, 6, 6, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {W.table && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
            <div>
              <div className="ll-display text-[15px] font-semibold">Keyword rank tracking</div>
              <div className="text-[11px] text-gray-400">
                City-level positions · {dfsConnected ? "scraped via your company DataForSEO API" : "company DataForSEO API not connected — add it in Company Settings → API settings"}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 no-print">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter keywords…"
                className="w-36 rounded-lg border border-gray-200 px-3 py-1.5 text-[13px]" />
              <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[13px]">
                <option>All cities</option>
                {cities.map((c) => <option key={c}>{c}</option>)}
              </select>
              {!readOnly && (
                <>
                  <button onClick={() => setShowModal(true)}
                    className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[13px] font-medium text-white" style={{ background: accent }}>
                    <Plus size={14} /> Add keywords
                  </button>
                  <button onClick={doRerun} disabled={selected.size === 0 || rerunning}
                    className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium disabled:opacity-40"
                    style={selected.size > 0 && !rerunning
                      ? { borderColor: accent, color: accent, background: accent + "0F" }
                      : { borderColor: "#E5E7EB", color: "#6B7280", background: "#fff" }}>
                    {rerunning
                      ? <><RefreshCw size={13} className="animate-spin" /> Checking {selected.size} keyword{selected.size > 1 ? "s" : ""}…</>
                      : <><RefreshCw size={13} /> Rerun now {selected.size > 0 ? `(${selected.size})` : ""}</>}
                  </button>
                </>
              )}
            </div>
          </div>
          {rerunResult && (
            <div className={`ll-fade flex items-center justify-between px-5 py-2.5 text-[12.5px] ${rerunResult.error ? "bg-red-50" : "bg-emerald-50"}`}>
              <span className="flex items-center gap-1.5 font-medium" style={{ color: rerunResult.error ? "#991B1B" : "#166534" }}>
                {rerunResult.error
                  ? <><X size={14} /> Rerun failed: {rerunResult.error}</>
                  : <><RefreshCw size={13} /> Re-checked {rerunResult.ok} keyword{rerunResult.ok > 1 ? "s" : ""} {rerunResult.live ? "via DataForSEO (live)" : "(demo — start the API server + add DataForSEO credentials for live checks)"}. Positions updated.</>}
              </span>
              <button onClick={() => setRerunResult(null)} className="text-gray-400 hover:text-gray-600"><X size={13} /></button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400">
                  <th className="px-4 py-3 no-print">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll}
                      className="h-4 w-4 cursor-pointer rounded" style={{ accentColor: accent }} />
                  </th>
                  <th className="px-5 py-3 font-semibold">Keyword</th>
                  <th className="px-3 py-3 font-semibold">Start</th>
                  <th className="px-3 py-3 font-semibold">Current</th>
                  <th className="px-3 py-3 font-semibold">1d</th>
                  <th className="px-3 py-3 font-semibold">7d</th>
                  <th className="px-3 py-3 font-semibold">30d</th>
                  <th className="px-3 py-3 font-semibold">Lifetime</th>
                  <th className="px-3 py-3 font-semibold">Trend</th>
                  <th className="px-3 py-3 font-semibold">Ranking URL</th>
                  <th className="px-3 py-3 no-print"></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={11} className="px-5 py-10 text-center text-[13px] text-gray-400">
                    No keywords tracked yet — add your first keywords to start collecting daily positions.
                  </td></tr>
                )}
                {rows.map((t) => (
                  <tr key={t.id} className={`border-b border-gray-50 align-top hover:bg-gray-50/60 ${selected.has(t.id) ? "bg-blue-50/40" : ""}`}>
                    <td className="px-4 py-3 no-print">
                      <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelect(t.id)}
                        className="h-4 w-4 cursor-pointer rounded" style={{ accentColor: accent }} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-800">{t.keyword}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-gray-400">
                        <span className="inline-flex items-center gap-1"><MapPin size={11} />{cityLabel(t.city)}</span>
                        <span className="inline-flex items-center gap-1">{t.device === "Mobile" ? <Smartphone size={11} /> : <Monitor size={11} />}{t.device}</span>
                        <span className="inline-flex items-center gap-1"><Search size={11} />{t.engine}</span>
                        <span className="inline-flex items-center gap-1">
                          {t.reportingType === "Recurring" ? <><RefreshCw size={11} />every {t.rerunDays}d</> : <><Clock size={11} />one time</>}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3"><RankChip pos={t.stats.start} muted /></td>
                    <td className="px-3 py-3"><RankChip pos={t.stats.cur} /></td>
                    <td className="px-3 py-3"><PosChange value={t.stats.d1} /></td>
                    <td className="px-3 py-3"><PosChange value={t.stats.d7} /></td>
                    <td className="px-3 py-3"><PosChange value={t.stats.d30} /></td>
                    <td className="px-3 py-3"><PosChange value={t.stats.life} /></td>
                    <td className="px-3 py-3"><Spark values={t.positions.slice(-90)} invert color={accent} /></td>
                    <td className="max-w-44 truncate px-3 py-3 text-[12px]" title={t.url}>
                      <a href={t.url} target="_blank" rel="noopener noreferrer" className="ll-mono hover:underline" style={{ color: accent }}>{urlSlug(t.url)}</a>
                    </td>
                    <td className="px-3 py-3 no-print">
                      {!readOnly && <button onClick={() => onDelete(t.id)} className="rounded-md p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"><Trash2 size={14} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {showModal && (
        <AddKeywordModal project={project} dfsConnected={dfsConnected} accent={accent} onClose={() => setShowModal(false)}
          onAdd={(entries) => { onAdd(entries); setShowModal(false); }} />
      )}
    </div>
  );
}

/* brand marks for the three business-profile providers */
export const GoogleGIcon = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-label="Google">
    <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
    <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 42.6 44 37 44 24c0-1.3-.1-2.6-.4-3.9z"/>
  </svg>
);
export const BingIcon = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-label="Bing">
    <path fill="#008373" d="M5 2.5l4.2 1.5v14.1l5.9-3.4-2.9-1.4-1.8-4.5 9.3 3.3v4.8L9.2 22.5 5 20.1V2.5z"/>
  </svg>
);
export const AppleMapsIcon = ({ size = 15 }) => <AppleLogo size={size} strokeWidth={2.2} style={{ color: "#111827" }} />;

export const PROFILE_PROVIDERS = [
  { key: "gbp", label: "Google Business Profile", Icon: GoogleGIcon, source: "GBP" },
  { key: "bing", label: "Bing Places", Icon: BingIcon, source: "BING" },
  { key: "apple", label: "Apple Maps", Icon: AppleMapsIcon, source: "APPLE" },
];
export const anyProfileConnected = (integrations = {}) => !!(integrations.gbp || integrations.bing || integrations.apple);

function ProfileNotConnected({ name, accent, location }) {
  return (
    <Card className="p-10 text-center">
      <div className="ll-display text-[15px] font-semibold">{name} is not connected{location ? ` for ${location}` : ""}</div>
      <p className="mx-auto mt-1 max-w-md text-[12.5px] text-gray-400">
        Add the credentials in Company Settings → API settings, then connect it in
        Project settings → Data sources{location ? ` under the "${location}" location group` : ""}.
      </p>
    </Card>
  );
}

export function GbpView({ project, data, range, setRange, accent }) {
  /* location groups: franchise projects hold one profile set per location */
  const locs = data.locations || [];
  const [locId, setLocId] = useState(locs.length > 1 ? "all" : (locs[0]?.id || "all"));
  const [locOpen, setLocOpen] = useState(false);
  useEffect(() => { setLocId(locs.length > 1 ? "all" : (locs[0]?.id || "all")); setLocOpen(false); }, [project.id]); // eslint-disable-line
  const locSel = locId !== "all" ? locs.find((l) => l.id === locId) : null;
  const src = locSel || data;                                  // months/terms of the active location (or the combined view)
  const I = locSel ? (locSel.integrations || {}) : project.integrations;
  const [provider, setProvider] = useState(I.gbp ? "gbp" : I.bing ? "bing" : "apple");
  const W = project.widgets.gbp;
  const [a, b] = rangeIdx(range);
  const seg = src.months.slice(a, b + 1);
  const prevSeg = a - seg.length >= 0 ? src.months.slice(a - seg.length, a) : null;
  const tot = (g) => seg.reduce((s, m) => s + g(m), 0);
  const ptc = (g) => (prevSeg ? pctDelta(tot(g), prevSeg.reduce((s, m) => s + g(m), 0)) : null);
  const spark = (g) => (seg.length > 1 ? seg.map(g) : null);

  const breakdown = seg.map((m) => ({ label: m.label, Search: m.gbp.searchViews, Maps: m.gbp.mapViews }));
  const actions = seg.map((m) => ({ label: m.label, Calls: m.gbp.calls, Directions: m.gbp.directions, "Website clicks": m.gbp.websiteClicks }));
  const platformDevice = [
    { name: "Search · Mobile", key: "searchMobile", icon: Smartphone },
    { name: "Search · Desktop", key: "searchDesktop", icon: Monitor },
    { name: "Maps · Mobile", key: "mapsMobile", icon: Smartphone },
    { name: "Maps · Desktop", key: "mapsDesktop", icon: Monitor },
  ].map((p) => ({
    ...p,
    value: tot((m) => m.gbp[p.key]),
    pct: ptc((m) => m.gbp[p.key]),
  }));
  const PD_COLORS = [accent, accent + "99", "#64748B", "#CBD5E1"];

  /* searches-by-keywords scaled to the selected range */
  const svNow = src.months[12].gbp.searchViews || 1;
  const svSeg = tot((m) => m.gbp.searchViews);
  const svPrev = prevSeg ? prevSeg.reduce((s, m) => s + m.gbp.searchViews, 0) : null;
  const cmpMonths = Math.min(12, seg.length); // per-term prev, same as ReportBuilder — dashboard and reports must agree
  const terms = src.gbpTerms.map((t) => ({
    term: t.term,
    impressions: Math.max(1, Math.round(t.impressions * (svSeg / svNow))),
    pct: svPrev != null ? pctDelta(t.impressions, t.prev(cmpMonths)) : null,
  }));
  const totalTerms = terms.reduce((x, t) => x + t.impressions, 0);

  const bingT = { impr: tot((m) => m.bing?.impressions || 0), clicks: tot((m) => m.bing?.clicks || 0), calls: tot((m) => m.bing?.calls || 0), dirs: tot((m) => m.bing?.directions || 0) };
  const appleT = { views: tot((m) => m.apple?.views || 0), calls: tot((m) => m.apple?.calls || 0), dirs: tot((m) => m.apple?.directions || 0), taps: tot((m) => m.apple?.websiteTaps || 0) };
  const bingSeries = seg.map((m) => ({ label: m.label, Impressions: m.bing?.impressions || 0, Clicks: m.bing?.clicks || 0 }));
  const bingActions = seg.map((m) => ({ label: m.label, Calls: m.bing?.calls || 0, Directions: m.bing?.directions || 0 }));
  const appleSeries = seg.map((m) => ({ label: m.label, "Place card views": m.apple?.views || 0 }));
  const appleActions = seg.map((m) => ({ label: m.label, "Call taps": m.apple?.calls || 0, "Direction taps": m.apple?.directions || 0, "Website taps": m.apple?.websiteTaps || 0 }));

  return (
    <div className="ll-fade space-y-5">
      <DateRangeBar range={range} setRange={setRange} accent={accent} />
      {/* provider switcher — Google / Bing / Apple + location selector */}
      <div className="flex flex-wrap items-center gap-1.5">
        {PROFILE_PROVIDERS.map((pr) => (
          <button key={pr.key} onClick={() => setProvider(pr.key)}
            className="flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold"
            style={provider === pr.key ? { background: accent + "10", borderColor: accent, color: accent } : { background: "var(--chip-bg, #fff)", borderColor: "#E5E7EB", color: "var(--chip-fg, #4B5563)" }}>
            <pr.Icon size={15} /> {pr.label}
            <span className="ll-mono text-[9px] font-bold" style={{ color: I[pr.key] ? "#16A34A" : "#D1D5DB" }}>{I[pr.key] ? "\u25cf" : "\u25cb"}</span>
          </button>
        ))}
        {locs.length > 0 && (
          <div className="relative ml-auto">
            <button onClick={() => setLocOpen((v) => !v)}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-gray-700 hover:border-gray-300">
              <MapPin size={13} style={{ color: accent }} />
              <span className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Location</span>
              <span className="max-w-[180px] truncate">{locSel ? locSel.name : "All locations"}</span>
              <ChevronDown size={13} className="text-gray-400" style={{ transform: locOpen ? "rotate(180deg)" : "none" }} />
            </button>
            {locOpen && (
              <div className="absolute right-0 z-30 mt-1 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-xl">
                <div className="px-3 py-1 text-[9px] font-semibold uppercase tracking-wider text-gray-400">Select location</div>
                {locs.length > 1 && (
                  <button onClick={() => { setLocId("all"); setLocOpen(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-gray-700 hover:bg-gray-50"
                    style={locId === "all" ? { color: accent, fontWeight: 700 } : {}}>
                    All locations <span className="ll-mono ml-auto text-[9.5px] font-normal text-gray-400">{locs.length} combined</span>
                  </button>
                )}
                {locs.map((l) => (
                  <button key={l.id} onClick={() => { setLocId(l.id); setLocOpen(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-gray-700 hover:bg-gray-50"
                    style={locId === l.id ? { color: accent, fontWeight: 700 } : {}}>
                    <MapPin size={12} className="shrink-0 text-gray-300" />
                    <span className="min-w-0 flex-1 truncate">{l.name}</span>
                    <span className="ll-mono flex shrink-0 gap-1 text-[8.5px] font-bold">
                      {[["gbp", "G"], ["bing", "B"], ["apple", "A"]].map(([k, ltr]) => (
                        <span key={k} title={{ gbp: "Google Business Profile", bing: "Bing Places", apple: "Apple Maps" }[k] + (l.integrations?.[k] ? " connected" : " not connected")}
                          style={{ color: l.integrations?.[k] ? "#16A34A" : "#D1D5DB" }}>{ltr}</span>
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {provider === "bing" && (!I.bing ? <ProfileNotConnected name="Bing Places" accent={accent} location={locSel?.name} /> : (<>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {(project.widgets.bing?.impressions !== false) && <StatCard icon={Eye} label="Impressions" source="BING" accent={accent} value={fmt(bingT.impr)} pct={ptc((m) => m.bing?.impressions || 0)} spark={spark((m) => m.bing?.impressions || 0)} />}
          {(project.widgets.bing?.clicks !== false) && <StatCard icon={MousePointerClick} label="Clicks" source="BING" accent={accent} value={fmt(bingT.clicks)} pct={ptc((m) => m.bing?.clicks || 0)} spark={spark((m) => m.bing?.clicks || 0)} />}
          {(project.widgets.bing?.calls !== false) && <StatCard icon={Phone} label="Calls" source="BING" accent={accent} value={fmt(bingT.calls)} pct={ptc((m) => m.bing?.calls || 0)} spark={spark((m) => m.bing?.calls || 0)} />}
          {(project.widgets.bing?.directions !== false) && <StatCard icon={Navigation} label="Direction requests" source="BING" accent={accent} value={fmt(bingT.dirs)} pct={ptc((m) => m.bing?.directions || 0)} spark={spark((m) => m.bing?.directions || 0)} />}
        </div>
        <Card className="p-5">
          <div className="ll-display mb-4 text-[15px] font-semibold">Bing Search & Maps visibility <span className="text-xs font-normal text-gray-400">impressions vs clicks</span></div>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={bingSeries} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="l" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line yAxisId="l" type="monotone" dataKey="Impressions" stroke="#008373" strokeWidth={2.2} dot={false} />
              <Line yAxisId="r" type="monotone" dataKey="Clicks" stroke={accent} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5">
          <div className="ll-display mb-4 text-[15px] font-semibold">Customer actions on Bing</div>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={bingActions} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Calls" fill="#008373" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Directions" fill={accent} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </>))}

      {provider === "apple" && (!I.apple ? <ProfileNotConnected name="Apple Maps" accent={accent} location={locSel?.name} /> : (<>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {(project.widgets.apple?.views !== false) && <StatCard icon={Eye} label="Place card views" source="APPLE" accent={accent} value={fmt(appleT.views)} pct={ptc((m) => m.apple?.views || 0)} spark={spark((m) => m.apple?.views || 0)} />}
          {(project.widgets.apple?.calls !== false) && <StatCard icon={Phone} label="Call taps" source="APPLE" accent={accent} value={fmt(appleT.calls)} pct={ptc((m) => m.apple?.calls || 0)} spark={spark((m) => m.apple?.calls || 0)} />}
          {(project.widgets.apple?.directions !== false) && <StatCard icon={Navigation} label="Direction taps" source="APPLE" accent={accent} value={fmt(appleT.dirs)} pct={ptc((m) => m.apple?.directions || 0)} spark={spark((m) => m.apple?.directions || 0)} />}
          {(project.widgets.apple?.websiteTaps !== false) && <StatCard icon={Globe} label="Website taps" source="APPLE" accent={accent} value={fmt(appleT.taps)} pct={ptc((m) => m.apple?.websiteTaps || 0)} spark={spark((m) => m.apple?.websiteTaps || 0)} />}
        </div>
        <Card className="p-5">
          <div className="ll-display mb-4 text-[15px] font-semibold">Apple Maps visibility <span className="text-xs font-normal text-gray-400">place card views (Apple Business Connect)</span></div>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={appleSeries} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <defs><linearGradient id="appleFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#111827" stopOpacity={0.22} /><stop offset="100%" stopColor="#111827" stopOpacity={0.02} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="Place card views" stroke="#111827" strokeWidth={2.2} fill="url(#appleFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5">
          <div className="ll-display mb-4 text-[15px] font-semibold">Taps on your place card</div>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={appleActions} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Call taps" fill="#111827" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Direction taps" fill={accent} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Website taps" fill="#94A3B8" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </>))}

      {provider === "gbp" && !I.gbp && <ProfileNotConnected name="Google Business Profile" accent={accent} location={locSel?.name} />}
      {provider === "gbp" && I.gbp && (<>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {W.views && <StatCard icon={Eye} label="Total profile views" source="GBP" accent={accent} value={fmt(tot((m) => m.gbp.views))} pct={ptc((m) => m.gbp.views)} spark={spark((m) => m.gbp.views)} />}
        {W.calls && <StatCard icon={Phone} label="Calls" source="GBP" accent={accent} value={fmt(tot((m) => m.gbp.calls))} pct={ptc((m) => m.gbp.calls)} spark={spark((m) => m.gbp.calls)} />}
        {W.directions && <StatCard icon={Navigation} label="Direction requests" source="GBP" accent={accent} value={fmt(tot((m) => m.gbp.directions))} pct={ptc((m) => m.gbp.directions)} spark={spark((m) => m.gbp.directions)} />}
        {W.websiteClicks && <StatCard icon={Globe} label="Website clicks" source="GBP" accent={accent} value={fmt(tot((m) => m.gbp.websiteClicks))} pct={ptc((m) => m.gbp.websiteClicks)} spark={spark((m) => m.gbp.websiteClicks)} />}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {W.breakdown && (
          <Card className="p-5">
            <div className="ll-display mb-4 text-[15px] font-semibold">Where people found you <span className="text-xs font-normal text-gray-400">Search vs Maps · {LABELS[a]} – {LABELS[b]}</span></div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={breakdown} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="Search" stackId="1" stroke={accent} fill={accent} fillOpacity={0.55} />
                <Area type="monotone" dataKey="Maps" stackId="1" stroke="#94A3B8" fill="#CBD5E1" fillOpacity={0.6} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        )}
        <Card className="p-5">
          <div className="ll-display mb-4 text-[15px] font-semibold">Customer actions <span className="text-xs font-normal text-gray-400">{LABELS[a]} – {LABELS[b]}</span></div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={actions} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Calls" fill={accent} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Directions" fill="#94A3B8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Website clicks" fill="#D8DEE9" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {W.platformDevice && (
          <Card className="p-5 lg:col-span-2">
            <div className="ll-display mb-2 text-[15px] font-semibold">Views by platform & device <span className="text-xs font-normal text-gray-400">selected range</span></div>
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie data={platformDevice} dataKey="value" nameKey="name" innerRadius={44} outerRadius={68} paddingAngle={2}>
                  {platformDevice.map((_, i) => <Cell key={i} fill={PD_COLORS[i]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 space-y-1.5">
              {platformDevice.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px] text-gray-600">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PD_COLORS[i] }} />
                  <p.icon size={12} className="text-gray-400" />
                  {p.name}
                  <span className="ll-mono ml-auto font-semibold text-gray-700">{fmt(p.value)}</span>
                  {p.pct != null && <Delta pct={p.pct} />}
                </div>
              ))}
            </div>
          </Card>
        )}
        {W.searchKeywords && (
          <Card className="overflow-hidden lg:col-span-3">
            <div className="border-b border-gray-100 px-5 py-4">
              <div className="ll-display text-[15px] font-semibold">Searches by keywords</div>
              <div className="text-[11px] text-gray-400">Search terms people used on Google to find this Business Profile · {LABELS[a]} – {LABELS[b]}</div>
            </div>
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400">
                  <th className="px-5 py-2.5 font-semibold">Search term</th>
                  <th className="px-3 py-2.5 font-semibold">Impressions</th>
                  <th className="px-3 py-2.5 font-semibold">Share</th>
                  <th className="px-5 py-2.5 font-semibold">vs prev. period</th>
                </tr>
              </thead>
              <tbody>
                {terms.map((t, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="px-5 py-2.5 font-medium text-gray-800">{t.term}</td>
                    <td className="ll-mono px-3 py-2.5">{fmt(t.impressions)}</td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100">
                          <span className="block h-full rounded-full" style={{ width: `${(t.impressions / totalTerms) * 100}%`, background: accent }} />
                        </span>
                        <span className="ll-mono text-[11px] text-gray-400">{((t.impressions / totalTerms) * 100).toFixed(0)}%</span>
                      </span>
                    </td>
                    <td className="px-5 py-2.5">{t.pct != null ? <Delta pct={t.pct} /> : <span className="text-gray-300">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
      </>)}
    </div>
  );
}

export function WebsitePerformanceView({ project, data, range, setRange, accent }) {
  /* keyword opportunities: GSC queries per page — same generator the
     Optimization Studio editors use, so both surfaces always agree */
  const [oppOpen, setOppOpen] = useState(null);
  const oppTracked = useMemo(() => [...new Set(project.tracking.map((t) => t.keyword))], [project.tracking]);
  const oppPages = useMemo(() => {
    const crawled = project.opt?.website?.pages || [];
    const urls = crawled.length ? crawled.map((pg) => ({ url: pg.origUrl || pg.url, name: pg.name || pg.metaTitle || pg.url })) : data.topPages.map((tp) => ({ url: tp.page, name: tp.page }));
    return urls.map((u) => ({ ...u, ...genPageQueries(project.id, u.url, oppTracked, project.name) }))
      .sort((a, b) => b.top - a.top);
  }, [project.id, project.opt?.website?.pages, data.topPages, oppTracked, project.name]);

  const Wga = project.widgets.ga, Wgsc = project.widgets.gsc;
  const I = project.integrations;
  const [a, b] = rangeIdx(range);
  const seg = data.months.slice(a, b + 1);
  const prevSeg = a - seg.length >= 0 ? data.months.slice(a - seg.length, a) : null;
  const tot = (g) => seg.reduce((x, m) => x + g(m), 0);
  const ptot = (g) => (prevSeg ? prevSeg.reduce((x, m) => x + g(m), 0) : null);
  const ptc = (g) => (prevSeg ? pctDelta(tot(g), ptot(g)) : null);
  const spark = (g) => (seg.length > 1 ? seg.map(g) : null);
  const rangeLabel = `${LABELS[a]} – ${LABELS[b]}`;

  const PIE_COLORS = [accent, "#64748B", "#A5B4C4", "#CBD5E1", "#E2E8F0"];
  const traffic = seg.map((m) => ({ label: m.label, Users: m.ga.users, Sessions: m.ga.sessions }));
  const gscSeries = seg.map((m) => ({ label: m.label, Clicks: m.gsc.clicks, Impressions: m.gsc.impressions }));

  /* channels scaled to the selected range */
  const sessNow = data.months[12].ga.sessions || 1;
  const sessSeg = tot((m) => m.ga.sessions);
  const channels = data.channels.map((c) => ({ ...c, value: Math.max(1, Math.round(c.value * (sessSeg / sessNow))) }));

  /* sources & events summed across the range */
  const sumSeries = (series, from, to) => series.slice(from, to + 1).reduce((x, v) => x + v, 0);
  const sources = data.sources.map((src) => ({
    name: src.name,
    value: sumSeries(src.series, a, b),
    pct: prevSeg ? pctDelta(sumSeries(src.series, a, b), sumSeries(src.series, a - seg.length, a - 1)) : null,
  }));
  const maxSource = Math.max(...sources.map((x) => x.value), 1);
  const events = data.events.map((e) => ({
    name: e.name,
    value: sumSeries(e.series, a, b),
    pct: prevSeg ? pctDelta(sumSeries(e.series, a, b), sumSeries(e.series, a - seg.length, a - 1)) : null,
    series: e.series.slice(a, b + 1),
  }));

  /* GSC rates over the range */
  const clicksSeg = tot((m) => m.gsc.clicks), imprSeg = tot((m) => m.gsc.impressions);
  const ctrNow = (clicksSeg / Math.max(1, imprSeg)) * 100;
  const ctrPrev = prevSeg ? (ptot((m) => m.gsc.clicks) / Math.max(1, ptot((m) => m.gsc.impressions))) * 100 : null;
  const posNow = tot((m) => m.gsc.position) / seg.length;
  const posPrev = prevSeg ? ptot((m) => m.gsc.position) / prevSeg.length : null;

  return (
    <div className="ll-fade space-y-5">
      <DateRangeBar range={range} setRange={setRange} accent={accent} />
      {I.ga && (
        <>
          <SectionHeader icon={BarChart3} title="Website traffic & conversions" sub={`Google Analytics 4 · ${rangeLabel}`} accent={accent} />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Wga.users && <StatCard icon={Users} label="Users" source="GA4" accent={accent} value={fmt(tot((m) => m.ga.users))} pct={ptc((m) => m.ga.users)} spark={spark((m) => m.ga.users)} />}
            {Wga.sessions && <StatCard icon={Eye} label="Sessions" source="GA4" accent={accent} value={fmt(tot((m) => m.ga.sessions))} pct={ptc((m) => m.ga.sessions)} spark={spark((m) => m.ga.sessions)} />}
            {Wga.engagement && <StatCard icon={MousePointerClick} label="Engagement rate" source="GA4" accent={accent} value={(data.engRate * 100).toFixed(0) + "%"} pct={null} sub="range average" />}
            {Wga.conversions && <StatCard icon={BarChart3} label="Conversions" source="GA4" accent={accent} value={fmt(tot((m) => m.ga.conversions))} pct={ptc((m) => m.ga.conversions)} spark={spark((m) => m.ga.conversions)} />}
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="p-5 lg:col-span-3">
              <div className="ll-display mb-4 text-[15px] font-semibold">Traffic <span className="text-xs font-normal text-gray-400">{rangeLabel}</span></div>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={traffic} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="Users" stroke={accent} strokeWidth={2.2} dot={false} />
                  <Line type="monotone" dataKey="Sessions" stroke="#94A3B8" strokeWidth={2} dot={false} strokeDasharray="5 4" />
                </LineChart>
              </ResponsiveContainer>
            </Card>
            {Wga.channels && (
              <Card className="p-5 lg:col-span-2">
                <div className="ll-display mb-2 text-[15px] font-semibold">Traffic channels <span className="text-xs font-normal text-gray-400">{rangeLabel}</span></div>
                <ResponsiveContainer width="100%" height={190}>
                  <PieChart>
                    <Pie data={channels} dataKey="value" nameKey="name" innerRadius={48} outerRadius={74} paddingAngle={2}>
                      {channels.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {channels.map((c, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[12px] text-gray-600">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      {c.name} <span className="ll-mono ml-auto text-gray-400">{fmt(c.value)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {Wga.sources && (
              <Card className="p-5">
                <div className="ll-display mb-1 text-[15px] font-semibold">Traffic sources <span className="text-xs font-normal text-gray-400">sessions · {rangeLabel}</span></div>
                <div className="mb-3 text-[11px] text-gray-400">Where visitors came from — search engines, social, direct and AI assistants</div>
                <div className="space-y-2.5">
                  {sources.map((x, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-16 shrink-0 text-[12.5px] font-medium text-gray-700">{x.name}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <span className="block h-full rounded-full" style={{ width: `${(x.value / maxSource) * 100}%`, background: x.name === "ChatGPT" ? "#7C3AED" : accent }} />
                      </span>
                      <span className="ll-mono w-12 text-right text-[12px] font-semibold">{fmt(x.value)}</span>
                      <span className="w-14 text-right">{x.pct != null ? <Delta pct={x.pct} /> : <span className="text-[11px] text-gray-300">—</span>}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            {Wga.events && (
              <Card className="overflow-hidden">
                <div className="border-b border-gray-100 px-5 py-4">
                  <div className="ll-display text-[15px] font-semibold">Event counts</div>
                  <div className="text-[11px] text-gray-400">GA4 key events · {rangeLabel}</div>
                </div>
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400">
                      <th className="px-5 py-2.5 font-semibold">Event name</th>
                      <th className="px-3 py-2.5 font-semibold">Count</th>
                      <th className="px-3 py-2.5 font-semibold">vs prev. period</th>
                      <th className="px-5 py-2.5 font-semibold">Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/60">
                        <td className="ll-mono px-5 py-2.5 text-gray-700">{e.name}</td>
                        <td className="ll-mono px-3 py-2.5 font-semibold">{fmt(e.value)}</td>
                        <td className="px-3 py-2.5">{e.pct != null ? <Delta pct={e.pct} /> : <span className="text-gray-300">—</span>}</td>
                        <td className="px-5 py-2.5"><Spark values={e.series} color={accent} w={72} h={22} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>

          {Wga.topPages && (
            <Card className="overflow-hidden">
              <div className="ll-display border-b border-gray-100 px-5 py-4 text-[15px] font-semibold">Top landing pages <span className="text-xs font-normal text-gray-400">latest month</span></div>
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400">
                    <th className="px-5 py-3 font-semibold">Page</th>
                    <th className="px-3 py-3 font-semibold">Users</th>
                    <th className="px-5 py-3 font-semibold">Conversions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topPages.map((p, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/60">
                      <td className="ll-mono px-5 py-3 text-gray-700">{project.website}{p.page === "/" ? "" : p.page}</td>
                      <td className="ll-mono px-3 py-3">{fmt(p.users)}</td>
                      <td className="ll-mono px-5 py-3">{fmt(p.conversions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {I.gsc && (
        <>
          <SectionHeader icon={Search} title="Organic search visibility" sub={`Google Search Console · ${rangeLabel}`} accent={accent} />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Wgsc.clicks && <StatCard icon={MousePointerClick} label="Clicks" source="GSC" accent={accent} value={fmt(clicksSeg)} pct={ptc((m) => m.gsc.clicks)} spark={spark((m) => m.gsc.clicks)} />}
            {Wgsc.impressions && <StatCard icon={Eye} label="Impressions" source="GSC" accent={accent} value={fmt(imprSeg)} pct={ptc((m) => m.gsc.impressions)} spark={spark((m) => m.gsc.impressions)} />}
            {Wgsc.ctr && <StatCard icon={Target} label="Avg. CTR" source="GSC" accent={accent} value={ctrNow.toFixed(1) + "%"} pct={ctrPrev != null ? pctDelta(ctrNow, ctrPrev) : null} />}
            {Wgsc.position && <StatCard icon={Search} label="Avg. position" source="GSC" accent={accent} value={"#" + posNow.toFixed(1)} pct={posPrev != null ? pctDelta(posNow, posPrev) : null} invert spark={spark((m) => m.gsc.position)} />}
          </div>
          <Card className="p-5">
            <div className="ll-display mb-4 text-[15px] font-semibold">Clicks & impressions <span className="text-xs font-normal text-gray-400">{rangeLabel}</span></div>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={gscSeries} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="l" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line yAxisId="l" type="monotone" dataKey="Clicks" stroke={accent} strokeWidth={2.2} dot={false} />
                <Line yAxisId="r" type="monotone" dataKey="Impressions" stroke="#94A3B8" strokeWidth={2} dot={false} strokeDasharray="5 4" />
              </LineChart>
            </ResponsiveContainer>
          </Card>
          {Wgsc.topQueries && (
            <Card className="overflow-hidden">
              <div className="ll-display border-b border-gray-100 px-5 py-4 text-[15px] font-semibold">Top search queries <span className="text-xs font-normal text-gray-400">latest month</span></div>
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400">
                    <th className="px-5 py-3 font-semibold">Query</th>
                    <th className="px-3 py-3 font-semibold">Clicks</th>
                    <th className="px-3 py-3 font-semibold">Impressions</th>
                    <th className="px-3 py-3 font-semibold">CTR</th>
                    <th className="px-5 py-3 font-semibold">Position</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topQueries.map((q, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/60">
                      <td className="px-5 py-3 font-medium text-gray-800">{q.query}</td>
                      <td className="ll-mono px-3 py-3">{fmt(q.clicks)}</td>
                      <td className="ll-mono px-3 py-3">{fmt(q.impressions)}</td>
                      <td className="ll-mono px-3 py-3">{((q.clicks / q.impressions) * 100).toFixed(1)}%</td>
                      <td className="px-5 py-3"><RankChip pos={Math.round(q.position)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          <Card className="overflow-hidden">
            <div className="border-b border-gray-100 px-5 py-4">
              <div className="ll-display text-[15px] font-semibold">Keyword opportunities by page</div>
              <div className="text-[11.5px] text-gray-400">Queries already earning impressions where the page ranks below the top 3 — optimizing content for these is the fastest win. Open any page in Optimization Studio → Pages → Live edit & re-optimize.</div>
            </div>
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400">
                  <th className="px-5 py-3 font-semibold">Page</th>
                  <th className="px-3 py-3 font-semibold">Striking-distance keywords</th>
                  <th className="px-3 py-3 font-semibold">Impressions</th>
                  <th className="px-5 py-3 font-semibold">Opportunity</th>
                </tr>
              </thead>
              <tbody>
                {oppPages.map((pg) => {
                  const open = oppOpen === pg.url;
                  const striking = pg.queries.filter((q) => q.position > 3 && q.position <= 25);
                  const st = OPP_STYLE[pg.level];
                  return (
                    <React.Fragment key={pg.url}>
                      <tr onClick={() => setOppOpen(open ? null : pg.url)} className="cursor-pointer border-b border-gray-50 hover:bg-gray-50/60">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5">
                            <ChevronDown size={12} className="shrink-0 text-gray-300" style={{ transform: open ? "none" : "rotate(-90deg)" }} />
                            <span className="ll-mono truncate text-[12px] text-gray-700">{pg.url}</span>
                          </div>
                        </td>
                        <td className="ll-mono px-3 py-3">{striking.length}</td>
                        <td className="ll-mono px-3 py-3">{fmt(pg.queries.reduce((x, q) => x + q.impressions, 0))}</td>
                        <td className="px-5 py-3">
                          <span className="rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                        </td>
                      </tr>
                      {open && pg.queries.map((q) => {
                        const ist = INTENT_STYLE[q.intent];
                        return (
                          <tr key={q.query} className="border-b border-gray-50 bg-gray-50/40 text-[11.5px]">
                            <td className="py-2 pl-11 pr-3">
                              <span className="text-gray-700">{q.query}</span>
                              <span className="ml-1.5 rounded-full px-1.5 py-px text-[8.5px] font-bold uppercase" style={{ background: ist.bg, color: ist.fg }}>{q.intent}</span>
                            </td>
                            <td className="ll-mono px-3 py-2 text-gray-500">#{q.position}</td>
                            <td className="ll-mono px-3 py-2 text-gray-500">{fmt(q.impressions)} impr · {q.clicks} clicks</td>
                            <td className="ll-mono px-5 py-2 text-gray-400">{q.position > 3 && q.position <= 25 ? "striking distance" : q.position <= 3 ? "ranking" : "long tail"}</td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {!I.ga && !I.gsc && (
        <Card className="p-10 text-center text-[13px] text-gray-400">
          Connect Google Analytics 4 or Search Console in Project Settings to see website performance.
        </Card>
      )}
    </div>
  );
}

/* layered per data source — Google, Bing and Apple each have their OWN section,
   and every Performance Studio area (incl. Ads) is represented */
export const WIDGET_META = {
  gbp: { title: "Business Profiles — Google Business Profile", items: { views: "Profile views", breakdown: "Search vs Maps breakdown", calls: "Phone calls", directions: "Direction requests", websiteClicks: "Website clicks", searchKeywords: "Searches by keywords", platformDevice: "Views by platform & device" } },
  bing: { title: "Business Profiles — Bing Places", items: { impressions: "Impressions", clicks: "Clicks", calls: "Calls", directions: "Direction requests" } },
  apple: { title: "Business Profiles — Apple Maps", items: { views: "Place card views", calls: "Call taps", directions: "Direction taps", websiteTaps: "Website taps" } },
  ga: { title: "Website Performance & Analytics — GA4", items: { users: "Users", sessions: "Sessions", engagement: "Engagement rate", conversions: "Conversions", channels: "Traffic channels", sources: "Traffic sources", events: "Event counts", topPages: "Top landing pages" } },
  gsc: { title: "Website Performance & Analytics — Search Console", items: { clicks: "Clicks", impressions: "Impressions", ctr: "Average CTR", position: "Average position", topQueries: "Top queries" } },
  ranks: { title: "Website Rank Tracking", items: { insights: "Insight cards", distribution: "Ranking distribution", table: "Tracking table" } },
  ads: { title: "Ads Performance", items: { kpis: "Conversion summary cards", charts: "Spend & platform charts", table: "Campaign results table" } },
};

/* Settings cards — composed by the client settings modal (gear on the client row).
   Google sources and widget visibility apply to EVERY project of the client;
   project details (name, website, logo, accent) stay per-project via the picker. */
export function GoogleSourcesCard({ project, onToggle, dfsConnected, accent }) {
  const GOOGLE_SOURCES = [
    { key: "gbp", name: "Google Business Profile", desc: "Views, calls, directions, search terms — Business Profile Performance API" },
    { key: "bing", name: "Bing Places", desc: "Impressions, clicks, calls, directions on Bing Search & Maps — needs the Microsoft credentials in API settings" },
    { key: "apple", name: "Apple Maps (Business Connect)", desc: "Place card views and call/direction/website taps — needs the Apple Business Connect key in API settings" },
    { key: "ga", name: "Google Analytics 4", desc: "Users, sessions, sources, events — Analytics Data API" },
    { key: "gsc", name: "Google Search Console", desc: "Clicks, impressions, queries — Search Console API" },
  ];
  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2"><Link2 size={16} style={{ color: accent }} /><span className="ll-display text-[15px] font-semibold">Data sources</span></div>
      <p className="mb-4 text-[12px] text-gray-400">Connect business profiles & analytics — applies to every project of this client. Demo data is shown until live APIs are wired to your backend.</p>
      <div className="space-y-2.5">
        {GOOGLE_SOURCES.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-3.5 py-3">
            <div>
              <div className="text-[13px] font-medium">{s.name}</div>
              <div className="text-[11px] text-gray-400">{s.desc}</div>
            </div>
            <button onClick={() => onToggle(s.key, !project.integrations[s.key])}
              className="shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
              style={project.integrations[s.key] ? { background: "#DCFCE7", color: "#166534" } : { background: accent, color: "#fff" }}>
              {project.integrations[s.key] ? "\u2713 Connected" : "Connect"}
            </button>
          </div>
        ))}
        <div className="flex items-start gap-2.5 rounded-xl bg-gray-50 px-3.5 py-3 text-[12px] text-gray-500">
          <KeyRound size={14} className="mt-0.5 shrink-0 text-gray-400" />
          <span>Keyword rank tracking uses your <b>company-wide DataForSEO API</b>{dfsConnected ? " (connected)" : " (not connected)"} — manage it from the gear icon next to SERP Squad → API settings. Nothing to configure per project.</span>
        </div>
      </div>
    </Card>
  );
}

export function ProjectDetailsCard({ project, update, accent, picker }) {
  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Building2 size={16} style={{ color: accent }} /><span className="ll-display text-[15px] font-semibold">Project details</span></div>
        {picker}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Labeled label="Project name"><input value={project.name} onChange={(e) => update({ name: e.target.value })} className={inputCls} placeholder="e.g. Bright Smile — Manhattan" /></Labeled>
        <Labeled label="Website"><input value={project.website} onChange={(e) => update({ website: e.target.value })} className={inputCls} placeholder="example.com" /></Labeled>
      </div>
      <div className="mt-3">
        <Labeled label="Project logo — shows beside the project name">
          <LogoUpload value={project.logo} onChange={(logo) => update({ logo })} label="Upload project logo" />
        </Labeled>
      </div>
      <div className="mt-5 mb-1 flex items-center gap-2"><Palette size={16} style={{ color: accent }} /><span className="ll-display text-[15px] font-semibold">Report color</span></div>
      <p className="mb-3 text-[12px] text-gray-400">Accent used across this project's charts, buttons and highlights.</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {ACCENTS.map((a) => (
          <button key={a.hex} onClick={() => update({ accent: a.hex })}
            className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium"
            style={{ borderColor: project.accent === a.hex ? a.hex : "#E5E7EB", color: project.accent === a.hex ? a.hex : "#4B5563" }}>
            <span className="h-3.5 w-3.5 rounded-full" style={{ background: a.hex }} /> {a.name}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[12px] text-gray-500">Custom:</label>
        <input type="color" value={project.accent} onChange={(e) => update({ accent: e.target.value })} className="h-8 w-12 cursor-pointer rounded border border-gray-200" />
        <span className="ll-mono text-[12px] text-gray-500">{project.accent}</span>
      </div>
    </Card>
  );
}

export function WidgetsCard({ widgets, setWidget, accent }) {
  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2"><LayoutDashboard size={16} style={{ color: accent }} /><span className="ll-display text-[15px] font-semibold">Choose what to show</span></div>
      <p className="mb-4 text-[12px] text-gray-400">Turn insights on or off per data source — applies to every project of this client; only enabled widgets appear on dashboards and in client reports.</p>
      <div className="space-y-3">
        {Object.entries(WIDGET_META).map(([group, meta]) => (
          <div key={group} className="rounded-xl border border-gray-100 p-3.5">
            <div className="mb-2.5 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
              <span className="text-[12.5px] font-semibold text-gray-700">{meta.title}</span>
              <span className="ll-mono rounded-full bg-gray-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-gray-500">
                {Object.keys(meta.items).filter((k) => widgets[group]?.[k] !== false).length}/{Object.keys(meta.items).length}
              </span>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {Object.entries(meta.items).map(([key, label]) => (
                <Toggle key={key} label={label} on={widgets[group]?.[key] !== false} onChange={(v) => setWidget(group, key, v)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* shown instead of dashboards when a project has demo mode OFF and no real
   source is syncing yet — the honest empty state with exact requirements */
export function NoDataPanel({ project, accent }) {
  const I = project.integrations || {};
  const rows = [
    { on: I.gbp || I.bing || I.apple, name: "Business profiles (Google · Bing · Apple)", need: "Provider OAuth apps in Company Settings → API settings, then authorize each listing in Project settings → Data sources (location groups)." },
    { on: I.ga, name: "Google Analytics 4", need: "Google Cloud OAuth app (API settings) + analytics.readonly consent for this property." },
    { on: I.gsc, name: "Google Search Console", need: "Google Cloud OAuth app (API settings) + webmasters.readonly consent for this site." },
    { on: (project.tracking || []).length > 0, name: "Keyword rank tracking", need: "DataForSEO credentials in API settings — tracked keywords then pull real SERP positions." },
  ];
  return (
    <div className="ll-fade space-y-3">
      <Card className="p-6">
        <div className="ll-display text-[16px] font-semibold">No data syncing yet</div>
        <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-gray-500">
          This project shows <b>real data only</b> — dashboards stay empty until a source is connected and syncing.
          Nothing here is ever fabricated. Connect the sources below, or enable <b>Demo data mode</b> in
          Project settings → Data sources for presentations.
        </p>
      </Card>
      {rows.map((r2) => (
        <div key={r2.name} className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="mt-0.5 shrink-0 text-[15px]">⚠️</span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-amber-900">{r2.name} — not syncing</div>
            <div className="text-[11.5px] leading-relaxed text-amber-800">{r2.need}</div>
          </div>
          <span className="ll-mono ml-auto shrink-0 rounded-full bg-white px-2 py-0.5 text-[9px] font-bold uppercase text-amber-700">{r2.on ? "credentials missing" : "not enabled"}</span>
        </div>
      ))}
    </div>
  );
}

export const NAV = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "gbp", label: "Business Profiles", icon: Building2 },
  { key: "web", label: "Website Performance & Analytics", icon: BarChart3 },
  { key: "ranks", label: "Website Rank Tracking", icon: Target },
  { key: "geogrid", label: "GBP Rank Tracking", icon: MapPin },
  { key: "adsperf", label: "Ads Performance", icon: Rocket },
];

