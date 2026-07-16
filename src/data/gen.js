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
import { LABELS } from "../lib/months.jsx";
import { hashStr, mulberry32 } from "../lib/rng.js";

export const PAGE_SLUGS = ["/", "/services", "/contact", "/about", "/reviews", "/blog/local-seo-tips"];

export function buildSeries(r, start, growth, jitter = 0.14) {
  const out = [start];
  for (let i = 1; i < 13; i++) out.push(out[i - 1] * growth * (1 - jitter / 2 + r() * jitter));
  return out.map((v) => Math.max(0, Math.round(v)));
}

export const GA_SOURCES = [
  { name: "Google", w: 0.52, g: 1.03 },
  { name: "Direct", w: 0.20, g: 1.02 },
  { name: "Bing", w: 0.08, g: 1.02 },
  { name: "Facebook", w: 0.08, g: 1.01 },
  { name: "ChatGPT", w: 0.05, g: 1.16 },   // AI referrals grow fastest
  { name: "Yahoo", w: 0.03, g: 1.0 },
];

export const GA_EVENTS = [
  { name: "form_submission", w: 1.0 },
  { name: "call_click", w: 0.8 },
  { name: "chat_started", w: 0.45 },
  { name: "whatsapp_click", w: 0.35 },
  { name: "booking_completed", w: 0.3 },
  { name: "newsletter_signup", w: 0.2 },
];

/* one location's GBP + Bing + Apple series — independently seeded per location
   so franchise locations get distinct, stable numbers; unconnected providers
   produce all-zero series (nothing is fabricated for a missing connection) */
function genLocationProfiles(seedKey, loc, trackedKeywords, brandName) {
  const r = mulberry32(hashStr(seedKey));
  const rng = (lo, hi) => lo + r() * (hi - lo);
  const growth = rng(1.015, 1.05);
  const I = loc.integrations || {};

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

  const bingShare = rng(0.12, 0.22), appleShare = rng(0.08, 0.18);
  const bingCtr = rng(0.05, 0.09);
  const bingImpr = searchViews.map((v, i) => Math.round((v + mapViews[i]) * bingShare));
  const bingClicks = bingImpr.map((v) => Math.round(v * bingCtr));
  const bingCalls = calls.map((v) => Math.max(0, Math.round(v * bingShare)));
  const bingDirections = directions.map((v) => Math.max(0, Math.round(v * bingShare * 1.1)));
  const appleViews = mapViews.map((v) => Math.round(v * appleShare * 2));
  const appleCalls = calls.map((v) => Math.max(0, Math.round(v * appleShare)));
  const appleDirections = directions.map((v) => Math.max(0, Math.round(v * appleShare * 1.5)));
  const appleWebsiteTaps = gbpClicks.map((v) => Math.max(0, Math.round(v * appleShare)));

  const brand = (brandName || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const termPool = [brand, ...trackedKeywords, "near me", "open now", brand + " reviews"].filter(Boolean);
  const gbpTerms = [...new Set(termPool)].slice(0, 8).map((term, i) => {
    const share = (0.26 - i * 0.028) * rng(0.75, 1.25);
    const drift = rng(0.72, 1.35);
    return {
      term,
      impressions: I.gbp ? Math.max(5, Math.round(searchViews[12] * share)) : 0,
      prev: (cmp) => (I.gbp ? Math.max(5, Math.round(searchViews[12 - cmp] * share * drift)) : 0),
    };
  }).sort((a, b) => b.impressions - a.impressions);

  const z = (on, v) => (on ? v : 0);
  const months = LABELS.map((label, i) => ({
    label,
    gbp: {
      searchViews: z(I.gbp, searchViews[i]), mapViews: z(I.gbp, mapViews[i]), views: z(I.gbp, searchViews[i] + mapViews[i]),
      searchMobile: z(I.gbp, searchMobile[i]), searchDesktop: z(I.gbp, searchDesktop[i]),
      mapsMobile: z(I.gbp, mapsMobile[i]), mapsDesktop: z(I.gbp, mapsDesktop[i]),
      calls: z(I.gbp, calls[i]), directions: z(I.gbp, directions[i]), websiteClicks: z(I.gbp, gbpClicks[i]),
      totalReviews: z(I.gbp, totalReviewsBase + i * Math.round(3 + ((hashStr(seedKey) >> (i % 8)) % 5))),
    },
    bing: { impressions: z(I.bing, bingImpr[i]), clicks: z(I.bing, bingClicks[i]), calls: z(I.bing, bingCalls[i]), directions: z(I.bing, bingDirections[i]) },
    apple: { views: z(I.apple, appleViews[i]), calls: z(I.apple, appleCalls[i]), directions: z(I.apple, appleDirections[i]), websiteTaps: z(I.apple, appleWebsiteTaps[i]) },
  }));
  return { months, rating, gbpTerms };
}

/* location groups with a safe fallback for projects created before locations existed */
export const projectLocations = (project) =>
  project.locations && project.locations.length
    ? project.locations
    : [{ id: project.id + "-main", name: "Primary location", integrations: { gbp: !!project.integrations?.gbp, bing: !!project.integrations?.bing, apple: !!project.integrations?.apple } }];

export function genSiteData(project, trackedKeywords, brandName) {
  /* ---- business profiles: one dataset per location group + the aggregate ---- */
  const locs = projectLocations(project);
  const locData = locs.map((loc) => genLocationProfiles(project.id + "|" + loc.id + "|" + loc.name, loc, trackedKeywords, brandName || project.name));

  const sumKey = (i, cat, key) => locData.reduce((n, d) => n + (d.months[i][cat][key] || 0), 0);
  const CATS = {
    gbp: ["searchViews", "mapViews", "views", "searchMobile", "searchDesktop", "mapsMobile", "mapsDesktop", "calls", "directions", "websiteClicks", "totalReviews"],
    bing: ["impressions", "clicks", "calls", "directions"],
    apple: ["views", "calls", "directions", "websiteTaps"],
  };
  const gbpLocs = locs.map((l, i) => ({ l, d: locData[i] })).filter((x) => x.l.integrations?.gbp);
  const rating = gbpLocs.length ? +(gbpLocs.reduce((n, x) => n + x.d.rating, 0) / gbpLocs.length).toFixed(1) : 0;
  /* aggregate search terms: same term across locations sums; prev() sums too */
  const termMap = {};
  locData.forEach((d) => d.gbpTerms.forEach((t) => {
    const cur = (termMap[t.term] = termMap[t.term] || { term: t.term, impressions: 0, prevs: [] });
    cur.impressions += t.impressions; cur.prevs.push(t.prev);
  }));
  const gbpTerms = Object.values(termMap).map((t) => ({ term: t.term, impressions: t.impressions, prev: (cmp) => t.prevs.reduce((n, f) => n + f(cmp), 0) }))
    .sort((a, b) => b.impressions - a.impressions).slice(0, 8);

  /* ---- website data (GA4 + Search Console): one website per project ---- */
  const r = mulberry32(hashStr(project.id + project.name));
  const rng = (lo, hi) => lo + r() * (hi - lo);
  const growth = rng(1.015, 1.05);

  const users = buildSeries(r, rng(380, 2800), growth);
  const sessions = users.map((u) => Math.round(u * rng(1.18, 1.45)));
  const engRate = +rng(0.52, 0.71).toFixed(2);
  const conversions = buildSeries(r, rng(9, 75), growth);
  let w = [rng(0.4, 0.55), rng(0.18, 0.28), rng(0.06, 0.14), rng(0.05, 0.12), rng(0.03, 0.1)];
  const wSum = w.reduce((a, b) => a + b, 0); w = w.map((x) => x / wSum);
  const channels = ["Organic search", "Direct", "Social", "Referral", "Paid search"]
    .map((name, i) => ({ name, value: Math.round(sessions[12] * w[i]) }));
  const sources = GA_SOURCES.map((s2) => ({
    name: s2.name,
    series: buildSeries(r, Math.max(2, sessions[0] * s2.w * rng(0.8, 1.2)), s2.g * rng(0.99, 1.01)),
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
    gbp: Object.fromEntries(CATS.gbp.map((k) => [k, sumKey(i, "gbp", k)])),
    bing: Object.fromEntries(CATS.bing.map((k) => [k, sumKey(i, "bing", k)])),
    apple: Object.fromEntries(CATS.apple.map((k) => [k, sumKey(i, "apple", k)])),
    ga: { users: users[i], sessions: sessions[i], conversions: conversions[i] },
    gsc: { clicks: clicks[i], impressions: impressions[i], position: gscPosition[i] },
  }));

  return {
    months, rating, engRate, channels, sources, events, topPages, topQueries, gbpTerms,
    /* per-location slices for the Business Profiles location selector */
    locations: locs.map((loc, i) => ({ id: loc.id, name: loc.name, integrations: loc.integrations || {}, months: locData[i].months, rating: locData[i].rating, gbpTerms: locData[i].gbpTerms })),
  };
}

/* all-zero dataset in the genSiteData shape — used for REAL projects so the
   designed dashboards keep their layout with "Not connected" states instead
   of disappearing. Nothing here is fabricated: every series is zero and every
   list is empty until a real source syncs. */
export function emptySiteData(project) {
  const CATS = {
    gbp: ["searchViews", "mapViews", "views", "searchMobile", "searchDesktop", "mapsMobile", "mapsDesktop", "calls", "directions", "websiteClicks", "totalReviews"],
    bing: ["impressions", "clicks", "calls", "directions"],
    apple: ["views", "calls", "directions", "websiteTaps"],
  };
  const zeros = (keys) => Object.fromEntries(keys.map((k) => [k, 0]));
  const months = LABELS.map((label) => ({
    label,
    gbp: zeros(CATS.gbp), bing: zeros(CATS.bing), apple: zeros(CATS.apple),
    ga: { users: 0, sessions: 0, conversions: 0 },
    gsc: { clicks: 0, impressions: 0, position: 0 },
  }));
  return {
    months, rating: 0, engRate: 0, channels: [], sources: [], events: [], topPages: [], topQueries: [], gbpTerms: [],
    locations: projectLocations(project).map((loc) => ({ id: loc.id, name: loc.name, integrations: loc.integrations || {}, months, rating: 0, gbpTerms: [] })),
  };
}

export function genPositions(entry) {
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
export function trackStats(positions) {
  const n = positions.length;
  const cur = positions[n - 1];
  const at = (d) => (n - 1 - d >= 0 ? positions[n - 1 - d] : null);
  const ch = (d) => { const p = at(d); return p == null ? null : p - cur; };
  return { start: positions[0], cur, d1: ch(1), d7: ch(7), d30: ch(30), life: n > 1 ? positions[0] - cur : null };
}
export function avgPosDaysAgo(tracking, daysAgo) {
  // only average entries that actually have history that far back — never fabricate
  // pre-tracking positions by clamping to day 1 (that fakes flat history in trends)
  const vals = tracking.map((t) => t.positions[t.positions.length - 1 - daysAgo]).filter((v) => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

export function hydrate(entry) {
  // extraPositions holds re-check results persisted on the tracking entry in state,
  // so they survive rehydration (keyword add/delete, project switch, report builds)
  const positions = [...genPositions(entry), ...(entry.extraPositions || [])];
  const r = mulberry32(hashStr(entry.id + entry.keyword + "url"));
  const url = "https://" + entry.domain + PAGE_SLUGS[Math.floor(r() * 3)];
  return { ...entry, positions, url, stats: trackStats(positions) };
}

