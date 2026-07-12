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

export function dataForSeoAuthHeader(company) {
  // btoa is fine server-side via Buffer.from(str).toString("base64")
  return "Basic " + btoa(`${company.dfs.login}:${company.dfs.password}`);
}
export function buildSerpTask(entry) {
  return {
    keyword: entry.keyword,
    location_name: `${entry.city.city},${entry.city.region},${entry.city.country}`,
    language_code: "en",
    device: entry.device.toLowerCase(),            // "desktop" | "mobile"
    os: entry.device === "Mobile" ? "android" : "windows",
    depth: 100,                                    // scan top 100 organic results
  };
}
export function buildSerpBatches(dueEntries) {
  // DataForSEO routes by engine-specific endpoint (/v3/serp/{engine}/organic/task_post)
  // and accepts up to 100 task objects per POST — so group by engine, then chunk.
  // Returns [{ engine: "google"|"bing", tasks: [...≤100] }, ...] covering EVERY due entry.
  const byEngine = {};
  dueEntries.forEach((e) => {
    const engine = (e.engine || "Google").toLowerCase();
    (byEngine[engine] = byEngine[engine] || []).push(buildSerpTask(e));
  });
  return Object.entries(byEngine).flatMap(([engine, tasks]) => {
    const batches = [];
    for (let i = 0; i < tasks.length; i += 100) batches.push({ engine, tasks: tasks.slice(i, i + 100) });
    return batches;
  });
}

export async function rerunNow(entryIds, dfsCredentials) {
  // In the browser this call goes to YOUR backend proxy — never expose
  // DataForSEO credentials to the client directly.
  const res = await fetch("/api/rerun", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entryIds }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { updated: [{ id, positions: [...], url }] }
}
export function parseSerpRank(taskResult, domain) {
  const items = taskResult?.result?.[0]?.items || [];
  const clean = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const hit = items.find(
    (it) => it.type === "organic" && (it.domain || "").replace(/^www\./, "") === clean
  );
  return hit
    ? { position: hit.rank_absolute, url: hit.url }   // rank_absolute = true SERP position
    : { position: null, url: null };                  // not in top 100
}

const CITY_DATA = {
  "United States": [
    ["New York","New York"],["Brooklyn","New York"],["Queens","New York"],["Los Angeles","California"],
    ["San Diego","California"],["San Francisco","California"],["Chicago","Illinois"],["Houston","Texas"],
    ["San Antonio","Texas"],["Dallas","Texas"],["Austin","Texas"],["Round Rock","Texas"],["Phoenix","Arizona"],
    ["Philadelphia","Pennsylvania"],["Jacksonville","Florida"],["Miami","Florida"],["Tampa","Florida"],
    ["Columbus","Ohio"],["Charlotte","North Carolina"],["Indianapolis","Indiana"],["Seattle","Washington"],
    ["Denver","Colorado"],["Washington","District of Columbia"],["Boston","Massachusetts"],
    ["Nashville","Tennessee"],["Detroit","Michigan"],["Portland","Oregon"],["Las Vegas","Nevada"],
    ["Louisville","Kentucky"],["Baltimore","Maryland"],["Atlanta","Georgia"],["Minneapolis","Minnesota"],
    ["Salt Lake City","Utah"],["Kansas City","Missouri"],["Raleigh","North Carolina"],
  ],
  "Canada": [
    ["Toronto","Ontario"],["Ottawa","Ontario"],["Vancouver","British Columbia"],["Montreal","Quebec"],
    ["Calgary","Alberta"],["Edmonton","Alberta"],["Winnipeg","Manitoba"],["Halifax","Nova Scotia"],
    ["Mississauga","Ontario"],["Surrey","British Columbia"],
  ],
  "United Kingdom": [
    ["London","England"],["Birmingham","England"],["Manchester","England"],["Leeds","England"],
    ["Liverpool","England"],["Sheffield","England"],["Bristol","England"],["Leicester","England"],
    ["Nottingham","England"],["Brighton","England"],["Oxford","England"],["Cambridge","England"],
  ],
  "Australia": [
    ["Sydney","New South Wales"],["Melbourne","Victoria"],["Brisbane","Queensland"],
    ["Perth","Western Australia"],["Adelaide","South Australia"],["Canberra","Australian Capital Territory"],
    ["Gold Coast","Queensland"],["Newcastle","New South Wales"],["Hobart","Tasmania"],
  ],
};
const COUNTRY_LABEL = { "United States": "USA", "Canada": "Canada", "United Kingdom": "England (UK)", "Australia": "Australia" };
const ALL_CITIES = Object.entries(CITY_DATA).flatMap(([country, list]) =>
  list.map(([city, region]) => ({ city, region, country }))
);
const REGION_ABBR = {
  "New York":"NY","California":"CA","Illinois":"IL","Texas":"TX","Arizona":"AZ",
  "Pennsylvania":"PA","Florida":"FL","Ohio":"OH","North Carolina":"NC","Indiana":"IN",
  "Washington":"WA","Colorado":"CO","District of Columbia":"DC","Massachusetts":"MA",
  "Tennessee":"TN","Michigan":"MI","Oregon":"OR","Nevada":"NV","Kentucky":"KY",
  "Maryland":"MD","Georgia":"GA","Virginia":"VA","Minnesota":"MN","Utah":"UT","Missouri":"MO",
  "Ontario":"ON","Quebec":"QC","British Columbia":"BC","Alberta":"AB","Manitoba":"MB",
  "Nova Scotia":"NS","England":"ENG",
  "New South Wales":"NSW","Victoria":"VIC","Queensland":"QLD","Western Australia":"WA",
  "South Australia":"SA","Australian Capital Territory":"ACT","Tasmania":"TAS","Northern Territory":"NT",
};
const regionShort = (region) => REGION_ABBR[region] || region;
const cityKey = (c) => `${c.city}|${c.region}|${c.country}`;
const cityLabel = (c) => `${c.city}, ${regionShort(c.region)}`;
const urlSlug = (url) => {
  const noProto = url.includes("//") ? url.slice(url.indexOf("//") + 2) : url;
  const i = noProto.indexOf("/");
  return i === -1 ? "/" : noProto.slice(i);
};
const findCity = (name) => {
  const hit = ALL_CITIES.find((c) => c.city === name);
  // never silently substitute a different location — a wrong city means wrong SERP scans
  if (!hit) throw new Error(`Unknown city "${name}" — add it to CITY_DATA before tracking keywords there.`);
  return hit;
};

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function monthLabels() {
  const out = []; const now = new Date();
  for (let i = 12; i >= 0; i--) {
    const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(m.toLocaleString("en", { month: "short" }) + " ’" + String(m.getFullYear()).slice(2));
  }
  return out;
}
const buildMonthDates = () => {
  const out = []; const now = new Date();
  for (let i = 12; i >= 0; i--) out.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  return out;
};
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/* The 13-month grid is module state so every component shares one copy, but it is
   NOT frozen at load: useMonthGrid() below refreshes it when the calendar month
   rolls over during an open session and re-renders/regenerates dependent data. */
let LABELS = monthLabels();
let MONTH_DATES = buildMonthDates();
let DEFAULT_RANGE = { start: isoDate(MONTH_DATES[0]), end: isoDate(new Date()) };
let MONTH_GRID_KEY = new Date().getFullYear() * 12 + new Date().getMonth();
function refreshMonthGridIfStale() {
  const now = new Date();
  const key = now.getFullYear() * 12 + now.getMonth();
  if (key === MONTH_GRID_KEY) return false;
  MONTH_GRID_KEY = key;
  LABELS = monthLabels();
  MONTH_DATES = buildMonthDates();
  DEFAULT_RANGE = { start: isoDate(MONTH_DATES[0]), end: isoDate(now) };
  return true;
}
function useMonthGrid() {
  const [key, setKey] = useState(MONTH_GRID_KEY);
  useEffect(() => {
    const check = () => { if (refreshMonthGridIfStale()) setKey(MONTH_GRID_KEY); };
    const iv = setInterval(check, 60000);
    document.addEventListener("visibilitychange", check);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", check); };
  }, []);
  return key;
}

function rangeIdx(range) {
  if (!range) return [0, 12];
  const f = (str) => {
    const d = new Date(str + "T00:00:00");
    let i = MONTH_DATES.length - 1;
    while (i > 0 && MONTH_DATES[i] > d) i--;
    return i;
  };
  let a = f(range.start), b = f(range.end);
  if (a > b) [a, b] = [b, a];
  return [a, b];
}
const PAGE_SLUGS = ["/", "/services", "/contact", "/about", "/reviews", "/blog/local-seo-tips"];

function buildSeries(r, start, growth, jitter = 0.14) {
  const out = [start];
  for (let i = 1; i < 13; i++) out.push(out[i - 1] * growth * (1 - jitter / 2 + r() * jitter));
  return out.map((v) => Math.max(0, Math.round(v)));
}

const GA_SOURCES = [
  { name: "Google", w: 0.52, g: 1.03 },
  { name: "Direct", w: 0.20, g: 1.02 },
  { name: "Bing", w: 0.08, g: 1.02 },
  { name: "Facebook", w: 0.08, g: 1.01 },
  { name: "ChatGPT", w: 0.05, g: 1.16 },   // AI referrals grow fastest
  { name: "Yahoo", w: 0.03, g: 1.0 },
];

const GA_EVENTS = [
  { name: "form_submission", w: 1.0 },
  { name: "call_click", w: 0.8 },
  { name: "chat_started", w: 0.45 },
  { name: "whatsapp_click", w: 0.35 },
  { name: "booking_completed", w: 0.3 },
  { name: "newsletter_signup", w: 0.2 },
];

function genSiteData(project, trackedKeywords, brandName) {
  const r = mulberry32(hashStr(project.id + project.name));
  const rng = (lo, hi) => lo + r() * (hi - lo);
  const growth = rng(1.015, 1.05);

  /* GBP — impressions split by platform × device (matches the
     Business Profile Performance API metric names:
     BUSINESS_IMPRESSIONS_{DESKTOP|MOBILE}_{SEARCH|MAPS}) */
  const mobShare = rng(0.58, 0.72);
  const searchViews = buildSeries(r, rng(700, 2400), growth);
  const mapViews = buildSeries(r, rng(500, 1900), growth);
  const searchMobile = searchViews.map((v) => Math.round(v * mobShare));
  const searchDesktop = searchViews.map((v, i) => v - searchMobile[i]);
  const mapsMobile = mapViews.map((v) => Math.round(v * (mobShare + 0.1)));
  const mapsDesktop = mapViews.map((v, i) => Math.max(0, v - mapsMobile[i]));
  const calls = buildSeries(r, rng(18, 85), growth);
  const directions = buildSeries(r, rng(25, 140), growth);
  const gbpClicks = buildSeries(r, rng(35, 190), growth);
  const totalReviewsBase = Math.round(rng(20, 140));
  const rating = +rng(4.2, 4.9).toFixed(1);

  /* GBP — searches by keywords (search terms people used to find the
     profile; SearchKeywords endpoint of the Performance API) */
  const brand = (brandName || project.name).toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const termPool = [brand, ...trackedKeywords, "near me", "open now", brand + " reviews"];
  const gbpTerms = [...new Set(termPool)].slice(0, 8).map((term, i) => {
    const share = (0.26 - i * 0.028) * rng(0.75, 1.25);
    const drift = rng(0.72, 1.35); // per-term trend — without it the share cancels out of pctDelta and every term shows the same % change
    return {
      term,
      impressions: Math.max(5, Math.round(searchViews[12] * share)),
      prev: (cmp) => Math.max(5, Math.round(searchViews[12 - cmp] * share * drift)),
    };
  }).sort((a, b) => b.impressions - a.impressions);

  /* GA4 */
  const users = buildSeries(r, rng(380, 2800), growth);
  const sessions = users.map((u) => Math.round(u * rng(1.18, 1.45)));
  const engRate = +rng(0.52, 0.71).toFixed(2);
  const conversions = buildSeries(r, rng(9, 75), growth);
  let w = [rng(0.4, 0.55), rng(0.18, 0.28), rng(0.06, 0.14), rng(0.05, 0.12), rng(0.03, 0.1)];
  const wSum = w.reduce((a, b) => a + b, 0); w = w.map((x) => x / wSum);
  const channels = ["Organic search", "Direct", "Social", "Referral", "Paid search"]
    .map((name, i) => ({ name, value: Math.round(sessions[12] * w[i]) }));
  const sources = GA_SOURCES.map((s) => ({
    name: s.name,
    series: buildSeries(r, Math.max(2, sessions[0] * s.w * rng(0.8, 1.2)), s.g * rng(0.99, 1.01)),
  }));
  const events = GA_EVENTS.map((e) => ({
    name: e.name,
    series: buildSeries(r, Math.max(1, conversions[0] * e.w * rng(0.7, 1.4)), growth * rng(0.98, 1.03), 0.3),
  }));
  const topPages = PAGE_SLUGS.map((p, i) => ({
    page: p,
    users: Math.round(users[12] * (0.34 - i * 0.05) * rng(0.8, 1.2)),
    conversions: Math.round(Math.max(0, conversions[12] * (0.3 - i * 0.04) * rng(0.6, 1.3))),
  })).sort((a, b) => b.users - a.users);

  /* GSC */
  const impressions = buildSeries(r, rng(5000, 38000), growth);
  const ctr = +rng(0.022, 0.048).toFixed(3);
  const clicks = impressions.map((im) => Math.round(im * ctr * rng(0.9, 1.1)));
  const gscPosition = []; let p0 = rng(14, 24);
  for (let i = 0; i < 13; i++) { gscPosition.push(+p0.toFixed(1)); p0 = Math.max(3.5, p0 * rng(0.93, 1.0)); }
  const queryPool = trackedKeywords.length
    ? trackedKeywords
    : ["near me services", "best local provider", "open now", "pricing", "reviews", "book online"];
  const topQueries = [...new Set(queryPool)].slice(0, 6).map((q, i) => ({
    query: q,
    clicks: Math.round(clicks[12] * (0.22 - i * 0.025) * rng(0.7, 1.3)),
    impressions: Math.round(impressions[12] * (0.2 - i * 0.02) * rng(0.7, 1.3)),
    position: +(3 + i * 1.7 + r() * 3).toFixed(1),
  }));

  const months = LABELS.map((label, i) => ({
    label,
    gbp: {
      searchViews: searchViews[i], mapViews: mapViews[i], views: searchViews[i] + mapViews[i],
      searchMobile: searchMobile[i], searchDesktop: searchDesktop[i],
      mapsMobile: mapsMobile[i], mapsDesktop: mapsDesktop[i],
      calls: calls[i], directions: directions[i], websiteClicks: gbpClicks[i],
      totalReviews: totalReviewsBase + i * Math.round(3 + r() * 4),
    },
    ga: { users: users[i], sessions: sessions[i], conversions: conversions[i] },
    gsc: { clicks: clicks[i], impressions: impressions[i], position: gscPosition[i] },
  }));

  return { months, rating, engRate, channels, sources, events, topPages, topQueries, gbpTerms };
}

function genPositions(entry) {
  const r = mulberry32(hashStr(entry.id + entry.keyword + entry.city.city + entry.device + entry.engine));
  const days = Math.max(1, entry.days);
  let pos = 6 + r() * 32;
  const out = [Math.round(pos)];
  for (let i = 1; i < days; i++) {
    pos += (r() - 0.55) * 1.1;
    if (r() > 0.97) pos += (r() - 0.5) * 8;
    pos = Math.min(60, Math.max(1, pos));
    out.push(Math.round(pos));
  }
  return out;
}
function trackStats(positions) {
  const n = positions.length;
  const cur = positions[n - 1];
  const at = (d) => (n - 1 - d >= 0 ? positions[n - 1 - d] : null);
  const ch = (d) => { const p = at(d); return p == null ? null : p - cur; };
  return { start: positions[0], cur, d1: ch(1), d7: ch(7), d30: ch(30), life: n > 1 ? positions[0] - cur : null };
}
function avgPosDaysAgo(tracking, daysAgo) {
  // only average entries that actually have history that far back — never fabricate
  // pre-tracking positions by clamping to day 1 (that fakes flat history in trends)
  const vals = tracking.map((t) => t.positions[t.positions.length - 1 - daysAgo]).filter((v) => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

const fmt = (n) => {
  if (n == null || isNaN(n)) return "–";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return Math.round(n).toLocaleString();
};
const pctDelta = (cur, prev) => (!prev ? 0 : ((cur - prev) / prev) * 100);
const money = (n) => "$" + (+n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const linkify = (text) => {
  const parts = String(text || "").split(/(https?:\/\/[^\s]+|www\.[^\s]+)/g);
  return parts.map((p, i) =>
    /^(https?:\/\/|www\.)/.test(p)
      ? <a key={i} href={p.startsWith("http") ? p : "https://" + p} target="_blank" rel="noopener"
          className="underline" style={{ color: "inherit" }}>{p}</a>
      : p
  );
};
const relTime = (ts) => {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return "just now";
  const m = Math.floor(sec / 60); if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60); if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
};

const ACCENTS = [
  { name: "Harbor", hex: "#0E7C66" },
  { name: "Cobalt", hex: "#2456E6" },
  { name: "Plum", hex: "#7C3AED" },
  { name: "Ember", hex: "#EA580C" },
  { name: "Rose", hex: "#E11D48" },
  { name: "Ink", hex: "#1F2A44" },
];
const POS = "#15803D", NEG = "#DC2626";

const FONT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');
.ll-root { font-family: 'Inter', system-ui, sans-serif; color: #18202F; }
.ll-display { font-family: 'Bricolage Grotesque', 'Inter', sans-serif; }
.ll-mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
.ll-root ::-webkit-scrollbar { width: 8px; height: 8px; }
.ll-root ::-webkit-scrollbar-thumb { background: #D7DBE3; border-radius: 8px; }
@media print { .no-print { display: none !important; } .print-full { margin-left: 0 !important; } }
.ll-fade { animation: llfade .35s ease; }
@keyframes llfade { from { opacity: 0; transform: translateY(4px);} to { opacity: 1; transform: none;} }
@media (prefers-reduced-motion: reduce) { .ll-fade { animation: none; } }
.line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.animate-spin { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@media screen {
  .ll-dark { background-color: #0F141E !important; color: #E2E8F0; --chip-bg: #1B2334; --chip-fg: #C3CCDC; }
  .ll-dark [class*="bg-white"] { background-color: #151C2A !important; }
  .ll-dark [class*="bg-gray-50"], .ll-dark [class*="bg-gray-100"] { background-color: #1B2334 !important; }
  .ll-dark [class*="border-gray-"] { border-color: #293349 !important; }
  .ll-dark [class*="text-gray-9"], .ll-dark [class*="text-gray-8"], .ll-dark [class*="text-gray-7"] { color: #E2E8F0 !important; }
  .ll-dark [class*="text-gray-6"], .ll-dark [class*="text-gray-5"] { color: #9AA5B8 !important; }
  .ll-dark [class*="text-gray-4"] { color: #76829A !important; }
  .ll-dark [class*="text-gray-3"] { color: #4D5870 !important; }
  .ll-dark input, .ll-dark select, .ll-dark textarea { background-color: #1B2334; color: #E2E8F0; border-color: #293349; }
  .ll-dark option { background: #1B2334; color: #E2E8F0; }
  .ll-dark [class*="hover:bg-gray-50"]:hover, .ll-dark [class*="hover:bg-gray-100"]:hover { background-color: #222C40 !important; }
  .ll-dark [class*="bg-gray-900"] { background-color: rgba(0,0,0,.65) !important; }
  .ll-dark ::-webkit-scrollbar-thumb { background: #39455E; }
}
`;

function Delta({ pct, invert = false, suffix = "%" }) {
  const good = invert ? pct < 0 : pct > 0;
  const flat = Math.abs(pct) < 0.05;
  const color = flat ? "#6B7280" : good ? POS : NEG;
  const Icon = flat ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold ll-mono" style={{ color }}>
      <Icon size={13} strokeWidth={2.5} />
      {Math.abs(pct).toFixed(suffix === "%" ? 1 : 0)}{suffix}
    </span>
  );
}
function PosChange({ value }) {
  if (value == null) return <span className="text-gray-300">—</span>;
  if (value === 0) return <span className="ll-mono text-xs font-semibold text-gray-400">0</span>;
  const up = value > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="ll-mono inline-flex items-center gap-0.5 text-xs font-semibold" style={{ color: up ? POS : NEG }}>
      <Icon size={13} strokeWidth={2.5} />{Math.abs(value)}
    </span>
  );
}
function Spark({ values, invert = false, color = "#0E7C66", w = 88, h = 26 }) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (w - 4) + 2;
    const t = (v - min) / span;
    const y = invert ? 3 + t * (h - 6) : h - 3 - t * (h - 6);
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} className="block">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function RankChip({ pos, muted = false }) {
  if (pos == null) return <span className="text-gray-300">—</span>;
  const tone = muted
    ? { bg: "#F1F5F9", fg: "#64748B" }
    : pos <= 3 ? { bg: "#DCFCE7", fg: "#166534" } : pos <= 10 ? { bg: "#FEF9C3", fg: "#854D0E" } : { bg: "#F1F5F9", fg: "#475569" };
  return (
    <span className="ll-mono inline-flex min-w-10 items-center justify-center rounded-md px-2 py-0.5 text-sm font-semibold" style={{ background: tone.bg, color: tone.fg }}>
      #{pos}
    </span>
  );
}
function Card({ children, className = "", style }) {
  return <div className={`rounded-2xl border border-gray-200 bg-white ${className}`} style={style}>{children}</div>;
}
function SourceTag({ label }) {
  return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-gray-500">{label}</span>;
}
function StatCard({ icon: Icon, label, value, pct, invert, source, spark, accent, sub, deltaSuffix = "%" }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: accent + "1A", color: accent }}>
            <Icon size={16} />
          </span>
          <div className="text-[13px] font-medium text-gray-600">{label}</div>
        </div>
        <SourceTag label={source} />
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="ll-display text-[30px] font-semibold leading-none tracking-tight">{value}</div>
          <div className="mt-1.5 flex items-center gap-1.5">
            {pct != null && <Delta pct={pct} invert={invert} suffix={deltaSuffix} />}
            {sub && <span className="text-[11px] text-gray-400">{sub}</span>}
          </div>
        </div>
        {spark && <Spark values={spark} invert={invert} color={accent} />}
      </div>
    </Card>
  );
}
function Toggle({ on, onChange, label, desc }) {
  return (
    <button onClick={() => onChange(!on)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-left hover:border-gray-300">
      <div>
        <div className="text-[13px] font-medium text-gray-800">{label}</div>
        {desc && <div className="text-[11px] text-gray-400">{desc}</div>}
      </div>
      <span className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors" style={{ background: on ? "#16A34A" : "#FCA5A5" }}>
        <span className="absolute h-4 w-4 rounded-full bg-white shadow transition-transform" style={{ transform: on ? "translateX(18px)" : "translateX(2px)" }} />
      </span>
    </button>
  );
}
function BrandMark({ name, logo, accent, size = "md" }) {
  const dim = size === "xl" ? "h-16 w-16" : size === "lg" ? "h-10 w-10" : "h-8 w-8";
  const txt = size === "xl" ? "text-[20px]" : "text-[13px]";
  if (logo) return <img src={logo} alt={name} className={`${dim} shrink-0 rounded-xl border border-gray-200 object-cover`} />;
  return (
    <span className={`ll-display flex ${dim} shrink-0 items-center justify-center rounded-xl ${txt} font-bold text-white`} style={{ background: accent || "#1F2A44" }}>
      {name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
    </span>
  );
}
function ProjectMark({ project, size = "sm" }) {
  const dim = size === "md" ? "h-8 w-8 text-[12px]" : "h-6 w-6 text-[10px]";
  if (project.logo) return <img src={project.logo} alt={project.name} className={`${dim.split(" ").slice(0,2).join(" ")} shrink-0 rounded-md border border-gray-200 object-cover`} />;
  return (
    <span className={`ll-display flex ${dim} shrink-0 items-center justify-center rounded-md font-bold text-white`} style={{ background: project.accent }}>
      {project.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 1).toUpperCase() || "P"}
    </span>
  );
}
function LogoUpload({ value, onChange, label = "Upload logo" }) {
  const ref = useRef(null);
  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result);
    reader.readAsDataURL(f);
  };
  return (
    <div className="flex items-center gap-3">
      {value
        ? <img src={value} alt="logo" className="h-12 w-12 rounded-lg border border-gray-200 object-cover" />
        : <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-300"><Upload size={16} /></span>}
      <div className="flex flex-col gap-1">
        <button onClick={() => ref.current?.click()}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[12.5px] font-medium text-gray-600 hover:border-gray-300">
          <Upload size={13} /> {label}
        </button>
        {value && <button onClick={() => onChange(null)} className="text-left text-[11.5px] text-gray-400 hover:text-red-500">Remove</button>}
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={onFile} />
      </div>
    </div>
  );
}
function DateRangeBar({ range, setRange, accent }) {
  const today = new Date();
  const [a, b] = rangeIdx(range);
  const span = b - a + 1;
  const presets = [
    // data is month-granular — "months: 1" selects the current calendar month
    // to date, so label it honestly instead of claiming "last 30 days"
    { label: "This month", months: 1 },
    { label: "Last 3 months", months: 3 },
    { label: "Last 6 months", months: 6 },
    { label: "Last 12 months", months: 12 },
  ];
  const apply = (m) => {
    const start = new Date(today.getFullYear(), today.getMonth() - m + 1, 1);
    setRange({ start: isoDate(start < MONTH_DATES[0] ? MONTH_DATES[0] : start), end: isoDate(today) });
  };
  return (
    <Card className="flex flex-wrap items-center gap-2 px-4 py-3 no-print">
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-gray-500"><Calendar size={14} style={{ color: accent }} /> Date range</span>
      {presets.map((p) => {
        const active = span === p.months && b === 12;
        return (
          <button key={p.label} onClick={() => apply(p.months)}
            className="rounded-full border px-3 py-1 text-[12px] font-medium"
            style={active ? { background: accent, borderColor: accent, color: "#fff" } : { borderColor: "#E5E7EB", color: "var(--chip-fg, #4B5563)", background: "var(--chip-bg, #fff)" }}>
            {p.label}
          </button>
        );
      })}
      <span className="mx-1 hidden h-5 w-px bg-gray-200 sm:block" />
      <input type="date" value={range.start} min={isoDate(MONTH_DATES[0])} max={range.end}
        onChange={(e) => e.target.value && setRange({ ...range, start: e.target.value })}
        className="ll-mono rounded-lg border border-gray-200 px-2 py-1.5 text-[12px]" />
      <span className="text-gray-300">→</span>
      <input type="date" value={range.end} min={range.start} max={isoDate(today)}
        onChange={(e) => e.target.value && setRange({ ...range, end: e.target.value })}
        className="ll-mono rounded-lg border border-gray-200 px-2 py-1.5 text-[12px]" />
      <span className="ml-auto text-[11px] text-gray-400">
        {LABELS[a]} – {LABELS[b]} · compared with the previous {span} month{span > 1 ? "s" : ""}
      </span>
    </Card>
  );
}
function DarkToggle({ dark, setDark }) {
  return (
    <button onClick={() => setDark((d) => !d)} title="Toggle bright / dark mode"
      className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] font-medium text-gray-600 hover:border-gray-300">
      {dark ? <Sun size={14} /> : <Moon size={14} />} {dark ? "Bright" : "Dark"}
    </button>
  );
}
const tooltipStyle = {
  borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 12,
  boxShadow: "0 8px 24px rgba(16,24,38,.08)", fontFamily: "Inter, sans-serif",
};
const inputCls = "w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px]";
function Labeled({ label, children }) {
  return (
    <div>
      <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      {children}
    </div>
  );
}

const DEFAULT_WIDGETS = {
  gbp: { views: true, breakdown: true, calls: true, directions: true, websiteClicks: true, searchKeywords: true, platformDevice: true },
  ga: { users: true, sessions: true, engagement: true, conversions: true, channels: true, sources: true, events: true, topPages: true },
  gsc: { clicks: true, impressions: true, ctr: true, position: true, topQueries: true },
  ranks: { insights: true, distribution: true, table: true },
};
const cloneWidgets = () => JSON.parse(JSON.stringify(DEFAULT_WIDGETS));

let seedN = 0;
const seedEntry = (domain, keyword, cityName, device, days, opts = {}) => ({
  id: "t" + (++seedN),
  domain, keyword,
  engine: opts.engine || "Google",
  city: findCity(cityName),
  device,
  reportingType: opts.once ? "One time" : "Recurring",
  rerunDays: opts.once ? null : (opts.rerunDays || 1),
  scrape: "DataForSEO SERP API",
  days,
});
const mkOpt = () => ({
  gbp: { connected: false, bizName: "", categories: [], phone: "", website: "", address: "", description: "",
    hours: { Mon: "9:00 AM – 5:00 PM", Tue: "9:00 AM – 5:00 PM", Wed: "9:00 AM – 5:00 PM", Thu: "9:00 AM – 5:00 PM", Fri: "9:00 AM – 5:00 PM", Sat: "Closed", Sun: "Closed" },
    svcCats: [], services: [], products: [], posts: [], photos: [] },
  website: { connected: false, platform: null, siteKey: null, verified: false, credential: null, crawled: false, lastCrawl: null, pages: [], blogs: [] },
  social: {
    accounts: [
      { id: "fb", platform: "Facebook Page", connected: false, handle: "", name: "", bio: "" },
      { id: "ig", platform: "Instagram Business", connected: false, handle: "", name: "", bio: "" },
      { id: "li", platform: "LinkedIn Page", connected: false, handle: "", name: "", bio: "" },
      { id: "x", platform: "X (Twitter)", connected: false, handle: "", name: "", bio: "" },
      { id: "yt", platform: "YouTube Channel", connected: false, handle: "", name: "", bio: "" },
      { id: "tt", platform: "TikTok Business", connected: false, handle: "", name: "", bio: "" },
      { id: "pin", platform: "Pinterest Business", connected: false, handle: "", name: "", bio: "" },
      { id: "th", platform: "Threads", connected: false, handle: "", name: "", bio: "" },
      { id: "bs", platform: "Bluesky", connected: false, handle: "", name: "", bio: "" },
    ],
    posts: [] },
});
const mkProject = (id, name, website, accent, tracking, records = [], opt = null) => ({
  id, name, website, accent, logo: null, widgets: cloneWidgets(),
  integrations: { gbp: true, ga: true, gsc: true },
  tracking, records, opt: opt || mkOpt(),
});

const ROLE_PRESETS = {
  Admin:   { viewData: true, manageKeywords: true, createReports: true, manageClients: true, manageTasks: true },
  Manager: { viewData: true, manageKeywords: true, createReports: true, manageClients: false, manageTasks: true },
  Viewer:  { viewData: true, manageKeywords: false, createReports: false, manageClients: false, manageTasks: false },
};
const SEED_COMPANY = {
  name: "SERP Squad",
  logo: null,
  accent: "#1F2A44",
  dfs: { login: "demo@serpsquad.io", password: "demo-api-password", connected: true }, // demo creds — connected must always mean credentials exist
  apis: {}, // credentials for every API_REGISTRY entry, keyed by id → { values, connected }
  team: [
    { id: "u1", name: "You (Owner)", email: "owner@serpsquad.io", password: "", role: "Admin", projects: "all", perms: { ...ROLE_PRESETS.Admin }, isOwner: true },
    { id: "u2", name: "Rifat Hasan", email: "rifat@serpsquad.io", password: "squad123", role: "Manager", projects: ["p1", "p2"], perms: { ...ROLE_PRESETS.Manager } },
    { id: "u3", name: "Sara Lim", email: "sara@serpsquad.io", password: "squad123", role: "Viewer", projects: ["p4"], perms: { ...ROLE_PRESETS.Viewer } },
  ],
  finance: {
    clientEntries: [
      { id: "f1", clientId: "cl1", type: "earning", label: "Monthly SEO retainer", amount: 1500 },
      { id: "f2", clientId: "cl1", type: "spending", label: "Content writing", amount: 250 },
      { id: "f3", clientId: "cl1", type: "spending", label: "Citations & directories", amount: 60 },
      { id: "f4", clientId: "cl2", type: "earning", label: "Monthly SEO retainer", amount: 900 },
      { id: "f5", clientId: "cl2", type: "spending", label: "Link building", amount: 120 },
      { id: "f6", clientId: "cl3", type: "earning", label: "Monthly SEO retainer", amount: 600 },
      { id: "f7", clientId: "cl3", type: "spending", label: "Local citations", amount: 80 },
    ],
    universal: [
      { id: "g1", label: "Team salaries", amount: 2800 },
      { id: "g2", label: "DataForSEO API", amount: 90 },
      { id: "g3", label: "Tools (Ahrefs, Figma…)", amount: 240 },
      { id: "g4", label: "Hosting & infrastructure", amount: 60 },
    ],
  },
  activity: [
    { id: "a1", ts: Date.now() - 0.2 * 3600000, member: "Rifat Hasan", action: "Viewed project", target: "Bright Smile — Brooklyn" },
    { id: "a2", ts: Date.now() - 1.1 * 3600000, member: "Rifat Hasan", action: "Added 3 keywords", target: "Bright Smile — Manhattan" },
    { id: "a3", ts: Date.now() - 4 * 3600000, member: "Sara Lim", action: "Viewed client", target: "Bloom & Vine" },
    { id: "a4", ts: Date.now() - 7 * 3600000, member: "Sara Lim", action: "Logged in", target: "" },
  ],
};

const SEED_CLIENTS = [
  {
    id: "cl1", name: "Bright Smile Group",
    contact: "Dr. Hannah Park", email: "hannah@brightsmile.com", phone: "+1 212 555 0148",
    companyName: "Bright Smile Dental Group LLC", companyWebsite: "brightsmiledental.com", address: "New York, NY",
    whiteLabel: { enabled: false, name: "", website: "", logo: null },
    login: { enabled: false, email: "hannah@brightsmile.com", password: "", projectIds: ["p1", "p2"], canViewRanks: true, canDownload: true, canManageTasks: false, canComment: true },
    projects: [
      mkProject("p1", "Bright Smile — Manhattan", "brightsmiledental.com", "#0E7C66", [
        seedEntry("brightsmiledental.com", "dentist near me", "New York", "Mobile", 240),
        seedEntry("brightsmiledental.com", "teeth whitening", "New York", "Desktop", 180),
        seedEntry("brightsmiledental.com", "dental implants", "New York", "Desktop", 365, { rerunDays: 7 }),
      ], [
        {
          id: "r1", name: "March On-Page Sprint",
          createdAt: Date.now() - 12 * 864e5, updatedAt: Date.now() - 1 * 864e5,
          dueDate: isoDate(new Date(Date.now() + 5 * 864e5)), completedAt: null,
          assignees: ["You (Owner)", "Rifat Hasan"],
          checklists: [
            { id: "cl1", name: "Homepage optimization", tasks: [
              { id: "t1", title: "Rewrite title & meta description", createdAt: Date.now() - 12 * 864e5, dueDate: isoDate(new Date(Date.now() - 2 * 864e5)), completedAt: Date.now() - 3 * 864e5, assignees: ["Rifat Hasan"] },
              { id: "t2", title: "Add LocalBusiness schema markup", createdAt: Date.now() - 10 * 864e5, dueDate: isoDate(new Date(Date.now() - 1 * 864e5)), completedAt: null, assignees: ["Rifat Hasan"] },
              { id: "t3", title: "Compress hero images to WebP", createdAt: Date.now() - 8 * 864e5, dueDate: isoDate(new Date(Date.now() + 3 * 864e5)), completedAt: null, assignees: ["You (Owner)"] },
            ]},
            { id: "cl2", name: "GBP updates", tasks: [
              { id: "t4", title: "Upload 10 new interior photos", createdAt: Date.now() - 6 * 864e5, dueDate: isoDate(new Date(Date.now() + 2 * 864e5)), completedAt: null, assignees: ["Sara Lim"] },
            ]},
          ],
          comments: [{ id: "c1", ts: Date.now() - 2 * 864e5, author: "Rifat Hasan", text: "Schema draft is ready — review before I push it live." }],
          activity: [
            { id: "pa1", ts: Date.now() - 3 * 864e5, author: "Rifat Hasan", text: 'completed task "Rewrite title & meta description"' },
            { id: "pa2", ts: Date.now() - 6 * 864e5, author: "You (Owner)", text: 'added checklist "GBP updates"' },
            { id: "pa3", ts: Date.now() - 12 * 864e5, author: "You (Owner)", text: "created this record" },
          ],
        },
      ], {
        gbp: { connected: true, bizName: "Bright Smile Dental — Manhattan", categories: ["Dentist", "Cosmetic dentist"],
          phone: "(212) 555-0142", website: "https://brightsmiledental.com", address: "350 5th Ave, New York, NY 10118",
          description: "Family and cosmetic dentistry in Midtown Manhattan. Same-day appointments, gentle care and modern equipment for whitening, implants and routine checkups.",
          hours: { Mon: "8:00 AM – 6:00 PM", Tue: "8:00 AM – 6:00 PM", Wed: "8:00 AM – 6:00 PM", Thu: "8:00 AM – 6:00 PM", Fri: "8:00 AM – 4:00 PM", Sat: "9:00 AM – 2:00 PM", Sun: "Closed" },
          svcCats: [
            { id: "sc1", name: "Dentist", services: [
              { id: "sv1", name: "Teeth whitening", desc: "In-office Zoom whitening, 60–90 minutes.", priceType: "fixed", price: "349" },
              { id: "sv2", name: "Dental implants", desc: "Consultation, placement and crown.", priceType: "from", price: "2800" },
              { id: "sv3", name: "Routine cleaning & exam", desc: "Cleaning, X-rays and full exam.", priceType: "fixed", price: "120" },
            ]},
            { id: "sc2", name: "Cosmetic dentist", services: [
              { id: "sv4", name: "Invisalign", desc: "Clear aligner treatment with free initial scan.", priceType: "from", price: "3500" },
            ]},
          ],
          services: [],
          products: [
            { id: "pd1", name: "Whitening take-home kit", desc: "Custom trays + professional gel.", price: "$149", image: null },
          ],
          posts: [
            { id: "gp1", type: "offer", title: "New patient special — $99 exam", body: "Cleaning, X-rays and exam for new patients this month.", cta: "Book", ctaUrl: "https://brightsmiledental.com/book", startDate: isoDate(new Date(Date.now() - 5 * 864e5)), endDate: isoDate(new Date(Date.now() + 9 * 864e5)), coupon: "SMILE99", image: null, status: "published", publishAt: null, createdAt: Date.now() - 5 * 864e5 },
            { id: "gp2", type: "update", title: "", body: "We now offer Saturday appointments! Book online or call us.", cta: "Learn more", ctaUrl: "https://brightsmiledental.com", image: null, status: "scheduled", publishAt: Date.now() + 2 * 864e5, createdAt: Date.now() - 1 * 864e5 },
          ],
          photos: [{ id: "ph1", name: "reception-area.jpg", addedAt: Date.now() - 20 * 864e5 }, { id: "ph2", name: "treatment-room.jpg", addedAt: Date.now() - 6 * 864e5 }] },
        website: { connected: true, platform: "wordpress", siteKey: "ss_live_p1_k7f3x9", verified: true, crawled: true, lastCrawl: Date.now() - 2 * 864e5, credential: { type: "Application Password", masked: "brig••••••••", status: "valid", addedAt: Date.now() - 20 * 864e5 },
          pages: [
            { id: "pg1", url: "/", name: "Home", updatedAt: Date.now() - 2 * 864e5, metaTitle: "Bright Smile Dental \u2014 Dentist in Midtown Manhattan", metaDesc: "Family & cosmetic dentistry on Madison Ave. Same-day appointments, gentle care. Book online.", dirty: false,
              content: [
                { id: "c1", kind: "heading", level: 1, text: "Manhattan's friendliest dental care" },
                { id: "c2", kind: "text", text: "From routine cleanings to full smile makeovers, our Madison Avenue clinic combines gentle care with modern equipment. Same-day appointments available for new patients.", links: [{ id: "lk1", phrase: "Same-day appointments", href: "https://brightsmiledental.com/book" }] },
                { id: "c3", kind: "image", src: "hero-office.jpg", alt: "Reception area of Bright Smile Dental Manhattan", title: "Bright Smile Dental office", dataUrl: null },
                { id: "c4", kind: "heading", level: 2, text: "Why patients choose us" },
                { id: "c5", kind: "text", text: "Over 1,200 five-star reviews, transparent pricing, and a team that actually explains what's happening. We accept most major insurance plans.", links: [] },
              ] },
            { id: "pg2", url: "/teeth-whitening", name: "Teeth Whitening", metaTitle: "Teeth Whitening NYC \u2014 Zoom In-Office | Bright Smile", metaDesc: "Professional Zoom teeth whitening in Manhattan. Up to 8 shades brighter in one visit.", dirty: false,
              content: [
                { id: "c6", kind: "heading", level: 1, text: "Teeth whitening in NYC" },
                { id: "c7", kind: "text", text: "In-office Zoom whitening lifts up to 8 shades in a single 90-minute visit. Includes a custom take-home touch-up kit.", links: [] },
                { id: "c8", kind: "image", src: "whitening-before-after.jpg", alt: "", title: "", dataUrl: null },
              ] },
            { id: "pg3", url: "/dental-implants", name: "Dental Implants", metaTitle: "Dental Implants Manhattan", metaDesc: "", dirty: false,
              content: [
                { id: "c9", kind: "heading", level: 1, text: "Dental implants" },
                { id: "c10", kind: "text", text: "Permanent, natural-looking replacements \u2014 consultation and 3D scan included.", links: [] },
              ] },
          ],
          blogs: [
            { id: "bl1", title: "How often should you whiten your teeth?", slug: "how-often-whiten-teeth", body: "Professional whitening is safe every 12–18 months...", status: "published", publishAt: null, createdAt: Date.now() - 14 * 864e5 },
            { id: "bl2", title: "Implants vs bridges: what lasts longer?", slug: "implants-vs-bridges", body: "Draft in progress...", status: "scheduled", publishAt: Date.now() + 3 * 864e5, createdAt: Date.now() - 2 * 864e5 },
          ] },
        social: {
          accounts: [
            { id: "fb", platform: "Facebook Page", connected: true, handle: "@brightsmilenyc", name: "Bright Smile Dental NYC", bio: "Midtown Manhattan family & cosmetic dentistry. Book online." },
            { id: "ig", platform: "Instagram Business", connected: true, handle: "@brightsmile.nyc", name: "Bright Smile Dental", bio: "Smiles made in Manhattan ✨ Whitening · Implants · Invisalign" },
            { id: "li", platform: "LinkedIn Page", connected: false, handle: "", name: "", bio: "" },
            { id: "x", platform: "X (Twitter)", connected: false, handle: "", name: "", bio: "" },
            { id: "yt", platform: "YouTube Channel", connected: false, handle: "", name: "", bio: "" },
            { id: "tt", platform: "TikTok Business", connected: false, handle: "", name: "", bio: "" },
            { id: "pin", platform: "Pinterest Business", connected: false, handle: "", name: "", bio: "" },
            { id: "th", platform: "Threads", connected: false, handle: "", name: "", bio: "" },
            { id: "bs", platform: "Bluesky", connected: false, handle: "", name: "", bio: "" },
          ],
          posts: [
            { id: "sp1", platforms: ["fb", "ig"], text: "Saturday appointments are here! Tag someone who keeps 'forgetting' the dentist 😁 Book at brightsmiledental.com", image: null, status: "published", publishAt: null, createdAt: Date.now() - 3 * 864e5 },
          ] },
      }),
      mkProject("p2", "Bright Smile — Brooklyn", "brooklyn.brightsmiledental.com", "#7C3AED", [
        seedEntry("brooklyn.brightsmiledental.com", "dentist near me", "Brooklyn", "Mobile", 240),
        seedEntry("brooklyn.brightsmiledental.com", "emergency dentist", "Brooklyn", "Mobile", 120),
        seedEntry("brooklyn.brightsmiledental.com", "root canal treatment", "Queens", "Mobile", 90, { rerunDays: 3 }),
      ]),
    ],
  },
  {
    id: "cl2", name: "Metro Plumbing Co.",
    contact: "Luis Romero", email: "luis@metroplumbing.co", phone: "+1 512 555 0190",
    companyName: "Metro Plumbing Co.", companyWebsite: "metroplumbing.co", address: "Austin, TX",
    whiteLabel: { enabled: false, name: "", website: "", logo: null },
    login: { enabled: false, email: "luis@metroplumbing.co", password: "", projectIds: ["p3"], canViewRanks: true, canDownload: true, canManageTasks: false, canComment: true },
    projects: [
      mkProject("p3", "Metro Plumbing — Austin", "metroplumbing.co", "#2456E6", [
        seedEntry("metroplumbing.co", "plumber near me", "Austin", "Mobile", 300),
        seedEntry("metroplumbing.co", "water heater repair", "Austin", "Desktop", 200),
        seedEntry("metroplumbing.co", "emergency plumber", "Round Rock", "Mobile", 150),
        seedEntry("metroplumbing.co", "drain cleaning", "Austin", "Mobile", 60, { engine: "Bing", rerunDays: 7 }),
      ]),
    ],
  },
  {
    id: "cl3", name: "Bloom & Vine",
    contact: "Imogen Hale", email: "imogen@bloomandvine.shop", phone: "+44 20 7946 0921",
    companyName: "Bloom & Vine Ltd.", companyWebsite: "bloomandvine.shop", address: "London, UK",
    whiteLabel: { enabled: true, name: "Bloom & Vine Insights", website: "bloomandvine.shop", logo: null },
    login: { enabled: true, email: "imogen@bloomandvine.shop", password: "bloom123", projectIds: ["p4"], canViewRanks: true, canDownload: true, canManageTasks: true, canComment: true },
    projects: [
      mkProject("p4", "Bloom & Vine — London", "bloomandvine.shop", "#E11D48", [
        seedEntry("bloomandvine.shop", "florist near me", "London", "Mobile", 180),
        seedEntry("bloomandvine.shop", "same day flower delivery", "London", "Mobile", 180),
        seedEntry("bloomandvine.shop", "wedding flowers", "London", "Desktop", 90, { once: true }),
      ]),
    ],
  },
];

/* demo section grants (project.teamAccess[memberId][sectionKey]) — what each
   assigned team member can open once they sign in; managed per project in
   Project settings → Team. Without at least one grant a member sees nothing. */
{
  const grant = (cIdx, pId, mid, keys) => {
    const p = SEED_CLIENTS[cIdx].projects.find((x) => x.id === pId);
    if (p) p.teamAccess = { ...(p.teamAccess || {}), [mid]: Object.fromEntries(keys.map((k) => [k, true])) };
  };
  grant(0, "p1", "u2", ["ranks", "gbp", "web", "records", "wiki", "webPages", "webPosts"]); // Rifat (Manager)
  grant(0, "p2", "u2", ["ranks", "web", "records"]);
  grant(2, "p4", "u3", ["ranks", "web"]); // Sara (Viewer)
}

function hydrate(entry) {
  // extraPositions holds re-check results persisted on the tracking entry in state,
  // so they survive rehydration (keyword add/delete, project switch, report builds)
  const positions = [...genPositions(entry), ...(entry.extraPositions || [])];
  const r = mulberry32(hashStr(entry.id + entry.keyword + "url"));
  const url = "https://" + entry.domain + PAGE_SLUGS[Math.floor(r() * 3)];
  return { ...entry, positions, url, stats: trackStats(positions) };
}

function OverviewView({ project, data, tracking, cmp, accent, clientView }) {
  const [metric, setMetric] = useState("gbpViews");
  const cur = data.months[12], prev = data.months[12 - cmp];
  const W = project.widgets, I = project.integrations;

  const avgNow = tracking.length ? avgPosDaysAgo(tracking, 0) : 0;
  const avgPrev = tracking.length ? avgPosDaysAgo(tracking, cmp * 30) : null;
  const top3 = tracking.filter((t) => t.stats.cur <= 3).length;
  const top3Prev = tracking.filter((t) => {
    const i = t.positions.length - 1 - cmp * 30;
    return i >= 0 && t.positions[i] <= 3; // a keyword not yet tracked back then wasn't in the top 3
  }).length;

  const METRICS = {
    gbpViews: { label: "Profile views (GBP)", get: (m) => m.gbp.views, show: I.gbp },
    gaUsers: { label: "Website users (GA4)", get: (m) => m.ga.users, show: I.ga },
    gscClicks: { label: "Search clicks (GSC)", get: (m) => m.gsc.clicks, show: I.gsc },
    avgRank: { label: "Avg. ranking position", get: (_, i) => { const v = avgPosDaysAgo(tracking, (12 - i) * 30); return v == null ? null : +v.toFixed(1); }, invert: true, show: tracking.length > 0 },
  };
  const activeMetric = METRICS[metric].show ? metric : Object.keys(METRICS).find((k) => METRICS[k].show) || "gbpViews";
  const chartData = data.months.map((m, i) => ({ label: m.label, value: METRICS[activeMetric].get(m, i) }));

  const movers = [...tracking]
    .map((t) => ({ ...t, change: t.stats.d30 ?? t.stats.life ?? 0 }))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 5); // biggest movers in EITHER direction — a −20 drop matters more than a +1 gain
  const topEvents = [...data.events].sort((a, b) => b.series[12] - a.series[12]).slice(0, 4);

  const summary = [];
  if (I.gbp) summary.push(`Your business profile was seen ${fmt(cur.gbp.views)} times on Google Search & Maps this month (${pctDelta(cur.gbp.views, prev.gbp.views) >= 0 ? "up" : "down"} ${Math.abs(pctDelta(cur.gbp.views, prev.gbp.views)).toFixed(0)}% vs ${cmp} month${cmp > 1 ? "s" : ""} ago).`);
  if (I.gbp) summary.push(`Customers took ${fmt(cur.gbp.calls + cur.gbp.directions + cur.gbp.websiteClicks)} actions — calls, direction requests and website visits.`);
  if (tracking.length) summary.push(`${top3} of your ${tracking.length} tracked keywords now rank in Google's top 3${top3 - top3Prev > 0 ? `, ${top3 - top3Prev} more than before` : ""}.`);

  return (
    <div className="ll-fade space-y-5">
      {clientView && (
        <Card className="p-5" style={{ borderColor: accent + "55", background: accent + "0A" }}>
          <div className="ll-display mb-2 text-lg font-semibold" style={{ color: accent }}>This month at a glance</div>
          <ul className="space-y-1.5">
            {summary.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-[13.5px] text-gray-700">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" style={{ color: accent }} /> {s}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {I.gbp && W.gbp.views && (
          <StatCard icon={Eye} label="Profile views" source="GBP" accent={accent}
            value={fmt(cur.gbp.views)} pct={pctDelta(cur.gbp.views, prev.gbp.views)}
            spark={data.months.map((m) => m.gbp.views)} />
        )}
        {I.gbp && W.gbp.calls && (
          <StatCard icon={Phone} label="Phone calls" source="GBP" accent={accent}
            value={fmt(cur.gbp.calls)} pct={pctDelta(cur.gbp.calls, prev.gbp.calls)}
            spark={data.months.map((m) => m.gbp.calls)} />
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
        {I.ga && W.ga.conversions && (
          <StatCard icon={BarChart3} label="Conversions" source="GA4" accent={accent}
            value={fmt(cur.ga.conversions)} pct={pctDelta(cur.ga.conversions, prev.ga.conversions)}
            spark={data.months.map((m) => m.ga.conversions)} />
        )}
        {I.ga && W.ga.events && (
          <StatCard icon={Zap} label={topEvents[0]?.name || "events"} source="GA4" accent={accent}
            value={fmt(topEvents[0]?.series[12])} pct={pctDelta(topEvents[0]?.series[12], topEvents[0]?.series[12 - cmp])}
            spark={topEvents[0]?.series} sub="top event" />
        )}
      </div>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="ll-display text-[15px] font-semibold">13-month trend</div>
          <div className="flex flex-wrap gap-1.5 no-print">
            {Object.entries(METRICS).filter(([, m]) => m.show).map(([key, m]) => (
              <button key={key} onClick={() => setMetric(key)}
                className="rounded-full border px-3 py-1 text-xs font-medium"
                style={activeMetric === key
                  ? { background: accent, borderColor: accent, color: "#fff" }
                  : { borderColor: "#E5E7EB", color: "var(--chip-fg, #4B5563)", background: "var(--chip-bg, #fff)" }}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="ovGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity={0.22} />
                <stop offset="100%" stopColor={accent} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} reversed={!!METRICS[activeMetric].invert} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area type="monotone" dataKey="value" name={METRICS[activeMetric].label} stroke={accent} strokeWidth={2.2} fill="url(#ovGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

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

function CitySelect({ value, onChange }) {
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

function Seg({ options, value, onChange, icons, accent }) {
  return (
    <div className="flex rounded-lg border border-gray-200 p-0.5">
      {options.map((o, i) => {
        const Icon = icons?.[i];
        return (
          <button key={o} onClick={() => onChange(o)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium"
            style={value === o ? { background: accent, color: "#fff" } : { color: "var(--chip-fg, #4B5563)" }}>
            {Icon && <Icon size={13} />}{o}
          </button>
        );
      })}
    </div>
  );
}
function AddKeywordModal({ project, dfsConnected, onClose, onAdd, accent }) {
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

function RankTrackingView({ project, tracking, dfsConnected, accent, onAdd, onDelete, onRerun, readOnly = false }) {
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
      /* --- DEMO: simulate the backend round-trip (0.8 – 2 sec) ---
         In production, replace this block with:
           const result = await rerunNow(ids);
           // result.updated contains fresh {id, positions, url} arrays
           // your onUpdate(result.updated) callback should merge them
           // into the project's tracking array in state.
         ------------------------------------------------------------ */
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 1200));
      // Demo: nudge each selected keyword's position by ±1 to ±3.
      // Results go through onRerun → project state (never mutate the memoized
      // hydrated entries — those regenerate on the next hydrate and edits vanish).
      // Only entries visible under the current filters can be re-checked.
      const updates = ids.map((id) => {
        const entry = tracking.find((t) => t.id === id);
        if (!entry) return null;
        const shift = Math.round((Math.random() - 0.45) * 3);
        return { id, newPos: Math.max(1, Math.min(60, entry.stats.cur + shift)) };
      }).filter(Boolean);
      onRerun?.(updates);
      setRerunResult({ ok: updates.length, ts: Date.now() });
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
                  : <><RefreshCw size={13} /> Successfully re-checked {rerunResult.ok} keyword{rerunResult.ok > 1 ? "s" : ""}. Positions updated.</>}
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

function GbpView({ project, data, range, setRange, accent }) {
  const W = project.widgets.gbp;
  const [a, b] = rangeIdx(range);
  const seg = data.months.slice(a, b + 1);
  const prevSeg = a - seg.length >= 0 ? data.months.slice(a - seg.length, a) : null;
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
  const svNow = data.months[12].gbp.searchViews || 1;
  const svSeg = tot((m) => m.gbp.searchViews);
  const svPrev = prevSeg ? prevSeg.reduce((s, m) => s + m.gbp.searchViews, 0) : null;
  const cmpMonths = Math.min(12, seg.length); // per-term prev, same as ReportBuilder — dashboard and reports must agree
  const terms = data.gbpTerms.map((t) => ({
    term: t.term,
    impressions: Math.max(1, Math.round(t.impressions * (svSeg / svNow))),
    pct: svPrev != null ? pctDelta(t.impressions, t.prev(cmpMonths)) : null,
  }));
  const totalTerms = terms.reduce((x, t) => x + t.impressions, 0);

  return (
    <div className="ll-fade space-y-5">
      <DateRangeBar range={range} setRange={setRange} accent={accent} />
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
    </div>
  );
}

function SectionHeader({ icon: Icon, title, sub, accent }) {
  return (
    <div className="flex items-center gap-2.5 pt-1">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: accent + "1A", color: accent }}><Icon size={15} /></span>
      <div>
        <div className="ll-display text-[15px] font-semibold leading-tight">{title}</div>
        {sub && <div className="text-[11px] text-gray-400">{sub}</div>}
      </div>
    </div>
  );
}

function WebsitePerformanceView({ project, data, range, setRange, accent }) {
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

const WIDGET_META = {
  gbp: { title: "Business Profile", items: { views: "Profile views", breakdown: "Search vs Maps breakdown", calls: "Phone calls", directions: "Direction requests", websiteClicks: "Website clicks", searchKeywords: "Searches by keywords", platformDevice: "Views by platform & device" } },
  ga: { title: "Website Performance — GA4", items: { users: "Users", sessions: "Sessions", engagement: "Engagement rate", conversions: "Conversions", channels: "Traffic channels", sources: "Traffic sources", events: "Event counts", topPages: "Top landing pages" } },
  gsc: { title: "Website Performance — Search Console", items: { clicks: "Clicks", impressions: "Impressions", ctr: "Average CTR", position: "Average position", topQueries: "Top queries" } },
  ranks: { title: "Keyword Rank Tracking", items: { insights: "Insight cards", distribution: "Ranking distribution", table: "Tracking table" } },
};

function ProjectSettingsView({ project, dfsConnected, update, accent }) {
  const setWidget = (group, key, val) =>
    update({ widgets: { ...project.widgets, [group]: { ...project.widgets[group], [key]: val } } });
  const setIntegration = (key, val) => update({ integrations: { ...project.integrations, [key]: val } });

  const GOOGLE_SOURCES = [
    { key: "gbp", name: "Google Business Profile", desc: "Views, calls, directions, search terms — Business Profile Performance API" },
    { key: "ga", name: "Google Analytics 4", desc: "Users, sessions, sources, events — Analytics Data API" },
    { key: "gsc", name: "Google Search Console", desc: "Clicks, impressions, queries — Search Console API" },
  ];

  return (
    <div className="ll-fade grid gap-5 lg:grid-cols-2">
      <Card className="p-5">
        <div className="mb-1 flex items-center gap-2"><Link2 size={16} style={{ color: accent }} /><span className="ll-display text-[15px] font-semibold">Google data sources</span></div>
        <p className="mb-4 text-[12px] text-gray-400">Connect this project's Google properties with OAuth. Demo data is shown until live APIs are wired to your backend.</p>
        <div className="space-y-2.5">
          {GOOGLE_SOURCES.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-3.5 py-3">
              <div>
                <div className="text-[13px] font-medium">{s.name}</div>
                <div className="text-[11px] text-gray-400">{s.desc}</div>
              </div>
              <button onClick={() => setIntegration(s.key, !project.integrations[s.key])}
                className="shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
                style={project.integrations[s.key] ? { background: "#DCFCE7", color: "#166534" } : { background: accent, color: "#fff" }}>
                {project.integrations[s.key] ? "✓ Connected" : "Connect"}
              </button>
            </div>
          ))}
          <div className="flex items-start gap-2.5 rounded-xl bg-gray-50 px-3.5 py-3 text-[12px] text-gray-500">
            <KeyRound size={14} className="mt-0.5 shrink-0 text-gray-400" />
            <span>Keyword rank tracking uses your <b>company-wide DataForSEO API</b>{dfsConnected ? " (connected)" : " (not connected)"} — manage it from the gear icon next to SERP Squad → API settings. Nothing to configure per project.</span>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-1 flex items-center gap-2"><Building2 size={16} style={{ color: accent }} /><span className="ll-display text-[15px] font-semibold">Project details</span></div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input value={project.name} onChange={(e) => update({ name: e.target.value })} className={inputCls} placeholder="Project name" />
          <input value={project.website} onChange={(e) => update({ website: e.target.value })} className={inputCls} placeholder="Website" />
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

      <Card className="p-5 lg:col-span-2">
        <div className="mb-1 flex items-center gap-2"><LayoutDashboard size={16} style={{ color: accent }} /><span className="ll-display text-[15px] font-semibold">Choose what to show</span></div>
        <p className="mb-4 text-[12px] text-gray-400">Turn insights on or off per data source — only enabled widgets appear on the dashboard and in client reports.</p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Object.entries(WIDGET_META).map(([group, meta]) => (
            <div key={group}>
              <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-gray-400">{meta.title}</div>
              <div className="space-y-1.5">
                {Object.entries(meta.items).map(([key, label]) => (
                  <Toggle key={key} label={label} on={project.widgets[group][key]} onChange={(v) => setWidget(group, key, v)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Modal({ title, sub, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4" onClick={onClose}>
      <div className={`max-h-[92vh] w-full ${wide ? "max-w-2xl" : "max-w-md"} overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="ll-display text-lg font-semibold">{title}</div>
            {sub && <div className="text-[12px] text-gray-400">{sub}</div>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function RoleBadge({ role }) {
  const tone = role === "Admin" ? { bg: "#FEE2E2", fg: "#991B1B" } : role === "Manager" ? { bg: "#DBEAFE", fg: "#1E40AF" } : { bg: "#F1F5F9", fg: "#475569" };
  return <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ background: tone.bg, color: tone.fg }}>{role}</span>;
}

/* ================= API settings (Company Settings → API settings) =================
   Central registry of EVERY external credential the tool uses. When a new feature
   needs an API key / OAuth app, add one entry to API_REGISTRY below — it appears in
   Company Settings → API settings automatically (grouped card, status pill,
   save & validate, disconnect). Values are stored in company.apis[id] as
   { values, connected }. DataForSEO is special-cased (useDfs) to company.dfs so
   existing rank-tracking wiring keeps working untouched. */
const API_REGISTRY = [
  {
    group: "SEO data",
    icon: BarChart3,
    items: [
      {
        id: "dataforseo", name: "DataForSEO SERP API", useDfs: true,
        desc: "Powers keyword rank tracking for every project — the scheduler batches up to 100 SERP scans per call.",
        docs: "app.dataforseo.com/api-access",
        fields: [
          { key: "login", label: "API login (email)", placeholder: "you@agency.com" },
          { key: "password", label: "API password", secret: true, placeholder: "••••••••" },
        ],
      },
    ],
  },
  {
    group: "Google",
    icon: Globe,
    items: [
      {
        id: "googleOauth", name: "Google Cloud OAuth app",
        desc: "One OAuth client powers every Google connection: Business Profile (calls, views), Analytics 4 (users, conversions) and Search Console (clicks, queries). Clients then authorize with one click.",
        docs: "console.cloud.google.com/apis/credentials",
        scopes: ["business.manage", "analytics.readonly", "webmasters.readonly"],
        fields: [
          { key: "clientId", label: "OAuth Client ID", placeholder: "xxxxx.apps.googleusercontent.com" },
          { key: "clientSecret", label: "OAuth Client Secret", secret: true, placeholder: "GOCSPX-…" },
          { key: "redirectUri", label: "Authorized redirect URI", placeholder: "https://app.yourdomain.com/oauth/google/callback" },
        ],
      },
    ],
  },
  {
    group: "AI providers",
    icon: Zap,
    items: [
      {
        id: "openai", name: "OpenAI API",
        desc: "GPT models for content briefs, meta descriptions and on-page suggestions in Optimization Studio.",
        docs: "platform.openai.com/api-keys",
        fields: [
          { key: "apiKey", label: "API key", secret: true, placeholder: "sk-…" },
          { key: "model", label: "Default model", optional: true, placeholder: "gpt-4o" },
        ],
      },
      {
        id: "claude", name: "Claude API (Anthropic)",
        desc: "Claude models for long-form content drafts, SEO audits and rewrite suggestions.",
        docs: "console.anthropic.com/settings/keys",
        fields: [
          { key: "apiKey", label: "API key", secret: true, placeholder: "sk-ant-…" },
          { key: "model", label: "Default model", optional: true, placeholder: "claude-sonnet-5" },
        ],
      },
      {
        id: "gemini", name: "Gemini API (Google AI)",
        desc: "Gemini models for keyword clustering, intent classification and content ideas.",
        docs: "aistudio.google.com/apikey",
        fields: [
          { key: "apiKey", label: "API key", secret: true, placeholder: "AIza…" },
          { key: "model", label: "Default model", optional: true, placeholder: "gemini-2.5-pro" },
        ],
      },
      {
        id: "deepseek", name: "DeepSeek API",
        desc: "Low-cost bulk generation — alt texts, FAQ answers and schema drafts at scale.",
        docs: "platform.deepseek.com/api_keys",
        fields: [
          { key: "apiKey", label: "API key", secret: true, placeholder: "sk-…" },
          { key: "model", label: "Default model", optional: true, placeholder: "deepseek-chat" },
        ],
      },
    ],
  },
  {
    group: "Publishing & social OAuth apps",
    icon: Link2,
    items: [
      {
        id: "webflow", name: "Webflow OAuth app",
        desc: "Server-side publishing from Optimization Studio: page SEO titles/descriptions, slugs and blog posts via the Data API v2.",
        docs: "developers.webflow.com",
        fields: [
          { key: "clientId", label: "Client ID", placeholder: "Webflow app client ID" },
          { key: "clientSecret", label: "Client Secret", secret: true, placeholder: "••••••••" },
        ],
      },
      {
        id: "meta", name: "Meta app (Facebook & Instagram)",
        desc: "OAuth app behind social publishing and profile sync in Business Profile → Social.",
        docs: "developers.facebook.com/apps",
        fields: [
          { key: "appId", label: "App ID", placeholder: "Meta app ID" },
          { key: "appSecret", label: "App Secret", secret: true, placeholder: "••••••••" },
        ],
      },
    ],
  },
];

const apiStatus = (company, api) =>
  api.useDfs ? company.dfs.connected : !!company.apis?.[api.id]?.connected;

function ApiCard({ api, company, onChange }) {
  const stored = api.useDfs
    ? { login: company.dfs.login, password: company.dfs.password }
    : (company.apis?.[api.id]?.values || {});
  const connected = apiStatus(company, api);
  const [draft, setDraft] = useState(stored);
  const [reveal, setReveal] = useState(false);
  const setField = (key, v) => setDraft((d) => ({ ...d, [key]: v }));
  const filled = api.fields.filter((f) => !f.optional).every((f) => (draft[f.key] || "").trim());

  const save = () => {
    if (api.useDfs) onChange({ dfs: { login: draft.login || "", password: draft.password || "", connected: filled } });
    else onChange({ apis: { ...(company.apis || {}), [api.id]: { values: draft, connected: filled } } });
  };
  const disconnect = () => {
    if (api.useDfs) onChange({ dfs: { ...company.dfs, connected: false } });
    else onChange({ apis: { ...(company.apis || {}), [api.id]: { values: draft, connected: false } } });
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-[13px] font-semibold">{api.name}</div>
        <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={connected ? { background: "#DCFCE7", color: "#166534" } : { background: "#FEE2E2", color: "#991B1B" }}>
          {connected ? "● Connected" : "○ Not connected"}
        </span>
      </div>
      <p className="mb-3 text-[11.5px] leading-relaxed text-gray-400">{api.desc}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {api.fields.map((f) => (
          <Labeled key={f.key} label={f.label + (f.optional ? " (optional)" : "")}>
            <input value={draft[f.key] || ""} onChange={(e) => setField(f.key, e.target.value)}
              type={f.secret && !reveal ? "password" : "text"}
              placeholder={f.placeholder} className={(f.secret ? "ll-mono " : "") + inputCls} />
          </Labeled>
        ))}
      </div>
      {api.scopes && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">Scopes</span>
          {api.scopes.map((s) => (
            <span key={s} className="ll-mono rounded-md bg-gray-50 px-2 py-0.5 text-[10.5px] text-gray-500">{s}</span>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button onClick={save} className="rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
          disabled={!filled && !connected} style={{ background: company.accent }}>
          Save & validate
        </button>
        {api.fields.some((f) => f.secret) && (
          <button onClick={() => setReveal(!reveal)} className="flex items-center gap-1 text-[12px] text-gray-400 hover:text-gray-600">
            <Eye size={13} /> {reveal ? "Hide" : "Show"}
          </button>
        )}
        <span className="flex-1" />
        {connected && (
          <button onClick={disconnect} className="text-[12px] text-gray-400 hover:text-red-500">Disconnect</button>
        )}
      </div>
      <div className="mt-2 text-[10.5px] text-gray-400">Get credentials: <span className="ll-mono">{api.docs}</span></div>
    </div>
  );
}

function ApiSettingsSection({ company, onChange }) {
  const all = API_REGISTRY.flatMap((g) => g.items);
  const connectedCount = all.filter((a) => apiStatus(company, a)).length;
  return (
    <div className="ll-fade space-y-6">
      <Card className="flex items-start gap-3 p-4">
        <Lock size={16} className="mt-0.5 shrink-0 text-gray-400" />
        <div className="text-[12px] leading-relaxed text-gray-500">
          <b className="text-gray-700">{connectedCount} of {all.length} integrations connected.</b> Credentials are stored once for the whole
          company (encrypted, server-side — never exposed to the browser or clients) and power every project. Any new feature
          that needs an API registers here automatically, so this window is always the single place to manage keys.
        </div>
      </Card>
      {API_REGISTRY.map((g) => {
        const on = g.items.filter((a) => apiStatus(company, a)).length;
        return (
          <div key={g.group}>
            <div className="mb-2.5 flex items-center gap-2">
              <g.icon size={15} className="text-gray-400" />
              <span className="ll-display text-[14px] font-semibold">{g.group}</span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10.5px] font-semibold text-gray-500">{on}/{g.items.length}</span>
            </div>
            <div className="grid items-start gap-4 lg:grid-cols-2">
              {g.items.map((api) => <ApiCard key={api.id} api={api} company={company} onChange={onChange} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CompanyBrandSection({ company, onChange, onGoApis }) {
  const allApis = API_REGISTRY.flatMap((g) => g.items);
  const connectedCount = allApis.filter((a) => apiStatus(company, a)).length;
  return (
    <div className="ll-fade grid gap-5 lg:grid-cols-2">
      <Card className="p-5">
        <div className="mb-1 flex items-center gap-2"><Palette size={16} className="text-gray-400" /><span className="ll-display text-[15px] font-semibold">Brand customization</span></div>
        <p className="mb-4 text-[12px] text-gray-400">Your agency identity — shown across the dashboard, client logins and non-white-label reports.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Company name">
            <input value={company.name} onChange={(e) => onChange({ name: e.target.value })} className={inputCls} />
          </Labeled>
          <Labeled label="Brand color">
            <div className="flex items-center gap-2">
              <input type="color" value={company.accent} onChange={(e) => onChange({ accent: e.target.value })} className="h-9 w-14 cursor-pointer rounded border border-gray-200" />
              <span className="ll-mono text-[12px] text-gray-500">{company.accent}</span>
            </div>
          </Labeled>
        </div>
        <div className="mt-3">
          <Labeled label="Company logo">
            <LogoUpload value={company.logo} onChange={(logo) => onChange({ logo })} />
          </Labeled>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-1 flex items-center gap-2"><KeyRound size={16} className="text-gray-400" /><span className="ll-display text-[15px] font-semibold">Data Integration and APIs</span></div>
        <p className="mb-3 text-[12px] text-gray-400">All credentials now live in one place — DataForSEO, Google OAuth, OpenAI, Claude, Gemini, DeepSeek and more.</p>
        <div className="flex items-center justify-between rounded-xl border border-gray-200 p-4">
          <div>
            <div className="text-[13px] font-semibold">{connectedCount} of {allApis.length} integrations connected</div>
            <div className="text-[11.5px] text-gray-400">Manage every key from API settings in the left sidebar.</div>
          </div>
          <button onClick={onGoApis} className="rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-white" style={{ background: company.accent }}>
            Open API settings
          </button>
        </div>
      </Card>
    </div>
  );
}

function TeamSection({ company, onChange, clients }) {
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", email: "", password: "", role: "Manager" });
  const team = company.team || [];
  const allProjects = clients.flatMap((c) => c.projects.map((p) => ({ ...p, clientName: c.name })));

  const patchMember = (id, p) => onChange({ team: team.map((m) => (m.id === id ? { ...m, ...p } : m)) });
  const setRole = (m, role) => patchMember(m.id, { role, perms: { ...ROLE_PRESETS[role] }, projects: role === "Admin" ? "all" : m.projects === "all" ? [] : m.projects });
  const removeMember = (id) => onChange({ team: team.filter((m) => m.id !== id) });
  const toggleProject = (m, pid) => {
    const cur = m.projects === "all" ? allProjects.map((p) => p.id) : m.projects;
    patchMember(m.id, { projects: cur.includes(pid) ? cur.filter((x) => x !== pid) : [...cur, pid] });
  };

  const PERM_META = [
    ["viewData", "View dashboards", "GBP, Website Performance & rank data for assigned projects"],
    ["manageKeywords", "Manage keywords", "Add / remove tracked keywords and cities"],
    ["createReports", "Create reports", "Open the report builder and download client reports"],
    ["manageTasks", "Manage tasks", "Create records, checklists & tasks in Project Management"],
    ["manageClients", "Manage clients & settings", "Edit clients, white label, project settings"],
  ];

  return (
    <div className="ll-fade space-y-4">
      <Card className="p-4 text-[12.5px] leading-relaxed text-gray-500">
        <b className="text-gray-700">Access strategy:</b> <b>Admins</b> see and manage everything including company settings.
        <b> Managers</b> work inside their assigned projects — they can manage keywords and build reports, but can't touch clients or company settings.
        <b> Viewers</b> get read-only dashboards for their assigned projects. Every action is recorded in the Activity log.
      </Card>

      <div className="space-y-2.5">
        {team.map((m) => {
          const open = openId === m.id;
          const projCount = m.projects === "all" ? "All projects" : `${m.projects.length} project${m.projects.length === 1 ? "" : "s"}`;
          return (
            <Card key={m.id} className="overflow-hidden">
              <button onClick={() => setOpenId(open ? null : m.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50">
                <span className="ll-display flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold text-white" style={{ background: company.accent }}>
                  {m.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13.5px] font-semibold text-gray-800">{m.name}</span>
                    <RoleBadge role={m.role} />
                    {m.isOwner && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">Owner</span>}
                  </span>
                  <span className="block truncate text-[11.5px] text-gray-400">{m.email} · {projCount}</span>
                </span>
                <ChevronDown size={15} className="shrink-0 text-gray-300" style={{ transform: open ? "rotate(180deg)" : "none" }} />
              </button>
              {open && (
                <div className="ll-fade space-y-4 border-t border-gray-100 p-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Labeled label="Name"><input value={m.name} onChange={(e) => patchMember(m.id, { name: e.target.value })} className={inputCls} /></Labeled>
                    <Labeled label="Login email"><input value={m.email} onChange={(e) => patchMember(m.id, { email: e.target.value })} className={inputCls} /></Labeled>
                    <Labeled label="Password"><input value={m.password} onChange={(e) => patchMember(m.id, { password: e.target.value })} placeholder="Set a password" className={"ll-mono " + inputCls} /></Labeled>
                  </div>
                  <Labeled label="Role — sets a permission preset you can fine-tune below">
                    <Seg options={["Admin", "Manager", "Viewer"]} value={m.role} onChange={(r) => setRole(m, r)} accent={company.accent} />
                  </Labeled>
                  {m.role !== "Admin" && (
                    <Labeled label="Project access">
                      <div className="mb-1.5">
                        <button onClick={() => patchMember(m.id, { projects: m.projects === "all" ? [] : "all" })}
                          className="rounded-lg border px-3 py-1.5 text-[12px] font-medium"
                          style={m.projects === "all" ? { background: company.accent, borderColor: company.accent, color: "#fff" } : { borderColor: "#E5E7EB", color: "#4B5563" }}>
                          All projects {m.projects === "all" ? "✓" : ""}
                        </button>
                      </div>
                      <div className="mb-1.5 rounded-lg bg-gray-50 px-2.5 py-1.5 text-[10.5px] text-gray-500">
                        Assigning a project doesn't reveal it yet — open that project's settings (gear on the project in the sidebar) → <b>Team</b> tab to grant which sections this member can access.
                      </div>
                      {m.projects !== "all" && (
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {allProjects.map((p) => {
                            const on = m.projects.includes(p.id);
                            return (
                              <button key={p.id} onClick={() => toggleProject(m, p.id)}
                                className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[12px]"
                                style={{ borderColor: on ? "#86EFAC" : "#E5E7EB", background: on ? "#F0FDF4" : "var(--chip-bg, #fff)" }}>
                                <CheckCircle2 size={13} className="shrink-0" style={{ color: on ? "#16A34A" : "#D1D5DB" }} />
                                <ProjectMark project={p} />
                                <span className="min-w-0">
                                  <span className="block truncate font-medium text-gray-700">{p.name}</span>
                                  <span className="block truncate text-[10px] text-gray-400">{p.clientName}</span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </Labeled>
                  )}
                  <Labeled label="Permissions">
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {PERM_META.map(([key, label, desc]) => (
                        <Toggle key={key} label={label} desc={desc} on={m.perms[key]}
                          onChange={(v) => patchMember(m.id, { perms: { ...m.perms, [key]: v } })} />
                      ))}
                    </div>
                  </Labeled>
                  {!m.isOwner && (
                    <button onClick={() => removeMember(m.id)} className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-red-500">
                      <Trash2 size={13} /> Remove team member
                    </button>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {adding ? (
        <Card className="ll-fade space-y-3 p-4">
          <div className="ll-display text-[14px] font-semibold">Add team member</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Name"><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputCls} /></Labeled>
            <Labeled label="Login email"><input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className={inputCls} /></Labeled>
            <Labeled label="Password"><input value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} className={"ll-mono " + inputCls} /></Labeled>
            <Labeled label="Role"><Seg options={["Admin", "Manager", "Viewer"]} value={draft.role} onChange={(r) => setDraft({ ...draft, role: r })} accent={company.accent} /></Labeled>
          </div>
          <div className="flex gap-2">
            <button disabled={!draft.name.trim() || !draft.email.trim()}
              onClick={() => {
                onChange({ team: [...team, { id: "u" + Date.now(), ...draft, projects: draft.role === "Admin" ? "all" : [], perms: { ...ROLE_PRESETS[draft.role] } }] });
                setDraft({ name: "", email: "", password: "", role: "Manager" }); setAdding(false);
              }}
              className="rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: company.accent }}>
              Add member
            </button>
            <button onClick={() => setAdding(false)} className="text-[12px] text-gray-400 hover:text-gray-600">Cancel</button>
          </div>
          <div className="rounded-lg bg-gray-50 p-3 text-[11.5px] text-gray-500">
            In production, store password <b>hashes</b> only (bcrypt/argon2) and enforce these permissions server-side on every API route — never trust the client.
          </div>
        </Card>
      ) : (
        <button onClick={() => setAdding(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-gray-300 py-3 text-[13px] font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700">
          <UserPlus size={15} /> Add team member
        </button>
      )}
    </div>
  );
}

function ActivitySection({ company }) {
  const [who, setWho] = useState("All members");
  const team = company.team || [];
  const rows = (company.activity || []).filter((a) => who === "All members" || a.member === who);
  return (
    <div className="ll-fade space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[12.5px] text-gray-400">Every login, view, keyword change and report is recorded with who did it and when.</div>
        <select value={who} onChange={(e) => setWho(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[13px]">
          <option>All members</option>
          {team.map((m) => <option key={m.id}>{m.name}</option>)}
        </select>
      </div>
      <Card className="overflow-hidden">
        {rows.length === 0 && <div className="p-8 text-center text-[13px] text-gray-400">No activity yet for this member.</div>}
        {rows.map((a) => (
          <div key={a.id} className="flex items-center gap-3 border-b border-gray-50 px-4 py-3 last:border-0">
            <span className="ll-display flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white" style={{ background: company.accent }}>
              {a.member.split(" ").map((w) => w[0]).slice(0, 2).join("")}
            </span>
            <span className="min-w-0 flex-1 text-[13px]">
              <span className="font-semibold text-gray-800">{a.member}</span>
              <span className="text-gray-500"> — {a.action}</span>
              {a.target && <span className="font-medium text-gray-700">: {a.target}</span>}
            </span>
            <span className="ll-mono shrink-0 text-[11px] text-gray-400">{relTime(a.ts)}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function AccountingSection({ company, onChange, clients }) {
  const fin = company.finance || { clientEntries: [], universal: [] };
  const setFin = (patch) => onChange({ finance: { ...fin, ...patch } });
  const [draftFor, setDraftFor] = useState(null); // clientId currently adding an entry
  const [draft, setDraft] = useState({ type: "earning", label: "", amount: "" });
  const [uniDraft, setUniDraft] = useState({ label: "", amount: "" });

  const sumBy = (clientId, type) => fin.clientEntries.filter((e) => e.clientId === clientId && e.type === type).reduce((s, e) => s + +e.amount, 0);
  const totalEarn = clients.reduce((s, c) => s + sumBy(c.id, "earning"), 0);
  const totalClientSpend = clients.reduce((s, c) => s + sumBy(c.id, "spending"), 0);
  const totalUniversal = fin.universal.reduce((s, e) => s + +e.amount, 0);
  const totalSpend = totalClientSpend + totalUniversal;
  const net = totalEarn - totalSpend;
  const margin = totalEarn ? (net / totalEarn) * 100 : 0;

  const chartData = clients.map((c) => ({
    name: c.name.length > 14 ? c.name.slice(0, 13) + "…" : c.name,
    Earnings: sumBy(c.id, "earning"),
    Spendings: sumBy(c.id, "spending"),
  }));

  const ov = [
    { label: "Total earnings", value: money(totalEarn), sub: "all clients · monthly", color: POS },
    { label: "Total spendings", value: money(totalSpend), sub: `${money(totalClientSpend)} clients + ${money(totalUniversal)} universal`, color: NEG },
    { label: "Net profit", value: money(net), sub: "earnings − all spendings", color: net >= 0 ? POS : NEG },
    { label: "Profit margin", value: margin.toFixed(0) + "%", sub: "of earnings kept", color: net >= 0 ? POS : NEG },
  ];

  const addEntry = (clientId) => {
    if (!draft.label.trim() || !+draft.amount) return;
    setFin({ clientEntries: [...fin.clientEntries, { id: "f" + Date.now(), clientId, ...draft, amount: +draft.amount }] });
    setDraft({ type: "earning", label: "", amount: "" }); setDraftFor(null);
  };

  return (
    <div className="ll-fade space-y-5">
      {/* total accounting overview */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {ov.map((o, i) => (
          <Card key={i} className="p-4">
            <div className="text-[12px] font-medium text-gray-500">{o.label}</div>
            <div className="ll-display mt-1.5 text-[32px] font-semibold leading-none tracking-tight" style={{ color: o.color }}>{o.value}</div>
            <div className="mt-1.5 text-[11px] text-gray-400">{o.sub}</div>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <div className="ll-display mb-3 text-[15px] font-semibold">Earnings vs spendings per client <span className="text-xs font-normal text-gray-400">monthly</span></div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Earnings" fill={POS} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Spendings" fill={NEG} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* per-client breakdown */}
      <div className="grid gap-4 lg:grid-cols-3">
        {clients.map((c) => {
          const earn = sumBy(c.id, "earning"), spend = sumBy(c.id, "spending"), profit = earn - spend;
          const entries = fin.clientEntries.filter((e) => e.clientId === c.id);
          return (
            <Card key={c.id} className="flex flex-col p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="ll-display truncate text-[14px] font-semibold">{c.name}</div>
                <span className="ll-mono text-[16px] font-bold" style={{ color: profit >= 0 ? POS : NEG }}>{profit >= 0 ? "+" : ""}{money(profit)}</span>
              </div>
              <div className="mb-3 flex gap-3 text-[11.5px]">
                <span className="text-gray-500">Earned <b className="ll-mono" style={{ color: POS }}>{money(earn)}</b></span>
                <span className="text-gray-500">Spent <b className="ll-mono" style={{ color: NEG }}>{money(spend)}</b></span>
              </div>
              <div className="flex-1 space-y-1">
                {entries.map((e) => (
                  <div key={e.id} className="group flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5 text-[12px]">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: e.type === "earning" ? POS : NEG }} />
                    <span className="min-w-0 flex-1 truncate text-gray-700">{e.label}</span>
                    <span className="ll-mono font-semibold" style={{ color: e.type === "earning" ? POS : NEG }}>
                      {e.type === "earning" ? "+" : "−"}{money(e.amount)}
                    </span>
                    <button onClick={() => setFin({ clientEntries: fin.clientEntries.filter((x) => x.id !== e.id) })}
                      className="text-gray-300 opacity-0 hover:text-red-500 group-hover:opacity-100"><Trash2 size={12} /></button>
                  </div>
                ))}
                {entries.length === 0 && <div className="py-2 text-center text-[11.5px] text-gray-300">No entries yet</div>}
              </div>
              {draftFor === c.id ? (
                <div className="ll-fade mt-2 space-y-1.5 rounded-xl border border-gray-200 p-2.5">
                  <Seg options={["earning", "spending"]} value={draft.type} onChange={(v) => setDraft({ ...draft, type: v })} accent={company.accent} />
                  <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Label (e.g. retainer, content…)" className={inputCls} />
                  <div className="flex gap-1.5">
                    <input value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="Amount $" className={"ll-mono " + inputCls} />
                    <button onClick={() => addEntry(c.id)} className="rounded-lg px-3 text-[12px] font-semibold text-white" style={{ background: company.accent }}>Add</button>
                    <button onClick={() => setDraftFor(null)} className="rounded-lg px-2 text-gray-400 hover:text-gray-600"><X size={14} /></button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setDraftFor(c.id)} className="mt-2 flex items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 py-1.5 text-[11.5px] font-medium text-gray-400 hover:border-gray-400 hover:text-gray-600">
                  <Plus size={12} /> Add entry
                </button>
              )}
            </Card>
          );
        })}
      </div>

      {/* universal spendings */}
      <Card className="p-5">
        <div className="mb-1 flex items-center justify-between">
          <div className="ll-display text-[15px] font-semibold">Universal spendings <span className="text-xs font-normal text-gray-400">monthly · not tied to one client</span></div>
          <span className="ll-mono text-[16px] font-bold" style={{ color: NEG }}>−{money(totalUniversal)}</span>
        </div>
        <p className="mb-3 text-[11.5px] text-gray-400">Team salaries, software tools, hosting — costs shared across all clients. Included in total spendings above.</p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {fin.universal.map((e) => (
            <div key={e.id} className="group flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-[12.5px]">
              <span className="min-w-0 flex-1 truncate text-gray-700">{e.label}</span>
              <input value={e.amount}
                onChange={(ev) => setFin({ universal: fin.universal.map((x) => x.id === e.id ? { ...x, amount: +ev.target.value.replace(/[^0-9.]/g, "") || 0 } : x) })}
                className="ll-mono w-20 rounded border border-gray-200 px-1.5 py-0.5 text-right text-[12px]" />
              <button onClick={() => setFin({ universal: fin.universal.filter((x) => x.id !== e.id) })}
                className="text-gray-300 opacity-0 hover:text-red-500 group-hover:opacity-100"><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5">
          <input value={uniDraft.label} onChange={(e) => setUniDraft({ ...uniDraft, label: e.target.value })} placeholder="New spending (e.g. Designer salary)" className={inputCls} />
          <input value={uniDraft.amount} onChange={(e) => setUniDraft({ ...uniDraft, amount: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="Amount $" className={"ll-mono w-28 " + inputCls.replace("w-full ", "")} />
          <button disabled={!uniDraft.label.trim() || !+uniDraft.amount}
            onClick={() => { setFin({ universal: [...fin.universal, { id: "g" + Date.now(), label: uniDraft.label, amount: +uniDraft.amount }] }); setUniDraft({ label: "", amount: "" }); }}
            className="rounded-lg px-4 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: company.accent }}>Add</button>
        </div>
      </Card>
    </div>
  );
}

function InvoiceSection({ company, onChange, clients }) {
  const fin = company.finance || { clientEntries: [] };
  const [clientId, setClientId] = useState(clients[0]?.id);
  const client = clients.find((c) => c.id === clientId);
  const today = new Date();
  const due = new Date(today.getTime() + 14 * 86400000);
  const [invNo, setInvNo] = useState(`INV-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}-001`);
  const [issueDate, setIssueDate] = useState(isoDate(today));
  const [dueDate, setDueDate] = useState(isoDate(due));
  const [taxPct, setTaxPct] = useState(0);
  const [notes, setNotes] = useState("Payment due within 14 days. Thank you for your business!");
  const [fromEmail, setFromEmail] = useState("billing@serpsquad.io");
  const [fromAddress, setFromAddress] = useState("Dhaka, Bangladesh");
  const [items, setItems] = useState([
    { id: "i1", desc: "Local SEO — monthly retainer", qty: 1, rate: 1500 },
  ]);

  const setItem = (id, p) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const subtotal = items.reduce((s, x) => s + (+x.qty || 0) * (+x.rate || 0), 0);
  const tax = subtotal * (+taxPct || 0) / 100;
  const total = subtotal + tax;

  const importFromAccounting = () => {
    const earns = fin.clientEntries.filter((e) => e.clientId === clientId && e.type === "earning");
    if (!earns.length) return;
    setItems(earns.map((e, i) => ({ id: "imp" + Date.now() + i, desc: e.label, qty: 1, rate: +e.amount })));
  };

  const th = "px-3 py-2 text-left text-[9.5px] font-semibold uppercase tracking-wider text-gray-400";

  return (
    <div className="ll-fade space-y-4">
      {/* controls */}
      <div className="no-print flex flex-wrap items-center gap-2">
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[13px] font-medium">
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={importFromAccounting} className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] font-medium text-gray-600 hover:border-gray-300">
          <Wallet size={14} /> Import items from Accounting
        </button>
        <button onClick={() => window.print()} className="ml-auto flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12.5px] font-semibold text-white" style={{ background: company.accent }}>
          <Printer size={14} /> Print / Download PDF
        </button>
      </div>

      {/* invoice paper */}
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-9 shadow-sm">
        {/* header: from + meta */}
        <div className="mb-7 flex items-start justify-between gap-4 border-b pb-6" style={{ borderColor: company.accent + "33" }}>
          <div>
            <div className="mb-2 flex items-center gap-3">
              <BrandMark name={company.name} logo={company.logo} accent={company.accent} size="lg" />
              <input value={company.name} onChange={(e) => onChange({ name: e.target.value })}
                className="ll-display border-0 bg-transparent text-[22px] font-bold tracking-tight outline-none" />
            </div>
            <input value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} className="block w-64 border-0 bg-transparent text-[12px] text-gray-500 outline-none" />
            <input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} className="block w-64 border-0 bg-transparent text-[12px] text-gray-500 outline-none" />
            <div className="no-print mt-1.5"><LogoUpload value={company.logo} onChange={(logo) => onChange({ logo })} label="Change logo" /></div>
          </div>
          <div className="text-right">
            <div className="ll-display text-[28px] font-bold tracking-tight" style={{ color: company.accent }}>INVOICE</div>
            <div className="mt-2 space-y-1 text-[12px]">
              <div className="flex items-center justify-end gap-2"><span className="text-gray-400">No.</span>
                <input value={invNo} onChange={(e) => setInvNo(e.target.value)} className="ll-mono w-36 rounded border border-gray-200 px-2 py-1 text-right text-[12px]" /></div>
              <div className="flex items-center justify-end gap-2"><span className="text-gray-400">Issued</span>
                <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="ll-mono rounded border border-gray-200 px-2 py-1 text-[12px]" /></div>
              <div className="flex items-center justify-end gap-2"><span className="text-gray-400">Due</span>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="ll-mono rounded border border-gray-200 px-2 py-1 text-[12px]" /></div>
            </div>
          </div>
        </div>

        {/* bill to — auto-filled from the selected client */}
        <div className="mb-6">
          <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Bill to</div>
          {client && (
            <div className="text-[13px] leading-relaxed">
              <div className="ll-display text-[16px] font-semibold">{client.companyName || client.name}</div>
              <div className="text-gray-500">Attn: {client.contact}{client.email ? ` · ${client.email}` : ""}{client.phone ? ` · ${client.phone}` : ""}</div>
              <div className="text-gray-500">{[client.companyWebsite, client.address].filter(Boolean).join(" · ")}</div>
            </div>
          )}
          <div className="no-print mt-1 text-[10.5px] text-gray-300">Auto-filled from Client Settings — edit it there to change.</div>
        </div>

        {/* line items — detailed work */}
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-gray-100">
              <th className={th}>Description of work</th>
              <th className={th + " w-16"}>Qty</th>
              <th className={th + " w-28"}>Rate</th>
              <th className={th + " w-28 text-right"}>Amount</th>
              <th className="no-print w-8"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((x) => (
              <tr key={x.id} className="border-b border-gray-50 align-top">
                <td className="px-3 py-2">
                  <textarea value={x.desc} onChange={(e) => setItem(x.id, { desc: e.target.value })} rows={Math.max(1, Math.ceil(x.desc.length / 55))}
                    placeholder="Describe the work…" className="w-full resize-none border-0 bg-transparent outline-none" />
                </td>
                <td className="px-3 py-2"><input value={x.qty} onChange={(e) => setItem(x.id, { qty: e.target.value.replace(/[^0-9.]/g, "") })} className="ll-mono w-12 rounded border border-gray-100 px-1.5 py-0.5 text-center" /></td>
                <td className="px-3 py-2"><input value={x.rate} onChange={(e) => setItem(x.id, { rate: e.target.value.replace(/[^0-9.]/g, "") })} className="ll-mono w-24 rounded border border-gray-100 px-1.5 py-0.5 text-right" /></td>
                <td className="ll-mono px-3 py-2 text-right font-semibold">{money((+x.qty || 0) * (+x.rate || 0))}</td>
                <td className="no-print px-1 py-2">
                  <button onClick={() => setItems((xs) => xs.filter((y) => y.id !== x.id))} className="text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={() => setItems((xs) => [...xs, { id: "i" + Date.now(), desc: "", qty: 1, rate: 0 }])}
          className="no-print mt-2 flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-[12px] font-medium text-gray-400 hover:border-gray-400 hover:text-gray-600">
          <Plus size={12} /> Add line item
        </button>

        {/* totals */}
        <div className="mt-5 flex justify-end">
          <div className="w-64 space-y-1.5 text-[13px]">
            <div className="flex justify-between text-gray-500"><span>Subtotal</span><span className="ll-mono">{money(subtotal)}</span></div>
            <div className="flex items-center justify-between text-gray-500">
              <span className="flex items-center gap-1.5">Tax
                <input value={taxPct} onChange={(e) => setTaxPct(e.target.value.replace(/[^0-9.]/g, ""))} className="ll-mono w-12 rounded border border-gray-200 px-1 py-0.5 text-center text-[11px]" />%
              </span>
              <span className="ll-mono">{money(tax)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 text-[18px] font-bold" style={{ borderColor: company.accent + "33", color: company.accent }}>
              <span className="ll-display">Total due</span><span className="ll-mono">{money(total)}</span>
            </div>
          </div>
        </div>

        {/* notes */}
        <div className="mt-7 border-t border-gray-100 pt-4">
          <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Notes & payment terms</div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            className="w-full resize-none border-0 bg-transparent text-[12.5px] leading-relaxed text-gray-600 outline-none" />
        </div>
        <div className="mt-4 flex items-center justify-between text-[10.5px] text-gray-400">
          <span>{company.name} · {fromEmail}</span>
          <span>{invNo}</span>
        </div>
      </div>
    </div>
  );
}

function CompanyPage({ company, onChange, clients, onBack, dark, setDark }) {
  const [tab, setTab] = useState("company");
  const TABS = [
    { key: "company", label: "Company settings", icon: Building2, sub: "Brand customization & identity" },
    { key: "apis", label: "API settings", icon: KeyRound, sub: "DataForSEO · Google OAuth · AI keys" },
    { key: "team", label: "Team & permissions", icon: Shield, sub: "Members, logins, roles, project access" },
    { key: "accounting", label: "Accounting", icon: Wallet, sub: "Earnings & spendings per client" },
    { key: "invoice", label: "Invoices", icon: Receipt, sub: "Branded invoices per client" },
    { key: "activity", label: "Activity log", icon: History, sub: "Who's doing what, where" },
  ];
  const active = TABS.find((t) => t.key === tab);
  return (
    <div className={`ll-root ${dark ? "ll-dark" : ""} flex min-h-screen items-stretch bg-[#F5F6F8]`}>
      <style>{FONT_CSS}</style>
      {/* settings sidebar */}
      <aside className="sticky top-0 z-30 hidden h-screen w-64 shrink-0 flex-col self-start border-r border-gray-200 bg-white md:flex">
        <div className="flex items-center gap-2 px-4 py-5">
          <BrandMark name={company.name} logo={company.logo} accent={company.accent} />
          <span className="ll-display text-[16px] font-bold tracking-tight">{company.name}</span>
        </div>
        <div className="px-4 pb-2 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Settings</div>
        <div className="flex-1 space-y-1 px-2.5">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left hover:bg-gray-50"
              style={tab === t.key ? { background: company.accent + "12" } : {}}>
              <t.icon size={16} className="mt-0.5 shrink-0" style={{ color: tab === t.key ? company.accent : "#9CA3AF" }} />
              <span>
                <span className="block text-[13px] font-semibold" style={{ color: tab === t.key ? company.accent : "#374151" }}>{t.label}</span>
                <span className="block text-[10.5px] text-gray-400">{t.sub}</span>
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
      {/* main */}
      <main className="min-w-0 flex-1">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 bg-white/90 px-5 py-4 backdrop-blur">
          <div>
            <div className="ll-display text-[17px] font-semibold leading-tight">{active.label}</div>
            <div className="text-[11.5px] text-gray-400">{active.sub}</div>
          </div>
          <DarkToggle dark={dark} setDark={setDark} />
        </div>
        <div className="mx-auto max-w-5xl p-5">
          {tab === "company" && <CompanyBrandSection company={company} onChange={onChange} onGoApis={() => setTab("apis")} />}
          {tab === "apis" && <ApiSettingsSection company={company} onChange={onChange} />}
          {tab === "team" && <TeamSection company={company} onChange={onChange} clients={clients} />}
          {tab === "accounting" && <AccountingSection company={company} onChange={onChange} clients={clients} />}
          {tab === "invoice" && <InvoiceSection company={company} onChange={onChange} clients={clients} />}
          {tab === "activity" && <ActivitySection company={company} />}
        </div>
      </main>
    </div>
  );
}

function ClientSettingsBody({ client, onChange }) {
  const wl = client.whiteLabel;
  const setWl = (patch) => onChange({ whiteLabel: { ...wl, ...patch } });
  const lg = client.login;
  const setLg = (patch) => onChange({ login: { ...lg, ...patch } });
  return (
      <div className="space-y-5">
        <div>
          <div className="mb-2 flex items-center gap-2"><Users size={15} className="text-gray-400" /><span className="ll-display text-[14px] font-semibold">Client information</span></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Client name"><input value={client.name} onChange={(e) => onChange({ name: e.target.value })} className={inputCls} /></Labeled>
            <Labeled label="Contact person"><input value={client.contact} onChange={(e) => onChange({ contact: e.target.value })} className={inputCls} /></Labeled>
            <Labeled label="Email"><input value={client.email} onChange={(e) => onChange({ email: e.target.value })} className={inputCls} /></Labeled>
            <Labeled label="Phone"><input value={client.phone} onChange={(e) => onChange({ phone: e.target.value })} className={inputCls} /></Labeled>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <div className="mb-2 flex items-center gap-2"><Building2 size={15} className="text-gray-400" /><span className="ll-display text-[14px] font-semibold">Client company information</span></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Company name"><input value={client.companyName} onChange={(e) => onChange({ companyName: e.target.value })} className={inputCls} /></Labeled>
            <Labeled label="Company website"><input value={client.companyWebsite} onChange={(e) => onChange({ companyWebsite: e.target.value })} className={inputCls} /></Labeled>
            <Labeled label="Address"><input value={client.address} onChange={(e) => onChange({ address: e.target.value })} className={inputCls} /></Labeled>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <Toggle on={wl.enabled} onChange={(v) => setWl({ enabled: v })}
            label="White label"
            desc="Show this client's own branding instead of yours on client view links and downloaded reports." />
          {wl.enabled && (
            <div className="ll-fade mt-3 space-y-3 rounded-xl border border-gray-200 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Labeled label="White-label brand name">
                  <input value={wl.name} onChange={(e) => setWl({ name: e.target.value })} placeholder={client.companyName || client.name} className={inputCls} />
                </Labeled>
                <Labeled label="Brand website">
                  <input value={wl.website} onChange={(e) => setWl({ website: e.target.value })} placeholder={client.companyWebsite} className={inputCls} />
                </Labeled>
              </div>
              <Labeled label="Brand logo">
                <LogoUpload value={wl.logo} onChange={(logo) => setWl({ logo })} label="Upload brand logo" />
              </Labeled>
              <div className="rounded-lg bg-gray-50 p-3 text-[11.5px] leading-relaxed text-gray-500">
                When you share a <b>client view link</b> or <b>download a report</b> for any project under
                this client, their visitors will see <b>{wl.name || client.companyName || client.name}</b> branding —
                SERP Squad is hidden everywhere: header, footer and report cover.
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 pt-4">
          <div className="mb-2 flex items-center gap-2"><KeyRound size={15} className="text-gray-400" /><span className="ll-display text-[14px] font-semibold">Client login and permissions</span></div>
          <Toggle on={lg.enabled} onChange={(v) => setLg({ enabled: v })}
            label="Client portal access"
            desc="Lets this client sign in from your website's Client Login and see their own projects." />
          {lg.enabled && (
            <div className="ll-fade mt-3 space-y-3 rounded-xl border border-gray-200 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Labeled label="Login email">
                  <input value={lg.email} onChange={(e) => setLg({ email: e.target.value })} placeholder={client.email} className={inputCls} />
                </Labeled>
                <Labeled label="Password">
                  <input value={lg.password} onChange={(e) => setLg({ password: e.target.value })} type="text" placeholder="Set a password" className={"ll-mono " + inputCls} />
                </Labeled>
              </div>
              <Labeled label="Projects this client can access">
                <div className="space-y-1.5">
                  {client.projects.length === 0 && <div className="text-[12px] text-gray-400">No projects yet — add one first.</div>}
                  {client.projects.map((p) => {
                    const on = lg.projectIds.includes(p.id);
                    return (
                      <button key={p.id}
                        onClick={() => setLg({ projectIds: on ? lg.projectIds.filter((id) => id !== p.id) : [...lg.projectIds, p.id] })}
                        className="flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-[13px]"
                        style={{ borderColor: on ? "#86EFAC" : "#E5E7EB", background: on ? "#F0FDF4" : "#fff" }}>
                        <CheckCircle2 size={15} style={{ color: on ? "#16A34A" : "#D1D5DB" }} />
                        <ProjectMark project={p} />
                        <span className="font-medium text-gray-700">{p.name}</span>
                      </button>
                    );
                  })}
                </div>
              </Labeled>
              <div className="grid gap-1.5 sm:grid-cols-2">
                <Toggle on={lg.canViewRanks} onChange={(v) => setLg({ canViewRanks: v })} label="Can view rank tracking" />
                <Toggle on={lg.canDownload} onChange={(v) => setLg({ canDownload: v })} label="Can download reports" />
                <Toggle on={lg.canManageTasks} onChange={(v) => setLg({ canManageTasks: v })} label="Can manage tasks" desc="Complete tasks assigned to them in Project Management" />
                <Toggle on={lg.canComment !== false} onChange={(v) => setLg({ canComment: v })} label="Can comment on records" />
              </div>
              <div className="rounded-lg bg-gray-50 p-3 text-[11.5px] leading-relaxed text-gray-500">
                In production, store only a password <b>hash</b> (bcrypt/argon2) server-side and issue a
                session cookie on login — never keep plain-text passwords.
              </div>
            </div>
          )}
        </div>
      </div>
  );
}

function ClientSettingsModal({ client, onChange, onClose }) {
  return (
    <Modal title={`Client settings — ${client.name}`} sub="Client info, company info and white-label branding." onClose={onClose} wide>
      <ClientSettingsBody client={client} onChange={onChange} />
    </Modal>
  );
}

/* ================= Project Settings window (gear on the project row) =================
   Three tabs: Client (client settings — admins only see client details),
   Team (per-project, per-member section access; assignment in Company Settings
   alone does NOT reveal a project until access is granted here),
   Settings (the project's own settings — moved from the Performance nav). */
const ACCESS_TREE = [
  { key: "perf", label: "Performance Studio", items: [["ranks", "Keyword rank tracking"], ["gbp", "Business Profile"], ["web", "Website performance"]] },
  { key: "pm", label: "Project Management", items: [["records", "Records"], ["wiki", "Wiki"]] },
  { key: "opt", label: "Optimization Studio", items: [["ogbp", "Google Business Profile"], ["webConnection", "Website — Connection"], ["webPages", "Website — Pages"], ["webPosts", "Website — Posts"], ["social", "Social Media"]] },
];
function ProjectSettingsModal({ client, project, company, onUpdateProject, onUpdateClient, dfsConnected, accent, onClose }) {
  const [tab, setTab] = useState("client");
  const [openMember, setOpenMember] = useState(null);
  const access = project.teamAccess || {};
  const assigned = (company.team || []).filter((m) => !m.isOwner && (m.projects === "all" || (Array.isArray(m.projects) && m.projects.includes(project.id))));
  const setMemberAccess = (mid, key, val) =>
    onUpdateProject({ teamAccess: { ...access, [mid]: { ...(access[mid] || {}), [key]: val } } });
  const grantedCount = (mid) => Object.values(access[mid] || {}).filter(Boolean).length;

  return (
    <Modal title={`Project settings — ${project.name}`} sub={client.name} onClose={onClose} wide>
      <div className="mb-4 flex gap-1.5">
        {[["client", "Client", Users], ["team", "Team", Shield], ["settings", "Settings", Settings]].map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold"
            style={tab === key ? { background: accent + "10", borderColor: accent, color: accent } : { background: "var(--chip-bg, #fff)", borderColor: "#E5E7EB", color: "var(--chip-fg, #4B5563)" }}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {tab === "client" && (
        <div>
          <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
            Client details are visible to <b>admins only</b> — team members never see this tab regardless of their access below.
          </div>
          <ClientSettingsBody client={client} onChange={onUpdateClient} />
        </div>
      )}

      {tab === "team" && (
        <div className="space-y-2.5">
          <div className="rounded-lg bg-gray-50 p-3 text-[11.5px] leading-relaxed text-gray-500">
            These are the team members assigned to this project in Company Settings. Assignment alone shows them <b>nothing</b> —
            the project only appears in their dashboard once you grant at least one section below. Client details stay admin-only.
          </div>
          {assigned.map((m) => {
            const open = openMember === m.id;
            const n = grantedCount(m.id);
            return (
              <div key={m.id} className="rounded-xl border border-gray-100">
                <button onClick={() => setOpenMember(open ? null : m.id)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50">
                  <Ava name={m.name} size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-semibold text-gray-800">{m.name}</span>
                      <RoleBadge role={m.role} />
                    </span>
                    <span className="block text-[10.5px]" style={{ color: n ? "#16A34A" : "#DC2626" }}>
                      {n ? `${n} section${n > 1 ? "s" : ""} accessible` : "No access yet — can't see this project"}
                    </span>
                  </span>
                  <ChevronDown size={14} className="shrink-0 text-gray-300" style={{ transform: open ? "rotate(180deg)" : "none" }} />
                </button>
                {open && (
                  <div className="ll-fade space-y-3 border-t border-gray-50 p-3">
                    {ACCESS_TREE.map((sec) => (
                      <div key={sec.key}>
                        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{sec.label}</div>
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {sec.items.map(([k, lbl]) => (
                            <Toggle key={k} label={lbl} on={!!(access[m.id] || {})[k]} onChange={(v) => setMemberAccess(m.id, k, v)} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {assigned.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-200 py-8 text-center text-[12.5px] text-gray-400">
              No team members are assigned to this project yet — assign them in Company Settings → Team & permissions first.
            </div>
          )}
        </div>
      )}

      {tab === "settings" && (
        <ProjectSettingsView project={project} dfsConnected={dfsConnected} update={onUpdateProject} accent={accent} />
      )}
    </Modal>
  );
}



function AddClientModal({ onClose, onAdd }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  return (
    <Modal title="Add client" sub="Create the client folder — you'll add their projects next." onClose={onClose}>
      <div className="space-y-3">
        <Labeled label="Client name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bright Smile Group" className={inputCls} /></Labeled>
        <div className="grid grid-cols-2 gap-2">
          <Labeled label="Contact person"><input value={contact} onChange={(e) => setContact(e.target.value)} className={inputCls} /></Labeled>
          <Labeled label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} /></Labeled>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Labeled label="Company name"><input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={inputCls} /></Labeled>
          <Labeled label="Company website"><input value={companyWebsite} onChange={(e) => setCompanyWebsite(e.target.value)} className={inputCls} /></Labeled>
        </div>
        <button disabled={!name.trim()}
          onClick={() => onAdd({
            id: "cl" + Date.now(), name: name.trim(), contact, email, phone: "",
            companyName: companyName || name.trim(), companyWebsite, address: "",
            whiteLabel: { enabled: false, name: "", website: "", logo: null },
            login: { enabled: false, email: email || "", password: "", projectIds: [], canViewRanks: true, canDownload: true, canManageTasks: false, canComment: true },
            projects: [],
          })}
          className="w-full rounded-xl bg-gray-900 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-40">
          Create client
        </button>
      </div>
    </Modal>
  );
}
function AddProjectModal({ clients, defaultClientId, onClose, onAdd }) {
  const [clientId, setClientId] = useState(defaultClientId || clients[0]?.id);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [accent, setAccent] = useState(ACCENTS[1].hex);
  return (
    <Modal title="Add project" sub="Projects hold dashboards & tracked keywords. Keywords and cities are added inside Keyword Rank Tracking." onClose={onClose}>
      <div className="space-y-3">
        <Labeled label="Client">
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputCls + " bg-white"}>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Labeled>
        <Labeled label="Project name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bright Smile — Manhattan" className={inputCls} /></Labeled>
        <Labeled label="Website"><input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="example.com" className={inputCls} /></Labeled>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-gray-500">Accent:</span>
          {ACCENTS.map((a) => (
            <button key={a.hex} onClick={() => setAccent(a.hex)} className="h-6 w-6 rounded-full border-2" style={{ background: a.hex, borderColor: accent === a.hex ? "#18202F" : "transparent" }} />
          ))}
        </div>
        <button disabled={!name.trim() || !clientId}
          onClick={() => onAdd(clientId, mkProject("p" + Date.now(), name.trim(), website.trim().replace(/^https?:\/\//, "") || "example.com", accent, []))}
          className="w-full rounded-xl py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
          Create project
        </button>
      </div>
    </Modal>
  );
}

function LoginScreen({ company, clients, dark, onLogin, onTeamLogin, onBack }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const demo = clients.find((c) => c.login?.enabled && c.login.password);
  const demoTeam = (company.team || []).find((m) => !m.isOwner && m.password);
  const submit = () => {
    const eml = email.trim().toLowerCase();
    // team members and clients share this door; blank passwords never match either way
    const m = (company.team || []).find((m) => m.password && m.email.trim().toLowerCase() === eml && m.password === password);
    if (m) { onTeamLogin(m.id); return; }
    const c = clients.find((c) =>
      c.login?.enabled &&
      c.login.password &&
      c.login.email.trim().toLowerCase() === eml &&
      c.login.password === password
    );
    if (c) { onLogin(c.id); } else { setError("Email or password doesn't match an active client or team account."); }
  };
  return (
    <div className={`ll-root ${dark ? "ll-dark" : ""} flex min-h-screen items-center justify-center bg-[#F5F6F8] p-4`}>
      <style>{FONT_CSS}</style>
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <BrandMark name={company.name} logo={company.logo} accent={company.accent} size="lg" />
          <div className="ll-display text-xl font-bold tracking-tight">{company.name}</div>
          <div className="text-[12.5px] text-gray-400">Sign in — clients see their projects, team members get their workspace</div>
        </div>
        <Card className="space-y-3 p-5">
          <Labeled label="Email">
            <input value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="you@company.com" className={inputCls} />
          </Labeled>
          <Labeled label="Password">
            <input value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && submit()} type="password" placeholder="••••••••" className={inputCls} />
          </Labeled>
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-600">{error}</div>}
          <button onClick={submit} className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13.5px] font-semibold text-white"
            style={{ background: company.accent }}>
            <LogIn size={15} /> Sign in
          </button>
        </Card>
        {demo && (
          <div className="mt-3 rounded-xl border border-dashed border-gray-300 p-3 text-center text-[11.5px] text-gray-400">
            Demo client account: <span className="ll-mono">{demo.login.email}</span> / <span className="ll-mono">{demo.login.password}</span>
          </div>
        )}
        {demoTeam && (
          <div className="mt-2 rounded-xl border border-dashed border-gray-300 p-3 text-center text-[11.5px] text-gray-400">
            Demo team account ({demoTeam.role}): <span className="ll-mono">{demoTeam.email}</span> / <span className="ll-mono">{demoTeam.password}</span>
          </div>
        )}
        <button onClick={onBack} className="mt-4 w-full text-center text-[12px] text-gray-400 hover:text-gray-600">← Back to agency dashboard</button>
      </div>
    </div>
  );
}

function ClientPortal({ client, company, dark, setDark, onLogout, onUpdateProject }) {
  const allowed = client.projects.filter((p) => client.login.projectIds.includes(p.id));
  const [pid, setPid] = useState(allowed[0]?.id);
  const [view, setView] = useState("overview");
  const [cmp, setCmp] = useState(3);
  const [range, setRange] = useState(DEFAULT_RANGE);
  const project = allowed.find((p) => p.id === pid) || allowed[0];

  const tracking = useMemo(() => (project ? project.tracking.map(hydrate) : []), [project?.tracking]);
  const trackedKeywords = useMemo(() => (project ? [...new Set(project.tracking.map((t) => t.keyword))] : []), [project?.tracking]);
  const monthKey = useMonthGrid();
  const data = useMemo(
    () => (project ? genSiteData(project, trackedKeywords, client.companyName) : null),
    [project?.id, project?.name, trackedKeywords.join("|"), client.companyName, monthKey] // name is part of the generator seed; monthKey regenerates after a month rollover
  );
  const accent = project?.accent || "#1F2A44";

  const wl = client.whiteLabel;
  const brand = wl?.enabled
    ? { name: wl.name || client.companyName || client.name, logo: wl.logo, website: wl.website, accent }
    : { name: company.name, logo: company.logo, website: "", accent: company.accent };

  const nav = [...NAV.filter((n) => {
    if (n.key === "settings") return false;
    if (n.key === "ranks") return client.login.canViewRanks;
    if (n.key === "gbp") return project?.integrations.gbp;
    if (n.key === "web") return project?.integrations.ga || project?.integrations.gsc;
    return true;
  }), { key: "pm", label: "Project Management", icon: ListTodo }];
  const pmPeople = useMemo(() => {
    const team = (company.team || [])
      .filter((m) => m.projects === "all" || (Array.isArray(m.projects) && m.projects.includes(project?.id)))
      .map((m) => ({ name: m.name, type: "team" }));
    return [...team, { name: client.contact, type: "client" }];
  }, [company.team, project?.id, client.contact]);

  return (
    <div className={`ll-root ${dark ? "ll-dark" : ""} min-h-screen bg-[#F5F6F8]`} style={{ "--accent": accent }}>
      <style>{FONT_CSS}</style>
      <div className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 px-5 py-3.5 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BrandMark name={brand.name} logo={brand.logo} accent={brand.accent} size="lg" />
            <div>
              <div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">{brand.name}</div>
              <div className="ll-display text-[17px] font-semibold leading-tight">{project?.name}</div>
            </div>
          </div>
          <div className="no-print flex flex-wrap items-center gap-2">
            {allowed.length > 1 && (
              <select value={pid} onChange={(e) => { setPid(e.target.value); setView("overview"); }}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] font-medium">
                {allowed.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1">
              <span className="px-1.5 text-[11px] font-medium text-gray-400">Compare vs</span>
              {[1, 3, 6, 12].map((m) => (
                <button key={m} onClick={() => setCmp(m)} className="ll-mono rounded-lg px-2 py-1 text-[12px] font-semibold"
                  style={cmp === m ? { background: accent, color: "#fff" } : { color: "var(--chip-fg, #6B7280)" }}>
                  {m}mo
                </button>
              ))}
              <select value={cmp} onChange={(e) => setCmp(+e.target.value)} className="ll-mono rounded-lg border-0 bg-transparent py-1 pl-1 pr-1 text-[12px] font-semibold text-gray-500">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m} mo</option>)}
              </select>
            </div>
            {client.login.canDownload && (
              <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] font-medium text-gray-600 hover:border-gray-300">
                <Printer size={14} /> Report
              </button>
            )}
            <DarkToggle dark={dark} setDark={setDark} />
            <button onClick={onLogout} className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] font-medium text-gray-600 hover:border-gray-300">
              <LogOut size={14} /> Log out
            </button>
          </div>
        </div>
        <div className="no-print mt-3 flex flex-wrap gap-1">
          {nav.map((n) => (
            <button key={n.key} onClick={() => setView(n.key)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium"
              style={view === n.key ? { background: accent + "14", color: accent } : { color: "var(--chip-fg, #6B7280)" }}>
              <n.icon size={14} /> {n.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-6xl p-5">
        {!project && (
          <Card className="p-10 text-center text-[13px] text-gray-400">
            No projects have been shared with your account yet — please contact your SEO team.
          </Card>
        )}
        {project && data && (
          <>
            {view === "overview" && <OverviewView project={project} data={data} tracking={tracking} cmp={cmp} accent={accent} clientView />}
            {view === "ranks" && client.login.canViewRanks && <RankTrackingView project={project} tracking={tracking} dfsConnected accent={accent} onAdd={() => {}} onDelete={() => {}} readOnly />}
            {view === "gbp" && project.integrations.gbp && <GbpView project={project} data={data} range={range} setRange={setRange} accent={accent} />}
            {view === "web" && <WebsitePerformanceView project={project} data={data} range={range} setRange={setRange} accent={accent} />}
            {view === "pm" && (
              <ProjectManagementView project={project} people={pmPeople}
                perms={{ admin: false, create: false, manage: false, complete: !!client.login.canManageTasks, comment: client.login.canComment !== false }}
                currentUser={client.contact} accent={accent}
                onUpdate={(patch) => onUpdateProject(project.id, patch)} log={null} />
            )}
          </>
        )}
        <div className="mt-8 flex items-center justify-between border-t border-gray-200 pt-4 text-[11px] text-gray-400">
          <span>{brand.name} · report for {project?.name}</span>
          <span>{brand.website || ""}</span>
        </div>
      </div>
    </div>
  );
}

const uid = () => "b" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
const chartShades = (c) => [c, c + "CC", c + "99", c + "66", c + "40", "#CBD5E1"];

function parsePasted(raw) {
  return raw.replace(/\r/g, "").split("\n").filter((l) => l.trim().length).map((l) => l.split("\t"));
}

function ReportBuilder({ project, data, tracking, clientProjects = [], records = [], template = "performance", agencyBrand, wlBrand, clientInfo, defaultCmp, dark, setDark, onClose }) {
  const today = new Date().toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" });
  const [title, setTitle] = useState(template === "work" ? `${project.name} — Work Report` : `${project.name} — SEO Performance Report`);
  const [accent, setAccent] = useState(project.accent);
  const [cmp, setCmp] = useState(defaultCmp || 3);
  const [showBrand, setShowBrand] = useState(true);
  const [brandPanel, setBrandPanel] = useState(false);
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
  const KPIS = {
    gbpViews: { label: "Profile views", src: "GBP", val: (c) => data.months[12].gbp.views, prev: (c) => data.months[12 - c].gbp.views, show: project.integrations.gbp },
    gbpCalls: { label: "Phone calls", src: "GBP", val: () => data.months[12].gbp.calls, prev: (c) => data.months[12 - c].gbp.calls, show: project.integrations.gbp },
    gbpDirections: { label: "Directions", src: "GBP", val: () => data.months[12].gbp.directions, prev: (c) => data.months[12 - c].gbp.directions, show: project.integrations.gbp },
    gaUsers: { label: "Website users", src: "GA4", val: () => data.months[12].ga.users, prev: (c) => data.months[12 - c].ga.users, show: project.integrations.ga },
    gaConversions: { label: "Conversions", src: "GA4", val: () => data.months[12].ga.conversions, prev: (c) => data.months[12 - c].ga.conversions, show: project.integrations.ga },
    gscClicks: { label: "Search clicks", src: "GSC", val: () => data.months[12].gsc.clicks, prev: (c) => data.months[12 - c].gsc.clicks, show: project.integrations.gsc },
    avgRank: { label: "Avg. position", src: "Ranks", val: () => +avgPosDaysAgo(tracking, 0).toFixed(1), prev: (c) => { const v = avgPosDaysAgo(tracking, c * 30); return v == null ? null : +v.toFixed(1); }, invert: true, isRank: true, show: tracking.length > 0 },
    top3: { label: "Keywords in top 3", src: "Ranks", val: () => tracking.filter((t) => t.stats.cur <= 3).length, prev: (c) => tracking.filter((t) => t.positions[Math.max(0, t.positions.length - 1 - c * 30)] <= 3).length, show: tracking.length > 0 },
    top10: { label: "Keywords in top 10", src: "Ranks", val: () => tracking.filter((t) => t.stats.cur <= 10).length, prev: (c) => tracking.filter((t) => t.positions[Math.max(0, t.positions.length - 1 - c * 30)] <= 10).length, show: tracking.length > 0 },
    top20: { label: "Keywords in top 20", src: "Ranks", val: () => tracking.filter((t) => t.stats.cur <= 20).length, prev: (c) => tracking.filter((t) => t.positions[Math.max(0, t.positions.length - 1 - c * 30)] <= 20).length, show: tracking.length > 0 },
  };
  const TABLE_KINDS = {
    rank: { label: "Keyword rankings", show: tracking.length > 0 },
    gscQueries: { label: "GSC top queries", show: project.integrations.gsc },
    gbpTerms: { label: "GBP searches by keywords", show: project.integrations.gbp },
    events: { label: "GA4 event counts", show: project.integrations.ga },
    topPages: { label: "GA4 top landing pages", show: project.integrations.ga },
  };

  /* ---- default report layout (fully editable from there) ---- */
  const [blocks, setBlocks] = useState(() => {
    if (template === "work") {
      const b = [
        { id: uid(), type: "heading", text: "Work summary", level: 2 },
        { id: uid(), type: "paragraph", text: `All work completed and in progress for ${project.name}: records, checklists and individual tasks with status, due dates and assignees.` },
      ];
      if (records.length) records.forEach((r) => b.push({ id: uid(), type: "work", recordId: r.id, excludedChecklists: [], excludedTasks: [] }));
      else b.push({ id: uid(), type: "paragraph", text: "No project records yet — create records in Project Management to include them here." });
      return b;
    }
    const b = [
      { id: uid(), type: "heading", text: "Executive summary", level: 2 },
      { id: uid(), type: "paragraph", text: `This report covers ${project.website} and compares the latest month against ${defaultCmp || 3} month(s) ago. Highlights: visibility, customer actions and local rankings all trend upward.` },
      { id: uid(), type: "kpis", metrics: ["gbpViews", "gaUsers", "gscClicks", "avgRank", "top3", "top10", "top20"].filter((k) => KPIS[k].show) },
    ];
    if (TREND.gbpViews.show) b.push({ id: uid(), type: "heading", text: "Visibility trend", level: 2 }, { id: uid(), type: "chart", mode: "trend", source: "gbpViews", chartType: "area", months: 13 });
    if (BREAKDOWN.sources.show) b.push({ id: uid(), type: "heading", text: "Where traffic comes from", level: 2 }, { id: uid(), type: "chart", mode: "breakdown", source: "sources", chartType: "pie" });
    if (TABLE_KINDS.rank.show) b.push({ id: uid(), type: "heading", text: "Local keyword rankings", level: 2 }, { id: uid(), type: "table", kind: "rank", limit: "10" });
    return b;
  });
  const [openId, setOpenId] = useState(null);
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
  const add = (block) => { const b = { id: uid(), ...block }; setBlocks((bs) => [...bs, b]); setOpenId(b.id); };
  const addMany = (arr) => setBlocks((bs) => [...bs, ...arr.map((x) => ({ id: uid(), ...x }))]);

  /* ---- block renderers ---- */
  const renderTrend = (b) => {
    const def = TREND[b.source] || TREND[Object.keys(TREND).find((k) => TREND[k].show)];
    const color = b.color || accent;
    const rows = data.months.slice(13 - (b.months || 13)).map((m, i, arr) => ({ label: m.label, value: def.get(m, 13 - arr.length + i) }));
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
    const c = b.cmp || cmp;
    const metrics = (b.metrics || []).filter((k) => KPIS[k]?.show);
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {metrics.map((k) => {
          const d = KPIS[k];
          const v = d.val(), p = d.prev(c);
          return (
            <div key={k} className="rounded-xl border border-gray-200 p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11.5px] font-medium text-gray-500">{d.label}</span>
                <SourceTag label={d.src} />
              </div>
              <div className="ll-display text-[26px] font-semibold leading-none tracking-tight">{d.isRank ? "#" + v : fmt(v)}</div>
              <div className="mt-1"><Delta pct={d.isRank ? pctDelta(v, p) : pctDelta(v, p)} invert={d.invert} /> <span className="text-[10.5px] text-gray-400">vs {c}mo</span></div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderTable = (b) => {
    const c = b.cmp || cmp;
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
  const renderGbpReport = (b) => {
    const cp = projOf(b.projectId);
    const c = b.cmp || cmp;
    const color = b.color || accent;
    const M = cp.data.months, cur = M[12], prev = M[12 - c];
    const kpis = [
      ["Profile views", cur.gbp.views, prev.gbp.views],
      ["Calls", cur.gbp.calls, prev.gbp.calls],
      ["Directions", cur.gbp.directions, prev.gbp.directions],
      ["Website clicks", cur.gbp.websiteClicks, prev.gbp.websiteClicks],
    ];
    const breakdown = M.map((m) => ({ label: m.label, Search: m.gbp.searchViews, Maps: m.gbp.mapViews }));
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
              <th className="px-3 py-1.5 text-left text-[9px] font-semibold uppercase tracking-wider text-gray-400">vs {c}mo</th>
            </tr></thead>
            <tbody>{cp.data.gbpTerms.slice(0, 5).map((t, i) => (
              <tr key={i}><td className="border-b border-gray-50 px-3 py-1.5 font-medium">{t.term}</td>
                <td className="ll-mono border-b border-gray-50 px-3 py-1.5">{fmt(t.impressions)}</td>
                <td className="border-b border-gray-50 px-3 py-1.5"><Delta pct={pctDelta(t.impressions, t.prev(c))} /></td></tr>
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

  const renderWork = (b) => {
    const rec = records.find((r) => r.id === b.recordId);
    if (!rec) return <div className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-[12px] text-gray-400">Pick a record in this block's settings.</div>;
    const exCl = new Set(b.excludedChecklists || []);
    const exT = new Set(b.excludedTasks || []);
    const cls = rec.checklists.filter((c) => !exCl.has(c.id)).map((c) => ({ ...c, tasks: c.tasks.filter((t) => !exT.has(t.id)) }));
    const all = cls.flatMap((c) => c.tasks);
    const done = all.filter((t) => t.completedAt).length;
    const st = recordState(rec);
    const chip = st === "done" ? { bg: "#DCFCE7", fg: "#166534", label: "Completed" } : st === "overdue" ? { bg: "#FEE2E2", fg: "#991B1B", label: "Overdue" } : { bg: "#F1F5F9", fg: "#475569", label: "In progress" };
    return (
      <div className="rounded-xl border border-gray-100 p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="ll-display text-[16px] font-semibold">{linkify(rec.name)}</div>
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ background: chip.bg, color: chip.fg }}>{chip.label}</span>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
          <span>Assignees: <b className="text-gray-700">{rec.assignees.join(", ") || "—"}</b></span>
          {rec.dueDate && <span>Due: <b className="ll-mono text-gray-700">{fmtDay(rec.dueDate)}</b></span>}
          {rec.completedAt && <span style={{ color: POS }}>Completed {fmtTs2(rec.completedAt)}</span>}
          <span className="ll-mono ml-auto">{done}/{all.length} tasks done</span>
        </div>
        {all.length > 0 && (
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full" style={{ width: `${all.length ? (done / all.length) * 100 : 0}%`, background: st === "done" ? POS : accent }} />
          </div>
        )}
        <div className="space-y-3">
          {cls.map((c) => (
            <div key={c.id}>
              <div className="mb-1 flex items-center justify-between">
                <div className="text-[13px] font-semibold text-gray-800">{linkify(c.name)}</div>
                <span className="ll-mono text-[10px] text-gray-400">{c.tasks.filter((t) => t.completedAt).length}/{c.tasks.length}</span>
              </div>
              <table className="w-full text-[12px]">
                <tbody>
                  {c.tasks.map((t) => {
                    const ts = taskState(t);
                    return (
                      <tr key={t.id} className="border-b border-gray-50">
                        <td className="w-6 py-1.5">
                          <span className="flex h-[15px] w-[15px] items-center justify-center rounded border-2"
                            style={t.completedAt ? { background: POS, borderColor: POS, color: "#fff" } : { borderColor: ts === "overdue" ? NEG : "#CBD5E1" }}>
                            {t.completedAt && <CheckCircle2 size={10} strokeWidth={3.5} />}
                          </span>
                        </td>
                        <td className="py-1.5 pr-2 font-medium" style={{ color: TASK_COLORS[ts], textDecoration: ts === "done" ? "line-through" : "none", opacity: ts === "done" ? 0.75 : 1 }}>
                          {linkify(t.title)}
                        </td>
                        <td className="ll-mono w-20 py-1.5 text-[10.5px] text-gray-400">{fmtTs2(t.createdAt)}</td>
                        <td className="ll-mono w-20 py-1.5 text-[10.5px]" style={{ color: ts === "overdue" ? NEG : "#9CA3AF" }}>{t.dueDate ? "due " + fmtDay(t.dueDate) : "—"}</td>
                        <td className="ll-mono w-20 py-1.5 text-[10.5px]" style={{ color: t.completedAt ? POS : "#C3CAD6" }}>{t.completedAt ? "✓ " + fmtTs2(t.completedAt) : ""}</td>
                        <td className="w-28 py-1.5 text-right text-[10.5px] text-gray-500">{t.assignees.join(", ")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
          {cls.length === 0 && <div className="py-3 text-center text-[12px] text-gray-300">All checklists excluded.</div>}
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
      case "rankReport": return renderRankReport(b);
      default: return null;
    }
  };

  /* ---- per-block settings panel ---- */
  const cmpSelect = (b) => (
    <Labeled label="Comparison">
      <select value={b.cmp || ""} onChange={(e) => patch(b.id, { cmp: e.target.value ? +e.target.value : null })} className={inputCls + " bg-white"}>
        <option value="">Report default ({cmp}mo)</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m} month{m > 1 ? "s" : ""}</option>)}
      </select>
    </Labeled>
  );
  const colorPick = (b) => (
    <Labeled label="Color">
      <div className="flex items-center gap-1.5">
        {[accent, ...ACCENTS.map((a) => a.hex)].slice(0, 6).map((hx) => (
          <button key={hx} onClick={() => patch(b.id, { color: hx === accent ? null : hx })}
            className="h-6 w-6 rounded-full border-2"
            style={{ background: hx, borderColor: (b.color || accent) === hx ? "#18202F" : "transparent" }} />
        ))}
        <input type="color" value={b.color || accent} onChange={(e) => patch(b.id, { color: e.target.value })} className="h-6 w-8 cursor-pointer rounded border border-gray-200" />
      </div>
    </Labeled>
  );

  const renderSettings = (b) => {
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
  const LIB = template === "work" ? [...LIB_WORK, ...LIB_COMMON] : [...LIB_PERF, ...LIB_COMMON];

  return (
    <div className={`ll-root ${dark ? "ll-dark" : ""} min-h-screen bg-[#EDEFF3]`}>
      <style>{FONT_CSS}</style>

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
            <span className="text-[11px] font-medium text-gray-400">Default compare</span>
            <select value={cmp} onChange={(e) => setCmp(+e.target.value)} className="ll-mono border-0 bg-transparent text-[12px] font-semibold text-gray-600">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m} mo</option>)}
            </select>
          </div>
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
          <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12.5px] font-semibold text-white" style={{ background: accent }}>
            <Printer size={14} /> Print / Download PDF
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

      <div className="mx-auto flex max-w-6xl gap-5 p-5">
        {/* report page */}
        <div className="min-w-0 flex-1 print-full">
          {showCover && (
            <div className="mx-auto mb-5 flex max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-sm"
              style={{ aspectRatio: "210 / 297", pageBreakAfter: "always" }}>
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
          <div className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-sm" style={{ minHeight: 600 }}>
            {showBrand && (
              <div className="mb-6 flex items-center justify-between border-b pb-4" style={{ borderColor: accent + "33" }}>
                <div className="flex items-center gap-2.5">
                  <BrandMark name={brand.name} logo={brand.logo} accent={brand.accent || accent} />
                  <div>
                    <div className="ll-display text-[15px] font-bold leading-tight">{brand.name}</div>
                    <div className="text-[11px] text-gray-400">{today}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-gray-400">Prepared for</div>
                  <div className="text-[13px] font-semibold text-gray-700">{preparedFor}</div>
                </div>
              </div>
            )}
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              className="ll-display mb-5 w-full border-0 bg-transparent text-[24px] font-bold tracking-tight outline-none"
              style={{ color: accent }} />

            <div className="space-y-1">
              {blocks.map((b, i) => (
                <div key={b.id} className="group relative rounded-xl px-2 py-2 hover:bg-gray-50/80">
                  {/* hover toolbar */}
                  <div className="no-print absolute -top-2.5 right-2 z-10 flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm opacity-50 transition-opacity group-hover:opacity-100">
                    <button onClick={() => move(b.id, -1)} disabled={i === 0} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30"><ChevronUp size={13} /></button>
                    <button onClick={() => move(b.id, 1)} disabled={i === blocks.length - 1} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30"><ChevronDown size={13} /></button>
                    <button onClick={() => setOpenId(openId === b.id ? null : b.id)} className="rounded-md p-1 hover:bg-gray-100" style={{ color: openId === b.id ? accent : "#9CA3AF" }}><Settings2 size={13} /></button>
                    <button onClick={() => duplicate(b.id)} className="rounded-md p-1 text-gray-400 hover:bg-gray-100"><Copy size={13} /></button>
                    <button onClick={() => remove(b.id)} className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"><Trash2 size={13} /></button>
                  </div>
                  {renderBlock(b)}
                  {openId === b.id && b.type !== "divider" && (
                    <div className="no-print ll-fade mt-3 rounded-xl border border-gray-200 bg-white p-4">{renderSettings(b)}</div>
                  )}
                </div>
              ))}
              {blocks.length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-[13px] text-gray-400">
                  Empty report — add blocks from the panel on the right.
                </div>
              )}
            </div>

            <div className="mt-8 flex items-center justify-between border-t border-gray-100 pt-3 text-[10.5px] text-gray-400">
              <span>{brand.name} · {title}</span>
              <span>{today}</span>
            </div>
          </div>
        </div>

        {/* block library rail */}
        <div className="no-print w-56 shrink-0">
          <div className="sticky top-20 rounded-2xl border border-gray-200 bg-white p-3">
            <div className="mb-2 px-1 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Add blocks</div>
            <div className="space-y-1">
              {LIB.map((l) => (
                <button key={l.label} onClick={() => add(l.make())}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-medium text-gray-700 hover:bg-gray-50">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: accent + "14", color: accent }}><l.icon size={14} /></span>
                  {l.label}
                </button>
              ))}
            </div>
            {template !== "work" && clientProjects.length > 0 && (
              <div className="mt-3 border-t border-gray-100 pt-3">
                <div className="mb-1 px-1 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Multi-project sections</div>
                <div className="mb-2 px-1 text-[10.5px] leading-snug text-gray-400">One client, many locations — pick projects, then add a section per project.</div>
                <div className="mb-2 space-y-1">
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
                </div>
                <div className="space-y-1.5">
                  <button
                    onClick={() => addMany(clientProjects.filter((cp) => pickedProjIds.has(cp.project.id)).map((cp) => ({ type: "gbpReport", projectId: cp.project.id, showTerms: true })))}
                    disabled={pickedProjIds.size === 0}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-[11.5px] font-semibold text-white disabled:opacity-40"
                    style={{ background: accent }}>
                    <Building2 size={13} /> Add GBP performance ({pickedProjIds.size})
                  </button>
                  <button
                    onClick={() => addMany(clientProjects.filter((cp) => pickedProjIds.has(cp.project.id)).map((cp) => ({ type: "rankReport", projectId: cp.project.id, limit: "10" })))}
                    disabled={pickedProjIds.size === 0}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-[11.5px] font-semibold text-white disabled:opacity-40"
                    style={{ background: accent }}>
                    <Target size={13} /> Add keyword rankings ({pickedProjIds.size})
                  </button>
                </div>
              </div>
            )}
            <div className="mt-3 rounded-lg bg-gray-50 p-2.5 text-[10.5px] leading-relaxed text-gray-400">
              Every section has its own toolbar: move up/down, edit (gear), duplicate, remove. Headings and paragraphs are edited directly on the page — just click and type.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= Project Management ================= */
const todayISO = () => isoDate(new Date());
const fmtDay = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric" }) : "—");
const fmtTs2 = (ts) => (ts ? new Date(ts).toLocaleDateString("en", { month: "short", day: "numeric" }) : "—");
const taskState = (t) => (t.completedAt ? "done" : t.dueDate && t.dueDate < todayISO() ? "overdue" : "open");
const TASK_COLORS = { done: "#15803D", overdue: "#DC2626", open: "#1F2937" };
const flatTasks = (r) => (r.checklists || []).flatMap((c) => c.tasks);
const recordState = (r) => {
  if (r.completedAt) return "done";
  if (flatTasks(r).some((t) => taskState(t) === "overdue") || (r.dueDate && r.dueDate < todayISO())) return "overdue";
  return "open";
};

function Ava({ name, size = 22, onRemove }) {
  const bg = ACCENTS[hashStr(name) % ACCENTS.length].hex;
  return (
    <span title={name + (onRemove ? " — click to remove" : "")} onClick={onRemove}
      className={`ll-display inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ${onRemove ? "cursor-pointer hover:opacity-70" : ""}`}
      style={{ width: size, height: size, fontSize: size * 0.42, background: bg }}>
      {name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
    </span>
  );
}
function AssignPicker({ people, current, onAdd }) {
  const avail = people.filter((p) => !current.includes(p.name));
  if (!avail.length) return null;
  return (
    <select value="" onChange={(e) => e.target.value && onAdd(e.target.value)}
      className="cursor-pointer rounded-md border border-dashed border-gray-300 bg-transparent px-1.5 py-0.5 text-[11px] text-gray-400 hover:border-gray-400">
      <option value="">+ Assign</option>
      {avail.map((p) => <option key={p.name} value={p.name}>{p.name}{p.type === "client" ? " (client)" : ""}</option>)}
    </select>
  );
}

/* ---- the record window: 70% work area / 30% comments+activity ---- */
function RecordWindow({ record, people, perms, currentUser, accent, onPatch, onDelete, onClose }) {
  const [tab, setTab] = useState("comments");
  const [newChecklist, setNewChecklist] = useState("");
  const [newTask, setNewTask] = useState({});
  const [comment, setComment] = useState("");

  const act = (text) => ({ id: "pa" + Date.now() + Math.random().toString(36).slice(2, 5), ts: Date.now(), author: currentUser, text });
  const patch = (p, actText) => onPatch({ ...p, updatedAt: Date.now(), activity: actText ? [act(actText), ...record.activity] : record.activity });

  const setChecklists = (cls, actText) => patch({ checklists: cls }, actText);
  const addChecklist = () => {
    const nm = newChecklist.trim(); if (!nm) return;
    setChecklists([...record.checklists, { id: "cl" + Date.now(), name: nm, tasks: [] }], `added checklist "${nm}"`);
    setNewChecklist("");
  };
  const addTask = (clId) => {
    const title = (newTask[clId] || "").trim(); if (!title) return;
    setChecklists(record.checklists.map((c) => c.id !== clId ? c : {
      ...c, tasks: [...c.tasks, { id: "t" + Date.now(), title, createdAt: Date.now(), dueDate: null, completedAt: null, assignees: [] }],
    }), `added task "${title}"`);
    setNewTask({ ...newTask, [clId]: "" });
  };
  const mutTask = (clId, tId, fn, actText) =>
    setChecklists(record.checklists.map((c) => c.id !== clId ? c : { ...c, tasks: c.tasks.map((t) => (t.id === tId ? fn(t) : t)) }), actText);
  const delTask = (clId, tId, title) =>
    setChecklists(record.checklists.map((c) => c.id !== clId ? c : { ...c, tasks: c.tasks.filter((t) => t.id !== tId) }), `deleted task "${title}"`);
  const addComment = () => {
    const txt = comment.trim(); if (!txt) return;
    patch({ comments: [{ id: "c" + Date.now(), ts: Date.now(), author: currentUser, text: txt }, ...record.comments] }, "commented");
    setComment("");
  };

  const isAssignee = record.assignees.includes(currentUser);
  const mayComment = perms.comment && (perms.admin || isAssignee);
  const done = flatTasks(record).filter((t) => t.completedAt).length;
  const total = flatTasks(record).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-3" onClick={onClose}>
      <div className="flex h-[88vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>

        {/* ============ LEFT 70% — record + checklists + tasks ============ */}
        <div className="flex w-[70%] flex-col border-r border-gray-100">
          <div className="border-b border-gray-100 px-6 pb-4 pt-5">
            <div className="flex items-start justify-between gap-3">
              <input value={record.name} disabled={!perms.manage}
                onChange={(e) => patch({ name: e.target.value })}
                className="ll-display w-full border-0 bg-transparent text-[20px] font-bold tracking-tight outline-none" />
              <div className="flex shrink-0 items-center gap-1.5">
                {perms.admin && (
                  <button onClick={() => { onDelete(); onClose(); }} title="Delete record"
                    className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500"><Trash2 size={15} /></button>
                )}
                <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X size={17} /></button>
              </div>
            </div>
            {/* fixed fields */}
            <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-5">
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Created at</div>
                <div className="ll-mono mt-0.5 text-[12px] text-gray-600">{fmtTs2(record.createdAt)}</div>
              </div>
              <div className="col-span-2 lg:col-span-1">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Assignees</div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {record.assignees.map((a) => (
                    <Ava key={a} name={a} size={22}
                      onRemove={perms.manage ? () => patch({ assignees: record.assignees.filter((x) => x !== a) }, `removed assignee ${a}`) : undefined} />
                  ))}
                  {perms.manage && <AssignPicker people={people} current={record.assignees}
                    onAdd={(n) => patch({ assignees: [...record.assignees, n] }, `added assignee ${n}`)} />}
                </div>
              </div>
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Updated at</div>
                <div className="ll-mono mt-0.5 text-[12px] text-gray-600">{relTime(record.updatedAt)}</div>
              </div>
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Due date</div>
                <input type="date" value={record.dueDate || ""} disabled={!perms.manage}
                  onChange={(e) => patch({ dueDate: e.target.value || null }, `set due date to ${fmtDay(e.target.value)}`)}
                  className="ll-mono mt-0.5 rounded border border-gray-200 px-1.5 py-0.5 text-[11px]" />
              </div>
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Completed at</div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="ll-mono text-[12px]" style={{ color: record.completedAt ? POS : "#6B7280" }}>{fmtTs2(record.completedAt)}</span>
                  {perms.manage && (
                    <button onClick={() => patch({ completedAt: record.completedAt ? null : Date.now() }, record.completedAt ? "reopened this record" : "marked this record complete")}
                      className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                      style={record.completedAt ? { background: "#F1F5F9", color: "#475569" } : { background: "#DCFCE7", color: "#166534" }}>
                      {record.completedAt ? "Reopen" : "Complete"}
                    </button>
                  )}
                </div>
              </div>
            </div>
            {total > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full transition-all" style={{ width: `${(done / total) * 100}%`, background: accent }} />
                </div>
                <span className="ll-mono text-[11px] text-gray-400">{done}/{total} tasks</span>
              </div>
            )}
          </div>

          {/* checklists + tasks */}
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
            {record.checklists.map((cl) => {
              const clDone = cl.tasks.filter((t) => t.completedAt).length;
              return (
                <div key={cl.id}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="ll-display text-[14px] font-semibold text-gray-800">{cl.name}</div>
                    <span className="ll-mono text-[10.5px] text-gray-400">{clDone}/{cl.tasks.length}</span>
                  </div>
                  <div className="space-y-0.5">
                    {cl.tasks.map((t) => {
                      const st = taskState(t);
                      return (
                        <div key={t.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                          {/* LEFT of task: delete + complete checkbox */}
                          <div className="flex shrink-0 items-center gap-1">
                            {perms.manage ? (
                              <button onClick={() => delTask(cl.id, t.id, t.title)} title="Delete task"
                                className="rounded p-0.5 text-gray-200 hover:bg-red-50 hover:text-red-500 group-hover:text-gray-300"><Trash2 size={13} /></button>
                            ) : <span className="w-[18px]" />}
                            <button
                              disabled={!perms.manage && !(perms.complete && t.assignees.includes(currentUser))}
                              onClick={() => mutTask(cl.id, t.id, (x) => ({ ...x, completedAt: x.completedAt ? null : Date.now() }),
                                t.completedAt ? `reopened task "${t.title}"` : `completed task "${t.title}"`)}
                              title={t.completedAt ? "Mark incomplete" : "Mark complete"}
                              className="disabled:cursor-not-allowed disabled:opacity-40"
                              style={{ width: 17, height: 17, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 5,
                                border: `2px solid ${t.completedAt ? POS : st === "overdue" ? NEG : "#94A3B8"}`,
                                background: t.completedAt ? POS : "transparent", color: "#fff" }}>
                              {t.completedAt && <CheckCircle2 size={11} strokeWidth={3.5} />}
                            </button>
                          </div>
                          {/* title */}
                          <div className="min-w-0 flex-1 text-[13px] font-medium"
                            style={{ color: TASK_COLORS[st], textDecoration: st === "done" ? "line-through" : "none", opacity: st === "done" ? 0.75 : 1 }}>
                            {t.title}
                          </div>
                          {/* RIGHT of task: dates + assignees */}
                          <div className="flex shrink-0 items-end gap-2.5 text-gray-400">
                            <span className="flex flex-col items-start">
                              <span className="text-[8px] font-semibold uppercase tracking-wider text-gray-300">Created</span>
                              <span className="ll-mono text-[10px] leading-tight">{fmtTs2(t.createdAt)}</span>
                            </span>
                            <span className="flex flex-col items-start">
                              <span className="text-[8px] font-semibold uppercase tracking-wider" style={{ color: st === "overdue" ? NEG : "#D1D5DB" }}>Due</span>
                              <input type="date" value={t.dueDate || ""} disabled={!perms.manage}
                                onChange={(e) => mutTask(cl.id, t.id, (x) => ({ ...x, dueDate: e.target.value || null }), `set task due date to ${fmtDay(e.target.value)}`)}
                                className="ll-mono w-[86px] rounded border border-gray-100 bg-transparent px-1 leading-tight"
                                style={{ fontSize: 10, height: 16, color: st === "overdue" ? NEG : "#6B7280" }} />
                            </span>
                            <span className="flex flex-col items-start">
                              <span className="text-[8px] font-semibold uppercase tracking-wider" style={{ color: t.completedAt ? POS : "#D1D5DB" }}>Done</span>
                              <span className="ll-mono text-[10px] leading-tight" style={{ color: t.completedAt ? POS : "#C3CAD6" }}>{t.completedAt ? fmtTs2(t.completedAt) : "\u2014"}</span>
                            </span>
                            <div className="flex -space-x-1.5">
                              {t.assignees.map((a) => (
                                <Ava key={a} name={a} size={19}
                                  onRemove={perms.manage ? () => mutTask(cl.id, t.id, (x) => ({ ...x, assignees: x.assignees.filter((n) => n !== a) }), `removed ${a} from "${t.title}"`) : undefined} />
                              ))}
                            </div>
                            {perms.manage && <AssignPicker people={people} current={t.assignees}
                              onAdd={(n) => mutTask(cl.id, t.id, (x) => ({ ...x, assignees: [...x.assignees, n] }), `assigned ${n} to "${t.title}"`)} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {perms.manage && (
                    <div className="mt-1 flex items-center gap-1.5 pl-2">
                      <input value={newTask[cl.id] || ""} onChange={(e) => setNewTask({ ...newTask, [cl.id]: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && addTask(cl.id)}
                        placeholder="Add task…" className="flex-1 rounded-lg border border-dashed border-gray-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-gray-300" />
                      <button onClick={() => addTask(cl.id)} className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-white" style={{ background: accent }}>
                        <Plus size={13} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {perms.manage && (
              <div className="flex items-center gap-1.5">
                <input value={newChecklist} onChange={(e) => setNewChecklist(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addChecklist()}
                  placeholder="Create checklist…" className="flex-1 rounded-xl border border-dashed border-gray-300 px-3 py-2 text-[13px] outline-none focus:border-gray-400" />
                <button onClick={addChecklist} className="flex items-center gap-1 rounded-xl px-3 py-2 text-[12.5px] font-semibold text-white" style={{ background: accent }}>
                  <ListTodo size={14} /> Create Checklist
                </button>
              </div>
            )}
            {record.checklists.length === 0 && !perms.manage && (
              <div className="py-8 text-center text-[13px] text-gray-300">No checklists yet.</div>
            )}
          </div>
        </div>

        {/* ============ RIGHT 30% — comments & activity ============ */}
        <div className="flex w-[30%] flex-col bg-gray-50/60">
          <div className="flex border-b border-gray-100">
            {[["comments", "Comments", MessageSquare], ["activity", "Activity", History]].map(([key, label, Icon]) => (
              <button key={key} onClick={() => setTab(key)}
                className="flex flex-1 items-center justify-center gap-1.5 border-b-2 py-3 text-[12.5px] font-semibold"
                style={tab === key ? { borderColor: accent, color: accent } : { borderColor: "transparent", color: "#9CA3AF" }}>
                <Icon size={14} /> {label}
                {key === "comments" && record.comments.length > 0 && <span className="ll-mono text-[10px]">({record.comments.length})</span>}
              </button>
            ))}
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {tab === "comments" && record.comments.map((c) => (
              <div key={c.id} className="rounded-xl border border-gray-100 bg-white p-3">
                <div className="mb-1 flex items-center gap-2">
                  <Ava name={c.author} size={20} />
                  <span className="text-[12px] font-semibold text-gray-800">{c.author}</span>
                  <span className="ll-mono ml-auto text-[10px] text-gray-400">{relTime(c.ts)}</span>
                </div>
                <p className="text-[12.5px] leading-relaxed text-gray-600">{c.text}</p>
              </div>
            ))}
            {tab === "comments" && record.comments.length === 0 && (
              <div className="py-6 text-center text-[12px] text-gray-300">No comments yet.</div>
            )}
            {tab === "activity" && record.activity.map((a) => (
              <div key={a.id} className="flex items-start gap-2">
                <Ava name={a.author} size={20} />
                <div className="min-w-0 flex-1 text-[12px] leading-snug">
                  <span className="font-semibold text-gray-800">{a.author}</span>{" "}
                  <span className="text-gray-500">{a.text}</span>
                  <div className="ll-mono text-[10px] text-gray-400">{relTime(a.ts)}</div>
                </div>
              </div>
            ))}
          </div>
          {tab === "comments" && (
            <div className="border-t border-gray-100 p-3">
              {mayComment ? (
                <div className="flex items-end gap-1.5">
                  <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addComment(); } }}
                    placeholder="Write a comment…" className="flex-1 resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] outline-none focus:border-gray-300" />
                  <button onClick={addComment} disabled={!comment.trim()}
                    className="rounded-xl px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>Send</button>
                </div>
              ) : (
                <div className="rounded-xl bg-gray-100 px-3 py-2 text-center text-[11px] text-gray-400">
                  Only assignees of this record can comment.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---- record list + create ---- */
function WikiView({ project, onUpdate, canEdit, accent, log }) {
  const wiki = project.wiki || { text: "", updatedAt: null };
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(wiki.text);
  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="ll-display text-[15px] font-semibold">Project Wiki</div>
          <div className="text-[11px] text-gray-400">Everything the team should know about this project{wiki.updatedAt ? ` \u00b7 updated ${relTime(wiki.updatedAt)}` : ""}. **bold**, *italic* and links render automatically.</div>
        </div>
        {canEdit && (editing ? (
          <div className="flex gap-1.5">
            <button onClick={() => setEditing(false)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-medium text-gray-500">Cancel</button>
            <button onClick={() => { onUpdate({ wiki: { text: draft, updatedAt: Date.now() } }); setEditing(false); log?.("Updated project wiki", project.name); }}
              className="rounded-lg px-3.5 py-1.5 text-[12px] font-semibold text-white" style={{ background: accent }}>Save wiki</button>
          </div>
        ) : (
          <button onClick={() => { setDraft(wiki.text); setEditing(true); }}
            className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[12px] font-semibold" style={{ borderColor: accent, color: accent }}>
            <Settings2 size={12} /> Edit wiki
          </button>
        ))}
      </div>
      {editing ? (
        <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} rows={14}
          placeholder={"# What is this project?\nGoals, target keywords, brand voice, login notes, do's & don'ts\u2026"}
          className={inputCls + " ll-mono resize-y text-[12.5px] leading-relaxed"} />
      ) : wiki.text ? (
        <div className="space-y-2.5 text-[13px] leading-relaxed text-gray-700">
          {wiki.text.split(/\n{2,}/).map((para, i) => <p key={i}>{inlineFmt(para, "w" + i)}</p>)}
        </div>
      ) : (
        <div className="py-10 text-center text-[12.5px] text-gray-300">No wiki yet {canEdit ? "\u2014 click Edit wiki to describe this project for your team." : "."}</div>
      )}
    </Card>
  );
}

function ProjectManagementView({ project, people, perms, currentUser, accent, onUpdate, log }) {
  const records = project.records || [];
  const [pmTab, setPmTab] = useState("records");
  const [openId, setOpenId] = useState(null);
  const [filter, setFilter] = useState("All");
  const [newName, setNewName] = useState("");

  const setRecords = (recs) => onUpdate({ records: recs });
  const createRecord = () => {
    const nm = newName.trim(); if (!nm) return;
    const rec = {
      id: "r" + Date.now(), name: nm,
      createdAt: Date.now(), updatedAt: Date.now(), dueDate: null, completedAt: null,
      assignees: [currentUser], checklists: [], comments: [],
      activity: [{ id: "pa" + Date.now(), ts: Date.now(), author: currentUser, text: "created this record" }],
    };
    setRecords([rec, ...records]);
    log?.("Created record", `${nm} (${project.name})`);
    setNewName(""); setOpenId(rec.id);
  };

  const FILTERS = ["All", "Open", "Overdue", "Completed"];
  const stateOf = { done: "Completed", overdue: "Overdue", open: "Open" };
  const rows = records.filter((r) => filter === "All" || stateOf[recordState(r)] === filter);
  const openRecord = records.find((r) => r.id === openId);

  const STATE_CHIP = {
    done: { bg: "#DCFCE7", fg: "#166534", label: "Completed" },
    overdue: { bg: "#FEE2E2", fg: "#991B1B", label: "Overdue" },
    open: { bg: "#F1F5F9", fg: "#475569", label: "In progress" },
  };

  return (
    <div className="ll-fade space-y-4">
      {/* PM top bar */}
      <div className="flex gap-1.5">
        {[["records", "Records", ListTodo], ["wiki", "Wiki", FileTextIcon]].map(([key, label, Icon]) => (
          <button key={key} onClick={() => setPmTab(key)}
            className="flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold"
            style={pmTab === key ? { background: accent + "10", borderColor: accent, color: accent } : { background: "var(--chip-bg, #fff)", borderColor: "#E5E7EB", color: "var(--chip-fg, #4B5563)" }}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>
      {pmTab === "wiki" && <WikiView project={project} onUpdate={onUpdate} canEdit={perms.manage} accent={accent} log={log} />}
      {pmTab === "records" && (<>
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const n = f === "All" ? records.length : records.filter((r) => stateOf[recordState(r)] === f).length;
          return (
            <button key={f} onClick={() => setFilter(f)}
              className="rounded-full border px-3 py-1.5 text-[12.5px] font-medium"
              style={filter === f ? { background: accent, borderColor: accent, color: "#fff" } : { borderColor: "#E5E7EB", color: "var(--chip-fg, #4B5563)", background: "var(--chip-bg, #fff)" }}>
              {f} <span className="ll-mono opacity-70">({n})</span>
            </button>
          );
        })}
        {perms.create && (
          <div className="ml-auto flex items-center gap-1.5">
            <input value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createRecord()}
              placeholder="Record name — anything: sprint, audit, campaign…"
              className="w-64 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[13px]" />
            <button onClick={createRecord} disabled={!newName.trim()}
              className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
              <Plus size={14} /> Create record
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => {
          const st = recordState(r);
          const chip = STATE_CHIP[st];
          const done = flatTasks(r).filter((t) => t.completedAt).length;
          const total = flatTasks(r).length;
          const overdueN = flatTasks(r).filter((t) => taskState(t) === "overdue").length;
          return (
            <Card key={r.id} className="cursor-pointer p-4 transition-shadow hover:shadow-md" >
              <div onClick={() => setOpenId(r.id)}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="ll-display min-w-0 truncate text-[14.5px] font-semibold text-gray-800">{r.name}</div>
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ background: chip.bg, color: chip.fg }}>{chip.label}</span>
                </div>
                <div className="mb-2.5 flex items-center gap-2 text-[11px] text-gray-400">
                  <span className="flex -space-x-1.5">{r.assignees.slice(0, 4).map((a) => <Ava key={a} name={a} size={20} />)}</span>
                  {r.dueDate && <span className="ll-mono flex items-center gap-1" style={{ color: st === "overdue" ? NEG : undefined }}><Calendar size={11} /> {fmtDay(r.dueDate)}</span>}
                  {overdueN > 0 && !r.completedAt && <span className="ll-mono font-semibold" style={{ color: NEG }}>{overdueN} overdue</span>}
                  <span className="ml-auto">{relTime(r.updatedAt)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full" style={{ width: total ? `${(done / total) * 100}%` : "0%", background: st === "done" ? POS : accent }} />
                  </div>
                  <span className="ll-mono text-[10.5px] text-gray-400">{done}/{total}</span>
                  {r.comments.length > 0 && <span className="ll-mono flex items-center gap-0.5 text-[10.5px] text-gray-400"><MessageSquare size={11} />{r.comments.length}</span>}
                </div>
              </div>
            </Card>
          );
        })}
        {rows.length === 0 && (
          <Card className="col-span-full p-10 text-center text-[13px] text-gray-400">
            {records.length === 0 ? "No records yet — create your first record to start managing this project's work." : `No ${filter.toLowerCase()} records.`}
          </Card>
        )}
      </div>

      </>)}
      {openRecord && (
        <RecordWindow record={openRecord} people={people} perms={perms} currentUser={currentUser} accent={accent}
          onPatch={(patch) => setRecords(records.map((r) => (r.id === openRecord.id ? { ...r, ...patch } : r)))}
          onDelete={() => { setRecords(records.filter((r) => r.id !== openRecord.id)); log?.("Deleted record", openRecord.name); }}
          onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}


/* ================================================================
   PROJECT OPTIMIZATION — connect & publish to GBP, Website, Social
   (modeled on Search Atlas / OTTO techniques)
   ----------------------------------------------------------------
   PRODUCTION INTEGRATION MAP:
   • GBP — Google OAuth (scope: business.manage) → Business
     Information API `locations.patch` with updateMask for phone /
     website / hours / description / serviceItems; `localPosts.create`
     for updates, offers (with coupon/redeem), events; `media.create`
     for photos. Business NAME + CATEGORIES intentionally locked in
     this UI (frequent edits trigger re-verification / suspensions).
   • Website — WordPress: native plugin or Application Passwords →
     REST API (`/wp/v2/pages`, `/wp/v2/posts`, `/wp/v2/media`) with
     two-way sync. Webflow: OAuth → Data API v2 (pages + CMS items,
     then publish site). Custom-coded: the OTTO-pixel technique — a
     small JS snippet in <head> fetches your saved edits from your
     API and applies meta/heads/alt client-side at render time; a
     Cloudflare Worker variant applies them at the edge (server-side)
     so crawlers always see the optimized HTML.
   • Social — Meta Graph API (FB Page + IG Business publish),
     LinkedIn Community Mgmt API, X API v2, YouTube Data API,
     TikTok Content Posting API, Pinterest API. All via OAuth; store
     refresh tokens server-side, never in the browser.
   • Scheduling — one cron worker scans `publishAt <= now` across
     gbp.posts / website.blogs / social.posts and dispatches.
   ================================================================ */
const SOCIAL_ICONS = { fb: Facebook, ig: Instagram, li: Linkedin, x: Twitter, yt: Youtube, tt: Music2, pin: Pin, th: MessageSquare, bs: Send };
const SOCIAL_COLORS = { fb: "#1877F2", ig: "#E4405F", li: "#0A66C2", x: "#111827", yt: "#FF0000", tt: "#111827", pin: "#E60023", th: "#111827", bs: "#0285FF" };
const MetaChip = ({ label, value, max }) => {
  if (!value) return null;
  const n = value.length; const over = n > max;
  return <span className="ll-mono rounded bg-gray-50 px-1 py-px text-[9px]" style={{ color: over ? "#DC2626" : "#16A34A" }}>{label} {n}/{max}</span>;
};
const CharCount = ({ value, max }) => {
  const n = (value || "").length;
  return <span className="ll-mono text-[10px]" style={{ color: n > max ? NEG : n > max * 0.9 ? "#D97706" : "#9CA3AF" }}>{n}/{max}</span>;
};
function ConnBadge({ on }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
      style={on ? { background: "#DCFCE7", color: "#166534" } : { background: "#F1F5F9", color: "#64748B" }}>
      {on ? "● Connected" : "○ Not connected"}
    </span>
  );
}
function OAuthButton({ label, onDone, accent, connected, onDisconnect }) {
  const [busy, setBusy] = useState(false);
  if (connected) return (
    <button onClick={onDisconnect} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11.5px] font-medium text-gray-400 hover:border-red-200 hover:text-red-500">Disconnect</button>
  );
  return (
    <button disabled={busy}
      onClick={() => { setBusy(true); setTimeout(() => { setBusy(false); onDone(); }, 900); /* PROD: window.open(oauthUrl) → callback stores tokens server-side */ }}
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-60" style={{ background: accent }}>
      {busy ? <><RefreshCw size={12} className="animate-spin" /> Authorizing…</> : <>{label}</>}
    </button>
  );
}

function OptimizationView({ project, accent, onUpdate, log }) {
  const opt = project.opt || mkOpt();
  const [tab, setTab] = useState("gbp");
  // patch: object OR function of the current sub-state. Merges against the LIVE
  // project state (functional onUpdate), so a setTimeout callback (fake crawl,
  // OAuth, credential test) can never write a stale snapshot over fresh edits.
  const setOpt = (key, patch) => onUpdate((proj) => {
    const cur = proj.opt || mkOpt();
    const next = typeof patch === "function" ? patch(cur[key]) : patch;
    return { opt: { ...cur, [key]: { ...cur[key], ...next } } };
  });

  const connectedSocial = opt.social.accounts.filter((a) => a.connected).length;
  const PROPS = [
    { key: "gbp", label: "Google Business Profile", icon: Building2, on: opt.gbp.connected, sub: opt.gbp.connected ? opt.gbp.bizName : "OAuth with Google" },
    { key: "website", label: "Website", icon: Globe, on: opt.website.connected, sub: opt.website.connected ? `${WEB_PLATFORMS[opt.website.platform]?.label || "Website"} · ${project.website}` : "WordPress, Webflow, Wix, Shopify…" },
    { key: "social", label: "Social Media", icon: Share2, on: connectedSocial > 0, sub: connectedSocial > 0 ? `${connectedSocial} of ${opt.social.accounts.length} connected` : "OAuth per platform" },
  ];

  return (
    <div className="ll-fade flex flex-col gap-4 lg:flex-row lg:items-start">
      {/* vertical secondary nav — which properties are connected */}
      <div className="flex shrink-0 flex-row gap-2 overflow-x-auto lg:w-60 lg:flex-col lg:overflow-visible">
        {PROPS.map((p) => (
          <button key={p.key} onClick={() => setTab(p.key)}
            className="flex min-w-[190px] items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left lg:min-w-0"
            style={tab === p.key
              ? { background: accent + "10", borderColor: accent }
              : { background: "var(--chip-bg, #fff)", borderColor: "#E5E7EB" }}>
            <p.icon size={16} className="shrink-0" style={{ color: p.on ? accent : "#9CA3AF" }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold" style={{ color: tab === p.key ? accent : "var(--chip-fg, #374151)" }}>{p.label}</span>
              <span className="block truncate text-[10.5px] text-gray-400">{p.sub}</span>
            </span>
            <ConnBadge on={p.on} />
          </button>
        ))}
      </div>

      <div className="min-w-0 flex-1">
        {tab === "gbp" && <GbpOptTab opt={opt} setOpt={setOpt} accent={accent} log={log} project={project} />}
        {tab === "website" && <WebsiteOptTab opt={opt} setOpt={setOpt} accent={accent} log={log} project={project} />}
        {tab === "social" && <SocialOptTab opt={opt} setOpt={setOpt} accent={accent} log={log} />}
      </div>
    </div>
  );
}

/* ---------------- GBP tab ---------------- */
function GbpOptTab({ opt, setOpt, accent, log, project }) {
  const [gbpTab, setGbpTab] = useState("info");
  const g = opt.gbp;
  const set = (patch) => setOpt("gbp", patch);
  const [composer, setComposer] = useState({ type: "update", title: "", body: "", cta: "Learn more", ctaUrl: "", startDate: "", endDate: "", coupon: "", image: null, when: "now", publishAt: "" });
  const [svcDraft, setSvcDraft] = useState({}); // per-category new-service name: { [catId]: string }
  const [catDraft, setCatDraft] = useState("");
  const [editSvc, setEditSvc] = useState(null);   // { catId, svcId } while the edit dialog is open
  const [editDraft, setEditDraft] = useState(null); // local copy — Cancel discards, Save commits
  const openSvc = (catId, sv) => { setEditSvc({ catId, svcId: sv.id }); setEditDraft({ name: sv.name, priceType: sv.priceType || (sv.price ? "fixed" : "none"), price: sv.price || "", desc: sv.desc || "" }); };
  const saveSvc = () => {
    set({ svcCats: g.svcCats.map((c) => c.id !== editSvc.catId ? c : { ...c, services: c.services.map((x) => x.id === editSvc.svcId ? { ...x, ...editDraft, price: ["fixed", "from"].includes(editDraft.priceType) ? editDraft.price : "" } : x) }) });
    setEditSvc(null);
  };
  const deleteSvc = () => {
    set({ svcCats: g.svcCats.map((c) => c.id !== editSvc.catId ? c : { ...c, services: c.services.filter((x) => x.id !== editSvc.svcId) }) });
    setEditSvc(null);
  };
  const addService = (catId) => {
    const nm = (svcDraft[catId] || "").trim(); if (!nm) return;
    set({ svcCats: g.svcCats.map((c) => c.id !== catId ? c : { ...c, services: [...c.services, { id: "sv" + Date.now(), name: nm, priceType: "none", price: "", desc: "" }] }) });
    setSvcDraft({ ...svcDraft, [catId]: "" });
  };
  const addCategory = () => {
    const nm = catDraft.trim(); if (!nm) return;
    set({ svcCats: [...(g.svcCats || []), { id: "sc" + Date.now(), name: nm, services: [] }] });
    setCatDraft("");
  };
  const [prodFilter, setProdFilter] = useState("All products");
  const [editProd, setEditProd] = useState(null);       // product id, or "new"
  const [prodEdit, setProdEdit] = useState(null);       // local draft — Cancel discards
  const blankProd = { name: "", category: "", price: "", desc: "", landingUrl: "", image: null };
  const openProd = (pd) => { setEditProd(pd ? pd.id : "new"); setProdEdit(pd ? { ...blankProd, ...pd } : { ...blankProd }); };
  const saveProd = () => {
    if (editProd === "new") set({ products: [...g.products, { id: "pd" + Date.now(), ...prodEdit }] });
    else set({ products: g.products.map((x) => (x.id === editProd ? { ...x, ...prodEdit } : x)) });
    setEditProd(null);
  };
  const deleteProd = () => { set({ products: g.products.filter((x) => x.id !== editProd) }); setEditProd(null); };
  const prodCats = [...new Set(g.products.map((p) => p.category).filter(Boolean))];
  const shownProds = g.products.filter((p) => prodFilter === "All products" || p.category === prodFilter);

  if (!g.connected) return (
    <Card className="p-8 text-center">
      <Building2 size={28} className="mx-auto text-gray-300" />
      <div className="ll-display mt-2 text-[16px] font-semibold">Connect Google Business Profile</div>
      <p className="mx-auto mt-1 max-w-md text-[12.5px] text-gray-400">One Google OAuth grants management of this location: publish updates, offers and events, edit hours, services, products and photos — everything except the business name and categories.</p>
      <div className="mt-4 flex justify-center">
        <OAuthButton label="Connect with Google" accent={accent}
          onDone={() => { set({ connected: true, bizName: project.name, website: "https://" + project.website }); log?.("Connected Google Business Profile", project.name); }} />
      </div>
    </Card>
  );

  const publish = () => {
    if (!composer.body.trim()) return;
    const post = { id: "gp" + Date.now(), ...composer, status: composer.when === "now" ? "published" : "scheduled",
      publishAt: composer.when === "now" ? null : new Date(composer.publishAt).getTime(), createdAt: Date.now() };
    delete post.when;
    set({ posts: [post, ...g.posts] });
    log?.(composer.when === "now" ? "Published GBP post" : "Scheduled GBP post", project.name);
    setComposer({ type: "update", title: "", body: "", cta: "Learn more", ctaUrl: "", startDate: "", endDate: "", coupon: "", image: null, when: "now", publishAt: "" });
  };
  const TYPE_CHIP = { update: { bg: "#DBEAFE", fg: "#1E40AF" }, offer: { bg: "#FEF3C7", fg: "#92400E" }, event: { bg: "#F3E8FF", fg: "#6B21A8" } };

  return (
    <div className="space-y-4">
      {/* GBP section top bar */}
      <div className="flex flex-wrap gap-1.5">
        {[["info", "Business information"], ["services", "Services"], ["products", "Products"], ["posts", "Posts/Updates"], ["photos", "Photos"]].map(([key, label]) => (
          <button key={key} onClick={() => setGbpTab(key)}
            className="rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold"
            style={gbpTab === key ? { background: accent + "10", borderColor: accent, color: accent } : { background: "var(--chip-bg, #fff)", borderColor: "#E5E7EB", color: "var(--chip-fg, #4B5563)" }}>
            {label}
          </button>
        ))}
      </div>

      {gbpTab === "info" && (<>
      {/* profile fields */}
      <Card className="space-y-3 p-5">
        <div className="ll-display text-[15px] font-semibold">Business information</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Business name">
            <div className="flex items-center gap-1.5 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-[13px] text-gray-400">
              <Lock size={12} /> {g.bizName}
            </div>
          </Labeled>
          <Labeled label="Categories">
            <div className="flex items-center gap-1.5 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-[13px] text-gray-400">
              <Lock size={12} /> {g.categories.join(", ") || "—"}
            </div>
          </Labeled>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Phone">
            <div className="flex items-center gap-1.5 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-[13px] text-gray-400">
              <Lock size={12} /> {g.phone || "—"}
            </div>
          </Labeled>
          <Labeled label="Website"><input value={g.website} onChange={(e) => set({ website: e.target.value })} className={inputCls} /></Labeled>
        </div>
        <Labeled label="Address">
          <div className="flex items-center gap-1.5 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-[13px] text-gray-400">
            <Lock size={12} /> {g.address || "—"}
          </div>
        </Labeled>
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">Name, categories, phone & address are locked — changing these core identity fields triggers Google re-verification and can suspend the listing. Update them directly in Google if ever needed.</div>
        <Labeled label={<span className="flex items-center justify-between">Description <CharCount value={g.description} max={750} /></span>}>
          <textarea value={g.description} onChange={(e) => set({ description: e.target.value })} rows={3} className={inputCls + " resize-none"} />
        </Labeled>
        <Labeled label="Business hours">
          <div className="grid gap-1 sm:grid-cols-2">
            {Object.keys(g.hours).map((d) => (
              <div key={d} className="flex items-center gap-2">
                <span className="ll-mono w-9 text-[11px] text-gray-400">{d}</span>
                <input value={g.hours[d]} onChange={(e) => set({ hours: { ...g.hours, [d]: e.target.value } })}
                  className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-[12px]" />
              </div>
            ))}
          </div>
        </Labeled>
        <button onClick={() => log?.("Saved GBP business info", project.name)}
          className="rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white" style={{ background: accent }}>
          Save to Google
        </button>
      </Card>

      </>)}

      {gbpTab === "posts" && (<>
      {/* publisher */}
      <Card className="space-y-3 p-5">
        <div className="ll-display text-[15px] font-semibold">Posts/Updates</div>
        <Seg options={["update", "offer", "event"]} value={composer.type} onChange={(v) => setComposer({ ...composer, type: v })} accent={accent} />
        {composer.type !== "update" && (
          <Labeled label={composer.type === "offer" ? "Offer title" : "Event title"}>
            <input value={composer.title} onChange={(e) => setComposer({ ...composer, title: e.target.value })} className={inputCls} />
          </Labeled>
        )}
        <Labeled label={<span className="flex items-center justify-between">Post text <CharCount value={composer.body} max={1500} /></span>}>
          <textarea value={composer.body} onChange={(e) => setComposer({ ...composer, body: e.target.value })} rows={3} className={inputCls + " resize-none"} placeholder="What's new?" />
        </Labeled>
        {composer.type !== "update" && (
          <div className="grid grid-cols-2 gap-2">
            <Labeled label="Start date"><input type="date" value={composer.startDate} onChange={(e) => setComposer({ ...composer, startDate: e.target.value })} className={inputCls} /></Labeled>
            <Labeled label="End date"><input type="date" value={composer.endDate} onChange={(e) => setComposer({ ...composer, endDate: e.target.value })} className={inputCls} /></Labeled>
          </div>
        )}
        {composer.type === "offer" && (
          <Labeled label="Coupon code (optional)"><input value={composer.coupon} onChange={(e) => setComposer({ ...composer, coupon: e.target.value })} className={"ll-mono " + inputCls} /></Labeled>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Labeled label="Call to action">
            <select value={composer.cta} onChange={(e) => setComposer({ ...composer, cta: e.target.value })} className={inputCls + " bg-white"}>
              {["Learn more", "Book", "Call now", "Order online", "Buy", "Sign up"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Labeled>
          {composer.cta === "Call now" ? (
            <Labeled label="CTA link">
              <div className="flex items-center gap-1.5 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-[12px] text-gray-400">
                <Phone size={12} /> Uses your listing's phone number
              </div>
            </Labeled>
          ) : (
            <Labeled label="CTA link"><input value={composer.ctaUrl} onChange={(e) => setComposer({ ...composer, ctaUrl: e.target.value })} placeholder="https://…" className={inputCls} /></Labeled>
          )}
        </div>
        <Labeled label="Image"><LogoUpload value={composer.image} onChange={(image) => setComposer({ ...composer, image })} label="Add image" /></Labeled>
        <div className="flex items-center gap-2">
          <Seg options={["now", "schedule"]} value={composer.when} onChange={(v) => setComposer({ ...composer, when: v })} accent={accent} />
          {composer.when === "schedule" && (
            <input type="datetime-local" value={composer.publishAt} onChange={(e) => setComposer({ ...composer, publishAt: e.target.value })}
              className="rounded-lg border border-gray-200 px-2 py-1.5 text-[12px]" />
          )}
          <button onClick={publish} disabled={!composer.body.trim() || (composer.when === "schedule" && !composer.publishAt)}
            className="ml-auto flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
            <Send size={13} /> {composer.when === "now" ? "Publish" : "Schedule"}
          </button>
        </div>
        {/* published & scheduled posts */}
        <div className="space-y-1.5 border-t border-gray-100 pt-3">
          {g.posts.map((p) => (
            <div key={p.id} className="group flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2">
              <span className="mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ background: TYPE_CHIP[p.type].bg, color: TYPE_CHIP[p.type].fg }}>{p.type}</span>
              <div className="min-w-0 flex-1">
                {p.title && <div className="text-[12px] font-semibold text-gray-800">{p.title}</div>}
                <div className="truncate text-[12px] text-gray-500">{p.body}</div>
                <div className="ll-mono mt-0.5 text-[10px] text-gray-400">
                  {p.status === "scheduled" ? `Scheduled · ${new Date(p.publishAt).toLocaleString("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : `Published · ${fmtTs2(p.createdAt)}`}
                  {p.coupon && ` · code ${p.coupon}`}
                </div>
              </div>
              <button onClick={() => set({ posts: g.posts.filter((x) => x.id !== p.id) })}
                className="text-gray-300 opacity-0 hover:text-red-500 group-hover:opacity-100"><Trash2 size={13} /></button>
            </div>
          ))}
          {g.posts.length === 0 && <div className="py-2 text-center text-[11.5px] text-gray-300">No posts yet.</div>}
        </div>
      </Card>

      </>)}

      {gbpTab === "services" && (<>
      {/* services — grouped under business categories, like Google's Services editor */}
      <Card className="space-y-3 p-5">
        <div className="ll-display text-[15px] font-semibold">Services</div>
        {(g.svcCats || []).map((cat, ci) => (
          <div key={cat.id} className="rounded-xl border border-gray-100 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-gray-800">{cat.name}</div>
                {ci === 0 && <div className="text-[9px] font-medium uppercase tracking-wide text-gray-400">Primary category</div>}
              </div>
              {ci > 0 && (
                <button onClick={() => set({ svcCats: g.svcCats.filter((c) => c.id !== cat.id) })}
                  className="shrink-0 text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
              )}
            </div>
            <div className="space-y-0.5">
              {cat.services.map((sv) => (
                <button key={sv.id} onClick={() => openSvc(cat.id, sv)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-gray-50">
                  <span className="min-w-0 truncate text-[13px] font-medium text-gray-800">{sv.name}</span>
                  <ChevronRight size={14} className="shrink-0 text-gray-300" />
                </button>
              ))}
            </div>
            <div className="mt-1 flex items-center gap-1.5 border-t border-gray-50 pt-2">
              <input value={svcDraft[cat.id] || ""}
                onChange={(e) => setSvcDraft({ ...svcDraft, [cat.id]: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && addService(cat.id)}
                maxLength={120}
                placeholder="+ Add more services" className="flex-1 rounded-lg border border-dashed border-gray-200 px-2.5 py-1.5 text-[12px] outline-none focus:border-gray-300" />
              <button disabled={!(svcDraft[cat.id] || "").trim()} onClick={() => addService(cat.id)}
                className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}><Plus size={13} /></button>
            </div>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <input value={catDraft} onChange={(e) => setCatDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCategory()}
            placeholder="Add another business category…" className={inputCls.replace("w-full", "flex-1")} />
          <button disabled={!catDraft.trim()} onClick={addCategory}
            className="rounded-lg px-3.5 py-2 text-[12px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>Add category</button>
        </div>
        <div className="rounded-lg bg-gray-50 p-2.5 text-[10.5px] leading-relaxed text-gray-400">
          Services live under your business categories, exactly like Google's Services editor. In production these map to the Business Information API's category serviceTypes + custom services per category.
        </div>
      </Card>

      </>)}

      {gbpTab === "products" && (<>
      {/* products — Google-style gallery: image, name, price; click to edit */}
      <Card className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="ll-display text-[15px] font-semibold">Products</div>
          <button onClick={() => openProd(null)}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white" style={{ background: accent }}>
            <Plus size={13} /> Add product
          </button>
        </div>
        {prodCats.length > 0 && (
          <select value={prodFilter} onChange={(e) => setProdFilter(e.target.value)} className={inputCls + " bg-white sm:w-56"}>
            <option>All products</option>
            {prodCats.map((c) => <option key={c}>{c}</option>)}
          </select>
        )}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {shownProds.map((pd) => (
            <button key={pd.id} onClick={() => openProd(pd)}
              className="overflow-hidden rounded-xl border border-gray-100 text-left transition-shadow hover:shadow-md">
              <div className="flex h-24 items-center justify-center bg-gray-50">
                {pd.image
                  ? <img src={pd.image} alt={pd.name} className="h-full w-full object-cover" />
                  : <ImagePlus size={20} className="text-gray-300" />}
              </div>
              <div className="p-2.5">
                <div className="line-clamp-2 text-[12px] font-medium leading-snug text-gray-800">{pd.name}</div>
                {pd.price && <div className="ll-mono mt-1 text-[12px] text-gray-500">${(+pd.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>}
              </div>
            </button>
          ))}
          {shownProds.length === 0 && (
            <div className="col-span-full py-6 text-center text-[12px] text-gray-300">No products{prodFilter !== "All products" ? " in this category" : " yet"}.</div>
          )}
        </div>
      </Card>

      </>)}

      {gbpTab === "photos" && (<>
      {/* photos — separate GBP media widget */}
      <Card className="space-y-2.5 p-5">
        <div className="ll-display text-[15px] font-semibold">Photos</div>
        <div className="text-[11.5px] text-gray-400">Uploads go to your profile's photo gallery (media.create in the GBP API). Fresh photos boost profile engagement.</div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {g.photos.map((ph) => (
            <div key={ph.id} className="group flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-2 text-[11.5px]">
              <ImagePlus size={13} className="shrink-0 text-gray-400" />
              <span className="min-w-0 flex-1 truncate text-gray-600">{ph.name}</span>
              <span className="ll-mono text-[10px] text-gray-400">{fmtTs2(ph.addedAt)}</span>
              <button onClick={() => set({ photos: g.photos.filter((x) => x.id !== ph.id) })}
                className="text-gray-300 opacity-0 hover:text-red-500 group-hover:opacity-100"><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
        <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 py-2.5 text-[12px] font-medium text-gray-400 hover:border-gray-400 hover:text-gray-600">
          <Upload size={13} /> Upload photos to GBP
          <input type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => {
              const files = [...(e.target.files || [])];
              if (files.length) set({ photos: [...g.photos, ...files.map((f, i) => ({ id: "ph" + Date.now() + i, name: f.name, addedAt: Date.now() }))] });
            }} />
        </label>
      </Card>

      </>)}

      {/* Add / edit product — Google-style dialog */}
      {editProd && prodEdit && (
        <Modal title={editProd === "new" ? "Add product" : "Edit product"} onClose={() => setEditProd(null)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-3">
              <Labeled label={<span className="flex items-center justify-between">Product name * <CharCount value={prodEdit.name} max={58} /></span>}>
                <input value={prodEdit.name} maxLength={58} onChange={(e) => setProdEdit({ ...prodEdit, name: e.target.value.slice(0, 58) })} className={inputCls} />
              </Labeled>
              <Labeled label="Select a category *">
                <input list="prod-cats" value={prodEdit.category} onChange={(e) => setProdEdit({ ...prodEdit, category: e.target.value })} placeholder="e.g. Whitening" className={inputCls} />
                <datalist id="prod-cats">{prodCats.map((c) => <option key={c} value={c} />)}</datalist>
              </Labeled>
              <Labeled label="Product price (USD) — optional">
                <input value={prodEdit.price} inputMode="decimal" onChange={(e) => setProdEdit({ ...prodEdit, price: e.target.value.replace(/[^0-9.]/g, "") })} className={"ll-mono " + inputCls} />
              </Labeled>
            </div>
            <Labeled label="Product photo">
              <label className="flex h-full min-h-[132px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 text-[12px] text-gray-400 hover:border-gray-400">
                {prodEdit.image
                  ? <img src={prodEdit.image} alt="" className="h-full max-h-40 w-full rounded-xl object-cover" />
                  : <><ImagePlus size={18} /> Drag a photo here or click to select</>}
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => setProdEdit((p) => ({ ...p, image: r.result })); r.readAsDataURL(f); }} />
              </label>
            </Labeled>
          </div>
          <div className="mt-3 space-y-3">
            <Labeled label={<span className="flex items-center justify-between">Product description — optional <CharCount value={prodEdit.desc} max={1000} /></span>}>
              <textarea value={prodEdit.desc} maxLength={1000} rows={3} onChange={(e) => setProdEdit({ ...prodEdit, desc: e.target.value.slice(0, 1000) })} className={inputCls + " resize-none"} />
            </Labeled>
            <Labeled label="Product landing page url (optional)">
              <input value={prodEdit.landingUrl} onChange={(e) => setProdEdit({ ...prodEdit, landingUrl: e.target.value })} placeholder="https://…" className={"ll-mono " + inputCls} />
            </Labeled>
            <div className="flex items-center justify-between border-t border-gray-100 pt-3">
              {editProd !== "new"
                ? <button onClick={deleteProd} className="flex items-center gap-1.5 text-[12.5px] font-medium text-red-500 hover:text-red-600"><Trash2 size={13} /> Delete product</button>
                : <span />}
              <div className="flex gap-2">
                <button onClick={() => setEditProd(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-[12.5px] font-medium text-gray-600 hover:border-gray-300">Cancel</button>
                <button onClick={saveProd} disabled={!prodEdit.name.trim() || !prodEdit.category.trim()}
                  className="rounded-lg px-5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>Publish</button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit service details — Google-style dialog */}
      {editSvc && editDraft && (
        <Modal title="Edit service details" onClose={() => setEditSvc(null)}>
          <div className="space-y-3">
            <Labeled label={<span className="flex items-center justify-between">Service <CharCount value={editDraft.name} max={120} /></span>}>
              <input value={editDraft.name} maxLength={120} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value.slice(0, 120) })} className={inputCls} />
            </Labeled>
            <div className="grid grid-cols-2 gap-2">
              <Labeled label="Price">
                <select value={editDraft.priceType}
                  onChange={(e) => setEditDraft({ ...editDraft, priceType: e.target.value })}
                  className={inputCls + " bg-white"}>
                  <option value="none">No price</option>
                  <option value="free">Free</option>
                  <option value="fixed">Fixed</option>
                  <option value="from">From</option>
                </select>
              </Labeled>
              <Labeled label="Service price (USD)">
                <input value={editDraft.price} inputMode="decimal" disabled={!["fixed", "from"].includes(editDraft.priceType)}
                  onChange={(e) => setEditDraft({ ...editDraft, price: e.target.value.replace(/[^0-9.]/g, "") })}
                  placeholder={["fixed", "from"].includes(editDraft.priceType) ? "0.00" : "—"}
                  className={"ll-mono " + inputCls + " disabled:bg-gray-50 disabled:text-gray-300"} />
              </Labeled>
            </div>
            <Labeled label={<span className="flex items-center justify-between">Service description <CharCount value={editDraft.desc} max={300} /></span>}>
              <textarea value={editDraft.desc} maxLength={300} rows={4}
                onChange={(e) => setEditDraft({ ...editDraft, desc: e.target.value.slice(0, 300) })}
                className={inputCls + " resize-none"} />
            </Labeled>
            <div className="flex items-center justify-between border-t border-gray-100 pt-3">
              <button onClick={deleteSvc} className="flex items-center gap-1.5 text-[12.5px] font-medium text-red-500 hover:text-red-600">
                <Trash2 size={13} /> Delete service
              </button>
              <div className="flex gap-2">
                <button onClick={() => setEditSvc(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-[12.5px] font-medium text-gray-600 hover:border-gray-300">Cancel</button>
                <button onClick={saveSvc} disabled={!editDraft.name.trim()}
                  className="rounded-lg px-5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>Save</button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------- Website tab — n8n-style connector model ----------------
   Every platform is a "connector": it declares its auth (credential type),
   the operations it supports (capability matrix), and a test/verify step —
   the same node + credential + operation pattern n8n uses.

   REAL BACKEND CONTRACT (Express / worker):
   POST /v1/hello   { key, url }          ← pixel phones home on first load → marks site verified
   GET  /v1/status?key                    → { verified } (dashboard polls after install)
   POST /v1/deploy  { key, payload }      ← dashboard pushes buildPixelPayload() output (auth: session)
   GET  /v1/payload?key&path              → per-path optimization JSON (CORS *, ETag cached; the pixel calls this)
   Credentials are stored encrypted server-side (n8n-style), never in the browser:
   - WordPress: Application Password → /wp-json/wp/v2/* (posts, media) + our plugin route /wp-json/serpsquad/v1/apply (HMAC-signed with site key) writes meta server-side (Yoast/RankMath fields)
   - Webflow:  OAuth 2.0 → PATCH /v2/pages/{id} (seo.title, seo.description, slug), POST /v2/collections/{blogId}/items, POST /v2/sites/{id}/publish
   - Shopify:  Admin API access token → PUT products/{id}.json (handle→301, image alt, metafields_global_title_tag/description_tag), POST /blogs/{id}/articles.json
   - Wix / Custom: pixel only (no third-party write API) — see capability notes below.
--------------------------------------------------------------------------- */

/* The actual runtime the CDN serves at https://cdn.serpsquad.io/px.js — fully functional:
   applies title/meta/canonical/alt/heading/schema changes from /v1/payload and pings /v1/hello. */
export const PIXEL_RUNTIME = `(function () {
  var KEY = document.currentScript && document.currentScript.getAttribute("data-key");
  var API = "https://api.serpsquad.io/v1";
  if (!KEY) return;
  try {
    if (!sessionStorage.getItem("ss_hello")) {
      navigator.sendBeacon(API + "/hello", JSON.stringify({ key: KEY, url: location.href }));
      sessionStorage.setItem("ss_hello", "1");
    }
  } catch (e) {}
  fetch(API + "/payload?key=" + KEY + "&path=" + encodeURIComponent(location.pathname))
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (p) {
      if (!p) return;
      if (p.title) document.title = p.title;
      if (p.metaDesc) upsert("meta[name=\\"description\\"]", "meta", { name: "description", content: p.metaDesc });
      if (p.canonical) upsert("link[rel=\\"canonical\\"]", "link", { rel: "canonical", href: p.canonical });
      function safely(list, fn) { (list || []).forEach(function (x) { try { fn(x); } catch (e) {} }); }
      function imgsMatching(src) {
        var out = [], all = document.querySelectorAll("img");
        for (var i = 0; i < all.length; i++) if (src && (all[i].getAttribute("src") || "").indexOf(src) !== -1) out.push(all[i]);
        return out;
      }
      safely(p.headings, function (h) {
        var el = document.querySelector(h.selector);
        if (!el && h.level != null && h.index != null) el = document.querySelectorAll("h" + h.level)[h.index];
        if (el && h.text) el.textContent = h.text;
      });
      safely(p.images, function (im) {
        imgsMatching(im.srcContains).forEach(function (el) {
          if (im.alt != null) el.setAttribute("alt", im.alt);
          if (im.title != null) el.setAttribute("title", im.title);
        });
      });
      safely(p.texts, function (t) {
        var el = document.querySelector(t.selector);
        if (!el) return;
        if (t.html != null) el.innerHTML = t.html; else if (t.text != null) el.textContent = t.text;
      });
      safely(p.imgSrc, function (m) { imgsMatching(m.srcContains).forEach(function (el) { el.src = m.src; }); });
      safely(p.links, function (l) {
        var el = document.querySelector(l.selector);
        if (!el || !l.phrase) return;
        var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), n;
        while ((n = walker.nextNode())) {
          if (n.parentNode && n.parentNode.tagName === "A") continue;
          var i = n.nodeValue.indexOf(l.phrase);
          if (i === -1) continue;
          var mid = n.splitText(i); mid.splitText(l.phrase.length);
          var a = document.createElement("a"); a.href = l.href; a.textContent = l.phrase;
          mid.parentNode.replaceChild(a, mid);
          break;
        }
      });
      safely(p.schema, function (s) { var el = document.createElement("script"); el.type = "application/ld+json"; el.textContent = JSON.stringify(s); document.head.appendChild(el); });
    }).catch(function () {});
  function upsert(sel, tag, attrs) {
    var el = document.querySelector(sel);
    if (!el) { el = document.createElement(tag); document.head.appendChild(el); }
    for (var k in attrs) el.setAttribute(k, attrs[k]);
  }
})();`;

/* Builds the exact JSON the dashboard POSTs to /v1/deploy — keyed by path, consumed by the pixel. */
export function buildPixelPayload(pages) {
  // Selectors use [data-ss] ids assigned by the pixel's editor-mode bridge on the live page.
  // Headings also carry {level, index} as a fallback so the runtime targets the Nth
  // heading of that level instead of always the first. Images match by src substring
  // in JS (srcContains) — a filename with quotes can't break a CSS selector.
  const map = {};
  pages.forEach((p) => {
    const blocks = p.content || [];
    const perLevel = {};
    // key by the path the LIVE site still serves — a freshly edited slug won't match until deployed
    const key = p.origUrl || p.url;
    const ops = {
      title: p.metaTitle || undefined,
      metaDesc: p.metaDesc || undefined,
      headings: blocks.filter((b) => b.kind === "heading").map((b) => {
        const index = perLevel[b.level] || 0; perLevel[b.level] = index + 1;
        return { selector: `[data-ss="${b.id}"]`, level: b.level, index, text: b.text };
      }),
      texts: blocks.filter((b) => b.kind === "text").map((b) => ({ selector: `[data-ss="${b.id}"]`, text: b.text, html: mdFmt(escHtml(b.text || "")) })),
      links: blocks.filter((b) => b.kind === "text").flatMap((b) => (b.links || []).map((l) => ({ selector: `[data-ss="${b.id}"]`, phrase: l.phrase, href: l.href }))),
      images: blocks.filter((b) => b.kind === "image" && (b.alt || b.title)).map((b) => ({ srcContains: b.src, alt: b.alt, title: b.title })),
      imgSrc: blocks.filter((b) => b.kind === "image" && b.dataUrl).map((b) => ({ srcContains: b.src, src: b.dataUrl })), // PROD: upload to CDN, ship the CDN URL instead of a data-URI
    };
    if (map[key]) {
      // duplicate paths (e.g. two manually-added pages left at /new-page): merge ops instead of silently overwriting
      ["headings", "texts", "links", "images", "imgSrc"].forEach((k) => { map[key][k] = [...map[key][k], ...ops[k]]; });
      map[key].title = ops.title || map[key].title;
      map[key].metaDesc = ops.metaDesc || map[key].metaDesc;
    } else map[key] = ops;
  });
  return map;
}

const pixelSnippet = (key) => `<script async src="https://cdn.serpsquad.io/px.js" data-key="${key}"></script>`;

/* Connector registry — n8n-style: auth, operations, guide, honest capability notes */
const WEB_PLATFORMS = {
  wordpress: {
    label: "WordPress", tag: "Recommended · server-side",
    credential: { type: "Application Password", placeholder: "user:xxxx xxxx xxxx xxxx" },
    caps: { meta: true, alt: true, headings: true, slugs: true, blogs: true, schema: true },
    guide: [
      "Install the SERP Squad plugin: wp-admin → Plugins → Add New → Upload (or add the pixel below to your theme header).",
      "Paste your site key in the plugin settings — the plugin renders changes server-side, so every crawler sees them.",
      "For blog publishing & URL slugs, add an Application Password: wp-admin → Users → Profile → Application Passwords → create \"SERP Squad\".",
    ],
    notes: ["Plugin writes meta to Yoast / RankMath fields when present, native filters otherwise."],
  },
  webflow: {
    label: "Webflow", tag: "OAuth + pixel",
    credential: { type: "Webflow OAuth", placeholder: "Authorize with Webflow" },
    caps: { meta: true, alt: "pixel", headings: "pixel", slugs: true, blogs: true, schema: true },
    guide: [
      "Add the pixel: Site settings → Custom code → Head code → paste the snippet → Save → Publish site.",
      "Authorize with Webflow OAuth to unlock server-side edits: page SEO title/description and URL slugs via the Pages API, blog posts as CMS items.",
      "Blog publishing needs a CMS Collection for posts — we publish the item, then trigger a site publish.",
    ],
    notes: ["Image alt & headings are applied by the pixel (client-side) — Webflow's API doesn't expose them for static pages."],
  },
  wix: {
    label: "Wix", tag: "Pixel only",
    credential: null,
    caps: { meta: "pixel", alt: "pixel", headings: "pixel", slugs: false, blogs: false, schema: "pixel" },
    guide: [
      "Wix Dashboard → Settings → Custom code → + Add Custom Code → paste the snippet → set to \"Head\" on All pages → Apply.",
      "Note: custom code on Wix requires a Premium plan with a connected domain.",
    ],
    notes: [
      "NOT AVAILABLE — URL slug editing: Wix doesn't expose page slugs to third-party tools; change them in the Wix editor.",
      "NOT AVAILABLE — Blog publishing: Wix has no public third-party blog-publish API for external tools.",
    ],
  },
  shopify: {
    label: "Shopify", tag: "Pixel + Admin API",
    credential: { type: "Admin API access token", placeholder: "shpat_…" },
    caps: { meta: true, alt: true, headings: "pixel", slugs: true, blogs: true, schema: "pixel" },
    guide: [
      "Add the pixel: Online Store → Themes → Edit code → layout/theme.liquid → paste before </head> → Save.",
      "Create an Admin API token: Settings → Apps and sales channels → Develop apps → Create app → Admin API scopes: write_products, write_content → install → copy the token.",
      "The token unlocks server-side edits: product/page handles (with automatic 301s), image alt text, SEO title & description metafields, and blog articles.",
    ],
    notes: ["Handle (slug) changes create automatic 301 redirects via the Admin API."],
  },
  custom: {
    label: "Custom website", tag: "Pixel · any stack",
    credential: null,
    caps: { meta: "pixel", alt: "pixel", headings: "pixel", slugs: false, blogs: false, schema: "pixel" },
    guide: [
      "Paste the snippet before </head> on every page (or add it once via Google Tag Manager).",
      "That's it — the pixel fetches your approved edits per-path and applies them in the browser.",
      "Optional but recommended: add our Cloudflare Worker so edits are rendered at the edge and ALL crawlers (including non-JS bots like GPTBot) see the optimized HTML.",
    ],
    notes: [
      "NOT AVAILABLE — URL slug changes: impossible client-side; they require server/router access.",
      "NOT AVAILABLE — Blog publishing: there's no CMS to publish into; we can export HTML for your developer instead.",
    ],
  },
};
const CAP_LABELS = { meta: "Meta title & description", alt: "Image alt & title", headings: "Headings", slugs: "URL slugs", blogs: "Blog publish & schedule", schema: "Schema (JSON-LD)" };

/* ---------------- Live page editor ----------------
   Renders the page like the real design; every editable element is marked.
   PROD: this preview is the live site in an iframe with the pixel switched to
   "editor mode" — a postMessage bridge tags clicked elements with data-ss ids
   and records their CSS selectors, so edits map 1:1 to buildPixelPayload ops. */
const EDIT_LEGEND = [
  ["Meta (SERP)", "#7C3AED"], ["Headings", "#2456E6"], ["Text", "#0E7C66"],
  ["Links in text", "#B45309"], ["Images: alt · title · replace", "#E11D48"],
];
function inlineFmt(str, keyBase = "f") {
  const out = []; const re = /(\*\*[^*]+\*\*|~~[^~]+~~|\*[^*\n]+\*)/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(str))) {
    if (m.index > last) out.push(str.slice(last, m.index));
    const tok = m[0];
    out.push(tok.startsWith("**")
      ? <b key={keyBase + "b" + i}>{tok.slice(2, -2)}</b>
      : tok.startsWith("~~")
      ? <s key={keyBase + "s" + i}>{tok.slice(2, -2)}</s>
      : <i key={keyBase + "i" + i}>{tok.slice(1, -1)}</i>);
    last = m.index + tok.length; i++;
  }
  if (last < str.length) out.push(str.slice(last));
  return out;
}
function renderTextWithLinks(text, links = []) {
  if (!links.length) return inlineFmt(text || "");
  let parts = [text];
  links.forEach((l) => {
    parts = parts.flatMap((seg) => {
      if (typeof seg !== "string" || !seg.includes(l.phrase)) return [seg];
      const [before, ...rest] = seg.split(l.phrase);
      return [before, <a key={l.id} href={l.href} target="_blank" rel="noopener" className="underline decoration-2 underline-offset-2" style={{ color: "#B45309" }}>{l.phrase}</a>, rest.join(l.phrase)];
    });
  });
  return parts.flatMap((seg, i) => (typeof seg === "string" ? inlineFmt(seg, "s" + i) : [seg]));
}
function LivePageEditor({ page, onPatch, accent, slugsEnabled, siteHost, onClose }) {
  const [editId, setEditId] = useState(null);      // block being text-edited
  const [imgPanel, setImgPanel] = useState(null);  // image block with open panel
  const [linkForm, setLinkForm] = useState(null);  // { blockId, phrase, href }
  const content = page.content || [];
  const patchBlock = (id, p) => onPatch({ content: content.map((b) => (b.id === id ? { ...b, ...p } : b)) });

  const mark = (color, label) => (
    <span className="pointer-events-none absolute -top-2.5 left-2 z-10 rounded px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-white opacity-0 transition-opacity group-hover:opacity-100" style={{ background: color }}>{label}</span>
  );
  const editable = "group relative rounded-md outline-2 outline-offset-4 hover:outline-dashed cursor-pointer";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-3" onClick={onClose}>
      <div className="flex h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* browser chrome */}
        <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
          <span className="flex gap-1.5">{["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />)}</span>
          <div className="ll-mono flex min-w-0 flex-1 items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-[11.5px] text-gray-500">
            <Lock size={10} className="shrink-0 text-gray-300" /> {siteHost}
            {slugsEnabled
              ? <input value={page.url} onChange={(e) => onPatch({ url: e.target.value, origUrl: page.origUrl || page.url })} className="min-w-0 flex-1 bg-transparent outline-none" style={{ color: "#7C3AED" }} />
              : <span className="truncate">{page.url}</span>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X size={16} /></button>
        </div>
        {/* legend */}
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-2 text-[10.5px] text-gray-500">
          <span className="font-semibold text-gray-400">Editable here:</span>
          {EDIT_LEGEND.map(([lbl, c]) => <span key={lbl} className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: c }} /> {lbl}</span>)}
          <span className="ml-auto text-gray-300">Hover any element · click to edit</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* SERP-only meta block */}
          <div className="mx-auto max-w-2xl px-6 pt-5">
            <div className="group relative rounded-xl border-2 border-dashed p-3.5" style={{ borderColor: "#7C3AED33" }}>
              {mark("#7C3AED", "Meta — search results only")}
              <input value={page.name || ""} onChange={(e) => onPatch({ name: e.target.value })} placeholder="Page name (internal label)"
                className="mb-1 w-full border-0 border-b border-dashed border-gray-200 bg-transparent pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 outline-none" />
              <input value={page.metaTitle} maxLength={60} onChange={(e) => onPatch({ metaTitle: e.target.value })}
                placeholder="Meta title" className="ll-display w-full border-0 bg-transparent text-[17px] font-semibold outline-none" style={{ color: "#1a0dab" }} />
              <div className="ll-mono text-[11px] text-emerald-700">{siteHost}{page.url}</div>
              <textarea value={page.metaDesc} maxLength={160} rows={2} onChange={(e) => onPatch({ metaDesc: e.target.value })}
                placeholder="Meta description — shown under the title in Google" className="mt-0.5 w-full resize-none border-0 bg-transparent text-[12.5px] leading-snug text-gray-600 outline-none" />
              <div className="flex justify-end gap-2"><CharCount value={page.metaTitle} max={60} /><CharCount value={page.metaDesc} max={160} /></div>
            </div>
          </div>

          {/* the rendered page */}
          <div className="mx-auto max-w-2xl space-y-5 px-6 py-6">
            {content.map((b) => {
              if (b.kind === "heading") {
                const isEditing = editId === b.id;
                const Tag = b.level === 1 ? "h1" : "h2";
                return (
                  <div key={b.id} className={editable} style={{ outlineColor: "#2456E6" }} onClick={() => !isEditing && setEditId(b.id)}>
                    {mark("#2456E6", Tag.toUpperCase())}
                    {isEditing
                      ? <input autoFocus value={b.text} onChange={(e) => patchBlock(b.id, { text: e.target.value })}
                          onBlur={() => setEditId(null)} onKeyDown={(e) => e.key === "Enter" && setEditId(null)}
                          className={`w-full border-0 bg-blue-50/50 outline-none ll-display font-bold tracking-tight ${b.level === 1 ? "text-[30px]" : "text-[21px]"}`} />
                      : <Tag className={`ll-display font-bold tracking-tight text-gray-900 ${b.level === 1 ? "text-[30px] leading-tight" : "text-[21px]"}`}>{b.text}</Tag>}
                  </div>
                );
              }
              if (b.kind === "text") {
                const isEditing = editId === b.id;
                return (
                  <div key={b.id} className={editable} style={{ outlineColor: "#0E7C66" }}>
                    {mark("#0E7C66", "Text")}
                    {isEditing
                      ? <textarea autoFocus value={b.text} rows={Math.max(2, Math.ceil(b.text.length / 70))}
                          onChange={(e) => patchBlock(b.id, { text: e.target.value })} onBlur={() => setEditId(null)}
                          className="w-full resize-none border-0 bg-emerald-50/40 text-[14px] leading-relaxed text-gray-700 outline-none" />
                      : <p onClick={() => setEditId(b.id)} className="text-[14px] leading-relaxed text-gray-700">{renderTextWithLinks(b.text, b.links)}</p>}
                    {/* hover toolbar: add link */}
                    <div className="absolute -bottom-2.5 right-2 z-10 hidden gap-1 group-hover:flex">
                      <button onClick={(e) => { e.stopPropagation(); setLinkForm({ blockId: b.id, phrase: "", href: "" }); }}
                        className="rounded px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-white" style={{ background: "#B45309" }}>+ Link</button>
                    </div>
                    {linkForm?.blockId === b.id && (
                      <div className="ll-fade mt-2 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50/60 p-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1.5">
                          <input value={linkForm.phrase} onChange={(e) => setLinkForm({ ...linkForm, phrase: e.target.value })}
                            placeholder="Exact words in this text to link" className="flex-1 rounded border border-amber-200 bg-white px-2 py-1 text-[11.5px]" />
                          <input value={linkForm.href} onChange={(e) => setLinkForm({ ...linkForm, href: e.target.value })}
                            placeholder="https://…" className="ll-mono flex-1 rounded border border-amber-200 bg-white px-2 py-1 text-[11.5px]" />
                          <button disabled={!linkForm.phrase.trim() || !linkForm.href.trim() || !b.text.includes(linkForm.phrase)}
                            onClick={() => { patchBlock(b.id, { links: [...(b.links || []), { id: "lk" + Date.now(), phrase: linkForm.phrase, href: linkForm.href }] }); setLinkForm(null); }}
                            className="rounded px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40" style={{ background: "#B45309" }}>Add</button>
                          <button onClick={() => setLinkForm(null)} className="text-gray-400"><X size={13} /></button>
                        </div>
                        {linkForm.phrase && !b.text.includes(linkForm.phrase) && <div className="text-[10px] text-amber-700">Those exact words aren't in this paragraph.</div>}
                        {(b.links || []).map((l) => (
                          <div key={l.id} className="flex items-center gap-1.5 text-[10.5px] text-amber-800">
                            <Link2 size={10} /> <b>{l.phrase}</b> → <span className="ll-mono truncate">{l.href}</span>
                            <button onClick={() => patchBlock(b.id, { links: b.links.filter((x) => x.id !== l.id) })} className="text-amber-400 hover:text-red-500"><X size={11} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }
              if (b.kind === "image") {
                const open = imgPanel === b.id;
                return (
                  <div key={b.id} className={editable} style={{ outlineColor: "#E11D48" }} onClick={() => setImgPanel(open ? null : b.id)}>
                    {mark("#E11D48", "Image — alt · title · replace")}
                    {b.dataUrl
                      ? <img src={b.dataUrl} alt={b.alt} title={b.title} className="w-full rounded-xl object-cover" style={{ maxHeight: 260 }} />
                      : (
                        <div className="flex h-44 flex-col items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 text-gray-400">
                          <ImagePlus size={22} />
                          <span className="ll-mono text-[10.5px]">{b.src}</span>
                          {!b.alt && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[9px] font-bold uppercase text-red-600">Missing alt</span>}
                        </div>
                      )}
                    {open && (
                      <div className="ll-fade mt-2 space-y-1.5 rounded-lg border border-rose-200 bg-rose-50/50 p-2.5" onClick={(e) => e.stopPropagation()}>
                        <input value={b.alt} onChange={(e) => patchBlock(b.id, { alt: e.target.value })}
                          placeholder="Alt text (SEO + accessibility)" className="w-full rounded border border-rose-200 bg-white px-2 py-1.5 text-[12px]" />
                        <input value={b.title} onChange={(e) => patchBlock(b.id, { title: e.target.value })}
                          placeholder="Image title attribute" className="w-full rounded border border-rose-200 bg-white px-2 py-1.5 text-[12px]" />
                        <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-rose-300 py-1.5 text-[11.5px] font-medium text-rose-500 hover:border-rose-400">
                          <Upload size={12} /> Replace image
                          <input type="file" accept="image/*" className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => patchBlock(b.id, { dataUrl: r.result, src: f.name }); r.readAsDataURL(f); }} />
                        </label>
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            })}
            {content.length === 0 && <div className="py-14 text-center text-[13px] text-gray-300">No content captured for this page yet — in production the pixel's editor mode maps the live page here automatically.</div>}
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
          <span className="text-[11px] text-gray-400">Edits queue as pending — push them with <b>Deploy changes</b>.</span>
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white" style={{ background: accent }}>Done</button>
        </div>
      </div>
    </div>
  );
}

/* What the production crawler returns per site. Crawl order:
   1. GET /sitemap.xml (fallback: BFS link crawl from /, same-host, depth 3)
   2. Per URL: parse <title>, meta[name=description], h1, main text blocks, img[src/alt/title]
   3. CMS enrichment: WordPress wp/v2/pages + wp/v2/posts (pulls OLD posts with full content),
      Webflow GET /v2/sites/{id}/pages + CMS items, Shopify Admin pages/products/articles.
   POST /v1/crawl {key} kicks it off; GET /v1/crawl/status?key reports progress. */
const DISCOVERED_PAGES = [
  { url: "/about", name: "About Us", metaTitle: "About Bright Smile Dental \u2014 Our Team & Story", metaDesc: "Meet the dentists and team behind Manhattan's friendliest dental practice.",
    content: [
      { id: "dc1", kind: "heading", level: 1, text: "About Bright Smile Dental" },
      { id: "dc2", kind: "text", text: "Founded in 2012, our Madison Avenue practice has served over 15,000 patients across Manhattan.", links: [] },
      { id: "dc3", kind: "image", src: "team-photo.jpg", alt: "", title: "", dataUrl: null },
    ] },
  { url: "/contact", name: "Contact", metaTitle: "Contact & Book \u2014 Bright Smile Dental", metaDesc: "",
    content: [
      { id: "dc4", kind: "heading", level: 1, text: "Book your visit" },
      { id: "dc5", kind: "text", text: "Call, email, or book online \u2014 same-day slots are released every morning at 8 AM.", links: [] },
    ] },
];
const DISCOVERED_POSTS = [
  { title: "5 signs you shouldn't skip your dental checkup", body: "Bleeding gums, sensitivity, persistent bad breath \u2014 the early warnings most patients ignore, and what each one means.", slug: "5-signs-dental-checkup", status: "published", publishAt: null, createdAt: Date.now() - 32 * 864e5 },
];

/* ---------------- WordPress-style post editor ----------------
   PROD publish path per platform:
   WordPress: POST/PUT wp/v2/posts { title, slug, content: blocksToHtml(), excerpt,
     status: publish|future|draft, date, categories, tags } — featured image first
     uploaded via wp/v2/media, then featured_media: id; SEO title/desc written to
     Yoast (_yoast_wpseo_title/_yoast_wpseo_metadesc) or RankMath via their REST.
   Webflow: POST/PATCH CMS item in the blog collection + site publish.
   Shopify: POST/PUT /blogs/{blog}/articles.json (body_html, tags, image, metafields). */
const escHtml = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const mdFmt = (t = "") => t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/~~([^~]+)~~/g, "<s>$1</s>").replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
const mdInline = (t = "") => mdFmt(escHtml(t));
export function blocksToHtml(blocks = []) {
  return blocks.map((b) => {
    if (b.kind === "heading") return `<h${b.level}>${mdInline(b.text)}</h${b.level}>`;
    if (b.kind === "image") return `<img src="${escHtml(b.dataUrl || b.src)}" alt="${escHtml(b.alt || "")}" title="${escHtml(b.title || "")}" />`;
    if (b.kind === "list") { const tag = b.style === "number" ? "ol" : "ul"; return `<${tag}>` + (b.items || []).map((it) => `<li>${mdInline(it)}</li>`).join("") + `</${tag}>`; }
    if (b.kind === "quote") return `<blockquote><p>${mdInline(b.text || "")}</p></blockquote>`;
    // links first (on escaped plain text, stashed as placeholders) so markdown
    // can't split a phrase and phrases can't match inside generated tags
    let t = escHtml(b.text || "");
    const stash = [];
    (b.links || []).forEach((l) => {
      const ph = escHtml(l.phrase || "");
      if (!ph || !t.includes(ph)) return;
      const token = `\u0000${stash.length}\u0000`;
      stash.push(`<a href="${escHtml(l.href)}">${mdFmt(ph)}</a>`);
      t = t.replace(ph, token);
    });
    t = mdFmt(t);
    stash.forEach((html, i) => { t = t.replace(`\u0000${i}\u0000`, html); });
    return `<p>${t}</p>`;
  }).join("\n");
}

function PostEditor({ initial, siteHost, slugsEditable, accent, onSave, onDelete, onClose }) {
  const isNew = !initial.id;
  const [p, setP] = useState(() => ({
    title: "", slug: "", metaTitle: "", metaDesc: "", excerpt: "", categories: "", tags: "",
    featured: null, content: [], ...initial,
    // map stored status/publishAt ("published"/"scheduled" + ms timestamp) to editor form values
    status: initial.status === "scheduled" ? "future" : initial.status === "draft" ? "draft" : "publish",
    publishAt: initial.publishAt
      ? (() => { const d = new Date(initial.publishAt); const p2 = (n) => String(n).padStart(2, "0");
          return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; })()
      : "",
    categories: Array.isArray(initial.categories) ? initial.categories.join(", ") : (initial.categories || ""),
    tags: Array.isArray(initial.tags) ? initial.tags.join(", ") : (initial.tags || ""),
    content: initial.content?.length ? initial.content : (initial.body ? [{ id: uid(), kind: "text", text: initial.body, links: [] }] : []),
  }));
  const [editId, setEditId] = useState(null);
  const [linkForm, setLinkForm] = useState(null);
  const set = (patch) => setP((x) => ({ ...x, ...patch }));
  const patchBlock = (id, pb) => set({ content: p.content.map((b) => (b.id === id ? { ...b, ...pb } : b)) });
  const taRef = useRef(null);
  const wrapSel = (b, mark) => {
    const ta = taRef.current; if (!ta) return;
    const t = b.text || ""; const s0 = ta.selectionStart, s1 = ta.selectionEnd;
    const sel = t.slice(s0, s1) || "text";
    patchBlock(b.id, { text: t.slice(0, s0) + mark + sel + mark + t.slice(s1) });
    setTimeout(() => { ta.focus(); ta.setSelectionRange(s0 + mark.length, s0 + mark.length + sel.length); });
  };
  const linkSel = (b) => {
    const ta = taRef.current;
    const sel = ta ? (b.text || "").slice(ta.selectionStart, ta.selectionEnd) : "";
    setLinkForm({ blockId: b.id, phrase: sel, href: "" });
  };
  const moveBlock = (id, dir) => {
    const i = p.content.findIndex((b) => b.id === id); const j = i + dir;
    if (j < 0 || j >= p.content.length) return;
    const c = [...p.content]; [c[i], c[j]] = [c[j], c[i]]; set({ content: c });
  };
  const addBlock = (kind, style) => set({
    content: [...p.content, kind === "heading"
      ? { id: uid(), kind: "heading", level: 2, text: "New heading" }
      : kind === "image"
      ? { id: uid(), kind: "image", src: "image.jpg", alt: "", title: "", dataUrl: null }
      : kind === "list"
      ? { id: uid(), kind: "list", style: style || "bullet", items: ["First item", "Second item"] }
      : kind === "quote"
      ? { id: uid(), kind: "quote", text: "A quote worth highlighting." }
      : { id: uid(), kind: "text", text: "Write something…", links: [] }],
  });
  const autoSlug = p.slug || p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const save = () => onSave({
    ...initial, ...p,
    slug: autoSlug || "post",
    categories: p.categories.split(",").map((x) => x.trim()).filter(Boolean),
    tags: p.tags.split(",").map((x) => x.trim()).filter(Boolean),
    body: p.content.filter((b) => b.kind === "text").map((b) => b.text).join("\n\n"),
    status: p.status === "future" ? "scheduled" : p.status === "draft" ? "draft" : "published",
    publishAt: p.status === "future" && p.publishAt ? new Date(p.publishAt).getTime() : null,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-3" onClick={onClose}>
      <div className="flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* top bar */}
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5">
          <FileTextIcon size={15} className="text-gray-400" />
          <span className="ll-display text-[14px] font-semibold">{isNew ? "Publish a new post" : "Edit post"}</span>
          <div className="ml-auto flex items-center gap-2">
            <select value={p.status} onChange={(e) => set({ status: e.target.value })} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] font-medium">
              <option value="publish">Publish now</option>
              <option value="future">Schedule</option>
              <option value="draft">Save as draft</option>
            </select>
            {p.status === "future" && (
              <input type="datetime-local" value={p.publishAt} onChange={(e) => set({ publishAt: e.target.value })}
                className="rounded-lg border border-gray-200 px-2 py-1.5 text-[12px]" />
            )}
            <button onClick={save} disabled={!p.title.trim() || (p.status === "future" && !p.publishAt)}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
              <Send size={13} /> {isNew ? (p.status === "draft" ? "Save draft" : p.status === "future" ? "Schedule" : "Publish") : "Update"}
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X size={16} /></button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* main column — title, permalink, blocks */}
          <div className="min-w-0 flex-1 overflow-y-auto p-6">
            <input value={p.title} onChange={(e) => set({ title: e.target.value })} placeholder="Add title"
              className="ll-display w-full border-0 bg-transparent text-[26px] font-bold tracking-tight outline-none placeholder:text-gray-300" />
            <div className="ll-mono mt-1 flex items-center gap-1 text-[11.5px] text-gray-400">
              {siteHost}/blog/
              {slugsEditable
                ? <input value={p.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} placeholder={autoSlug || "url-slug"} className="min-w-0 flex-1 border-0 bg-transparent outline-none" style={{ color: accent }} />
                : <span>{autoSlug || "url-slug"}</span>}
            </div>

            <div className="mt-5 space-y-3">
              {p.content.map((b) => (
                <div key={b.id} className="group relative rounded-lg">
                  {/* block toolbar */}
                  <div className="absolute -left-1 top-0 z-10 hidden -translate-x-full flex-col gap-0.5 pr-1.5 group-hover:flex">
                    <button onClick={() => moveBlock(b.id, -1)} className="rounded p-0.5 text-gray-300 hover:bg-gray-100 hover:text-gray-500"><ChevronUp size={12} /></button>
                    <button onClick={() => moveBlock(b.id, 1)} className="rounded p-0.5 text-gray-300 hover:bg-gray-100 hover:text-gray-500"><ChevronDown size={12} /></button>
                    <button onClick={() => set({ content: p.content.filter((x) => x.id !== b.id) })} className="rounded p-0.5 text-gray-300 hover:bg-red-50 hover:text-red-500"><Trash2 size={12} /></button>
                  </div>
                  {b.kind === "heading" && (
                    <div className="flex items-start gap-2">
                      <select value={b.level} onChange={(e) => patchBlock(b.id, { level: +e.target.value })}
                        className="ll-mono mt-1 rounded border border-gray-200 px-1 py-0.5 text-[10px] text-gray-500">
                        {[2, 3, 4, 5].map((l) => <option key={l} value={l}>H{l}</option>)}
                      </select>
                      <input value={b.text} onChange={(e) => patchBlock(b.id, { text: e.target.value })}
                        className={`ll-display w-full border-0 bg-transparent font-bold tracking-tight outline-none ${({ 2: "text-[20px]", 3: "text-[17px]", 4: "text-[15px]", 5: "text-[13.5px]" })[b.level] || "text-[17px]"}`} />
                    </div>
                  )}
                  {b.kind === "text" && (
                    <div>
                      {editId === b.id ? (
                        <div>
                          <div className="mb-1 flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-1.5 py-1 shadow-sm" style={{ width: "fit-content" }}>
                            <button onMouseDown={(e) => { e.preventDefault(); wrapSel(b, "**"); }} title="Bold (wraps selection)"
                              className="rounded px-2 py-0.5 text-[12px] font-bold text-gray-600 hover:bg-gray-100">B</button>
                            <button onMouseDown={(e) => { e.preventDefault(); wrapSel(b, "*"); }} title="Italic (wraps selection)"
                              className="rounded px-2 py-0.5 text-[12px] italic text-gray-600 hover:bg-gray-100">I</button>
                            <button onMouseDown={(e) => { e.preventDefault(); wrapSel(b, "~~"); }} title="Strikethrough (wraps selection)"
                              className="rounded px-2 py-0.5 text-[12px] text-gray-600 line-through hover:bg-gray-100">S</button>
                            <button onMouseDown={(e) => { e.preventDefault(); linkSel(b); }} title="Link selected text"
                              className="rounded px-1.5 py-0.5 text-gray-600 hover:bg-gray-100"><Link2 size={13} /></button>
                            <span className="pl-1 text-[9.5px] text-gray-300">select text \u2192 format</span>
                          </div>
                          <textarea autoFocus ref={taRef} value={b.text} rows={Math.max(2, Math.ceil((b.text || "").length / 75))}
                            onChange={(e) => patchBlock(b.id, { text: e.target.value })} onBlur={() => setEditId(null)}
                            className="w-full resize-none rounded bg-gray-50 p-1 text-[14px] leading-relaxed text-gray-700 outline-none" />
                        </div>
                      ) : (
                        <p onClick={() => setEditId(b.id)} className="cursor-text text-[14px] leading-relaxed text-gray-700">{renderTextWithLinks(b.text, b.links)}</p>
                      )}
                      <button onClick={() => setLinkForm({ blockId: b.id, phrase: "", href: "" })}
                        className="mt-0.5 hidden items-center gap-1 text-[10px] font-semibold uppercase tracking-wide group-hover:flex" style={{ color: "#B45309" }}>
                        <Link2 size={10} /> Add link / anchor text
                      </button>
                      {linkForm?.blockId === b.id && (
                        <div className="ll-fade mt-1.5 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50/60 p-2">
                          <div className="flex gap-1.5">
                            <input value={linkForm.phrase} onChange={(e) => setLinkForm({ ...linkForm, phrase: e.target.value })}
                              placeholder="Anchor text (exact words in the paragraph)" className="flex-1 rounded border border-amber-200 bg-white px-2 py-1 text-[11.5px]" />
                            <input value={linkForm.href} onChange={(e) => setLinkForm({ ...linkForm, href: e.target.value })}
                              placeholder="https://…" className="ll-mono flex-1 rounded border border-amber-200 bg-white px-2 py-1 text-[11.5px]" />
                            <button disabled={!linkForm.phrase.trim() || !linkForm.href.trim() || !(b.text || "").includes(linkForm.phrase)}
                              onClick={() => { patchBlock(b.id, { links: [...(b.links || []), { id: "lk" + Date.now(), phrase: linkForm.phrase, href: linkForm.href }] }); setLinkForm(null); }}
                              className="rounded px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40" style={{ background: "#B45309" }}>Add</button>
                            <button onClick={() => setLinkForm(null)} className="text-gray-400"><X size={13} /></button>
                          </div>
                          {(b.links || []).map((l) => (
                            <div key={l.id} className="flex items-center gap-1.5 text-[10.5px] text-amber-800">
                              <Link2 size={10} /> <b>{l.phrase}</b> → <span className="ll-mono truncate">{l.href}</span>
                              <button onClick={() => patchBlock(b.id, { links: b.links.filter((x) => x.id !== l.id) })} className="text-amber-400 hover:text-red-500"><X size={11} /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {b.kind === "list" && (
                    <div className="flex items-start gap-2">
                      <select value={b.style} onChange={(e) => patchBlock(b.id, { style: e.target.value })}
                        className="ll-mono mt-1 rounded border border-gray-200 px-1 py-0.5 text-[10px] text-gray-500">
                        <option value="bullet">\u2022</option><option value="number">1.</option>
                      </select>
                      {editId === b.id ? (
                        <div className="min-w-0 flex-1">
                          <textarea autoFocus value={(b.items || []).join("\n")} rows={Math.max(2, (b.items || []).length)}
                            onChange={(e) => patchBlock(b.id, { items: e.target.value.split("\n") })}
                            onBlur={() => { patchBlock(b.id, { items: (b.items || []).filter((x) => x.trim()) }); setEditId(null); }}
                            className="w-full resize-none rounded bg-gray-50 p-1 text-[14px] leading-relaxed text-gray-700 outline-none" />
                          <div className="text-[9.5px] text-gray-300">One item per line \u00b7 **bold** *italic* ~~strike~~ work here too</div>
                        </div>
                      ) : b.style === "number" ? (
                        <ol onClick={() => setEditId(b.id)} className="min-w-0 flex-1 cursor-text list-decimal space-y-0.5 pl-5 text-[14px] leading-relaxed text-gray-700">
                          {(b.items || []).map((it, i) => <li key={i}>{inlineFmt(it, "li" + i)}</li>)}
                        </ol>
                      ) : (
                        <ul onClick={() => setEditId(b.id)} className="min-w-0 flex-1 cursor-text list-disc space-y-0.5 pl-5 text-[14px] leading-relaxed text-gray-700">
                          {(b.items || []).map((it, i) => <li key={i}>{inlineFmt(it, "li" + i)}</li>)}
                        </ul>
                      )}
                    </div>
                  )}
                  {b.kind === "quote" && (
                    editId === b.id
                      ? <textarea autoFocus value={b.text} rows={2} onChange={(e) => patchBlock(b.id, { text: e.target.value })} onBlur={() => setEditId(null)}
                          className="w-full resize-none rounded border-l-4 bg-gray-50 py-1 pl-3 text-[15px] italic leading-relaxed text-gray-600 outline-none" style={{ borderColor: accent }} />
                      : <blockquote onClick={() => setEditId(b.id)} className="cursor-text border-l-4 py-0.5 pl-3 text-[15px] italic leading-relaxed text-gray-600" style={{ borderColor: accent }}>
                          {inlineFmt(b.text || "", "q")}
                        </blockquote>
                  )}
                  {b.kind === "image" && (
                    <div className="rounded-xl border border-dashed border-gray-200 p-2.5">
                      {b.dataUrl
                        ? <img src={b.dataUrl} alt={b.alt} className="max-h-56 w-full rounded-lg object-cover" />
                        : <label className="flex h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg bg-gray-50 text-gray-400 hover:bg-gray-100">
                            <ImagePlus size={18} /><span className="text-[11px]">Click to upload image</span>
                            <input type="file" accept="image/*" className="hidden"
                              onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => patchBlock(b.id, { dataUrl: r.result, src: f.name }); r.readAsDataURL(f); }} />
                          </label>}
                      <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                        <input value={b.alt} onChange={(e) => patchBlock(b.id, { alt: e.target.value })} placeholder="Alt text" className="rounded border border-gray-200 px-2 py-1 text-[11.5px]" />
                        <input value={b.title} onChange={(e) => patchBlock(b.id, { title: e.target.value })} placeholder="Image title" className="rounded border border-gray-200 px-2 py-1 text-[11.5px]" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {/* add block */}
            <div className="mt-4 flex gap-1.5">
              {[["Paragraph", "text", AlignLeft], ["Heading", "heading", Type], ["Bullet list", "list:bullet", List], ["Numbered list", "list:number", ListOrdered], ["Quote", "quote", Quote], ["Image", "image", ImagePlus]].map(([lbl, kind, Icon]) => (
                <button key={kind} onClick={() => { const [k, st] = kind.split(":"); addBlock(k, st); }}
                  className="flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-2.5 py-1.5 text-[11.5px] font-medium text-gray-400 hover:border-gray-400 hover:text-gray-600">
                  <Icon size={12} /> {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* sidebar — WP-style document settings */}
          <div className="w-72 shrink-0 space-y-3.5 overflow-y-auto border-l border-gray-100 bg-gray-50/60 p-4">
            <Labeled label="Featured image">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white py-3 text-[11px] text-gray-400 hover:border-gray-400">
                {p.featured ? <img src={p.featured} alt="" className="max-h-28 w-full rounded-lg object-cover" /> : <><ImagePlus size={16} /> Set featured image</>}
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => set({ featured: r.result }); r.readAsDataURL(f); }} />
              </label>
            </Labeled>
            <Labeled label="Categories (comma-separated)">
              <input value={p.categories} onChange={(e) => set({ categories: e.target.value })} placeholder="Dental tips, News" className={inputCls + " bg-white"} />
            </Labeled>
            <Labeled label="Tags">
              <input value={p.tags} onChange={(e) => set({ tags: e.target.value })} placeholder="whitening, nyc" className={inputCls + " bg-white"} />
            </Labeled>
            <Labeled label="Excerpt">
              <textarea value={p.excerpt} onChange={(e) => set({ excerpt: e.target.value })} rows={2} className={inputCls + " resize-none bg-white"} />
            </Labeled>
            {/* SEO panel (Yoast/RankMath-style) */}
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <div className="mb-2 text-[11px] font-bold text-gray-600">SEO — search appearance</div>
              <Labeled label={<span className="flex items-center justify-between">Meta title <CharCount value={p.metaTitle} max={60} /></span>}>
                <input value={p.metaTitle} maxLength={60} onChange={(e) => set({ metaTitle: e.target.value })} placeholder={p.title} className={inputCls} />
              </Labeled>
              <div className="mt-2">
                <Labeled label={<span className="flex items-center justify-between">Meta description <CharCount value={p.metaDesc} max={160} /></span>}>
                  <textarea value={p.metaDesc} maxLength={160} rows={2} onChange={(e) => set({ metaDesc: e.target.value })} className={inputCls + " resize-none"} />
                </Labeled>
              </div>
              <div className="mt-2 rounded-lg bg-gray-50 p-2">
                <div className="truncate text-[12px] font-medium" style={{ color: "#1a0dab" }}>{p.metaTitle || p.title || "Post title"}</div>
                <div className="ll-mono truncate text-[9.5px] text-emerald-700">{siteHost}/blog/{autoSlug || "slug"}</div>
                <div className="line-clamp-2 text-[10.5px] leading-snug text-gray-500">{p.metaDesc || p.excerpt || "Meta description preview…"}</div>
              </div>
            </div>
            {!isNew && onDelete && (
              <button onClick={() => { onDelete(); onClose(); }} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-100 py-2 text-[12px] font-medium text-red-500 hover:bg-red-50">
                <Trash2 size={12} /> Delete post
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function WebsiteOptTab({ opt, setOpt, accent, log, project }) {
  const w = opt.website;
  const set = (patch) => setOpt("website", patch);
  const [connectStep, setConnectStep] = useState(null); // null | "pick" | platform key
  const [sub, setSub] = useState("connection");           // connection | pages | posts
  const [openPage, setOpenPage] = useState(null);
  const [openPost, setOpenPost] = useState(null); // "new" | blog id
  const [copied, setCopied] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [credDraft, setCredDraft] = useState("");
  const [testingCred, setTestingCred] = useState(false);

  const plat = w.platform ? WEB_PLATFORMS[w.platform] : null;
  const caps = plat ? plat.caps : {};
  const dirtyCount = w.pages.filter((p) => p.dirty).length;
  const siteKey = w.siteKey || `ss_live_${project.id}_${hashStr(project.website).toString(36).slice(0, 6)}`;

  const patchPage = (id, p) => set({ pages: w.pages.map((x) => (x.id === id ? { ...x, ...p, dirty: true, updatedAt: Date.now() } : x)) });
  const deploy = () => {
    const payload = buildPixelPayload(w.pages); // PROD: await fetch("/v1/deploy", {method:"POST", body: JSON.stringify({ key: siteKey, payload })})
    set({ pages: w.pages.map((p) => ({ ...p, dirty: false })), lastDeploy: Date.now() });
    log?.(`Deployed ${dirtyCount} page change${dirtyCount > 1 ? "s" : ""} (${Object.keys(payload).length} paths)`, project.name);
  };
  const crawlSite = () => {
    setCrawling(true); // PROD: POST /v1/crawl {key} \u2014 see the crawler contract above DISCOVERED_PAGES
    setTimeout(() => {
      const added = { pages: 0, posts: 0 };
      set((cur) => {
        // computed against the LIVE state inside the updater \u2014 edits made during the crawl survive
        const newPages = DISCOVERED_PAGES.filter((dp) => !cur.pages.some((p) => p.url === dp.url))
          .map((dp, i) => ({ ...dp, id: "pg" + Date.now() + i, dirty: false }));
        const oldPosts = DISCOVERED_POSTS.filter((dp) => !cur.blogs.some((b) => b.slug === dp.slug))
          .map((dp, i) => ({ ...dp, id: "bl" + Date.now() + i }));
        added.pages = newPages.length; added.posts = oldPosts.length;
        return { pages: [...cur.pages, ...newPages], blogs: [...oldPosts, ...cur.blogs], crawled: true, lastCrawl: Date.now() };
      });
      setCrawling(false);
      setTimeout(() => log?.(`Crawled ${project.website} \u2014 imported ${added.pages} page${added.pages === 1 ? "" : "s"} & ${added.posts} old post${added.posts === 1 ? "" : "s"}`, project.name), 0);
    }, 1900);
  };
  const verify = () => {
    setVerifying(true); // PROD: poll GET /v1/status?key= until the pixel's /v1/hello ping lands
    setTimeout(() => {
      setVerifying(false);
      set({ verified: true }); // merges into live state \u2014 never spread a stale snapshot here
      log?.("Website pixel verified", project.website);
      crawlSite(); // auto-crawl kicks off the moment the connector verifies
    }, 1400);
  };
  const testCred = () => {
    if (!credDraft.trim()) return;
    setTestingCred(true); // PROD: server-side credential test call (n8n-style), e.g. GET /wp-json/wp/v2/users/me
    setTimeout(() => {
      setTestingCred(false);
      set({ credential: { type: plat.credential.type, masked: credDraft.slice(0, 4) + "••••••••", status: "valid", addedAt: Date.now() } });
      setCredDraft(""); log?.(`Verified ${plat.credential.type}`, project.website);
    }, 1100);
  };
  const capOn = (v) => v === true || v === "pixel";
  const slugsEnabled = capOn(caps.slugs) && caps.slugs === true;
  const blogsEnabled = caps.blogs === true && (!plat?.credential || w.credential?.status === "valid" || w.platform === "wordpress");



  /* ---------- not connected: Connect website ---------- */
  if (!w.connected) return (
    <>
      <Card className="p-8 text-center">
        <Globe size={28} className="mx-auto text-gray-300" />
        <div className="ll-display mt-2 text-[16px] font-semibold">Connect your website</div>
        <p className="mx-auto mt-1 max-w-md text-[12.5px] text-gray-400">Pick your platform, follow the access guide, drop in one script — then push meta, headings, image alt and content edits straight from this dashboard.</p>
        <div className="mt-4 flex justify-center">
          <button onClick={() => setConnectStep("pick")} className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold text-white" style={{ background: accent }}>
            <Link2 size={14} /> Connect website
          </button>
        </div>
      </Card>

      {connectStep && (
        <Modal title={connectStep === "pick" ? "Connect your website" : `Connect ${WEB_PLATFORMS[connectStep].label}`} onClose={() => setConnectStep(null)}>
          {connectStep === "pick" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(WEB_PLATFORMS).map(([key, p]) => (
                <button key={key} onClick={() => setConnectStep(key)}
                  className="rounded-xl border border-gray-200 p-3.5 text-left hover:border-gray-300 hover:shadow-sm">
                  <div className="ll-display text-[13.5px] font-semibold">{p.label}</div>
                  <div className="mt-0.5 text-[10.5px] text-gray-400">{p.tag}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {/* access guide */}
              <div className="space-y-1.5">
                {WEB_PLATFORMS[connectStep].guide.map((step, i) => (
                  <div key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-gray-600">
                    <span className="ll-mono mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: accent }}>{i + 1}</span>
                    {step}
                  </div>
                ))}
              </div>
              {/* the pixel */}
              <Labeled label="Your pixel — paste in <head>">
                <div className="relative">
                  <pre className="ll-mono overflow-x-auto rounded-xl bg-gray-900 p-3 text-[11px] leading-relaxed text-emerald-300">{pixelSnippet(siteKey)}</pre>
                  <button onClick={() => { navigator.clipboard?.writeText(pixelSnippet(siteKey)); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                    className="absolute right-2 top-2 rounded-md bg-white/10 px-2 py-1 text-[10.5px] font-semibold text-white hover:bg-white/20">
                    {copied ? "Copied ✓" : "Copy"}
                  </button>
                </div>
              </Labeled>
              {/* capability matrix */}
              <Labeled label="What this connector can edit">
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(CAP_LABELS).map(([k, lbl]) => {
                    const v = WEB_PLATFORMS[connectStep].caps[k];
                    return (
                      <span key={k} className="rounded-full border px-2 py-0.5 text-[10.5px] font-medium"
                        style={v ? { borderColor: "#86EFAC", background: "#F0FDF4", color: "#166534" } : { borderColor: "#FECACA", background: "#FEF2F2", color: "#991B1B" }}>
                        {v ? "✓" : "✗"} {lbl}{v === "pixel" ? " (pixel)" : ""}
                      </span>
                    );
                  })}
                </div>
              </Labeled>
              {WEB_PLATFORMS[connectStep].notes.length > 0 && (
                <div className="rounded-lg bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-700">
                  {WEB_PLATFORMS[connectStep].notes.map((n, i) => <div key={i}>{n}</div>)}
                </div>
              )}
              <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
                <button onClick={() => setConnectStep("pick")} className="rounded-lg border border-gray-200 px-4 py-2 text-[12.5px] font-medium text-gray-600">Back</button>
                <button onClick={() => { set({ connected: true, platform: connectStep, siteKey, verified: false, credential: null }); setConnectStep(null); log?.(`Connected ${WEB_PLATFORMS[connectStep].label} website`, project.website); }}
                  className="rounded-lg px-5 py-2 text-[12.5px] font-semibold text-white" style={{ background: accent }}>
                  I've installed it — connect
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );

  /* ---------- connected ---------- */
  const SUBS = [
    { key: "connection", label: "Connector", icon: Link2, note: plat.label + (w.verified ? " \u00b7 verified" : " \u00b7 awaiting pixel") },
    { key: "pages", label: "Pages", icon: Globe, note: `${w.pages.length} tracked${dirtyCount ? ` \u00b7 ${dirtyCount} pending` : ""}` },
    { key: "posts", label: "Posts", icon: FileTextIcon, note: `${w.blogs.length} post${w.blogs.length === 1 ? "" : "s"}` },
  ];
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      {/* vertical secondary buttons */}
      <div className="flex shrink-0 flex-row gap-2 overflow-x-auto lg:w-52 lg:flex-col lg:overflow-visible">
        {SUBS.map((t) => (
          <button key={t.key} onClick={() => setSub(t.key)}
            className="flex min-w-[160px] items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left lg:min-w-0"
            style={sub === t.key ? { background: accent + "10", borderColor: accent } : { background: "var(--chip-bg, #fff)", borderColor: "#E5E7EB" }}>
            <t.icon size={15} className="shrink-0" style={{ color: sub === t.key ? accent : "#9CA3AF" }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold" style={{ color: sub === t.key ? accent : "var(--chip-fg, #374151)" }}>{t.label}</span>
              <span className="block truncate text-[10px] text-gray-400">{t.note}</span>
            </span>
          </button>
        ))}
      </div>

      {/* selected feature window */}
      <div className="min-w-0 flex-1 space-y-4">
      {sub === "connection" && (<>
      {/* connection, verification & credentials (n8n-style) */}
      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="ll-display text-[15px] font-semibold">{plat.label} <span className="ll-mono ml-1 text-[11px] font-normal text-gray-400">{project.website}</span></div>
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={w.verified ? { background: "#DCFCE7", color: "#166534" } : { background: "#FEF3C7", color: "#92400E" }}>
            {w.verified ? "Pixel verified" : "Awaiting pixel"}
          </span>
          {!w.verified && (
            <button onClick={verify} disabled={verifying} className="flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold" style={{ borderColor: accent, color: accent }}>
              {verifying ? <><RefreshCw size={11} className="animate-spin" /> Checking…</> : "Verify installation"}
            </button>
          )}
          <button onClick={() => set({ connected: false, platform: null, verified: false, credential: null })}
            className="ml-auto text-[11.5px] text-gray-400 hover:text-red-500">Disconnect</button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="ll-mono rounded-lg bg-gray-50 px-2.5 py-1 text-[11px] text-gray-500">{siteKey}</span>
          <button onClick={() => { navigator.clipboard?.writeText(pixelSnippet(siteKey)); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-500 hover:border-gray-300">{copied ? "Copied ✓" : "Copy pixel"}</button>
          {Object.entries(CAP_LABELS).map(([k, lbl]) => {
            const v = caps[k];
            return (
              <span key={k} className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
                style={v ? { borderColor: "#86EFAC", background: "#F0FDF4", color: "#166534" } : { borderColor: "#FECACA", background: "#FEF2F2", color: "#991B1B" }}>
                {v ? "✓" : "✗"} {lbl}
              </span>
            );
          })}
        </div>
        {plat.credential && (
          <div className="rounded-xl border border-gray-100 p-3">
            <div className="mb-1.5 text-[12px] font-semibold text-gray-700">Credential — {plat.credential.type} <span className="font-normal text-gray-400">(stored encrypted server-side, n8n-style)</span></div>
            {w.credential?.status === "valid" ? (
              <div className="flex items-center gap-2 text-[12px]">
                <span className="ll-mono rounded-lg bg-gray-50 px-2.5 py-1 text-gray-500">{w.credential.masked}</span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">Valid</span>
                <button onClick={() => set({ credential: null })} className="text-[11px] text-gray-400 hover:text-red-500">Remove</button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <input value={credDraft} onChange={(e) => setCredDraft(e.target.value)} placeholder={plat.credential.placeholder} className={"ll-mono " + inputCls} />
                <button onClick={testCred} disabled={!credDraft.trim() || testingCred}
                  className="shrink-0 rounded-lg px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
                  {testingCred ? "Testing…" : "Test & save"}
                </button>
              </div>
            )}
            {w.platform !== "wordpress" && !w.credential && <div className="mt-1.5 text-[10.5px] text-gray-400">Required for: {w.platform === "webflow" ? "URL slugs & blog publishing" : "URL slugs, image alt (server-side) & blog publishing"}.</div>}
          </div>
        )}
        {plat.notes.length > 0 && (
          <div className="rounded-lg bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-700">
            {plat.notes.map((n, i) => <div key={i}>{n}</div>)}
          </div>
        )}
      </Card>

      </>)}

      {sub === "pages" && (<>
      {/* on-page editor */}
      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="ll-display text-[15px] font-semibold">Pages</div>
            <div className="text-[11.5px] text-gray-400">
              {w.crawled
                ? <>Auto-crawled from {project.website}{w.lastCrawl ? ` · last crawl ${relTime(w.lastCrawl)}` : ""} — click a page to live-edit.</>
                : "Pages are crawled and listed automatically once the pixel is verified."}
            </div>
          </div>
          <button onClick={() => crawlSite()} disabled={crawling || !w.verified}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-semibold disabled:opacity-40" style={{ borderColor: accent, color: accent }}>
            {crawling ? <><RefreshCw size={12} className="animate-spin" /> Crawling…</> : <><RefreshCw size={12} /> Recrawl site</>}
          </button>
          <button onClick={deploy} disabled={dirtyCount === 0}
            className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
            <Rocket size={13} /> Deploy {dirtyCount > 0 ? `${dirtyCount} change${dirtyCount > 1 ? "s" : ""}` : "changes"}
          </button>
        </div>
        {crawling && (
          <div className="ll-fade mb-2 flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-[12px] font-medium text-blue-700">
            <RefreshCw size={13} className="animate-spin" /> Crawling {project.website} — reading sitemap, pulling titles, meta, headings, images and old posts…
          </div>
        )}
        {!w.crawled && !crawling && (
          <div className="mb-2 rounded-xl bg-amber-50 px-3 py-2.5 text-[12px] text-amber-700">
            Waiting for pixel verification — once verified, your site is crawled and every page appears here automatically.
          </div>
        )}
        <div className="overflow-x-auto">
        <table className="w-full table-fixed text-[11.5px]">
          <thead>
            <tr className="border-b border-gray-100 text-left text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">
              <th className="w-7 py-2 pr-1">#</th>
              <th className="py-2 pr-2">Page</th>
              <th className="w-[150px] py-2 pr-2">Meta title</th>
              <th className="w-[170px] py-2 pr-2">Meta description</th>
              <th className="w-[86px] py-2 pr-2">Date</th>
              <th className="w-[76px] py-2"></th>
            </tr>
          </thead>
          <tbody>
            {w.pages.map((pg, i) => (
              <tr key={pg.id} onClick={() => setOpenPage(pg.id)} className="cursor-pointer border-b border-gray-50 align-top hover:bg-gray-50">
                <td className="ll-mono py-2.5 pr-1 text-[10px] text-gray-300">{i + 1}</td>
                <td className="min-w-0 py-2.5 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[12.5px] font-medium text-gray-800">{pg.name || pg.metaTitle || pg.url}</span>
                    {pg.dirty && <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-px text-[8.5px] font-bold uppercase text-amber-600">Pending</span>}
                  </div>
                  <div className="ll-mono truncate text-[10px] text-gray-400">{pg.url}</div>
                </td>
                <td className="py-2.5 pr-2">
                  {pg.metaTitle ? <><span className="line-clamp-2 text-[11px] leading-snug text-gray-600">{pg.metaTitle}</span><div className="mt-0.5"><MetaChip label="MT" value={pg.metaTitle} max={60} /></div></> : null}
                </td>
                <td className="py-2.5 pr-2">
                  {pg.metaDesc ? <><span className="line-clamp-2 text-[11px] leading-snug text-gray-500">{pg.metaDesc}</span><div className="mt-0.5"><MetaChip label="MD" value={pg.metaDesc} max={160} /></div></> : null}
                </td>
                <td className="ll-mono py-2.5 pr-2 text-[10px] leading-relaxed text-gray-400">
                  {pg.updatedAt ? <>Upd {fmtTs2(pg.updatedAt)}</> : null}
                </td>
                <td className="py-2.5">
                  <span className="flex w-fit items-center gap-1 rounded-lg border px-2 py-1 text-[10.5px] font-semibold" style={{ borderColor: accent, color: accent }}>
                    <Settings2 size={11} /> Live edit
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {openPage && w.pages.find((p) => p.id === openPage) && (
          <LivePageEditor page={w.pages.find((p) => p.id === openPage)} accent={accent}
            slugsEnabled={slugsEnabled} siteHost={project.website}
            onPatch={(p) => patchPage(openPage, p)} onClose={() => setOpenPage(null)} />
        )}
        <button onClick={() => set({ pages: [...w.pages, { id: "pg" + Date.now(), url: "/new-page", name: "New page", metaTitle: "", metaDesc: "", dirty: true, content: [{ id: "cb" + Date.now(), kind: "heading", level: 1, text: "New page heading" }, { id: "ct" + Date.now(), kind: "text", text: "Click to edit this text.", links: [] }] }] })}
          className="mt-2 flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-[12px] font-medium text-gray-400 hover:border-gray-400 hover:text-gray-600">
          <Plus size={12} /> Add page manually
        </button>
      </Card>

      </>)}

      {sub === "posts" && (<>
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="ll-display text-[15px] font-semibold">Existing posts</div>
            <div className="text-[11px] text-gray-400">
              {caps.blogs === true
                ? <>Click any post to edit in the full editor. Updates push back via {w.platform === "wordpress" ? "wp/v2/posts" : w.platform === "webflow" ? "the Webflow CMS API" : "the Shopify Admin API"}.</>
                : "Publishing is unavailable on this platform — see the note below."}
            </div>
          </div>
          <button onClick={() => setOpenPost("new")} disabled={!blogsEnabled}
            className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
            <Plus size={13} /> Publish a new post
          </button>
        </div>
        {caps.blogs !== true && (
          <div className="mt-3 rounded-lg bg-amber-50 p-3 text-[11.5px] leading-relaxed text-amber-700">
            NOT AVAILABLE on {plat.label} — {w.platform === "wix" ? "Wix has no public third-party blog-publish API." : "there's no CMS on a custom site to publish into."} We can export post HTML for your developer instead.
          </div>
        )}
        {caps.blogs === true && !blogsEnabled && (
          <div className="mt-3 rounded-lg bg-amber-50 p-3 text-[11.5px] text-amber-700">
            Add and test your {plat.credential.type} in the Connector tab to unlock publishing.
          </div>
        )}
        <div className="mt-3 overflow-x-auto">
        <table className="w-full table-fixed text-[11.5px]">
          <thead>
            <tr className="border-b border-gray-100 text-left text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">
              <th className="w-7 py-2 pr-1">#</th>
              <th className="py-2 pr-2">Post</th>
              <th className="w-[140px] py-2 pr-2">Meta title</th>
              <th className="w-[160px] py-2 pr-2">Meta description</th>
              <th className="w-[92px] py-2 pr-2">Date</th>
              <th className="w-[78px] py-2 pr-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {w.blogs.map((b, i) => (
              <tr key={b.id} onClick={() => blogsEnabled && setOpenPost(b.id)} className="cursor-pointer border-b border-gray-50 align-top hover:bg-gray-50">
                <td className="ll-mono py-2.5 pr-1 text-[10px] text-gray-300">{i + 1}</td>
                <td className="min-w-0 py-2.5 pr-2">
                  <div className="flex items-center gap-1.5">
                    {b.featured && <img src={b.featured} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />}
                    <span className="truncate text-[12.5px] font-medium text-gray-800">{b.title}</span>
                  </div>
                  <div className="ll-mono truncate text-[10px] text-gray-400">/blog/{b.slug}{(b.categories || []).length ? ` \u00b7 ${b.categories.join(", ")}` : ""}</div>
                </td>
                <td className="py-2.5 pr-2">
                  {b.metaTitle ? <><span className="line-clamp-2 text-[11px] leading-snug text-gray-600">{b.metaTitle}</span><div className="mt-0.5"><MetaChip label="MT" value={b.metaTitle} max={60} /></div></> : null}
                </td>
                <td className="py-2.5 pr-2">
                  {b.metaDesc ? <><span className="line-clamp-2 text-[11px] leading-snug text-gray-500">{b.metaDesc}</span><div className="mt-0.5"><MetaChip label="MD" value={b.metaDesc} max={160} /></div></> : null}
                </td>
                <td className="ll-mono py-2.5 pr-2 text-[10px] leading-relaxed text-gray-400">
                  {b.status === "scheduled" ? <>Sch {fmtTs2(b.publishAt)}</> : b.status === "published" ? <>Pub {fmtTs2(b.createdAt)}</> : <>Drafted {fmtTs2(b.createdAt)}</>}
                  {b.updatedAt ? <><br />Upd {fmtTs2(b.updatedAt)}</> : null}
                </td>
                <td className="py-2.5 pr-2">
                  <span className="rounded-full px-1.5 py-px text-[8.5px] font-bold uppercase"
                    style={b.status === "published" ? { background: "#DCFCE7", color: "#166534" } : b.status === "draft" ? { background: "#F1F5F9", color: "#475569" } : { background: "#FEF3C7", color: "#92400E" }}>
                    {b.status === "published" ? "Published" : b.status === "draft" ? "Draft" : "Scheduled"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {w.blogs.length === 0 && <div className="py-6 text-center text-[12px] text-gray-300">No posts yet.</div>}
        </div>
      </Card>

      {openPost && (
        <PostEditor
          initial={openPost === "new" ? {} : w.blogs.find((x) => x.id === openPost) || {}}
          siteHost={project.website} slugsEditable={slugsEnabled || w.platform === "wordpress"} accent={accent}
          onSave={(post) => {
            if (openPost === "new") {
              set({ blogs: [{ ...post, id: "bl" + Date.now(), createdAt: Date.now() }, ...w.blogs] });
              log?.(post.status === "published" ? "Published blog post to website" : post.status === "scheduled" ? "Scheduled blog post" : "Saved blog draft", post.title);
            } else {
              set({ blogs: w.blogs.map((x) => (x.id === openPost ? { ...x, ...post, updatedAt: Date.now() } : x)) });
              log?.("Updated blog post on website", post.title);
            }
            setOpenPost(null);
          }}
          onDelete={openPost !== "new" ? () => { set({ blogs: w.blogs.filter((x) => x.id !== openPost) }); log?.("Deleted blog post from website", w.blogs.find((x) => x.id === openPost)?.title || ""); } : null}
          onClose={() => setOpenPost(null)} />
      )}
      </>)}
      </div>
    </div>
  );
}

/* ---------------- Social tab ---------------- */
function SocialOptTab({ opt, setOpt, accent, log }) {
  const soc = opt.social;
  const set = (patch) => setOpt("social", patch);
  const [editId, setEditId] = useState(null);
  const [composer, setComposer] = useState({ platforms: [], text: "", image: null, when: "now", publishAt: "" });
  const connected = soc.accounts.filter((a) => a.connected);
  const hasX = composer.platforms.includes("x");

  const togglePlatform = (id) => setComposer((c) => ({ ...c, platforms: c.platforms.includes(id) ? c.platforms.filter((x) => x !== id) : [...c.platforms, id] }));
  const publish = () => {
    if (!composer.text.trim() || composer.platforms.length === 0) return;
    set({ posts: [{ id: "sp" + Date.now(), platforms: composer.platforms, text: composer.text, image: composer.image, status: composer.when === "now" ? "published" : "scheduled", publishAt: composer.when === "now" ? null : new Date(composer.publishAt).getTime(), createdAt: Date.now() }, ...soc.posts] });
    log?.(composer.when === "now" ? `Published to ${composer.platforms.length} social platform(s)` : "Scheduled social post", "");
    setComposer({ platforms: [], text: "", image: null, when: "now", publishAt: "" });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* accounts: connect + edit info */}
      <Card className="space-y-2 p-5">
        <div className="ll-display text-[15px] font-semibold">Accounts</div>
        <div className="text-[11.5px] text-gray-400">Connect each platform with OAuth. Once connected you can edit the page/account info and publish.</div>
        {soc.accounts.map((a) => {
          const Icon = SOCIAL_ICONS[a.id];
          const editing = editId === a.id;
          return (
            <div key={a.id} className="rounded-xl border border-gray-100">
              <div className="flex items-center gap-2.5 px-3 py-2.5">
                <Icon size={16} style={{ color: a.connected ? SOCIAL_COLORS[a.id] : "#C7CDD8" }} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-gray-800">{a.platform}</div>
                  <div className="ll-mono truncate text-[10.5px] text-gray-400">{a.connected ? `${a.handle} · ${a.name}` : "Not connected"}</div>
                </div>
                {a.connected && (
                  <button onClick={() => setEditId(editing ? null : a.id)} className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-500 hover:border-gray-300">
                    {editing ? "Close" : "Edit info"}
                  </button>
                )}
                <OAuthButton label="Connect" accent={accent} connected={a.connected}
                  onDone={() => { set({ accounts: soc.accounts.map((x) => x.id === a.id ? { ...x, connected: true, handle: x.handle || "@yourhandle", name: x.name || a.platform } : x) }); log?.(`Connected ${a.platform}`, ""); }}
                  onDisconnect={() => set({ accounts: soc.accounts.map((x) => x.id === a.id ? { ...x, connected: false } : x) })} />
              </div>
              {editing && a.connected && (
                <div className="ll-fade grid gap-2 border-t border-gray-50 p-3 sm:grid-cols-2">
                  <Labeled label="Display name"><input value={a.name} onChange={(e) => set({ accounts: soc.accounts.map((x) => x.id === a.id ? { ...x, name: e.target.value } : x) })} className={inputCls} /></Labeled>
                  <Labeled label="Handle"><input value={a.handle} onChange={(e) => set({ accounts: soc.accounts.map((x) => x.id === a.id ? { ...x, handle: e.target.value } : x) })} className={"ll-mono " + inputCls} /></Labeled>
                  <div className="sm:col-span-2">
                    <Labeled label="Bio / About">
                      <textarea value={a.bio} rows={2} onChange={(e) => set({ accounts: soc.accounts.map((x) => x.id === a.id ? { ...x, bio: e.target.value } : x) })} className={inputCls + " resize-none"} />
                    </Labeled>
                  </div>
                  <button onClick={() => { setEditId(null); log?.(`Updated ${a.platform} page info`, ""); }}
                    className="w-fit rounded-lg px-3.5 py-1.5 text-[12px] font-semibold text-white" style={{ background: accent }}>Save to platform</button>
                </div>
              )}
            </div>
          );
        })}
      </Card>

      {/* composer + feed */}
      <Card className="space-y-3 p-5">
        <div className="ll-display text-[15px] font-semibold">Compose post</div>
        <Labeled label="Publish to">
          <div className="flex flex-wrap gap-1.5">
            {connected.map((a) => {
              const Icon = SOCIAL_ICONS[a.id];
              const on = composer.platforms.includes(a.id);
              return (
                <button key={a.id} onClick={() => togglePlatform(a.id)}
                  className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-medium"
                  style={on ? { borderColor: SOCIAL_COLORS[a.id], color: SOCIAL_COLORS[a.id], background: SOCIAL_COLORS[a.id] + "0F" } : { borderColor: "#E5E7EB", color: "#6B7280" }}>
                  <Icon size={13} /> {a.platform.split(" ")[0]}
                </button>
              );
            })}
            {connected.length === 0 && <div className="text-[11.5px] text-gray-300">Connect at least one account first.</div>}
          </div>
        </Labeled>
        <Labeled label={<span className="flex items-center justify-between">Post text {hasX && <CharCount value={composer.text} max={280} />}</span>}>
          <textarea value={composer.text} onChange={(e) => setComposer({ ...composer, text: e.target.value })} rows={4} className={inputCls + " resize-none"} placeholder="Write once — publish everywhere selected…" />
        </Labeled>
        <Labeled label="Image"><LogoUpload value={composer.image} onChange={(image) => setComposer({ ...composer, image })} label="Add image" /></Labeled>
        <div className="flex items-center gap-2">
          <Seg options={["now", "schedule"]} value={composer.when} onChange={(v) => setComposer({ ...composer, when: v })} accent={accent} />
          {composer.when === "schedule" && (
            <input type="datetime-local" value={composer.publishAt} onChange={(e) => setComposer({ ...composer, publishAt: e.target.value })} className="rounded-lg border border-gray-200 px-2 py-1.5 text-[12px]" />
          )}
          <button onClick={publish}
            disabled={!composer.text.trim() || composer.platforms.length === 0 || (composer.when === "schedule" && !composer.publishAt) || (hasX && composer.text.length > 280)}
            className="ml-auto flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
            <Send size={13} /> {composer.when === "now" ? "Publish" : "Schedule"}
          </button>
        </div>
        <div className="space-y-1.5 border-t border-gray-100 pt-3">
          {soc.posts.map((p) => (
            <div key={p.id} className="group flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2">
              <span className="mt-0.5 flex shrink-0 gap-1">
                {p.platforms.map((pid) => { const I = SOCIAL_ICONS[pid]; return <I key={pid} size={13} style={{ color: SOCIAL_COLORS[pid] }} />; })}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] text-gray-600">{p.text}</div>
                <div className="ll-mono mt-0.5 text-[10px] text-gray-400">
                  {p.status === "scheduled" ? `Scheduled · ${new Date(p.publishAt).toLocaleString("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : `Published · ${fmtTs2(p.createdAt)}`}
                </div>
              </div>
              <button onClick={() => set({ posts: soc.posts.filter((x) => x.id !== p.id) })}
                className="text-gray-300 opacity-0 hover:text-red-500 group-hover:opacity-100"><Trash2 size={13} /></button>
            </div>
          ))}
          {soc.posts.length === 0 && <div className="py-2 text-center text-[11.5px] text-gray-300">No social posts yet.</div>}
        </div>
      </Card>
    </div>
  );
}

const NAV = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "ranks", label: "Keyword Rank Tracking", icon: Target },
  { key: "gbp", label: "Business Profile", icon: Building2 },
  { key: "web", label: "Website Performance", icon: BarChart3 },
];

export default function App() {
  const [company, setCompany] = useState(SEED_COMPANY);
  const [clients, setClients] = useState(SEED_CLIENTS);
  const [activeClientId, setActiveClientId] = useState(SEED_CLIENTS[0].id);
  const [activeProjectId, setActiveProjectId] = useState(SEED_CLIENTS[0].projects[0].id);
  const [expanded, setExpanded] = useState(() => new Set(SEED_CLIENTS.map((c) => c.id)));
  const [view, setView] = useState("overview");
  const [cmp, setCmp] = useState(3);
  const [clientView, setClientView] = useState(false);
  const [modal, setModal] = useState(null); // {type:"addClient"|"addProject"|"clientSettings"|"companySettings", clientId?}
  const [screen, setScreen] = useState("app");      // "app" | "login"
  const [session, setSession] = useState(null);     // { clientId } when a client is signed in
  const [teamSession, setTeamSession] = useState(null); // { memberId } when a team member (not the owner) is signed in
  const [showReport, setShowReport] = useState(null); // null | "performance" | "work"
  const [range, setRange] = useState(DEFAULT_RANGE);
  const [dark, setDark] = useState(false);
  const [section, setSection] = useState("performance"); // "performance" | "management"

  const logActivity = (action, target = "") =>
    setCompany((c) => {
      const m = teamSession ? (c.team || []).find((x) => x.id === teamSession.memberId) : (c.team || []).find((x) => x.isOwner);
      return {
        ...c,
        activity: [{ id: "a" + Date.now() + Math.random().toString(36).slice(2, 6), ts: Date.now(), member: m?.name || "You (Owner)", action, target }, ...(c.activity || [])].slice(0, 100),
      };
    });

  /* the signed-in dashboard user: the workspace owner by default, or the team
     member from teamSession — their team record drives every permission gate */
  const owner = (company.team || []).find((m) => m.isOwner) || (company.team || [])[0];
  const currentUser = (teamSession && (company.team || []).find((m) => m.id === teamSession.memberId)) || owner;
  const perms = currentUser?.perms || ROLE_PRESETS.Viewer;
  const isAdmin = !teamSession || currentUser?.role === "Admin";
  const canClients = isAdmin || !!perms.manageClients;   // add/edit clients & projects, client settings
  const canKeywords = isAdmin || !!perms.manageKeywords; // add/delete/rerun tracked keywords
  const canReports = isAdmin || !!perms.createReports;   // open the report builder
  const pmPerms = {
    admin: isAdmin,
    create: !!perms.manageTasks,
    manage: !!perms.manageTasks,
    complete: !!perms.manageTasks,
    comment: true,
  };

  /* a signed-in member only sees projects they're assigned to AND have at least
     one granted section on (Project settings → Team); admins see everything */
  const visibleClients = useMemo(() => {
    if (isAdmin) return clients;
    const assignedAll = currentUser?.projects === "all";
    const ids = new Set(Array.isArray(currentUser?.projects) ? currentUser.projects : []);
    return clients.map((c) => ({
      ...c,
      projects: c.projects.filter((p) =>
        (assignedAll || ids.has(p.id)) &&
        Object.values((p.teamAccess || {})[currentUser?.id] || {}).some(Boolean)),
    })).filter((c) => c.projects.length > 0);
  }, [clients, isAdmin, currentUser]);

  const activeClient = visibleClients.find((c) => c.id === activeClientId) || visibleClients[0];
  const project = activeClient?.projects.find((p) => p.id === activeProjectId) || activeClient?.projects[0];
  /* per-section access for the active project: null = unrestricted (owner/admin) */
  const access = isAdmin ? null : (project?.teamAccess || {})[currentUser?.id] || {};
  const hasAccess = (k) => !access || !!access[k];
  const tracking = useMemo(() => (project ? project.tracking.map(hydrate) : []), [project?.tracking]);
  const trackedKeywords = useMemo(() => (project ? [...new Set(project.tracking.map((t) => t.keyword))] : []), [project?.tracking]);
  const monthKey = useMonthGrid();
  const data = useMemo(
    () => (project ? genSiteData(project, trackedKeywords, activeClient.companyName) : null),
    [project?.id, project?.name, trackedKeywords.join("|"), activeClient?.companyName, monthKey] // name is part of the generator seed; monthKey regenerates after a month rollover
  );
  const accent = project?.accent || "#1F2A44";
  const people = useMemo(() => {
    const team = (company.team || [])
      .filter((m) => m.projects === "all" || (Array.isArray(m.projects) && m.projects.includes(activeProjectId)))
      .map((m) => ({ name: m.name, type: "team" }));
    const cl = activeClient?.contact ? [{ name: activeClient.contact, type: "client" }] : [];
    return [...team, ...cl];
  }, [company.team, activeProjectId, activeClient?.contact]);
  const overdueTasks = (project?.records || []).reduce((n, r) => n + (r.completedAt ? 0 : (r.checklists || []).flatMap((c) => c.tasks).filter((t) => !t.completedAt && t.dueDate && t.dueDate < todayISO()).length), 0);

  /* white-label brand resolution: client view + reports show the
     client's brand when white label is on; otherwise SERP Squad */
  const wl = activeClient?.whiteLabel;
  const brand = clientView && wl?.enabled
    ? { name: wl.name || activeClient.companyName || activeClient.name, logo: wl.logo, website: wl.website, accent }
    : { name: company.name, logo: company.logo, website: "", accent: company.accent };

  const updateCompany = (patch) => setCompany((c) => ({ ...c, ...patch }));
  const updateClient = (cid, patch) => setClients((cs) => cs.map((c) => (c.id === cid ? { ...c, ...patch } : c)));
  // patch may be an object OR a function of the CURRENT project — use the functional
  // form from async callbacks (timeouts) so they never write a stale snapshot back
  const updateProject = (patch) =>
    setClients((cs) => cs.map((c) => c.id !== activeClientId ? c : {
      ...c, projects: c.projects.map((p) => (p.id === activeProjectId ? { ...p, ...(typeof patch === "function" ? patch(p) : patch) } : p)),
    }));
  const addTracking = (entries) => { updateProject({ tracking: [...project.tracking, ...entries] }); logActivity(`Added ${entries.length} keyword${entries.length > 1 ? "s" : ""}`, project?.name); };
  const deleteTracking = (id) => { updateProject({ tracking: project.tracking.filter((t) => t.id !== id) }); logActivity("Removed a tracked keyword", project?.name); };
  const applyRerun = (updates) => {
    updateProject({ tracking: project.tracking.map((t) => {
      const u = updates.find((x) => x.id === t.id);
      return u ? { ...t, extraPositions: [...(t.extraPositions || []), u.newPos] } : t;
    }) });
    logActivity(`Re-checked ${updates.length} keyword${updates.length > 1 ? "s" : ""}`, project?.name);
  };
  const toggleExpand = (cid) => setExpanded((s) => { const n = new Set(s); n.has(cid) ? n.delete(cid) : n.add(cid); return n; });
  const selectProject = (cid, pid) => {
    setActiveClientId(cid); setActiveProjectId(pid); setView("overview"); setSection("performance");
    const cl = clients.find((c) => c.id === cid); const pr = cl?.projects.find((p) => p.id === pid);
    if (pr) logActivity("Viewed project", `${pr.name} (${cl.name})`);
  };

  /* client portal session takes over the whole screen */
  if (session) {
    const sc = clients.find((c) => c.id === session.clientId);
    if (sc) return <ClientPortal client={sc} company={company} dark={dark} setDark={setDark}
      onUpdateProject={(pid, patch) => setClients((cs) => cs.map((c) => c.id !== sc.id ? c : { ...c, projects: c.projects.map((p) => (p.id === pid ? { ...p, ...(typeof patch === "function" ? patch(p) : patch) } : p)) }))}
      onLogout={() => { setSession(null); setScreen("app"); }} />;
  }
  if (screen === "company") {
    return <CompanyPage company={company} onChange={updateCompany} clients={clients} onBack={() => setScreen("app")} dark={dark} setDark={setDark} />;
  }
  if (screen === "login") {
    return <LoginScreen company={company} clients={clients} dark={dark}
      onLogin={(clientId) => { setSession({ clientId }); setScreen("app"); }}
      onTeamLogin={(memberId) => {
        setTeamSession({ memberId }); setScreen("app");
        setSection("performance"); setView("overview");
        const m = (company.team || []).find((x) => x.id === memberId);
        if (m && m.projects !== "all") {
          // land the member on their first assigned project
          for (const c of clients) {
            const p = c.projects.find((pp) => (m.projects || []).includes(pp.id));
            if (p) { setActiveClientId(c.id); setActiveProjectId(p.id); break; }
          }
        }
      }}
      onBack={() => setScreen("app")} />;
  }
  if (showReport && project && data) {
    const rwl = activeClient?.whiteLabel;
    const agencyBrand = { name: company.name, logo: company.logo, accent: company.accent };
    const wlBrand = rwl?.enabled
      ? { name: rwl.name || activeClient.companyName || activeClient.name, logo: rwl.logo, accent: project.accent }
      : null;
    const clientInfo = { companyName: activeClient?.companyName || activeClient?.name, address: activeClient?.address };
    const clientProjects = (activeClient?.projects || []).map((p) => {
      const tr = p.tracking.map(hydrate);
      const kws = [...new Set(p.tracking.map((t) => t.keyword))];
      return { project: p, tracking: tr, data: genSiteData(p, kws, activeClient.companyName) };
    });
    return <ReportBuilder project={project} data={data} tracking={tracking} clientProjects={clientProjects} records={project.records || []} template={showReport} agencyBrand={agencyBrand} wlBrand={wlBrand} clientInfo={clientInfo} defaultCmp={cmp} dark={dark} setDark={setDark} onClose={() => setShowReport(null)} />;
  }

  const visibleNav = NAV.filter((n) => {
    if (n.key !== "overview" && !hasAccess(n.key)) return false;
    if (n.key === "gbp") return project?.integrations.gbp;
    if (n.key === "web") return project?.integrations.ga || project?.integrations.gsc;
    return true;
  });
  const visibleSections = [
    ["performance", "Performance Studio", BarChart3],
    ["management", "Project Management", ListTodo],
    ["optimization", "Optimization Studio", Zap],
  ].filter(([key]) => {
    if (!access) return true;
    if (key === "management") return !!(access.records || access.wiki);
    if (key === "optimization") return ["ogbp", "webConnection", "webPages", "webPosts", "social"].some((k) => access[k]);
    return true; // performance always shows at least the Overview
  });
  /* never render a section/view the current user has no grant for on this project */
  const activeSection = visibleSections.some(([k]) => k === section) ? section : "performance";
  const activeView = visibleNav.some((n) => n.key === view) ? view : "overview";

  return (
    <div className={`ll-root ${dark ? "ll-dark" : ""} flex min-h-screen items-stretch bg-[#F5F6F8]`} style={{ "--accent": accent }}>
      <style>{FONT_CSS}</style>

      {/* Sidebar */}
      {!clientView && (
        <aside className="no-print sticky top-0 z-30 hidden h-screen w-64 shrink-0 flex-col self-start border-r border-gray-200 bg-white md:flex">
          <div className="flex items-center justify-between px-4 py-5">
            <div className="flex items-center gap-2">
              <BrandMark name={company.name} logo={company.logo} accent={company.accent} />
              <span className="ll-display text-[16px] font-bold tracking-tight">{company.name}</span>
            </div>
            {isAdmin && (
              <button onClick={() => { setScreen("company"); logActivity("Opened company settings"); }} title="Company settings"
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <Settings size={16} />
              </button>
            )}
          </div>
          <div className="px-4 pb-2 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Client projects</div>
          <div className="flex-1 overflow-y-auto px-2.5">
            {visibleClients.map((c) => {
              const open = expanded.has(c.id);
              return (
                <div key={c.id} className="mb-0.5">
                  <div className="group flex items-center gap-1 rounded-xl px-1.5 py-1.5 hover:bg-gray-50">
                    <button onClick={() => toggleExpand(c.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                      {open ? <ChevronDown size={13} className="shrink-0 text-gray-400" /> : <ChevronRight size={13} className="shrink-0 text-gray-400" />}
                      {open ? <FolderOpen size={15} className="shrink-0 text-amber-500" /> : <Folder size={15} className="shrink-0 text-amber-500" />}
                      <span className="truncate text-[13px] font-semibold text-gray-800">{c.name}</span>
                      {c.whiteLabel?.enabled && <span className="ml-1 shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-600">WL</span>}
                    </button>
                    {canClients && (
                      <button onClick={() => setModal({ type: "clientSettings", clientId: c.id })} title="Client settings"
                        className="rounded-md p-1 text-gray-300 opacity-0 hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100">
                        <Settings size={13} />
                      </button>
                    )}
                  </div>
                  {open && (
                    <div className="ml-5 border-l border-gray-100 pl-2">
                      {c.projects.length === 0 && <div className="px-2 py-1.5 text-[11.5px] text-gray-300">No projects yet</div>}
                      {c.projects.map((p) => (
                        <div key={p.id} className="group flex items-center gap-0.5 rounded-lg hover:bg-gray-50"
                          style={p.id === project?.id ? { background: p.accent + "12" } : {}}>
                          <button onClick={() => selectProject(c.id, p.id)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left">
                            <ProjectMark project={p} />
                            <span className="block min-w-0 truncate text-[12.5px] font-medium" style={{ color: p.id === project?.id ? p.accent : "#374151" }}>{p.name}</span>
                          </button>
                          {canClients && (
                            <button onClick={(e) => { e.stopPropagation(); setModal({ type: "projectSettings", clientId: c.id, projectId: p.id }); }}
                              title="Project settings" className="mr-1 shrink-0 rounded p-1 text-gray-300 opacity-0 hover:bg-gray-100 hover:text-gray-500 group-hover:opacity-100">
                              <Settings size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {canClients && (
            <div className="grid grid-cols-2 gap-2 p-3">
              <button onClick={() => setModal({ type: "addClient" })}
                className="flex items-center justify-center gap-1 rounded-xl border border-dashed border-gray-300 py-2 text-[12px] font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700">
                <Plus size={13} /> Add client
              </button>
              <button onClick={() => setModal({ type: "addProject" })}
                className="flex items-center justify-center gap-1 rounded-xl border border-dashed border-gray-300 py-2 text-[12px] font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700">
                <Plus size={13} /> Add project
              </button>
            </div>
          )}
          {teamSession && (
            <div className="flex items-center justify-between gap-2 border-t border-gray-100 p-3">
              <div className="min-w-0">
                <div className="truncate text-[12px] font-semibold text-gray-700">{currentUser?.name}</div>
                <div className="text-[10.5px] text-gray-400">{currentUser?.role} · {visibleClients.reduce((n, c) => n + c.projects.length, 0)} project(s)</div>
              </div>
              <button onClick={() => setTeamSession(null)} title="Sign out"
                className="shrink-0 rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:border-gray-300 hover:text-gray-600">
                <LogOut size={13} />
              </button>
            </div>
          )}
        </aside>
      )}

      {/* Main */}
      <main className="print-full min-w-0 flex-1">
        <div className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 px-5 py-3.5 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              {clientView
                ? <BrandMark name={brand.name} logo={brand.logo} accent={brand.accent} size="lg" />
                : (project && <ProjectMark project={project} size="md" />)}
              <div>
                {clientView && <div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">{brand.name}</div>}
                <div className="ll-display text-[17px] font-semibold leading-tight">{project?.name}</div>
                <div className="flex items-center gap-2 text-[11.5px] text-gray-400">
                  <Globe size={11} /> {project?.website}
                  {!clientView && <><span>·</span><Folder size={11} /> {activeClient?.name}</>}
                </div>
              </div>
            </div>
            <div className="no-print flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1">
                <span className="px-1.5 text-[11px] font-medium text-gray-400">Compare vs</span>
                {[1, 3, 6, 12].map((m) => (
                  <button key={m} onClick={() => setCmp(m)} className="ll-mono rounded-lg px-2 py-1 text-[12px] font-semibold"
                    style={cmp === m ? { background: accent, color: "#fff" } : { color: "var(--chip-fg, #6B7280)" }}>
                    {m}mo
                  </button>
                ))}
                <select value={cmp} onChange={(e) => setCmp(+e.target.value)} className="ll-mono rounded-lg border-0 bg-transparent py-1 pl-1 pr-1 text-[12px] font-semibold text-gray-500">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m} mo</option>)}
                </select>
              </div>
              <button onClick={() => setClientView((v) => !v)}
                className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-medium"
                style={clientView ? { background: accent, borderColor: accent, color: "#fff" } : { borderColor: "#E5E7EB", color: "var(--chip-fg, #4B5563)", background: "var(--chip-bg, #fff)" }}>
                <Users size={14} /> Client view
              </button>
              {canReports && (
                <button onClick={() => setModal({ type: "reportChoice" })} className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] font-medium text-gray-600 hover:border-gray-300">
                  <FileTextIcon size={14} /> Report
                </button>
              )}
              <DarkToggle dark={dark} setDark={setDark} />
              {!clientView && (
                <button onClick={() => setScreen("login")} title="The login your clients use from your main website"
                  className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] font-medium text-gray-600 hover:border-gray-300">
                  <LogIn size={14} /> Client login
                </button>
              )}
            </div>
          </div>
          <div className="no-print mt-3 flex gap-1.5">
            {visibleSections.map(([key, label, Icon]) => (
              <button key={key} onClick={() => setSection(key)}
                className="flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-semibold"
                style={activeSection === key ? { background: accent, borderColor: accent, color: "#fff" } : { borderColor: "#E5E7EB", color: "var(--chip-fg, #4B5563)", background: "var(--chip-bg, #fff)" }}>
                <Icon size={14} /> {label}
                {key === "management" && overdueTasks > 0 && (
                  <span className="ll-mono rounded-full px-1.5 text-[10px] font-bold"
                    style={activeSection === key ? { background: "rgba(255,255,255,.25)", color: "#fff" } : { background: "#FEE2E2", color: "#991B1B" }}>
                    {overdueTasks}
                  </span>
                )}
              </button>
            ))}
          </div>
          {activeSection === "performance" && (
          <div className="no-print mt-2 flex flex-wrap gap-1">
            {visibleNav.map((n) => (
              <button key={n.key} onClick={() => setView(n.key)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium"
                style={activeView === n.key ? { background: accent + "14", color: accent } : { color: "var(--chip-fg, #6B7280)" }}>
                <n.icon size={14} /> {n.label}
              </button>
            ))}
          </div>
          )}
        </div>

        <div className="mx-auto max-w-6xl p-5">
          {project && activeSection === "optimization" && (
            <OptimizationView project={project} accent={accent} onUpdate={updateProject} log={logActivity} />
          )}
          {project && activeSection === "management" && (
            <ProjectManagementView project={project} people={people}
              perms={pmPerms}
              currentUser={currentUser?.name || "You (Owner)"} accent={accent} onUpdate={updateProject} log={logActivity} />
          )}
          {project && data && activeSection === "performance" && (
            <>
              {activeView === "overview" && <OverviewView project={project} data={data} tracking={tracking} cmp={cmp} accent={accent} clientView={clientView} />}
              {activeView === "ranks" && <RankTrackingView project={project} tracking={tracking} dfsConnected={company.dfs.connected} accent={accent} onAdd={addTracking} onDelete={deleteTracking} onRerun={applyRerun} readOnly={!canKeywords} />}
              {activeView === "gbp" && project.integrations.gbp && <GbpView project={project} data={data} range={range} setRange={setRange} accent={accent} />}
              {activeView === "web" && <WebsitePerformanceView project={project} data={data} range={range} setRange={setRange} accent={accent} />}
            </>
          )}
          <div className="mt-8 flex items-center justify-between border-t border-gray-200 pt-4 text-[11px] text-gray-400">
            <span>{brand.name} · report for {project?.name}</span>
            <span>{clientView && wl?.enabled ? (brand.website || "") : "Google Business Profile · GA4 · Search Console · DataForSEO (demo)"}</span>
          </div>
        </div>
      </main>

      {modal?.type === "projectSettings" && (() => {
        const mc = clients.find((c) => c.id === modal.clientId);
        const mp = mc?.projects.find((p) => p.id === modal.projectId);
        if (!mc || !mp) return null;
        return (
          <ProjectSettingsModal client={mc} project={mp} company={company} accent={mp.accent} dfsConnected={company.dfs.connected}
            onUpdateProject={(patch) => setClients((cs) => cs.map((c) => c.id !== mc.id ? c : { ...c, projects: c.projects.map((p) => (p.id === mp.id ? { ...p, ...(typeof patch === "function" ? patch(p) : patch) } : p)) }))}
            onUpdateClient={(patch) => setClients((cs) => cs.map((c) => (c.id === mc.id ? { ...c, ...patch } : c)))}
            onClose={() => setModal(null)} />
        );
      })()}
      {modal?.type === "clientSettings" && (
        <ClientSettingsModal client={clients.find((c) => c.id === modal.clientId)} onChange={(patch) => updateClient(modal.clientId, patch)} onClose={() => setModal(null)} />
      )}
      {modal?.type === "reportChoice" && (
        <Modal title="Create a report" onClose={() => setModal(null)}>
          <p className="mb-3 text-[12.5px] text-gray-400">Choose what kind of report to build for <b className="text-gray-600">{project?.name}</b>.</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {[
              { key: "performance", icon: BarChart3, title: "Performance report", desc: "Rankings, GBP, traffic & search data — charts, KPI cards and tables." },
              { key: "work", icon: ListTodo, title: "Work report", desc: "Records, checklists and tasks from Project Management — what was done and when." },
            ].map((o) => (
              <button key={o.key}
                onClick={() => { setModal(null); setShowReport(o.key); logActivity(`Opened ${o.title.toLowerCase()} builder`, project?.name); }}
                className="rounded-2xl border border-gray-200 p-4 text-left hover:border-gray-300 hover:shadow-sm">
                <o.icon size={20} style={{ color: accent }} />
                <div className="ll-display mt-2 text-[14px] font-semibold">{o.title}</div>
                <div className="mt-1 text-[11.5px] leading-relaxed text-gray-400">{o.desc}</div>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {modal?.type === "addClient" && (
        <AddClientModal onClose={() => setModal(null)}
          onAdd={(c) => { setClients((cs) => [...cs, c]); setExpanded((s) => new Set(s).add(c.id)); setModal({ type: "addProject", clientId: c.id }); }} />
      )}
      {modal?.type === "addProject" && (
        <AddProjectModal clients={clients} defaultClientId={modal.clientId || activeClientId} onClose={() => setModal(null)}
          onAdd={(cid, p) => {
            setClients((cs) => cs.map((c) => (c.id === cid ? { ...c, projects: [...c.projects, p] } : c)));
            setExpanded((s) => new Set(s).add(cid));
            setActiveClientId(cid); setActiveProjectId(p.id); setView("ranks"); setModal(null);
          }} />
      )}
    </div>
  );
}
