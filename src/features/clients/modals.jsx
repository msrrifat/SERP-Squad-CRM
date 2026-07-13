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
import { GuideTip, ACCENTS, Ava, Labeled, LogoUpload, Modal, ProjectMark, RoleBadge, Toggle, inputCls } from "../../ui/primitives.jsx";
import { GoogleSourcesCard, ProjectDetailsCard, WidgetsCard } from "../performance/views.jsx";
import { ROLE_AUTO_SECTIONS, mkProject } from "../../data/seed.js";
import { API_GUIDES } from "../../data/apiGuides.js";

export function ClientSettingsBody({ client, onChange }) {
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
          <div className="mt-3">
            <Labeled label="Alias shown to team members">
              <input value={client.alias || ""} onChange={(e) => onChange({ alias: e.target.value })} placeholder="e.g. Dental Client — NYC" className={inputCls} />
            </Labeled>
            <p className="mt-1 text-[10.5px] text-gray-400">
              Non-admin team members see this alias everywhere instead of the real client name — the original client
              information above stays visible to admins only. Leave blank to show the real name.
            </p>
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
              {/* white-label clients can run on THEIR OWN DataForSEO account */}
              <div className="rounded-xl border border-gray-100 p-3">
                <Toggle on={!!client.dfs?.useOwn}
                  onChange={(v) => onChange({ dfs: { login: "", password: "", ...(client.dfs || {}), useOwn: v } })}
                  label="Client supplies their own DataForSEO API"
                  desc="Disables the agency's DataForSEO credentials for every project of this client. The client adds their own API login in their portal → Settings — until then, scans and rank checks honestly show as not configured (never billed to your account)." />
                {client.dfs?.useOwn && (
                  <div className="mt-2 flex items-center gap-2 text-[11px]">
                    <span className="rounded-full px-2 py-0.5 font-bold uppercase tracking-wide"
                      style={client.dfs.login && client.dfs.password ? { background: "#DCFCE7", color: "#166534" } : { background: "#FEF3C7", color: "#92400E" }}>
                      {client.dfs.login && client.dfs.password ? `● Client API connected (${client.dfs.login})` : "○ Waiting for the client's credentials"}
                    </span>
                  </div>
                )}
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
              {/* layered permissions — same pattern as team access: a master toggle
                  per section; subsection toggles appear only when the section is on */}
              <div className="space-y-2">
                {CLIENT_ACCESS_TREE.map((sec) => {
                  const flagOn = (k) => (CLIENT_DEFAULT_ON.includes(k) ? lg[k] !== false : !!lg[k]);
                  const secOn = sec.items.some(([k]) => flagOn(k));
                  return (
                    <div key={sec.key} className="rounded-lg border border-gray-100 p-2.5">
                      <Toggle label={sec.label} desc={secOn ? null : "Off — this whole area is hidden in the client portal"}
                        on={secOn} onChange={(v) => setLg(Object.fromEntries(sec.items.map(([k]) => [k, v])))} />
                      {secOn && (
                        <div className="ll-fade mt-2 grid gap-1.5 border-t border-gray-50 pt-2 sm:grid-cols-2">
                          {sec.items.map(([k, lbl, desc]) => (
                            <Toggle key={k} label={lbl} desc={desc} on={flagOn(k)} onChange={(v) => setLg({ [k]: v })} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
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

/* ================= Client Settings window (gear on the client row) =================
   ONE settings entry per client — three tabs:
   Client   (client info, white label, portal login — admins only),
   Team     (per-member section access; applied to ALL projects of this client),
   Settings (Google sources & widget visibility apply to ALL projects; project
             details stay per-project via the picker). */
export const ACCESS_TREE = [
  { key: "perf", label: "Performance Studio", items: [["gbp", "Business Profiles"], ["web", "Website Performance & Analytics"], ["ranks", "Website Rank Tracking"], ["geogrid", "GBP Rank Tracking (geo grid)"]] },
  { key: "adsmgr", label: "Ads & Paid Marketing", items: [["ads", "Ads dashboard & campaign management"], ["adsperf", "Ads Performance (Performance Studio view)"]] },
  { key: "pm", label: "Project Management", items: [["records", "Records"], ["wiki", "Wiki"], ["chat", "Project chat"]] },
  { key: "opt", label: "Optimization Studio", items: [["ogbp", "Google Business Profile"], ["obing", "Bing Places"], ["oapple", "Apple Maps"], ["webConnection", "Website — Connection"], ["webPages", "Website — Pages"], ["webPosts", "Website — Posts"], ["olistings", "Business Listings"], ["social", "Branding & Automation"], ["oindex", "Index Checker"]] },
  { key: "ai", label: "AI Agent", items: [["agent", "Use the AI agent for this client's projects"]] },
];

/* what a signed-in client may open in their portal — layered like ACCESS_TREE.
   Keys live on client.login; the ones in CLIENT_DEFAULT_ON default to true when
   unset so existing clients keep their current access. */
export const CLIENT_ACCESS_TREE = [
  { key: "perf", label: "Performance Studio", items: [
    ["canViewGbp", "Business Profiles"],
    ["canViewWeb", "Website Performance & Analytics"],
    ["canViewRanks", "Website Rank Tracking"],
  ] },
  { key: "ads", label: "Ads & Paid Marketing", items: [
    ["canViewAds", "Ads performance", "Read-only campaign results — no budgets or management"],
  ] },
  { key: "pm", label: "Project Management", items: [
    ["canManageTasks", "View & complete assigned tasks", "Only tasks assigned to them"],
    ["canComment", "Comment on records"],
    ["canChat", "Project chat", "Message the team in the shared project thread"],
  ] },
  { key: "reports", label: "Report Builder", items: [
    ["canDownload", "Download reports", "Print/download the client-view report"],
  ] },
  { key: "ai", label: "AI Agent", items: [
    ["canUseAgent", "Ask the AI agent about their projects", "Performance info only — no task automation"],
  ] },
];
/* new clients automatically see the PERFORMANCE STUDIO of their projects only —
   ads, project management, reports and the agent are explicit opt-in toggles */
export const CLIENT_DEFAULT_ON = ["canViewGbp", "canViewWeb", "canViewRanks"];

export function ClientSettingsModal({ client, company, onChange, onUpdateProject, onUpdateAllProjects, dfsConnected, accent, onClose }) {
  return (
    <Modal title={`Client settings — ${client.name}`} sub="Client information, white label and portal access. Team access and data sources moved to each project's own settings (gear on the project row)." onClose={onClose} wide>
      <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
        Client details are visible to <b>admins only</b> — team members see the alias (if set) and never this window.
      </div>
      <ClientSettingsBody client={client} onChange={onChange} />
    </Modal>
  );
}

/* ================= Project Settings window (gear on the project row) =================
   Per-project: location groups (GBP/Bing/Apple connections per location — franchises
   connect one group per office), the project-wide website sources (GA4 + Search
   Console), per-project team access, and project details/widgets. */
const blankLoc = (pid) => ({ id: pid + "-loc" + Date.now(), name: "", integrations: { gbp: false, bing: false, apple: false } });

const PROVIDER_META = {
  gbp: { label: "Google Business Profile", account: "Google account", cta: "Continue with Google" },
  bing: { label: "Bing Places", account: "Microsoft account", cta: "Continue with Microsoft" },
  apple: { label: "Apple Maps", account: "Apple Business Connect account", cta: "Continue with Apple" },
};

/* deterministic, clearly-labeled demo listings — offered only when the live
   provider flow is unavailable (server down / OAuth app not configured) */
const demoListings = (provider, client, project, loc) => {
  const brand = project.opt?.gbp?.bizName || client.companyName || client.name;
  const first = (x) => (x || "").split("—")[0].trim();
  const locNames = (project.locations || []).map((l) => l.name).filter(Boolean);
  const names = [...new Set([loc.name, ...locNames])].filter(Boolean);
  return names.map((n, i) => ({
    id: `demo-${provider}-${project.id}-${i}`,
    name: `${first(brand)} — ${first(n)}`,
    address: n.includes("—") ? n.split("—").slice(1).join("—").trim() : n,
    account: client.email || "demo@" + (project.website || "example.com"),
    demo: true,
  })).concat([{ id: `demo-${provider}-${project.id}-x`, name: `${first(brand)} (unverified duplicate)`, address: "Suggested by " + PROVIDER_META[provider].label, account: client.email || "demo", demo: true, unverified: true }]);
};

function ConnectProfileModal({ provider, client, project, loc, accent, onConnect, onClose }) {
  const meta = PROVIDER_META[provider];
  const [step, setStep] = useState("account");   // account → pick
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);          // { detail, offerDemo }
  const [listings, setListings] = useState(null); // { live, items }
  const [picked, setPicked] = useState(null);

  const startLive = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/profile-listings", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ provider }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { setListings({ live: true, items: d.listings || [] }); setStep("pick"); }
      else setErr({ detail: d.detail || `Provider error (HTTP ${res.status})`, offerDemo: true });
    } catch {
      setErr({ detail: "API server is not running (npm run api) — the live account flow needs it.", offerDemo: true });
    }
    setBusy(false);
  };
  const startDemo = () => { setListings({ live: false, items: demoListings(provider, client, project, loc) }); setStep("pick"); setErr(null); };

  return (
    <Modal title={`Connect ${meta.label}`} sub={`Location group “${loc.name}” · ${project.name}`} onClose={onClose}>
      {step === "account" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[13px] font-semibold text-gray-800">1 · Choose the {meta.account}</div>
              <GuideTip title={`Connecting ${meta.label}`} accent={accent}
                steps={provider === "gbp" ? API_GUIDES.googleOauth : provider === "bing" ? ["Bing Places has no public API — access requires the Microsoft partner application (API settings → Microsoft Bing Places).", "Until approved, use the labeled demo account to model the workflow."] : ["Apple Business Connect → api.businessconnect.apple.com key (API settings → Apple Business Connect).", "Paste the key, then this dialog lists your locations for selection."]}
                docs={provider === "gbp" ? "console.cloud.google.com/apis/credentials" : null} />
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-gray-400">
              You'll sign in and grant listing access; then you pick <b>which business profile</b> belongs to this
              location group. Nothing is written to the profile — the CRM only reads performance data.
            </p>
            <button onClick={startLive} disabled={busy}
              className="mt-3 w-full rounded-xl py-2.5 text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: accent }}>
              {busy ? "Contacting provider…" : meta.cta}
            </button>
          </div>
          {err && (
            <div className="ll-fade rounded-xl border border-amber-200 bg-amber-50 p-3.5">
              <div className="text-[11.5px] leading-relaxed text-amber-800">{err.detail}</div>
              {err.offerDemo && (
                <button onClick={startDemo}
                  className="mt-2.5 w-full rounded-lg border border-amber-300 bg-white py-2 text-[12px] font-semibold text-amber-700 hover:bg-amber-100">
                  Continue with a demo account instead — data stays clearly labeled “Demo”
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {step === "pick" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-800">
            2 · Choose the business profile for “{loc.name}”
            {!listings.live && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">Demo account</span>}
          </div>
          {listings.items.length === 0 && <div className="rounded-xl border border-dashed border-gray-200 py-8 text-center text-[12px] text-gray-400">This account manages no listings.</div>}
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {listings.items.map((l) => (
              <button key={l.id} onClick={() => setPicked(l)}
                className="flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left"
                style={picked?.id === l.id ? { borderColor: accent, background: accent + "0A" } : { borderColor: "#E5E7EB" }}>
                <CheckCircle2 size={15} className="shrink-0" style={{ color: picked?.id === l.id ? accent : "#D1D5DB" }} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-semibold text-gray-800">{l.name}</span>
                    {l.unverified && <span className="rounded bg-gray-100 px-1 py-px text-[8.5px] font-bold uppercase text-gray-400">unverified</span>}
                  </span>
                  <span className="block truncate text-[10.5px] text-gray-400">{l.address || "—"} · {l.account}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setStep("account")} className="rounded-lg border border-gray-200 px-3.5 py-2 text-[12px] font-medium text-gray-500">Back</button>
            <button onClick={() => picked && onConnect({ ...picked, provider, demo: !listings.live, connectedAt: Date.now() })} disabled={!picked}
              className="rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
              Connect this listing
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function ProjectSettingsModal({ client, project, company, onUpdate, dfsConnected, accent, onClose, onArchive = null, onActivate = null, onDelete = null }) {
  const [tab, setTab] = useState("sources");
  const [confirmDel, setConfirmDel] = useState(false);
  const [openMember, setOpenMember] = useState(null);
  const [newLocName, setNewLocName] = useState("");
  const locs = project.locations && project.locations.length
    ? project.locations
    : [{ id: project.id + "-main", name: "Primary location", integrations: { gbp: !!project.integrations.gbp, bing: !!project.integrations.bing, apple: !!project.integrations.apple } }];

  /* every location edit also refreshes the derived project-level flags so all
     existing gates (nav, portal, sections) keep working unchanged */
  const setLocations = (next) => onUpdate((p) => ({
    locations: next,
    integrations: {
      ...p.integrations,
      gbp: next.some((l) => l.integrations.gbp),
      bing: next.some((l) => l.integrations.bing),
      apple: next.some((l) => l.integrations.apple),
    },
  }));
  const patchLoc = (id, fn) => setLocations(locs.map((l) => (l.id === id ? { ...l, ...(typeof fn === "function" ? fn(l) : fn) } : l)));
  const addLoc = () => {
    const name = newLocName.trim(); if (!name) return;
    setLocations([...locs, { ...blankLoc(project.id), name, integrations: { gbp: true, bing: false, apple: false } }]);
    setNewLocName("");
  };

  const access = project.teamAccess || {};
  const assigned = (company.team || []).filter((m) => !m.isOwner && (m.projects === "all" || (Array.isArray(m.projects) && m.projects.includes(project.id))));
  /* three-state per key: explicit true / explicit false / unset → role default */
  const autoSetOf = (m) => new Set(ROLE_AUTO_SECTIONS[m.role] === "all" ? ACCESS_TREE.flatMap((sec) => sec.items.map(([k]) => k)) : (ROLE_AUTO_SECTIONS[m.role] || []));
  const effOf = (m, k) => { const v = (access[m.id] || {})[k]; return v !== undefined ? !!v : autoSetOf(m).has(k); };
  const setMemberAccess = (mid, keys, val) =>
    onUpdate((p) => ({ teamAccess: { ...(p.teamAccess || {}), [mid]: { ...((p.teamAccess || {})[mid] || {}), ...Object.fromEntries(keys.map((k) => [k, val])) } } }));
  const resetMember = (mid) => onUpdate((p) => ({ teamAccess: { ...(p.teamAccess || {}), [mid]: {} } }));
  const effCount = (m) => ACCESS_TREE.flatMap((sec) => sec.items.map(([k]) => k)).filter((k) => effOf(m, k)).length;
  const overrideCount = (m) => Object.keys(access[m.id] || {}).length;

  const PROVIDERS = [["gbp", "Google Business Profile"], ["bing", "Bing Places"], ["apple", "Apple Maps"]];
  const [connecting, setConnecting] = useState(null); // { locId, provider }

  return (
    <Modal title={`Project settings — ${project.name}`} sub={`${client.name} · ${locs.length} location group${locs.length === 1 ? "" : "s"}`} onClose={onClose} wide>
      <div className="mb-4 flex gap-1.5">
        {[["sources", "Data sources", Link2], ["team", "Team", Shield], ["project", "Project & widgets", Settings]].map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold"
            style={tab === key ? { background: accent + "10", borderColor: accent, color: accent } : { background: "var(--chip-bg, #fff)", borderColor: "#E5E7EB", color: "var(--chip-fg, #4B5563)" }}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {tab === "sources" && (
        <div className="space-y-4">
          <div>
            <div className="mb-1 flex items-center gap-2"><MapPin size={15} className="text-gray-400" /><span className="ll-display text-[14px] font-semibold">Location groups</span></div>
            <p className="mb-3 text-[11.5px] leading-relaxed text-gray-400">
              One group per business location — franchises add a group for every office. Each group holds its own
              Google Business Profile, Bing Places and Apple Maps connection, and appears in the Business Profiles
              dashboard's <b>Select location</b> menu.
            </p>
            <div className="space-y-2.5">
              {locs.map((l, i) => (
                <div key={l.id} className="rounded-xl border border-gray-100 p-3.5">
                  <div className="mb-2.5 flex items-center gap-2">
                    <span className="ll-mono shrink-0 text-[10px] font-bold" style={{ color: accent }}>{i + 1}.</span>
                    <input value={l.name} onChange={(e) => patchLoc(l.id, { name: e.target.value })} placeholder="Location name — e.g. Midtown — 350 5th Ave" className={inputCls + " flex-1"} />
                    {locs.length > 1 && (
                      <button onClick={() => { if (confirm(`Remove location group "${l.name}"? Its profile connections disconnect.`)) setLocations(locs.filter((x) => x.id !== l.id)); }}
                        title="Remove location" className="shrink-0 rounded-lg border border-gray-200 p-1.5 text-gray-300 hover:text-red-500"><Trash2 size={12} /></button>
                    )}
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-3">
                    {PROVIDERS.map(([k, label]) => {
                      const prof = l.profiles?.[k];
                      const on = l.integrations[k];
                      return (
                        <button key={k}
                          onClick={() => on
                            ? confirm(`Disconnect ${label}${prof ? ` (“${prof.name}”)` : ""} from “${l.name}”?`) && patchLoc(l.id, (cur) => ({
                                integrations: { ...cur.integrations, [k]: false },
                                profiles: { ...(cur.profiles || {}), [k]: null },
                              }))
                            : setConnecting({ locId: l.id, provider: k })}
                          className="rounded-lg border px-3 py-2 text-left text-[11.5px] font-semibold"
                          style={on ? { borderColor: "#86EFAC", background: "#F0FDF4", color: "#166534" } : { borderColor: "#E5E7EB", color: "#6B7280" }}>
                          <span className="flex items-center gap-2">
                            <CheckCircle2 size={13} className="shrink-0" style={{ color: on ? "#16A34A" : "#D1D5DB" }} />
                            <span className="min-w-0 flex-1 truncate">{label}</span>
                            {on && prof?.demo && <span className="shrink-0 rounded bg-amber-100 px-1 py-px text-[8px] font-bold uppercase text-amber-700">demo</span>}
                            <span className="ll-mono shrink-0 text-[8.5px] font-bold uppercase">{on ? "✓" : "connect"}</span>
                          </span>
                          {on && prof && <span className="mt-0.5 block truncate pl-[21px] text-[9.5px] font-normal text-gray-500">{prof.name}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input value={newLocName} onChange={(e) => setNewLocName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addLoc()}
                  placeholder="New location group name — e.g. Downtown — Wall St" className={inputCls + " flex-1"} />
                <button onClick={addLoc} disabled={!newLocName.trim()}
                  className="flex shrink-0 items-center gap-1 rounded-lg px-3.5 py-2 text-[12px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
                  <Plus size={13} /> Add location group
                </button>
              </div>
            </div>
            <p className="mt-2 text-[10.5px] text-gray-400">
              Connecting walks through account consent → listing selection. Live listing lookup needs the provider's
              OAuth app / API key in Company Settings → API settings (the API server refuses to fabricate — without
              credentials you'll be offered a clearly-labeled demo account).
            </p>
            {connecting && (() => {
              const cl = locs.find((x) => x.id === connecting.locId);
              return cl && (
                <ConnectProfileModal provider={connecting.provider} client={client} project={project} loc={cl} accent={accent}
                  onConnect={(prof) => {
                    patchLoc(cl.id, (cur) => ({
                      integrations: { ...cur.integrations, [connecting.provider]: true },
                      profiles: { ...(cur.profiles || {}), [connecting.provider]: prof },
                    }));
                    setConnecting(null);
                  }}
                  onClose={() => setConnecting(null)} />
              );
            })()}
          </div>

          <div className="border-t border-gray-100 pt-4">
            <Toggle on={project.demoMode !== false} onChange={(v) => onUpdate({ demoMode: v })}
              label="Demo data mode"
              desc="ON: dashboards show deterministic demo numbers (for presentations). OFF: dashboards stay empty with credential warnings until real sources sync — nothing is ever fabricated." />
          </div>
          <div className="border-t border-gray-100 pt-4">
            <div className="mb-1 flex items-center gap-2"><Globe size={15} className="text-gray-400" /><span className="ll-display text-[14px] font-semibold">Website sources — whole project</span></div>
            <p className="mb-2 text-[11.5px] text-gray-400">One website serves every location, so Google Analytics and Search Console connect once per project.</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {[["ga", "Google Analytics 4"], ["gsc", "Google Search Console"]].map(([k, label]) => (
                <button key={k} onClick={() => onUpdate((p) => ({ integrations: { ...p.integrations, [k]: !p.integrations[k] } }))}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[11.5px] font-semibold"
                  style={project.integrations[k] ? { borderColor: "#86EFAC", background: "#F0FDF4", color: "#166534" } : { borderColor: "#E5E7EB", color: "#6B7280" }}>
                  <CheckCircle2 size={13} style={{ color: project.integrations[k] ? "#16A34A" : "#D1D5DB" }} />
                  {label} <span className="ll-mono ml-auto text-[9px] text-gray-400">{project.website}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "team" && (
        <div className="space-y-2.5">
          <div className="rounded-lg bg-gray-50 p-3 text-[11.5px] leading-relaxed text-gray-500">
            Access below applies to <b>this project only</b>. Each role starts from its automatic sections
            (marked <span className="rounded bg-emerald-100 px-1 py-px text-[9px] font-bold uppercase text-emerald-700">auto</span>) —
            every section and sub-section can still be enabled <b>or disabled</b> here, overriding the role default.
            Client details stay admin-only.
          </div>
          {assigned.map((m) => {
            const open = openMember === m.id;
            const acc = access[m.id] || {};
            const autoSet = autoSetOf(m);
            const n = effCount(m);
            const ov = overrideCount(m);
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
                      {n ? `${n} section${n > 1 ? "s" : ""} accessible` : "No access — can't see this project"}
                      {ov > 0 && <span className="ml-1.5 text-amber-600">· {ov} override{ov > 1 ? "s" : ""} on role defaults</span>}
                    </span>
                  </span>
                  <ChevronDown size={14} className="shrink-0 text-gray-300" style={{ transform: open ? "rotate(180deg)" : "none" }} />
                </button>
                {open && (
                  <div className="ll-fade space-y-2 border-t border-gray-50 p-3">
                    {ov > 0 && (
                      <button onClick={() => resetMember(m.id)}
                        className="w-full rounded-lg border border-dashed border-amber-300 bg-amber-50 py-1.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-100">
                        Reset to {m.role} role defaults (clear {ov} override{ov > 1 ? "s" : ""})
                      </button>
                    )}
                    {ACCESS_TREE.map((sec) => {
                      const secOn = sec.items.some(([k]) => effOf(m, k));
                      const secAuto = sec.items.some(([k]) => autoSet.has(k));
                      return (
                        <div key={sec.key} className="rounded-lg border border-gray-100 p-2.5">
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <Toggle label={sec.label} desc={secOn ? null : "Off — this whole area is hidden for " + m.name.split(" ")[0]}
                                on={secOn} onChange={(v) => setMemberAccess(m.id, sec.items.map(([k]) => k), v)} />
                            </div>
                            {secAuto && <span className="mt-0.5 shrink-0 rounded bg-emerald-100 px-1.5 py-px text-[9px] font-bold uppercase text-emerald-700" title={`${m.role} gets (some of) this section automatically`}>auto</span>}
                          </div>
                          {secOn && (
                            <div className="ll-fade mt-2 grid gap-1.5 border-t border-gray-50 pt-2 sm:grid-cols-2">
                              {sec.items.map(([k, lbl]) => {
                                const eff = effOf(m, k);
                                const overridden = acc[k] !== undefined && acc[k] !== autoSet.has(k);
                                return (
                                  <div key={k} className="flex items-start gap-1.5">
                                    <div className="min-w-0 flex-1">
                                      <Toggle label={lbl} on={eff} onChange={(v) => setMemberAccess(m.id, [k], v)} />
                                    </div>
                                    {autoSet.has(k) && acc[k] === undefined && <span className="mt-0.5 shrink-0 rounded bg-emerald-50 px-1 py-px text-[8px] font-bold uppercase text-emerald-600" title="Inherited from the role — toggle to override">auto</span>}
                                    {overridden && <span className="mt-0.5 shrink-0 rounded bg-amber-100 px-1 py-px text-[8px] font-bold uppercase text-amber-700" title={acc[k] ? "Enabled beyond the role default" : "Disabled despite the role default"}>{acc[k] ? "added" : "revoked"}</span>}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
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

      {tab === "project" && (
        <div className="ll-fade space-y-5">
          <ProjectDetailsCard project={project} accent={accent} update={(patch) => onUpdate(patch)} />
          <WidgetsCard widgets={project.widgets} accent={accent}
            setWidget={(group, key, val) => onUpdate((p) => ({ widgets: { ...p.widgets, [group]: { ...(p.widgets[group] || {}), [key]: val } } }))} />
        </div>
      )}

      {/* ---- archive controls: archive an active project; activate or
             permanently delete an archived one ---- */}
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
        {!project.archived && onArchive && (
          <>
            <button onClick={onArchive}
              className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-[12px] font-semibold text-amber-700 hover:border-amber-300">
              Move project to archive
            </button>
            <span className="text-[10.5px] text-gray-400">Paused work? Archiving hides the project from the sidebar & all views — data stays intact and it can be activated any time.</span>
          </>
        )}
        {project.archived && (
          <>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-500">Archived{project.archivedAt ? ` · ${new Date(project.archivedAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}` : ""}</span>
            {onActivate && (
              <button onClick={onActivate}
                className="rounded-lg px-3.5 py-2 text-[12px] font-semibold text-white" style={{ background: accent }}>
                Activate project
              </button>
            )}
            {onDelete && (confirmDel ? (
              <span className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5">
                <span className="text-[11px] font-semibold text-red-700">Delete "{project.name}" and ALL its data permanently?</span>
                <button onClick={onDelete} className="rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white">Yes, delete</button>
                <button onClick={() => setConfirmDel(false)} className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-600">Cancel</button>
              </span>
            ) : (
              <button onClick={() => setConfirmDel(true)}
                className="rounded-lg border border-red-200 px-3.5 py-2 text-[12px] font-semibold text-red-600 hover:bg-red-50">
                Delete project
              </button>
            ))}
          </>
        )}
      </div>
    </Modal>
  );
}

export function AddClientModal({ onClose, onAdd }) {
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
            /* Performance Studio on by default; everything else opt-in */
            login: { enabled: false, email: email || "", password: "", projectIds: [],
              canViewGbp: true, canViewWeb: true, canViewRanks: true,
              canViewAds: false, canManageTasks: false, canComment: false, canChat: false, canDownload: false, canUseAgent: false },
            projects: [],
          })}
          className="w-full rounded-xl bg-gray-900 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-40">
          Create client
        </button>
      </div>
    </Modal>
  );
}
export function AddProjectModal({ clients, defaultClientId, onClose, onAdd }) {
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
          onClick={() => {
            const pr = mkProject("p" + Date.now(), name.trim(), website.trim().replace(/^https?:\/\//, "") || "example.com", accent, []);
            /* fresh projects start unconnected — profiles attach through the
               Connect flow in Project settings → Data sources (no fake data) */
            pr.integrations = { ...pr.integrations, gbp: false };
            pr.locations = [{ id: pr.id + "-loc1", name: "Primary location", integrations: { gbp: false, bing: false, apple: false } }];
            pr.demoMode = false; // real projects show credential warnings until sources actually sync — never demo numbers
            onAdd(clientId, pr);
          }}
          className="w-full rounded-xl py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
          Create project
        </button>
      </div>
    </Modal>
  );
}

