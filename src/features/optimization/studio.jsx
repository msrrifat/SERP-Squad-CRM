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
  Mic, Network,
} from "lucide-react";
import { Card, GuideTip, CharCount, ConnBadge, Labeled, LogoUpload, MetaChip, Modal, OAuthButton, Seg, inputCls, askDelete } from "../../ui/primitives.jsx";
import { escHtml, inlineFmt, mdFmt, renderTextWithLinks } from "../../lib/text.jsx";
import { fmtTs2, relTime, uid } from "../../lib/format.jsx";
import { hashStr, mulberry32 } from "../../lib/rng.js";
import { AiWriteButton } from "../../lib/aiwrite.jsx";
import { KwBankPicker } from "../tools/kwbank.jsx";
import { WorkCtx, useWork } from "../../lib/worklog.jsx";
import { mkOpt } from "../../data/seed.js";
import { projectLocations } from "../../data/gen.js";
import { appOrigin } from "../../lib/appOrigin.js";
import { AppleMapsIcon, BingIcon, GoogleGIcon } from "../performance/views.jsx";
import { BrandingOptTab, ListingsScannerTab } from "./branding.jsx";
import { IndexCheckerTab, IndexTag, checkIndexApi, indexStale } from "./indexcheck.jsx";
import { BrandVoiceTab } from "./brandvoice.jsx";
import { WebsiteMappingTab } from "./architect.jsx";
import { INTENT_STYLE, OPP_STYLE, genKeywordSuggestions, genPageQueries, keywordUsage, pageTextParts, regenSuggestion, relevancy } from "../../lib/seo.js";

export const SOCIAL_ICONS = { fb: Facebook, ig: Instagram, li: Linkedin, x: Twitter, yt: Youtube, tt: Music2, pin: Pin, th: MessageSquare, bs: Send };
export const SOCIAL_COLORS = { fb: "#1877F2", ig: "#E4405F", li: "#0A66C2", x: "#111827", yt: "#FF0000", tt: "#111827", pin: "#E60023", th: "#111827", bs: "#0285FF" };
export function OptimizationView({ project, accent, onUpdate, log, work = null, access = null, aiProviders = [], aiConfig = null, dfs }) {
  const opt = project.opt || mkOpt();
  const [tab, setTab] = useState("gbp");

  /* ---- location groups: profile content is managed PER LOCATION ----
     The active group comes straight from Project settings → Data sources, so a
     profile connected there is instantly available (and connected) here. The
     first group keeps its content in project.opt (all pre-locations data lives
     there); other groups store theirs under project.locOpt[locId]. */
  const locs = projectLocations(project);
  const [locId, setLocId] = useState(locs[0]?.id);
  useEffect(() => { setLocId(projectLocations(project)[0]?.id); }, [project.id]); // eslint-disable-line
  const activeLoc = locs.find((l) => l.id === locId) || locs[0];
  const isPrimary = activeLoc?.id === locs[0]?.id;
  const PROVIDER_KEYS = ["gbp", "bing", "apple"];

  // patch: object OR function of the current sub-state. Merges against the LIVE
  // project state (functional onUpdate), so a setTimeout callback (fake crawl,
  // OAuth, credential test) can never write a stale snapshot over fresh edits.
  const setOpt = (key, patch) => onUpdate((proj) => {
    const cur = proj.opt || mkOpt();
    const next = typeof patch === "function" ? patch(cur[key] || {}) : patch; // custom seed opts may lack newer keys
    return { opt: { ...cur, [key]: { ...cur[key], ...next } } };
  });
  /* provider content routes to the active location's store */
  const setOptLoc = (key, patch) => {
    if (!PROVIDER_KEYS.includes(key) || isPrimary) return setOpt(key, patch);
    onUpdate((proj) => {
      const curLoc = (proj.locOpt || {})[activeLoc.id] || {};
      const curK = { ...mkOpt()[key], ...(curLoc[key] || {}) };
      const next = typeof patch === "function" ? patch(curK) : patch;
      return { locOpt: { ...(proj.locOpt || {}), [activeLoc.id]: { ...curLoc, [key]: { ...curK, ...next } } } };
    });
  };
  /* the provider slice the tabs see: location-scoped content, connection state
     synced from the location group, identity prefilled from the attached listing */
  const provOpt = (key) => {
    const listing = activeLoc?.profiles?.[key];
    const stored = isPrimary ? opt[key] : (project.locOpt || {})[activeLoc?.id]?.[key];
    const base = isPrimary
      ? { ...mkOpt()[key], ...(opt[key] || {}) }
      : { ...mkOpt()[key], ...(stored || {}) };
    const prefill = !isPrimary && !stored && listing ? { bizName: listing.name, address: listing.address || "" } : {};
    return { ...base, ...prefill, connected: !!activeLoc?.integrations?.[key] };
  };
  const effOpt = { ...opt, gbp: provOpt("gbp"), bing: provOpt("bing"), apple: provOpt("apple") };

  const connectedSocial = opt.social.accounts.filter((a) => a.connected).length;
  const PROPS = [
    { key: "brandvoice", label: "Brand Voice", icon: Mic, tool: true, on: !!(opt.brandVoice && (opt.brandVoice.toneWords || opt.brandVoice.brandInfo || (opt.brandVoice.files || []).length)), sub: (opt.brandVoice?.files || []).length ? `${opt.brandVoice.files.length} guideline file(s)` : "Writing guidelines & brand info" },
    { key: "gbp", label: "Google Business Profile", icon: GoogleGIcon, bp: true },
    { key: "bing", label: "Bing Places", icon: BingIcon, bp: true },
    { key: "apple", label: "Apple Maps", icon: AppleMapsIcon, bp: true },
    { key: "website", label: "Business Website", icon: Globe, on: opt.website.connected, sub: opt.website.connected ? `${WEB_PLATFORMS[opt.website.platform]?.label || "Website"} · ${project.website}` : "WordPress, Webflow, Wix, Shopify…" },
    { key: "listings", tool: true, label: "Business Listings", icon: MapPin, on: !!opt.branding?.listingScan, sub: opt.branding?.listingScan ? `Score ${opt.branding.listingScan.score} · ${opt.branding.listingScan.found} listings` : "Citation scanner & NAP audit" },
    { key: "social", label: "Branding & Automation", icon: Rocket, on: connectedSocial > 0 || (opt.branding?.campaigns || []).some((cp) => cp.launched), sub: (opt.branding?.campaigns || []).filter((cp) => cp.launched).length ? `${opt.branding.campaigns.filter((cp) => cp.launched).length} active campaign(s)` : connectedSocial > 0 ? `${connectedSocial} social profile(s) connected` : "Off-page SEO & content automation" },
    { key: "indexchk", tool: true, label: "Index Checker", icon: Search, on: !!(opt.indexChecker?.results || []).length,
      sub: opt.indexChecker?.at ? `${(opt.indexChecker.results || []).filter((r) => r.indexed).length}/${(opt.indexChecker.results || []).length} indexed · ${new Date(opt.indexChecker.at).toLocaleDateString("en", { month: "short", day: "numeric" })}` : "Real site: checks via SERP API" },
  ];

  /* per-property gates from the member's section grants (null = unrestricted) */
  const NEED = { brandvoice: ["ogbp", "webConnection", "webPages", "webPosts"], gbp: ["ogbp"], bing: ["obing"], apple: ["oapple"], website: ["webConnection", "webPages", "webPosts"], listings: ["olistings"], social: ["social"], indexchk: ["oindex"] };
  const shownProps = access ? PROPS.filter((p) => NEED[p.key].some((k) => access[k])) : PROPS;
  const activeTab = shownProps.some((p) => p.key === tab) ? tab : shownProps[0]?.key;

  const bpShown = shownProps.filter((p) => p.bp);
  const nonBp = shownProps.filter((p) => !p.bp);
  const isBpTab = PROVIDER_KEYS.includes(activeTab);
  const activeListing = isBpTab ? activeLoc?.profiles?.[activeTab] : null;

  const propBtn = (p, secondary = false) => (
    <button key={p.key} onClick={() => setTab(p.key)}
      className={"relative flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left " + (secondary ? "" : "pb-5") + (p.tool ? " pb-2.5" : "") + (p.key === "brandvoice" ? " col-span-full lg:col-span-1" : "")}
      style={activeTab === p.key
        ? { background: accent + "10", borderColor: accent }
        : { background: "var(--chip-bg, #fff)", borderColor: secondary ? "transparent" : "#E5E7EB" }}>
      <p.icon size={secondary ? 14 : 16} className="mt-0.5 shrink-0" style={{ color: p.on ? accent : "#9CA3AF" }} />
      <span className="min-w-0 flex-1">
        <span className={"block font-semibold leading-snug " + (secondary ? "text-[12px]" : "text-[13px]")} style={{ color: activeTab === p.key ? accent : "var(--chip-fg, #374151)" }}>{p.label}</span>
        <span className="block truncate text-[10.5px] text-gray-400">{p.sub}</span>
      </span>
      {!p.tool && !secondary && (
        <span className="absolute bottom-1.5 right-2.5 flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider"
          style={{ color: p.on ? "#16A34A" : "#B6BDC9" }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.on ? "#22C55E" : "#D6DAE1" }} />
          {p.on ? "Connected" : "Not connected"}
        </span>
      )}
      {secondary && (
        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" title={p.on ? "Connected for this location" : "Not connected for this location"}
          style={{ background: p.on ? "#22C55E" : "#D6DAE1" }} />
      )}
    </button>
  );

  return (
    <WorkCtx.Provider value={work}>
    <div className="ll-fade flex flex-col gap-4 lg:flex-row lg:items-start">
      {/* vertical secondary nav — which properties are connected.
          Responsive: 2-up grid on phones, 3-up on small tablets, single column
          from lg; the Business Profiles group always spans the full row below
          lg with its providers side-by-side, and stacks vertically on desktop. */}
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:w-60 lg:grid-cols-1">
        {nonBp.filter((p) => p.key === "brandvoice").map((p) => propBtn(p))}

        {/* Business Profiles group: providers live under one roof, scoped by location group */}
        {bpShown.length > 0 && (
          <div className="col-span-full rounded-xl border border-gray-200 p-2 lg:col-span-1" style={{ background: "var(--chip-bg, #fff)" }}>
            <div className="flex flex-wrap items-center gap-1.5 px-1.5 pb-1.5 pt-0.5">
              <Building2 size={13} className="shrink-0 text-gray-400" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Business Profiles</span>
              {locs.length > 0 && (
                <select value={activeLoc?.id || ""} onChange={(e) => setLocId(e.target.value)} title="Location group — synced with Project settings → Data sources"
                  className="min-w-0 flex-1 basis-40 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-gray-700 lg:mt-1 lg:w-full lg:flex-none lg:basis-full">
                  {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              )}
            </div>
            <div className="grid gap-1 sm:grid-cols-3 lg:grid-cols-1">
              {bpShown.map((p) => propBtn({
                ...p,
                on: !!activeLoc?.integrations?.[p.key],
                sub: activeLoc?.integrations?.[p.key]
                  ? (activeLoc?.profiles?.[p.key]?.name || "Connected")
                  : "Not connected for this location",
              }, true))}
            </div>
          </div>
        )}

        {nonBp.filter((p) => p.key !== "brandvoice").map((p) => propBtn(p))}
      </div>

      <div className="min-w-0 flex-1">
        {/* provider tabs carry the active location context */}
        {isBpTab && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2">
            <MapPin size={13} style={{ color: accent }} />
            <span className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Location group</span>
            <select value={activeLoc?.id || ""} onChange={(e) => setLocId(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[12px] font-semibold text-gray-700">
              {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            {activeListing && (
              <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
                managing <b className="text-gray-700">{activeListing.name}</b>
                {activeListing.demo && <span className="rounded bg-amber-100 px-1 py-px text-[8px] font-bold uppercase text-amber-700">demo</span>}
              </span>
            )}
            <span className="ml-auto text-[10px] text-gray-400">Business info, posts &amp; photos are stored per location group</span>
          </div>
        )}
        {activeTab === "brandvoice" && <BrandVoiceTab opt={opt} setOpt={setOpt} accent={accent} project={project} />}
        {activeTab === "gbp" && (activeLoc?.integrations?.gbp
          ? <GbpOptTab key={activeLoc?.id} opt={effOpt} setOpt={setOptLoc} accent={accent} log={log} project={project} ai={aiConfig} locId={activeLoc?.id} />
          : <BpNotConnected label="Google Business Profile" loc={activeLoc} />)}
        {activeTab === "bing" && (activeLoc?.integrations?.bing
          ? <PlaceOptTab key={activeLoc?.id} kind="bing" opt={effOpt} setOpt={setOptLoc} accent={accent} log={log} project={project} ai={aiConfig} locId={activeLoc?.id} />
          : <BpNotConnected label="Bing Places" loc={activeLoc} />)}
        {activeTab === "apple" && (activeLoc?.integrations?.apple
          ? <PlaceOptTab key={activeLoc?.id} kind="apple" opt={effOpt} setOpt={setOptLoc} accent={accent} log={log} project={project} ai={aiConfig} locId={activeLoc?.id} />
          : <BpNotConnected label="Apple Maps" loc={activeLoc} />)}
        {activeTab === "website" && <WebsiteOptTab opt={opt} setOpt={setOpt} accent={accent} log={log} project={project} aiProviders={aiProviders} aiConfig={aiConfig} dfs={dfs} />}
        {activeTab === "listings" && <ListingsScannerTab opt={opt} setOpt={setOpt} accent={accent} log={log} project={project} dfs={dfs} />}
        {activeTab === "social" && <BrandingOptTab opt={opt} setOpt={setOpt} accent={accent} log={log} project={project} />}
        {activeTab === "indexchk" && <IndexCheckerTab opt={opt} setOpt={setOpt} accent={accent} log={log} project={project} dfs={dfs} />}
      </div>
    </div>
    </WorkCtx.Provider>
  );
}

/* provider not attached to the active location group — the single source of
   truth is Project settings → Data sources; no shadow connect flows here */
function BpNotConnected({ label, loc }) {
  return (
    <Card className="p-10 text-center">
      <div className="ll-display text-[15px] font-semibold">{label} is not connected for “{loc?.name}”</div>
      <p className="mx-auto mt-1 max-w-md text-[12.5px] leading-relaxed text-gray-400">
        Attach a {label} listing to this location group in <b>Project settings → Data sources</b> (gear on the
        project row). Once connected there, it appears here automatically with its business info ready to manage.
      </p>
    </Card>
  );
}

/* ---------------- Reviews (all three profile providers) ----------------
   Deterministic demo reviews seeded per project+provider+location (labeled
   demo — in production the list syncs from each provider's reviews API).
   Replies are stored in the provider's per-location slice and, live, push
   through the same API. AI-drafted replies always follow the Brand Voice. */
const REVIEW_META = {
  gbp: { api: "Business Profile API · locations.reviews / reviews.updateReply", replyMax: 4096 },
  bing: { api: "Bing Places listing dashboard API", replyMax: 4096 },
  apple: { api: "Apple Business Connect · place reviews", replyMax: 4000 },
};
const RV_NAMES = ["Maria G.", "James P.", "Sofia R.", "Daniel K.", "Aisha B.", "Tom H.", "Elena V.", "Chris M.", "Priya S.", "Leo W.", "Hannah F.", "Marcus D.", "Olivia T.", "Sam N."];
const RV_TEXTS = {
  5: [
    "Absolutely fantastic experience at {biz}. The team was friendly, explained everything clearly and the results speak for themselves. Highly recommend!",
    "Best in the area by far. Booking was easy, they ran right on time and the quality of work was outstanding.",
    "I've been coming to {biz} for over a year now — consistently professional, honest pricing and genuinely caring staff.",
    "From the first phone call to the final result, everything was smooth. You can tell they take pride in what they do.",
    "Five stars isn't enough. Quick, clean, professional — and they followed up afterwards to make sure everything was perfect.",
  ],
  4: [
    "Great service overall. Slight wait past my appointment time, but the quality made up for it.",
    "Very professional and thorough. Prices are a touch higher than others nearby, but you get what you pay for.",
    "Really solid experience — knowledgeable staff and a clean, modern space. Parking nearby is the only headache.",
  ],
  3: [
    "Decent work, but communication could be better — I had to call twice to get an update on my appointment.",
    "The service itself was fine, but scheduling was a hassle and my confirmation email never arrived.",
  ],
  2: [
    "Disappointed with my last visit. I waited over 40 minutes and felt rushed once I was seen. May give them another chance.",
    "Not the experience I hoped for — the quote changed after the work started and nobody explained why.",
  ],
};
const RV_AGES = ["2 days ago", "5 days ago", "1 week ago", "2 weeks ago", "3 weeks ago", "1 month ago", "2 months ago", "3 months ago", "5 months ago"];
export function genDemoReviews(projectId, kind, locId, bizName) {
  const r = mulberry32(hashStr(`${projectId}|${kind}|${locId}|reviews`));
  const count = 5 + Math.floor(r() * 4);
  const nameOff = Math.floor(r() * RV_NAMES.length);
  const used = {};
  let hadLow = false; // at most ONE sub-4-star review — a realistic healthy profile
  return Array.from({ length: count }, (_, i) => {
    const roll = r();
    let rating = roll < 0.6 ? 5 : roll < 0.84 ? 4 : roll < 0.94 ? 3 : 2;
    if (rating <= 3) { if (hadLow) rating = 4; else hadLow = true; }
    const pool = RV_TEXTS[rating];
    const idx = used[rating] || 0; used[rating] = idx + 1; // cycle, don't repeat, texts within a tier
    const text = pool[idx % pool.length];
    return {
      id: `rv${i}`,
      author: RV_NAMES[(nameOff + i * 3) % RV_NAMES.length],
      rating,
      age: RV_AGES[Math.min(i + Math.floor(r() * 2), RV_AGES.length - 1)],
      text: text.replaceAll("{biz}", bizName),
    };
  });
}

function Stars({ n }) {
  return (
    <span className="flex items-center gap-px">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={11} fill={i <= n ? "#F59E0B" : "none"} stroke={i <= n ? "#F59E0B" : "#D1D5DB"} />
      ))}
    </span>
  );
}

export function ReviewsPanel({ kind, name, data, set, accent, log, project, ai, brandVoice, locId }) {
  const meta = REVIEW_META[kind];
  const work = useWork();
  const bizName = data.bizName || project.name;
  const brand = project.name.split(" — ")[0];
  const reviews = genDemoReviews(project.id, kind, locId || "primary", bizName);
  const replies = data.reviewReplies || {};
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState("");
  const avg = reviews.reduce((s, x) => s + x.rating, 0) / reviews.length;

  const startReply = (rv) => { setOpenId(rv.id); setDraft(replies[rv.id]?.text || ""); };
  const postReply = (rv) => {
    if (!draft.trim()) return;
    const isEdit = !!replies[rv.id];
    set({ reviewReplies: { ...replies, [rv.id]: { text: draft.trim().slice(0, meta.replyMax), at: Date.now() } } });
    work?.(kind, isEdit ? "reviewReplyUpdated" : "reviewReplied", { detail: `${rv.author} · ${rv.rating}★` });
    log?.(`Replied to a ${name} review (${rv.author})`, project.name);
    setOpenId(null); setDraft("");
  };
  const deleteReply = (rv) => {
    const next = { ...replies }; delete next[rv.id];
    set({ reviewReplies: next });
    work?.(kind, "reviewReplyDeleted", { detail: rv.author });
    log?.(`Removed a ${name} review reply (${rv.author})`, project.name);
  };

  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="ll-display text-[15px] font-semibold">Reviews</div>
        <Stars n={Math.round(avg)} />
        <span className="text-[12px] font-semibold text-gray-700">{avg.toFixed(1)}</span>
        <span className="text-[11.5px] text-gray-400">· {reviews.length} reviews</span>
        <span className="rounded bg-amber-100 px-1.5 py-px text-[8.5px] font-bold uppercase text-amber-700">demo</span>
      </div>
      <div className="text-[11px] text-gray-400">
        Demo reviews for preview — in production this list syncs live from the {meta.api}, and posted replies publish
        through the same API. AI-drafted replies always follow your <b>Brand Voice</b> and the {meta.replyMax.toLocaleString()}-character reply limit.
      </div>
      <div className="space-y-2">
        {reviews.map((rv) => {
          const reply = replies[rv.id];
          const editing = openId === rv.id;
          return (
            <div key={rv.id} className="rounded-xl border border-gray-100 p-3">
              <div className="flex items-start gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                  style={{ background: `hsl(${hashStr(rv.author) % 360},42%,52%)` }}>{rv.author[0]}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12.5px] font-semibold text-gray-800">{rv.author}</span>
                    <Stars n={rv.rating} />
                    <span className="text-[10.5px] text-gray-400">{rv.age}</span>
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-gray-600">{rv.text}</p>

                  {reply && !editing && (
                    <div className="mt-2 rounded-lg bg-gray-50 p-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10.5px] font-bold text-gray-700">Reply from {bizName}</span>
                        <span className="ll-mono text-[9.5px] text-gray-400">{fmtTs2(reply.at)}</span>
                        <span className="ml-auto flex gap-2">
                          <button onClick={() => startReply(rv)} className="text-[10.5px] font-semibold" style={{ color: accent }}>Edit</button>
                          <button onClick={() => deleteReply(rv)} className="text-[10.5px] font-semibold text-red-400 hover:text-red-500">Delete</button>
                        </span>
                      </div>
                      <p className="mt-1 text-[11.5px] leading-relaxed text-gray-600">{reply.text}</p>
                    </div>
                  )}

                  {editing && (
                    <div className="mt-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <AiWriteButton ai={ai} brandVoice={brandVoice} brand={brand} accent={accent} label="AI draft reply"
                          limit={meta.replyMax > 900 ? 700 : meta.replyMax} current={draft}
                          what={`a public reply from the business owner to this customer review on ${name}`}
                          context={`Business: ${bizName}.\nReviewer: ${rv.author}. Rating: ${rv.rating}/5. Review: "${rv.text}"\nRules: thank the reviewer by first name; address their specific points; ${rv.rating <= 3 ? "acknowledge the problem sincerely, apologize once without excuses, and invite them to continue the conversation offline (phone/email)" : "reinforce what they loved and warmly invite them back"}; never offer incentives for reviews; keep it short (2-4 sentences).`}
                          onText={(t) => setDraft(t)} />
                        <CharCount value={draft} max={meta.replyMax} />
                      </div>
                      <textarea value={draft} maxLength={meta.replyMax} rows={3} autoFocus
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder={`Reply publicly as ${bizName}…`} className={inputCls + " resize-none"} />
                      <div className="flex justify-end gap-2">
                        <button onClick={() => { setOpenId(null); setDraft(""); }} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11.5px] font-medium text-gray-600">Cancel</button>
                        <button onClick={() => postReply(rv)} disabled={!draft.trim()}
                          className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
                          <Send size={11} /> Post reply
                        </button>
                      </div>
                    </div>
                  )}

                  {!reply && !editing && (
                    <button onClick={() => startReply(rv)} className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold" style={{ color: accent }}>
                      <MessageSquare size={11} /> Reply
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ---------------- GBP tab ---------------- */
/* deterministic preview for GBP photos that only exist by name (live-profile mock):
   real uploads carry a dataUrl and render as-is */
export const photoThumb = (name) => {
  const h = hashStr(name || "photo");
  const hue = h % 360, hue2 = (hue + 42) % 360;
  const label = escHtml((name || "photo").replace(/\.(jpe?g|png|webp|gif)$/i, "").replace(/[-_]/g, " "));
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='200'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(${hue},45%,72%)'/><stop offset='1' stop-color='hsl(${hue2},50%,46%)'/></linearGradient></defs><rect width='320' height='200' fill='url(#g)'/><circle cx='272' cy='40' r='15' fill='rgba(255,255,255,.35)'/><text x='16' y='180' font-family='sans-serif' font-size='15' font-weight='600' fill='rgba(255,255,255,.92)'>${label}</text></svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
};

export function GbpOptTab({ opt, setOpt, accent, log, project, ai = null, locId = null }) {
  const [gbpTab, setGbpTab] = useState("info");
  const work = useWork();
  const brandVoice = opt.brandVoice;
  const brand = project.name.split(" — ")[0];
  /* shared context every AI write gets — keeps copy grounded in the listing */
  const bizCtx = () => `Business: ${opt.gbp.bizName || project.name}. Categories: ${(opt.gbp.categories || []).join(", ") || "—"}. Address: ${opt.gbp.address || "—"}. Services: ${(opt.gbp.svcCats || []).flatMap((c) => c.services.map((s) => s.name)).join(", ") || "—"}.`;
  const [savedInfo, setSavedInfo] = useState(false);
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
    work?.("gbp", "svcUpdated", { detail: editDraft.name });
    setEditSvc(null);
  };
  const deleteSvc = () => {
    set({ svcCats: g.svcCats.map((c) => c.id !== editSvc.catId ? c : { ...c, services: c.services.filter((x) => x.id !== editSvc.svcId) }) });
    work?.("gbp", "svcDeleted", { detail: editDraft?.name });
    setEditSvc(null);
  };
  const addService = (catId) => {
    const nm = (svcDraft[catId] || "").trim(); if (!nm) return;
    set({ svcCats: g.svcCats.map((c) => c.id !== catId ? c : { ...c, services: [...c.services, { id: "sv" + Date.now(), name: nm, priceType: "none", price: "", desc: "" }] }) });
    work?.("gbp", "svcAdded", { detail: nm });
    setSvcDraft({ ...svcDraft, [catId]: "" });
  };
  const addCategory = () => {
    const nm = catDraft.trim(); if (!nm) return;
    set({ svcCats: [...(g.svcCats || []), { id: "sc" + Date.now(), name: nm, services: [] }] });
    work?.("gbp", "catAdded", { detail: nm });
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
    work?.("gbp", editProd === "new" ? "prodAdded" : "prodUpdated", { detail: prodEdit.name });
    setEditProd(null);
  };
  const deleteProd = () => {
    work?.("gbp", "prodDeleted", { detail: g.products.find((x) => x.id === editProd)?.name });
    set({ products: g.products.filter((x) => x.id !== editProd) }); setEditProd(null);
  };
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
    work?.("gbp", composer.when === "now" ? "postPublished" : "postScheduled", { detail: composer.title || composer.body });
    log?.(composer.when === "now" ? "Published GBP post" : "Scheduled GBP post", project.name);
    setComposer({ type: "update", title: "", body: "", cta: "Learn more", ctaUrl: "", startDate: "", endDate: "", coupon: "", image: null, when: "now", publishAt: "" });
  };
  const TYPE_CHIP = { update: { bg: "#DBEAFE", fg: "#1E40AF" }, offer: { bg: "#FEF3C7", fg: "#92400E" }, event: { bg: "#F3E8FF", fg: "#6B21A8" } };

  return (
    <div className="space-y-4">
      {/* GBP section top bar */}
      <div className="flex flex-wrap gap-1.5">
        {[["info", "Business information"], ["services", "Services"], ["products", "Products"], ["posts", "Posts/Updates"], ["photos", "Photos"], ["reviews", "Reviews"]].map(([key, label]) => (
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
        <Labeled label={<span className="flex items-center justify-between">Description
          <span className="flex items-center gap-2">
            <AiWriteButton ai={ai} brandVoice={brandVoice} brand={brand} accent={accent} limit={750} current={g.description}
              what="the business description for our Google Business Profile listing (what we do, who we serve, what makes us different — no phone numbers or URLs, Google forbids them)"
              context={bizCtx()} onText={(t) => set({ description: t })} />
            <CharCount value={g.description} max={750} />
          </span></span>}>
          <textarea value={g.description} maxLength={750} onChange={(e) => set({ description: e.target.value })} rows={3} className={inputCls + " resize-none"} />
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
        <button onClick={() => { work?.("gbp", "infoSaved"); log?.("Saved GBP business info", project.name); setSavedInfo(true); setTimeout(() => setSavedInfo(false), 1500); /* PROD: locations.patch with the edited fields */ }}
          className="rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white" style={{ background: savedInfo ? "#16A34A" : accent }}>
          {savedInfo ? "Saved ✓" : "Save to Google"}
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
        <Labeled label={<span className="flex items-center justify-between">Post text
          <span className="flex items-center gap-2">
            <AiWriteButton ai={ai} brandVoice={brandVoice} brand={brand} accent={accent} limit={1500} current={composer.body}
              what={`the text for a Google Business Profile ${composer.type} post${composer.title ? ` titled "${composer.title}"` : ""} (engaging, concrete, ends leading into the "${composer.cta}" call-to-action)`}
              context={bizCtx() + (composer.type === "offer" && composer.coupon ? ` Coupon code: ${composer.coupon}.` : "")}
              onText={(t) => setComposer((c) => ({ ...c, body: t }))} />
            <CharCount value={composer.body} max={1500} />
          </span></span>}>
          <textarea value={composer.body} maxLength={1500} onChange={(e) => setComposer({ ...composer, body: e.target.value })} rows={3} className={inputCls + " resize-none"} placeholder="What's new?" />
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
              <button onClick={() => { if (!askDelete("this post")) return; work?.("gbp", "postDeleted", { detail: p.title || p.body }); set({ posts: g.posts.filter((x) => x.id !== p.id) }); }}
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
                <button onClick={() => { work?.("gbp", "catDeleted", { detail: cat.name }); set({ svcCats: g.svcCats.filter((c) => c.id !== cat.id) }); }}
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
        <div className="text-[11.5px] text-gray-400">The gallery mirrors what's live on your profile (media.list in the GBP API); uploads are pushed to it via media.create. Fresh photos boost profile engagement.</div>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {g.photos.map((ph) => (
            <div key={ph.id} className="group relative overflow-hidden rounded-xl border border-gray-100 bg-white">
              <img src={ph.dataUrl || photoThumb(ph.name)} alt={ph.name} className="aspect-[8/5] w-full object-cover" />
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10.5px]">
                <span className="min-w-0 flex-1 truncate text-gray-600">{ph.name}</span>
                <span className="ll-mono shrink-0 text-gray-400">{fmtTs2(ph.addedAt)}</span>
              </div>
              <button onClick={() => { if (!askDelete("this photo")) return; work?.("gbp", "photoDeleted", { detail: ph.name }); set({ photos: g.photos.filter((x) => x.id !== ph.id) }); }}
                className="absolute right-1.5 top-1.5 rounded-md bg-black/40 p-1 text-white opacity-0 hover:bg-red-500 group-hover:opacity-100"><Trash2 size={12} /></button>
            </div>
          ))}
          {g.photos.length === 0 && <div className="col-span-full py-4 text-center text-[11.5px] text-gray-300">No photos on the profile yet — upload the first ones below.</div>}
        </div>
        <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 py-2.5 text-[12px] font-medium text-gray-400 hover:border-gray-400 hover:text-gray-600">
          <Upload size={13} /> Upload photos to GBP
          <input type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => {
              // read each file to a dataUrl so the gallery previews exactly what was pushed
              const files = [...(e.target.files || [])];
              if (files.length) work?.("gbp", "photosUploaded", { count: files.length, detail: files[0].name + (files.length > 1 ? "…" : "") });
              files.forEach((f) => {
                const rd = new FileReader();
                rd.onload = () => set((cur) => ({ photos: [...cur.photos, { id: "ph" + Date.now() + Math.random().toString(36).slice(2, 5), name: f.name, addedAt: Date.now(), dataUrl: rd.result }] }));
                rd.readAsDataURL(f);
              });
              e.target.value = "";
            }} />
        </label>
      </Card>

      </>)}

      {gbpTab === "reviews" && (
        <ReviewsPanel kind="gbp" name="Google" data={g} set={set} accent={accent} log={log}
          project={project} ai={ai} brandVoice={brandVoice} locId={locId} />
      )}

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
            <Labeled label={<span className="flex items-center justify-between">Product description — optional
              <span className="flex items-center gap-2">
                <AiWriteButton ai={ai} brandVoice={brandVoice} brand={brand} accent={accent} limit={1000} current={prodEdit.desc}
                  what={`the Google Business Profile product description for "${prodEdit.name || "this product"}"`}
                  context={bizCtx() + (prodEdit.category ? ` Product category: ${prodEdit.category}.` : "") + (prodEdit.price ? ` Price: $${prodEdit.price}.` : "")}
                  onText={(t) => setProdEdit((p) => ({ ...p, desc: t }))} />
                <CharCount value={prodEdit.desc} max={1000} />
              </span></span>}>
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
            <Labeled label={<span className="flex items-center justify-between">Service description
              <span className="flex items-center gap-2">
                <AiWriteButton ai={ai} brandVoice={brandVoice} brand={brand} accent={accent} limit={300} current={editDraft.desc}
                  what={`the Google Business Profile service description for "${editDraft.name}" (what's included, the benefit, why choose us)`}
                  context={bizCtx() + (["fixed", "from"].includes(editDraft.priceType) && editDraft.price ? ` Price: ${editDraft.priceType === "from" ? "from " : ""}$${editDraft.price}.` : "")}
                  onText={(t) => setEditDraft((d) => ({ ...d, desc: t }))} />
                <CharCount value={editDraft.desc} max={300} />
              </span></span>}>
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

/* The pixel runtime served by the CRM itself at https://app.serpsquad.com/px.js — fully functional:
   applies title/meta/canonical/alt/heading/schema changes from /v1/payload and pings /v1/hello. */
export const PIXEL_RUNTIME = `(function () {
  var KEY = document.currentScript && document.currentScript.getAttribute("data-key");
  var API = "https://app.serpsquad.com/api/v1";
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

/* the pixel is served by YOUR OWN API server (GET /px.js). The origin resolves
   automatically: Company Settings override → the domain the CRM is actually
   served from (connect the repo to any domain/subdomain and snippets adapt
   instantly) → the production fallback. Never a localhost URL. */
export const pixelOrigin = () => appOrigin();
export const pixelSnippet = (key) => `<script async src="${appOrigin()}/px.js" data-key="${key}"></script>`;

/* Connector registry — n8n-style: auth, operations, guide, honest capability notes */
export const WEB_PLATFORMS = {
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
    label: "Custom website", tag: "Pixel + publisher endpoint · any stack",
    credential: null,
    caps: { meta: "pixel", alt: "pixel", headings: "pixel", slugs: true, blogs: true, schema: "pixel" },
    guide: [
      "Paste the snippet before </head> on every page (or add it once via Google Tag Manager).",
      "PUBLISHING: upload serp-squad-publish.php (from server/custom-site-endpoint/) to the site's web root and paste your site key inside it — the tool can then create pages and blog posts directly on the site, no CMS needed.",
      "SCHEDULING: scheduled posts are queued on the site and go live automatically at their date (the endpoint publishes due posts on every visit) — /blog/ gets a generated index page.",
      "Optional: add our Cloudflare Worker so pixel edits are rendered at the edge for ALL crawlers (including non-JS bots like GPTBot).",
    ],
    notes: [
      "Pages/posts are static HTML files the endpoint writes — the fastest possible output, fully system-designed.",
      "Cleanup only ever removes files the endpoint itself created (tracked in a manifest) — your existing site files are never touched.",
    ],
  },
};
export const CAP_LABELS = { meta: "Meta title & description", alt: "Image alt & title", headings: "Headings", slugs: "URL slugs", blogs: "Blog publish & schedule", schema: "Schema (JSON-LD)" };

/* ---------------- Live page editor ----------------
   Renders the page like the real design; every editable element is marked.
   PROD: this preview is the live site in an iframe with the pixel switched to
   "editor mode" — a postMessage bridge tags clicked elements with data-ss ids
   and records their CSS selectors, so edits map 1:1 to buildPixelPayload ops. */
export const EDIT_LEGEND = [
  ["Meta (SERP)", "#7C3AED"], ["Headings", "#2456E6"], ["Text", "#0E7C66"],
  ["Links in text", "#B45309"], ["Images: alt · title · replace", "#E11D48"],
];
/* ---------------- Keyword opportunity system ----------------
   OppBadge: compact per-page GSC summary for the Pages/Posts tables.
   OpportunityPanel: the re-optimize sidebar inside both editors — live GSC
   keywords, relevancy vs intent, exact-usage counts, AI placement suggestions
   ("Get suggestions") and one-click "Magic optimization". PROD: suggestions
   come from the AI provider configured in Company Settings → API settings. */
export function OppBadge({ projectId, url, tracking, brand }) {
  const { queries, level } = useMemo(() => genPageQueries(projectId, url, tracking, brand), [projectId, url]);
  const st = OPP_STYLE[level];
  const striking = queries.filter((q) => q.position > 3 && q.position <= 25).length;
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide" style={{ background: st.bg, color: st.fg }}>
      {st.label} · {striking} kw{striking === 1 ? "" : "s"} in striking distance
    </span>
  );
}

export function OpportunityPanel({ projectId, url, page, tracking, brand, accent, aiProviders = [], applySuggestion, sitePages = [], suggestions, setSuggestions, applied, setApplied, showList = false }) {
  const { queries } = useMemo(() => genPageQueries(projectId, url, tracking, brand), [projectId, url]);
  const parts = pageTextParts(page); // recomputed every render — reacts live to edits
  const [sel, setSel] = useState(() => new Set());
  const [busy, setBusy] = useState(null);          // null | "suggest" | "magic"
  const [magicDone, setMagicDone] = useState(null);
  const [listVariant, setListVariant] = useState({}); // list mode: per-section regenerate counter
  const provider = aiProviders[0];
  const toggle = (q) => setSel((s2) => { const n = new Set(s2); n.has(q) ? n.delete(q) : n.add(q); return n; });
  const selQueries = queries.filter((q) => sel.has(q.query));
  const targetQueries = selQueries.length ? selQueries : queries.filter((q) => q.position > 3 && q.position <= 25).slice(0, 3);

  const getSuggestions = () => {
    setBusy("suggest"); setMagicDone(null);
    setTimeout(() => { // PROD: POST to the connected AI provider with page content + target terms
      setSuggestions(genKeywordSuggestions(page, targetQueries, brand, sitePages, url));
      setApplied(new Set()); setBusy(null);
    }, 1200);
  };
  const magic = () => {
    setBusy("magic"); setSuggestions(null);
    setTimeout(() => {
      const sugg = genKeywordSuggestions(page, targetQueries, brand, sitePages, url);
      sugg.forEach((sg) => applySuggestion(sg)); // patchers are functional — batch-safe
      setMagicDone({ n: sugg.length, kws: [...new Set(sugg.map((x) => x.kw))].length });
      setBusy(null);
    }, 1600);
  };

  return (
    <aside className="order-last flex w-[338px] shrink-0 flex-col overflow-y-auto border-l border-gray-100 bg-gray-50/70">
      <div className="border-b border-gray-100 bg-white px-4 py-3">
        <div className="ll-display flex items-center gap-1.5 text-[13.5px] font-semibold"><Search size={13} style={{ color: accent }} /> Search Console — this page</div>
        <div className="mt-0.5 text-[10.5px] leading-relaxed text-gray-400">Queries this page already earns impressions for. Tick the ones to target, then let AI work them into the content.</div>
      </div>

      <div className="flex-1 space-y-1.5 p-3">
        {queries.map((q) => {
          const rel = relevancy(parts, q.query, url);
          const used = keywordUsage(parts, q.query);
          const ist = INTENT_STYLE[q.intent];
          const on = sel.has(q.query);
          return (
            <button key={q.query} onClick={() => toggle(q.query)}
              className="w-full rounded-xl border bg-white p-2.5 text-left transition-shadow hover:shadow-sm"
              style={{ borderColor: on ? accent : "#EBEDF2", boxShadow: on ? `0 0 0 1px ${accent}` : "none" }}>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={13} className="shrink-0" style={{ color: on ? accent : "#D6DAE1" }} />
                <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-gray-800">{q.query}</span>
                <span className="shrink-0 rounded-full px-1.5 py-px text-[8.5px] font-bold uppercase" style={{ background: ist.bg, color: ist.fg }}>{q.intent}</span>
              </div>
              <div className="ll-mono mt-1 flex items-center gap-2.5 text-[10px] text-gray-500">
                <span title="Impressions"><Eye size={9} className="mr-0.5 inline text-gray-300" />{fmtNum(q.impressions)}</span>
                <span title="Clicks"><MousePointerClick size={9} className="mr-0.5 inline text-gray-300" />{q.clicks}</span>
                <span title="Average position">#{q.position}</span>
                <span title="Exact-phrase uses on this page">×{used}</span>
                <span className="ml-auto font-semibold" title="Relevancy to this page's content & intent" style={{ color: rel >= 70 ? "#16A34A" : rel >= 40 ? "#D97706" : "#DC2626" }}>{rel}%</span>
              </div>
            </button>
          );
        })}
        {queries.length === 0 && <div className="py-6 text-center text-[11px] text-gray-300">No Search Console queries for this URL yet.</div>}
      </div>

      <div className="space-y-2 border-t border-gray-100 bg-white p-3">
        {!provider && (
          <div className="rounded-lg bg-amber-50 px-2.5 py-2 text-[10.5px] leading-relaxed text-amber-700">
            Connect an AI provider (OpenAI, Claude, Gemini or DeepSeek) in Company Settings → API settings to enable suggestions.
          </div>
        )}
        <div className="text-[10px] text-gray-400">{sel.size ? `${sel.size} keyword${sel.size > 1 ? "s" : ""} selected` : "Nothing selected — AI will target the best striking-distance keywords."}{provider ? ` · via ${provider}` : ""}</div>
        <div className="flex gap-2">
          <button onClick={getSuggestions} disabled={!provider || busy || !targetQueries.length}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-[11.5px] font-semibold disabled:opacity-40" style={{ borderColor: accent, color: accent }}>
            {busy === "suggest" ? <><RefreshCw size={11} className="animate-spin" /> Asking {provider}…</> : <>Get suggestions</>}
          </button>
          <button onClick={magic} disabled={!provider || busy || !targetQueries.length}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[11.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
            {busy === "magic" ? <><RefreshCw size={11} className="animate-spin" /> Optimizing…</> : <><Zap size={11} /> Magic optimization</>}
          </button>
        </div>

        {magicDone && (
          <div className="ll-fade rounded-lg bg-emerald-50 px-2.5 py-2 text-[10.5px] leading-relaxed text-emerald-700">
            ✓ {magicDone.n} placement{magicDone.n === 1 ? "" : "s"} applied across {magicDone.kws} keyword{magicDone.kws === 1 ? "" : "s"} — review the highlighted content, then Deploy.
          </div>
        )}
        {suggestions && !showList && (
          <div className="ll-fade rounded-lg bg-emerald-50 px-2.5 py-2 text-[10.5px] leading-relaxed text-emerald-700">
            {suggestions.length ? "Suggestions are shown in green beside each section — one at a time. Edit the text, Apply, or hit Regenerate for an alternative." : "This page already covers the selected keywords well."}
          </div>
        )}
        {suggestions && showList && (() => {
          /* one suggestion per section; Regenerate cycles keywords, then phrasings */
          const groups = {};
          suggestions.filter((sg) => !applied.has(sg.id)).forEach((sg) => {
            const k = sg.targetKind + ":" + (sg.targetId || "");
            (groups[k] = groups[k] || []).push(sg);
          });
          const entries = Object.entries(groups);
          return (
            <div className="max-h-64 space-y-1.5 overflow-y-auto">
              {entries.map(([k, alts]) => {
                const idx = listVariant[k] || 0;
                const sg = alts[idx % alts.length];
                const regenList = () => {
                  const next = idx + 1;
                  setListVariant((v) => ({ ...v, [k]: next }));
                  const shown = alts[next % alts.length];
                  const round = Math.floor(next / alts.length);
                  if (round > 0) setSuggestions((list) => list.map((x) => (x.id === shown.id ? { ...x, ...regenSuggestion(shown, round, brand) } : x)));
                };
                return (
                  <div key={k} className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-2">
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className="font-bold uppercase tracking-wide text-emerald-700">{sg.where}</span>
                      <span className="ll-mono min-w-0 flex-1 truncate text-gray-400">“{sg.kw}”</span>
                      <button onClick={regenList} title="Regenerate suggestion"
                        className="shrink-0 rounded border border-emerald-200 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600"><RefreshCw size={8} className="mr-0.5 inline" />Regen</button>
                      <button onClick={() => applySuggestion(sg)}
                        className="shrink-0 rounded px-2 py-0.5 text-[9.5px] font-bold text-white" style={{ background: accent }}>Apply</button>
                    </div>
                    <div className="mt-1 text-[10.5px] leading-snug text-emerald-800">{sg.after}</div>
                    {sg.note && <div className="mt-1 text-[9px] leading-snug text-emerald-700/70">{sg.note}</div>}
                  </div>
                );
              })}
              {entries.length === 0 && <div className="py-2 text-center text-[10.5px] text-gray-300">This page already covers the selected keywords well.</div>}
            </div>
          );
        })()}
      </div>
    </aside>
  );
}
const fmtNum = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n));

export function LivePageEditor({ page, onPatch, accent, slugsEnabled, siteHost, onClose, project, aiProviders = [], sitePages = [] }) {
  const [editId, setEditId] = useState(null);      // block being text-edited
  const [imgPanel, setImgPanel] = useState(null);  // image block with open panel
  const [linkForm, setLinkForm] = useState(null);  // { blockId, phrase, href }
  const content = page.content || [];
  // functional against live page state — Magic optimization applies many patches in one tick
  const patchBlock = (id, p) => onPatch((cur) => ({ content: (cur.content || []).map((b) => (b.id === id ? { ...b, ...(typeof p === "function" ? p(b) : p) } : b)) }));
  const [suggestions, setSuggestions] = useState(null); // lifted: green cards render beside their target blocks
  const [applied, setApplied] = useState(() => new Set());
  const applySuggestion = (sg) => {
    if (sg.targetKind === "metaTitle") onPatch({ metaTitle: sg.after });
    else if (sg.targetKind === "metaDesc") onPatch({ metaDesc: sg.after });
    else if (sg.targetKind === "alt") patchBlock(sg.targetId, { alt: sg.after });
    else if (sg.targetKind === "link") patchBlock(sg.targetId, (b) => ({
      text: b.text.toLowerCase().includes(sg.anchor.toLowerCase()) ? b.text : b.text + " " + sg.sentence,
      links: [...(b.links || []), { id: "lk" + Date.now() + Math.random().toString(36).slice(2, 4), phrase: sg.anchor, href: sg.href }],
    }));
    else patchBlock(sg.targetId, { text: sg.after });
    setApplied((a) => new Set([...a, sg.id]));
  };
  const editSuggestion = (id, patch) => setSuggestions((list) => list.map((x) => (x.id === id ? { ...x, ...patch,
    ...(patch.anchor || patch.href ? { sentence: `Learn more about ${patch.anchor ?? list.find((y) => y.id === id).anchor} on this page.`, after: `Learn more about ${patch.anchor ?? list.find((y) => y.id === id).anchor} on this page.` } : {}) } : x)));
  /* one visible suggestion per section: alternatives cycle via Regenerate —
     first through the other target keywords, then through fresh phrasings */
  const [variantIdx, setVariantIdx] = useState({});
  const [regenBusy, setRegenBusy] = useState(null);
  const pendingRaw = (targetKind, targetId = null) =>
    (suggestions || []).filter((sg) => sg.targetKind === targetKind && sg.targetId === targetId && !applied.has(sg.id));
  const pendingFor = (targetKind, targetId = null) => {
    const alts = pendingRaw(targetKind, targetId);
    if (!alts.length) return [];
    const key = targetKind + ":" + (targetId || "");
    return [alts[(variantIdx[key] || 0) % alts.length]];
  };
  const regen = (sg) => {
    const key = sg.targetKind + ":" + (sg.targetId || "");
    setRegenBusy(key);
    setTimeout(() => { // PROD: re-prompt the provider for an alternative phrasing
      const alts = pendingRaw(sg.targetKind, sg.targetId);
      const next = (variantIdx[key] || 0) + 1;
      setVariantIdx((v) => ({ ...v, [key]: next }));
      const shown = alts[next % alts.length];
      const round = Math.floor(next / alts.length);
      if (round > 0) setSuggestions((list) => list.map((x) => (x.id === shown.id ? { ...x, ...regenSuggestion(shown, round, project?.name || "") } : x)));
      setRegenBusy(null);
    }, 500);
  };
  /* green, editable suggestion card rendered beside its content section */
  const SuggCard = ({ sg }) => (
    <div className="ll-fade w-[250px] shrink-0 self-start rounded-xl border border-emerald-200 bg-emerald-50/70 p-2.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-wide text-emerald-700">
        <Zap size={10} /> {sg.where} <span className="ll-mono ml-auto font-medium normal-case text-emerald-600/70">“{sg.kw}”</span>
      </div>
      {sg.targetKind === "link" ? (
        <div className="mt-1.5 space-y-1.5">
          <input value={sg.anchor} onChange={(e) => editSuggestion(sg.id, { anchor: e.target.value })}
            className="w-full rounded border border-emerald-200 bg-white px-1.5 py-1 text-[11px] font-medium text-emerald-800" title="Anchor text" />
          <input value={sg.href} onChange={(e) => editSuggestion(sg.id, { href: e.target.value })}
            className="ll-mono w-full rounded border border-emerald-200 bg-white px-1.5 py-1 text-[10px] text-emerald-700" title="Link target" />
        </div>
      ) : (
        <textarea value={sg.after} rows={Math.min(6, Math.max(2, Math.ceil((sg.after || "").length / 34)))}
          onChange={(e) => setSuggestions((list) => list.map((x) => (x.id === sg.id ? { ...x, after: e.target.value } : x)))}
          className="mt-1.5 w-full resize-none rounded border border-emerald-200 bg-white px-1.5 py-1 text-[11px] leading-snug text-emerald-800" />
      )}
      {sg.note && <div className="mt-1.5 text-[9.5px] leading-snug text-emerald-700/80">{sg.note}</div>}
      <div className="mt-1.5 flex gap-1.5">
        <button onClick={() => applySuggestion(sg)} className="flex-1 rounded bg-emerald-600 py-1 text-[10px] font-bold text-white hover:bg-emerald-700">Apply</button>
        <button onClick={() => regen(sg)} disabled={regenBusy === sg.targetKind + ":" + (sg.targetId || "")}
          title="Regenerate suggestion" className="flex items-center gap-1 rounded border border-emerald-200 px-2 py-1 text-[10px] font-semibold text-emerald-600 disabled:opacity-50">
          <RefreshCw size={9} className={regenBusy === sg.targetKind + ":" + (sg.targetId || "") ? "animate-spin" : ""} /> Regenerate
        </button>
        <button onClick={() => setApplied((a) => new Set([...a, sg.id]))} className="rounded border border-emerald-200 px-2 py-1 text-[10px] font-semibold text-emerald-600">Skip</button>
      </div>
    </div>
  );
  const withSugg = (kind, id, node) => {
    const sgs = kind === "metaBox"
      ? [...pendingFor("metaTitle"), ...pendingFor("metaDesc")]
      : [...pendingFor("block", id), ...pendingFor("link", id), ...pendingFor("alt", id)];
    if (!sgs.length) return node;
    return (
      <div key={id || kind} className="flex items-start gap-3">
        <div className="min-w-0 flex-1">{node}</div>
        <div className="space-y-2">{sgs.map((sg) => <SuggCard key={sg.id} sg={sg} />)}</div>
      </div>
    );
  };

  const mark = (color, label) => (
    <span className="pointer-events-none absolute -top-2.5 left-2 z-10 rounded px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-white opacity-0 transition-opacity group-hover:opacity-100" style={{ background: color }}>{label}</span>
  );
  const editable = "group relative rounded-md outline-2 outline-offset-4 hover:outline-dashed cursor-pointer";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-3" onClick={onClose}>
      <div className="flex h-[92vh] w-full max-w-[1280px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
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

        <div className="flex min-h-0 flex-1">
        {project && (
          <OpportunityPanel projectId={project.id} url={page.origUrl || page.url} page={page}
            tracking={[...new Set(project.tracking.map((t) => t.keyword))]} brand={project.name}
            accent={accent} aiProviders={aiProviders} applySuggestion={applySuggestion}
            sitePages={sitePages} suggestions={suggestions} setSuggestions={setSuggestions} applied={applied} setApplied={setApplied} />
        )}
        <div className="min-w-0 flex-1 overflow-y-auto">
          {/* SERP-only meta block */}
          <div className={"mx-auto px-6 pt-5 " + (suggestions?.length ? "max-w-3xl" : "max-w-2xl")}>
            {withSugg("metaBox", null,
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
            </div>)}
            {/* target keywords from the project's researched bank (Keyword Finder) */}
            {((page.keywords || []).length > 0 || (project?.keywordBank || []).length > 0) && (
              <div className="mt-3 space-y-1.5">
                {(page.keywords || []).length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Target keywords:</span>
                    {(page.keywords || []).map((k) => (
                      <span key={k} className="flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: accent + "12", color: accent }}>
                        {k}
                        <button onClick={() => onPatch((cur) => ({ keywords: (cur.keywords || []).filter((x) => x !== k) }))} className="opacity-60 hover:opacity-100"><X size={10} /></button>
                      </span>
                    ))}
                  </div>
                )}
                <KwBankPicker project={project} accent={accent} used={page.keywords || []}
                  onPick={(k) => onPatch((cur) => ({ keywords: [...new Set([...(cur.keywords || []), k.keyword])] }))} />
              </div>
            )}
          </div>

          {/* the rendered page */}
          <div className={"mx-auto space-y-5 px-6 py-6 " + (suggestions?.length ? "max-w-3xl" : "max-w-2xl")}>
            {content.map((b) => withSugg("blk", b.id, (() => {
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
            })()))}
            {content.length === 0 && <div className="py-14 text-center text-[13px] text-gray-300">No content captured for this page yet — in production the pixel's editor mode maps the live page here automatically.</div>}
            {/* end of the content flow — queue note + Done live here, not beside it */}
            <div className="flex items-center justify-between border-t border-gray-100 pt-4">
              <span className="text-[11px] text-gray-400">Edits queue as pending — push them with <b>Deploy changes</b>.</span>
              <button onClick={onClose} className="rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white" style={{ background: accent }}>Done</button>
            </div>
          </div>
        </div>
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
export const DISCOVERED_PAGES = [
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
export const DISCOVERED_POSTS = [
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
export function PostEditor({ initial, siteHost, slugsEditable, accent, onSave, onDelete, onClose, project, aiProviders = [], sitePages = [] }) {
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
  const patchBlock = (id, pb) => setP((x) => ({ ...x, content: x.content.map((b) => (b.id === id ? { ...b, ...pb } : b)) }));
  const [pSuggestions, setPSuggestions] = useState(null);
  const [pApplied, setPApplied] = useState(() => new Set());
  const applySuggestion = (sg) => {
    if (sg.targetKind === "metaTitle") set({ metaTitle: sg.after });
    else if (sg.targetKind === "metaDesc") set({ metaDesc: sg.after });
    else if (sg.targetKind === "alt") patchBlock(sg.targetId, { alt: sg.after });
    else if (sg.targetKind === "link") setP((x) => ({ ...x, content: x.content.map((b) => (b.id === sg.targetId ? {
      ...b,
      text: b.text.toLowerCase().includes(sg.anchor.toLowerCase()) ? b.text : b.text + " " + sg.sentence,
      links: [...(b.links || []), { id: "lk" + Date.now() + Math.random().toString(36).slice(2, 4), phrase: sg.anchor, href: sg.href }],
    } : b)) }));
    else patchBlock(sg.targetId, { text: sg.after });
    setPApplied((a) => new Set([...a, sg.id]));
  };
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
      <div className="flex h-[92vh] w-full max-w-[1360px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
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
          {project && (
            <OpportunityPanel projectId={project.id} url={"/blog/" + (p.slug || "new-post")} page={{ metaTitle: p.metaTitle, metaDesc: p.metaDesc, content: p.content }}
              tracking={[...new Set(project.tracking.map((t) => t.keyword))]} brand={project.name}
              accent={accent} aiProviders={aiProviders} applySuggestion={applySuggestion} showList
              sitePages={sitePages} suggestions={pSuggestions} setSuggestions={setPSuggestions} applied={pApplied} setApplied={setPApplied} />
          )}
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

            {/* researched target keywords (project keyword bank → this post) */}
            {((p.keywords || []).length > 0 || (project?.keywordBank || []).length > 0) && (
              <div className="mt-3 space-y-1.5">
                {(p.keywords || []).length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Target keywords:</span>
                    {(p.keywords || []).map((k) => (
                      <span key={k} className="flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: accent + "12", color: accent }}>
                        {k}
                        <button onClick={() => set({ keywords: (p.keywords || []).filter((x) => x !== k) })} className="opacity-60 hover:opacity-100"><X size={10} /></button>
                      </span>
                    ))}
                  </div>
                )}
                <KwBankPicker project={project} accent={accent} used={p.keywords || []}
                  onPick={(k) => set({ keywords: [...new Set([...(p.keywords || []), k.keyword])] })} />
              </div>
            )}

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

export function WebsiteOptTab({ opt, setOpt, accent, log, project, aiProviders = [], aiConfig = null, dfs }) {
  const w = opt.website;
  const work = useWork();
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

  /* ---- pages/posts list controls: search + sortable Name/Date columns.
     Name sorting keeps the site TREE: children render indented under their
     parent (sorted within each level); date sorting is a flat timeline. ---- */
  const [pgSearch, setPgSearch] = useState("");
  const [pgSort, setPgSort] = useState({ key: "name", dir: "asc" });
  const [postSearch, setPostSearch] = useState("");
  const [postSort, setPostSort] = useState({ key: "date", dir: "desc" });
  /* SEO-health filters (the sub-tabs under the visual dashboard) */
  const [pgFilter, setPgFilter] = useState("all");
  const [postFilter, setPostFilter] = useState("all");
  const HEALTH = {
    all: { label: "All", test: () => true },
    notindexed: { label: "Not indexed", test: (x) => x.index?.status === "not_indexed" },
    mtlong: { label: "Meta title > 60", test: (x) => (x.metaTitle || "").length > 60 },
    mtshort: { label: "Meta title < 45", test: (x) => (x.metaTitle || "").length < 45 },
    mdlong: { label: "Meta desc > 160", test: (x) => (x.metaDesc || "").length > 160 },
    mdshort: { label: "Meta desc < 120", test: (x) => (x.metaDesc || "").length < 120 },
  };
  const healthStats = (list) => ({
    total: list.length,
    indexed: list.filter((x) => x.index?.status === "indexed").length,
    ...Object.fromEntries(Object.entries(HEALTH).filter(([k]) => k !== "all").map(([k, f]) => [k, list.filter(f.test).length])),
  });
  /* compact visual dashboard + the filter sub-tabs, shared by Pages & Posts */
  const HealthBoard = ({ list, filter, setFilter, noun }) => {
    const st = healthStats(list);
    const cards = [
      ["all", "Total " + noun, st.total, "#334155"],
      ["indexed", "Indexed", st.indexed, "#16A34A"],
      ["notindexed", "Not indexed", st.notindexed, "#DC2626"],
      ["mtlong", "Meta title > 60", st.mtlong, "#D97706"],
      ["mtshort", "Meta title < 45", st.mtshort, "#D97706"],
      ["mdlong", "Meta desc > 160", st.mdlong, "#7C3AED"],
      ["mdshort", "Meta desc < 120", st.mdshort, "#7C3AED"],
    ];
    return (
      <>
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
          {cards.map(([k, label, n, color]) => (
            <div key={k} className="rounded-xl border border-gray-100 bg-gray-50/60 p-2.5">
              <div className="text-[9.5px] font-bold uppercase tracking-wide text-gray-400">{label}</div>
              <div className="ll-display text-[20px] font-bold" style={{ color }}>{n}</div>
              <div className="mb-1 mt-1 h-1 overflow-hidden rounded-full bg-gray-200">
                <div className="h-full rounded-full" style={{ width: `${st.total ? Math.min(100, (n / st.total) * 100) : 0}%`, background: color }} />
              </div>
              {k !== "indexed" && (
                <button onClick={() => setFilter(k)} className="text-[9.5px] font-bold" style={{ color: filter === k ? accent : "#9CA3AF" }}>
                  View {noun} →
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="no-print mb-3 flex flex-wrap gap-1.5">
          {Object.entries(HEALTH).map(([k, f]) => (
            <button key={k} onClick={() => setFilter(k)}
              className="rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold"
              style={filter === k ? { background: accent, borderColor: accent, color: "#fff" } : { background: "#fff", borderColor: "#E5E7EB", color: "#4B5563" }}>
              {k === "all" ? "All " + noun : f.label}
              <span className="ll-mono ml-1 opacity-70">{k === "all" ? st.total : st[k]}</span>
            </button>
          ))}
        </div>
      </>
    );
  };
  const pageDate = (pg) => (pg.modified ? Date.parse(pg.modified) || 0 : pg.updatedAt || 0);
  const postDate = (b) => (b.modified ? Date.parse(b.modified) || 0 : b.publishAt || b.createdAt || 0);
  const pageRows = useMemo(() => {
    const q = pgSearch.trim().toLowerCase();
    /* health filter first: a filtered view is a flat, sorted worklist */
    if (pgFilter !== "all") {
      const dir = pgSort.dir === "asc" ? 1 : -1;
      return w.pages.filter(HEALTH[pgFilter].test)
        .filter((p) => !q || [p.name, p.url, p.metaTitle, p.metaDesc].some((x) => (x || "").toLowerCase().includes(q)))
        .sort((a, b) => (pgSort.key === "date" ? (pageDate(a) - pageDate(b)) * dir : ((a.name || a.url || "").toLowerCase() < (b.name || b.url || "").toLowerCase() ? -1 : 1) * dir))
        .map((p) => ({ ...p, depth: 0 }));
    }
    if (q) return w.pages
      .filter((p) => [p.name, p.url, p.metaTitle, p.metaDesc].some((x) => (x || "").toLowerCase().includes(q)))
      .map((p) => ({ ...p, depth: 0 }));
    if (pgSort.key === "date")
      return [...w.pages].sort((a, b) => (pageDate(a) - pageDate(b)) * (pgSort.dir === "asc" ? 1 : -1)).map((p) => ({ ...p, depth: 0 }));
    /* tree: nest under the parent page when one exists (never under the homepage) */
    const norm = (u) => (String(u || "/").replace(/\/+$/, "") || "/");
    const byUrl = new Map(w.pages.map((p) => [norm(p.url), p]));
    const kids = { __root__: [] };
    w.pages.forEach((p) => {
      const u = norm(p.url);
      const pp = u.split("/").slice(0, -1).join("/") || "/";
      const parentKey = u !== "/" && pp !== "/" && byUrl.has(pp) ? pp : "__root__";
      (kids[parentKey] = kids[parentKey] || []).push(p);
    });
    const dir = pgSort.dir === "asc" ? 1 : -1;
    const cmp = (a, b) => ((a.name || a.url || "").toLowerCase() < (b.name || b.url || "").toLowerCase() ? -1 : 1) * dir;
    const out = [];
    const walk = (key, depth) => (kids[key] || []).sort(cmp).forEach((p) => { out.push({ ...p, depth }); walk(norm(p.url), depth + 1); });
    walk("__root__", 0);
    w.pages.forEach((p) => { if (!out.some((o) => o.id === p.id)) out.push({ ...p, depth: 0 }); }); // cycle safety
    return out;
  }, [w.pages, pgSearch, pgSort, pgFilter]);
  const postRows = useMemo(() => {
    const q = postSearch.trim().toLowerCase();
    let list = w.blogs;
    if (postFilter !== "all") list = list.filter(HEALTH[postFilter].test);
    if (q) list = list.filter((b) => [b.title, b.slug, b.metaTitle, b.metaDesc].some((x) => (x || "").toLowerCase().includes(q)));
    const dir = postSort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => (postSort.key === "date"
      ? (postDate(a) - postDate(b)) * dir
      : ((a.title || "").toLowerCase() < (b.title || "").toLowerCase() ? -1 : 1) * dir));
  }, [w.blogs, postSearch, postSort, postFilter]);
  const SortHead = ({ state, setState, k, defDir = "asc", className = "py-2 pr-2", children }) => (
    <th className={className + " cursor-pointer select-none hover:text-gray-600"}
      onClick={() => setState((s) => ({ key: k, dir: s.key === k ? (s.dir === "asc" ? "desc" : "asc") : defDir }))}>
      <span className="inline-flex items-center gap-0.5">{children}{state.key === k && <span style={{ color: accent }}>{state.dir === "asc" ? "▲" : "▼"}</span>}</span>
    </th>
  );
  const siteKey = w.siteKey || `ss_live_${project.id}_${hashStr(project.website).toString(36).slice(0, 6)}`;

  const trackedKws = [...new Set(project.tracking.map((t) => t.keyword))];
  /* one "page optimized" work entry per page per visit — edits are continuous,
     the work log counts pages touched, not keystrokes */
  const pagesWorked = useRef(new Set());
  const patchPage = (id, p) => {
    if (!pagesWorked.current.has(id)) {
      pagesWorked.current.add(id);
      work?.("website", "pageOptimized", { detail: w.pages.find((x) => x.id === id)?.url });
    }
    set((cur) => ({ pages: cur.pages.map((x) => (x.id === id ? { ...x, ...(typeof p === "function" ? p(x) : p), dirty: true, updatedAt: Date.now() } : x)) }));
  };

  /* ---- Google index tags: REAL checks only, auto-rechecked when >7 days old.
     If the API server / credentials are absent, tags stay "Index unknown" —
     an index status is never fabricated. ---- */
  /* scheduled blogs auto-publish when their date arrives (PROD: WP cron does
     this natively for status=future posts — this mirrors it for the demo state) */
  const schedPub = useRef(false);
  useEffect(() => {
    if (schedPub.current) return;
    schedPub.current = true;
    const due = (w.blogs || []).filter((b) => b.status === "scheduled" && b.scheduledAt && b.scheduledAt <= Date.now());
    if (due.length) {
      set((cur) => ({ blogs: (cur.blogs || []).map((b) => (b.status === "scheduled" && b.scheduledAt && b.scheduledAt <= Date.now() ? { ...b, status: "published", publishedAt: b.scheduledAt } : b)) }));
      work?.("website", "blogAutoPublished", { count: due.length, detail: due[0]?.title });
      log?.(`Auto-published ${due.length} scheduled post${due.length > 1 ? "s" : ""}`, project.website);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [idxChecking, setIdxChecking] = useState(false);
  const [idxBusy, setIdxBusy] = useState({});    // per-URL manual rechecks: "page<id>"/"post<id>" → true
  const [idxErr, setIdxErr] = useState(null);
  const pageUrl = (pg) => "https://" + project.website + (pg.origUrl || pg.url);
  const postUrl = (b) => "https://" + project.website + "/blog/" + b.slug;
  /* on-demand single-URL recheck (the buttons beside each page/post name) —
     same real /api/check-index call, never fabricated */
  const recheckOne = async (kind, item) => {
    const key = kind + item.id;
    const url = kind === "page" ? pageUrl(item) : postUrl(item);
    setIdxBusy((b2) => ({ ...b2, [key]: true })); setIdxErr(null);
    try {
      const { results } = await checkIndexApi([url], dfs);
      const r = results?.[0];
      if (r && r.status !== "error") {
        const idx = { status: r.indexed ? "indexed" : "not_indexed", checkedAt: r.checkedAt };
        set((cur) => (kind === "page"
          ? { pages: cur.pages.map((x) => (x.id === item.id ? { ...x, index: idx } : x)) }
          : { blogs: cur.blogs.map((x) => (x.id === item.id ? { ...x, index: idx } : x)) }));
        work?.("website", "indexRechecked", { detail: (item.url || "/" + item.slug) + (r.indexed ? " — indexed" : " — not indexed") });
        log?.(`Index recheck: ${url} — ${r.indexed ? "indexed" : "not indexed"}`, project.website);
      } else setIdxErr("Check failed for " + url + (r?.error ? ": " + r.error : ""));
    } catch (e) {
      setIdxErr(e.code === 503
        ? "Index checks need the API server (npm run api) + DataForSEO credentials in API settings — statuses are never fabricated."
        : "Check failed: " + e.message);
    }
    setIdxBusy((b2) => ({ ...b2, [key]: false }));
  };
  const RecheckBtn = ({ kind, item }) => (
    <button title={`Re-check Google index for this ${kind} now — 1 DataForSEO request ≈ $0.003`} disabled={!!idxBusy[kind + item.id]}
      onClick={(e) => { e.stopPropagation(); recheckOne(kind, item); }}
      className="rounded-md border border-gray-200 p-1 text-gray-300 hover:border-gray-300 hover:text-gray-600 disabled:opacity-60">
      <RefreshCw size={9} className={idxBusy[kind + item.id] ? "animate-spin" : ""} />
    </button>
  );
  const idxRan = useRef(false);
  useEffect(() => {
    if (idxRan.current || !w.connected) return;
    idxRan.current = true;
    const stalePages = w.pages.filter((pg) => indexStale(pg.index));
    const stalePosts = w.blogs.filter((b) => b.status === "published" && indexStale(b.index));
    if (!stalePages.length && !stalePosts.length) return;
    runIndexCheck(stalePages, stalePosts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.connected]);
  /* bulk index check — used by the stale auto-check AND the manual
     "Re-check indexing" button (which forces EVERY page/post) */
  const runIndexCheck = (pages, posts) => {
    setIdxChecking(true); setIdxErr(null);
    /* results apply BATCH BY BATCH — statuses fill in as the check runs and
       partial progress survives a late failure */
    const applyBatch = (batch) => {
      const byUrl = Object.fromEntries(batch.filter((r) => r.status !== "error").map((r) => [r.url, r]));
      set((cur) => ({
        pages: cur.pages.map((pg) => { const r = byUrl[pageUrl(pg)]; return r ? { ...pg, index: { status: r.indexed ? "indexed" : "not_indexed", checkedAt: r.checkedAt } } : pg; }),
        blogs: cur.blogs.map((b) => { const r = byUrl[postUrl(b)]; return r ? { ...b, index: { status: r.indexed ? "indexed" : "not_indexed", checkedAt: r.checkedAt } } : b; }),
      }));
    };
    checkIndexApi([...pages.map(pageUrl), ...posts.map(postUrl)], dfs, applyBatch)
      .then(({ results, partialError }) => {
        if (partialError) setIdxErr(`Checked ${results.length} URLs, then: ${partialError}`);
        log?.(`Index check: ${results.filter((r) => r.indexed).length}/${results.length} URLs indexed`, project.website);
      })
      .catch((e) => setIdxErr(e?.code === 503
        ? "Index checks need DataForSEO credentials in API settings — statuses are never fabricated."
        : "Index check failed: " + (e?.message || e)))
      .finally(() => setIdxChecking(false));
  };
  const deploy = () => {
    const payload = buildPixelPayload(w.pages); // PROD: await fetch("/v1/deploy", {method:"POST", body: JSON.stringify({ key: siteKey, payload })})
    set({ pages: w.pages.map((p) => ({ ...p, dirty: false })), lastDeploy: Date.now() });
    work?.("website", "changesDeployed", { detail: `${dirtyCount} page${dirtyCount > 1 ? "s" : ""}` });
    log?.(`Deployed ${dirtyCount} page change${dirtyCount > 1 ? "s" : ""} (${Object.keys(payload).length} paths)`, project.name);
  };
  const crawlSite = async () => {
    setCrawling(true);
    /* REAL sync for connected WordPress sites: pages + posts pulled from the
       site's own REST API. Demo content only ever loads for demo projects. */
    if (w.platform === "wordpress" && w.credential) {
      try {
        const r = await fetch("/api/wp/content", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(60000),
          body: JSON.stringify({ site: project.website, credential: w.credential?.value || w.credential }) });
        const d = await r.json().catch(() => ({}));
        if (r.ok) {
          const added = { pages: 0, posts: 0 };
          set((cur) => {
            // computed against the LIVE state inside the updater \u2014 edits made during the sync survive
            /* purge untouched demo leftovers (old sample crawls) so the REAL
               /about, /contact etc. aren't blocked by the URL dedupe */
            const demoUrls = new Set(DISCOVERED_PAGES.map((p) => p.url));
            const demoSlugs = new Set(DISCOVERED_POSTS.map((p) => p.slug));
            const basePages = cur.pages.filter((p) => !(demoUrls.has(p.url) && !p.dirty && !p.synced && /bright smile/i.test(p.metaTitle || "")));
            const baseBlogs = cur.blogs.filter((b) => !(demoSlugs.has(b.slug) && !b.synced));
            /* recrawl also REFRESHES synced entries that have no local edits \u2014
               meta/content pulled fresh from the site (WP is the source of truth) */
            const newPages = [];
            const pgPatch = new Map();
            (d.pages || []).forEach((dp) => {
              const ex = basePages.find((p) => p.url === dp.url || (dp.wpId && p.wpId === dp.wpId));
              if (!ex) newPages.push({ ...dp, id: "pg" + Date.now() + newPages.length, dirty: false, synced: true });
              else if (ex.synced && !ex.dirty) pgPatch.set(ex.id, { name: dp.name, metaTitle: dp.metaTitle, metaDesc: dp.metaDesc, content: dp.content, modified: dp.modified, wpId: dp.wpId });
            });
            const newPosts = [];
            const blPatch = new Map();
            (d.posts || []).forEach((dp) => {
              const ex = baseBlogs.find((b) => b.slug === dp.slug);
              if (!ex) newPosts.push({ ...dp, id: "bl" + Date.now() + newPosts.length, synced: true });
              else if (ex.synced) blPatch.set(ex.id, { title: dp.title, body: dp.body, metaTitle: dp.metaTitle, metaDesc: dp.metaDesc, content: dp.content, modified: dp.modified, wpId: dp.wpId });
            });
            added.pages = newPages.length; added.posts = newPosts.length;
            return {
              pages: [...basePages.map((p) => (pgPatch.has(p.id) ? { ...p, ...pgPatch.get(p.id) } : p)), ...newPages],
              blogs: [...newPosts, ...baseBlogs.map((b) => (blPatch.has(b.id) ? { ...b, ...blPatch.get(b.id) } : b))],
              crawled: true, lastCrawl: Date.now(),
            };
          });
          setCrawling(false);
          setTimeout(() => { work?.("website", "siteCrawled", { detail: `${added.pages} pages, ${added.posts} posts` }); log?.(`Synced ${project.website} via WordPress \u2014 imported ${added.pages} page${added.pages === 1 ? "" : "s"} & ${added.posts} post${added.posts === 1 ? "" : "s"}`, project.name); }, 0);
          return;
        }
        setVerifyNote(`Content sync failed: ${d.detail || `HTTP ${r.status}`}`);
      } catch (e) { setVerifyNote("Content sync failed \u2014 " + (e?.message || e)); }
      setCrawling(false);
      return;
    }
    /* demo projects: labeled sample content */
    setTimeout(() => {
      const added = { pages: 0, posts: 0 };
      set((cur) => {
        const newPages = DISCOVERED_PAGES.filter((dp) => !cur.pages.some((p) => p.url === dp.url))
          .map((dp, i) => ({ ...dp, id: "pg" + Date.now() + i, dirty: false, demo: true }));
        const oldPosts = DISCOVERED_POSTS.filter((dp) => !cur.blogs.some((b) => b.slug === dp.slug))
          .map((dp, i) => ({ ...dp, id: "bl" + Date.now() + i, demo: true }));
        added.pages = newPages.length; added.posts = oldPosts.length;
        return { pages: [...cur.pages, ...newPages], blogs: [...oldPosts, ...cur.blogs], crawled: true, lastCrawl: Date.now() };
      });
      setCrawling(false);
      setTimeout(() => { work?.("website", "siteCrawled", { detail: `${added.pages} pages, ${added.posts} posts` }); log?.(`Crawled ${project.website} \u2014 imported ${added.pages} page${added.pages === 1 ? "" : "s"} & ${added.posts} old post${added.posts === 1 ? "" : "s"}`, project.name); }, 0);
    }, 1900);
  };
  const [verifyNote, setVerifyNote] = useState(null);
  const verify = async () => {
    setVerifying(true); setVerifyNote(null);
    try {
      const r = await fetch("/api/pixel/status", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(10000), body: JSON.stringify({ key: siteKey }) });
      const d = await r.json();
      if (d.verified) {
        set({ verified: true });
        work?.("website", "pixelVerified");
        log?.(`Website pixel verified — ${d.hits} hit(s), last from ${d.page || "your site"}`, project.website);
        crawlSite();
      } else {
        /* concrete diagnosis: fetch the site server-side and check whether the
           snippet is actually in its HTML — "not installed" vs "installed but
           never visited" are very different fixes */
        let diag = "";
        try {
          const site = /^https?:\/\//.test(project.website) ? project.website : "https://" + project.website;
          const c = await fetch("/api/pixel/check", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(25000), body: JSON.stringify({ url: site, key: siteKey }) });
          const cd = await c.json();
          if (cd.live) {
            diag = cd.installed
              ? " Good news: the snippet IS installed on the site. Open any page of the site once in a normal browser tab, wait a few seconds, then check again."
              : cd.blocked
                ? ` The site's firewall blocked our automated check (HTTP ${cd.status}), so we can't see its HTML — verify manually: open the site, right-click → View Page Source, and search for "px.js". If it's missing, re-paste the snippet inside <head> and publish.`
                : cd.hasScript
                  ? " A pixel script exists on the site but with a DIFFERENT key — replace it with the snippet below (it carries this project's key)."
                  : ` The snippet is NOT in the site's HTML (checked ${site}). The paste didn't publish — re-add it inside <head>, save/publish, clear any caching plugin, then reload the site once.`;
          }
        } catch { /* diagnostics are best-effort */ }
        setVerifyNote(`No pixel hit recorded yet for ${siteKey}.${diag || ` Place the snippet on the site, open any page once, then check again. The pixel reports to ${appOrigin()}.`}`);
      }
    } catch { setVerifyNote("API server unreachable (npm run api) — pixel verification requires it."); }
    setVerifying(false);
  };
  const [credNote, setCredNote] = useState(null);
  const testCred = async () => {
    const val = credDraft.trim(); if (!val) return;
    setTestingCred(true); setCredNote(null);
    if (w.platform === "wordpress") {
      /* real check: reachability → REST API → auth → publish capability */
      try {
        const r = await fetch("/api/wp/test", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(25000), body: JSON.stringify({ site: project.website, credential: val }) });
        const d = await r.json();
        setCredNote({ ok: !!d.checks?.authenticated, text: d.detail, checks: d.checks });
        if (d.checks?.authenticated) {
          set({ credential: { type: plat.credential.type, value: val, masked: val.split(":")[0] + ":••••••••", status: "valid", user: d.checks.user, addedAt: Date.now() } });
          setCredDraft(""); work?.("website", "wpConnected", { detail: d.checks.user }); log?.(`WordPress connected as ${d.checks.user}`, project.website);
        }
      } catch { setCredNote({ ok: false, text: "API server unreachable (npm run api) — the credential test runs server-side." }); }
    } else {
      /* non-WP platforms: store for the deploy engine; real validation happens on first use */
      set({ credential: { type: plat.credential.type, value: val, masked: val.slice(0, 4) + "••••••••", status: "saved", addedAt: Date.now() } });
      setCredDraft(""); setCredNote({ ok: true, text: `${plat.credential.type} saved — it's validated on the first live call.` });
    }
    setTestingCred(false);
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
                  <p className="mt-1 text-[10px] leading-relaxed text-gray-400">
                    Points at <span className="ll-mono">{appOrigin()}/px.js</span> — resolved automatically from where this CRM is hosted (override it in Company Settings → App domain). Safe to install on any client site.
                    Verification lights up once the CRM is hosted there (a local-only CRM can't receive hits from remote websites).
                  </p>
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
                <button onClick={() => { set({ connected: true, platform: connectStep, siteKey, verified: false, credential: null }); setConnectStep(null); work?.("website", "webConnected", { detail: WEB_PLATFORMS[connectStep].label }); log?.(`Connected ${WEB_PLATFORMS[connectStep].label} website`, project.website); }}
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
    { key: "mapping", label: "Website Mapping & Content", icon: Network, note: w.architecture?.tree?.length ? `${w.architecture.tree.length} top pages` : "AI site architecture" },
    { key: "media", label: "Media", icon: ImagePlus, note: (w.media || []).length ? `${w.media.length} items synced` : "Sync the WP media library" },
  ];
  return (
    <div className="space-y-4">
      {/* sub-nav — horizontal top bar (matches the GBP tab bar; avoids a second sidebar) */}
      <div className="flex flex-wrap gap-1.5">
        {SUBS.map((t) => (
          <button key={t.key} onClick={() => setSub(t.key)}
            className="flex items-center gap-2 rounded-xl border px-3.5 py-2 text-left"
            style={sub === t.key ? { background: accent + "10", borderColor: accent } : { background: "var(--chip-bg, #fff)", borderColor: "#E5E7EB" }}>
            <t.icon size={15} className="shrink-0" style={{ color: sub === t.key ? accent : "#9CA3AF" }} />
            <span>
              <span className="block text-[12.5px] font-semibold leading-tight" style={{ color: sub === t.key ? accent : "var(--chip-fg, #374151)" }}>{t.label}</span>
              <span className="block text-[10px] leading-tight text-gray-400">{t.note}</span>
            </span>
          </button>
        ))}
      </div>

      {sub === "connection" && (
        <Card className="p-4">
          <div className="ll-display mb-1 text-[13.5px] font-semibold">How to place the pixel / connect publishing</div>
          <ol className="list-decimal space-y-1.5 pl-5 text-[12px] leading-relaxed text-gray-600">
            <li><b>WordPress plugin (optional — needed only for Elementor builds & server-side meta):</b> upload <span className="ll-mono text-[11px]">server/wordpress-plugin/serp-squad-connector.php</span> (zip it → wp-admin → Plugins → Add New → Upload). It registers the deploy meta fields (<span className="ll-mono text-[11px]">_serpsquad_meta_*</span>, <span className="ll-mono text-[11px]">_elementor_data</span>), maps them into Yoast/RankMath, and can inject the pixel site-wide. HTML & Block Editor deploys, scheduling, media sync and cleanup work with just the Application Password — no plugin.</li>
            <li><b>No plugin?</b> Paste the pixel snippet into the theme header: Appearance → Theme File Editor → <span className="ll-mono text-[11px]">header.php</span> just before <span className="ll-mono text-[11px]">&lt;/head&gt;</span> — or use a header/footer code plugin (WPCode) and add it to "Header" on all pages.</li>
            <li><b>Unlock publishing & full-site deploys:</b> wp-admin → Users → Profile → Application Passwords → create one named "SERP Squad" and paste it below as <span className="ll-mono text-[11px]">username:xxxx xxxx xxxx xxxx</span>. This powers page/post creation, Elementor & Block Editor builds, scheduled posts, media sync and old-content cleanup via the WordPress REST API.</li>
            <li><b>Verify:</b> open your site once after placing the pixel — the connector flips to "verified" when the pixel calls home.</li>
          </ol>
        </Card>
      )}

      {/* selected feature window */}
      <div className="min-w-0 space-y-4">
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
          {verifyNote && <div className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">{verifyNote}</div>}
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
                <GuideTip title={`How to create the ${plat.credential.type}`} accent={accent}
                  steps={w.platform === "wordpress"
                    ? ["wp-admin → Users → Profile → scroll to Application Passwords.", "Name it e.g. \"SERP Squad\" → Add New — copy the generated password WITH its spaces.", "Enter it here as username:xxxx xxxx xxxx xxxx (your WP username, a colon, then the password).", "Hit Test & save — it verifies reachability, REST API, auth and publish rights step by step."]
                    : w.platform === "webflow"
                    ? ["Webflow Site settings → Apps & Integrations → API access → Generate token.", "Grant CMS + Pages + Publish scopes.", "Paste the token here; the Site ID (Site settings → General) is asked at deploy time."]
                    : ["Create the credential in your platform's admin (see the connection guide above).", "Paste it here and hit Test & save."]} />
                <input value={credDraft} onChange={(e) => setCredDraft(e.target.value)} placeholder={plat.credential.placeholder} className={"ll-mono " + inputCls} />
                <button onClick={testCred} disabled={!credDraft.trim() || testingCred}
                  className="shrink-0 rounded-lg px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
                  {testingCred ? "Testing…" : "Test & save"}
                </button>
              {credNote && (
                <div className={"mt-1.5 w-full rounded-lg border px-3 py-2 text-[11px] leading-relaxed " + (credNote.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800")}>
                  {credNote.text}
                  {credNote.checks && <span className="ll-mono mt-0.5 block text-[9.5px] opacity-70">reachable {credNote.checks.reachable ? "✓" : "✕"} · REST {credNote.checks.restApi ? "✓" : "✕"} · auth {credNote.checks.authenticated ? "✓" : "✕"} · publish {credNote.checks.canPublish ? "✓" : "✕"}</span>}
                </div>
              )}
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
          <input value={pgSearch} onChange={(e) => setPgSearch(e.target.value)} placeholder="Search pages…"
            className="w-40 rounded-lg border border-gray-200 px-3 py-2 text-[12px] no-print" />
          <button onClick={() => runIndexCheck(w.pages.slice(0, 50), w.blogs.filter((b) => b.status === "published").slice(0, 50))} disabled={idxChecking}
            title="Re-check the Google index status of every page and published post (real site: queries via DataForSEO)"
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-[12px] font-semibold text-gray-600 disabled:opacity-40">
            {idxChecking ? <><RefreshCw size={12} className="animate-spin" /> Checking…</> : <><Search size={12} /> Re-check indexing</>}
          </button>
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
        {idxErr && (
          <div className="mb-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
            <span className="min-w-0 flex-1">{idxErr}</span>
            <button onClick={() => setIdxErr(null)} className="shrink-0 font-bold">✕</button>
          </div>
        )}
        <HealthBoard list={w.pages} filter={pgFilter} setFilter={setPgFilter} noun="pages" />
        <div className="overflow-x-auto">
        <table className="w-full table-fixed text-[11.5px]">
          <thead>
            <tr className="border-b border-gray-100 text-left text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">
              <th className="w-7 py-2 pr-1">#</th>
              <SortHead state={pgSort} setState={setPgSort} k="name">Page</SortHead>
              <th className="w-[150px] py-2 pr-2">Meta title</th>
              <th className="w-[170px] py-2 pr-2">Meta description</th>
              <SortHead state={pgSort} setState={setPgSort} k="date" defDir="desc" className="w-[86px] py-2 pr-2">Date</SortHead>
              <th className="w-[168px] py-2">Opportunity</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && pgSearch && (
              <tr><td colSpan={6} className="py-6 text-center text-[12px] text-gray-400">No pages match “{pgSearch}”.</td></tr>
            )}
            {pageRows.map((pg, i) => (
              <tr key={pg.id} onClick={() => setOpenPage(pg.id)} className="cursor-pointer border-b border-gray-50 align-top hover:bg-gray-50">
                <td className="ll-mono py-2.5 pr-1 text-[10px] text-gray-300">{i + 1}</td>
                <td className="min-w-0 py-2.5 pr-2">
                  {/* tree indent: children sit visibly under their parent */}
                  <div className="flex items-center gap-1.5" style={pg.depth ? { paddingLeft: pg.depth * 18 } : undefined}>
                    {pg.depth > 0 && <span className="shrink-0 text-gray-300">↳</span>}
                    <span className="truncate text-[12.5px] font-medium text-gray-800">{pg.name || pg.metaTitle || pg.url}</span>
                    {pg.dirty && <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-px text-[8.5px] font-bold uppercase text-amber-600">Pending</span>}
                  </div>
                  <div className="ll-mono truncate text-[10px] text-gray-400" style={pg.depth ? { paddingLeft: pg.depth * 18 + 18 } : undefined}>{pg.url}</div>
                  <div className="mt-1 flex items-center gap-1.5" style={pg.depth ? { paddingLeft: pg.depth * 18 + 18 } : undefined}>
                    <IndexTag idx={pg.index} checking={(idxChecking && indexStale(pg.index)) || idxBusy["page" + pg.id]} />
                    <RecheckBtn kind="page" item={pg} />
                  </div>
                </td>
                <td className="py-2.5 pr-2">
                  {pg.metaTitle ? <><span className="line-clamp-2 text-[11px] leading-snug text-gray-600">{pg.metaTitle}</span><div className="mt-0.5"><MetaChip label="MT" value={pg.metaTitle} max={60} /></div></> : null}
                </td>
                <td className="py-2.5 pr-2">
                  {pg.metaDesc ? <><span className="line-clamp-2 text-[11px] leading-snug text-gray-500">{pg.metaDesc}</span><div className="mt-0.5"><MetaChip label="MD" value={pg.metaDesc} max={160} /></div></> : null}
                </td>
                <td className="ll-mono py-2.5 pr-2 text-[10px] leading-relaxed text-gray-400">
                  {pageDate(pg) ? fmtTs2(pageDate(pg)) : null}
                  {pg.updatedAt && pg.modified ? <div>Upd {fmtTs2(pg.updatedAt)}</div> : null}
                </td>
                <td className="py-2.5">
                  <OppBadge projectId={project.id} url={pg.url} tracking={trackedKws} brand={project.name} />
                  <span className="mt-1 flex w-fit items-center gap-1 rounded-lg border px-2 py-1 text-[10.5px] font-semibold" style={{ borderColor: accent, color: accent }}>
                    <Settings2 size={11} /> Live edit & re-optimize
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {openPage && w.pages.find((p) => p.id === openPage) && (
          <LivePageEditor page={w.pages.find((p) => p.id === openPage)} accent={accent}
            project={project} aiProviders={aiProviders}
            sitePages={[...w.pages.map((x) => ({ url: x.origUrl || x.url, title: x.name || x.metaTitle || x.url })), ...w.blogs.map((x) => ({ url: "/blog/" + x.slug, title: x.title }))]}
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
          <span className="flex items-center gap-2">
            <input value={postSearch} onChange={(e) => setPostSearch(e.target.value)} placeholder="Search posts…"
              className="w-40 rounded-lg border border-gray-200 px-3 py-2 text-[12px] no-print" />
            <button onClick={() => setOpenPost("new")} disabled={!blogsEnabled}
              className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
              <Plus size={13} /> Publish a new post
            </button>
          </span>
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
        {idxErr && (
          <div className="mb-2 mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
            <span className="min-w-0 flex-1">{idxErr}</span>
            <button onClick={() => setIdxErr(null)} className="shrink-0 font-bold">✕</button>
          </div>
        )}
        <div className="mt-3"><HealthBoard list={w.blogs} filter={postFilter} setFilter={setPostFilter} noun="posts" /></div>
        <div className="overflow-x-auto">
        <table className="w-full table-fixed text-[11.5px]">
          <thead>
            <tr className="border-b border-gray-100 text-left text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">
              <th className="w-7 py-2 pr-1">#</th>
              <SortHead state={postSort} setState={setPostSort} k="name">Post</SortHead>
              <th className="w-[140px] py-2 pr-2">Meta title</th>
              <th className="w-[160px] py-2 pr-2">Meta description</th>
              <SortHead state={postSort} setState={setPostSort} k="date" defDir="desc" className="w-[92px] py-2 pr-2">Date</SortHead>
              <th className="w-[168px] py-2 pr-2">Opportunity</th>
              <th className="w-[78px] py-2 pr-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {postRows.length === 0 && postSearch && (
              <tr><td colSpan={7} className="py-6 text-center text-[12px] text-gray-400">No posts match “{postSearch}”.</td></tr>
            )}
            {postRows.map((b, i) => (
              <tr key={b.id} onClick={() => blogsEnabled && setOpenPost(b.id)} className="cursor-pointer border-b border-gray-50 align-top hover:bg-gray-50">
                <td className="ll-mono py-2.5 pr-1 text-[10px] text-gray-300">{i + 1}</td>
                <td className="min-w-0 py-2.5 pr-2">
                  <div className="flex items-center gap-1.5">
                    {b.featured && <img src={b.featured} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />}
                    <span className="truncate text-[12.5px] font-medium text-gray-800">{b.title}</span>
                  </div>
                  <div className="ll-mono truncate text-[10px] text-gray-400">/blog/{b.slug}{(b.categories || []).length ? ` \u00b7 ${b.categories.join(", ")}` : ""}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <IndexTag idx={b.index} checking={(idxChecking && indexStale(b.index)) || idxBusy["post" + b.id]} />
                    {b.status === "published" && <RecheckBtn kind="post" item={b} />}
                  </div>
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
                  <OppBadge projectId={project.id} url={"/blog/" + (b.slug || "")} tracking={trackedKws} brand={project.name} />
                  <span className="mt-1 flex w-fit items-center gap-1 rounded-lg border px-2 py-1 text-[10.5px] font-semibold" style={{ borderColor: accent, color: accent }}>
                    <Settings2 size={11} /> Live edit & re-optimize
                  </span>
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
          project={project} aiProviders={aiProviders}
          sitePages={[...w.pages.map((x) => ({ url: x.origUrl || x.url, title: x.name || x.metaTitle || x.url })), ...w.blogs.map((x) => ({ url: "/blog/" + x.slug, title: x.title }))]}
          siteHost={project.website} slugsEditable={slugsEnabled || w.platform === "wordpress"} accent={accent}
          onSave={(post) => {
            if (openPost === "new") {
              set({ blogs: [{ ...post, id: "bl" + Date.now(), createdAt: Date.now() }, ...w.blogs] });
              work?.("website", post.status === "published" ? "blogPublished" : post.status === "scheduled" ? "blogScheduled" : "blogDrafted", { detail: post.title });
              log?.(post.status === "published" ? "Published blog post to website" : post.status === "scheduled" ? "Scheduled blog post" : "Saved blog draft", post.title);
            } else {
              set({ blogs: w.blogs.map((x) => (x.id === openPost ? { ...x, ...post, updatedAt: Date.now() } : x)) });
              work?.("website", "blogUpdated", { detail: post.title });
              log?.("Updated blog post on website", post.title);
            }
            setOpenPost(null);
          }}
          onDelete={openPost !== "new" ? () => { const t = w.blogs.find((x) => x.id === openPost)?.title || ""; if (!askDelete(`the post "${t || "this post"}"`)) return; set({ blogs: w.blogs.filter((x) => x.id !== openPost) }); work?.("website", "blogDeleted", { detail: t }); log?.("Deleted blog post from website", t); } : null}
          onClose={() => setOpenPost(null)} />
      )}
      </>)}

      {sub === "mapping" && <WebsiteMappingTab opt={opt} setOpt={setOpt} accent={accent} log={log} project={project} dfs={dfs} aiConfig={aiConfig} />}
      {sub === "media" && <WebsiteMediaTab opt={opt} setOpt={setOpt} accent={accent} log={log} project={project} />}
      </div>
    </div>
  );
}

/* ---------------- Social tab ---------------- */

/* ---------------- Bing Places & Apple Maps pusher tabs ----------------
   Same editing model as GBP: identity fields locked (name/categories/phone/
   address changes trigger re-verification on both networks), while website,
   description, hours and photos push straight from the tool.
   PROD: Bing → Azure AD app + Bing Places bulk/chain API;
         Apple → Apple Business Connect API (JWT from the .p8 key in API settings).
   Apple additionally gets Showcases — its promotional-card equivalent of posts;
   Bing Places has no posts feature, so that section is Google/Apple-only. */
const PLACE_META = {
  bing: {
    name: "Bing Places", api: "Bing Places API", descMax: 980, Icon: BingIcon,
    connectLabel: "Connect via Microsoft", credsNote: "Uses the Microsoft credentials from Company Settings → API settings.",
    photosNote: "The gallery mirrors what's live on your Bing Places listing; uploads are pushed through the listing update API.",
  },
  apple: {
    name: "Apple Maps", api: "Apple Business Connect", descMax: 500, Icon: AppleMapsIcon,
    connectLabel: "Connect Apple Business Connect", credsNote: "Uses the Apple Business Connect key from Company Settings → API settings.",
    photosNote: "The gallery mirrors your Apple Maps place card; uploads are pushed via Business Connect media upload.",
  },
};

/* ---------------- Media tab: the WordPress media library, synced ----------------
   Live via /api/wp/media (Application Password); without it a labeled demo
   library seeded from the project's services/cities so page deploys can place
   related images with generated alt/title text. */
export function WebsiteMediaTab({ opt, setOpt, accent, log, project }) {
  const w = opt.website || {};
  const media = w.media || [];
  const work = useWork();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [mSearch, setMSearch] = useState("");
  const [mFilter, setMFilter] = useState("all"); // all | noalt
  const isImg = (m) => m.type === "image" || (m.mime || "").startsWith("image/") || m.demo;
  const images = media.filter(isImg);
  const noAlt = images.filter((m) => !(m.alt || "").trim());
  const shown = media
    .filter((m) => (mFilter === "noalt" ? isImg(m) && !(m.alt || "").trim() : true))
    .filter((m) => !mSearch.trim() || [m.name, m.title, m.alt].some((x) => (x || "").toLowerCase().includes(mSearch.trim().toLowerCase())));
  /* inline title/alt editing — saved straight back into WordPress */
  const [editId, setEditId] = useState(null);
  const [editVals, setEditVals] = useState({ title: "", alt: "" });
  const [savingId, setSavingId] = useState(null);
  const saveMeta = async (m) => {
    setSavingId(m.id); setErr(null);
    try {
      const r = await fetch("/api/wp/media-update", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000),
        body: JSON.stringify({ site: project.website, credential: w.credential?.value || w.credential, id: m.id, title: editVals.title, alt: editVals.alt }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setOpt("website", { media: media.map((x) => (x.id === m.id ? { ...x, title: editVals.title, name: editVals.title, alt: editVals.alt } : x)) });
        work?.("website", "mediaMetaUpdated", { detail: editVals.title || m.name });
        log?.(`Updated media title/alt — ${editVals.title || m.name}`, project.website);
        setEditId(null);
      } else setErr(d.detail || `HTTP ${r.status}`);
    } catch (e) { setErr("Save failed — " + (e?.message || e)); }
    setSavingId(null);
  };
  const demoLibrary = () => {
    const svcs = (w.architecture?.services || "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
    const cities = (w.architecture?.locations || "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
    const names = [
      ...svcs.map((sv) => sv + " result"), ...svcs.map((sv) => sv + " team at work"),
      ...cities.map((c) => project.name.split(" — ")[0] + " " + c + " office"),
      "before and after", "our team", "storefront", "equipment closeup",
    ].slice(0, 16);
    return names.map((n, i) => ({ id: "dm" + i, name: n + ".jpg", title: n, alt: n + " — " + project.name.split(" — ")[0], url: photoThumb(n), type: "image", demo: true }));
  };
  const sync = async () => {
    setBusy(true); setErr(null);
    if (w.platform === "wordpress" && w.credential) {
      try {
        const r = await fetch("/api/wp/media", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000),
          /* the server wants the raw "user:app-password" string — the stored
             credential is an object holding it in .value */
          body: JSON.stringify({ site: project.website, credential: w.credential?.value || w.credential }) });
        const d = await r.json().catch(() => ({}));
        if (r.ok) { setOpt("website", { media: d.media.map((m) => ({ ...m, title: m.name, demo: false })) }); work?.("website", "mediaSynced", { detail: `${d.media.length} items` }); log?.(`Synced ${d.media.length} media items`, project.website); setBusy(false); return; }
        setErr(d.detail || `HTTP ${r.status}`);
      } catch (e) { setErr("API server unreachable — " + (e?.message || e)); }
    } else {
      setErr("WordPress isn't connected with an Application Password — loading a labeled demo library instead.");
      setOpt("website", { media: demoLibrary() });
      log?.("Loaded demo media library", project.website);
    }
    setBusy(false);
  };
  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="ll-display text-[14px] font-semibold">WordPress media library</div>
          <div className="text-[11px] text-gray-400">Synced media is matched to pages by keyword during full-site deploys — with generated alt & title text on every placement.</div>
        </div>
        <input value={mSearch} onChange={(e) => setMSearch(e.target.value)} placeholder="Search media…"
          className="w-44 rounded-lg border border-gray-200 px-3 py-2 text-[12px] no-print" />
        <button onClick={sync} disabled={busy} className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50" style={{ background: accent }}>
          <RefreshCw size={13} className={busy ? "animate-spin" : ""} /> {media.length ? "Re-sync media" : "Sync media"}
        </button>
      </Card>
      {err && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-[11.5px] text-amber-800">{err}</div>}
      {media.length > 0 && (
        /* visual overview: totals + the no-alt worklist, one click away */
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[["all", "Total items", media.length, "#334155"], ["img", "Images", images.length, "#0E7C66"], ["noalt", "No alt text", noAlt.length, noAlt.length ? "#DC2626" : "#16A34A"], ["withalt", "With alt text", images.length - noAlt.length, "#16A34A"]].map(([k, label, n, color]) => (
            <div key={k} className="rounded-xl border border-gray-100 bg-gray-50/60 p-2.5">
              <div className="text-[9.5px] font-bold uppercase tracking-wide text-gray-400">{label}</div>
              <div className="ll-display text-[20px] font-bold" style={{ color }}>{n}</div>
              <div className="mb-1 mt-1 h-1 overflow-hidden rounded-full bg-gray-200">
                <div className="h-full rounded-full" style={{ width: `${media.length ? Math.min(100, (n / media.length) * 100) : 0}%`, background: color }} />
              </div>
              {(k === "noalt" || k === "all") && (
                <button onClick={() => setMFilter(k === "noalt" ? "noalt" : "all")} className="text-[9.5px] font-bold" style={{ color: mFilter === (k === "noalt" ? "noalt" : "all") ? accent : "#9CA3AF" }}>View →</button>
              )}
            </div>
          ))}
        </div>
      )}
      {media.length > 0 && (
        <div className="no-print flex flex-wrap items-center gap-1.5">
          {[["all", `All items (${media.length})`], ["noalt", `No alt text (${noAlt.length})`]].map(([k, label]) => (
            <button key={k} onClick={() => setMFilter(k)} className="rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold"
              style={mFilter === k ? { background: accent, borderColor: accent, color: "#fff" } : { background: "#fff", borderColor: "#E5E7EB", color: "#4B5563" }}>
              {label}
            </button>
          ))}
          <span className="text-[10.5px] text-gray-400">{mSearch ? ` ${shown.length} match` : ""} · click any item's “Edit alt/title” — saves straight into WordPress</span>
        </div>
      )}
      {media.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((m) => (
            <Card key={m.id} className="overflow-hidden p-0">
              {isImg(m) ? (
                /* real site images load through the CRM's proxy — client-site
                   firewalls challenge direct cross-site <img> loads and the
                   previews hang; failed loads collapse into a labeled tile */
                <img src={m.demo ? m.url : "/api/img?u=" + encodeURIComponent(m.url)} alt={m.alt || m.name} className="h-28 w-full bg-gray-50 object-cover" loading="lazy" referrerPolicy="no-referrer"
                  onError={(e) => { e.currentTarget.outerHTML = '<div class="flex h-28 w-full items-center justify-center bg-gray-100 text-[10px] text-gray-400">preview blocked by site</div>'; }} />
              ) : (
                <div className="flex h-28 w-full items-center justify-center bg-gray-100 text-[10.5px] font-semibold uppercase text-gray-400">{(m.mime || m.type || "file").split("/").pop()}</div>
              )}
              <div className="p-2.5">
                {editId === m.id ? (
                  <div className="space-y-1.5">
                    <input value={editVals.title} onChange={(e) => setEditVals((v) => ({ ...v, title: e.target.value }))} placeholder="Image title"
                      className="w-full rounded-lg border border-gray-200 px-2 py-1 text-[11px]" />
                    <input value={editVals.alt} onChange={(e) => setEditVals((v) => ({ ...v, alt: e.target.value }))} placeholder="Alt text (describe the image)"
                      className="w-full rounded-lg border border-gray-200 px-2 py-1 text-[11px]" />
                    <div className="flex gap-1.5">
                      <button onClick={() => saveMeta(m)} disabled={savingId === m.id}
                        className="flex-1 rounded-lg py-1 text-[10.5px] font-bold text-white disabled:opacity-50" style={{ background: accent }}>
                        {savingId === m.id ? "Saving…" : "Save to WordPress"}
                      </button>
                      <button onClick={() => setEditId(null)} className="rounded-lg border border-gray-200 px-2 py-1 text-[10.5px] font-semibold text-gray-500">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="truncate text-[11.5px] font-semibold text-gray-700">{m.title || m.name}{m.demo && <span className="ml-1 rounded bg-amber-100 px-1 py-px text-[7.5px] font-bold uppercase text-amber-700">demo</span>}</div>
                    <div className="truncate text-[9.5px]" style={{ color: (m.alt || "").trim() ? "#9CA3AF" : "#DC2626" }}>alt: {m.alt || "missing"}</div>
                    {!m.demo && w.platform === "wordpress" && (
                      <button onClick={() => { setEditId(m.id); setEditVals({ title: m.title || m.name || "", alt: m.alt || "" }); }}
                        className="mt-1 text-[10px] font-bold" style={{ color: accent }}>Edit alt/title</button>
                    )}
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {media.length === 0 && <Card className="p-10 text-center text-[12.5px] text-gray-400">No media synced yet — hit <b>Sync media</b> to pull the site's library (or load the labeled demo set).</Card>}
    </div>
  );
}

export function PlaceOptTab({ kind, opt, setOpt, accent, log, project, ai = null, locId = null }) {
  const meta = PLACE_META[kind];
  const pl = opt[kind] || {};
  const set = (patch) => setOpt(kind, patch);
  const [tab, setTab] = useState("info");
  const [savedInfo, setSavedInfo] = useState(false);
  const [show, setShow] = useState({ title: "", text: "", url: "", image: null });
  const work = useWork();
  const brandVoice = opt.brandVoice;
  const brand = project.name.split(" — ")[0];
  const bizCtx = () => `Business: ${pl.bizName || project.name}. Categories: ${(pl.categories || []).join(", ") || "—"}. Address: ${pl.address || "—"}.`;

  if (!pl.connected) return (
    <Card className="p-8 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50"><meta.Icon size={22} /></div>
      <div className="ll-display mt-2 text-[16px] font-semibold">Connect {meta.name}</div>
      <p className="mx-auto mt-1 max-w-md text-[12.5px] text-gray-400">
        Manage this location on {meta.name}: edit hours, description, website and photos{kind === "apple" ? ", and publish Showcases" : ""} —
        everything except the core identity fields. {meta.credsNote}
      </p>
      <div className="mt-4 flex justify-center">
        <OAuthButton label={meta.connectLabel} accent={accent}
          onDone={() => {
            set({ connected: true, bizName: project.name, website: "https://" + project.website,
              categories: opt.gbp.categories?.length ? opt.gbp.categories : [], phone: opt.gbp.phone || "", address: opt.gbp.address || "",
              description: pl.description || opt.gbp.description || "" });
            log?.(`Connected ${meta.name}`, project.name);
          }} />
      </div>
    </Card>
  );

  const TABS = [["info", "Business information"], ["photos", "Photos"], ...(kind === "apple" ? [["showcases", "Showcases"]] : []), ["reviews", "Reviews"]];
  const publishShowcase = () => {
    if (!show.title.trim()) return;
    set({ showcases: [{ id: "sc" + Date.now(), ...show, createdAt: Date.now() }, ...(pl.showcases || [])] });
    work?.("apple", "showcasePublished", { detail: show.title });
    log?.("Published Apple Maps showcase", project.name);
    setShow({ title: "", text: "", url: "", image: null });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold"
            style={tab === key ? { background: accent + "10", borderColor: accent, color: accent } : { background: "var(--chip-bg, #fff)", borderColor: "#E5E7EB", color: "var(--chip-fg, #4B5563)" }}>
            {label}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-gray-400"><meta.Icon size={13} /> {meta.api}</span>
      </div>

      {tab === "info" && (
        <Card className="space-y-3 p-5">
          <div className="ll-display text-[15px] font-semibold">Business information</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Business name">
              <div className="flex items-center gap-1.5 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-[13px] text-gray-400"><Lock size={12} /> {pl.bizName || "—"}</div>
            </Labeled>
            <Labeled label="Categories">
              <div className="flex items-center gap-1.5 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-[13px] text-gray-400"><Lock size={12} /> {(pl.categories || []).join(", ") || "—"}</div>
            </Labeled>
            <Labeled label="Phone">
              <div className="flex items-center gap-1.5 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-[13px] text-gray-400"><Lock size={12} /> {pl.phone || "—"}</div>
            </Labeled>
            <Labeled label="Website"><input value={pl.website || ""} onChange={(e) => set({ website: e.target.value })} className={inputCls} /></Labeled>
          </div>
          <Labeled label="Address">
            <div className="flex items-center gap-1.5 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-[13px] text-gray-400"><Lock size={12} /> {pl.address || "—"}</div>
          </Labeled>
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
            Name, categories, phone & address are locked — changing core identity fields triggers re-verification on {meta.name}. Update them at the source if ever needed.
          </div>
          <Labeled label={<span className="flex items-center justify-between">Description
            <span className="flex items-center gap-2">
              <AiWriteButton ai={ai} brandVoice={brandVoice} brand={brand} accent={accent} limit={meta.descMax} current={pl.description || ""}
                what={`the business description for our ${meta.name} listing (what we do, who we serve, what makes us different)`}
                context={bizCtx()} onText={(t) => set({ description: t })} />
              <CharCount value={pl.description || ""} max={meta.descMax} />
            </span></span>}>
            <textarea value={pl.description || ""} maxLength={meta.descMax} onChange={(e) => set({ description: e.target.value })} rows={3} className={inputCls + " resize-none"} />
          </Labeled>
          <Labeled label="Business hours">
            <div className="grid gap-1 sm:grid-cols-2">
              {Object.keys(pl.hours || {}).map((d) => (
                <div key={d} className="flex items-center gap-2">
                  <span className="ll-mono w-9 text-[11px] text-gray-400">{d}</span>
                  <input value={pl.hours[d]} onChange={(e) => set({ hours: { ...pl.hours, [d]: e.target.value } })}
                    className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-[12px]" />
                </div>
              ))}
            </div>
          </Labeled>
          <div className="flex items-center gap-2">
            <button onClick={() => { setSavedInfo(true); setTimeout(() => setSavedInfo(false), 1800); work?.(kind, "infoSaved"); log?.(`Saved ${meta.name} business info`, project.name); }}
              className="rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white" style={{ background: accent }}>
              Save to {meta.name}
            </button>
            {savedInfo && <span className="ll-fade text-[12px] font-medium text-emerald-600">✓ Pushed to {meta.api}</span>}
            <span className="ml-auto text-[10.5px] text-gray-400" title="Connection state is managed per location group">Connection managed in Project settings → Data sources</span>
          </div>
        </Card>
      )}

      {tab === "photos" && (
        <Card className="space-y-2.5 p-5">
          <div className="ll-display text-[15px] font-semibold">Photos</div>
          <div className="text-[11.5px] text-gray-400">{meta.photosNote}</div>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {(pl.photos || []).map((ph) => (
              <div key={ph.id} className="group relative overflow-hidden rounded-xl border border-gray-100 bg-white">
                <img src={ph.dataUrl || photoThumb(ph.name)} alt={ph.name} className="aspect-[8/5] w-full object-cover" />
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10.5px]">
                  <span className="min-w-0 flex-1 truncate text-gray-600">{ph.name}</span>
                  <span className="ll-mono shrink-0 text-gray-400">{fmtTs2(ph.addedAt)}</span>
                </div>
                <button onClick={() => { work?.(kind, "photoDeleted", { detail: ph.name }); set({ photos: (pl.photos || []).filter((x) => x.id !== ph.id) }); }}
                  className="absolute right-1.5 top-1.5 rounded-md bg-black/40 p-1 text-white opacity-0 hover:bg-red-500 group-hover:opacity-100"><Trash2 size={12} /></button>
              </div>
            ))}
            {(pl.photos || []).length === 0 && <div className="col-span-full py-4 text-center text-[11.5px] text-gray-300">No photos on the listing yet — upload the first ones below.</div>}
          </div>
          <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 py-2.5 text-[12px] font-medium text-gray-400 hover:border-gray-400 hover:text-gray-600">
            <Upload size={13} /> Upload photos to {meta.name}
            <input type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => {
                const files = [...(e.target.files || [])];
                if (files.length) work?.(kind, "photosUploaded", { count: files.length, detail: files[0].name + (files.length > 1 ? "…" : "") });
                files.forEach((f) => {
                  const rd = new FileReader();
                  rd.onload = () => set((cur) => ({ photos: [...(cur.photos || []), { id: "ph" + Date.now() + Math.random().toString(36).slice(2, 5), name: f.name, addedAt: Date.now(), dataUrl: rd.result }] }));
                  rd.readAsDataURL(f);
                });
                e.target.value = "";
              }} />
          </label>
        </Card>
      )}

      {tab === "showcases" && kind === "apple" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3 p-5">
            <div className="ll-display text-[15px] font-semibold">New showcase</div>
            <div className="text-[11.5px] text-gray-400">Showcases are Apple Maps' promotional cards — announcements, offers and seasonal features shown on your place card.</div>
            <Labeled label={<span className="flex items-center justify-between">Title *
              <span className="flex items-center gap-2">
                <AiWriteButton ai={ai} brandVoice={brandVoice} brand={brand} accent={accent} limit={58} current={show.title}
                  what={`a punchy title for an Apple Maps Showcase promotional card${show.text ? ` whose text is: "${show.text}"` : ""}`}
                  context={bizCtx()} onText={(t) => setShow((s) => ({ ...s, title: t }))} />
                <CharCount value={show.title} max={58} />
              </span></span>}>
              <input value={show.title} maxLength={58} onChange={(e) => setShow({ ...show, title: e.target.value })} className={inputCls} />
            </Labeled>
            <Labeled label={<span className="flex items-center justify-between">Text
              <span className="flex items-center gap-2">
                <AiWriteButton ai={ai} brandVoice={brandVoice} brand={brand} accent={accent} limit={500} current={show.text}
                  what={`the text for an Apple Maps Showcase promotional card${show.title ? ` titled "${show.title}"` : ""} (an announcement, offer or seasonal feature shown on our place card)`}
                  context={bizCtx()} onText={(t) => setShow((s) => ({ ...s, text: t }))} />
                <CharCount value={show.text} max={500} />
              </span></span>}>
              <textarea value={show.text} maxLength={500} rows={3} onChange={(e) => setShow({ ...show, text: e.target.value })} className={inputCls + " resize-none"} />
            </Labeled>
            <Labeled label="Link (optional)"><input value={show.url} onChange={(e) => setShow({ ...show, url: e.target.value })} placeholder="https://…" className={inputCls} /></Labeled>
            <Labeled label="Image"><LogoUpload value={show.image} onChange={(image) => setShow({ ...show, image })} label="Add image" /></Labeled>
            <button onClick={publishShowcase} disabled={!show.title.trim()}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
              <Send size={13} /> Publish showcase
            </button>
          </Card>
          <Card className="space-y-2 p-5">
            <div className="ll-display text-[15px] font-semibold">Live showcases</div>
            {(pl.showcases || []).map((sc) => (
              <div key={sc.id} className="group flex items-start gap-2.5 rounded-xl border border-gray-100 p-3">
                {sc.image && <img src={sc.image} alt="" className="h-12 w-16 shrink-0 rounded-lg object-cover" />}
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-gray-800">{sc.title}</div>
                  {sc.text && <div className="mt-0.5 line-clamp-2 text-[12px] text-gray-500">{sc.text}</div>}
                  <div className="ll-mono mt-1 text-[10px] text-gray-400">Published · {fmtTs2(sc.createdAt)}</div>
                </div>
                <button onClick={() => { work?.("apple", "showcaseDeleted", { detail: sc.title }); set({ showcases: (pl.showcases || []).filter((x) => x.id !== sc.id) }); }}
                  className="text-gray-300 opacity-0 hover:text-red-500 group-hover:opacity-100"><Trash2 size={13} /></button>
              </div>
            ))}
            {(pl.showcases || []).length === 0 && <div className="py-3 text-center text-[11.5px] text-gray-300">No showcases yet.</div>}
          </Card>
        </div>
      )}

      {tab === "reviews" && (
        <ReviewsPanel kind={kind} name={meta.name} data={pl} set={set} accent={accent} log={log}
          project={project} ai={ai} brandVoice={brandVoice} locId={locId} />
      )}
    </div>
  );
}

export function SocialOptTab({ opt, setOpt, accent, log }) {
  const soc = opt.social;
  const work = useWork();
  const set = (patch) => setOpt("social", patch);
  const [editId, setEditId] = useState(null);
  const [composer, setComposer] = useState({ platforms: [], text: "", image: null, when: "now", publishAt: "" });
  const connected = soc.accounts.filter((a) => a.connected);
  const hasX = composer.platforms.includes("x");

  const togglePlatform = (id) => setComposer((c) => ({ ...c, platforms: c.platforms.includes(id) ? c.platforms.filter((x) => x !== id) : [...c.platforms, id] }));
  const publish = () => {
    if (!composer.text.trim() || composer.platforms.length === 0) return;
    set({ posts: [{ id: "sp" + Date.now(), platforms: composer.platforms, text: composer.text, image: composer.image, status: composer.when === "now" ? "published" : "scheduled", publishAt: composer.when === "now" ? null : new Date(composer.publishAt).getTime(), createdAt: Date.now() }, ...soc.posts] });
    work?.("social", composer.when === "now" ? "socialPosted" : "socialScheduled", { count: Math.max(1, composer.platforms.length), detail: composer.text });
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
                  onDone={() => { set({ accounts: soc.accounts.map((x) => x.id === a.id ? { ...x, connected: true, handle: x.handle || "@yourhandle", name: x.name || a.platform } : x) }); work?.("social", "socialConnected", { detail: a.platform }); log?.(`Connected ${a.platform}`, ""); }}
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
                  <button onClick={() => { setEditId(null); work?.("social", "socialInfoUpdated", { detail: a.platform }); log?.(`Updated ${a.platform} page info`, ""); }}
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
                {p.image && <img src={p.image} alt="" className="mt-1 h-12 w-16 rounded-md object-cover" />}
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

