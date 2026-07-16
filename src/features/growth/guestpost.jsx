/* =====================================================================
   GUEST POST FINDER — footprint prospecting, Pitchbox/Respona style.
   niche + country → '"niche" "write for us"' queries → deduped sites →
   authority (Open PageRank, FREE) + optional traffic (DataForSEO Labs)
   + REAL email scraping → save to a niche folder → the same outreach
   engine (sequences, merge tags, replied-tracking) pitches them.
   Engines: Google Custom Search (FREE 100/day) → DataForSEO (cost-
   chipped) → labeled demo. Nothing is ever fabricated silently.
   ===================================================================== */
import React, { useMemo, useRef, useState } from "react";
import {
  ArrowDown, AtSign, CheckCircle2, ChevronDown, Download, FolderPlus, Gauge,
  Mail, PenLine, RefreshCw, Search, Send, X,
} from "lucide-react";
import { Card, Labeled, inputCls } from "../../ui/primitives.jsx";
import { hashStr, mulberry32 } from "../../lib/rng.js";
import { DfsCostChip } from "../../lib/dfsCost.jsx";
import { csvDownload } from "../research/tools.jsx";
import { ProspectList } from "./prospects.jsx";

/* the saved-sites list for the guest scope — same UI, separate data */
export function GuestListView({ company, onUpdateCompany, accent }) {
  const store = company.guest || { contacts: [], campaigns: [] };
  const ref = useRef(store); ref.current = store;
  const commit = (patch) => onUpdateCompany({ guest: { ...ref.current, ...(typeof patch === "function" ? patch(ref.current) : patch) } });
  return <ProspectList accent={accent} growth={store} commit={commit}
    emptyHint={<>Run the <b>Guest Post Finder</b> and save sites — folders are created automatically per niche.</>} />;
}

const gid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* the classic guest-post footprints — the technique every pro tool is built on */
const FOOTPRINTS = [
  { q: '"write for us"', on: true },
  { q: '"guest post"', on: true },
  { q: '"guest post guidelines"', on: true },
  { q: '"submit a guest post"', on: true },
  { q: '"become a contributor"', on: true },
  { q: '"contribute to our blog"', on: false },
  { q: '"accepting guest posts"', on: false },
  { q: 'inurl:write-for-us', on: false },
  { q: 'intitle:"write for us"', on: false },
  { q: '"guest author"', on: false },
];
const COUNTRIES = [
  ["", "Any country", "United States"],
  ["us", "United States", "United States"], ["gb", "United Kingdom", "United Kingdom"], ["ca", "Canada", "Canada"],
  ["au", "Australia", "Australia"], ["de", "Germany", "Germany"], ["fr", "France", "France"], ["es", "Spain", "Spain"],
  ["it", "Italy", "Italy"], ["nl", "Netherlands", "Netherlands"], ["in", "India", "India"], ["sg", "Singapore", "Singapore"],
  ["ae", "United Arab Emirates", "United Arab Emirates"], ["za", "South Africa", "South Africa"], ["nz", "New Zealand", "New Zealand"],
];

/* labeled demo rows — deterministic, obviously fake TLD mix */
function demoSites(niche) {
  const r = mulberry32(hashStr("gp|" + niche));
  const words = niche.toLowerCase().split(/\s+/).filter(Boolean);
  const w = words[0] || "niche";
  const pre = ["the", "daily", "modern", "smart", "pro", "all", "best", "my"], suf = ["blog", "hub", "times", "weekly", "insider", "journal", "digest", "world"];
  const seen = new Set(), rows = [];
  const target = 12 + Math.floor(r() * 5);
  let guard = 0;
  while (rows.length < target && guard++ < 200) {
    const domain = `${pre[Math.floor(r() * pre.length)]}${w}${suf[Math.floor(r() * suf.length)]}.com`;
    if (seen.has(domain)) continue; // dedupe by domain, like the live search
    seen.add(domain);
    rows.push({
      domain, url: `https://${domain}/write-for-us`, demo: true,
      title: `Write for Us — ${domain.split(".")[0]}`, snippet: `We accept high-quality ${niche} guest posts. Read the guidelines and pitch your topic…`,
      footprint: FOOTPRINTS[Math.floor(r() * 5)].q,
      authority: Math.round((2 + r() * 5) * 10) / 10, traffic: Math.floor(r() * 40000),
      email: "", socials: [],
    });
  }
  return rows;
}

export function GuestPostFinder({ company, onUpdateCompany, accent, dfs, cse, oprKey }) {
  /* guest-post prospects live in their OWN store (company.guest) — fully
     separated from client-prospecting data, shareable with the team later */
  const growth = company.guest || { contacts: [], campaigns: [] };
  const ref = useRef(growth); ref.current = growth;
  const commit = (patch) => onUpdateCompany({ guest: { ...ref.current, ...(typeof patch === "function" ? patch(ref.current) : patch) } });

  const [niche, setNiche] = useState("");
  const [location, setLocation] = useState("");
  const [country, setCountry] = useState("");
  const [fps, setFps] = useState(FOOTPRINTS.filter((f) => f.on).map((f) => f.q));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [res, setRes] = useState(null);          // { engine, results, demo? }
  const [selected, setSelected] = useState(new Set());
  const [sortBy, setSortBy] = useState(null);    // "authority" | "traffic"
  const [metricsBusy, setMetricsBusy] = useState(false);
  const [withTraffic, setWithTraffic] = useState(false);
  const [scrapeBusy, setScrapeBusy] = useState(null); // domain being scraped | "all"
  const [metricsNote, setMetricsNote] = useState(null);
  const [folderName, setFolderName] = useState("");
  const [savedFlash, setSavedFlash] = useState(null);

  const cseReady = !!(cse?.apiKey && cse?.cx);
  const dfsReady = !!(dfs?.login && dfs?.password && !String(dfs.login).includes("demo@serpsquad"));
  const engineLabel = cseReady ? "Google Custom Search — FREE (100 queries/day)" : dfsReady ? "DataForSEO SERP" : null;
  const cc = COUNTRIES.find((c) => c[0] === country) || COUNTRIES[0];

  const toggleFp = (q) => setFps((cur) => (cur.includes(q) ? cur.filter((x) => x !== q) : [...cur, q]));
  const rows = useMemo(() => {
    const list = [...(res?.results || [])];
    if (sortBy) list.sort((a, b) => (b[sortBy] ?? -1) - (a[sortBy] ?? -1));
    return list;
  }, [res, sortBy]);

  const patchRow = (domain, patch) =>
    setRes((cur) => cur && ({ ...cur, results: cur.results.map((x) => (x.domain === domain ? { ...x, ...patch } : x)) }));

  const search = async () => {
    setBusy(true); setErr(null); setSelected(new Set()); setMetricsNote(null);
    try {
      const r = await fetch("/api/guestpost/search", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(120000),
        body: JSON.stringify({ niche: niche.trim(), location: location.trim(), country: cc[2], gl: country, footprints: fps,
          cse: cseReady ? { key: cse.apiKey, cx: cse.cx } : undefined,
          dfs: !cseReady && dfsReady ? { login: dfs.login, password: dfs.password } : undefined }) });
      const d = await r.json();
      if (!r.ok) setErr(d.detail || d.error || `HTTP ${r.status}`);
      else { setRes({ ...d, results: d.results.map((x) => ({ ...x, authority: null, traffic: null, email: "", socials: [] })) }); setFolderName(`${niche.trim()} — guest posts`); }
    } catch (e) { setErr("API server unreachable (npm run api). " + (e?.message || "")); }
    setBusy(false);
  };
  const loadDemo = () => { setErr(null); setRes({ live: false, engine: "demo", results: demoSites(niche.trim()) }); setFolderName(`${niche.trim()} — guest posts`); setSelected(new Set()); };

  const getMetrics = async () => {
    if (!res?.results?.length) return;
    setMetricsBusy(true); setMetricsNote(null);
    try {
      const r = await fetch("/api/guestpost/metrics", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(90000),
        body: JSON.stringify({ domains: res.results.map((x) => x.domain), oprKey: oprKey || undefined, withTraffic,
          dfs: withTraffic && dfsReady ? { login: dfs.login, password: dfs.password } : undefined }) });
      const d = await r.json();
      if (!r.ok) setMetricsNote(d.detail || d.error);
      else {
        setRes((cur) => cur && ({ ...cur, results: cur.results.map((x) => ({ ...x, ...(d.metrics[x.domain] || {}) })) }));
        if ((d.notes || []).length) setMetricsNote(d.notes.join(" · "));
        setSortBy("authority");
      }
    } catch (e) { setMetricsNote("Metrics failed: " + (e?.message || e)); }
    setMetricsBusy(false);
  };

  const scrape = async (row) => {
    setScrapeBusy(row.domain);
    try {
      const r = await fetch("/api/scrape-email", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(25000),
        body: JSON.stringify({ website: "https://" + row.domain }) });
      const d = await r.json();
      patchRow(row.domain, r.ok && d.emails?.length ? { email: d.emails[0], socials: d.socials || [] } : { email: "", scraped: true });
    } catch { patchRow(row.domain, { scraped: true }); }
    setScrapeBusy(null);
  };
  const scrapeSelected = async () => {
    setScrapeBusy("all");
    for (const row of rows.filter((x) => selected.has(x.domain) && !x.email)) await scrape(row);
    setScrapeBusy(null);
  };

  const savedDomains = new Set((growth.contacts || []).map((c) => (c.website || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "")));
  const saveSelected = () => {
    const folder = folderName.trim() || `${niche.trim()} — guest posts`;
    const picked = rows.filter((x) => selected.has(x.domain) && !savedDomains.has(x.domain));
    const fresh = picked.map((x) => ({
      id: gid("ct"), placeId: "gp-" + x.domain, kind: "guestpost", folder, niche: niche.trim(),
      name: x.domain, address: "", phone: "", website: "https://" + x.domain,
      email: x.email || "", socials: x.socials || [], authority: x.authority, traffic: x.traffic,
      demo: !!x.demo, addedAt: Date.now(), replied: false,
    }));
    if (fresh.length) commit({ contacts: [...(growth.contacts || []), ...fresh] });
    setSavedFlash(`${fresh.length} site(s) saved to "${folder}" — pitch them from Outreach Campaigns`);
    setTimeout(() => setSavedFlash(null), 5000);
    setSelected(new Set());
  };

  const allSelected = rows.length > 0 && rows.every((x) => selected.has(x.domain));
  const Th = ({ children, sortKey }) => (
    <th className="px-2.5 py-2 font-semibold">
      {sortKey ? (
        <button onClick={() => setSortBy(sortKey)} className="flex items-center gap-0.5 uppercase" style={sortBy === sortKey ? { color: accent } : {}}>
          {children} <ArrowDown size={9} />
        </button>
      ) : children}
    </th>
  );

  return (
    <div className="space-y-4">
      {/* search setup */}
      <Card className="space-y-3 p-5">
        <div className="ll-display flex items-center gap-2 text-[15px] font-semibold"><PenLine size={15} style={{ color: accent }} /> Guest Post Finder</div>
        <div className="text-[11.5px] leading-relaxed text-gray-400">
          Prospects sites the way Pitchbox & Respona do — footprint queries like <span className="ll-mono">"{niche.trim() || "your niche"}" + "write for us"</span>,
          deduped by domain with big platforms filtered out. Then: <b>authority</b> (Open PageRank — free), optional <b>organic traffic</b> (DataForSEO),
          <b> real email scraping</b> from each site, save to a niche folder and pitch with the outreach engine.
          {engineLabel
            ? <> Engine: <b style={{ color: accent }}>{engineLabel}</b>{!cseReady && dfsReady && <DfsCostChip requests={fps.length} kind="organic" />}.</>
            : <> No search engine configured — add <b>Google Custom Search (free)</b> or DataForSEO in API settings.</>}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Labeled label="Niche *"><input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="pet care, real estate, fintech…" className={inputCls} /></Labeled>
          <Labeled label="Location keyword (optional)"><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Texas, London, Southeast Asia…" className={inputCls} /></Labeled>
          <Labeled label="Country">
            <select value={country} onChange={(e) => setCountry(e.target.value)} className={inputCls + " bg-white"}>
              {COUNTRIES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </Labeled>
        </div>
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">Search footprints ({fps.length} selected · 1 query each)</div>
          <div className="flex flex-wrap gap-1.5">
            {FOOTPRINTS.map((f) => (
              <button key={f.q} onClick={() => toggleFp(f.q)} className="ll-mono rounded-lg border px-2 py-1 text-[10.5px] font-semibold"
                style={fps.includes(f.q) ? { borderColor: accent, background: accent + "10", color: accent } : { borderColor: "#E5E7EB", color: "#9CA3AF" }}>
                {f.q}
              </button>
            ))}
          </div>
        </div>
        <button onClick={search} disabled={busy || !niche.trim() || !fps.length}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
          {busy ? <><RefreshCw size={13} className="animate-spin" /> Searching {fps.length} footprints…</> : <><Search size={13} /> Find guest post sites</>}
        </button>
        {err && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11.5px] text-amber-800">
            {err}
            {niche.trim() && <button onClick={loadDemo} className="ml-2 rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[10.5px] font-bold text-amber-700">Load labeled demo results instead</button>}
          </div>
        )}
      </Card>

      {/* results */}
      {res && (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="ll-display text-[14px] font-semibold">{rows.length} sites — {res.niche || niche}</div>
            <span className={"rounded px-1.5 py-px text-[8.5px] font-bold uppercase " + (res.live ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
              {res.live ? (res.engine === "cse" ? "live · Google CSE" : "live · DataForSEO") : "demo"}
            </span>
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1 text-[10.5px] font-semibold text-gray-500" title="Adds organic-traffic estimates via DataForSEO Labs">
                <input type="checkbox" checked={withTraffic} onChange={(e) => setWithTraffic(e.target.checked)} disabled={!dfsReady} />
                + traffic {withTraffic && dfsReady && <DfsCostChip requests={1} kind="organic" />}
              </label>
              <button onClick={getMetrics} disabled={metricsBusy || !res.live && false}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
                {metricsBusy ? <RefreshCw size={12} className="animate-spin" /> : <Gauge size={12} />} Get authority{withTraffic ? " + traffic" : " (free)"}
              </button>
              <button onClick={scrapeSelected} disabled={!selected.size || scrapeBusy === "all"}
                className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[11.5px] font-semibold disabled:opacity-40" style={{ borderColor: accent, color: accent }}>
                {scrapeBusy === "all" ? <RefreshCw size={12} className="animate-spin" /> : <AtSign size={12} />} Scrape emails ({selected.size})
              </button>
              <button onClick={() => csvDownload(`guest-sites-${(niche || "niche").replace(/\W+/g, "-")}.csv`,
                ["Domain", "URL", "Title", "Footprint", "Authority", "Traffic", "Email"],
                rows.map((x) => [x.domain, x.url, x.title, x.footprint, x.authority ?? "", x.traffic ?? "", x.email]))}
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-[11.5px] font-semibold text-gray-600"><Download size={12} /> CSV</button>
            </span>
          </div>
          {metricsNote && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">{metricsNote}</div>}
          {savedFlash && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700">✓ {savedFlash}</div>}

          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full min-w-[880px] text-left text-[11px]">
              <thead><tr className="border-b border-gray-200 bg-gray-50 text-[9.5px] uppercase tracking-wide text-gray-400">
                <th className="px-2.5 py-2"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((x) => x.domain)))} /></th>
                <Th>Site</Th><Th>Found via</Th><Th sortKey="authority">Authority</Th><Th sortKey="traffic">Traffic/mo</Th><Th>Email</Th><th className="px-2.5 py-2" />
              </tr></thead>
              <tbody>
                {rows.map((x, i) => {
                  const saved = savedDomains.has(x.domain);
                  return (
                    <tr key={x.domain} className={"border-b border-gray-50 align-top " + (i % 2 ? "bg-gray-50/50" : "")}>
                      <td className="px-2.5 py-2"><input type="checkbox" checked={selected.has(x.domain)}
                        onChange={() => setSelected((cur) => { const n = new Set(cur); n.has(x.domain) ? n.delete(x.domain) : n.add(x.domain); return n; })} /></td>
                      <td className="max-w-[260px] px-2.5 py-2">
                        <a href={x.url} target="_blank" rel="noreferrer" className="ll-mono block truncate font-semibold underline" style={{ color: accent }}>{x.domain}</a>
                        <span className="block truncate text-gray-500" title={x.snippet}>{x.title}</span>
                      </td>
                      <td className="ll-mono max-w-[130px] truncate px-2.5 py-2 text-gray-400">{x.footprint}</td>
                      <td className="ll-mono px-2.5 py-2 font-bold" style={{ color: x.authority == null ? "#D1D5DB" : x.authority >= 4 ? "#16A34A" : x.authority >= 2.5 ? "#F59E0B" : "#9CA3AF" }}>
                        {x.authority ?? "—"}
                      </td>
                      <td className="ll-mono px-2.5 py-2 text-gray-600">{x.traffic != null ? x.traffic.toLocaleString() : "—"}</td>
                      <td className="ll-mono max-w-[170px] truncate px-2.5 py-2">
                        {x.email ? <span className="text-gray-700">{x.email}</span>
                          : x.scraped ? <span className="text-[10px] text-gray-300">none public</span>
                          : <button onClick={() => scrape(x)} disabled={!!scrapeBusy} className="rounded-md px-1.5 py-0.5 text-[10px] font-bold disabled:opacity-40" style={{ background: accent + "14", color: accent }}>
                              {scrapeBusy === x.domain ? "…" : "scrape"}
                            </button>}
                      </td>
                      <td className="px-2.5 py-2">{saved && <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600"><CheckCircle2 size={10} /> saved</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* save bar */}
          <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
            <FolderPlus size={14} className="text-gray-400" />
            <input value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="Folder name" className={inputCls + " w-64"} />
            <button onClick={saveSelected} disabled={!selected.size}
              className="rounded-lg px-4 py-2 text-[12px] font-bold text-white disabled:opacity-40" style={{ background: accent }}>
              Save {selected.size} selected to folder
            </button>
            <button onClick={() => { setSelected(new Set(rows.map((x) => x.domain))); }} className="text-[11px] font-semibold" style={{ color: accent }}>Select all {rows.length}</button>
            <span className="ml-auto flex items-center gap-1 text-[10.5px] text-gray-400"><Send size={10} /> Saved sites land in <b>Guest Post List</b> — pitch them from <b>Guest Outreach</b> (separate from your prospect campaigns).</span>
          </div>
          <div className="text-[10.5px] text-gray-400">
            Authority = Open PageRank (0–10, free). Sites scoring 3+ with a public email are your warmest targets. "none public" means their pages expose no address — use their contact form.
          </div>
        </Card>
      )}
    </div>
  );
}
