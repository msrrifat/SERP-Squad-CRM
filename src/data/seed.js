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
import { findCity } from "../lib/geo.js";
import { isoDate } from "../lib/months.jsx";

export const DEFAULT_WIDGETS = {
  gbp: { views: true, breakdown: true, calls: true, directions: true, websiteClicks: true, searchKeywords: true, platformDevice: true },
  bing: { impressions: true, clicks: true, calls: true, directions: true },
  apple: { views: true, calls: true, directions: true, websiteTaps: true },
  ga: { users: true, sessions: true, engagement: true, conversions: true, channels: true, sources: true, events: true, topPages: true },
  gsc: { clicks: true, impressions: true, ctr: true, position: true, topQueries: true },
  ranks: { insights: true, distribution: true, table: true },
  ads: { kpis: true, charts: true, table: true },
};
export const cloneWidgets = () => JSON.parse(JSON.stringify(DEFAULT_WIDGETS));

export let seedN = 0;
export const seedEntry = (domain, keyword, cityName, device, days, opts = {}) => ({
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
export const mkOpt = () => ({
  gbp: { connected: false, bizName: "", categories: [], phone: "", website: "", address: "", description: "",
    hours: { Mon: "9:00 AM – 5:00 PM", Tue: "9:00 AM – 5:00 PM", Wed: "9:00 AM – 5:00 PM", Thu: "9:00 AM – 5:00 PM", Fri: "9:00 AM – 5:00 PM", Sat: "Closed", Sun: "Closed" },
    svcCats: [], services: [], products: [], posts: [], photos: [] },
  bing: { connected: false, bizName: "", categories: [], phone: "", website: "", address: "", description: "",
    hours: { Mon: "9:00 AM \u2013 5:00 PM", Tue: "9:00 AM \u2013 5:00 PM", Wed: "9:00 AM \u2013 5:00 PM", Thu: "9:00 AM \u2013 5:00 PM", Fri: "9:00 AM \u2013 5:00 PM", Sat: "Closed", Sun: "Closed" },
    photos: [] },
  apple: { connected: false, bizName: "", categories: [], phone: "", website: "", address: "", description: "",
    hours: { Mon: "9:00 AM \u2013 5:00 PM", Tue: "9:00 AM \u2013 5:00 PM", Wed: "9:00 AM \u2013 5:00 PM", Thu: "9:00 AM \u2013 5:00 PM", Fri: "9:00 AM \u2013 5:00 PM", Sat: "Closed", Sun: "Closed" },
    photos: [], showcases: [] },
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
  /* Branding & Automation — off-page SEO hub: media library, Web 2.0 branded
     sites (per-platform state) and content automation campaigns */
  branding: { media: [], sites: {}, campaigns: [] },
});
export const mkProject = (id, name, website, accent, tracking, records = [], opt = null) => ({
  id, name, website, accent, logo: null, widgets: cloneWidgets(),
  integrations: { gbp: true, ga: true, gsc: true, bing: false, apple: false },
  /* location groups: one per business location; each holds its own GBP/Bing/Apple
     connection. The flat integrations gbp/bing/apple above are DERIVED (any
     location connected) so every existing gate keeps working. */
  locations: [{ id: id + "-loc1", name: "Primary location", integrations: { gbp: true, bing: false, apple: false } }],
  tracking, records, opt: opt || mkOpt(),
});

export const ROLE_PRESETS = {
  Admin:   { viewData: true, manageKeywords: true, createReports: true, manageClients: true, manageTasks: true },
  Manager: { viewData: true, manageKeywords: true, createReports: true, manageClients: false, manageTasks: true },
  "Content Developer": { viewData: false, manageKeywords: false, createReports: false, manageClients: false, manageTasks: true },
  "Web Developer":     { viewData: false, manageKeywords: false, createReports: false, manageClients: false, manageTasks: true },
  "Paid Ads Manager":  { viewData: false, manageKeywords: false, createReports: false, manageClients: false, manageTasks: true },
};
/* sections each role sees AUTOMATICALLY on every assigned project (manual
   per-project grants in Project settings → Team can only ADD to these).
   Admins see everything and can create clients/projects & assign the team. */
export const ROLE_AUTO_SECTIONS = {
  Admin: "all",
  Manager: ["gbp", "web", "ranks", "geogrid", "adsperf", "records", "wiki", "chat"],   // Performance + PM (+ reports via createReports)
  "Content Developer": ["records", "wiki", "chat"],
  "Web Developer": ["records", "wiki", "chat"],
  "Paid Ads Manager": ["records", "wiki", "chat", "ads", "adsperf"],
};
/* what a CLIENT sees instead of a team member's real name (identity wall) */
export const ROLE_CLIENT_LABEL = {
  Admin: "SEO Manager", Manager: "SEO Manager",
  "Content Developer": "Content Developer", "Web Developer": "Web Developer", "Paid Ads Manager": "Paid Ads Manager",
};
/* FRESH START — no demo data. Just the owner account and empty collections.
   No API credentials are pre-filled: every integration honestly reads
   "not configured" until you add real keys in Company Settings → API settings.
   The owner's login credentials also seed the server's bootstrap owner, so
   the very first sign-in on a new server works, then your saved team takes over. */
export const SEED_COMPANY = {
  name: "SERP Squad",
  logo: null,
  accent: "#1F2A44",
  dfs: { login: "", password: "", connected: false },
  apis: {},
  team: [
    { id: "u1", name: "You (Owner)", username: "SERP_Squad", email: "serpsquad@gmail.com", password: "SERPapp$login164418", role: "Admin", projects: "all", perms: { ...ROLE_PRESETS.Admin }, isOwner: true, title: "Founder & SEO Lead", phone: "", avatar: null },
  ],
  finance: { clientEntries: [], universal: [] },
  recordTemplates: [],
  chatGroups: [],
  dms: {},
  dmReads: {},
  activity: [],
};

/* FRESH START — no demo clients. Add your own from the dashboard.
   Projects created in the app default to demoMode:false, so they show
   honest "connect your sources" warnings until real APIs sync. */
export const SEED_CLIENTS = [];

