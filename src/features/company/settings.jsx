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
import { GuideTip, BrandMark, Card, DarkToggle, FONT_CSS, Labeled, LogoUpload, NEG, POS, ProjectMark, RoleBadge, SaveBar, Seg, Toggle, askDisconnect, inputCls, tooltipStyle, useDraft } from "../../ui/primitives.jsx";
import { ROLE_PRESETS } from "../../data/seed.js";
import { isoDate } from "../../lib/months.jsx";
import { money, relTime } from "../../lib/format.jsx";

export const API_REGISTRY = [
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
      {
        id: "openPageRank", name: "Open PageRank (free)",
        desc: "FREE domain-authority scores (0–10, PageRank-based) for the Guest Post Finder's site metrics — 1,000 requests/day at no cost.",
        docs: "openpagerank.com → sign up → API key",
        fields: [
          { key: "apiKey", label: "API key", secret: true, placeholder: "k0…" },
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
        desc: "One OAuth client powers the live Google connections: Analytics 4 (users, sessions, conversions) and Search Console (clicks, impressions, queries), connected per project. Add the redirect URI below to the OAuth client's Authorized redirect URIs in Google Cloud Console.",
        docs: "console.cloud.google.com → APIs & Services → Credentials → Create OAuth client ID (Web application)",
        scopes: ["analytics.readonly", "webmasters.readonly"],
        fields: [
          { key: "clientId", label: "OAuth Client ID", placeholder: "xxxxx.apps.googleusercontent.com" },
          { key: "clientSecret", label: "OAuth Client Secret", secret: true, placeholder: "GOCSPX-…" },
          { key: "redirectUri", label: "Authorized redirect URI", placeholder: "https://app.serpsquad.com/api/oauth/google/callback" },
        ],
      },
      {
        id: "googleCse", name: "Google Custom Search (legacy)",
        desc: "Google CLOSED this API to new customers (sunset Jan 2027) — leave empty unless you have legacy access. The Guest Post Finder automatically runs its footprint searches through DataForSEO instead (~$0.002/query).",
        docs: "legacy accounts only: developers.google.com/custom-search — everyone else: connect DataForSEO above",
        fields: [
          { key: "apiKey", label: "API key", secret: true, placeholder: "AIza…" },
          { key: "cx", label: "Search engine ID (cx)", placeholder: "a1b2c3d4e5…" },
        ],
      },
      {
        id: "googlePlaces", name: "Google Places API",
        desc: "Powers business location lookups (geo-grid tracker, profile audits, lead finder) and the real map snapshots in insight audit emails. Enable BOTH the Places API and the Static Maps API on this key. Rank scans themselves run through DataForSEO.",
        docs: "console.cloud.google.com \u2192 APIs \u2192 enable Places API + Static Maps API",
        fields: [
          { key: "apiKey", label: "API key", secret: true, placeholder: "AIza\u2026" },
        ],
      },
    ],
  },
  {
    group: "Business profiles",
    icon: Building2,
    items: [
      {
        id: "bingPlaces", name: "Microsoft Bing Places",
        desc: "Azure AD app powering Bing Places sync and performance pulls \u2014 impressions, clicks, calls and direction requests on Bing Search & Maps.",
        docs: "portal.azure.com \u2192 App registrations",
        fields: [
          { key: "clientId", label: "Application (client) ID", placeholder: "00000000-0000-0000-0000-000000000000" },
          { key: "clientSecret", label: "Client secret", secret: true, placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" },
          { key: "tenantId", label: "Directory (tenant) ID", optional: true, placeholder: "common" },
        ],
      },
      {
        id: "appleBusinessConnect", name: "Apple Business Connect",
        desc: "API key for Apple Maps place cards \u2014 pulls card views, call taps, direction taps and website taps for every location.",
        docs: "businessconnect.apple.com \u2192 API",
        fields: [
          { key: "teamId", label: "Team ID", placeholder: "e.g. 9AB12CD34E" },
          { key: "keyId", label: "Key ID", placeholder: "e.g. 2X9R4HXF34" },
          { key: "privateKey", label: "Private key (.p8)", secret: true, placeholder: "-----BEGIN PRIVATE KEY-----\u2026" },
        ],
      },
    ],
  },
  {
    group: "Email & security",
    icon: Shield,
    items: [
      {
        id: "smtp", name: "Email SMTP (2FA & notifications)",
        desc: "Used to email 2-factor verification codes when someone signs in from a new device or browser. Any TLS SMTP provider works (Google Workspace, SES, Postmark…). Without it, sign-in verification runs in labeled demo mode.",
        docs: "support.google.com/a/answer/176600",
        fields: [
          { key: "host", label: "SMTP host", placeholder: "smtp.gmail.com" },
          { key: "port", label: "Port (TLS)", placeholder: "465" },
          { key: "user", label: "Username", placeholder: "alerts@youragency.com" },
          { key: "pass", label: "Password / app password", secret: true, placeholder: "••••••••" },
          { key: "from", label: "From address", placeholder: "SERP Squad <alerts@youragency.com>" },
        ],
      },
    ],
  },
  {
    group: "Ads platforms",
    icon: Rocket,
    items: [
      {
        id: "metaAds", name: "Meta Ads (Facebook & Instagram)",
        desc: "Marketing API app for campaign creation, ad sets, creatives and Insights pulls across Facebook & Instagram.",
        docs: "developers.facebook.com/docs/marketing-apis",
        fields: [
          { key: "appId", label: "App ID", placeholder: "1234567890" },
          { key: "appSecret", label: "App secret", secret: true, placeholder: "••••••••" },
          { key: "accessToken", label: "System-user access token", secret: true, placeholder: "EAAG…" },
        ],
      },
      {
        id: "googleAds", name: "Google Ads API",
        desc: "Covers every Google Ads format — Search, Performance Max, Display, YouTube, Local Services. Uses the Google Cloud OAuth app above plus a developer token.",
        docs: "developers.google.com/google-ads/api",
        fields: [
          { key: "developerToken", label: "Developer token", secret: true, placeholder: "xxxxxxxxxxxxxxxxxxxxxx" },
          { key: "loginCustomerId", label: "Manager (MCC) customer ID", placeholder: "123-456-7890" },
        ],
      },
      {
        id: "tiktokAds", name: "TikTok Ads (Marketing API)",
        desc: "Business API app for TikTok campaign creation, ad groups, creatives and reporting.",
        docs: "business-api.tiktok.com/portal",
        fields: [
          { key: "appId", label: "App ID", placeholder: "7123456789" },
          { key: "appSecret", label: "App secret", secret: true, placeholder: "••••••••" },
          { key: "accessToken", label: "Long-term access token", secret: true, placeholder: "act.…" },
        ],
      },
      {
        id: "redditAds", name: "Reddit Ads API",
        desc: "Reddit Ads app credentials for campaigns, ad groups, promoted posts and reports.",
        docs: "ads-api.reddit.com/docs",
        fields: [
          { key: "clientId", label: "Client ID", placeholder: "xxxxxxxxxxxxxx" },
          { key: "clientSecret", label: "Client secret", secret: true, placeholder: "••••••••" },
          { key: "refreshToken", label: "Refresh token", secret: true, placeholder: "eyJ…" },
        ],
      },
      {
        id: "nextdoorAds", name: "Nextdoor Ads API (NAM)",
        desc: "Nextdoor Ads Manager API key — neighborhood-targeted campaigns and reporting.",
        docs: "developer.nextdoor.com",
        fields: [
          { key: "apiKey", label: "API key", secret: true, placeholder: "nd_…" },
        ],
      },
      {
        id: "yelpAds", name: "Yelp Ads API",
        desc: "Yelp Ads partner API for program creation (CPC budgets on the business listing) and reporting. Requires Yelp partner approval.",
        docs: "docs.developer.yelp.com/docs/ads-api",
        fields: [
          { key: "apiKey", label: "Partner API key", secret: true, placeholder: "••••••••" },
          { key: "businessId", label: "Default business ID", placeholder: "yelp-biz-id" },
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
    group: "Web 2.0 publishing apps",
    icon: Rocket,
    items: [
      {
        id: "wordpressCom", name: "WordPress.com OAuth app",
        desc: "Powers branded-site creation and article publishing on WordPress.com (Branding & Automation). Brand accounts authorize per client.",
        docs: "developer.wordpress.com/apps",
        fields: [
          { key: "clientId", label: "Client ID", placeholder: "WordPress.com app ID" },
          { key: "clientSecret", label: "Client Secret", secret: true, placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" },
        ],
      },
      {
        id: "tumblr", name: "Tumblr OAuth app",
        desc: "Consumer credentials for branded Tumblr blogs \u2014 site provisioning and scheduled article posts.",
        docs: "tumblr.com/oauth/apps",
        fields: [
          { key: "consumerKey", label: "Consumer key", placeholder: "OAuth consumer key" },
          { key: "consumerSecret", label: "Consumer secret", secret: true, placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" },
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

export { API_GUIDES } from "../../data/apiGuides.js";
import { API_GUIDES } from "../../data/apiGuides.js";

export const apiStatus = (company, api) =>
  api.useDfs ? company.dfs.connected : !!company.apis?.[api.id]?.connected;

const AI_PROVIDER_IDS = ["claude", "openai", "gemini", "deepseek"];
/* which provider currently performs AI operations (explicit pick or fallback) */
export const effectiveAiId = (company) => {
  const ok = (id) => company.apis?.[id]?.connected && company.apis[id].values?.apiKey;
  if (company.activeAi && ok(company.activeAi)) return company.activeAi;
  return AI_PROVIDER_IDS.find(ok) || null;
};

export function ApiCard({ api, company, onChange }) {
  const stored = api.useDfs
    ? { login: company.dfs.login, password: company.dfs.password }
    : (company.apis?.[api.id]?.values || {});
  const connected = apiStatus(company, api);
  const [draft, setDraft] = useState(stored);
  const [reveal, setReveal] = useState(false);
  const setField = (key, v) => setDraft((d) => ({ ...d, [key]: v }));
  const filled = api.fields.filter((f) => !f.optional).every((f) => (draft[f.key] || "").trim());

  const save = () => {
    if (api.useDfs) {
      onChange({ dfs: { login: draft.login || "", password: draft.password || "", connected: filled } });
      /* fetch the balance with the JUST-ENTERED creds directly — avoids a
         stale read of company.dfs before the save has propagated */
      if (filled) fetchBalance({ login: draft.login.trim(), password: draft.password.trim() });
    } else onChange({ apis: { ...(company.apis || {}), [api.id]: { values: draft, connected: filled } } });
  };
  const disconnect = () => {
    if (!askDisconnect(`the ${api.name} connection`)) return;
    if (api.useDfs) onChange({ dfs: { ...company.dfs, connected: false } });
    else onChange({
      apis: { ...(company.apis || {}), [api.id]: { values: draft, connected: false } },
      ...(company.activeAi === api.id ? { activeAi: null } : {}), // active pick falls back to the next connected provider
    });
  };

  /* live DataForSEO account balance (real appendix/user_data call) */
  const [balance, setBalance] = useState(null); // { busy } | { err } | data
  const fetchBalance = async (creds) => {
    const dfs = creds || { login: company.dfs.login, password: company.dfs.password };
    setBalance({ busy: true });
    try {
      const r = await fetch("/api/dfs-balance", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(25000),
        body: JSON.stringify({ dfs }) });
      const d = await r.json().catch(() => ({}));
      setBalance(r.ok ? d : { err: d.detail || `HTTP ${r.status}` });
    } catch { setBalance({ err: "API server unreachable (npm run api) — the balance check runs server-side." }); }
  };
  useEffect(() => { if (api.useDfs && connected) fetchBalance(); }, [api.useDfs, connected]); // eslint-disable-line

  const isAiProvider = AI_PROVIDER_IDS.includes(api.id);
  const activeAi = isAiProvider ? effectiveAiId(company) : null;
  const isActiveAi = isAiProvider && connected && activeAi === api.id;

  return (
    <div className="rounded-xl border bg-white p-4" style={isActiveAi ? { borderColor: "#86EFAC" } : { borderColor: "#E5E7EB" }}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-[13px] font-semibold">{api.name}</div>
          <GuideTip title={`How to connect ${api.name}`} accent={company.accent}
            steps={API_GUIDES[api.id] || [`Create the credential in the provider's developer console (see docs).`, `Paste the value(s) into the fields below and hit Save.`, `The entry flips to “Connected” once every required field is filled.`]}
            docs={api.docs} />
          {isActiveAi && (
            <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
              title={company.activeAi === api.id ? "Explicitly activated — performs every AI operation" : "Active by default (first connected) — pick another provider to change"}>
              ★ Active{company.activeAi === api.id ? "" : " (default)"}
            </span>
          )}
        </div>
        <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={connected ? { background: "#DCFCE7", color: "#166534" } : { background: "#FEE2E2", color: "#991B1B" }}>
          {connected ? "● Connected" : "○ Not connected"}
        </span>
      </div>
      <p className="mb-3 text-[11.5px] leading-relaxed text-gray-400">{api.desc}</p>
      {api.useDfs && connected && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2">
          <span className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Account balance</span>
          {balance?.busy && <span className="ll-mono text-[11px] text-gray-400">checking…</span>}
          {balance?.err && <span className="min-w-0 flex-1 text-[10.5px] leading-snug text-amber-700">{balance.err}</span>}
          {balance?.live && (() => {
            /* DataForSEO can return balance as a string — coerce before formatting */
            const bal = Number(balance.balance);
            const hasBal = Number.isFinite(bal);
            return (
              <>
                <span className="ll-display text-[16px] font-bold" style={{ color: hasBal && bal > 5 ? "#16A34A" : "#DC2626" }}>
                  {hasBal ? "$" + bal.toFixed(2) : "—"}
                </span>
                {Number.isFinite(Number(balance.dayLimit)) && <span className="ll-mono text-[9.5px] text-gray-400">day limit ${Number(balance.dayLimit)}</span>}
                <span className="ll-mono text-[9.5px] text-gray-400">{String(balance.login || "")}</span>
                {hasBal && bal <= 5 && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[8.5px] font-bold uppercase text-red-600">low — top up</span>}
              </>
            );
          })()}
          <button onClick={fetchBalance} disabled={balance?.busy} title="Refresh balance from DataForSEO"
            className="ml-auto rounded-lg border border-gray-200 px-2 py-1 text-[10px] font-semibold text-gray-500 hover:border-gray-300 disabled:opacity-50">
            ↻ Refresh
          </button>
        </div>
      )}
      {isAiProvider && connected && !isActiveAi && (
        <button onClick={() => onChange({ activeAi: api.id })}
          className="mb-3 w-full rounded-lg border border-emerald-300 bg-emerald-50 py-1.5 text-[11.5px] font-semibold text-emerald-700 hover:bg-emerald-100">
          ★ Use this provider for all AI operations
        </button>
      )}
      {isActiveAi && company.activeAi !== api.id && (
        <button onClick={() => onChange({ activeAi: api.id })}
          className="mb-3 w-full rounded-lg border border-gray-200 py-1.5 text-[11px] font-medium text-gray-500 hover:border-gray-300"
          title="Currently active only because it's the first connected — pin it so adding other providers can't change it">
          Pin as the explicit choice
        </button>
      )}
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

export function ApiSettingsSection({ company, onChange }) {
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

export function CompanyBrandSection({ company, onChange, onGoApis }) {
  const allApis = API_REGISTRY.flatMap((g) => g.items);
  const connectedCount = allApis.filter((a) => apiStatus(company, a)).length;
  /* edits stay local until Save is clicked */
  const { draft, set, dirty, reset } = useDraft(company, ["name", "accent", "logo", "appDomain", "sidebarColor", "sidebarText"]);
  return (
    <div className="ll-fade grid gap-5 lg:grid-cols-2">
      <Card className="p-5">
        <div className="mb-1 flex items-center gap-2"><Palette size={16} className="text-gray-400" /><span className="ll-display text-[15px] font-semibold">Brand customization</span></div>
        <p className="mb-4 text-[12px] text-gray-400">Your agency identity — shown across the dashboard, client logins and non-white-label reports.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Company name">
            <input value={draft.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} />
          </Labeled>
          <Labeled label="Brand color">
            <div className="flex items-center gap-2">
              <input type="color" value={draft.accent} onChange={(e) => set({ accent: e.target.value })} className="h-9 w-14 cursor-pointer rounded border border-gray-200" />
              <span className="ll-mono text-[12px] text-gray-500">{draft.accent}</span>
            </div>
          </Labeled>
        </div>
        <div className="mt-3">
          <Labeled label="Company logo">
            <LogoUpload value={draft.logo} onChange={(logo) => set({ logo })} />
          </Labeled>
        </div>
        <div className="mt-3">
          <Labeled label="App domain (pixel & public links)">
            <input value={draft.appDomain || ""} onChange={(e) => set({ appDomain: e.target.value })}
              placeholder="auto — detected from where the CRM is hosted (e.g. app.serpsquad.com)" className={"ll-mono " + inputCls} />
            <p className="mt-1 text-[10.5px] text-gray-400">
              Leave blank for automatic: when this CRM is served from any real domain or subdomain, pixel snippets and
              public links adopt it instantly. Set a value only to force a specific origin.
            </p>
          </Labeled>
        </div>
        <div className="mt-3">
          <Labeled label="Dashboard sidebar background">
            <div className="flex flex-wrap items-center gap-2">
              {["#FFFFFF", "#F8FAFC", "#1F2A44", "#0F172A", "#111827", "#0E7C66", "#312E81", "#3B0764"].map((c) => (
                <button key={c} onClick={() => set({ sidebarColor: c === "#FFFFFF" ? null : c })} title={c}
                  className="h-7 w-7 rounded-lg border"
                  style={{ background: c, borderColor: (draft.sidebarColor || "#FFFFFF") === c ? draft.accent : "#E5E7EB", borderWidth: (draft.sidebarColor || "#FFFFFF") === c ? 2 : 1 }} />
              ))}
              <input type="color" value={draft.sidebarColor || "#FFFFFF"} onChange={(e) => set({ sidebarColor: e.target.value })}
                className="h-7 w-12 cursor-pointer rounded border border-gray-200" title="Custom color" />
              <span className="ll-mono text-[11px] text-gray-500">{draft.sidebarColor || "default"}</span>
              {draft.sidebarColor && (
                <button onClick={() => set({ sidebarColor: null })} className="rounded-lg border border-gray-200 px-2 py-1 text-[10.5px] font-semibold text-gray-500 hover:border-gray-300">Reset</button>
              )}
            </div>
            <p className="mt-1 text-[10.5px] text-gray-400">Sidebar text and icons adapt automatically for readability on the color you pick. Changes preview after Save.</p>
          </Labeled>
        </div>
        <div className="mt-3">
          <Labeled label="Sidebar text color">
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => set({ sidebarText: null })} title="Auto — picked for contrast with the background"
                className="rounded-lg border px-2.5 py-1 text-[10.5px] font-semibold"
                style={!draft.sidebarText ? { borderColor: draft.accent, borderWidth: 2, color: draft.accent } : { borderColor: "#E5E7EB", color: "#6B7280" }}>
                Auto
              </button>
              {["#F9FAFB", "#E2E8F0", "#FBBF24", "#6EE7B7", "#93C5FD", "#1F2937", "#0F766E"].map((c) => (
                <button key={c} onClick={() => set({ sidebarText: c })} title={c}
                  className="h-7 w-7 rounded-lg border"
                  style={{ background: c, borderColor: draft.sidebarText === c ? draft.accent : "#E5E7EB", borderWidth: draft.sidebarText === c ? 2 : 1 }} />
              ))}
              <input type="color" value={draft.sidebarText || "#1F2937"} onChange={(e) => set({ sidebarText: e.target.value })}
                className="h-7 w-12 cursor-pointer rounded border border-gray-200" title="Custom text color" />
              <span className="ll-mono text-[11px] text-gray-500">{draft.sidebarText || "auto"}</span>
            </div>
            <p className="mt-1 text-[10.5px] text-gray-400">Auto keeps text readable for any background; pick a custom color to brand it — muted labels and icons derive from it automatically.</p>
          </Labeled>
        </div>
        <SaveBar dirty={dirty} onSave={() => onChange(draft)} onReset={reset} accent={draft.accent} />
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

export function TeamSection({ company, onChange, clients }) {
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
        <b className="text-gray-700">Access strategy:</b> <b>Admins</b> automatically get Performance Studio, Ads, Project Management, Optimization Studio and the Report Builder, and can create clients/projects and assign the team.
        <b> Managers</b> automatically get Performance Studio, Project Management and the Report Builder on assigned projects — anything else is granted per project by the owner or an admin (admins can only grant what they themselves have).
        <b> Content Developers</b> and <b>Web Developers</b> automatically see Project Management only; <b>Paid Ads Managers</b> see Project Management plus the Ads dashboards. Extra sections are added per project in Project settings → Team. Every action is recorded in the Activity log.
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
                    <select value={m.role} onChange={(e) => setRole(m, e.target.value)} className={inputCls + " w-auto bg-white"}>
                      {Object.keys(ROLE_PRESETS).map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
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
                        Assigning a project doesn't reveal it yet — open the client's settings (gear on the client in the sidebar) → <b>Team</b> tab to grant which sections this member can access.
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
            <Labeled label="Role">
              <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value, perms: { ...ROLE_PRESETS[e.target.value] } })} className={inputCls + " bg-white"}>
                {Object.keys(ROLE_PRESETS).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Labeled>
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

export function ActivitySection({ company }) {
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

export function AccountingSection({ company, onChange, clients }) {
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

export function InvoiceSection({ company, onChange, clients }) {
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

export function CompanyPage({ company, onChange, clients, onBack, dark, setDark }) {
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

