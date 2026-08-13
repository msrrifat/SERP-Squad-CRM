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
import { GuideTip, Ava, BrandMark, Card, DarkToggle, FONT_CSS, Labeled, LogoUpload, NEG, POS, ProjectMark, RoleBadge, SaveBar, Seg, Toggle, askDelete, askDisconnect, inputCls, tooltipStyle, useDraft } from "../../ui/primitives.jsx";
import { ROLE_PRESETS } from "../../data/seed.js";
import { isoDate } from "../../lib/months.jsx";
import { relTime } from "../../lib/format.jsx";
import { AccountingSection } from "./accounting.jsx";

export const API_REGISTRY = [
  {
    group: "Social connectors",
    icon: Share2,
    items: [
      {
        id: "metaApp", name: "Meta app (Facebook + Instagram)",
        desc: "One Meta app covers both Facebook Pages and Instagram Business. Publishing permissions (pages_manage_posts, instagram_content_publish) need Meta App Review before they work on accounts other than your own.",
        docs: "developers.facebook.com/apps → Create app (Business) → Facebook Login → Settings",
        fields: [
          { key: "clientId", label: "App ID", placeholder: "1234567890" },
          { key: "clientSecret", label: "App Secret", secret: true, placeholder: "••••••••" },
        ],
      },
      {
        id: "threadsApp", name: "Threads app",
        desc: "Threads uses its own app and scopes (threads_basic, threads_content_publish), separate from the Facebook/Instagram app.",
        docs: "developers.facebook.com/apps → Threads API",
        fields: [
          { key: "clientId", label: "App ID" },
          { key: "clientSecret", label: "App Secret", secret: true },
        ],
      },
      {
        id: "linkedinApp", name: "LinkedIn app",
        desc: "Posting as a person needs w_member_social; posting as a company Page needs the Community Management API, which LinkedIn reviews before granting.",
        docs: "linkedin.com/developers/apps → Auth",
        fields: [
          { key: "clientId", label: "Client ID" },
          { key: "clientSecret", label: "Client Secret", secret: true },
        ],
      },
      {
        id: "xApp", name: "X (Twitter) app",
        desc: "OAuth 2.0 with PKCE. Posting requires a PAID API tier — the free tier cannot publish, so connecting will succeed and publishing will not.",
        docs: "developer.x.com → Projects & Apps → User authentication settings",
        fields: [
          { key: "clientId", label: "OAuth 2.0 Client ID" },
          { key: "clientSecret", label: "OAuth 2.0 Client Secret", secret: true },
        ],
      },
      {
        id: "tiktokApp", name: "TikTok app",
        desc: "Content Posting API. TikTok reviews the app before video.publish is granted, and unaudited apps can only post privately.",
        docs: "developers.tiktok.com → Manage apps → Login Kit + Content Posting API",
        fields: [
          { key: "clientId", label: "Client key" },
          { key: "clientSecret", label: "Client secret", secret: true },
        ],
      },
      {
        id: "pinterestApp", name: "Pinterest app",
        desc: "Trial access allows your own boards; wider access needs Pinterest's app review.",
        docs: "developers.pinterest.com/apps",
        fields: [
          { key: "clientId", label: "App ID" },
          { key: "clientSecret", label: "App secret", secret: true },
        ],
      },
    ],
  },
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
  const disconnect = async () => {
    if (!await askDisconnect(`the ${api.name} connection`)) return;
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

export /* One team member's editable record. Edits are held as a DRAFT and only
   applied on Save: changing someone's role, password or permissions the moment
   a key is pressed gives no chance to reconsider, and no signal that anything
   was stored. */
function MemberPanel({ member, company, allProjects, permMeta, accent, onSave, onRemove }) {
  const { draft, set, dirty, reset } = useDraft(member, ["name", "email", "password", "role", "perms", "projects"]);
  const setRoleDraft = (role) => set({ role, perms: { ...ROLE_PRESETS[role] },
    projects: role === "Admin" ? "all" : (draft.projects === "all" ? [] : draft.projects) });
  const toggleProj = (pid) => {
    const cur = draft.projects === "all" ? allProjects.map((p) => p.id) : (draft.projects || []);
    set({ projects: cur.includes(pid) ? cur.filter((x) => x !== pid) : [...cur, pid] });
  };
  return (
    <div className="ll-fade space-y-4 border-t border-gray-100 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Labeled label="Name"><input value={draft.name || ""} onChange={(e) => set({ name: e.target.value })} className={inputCls} /></Labeled>
        <Labeled label="Login email"><input value={draft.email || ""} onChange={(e) => set({ email: e.target.value })} className={inputCls} /></Labeled>
        <Labeled label="Password"><input value={draft.password || ""} onChange={(e) => set({ password: e.target.value })} placeholder="Set a password" className={"ll-mono " + inputCls} /></Labeled>
      </div>
      <Labeled label="Role — sets a permission preset you can fine-tune below">
        <select value={draft.role} onChange={(e) => setRoleDraft(e.target.value)} className={inputCls + " w-auto bg-white"}>
          {Object.keys(ROLE_PRESETS).map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </Labeled>
      {draft.role !== "Admin" && (
        <Labeled label="Project access">
          <div className="mb-1.5">
            <button onClick={() => set({ projects: draft.projects === "all" ? [] : "all" })}
              className="rounded-lg border px-3 py-1.5 text-[12px] font-medium"
              style={draft.projects === "all" ? { background: accent, borderColor: accent, color: "#fff" } : { borderColor: "#E5E7EB", color: "#4B5563" }}>
              All projects {draft.projects === "all" ? "✓" : ""}
            </button>
          </div>
          <div className="mb-1.5 rounded-lg bg-gray-50 px-2.5 py-1.5 text-[10.5px] text-gray-500">
            Assigning a project doesn't reveal it yet — open the client's settings (gear on the client in the sidebar) → <b>Team</b> tab to grant which sections this member can access.
          </div>
          {draft.projects !== "all" && (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {allProjects.map((p) => {
                const on = (draft.projects || []).includes(p.id);
                return (
                  <button key={p.id} onClick={() => toggleProj(p.id)}
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
          {permMeta.map(([key, label, desc]) => (
            <Toggle key={key} label={label} desc={desc} on={!!(draft.perms || {})[key]}
              onChange={(v) => set({ perms: { ...(draft.perms || {}), [key]: v } })} />
          ))}
        </div>
      </Labeled>
      <SaveBar dirty={dirty} onSave={() => onSave(draft)} onReset={reset} accent={accent} savedLabel="Saved" saveLabel="Save member" />
      {onRemove && (
        <button onClick={onRemove} className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-red-500">
          <Trash2 size={13} /> Remove team member
        </button>
      )}
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
  const removeMember = async (id) => {
    /* removing a member drops their access and their assignment history —
       always ask first */
    const m = team.find((x) => x.id === id);
    if (!await askDelete(`${m?.name || "this team member"} from the team`)) return;
    onChange({ team: team.filter((x) => x.id !== id) });
  };
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
                {/* Ava, not hand-rolled initials — this list built its own
                    initials tile, so a member with a profile picture appeared
                    as a photo in the account panel and as letters here. */}
                <Ava name={m.name} img={m.avatar} size={36} />
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
                <MemberPanel member={m} company={company} allProjects={allProjects} permMeta={PERM_META}
                  accent={company.accent} onSave={(vals) => patchMember(m.id, vals)}
                  onRemove={m.isOwner ? null : () => removeMember(m.id)} />
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
            {/* only a name here, so the picture comes from the shared
                name -> avatar directory set in App */}
            <Ava name={a.member} size={32} />
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

/* =====================================================================
   INVOICES

   The tab opens on what you have already issued. Creating one is a
   deliberate step from there, and the result is SAVED — an invoice you
   printed and closed used to leave no record at all, so nothing knew what
   had been billed, to whom, or whether it was paid.

   Everything printable is driven by saved settings (company.invoice), never
   by component defaults. An earlier version shipped a fake billing address,
   a fake email and a sample line priced at 1500, all of which printed on a
   real invoice unless someone noticed. A field with nothing behind it now
   renders as nothing.

   Money is computed in integer cents. Multiplying floats and summing them
   drifts, and on an invoice that drift is a wrong number sent to a client.
   ===================================================================== */
const CURRENCIES = ["USD", "CAD", "GBP", "EUR", "AUD", "BDT", "INR", "AED", "SGD", "NZD"];
const INV_STATUS = { draft: "Draft", sent: "Sent", paid: "Paid" };
const STATUS_TONE = {
  draft: { bg: "#F1F5F9", fg: "#475569" },
  sent:  { bg: "#DBEAFE", fg: "#1D4ED8" },
  paid:  { bg: "#DCFCE7", fg: "#166534" },
};

const toCents = (v) => Math.round((parseFloat(v) || 0) * 100);
const lineCents = (x) => Math.round((parseFloat(x.qty) || 0) * toCents(x.rate));
const invTotals = (d) => {
  const subtotal = (d.items || []).reduce((s, x) => s + lineCents(x), 0);
  const tax = Math.round(subtotal * (parseFloat(d.taxPct) || 0) / 100);
  const total = subtotal + tax;
  const paid = toCents(d.paid);
  return { subtotal, tax, total, paid, balance: total - paid };
};
const fmtMoney = (cents, cur) => {
  const n = (cents || 0) / 100;
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur || "USD" }).format(n); }
  catch { return `${cur || ""} ${n.toFixed(2)}`.trim(); }
};

/* branding + footer: saved once, used by every invoice */
function InvoiceSettings({ company, onChange }) {
  const inv = company.invoice || {};
  const setInv = (p) => onChange({ invoice: { ...(company.invoice || {}), ...p } });
  const accent = inv.accent || company.accent;
  return (
    <Card className="no-print ll-fade space-y-4 p-4">
      <div className="text-[12.5px] text-gray-400">
        Saved once and used on every invoice. Anything left empty is simply left off the invoice.
        The client's own logo comes from Client settings and appears beside their details in Bill to.
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Labeled label="Business name on invoices"><input value={inv.legalName || ""} onChange={(e) => setInv({ legalName: e.target.value })} placeholder={company.name || ""} className={inputCls} /></Labeled>
        <Labeled label="Billing email"><input value={inv.email || ""} onChange={(e) => setInv({ email: e.target.value })} className={inputCls} /></Labeled>
        <Labeled label="Phone"><input value={inv.phone || ""} onChange={(e) => setInv({ phone: e.target.value })} className={inputCls} /></Labeled>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Labeled label="Business address"><textarea rows={2} value={inv.address || ""} onChange={(e) => setInv({ address: e.target.value })} className={inputCls + " resize-none"} /></Labeled>
        <Labeled label="Tax / VAT / registration no."><input value={inv.taxId || ""} onChange={(e) => setInv({ taxId: e.target.value })} className={inputCls} /></Labeled>
        <Labeled label="Website shown on invoice"><input value={inv.website || ""} onChange={(e) => setInv({ website: e.target.value })} className={inputCls} /></Labeled>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Labeled label="Currency">
          <select value={inv.currency || "USD"} onChange={(e) => setInv({ currency: e.target.value })} className={inputCls + " bg-white"}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Labeled>
        <Labeled label="Invoice no. prefix"><input value={inv.numberPrefix || ""} onChange={(e) => setInv({ numberPrefix: e.target.value })} placeholder="INV" className={inputCls} /></Labeled>
        <Labeled label="Next number"><input value={inv.nextNumber ?? ""} onChange={(e) => setInv({ nextNumber: e.target.value.replace(/\D/g, "") })} placeholder="1" className={"ll-mono " + inputCls} /></Labeled>
        <Labeled label="Payment due in (days)"><input value={inv.dueDays ?? ""} onChange={(e) => setInv({ dueDays: e.target.value.replace(/\D/g, "") })} placeholder="14" className={"ll-mono " + inputCls} /></Labeled>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="Default payment terms / notes"><textarea rows={2} value={inv.terms || ""} onChange={(e) => setInv({ terms: e.target.value })} className={inputCls + " resize-none"} /></Labeled>
        <Labeled label="Payment details (bank, PayPal, Wise…)"><textarea rows={2} value={inv.paymentDetails || ""} onChange={(e) => setInv({ paymentDetails: e.target.value })} className={inputCls + " resize-none"} /></Labeled>
      </div>
      <Labeled label="Footer line — printed at the bottom of every invoice">
        <input value={inv.footer || ""} onChange={(e) => setInv({ footer: e.target.value })} className={inputCls} />
      </Labeled>
      <div className="flex flex-wrap items-end gap-5">
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Invoice logo</div>
          <LogoUpload value={inv.logo || null} onChange={(logo) => setInv({ logo })} label={company.logo ? "Override company logo" : "Upload logo"} />
          <div className="mt-1 text-[10.5px] text-gray-400">{inv.logo ? "Used on invoices only." : "Falling back to the company logo."}</div>
        </div>
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Accent</div>
          <div className="flex items-center gap-2">
            <input type="color" value={accent} onChange={(e) => setInv({ accent: e.target.value })} className="h-8 w-12 cursor-pointer rounded border border-gray-200 bg-white" />
            {inv.accent && <button onClick={() => setInv({ accent: null })} className="text-[11px] text-gray-400 hover:text-gray-600">Use company accent</button>}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ---------------- the invoice itself ---------------- */
function InvoiceEditor({ company, clients, initial, onSave, onCancel }) {
  const inv = company.invoice || {};
  const [d, setD] = useState(initial);
  const set = (p) => setD((x) => ({ ...x, ...p }));
  const setItem = (id, p) => setD((x) => ({ ...x, items: x.items.map((i) => (i.id === id ? { ...i, ...p } : i)) }));

  const client = clients.find((c) => c.id === d.clientId) || null;
  /* Two brands appear on an invoice and they are not interchangeable: the
     issuer at the top is YOUR company, the client's mark belongs beside their
     details in Bill to. */
  const brandName = inv.legalName || company.name || "";
  const brandLogo = inv.logo || company.logo || null;
  const accent = inv.accent || company.accent;
  const clientName = client ? (client.companyName || client.name) : "";
  const clientLogo = client ? (client.logo || client.whiteLabel?.logo || null) : null;

  const cur = d.currency || inv.currency || "USD";
  const t = invTotals(d);
  const fmt = (c) => fmtMoney(c, cur);
  const th = "px-3 py-2 text-left text-[9.5px] font-semibold uppercase tracking-wider text-gray-400";
  const Line = ({ children }) => (children ? <div className="text-[12px] leading-snug text-gray-500">{children}</div> : null);

  return (
    <div className="ll-fade space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <button onClick={onCancel} className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] font-medium text-gray-600 hover:border-gray-300">
          <ArrowLeft size={14} /> All invoices
        </button>
        <select value={d.clientId} onChange={(e) => set({ clientId: e.target.value })} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[13px] font-medium">
          {clients.length === 0 && <option value="">No clients yet</option>}
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={d.status} onChange={(e) => set({ status: e.target.value })} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] font-medium">
          {Object.entries(INV_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button onClick={() => onSave(d)} className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12.5px] font-semibold text-white" style={{ background: accent }}>
          Save invoice
        </button>
        <button onClick={() => window.print()} className="ml-auto flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] font-medium text-gray-600 hover:border-gray-300">
          <Printer size={14} /> Print / PDF
        </button>
      </div>

      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-9 shadow-sm">
        <div className="mb-7 flex items-start justify-between gap-6 border-b pb-6" style={{ borderColor: accent + "33" }}>
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-3">
              <BrandMark name={brandName || "—"} logo={brandLogo} accent={accent} size="lg" />
              <span className="ll-display truncate text-[22px] font-bold tracking-tight">{brandName}</span>
            </div>
            {(inv.address || "").split("\n").filter(Boolean).map((l, i) => <Line key={i}>{l}</Line>)}
            <Line>{inv.email}</Line>
            <Line>{inv.phone}</Line>
            <Line>{inv.website}</Line>
            <Line>{inv.taxId}</Line>
          </div>
          <div className="shrink-0 text-right">
            <div className="ll-display text-[28px] font-bold tracking-tight" style={{ color: accent }}>INVOICE</div>
            <div className="mt-2 space-y-1 text-[12px]">
              <div className="flex items-center justify-end gap-2"><span className="text-gray-400">No.</span>
                <input value={d.no} onChange={(e) => set({ no: e.target.value })} className="ll-mono w-40 rounded border border-gray-200 px-2 py-1 text-right text-[12px]" /></div>
              <div className="flex items-center justify-end gap-2"><span className="text-gray-400">Issued</span>
                <input type="date" value={d.issueDate} onChange={(e) => set({ issueDate: e.target.value })} className="ll-mono rounded border border-gray-200 px-2 py-1 text-[12px]" /></div>
              <div className="flex items-center justify-end gap-2"><span className="text-gray-400">Due</span>
                <input type="date" value={d.dueDate} onChange={(e) => set({ dueDate: e.target.value })} className="ll-mono rounded border border-gray-200 px-2 py-1 text-[12px]" /></div>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Bill to</div>
          {client ? (
            <div className="flex items-start gap-3 leading-relaxed">
              <BrandMark name={clientName || "—"} logo={clientLogo} accent={accent} size="lg" />
              <div className="min-w-0">
                <div className="ll-display text-[16px] font-semibold">{clientName}</div>
                <Line>{[client.contact && `Attn: ${client.contact}`, client.email, client.phone].filter(Boolean).join(" · ")}</Line>
                <Line>{[client.companyWebsite, client.address].filter(Boolean).join(" · ")}</Line>
              </div>
            </div>
          ) : <div className="text-[12.5px] text-gray-400">Add a client to bill.</div>}
          <div className="no-print mt-1 text-[10.5px] text-gray-300">Auto-filled from Client settings — edit it there to change.</div>
        </div>

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
            {d.items.map((x) => (
              <tr key={x.id} className="border-b border-gray-50 align-top">
                <td className="px-3 py-2">
                  <textarea value={x.desc} onChange={(e) => setItem(x.id, { desc: e.target.value })} rows={Math.max(1, Math.ceil((x.desc || "").length / 55))}
                    placeholder="Describe the work…" className="w-full resize-none border-0 bg-transparent outline-none" />
                </td>
                <td className="px-3 py-2"><input value={x.qty} onChange={(e) => setItem(x.id, { qty: e.target.value.replace(/[^0-9.]/g, "") })} className="ll-mono w-12 rounded border border-gray-100 px-1.5 py-0.5 text-center" /></td>
                <td className="px-3 py-2"><input value={x.rate} onChange={(e) => setItem(x.id, { rate: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="0.00" className="ll-mono w-24 rounded border border-gray-100 px-1.5 py-0.5 text-right" /></td>
                <td className="ll-mono px-3 py-2 text-right font-semibold">{fmt(lineCents(x))}</td>
                <td className="no-print px-1 py-2">
                  <button onClick={() => setD((y) => (y.items.length > 1 ? { ...y, items: y.items.filter((i) => i.id !== x.id) } : y))}
                    title={d.items.length > 1 ? "Remove line" : "An invoice needs at least one line"}
                    className="text-gray-300 hover:text-red-500 disabled:opacity-30" disabled={d.items.length <= 1}><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={() => setD((y) => ({ ...y, items: [...y.items, { id: "i" + Date.now(), desc: "", qty: "1", rate: "" }] }))}
          className="no-print mt-2 flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-[12px] font-medium text-gray-400 hover:border-gray-400 hover:text-gray-600">
          <Plus size={12} /> Add line item
        </button>

        <div className="mt-5 flex justify-end">
          <div className="w-72 space-y-1.5 text-[13px]">
            <div className="flex justify-between text-gray-500"><span>Subtotal</span><span className="ll-mono">{fmt(t.subtotal)}</span></div>
            <div className="flex items-center justify-between text-gray-500">
              <span className="flex items-center gap-1.5">
                <input value={d.taxLabel} onChange={(e) => set({ taxLabel: e.target.value })} className="w-16 rounded border border-transparent bg-transparent px-1 text-[13px] hover:border-gray-200" />
                <input value={d.taxPct} onChange={(e) => set({ taxPct: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="0" className="ll-mono w-12 rounded border border-gray-200 px-1 py-0.5 text-center text-[11px]" />%
              </span>
              <span className="ll-mono">{fmt(t.tax)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 text-[18px] font-bold" style={{ borderColor: accent + "33", color: accent }}>
              <span className="ll-display">Total</span><span className="ll-mono">{fmt(t.total)}</span>
            </div>
            <div className="flex items-center justify-between text-gray-500">
              <span className="no-print flex items-center gap-1.5">Amount paid
                <input value={d.paid} onChange={(e) => set({ paid: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="0.00" className="ll-mono w-20 rounded border border-gray-200 px-1 py-0.5 text-right text-[11px]" />
              </span>
              {t.paid > 0 && <span className="ll-mono">−{fmt(t.paid)}</span>}
            </div>
            {t.paid > 0 && (
              <div className="flex justify-between border-t pt-2 text-[15px] font-bold" style={{ borderColor: accent + "33" }}>
                <span className="ll-display">Balance due</span><span className="ll-mono">{fmt(t.balance)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-7 grid gap-6 border-t border-gray-100 pt-4 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Notes &amp; payment terms</div>
            <textarea value={d.notes} onChange={(e) => set({ notes: e.target.value })} rows={3} placeholder="Add terms for this invoice…"
              className="w-full resize-none border-0 bg-transparent text-[12.5px] leading-relaxed text-gray-600 outline-none" />
          </div>
          {inv.paymentDetails && (
            <div>
              <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Payment details</div>
              <div className="whitespace-pre-line text-[12.5px] leading-relaxed text-gray-600">{inv.paymentDetails}</div>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-3 text-[10.5px] text-gray-400">
          <span>{inv.footer || ""}</span>
          <span className="ll-mono">{d.no}</span>
        </div>
      </div>
    </div>
  );
}

export function InvoiceSection({ company, onChange, clients }) {
  const inv = company.invoice || {};
  const saved = company.invoices || [];
  const [editing, setEditing] = useState(null);      // the invoice being edited
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filter, setFilter] = useState("all");

  const accent = inv.accent || company.accent;
  const nameOf = (cid) => { const c = clients.find((x) => x.id === cid); return c ? (c.companyName || c.name) : "—"; };

  const blank = () => {
    const today = new Date();
    const dueDays = Number.isFinite(+inv.dueDays) && +inv.dueDays >= 0 ? +inv.dueDays : 14;
    const n = parseInt(inv.nextNumber || 1, 10) || 1;
    return {
      id: "inv" + Date.now().toString(36),
      no: `${inv.numberPrefix || "INV"}-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}-${String(n).padStart(3, "0")}`,
      clientId: clients[0]?.id || "",
      status: "draft",
      currency: inv.currency || "USD",
      issueDate: isoDate(today),
      dueDate: isoDate(new Date(today.getTime() + dueDays * 86400000)),
      taxLabel: inv.taxLabel || "Tax", taxPct: "", paid: "",
      notes: inv.terms || "",
      items: [{ id: "i1", desc: "", qty: "1", rate: "" }],
      createdAt: Date.now(),
    };
  };

  const saveInvoice = (data) => {
    const exists = saved.some((x) => x.id === data.id);
    const t = invTotals(data);
    /* the computed totals are stored with the invoice, so the list shows what
       was actually issued rather than re-deriving it later */
    const rec = { ...data, updatedAt: Date.now(), totalCents: t.total, balanceCents: t.balance };
    const patch = { invoices: exists ? saved.map((x) => (x.id === rec.id ? rec : x)) : [rec, ...saved] };
    if (!exists) {
      const n = parseInt(inv.nextNumber || 1, 10) || 1;
      patch.invoice = { ...(company.invoice || {}), nextNumber: n + 1 };
    }
    onChange(patch);
    setEditing(null);
  };

  if (editing) {
    return (
      <div className="space-y-4">
        {settingsOpen && <InvoiceSettings company={company} onChange={onChange} />}
        <InvoiceEditor company={company} clients={clients} initial={editing}
          onSave={saveInvoice} onCancel={() => setEditing(null)} />
      </div>
    );
  }

  const rows = saved
    .filter((x) => filter === "all" || x.status === filter)
    .slice()
    .sort((a, b) => String(b.issueDate).localeCompare(String(a.issueDate)) || (b.createdAt || 0) - (a.createdAt || 0));
  const today = isoDate(new Date());
  const sum = (st) => saved.filter((x) => (st ? x.status === st : true)).reduce((s, x) => s + (x.totalCents || 0), 0);

  return (
    <div className="ll-fade space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <button onClick={() => setEditing(blank())} disabled={clients.length === 0}
          title={clients.length === 0 ? "Add a client first" : "Create a new invoice"}
          className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
          <Plus size={14} /> New invoice
        </button>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] font-medium text-gray-600">
          <option value="all">All ({saved.length})</option>
          {Object.entries(INV_STATUS).map(([k, v]) => <option key={k} value={k}>{v} ({saved.filter((x) => x.status === k).length})</option>)}
        </select>
        <button onClick={() => setSettingsOpen((v) => !v)}
          className="ml-auto flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] font-medium text-gray-600 hover:border-gray-300">
          <Settings2 size={14} /> Branding &amp; footer
        </button>
      </div>

      {settingsOpen && <InvoiceSettings company={company} onChange={onChange} />}

      {saved.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Invoiced</div><div className="ll-mono mt-0.5 text-[17px] font-bold">{fmtMoney(sum(), inv.currency)}</div></Card>
          <Card className="p-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Paid</div><div className="ll-mono mt-0.5 text-[17px] font-bold" style={{ color: POS }}>{fmtMoney(sum("paid"), inv.currency)}</div></Card>
          <Card className="p-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Outstanding</div><div className="ll-mono mt-0.5 text-[17px] font-bold">{fmtMoney(sum() - sum("paid"), inv.currency)}</div></Card>
        </div>
      )}

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-10 text-center">
            <Receipt size={22} className="mx-auto mb-2 text-gray-300" />
            <div className="text-[13px] font-semibold text-gray-500">{saved.length === 0 ? "No invoices yet" : "Nothing with that status"}</div>
            <div className="mt-1 text-[12px] text-gray-400">
              {saved.length === 0
                ? (clients.length === 0 ? "Add a client first, then create your first invoice." : "Create one and it will be saved here.")
                : "Try a different filter."}
            </div>
          </div>
        ) : rows.map((x) => {
          const overdue = x.status !== "paid" && x.dueDate && x.dueDate < today;
          const tone = STATUS_TONE[x.status] || STATUS_TONE.draft;
          return (
            <div key={x.id} className="flex items-center gap-3 border-b border-gray-50 px-4 py-3 last:border-0 hover:bg-gray-50">
              <button onClick={() => setEditing(x)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="ll-mono w-40 shrink-0 truncate text-[12px] font-semibold text-gray-700">{x.no}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-gray-800">{nameOf(x.clientId)}</span>
                <span className="ll-mono hidden shrink-0 whitespace-nowrap text-[11.5px] text-gray-400 md:block">{x.issueDate}</span>
                <span className="ll-mono hidden w-32 shrink-0 whitespace-nowrap text-[11.5px] sm:block" style={{ color: overdue ? NEG : "#9CA3AF" }}>
                  {overdue ? "overdue" : `due ${x.dueDate || "—"}`}
                </span>
                <span className="rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide" style={{ background: tone.bg, color: tone.fg }}>{INV_STATUS[x.status] || x.status}</span>
                <span className="ll-mono w-28 shrink-0 text-right text-[13px] font-semibold">{fmtMoney(x.totalCents, x.currency)}</span>
              </button>
              <button title="Duplicate" onClick={() => setEditing({ ...x, ...blank(), clientId: x.clientId, items: x.items.map((i, k) => ({ ...i, id: "i" + Date.now() + k })), taxPct: x.taxPct, taxLabel: x.taxLabel, notes: x.notes })}
                className="shrink-0 rounded p-1 text-gray-300 hover:bg-gray-100 hover:text-gray-600"><Copy size={13} /></button>
              <button title="Delete" onClick={async () => {
                if (!await askDelete(`invoice ${x.no}`)) return;
                onChange({ invoices: saved.filter((y) => y.id !== x.id) });
              }} className="shrink-0 rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"><Trash2 size={13} /></button>
            </div>
          );
        })}
      </Card>
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

