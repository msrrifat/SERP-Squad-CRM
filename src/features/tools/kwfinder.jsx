/* =====================================================================
   KEYWORD FINDER — KWFinder-style research (Mangools look):
   Search by Keyword / Search by Domain · location = any city in the US,
   Canada, UK, Australia & Netherlands (or national per country) ·
   volume, CPC, PPC competition, KD chips, 12-month trend, SERP overview.
   Select keywords → add to a project's KEYWORD BANK (sorted by volume,
   high → low) — the bank feeds Website Mapping & Content, Pages and
   Posts in the Optimization Studio for structure + content writing.
   Live via DataForSEO Labs (cost-chipped) or labeled demo. ---- */
import React, { useMemo, useState } from "react";
import {
  ArrowRight, CheckCircle2, ChevronDown, Download, FolderPlus, Globe, MapPin,
  RefreshCw, Search, TrendingUp, X,
} from "lucide-react";
import { Card, Labeled, Modal, inputCls } from "../../ui/primitives.jsx";
import { ALL_CITIES, CITY_DATA, regionShort } from "../../lib/geo.js";
import { hashStr, mulberry32 } from "../../lib/rng.js";
import { DfsCostChip } from "../../lib/dfsCost.jsx";
import { csvDownload } from "../research/tools.jsx";

const COUNTRIES = Object.keys(CITY_DATA);
const LANGS = [["en", "English"], ["nl", "Dutch"], ["de", "German"], ["fr", "French"], ["es", "Spanish"]];
const fmtV = (n) => (n == null ? "—" : n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n));

/* KWFinder's difficulty scale + colors */
export const kdMeta = (kd) =>
  kd == null ? { label: "n/a", bg: "#F3F4F6", fg: "#9CA3AF" }
  : kd <= 14 ? { label: "very easy", bg: "#DCFCE7", fg: "#15803D" }
  : kd <= 29 ? { label: "still easy", bg: "#BBF7D0", fg: "#166534" }
  : kd <= 49 ? { label: "possible", bg: "#FEF9C3", fg: "#A16207" }
  : kd <= 69 ? { label: "hard", bg: "#FFEDD5", fg: "#C2410C" }
  : { label: "very hard", bg: "#FEE2E2", fg: "#B91C1C" };

/* deterministic labeled demo rows */
function demoKeywords(seed, national) {
  const r = mulberry32(hashStr("kw|" + seed));
  const mods = ["near me", "cost", "prices", "services", "companies", "best", "cheap", "top rated", "reviews", "quotes",
    "emergency", "24 hour", "licensed", "free estimate", "installation", "repair", "replacement", "maintenance",
    "residential", "commercial", "how much is", "average cost of", "diy", "vs professional", "checklist", "guide"];
  const mk = (kw, isSeed) => {
    const base = isSeed ? 400 + Math.floor(r() * 3000) : 20 + Math.floor(r() * (national ? 4000 : 900));
    return { keyword: kw, seed: isSeed, demo: true,
      volume: Math.round(base / 10) * 10, cpc: Math.round((1 + r() * 18) * 100) / 100,
      competition: Math.floor(r() * 100), kd: Math.floor(5 + r() * 75),
      monthly: Array.from({ length: 12 }, (_, i) => ({ m: i + 1, y: 2026, v: Math.max(10, Math.round(base * (0.7 + r() * 0.6))) })) };
  };
  return [mk(seed, true), ...mods.slice(0, 18 + Math.floor(r() * 8)).map((m) => mk(r() > 0.5 ? `${seed} ${m}` : `${m} ${seed}`, false))];
}

const Spark = ({ monthly }) => {
  const max = Math.max(1, ...(monthly || []).map((m) => m.v));
  return (
    <span className="flex h-4 items-end gap-px">
      {(monthly || []).map((m, i) => <span key={i} className="w-[3px] rounded-sm bg-gray-300" style={{ height: `${Math.max(12, (m.v / max) * 100)}%` }} />)}
    </span>
  );
};

const KdRing = ({ kd, size = 84 }) => {
  const meta = kdMeta(kd);
  const r = size / 2 - 7, c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E5E7EB" strokeWidth="8" />
        {kd != null && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={meta.fg} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${(kd / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
        <text x="50%" y="46%" dominantBaseline="middle" textAnchor="middle" fontSize={size / 4} fontWeight="800" fill={meta.fg}>{kd ?? "—"}</text>
        <text x="50%" y="66%" dominantBaseline="middle" textAnchor="middle" fontSize="8" fill="#9CA3AF">/ 100</text>
      </svg>
      <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: meta.fg }}>{meta.label}</span>
      <span className="text-[9px] text-gray-400">Keyword Difficulty</span>
    </div>
  );
};

/* location combobox: national entries + every city + free text */
function LocationPick({ value, onChange }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    const nat = COUNTRIES.map((c) => ({ national: true, label: `${c} — national`, locationName: c }));
    const cities = ALL_CITIES.map((c) => ({ label: `${c.city}, ${regionShort(c.region)}, ${c.country}`, locationName: `${c.city},${c.region},${c.country}` }));
    if (!s) return [...nat, ...cities.slice(0, 8)];
    const hit = [...nat.filter((n) => n.label.toLowerCase().includes(s)), ...cities.filter((c) => c.label.toLowerCase().includes(s))].slice(0, 12);
    if (!hit.length) hit.push({ label: `Use "${q.trim()}" as location`, locationName: q.trim(), custom: true });
    return hit;
  }, [q]);
  return (
    <div className="relative min-w-0">
      <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5">
        <MapPin size={13} className="shrink-0 text-gray-400" />
        <input value={open ? q : value.label} onFocus={() => { setOpen(true); setQ(""); }} onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => setQ(e.target.value)} placeholder="City or country…"
          className="w-full bg-transparent py-2 text-[12.5px] font-medium text-gray-700 outline-none" />
        <ChevronDown size={12} className="shrink-0 text-gray-300" />
      </div>
      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
          {matches.map((m, i) => (
            <button key={i} onMouseDown={() => { onChange(m); setOpen(false); }}
              className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[12px] text-gray-700 hover:bg-gray-50">
              {m.national ? <Globe size={11} className="shrink-0 text-gray-400" /> : <MapPin size={11} className="shrink-0 text-gray-300" />}
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function KeywordFinderView({ company, clients = [], onAddToProject, accent }) {
  const dfs = company.dfs;
  const dfsReady = !!(dfs?.login && dfs?.password && !String(dfs.login).includes("demo@serpsquad"));
  const [mode, setMode] = useState("keyword"); // keyword | domain
  const [seed, setSeed] = useState("");
  const [loc, setLoc] = useState({ national: true, label: "United States — national", locationName: "United States" });
  const [lang, setLang] = useState("en");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [res, setRes] = useState(null);          // {rows, live, mode, keyword|domain, locationName}
  const [sortBy, setSortBy] = useState("volume");
  const [selected, setSelected] = useState(new Set());
  const [detail, setDetail] = useState(null);     // keyword row for the right panel
  const [serp, setSerp] = useState(null);
  const [serpBusy, setSerpBusy] = useState(false);
  const [addModal, setAddModal] = useState(false);

  const run = async () => {
    setBusy(true); setErr(null); setSelected(new Set()); setSerp(null);
    try {
      const url = mode === "keyword" ? "/api/kw/research" : "/api/kw/domain";
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(120000),
        body: JSON.stringify({ [mode === "keyword" ? "keyword" : "domain"]: seed.trim(), locationName: loc.locationName, languageCode: lang, limit: 200,
          dfs: dfsReady ? { login: dfs.login, password: dfs.password } : undefined }) });
      const d = await r.json();
      if (!r.ok) setErr(d.detail || d.error || `HTTP ${r.status}`);
      else { setRes(d); setDetail(d.rows[0] || null); }
    } catch (e) { setErr("API server unreachable (npm run api) — keyword data flows through it. " + (e?.message || "")); }
    setBusy(false);
  };
  const loadDemo = () => {
    const rows = demoKeywords(seed.trim().toLowerCase(), !!loc.national);
    setRes({ live: false, mode, keyword: seed.trim(), locationName: loc.locationName, rows });
    setDetail(rows[0]); setSelected(new Set()); setErr(null); setSerp(null);
  };

  const rows = useMemo(() => {
    const list = [...(res?.rows || [])];
    if (sortBy === "volume") list.sort((a, b) => (b.seed ? 1 : 0) - (a.seed ? 1 : 0) || (b.volume ?? -1) - (a.volume ?? -1));
    if (sortBy === "kd") list.sort((a, b) => (a.kd ?? 101) - (b.kd ?? 101));
    if (sortBy === "cpc") list.sort((a, b) => (b.cpc ?? -1) - (a.cpc ?? -1));
    if (sortBy === "rank") list.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    return list;
  }, [res, sortBy]);

  const loadSerp = async (kw) => {
    setSerpBusy(true); setSerp(null);
    try {
      const r = await fetch("/api/serp-top", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(60000),
        body: JSON.stringify({ keyword: kw, location_name: loc.national ? loc.locationName : loc.locationName.replace(/,/g, ","), count: 10,
          dfs: dfsReady ? { login: dfs.login, password: dfs.password } : undefined }) });
      const d = await r.json();
      setSerp(r.ok ? d : { error: d.detail || d.error || `HTTP ${r.status}` });
    } catch (e) { setSerp({ error: String(e?.message || e) }); }
    setSerpBusy(false);
  };

  const toggleAll = () => setSelected(selected.size === rows.length ? new Set() : new Set(rows.map((r) => r.keyword)));
  const Th = ({ children, k, right }) => (
    <th className={"px-2 py-2 font-semibold " + (right ? "text-right" : "")}>
      {k ? <button onClick={() => setSortBy(k)} className="uppercase" style={sortBy === k ? { color: accent } : {}}>{children} ↓</button> : children}
    </th>
  );

  return (
    <div className="space-y-4">
      {/* hero / search */}
      <Card className="space-y-3 p-5">
        <div className="ll-display text-[17px] font-bold">Find long-tail keywords with low SEO difficulty</div>
        <div className="text-[11.5px] text-gray-400">
          Local (any city in the USA, Canada, UK, Australia & Netherlands) or national research.
          {dfsReady ? <> Live via <b>DataForSEO Labs</b> <DfsCostChip requests={2} kind="organic" />.</> : <> DataForSEO isn't connected — results run as a labeled demo until the credentials are added in API settings.</>}
        </div>
        <div className="flex gap-0 border-b border-gray-200">
          {[["keyword", "Search by Keyword"], ["domain", "Search by Domain"]].map(([k, l]) => (
            <button key={k} onClick={() => { setMode(k); setRes(null); setDetail(null); }}
              className="px-4 py-2 text-[12.5px] font-bold"
              style={mode === k ? { color: "#111827", borderBottom: `2.5px solid ${accent}` } : { color: "#6B7280", background: "#F9FAFB" }}>
              {l}
            </button>
          ))}
        </div>
        <div className="grid items-stretch gap-2 lg:grid-cols-[1.2fr,1fr,170px,auto]">
          <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5">
            <Search size={13} className="shrink-0 text-gray-400" />
            <input value={seed} onChange={(e) => setSeed(e.target.value)} onKeyDown={(e) => e.key === "Enter" && seed.trim() && run()}
              placeholder={mode === "keyword" ? "Enter the keyword" : "Enter a domain (competitor.com)"}
              className="w-full bg-transparent py-2 text-[13px] outline-none" />
          </div>
          <LocationPick value={loc} onChange={setLoc} />
          <select value={lang} onChange={(e) => setLang(e.target.value)} className={inputCls + " bg-white"}>
            {LANGS.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
          </select>
          <button onClick={run} disabled={busy || !seed.trim()}
            className="flex items-center justify-center gap-1.5 rounded-lg px-5 py-2 text-[13px] font-bold text-white disabled:opacity-40"
            style={{ background: "linear-gradient(90deg,#22C55E,#16A34A)" }}>
            {busy ? <><RefreshCw size={13} className="animate-spin" /> Finding…</> : <>Find keywords <ArrowRight size={13} /></>}
          </button>
        </div>
        {err && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11.5px] text-amber-800">
            {err}
            {seed.trim() && <button onClick={loadDemo} className="ml-2 rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[10.5px] font-bold text-amber-700">Load labeled demo results instead</button>}
          </div>
        )}
      </Card>

      {res && (
        <div className="grid items-start gap-4 xl:grid-cols-[1fr,400px]">
          {/* ---- keyword table ---- */}
          <Card className="p-0">
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-2.5">
              <span className="text-[12.5px] font-bold text-gray-800">{res.mode === "domain" ? res.domain : res.keyword}</span>
              <span className="text-[11px] text-gray-400">· {loc.label}</span>
              <span className={"rounded px-1.5 py-px text-[8.5px] font-bold uppercase " + (res.live ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>{res.live ? "live · DataForSEO" : "demo"}</span>
              <span className="ml-auto flex items-center gap-2">
                <button onClick={() => csvDownload(`keywords-${(seed || "kw").replace(/\W+/g, "-")}.csv`,
                  ["Keyword", "Volume", "CPC", "Competition", "KD", ...(res.mode === "domain" ? ["Rank", "URL"] : [])],
                  rows.map((r) => [r.keyword, r.volume ?? "", r.cpc ?? "", r.competition ?? "", r.kd ?? "", ...(res.mode === "domain" ? [r.rank ?? "", r.url] : [])]))}
                  className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600"><Download size={11} /> CSV</button>
              </span>
            </div>
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full min-w-[560px] text-left text-[12px]">
                <thead className="sticky top-0 bg-gray-50">
                  <tr className="border-b border-gray-200 text-[9px] uppercase tracking-wide text-gray-400">
                    <th className="px-2 py-2"><input type="checkbox" checked={rows.length > 0 && selected.size === rows.length} onChange={toggleAll} /></th>
                    <Th>Keywords</Th><Th>Trend</Th><Th k="volume">Search</Th><Th k="cpc">CPC</Th><Th>PPC</Th>
                    {res.mode === "domain" && <Th k="rank">Rank</Th>}
                    <Th k="kd">KD</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const meta = kdMeta(r.kd);
                    const active = detail?.keyword === r.keyword;
                    return (
                      <tr key={r.keyword} onClick={() => { setDetail(r); setSerp(null); }}
                        className={"cursor-pointer border-b border-gray-50 " + (active ? "" : "hover:bg-gray-50")}
                        style={active ? { background: accent + "0C", boxShadow: `inset 2.5px 0 0 ${accent}` } : {}}>
                        <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selected.has(r.keyword)}
                            onChange={() => setSelected((cur) => { const n = new Set(cur); n.has(r.keyword) ? n.delete(r.keyword) : n.add(r.keyword); return n; })} />
                        </td>
                        <td className="max-w-[240px] px-2 py-2">
                          <span className="truncate font-semibold text-gray-800">{r.keyword}</span>
                          {r.seed && <span className="ml-1.5 text-[9.5px] text-gray-400">— seed keyword</span>}
                          {r.url && <span className="ll-mono block truncate text-[9.5px] text-gray-400">{r.url.replace(/^https?:\/\/(www\.)?/, "")}</span>}
                        </td>
                        <td className="px-2 py-2"><Spark monthly={r.monthly} /></td>
                        <td className="ll-mono px-2 py-2 font-semibold text-gray-700">{fmtV(r.volume)}</td>
                        <td className="ll-mono px-2 py-2 text-gray-500">{r.cpc != null ? "$" + r.cpc.toFixed(2) : "—"}</td>
                        <td className="ll-mono px-2 py-2 text-gray-500">{r.competition ?? "—"}</td>
                        {res.mode === "domain" && <td className="ll-mono px-2 py-2 text-gray-600">{r.rank ?? "—"}</td>}
                        <td className="px-2 py-2"><span className="ll-mono inline-block min-w-[30px] rounded-md px-1.5 py-0.5 text-center text-[11px] font-bold" style={{ background: meta.bg, color: meta.fg }}>{r.kd ?? "?"}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-4 py-2.5">
              <span className="text-[11px] font-semibold text-gray-500">Showing {rows.length}</span>
              <span className="ml-auto flex items-center gap-2">
                <span className="text-[11px] text-gray-400">{selected.size} selected</span>
                <button onClick={() => setAddModal(true)} disabled={!selected.size || !clients.length}
                  className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12px] font-bold text-white disabled:opacity-40" style={{ background: accent }}>
                  <FolderPlus size={13} /> Add {selected.size || ""} keyword{selected.size === 1 ? "" : "s"} to a project
                </button>
              </span>
            </div>
          </Card>

          {/* ---- detail panel ---- */}
          <Card className="space-y-4 p-4">
            {detail ? (<>
              <div>
                <div className="ll-display text-[16px] font-bold">{detail.keyword}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-gray-400"><MapPin size={10} /> {loc.label} · {LANGS.find(([c]) => c === lang)?.[1]}</div>
              </div>
              <div className="flex items-center gap-4">
                <KdRing kd={detail.kd} />
                <div className="min-w-0 flex-1">
                  <div className="ll-mono text-[22px] font-bold text-gray-800">{detail.volume?.toLocaleString() ?? "—"}</div>
                  <div className="text-[9.5px] font-semibold uppercase tracking-wide text-gray-400">Search volume / month</div>
                  <div className="mt-2 flex gap-4 text-[11px] text-gray-500">
                    <span>CPC <b className="ll-mono text-gray-700">{detail.cpc != null ? "$" + detail.cpc.toFixed(2) : "—"}</b></span>
                    <span>PPC comp. <b className="ll-mono text-gray-700">{detail.competition ?? "—"}</b></span>
                  </div>
                </div>
              </div>
              {(detail.monthly || []).length > 0 && (
                <div>
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">Monthly searches</div>
                  <div className="flex h-16 items-end gap-1">
                    {detail.monthly.map((m, i) => {
                      const max = Math.max(1, ...detail.monthly.map((x) => x.v));
                      return <div key={i} className="flex-1 rounded-t" title={`${m.m}/${m.y}: ${m.v.toLocaleString()}`} style={{ height: `${Math.max(6, (m.v / max) * 100)}%`, background: accent + "99" }} />;
                    })}
                  </div>
                </div>
              )}
              <div className="border-t border-gray-100 pt-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[12.5px] font-bold text-gray-800">SERP overview</span>
                  <button onClick={() => loadSerp(detail.keyword)} disabled={serpBusy}
                    className="flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[10.5px] font-bold disabled:opacity-40" style={{ borderColor: accent, color: accent }}>
                    {serpBusy ? <RefreshCw size={10} className="animate-spin" /> : <TrendingUp size={10} />} Load top 10 {dfsReady && <DfsCostChip requests={1} kind="organic" />}
                  </button>
                </div>
                {serp?.error && <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10.5px] text-amber-800">{serp.error}</div>}
                {serp?.results && (
                  <div className="space-y-1">
                    {serp.results.map((s) => (
                      <div key={s.rank} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                        <span className="ll-mono w-5 shrink-0 text-center text-[10.5px] font-bold text-gray-400">{s.rank}</span>
                        <span className="min-w-0 flex-1">
                          <a href={s.url} target="_blank" rel="noreferrer" className="ll-mono block truncate text-[10.5px] underline" style={{ color: accent }}>{s.domain}</a>
                          <span className="block truncate text-[10.5px] text-gray-500">{s.title}</span>
                        </span>
                      </div>
                    ))}
                    <div className="text-[9.5px] text-gray-400">Live Google top 10. DA/PA-style link metrics need a backlink API (Moz/Ahrefs) — not shown rather than guessed.</div>
                  </div>
                )}
                {!serp && !serpBusy && <div className="py-2 text-[10.5px] text-gray-300">Pick a keyword and load its live SERP.</div>}
              </div>
            </>) : <div className="py-16 text-center text-[12px] text-gray-300">Click a keyword to inspect it.</div>}
          </Card>
        </div>
      )}

      {addModal && (
        <AddToProjectModal accent={accent} clients={clients} count={selected.size}
          onClose={() => setAddModal(false)}
          onAdd={(clientId, projectId) => {
            const picked = rows.filter((r) => selected.has(r.keyword));
            onAddToProject(clientId, projectId, picked, { location: loc.label, locationName: loc.locationName, demo: !res.live });
            setAddModal(false); setSelected(new Set());
          }} />
      )}
    </div>
  );
}

function AddToProjectModal({ accent, clients, count, onClose, onAdd }) {
  const [clientId, setClientId] = useState(clients[0]?.id || "");
  const client = clients.find((c) => c.id === clientId) || clients[0];
  const [projectId, setProjectId] = useState(client?.projects[0]?.id || "");
  const proj = client?.projects.find((p) => p.id === projectId) || client?.projects[0];
  const [done, setDone] = useState(false);
  return (
    <Modal title={`Add ${count} keyword${count === 1 ? "" : "s"} to a project`} sub="They land in the project's keyword bank, sorted by search volume (high → low) — usable in Website Mapping & Content, Pages and Posts." onClose={onClose}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Client">
            <select value={clientId} onChange={(e) => { setClientId(e.target.value); const c = clients.find((x) => x.id === e.target.value); setProjectId(c?.projects[0]?.id || ""); }} className={inputCls + " bg-white"}>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Labeled>
          <Labeled label="Project">
            <select value={proj?.id || ""} onChange={(e) => setProjectId(e.target.value)} className={inputCls + " bg-white"}>
              {(client?.projects || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Labeled>
        </div>
        <div className="rounded-xl bg-gray-50 p-3 text-[11px] leading-relaxed text-gray-500">
          Next step: open the project → <b>Optimization Studio → Business Website</b> → Website Mapping &amp; Content, Pages or Posts —
          every editor has an <b>"Add from keyword bank"</b> picker with these keywords ready.
        </div>
        {done && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11.5px] font-semibold text-emerald-700">✓ Added to {proj?.name} — keyword bank updated.</div>}
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-[12px] font-medium text-gray-600">Close</button>
          <button disabled={!proj || done} onClick={() => { onAdd(client.id, proj.id); setDone(true); setTimeout(onClose, 900); }}
            className="flex items-center gap-1.5 rounded-lg px-5 py-2 text-[12px] font-bold text-white disabled:opacity-40" style={{ background: accent }}>
            <CheckCircle2 size={13} /> Add keywords
          </button>
        </div>
      </div>
    </Modal>
  );
}
