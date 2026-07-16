/* =====================================================================
   RESEARCH & AUDIT TOOLS — agency-level (no project needed).
   1 Business Profile Audit  (Google via Places API — live; Bing/Apple via
     a guided manual audit since neither has a public read API)
   2 Website Audit           (REAL crawl: the API server fetches the sitemap
     and analyzes every page — meta, content, links, schema, images)
   3 Business Listings Checker (the citation scanner, standalone)
   4 Index Checker             (real Google checks, standalone)
   5 Audit Report             (branded, printable — the proposal builder)
   Honesty model everywhere: live data or a clear 503/502 — never fabricated.
   ===================================================================== */
import React, { useMemo, useState } from "react";
import {
  AlertTriangle, Bookmark, Building2, CheckCircle2, Download, FileText, Globe, Link2,
  MapPin, Printer, RefreshCw, Search, Sparkles, Star, Trash2, X,
} from "lucide-react";
import { Card, Labeled, inputCls, askDelete } from "../../ui/primitives.jsx";
import { escHtml } from "../../lib/text.jsx";
import { aiGenerate } from "../../lib/aiwrite.jsx";
import { ListingsScannerTab } from "../optimization/branding.jsx";
import { IndexCheckerTab } from "../optimization/indexcheck.jsx";

/* ---------- shared bits ---------- */
export const csvDownload = (filename, headers, rows) => {
  const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
};

/* "Save this audit" — saved audits accumulate in company.savedAudits so past
   checks survive re-runs and reports can be built from any of them */
function SaveBtn({ onSave, accent, label = "Save this audit" }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={() => { onSave(); setDone(true); setTimeout(() => setDone(false), 2500); }}
      className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11.5px] font-semibold"
      style={done ? { borderColor: "#16A34A", color: "#16A34A", background: "#F0FDF4" } : { borderColor: accent, color: accent }}>
      {done ? <><CheckCircle2 size={12} /> Saved</> : <><Bookmark size={12} /> {label}</>}
    </button>
  );
}

const CheckRow = ({ ok, warn = false, label, note }) => (
  <div className="flex items-start gap-2 rounded-lg px-2.5 py-1.5" style={{ background: ok ? "#F0FDF4" : warn ? "#FFFBEB" : "#FEF2F2" }}>
    {ok ? <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-600" /> : <AlertTriangle size={13} className={"mt-0.5 shrink-0 " + (warn ? "text-amber-500" : "text-red-500")} />}
    <span className="min-w-0">
      <span className={"block text-[12px] font-semibold " + (ok ? "text-emerald-800" : warn ? "text-amber-800" : "text-red-700")}>{label}</span>
      {note && <span className="block text-[10.5px] text-gray-500">{note}</span>}
    </span>
  </div>
);

const ScoreRing = ({ score, accent, size = 72 }) => {
  const r = size / 2 - 6, c = 2 * Math.PI * r;
  const color = score >= 75 ? "#16A34A" : score >= 50 ? "#F59E0B" : "#DC2626";
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E5E7EB" strokeWidth="7" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="52%" dominantBaseline="middle" textAnchor="middle" fontSize={size / 4} fontWeight="800" fill={color}>{score}</text>
    </svg>
  );
};

/* profile audit checks → score (google: live Places data + optional manual counts) */
export function profileChecks(p, manual = {}) {
  const checks = [
    { ok: !!p.description && p.description.length >= 200, warn: !!p.description, label: p.description ? `Description present — ${p.description.length} chars` : "No business description", note: "Google allows 750 characters — use most of them with services + areas + differentiators." },
    { ok: (p.rating || 0) >= 4.4, warn: (p.rating || 0) >= 3.8, label: `Rating ${p.rating ?? "—"}★`, note: "4.4★+ is the local-pack comfort zone." },
    { ok: (p.reviews || 0) >= 30, warn: (p.reviews || 0) >= 10, label: `${p.reviews || 0} reviews`, note: "30+ reviews with steady velocity beats a big stale count." },
    { ok: (p.hours || []).length >= 7, warn: (p.hours || []).length > 0, label: (p.hours || []).length ? "Business hours set" : "No business hours", note: "Complete weekly hours (incl. holiday hours) improve conversions." },
    { ok: !!p.website, label: p.website ? "Website linked" : "No website on the listing", note: "" },
    { ok: !!p.phone, label: p.phone ? `Phone: ${p.phone}` : "No phone number", note: "" },
    { ok: (p.photosVisible || 0) >= 10, warn: (p.photosVisible || 0) >= 4, label: `${p.photosVisible || 0}${p.photosCapped ? "+" : ""} photos visible`, note: "Google's API shows max 10 — aim for 25+ fresh photos on the profile." },
    { ok: (p.categories || []).length >= 2, warn: (p.categories || []).length >= 1, label: `${(p.categories || []).length} categories visible`, note: "Primary + relevant secondary categories widen keyword coverage." },
    { ok: p.status === "OPERATIONAL" || !p.status, label: `Status: ${p.status || "operational"}`, note: "" },
  ];
  if (manual.services !== "" && manual.services != null) checks.push({ ok: +manual.services >= 5, warn: +manual.services >= 1, label: `${manual.services} services listed (manual check)`, note: "Every service = one more ranking surface. Add descriptions to each." });
  if (manual.products !== "" && manual.products != null) checks.push({ ok: +manual.products >= 3, warn: +manual.products >= 1, label: `${manual.products} products listed (manual check)`, note: "" });
  if (manual.posts !== "" && manual.posts != null) checks.push({ ok: +manual.posts >= 4, warn: +manual.posts >= 1, label: `${manual.posts} posts in the last 90 days (manual check)`, note: "Weekly posts keep the profile active — a strong engagement signal." });
  const score = Math.round((checks.filter((x) => x.ok).length + checks.filter((x) => !x.ok && x.warn).length * 0.5) / checks.length * 100);
  return { checks, score };
}

/* Bing/Apple guided-manual audit checks → score (shared with the report) */
export function manualProfileChecks(man) {
  const checks = [
    { ok: (man.description || "").length >= 200, warn: (man.description || "").length > 0, label: man.description ? `Description — ${man.description.length} chars` : "No description entered" },
    { ok: +man.categories >= 2, warn: +man.categories >= 1, label: `${man.categories || 0} categories` },
    { ok: +man.photos >= 10, warn: +man.photos >= 3, label: `${man.photos || 0} photos` },
    { ok: !!man.website, label: man.website ? "Website linked" : "No website" },
    { ok: !!man.hoursSet, label: man.hoursSet ? "Hours set" : "No business hours" },
    { ok: +man.rating >= 4.4, warn: +man.rating >= 3.8, label: `Rating ${man.rating || "—"}★ · ${man.reviews || 0} reviews` },
  ];
  const score = Math.round((checks.filter((x) => x.ok).length + checks.filter((x) => !x.ok && x.warn).length * 0.5) / checks.length * 100);
  return { checks, score };
}

/* website page → issue list */
export const pageIssues = (pg) => {
  const iss = [];
  if (pg.status !== 200) iss.push(["error", `HTTP ${pg.status || "failed"}`]);
  if (pg.noindex) iss.push(["error", "noindex"]);
  if (!pg.title) iss.push(["error", "missing title"]); else if (pg.titleLen > 60) iss.push(["warn", `title ${pg.titleLen} chars`]);
  if (!pg.metaDesc) iss.push(["warn", "missing meta description"]); else if (pg.metaDescLen > 160) iss.push(["warn", `description ${pg.metaDescLen} chars`]);
  if (pg.h1Count === 0) iss.push(["error", "no H1"]); else if (pg.h1Count > 1) iss.push(["warn", `${pg.h1Count} H1s`]);
  if ((pg.words || 0) < 300) iss.push(["warn", `thin content (${pg.words} words)`]);
  if ((pg.imagesNoAlt || 0) > 0) iss.push(["warn", `${pg.imagesNoAlt} images without alt`]);
  if (!(pg.schemaTypes || []).length) iss.push(["warn", "no schema"]);
  if ((pg.internalIn || 0) === 0 && pg.path !== "/") iss.push(["warn", "orphan — 0 incoming internal links"]);
  if (!pg.https) iss.push(["error", "not HTTPS"]);
  return iss;
};
export function websiteScore(pages) {
  const ok = pages.filter((p) => pageIssues(p).filter(([sev]) => sev === "error").length === 0);
  const clean = pages.filter((p) => pageIssues(p).length === 0);
  return Math.round(((ok.length / Math.max(1, pages.length)) * 60) + ((clean.length / Math.max(1, pages.length)) * 40));
}

/* =================== 1 · Business Profile Audit =================== */
function ProfileAuditTool({ accent, placesKey, res, setRes, manual, setManual, onSave }) {
  const [provider, setProvider] = useState("google");
  const [link, setLink] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [man, setMan] = useState({ name: "", description: "", categories: "", photos: "", website: "", hoursSet: false, rating: "", reviews: "" });

  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/audit/profile", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000),
        body: JSON.stringify({ url: link.trim() || undefined, query: query.trim() || undefined, placesKey }) });
      const d = await r.json();
      if (!r.ok) setErr(d.detail || d.error || `HTTP ${r.status}`);
      else if (!d.found) setErr(d.detail || "No listing found.");
      else setRes(d.place);
    } catch (e) { setErr("API server unreachable (npm run api) — the audit crawls through it. " + (e?.message || "")); }
    setBusy(false);
  };
  const p = res;
  const audit = p ? profileChecks(p, manual) : null;

  /* Bing / Apple: no public read API — a guided manual audit that scores what you observe */
  const { checks: manChecks, score: manScore } = manualProfileChecks(man);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {[["google", "Google Business Profile"], ["bing", "Bing Places"], ["apple", "Apple Maps"]].map(([k, l]) => (
          <button key={k} onClick={() => setProvider(k)} className="rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold"
            style={provider === k ? { background: accent + "10", borderColor: accent, color: accent } : { background: "#fff", borderColor: "#E5E7EB", color: "#4B5563" }}>{l}</button>
        ))}
      </div>

      {provider === "google" ? (
        <>
          <Card className="space-y-3 p-5">
            <div className="ll-display text-[15px] font-semibold">Audit any Google Business Profile</div>
            <div className="text-[11.5px] text-gray-400">
              Paste a Google Maps link (share link works) or the business name + city. Live data is pulled through your Google Places API key
              {placesKey ? "" : " — not configured yet (Company Settings → API settings)"}. No DataForSEO cost.
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Labeled label="Google Maps profile link"><input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://maps.app.goo.gl/…" className={"ll-mono " + inputCls} /></Labeled>
              <Labeled label="…or business name + city"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Bright Smile Dental, Manhattan" className={inputCls} /></Labeled>
            </div>
            <button onClick={run} disabled={busy || (!link.trim() && !query.trim())}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
              {busy ? <><RefreshCw size={13} className="animate-spin" /> Auditing…</> : <><Search size={13} /> Run profile audit</>}
            </button>
            {err && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11.5px] text-red-700">{err}</div>}
          </Card>

          {p && audit && (
            <Card className="space-y-4 p-5">
              <div className="flex flex-wrap items-center gap-4">
                <ScoreRing score={audit.score} accent={accent} />
                <div className="min-w-0 flex-1">
                  <div className="ll-display text-[16px] font-semibold">{p.name}</div>
                  <div className="text-[12px] text-gray-500">{p.address}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-gray-500">
                    <span className="flex items-center gap-1"><Star size={11} className="text-amber-400" fill="#FBBF24" /> {p.rating ?? "—"} · {p.reviews} reviews</span>
                    {p.phone && <span>· {p.phone}</span>}
                    {p.website && <a href={p.website} target="_blank" rel="noreferrer" className="ll-mono truncate underline" style={{ color: accent }}>{p.website.replace(/^https?:\/\//, "").slice(0, 40)}</a>}
                    <span className="rounded bg-emerald-100 px-1.5 py-px text-[8.5px] font-bold uppercase text-emerald-700">live · Places API</span>
                  </div>
                </div>
                <SaveBtn accent={accent} onSave={() => onSave({ type: "profile", label: p.name, data: { place: p, manual } })} />
              </div>
              {p.description && (
                <div className="rounded-xl bg-gray-50 p-3 text-[12px] leading-relaxed text-gray-600">
                  <b className="text-gray-700">Description ({p.description.length}/750 chars):</b> {p.description}
                </div>
              )}
              {(p.categories || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">{p.categories.map((c) => <span key={c} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">{c.replace(/_/g, " ")}</span>)}</div>
              )}
              <div className="grid gap-1.5 sm:grid-cols-2">{audit.checks.map((c, i) => <CheckRow key={i} {...c} />)}</div>
              <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
                <div className="text-[11.5px] font-semibold text-amber-800">Services / products / posts counts — Google only shows these to the profile owner (no public API).</div>
                <div className="mt-1 text-[10.5px] text-amber-700">Open the profile in Maps, count them, and enter below — they join the score and the audit report. Nothing is ever estimated for you.</div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {[["services", "Services"], ["products", "Products"], ["posts", "Posts (90 days)"]].map(([k, l]) => (
                    <Labeled key={k} label={l}><input value={manual[k] ?? ""} inputMode="numeric" onChange={(e) => setManual({ ...manual, [k]: e.target.value.replace(/\D/g, "") })} placeholder="count" className={inputCls} /></Labeled>
                  ))}
                </div>
              </div>
              {(p.latestReviews || []).length > 0 && (
                <div>
                  <div className="mb-1.5 text-[12px] font-bold text-gray-700">Latest reviews</div>
                  <div className="space-y-1.5">{p.latestReviews.map((rv, i) => (
                    <div key={i} className="rounded-lg border border-gray-100 px-3 py-2 text-[11.5px] text-gray-600">
                      <b className="text-gray-700">{rv.author}</b> · {rv.rating}★ · <span className="text-gray-400">{rv.when}</span><br />{rv.text}
                    </div>
                  ))}</div>
                </div>
              )}
            </Card>
          )}
        </>
      ) : (
        <Card className="space-y-3 p-5">
          <div className="ll-display text-[15px] font-semibold">{provider === "bing" ? "Bing Places" : "Apple Maps"} audit — guided manual check</div>
          <div className="rounded-xl bg-gray-50 p-3 text-[11.5px] leading-relaxed text-gray-500">
            {provider === "bing" ? "Bing Places" : "Apple Business Connect"} has <b>no public read API</b>, so this tool never pretends to crawl it.
            Open the listing ({provider === "bing" ? "bing.com/maps" : "maps.apple.com"}), observe each item and enter it — you get the same scored audit, honestly sourced.
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Business name"><input value={man.name} onChange={(e) => setMan({ ...man, name: e.target.value })} className={inputCls} /></Labeled>
            <Labeled label="Website on the listing"><input value={man.website} onChange={(e) => setMan({ ...man, website: e.target.value })} className={"ll-mono " + inputCls} /></Labeled>
          </div>
          <Labeled label={`Description on the listing (${man.description.length} chars)`}>
            <textarea value={man.description} rows={3} onChange={(e) => setMan({ ...man, description: e.target.value })} className={inputCls + " resize-none"} />
          </Labeled>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Labeled label="Categories"><input value={man.categories} inputMode="numeric" onChange={(e) => setMan({ ...man, categories: e.target.value.replace(/\D/g, "") })} className={inputCls} /></Labeled>
            <Labeled label="Photos"><input value={man.photos} inputMode="numeric" onChange={(e) => setMan({ ...man, photos: e.target.value.replace(/\D/g, "") })} className={inputCls} /></Labeled>
            <Labeled label="Rating"><input value={man.rating} onChange={(e) => setMan({ ...man, rating: e.target.value.replace(/[^0-9.]/g, "") })} className={inputCls} /></Labeled>
            <Labeled label="Reviews"><input value={man.reviews} inputMode="numeric" onChange={(e) => setMan({ ...man, reviews: e.target.value.replace(/\D/g, "") })} className={inputCls} /></Labeled>
            <label className="flex items-end gap-1.5 pb-2 text-[12px] text-gray-600"><input type="checkbox" checked={man.hoursSet} onChange={(e) => setMan({ ...man, hoursSet: e.target.checked })} /> Hours set</label>
          </div>
          {(man.name || man.description) && (
            <div className="flex items-center gap-4 rounded-xl border border-gray-100 p-3">
              <ScoreRing score={manScore} accent={accent} size={56} />
              <div className="grid flex-1 gap-1.5 sm:grid-cols-2">{manChecks.map((c, i) => <CheckRow key={i} {...c} />)}</div>
              <SaveBtn accent={accent} onSave={() => onSave({ type: "profile-manual", label: `${man.name || "Manual audit"} (${provider === "bing" ? "Bing" : "Apple"})`, data: { provider, man } })} />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

/* =================== 2 · Website Audit =================== */
function WebsiteAuditTool({ accent, res, setRes, onSave }) {
  const [sitemap, setSitemap] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/audit/website", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(360000),
        body: JSON.stringify({ sitemapUrl: sitemap.trim() }) });
      const d = await r.json();
      if (!r.ok) setErr(d.detail || d.error || `HTTP ${r.status}`);
      else setRes(d);
    } catch (e) { setErr("API server unreachable (npm run api) — the crawler runs there. " + (e?.message || "")); }
    setBusy(false);
  };

  const pages = res?.pages || [];
  const score = pages.length ? websiteScore(pages) : null;
  const stat = (fn) => pages.filter(fn).length;

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <div className="ll-display text-[15px] font-semibold">Website Audit — real crawl from the sitemap</div>
        <div className="text-[11.5px] text-gray-400">
          The API server fetches the sitemap (sitemap indexes supported) and crawls <b>every page in it</b> for meta, headings, content length, images & alt text,
          incoming/outgoing internal links, schema, HTTPS and speed. 100% real — no third-party API, no cost. (Runaway-safety ceiling: 400 pages — huge sites are never truncated silently.)
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Labeled label="Sitemap URL" className="flex-1">
            <input value={sitemap} onChange={(e) => setSitemap(e.target.value)} placeholder="https://example.com/sitemap.xml" className={"ll-mono w-full " + inputCls} />
          </Labeled>
          <button onClick={run} disabled={busy || !sitemap.trim()}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
            {busy ? <><RefreshCw size={13} className="animate-spin" /> Crawling every page…</> : <><Globe size={13} /> Crawl & audit all pages</>}
          </button>
        </div>
        {err && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11.5px] text-red-700">{err}</div>}
      </Card>

      {res && (
        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-4">
            <ScoreRing score={score} accent={accent} />
            <div className="flex-1">
              <div className="ll-display text-[15px] font-semibold">{res.host} <span className="rounded bg-emerald-100 px-1.5 py-px text-[8.5px] font-bold uppercase text-emerald-700">live crawl</span></div>
              <div className="text-[11.5px] text-gray-400">{res.crawled} of {res.totalInSitemap} sitemap URLs crawled</div>
            </div>
            <SaveBtn accent={accent} onSave={() => onSave({ type: "website", label: res.host, data: res })} />
            <button onClick={() => csvDownload(`${res.host}-audit.csv`,
              ["URL", "Status", "Title", "Title len", "Meta desc len", "H1s", "Words", "Images", "No-alt", "Internal in", "Internal out", "External out", "Schema", "Issues"],
              pages.map((p) => [p.url, p.status, p.title, p.titleLen, p.metaDescLen, p.h1Count, p.words, p.images, p.imagesNoAlt, p.internalIn, p.internalOutCount, p.externalOut, (p.schemaTypes || []).join(" | "), pageIssues(p).map(([, t]) => t).join("; ")]))}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[11.5px] font-semibold text-gray-600"><Download size={12} /> CSV</button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {[["Pages", pages.length], ["Missing titles", stat((p) => !p.title)], ["Missing descriptions", stat((p) => !p.metaDesc)],
              ["No H1", stat((p) => p.h1Count === 0)], ["Thin (<300w)", stat((p) => (p.words || 0) < 300)],
              ["No schema", stat((p) => !(p.schemaTypes || []).length)], ["Orphan pages", stat((p) => (p.internalIn || 0) === 0 && p.path !== "/")]].map(([l, v]) => (
              <div key={l} className="rounded-xl border border-gray-100 p-2.5 text-center">
                <div className="ll-mono text-[17px] font-bold" style={{ color: l === "Pages" ? accent : v > 0 ? "#DC2626" : "#16A34A" }}>{v}</div>
                <div className="text-[9.5px] font-semibold uppercase tracking-wide text-gray-400">{l}</div>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[11px]">
              <thead><tr className="border-b border-gray-200 text-[9.5px] uppercase tracking-wide text-gray-400">
                {["Page", "Title / meta", "H1", "Words", "Imgs (no alt)", "Links in / out", "Schema", "Issues"].map((h) => <th key={h} className="px-2 py-2 font-semibold">{h}</th>)}
              </tr></thead>
              <tbody>
                {pages.map((p) => {
                  const iss = pageIssues(p);
                  return (
                    <tr key={p.url} className="border-b border-gray-50 align-top hover:bg-gray-50">
                      <td className="ll-mono max-w-[200px] truncate px-2 py-2 font-medium text-gray-700" title={p.url}>{p.path}</td>
                      <td className="px-2 py-2 text-gray-500"><span className="block max-w-[220px] truncate" title={p.title}>{p.title || <i className="text-red-400">missing</i>}</span>
                        <span className="ll-mono text-[9.5px] text-gray-400">{p.titleLen}/60 · desc {p.metaDescLen}/160</span></td>
                      <td className="px-2 py-2 text-gray-500">{p.h1Count}</td>
                      <td className="ll-mono px-2 py-2 text-gray-500">{p.words}</td>
                      <td className="ll-mono px-2 py-2 text-gray-500">{p.images} ({p.imagesNoAlt})</td>
                      <td className="ll-mono px-2 py-2 text-gray-500">{p.internalIn} / {p.internalOutCount}</td>
                      <td className="max-w-[130px] px-2 py-2 text-gray-500">{(p.schemaTypes || []).join(", ") || "—"}</td>
                      <td className="px-2 py-2">
                        {iss.length === 0 ? <span className="rounded bg-emerald-100 px-1.5 py-px text-[9px] font-bold text-emerald-700">clean</span>
                          : iss.map(([sev, t], i) => <span key={i} className={"mb-0.5 mr-1 inline-block rounded px-1.5 py-px text-[9px] font-bold " + (sev === "error" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700")}>{t}</span>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/* =================== 5 · Branded Audit Report =================== */
function AuditReportTool({ accent, company, aiConfig, profileRes, profileManual, webRes, toolOpt, saved = [], onDeleteSaved }) {
  const [biz, setBiz] = useState("");
  const [notes, setNotes] = useState("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  /* each section picks its source: the latest run this session, or ANY saved
     audit — so old checks are never lost and reports mix & match freely */
  const [pick, setPick] = useState({ profile: "latest", website: "latest", listings: "latest", index: "latest" });
  const latest = {
    profile: profileRes ? { kind: "google", place: profileRes, manual: profileManual } : null,
    website: webRes || null,
    listings: toolOpt.branding?.listingScan || null,
    index: (toolOpt.indexChecker?.results || []).length ? toolOpt.indexChecker : null,
  };
  const TYPE_OF = { profile: ["profile", "profile-manual"], website: ["website"], listings: ["listings"], index: ["index"] };
  const resolve = (key) => {
    if (pick[key] === "none") return null;
    if (pick[key] === "latest") return latest[key];
    const s = saved.find((x) => x.id === pick[key]);
    if (!s) return null;
    if (key === "profile") return s.type === "profile" ? { kind: "google", ...s.data } : { kind: "manual", ...s.data };
    return s.data;
  };
  const prof = resolve("profile");
  const web = resolve("website");
  const listing = resolve("listings");
  const index = resolve("index");
  const audit = prof?.kind === "google" ? profileChecks(prof.place, prof.manual || {})
    : prof?.kind === "manual" ? manualProfileChecks(prof.man) : null;
  const wScore = web?.pages?.length ? websiteScore(web.pages) : null;

  const aiSummary = async () => {
    setBusy(true); setErr(null);
    try {
      const text = await aiGenerate(aiConfig, {
        system: "You write executive summaries for local-SEO audit reports that win clients. Plain text, 3 short paragraphs max: current state, biggest opportunities, what working together delivers. Confident, concrete, zero fluff.",
        maxTokens: 700,
        prompt: `Business: ${biz || prof?.place?.name || prof?.man?.name || web?.host || "the business"}.\n` +
          (audit ? `Business profile score ${audit.score}/100. Failing checks: ${audit.checks.filter((c) => !c.ok).map((c) => c.label).join("; ") || "none"}.\n` : "") +
          (wScore != null ? `Website score ${wScore}/100 over ${web.pages.length} pages: ${web.pages.filter((p) => !p.metaDesc).length} missing descriptions, ${web.pages.filter((p) => (p.words || 0) < 300).length} thin pages, ${web.pages.filter((p) => !(p.schemaTypes || []).length).length} without schema.\n` : "") +
          (listing ? `Citations: ${listing.found} directories found, ${listing.napIssues} NAP issues, score ${listing.score}/100.\n` : "") +
          (index ? `Indexation: ${(index.results || []).filter((r) => r.indexed).length}/${(index.results || []).length} URLs indexed.\n` : "") +
          `Agency: ${company.name}. Write the executive summary now.`,
      });
      setSummary(text.trim());
    } catch (e) { setErr(e.code === 503 ? "No AI provider connected — write the summary manually or add a key in API settings." : "AI error: " + e.message); }
    setBusy(false);
  };

  const download = () => {
    const rows = (arr) => arr.map((c) => `<div class="chk ${c.ok ? "ok" : c.warn ? "warn" : "bad"}">${c.ok ? "✓" : "✕"} ${escHtml(c.label)}</div>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(biz || "SEO Audit")} — ${escHtml(company.name)}</title><style>
      body{font:13px/1.55 -apple-system,system-ui,sans-serif;color:#1F2937;max-width:820px;margin:0 auto;padding:36px}
      .head{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid ${accent};padding-bottom:14px;margin-bottom:22px}
      h1{font-size:22px;margin:0}h2{font-size:15px;color:${accent};margin:26px 0 8px;border-bottom:1px solid #E5E7EB;padding-bottom:4px}
      .brand{font-weight:800;font-size:16px;color:${accent}}.muted{color:#6B7280;font-size:11px}
      .score{display:inline-block;font-weight:800;font-size:20px;padding:6px 14px;border-radius:10px;background:#F3F4F6}
      .chk{padding:4px 8px;border-radius:6px;margin:3px 0;font-size:12px}.ok{background:#F0FDF4;color:#166534}.warn{background:#FFFBEB;color:#92400E}.bad{background:#FEF2F2;color:#991B1B}
      table{width:100%;border-collapse:collapse;font-size:10.5px}th,td{border-bottom:1px solid #E5E7EB;padding:5px 6px;text-align:left}th{color:#6B7280;text-transform:uppercase;font-size:9px}
      .cta{margin-top:30px;padding:18px;border-radius:12px;background:${accent}12;border:1px solid ${accent}40}
      @media print {.noprint{display:none}} </style></head><body>
      <div class="head"><div><h1>${escHtml(biz || prof?.place?.name || prof?.man?.name || web?.host || "SEO Audit")}</h1><div class="muted">Website & Local SEO Audit · ${new Date().toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" })}</div></div>
      <div style="text-align:right"><div class="brand">${escHtml(company.name)}</div><div class="muted">Prepared by ${escHtml(company.name)}</div></div></div>
      ${summary ? `<h2>Executive summary</h2><p>${escHtml(summary).replace(/\n+/g, "</p><p>")}</p>` : ""}
      ${audit && prof?.kind === "google" ? `<h2>Google Business Profile — <span class="score">${audit.score}/100</span></h2>
        <p class="muted">${escHtml(prof.place.name)} · ${escHtml(prof.place.address)} · ${prof.place.rating ?? "—"}★ (${prof.place.reviews} reviews) · live via Google Places API</p>${rows(audit.checks)}` : ""}
      ${audit && prof?.kind === "manual" ? `<h2>${prof.provider === "bing" ? "Bing Places" : "Apple Maps"} listing — <span class="score">${audit.score}/100</span></h2>
        <p class="muted">${escHtml(prof.man.name || "")} · guided manual audit (no public read API on this network)</p>${rows(audit.checks)}` : ""}
      ${web?.pages?.length ? `<h2>Website audit — <span class="score">${wScore}/100</span></h2>
        <p class="muted">${web.crawled} of ${web.totalInSitemap} sitemap URLs crawled live.</p>
        <table><tr><th>Page</th><th>Title</th><th>Desc</th><th>H1</th><th>Words</th><th>Imgs(no alt)</th><th>Links in/out</th><th>Schema</th><th>Issues</th></tr>
        ${web.pages.map((p) => `<tr><td>${escHtml(p.path || p.url)}</td><td>${p.titleLen}</td><td>${p.metaDescLen}</td><td>${p.h1Count}</td><td>${p.words}</td><td>${p.images}(${p.imagesNoAlt})</td><td>${p.internalIn}/${p.internalOutCount}</td><td>${escHtml((p.schemaTypes || []).join(", ") || "—")}</td><td>${escHtml(pageIssues(p).map(([, t]) => t).join("; ") || "clean")}</td></tr>`).join("")}</table>` : ""}
      ${listing ? `<h2>Business listings — <span class="score">${listing.score}/100</span></h2>
        <p>${listing.found} directories list the business · ${listing.missing} missing · ${listing.napIssues} NAP consistency issue(s).${listing.live ? "" : " <span class='muted'>(demo scan)</span>"}</p>` : ""}
      ${index ? `<h2>Google indexation</h2><p>${(index.results || []).filter((r) => r.indexed).length} of ${(index.results || []).length} checked URLs are indexed.</p>
        <table><tr><th>URL</th><th>Status</th></tr>${(index.results || []).map((r) => `<tr><td>${escHtml(r.url)}</td><td>${r.indexed ? "Indexed" : "NOT indexed"}</td></tr>`).join("")}</table>` : ""}
      ${notes ? `<h2>Recommendations & proposal</h2><p>${escHtml(notes).replace(/\n+/g, "</p><p>")}</p>` : ""}
      <div class="cta"><b>Ready to fix all of this?</b><br>${escHtml(company.name)} specializes in exactly these problems — profile optimization, technical SEO, content and citations. Reply to this report and we'll walk you through the plan.</div>
      </body></html>`;
    const win = window.open("", "_blank");
    win.document.write(html); win.document.close();
    setTimeout(() => win.print(), 400);
  };

  const ready = audit || web || listing || index;
  const summaryOf = (key, v) => {
    if (!v) return null;
    if (key === "profile") return v.kind === "google" ? `${profileChecks(v.place, v.manual || {}).score}/100 · ${v.place.name}` : `${manualProfileChecks(v.man).score}/100 · ${v.man.name || "manual"}`;
    if (key === "website") return `${websiteScore(v.pages || [])}/100 · ${v.crawled} pages`;
    if (key === "listings") return `${v.score}/100 · ${v.found} found`;
    return `${(v.results || []).filter((r) => r.indexed).length}/${(v.results || []).length} indexed`;
  };
  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <div className="ll-display text-[15px] font-semibold">Branded Audit Report — the proposal builder</div>
        <div className="text-[11.5px] leading-relaxed text-gray-400">
          Each section pulls from the <b>latest run</b> or any <b>saved audit</b> — save checks in the other tabs (the bookmark button) and mix
          & match here. Generates one <b>{company.name}</b>-branded report, downloadable as PDF (print dialog → Save as PDF).
        </div>
        {/* per-section sources */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[["profile", "Profile audit"], ["website", "Website audit"], ["listings", "Listings scan"], ["index", "Index check"]].map(([key, label]) => {
            const options = saved.filter((s) => TYPE_OF[key].includes(s.type));
            const val = resolve(key);
            return (
              <div key={key} className={"rounded-xl border p-2.5 " + (val ? "border-emerald-200 bg-emerald-50/40" : "border-dashed border-gray-200")}>
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</div>
                <select value={pick[key]} onChange={(e) => setPick({ ...pick, [key]: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-1.5 py-1 text-[11px] font-medium text-gray-700">
                  <option value="latest">{latest[key] ? "Latest run (this session)" : "Latest run — none yet"}</option>
                  {options.map((s) => <option key={s.id} value={s.id}>{s.label} · {new Date(s.at).toLocaleDateString("en", { month: "short", day: "numeric" })}</option>)}
                  <option value="none">— exclude from report —</option>
                </select>
                <div className={"mt-1 text-[10.5px] font-semibold " + (val ? "text-emerald-700" : "text-gray-300")}>{summaryOf(key, val) || "nothing selected"}</div>
              </div>
            );
          })}
        </div>
        {/* saved audit library */}
        {saved.length > 0 && (
          <div className="rounded-xl border border-gray-100 p-3">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Saved audits ({saved.length})</div>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {saved.map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5 text-[11px]">
                  <span className="rounded bg-gray-200 px-1.5 py-px text-[8.5px] font-bold uppercase text-gray-600">{{ profile: "GBP", "profile-manual": "Manual", website: "Web", listings: "Listings", index: "Index" }[s.type]}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-gray-700">{s.label}</span>
                  <span className="ll-mono text-gray-400">{new Date(s.at).toLocaleString("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                  <button onClick={() => askDelete("this saved audit") && onDeleteSaved?.(s.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={11} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
        <Labeled label="Business / prospect name on the report"><input value={biz} onChange={(e) => setBiz(e.target.value)} placeholder={prof?.place?.name || prof?.man?.name || web?.host || "Acme Dental"} className={inputCls} /></Labeled>
        <Labeled label={<span className="flex items-center justify-between">Executive summary
          <button onClick={aiSummary} disabled={busy || !ready} className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-bold disabled:opacity-40" style={{ background: accent + "14", color: accent }}>
            {busy ? <RefreshCw size={10} className="animate-spin" /> : <Sparkles size={10} />} AI write from the findings
          </button></span>}>
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} placeholder="What we found, what it costs them, what fixing it unlocks…" className={inputCls + " resize-y"} />
        </Labeled>
        <Labeled label="Recommendations & proposal notes (optional)">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Your offer, timeline, pricing anchor…" className={inputCls + " resize-y"} />
        </Labeled>
        {err && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11.5px] text-red-700">{err}</div>}
        <button onClick={download} disabled={!ready}
          className="flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-[13px] font-bold text-white disabled:opacity-40" style={{ background: accent }}>
          <Printer size={14} /> Generate branded report (PDF)
        </button>
      </Card>
    </div>
  );
}

/* =================== the view =================== */
export function ResearchToolsView({ tab, setTab, company, onUpdateCompany = null, accent, aiConfig, placesKey, dfs, showTabs = true }) {
  /* results are lifted so the Audit Report tab can compile everything */
  const [profileRes, setProfileRes] = useState(null);
  const [profileManual, setProfileManual] = useState({ services: "", products: "", posts: "" });
  const [webRes, setWebRes] = useState(null);
  /* standalone store for the embedded listings + index tools */
  const [toolOpt, setToolOptState] = useState({});
  const setToolOpt = (key, patch) => setToolOptState((cur) => ({ ...cur, [key]: { ...(cur[key] || {}), ...(typeof patch === "function" ? patch(cur[key] || {}) : patch) } }));
  const pseudoProject = useMemo(() => ({ id: "research", name: "Research target", website: "", tracking: [], integrations: {} }), []);

  /* saved audits persist in company state — re-running a tool never destroys
     an old result once it's saved, and reports can pick any saved audit */
  const saved = company.savedAudits || [];
  const saveAudit = (entry) => onUpdateCompany?.({ savedAudits: [{ id: "sa" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: Date.now(), ...entry }, ...(company.savedAudits || [])] });
  const deleteAudit = (id) => askDelete("this saved audit") && onUpdateCompany?.({ savedAudits: (company.savedAudits || []).filter((x) => x.id !== id) });

  const TABS = [
    ["profile", "Business Profile Audit", Building2],
    ["website", "Website Audit", Globe],
    ["listings", "Listings Checker", MapPin],
    ["index", "Index Checker", Search],
    ["report", "Audit Report", FileText],
  ];
  return (
    <div className="ll-fade mx-auto max-w-5xl space-y-4 p-5">
      {showTabs && (
        <div className="flex flex-wrap gap-1.5">
          {TABS.map(([k, l, Icon]) => (
            <button key={k} onClick={() => setTab(k)} className="flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold"
              style={tab === k ? { background: accent, borderColor: accent, color: "#fff" } : { background: "#fff", borderColor: "#E5E7EB", color: "#4B5563" }}>
              <Icon size={13} /> {l}
            </button>
          ))}
        </div>
      )}
      {tab === "profile" && <ProfileAuditTool accent={accent} placesKey={placesKey} res={profileRes} setRes={setProfileRes} manual={profileManual} setManual={setProfileManual} onSave={saveAudit} />}
      {tab === "website" && <WebsiteAuditTool accent={accent} res={webRes} setRes={setWebRes} onSave={saveAudit} />}
      {tab === "listings" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-[11.5px] text-gray-500">
            <span className="min-w-0 flex-1">Standalone citation scanner — enter any business's NAP below (no project needed). Results feed the <b>Audit Report</b> tab.</span>
            {toolOpt.branding?.listingScan && (
              <SaveBtn accent={accent} label="Save this scan"
                onSave={() => saveAudit({ type: "listings", label: `Listings · ${toolOpt.branding.listingScan.found}/${toolOpt.branding.listingScan.found + toolOpt.branding.listingScan.missing} found`, data: toolOpt.branding.listingScan })} />
            )}
          </div>
          <ListingsScannerTab opt={toolOpt} setOpt={setToolOpt} accent={accent} log={null} project={pseudoProject} dfs={dfs} />
        </div>
      )}
      {tab === "index" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-[11.5px] text-gray-500">
            <span className="min-w-0 flex-1">Standalone index checker — paste any URLs (e.g. from the website audit). Results feed the <b>Audit Report</b> tab.</span>
            {(toolOpt.indexChecker?.results || []).length > 0 && (
              <SaveBtn accent={accent} label="Save this check"
                onSave={() => saveAudit({ type: "index", label: `Index · ${toolOpt.indexChecker.results.filter((r) => r.indexed).length}/${toolOpt.indexChecker.results.length} indexed`, data: toolOpt.indexChecker })} />
            )}
          </div>
          <IndexCheckerTab opt={toolOpt} setOpt={setToolOpt} accent={accent} log={null} project={pseudoProject} dfs={dfs} />
        </div>
      )}
      {tab === "report" && <AuditReportTool accent={accent} company={company} aiConfig={aiConfig}
        profileRes={profileRes} profileManual={profileManual} webRes={webRes} toolOpt={toolOpt}
        saved={saved} onDeleteSaved={deleteAudit} />}
    </div>
  );
}
