/* =====================================================================
   RANK CHECKER — one-time rank checks for ANY business (no project
   needed). Two replicas of the project tracking tools:
   · Website Rank Check — the keyword rank tracker's engine (/api/rerun:
     one depth-100 organic scan per keyword, Google or Bing, city +
     device targeted) run once against any domain.
   · Map Rank Check — the full GBP geo-grid tracker (Local Falcon style)
     wrapped around a throwaway in-memory project, so any business can
     be scanned without saving anything to a client.
   Live via DataForSEO (cost-chipped) or labeled demo. ---- */
import React, { useMemo, useState } from "react";
import { ChevronDown, Download, MapPin, RefreshCw, Search, TrendingUp } from "lucide-react";
import { Card, Labeled, Seg, inputCls } from "../../ui/primitives.jsx";
import { ALL_CITIES, regionShort } from "../../lib/geo.js";
import { hashStr, mulberry32 } from "../../lib/rng.js";
import { DfsCostChip } from "../../lib/dfsCost.jsx";
import { csvDownload } from "../research/tools.jsx";
import { GeoGridView } from "../performance/geogrid.jsx";

/* cities-only combobox (rank scans are city-targeted, like project tracking) */
function CityPick({ value, onChange }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = ALL_CITIES.map((c) => ({ ...c, label: `${c.city}, ${regionShort(c.region)}, ${c.country}` }));
    return (s ? list.filter((c) => c.label.toLowerCase().includes(s)) : list).slice(0, 12);
  }, [q]);
  return (
    <div className="relative min-w-0">
      <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5">
        <MapPin size={13} className="shrink-0 text-gray-400" />
        <input value={open ? q : value.label} onFocus={() => { setOpen(true); setQ(""); }} onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => setQ(e.target.value)} placeholder="Search a city…"
          className="w-full bg-transparent py-2 text-[12.5px] font-medium text-gray-700 outline-none" />
        <ChevronDown size={12} className="shrink-0 text-gray-300" />
      </div>
      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
          {matches.map((c, i) => (
            <button key={i} onMouseDown={() => { onChange({ ...c, label: c.label }); setOpen(false); }}
              className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[12px] text-gray-700 hover:bg-gray-50">
              <MapPin size={11} className="shrink-0 text-gray-300" /> {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const rankChip = (pos) => {
  const [bg, fg, label] = pos == null ? ["#FEE2E2", "#B91C1C", "100+"]
    : pos <= 3 ? ["#DCFCE7", "#15803D", "#" + pos]
    : pos <= 10 ? ["#BBF7D0", "#166534", "#" + pos]
    : pos <= 20 ? ["#FEF9C3", "#A16207", "#" + pos]
    : ["#F3F4F6", "#4B5563", "#" + pos];
  return <span className="ll-mono inline-block min-w-[42px] rounded-md px-2 py-0.5 text-center text-[12px] font-bold" style={{ background: bg, color: fg }}>{label}</span>;
};

export function WebsiteRankCheck({ company, accent }) {
  const dfs = company.dfs;
  const dfsReady = !!(dfs?.login && dfs?.password && !String(dfs.login).includes("demo@serpsquad"));
  const [domain, setDomain] = useState("");
  const [kwText, setKwText] = useState("");
  const [city, setCity] = useState({ city: "New York", region: "New York", country: "United States", label: "New York, NY, United States" });
  const [device, setDevice] = useState("Desktop");
  const [engine, setEngine] = useState("Google");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [res, setRes] = useState(null); // { rows:[{keyword, position, url}], live, at }
  const keywords = kwText.split(/\n|,/).map((s) => s.trim()).filter(Boolean).slice(0, 25);
  const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const entries = keywords.map((k, i) => ({ id: "rc" + i, keyword: k, city: { city: city.city, region: city.region, country: city.country }, device, engine, domain: cleanDomain }));
      const r = await fetch("/api/rerun", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(180000),
        body: JSON.stringify({ entries, dfs: dfsReady ? { login: dfs.login, password: dfs.password } : undefined }) });
      const d = await r.json();
      if (!r.ok) setErr(r.status === 503 ? "DataForSEO isn't connected — add the credentials in API settings, or run a labeled demo." : (d.detail || d.error || `HTTP ${r.status}`));
      else setRes({ live: true, rows: keywords.map((k, i) => { const u = d.updated.find((x) => x.id === "rc" + i) || {}; return { keyword: k, position: u.position ?? null, url: u.url || "", error: u.error }; }) });
    } catch (e) { setErr("API server unreachable (npm run api). " + (e?.message || "")); }
    setBusy(false);
  };
  const loadDemo = () => {
    const rows = keywords.map((k) => {
      const r = mulberry32(hashStr(cleanDomain + "|" + k));
      const roll = r();
      const position = roll < 0.28 ? 1 + Math.floor(r() * 10) : roll < 0.6 ? 11 + Math.floor(r() * 20) : roll < 0.85 ? 31 + Math.floor(r() * 70) : null;
      return { keyword: k, position, url: position ? `https://${cleanDomain}/${k.replace(/\s+/g, "-")}` : "" };
    });
    setRes({ live: false, rows }); setErr(null);
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <div className="ll-display flex items-center gap-2 text-[15px] font-semibold"><TrendingUp size={15} style={{ color: accent }} /> Website Rank Check — any domain, one-time</div>
        <div className="text-[11.5px] text-gray-400">
          The same engine as project rank tracking (depth-100 {engine} scan per keyword, city + device targeted) — run once against any business,
          no project needed. Perfect for sales calls and quick prospect checks.
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Domain"><input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="anybusiness.com" className={"ll-mono " + inputCls} /></Labeled>
          <Labeled label="City (scan location)"><CityPick value={city} onChange={setCity} /></Labeled>
        </div>
        <Labeled label={`Keywords — one per line (${keywords.length}/25)`}>
          <textarea value={kwText} onChange={(e) => setKwText(e.target.value)} rows={4} placeholder={"dentist near me\nteeth whitening\ndental implants"} className={inputCls + " resize-y"} />
        </Labeled>
        <div className="flex flex-wrap items-center gap-3">
          <Seg options={["Desktop", "Mobile"]} value={device} onChange={setDevice} accent={accent} />
          <Seg options={["Google", "Bing"]} value={engine} onChange={setEngine} accent={accent} />
          <button onClick={run} disabled={busy || !cleanDomain.includes(".") || !keywords.length}
            className="ml-auto flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
            {busy ? <><RefreshCw size={13} className="animate-spin" /> Scanning {keywords.length} keyword(s)…</> : <><Search size={13} /> Check rankings</>}
            {dfsReady && keywords.length > 0 && <DfsCostChip requests={keywords.length} kind={engine === "Bing" ? "bing" : "organic"} />}
          </button>
        </div>
        {err && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11.5px] text-amber-800">
            {err}
            {cleanDomain.includes(".") && keywords.length > 0 && <button onClick={loadDemo} className="ml-2 rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[10.5px] font-bold text-amber-700">Load labeled demo results instead</button>}
          </div>
        )}
      </Card>

      {res && (
        <Card className="space-y-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="ll-mono text-[13px] font-bold text-gray-800">{cleanDomain}</span>
            <span className="text-[11px] text-gray-400">· {city.label} · {device} · {engine}</span>
            <span className={"rounded px-1.5 py-px text-[8.5px] font-bold uppercase " + (res.live ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>{res.live ? "live" : "demo"}</span>
            <button onClick={() => csvDownload(`ranks-${cleanDomain}.csv`, ["Keyword", "Position", "URL"], res.rows.map((r) => [r.keyword, r.position ?? "100+", r.url]))}
              className="ml-auto flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600"><Download size={11} /> CSV</button>
          </div>
          <table className="w-full text-left text-[12px]">
            <thead><tr className="border-b border-gray-200 text-[9.5px] uppercase tracking-wide text-gray-400">
              <th className="px-2 py-2 font-semibold">Keyword</th><th className="px-2 py-2 font-semibold">Rank</th><th className="px-2 py-2 font-semibold">Ranking page</th>
            </tr></thead>
            <tbody>
              {res.rows.map((r) => (
                <tr key={r.keyword} className="border-b border-gray-50">
                  <td className="px-2 py-2 font-semibold text-gray-800">{r.keyword}{r.error && <span className="ml-2 text-[10px] text-red-500">{r.error}</span>}</td>
                  <td className="px-2 py-2">{rankChip(r.position)}</td>
                  <td className="ll-mono max-w-[300px] truncate px-2 py-2 text-[11px]">
                    {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="underline" style={{ color: accent }}>{r.url.replace(/^https?:\/\/(www\.)?/, "")}</a> : <span className="text-gray-300">not in the top 100</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-[10px] text-gray-400">Want this monitored over time? Add the keywords to a project — Performance Studio tracks them monthly with re-check scheduling.</div>
        </Card>
      )}
    </div>
  );
}

/* the FULL geo-grid tracker (maps + ARP/SoLV) on a throwaway in-memory
   project — scan any business's map rankings once, save nothing */
export function MapRankCheck({ accent, dfs, placesKey }) {
  const [proj, setProj] = useState({ id: "tool-rank", name: "One-time map check", website: "", tracking: [], geoGrid: {} });
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-[11.5px] text-gray-500">
        The exact geo-grid tracker from Performance Studio (coordinate-targeted Maps scans, ARP & SoLV) on a <b>throwaway workspace</b> —
        set up any business below and run a snapshot. Nothing is saved to a client project; results live until you leave this screen.
      </div>
      <GeoGridView project={proj} accent={accent} dfs={dfs} placesKey={placesKey} trackedKeywords={[]}
        onUpdate={(patch) => setProj((p) => ({ ...p, ...(typeof patch === "function" ? patch(p) : patch) }))} />
    </div>
  );
}
