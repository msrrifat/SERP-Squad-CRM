import React, { useMemo, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  ArrowLeft, ChevronDown, ChevronRight, Copy, Megaphone, Pause, Play, Plus,
  Rocket, Sparkles, Target, Trash2, Wand2, X,
} from "lucide-react";
import { Card, GuideTip, Labeled, Modal, Seg, inputCls, tooltipStyle } from "../../ui/primitives.jsx";
import { API_GUIDES } from "../../data/apiGuides.js";
import { fmt, uid } from "../../lib/format.jsx";
import { hashStr, mulberry32 } from "../../lib/rng.js";

/* =====================================================================
   ADS & PAID MARKETING — GoHighLevel-style unified ad manager.
   Campaigns + Statistics tabs, wizard-based launch, AI copy & pitch.
   HONESTY MODEL (same as the rest of the CRM): account connections,
   metrics pulls and campaign publishing go through the API server's
   real provider calls (/api/ads/*) — without credentials the server
   returns 503 and everything here runs in clearly-labeled Demo mode
   with deterministic numbers. Nothing fabricates "live" data.
   ===================================================================== */

export const AD_PLATFORMS = {
  meta: { label: "Meta Ads", short: "f", color: "#1877F2", apiId: "metaAds",
    sub: "Facebook & Instagram", objectives: ["Leads", "Traffic", "Sales", "Awareness", "Engagement"], cpmRange: [8, 22], ctrRange: [0.9, 2.2], convRange: [4, 10] },
  google: { label: "Google Ads", short: "G", color: "#4285F4", apiId: "googleAds",
    sub: "Search · PMax · Display · YouTube · LSA", objectives: ["Search — Leads", "Performance Max", "Local Services", "Display", "YouTube"], cpmRange: [18, 45], ctrRange: [2.5, 6.5], convRange: [6, 14] },
  tiktok: { label: "TikTok Ads", short: "T", color: "#111827", apiId: "tiktokAds",
    sub: "In-feed video & Spark Ads", objectives: ["Traffic", "Leads", "Video views", "Community interaction"], cpmRange: [4, 12], ctrRange: [0.6, 1.6], convRange: [2, 6] },
  reddit: { label: "Reddit Ads", short: "R", color: "#FF4500", apiId: "redditAds",
    sub: "Promoted posts & conversations", objectives: ["Traffic", "Conversions", "Brand awareness"], cpmRange: [3, 9], ctrRange: [0.4, 1.2], convRange: [2, 5] },
  nextdoor: { label: "Nextdoor Ads", short: "N", color: "#8ED500", apiId: "nextdoorAds",
    sub: "Neighborhood sponsored posts", objectives: ["Local awareness", "Leads", "Traffic"], cpmRange: [10, 25], ctrRange: [0.8, 2.0], convRange: [5, 12] },
  yelp: { label: "Yelp Ads", short: "Y", color: "#D32323", apiId: "yelpAds",
    sub: "Boosted listing (CPC program)", objectives: ["Listing clicks", "Calls", "Directions"], cpmRange: [25, 60], ctrRange: [2.0, 5.0], convRange: [8, 18] },
};
const PF_KEYS = Object.keys(AD_PLATFORMS);

/* ---- real brand marks (inline SVG — self-contained, no external assets) ---- */
const PF_ICONS = {
  meta: (s) => (
    <svg viewBox="0 0 24 24" width={s} height={s} aria-label="Meta">
      <path fill="#0081FB" d="M6.6 6.6c-2.7 0-4.7 3-4.7 6.2 0 2.3 1.1 4 3 4 1.3 0 2.2-.7 3.8-3.2l1.3-2 .1-.2.2.3 1.2 2c1.5 2.3 2.5 3.1 3.9 3.1 1.9 0 3.1-1.7 3.1-4.3 0-3.4-2-5.9-4.4-5.9-1.4 0-2.5.8-3.8 2.4-1-1.5-2.1-2.4-3.7-2.4Zm-.1 2.3c.9 0 1.6.6 2.6 2.2l-1.2 1.9c-1.1 1.7-1.6 2.2-2.4 2.2-.8 0-1.4-.8-1.4-2.1 0-2.4 1.2-4.2 2.4-4.2Zm7.5 0c1.3 0 2.3 1.6 2.3 3.7 0 1.4-.4 2.2-1.2 2.2-.7 0-1.1-.5-2.4-2.4l-1-1.6c1-1.3 1.6-1.9 2.3-1.9Z"/>
    </svg>
  ),
  google: (s) => (
    <svg viewBox="0 0 24 24" width={s} height={s} aria-label="Google Ads">
      <rect x="10.1" y="2.6" width="4.4" height="15.6" rx="2.2" fill="#FBBC04" transform="rotate(30 12.3 10.4)" />
      <rect x="10.1" y="2.6" width="4.4" height="15.6" rx="2.2" fill="#4285F4" transform="rotate(-30 12.3 10.4)" />
      <circle cx="5.55" cy="18.1" r="2.75" fill="#34A853" />
    </svg>
  ),
  tiktok: (s) => (
    <svg viewBox="0 0 24 24" width={s} height={s} aria-label="TikTok">
      <path fill="#25F4EE" d="M15.7 5.5A4.3 4.3 0 0 1 14.6 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.8 5.8 0 0 0-.8 0 5.7 5.7 0 1 0 5.7 5.6V8.9a7.3 7.3 0 0 0 4.3 1.4V7.2a4.3 4.3 0 0 1-3.2-1.7Z" transform="translate(-0.7 0)"/>
      <path fill="#FE2C55" d="M15.7 5.5A4.3 4.3 0 0 1 14.6 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.8 5.8 0 0 0-.8 0 5.7 5.7 0 1 0 5.7 5.6V8.9a7.3 7.3 0 0 0 4.3 1.4V7.2a4.3 4.3 0 0 1-3.2-1.7Z" transform="translate(0.7 0.8)"/>
      <path fill="#111111" d="M15.7 5.5A4.3 4.3 0 0 1 14.6 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.8 5.8 0 0 0-.8 0 5.7 5.7 0 1 0 5.7 5.6V8.9a7.3 7.3 0 0 0 4.3 1.4V7.2a4.3 4.3 0 0 1-3.2-1.7Z"/>
    </svg>
  ),
  reddit: (s) => (
    <svg viewBox="0 0 24 24" width={s} height={s} aria-label="Reddit">
      <circle cx="12" cy="12" r="11" fill="#FF4500" />
      <circle cx="15.3" cy="4.9" r="1.3" fill="#fff" />
      <path stroke="#fff" strokeWidth="1" fill="none" d="M12.2 8.2 13.4 5" />
      <circle cx="5.6" cy="11.4" r="1.9" fill="#fff" />
      <circle cx="18.4" cy="11.4" r="1.9" fill="#fff" />
      <ellipse cx="12" cy="13.6" rx="6.3" ry="4.6" fill="#fff" />
      <circle cx="9.5" cy="12.8" r="1.15" fill="#FF4500" />
      <circle cx="14.5" cy="12.8" r="1.15" fill="#FF4500" />
      <path d="M9.4 15.6c.8.75 1.6 1.1 2.6 1.1s1.8-.35 2.6-1.1" stroke="#FF4500" strokeWidth="1" fill="none" strokeLinecap="round" />
    </svg>
  ),
  nextdoor: (s) => (
    <svg viewBox="0 0 24 24" width={s} height={s} aria-label="Nextdoor">
      <rect width="24" height="24" rx="6" fill="#8ED500" />
      <path fill="#fff" d="M6.5 17.5v-6.2C6.5 8.4 8.9 6.3 12 6.3s5.5 2.1 5.5 5v6.2h-3.1v-5.9c0-1.3-1-2.2-2.4-2.2s-2.4.9-2.4 2.2v5.9H6.5Z" />
      <path fill="#8ED500" d="M8.2 10.9c-1-.2-1.7-.9-1.9-2l2.6-1c.3.9.2 1.9-.7 3Z" opacity=".35" />
    </svg>
  ),
  yelp: (s) => (
    <svg viewBox="0 0 24 24" width={s} height={s} aria-label="Yelp">
      <g fill="#D32323">
        <path d="M10.9 2.6c.5-.9 1.9-.7 2.1.3l1 4.9c.2 1-.9 1.7-1.7 1.1L8.6 6.1c-.8-.6-.6-1.8.3-2.1l2-.7v-.7Z" transform="rotate(8 12 12)" />
        <path d="M12 2.2c.7 0 1.2.5 1.2 1.2v6.2c0 1-1.2 1.5-1.9.8L7.6 6.7c-.7-.7-.4-1.9.5-2.2L12 2.2Z" opacity="0" />
        <path d="M11.2 2.3c0-.9 1.6-1.1 1.9-.2l1.5 5.4c.3.9-.8 1.7-1.6 1.1l-2.5-2c-.7-.6-.6-1.7.2-2.1l.5-.3V2.3Z" opacity="0" />
        <path d="M12.5 3.1v6.4c0 .9-1.1 1.4-1.8.8l-2-1.8c-.7-.6-.5-1.7.3-2.1l2.4-3.6c.4-.6 1.1-.3 1.1.3Z" />
        <path d="M15.1 12.9l4.6-1.5c.9-.3 1.7.7 1.2 1.5l-1.3 2.1c-.4.7-1.4.8-1.9.2l-2.7-1.3c-.4-.4-.4-.9.1-1Z" />
        <path d="M14.9 15.2l3.5 3.3c.7.6.3 1.8-.6 1.9l-2.4.3c-.8.1-1.5-.6-1.4-1.4l.1-3.5c0-.6.5-.9.8-.6Z" />
        <path d="M12.9 16.4l-.4 4.8c-.1.9-1.3 1.2-1.8.4l-1.3-2.1c-.4-.7-.1-1.6.7-1.9l2-1.7c.4-.2.9.1.8.5Z" />
        <path d="M9.9 14.3l-4.4 2c-.8.4-1.7-.4-1.4-1.3l.8-2.3c.3-.8 1.2-1.1 1.9-.6l3 1.2c.4.3.4.9.1 1Z" />
      </g>
    </svg>
  ),
};

export const PfBadge = ({ pf, size = 22 }) => (
  <span className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-100 bg-white"
    style={{ width: size, height: size }}>
    {PF_ICONS[pf](Math.round(size * 0.78))}
  </span>
);

/* ---- deterministic demo metrics: daily rows per campaign, seeded by id ---- */
const MS = 864e5;
export const campaignDaily = (c) => {
  const meta = AD_PLATFORMS[c.platform];
  const start = new Date(new Date(c.launchedAt || c.createdAt).toDateString()).getTime();
  const endTs = c.status === "ended" && c.endedAt ? c.endedAt : Date.now();
  const days = Math.max(1, Math.min(120, Math.floor((endTs - start) / MS) + 1));
  const r = mulberry32(hashStr(c.id + c.platform + c.name));
  const rng = (lo, hi) => lo + r() * (hi - lo);
  const cpm = rng(meta.cpmRange[0], meta.cpmRange[1]);
  const ctr = rng(meta.ctrRange[0], meta.ctrRange[1]) / 100;
  const convRate = rng(meta.convRange[0], meta.convRange[1]) / 100;
  const daily = c.budgetType === "daily" ? c.budget : c.budget / Math.max(1, days);
  const out = [];
  for (let i = 0; i < days; i++) {
    const rd = mulberry32(hashStr(c.id + "|" + i));
    const paused = c.status === "paused" && i >= days - 3; // last days flat when paused
    const learn = Math.min(1, 0.45 + i * 0.09);            // learning-phase ramp
    const spend = paused ? 0 : +(daily * learn * (0.82 + rd() * 0.3)).toFixed(2);
    const impressions = Math.round((spend / cpm) * 1000);
    const clicks = Math.round(impressions * ctr * (0.85 + rd() * 0.3));
    const conversions = Math.round(clicks * convRate * (0.75 + rd() * 0.5));
    out.push({ t: start + i * MS, spend, impressions, clicks, conversions });
  }
  return out;
};
export const sumMetrics = (rows) => {
  const s = rows.reduce((a, d) => ({ spend: a.spend + d.spend, impressions: a.impressions + d.impressions, clicks: a.clicks + d.clicks, conversions: a.conversions + d.conversions }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0 });
  return {
    ...s,
    ctr: s.impressions ? (s.clicks / s.impressions) * 100 : 0,
    cpc: s.clicks ? s.spend / s.clicks : 0,
    cpm: s.impressions ? (s.spend / s.impressions) * 1000 : 0,
    cpl: s.conversions ? s.spend / s.conversions : 0,
  };
};
const money = (v) => "$" + (v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(v < 10 ? 2 : 0));

/* ---- AI plumbing (same contract as the Website Architect) ---- */
async function aiGenerate(ai, { system, prompt, json = false, maxTokens = 1200 }) {
  if (!ai?.key) { const e = new Error("no AI provider configured"); e.code = 503; throw e; }
  const res = await fetch("/api/generate", {
    method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(240000),
    body: JSON.stringify({ provider: ai.provider, apiKey: ai.key, model: ai.model, system, prompt, json, maxTokens }),
  });
  if (res.ok) return (await res.json()).text;
  const err = await res.json().catch(() => ({}));
  const e = new Error(err.detail || err.error || `HTTP ${res.status}`); e.code = res.status; throw e;
}
const parseJson = (t) => { try { return JSON.parse(t.replace(/^[^{[]*/, "").replace(/[^}\]]*$/, "")); } catch { return null; } };

/* deterministic local ad-copy draft — used ONLY when no AI key (labeled) */
const localCopy = (c, project, brand) => {
  const svc = (c.objective || "").toLowerCase().includes("call") ? "Call us today" : "Book online in 60 seconds";
  return {
    headline: `${brand || project.name} — ${c.objective || "Special Offer"}`.slice(0, 40),
    primaryText: `Looking for a trusted local ${brand ? "" : "business "}team? ${brand || project.name} is rated ★★★★★ by your neighbors. Limited-time offer for new customers — ${svc.toLowerCase()}.`,
    description: "Trusted local experts · Fast appointments",
    cta: c.objective?.includes("Call") ? "Call now" : "Learn more",
  };
};

const STATUS_CHIP = {
  active: { bg: "#DCFCE7", fg: "#166534", label: "Active" },
  paused: { bg: "#FEF3C7", fg: "#92400E", label: "Paused" },
  draft: { bg: "#F1F5F9", fg: "#475569", label: "Draft" },
  ended: { bg: "#E5E7EB", fg: "#374151", label: "Ended" },
};

export function AdsView({ project, accent, onUpdate, log, company, aiConfig }) {
  const ads = project.ads || { accounts: {}, campaigns: [] };
  const patchAds = (p) => onUpdate((proj) => ({ ads: { ...(proj.ads || { accounts: {}, campaigns: [] }), ...(typeof p === "function" ? p(proj.ads || { accounts: {}, campaigns: [] }) : p) } }));
  const patchCampaign = (id, p) => patchAds((cur) => ({ campaigns: cur.campaigns.map((c) => (c.id === id ? { ...c, ...p } : c)) }));

  const [tab, setTab] = useState("campaigns");           // campaigns | statistics
  const [rangeDays, setRangeDays] = useState(30);
  const [pfFilter, setPfFilter] = useState("all");
  const [connecting, setConnecting] = useState(null);    // platform key
  const [wizard, setWizard] = useState(null);            // campaign draft being built
  const [pitch, setPitch] = useState(null);              // pitch modal state

  const campaigns = ads.campaigns || [];
  const from = Date.now() - rangeDays * MS;
  const inRange = (rows) => rows.filter((d) => d.t >= from);
  const visible = campaigns.filter((c) => pfFilter === "all" || c.platform === pfFilter);
  const totals = sumMetrics(visible.filter((c) => c.status !== "draft").flatMap((c) => inRange(campaignDaily(c))));
  const anyDemo = visible.some((c) => c.demo !== false);

  /* daily series for the charts (sum across campaigns) */
  const chartRows = useMemo(() => {
    const byDay = {};
    visible.filter((c) => c.status !== "draft").forEach((c) => inRange(campaignDaily(c)).forEach((d) => {
      const k = d.t; byDay[k] = byDay[k] || { t: k, Spend: 0, Clicks: 0, Conversions: 0 };
      byDay[k].Spend = +(byDay[k].Spend + d.spend).toFixed(2); byDay[k].Clicks += d.clicks; byDay[k].Conversions += d.conversions;
    }));
    return Object.values(byDay).sort((a, b) => a.t - b.t)
      .map((d) => ({ ...d, label: new Date(d.t).toLocaleDateString("en", { month: "short", day: "numeric" }) }));
  }, [campaigns, rangeDays, pfFilter]); // eslint-disable-line
  const spendByPf = PF_KEYS.map((k) => ({
    name: AD_PLATFORMS[k].label, key: k,
    value: +sumMetrics(campaigns.filter((c) => c.platform === k && c.status !== "draft").flatMap((c) => inRange(campaignDaily(c)))).spend.toFixed(0),
  })).filter((x) => x.value > 0);

  const kpis = [
    ["Spend", money(totals.spend)], ["Impressions", fmt(totals.impressions)], ["Clicks", fmt(totals.clicks)],
    ["CTR", totals.ctr.toFixed(2) + "%"], ["Avg CPC", money(totals.cpc)], ["CPM", money(totals.cpm)],
    ["Conversions", fmt(totals.conversions)], ["Cost / conv.", totals.conversions ? money(totals.cpl) : "—"],
  ];

  return (
    <div className="ll-fade space-y-4">
      {/* header: platform connections */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="ll-display flex items-center gap-2 text-[16px] font-semibold"><Megaphone size={16} style={{ color: accent }} /> Ads & Paid Marketing</div>
            <div className="mt-0.5 text-[11.5px] text-gray-400">One dashboard for every paid channel — connect accounts, launch campaigns with AI, monitor everything.</div>
          </div>
          <button onClick={() => setPitch({ step: "form", goal: "More booked appointments", budget: 1500 })}
            className="flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold" style={{ borderColor: accent, color: accent }}>
            <Sparkles size={13} /> AI ads pitch
          </button>
          <button onClick={() => setWizard(blankCampaign(project))}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12.5px] font-semibold text-white" style={{ background: accent }}>
            <Plus size={14} /> Create campaign
          </button>
        </div>
        <div className="mt-3 grid gap-1.5 sm:grid-cols-3 xl:grid-cols-6">
          {PF_KEYS.map((k) => {
            const acc = ads.accounts?.[k];
            return (
              <button key={k} onClick={() => setConnecting(k)}
                className="flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left"
                style={acc?.connected ? { borderColor: AD_PLATFORMS[k].color + "55", background: AD_PLATFORMS[k].color + "0A" } : { borderColor: "#E5E7EB" }}>
                <PfBadge pf={k} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11.5px] font-bold text-gray-800">{AD_PLATFORMS[k].label}</span>
                  <span className="block truncate text-[9px] text-gray-400">{acc?.connected ? acc.name : AD_PLATFORMS[k].sub}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {acc?.connected && acc.demo && <span className="rounded bg-amber-100 px-1 py-px text-[7.5px] font-bold uppercase text-amber-700">demo</span>}
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: acc?.connected ? "#22C55E" : "#D6DAE1" }} />
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2">
        {[["campaigns", "Campaigns"], ["statistics", "Statistics"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className="rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold"
            style={tab === k ? { background: accent + "10", borderColor: accent, color: accent } : { background: "var(--chip-bg, #fff)", borderColor: "#E5E7EB", color: "var(--chip-fg, #4B5563)" }}>{l}</button>
        ))}
        <div className="ml-auto flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setRangeDays(d)} className="ll-mono rounded-lg px-2 py-1 text-[11.5px] font-semibold"
              style={rangeDays === d ? { background: accent, color: "#fff" } : { color: "var(--chip-fg, #6B7280)" }}>{d}d</button>
          ))}
        </div>
        <select value={pfFilter} onChange={(e) => setPfFilter(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-[12px] font-semibold text-gray-600">
          <option value="all">All platforms</option>
          {PF_KEYS.map((k) => <option key={k} value={k}>{AD_PLATFORMS[k].label}</option>)}
        </select>
      </div>

      {anyDemo && campaigns.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-800">
          <b>Demo numbers.</b> Campaigns publish & pull real metrics once the platform credentials are added in Company Settings → API settings (server refuses to fabricate live data).
        </div>
      )}

      {/* conversion summary — the GHL stat set */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {kpis.map(([label, v]) => (
          <Card key={label} className="p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
            <div className="ll-display mt-0.5 text-[20px] font-semibold tracking-tight">{v}</div>
          </Card>
        ))}
      </div>

      {tab === "statistics" && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="p-4 xl:col-span-2">
            <div className="ll-display mb-3 text-[14px] font-semibold">Spend & results — last {rangeDays} days</div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartRows} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area yAxisId="l" type="monotone" dataKey="Spend" stroke={accent} fill={accent} fillOpacity={0.15} strokeWidth={2.2} />
                <Area yAxisId="r" type="monotone" dataKey="Clicks" stroke="#0EA5E9" fill="#0EA5E9" fillOpacity={0.08} strokeWidth={2} />
                <Area yAxisId="r" type="monotone" dataKey="Conversions" stroke="#16A34A" fill="#16A34A" fillOpacity={0.08} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
          <Card className="p-4">
            <div className="ll-display mb-3 text-[14px] font-semibold">Spend by platform</div>
            {spendByPf.length === 0 ? <div className="py-12 text-center text-[12px] text-gray-300">No spend in range.</div> : (
              <>
                <ResponsiveContainer width="100%" height={190}>
                  <PieChart>
                    <Pie data={spendByPf} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                      {spendByPf.map((x) => <Cell key={x.key} fill={AD_PLATFORMS[x.key].color} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1">
                  {spendByPf.map((x) => (
                    <div key={x.key} className="flex items-center gap-2 text-[11.5px] text-gray-600">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: AD_PLATFORMS[x.key].color }} />
                      {x.name}<span className="ll-mono ml-auto font-semibold">{money(x.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {/* campaigns table */}
      {tab === "campaigns" && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[880px] text-[12px]">
            <thead><tr className="border-b border-gray-100">
              {["Campaign", "Status", "Budget", "Spend", "Impr.", "Clicks", "CTR", "CPC", "Conv.", "Cost/conv.", ""].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-[9px] font-semibold uppercase tracking-wider text-gray-400">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {visible.map((c) => {
                const m = sumMetrics(inRange(campaignDaily(c)));
                const chip = STATUS_CHIP[c.status] || STATUS_CHIP.draft;
                return (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <PfBadge pf={c.platform} />
                        <div className="min-w-0">
                          <button onClick={() => setWizard({ ...c, step: 4, editing: true })} className="block max-w-56 truncate text-left text-[12.5px] font-semibold text-gray-800 hover:underline">{c.name}</button>
                          <div className="text-[9.5px] text-gray-400">{c.objective}{c.demo !== false && <span className="ml-1.5 rounded bg-amber-100 px-1 py-px text-[7.5px] font-bold uppercase text-amber-700">demo</span>}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5"><span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: chip.bg, color: chip.fg }}>{chip.label}</span></td>
                    <td className="ll-mono px-3 py-2.5">{money(c.budget)}<span className="text-[9px] text-gray-400">/{c.budgetType === "daily" ? "day" : "total"}</span></td>
                    <td className="ll-mono px-3 py-2.5 font-semibold">{c.status === "draft" ? "—" : money(m.spend)}</td>
                    <td className="ll-mono px-3 py-2.5">{c.status === "draft" ? "—" : fmt(m.impressions)}</td>
                    <td className="ll-mono px-3 py-2.5">{c.status === "draft" ? "—" : fmt(m.clicks)}</td>
                    <td className="ll-mono px-3 py-2.5">{c.status === "draft" ? "—" : m.ctr.toFixed(2) + "%"}</td>
                    <td className="ll-mono px-3 py-2.5">{c.status === "draft" ? "—" : money(m.cpc)}</td>
                    <td className="ll-mono px-3 py-2.5">{c.status === "draft" ? "—" : fmt(m.conversions)}</td>
                    <td className="ll-mono px-3 py-2.5">{c.status === "draft" || !m.conversions ? "—" : money(m.cpl)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {c.status !== "draft" && c.status !== "ended" && (
                          <button title={c.status === "active" ? "Pause campaign" : "Resume campaign"}
                            onClick={() => { patchCampaign(c.id, { status: c.status === "active" ? "paused" : "active" }); log?.(c.status === "active" ? "Paused ad campaign" : "Resumed ad campaign", c.name); }}
                            className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:text-gray-700">
                            {c.status === "active" ? <Pause size={11} /> : <Play size={11} />}
                          </button>
                        )}
                        {c.status === "draft" && (
                          <button title="Continue setup" onClick={() => setWizard({ ...c, step: 1, editing: true })}
                            className="rounded-lg px-2 py-1 text-[10px] font-bold text-white" style={{ background: accent }}>Finish</button>
                        )}
                        <button title="Duplicate" onClick={() => patchAds((cur) => ({ campaigns: [{ ...c, id: uid(), name: c.name + " (copy)", status: "draft", createdAt: Date.now(), launchedAt: null }, ...cur.campaigns] }))}
                          className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:text-gray-700"><Copy size={11} /></button>
                        <button title="Delete" onClick={() => confirm(`Delete campaign "${c.name}"?`) && patchAds((cur) => ({ campaigns: cur.campaigns.filter((x) => x.id !== c.id) }))}
                          className="rounded-lg border border-gray-200 p-1.5 text-gray-300 hover:text-red-500"><Trash2 size={11} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visible.length === 0 && (
            <div className="p-10 text-center text-[12.5px] text-gray-400">No campaigns yet — hit <b>Create campaign</b> to launch your first ad in a few guided steps.</div>
          )}
        </Card>
      )}

      {connecting && (
        <ConnectAdsModal platform={connecting} project={project} company={company} accent={accent}
          current={ads.accounts?.[connecting]}
          onConnect={(acct) => { patchAds((cur) => ({ accounts: { ...(cur.accounts || {}), [connecting]: acct } })); setConnecting(null); log?.(`Connected ${AD_PLATFORMS[connecting].label}`, acct.name); }}
          onDisconnect={() => { patchAds((cur) => ({ accounts: { ...(cur.accounts || {}), [connecting]: null } })); setConnecting(null); }}
          onClose={() => setConnecting(null)} />
      )}
      {wizard && (
        <CampaignWizard draft={wizard} setDraft={setWizard} project={project} accent={accent} aiConfig={aiConfig} accounts={ads.accounts || {}}
          onSave={(c, launch) => {
            const final = { ...c, status: launch ? "active" : "draft", launchedAt: launch ? (c.launchedAt || Date.now()) : c.launchedAt };
            delete final.step; delete final.editing;
            patchAds((cur) => ({ campaigns: cur.campaigns.some((x) => x.id === c.id) ? cur.campaigns.map((x) => (x.id === c.id ? final : x)) : [final, ...cur.campaigns] }));
            log?.(launch ? "Launched ad campaign" : "Saved ad campaign draft", c.name);
            setWizard(null);
          }}
          onClose={() => setWizard(null)} />
      )}
      {pitch && <PitchModal state={pitch} setState={setPitch} project={project} accent={accent} aiConfig={aiConfig} campaigns={campaigns} onClose={() => setPitch(null)} />}
    </div>
  );
}

/* =====================================================================
   Ads Performance — READ-ONLY stats view for Performance Studio (nav item
   after GBP Rank Tracking). Same data/metrics as the manager; campaign
   management stays in Ads & Paid Marketing.
   ===================================================================== */
export function AdsPerformanceView({ project, accent }) {
  const ads = project.ads || { accounts: {}, campaigns: [] };
  const [rangeDays, setRangeDays] = useState(30);
  const [pfFilter, setPfFilter] = useState("all");
  const campaigns = (ads.campaigns || []).filter((c) => c.status !== "draft");
  const from = Date.now() - rangeDays * MS;
  const inRange = (rows) => rows.filter((d) => d.t >= from);
  const visible = campaigns.filter((c) => pfFilter === "all" || c.platform === pfFilter);
  const totals = sumMetrics(visible.flatMap((c) => inRange(campaignDaily(c))));
  const anyDemo = visible.some((c) => c.demo !== false);
  const chartRows = useMemo(() => {
    const byDay = {};
    visible.forEach((c) => inRange(campaignDaily(c)).forEach((d) => {
      byDay[d.t] = byDay[d.t] || { t: d.t, Spend: 0, Clicks: 0, Conversions: 0 };
      byDay[d.t].Spend = +(byDay[d.t].Spend + d.spend).toFixed(2); byDay[d.t].Clicks += d.clicks; byDay[d.t].Conversions += d.conversions;
    }));
    return Object.values(byDay).sort((a, b) => a.t - b.t).map((d) => ({ ...d, label: new Date(d.t).toLocaleDateString("en", { month: "short", day: "numeric" }) }));
  }, [project.ads, rangeDays, pfFilter]); // eslint-disable-line
  const spendByPf = PF_KEYS.map((k) => ({
    name: AD_PLATFORMS[k].label, key: k,
    value: +sumMetrics(campaigns.filter((c) => c.platform === k).flatMap((c) => inRange(campaignDaily(c)))).spend.toFixed(0),
  })).filter((x) => x.value > 0);
  const kpis = [
    ["Spend", money(totals.spend)], ["Impressions", fmt(totals.impressions)], ["Clicks", fmt(totals.clicks)],
    ["CTR", totals.ctr.toFixed(2) + "%"], ["Avg CPC", money(totals.cpc)], ["CPM", money(totals.cpm)],
    ["Conversions", fmt(totals.conversions)], ["Cost / conv.", totals.conversions ? money(totals.cpl) : "—"],
  ];

  const W = project.widgets?.ads || {};
  if (!campaigns.length) return (
    <Card className="p-10 text-center">
      <div className="ll-display text-[15px] font-semibold">No ad campaigns running yet</div>
      <p className="mx-auto mt-1 max-w-md text-[12.5px] text-gray-400">
        Launch campaigns in <b>Ads &amp; Paid Marketing</b> — their performance shows up here automatically.
      </p>
    </Card>
  );

  return (
    <div className="ll-fade space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="ll-display flex items-center gap-2 text-[15px] font-semibold"><Megaphone size={15} style={{ color: accent }} /> Ads Performance</div>
          <div className="text-[11px] text-gray-400">Read-only paid-media results across every connected platform — manage campaigns in Ads &amp; Paid Marketing.</div>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setRangeDays(d)} className="ll-mono rounded-lg px-2 py-1 text-[11.5px] font-semibold"
              style={rangeDays === d ? { background: accent, color: "#fff" } : { color: "var(--chip-fg, #6B7280)" }}>{d}d</button>
          ))}
        </div>
        <select value={pfFilter} onChange={(e) => setPfFilter(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-[12px] font-semibold text-gray-600">
          <option value="all">All platforms</option>
          {PF_KEYS.map((k) => <option key={k} value={k}>{AD_PLATFORMS[k].label}</option>)}
        </select>
      </div>

      {anyDemo && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-800">
          <b>Demo numbers</b> — real metrics flow in once the platform credentials are connected (API settings).
        </div>
      )}

      {W.kpis !== false && <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {kpis.map(([label, v]) => (
          <Card key={label} className="p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
            <div className="ll-display mt-0.5 text-[20px] font-semibold tracking-tight">{v}</div>
          </Card>
        ))}
      </div>}

      {W.charts !== false && <div className="grid gap-4 xl:grid-cols-3">
        <Card className="p-4 xl:col-span-2">
          <div className="ll-display mb-3 text-[14px] font-semibold">Spend & results — last {rangeDays} days</div>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={chartRows} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area yAxisId="l" type="monotone" dataKey="Spend" stroke={accent} fill={accent} fillOpacity={0.15} strokeWidth={2.2} />
              <Area yAxisId="r" type="monotone" dataKey="Clicks" stroke="#0EA5E9" fill="#0EA5E9" fillOpacity={0.08} strokeWidth={2} />
              <Area yAxisId="r" type="monotone" dataKey="Conversions" stroke="#16A34A" fill="#16A34A" fillOpacity={0.08} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-4">
          <div className="ll-display mb-3 text-[14px] font-semibold">Spend by platform</div>
          {spendByPf.length === 0 ? <div className="py-12 text-center text-[12px] text-gray-300">No spend in range.</div> : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={spendByPf} dataKey="value" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={2}>
                    {spendByPf.map((x) => <Cell key={x.key} fill={AD_PLATFORMS[x.key].color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1">
                {spendByPf.map((x) => (
                  <div key={x.key} className="flex items-center gap-2 text-[11.5px] text-gray-600">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: AD_PLATFORMS[x.key].color }} />
                    {x.name}<span className="ll-mono ml-auto font-semibold">{money(x.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>}

      {W.table !== false && <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-[12px]">
          <thead><tr className="border-b border-gray-100">
            {["Campaign", "Status", "Spend", "Impr.", "Clicks", "CTR", "CPC", "Conv.", "Cost/conv."].map((h) => (
              <th key={h} className="px-3 py-2.5 text-left text-[9px] font-semibold uppercase tracking-wider text-gray-400">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {visible.map((c) => {
              const m = sumMetrics(inRange(campaignDaily(c)));
              const chip = STATUS_CHIP[c.status] || STATUS_CHIP.draft;
              return (
                <tr key={c.id} className="border-b border-gray-50">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <PfBadge pf={c.platform} />
                      <div className="min-w-0">
                        <div className="max-w-64 truncate text-[12.5px] font-semibold text-gray-800">{c.name}</div>
                        <div className="text-[9.5px] text-gray-400">{c.objective}{c.demo !== false && <span className="ml-1.5 rounded bg-amber-100 px-1 py-px text-[7.5px] font-bold uppercase text-amber-700">demo</span>}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5"><span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: chip.bg, color: chip.fg }}>{chip.label}</span></td>
                  <td className="ll-mono px-3 py-2.5 font-semibold">{money(m.spend)}</td>
                  <td className="ll-mono px-3 py-2.5">{fmt(m.impressions)}</td>
                  <td className="ll-mono px-3 py-2.5">{fmt(m.clicks)}</td>
                  <td className="ll-mono px-3 py-2.5">{m.ctr.toFixed(2)}%</td>
                  <td className="ll-mono px-3 py-2.5">{money(m.cpc)}</td>
                  <td className="ll-mono px-3 py-2.5">{fmt(m.conversions)}</td>
                  <td className="ll-mono px-3 py-2.5">{m.conversions ? money(m.cpl) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>}
    </div>
  );
}

const blankCampaign = (project) => ({
  id: uid(), step: 1, platform: "meta", objective: "Leads",
  name: "", budgetType: "daily", budget: 25, startDate: new Date().toISOString().slice(0, 10), endDate: "",
  targeting: { location: project.opt?.gbp?.address || "", radiusKm: 15, ageMin: 25, ageMax: 65, genders: "All", interests: [] },
  creative: { headline: "", primaryText: "", description: "", cta: "Learn more", landingUrl: "https://" + project.website },
  createdAt: Date.now(), launchedAt: null, status: "draft", demo: true,
});

/* ---------- connect an ad account (live attempt → labeled demo) ---------- */
function ConnectAdsModal({ platform, project, company, accent, current, onConnect, onDisconnect, onClose }) {
  const meta = AD_PLATFORMS[platform];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [accounts, setAccounts] = useState(null); // { live, items }
  const creds = company?.apis?.[meta.apiId]?.values || {};
  const startLive = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/ads/accounts", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ platform, creds }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) setAccounts({ live: true, items: d.accounts || [] });
      else setErr({ detail: d.detail || `Provider error (HTTP ${res.status})` });
    } catch { setErr({ detail: "API server is not running (npm run api) — the live account flow needs it." }); }
    setBusy(false);
  };
  const demoAccount = { id: "demo-" + platform + "-" + project.id, name: `${project.opt?.gbp?.bizName || project.name} — ${meta.label}`, connected: true, demo: true, connectedAt: Date.now() };
  return (
    <Modal title={`Connect ${meta.label}`} sub={meta.sub} onClose={onClose}>
      <div className="space-y-3">
        {current?.connected && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12px] text-emerald-800">
            <PfBadge pf={platform} /> Connected: <b>{current.name}</b>{current.demo && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[8px] font-bold uppercase text-amber-700">demo</span>}
            <button onClick={onDisconnect} className="ml-auto rounded-lg border border-emerald-300 px-2.5 py-1 text-[11px] font-semibold hover:bg-emerald-100">Disconnect</button>
          </div>
        )}
        {!accounts && (
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[13px] font-semibold text-gray-800">Sign in & pick the ad account</div>
              <GuideTip title={`How to connect ${meta.label}`} accent={meta.color}
                steps={API_GUIDES[meta.apiId] || []} docs={null} />
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-gray-400">
              Uses the {meta.label} credentials from Company Settings → API settings. The CRM reads performance data
              and creates campaigns — billing stays on the ad account itself.
            </p>
            <button onClick={startLive} disabled={busy} className="mt-3 w-full rounded-xl py-2.5 text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: meta.color }}>
              {busy ? "Contacting " + meta.label + "…" : "Continue with " + meta.label}
            </button>
          </div>
        )}
        {err && (
          <div className="ll-fade rounded-xl border border-amber-200 bg-amber-50 p-3.5">
            <div className="text-[11.5px] leading-relaxed text-amber-800">{err.detail}</div>
            <button onClick={() => onConnect(demoAccount)}
              className="mt-2.5 w-full rounded-lg border border-amber-300 bg-white py-2 text-[12px] font-semibold text-amber-700 hover:bg-amber-100">
              Continue with a demo ad account — all numbers stay labeled “Demo”
            </button>
          </div>
        )}
        {accounts?.live && (
          <div className="space-y-1.5">
            <div className="text-[12.5px] font-semibold text-gray-800">Choose the ad account</div>
            {accounts.items.map((a) => (
              <button key={a.id} onClick={() => onConnect({ id: a.id, name: a.name, connected: true, demo: false, connectedAt: Date.now() })}
                className="flex w-full items-center gap-2.5 rounded-xl border border-gray-200 px-3.5 py-2.5 text-left hover:border-gray-300">
                <PfBadge pf={platform} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-gray-800">{a.name}</span>
                <span className="ll-mono shrink-0 text-[10px] text-gray-400">{a.id}</span>
              </button>
            ))}
            {accounts.items.length === 0 && <div className="rounded-xl border border-dashed border-gray-200 py-6 text-center text-[12px] text-gray-400">No ad accounts on this login.</div>}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ---------- 5-step GHL-style campaign wizard ---------- */
function CampaignWizard({ draft, setDraft, project, accent, aiConfig, accounts, onSave, onClose }) {
  const c = draft;
  const set = (p) => setDraft({ ...c, ...p });
  const meta = AD_PLATFORMS[c.platform];
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState(null);
  const step = c.step || 1;
  const STEPS = ["Platform & goal", "Audience", "Budget & schedule", "Ad creative", "Review & launch"];
  const acct = accounts[c.platform];
  const est = useMemo(() => {   // deterministic reach estimate (labeled)
    const r = mulberry32(hashStr(c.platform + c.budget + c.targeting.radiusKm));
    const daily = c.budgetType === "daily" ? c.budget : c.budget / 30;
    const cpm = (meta.cpmRange[0] + meta.cpmRange[1]) / 2;
    return { reach: Math.round((daily / cpm) * 1000 * (0.9 + r() * 0.3)), clicks: Math.round((daily / cpm) * 1000 * ((meta.ctrRange[0] + meta.ctrRange[1]) / 200)) };
  }, [c.platform, c.budget, c.budgetType, c.targeting.radiusKm]); // eslint-disable-line

  const genCopy = async () => {
    setAiBusy(true); setAiNote(null);
    const brand = project.opt?.gbp?.bizName || project.name;
    const voice = project.opt?.brandVoice;
    try {
      const text = await aiGenerate(aiConfig, {
        json: true,
        system: `You are a senior paid-ads copywriter. Write high-converting, platform-native ad copy. Respond ONLY with JSON: {"headline": "...", "primaryText": "...", "description": "...", "cta": "..."} — headline ≤ 40 chars, primaryText ≤ 300 chars, description ≤ 60 chars, cta 1-3 words.`,
        prompt: `Platform: ${meta.label}. Objective: ${c.objective}. Business: ${brand} (${project.website}). Location: ${c.targeting.location || "local area"}.${voice?.toneWords ? ` Brand tone: ${voice.toneWords}.` : ""}${voice?.brandInfo ? ` Brand info: ${voice.brandInfo.slice(0, 400)}` : ""} Audience: ages ${c.targeting.ageMin}-${c.targeting.ageMax}, within ${c.targeting.radiusKm}km.`,
      });
      const j = parseJson(text);
      if (!j?.headline) throw new Error("model returned unparseable copy");
      set({ creative: { ...c.creative, headline: j.headline, primaryText: j.primaryText || "", description: j.description || "", cta: j.cta || c.creative.cta } });
      setAiNote({ kind: "ai", text: "Copy generated by " + (aiConfig?.provider || "AI") });
    } catch (e) {
      if (e.code === 503 || /no AI provider/.test(String(e.message))) {
        set({ creative: { ...c.creative, ...localCopy(c, project, project.opt?.gbp?.bizName) } });
        setAiNote({ kind: "draft", text: "No AI provider configured — inserted a local draft (labeled). Add an AI key in API settings for real generation." });
      } else setAiNote({ kind: "err", text: "AI error: " + e.message });
    }
    setAiBusy(false);
  };

  const launch = async () => {
    /* live publish when the account is genuinely connected; otherwise demo-launch */
    if (acct?.connected && !acct.demo) {
      try {
        const res = await fetch("/api/ads/publish", {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000),
          body: JSON.stringify({ platform: c.platform, accountId: acct.id, campaign: { name: c.name, objective: c.objective, budget: c.budget, budgetType: c.budgetType } }),
        });
        const d = await res.json().catch(() => ({}));
        if (res.ok) { onSave({ ...c, demo: false, providerCampaignId: d.campaignId, providerNote: d.note }, true); return; }
        setAiNote({ kind: "err", text: "Publish failed: " + (d.detail || `HTTP ${res.status}`) + " — saved as demo instead." });
      } catch { setAiNote({ kind: "err", text: "API server unreachable — launching in demo mode." }); }
    }
    onSave({ ...c, demo: true }, true);
  };

  const canNext = step === 1 ? !!c.objective : step === 2 ? true : step === 3 ? c.budget > 0 : step === 4 ? !!(c.name && c.creative.headline) : true;
  return (
    <Modal title={c.editing ? `Edit campaign — ${c.name || "untitled"}` : "Create campaign"} sub={`${meta.label} · step ${step} of 5 — ${STEPS[step - 1]}`} onClose={onClose} wide>
      {/* stepper */}
      <div className="mb-4 flex items-center gap-1">
        {STEPS.map((s2, i) => (
          <React.Fragment key={s2}>
            <button onClick={() => set({ step: i + 1 })} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold"
              style={step === i + 1 ? { background: accent, color: "#fff" } : step > i + 1 ? { background: accent + "22", color: accent } : { background: "#F3F4F6", color: "#9CA3AF" }}>
              {i + 1}. {s2}
            </button>
            {i < 4 && <span className="h-px w-3 bg-gray-200" />}
          </React.Fragment>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-3">
          <Labeled label="Platform">
            <div className="grid gap-1.5 sm:grid-cols-3">
              {PF_KEYS.map((k) => (
                <button key={k} onClick={() => set({ platform: k, objective: AD_PLATFORMS[k].objectives[0] })}
                  className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left"
                  style={c.platform === k ? { borderColor: AD_PLATFORMS[k].color, background: AD_PLATFORMS[k].color + "0C" } : { borderColor: "#E5E7EB" }}>
                  <PfBadge pf={k} />
                  <span className="min-w-0">
                    <span className="block text-[12px] font-bold text-gray-800">{AD_PLATFORMS[k].label}</span>
                    <span className="block truncate text-[9px] text-gray-400">{AD_PLATFORMS[k].sub}</span>
                  </span>
                  {!accounts[k]?.connected && <span className="ml-auto shrink-0 text-[8px] font-bold uppercase text-gray-300">not connected</span>}
                </button>
              ))}
            </div>
          </Labeled>
          <Labeled label="Campaign objective">
            <div className="flex flex-wrap gap-1.5">
              {meta.objectives.map((o) => (
                <button key={o} onClick={() => set({ objective: o })} className="rounded-full border px-3 py-1.5 text-[12px] font-semibold"
                  style={c.objective === o ? { background: accent, borderColor: accent, color: "#fff" } : { borderColor: "#E5E7EB", color: "#4B5563" }}>{o}</button>
              ))}
            </div>
          </Labeled>
          {!accounts[c.platform]?.connected && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11.5px] text-amber-800">
              {meta.label} isn't connected yet — you can build and save this campaign now; connect the account (header chips) to publish it live.
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Target location"><input value={c.targeting.location} onChange={(e) => set({ targeting: { ...c.targeting, location: e.target.value } })} placeholder="City, address or zip" className={inputCls} /></Labeled>
            <Labeled label={`Radius — ${c.targeting.radiusKm} km`}>
              <input type="range" min={2} max={80} value={c.targeting.radiusKm} onChange={(e) => set({ targeting: { ...c.targeting, radiusKm: +e.target.value } })} className="w-full" style={{ accentColor: accent }} />
            </Labeled>
            <Labeled label="Age range">
              <div className="flex items-center gap-2">
                <input type="number" min={13} max={99} value={c.targeting.ageMin} onChange={(e) => set({ targeting: { ...c.targeting, ageMin: +e.target.value } })} className={inputCls + " w-20"} />
                <span className="text-gray-400">–</span>
                <input type="number" min={13} max={99} value={c.targeting.ageMax} onChange={(e) => set({ targeting: { ...c.targeting, ageMax: +e.target.value } })} className={inputCls + " w-20"} />
              </div>
            </Labeled>
            <Labeled label="Gender"><Seg options={["All", "Women", "Men"]} value={c.targeting.genders} onChange={(v) => set({ targeting: { ...c.targeting, genders: v } })} accent={accent} /></Labeled>
          </div>
          <Labeled label="Interest & keyword targeting (comma-separated)">
            <input value={(c.targeting.interests || []).join(", ")} onChange={(e) => set({ targeting: { ...c.targeting, interests: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) } })}
              placeholder="e.g. teeth whitening, cosmetic dentistry, invisalign" className={inputCls} />
          </Labeled>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Labeled label="Budget type"><Seg options={["daily", "lifetime"]} value={c.budgetType} onChange={(v) => set({ budgetType: v })} accent={accent} /></Labeled>
            <Labeled label={`Budget (USD ${c.budgetType === "daily" ? "per day" : "total"})`}>
              <input type="number" min={1} value={c.budget} onChange={(e) => set({ budget: +e.target.value })} className={inputCls} />
            </Labeled>
            <Labeled label="Schedule">
              <div className="flex items-center gap-1.5">
                <input type="date" value={c.startDate} onChange={(e) => set({ startDate: e.target.value })} className={inputCls} />
                <input type="date" value={c.endDate} onChange={(e) => set({ endDate: e.target.value })} className={inputCls} title="Leave empty to run continuously" />
              </div>
            </Labeled>
          </div>
          <div className="rounded-xl bg-gray-50 px-4 py-3 text-[12px] text-gray-600">
            Estimated daily reach: <b className="ll-mono">{fmt(est.reach)}</b> people · ~<b className="ll-mono">{fmt(est.clicks)}</b> clicks/day
            <span className="ml-1 text-[10px] text-gray-400">(deterministic estimate from {meta.label} benchmark CPM/CTR — live estimates come from the platform once connected)</span>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-2">
            <div className="flex-1"><Labeled label="Campaign name">
              <input value={c.name} onChange={(e) => set({ name: e.target.value })} placeholder={`e.g. ${project.name} — ${c.objective}`} className={inputCls} />
            </Labeled></div>
            <button onClick={genCopy} disabled={aiBusy}
              className="flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12px] font-bold text-white disabled:opacity-50" style={{ background: accent }}>
              <Wand2 size={13} /> {aiBusy ? "Writing…" : "AI: write the ad"}
            </button>
          </div>
          {aiNote && (
            <div className={"rounded-lg px-3 py-2 text-[11px] " + (aiNote.kind === "err" ? "bg-red-50 text-red-700" : aiNote.kind === "draft" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700")}>{aiNote.text}</div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label={`Headline (${(c.creative.headline || "").length}/40)`}><input value={c.creative.headline} onChange={(e) => set({ creative: { ...c.creative, headline: e.target.value } })} maxLength={40} className={inputCls} /></Labeled>
            <Labeled label="Call to action"><input value={c.creative.cta} onChange={(e) => set({ creative: { ...c.creative, cta: e.target.value } })} className={inputCls} /></Labeled>
          </div>
          <Labeled label={`Primary text (${(c.creative.primaryText || "").length}/300)`}>
            <textarea value={c.creative.primaryText} onChange={(e) => set({ creative: { ...c.creative, primaryText: e.target.value } })} maxLength={300} rows={3} className={inputCls + " resize-none"} />
          </Labeled>
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Description / link caption"><input value={c.creative.description} onChange={(e) => set({ creative: { ...c.creative, description: e.target.value } })} maxLength={60} className={inputCls} /></Labeled>
            <Labeled label="Landing page URL"><input value={c.creative.landingUrl} onChange={(e) => set({ creative: { ...c.creative, landingUrl: e.target.value } })} className={"ll-mono " + inputCls} /></Labeled>
          </div>
          {/* live ad preview */}
          <div className="rounded-xl border border-gray-200 p-3.5" style={{ maxWidth: 420 }}>
            <div className="mb-1.5 flex items-center gap-2"><PfBadge pf={c.platform} size={18} /><span className="text-[11px] font-bold text-gray-700">{project.opt?.gbp?.bizName || project.name}</span><span className="text-[9px] text-gray-400">Sponsored</span></div>
            <div className="text-[12.5px] leading-relaxed text-gray-700">{c.creative.primaryText || "Your primary text shows here…"}</div>
            <div className="mt-2 rounded-lg bg-gray-50 p-2.5">
              <div className="text-[9px] uppercase text-gray-400">{(c.creative.landingUrl || "").replace(/https?:\/\//, "")}</div>
              <div className="text-[13px] font-bold text-gray-800">{c.creative.headline || "Headline preview"}</div>
              <div className="text-[10.5px] text-gray-500">{c.creative.description}</div>
              <button className="mt-1.5 rounded-lg px-3 py-1 text-[11px] font-bold text-white" style={{ background: meta.color }}>{c.creative.cta || "Learn more"}</button>
            </div>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {[["Platform", meta.label], ["Objective", c.objective], ["Audience", `${c.targeting.location || "—"} · ${c.targeting.radiusKm}km · ${c.targeting.ageMin}–${c.targeting.ageMax} · ${c.targeting.genders}`],
              ["Budget", `${money(c.budget)}/${c.budgetType === "daily" ? "day" : "total"}`], ["Schedule", `${c.startDate}${c.endDate ? " → " + c.endDate : " → ongoing"}`],
              ["Ad account", acct?.connected ? `${acct.name}${acct.demo ? " (demo)" : ""}` : "not connected — will save/launch in demo mode"]].map(([l, v]) => (
              <div key={l} className="rounded-xl border border-gray-100 px-3.5 py-2.5">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">{l}</div>
                <div className="mt-0.5 text-[12.5px] font-semibold text-gray-800">{v}</div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-gray-100 p-3.5">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Creative</div>
            <div className="mt-1 text-[13px] font-bold text-gray-800">{c.creative.headline || "—"}</div>
            <div className="text-[12px] text-gray-600">{c.creative.primaryText}</div>
          </div>
          {acct?.connected && !acct.demo ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[11.5px] text-emerald-800">
              Launch will create this campaign <b>PAUSED on {meta.label}</b> via the real API (review it there, then activate) — standard safe-publish flow.
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11.5px] text-amber-800">
              No live {meta.label} account — launching runs the campaign in <b>demo mode</b> with deterministic, clearly-labeled numbers.
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
        <button onClick={() => (step > 1 ? set({ step: step - 1 }) : onClose())} className="rounded-lg border border-gray-200 px-3.5 py-2 text-[12px] font-medium text-gray-500">
          {step > 1 ? "← Back" : "Cancel"}
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => onSave(c, false)} className="rounded-lg border border-gray-200 px-3.5 py-2 text-[12px] font-semibold text-gray-600">Save draft</button>
          {step < 5 ? (
            <button onClick={() => set({ step: step + 1 })} disabled={!canNext} className="rounded-lg px-5 py-2 text-[12.5px] font-bold text-white disabled:opacity-40" style={{ background: accent }}>Next →</button>
          ) : (
            <button onClick={launch} className="flex items-center gap-1.5 rounded-lg px-5 py-2 text-[12.5px] font-bold text-white" style={{ background: accent }}><Rocket size={13} /> Launch campaign</button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ---------- AI ads pitch: client-ready paid-media proposal ---------- */
function PitchModal({ state, setState, project, accent, aiConfig, campaigns, onClose }) {
  const [busy, setBusy] = useState(false);
  const gen = async (forceLocal = false) => {
    setBusy(true);
    const brand = project.opt?.gbp?.bizName || project.name;
    const budget = +state.budget || 1500;
    try {
      if (forceLocal) { const e = new Error("no AI provider configured"); e.code = 503; throw e; }
      const text = await aiGenerate(aiConfig, {
        maxTokens: 1600,
        system: "You are a senior paid-media strategist at a local-SEO agency writing a concise, persuasive client pitch. Use plain confident language, short sections with headers, concrete numbers. No preamble.",
        prompt: `Write a paid-ads pitch for ${brand} (${project.website}), a local business. Goal: ${state.goal}. Monthly budget: $${budget}. Recommend a split across Meta Ads, Google Ads (incl. Local Services), and one experimental channel (TikTok/Nextdoor/Yelp — pick the best fit), with budget per channel, expected CPL ranges for local services, 3 ad angles, and a 90-day plan. End with next steps.`,
      });
      setState({ ...state, step: "result", text, source: "ai" });
    } catch (e) {
      if (e.code === 503 || /no AI provider/.test(String(e.message))) {
        const r = mulberry32(hashStr(project.id + "pitch" + budget));
        const split = [Math.round(budget * 0.45), Math.round(budget * 0.4), Math.round(budget * 0.15)];
        setState({ ...state, step: "result", source: "draft", text:
`# Paid media plan — ${brand}

## Goal
${state.goal} on a $${budget}/month budget.

## Recommended split
- **Google Ads (Search + Local Services)** — $${split[1]}/mo. Captures people searching right now; expected CPL $${(18 + r() * 22).toFixed(0)}–$${(45 + r() * 30).toFixed(0)}.
- **Meta Ads (Facebook & Instagram)** — $${split[0]}/mo. Demand generation with offer-led lead forms; expected CPL $${(9 + r() * 12).toFixed(0)}–$${(28 + r() * 15).toFixed(0)}.
- **Nextdoor Ads (experimental)** — $${split[2]}/mo. Neighborhood trust play for local services.

## Ad angles
1. New-customer offer with a hard deadline.
2. Social proof — reviews & before/after results.
3. "Emergency? Seen today." speed-to-service angle.

## 90-day plan
Month 1: launch + learning phase. Month 2: cut losers, scale winners ±20%. Month 3: add retargeting and lookalikes from converted leads.

## Next steps
Approve budget → connect ad accounts → campaigns live within 5 business days.

*(Local draft — connect an AI provider in API settings for a fully personalized pitch.)*` });
      } else setState({ ...state, step: "form", err: "AI error: " + e.message });
    }
    setBusy(false);
  };
  return (
    <Modal title="AI ads pitch" sub="A client-ready paid-media proposal — generate, tweak, send" onClose={onClose} wide>
      {state.step === "form" ? (
        <div className="space-y-3">
          {state.err && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11.5px] text-red-700">
              {state.err} — fix the AI key in Company Settings → API settings, or use the labeled local draft below.
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Primary goal"><input value={state.goal} onChange={(e) => setState({ ...state, goal: e.target.value })} className={inputCls} /></Labeled>
            <Labeled label="Monthly budget (USD)"><input type="number" value={state.budget} onChange={(e) => setState({ ...state, budget: e.target.value })} className={inputCls} /></Labeled>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={gen} disabled={busy} className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: accent }}>
              <Sparkles size={14} /> {busy ? "Writing pitch…" : "Generate pitch"}
            </button>
            {state.err && (
              <button onClick={() => gen(true)} disabled={busy}
                className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-[12px] font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50">
                Use labeled local draft instead
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {state.source === "draft" && <div className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">Local draft (no AI key configured) — clearly labeled; add a provider in API settings for a personalized pitch.</div>}
          <textarea value={state.text} onChange={(e) => setState({ ...state, text: e.target.value })} rows={18} className={inputCls + " ll-mono resize-y text-[12px] leading-relaxed"} />
          <div className="flex gap-2">
            <button onClick={() => { navigator.clipboard?.writeText(state.text); }} className="rounded-lg border border-gray-200 px-3.5 py-2 text-[12px] font-semibold text-gray-600"><Copy size={12} className="mr-1 inline" />Copy pitch</button>
            <button onClick={() => setState({ ...state, step: "form" })} className="rounded-lg border border-gray-200 px-3.5 py-2 text-[12px] font-medium text-gray-500">← Regenerate</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
