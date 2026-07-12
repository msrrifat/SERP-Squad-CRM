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
import { ACCENTS, BrandMark, DarkToggle, Delta, FONT_CSS, Labeled, LogoUpload, NEG, POS, PosChange, ProjectMark, RankChip, Seg, SourceTag, inputCls, tooltipStyle } from "../../ui/primitives.jsx";
import { LABELS, MONTH_DATES } from "../../lib/months.jsx";
import { hashStr, mulberry32 } from "../../lib/rng.js";
import { TASK_COLORS, recordState, taskState } from "../pm/board.jsx";
import { OPP_STYLE, genPageQueries } from "../../lib/seo.js";
import { Distribution, ReportGridMap, gridMetrics, distFor } from "../performance/geogrid.jsx";
import { AD_PLATFORMS, PfBadge, campaignDaily, sumMetrics } from "../ads/dashboard.jsx";
import { avgPosDaysAgo } from "../../data/gen.js";
import { cityLabel, urlSlug } from "../../lib/geo.js";
import { fmt, fmtDay, fmtTs2, linkify, pctDelta, uid } from "../../lib/format.jsx";

export const chartShades = (c) => [c, c + "CC", c + "99", c + "66", c + "40", "#CBD5E1"];

export function parsePasted(raw) {
  return raw.replace(/\r/g, "").split("\n").filter((l) => l.trim().length).map((l) => l.split("\t"));
}

export function ReportBuilder({ project, data, tracking, clientProjects = [], records = [], template = "performance", agencyBrand, wlBrand, clientInfo, defaultCmp, initialRange = null, dark, setDark, onClose, aiSummary = null, initialBlocks = null, initialTitle = null, onSave = null, onSaveTemplate = null }) {
  const today = new Date().toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" });
  const [title, setTitle] = useState(initialTitle || (template === "work" ? `${project.name} — Work Report` : `${project.name} — SEO Performance Report`));
  const [accent, setAccent] = useState(project.accent);
  const [cmp, setCmp] = useState(defaultCmp || 3); // legacy per-block fallback (older saved reports)
  const [workSearch, setWorkSearch] = useState("");
  /* ---- Report Date Range (day-granular) ----
     The generators are monthly; each month's totals are distributed into
     DETERMINISTIC daily buckets (seeded per metric+month, weekday-weighted,
     rounding so the days sum EXACTLY to the month total). Every data puller
     sums the selected start–end dates and compares against the previous
     period of equal length. */
  const MS = 864e5;
  const isoD = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
  const todayD = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const som = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
  const RANGE_PRESETS = [
    ["last7", "Last 7 days", () => [new Date(todayD.getTime() - 6 * MS), todayD]],
    ["last30", "Last 30 days", () => [new Date(todayD.getTime() - 29 * MS), todayD]],
    ["thisMonth", "This month", () => [som(todayD), todayD]],
    ["lastMonth", "Last month", () => [new Date(todayD.getFullYear(), todayD.getMonth() - 1, 1), new Date(todayD.getFullYear(), todayD.getMonth(), 0)]],
    ["3mo", "Last 3 months", () => [new Date(todayD.getFullYear(), todayD.getMonth() - 2, 1), todayD]],
    ["6mo", "Last 6 months", () => [new Date(todayD.getFullYear(), todayD.getMonth() - 5, 1), todayD]],
    ["12mo", "Last 12 months", () => [new Date(todayD.getFullYear(), todayD.getMonth() - 11, 1), todayD]],
    ["ytd", "Year to date", () => [new Date(todayD.getFullYear(), 0, 1), todayD]],
    ["custom", "Custom dates", null],
  ];
  const earliestD = MONTH_DATES[0];
  const clampD = (d) => new Date(Math.min(Math.max(d.getTime(), earliestD.getTime()), todayD.getTime()));
  const [range, setRange] = useState(() => {
    if (initialRange?.start) return initialRange;
    if (initialRange && initialRange.a != null) { // legacy saved reports used month indices
      const a = Math.max(0, Math.min(12, initialRange.a)), b2 = Math.max(a, Math.min(12, initialRange.b));
      const endLegacy = b2 < 12 ? new Date(MONTH_DATES[b2 + 1].getTime() - MS) : todayD;
      return { preset: "custom", start: isoD(MONTH_DATES[a]), end: isoD(endLegacy) };
    }
    const [s2, e2] = RANGE_PRESETS.find(([k]) => k === "3mo")[2]();
    return { preset: "3mo", start: isoD(s2), end: isoD(e2) };
  });
  const startD = clampD(new Date(range.start + "T00:00:00"));
  const endD = clampD(new Date(range.end + "T00:00:00"));
  const lenDays = Math.max(1, Math.round((endD - startD) / MS) + 1);
  const prevEndD = new Date(startD.getTime() - MS);
  const prevStartD = new Date(startD.getTime() - lenDays * MS);
  const hasPrev = prevStartD.getTime() >= earliestD.getTime();

  /* deterministic daily buckets per metric, cached for the session */
  const dayCache = useRef({});
  const dailyOf = (M, ns, key, get) => {
    const ck = ns + "|" + key;
    if (!dayCache.current[ck]) {
      const out = [];
      for (let i = 0; i < 13; i++) {
        const total = get(M[i], i) || 0;
        const mStart = MONTH_DATES[i];
        const nDays = Math.round((new Date(mStart.getFullYear(), mStart.getMonth() + 1, 1) - mStart) / MS);
        const r = mulberry32(hashStr(ck + "|" + i));
        const ws = []; let wSum = 0;
        for (let d2 = 0; d2 < nDays; d2++) {
          const dow = new Date(mStart.getTime() + d2 * MS).getDay();
          const w = (0.8 + r() * 0.4) * (dow === 0 || dow === 6 ? 0.72 : 1.1);
          ws.push(w); wSum += w;
        }
        let cum = 0, prevRound = 0;
        for (let d2 = 0; d2 < nDays; d2++) {
          cum += ws[d2];
          const rounded = Math.round((total * cum) / wSum);
          out.push({ t: mStart.getTime() + d2 * MS, v: rounded - prevRound });
          prevRound = rounded;
        }
      }
      dayCache.current[ck] = out;
    }
    return dayCache.current[ck];
  };
  const sumDays = (M, ns, key, get, from, to) =>
    dailyOf(M, ns, key, get).reduce((n, d2) => (d2.t >= from.getTime() && d2.t <= to.getTime() ? n + d2.v : n), 0);
  const rSumD = (key, get) => sumDays(data.months, project.id, key, get, startD, endD);
  const rPrevD = (key, get) => (hasPrev ? sumDays(data.months, project.id, key, get, prevStartD, prevEndD) : null);
  /* deep day-window sum for the multi-metric profile sections */
  const sumWindow = (M, ns, from, to) => {
    const build = (node, pathArr) => {
      const out2 = {};
      Object.keys(node).forEach((k) => {
        const v = node[k];
        if (typeof v === "number") {
          const pth = [...pathArr, k];
          out2[k] = sumDays(M, ns, pth.join("."), (m) => pth.reduce((o, kk) => (o ? o[kk] : 0), m) || 0, from, to);
        } else if (v && typeof v === "object") out2[k] = build(v, [...pathArr, k]);
      });
      return out2;
    };
    return { ...build(M[12], []), label: "window" };
  };
  const fmtD2 = (d) => d.toLocaleDateString("en", { month: "short", day: "numeric" });
  const rangeLabel = `${fmtD2(startD)} – ${fmtD2(endD)}, ${endD.getFullYear()}`;
  const prevLabel = hasPrev ? `${fmtD2(prevStartD)} – ${fmtD2(prevEndD)}` : null;
  /* rank metrics are daily already — evaluate at the window ends */
  const daysAgoOf = (d) => Math.max(0, Math.round((todayD - d) / MS));
  const rankAvgAt = (d) => { const v = avgPosDaysAgo(tracking, daysAgoOf(d)); return v == null ? null : +v.toFixed(1); };
  const posAtD = (t, d) => t.positions[Math.max(0, t.positions.length - 1 - daysAgoOf(d))];
  const tierAtD = (n, d) => tracking.filter((t) => posAtD(t, d) <= n).length;
  /* month indices covering the window (section trend charts stay monthly) */
  const monthIdxOf = (d) => { let i = 0; for (let j = 0; j < 13; j++) if (MONTH_DATES[j].getTime() <= d.getTime()) i = j; return i; };
  const RA = monthIdxOf(startD), RB = monthIdxOf(endD);
  const RLEN = RB - RA + 1;
  const [showBrand, setShowBrand] = useState(true);
  const [brandPanel, setBrandPanel] = useState(false);
  const [saved, setSaved] = useState(null); // "report" | "template" toast
  const [brandMode, setBrandMode] = useState(wlBrand ? "wl" : "agency"); // "agency" | "wl" | "custom"
  const [customBrand, setCustomBrand] = useState({ name: "", logo: null });
  const [preparedFor, setPreparedFor] = useState(project.name);
  const [showCover, setShowCover] = useState(true);
  const [coverBusiness, setCoverBusiness] = useState(clientInfo?.companyName || project.name);
  const [coverAddress, setCoverAddress] = useState(clientInfo?.address || "");
  const [coverDuration, setCoverDuration] = useState(template === "work" ? new Date().toLocaleDateString("en", { month: "long", year: "numeric" }) : `${LABELS[0]} – ${LABELS[12]}`);
  const [coverBadge, setCoverBadge] = useState(template === "work" ? "Work Report" : "SEO Report");
  const [coverLogo, setCoverLogo] = useState(null); // overrides the project icon on the cover
  const brand = brandMode === "wl" && wlBrand ? wlBrand
    : brandMode === "custom" ? { name: customBrand.name || "Your brand", logo: customBrand.logo, accent }
    : agencyBrand;

  /* ---- data registries (each maps onto live project data) ---- */
  const TREND = {
    gbpViews: { label: "GBP profile views", get: (m) => m.gbp.views, show: project.integrations.gbp },
    gbpCalls: { label: "GBP phone calls", get: (m) => m.gbp.calls, show: project.integrations.gbp },
    gbpDirections: { label: "GBP direction requests", get: (m) => m.gbp.directions, show: project.integrations.gbp },
    gaUsers: { label: "GA4 website users", get: (m) => m.ga.users, show: project.integrations.ga },
    gaSessions: { label: "GA4 sessions", get: (m) => m.ga.sessions, show: project.integrations.ga },
    gaConversions: { label: "GA4 conversions", get: (m) => m.ga.conversions, show: project.integrations.ga },
    gscClicks: { label: "GSC search clicks", get: (m) => m.gsc.clicks, show: project.integrations.gsc },
    gscImpressions: { label: "GSC impressions", get: (m) => m.gsc.impressions, show: project.integrations.gsc },
    bingImpressions: { label: "Bing Places impressions", get: (m) => m.bing?.impressions || 0, show: project.integrations.bing },
    bingClicks: { label: "Bing Places clicks", get: (m) => m.bing?.clicks || 0, show: project.integrations.bing },
    bingCalls: { label: "Bing Places calls", get: (m) => m.bing?.calls || 0, show: project.integrations.bing },
    appleViews: { label: "Apple Maps place card views", get: (m) => m.apple?.views || 0, show: project.integrations.apple },
    appleCalls: { label: "Apple Maps call taps", get: (m) => m.apple?.calls || 0, show: project.integrations.apple },
    allProfileViews: {
      label: "All business profiles — combined views",
      get: (m) => (project.integrations.gbp ? m.gbp.views : 0) + (project.integrations.bing ? m.bing?.impressions || 0 : 0) + (project.integrations.apple ? m.apple?.views || 0 : 0),
      show: project.integrations.gbp || project.integrations.bing || project.integrations.apple,
    },
    avgRank: { label: "Avg. ranking position", get: (_, i) => { const v = avgPosDaysAgo(tracking, (12 - i) * 30); return v == null ? null : +v.toFixed(1); }, invert: true, show: tracking.length > 0 },
  };
  const BREAKDOWN = {
    channels: { label: "GA4 traffic channels", items: data.channels, show: project.integrations.ga },
    sources: { label: "GA4 traffic sources", items: data.sources.map((x) => ({ name: x.name, value: x.series[12] })), show: project.integrations.ga },
    platformDevice: {
      label: "GBP views by platform & device", show: project.integrations.gbp,
      items: [
        { name: "Search · Mobile", value: data.months[12].gbp.searchMobile },
        { name: "Search · Desktop", value: data.months[12].gbp.searchDesktop },
        { name: "Maps · Mobile", value: data.months[12].gbp.mapsMobile },
        { name: "Maps · Desktop", value: data.months[12].gbp.mapsDesktop },
      ],
    },
    profilesSplit: {
      label: "Views by business profile (Google · Bing · Apple)",
      show: (project.integrations.gbp ? 1 : 0) + (project.integrations.bing ? 1 : 0) + (project.integrations.apple ? 1 : 0) >= 2,
      items: [
        project.integrations.gbp && { name: "Google Business Profile", value: data.months[12].gbp.views },
        project.integrations.bing && { name: "Bing Places", value: data.months[12].bing?.impressions || 0 },
        project.integrations.apple && { name: "Apple Maps", value: data.months[12].apple?.views || 0 },
      ].filter(Boolean),
    },
    bingActions: {
      label: "Bing Places customer actions", show: project.integrations.bing,
      items: [
        { name: "Clicks", value: data.months[12].bing?.clicks || 0 },
        { name: "Calls", value: data.months[12].bing?.calls || 0 },
        { name: "Directions", value: data.months[12].bing?.directions || 0 },
      ],
    },
    appleTaps: {
      label: "Apple Maps taps breakdown", show: project.integrations.apple,
      items: [
        { name: "Call taps", value: data.months[12].apple?.calls || 0 },
        { name: "Direction taps", value: data.months[12].apple?.directions || 0 },
        { name: "Website taps", value: data.months[12].apple?.websiteTaps || 0 },
      ],
    },
    rankDist: {
      label: "Ranking distribution", show: tracking.length > 0,
      items: [
        { name: "Top 3", value: tracking.filter((t) => t.stats.cur <= 3).length },
        { name: "4–10", value: tracking.filter((t) => t.stats.cur > 3 && t.stats.cur <= 10).length },
        { name: "11–20", value: tracking.filter((t) => t.stats.cur > 10 && t.stats.cur <= 20).length },
        { name: "21+", value: tracking.filter((t) => t.stats.cur > 20).length },
      ],
    },
  };
  const KPIS = (() => {
    const add = (key, label, src, get, show) => ({ label, src, val: () => rSumD(key, get), prev: () => rPrevD(key, get), show });
    return {
      gbpViews: add("gbpViews", "Profile views", "GBP", (m) => m.gbp.views, project.integrations.gbp),
      gbpCalls: add("gbpCalls", "Phone calls", "GBP", (m) => m.gbp.calls, project.integrations.gbp),
      gbpDirections: add("gbpDirections", "Directions", "GBP", (m) => m.gbp.directions, project.integrations.gbp),
      allProfileViews: add("allProfileViews", "Profile views (all profiles)", "ALL",
        (m) => (project.integrations.gbp ? m.gbp.views : 0) + (project.integrations.bing ? m.bing?.impressions || 0 : 0) + (project.integrations.apple ? m.apple?.views || 0 : 0),
        (project.integrations.bing || project.integrations.apple) && project.integrations.gbp),
      bingImpressions: add("bingImpressions", "Impressions", "BING", (m) => m.bing?.impressions || 0, project.integrations.bing),
      bingClicks: add("bingClicks", "Clicks", "BING", (m) => m.bing?.clicks || 0, project.integrations.bing),
      bingCalls: add("bingCalls", "Calls", "BING", (m) => m.bing?.calls || 0, project.integrations.bing),
      bingDirections: add("bingDirections", "Directions", "BING", (m) => m.bing?.directions || 0, project.integrations.bing),
      appleViews: add("appleViews", "Place card views", "APPLE", (m) => m.apple?.views || 0, project.integrations.apple),
      appleCalls: add("appleCalls", "Call taps", "APPLE", (m) => m.apple?.calls || 0, project.integrations.apple),
      appleDirections: add("appleDirections", "Direction taps", "APPLE", (m) => m.apple?.directions || 0, project.integrations.apple),
      appleWebsiteTaps: add("appleWebsiteTaps", "Website taps", "APPLE", (m) => m.apple?.websiteTaps || 0, project.integrations.apple),
      gaUsers: add("gaUsers", "Website users", "GA4", (m) => m.ga.users, project.integrations.ga),
      gaConversions: add("gaConversions", "Conversions", "GA4", (m) => m.ga.conversions, project.integrations.ga),
      gscClicks: add("gscClicks", "Search clicks", "GSC", (m) => m.gsc.clicks, project.integrations.gsc),
      avgRank: { label: "Avg. position", src: "Ranks", val: () => rankAvgAt(endD), prev: () => (hasPrev ? rankAvgAt(prevEndD) : null), invert: true, isRank: true, show: tracking.length > 0 },
      top3: { label: "Keywords in top 3", src: "Ranks", val: () => tierAtD(3, endD), prev: () => (hasPrev ? tierAtD(3, prevEndD) : null), show: tracking.length > 0 },
      top10: { label: "Keywords in top 10", src: "Ranks", val: () => tierAtD(10, endD), prev: () => (hasPrev ? tierAtD(10, prevEndD) : null), show: tracking.length > 0 },
      top20: { label: "Keywords in top 20", src: "Ranks", val: () => tierAtD(20, endD), prev: () => (hasPrev ? tierAtD(20, prevEndD) : null), show: tracking.length > 0 },
    };
  })();
  const TABLE_KINDS = {
    rank: { label: "Keyword rankings", show: tracking.length > 0 },
    gscQueries: { label: "GSC top queries", show: project.integrations.gsc },
    gbpTerms: { label: "GBP searches by keywords", show: project.integrations.gbp },
    events: { label: "GA4 event counts", show: project.integrations.ga },
    topPages: { label: "GA4 top landing pages", show: project.integrations.ga },
    opportunities: { label: "Keyword opportunities (striking distance)", show: project.integrations.gsc },
    citations: { label: "Business listing citations", show: !!project.opt?.branding?.listingScan },
  };

  /* ---- default report layout (fully editable from there) ---- */
  const [blocks, setBlocks] = useState(() => {
    if (initialBlocks) return initialBlocks.map((b) => ({ ...b, id: uid() }));
    if (template === "work") {
      const b = [
        { id: uid(), type: "heading", text: "Work summary", level: 2 },
        { id: uid(), type: "paragraph", text: aiSummary || `All work completed and in progress for ${project.name}: records, checklists and individual tasks with status, due dates and assignees.` },
      ];
      if (records.length) records.forEach((r) => b.push({ id: uid(), type: "work", recordId: r.id, excludedChecklists: [], excludedTasks: [] }));
      else b.push({ id: uid(), type: "paragraph", text: "No project records yet — create records in Project Management to include them here." });
      return b;
    }
    const b = [
      { id: uid(), type: "heading", text: "Executive summary", level: 2 },
      { id: uid(), type: "paragraph", text: aiSummary || `This report covers ${project.website} and compares the latest month against ${defaultCmp || 3} month(s) ago. Highlights: visibility, customer actions and local rankings all trend upward.` },
      { id: uid(), type: "kpis", metrics: ["allProfileViews", "gbpViews", "bingImpressions", "appleViews", "gaUsers", "gscClicks", "avgRank", "top3", "top10", "top20"].filter((k) => KPIS[k].show) },
    ];
    if (TREND.gbpViews.show) b.push({ id: uid(), type: "heading", text: "Visibility trend", level: 2 }, { id: uid(), type: "chart", mode: "trend", source: "gbpViews", chartType: "area", months: 13 });
    if (BREAKDOWN.sources.show) b.push({ id: uid(), type: "heading", text: "Where traffic comes from", level: 2 }, { id: uid(), type: "chart", mode: "breakdown", source: "sources", chartType: "pie" });
    if (TABLE_KINDS.rank.show) b.push({ id: uid(), type: "heading", text: "Local keyword rankings", level: 2 }, { id: uid(), type: "table", kind: "rank", limit: "10" });
    if ((project.ads?.campaigns || []).some((c) => c.status !== "draft"))
      b.push({ id: uid(), type: "heading", text: "Paid marketing performance", level: 2 }, { id: uid(), type: "adsReport", projectId: project.id, platform: "all", limit: "10" });
    return b;
  });
  const [openId, setOpenId] = useState(null);
  const [geoModal, setGeoModal] = useState(null); // { projectIds } — picking geo-grid report + keywords
  const [pickedProjIds, setPickedProjIds] = useState(() => new Set(clientProjects.map((cp) => cp.project.id)));
  const projOf = (id) => clientProjects.find((cp) => cp.project.id === id) || clientProjects.find((cp) => cp.project.id === project.id) || { project, data, tracking };

  const patch = (id, p) => setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...p } : b)));
  const remove = (id) => setBlocks((bs) => bs.filter((b) => b.id !== id));
  const duplicate = (id) => setBlocks((bs) => {
    const i = bs.findIndex((b) => b.id === id);
    return [...bs.slice(0, i + 1), { ...bs[i], id: uid() }, ...bs.slice(i + 1)];
  });
  const move = (id, dir) => setBlocks((bs) => {
    const i = bs.findIndex((b) => b.id === id);
    const j = i + dir;
    if (j < 0 || j >= bs.length) return bs;
    const n = [...bs]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });
  const [flashId, setFlashId] = useState(null);
  const revealBlock = (id) => {
    setFlashId(id);
    // wait for render + pagination, then bring the new section into view
    setTimeout(() => { blockRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" }); }, 180);
    setTimeout(() => setFlashId((f) => (f === id ? null : f)), 2200);
  };
  const add = (block) => { const b = { id: uid(), ...block }; setBlocks((bs) => [...bs, b]); setOpenId(b.id); revealBlock(b.id); };
  const addMany = (arr) => {
    const withIds = arr.map((x) => ({ id: uid(), ...x }));
    setBlocks((bs) => [...bs, ...withIds]);
    if (withIds.length) revealBlock(withIds[0].id);
  };

  /* ---- A4 pagination: measure every block, lay blocks out into real A4 pages.
     Each page carries the brand header + page number, so the editor is a true
     preview of the PDF and printing emits pages one-to-one. A block with
     pageBreak=true always starts a new page ("move to next page" toolbar btn). */
  /* 210mm at CSS 96dpi = 793.7px — the editor page and the printed page share
     the exact same pixel width, so print reflows NOTHING: identical wraps,
     identical chart widths, identical pagination. */
  const PAGE_W = 794;
  const PAGE_H = 1123;                                  // 297mm
  const HEADER_H = 74, FOOTER_H = 40, PAD_V = 48;
  const USABLE = PAGE_H - HEADER_H - FOOTER_H - PAD_V;  // per-page content budget
  const blockRefs = useRef({});
  const [measureTick, setMeasureTick] = useState(0);
  const roRef = useRef(null);
  if (!roRef.current && typeof ResizeObserver !== "undefined") {
    let t = null;
    roRef.current = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => setMeasureTick((x) => x + 1), 120); });
  }
  const attachBlockRef = (id) => (el) => {
    const prev = blockRefs.current[id];
    if (prev && roRef.current) roRef.current.unobserve(prev);
    blockRefs.current[id] = el;
    if (el && roRef.current) roRef.current.observe(el);
  };
  const pages = useMemo(() => {
    const out = [[]];
    let used = 90; // title block on page 1
    blocks.forEach((b) => {
      const h = (blockRefs.current[b.id]?.offsetHeight || 90) + 10;
      if ((b.pageBreak && out[out.length - 1].length > 0) || (used + h > USABLE && out[out.length - 1].length > 0)) {
        out.push([]); used = 0;
      }
      out[out.length - 1].push(b);
      used += h;
    });
    return out;
  }, [blocks, measureTick]); // eslint-disable-line

  /* the brand bar every page carries */
  const PageHeader = () => (
    <div className="flex items-center justify-between border-b px-8 pb-3 pt-5" style={{ borderColor: accent + "33" }}>
      <div className="flex items-center gap-2.5">
        <BrandMark name={brand.name} logo={brand.logo} accent={brand.accent || accent} />
        <div>
          <div className="ll-display text-[14px] font-bold leading-tight">{brand.name}</div>
          <div className="text-[10.5px] text-gray-400">{today}</div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-[10.5px] text-gray-400">Prepared for</div>
        <div className="text-[12.5px] font-semibold text-gray-700">{preparedFor}</div>
      </div>
    </div>
  );
  /* Download PDF = browser print-to-PDF, but the saved file is named after the
     report (document.title becomes the default filename), and the print CSS
     below forces A4 sizing + exact colors so the map grids render faithfully. */
  const downloadPdf = () => {
    setOpenId(null); // settings panels are editor-only; close so pagination matches the PDF
    const prev = document.title;
    document.title = (title || "report").replace(/[\\/:*?"<>|]+/g, " ").trim();
    const restore = () => { document.title = prev; window.removeEventListener("afterprint", restore); };
    window.addEventListener("afterprint", restore);
    setTimeout(() => window.print(), 60);
  };

  /* ---- block renderers ---- */
  const renderTrend = (b) => {
    const def = TREND[b.source] || TREND[Object.keys(TREND).find((k) => TREND[k].show)];
    const color = b.color || accent;
    /* short windows chart day-by-day; longer ones stay monthly (avgRank is daily-native) */
    const wA = RLEN === 1 ? Math.max(0, RA - 1) : RA;
    let rows;
    if (b.source === "avgRank" && lenDays <= 92) {
      rows = Array.from({ length: lenDays }, (_, i) => {
        const d2 = new Date(startD.getTime() + i * MS);
        const v = avgPosDaysAgo(tracking, daysAgoOf(d2));
        return { label: fmtD2(d2), value: v == null ? null : +v.toFixed(1) };
      });
    } else if (b.source !== "avgRank" && lenDays <= 45) {
      rows = dailyOf(data.months, project.id, "trend|" + b.source, (m, i) => def.get(m, i))
        .filter((d2) => d2.t >= startD.getTime() && d2.t <= endD.getTime())
        .map((d2) => ({ label: fmtD2(new Date(d2.t)), value: d2.v }));
    } else {
      rows = data.months.slice(wA, RB + 1).map((m, i) => ({ label: m.label, value: def.get(m, wA + i) }));
    }
    const grid = <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />;
    const xaxis = <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />;
    const yaxis = <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} reversed={!!def.invert} />;
    const tip = <Tooltip contentStyle={tooltipStyle} />;
    return (
      <div>
        <div className="mb-2 text-[13px] font-semibold text-gray-700">{b.title || def.label}</div>
        <ResponsiveContainer width="100%" height={230}>
          {b.chartType === "bar" ? (
            <BarChart data={rows} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              {grid}{xaxis}{yaxis}{tip}
              <Bar dataKey="value" name={def.label} fill={color} radius={[4, 4, 0, 0]} /></BarChart>
          ) : b.chartType === "line" ? (
            <LineChart data={rows} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              {grid}{xaxis}{yaxis}{tip}
              <Line type="monotone" dataKey="value" name={def.label} stroke={color} strokeWidth={2.2} dot={false} /></LineChart>
          ) : (
            <AreaChart data={rows} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              {grid}{xaxis}{yaxis}{tip}
              <Area type="monotone" dataKey="value" name={def.label} stroke={color} strokeWidth={2.2} fill={color} fillOpacity={0.15} /></AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    );
  };

  const renderBreakdown = (b) => {
    const def = BREAKDOWN[b.source] || BREAKDOWN[Object.keys(BREAKDOWN).find((k) => BREAKDOWN[k].show)];
    const color = b.color || accent;
    const shades = chartShades(color);
    return (
      <div>
        <div className="mb-2 text-[13px] font-semibold text-gray-700">{b.title || def.label}</div>
        {b.chartType === "bar" ? (
          <ResponsiveContainer width="100%" height={Math.max(140, def.items.length * 34)}>
            <BarChart data={def.items} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: "#6B7280" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill={color} radius={[0, 6, 6, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <ResponsiveContainer width={210} height={190}>
              <PieChart>
                <Pie data={def.items} dataKey="value" nameKey="name"
                  innerRadius={b.chartType === "donut" ? 48 : 0} outerRadius={80} paddingAngle={2}>
                  {def.items.map((_, i) => <Cell key={i} fill={shades[i % shades.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="min-w-40 flex-1 space-y-1.5">
              {def.items.map((it, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px] text-gray-600">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: shades[i % shades.length] }} />
                  {it.name}<span className="ll-mono ml-auto font-semibold text-gray-700">{fmt(it.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderKpis = (b) => {
    const metrics = (b.metrics || []).filter((k) => KPIS[k]?.show);
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {metrics.map((k) => {
          const d = KPIS[k];
          const v = d.val(), p = d.prev();
          return (
            <div key={k} className="rounded-xl border border-gray-200 p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11.5px] font-medium text-gray-500">{d.label}</span>
                <SourceTag label={d.src} />
              </div>
              <div className="ll-display text-[26px] font-semibold leading-none tracking-tight">{d.isRank ? "#" + v : fmt(v)}</div>
              <div className="mt-1"><Delta pct={pctDelta(v, p)} invert={d.invert} /> <span className="text-[10.5px] text-gray-400">vs prev. period</span></div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderTable = (b) => {
    const th = "px-3 py-2 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400 text-left";
    const td = "px-3 py-2 border-b border-gray-50";
    const cap = (arr) => (b.limit && b.limit !== "all" ? arr.slice(0, +b.limit) : arr);
    if (b.kind === "rank") return (
      <div>
        <table className="w-full text-[12.5px]">
          <thead><tr className="border-b border-gray-100"><th className={th}>Keyword</th><th className={th}>City</th><th className={th}>Start</th><th className={th}>Current</th><th className={th}>30d</th><th className={th}>Lifetime</th><th className={th}>Ranking URL</th></tr></thead>
          <tbody>{cap(tracking).map((t) => (
            <tr key={t.id}><td className={td + " font-medium"}>{t.keyword}</td><td className={td + " text-gray-500"}>{cityLabel(t.city)}</td>
              <td className={td}><RankChip pos={t.stats.start} muted /></td><td className={td}><RankChip pos={t.stats.cur} /></td>
              <td className={td}><PosChange value={t.stats.d30} /></td><td className={td}><PosChange value={t.stats.life} /></td>
              <td className={td + " max-w-40 truncate text-[11.5px]"} title={t.url}>
                <a href={t.url} target="_blank" rel="noopener noreferrer" className="ll-mono hover:underline" style={{ color: b.color || accent }}>{urlSlug(t.url)}</a></td></tr>
          ))}</tbody>
        </table>
        {b.limit && b.limit !== "all" && tracking.length > +b.limit && (
          <div className="pt-1.5 text-[10.5px] text-gray-400">Showing {b.limit} of {tracking.length} tracked keywords.</div>
        )}
      </div>
    );
    if (b.kind === "gscQueries") return (
      <table className="w-full text-[12.5px]">
        <thead><tr className="border-b border-gray-100"><th className={th}>Query</th><th className={th}>Clicks</th><th className={th}>Impressions</th><th className={th}>Position</th></tr></thead>
        <tbody>{cap(data.topQueries).map((q, i) => (
          <tr key={i}><td className={td + " font-medium"}>{q.query}</td><td className={td + " ll-mono"}>{fmt(q.clicks)}</td>
            <td className={td + " ll-mono"}>{fmt(q.impressions)}</td><td className={td}><RankChip pos={Math.round(q.position)} /></td></tr>
        ))}</tbody>
      </table>
    );
    if (b.kind === "gbpTerms") return (
      <table className="w-full text-[12.5px]">
        <thead><tr className="border-b border-gray-100"><th className={th}>Search term</th><th className={th}>Impressions</th><th className={th}>vs {c}mo</th></tr></thead>
        <tbody>{cap(data.gbpTerms).map((t, i) => (
          <tr key={i}><td className={td + " font-medium"}>{t.term}</td><td className={td + " ll-mono"}>{fmt(t.impressions)}</td>
            <td className={td}><Delta pct={pctDelta(t.impressions, t.prev(c))} /></td></tr>
        ))}</tbody>
      </table>
    );
    if (b.kind === "opportunities") {
      const kws = [...new Set(project.tracking.map((t) => t.keyword))];
      const pages = project.opt?.website?.pages?.length
        ? project.opt.website.pages.map((pg) => pg.origUrl || pg.url)
        : data.topPages.map((tp) => tp.page);
      const opps = pages.flatMap((url) => {
        const { queries } = genPageQueries(project.id, url, kws, project.name);
        return queries.filter((q) => q.position > 3 && q.position <= 25).map((q) => ({ url, ...q }));
      }).sort((x, y) => y.score - x.score);
      return (
        <table className="w-full text-[12.5px]">
          <thead><tr className="border-b border-gray-100"><th className={th}>Keyword</th><th className={th}>Page</th><th className={th}>Position</th><th className={th}>Impressions</th><th className={th}>Clicks</th><th className={th}>Opportunity</th></tr></thead>
          <tbody>{cap(opps).map((o, i) => {
            const lvl = o.score >= 90 ? "high" : o.score >= 35 ? "medium" : "low";
            return (
              <tr key={i}><td className={td + " font-medium"}>{o.query}</td><td className={td + " ll-mono text-[11px] text-gray-500"}>{o.url}</td>
                <td className={td}><RankChip pos={Math.round(o.position)} /></td><td className={td + " ll-mono"}>{fmt(o.impressions)}</td><td className={td + " ll-mono"}>{o.clicks}</td>
                <td className={td}><span className="rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase" style={{ background: OPP_STYLE[lvl].bg, color: OPP_STYLE[lvl].fg }}>{OPP_STYLE[lvl].label}</span></td></tr>
            );
          })}</tbody>
        </table>
      );
    }
    if (b.kind === "citations") {
      const scan = project.opt?.branding?.listingScan;
      if (!scan) return <div className="py-3 text-[12px] text-gray-400">No citation scan yet — run the Business Listings scanner first.</div>;
      const rows = Object.entries(scan.results).sort(([, x], [, y]) => (x.status === "found" ? 0 : 1) - (y.status === "found" ? 0 : 1) || (y.da || 0) - (x.da || 0));
      return (
        <div>
          <div className="mb-2 flex items-center gap-3 text-[12px]">
            <span className="ll-display rounded-lg px-2.5 py-1 text-[13px] font-bold text-white" style={{ background: scan.score >= 70 ? "#16A34A" : scan.score >= 45 ? "#D97706" : "#DC2626" }}>{scan.score}</span>
            <span className="font-semibold text-gray-700">Citation health</span>
            <span className="text-gray-400">{scan.found} found · {scan.missing} missing · {scan.napIssues} NAP issue{scan.napIssues === 1 ? "" : "s"}{scan.live ? "" : " · demo data"}</span>
          </div>
          <table className="w-full text-[12.5px]">
            <thead><tr className="border-b border-gray-100"><th className={th}>Directory</th><th className={th}>DA</th><th className={th}>Status</th><th className={th}>Listing</th></tr></thead>
            <tbody>{cap(rows).map(([name, r]) => (
              <tr key={name}><td className={td + " font-medium"}>{name}</td><td className={td + " ll-mono"}>{r.da || "—"}</td>
                <td className={td}><span className="rounded-full px-1.5 py-px text-[8.5px] font-bold uppercase" style={r.status === "found" ? { background: "#DCFCE7", color: "#166534" } : { background: "#FEF3C7", color: "#92400E" }}>{r.status}</span></td>
                <td className={td + " ll-mono max-w-56 truncate text-[10.5px] text-gray-500"}>{r.url || "—"}</td></tr>
            ))}</tbody>
          </table>
        </div>
      );
    }
    if (b.kind === "events") return (
      <table className="w-full text-[12.5px]">
        <thead><tr className="border-b border-gray-100"><th className={th}>Event name</th><th className={th}>Count</th><th className={th}>vs {c}mo</th></tr></thead>
        <tbody>{cap(data.events).map((e, i) => (
          <tr key={i}><td className={td + " ll-mono"}>{e.name}</td><td className={td + " ll-mono font-semibold"}>{fmt(e.series[12])}</td>
            <td className={td}><Delta pct={pctDelta(e.series[12], e.series[12 - c])} /></td></tr>
        ))}</tbody>
      </table>
    );
    return (
      <table className="w-full text-[12.5px]">
        <thead><tr className="border-b border-gray-100"><th className={th}>Page</th><th className={th}>Users</th><th className={th}>Conversions</th></tr></thead>
        <tbody>{cap(data.topPages).map((p, i) => (
          <tr key={i}><td className={td + " ll-mono"}>{project.website}{p.page === "/" ? "" : p.page}</td>
            <td className={td + " ll-mono"}>{fmt(p.users)}</td><td className={td + " ll-mono"}>{fmt(p.conversions)}</td></tr>
        ))}</tbody>
      </table>
    );
  };

  const renderCustomTable = (b) => {
    const rows = parsePasted(b.raw || "");
    if (!rows.length) return <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-[12px] text-gray-400">Open this block's settings and paste cells copied from Excel or Google Sheets.</div>;
    const head = b.hasHeader ? rows[0] : null;
    const body = b.hasHeader ? rows.slice(1) : rows;
    return (
      <div>
        {b.title && <div className="mb-2 text-[13px] font-semibold text-gray-700">{b.title}</div>}
        <table className="w-full text-[12.5px]">
          {head && (
            <thead><tr className="border-b border-gray-100">
              {head.map((h, i) => <th key={i} className="px-3 py-2 text-left text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">{h}</th>)}
            </tr></thead>
          )}
          <tbody>{body.map((r, i) => (
            <tr key={i}>{r.map((cell, j) => <td key={j} className="border-b border-gray-50 px-3 py-2">{cell}</td>)}</tr>
          ))}</tbody>
        </table>
      </div>
    );
  };

  /* ---- multi-project sections (one client, many locations) ---- */
  const PROFILE_META = {
    bing: { label: "Bing Places", tag: "Bing Places", color: "#008373",
      kpis: (m) => [["Impressions", m.bing?.impressions || 0], ["Clicks", m.bing?.clicks || 0], ["Calls", m.bing?.calls || 0], ["Directions", m.bing?.directions || 0]],
      series: (m) => ({ label: m.label, Impressions: m.bing?.impressions || 0, Clicks: m.bing?.clicks || 0 }), lines: ["Impressions", "Clicks"] },
    apple: { label: "Apple Maps", tag: "Apple Maps", color: "#111827",
      kpis: (m) => [["Place card views", m.apple?.views || 0], ["Call taps", m.apple?.calls || 0], ["Direction taps", m.apple?.directions || 0], ["Website taps", m.apple?.websiteTaps || 0]],
      series: (m) => ({ label: m.label, Views: m.apple?.views || 0 }), lines: ["Views"] },
  };
  const renderProfileReport = (b, kind) => {
    const cp = projOf(b.projectId);
    const color = b.color || PROFILE_META[kind].color;
    const M = cp.data.months;
    const cur = sumWindow(M, cp.project.id, startD, endD);
    const prev = hasPrev ? sumWindow(M, cp.project.id, prevStartD, prevEndD) : null;
    const meta = PROFILE_META[kind];
    const kNow = meta.kpis(cur), kPrev = prev ? meta.kpis(prev) : null;
    const wA = RLEN === 1 ? Math.max(0, RA - 1) : RA;
    const series = M.slice(wA, RB + 1).map(meta.series);
    return (
      <div>
        <div className="mb-3 flex items-center justify-between border-b pb-2" style={{ borderColor: color + "33" }}>
          <div className="flex items-center gap-2"><ProjectMark project={cp.project} />
            <div><div className="ll-display text-[15px] font-semibold leading-tight">{cp.project.name}</div><div className="text-[10.5px] text-gray-400">{cp.project.website}</div></div>
          </div>
          <SourceTag label={meta.tag} />
        </div>
        <div className="mb-3 grid grid-cols-4 gap-2.5">
          {kNow.map(([label, v], i) => (
            <div key={i} className="rounded-xl border border-gray-200 p-2.5">
              <div className="text-[10.5px] font-medium text-gray-400">{label}</div>
              <div className="ll-display text-[22px] font-semibold leading-tight tracking-tight">{fmt(v)}</div>
              {kPrev && <Delta pct={pctDelta(v, kPrev[i][1])} />}
            </div>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={170}>
          <AreaChart data={series} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            {meta.lines.map((ln, i) => <Area key={ln} type="monotone" dataKey={ln} stackId={i} stroke={i ? "#94A3B8" : color} fill={i ? "#CBD5E1" : color} fillOpacity={0.5} />)}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  };

  /* geo-grid section: a report's snapshot (or before/after) for chosen keywords */
  const renderGeoReport = (b) => {
    const cp = projOf(b.projectId);
    const color = b.color || accent;
    const geo = cp.project.geoGrid || {};
    const report = (geo.reports || []).find((r) => r.id === b.reportId) || (geo.reports || [])[0];
    if (!report || !report.snapshots?.length) return <div className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-700">No geo-grid snapshots for this project yet — run a scan in GBP Rank Tracking.</div>;
    const snaps = report.snapshots;
    const cur = snaps.find((s2) => s2.id === b.snapId) || snaps[0];
    const base = b.baseId ? snaps.find((s2) => s2.id === b.baseId) : (b.mode === "change" ? snaps.find((s2) => s2.at < cur.at) : null);
    const bizName = geo.business?.name || cp.project.name;
    const bizLoc = isFinite(geo.business?.lat) && isFinite(geo.business?.lng) ? geo.business : cp.project.opt?.gbp;
    const center = isFinite(bizLoc?.lat) && isFinite(bizLoc?.lng) ? { lat: +bizLoc.lat, lng: +bizLoc.lng } : null;
    /* live scans (and demo scans with a located business) store lat/lng per grid
       point — derive the map center from the middle point when the business
       record itself lacks coordinates, so the map background still renders */
    const centerFor = (points) => {
      if (center) return center;
      const half = (report.size - 1) / 2;
      const mid = points?.find((pt) => pt.row === half && pt.col === half && isFinite(pt.lat) && pt.lat != null)
        || points?.find((pt) => isFinite(pt.lat) && pt.lat != null);
      return mid ? { lat: +mid.lat, lng: +mid.lng } : null;
    };
    const kws = (b.keywords && b.keywords.length ? b.keywords : report.keywords).filter((k) => cur.grids[k]);
    const dateStr = (sn) => new Date(sn.at).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
    const compare = b.mode === "compare" && base;
    return (
      <div>
        <div className="mb-3 flex items-center justify-between border-b pb-2" style={{ borderColor: color + "33" }}>
          <div className="flex min-w-0 flex-1 items-center gap-2"><ProjectMark project={cp.project} />
            <div className="min-w-0 flex-1">
              <input value={b.title ?? report.name} onChange={(e) => patch(b.id, { title: e.target.value })}
                className="ll-display w-full border-0 bg-transparent text-[15px] font-semibold leading-tight outline-none focus:bg-gray-50" />
              <div className="text-[10.5px] text-gray-400">{bizName} · {report.size}×{report.size} grid · {compare ? `${dateStr(base)} → ${dateStr(cur)}` : dateStr(cur)}{cur.live ? "" : " · demo"}</div></div>
          </div>
          <SourceTag label="GBP Geo-Grid" />
        </div>
        <div className="space-y-4">
          {kws.map((kw) => {
            const pts = cur.grids[kw];
            const m = gridMetrics(pts);
            const basePts = base?.grids[kw];
            const bm = basePts ? gridMetrics(basePts) : null;
            const dChip = (c2, p2, invert) => {
              if (bm == null || c2 == null || p2 == null) return null;
              const d = p2 - c2; if (Math.abs(d) < 0.05) return null;
              const good = invert ? d < 0 : d > 0;
              return <span className="ll-mono ml-1 text-[10px] font-bold" style={{ color: good ? "#16A34A" : "#DC2626" }}>{d > 0 ? "▲" : "▼"}{Math.abs(d).toFixed(1)}</span>;
            };
            return (
              <div key={kw} className="gg-page rounded-xl border border-gray-100 p-3">
                <div className="mb-1.5 flex flex-wrap items-center gap-4">
                  <span className="text-[13.5px] font-semibold text-gray-800">"{kw}"</span>
                  <span className="text-[11.5px] text-gray-500">ARP <b className="ll-mono">{m.arp != null ? "#" + m.arp.toFixed(1) : "—"}</b>{dChip(m.arp, bm?.arp, false)}</span>
                  <span className="text-[11.5px] text-gray-500">SoLV <b className="ll-mono">{m.solv.toFixed(0)}%</b>{dChip(m.solv, bm?.solv, true) && <span className="ll-mono ml-1 text-[10px] font-bold" style={{ color: (m.solv - bm.solv) >= 0 ? "#16A34A" : "#DC2626" }}>{(m.solv - bm.solv) >= 0 ? "▲" : "▼"}{Math.abs(m.solv - bm.solv).toFixed(0)}</span>}</span>
                  <span className="text-[11.5px] text-gray-500">Coverage <b className="ll-mono">{m.coverage.toFixed(0)}%</b></span>
                </div>
                {compare ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Before — {dateStr(base)}</div>
                      <ReportGridMap center={centerFor(basePts)} points={basePts} size={base.size} spacingKm={base.spacingKm} px={300} />
                      <div className="mt-2"><Distribution points={basePts} compact /></div>
                    </div>
                    <div>
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">After — {dateStr(cur)}</div>
                      <ReportGridMap center={centerFor(pts)} points={pts} size={cur.size} spacingKm={cur.spacingKm} prevPoints={basePts} px={300} />
                      <div className="mt-2"><Distribution points={pts} compact /></div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start gap-4">
                    <ReportGridMap center={centerFor(pts)} points={pts} size={cur.size} spacingKm={cur.spacingKm} prevPoints={base?.grids[kw]} px={340} />
                    <div className="pt-2"><Distribution points={pts} />
                      {base && <div className="mt-2 text-[10px] text-gray-400">change badges vs {dateStr(base)}</div>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderGbpReport = (b) => {
    const cp = projOf(b.projectId);
    const color = b.color || accent;
    const M = cp.data.months;
    const cur = sumWindow(M, cp.project.id, startD, endD);
    const prev = hasPrev ? sumWindow(M, cp.project.id, prevStartD, prevEndD) : null;
    const kpis = [
      ["Profile views", cur.gbp.views, prev?.gbp.views],
      ["Calls", cur.gbp.calls, prev?.gbp.calls],
      ["Directions", cur.gbp.directions, prev?.gbp.directions],
      ["Website clicks", cur.gbp.websiteClicks, prev?.gbp.websiteClicks],
    ];
    const wA = RLEN === 1 ? Math.max(0, RA - 1) : RA;
    const breakdown = M.slice(wA, RB + 1).map((m) => ({ label: m.label, Search: m.gbp.searchViews, Maps: m.gbp.mapViews }));
    /* searches-by-keywords scaled to the window, delta vs the previous period */
    const svNow = M[12].gbp.searchViews || 1;
    const termScale = cur.gbp.searchViews / svNow;
    const termCmp = Math.max(1, Math.min(12, Math.round(lenDays / 30)));
    return (
      <div>
        <div className="mb-3 flex items-center justify-between border-b pb-2" style={{ borderColor: color + "33" }}>
          <div className="flex items-center gap-2">
            <ProjectMark project={cp.project} />
            <div>
              <div className="ll-display text-[15px] font-semibold leading-tight">{cp.project.name}</div>
              <div className="text-[10.5px] text-gray-400">{cp.project.website}</div>
            </div>
          </div>
          <SourceTag label="Google Business Profile" />
        </div>
        <div className="mb-3 grid grid-cols-4 gap-2.5">
          {kpis.map(([label, v, p], i) => (
            <div key={i} className="rounded-xl border border-gray-200 p-2.5">
              <div className="text-[10.5px] font-medium text-gray-400">{label}</div>
              <div className="ll-display text-[22px] font-semibold leading-tight tracking-tight">{fmt(v)}</div>
              <Delta pct={pctDelta(v, p)} />
            </div>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={170}>
          <AreaChart data={breakdown} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area type="monotone" dataKey="Search" stackId="1" stroke={color} fill={color} fillOpacity={0.5} />
            <Area type="monotone" dataKey="Maps" stackId="1" stroke="#94A3B8" fill="#CBD5E1" fillOpacity={0.6} />
          </AreaChart>
        </ResponsiveContainer>
        {b.showTerms !== false && (
          <table className="mt-2 w-full text-[12px]">
            <thead><tr className="border-b border-gray-100">
              <th className="px-3 py-1.5 text-left text-[9px] font-semibold uppercase tracking-wider text-gray-400">Top search terms</th>
              <th className="px-3 py-1.5 text-left text-[9px] font-semibold uppercase tracking-wider text-gray-400">Impressions</th>
              <th className="px-3 py-1.5 text-left text-[9px] font-semibold uppercase tracking-wider text-gray-400">vs prev. period</th>
            </tr></thead>
            <tbody>{cp.data.gbpTerms.slice(0, 5).map((t, i) => (
              <tr key={i}><td className="border-b border-gray-50 px-3 py-1.5 font-medium">{t.term}</td>
                <td className="ll-mono border-b border-gray-50 px-3 py-1.5">{fmt(Math.max(1, Math.round(t.impressions * termScale)))}</td>
                <td className="border-b border-gray-50 px-3 py-1.5">{hasPrev ? <Delta pct={pctDelta(t.impressions, t.prev(termCmp))} /> : <span className="text-[10px] text-gray-300">—</span>}</td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
    );
  };

  const renderRankReport = (b) => {
    const cp = projOf(b.projectId);
    const tr = cp.tracking;
    const color = b.color || accent;
    const rows = b.limit && b.limit !== "all" ? tr.slice(0, +b.limit) : tr;
    const avg = tr.length ? tr.reduce((x, t) => x + t.stats.cur, 0) / tr.length : 0;
    const tier = (n) => tr.filter((t) => t.stats.cur <= n).length;
    const chips = [["Avg. position", tr.length ? "#" + avg.toFixed(1) : "–"], ["Top 3", tier(3)], ["Top 10", tier(10)], ["Top 20", tier(20)]];
    const th = "px-3 py-1.5 text-left text-[9px] font-semibold uppercase tracking-wider text-gray-400";
    const td = "border-b border-gray-50 px-3 py-1.5";
    return (
      <div>
        <div className="mb-3 flex items-center justify-between border-b pb-2" style={{ borderColor: color + "33" }}>
          <div className="flex items-center gap-2">
            <ProjectMark project={cp.project} />
            <div>
              <div className="ll-display text-[15px] font-semibold leading-tight">{cp.project.name}</div>
              <div className="text-[10.5px] text-gray-400">{[...new Set(tr.map((t) => cityLabel(t.city)))].join(" · ") || cp.project.website}</div>
            </div>
          </div>
          <SourceTag label="Keyword rankings" />
        </div>
        <div className="mb-3 grid grid-cols-4 gap-2.5">
          {chips.map(([label, v], i) => (
            <div key={i} className="rounded-xl border border-gray-200 p-2.5 text-center">
              <div className="text-[10.5px] font-medium text-gray-400">{label}</div>
              <div className="ll-display text-[22px] font-semibold tracking-tight">{v}</div>
            </div>
          ))}
        </div>
        <table className="w-full text-[12px]">
          <thead><tr className="border-b border-gray-100">
            <th className={th}>Keyword</th><th className={th}>City</th><th className={th}>Start</th>
            <th className={th}>Current</th><th className={th}>30d</th><th className={th}>Lifetime</th><th className={th}>URL</th>
          </tr></thead>
          <tbody>{rows.map((t) => (
            <tr key={t.id}><td className={td + " font-medium"}>{t.keyword}</td><td className={td + " text-gray-500"}>{cityLabel(t.city)}</td>
              <td className={td}><RankChip pos={t.stats.start} muted /></td><td className={td}><RankChip pos={t.stats.cur} /></td>
              <td className={td}><PosChange value={t.stats.d30} /></td><td className={td}><PosChange value={t.stats.life} /></td>
              <td className={td + " max-w-32 truncate"} title={t.url}>
                <a href={t.url} target="_blank" rel="noopener noreferrer" className="ll-mono hover:underline" style={{ color: color }}>{urlSlug(t.url)}</a></td></tr>
          ))}</tbody>
        </table>
        {b.limit && b.limit !== "all" && tr.length > +b.limit && (
          <div className="pt-1.5 text-[10px] text-gray-400">Showing {b.limit} of {tr.length} tracked keywords.</div>
        )}
      </div>
    );
  };

  /* ads performance: campaign results for the report's date window, with
     previous-period deltas — same metric set as the Ads dashboards */
  const renderAdsReport = (b) => {
    const cp = projOf(b.projectId);
    const color = b.color || accent;
    const campaigns = (cp.project.ads?.campaigns || []).filter((c) => c.status !== "draft" && (!b.platform || b.platform === "all" || c.platform === b.platform));
    if (!campaigns.length) return <div className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-700">No ad campaigns for this project yet — launch them in Ads & Paid Marketing.</div>;
    const inWin = (rows, from, to) => rows.filter((d) => d.t >= from.getTime() && d.t <= to.getTime());
    const cur = sumMetrics(campaigns.flatMap((c) => inWin(campaignDaily(c), startD, endD)));
    const prev = hasPrev ? sumMetrics(campaigns.flatMap((c) => inWin(campaignDaily(c), prevStartD, prevEndD))) : null;
    const money = (v) => "$" + (v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(v < 10 ? 2 : 0));
    const anyDemo = campaigns.some((c) => c.demo !== false);
    const kpis = [
      ["Spend", money(cur.spend), prev?.spend, cur.spend],
      ["Impressions", fmt(cur.impressions), prev?.impressions, cur.impressions],
      ["Clicks", fmt(cur.clicks), prev?.clicks, cur.clicks],
      ["CTR", cur.ctr.toFixed(2) + "%", prev?.ctr, cur.ctr],
      ["Avg CPC", money(cur.cpc), prev?.cpc, cur.cpc, true],
      ["Conversions", fmt(cur.conversions), prev?.conversions, cur.conversions],
      ["Cost / conv.", cur.conversions ? money(cur.cpl) : "—", prev?.cpl, cur.cpl, true],
    ];
    const th = "px-3 py-1.5 text-left text-[9px] font-semibold uppercase tracking-wider text-gray-400";
    const td = "border-b border-gray-50 px-3 py-1.5";
    const rows = (b.limit && b.limit !== "all" ? campaigns.slice(0, +b.limit) : campaigns);
    return (
      <div>
        <div className="mb-3 flex items-center justify-between border-b pb-2" style={{ borderColor: color + "33" }}>
          <div className="flex items-center gap-2">
            <ProjectMark project={cp.project} />
            <div>
              <div className="ll-display text-[15px] font-semibold leading-tight">{cp.project.name}</div>
              <div className="text-[10.5px] text-gray-400">Paid marketing · {rangeLabel}{anyDemo ? " · demo" : ""}</div>
            </div>
          </div>
          <SourceTag label={b.platform && b.platform !== "all" ? AD_PLATFORMS[b.platform].label : "All ad platforms"} />
        </div>
        {/* one horizontal row — all seven boxes share the width, no dead space */}
        <div className="mb-3 grid grid-cols-7 gap-1.5">
          {kpis.map(([label, v, p, raw, invert]) => (
            <div key={label} className="min-w-0 rounded-lg border border-gray-200 px-1.5 py-2 text-center">
              <div className="truncate text-[8px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
              <div className="ll-display truncate text-[14px] font-semibold leading-tight tracking-tight">{v}</div>
              {prev != null && p != null && p > 0 && <div className="mt-0.5 text-[9px]"><Delta pct={pctDelta(raw, p)} invert={!!invert} /></div>}
            </div>
          ))}
        </div>
        {b.showTable !== false && (
          <table className="w-full text-[12px]">
            <thead><tr className="border-b border-gray-100">
              <th className={th}>Campaign</th><th className={th}>Status</th><th className={th}>Spend</th><th className={th}>Impr.</th>
              <th className={th}>Clicks</th><th className={th}>CTR</th><th className={th}>Conv.</th><th className={th}>Cost/conv.</th>
            </tr></thead>
            <tbody>{rows.map((c) => {
              const m = sumMetrics(inWin(campaignDaily(c), startD, endD));
              return (
                <tr key={c.id}>
                  <td className={td}>
                    <span className="flex items-center gap-1.5"><PfBadge pf={c.platform} size={16} />
                      <span className="max-w-52 truncate font-medium">{c.name}</span>
                      {c.demo !== false && <span className="rounded bg-amber-100 px-1 py-px text-[7px] font-bold uppercase text-amber-700">demo</span>}
                    </span>
                  </td>
                  <td className={td + " text-[10px] uppercase text-gray-500"}>{c.status}</td>
                  <td className={td + " ll-mono font-semibold"}>{money(m.spend)}</td>
                  <td className={td + " ll-mono"}>{fmt(m.impressions)}</td>
                  <td className={td + " ll-mono"}>{fmt(m.clicks)}</td>
                  <td className={td + " ll-mono"}>{m.ctr.toFixed(2)}%</td>
                  <td className={td + " ll-mono"}>{fmt(m.conversions)}</td>
                  <td className={td + " ll-mono"}>{m.conversions ? money(m.cpl) : "—"}</td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
        {b.limit && b.limit !== "all" && campaigns.length > +b.limit && (
          <div className="pt-1.5 text-[10px] text-gray-400">Showing {b.limit} of {campaigns.length} campaigns.</div>
        )}
      </div>
    );
  };

  const renderWork = (b) => {
    const rec = records.find((r) => r.id === b.recordId);
    if (!rec) return <div className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-[12px] text-gray-400">Pick a record in this block's settings.</div>;
    const exCl = new Set(b.excludedChecklists || []);
    const exT = new Set(b.excludedTasks || []);
    /* reports only ever show finished work: incomplete tasks never render */
    const totals = rec.checklists.flatMap((c) => c.tasks);
    const cls = rec.checklists.filter((c) => !exCl.has(c.id))
      .map((c) => ({ ...c, total: c.tasks.length, tasks: c.tasks.filter((t) => !exT.has(t.id) && t.completedAt) }))
      .filter((c) => c.tasks.length > 0);
    /* the report shows ONLY checklists and their finished tasks — no record
       name, status, dates or progress bar (add a heading block for context) */
    return (
      <div className="rounded-xl border border-gray-100 p-4">
        <div className="space-y-3">
          {cls.map((c) => (
            <div key={c.id}>
              <div className="mb-1 text-[13px] font-semibold text-gray-800">{linkify(c.name)}</div>
              {/* clean client-facing list: just the finished task names — no
                  strikethrough, no assignees or dates */}
              <div className="space-y-1">
                {c.tasks.map((t) => (
                  <div key={t.id} className="flex items-start gap-2 border-b border-gray-50 py-1.5">
                    <span className="mt-0.5 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded border-2"
                      style={{ background: POS, borderColor: POS, color: "#fff" }}>
                      <CheckCircle2 size={10} strokeWidth={3.5} />
                    </span>
                    <span className="text-[12.5px] font-medium text-gray-800">{linkify(t.title)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {cls.length === 0 && <div className="py-3 text-center text-[12px] text-gray-300">No completed tasks in this record yet — only finished work appears in reports.</div>}
        </div>
      </div>
    );
  };

  const renderBlock = (b) => {
    switch (b.type) {
      case "heading": return b.level === 1
        ? <input value={b.text} onChange={(e) => patch(b.id, { text: e.target.value })} placeholder="Heading"
            className="ll-display w-full border-0 bg-transparent text-[26px] font-bold tracking-tight outline-none" style={{ color: accent }} />
        : <div className="border-b-2 pb-1" style={{ borderColor: accent + "33" }}>
            <input value={b.text} onChange={(e) => patch(b.id, { text: e.target.value })} placeholder="Heading"
              className="ll-display w-full border-0 bg-transparent text-[18px] font-semibold outline-none" />
          </div>;
      case "paragraph": return (
        <textarea value={b.text} onChange={(e) => patch(b.id, { text: e.target.value })}
          placeholder="Write your summary or notes here…"
          rows={Math.max(2, (b.text || "").split("\n").length + Math.ceil((b.text || "").length / 95))}
          className="w-full resize-none border-0 bg-transparent text-[13.5px] leading-relaxed text-gray-600 outline-none" />
      );
      case "divider": return <hr className="border-gray-200" />;
      case "kpis": return renderKpis(b);
      case "chart": return b.mode === "trend" ? renderTrend(b) : renderBreakdown(b);
      case "table": return <div>{b.title && <div className="mb-2 text-[13px] font-semibold text-gray-700">{b.title}</div>}{renderTable(b)}</div>;
      case "customTable": return renderCustomTable(b);
      case "gbpReport": return renderGbpReport(b);
      case "bingReport": return renderProfileReport(b, "bing");
      case "appleReport": return renderProfileReport(b, "apple");
      case "rankReport": return renderRankReport(b);
      case "geoReport": return renderGeoReport(b);
      case "adsReport": return renderAdsReport(b);
      case "work": return renderWork(b);
      default: return null;
    }
  };

  /* ---- per-block settings panel ---- */
  const cmpSelect = () => null; // per-block compare retired — the Report Date Range drives every delta
;
  const colorPick = (b) => (
    <Labeled label="Color">
      <div className="flex items-center gap-1.5">
        {[...new Set([accent, ...ACCENTS.map((a) => a.hex)])].slice(0, 6).map((hx) => (
          <button key={hx} onClick={() => patch(b.id, { color: hx === accent ? null : hx })}
            className="h-6 w-6 rounded-full border-2"
            style={{ background: hx, borderColor: (b.color || accent) === hx ? "#18202F" : "transparent" }} />
        ))}
        <input type="color" value={b.color || accent} onChange={(e) => patch(b.id, { color: e.target.value })} className="h-6 w-8 cursor-pointer rounded border border-gray-200" />
      </div>
    </Labeled>
  );

  const renderSettings = (b) => {
    if (b.type === "geoReport") {
      const cp = projOf(b.projectId);
      const reports = cp.project.geoGrid?.reports || [];
      const report = reports.find((r) => r.id === b.reportId) || reports[0];
      const snaps = report?.snapshots || [];
      const kwList = report?.keywords || [];
      const selKw = b.keywords && b.keywords.length ? b.keywords : kwList;
      return (
        <div className="space-y-3">
          <Labeled label="Geo-grid report">
            <select value={b.reportId || report?.id || ""} onChange={(e) => patch(b.id, { reportId: e.target.value, snapId: undefined, baseId: undefined, keywords: undefined })} className={inputCls}>
              {reports.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.snapshots.length} snapshots)</option>)}
            </select>
          </Labeled>
          <Labeled label="What to show">
            <Seg options={["change", "snapshot", "compare"]} value={b.mode || "change"} onChange={(v) => patch(b.id, { mode: v })} accent={accent} />
          </Labeled>
          <div className="text-[10.5px] leading-snug text-gray-400">
            {b.mode === "compare" ? "Compare two chosen snapshots (before → after)." : b.mode === "snapshot" ? "A single snapshot, no comparison." : "The latest snapshot with change vs the previous one."}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Labeled label={b.mode === "compare" ? "After snapshot" : "Snapshot"}>
              <select value={b.snapId || snaps[0]?.id || ""} onChange={(e) => patch(b.id, { snapId: e.target.value })} className={inputCls}>
                {snaps.map((s2) => <option key={s2.id} value={s2.id}>{new Date(s2.at).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}{s2.live ? "" : " (demo)"}</option>)}
              </select>
            </Labeled>
            {b.mode !== "snapshot" && (
              <Labeled label={b.mode === "compare" ? "Before snapshot" : "Compare against"}>
                <select value={b.baseId || ""} onChange={(e) => patch(b.id, { baseId: e.target.value || undefined })} className={inputCls}>
                  <option value="">{b.mode === "compare" ? "— pick —" : "auto (previous)"}</option>
                  {snaps.filter((s2) => s2.id !== (b.snapId || snaps[0]?.id)).map((s2) => <option key={s2.id} value={s2.id}>{new Date(s2.at).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</option>)}
                </select>
              </Labeled>
            )}
          </div>
          <Labeled label={`Keywords to include (${selKw.length}/${kwList.length})`}>
            <div className="flex flex-wrap gap-1">
              {kwList.map((k) => {
                const on = selKw.includes(k);
                return (
                  <button key={k} onClick={() => {
                    const next = on ? selKw.filter((x) => x !== k) : [...selKw, k];
                    patch(b.id, { keywords: next.length === kwList.length ? undefined : next });
                  }} className="rounded-full border px-2 py-0.5 text-[10.5px] font-medium"
                    style={on ? { borderColor: accent, color: accent, background: accent + "0D" } : { borderColor: "#E5E7EB", color: "#6B7280" }}>{k}</button>
                );
              })}
            </div>
          </Labeled>
        </div>
      );
    }
    if (b.type === "heading") return (
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2"><Labeled label="Text"><input value={b.text} onChange={(e) => patch(b.id, { text: e.target.value })} className={inputCls} /></Labeled></div>
        <Labeled label="Size"><Seg options={["H1", "H2"]} value={b.level === 1 ? "H1" : "H2"} onChange={(v) => patch(b.id, { level: v === "H1" ? 1 : 2 })} accent={accent} /></Labeled>
      </div>
    );
    if (b.type === "paragraph") return (
      <Labeled label="Text"><textarea value={b.text} onChange={(e) => patch(b.id, { text: e.target.value })} rows={3} className={inputCls} /></Labeled>
    );
    if (b.type === "kpis") return (
      <div className="space-y-3">
        <Labeled label="Metrics to show">
          <div className="grid grid-cols-2 gap-1.5">
            {Object.entries(KPIS).filter(([, d]) => d.show).map(([k, d]) => {
              const on = b.metrics.includes(k);
              return (
                <button key={k} onClick={() => patch(b.id, { metrics: on ? b.metrics.filter((m) => m !== k) : [...b.metrics, k] })}
                  className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-[12px]"
                  style={{ borderColor: on ? "#86EFAC" : "#E5E7EB", background: on ? "#F0FDF4" : "#fff" }}>
                  <CheckCircle2 size={13} style={{ color: on ? "#16A34A" : "#D1D5DB" }} /> {d.label}
                </button>
              );
            })}
          </div>
        </Labeled>
        {cmpSelect(b)}
      </div>
    );
    if (b.type === "chart" && b.mode === "trend") return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="Data">
          <select value={b.source} onChange={(e) => patch(b.id, { source: e.target.value })} className={inputCls + " bg-white"}>
            {Object.entries(TREND).filter(([, d]) => d.show).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
          </select>
        </Labeled>
        <Labeled label="Chart type"><Seg options={["area", "line", "bar"]} value={b.chartType} onChange={(v) => patch(b.id, { chartType: v })} accent={accent} /></Labeled>
        <Labeled label="Period"><Seg options={["6 mo", "13 mo"]} value={b.months === 6 ? "6 mo" : "13 mo"} onChange={(v) => patch(b.id, { months: v === "6 mo" ? 6 : 13 })} accent={accent} /></Labeled>
        {colorPick(b)}
        <div className="sm:col-span-2"><Labeled label="Custom title (optional)"><input value={b.title || ""} onChange={(e) => patch(b.id, { title: e.target.value })} className={inputCls} placeholder="Leave empty for default" /></Labeled></div>
      </div>
    );
    if (b.type === "chart") return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="Data">
          <select value={b.source} onChange={(e) => patch(b.id, { source: e.target.value })} className={inputCls + " bg-white"}>
            {Object.entries(BREAKDOWN).filter(([, d]) => d.show).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
          </select>
        </Labeled>
        <Labeled label="Chart type"><Seg options={["pie", "donut", "bar"]} value={b.chartType} onChange={(v) => patch(b.id, { chartType: v })} accent={accent} /></Labeled>
        {colorPick(b)}
        <div className="sm:col-span-2"><Labeled label="Custom title (optional)"><input value={b.title || ""} onChange={(e) => patch(b.id, { title: e.target.value })} className={inputCls} placeholder="Leave empty for default" /></Labeled></div>
      </div>
    );
    if (b.type === "table") return (
      <div className="grid gap-3 sm:grid-cols-3">
        <Labeled label="Data table">
          <select value={b.kind} onChange={(e) => patch(b.id, { kind: e.target.value })} className={inputCls + " bg-white"}>
            {Object.entries(TABLE_KINDS).filter(([, d]) => d.show).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
          </select>
        </Labeled>
        <Labeled label="Rows to show">
          <select value={b.limit || "all"} onChange={(e) => patch(b.id, { limit: e.target.value })} className={inputCls + " bg-white"}>
            {[3, 5, 10, 15, 20, 30].map((n) => <option key={n} value={n}>Top {n}</option>)}
            <option value="all">All rows</option>
          </select>
        </Labeled>
        {cmpSelect(b)}
        <div className="sm:col-span-3"><Labeled label="Custom title (optional)"><input value={b.title || ""} onChange={(e) => patch(b.id, { title: e.target.value })} className={inputCls} /></Labeled></div>
      </div>
    );
    if (b.type === "customTable") return (
      <div className="space-y-3">
        <Labeled label="Paste from Excel / Google Sheets">
          <textarea value={b.raw || ""} onChange={(e) => patch(b.id, { raw: e.target.value })}
            onPaste={(e) => { e.preventDefault(); patch(b.id, { raw: e.clipboardData.getData("text") }); }}
            rows={5} className={"ll-mono " + inputCls}
            placeholder={"Copy cells in your spreadsheet, then paste here.\nColumns stay aligned automatically (tab-separated)."} />
        </Labeled>
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="First row is a header"><Seg options={["Yes", "No"]} value={b.hasHeader ? "Yes" : "No"} onChange={(v) => patch(b.id, { hasHeader: v === "Yes" })} accent={accent} /></Labeled>
          <Labeled label="Table title (optional)"><input value={b.title || ""} onChange={(e) => patch(b.id, { title: e.target.value })} className={inputCls} /></Labeled>
        </div>
      </div>
    );
    if (b.type === "work") {
      const rec = records.find((r) => r.id === b.recordId);
      const exCl = new Set(b.excludedChecklists || []);
      const exT = new Set(b.excludedTasks || []);
      const toggleCl = (id) => { const n = new Set(exCl); n.has(id) ? n.delete(id) : n.add(id); patch(b.id, { excludedChecklists: [...n] }); };
      const toggleT = (id) => { const n = new Set(exT); n.has(id) ? n.delete(id) : n.add(id); patch(b.id, { excludedTasks: [...n] }); };
      return (
        <div className="space-y-3">
          <Labeled label="Record">
            <select value={b.recordId || ""} onChange={(e) => patch(b.id, { recordId: e.target.value, excludedChecklists: [], excludedTasks: [] })} className={inputCls + " bg-white"}>
              <option value="">Choose a record…</option>
              {records.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Labeled>
          {rec && (
            <Labeled label="Include / exclude checklists & tasks">
              <div className="space-y-2">
                {rec.checklists.map((c) => (
                  <div key={c.id} className="rounded-xl border border-gray-100 p-2.5">
                    <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold text-gray-800">
                      <input type="checkbox" checked={!exCl.has(c.id)} onChange={() => toggleCl(c.id)} className="h-4 w-4 rounded" style={{ accentColor: accent }} />
                      {c.name}
                    </label>
                    {!exCl.has(c.id) && (
                      <div className="mt-1.5 space-y-1 pl-6">
                        {c.tasks.map((t) => (
                          <label key={t.id} className="flex cursor-pointer items-center gap-2 text-[12px] text-gray-600">
                            <input type="checkbox" checked={!exT.has(t.id)} onChange={() => toggleT(t.id)} className="h-3.5 w-3.5 rounded" style={{ accentColor: accent }} />
                            <span style={{ textDecoration: t.completedAt ? "line-through" : "none", opacity: t.completedAt ? 0.7 : 1 }}>{t.title}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {rec.checklists.length === 0 && <div className="text-[12px] text-gray-400">This record has no checklists yet.</div>}
              </div>
            </Labeled>
          )}
        </div>
      );
    }
    if (b.type === "adsReport") return (
      <div className="grid gap-3 sm:grid-cols-3">
        <Labeled label="Project">
          <select value={b.projectId} onChange={(e) => patch(b.id, { projectId: e.target.value })} className={inputCls + " bg-white"}>
            {clientProjects.filter((cp) => (cp.project.ads?.campaigns || []).length).map((cp) => <option key={cp.project.id} value={cp.project.id}>{cp.project.name}</option>)}
          </select>
        </Labeled>
        <Labeled label="Platform">
          <select value={b.platform || "all"} onChange={(e) => patch(b.id, { platform: e.target.value })} className={inputCls + " bg-white"}>
            <option value="all">All platforms</option>
            {Object.entries(AD_PLATFORMS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select>
        </Labeled>
        <Labeled label="Campaign table">
          <Seg options={["Show", "Hide"]} value={b.showTable === false ? "Hide" : "Show"} onChange={(v) => patch(b.id, { showTable: v === "Show" })} accent={accent} />
        </Labeled>
        <Labeled label="Rows to show">
          <select value={b.limit || "10"} onChange={(e) => patch(b.id, { limit: e.target.value })} className={inputCls + " bg-white"}>
            {[3, 5, 10, 15, 20].map((n) => <option key={n} value={n}>Top {n}</option>)}
            <option value="all">All campaigns</option>
          </select>
        </Labeled>
        <div className="sm:col-span-2">{colorPick(b)}</div>
      </div>
    );
    if (b.type === "gbpReport" || b.type === "rankReport") return (
      <div className="grid gap-3 sm:grid-cols-3">
        <Labeled label="Project">
          <select value={b.projectId} onChange={(e) => patch(b.id, { projectId: e.target.value })} className={inputCls + " bg-white"}>
            {clientProjects.map((cp) => <option key={cp.project.id} value={cp.project.id}>{cp.project.name}</option>)}
          </select>
        </Labeled>
        {b.type === "gbpReport" ? (
          <>
            {cmpSelect(b)}
            <Labeled label="Top search terms">
              <Seg options={["Show", "Hide"]} value={b.showTerms === false ? "Hide" : "Show"} onChange={(v) => patch(b.id, { showTerms: v === "Show" })} accent={accent} />
            </Labeled>
          </>
        ) : (
          <Labeled label="Rows to show">
            <select value={b.limit || "10"} onChange={(e) => patch(b.id, { limit: e.target.value })} className={inputCls + " bg-white"}>
              {[3, 5, 10, 15, 20, 30].map((n) => <option key={n} value={n}>Top {n}</option>)}
              <option value="all">All rows</option>
            </select>
          </Labeled>
        )}
        <div className="sm:col-span-3">{colorPick(b)}</div>
      </div>
    );
    return null;
  };

  /* ---- block library ---- */
  const LIB_COMMON = [
    { label: "Heading", icon: Type, make: () => ({ type: "heading", text: "New heading", level: 2 }) },
    { label: "Paragraph", icon: AlignLeft, make: () => ({ type: "paragraph", text: "" }) },
    { label: "Paste table (Excel)", icon: ClipboardPaste, make: () => ({ type: "customTable", raw: "", hasHeader: true }) },
    { label: "Divider", icon: Minus, make: () => ({ type: "divider" }) },
  ];
  const LIB_PERF = [
    { label: "KPI cards", icon: LayoutDashboard, make: () => ({ type: "kpis", metrics: Object.keys(KPIS).filter((k) => KPIS[k].show).slice(0, 4) }) },
    { label: "Trend chart", icon: Activity, make: () => ({ type: "chart", mode: "trend", source: Object.keys(TREND).find((k) => TREND[k].show), chartType: "area", months: 13 }) },
    { label: "Pie / breakdown", icon: PieIcon, make: () => ({ type: "chart", mode: "breakdown", source: Object.keys(BREAKDOWN).find((k) => BREAKDOWN[k].show), chartType: "pie" }) },
    { label: "Data table", icon: Table2, make: () => ({ type: "table", kind: Object.keys(TABLE_KINDS).find((k) => TABLE_KINDS[k].show) }) },
  ];
  const LIB_WORK = [
    { label: "Work record (tasks)", icon: ListTodo, make: () => ({ type: "work", recordId: records[0]?.id || "", excludedChecklists: [], excludedTasks: [] }) },
  ];
  const importLastMonthWork = () => {
    const monthAgo = Date.now() - 31 * 864e5;
    const recent = records.filter((r) => (r.updatedAt || r.createdAt || 0) >= monthAgo || (r.completedAt || 0) >= monthAgo);
    const use = recent.length ? recent : records;
    if (!use.length) return;
    addMany([
      { type: "heading", text: `Work completed — ${new Date().toLocaleDateString("en", { month: "long", year: "numeric" })}`, level: 2 },
      ...use.map((r) => ({ type: "work", recordId: r.id, excludedChecklists: [], excludedTasks: [] })),
    ]);
  };
  const LIB = template === "work" ? [...LIB_WORK, ...LIB_COMMON] : [...LIB_PERF, ...LIB_COMMON];

  return (
    <div className={`ll-root ${dark ? "ll-dark" : ""} min-h-screen bg-[#EDEFF3]`}>
      <style>{FONT_CSS}</style>
      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
          /* render every background/color faithfully (map rank bubbles, chips, cards) */
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .rb-outer { display: block !important; max-width: 100% !important; padding: 0 !important; margin: 0 !important; gap: 0 !important; }
          /* the editor's A4 pages map one-to-one onto printed pages — each carries
             its own brand header + page number */
          .rb-a4page { width: 210mm !important; min-height: 297mm !important; box-shadow: none !important; border-radius: 0 !important;
            margin: 0 !important; page-break-after: always; break-after: page; }
          .rb-a4page:last-of-type { page-break-after: auto; break-after: auto; }
          .rb-cover { width: 210mm !important; height: 297mm !important; box-shadow: none !important; border-radius: 0 !important; margin: 0 !important; }
          /* box-shadows rasterize as dark smudges in print — none anywhere */
          .rb-a4page *, .rb-cover * { box-shadow: none !important; text-shadow: none !important; }
          /* compact geo cards: two keyword snapshots per A4 page */
          /* keep a section (and its map) whole on one page */
          .rb-block { break-inside: avoid; page-break-inside: avoid; }
          .gg-page { break-inside: avoid; page-break-inside: avoid; }
          /* charts scale to the page; map tiles (256px, absolutely positioned) must NOT be constrained */
          .recharts-wrapper, .recharts-surface { max-width: 100% !important; }
        }
      `}</style>

      {/* builder top bar */}
      <div className="no-print sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-5 py-3">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-[12.5px] font-medium text-gray-600 hover:border-gray-300">
            <ArrowLeft size={14} /> Back
          </button>
          <div className="flex items-center gap-2">
            <FileTextIcon size={16} style={{ color: accent }} />
            <span className="ll-display text-[15px] font-semibold">Report builder</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2.5 py-1.5">
            <span className="text-[11px] font-medium text-gray-400">Accent</span>
            <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-6 w-9 cursor-pointer rounded border border-gray-200" />
          </div>
          <button onClick={() => setBrandPanel((v) => !v)}
            className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-medium"
            style={brandPanel ? { background: accent + "14", borderColor: accent + "44", color: accent } : { borderColor: "#E5E7EB", color: "var(--chip-fg, #6B7280)", background: "var(--chip-bg, #fff)" }}>
            <Palette size={14} /> Branding
          </button>
          <DarkToggle dark={dark} setDark={setDark} />
          {onSaveTemplate && (
            <button onClick={() => { const n = prompt("Save these sections as a reusable template. Template name:", title.replace(project.name + " — ", "") + " template"); if (n) { onSaveTemplate({ name: n, blocks }); setSaved("template"); setTimeout(() => setSaved(null), 2000); } }}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] font-medium text-gray-600 hover:border-gray-300">
              <Copy size={14} /> Save as template
            </button>
          )}
          {onSave && (
            <button onClick={() => { onSave({ name: title, blocks, accent, cmp, range }); setSaved("report"); setTimeout(() => setSaved(null), 2000); }}
              className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-medium"
              style={{ borderColor: accent + "55", color: accent, background: accent + "0D" }}>
              <CheckCircle2 size={14} /> {saved === "report" ? "Saved ✓" : "Save report"}
            </button>
          )}
          <button onClick={downloadPdf} className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12.5px] font-semibold text-white" style={{ background: accent }}>
            <Upload size={14} className="rotate-180" /> Download PDF
          </button>
        </div>
      </div>

      {brandPanel && (
        <div className="no-print ll-fade border-b border-gray-200 bg-white px-5 py-4">
          <div className="mx-auto flex max-w-6xl flex-wrap items-start gap-6">
            <Labeled label="Show brand header">
              <Seg options={["On", "Off"]} value={showBrand ? "On" : "Off"} onChange={(v) => setShowBrand(v === "On")} accent={accent} />
            </Labeled>
            <Labeled label="Report branding">
              <div className="flex rounded-lg border border-gray-200 p-0.5">
                {[
                  { key: "agency", label: agencyBrand.name },
                  ...(wlBrand ? [{ key: "wl", label: `White label — ${wlBrand.name}` }] : []),
                  { key: "custom", label: "Custom brand" },
                ].map((o) => (
                  <button key={o.key} onClick={() => setBrandMode(o.key)}
                    className="rounded-md px-3 py-1.5 text-[12.5px] font-medium"
                    style={brandMode === o.key ? { background: accent, color: "#fff" } : { color: "var(--chip-fg, #4B5563)" }}>
                    {o.label}
                  </button>
                ))}
              </div>
            </Labeled>
            {brandMode === "custom" && (
              <>
                <Labeled label="Custom brand name">
                  <input value={customBrand.name} onChange={(e) => setCustomBrand((c) => ({ ...c, name: e.target.value }))}
                    placeholder="e.g. Northstar Digital" className={inputCls + " w-52"} />
                </Labeled>
                <Labeled label="Custom brand logo">
                  <LogoUpload value={customBrand.logo} onChange={(logo) => setCustomBrand((c) => ({ ...c, logo }))} label="Upload logo" />
                </Labeled>
              </>
            )}
            <Labeled label='"Prepared for" line'>
              <input value={preparedFor} onChange={(e) => setPreparedFor(e.target.value)} className={inputCls + " w-52"} />
            </Labeled>
            <Labeled label="A4 cover page">
              <Seg options={["On", "Off"]} value={showCover ? "On" : "Off"} onChange={(v) => setShowCover(v === "On")} accent={accent} />
            </Labeled>
            {showCover && (
              <>
                <Labeled label="Cover — business name">
                  <input value={coverBusiness} onChange={(e) => setCoverBusiness(e.target.value)} className={inputCls + " w-52"} />
                </Labeled>
                <Labeled label="Cover — business address">
                  <input value={coverAddress} onChange={(e) => setCoverAddress(e.target.value)} placeholder="123 Main St, City" className={inputCls + " w-52"} />
                </Labeled>
                <Labeled label="Cover — report duration">
                  <input value={coverDuration} onChange={(e) => setCoverDuration(e.target.value)} className={inputCls + " w-52"} />
                </Labeled>
                <Labeled label="Cover — customer logo / icon">
                  <LogoUpload value={coverLogo} onChange={setCoverLogo} label="Upload customer logo" />
                </Labeled>
              </>
            )}
          </div>
        </div>
      )}

      <div className="rb-outer mx-auto flex max-w-6xl gap-5 p-5">
        {/* report page */}
        <div className="min-w-0 flex-1 print-full">
          {showCover && (
            <div className="rb-cover mx-auto mb-5 flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm"
              style={{ width: 794, height: 1123, pageBreakAfter: "always" }}>
              {/* top band — bigger branding */}
              <div className="flex items-center justify-between px-10 pt-10">
                <div className="flex items-center gap-3.5">
                  <BrandMark name={brand.name} logo={brand.logo} accent={brand.accent || accent} size="xl" />
                  <div className="ll-display text-[26px] font-bold leading-tight tracking-tight">{brand.name}</div>
                </div>
                <input value={coverBadge} onChange={(e) => setCoverBadge(e.target.value)} size={Math.max(6, coverBadge.length)}
                  className="rounded-full border-0 px-3 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider outline-none"
                  style={{ background: accent + "14", color: accent }} />
              </div>
              {/* center — every text editable in place */}
              <div className="flex flex-1 flex-col justify-center px-10">
                <div className="mb-3 h-1.5 w-16 rounded-full" style={{ background: accent }} />
                <textarea value={title} onChange={(e) => setTitle(e.target.value)} rows={Math.max(1, Math.ceil(title.length / 26))}
                  className="ll-display w-full resize-none border-0 bg-transparent text-[36px] font-bold leading-tight tracking-tight outline-none"
                  style={{ color: accent }} />
                <div className="mt-8 flex items-center gap-3.5">
                  <label className="group relative cursor-pointer" title="Click to change the customer logo">
                    {coverLogo
                      ? <img src={coverLogo} alt="customer logo" className="h-12 w-12 rounded-xl border border-gray-200 object-cover" />
                      : <ProjectMark project={project} size="md" />}
                    <span className="no-print absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-gray-200 bg-white p-0.5 text-gray-400 opacity-0 group-hover:opacity-100">
                      <Upload size={9} />
                    </span>
                    <input type="file" accept="image/*" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => setCoverLogo(r.result); r.readAsDataURL(f); }} />
                  </label>
                  <div className="min-w-0 flex-1">
                    <div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Prepared for</div>
                    <input value={coverBusiness} onChange={(e) => setCoverBusiness(e.target.value)}
                      className="ll-display w-full border-0 bg-transparent text-[20px] font-semibold leading-tight outline-none" />
                    <div className="flex items-center gap-1 text-[12px] text-gray-400">
                      <MapPin size={11} className="shrink-0" />
                      <input value={coverAddress} onChange={(e) => setCoverAddress(e.target.value)} placeholder="Business address…"
                        className="w-full border-0 bg-transparent text-[12px] text-gray-400 outline-none" />
                    </div>
                  </div>
                </div>
              </div>
              {/* bottom band */}
              <div className="flex items-end justify-between border-t px-10 py-7" style={{ borderColor: accent + "22" }}>
                <div>
                  <div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Reporting period</div>
                  <input value={coverDuration} onChange={(e) => setCoverDuration(e.target.value)}
                    className="ll-mono w-56 border-0 bg-transparent text-[13px] font-semibold text-gray-700 outline-none" />
                </div>
                <div className="text-right">
                  <div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Issued</div>
                  <div className="ll-mono text-[13px] font-semibold text-gray-700">{today}</div>
                </div>
              </div>
            </div>
          )}
          {pages.map((pageBlocks, pi) => (
            <div key={pi} className="rb-a4page mx-auto mb-5 flex flex-col rounded-2xl bg-white shadow-sm"
              style={{ minHeight: PAGE_H, width: PAGE_W }}>
              {showBrand && <PageHeader />}
              <div className="flex-1 px-8 pt-4">
                {pi === 0 && (
                  <input value={title} onChange={(e) => setTitle(e.target.value)}
                    className="ll-display mb-4 w-full border-0 bg-transparent text-[24px] font-bold tracking-tight outline-none"
                    style={{ color: accent }} />
                )}
                <div className="space-y-1">
                  {pageBlocks.map((b) => {
                    const i = blocks.findIndex((x) => x.id === b.id);
                    return (
                      <div key={b.id} ref={attachBlockRef(b.id)}
                        className="rb-block group relative rounded-xl px-2 py-2 hover:bg-gray-50/80"
                        style={flashId === b.id ? { boxShadow: `0 0 0 2px ${accent}`, background: accent + "0A", transition: "box-shadow .3s" } : {}}>
                        {/* hover toolbar */}
                        <div className="no-print absolute -top-2.5 right-2 z-10 flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm opacity-50 transition-opacity group-hover:opacity-100">
                          <button onClick={() => move(b.id, -1)} disabled={i === 0} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30"><ChevronUp size={13} /></button>
                          <button onClick={() => move(b.id, 1)} disabled={i === blocks.length - 1} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30"><ChevronDown size={13} /></button>
                          <button onClick={() => patch(b.id, { pageBreak: !b.pageBreak })} title={b.pageBreak ? "Remove page break — flow naturally" : "Move this section to the next page"}
                            className="rounded-md p-1 hover:bg-gray-100" style={{ color: b.pageBreak ? accent : "#9CA3AF" }}><ArrowDownRight size={13} /></button>
                          <button onClick={() => setOpenId(openId === b.id ? null : b.id)} className="rounded-md p-1 hover:bg-gray-100" style={{ color: openId === b.id ? accent : "#9CA3AF" }}><Settings2 size={13} /></button>
                          <button onClick={() => duplicate(b.id)} className="rounded-md p-1 text-gray-400 hover:bg-gray-100"><Copy size={13} /></button>
                          <button onClick={() => remove(b.id)} className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"><Trash2 size={13} /></button>
                        </div>
                        {b.pageBreak && (
                          <div className="no-print mb-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider" style={{ color: accent }}>
                            <ArrowDownRight size={9} /> starts on a new page
                          </div>
                        )}
                        {openId === b.id && b.type === "geoReport" && (
                          <div className="no-print ll-fade mb-3 rounded-xl border border-gray-200 bg-white p-4">{renderSettings(b)}</div>
                        )}
                        {renderBlock(b)}
                        {openId === b.id && b.type !== "divider" && b.type !== "geoReport" && (
                          <div className="no-print ll-fade mt-3 rounded-xl border border-gray-200 bg-white p-4">{renderSettings(b)}</div>
                        )}
                      </div>
                    );
                  })}
                  {blocks.length === 0 && pi === 0 && (
                    <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-[13px] text-gray-400">
                      Empty report — add blocks from the panel on the right.
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-gray-100 px-8 py-2.5 text-[10.5px] text-gray-400">
                <span>{brand.name} · {title}</span>
                <span className="ll-mono">Page {pi + 1 + (showCover ? 1 : 0)} of {pages.length + (showCover ? 1 : 0)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* block library rail — organized by data source */}
        <div className="no-print w-60 shrink-0">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] space-y-3 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-3">
            {/* ---- Report Date Range: drives every auto data block ---- */}
            <div className="rounded-xl border p-2.5" style={{ borderColor: accent + "44", background: accent + "07" }}>
              <div className="mb-1.5 flex items-center gap-1.5 px-0.5">
                <Calendar size={12} style={{ color: accent }} />
                <span className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-500">Report Date Range</span>
              </div>
              <select value={range.preset}
                onChange={(e) => {
                  const key = e.target.value;
                  const def = RANGE_PRESETS.find(([k]) => k === key);
                  if (def && def[2]) { const [s2, e2] = def[2](); setRange({ preset: key, start: isoD(s2), end: isoD(e2) }); }
                  else setRange((r) => ({ ...r, preset: "custom" }));
                }}
                className="mb-1.5 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[11.5px] font-semibold text-gray-700">
                {RANGE_PRESETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              {range.preset === "custom" && (
                <div className="mb-1.5 grid grid-cols-2 gap-1.5">
                  <input type="date" value={range.start} min={isoD(earliestD)} max={range.end}
                    onChange={(e) => e.target.value && setRange((r) => ({ ...r, start: e.target.value }))}
                    className="ll-mono rounded-lg border border-gray-200 bg-white px-1.5 py-1 text-[10px]" />
                  <input type="date" value={range.end} min={range.start} max={isoD(todayD)}
                    onChange={(e) => e.target.value && setRange((r) => ({ ...r, end: e.target.value }))}
                    className="ll-mono rounded-lg border border-gray-200 bg-white px-1.5 py-1 text-[10px]" />
                </div>
              )}
              <div className="px-0.5 text-[9.5px] leading-relaxed text-gray-400">
                <b className="text-gray-600">{rangeLabel}</b> · {lenDays}d{hasPrev ? <> · deltas vs <b className="text-gray-600">{prevLabel}</b></> : " · no earlier data to compare"}
                <br />Work records &amp; geo-grid sections stay manual.
              </div>
            </div>
            {(() => {
              const picked = clientProjects.filter((cp) => pickedProjIds.has(cp.project.id));
              const withGbp = picked.filter((cp) => cp.project.integrations.gbp);
              const withAds = picked.filter((cp) => (cp.project.ads?.campaigns || []).some((c) => c.status !== "draft"));
              const withBing = picked.filter((cp) => cp.project.integrations.bing);
              const withApple = picked.filter((cp) => cp.project.integrations.apple);
              const withRanks = picked.filter((cp) => cp.tracking.length);
              const withGeo = picked.filter((cp) => (cp.project.geoGrid?.reports || []).some((r) => r.snapshots?.length));
              const SectionBtn = ({ icon: Icon, label, count, onClick, disabled }) => (
                <button onClick={onClick} disabled={disabled}
                  className="flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[11.5px] font-semibold hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white"
                  style={{ borderColor: "#E5E7EB", color: "#374151" }}>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={{ background: accent + "14", color: accent }}><Icon size={13} /></span>
                  <span className="flex-1">{label}</span>
                  {count != null && <span className="ll-mono text-[10px] text-gray-400">{count}</span>}
                </button>
              );
              const Group = ({ title, children }) => (
                <div><div className="mb-1.5 px-1 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">{title}</div><div className="space-y-1">{children}</div></div>
              );
              return (
                <>
                  {template !== "work" && clientProjects.length > 0 && (
                    <Group title="Projects (pick, then add sections)">
                      {clientProjects.map((cp) => {
                        const on = pickedProjIds.has(cp.project.id);
                        return (
                          <button key={cp.project.id}
                            onClick={() => setPickedProjIds((set) => { const n = new Set(set); on ? n.delete(cp.project.id) : n.add(cp.project.id); return n; })}
                            className="flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[11.5px] font-medium"
                            style={{ borderColor: on ? "#86EFAC" : "#E5E7EB", background: on ? "#F0FDF4" : "#fff", color: "#374151" }}>
                            <CheckCircle2 size={13} className="shrink-0" style={{ color: on ? "#16A34A" : "#D1D5DB" }} />
                            <ProjectMark project={cp.project} />
                            <span className="truncate">{cp.project.name}</span>
                          </button>
                        );
                      })}
                    </Group>
                  )}

                  {template !== "work" && picked.length > 0 && (
                    <>
                      <div className="border-t border-gray-100" />
                      <Group title="Business profiles">
                        <SectionBtn icon={Building2} label="Google Business Profile" count={withGbp.length} disabled={!withGbp.length}
                          onClick={() => addMany(withGbp.map((cp) => ({ type: "gbpReport", projectId: cp.project.id, showTerms: true })))} />
                        <SectionBtn icon={MapPin} label="Bing Places" count={withBing.length} disabled={!withBing.length}
                          onClick={() => addMany(withBing.map((cp) => ({ type: "bingReport", projectId: cp.project.id })))} />
                        <SectionBtn icon={MapPin} label="Apple Maps" count={withApple.length} disabled={!withApple.length}
                          onClick={() => addMany(withApple.map((cp) => ({ type: "appleReport", projectId: cp.project.id })))} />
                      </Group>
                      <Group title="Paid marketing">
                        <SectionBtn icon={Rocket} label="Ads performance" count={withAds.length} disabled={!withAds.length}
                          onClick={() => addMany(withAds.map((cp) => ({ type: "adsReport", projectId: cp.project.id, platform: "all", limit: "10" })))} />
                      </Group>
                      <Group title="Search & rankings">
                        <SectionBtn icon={Target} label="Website keyword rankings" count={withRanks.length} disabled={!withRanks.length}
                          onClick={() => addMany(withRanks.map((cp) => ({ type: "rankReport", projectId: cp.project.id, limit: "10" })))} />
                        <SectionBtn icon={MapPin} label="GBP geo-grid (map)…" count={withGeo.length} disabled={!withGeo.length}
                          onClick={() => setGeoModal({ projectIds: withGeo.map((cp) => cp.project.id) })} />
                      </Group>
                    </>
                  )}

                  <div className="border-t border-gray-100" />
                  <Group title="Performance report (this project)">
                    {LIB_PERF.map((l) => (
                      <SectionBtn key={l.label} icon={l.icon} label={l.label} onClick={() => add(l.make())} />
                    ))}
                  </Group>
                  <div className="border-t border-gray-100" />
                  <div>
                    <div className="mb-1.5 flex items-center justify-between px-1">
                      <span className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Work report</span>
                      {records.length > 0 && (
                        <button onClick={importLastMonthWork} title="Import last month's records from Project Management"
                          className="ll-mono text-[9.5px] font-semibold" style={{ color: accent }}>+ last month</button>
                      )}
                    </div>
                    <div className="space-y-1">
                      {LIB_WORK.map((l) => <SectionBtn key={l.label} icon={l.icon} label={l.label} onClick={() => add(l.make())} />)}
                      {records.length > 0 && (
                        <div className="rounded-xl border border-gray-100 p-1.5">
                          <input value={workSearch} onChange={(e) => setWorkSearch(e.target.value)} placeholder="Search records to add…"
                            className="mb-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[11px]" />
                          {workSearch.trim() && (
                            <div className="max-h-40 space-y-0.5 overflow-y-auto">
                              {records.filter((r) => r.name.toLowerCase().includes(workSearch.trim().toLowerCase())).slice(0, 8).map((r) => (
                                <button key={r.id}
                                  onClick={() => { add({ type: "work", recordId: r.id, excludedChecklists: [], excludedTasks: [] }); setWorkSearch(""); }}
                                  className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11px] text-gray-700 hover:bg-gray-50">
                                  <Plus size={10} className="shrink-0 text-gray-400" />
                                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                                  <span className="ll-mono shrink-0 text-[9px] text-gray-400">{r.checklists.flatMap((c) => c.tasks).filter((t) => t.completedAt).length}✓</span>
                                </button>
                              ))}
                              {records.filter((r) => r.name.toLowerCase().includes(workSearch.trim().toLowerCase())).length === 0 && (
                                <div className="px-2 py-1.5 text-[10.5px] text-gray-300">No records match.</div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      <div className="px-1 text-[9px] leading-relaxed text-gray-400">Only completed tasks appear in report work sections.</div>
                    </div>
                  </div>
                  <div className="border-t border-gray-100" />
                  <Group title="Content">
                    {LIB_COMMON.map((l) => <SectionBtn key={l.label} icon={l.icon} label={l.label} onClick={() => add(l.make())} />)}
                  </Group>
                </>
              );
            })()}
            <div className="rounded-lg bg-gray-50 p-2.5 text-[10.5px] leading-relaxed text-gray-400">
              Each section has its own toolbar: move, edit (gear), duplicate, remove. Headings & paragraphs edit inline.
            </div>
          </div>
        </div>

        {geoModal && (() => {
          const projs = geoModal.projectIds.map((id) => clientProjects.find((cp) => cp.project.id === id)).filter(Boolean);
          const first = projs[0]?.project.geoGrid?.reports?.find((r) => r.snapshots?.length);
          return (
            <div className="no-print fixed inset-0 z-[80] flex items-center justify-center bg-gray-900/40 p-4" onClick={() => setGeoModal(null)}>
              <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="ll-display mb-1 text-[15px] font-semibold">Add GBP geo-grid section</div>
                <div className="mb-3 text-[11.5px] text-gray-400">Adds a map-ranking section per selected project. You choose the snapshot, comparison and keywords per section from its gear afterwards.</div>
                <div className="mb-3 rounded-lg bg-gray-50 p-2.5 text-[11px] text-gray-500">
                  {projs.length} project{projs.length === 1 ? "" : "s"} with geo-grid data selected. Default view: latest snapshot with change vs previous, all keywords.
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setGeoModal(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-[12.5px] font-medium text-gray-600">Cancel</button>
                  <button onClick={() => {
                    addMany(projs.map((cp) => {
                      const rep = cp.project.geoGrid.reports.find((r) => r.snapshots?.length);
                      return { type: "geoReport", projectId: cp.project.id, reportId: rep?.id, mode: "change" };
                    }));
                    setGeoModal(null);
                  }} className="rounded-lg px-5 py-2 text-[12.5px] font-semibold text-white" style={{ background: accent }}>Add {projs.length} section{projs.length === 1 ? "" : "s"}</button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

/* ================= Project Management ================= */
