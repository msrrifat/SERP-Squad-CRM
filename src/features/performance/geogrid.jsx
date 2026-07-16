import React, { useEffect, useMemo, useRef, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import {
  ArrowLeft, Building2, Calendar, ChevronDown, Crosshair, List, MapPin, Plus,
  RefreshCw, Search, Target, Trash2, TrendingDown, TrendingUp, X,
} from "lucide-react";
import { Card, Labeled, Modal, Seg, Toggle, inputCls, askDelete } from "../../ui/primitives.jsx";
import { DfsCostChip, dfsCost, fmtDfsCost } from "../../lib/dfsCost.jsx";
import { fmt, fmtTs2 } from "../../lib/format.jsx";
import { hashStr, mulberry32 } from "../../lib/rng.js";
import { realDfs } from "../optimization/indexcheck.jsx";
import { startScanJob, useScanJobs } from "../../lib/scanjobs.js";

/* ================= GBP Geo-Grid Rank Tracker (report-based) =================
   SEO-Utils-style workflow: named reports (Map · Report & Keywords · Schedule),
   each run = a snapshot of every keyword's grid. Live scans are coordinate-
   targeted Google Maps SERP requests via DataForSEO (location_coordinate
   "lat,lng,15z") — each point returns what a searcher at that spot sees.
   Business matched by place_id/CID first, normalized name second.
   The result map is REAL OpenStreetMap tiles with rank bubbles projected via
   Web-Mercator math — no map library, no API key, proper attribution. */

/* ---------- metrics ---------- */
export const gridMetrics = (points) => {
  const active = points.filter((p) => !p.skipped);
  const found = active.filter((p) => p.rank != null);
  const arp = found.length ? found.reduce((s, p) => s + p.rank, 0) / found.length : null;
  const atrp = active.length ? active.reduce((s, p) => s + (p.rank ?? 21), 0) / active.length : null;
  const solv = active.length ? (active.filter((p) => p.rank != null && p.rank <= 3).length / active.length) * 100 : 0;
  const coverage = active.length ? (found.length / active.length) * 100 : 0;
  const best = found.length ? Math.min(...found.map((p) => p.rank)) : null;
  const worst = found.length ? Math.max(...found.map((p) => p.rank)) : null;
  return { arp, atrp, solv, coverage, best, worst, found: found.length, total: active.length };
};
const snapshotAvg = (snap) => {
  const arps = Object.values(snap.grids).map((pts) => gridMetrics(pts).arp).filter((x) => x != null);
  return arps.length ? arps.reduce((a, b) => a + b, 0) / arps.length : null;
};

/* ---------- grid geometry (shared with the demo generator) ---------- */
const buildPoints = (center, size, spacingKm, shape) => {
  const half = (size - 1) / 2, pts = [];
  const maxR = half * spacingKm + 1e-6;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    const dLatKm = (half - r) * spacingKm, dLngKm = (c - half) * spacingKm;
    const skipped = shape === "circle" && Math.hypot(dLatKm, dLngKm) > maxR;
    pts.push({
      row: r, col: c, skipped,
      lat: center ? +(center.lat + dLatKm / 111.32).toFixed(6) : null,
      lng: center ? +(center.lng + dLngKm / (111.32 * Math.cos(((center?.lat || 0) * Math.PI) / 180))).toFixed(6) : null,
    });
  }
  return pts;
};

/* points scanned before the business was located carry lat/lng = null —
   re-derive them from grid geometry so the map renders once a center exists */
const fillCoords = (points, center, size, spacingKm) => {
  if (!center || !points) return points;
  const half = (size - 1) / 2;
  return points.map((p) => (p.lat != null ? p : {
    ...p,
    lat: +(center.lat + (half - p.row) * spacingKm / 111.32).toFixed(6),
    lng: +(center.lng + (p.col - half) * spacingKm / (111.32 * Math.cos((center.lat * Math.PI) / 180))).toFixed(6),
  }));
};

/* ---------- demo scan: spatially correlated, deterministic, always labeled ---------- */
const DEMO_COMPETITORS = ["City Dental Care", "Smile Studio NYC", "Midtown Dental Group", "Park Avenue Dentistry", "Gentle Dental Manhattan", "Uptown Family Dental"];
export function genDemoGrid(projectId, keyword, size, spacingKm, shape, center, run = 0, bizName = "Your business") {
  const r = mulberry32(hashStr(`${projectId}|gg|${keyword}|${size}|${spacingKm}|${run}`));
  const base = 1 + Math.floor(r() * 3);
  const half = (size - 1) / 2;
  /* stable per-competitor "home strength" so their grids look spatially coherent too */
  const compBase = DEMO_COMPETITORS.map((title, i) => ({ title, base: 1 + ((hashStr(projectId + title) + run) % 9), rating: +(3.9 + ((hashStr(title) % 10) / 10)).toFixed(1), reviews: 40 + (hashStr(title + projectId) % 400) }));
  return buildPoints(center, size, spacingKm, shape).map((pt) => {
    if (pt.skipped) return { ...pt, rank: null, results: [] };
    const dist = Math.max(Math.abs(pt.row - half), Math.abs(pt.col - half));
    let rank = base + Math.round(dist * (0.9 + r() * 1.6) * Math.max(0.6, spacingKm)) + (r() < 0.12 ? 3 : 0) - (run > 0 && r() < 0.35 ? 1 : 0);
    rank = Math.max(1, rank);
    if (rank > 20) rank = null;
    /* build the full local top-20 at this point: us + competitors, spatially varied */
    const entries = compBase.map((c) => ({ ...c, r: Math.max(1, c.base + Math.round((r() - 0.35) * 4) + Math.round(dist * r())) }));
    if (rank != null) entries.push({ title: bizName, r: rank, rating: 4.8, reviews: 210 });
    entries.sort((a, b) => a.r - b.r);
    const results = entries.slice(0, 20).map((e, i) => ({ title: e.title, rank: i + 1, rating: e.rating, reviews: e.reviews }));
    const our = results.find((x) => x.title === bizName);
    return { ...pt, rank: our ? our.rank : rank, results };
  });
}

const rankColor = (rank) =>
  rank == null ? "#5B6472" : rank <= 3 ? "#16A34A" : rank <= 10 ? "#F59E0B" : "#EF4444";

/* ---------- Web-Mercator projection for the OSM tile canvas ---------- */
const lonToX = (lon, z) => ((lon + 180) / 360) * 256 * 2 ** z;
const latToY = (lat, z) => {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 256 * 2 ** z;
};
const zoomFor = (extentKm, lat, px) => {
  // ground resolution m/px = 156543.03392 * cos(lat) / 2^z  →  fit extent into px
  const z = Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180) * px) / (extentKm * 1000));
  return Math.max(3, Math.min(18, Math.floor(z)));
};

const xToLon = (x, z) => (x / (256 * 2 ** z)) * 360 - 180;
const yToLat = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / (256 * 2 ** z)))) * 180) / Math.PI;

export function MapCanvas({ center, points: rawPts, size, spacingKm, prevPoints, height = 660, preview = false }) {
  const points = fillCoords(rawPts, center, size, spacingKm);
  const wrapRef = useRef(null);
  const [pxW, setPxW] = useState(900);           // full card width — measured live, no wasted side space
  const PX_H = height, half = (size - 1) / 2;
  useEffect(() => {
    const measure = () => setPxW(Math.max(320, wrapRef.current?.clientWidth || 900));
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);
  const extentKm = Math.max(0.5, half * 2 * spacingKm * 1.35);
  const initZ = zoomFor(extentKm, center.lat, Math.min(pxW, PX_H));
  const [z, setZ] = useState(initZ);
  const [view, setView] = useState({ lat: center.lat, lng: center.lng });
  const drag = useRef(null);
  useEffect(() => { setZ(initZ); setView({ lat: center.lat, lng: center.lng }); }, [center.lat, center.lng, size, spacingKm, initZ]); // eslint-disable-line

  const cx = lonToX(view.lng, z), cy = latToY(view.lat, z);
  const x0 = cx - pxW / 2, y0 = cy - PX_H / 2;
  const t0x = Math.floor(x0 / 256), t0y = Math.floor(y0 / 256);
  const tiles = [];
  for (let ty = t0y; ty * 256 < y0 + PX_H; ty++) for (let tx = t0x; tx * 256 < x0 + pxW; tx++) {
    if (ty >= 0 && ty < 2 ** z) tiles.push({ tx: ((tx % 2 ** z) + 2 ** z) % 2 ** z, ty, left: tx * 256 - x0, top: ty * 256 - y0 });
  }
  const prevAt = (p) => prevPoints?.find((x) => x.row === p.row && x.col === p.col);
  /* bigger, sample-style bubbles: readable ranks + prominent change badges */
  const base = size >= 11 ? 34 : size >= 9 ? 40 : 46;
  const bubble = Math.max(28, Math.min(60, base + (z - initZ) * 6));

  const onDown = (e) => { drag.current = { sx: e.clientX, sy: e.clientY, cx, cy }; e.currentTarget.setPointerCapture(e.pointerId); };
  const onMove = (e) => {
    if (!drag.current) return;
    const nx = drag.current.cx - (e.clientX - drag.current.sx);
    const ny = drag.current.cy - (e.clientY - drag.current.sy);
    setView({ lng: xToLon(nx, z), lat: yToLat(ny, z) });
  };
  const onUp = () => { drag.current = null; };
  const zoomBtn = "flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-[17px] font-bold text-gray-600 shadow hover:bg-gray-50";

  return (
    <div ref={wrapRef} className="w-full">
      <div className="relative w-full touch-none overflow-hidden rounded-2xl border border-gray-200 bg-[#F6F5F2]"
        style={{ height: PX_H, cursor: drag.current ? "grabbing" : "grab" }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
        onWheel={(e) => { e.preventDefault(); setZ((cur) => Math.max(3, Math.min(19, cur + (e.deltaY < 0 ? 1 : -1)))); }}>
        {/* CARTO light basemap — the clean Google-Maps-like style from the reference */}
        {tiles.map((t, i) => (
          <img key={`${z}-${t.tx}-${t.ty}-${i}`} alt="" src={`https://${"abcd"[(t.tx + t.ty) % 4]}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${t.tx}/${t.ty}.png`}
            className="pointer-events-none absolute select-none" style={{ left: t.left, top: t.top, width: 256, height: 256 }} draggable={false} />
        ))}
        {points.filter((p) => !p.skipped && p.lat != null).map((p) => {
          const left = lonToX(p.lng, z) - x0, top = latToY(p.lat, z) - y0;
          if (left < -60 || left > pxW + 60 || top < -60 || top > PX_H + 60) return null;
          const isCenter = p.row === half && p.col === half;
          const prev = prevAt(p);
          const delta = prev && prev.rank != null && p.rank != null ? prev.rank - p.rank : null;
          const top3 = (p.results || []).slice(0, 3);
          return (
            <div key={`${p.row}-${p.col}`} className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2" style={{ left, top }}
              title={preview ? `Scan point · ${p.lat}, ${p.lng}` : `${p.lat}, ${p.lng}\n${p.error ? "Scan failed at this point — rerun the report" : `Rank: ${p.rank ?? "not in top 50"}`}${top3.length ? "\nTop here: " + top3.map((c, i2) => `${i2 + 1}. ${c.title}${c.rating ? ` (${c.rating}★)` : ""}`).join("  ") : ""}`}>
              <div className={"flex items-center justify-center rounded-full font-bold text-white " + (isCenter ? "ring-[2.5px] ring-gray-900 ring-offset-2" : "")}
                style={preview
                  ? { width: Math.min(30, bubble * 0.62), height: Math.min(30, bubble * 0.62), fontSize: 15, background: "#111827E8", boxShadow: "0 2px 5px rgba(0,0,0,.3)" }
                  : { width: bubble, height: bubble, fontSize: bubble * 0.4, background: p.error ? "#94A3B8" : rankColor(p.rank), boxShadow: "0 2px 6px rgba(0,0,0,.25)" }}>
                {preview ? "+" : p.error ? "!" : p.rank ?? "50+"}
              </div>
              {delta != null && delta !== 0 && (
                <span className="absolute flex items-center justify-center rounded-full border border-gray-200 bg-white font-bold shadow-md"
                  style={{ right: -bubble * 0.14, top: -bubble * 0.14, height: bubble * 0.44, minWidth: bubble * 0.44, fontSize: bubble * 0.24, padding: "0 3px", color: delta > 0 ? "#16A34A" : "#DC2626" }}>
                  {delta > 0 ? `+${delta}` : delta}
                </span>
              )}
            </div>
          );
        })}
        <div className="absolute bottom-4 right-4 flex flex-col gap-1.5">
          <button className={zoomBtn} onClick={(e) => { e.stopPropagation(); setZ((c) => Math.min(19, c + 1)); }} onPointerDown={(e) => e.stopPropagation()}>+</button>
          <button className={zoomBtn} onClick={(e) => { e.stopPropagation(); setZ((c) => Math.max(3, c - 1)); }} onPointerDown={(e) => e.stopPropagation()}>−</button>
          <button className={zoomBtn} title="Recenter" onClick={(e) => { e.stopPropagation(); setZ(initZ); setView({ lat: center.lat, lng: center.lng }); }} onPointerDown={(e) => e.stopPropagation()}>
            <Crosshair size={14} />
          </button>
        </div>
        <span className="absolute bottom-0 left-0 rounded-tr bg-white/85 px-1.5 py-0.5 text-[9px] text-gray-500">© OpenStreetMap contributors © CARTO</span>
      </div>
      <Legend size={size} spacingKm={spacingKm} />
    </div>
  );
}

/* abstract fallback when the business has no coordinates yet */
export function AbstractGrid({ points, size, spacingKm, prevPoints }) {
  const half = (size - 1) / 2;
  const prevAt = (p) => prevPoints?.find((x) => x.row === p.row && x.col === p.col);
  return (
    <div>
      <div className="mx-auto grid w-fit gap-1.5 rounded-2xl border border-gray-100 bg-[linear-gradient(#F1F5F9_1px,transparent_1px),linear-gradient(90deg,#F1F5F9_1px,transparent_1px)] bg-[size:22px_22px] p-4"
        style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
        {points.map((p) => {
          const isCenter = p.row === half && p.col === half;
          const prev = prevAt(p);
          const delta = prev && prev.rank != null && p.rank != null ? prev.rank - p.rank : null;
          if (p.skipped) return <div key={`${p.row}-${p.col}`} className="h-10 w-10" />;
          return (
            <div key={`${p.row}-${p.col}`} className="relative" title={`Rank: ${p.rank ?? "not in top 50"}`}>
              <div className={"flex h-10 w-10 items-center justify-center rounded-full text-[12px] font-bold text-white shadow-sm " + (isCenter ? "ring-2 ring-offset-2 ring-gray-800" : "")} style={{ background: rankColor(p.rank) }}>
                {p.rank ?? "50+"}
              </div>
              {delta != null && delta !== 0 && (
                <span className="absolute -bottom-1 -right-1 rounded-full bg-white px-1 text-[8px] font-bold shadow" style={{ color: delta > 0 ? "#16A34A" : "#DC2626" }}>
                  {delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <Legend size={size} spacingKm={spacingKm} />
    </div>
  );
}
const Legend = ({ size, spacingKm }) => (
  <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-[10px] text-gray-400">
    <span className="ll-mono">{size}×{size} · {spacingKm} km spacing</span>
    <span className="flex items-center gap-1.5">
      {[["1–3", "#16A34A"], ["4–10", "#F59E0B"], ["11–50", "#EF4444"], ["50+", "#5B6472"]].map(([l, c]) => (
        <span key={l} className="flex items-center gap-0.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} /> {l}</span>
      ))}
    </span>
  </div>
);

/* derive any business's grid from stored per-point results — 0 extra requests */
export const normBiz = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const bizGrid = (pts, title) => pts.map((p) => ({
  ...p, rank: p.skipped ? null : ((p.results || []).find((r2) => normBiz(r2.title) === normBiz(title))?.rank ?? null),
}));
export const distFor = (pts) => {
  const a = pts.filter((p) => !p.skipped);
  return {
    p3: a.filter((p) => p.rank != null && p.rank <= 3).length,
    p10: a.filter((p) => p.rank != null && p.rank > 3 && p.rank <= 10).length,
    p20: a.filter((p) => p.rank != null && p.rank > 10).length,
    none: a.filter((p) => p.rank == null).length,
  };
};

/* ---------- setup constants ---------- */
const LOCALES = [["United States / English", "en"], ["Canada / English", "en"], ["United Kingdom / English", "en"], ["Australia / English", "en"]];
const FREQS = [["one", "One time"], ["daily", "Daily"], ["weekly", "Weekly"], ["twiceMonth", "Twice per month"], ["monthly", "Monthly"]];
const FREQ_MS = { daily: 864e5, weekly: 7 * 864e5, twiceMonth: 15 * 864e5, monthly: 30 * 864e5 };
const toKm = (v, unit) => (unit === "mi" ? v * 1.60934 : unit === "m" ? v / 1000 : v);
const effSpacing = (r) => +(r.mode === "radius" ? (2 * toKm(r.radius, r.unit)) / (r.size - 1) : toKm(r.spacing, r.unit)).toFixed(3);
const activePointCount = (r) => buildPoints({ lat: 0, lng: 0 }, r.size, effSpacing(r), r.shape).filter((p) => !p.skipped).length;
const parseMapsUrl = (url) => {
  const at = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  return at ? { lat: +at[1], lng: +at[2] } : null;
};

/* ================= setup modal (Map · Report & Keywords · Schedule) ================= */
function ReportSetup({ initial, business, onSaveBusiness, placesKey, accent, onSave, onClose }) {
  const [tab, setTab] = useState("map");
  const [r, setR] = useState(() => initial || {
    id: "rp" + Date.now(), name: "", keywords: [], kwRaw: "", locale: 0,
    size: 7, shape: "square", mode: "radius", radius: 0.5, spacing: 1, unit: "mi",
    schedule: { freq: "one", anyDay: true, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    snapshots: [], createdAt: Date.now(),
  });
  const [searchWith, setSearchWith] = useState("places"); // "places" | "url"
  const [mapsUrl, setMapsUrl] = useState("");
  const [biz, setBiz] = useState({ name: business.name || "", address: business.address || "", lat: business.lat ?? "", lng: business.lng ?? "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [touched, setTouched] = useState(false);
  const [showCost, setShowCost] = useState(false);
  const [tzSearch, setTzSearch] = useState("");

  const kws = r.kwRaw.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  const nameErr = touched && !r.name.trim();
  const kwErr = touched && !kws.length;
  const pts = activePointCount(r);
  const requests = pts * Math.max(1, kws.length);
  const timezones = useMemo(() => {
    try { return Intl.supportedValuesOf("timeZone"); } catch { return ["UTC"]; }
  }, []);

  const locate = async () => {
    setBusy(true); setErr(null);
    try {
      if (searchWith === "url") {
        const c = parseMapsUrl(mapsUrl);
        if (!c) { setErr("Couldn't find coordinates in that URL — paste a full Google Maps link (it contains @lat,lng)."); return; }
        setBiz((b) => ({ ...b, lat: c.lat, lng: c.lng }));
        onSaveBusiness({ ...biz, lat: c.lat, lng: c.lng, source: "maps-url" });
        return;
      }
      const res = await fetch("/api/places-locate", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ query: `${biz.name} ${biz.address}`.trim(), placesKey: placesKey || undefined }),
      });
      const data = await res.json();
      if (res.status === 503) { setErr(data.hint || "Google Places API key not configured — use a Maps URL or enter coordinates manually."); return; }
      if (!res.ok) { setErr("Places lookup failed: " + (data.detail || data.error)); return; }
      if (!data.found) { setErr("Google Places couldn't find that business — refine the name/address."); return; }
      setBiz({ name: data.name, address: data.address, lat: data.lat, lng: data.lng });
      onSaveBusiness({ name: data.name, address: data.address, lat: data.lat, lng: data.lng, placeId: data.placeId, source: "places" });
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  };
  const save = () => {
    setTouched(true);
    if (!r.name.trim() || !kws.length) { setTab("report"); return; }
    const lat = parseFloat(biz.lat), lng = parseFloat(biz.lng);
    if (isFinite(lat) && isFinite(lng)) onSaveBusiness({ name: biz.name, address: biz.address, lat, lng, source: business.source || "manual", placeId: business.placeId });
    onSave({ ...r, keywords: kws });
  };
  const errCls = "text-[11px] font-semibold text-red-500";

  return (
    <Modal title={initial ? "Edit report — " + (initial.name || "GBP Rank Tracker") : "New GBP rank report"} onClose={onClose} wide>
      <div className="mb-4 flex gap-1">
        {[["map", "Map"], ["report", "Report & Keywords"], ["schedule", "Schedule"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className="rounded-lg px-3.5 py-2 text-[12.5px] font-semibold"
            style={tab === k ? { background: "#fff", color: "#111827", boxShadow: "0 1px 3px rgba(0,0,0,.12)" } : { color: "#6B7280", background: "#F3F4F6" }}>
            {l}{(k === "report" && (nameErr || kwErr)) ? <span className="ml-1 text-red-500">•</span> : null}
          </button>
        ))}
      </div>

      {tab === "map" && (
        <div className="space-y-3">
          <Labeled label="Search with">
            <select value={searchWith} onChange={(e) => setSearchWith(e.target.value)} className={inputCls}>
              <option value="places">Google Places API</option>
              <option value="url">Google Maps URL</option>
            </select>
          </Labeled>
          {searchWith === "url" ? (
            <Labeled label="Google Maps URL — open your listing on Google Maps and paste the address-bar link">
              <input value={mapsUrl} onChange={(e) => setMapsUrl(e.target.value)} placeholder="https://www.google.com/maps/place/…/@40.7484,-73.9857,15z/…" className={"ll-mono " + inputCls} />
            </Labeled>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <Labeled label="Business name (as on Google Maps)"><input value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} className={inputCls} /></Labeled>
              <Labeled label="Address"><input value={biz.address} onChange={(e) => setBiz({ ...biz, address: e.target.value })} className={inputCls} /></Labeled>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={locate} disabled={busy} className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
              {busy ? <><RefreshCw size={11} className="animate-spin" /> Locating…</> : <><Crosshair size={11} /> {searchWith === "url" ? "Parse coordinates" : "Locate via Google Places"}</>}
            </button>
            {isFinite(parseFloat(biz.lat)) && <span className="ll-mono rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{(+biz.lat).toFixed(5)}, {(+biz.lng).toFixed(5)}</span>}
            <span className="text-[10.5px] text-gray-400">or type coordinates:</span>
            <input value={biz.lat} onChange={(e) => setBiz({ ...biz, lat: e.target.value })} placeholder="lat" className={"ll-mono w-24 " + inputCls} />
            <input value={biz.lng} onChange={(e) => setBiz({ ...biz, lng: e.target.value })} placeholder="lng" className={"ll-mono w-24 " + inputCls} />
          </div>
          {err && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11.5px] text-amber-800">{err}</div>}

          <div className="rounded-xl border border-gray-100 p-3">
            <Toggle on={r.unit === "m"} onChange={(v) => setR({ ...r, unit: v ? "m" : "mi" })}
              label="Use meters" desc="Toggle between meters and miles for grid spacing / radius" />
          </div>
          <div className="rounded-xl border border-gray-100 p-3">
            <Toggle on={r.mode === "radius"} onChange={(v) => setR({ ...r, mode: v ? "radius" : "spacing" })}
              label="Use radius" desc="If enabled, the grid is centered around the midpoint with a set radius; otherwise it's based on point spacing." />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Labeled label="Grid size">
              <select value={r.size} onChange={(e) => setR({ ...r, size: +e.target.value })} className={inputCls}>
                {[3, 5, 7, 9, 11, 13].map((n) => <option key={n} value={n}>{n}×{n} ({n * n} points)</option>)}
              </select>
            </Labeled>
            {r.mode === "radius" ? (
              <Labeled label={`Radius (${r.unit})`}>
                <input type="number" min="0.1" step="0.1" value={r.radius} onChange={(e) => setR({ ...r, radius: +e.target.value })} className={inputCls} />
              </Labeled>
            ) : (
              <Labeled label={`Point spacing (${r.unit})`}>
                <input type="number" min="0.05" step="0.05" value={r.spacing} onChange={(e) => setR({ ...r, spacing: +e.target.value })} className={inputCls} />
              </Labeled>
            )}
            <Labeled label="Grid shape">
              <select value={r.shape} onChange={(e) => setR({ ...r, shape: e.target.value })} className={inputCls}>
                <option value="square">Square</option>
                <option value="circle">Circle (corners clipped — cheaper)</option>
              </select>
            </Labeled>
          </div>
          <div className="text-[10.5px] text-gray-400">
            Effective spacing: <b className="ll-mono">{effSpacing(r)} km</b> · scan points: <b className="ll-mono">{pts}</b>{r.shape === "circle" ? ` of ${r.size * r.size} (circle clips ${r.size * r.size - pts})` : ""}
          </div>

          {/* live grid preview — the exact points the scan will hit, on the real
              map; updates instantly with size / radius / spacing / shape */}
          {isFinite(parseFloat(biz.lat)) && isFinite(parseFloat(biz.lng)) ? (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-gray-500">Live grid preview — every “+” is one coordinate-targeted scan. Drag / scroll to explore; it follows your settings above.</span>
                <span className="ll-mono text-[10px] text-gray-400">{pts} points</span>
              </div>
              <MapCanvas preview center={{ lat: parseFloat(biz.lat), lng: parseFloat(biz.lng) }}
                points={buildPoints({ lat: parseFloat(biz.lat), lng: parseFloat(biz.lng) }, r.size, effSpacing(r), r.shape)}
                size={r.size} spacingKm={effSpacing(r)} height={380} />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-[11.5px] text-gray-400">
              Locate the business (or enter coordinates) to see the live grid preview on the map.
            </div>
          )}
        </div>
      )}

      {tab === "report" && (
        <div className="space-y-3">
          <Labeled label={<span className={nameErr ? "text-red-500" : ""}>Report name</span>}>
            <input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder="e.g. Manhattan — core keywords" className={inputCls + (nameErr ? " border-red-300" : "")} />
          </Labeled>
          {nameErr && <div className={errCls}>Report name is required</div>}
          <Labeled label="Location / language">
            <select value={r.locale} onChange={(e) => setR({ ...r, locale: +e.target.value })} className={inputCls}>
              {LOCALES.map(([l], i) => <option key={l} value={i}>{l}</option>)}
            </select>
          </Labeled>
          <Labeled label={<span className={kwErr ? "text-red-500" : ""}>Keywords</span>}>
            <div className="relative">
              <textarea value={r.kwRaw} onChange={(e) => setR({ ...r, kwRaw: e.target.value })} rows={5}
                placeholder={"dentist near me\nteeth whitening\ndental implants"} className={inputCls + " resize-y" + (kwErr ? " border-red-300" : "")} />
              <span className="ll-mono absolute bottom-2 right-2.5 text-[10px] text-gray-400">{kws.length} keyword{kws.length === 1 ? "" : "s"}</span>
            </div>
          </Labeled>
          <div className="text-[10.5px] text-gray-400">List each keyword on its own line.</div>
          {kwErr && <div className={errCls}>At least one keyword is required</div>}
          <Labeled label="Scrape data with">
            <select className={inputCls} disabled><option>SERP API: DataForSEO (Maps, coordinate-targeted)</option></select>
          </Labeled>
          <button onClick={() => setShowCost(!showCost)} className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-[11.5px] font-medium text-gray-600 hover:border-gray-300">
            ⓘ View cost estimation
          </button>
          {showCost && (
            <div className="rounded-xl bg-gray-50 p-3 text-[11.5px] leading-relaxed text-gray-600">
              <b>{requests.toLocaleString()} live Maps requests per run</b> ({pts} points × {Math.max(1, kws.length)} keyword{kws.length === 1 ? "" : "s"})
              ≈ <b>${(requests * 0.0035).toFixed(2)}</b> at DataForSEO's ~$0.0035/request live-advanced rate — verify current pricing on your DataForSEO plan. Circle shape and smaller grids cut cost directly.
            </div>
          )}
        </div>
      )}

      {tab === "schedule" && (
        <div className="space-y-3">
          <Labeled label="How often do you want this report to run?">
            <select value={r.schedule.freq} onChange={(e) => setR({ ...r, schedule: { ...r.schedule, freq: e.target.value } })} className={inputCls}>
              {FREQS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Labeled>
          {r.schedule.freq !== "one" && (
            <>
              <div className="rounded-xl border border-gray-100 p-3">
                <Toggle on={r.schedule.anyDay} onChange={(v) => setR({ ...r, schedule: { ...r.schedule, anyDay: v } })}
                  label="Run on any day" desc="Scheduled runs execute the next time the workspace is open past the due time. PROD: a server-side cron runs them unattended." />
              </div>
              <Labeled label="Timezone">
                <input value={tzSearch} onChange={(e) => setTzSearch(e.target.value)} placeholder="Type to search timezones…" className={inputCls + " mb-1.5"} />
                <select value={r.schedule.timezone} onChange={(e) => setR({ ...r, schedule: { ...r.schedule, timezone: e.target.value } })} className={inputCls} size={5}>
                  {timezones.filter((t) => t.toLowerCase().includes(tzSearch.toLowerCase())).slice(0, 200).map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Labeled>
            </>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
        <span className="text-[10.5px] text-gray-400">{pts} points · {kws.length} keyword{kws.length === 1 ? "" : "s"} · {FREQS.find(([k]) => k === r.schedule.freq)?.[1]}</span>
        <button onClick={save} className="rounded-lg px-5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>Save report</button>
      </div>
    </Modal>
  );
}

/* ================= main view ================= */
export function GeoGridView({ project, accent, onUpdate, dfs, placesKey, trackedKeywords = [] }) {
  const geo = project.geoGrid || {};
  const gbpLoc = project.opt?.gbp || {};
  const bizBase = geo.business || { name: gbpLoc.bizName || project.name, address: gbpLoc.address || "" };
  const biz = isFinite(bizBase.lat) && isFinite(bizBase.lng) ? bizBase : { ...bizBase, lat: gbpLoc.lat, lng: gbpLoc.lng };
  const reports = geo.reports || [];
  const [openReportId, setOpenReportId] = useState(null);
  const [setup, setSetup] = useState(null); // null | "new" | report object (edit)
  /* scans run as global background jobs — navigating away never stops them;
     this view derives spinner/progress/errors from the job registry */
  const { get: getJob } = useScanJobs();
  const jobFor = (rpId) => getJob(`geogrid:${project.id}:${rpId}`);
  const jobScanState = (rpId) => {
    const j = jobFor(rpId);
    return j?.status === "running" ? { reportId: rpId, kwIndex: j.progress?.done || 0, total: j.progress?.total || 1, kw: j.progress?.note } : null;
  };
  const anyRunning = reports.some((rp) => jobFor(rp.id)?.status === "running");
  const patchGeo = (p) => onUpdate((proj) => ({ geoGrid: { ...(proj.geoGrid || {}), ...(typeof p === "function" ? p(proj.geoGrid || {}) : p) } }));
  const patchReport = (id, fn) => patchGeo((cur) => ({ reports: (cur.reports || []).map((rp) => (rp.id === id ? { ...rp, ...(typeof fn === "function" ? fn(rp) : fn) } : rp)) }));

  const locale = (rp) => LOCALES[rp.locale || 0];
  const runSnapshot = (rp) => {
    const spacingKm = effSpacing(rp);
    const center = isFinite(biz.lat) && isFinite(biz.lng) ? { lat: +biz.lat, lng: +biz.lng } : null;
    startScanJob(`geogrid:${project.id}:${rp.id}`, `Geo-grid · ${project.name} — ${rp.name || rp.keywords[0]}`, async (setProgress) => {
      const grids = {};
      let live = false;
      for (let i = 0; i < rp.keywords.length; i++) {
        const kw = rp.keywords[i];
        setProgress({ done: i, total: rp.keywords.length, note: kw });
        let pts = null;
        if (center) {
          try {
            const res = await fetch("/api/geo-grid", {
              method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(300000),
              body: JSON.stringify({
                keyword: kw, center, grid: { size: rp.size, spacingKm, shape: rp.shape },
                business: { name: biz.name, placeId: biz.placeId }, language_code: locale(rp)[1], dfs: realDfs(dfs),
              }),
            });
            if (res.ok) { const d = await res.json(); pts = d.points; live = true; }
            else if (res.status === 502) { const e2 = await res.json().catch(() => ({})); throw new Error("Live scan failed: " + (e2.detail || "provider error")); }
          } catch (e) {
            if (String(e?.message || "").startsWith("Live scan failed")) throw e;
            /* server down → demo below */
          }
        }
        if (!pts) {
          const run = rp.snapshots.length;
          pts = genDemoGrid(project.id, kw, rp.size, spacingKm, rp.shape, center, run, biz.name || "Your business");
          await new Promise((r2) => setTimeout(r2, 350));
        }
        grids[kw] = pts;
      }
      const snap = { id: "sn" + Date.now(), at: Date.now(), live, grids, size: rp.size, spacingKm, shape: rp.shape };
      patchReport(rp.id, (cur) => ({ snapshots: [snap, ...cur.snapshots].slice(0, 24), lastRun: Date.now() }));
      return { keywords: rp.keywords.length, live };
    });
  };

  /* scheduled runs: execute at most one due report per mount (PROD: server cron) */
  const schedRan = useRef(false);
  useEffect(() => {
    if (schedRan.current) return;
    schedRan.current = true;
    const due = reports.find((rp) => rp.schedule.freq !== "one" && rp.lastRun && Date.now() - rp.lastRun > FREQ_MS[rp.schedule.freq]);
    if (due) runSnapshot(due);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = reports.find((rp) => rp.id === openReportId);
  if (open) return (
    <ReportView report={open} biz={biz} accent={accent} scanState={jobScanState(open.id)} err={jobFor(open.id)?.status === "error" ? jobFor(open.id).error : null}
      onBack={() => setOpenReportId(null)} onRun={() => runSnapshot(open)} onEdit={() => setSetup(open)}
      onDeleteSnapshot={(sid) => patchReport(open.id, (cur) => ({ snapshots: cur.snapshots.filter((x) => x.id !== sid) }))}
      setupModal={setup && (
        <ReportSetup initial={setup === "new" ? null : setup} business={biz} accent={accent} placesKey={placesKey}
          onSaveBusiness={(b) => patchGeo({ business: b })}
          onSave={(rp) => { patchReport(rp.id, rp); setSetup(null); }}
          onClose={() => setSetup(null)} />
      )} />
  );

  /* ---- all reports ---- */
  return (
    <div className="ll-fade space-y-5">
      <Card className="flex flex-wrap items-center gap-3 p-5">
        <div className="min-w-0 flex-1">
          <div className="ll-display flex items-center gap-2 text-[16px] font-semibold"><Target size={16} style={{ color: accent }} /> GBP Rank Tracker</div>
          <div className="mt-0.5 text-[11.5px] text-gray-400">
            Geo-grid Maps rank reports — every point is a coordinate-targeted search.
            {isFinite(biz.lat) ? <span className="ll-mono ml-1 text-emerald-600">{biz.name} · {(+biz.lat).toFixed(4)}, {(+biz.lng).toFixed(4)}</span> : " Set the business location in a report's Map tab."}
          </div>
        </div>
        <button onClick={() => setSetup("new")} className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white" style={{ background: accent }}>
          <Plus size={13} /> New report
        </button>
      </Card>

      {reports.map((rp) => {
        const last = rp.snapshots[0];
        const avg = last ? snapshotAvg(last) : null;
        const rpScan = jobScanState(rp.id);
        const running = !!rpScan;
        return (
          <Card key={rp.id} className="flex flex-wrap items-center gap-3 p-4">
            <button onClick={() => setOpenReportId(rp.id)} className="min-w-0 flex-1 text-left">
              <div className="flex items-center gap-2">
                <span className="ll-display truncate text-[14px] font-semibold text-gray-800">{rp.name}</span>
                {last && <span className="rounded-full px-1.5 py-px text-[8.5px] font-bold uppercase" style={last.live ? { background: "#DCFCE7", color: "#166534" } : { background: "#FEF3C7", color: "#92400E" }}>{last.live ? "Live" : "Demo"}</span>}
              </div>
              <div className="ll-mono mt-1 flex flex-wrap gap-2 text-[10px] text-gray-400">
                <span>▦ {rp.size}×{rp.size}</span>
                <span>◈ {effSpacing(rp)} km</span>
                <span>{activePointCount(rp)} points</span>
                <span>{rp.keywords.length} keywords</span>
                <span><Calendar size={9} className="inline" /> {FREQS.find(([k]) => k === rp.schedule.freq)?.[1]}</span>
                {last && <span>last run {fmtTs2(last.at)}{avg != null ? ` · Avg rank ${avg.toFixed(1)}` : ""}</span>}
              </div>
            </button>
            <button onClick={() => runSnapshot(rp)} disabled={anyRunning}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
              {running ? <><RefreshCw size={10} className="animate-spin" /> {rpScan.kw ? `"${rpScan.kw}" (${rpScan.kwIndex + 1}/${rpScan.total})` : "Running…"}</> : <><Search size={10} /> Run now <span className="ll-mono ml-1 text-[8.5px] opacity-80">≈{fmtDfsCost(dfsCost(activePointCount(rp) * rp.keywords.length, "maps"))}</span></>}
            </button>
            <button onClick={() => setSetup(rp)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11.5px] font-semibold text-gray-500 hover:border-gray-300">Edit</button>
            <button onClick={() => askDelete(`the report "${rp.name}" and all its snapshots`) && patchGeo((cur) => ({ reports: cur.reports.filter((x) => x.id !== rp.id) }))} className="rounded-lg border border-gray-200 p-1.5 text-gray-300 hover:text-red-500"><Trash2 size={12} /></button>
          </Card>
        );
      })}
      {reports.length === 0 && (
        <Card className="p-10 text-center text-[12.5px] text-gray-400">
          No reports yet — create one: pick the business on the Map tab, add keywords, set a schedule. Each run scans every keyword across the whole grid.
        </Card>
      )}
      {(() => { const failed = reports.map((rp) => jobFor(rp.id)).find((j) => j?.status === "error"); return failed
        ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[11.5px] text-red-700">{failed.error}</div>
        : null; })()}

      {setup && (
        <ReportSetup initial={setup === "new" ? null : setup} business={biz} accent={accent} placesKey={placesKey}
          onSaveBusiness={(b) => patchGeo({ business: b })}
          onSave={(rp) => {
            patchGeo((cur) => {
              const rs = cur.reports || [];
              return { reports: rs.some((x) => x.id === rp.id) ? rs.map((x) => (x.id === rp.id ? { ...x, ...rp } : x)) : [rp, ...rs] };
            });
            setSetup(null);
          }}
          onClose={() => setSetup(null)} />
      )}
    </div>
  );
}

/* ================= report results ================= */
function ReportView({ report: rp, biz, accent, onBack, onRun, onEdit, onDeleteSnapshot, scanState, err, setupModal }) {
  const [kw, setKw] = useState(rp.keywords[0]);
  const [snapId, setSnapId] = useState(null);
  const [snapOpen, setSnapOpen] = useState(false);
  const [tab, setTab] = useState("overview");
  const [kwPanel, setKwPanel] = useState(false);
  const [kwSearch, setKwSearch] = useState("");

  const [viewBiz, setViewBiz] = useState(null); // null = own business; string = competitor grid (derived, 0 extra credits)
  const [compSearch, setCompSearch] = useState("");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [share, setShare] = useState(null);     // { busy } | { link } | { err }
  const [overlay, setOverlay] = useState(null); // null | "compare" | "snapshot" 
  const snaps = rp.snapshots;
  const snap = snaps.find((s2) => s2.id === snapId) || snaps[0] || null;
  const rawPoints = snap?.grids[kw] || null;
  const normB = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  /* derive ANY business's grid from the stored per-point top-20 — the whole
     competitor view reuses the original scan: zero additional SERP requests */
  const gridForBiz = (pts, title) => pts.map((p) => ({
    ...p,
    rank: p.skipped ? null : ((p.results || []).find((r2) => normB(r2.title) === normB(title))?.rank ?? null),
  }));
  const points = rawPoints ? (viewBiz ? gridForBiz(rawPoints, viewBiz) : rawPoints) : null;
  const prevRaw = snap ? snaps.find((s2) => s2.at < snap.at && s2.grids[kw])?.grids[kw] : null;
  const prevSnap = snap ? snaps.find((s2) => s2.at < snap.at && s2.grids[kw]) : null;
  const prevPoints = prevRaw ? (viewBiz ? gridForBiz(prevRaw, viewBiz) : prevRaw) : null;
  const m = points ? gridMetrics(points) : null;
  const pm = prevPoints ? gridMetrics(prevPoints) : null;
  const center = isFinite(biz.lat) && isFinite(biz.lng) ? { lat: +biz.lat, lng: +biz.lng } : null;

  /* leaderboard: avg rank of EVERY business across all grid points (screenshot-style) */
  const competitors = useMemo(() => {
    if (!rawPoints) return [];
    const agg = {};
    const active = rawPoints.filter((p) => !p.skipped);
    active.forEach((p) => (p.results || []).forEach((r2) => {
      const a = (agg[r2.title] = agg[r2.title] || { title: r2.title, ranks: [], top3: 0, first: 0, rating: r2.rating, reviews: r2.reviews });
      a.ranks.push(r2.rank);
      if (r2.rank <= 3) a.top3++;
      if (r2.rank === 1) a.first++;
    }));
    return Object.values(agg).map((a) => ({
      ...a,
      avg: a.ranks.reduce((x, y) => x + y, 0) / a.ranks.length,
      solv: (a.top3 / active.length) * 100,
      presence: a.ranks.length,
      isOwn: normB(a.title) === normB(biz.name),
    })).sort((a, b) => a.avg - b.avg);
  }, [rawPoints, biz.name]);
  const exportCsv = () => {
    const rows = [["#", "Business", "Avg rank", "SoLV %", "#1 points", "Top-3 points", "Seen at points", "Rating", "Reviews"],
      ...competitors.map((c2, i) => [i + 1, c2.title, c2.avg.toFixed(1), c2.solv.toFixed(1), c2.first, c2.top3, c2.presence, c2.rating ?? "", c2.reviews ?? ""])];
    const csv = rows.map((r2) => r2.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${rp.name} — ${kw} — competitors.csv`.replace(/[^\w —-]+/g, "");
    a.click();
  };

  const MetricCard = ({ label, value, sub, deltaVal, invert }) => (
    <Card className="p-3.5">
      <div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className="ll-display mt-0.5 text-[20px] font-bold" style={{ color: accent }}>{value}</div>
      <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
        {deltaVal != null && deltaVal !== 0 && (
          <span className="flex items-center gap-0.5 font-bold" style={{ color: (invert ? -deltaVal : deltaVal) > 0 ? "#16A34A" : "#DC2626" }}>
            {(invert ? -deltaVal : deltaVal) > 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}{Math.abs(deltaVal).toFixed(1)}
          </span>
        )}
        {sub}
      </div>
    </Card>
  );

  return (
    <div className="ll-fade space-y-4">
      {/* breadcrumb + header */}
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <button onClick={onBack} className="flex items-center gap-1 text-gray-400 hover:text-gray-600"><ArrowLeft size={13} /> All reports</button>
        <span className="text-gray-300">/</span>
        <span className="ll-display font-semibold text-gray-800">{rp.name}</span>
        <span className="ml-auto flex gap-2">
          <button onClick={onRun} disabled={!!scanState}
            className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>
            {scanState ? <><RefreshCw size={10} className="animate-spin" /> "{scanState.kw}" ({scanState.kwIndex + 1}/{scanState.total})</> : <><Search size={10} /> Run snapshot now</>}
            {!scanState && <DfsCostChip requests={activePointCount(rp) * rp.keywords.length} kind="maps" className="ml-1 border-white/40 bg-white/20 text-white" />}
          </button>
          <span className="relative">
            <button onClick={() => setActionsOpen(!actionsOpen)} className="rounded-lg border border-gray-200 bg-white px-3.5 py-1.5 text-[11.5px] font-semibold text-gray-700 shadow-sm hover:border-gray-300">Actions</button>
            {actionsOpen && (
              <div className="absolute right-0 z-40 mt-1 w-64 rounded-xl border border-gray-200 bg-white py-1.5 shadow-xl" onClick={() => setActionsOpen(false)}>
                <div className="px-3.5 py-1.5 text-[11px] font-bold text-gray-800">Report</div>
                {[
                  ["✎  Edit", onEdit],
                  ["⤴  Share", async () => {
                    setShare({ busy: true });
                    try {
                      const res = await fetch("/api/share", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ payload: { name: rp.name, biz: { name: biz.name, address: biz.address, lat: +biz.lat || null, lng: +biz.lng || null }, keywords: rp.keywords, snapshot: snap } }),
                      });
                      if (!res.ok) throw new Error("API server unavailable");
                      const { id } = await res.json();
                      setShare({ link: `${window.location.origin}${window.location.pathname}#share=${id}` });
                    } catch (e) { setShare({ err: "Sharing needs the API server running (npm run api) — links are stored there. " + e.message }); }
                  }],
                  ["🗝  Manage keywords", onEdit],
                  ["⇄  Compare", () => setOverlay("compare")],
                  ["↻  Re-run", onRun],
                ].map(([l, fn]) => (
                  <button key={l} onClick={fn} className="block w-full px-3.5 py-2 text-left text-[12.5px] text-gray-700 hover:bg-gray-50">{l}</button>
                ))}
                <div className="mt-1 border-t border-gray-100 px-3.5 py-1.5 text-[11px] font-bold text-gray-800">Current snapshot</div>
                <button onClick={() => setOverlay("snapshot")} disabled={!snap} className="block w-full px-3.5 py-2 text-left text-[12.5px] text-gray-700 hover:bg-gray-50 disabled:opacity-40">⭳  Snapshot report (PDF, all keywords)</button>
                <button disabled={!snap} onClick={() => {
                  const rows = [["Keyword", "Row", "Col", "Lat", "Lng", "Rank"]];
                  Object.entries(snap.grids).forEach(([k2, pts]) => pts.filter((p) => !p.skipped).forEach((p) => rows.push([k2, p.row, p.col, p.lat ?? "", p.lng ?? "", p.rank ?? "50+"])));
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(new Blob([rows.map((r2) => r2.join(",")).join("\n")], { type: "text/csv" }));
                  a.download = `${rp.name} — snapshot ${new Date(snap.at).toISOString().slice(0, 10)}.csv`;
                  a.click();
                }} className="block w-full px-3.5 py-2 text-left text-[12.5px] text-gray-700 hover:bg-gray-50 disabled:opacity-40">⇓  Export current snapshot (CSV)</button>
                <button disabled={!snap} onClick={() => { if (confirm("Delete this snapshot?")) { onDeleteSnapshot(snap.id); setSnapId(null); } }}
                  className="block w-full px-3.5 py-2 text-left text-[12.5px] text-red-500 hover:bg-red-50 disabled:opacity-40">🗑  Delete current snapshot</button>
              </div>
            )}
          </span>
        </span>
      </div>
      <Card className="flex flex-wrap items-center gap-2 p-3.5">
        <MapPin size={14} style={{ color: accent }} />
        <span className="text-[13px] font-semibold text-gray-800">{biz.name || "Business"}{biz.address ? ` — ${biz.address}` : ""}</span>
        <span className="ll-mono ml-auto flex gap-2 text-[10px] text-gray-400">
          <span>▦ {rp.size}×{rp.size}</span><span>◈ {effSpacing(rp)} km</span><span>{activePointCount(rp)} points</span><span>{rp.keywords.length} keywords</span>
        </span>
      </Card>

      {/* keyword + snapshot pickers */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setKwPanel(true)} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-2 text-gray-500 hover:border-gray-300" title="All keywords"><List size={14} /></button>
        <span className="ll-display text-[16px] font-semibold">{kw}</span>
        <div className="relative ml-auto">
          <button onClick={() => setSnapOpen(!snapOpen)} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] font-medium text-gray-600 hover:border-gray-300">
            Snapshot: {snap ? fmtTs2(snap.at) : "—"} <ChevronDown size={12} />
          </button>
          {snapOpen && snaps.length > 0 && (
            <div className="absolute right-0 z-30 mt-1 max-h-72 w-80 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{snaps.length} snapshot{snaps.length === 1 ? "" : "s"}</div>
              {snaps.map((s2) => {
                const avg = snapshotAvg(s2);
                return (
                  <button key={s2.id} onClick={() => { setSnapId(s2.id); setSnapOpen(false); }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-gray-50" style={snap?.id === s2.id ? { background: accent + "0D" } : {}}>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-semibold text-gray-700">{new Date(s2.at).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</span>
                      <span className="ll-mono block text-[9.5px] text-gray-400">{Object.values(s2.grids)[0]?.filter((p) => !p.skipped).length || 0} points · {Object.keys(s2.grids).length} keywords{s2.live ? "" : " · demo"}</span>
                    </span>
                    <span className="ll-mono shrink-0 text-[10px] text-gray-500">Avg rank: <b>{avg != null ? avg.toFixed(1) : "—"}</b></span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* tabs */}
      <div className="flex gap-1">
        {[["overview", "Overview"], ["competitors", "Competitors"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className="rounded-lg px-4 py-2 text-[12.5px] font-semibold"
            style={tab === k ? { background: "#fff", color: "#111827", boxShadow: "0 1px 3px rgba(0,0,0,.12)" } : { color: "#6B7280", background: "#F3F4F6" }}>
            {l}
          </button>
        ))}
      </div>

      {err && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[11.5px] text-red-700">{err}</div>}
      {!snap && <Card className="p-10 text-center text-[12.5px] text-gray-400">No snapshots yet — hit <b>Run snapshot now</b> to scan all {rp.keywords.length} keywords across the grid.</Card>}

      {snap && !snap.live && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[11.5px] text-amber-800">
          <b>Demo snapshot.</b> Start the API server + add DataForSEO credentials for real coordinate-targeted Maps scans.
        </div>
      )}

      {snap && points && tab === "overview" && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <MetricCard label="ARP (avg rank)" value={m.arp != null ? "#" + m.arp.toFixed(1) : "—"} sub="where found" deltaVal={pm && m.arp != null && pm.arp != null ? +(pm.arp - m.arp).toFixed(1) : null} />
            <MetricCard label="ATRP" value={m.atrp != null ? "#" + m.atrp.toFixed(1) : "—"} sub="not-found = #21" deltaVal={pm && m.atrp != null && pm.atrp != null ? +(pm.atrp - m.atrp).toFixed(1) : null} />
            <MetricCard label="SoLV" value={m.solv.toFixed(0) + "%"} sub="points in top 3" deltaVal={pm ? +(m.solv - pm.solv).toFixed(0) : null} invert />
            <MetricCard label="Coverage" value={m.coverage.toFixed(0) + "%"} sub={`${m.found}/${m.total} in top 20`} deltaVal={pm ? +(m.coverage - pm.coverage).toFixed(0) : null} invert />
            <MetricCard label="Best / Worst" value={`#${m.best ?? "—"} / #${m.worst ?? "—"}`} sub="across the grid" />
          </div>
          {viewBiz && (
            <div className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[12px]" style={{ borderColor: accent + "55", background: accent + "0A" }}>
              <Target size={13} style={{ color: accent }} />
              <span>Viewing competitor grid: <b>{viewBiz}</b> — derived from the same scan data, <b>0 extra SERP credits</b>.</span>
              <button onClick={() => setViewBiz(null)} className="ml-auto rounded-lg px-3 py-1 text-[11px] font-bold text-white" style={{ background: accent }}>
                Back to {biz.name || "your business"}
              </button>
            </div>
          )}
          <Card className="p-2">
            {center
              ? <MapCanvas center={center} points={points} size={snap.size} spacingKm={snap.spacingKm} prevPoints={prevPoints} />
              : <AbstractGrid points={points} size={snap.size} spacingKm={snap.spacingKm} prevPoints={prevPoints} />}
            {prevSnap && <div className="mt-1.5 text-center text-[10px] text-gray-400">small badges = change vs {fmtTs2(prevSnap.at)} · hover any point for the local top-3 · drag to pan, wheel/buttons to zoom</div>}
          </Card>
        </>
      )}

      {snap && rawPoints && tab === "competitors" && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-3.5">
            <div>
              <div className="ll-display text-[14px] font-semibold">Top performing businesses for "{kw}"</div>
              <div className="text-[10.5px] text-gray-400">Average ranking of each business across all {rawPoints.filter((p) => !p.skipped).length} grid points of the current snapshot — click any row to see its grid (no extra credits).</div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <input value={compSearch} onChange={(e) => setCompSearch(e.target.value)} placeholder="Search…" className={"w-40 " + inputCls} />
              <button onClick={exportCsv} className="rounded-lg border border-gray-200 px-3 py-2 text-[11.5px] font-semibold text-gray-600 hover:border-gray-300">⭳ Export CSV</button>
            </div>
          </div>
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-gray-100 text-[9.5px] uppercase tracking-wider text-gray-400">
                <th className="w-10 px-4 py-2.5 font-semibold">#</th>
                <th className="px-2 py-2.5 font-semibold">Business</th>
                <th className="px-2 py-2.5 font-semibold">Avg rank</th>
                <th className="px-2 py-2.5 font-semibold">SoLV</th>
                <th className="px-2 py-2.5 font-semibold">#1 / top-3 points</th>
                <th className="px-2 py-2.5 font-semibold">Seen at</th>
                <th className="px-4 py-2.5 font-semibold">Rating</th>
              </tr>
            </thead>
            <tbody>
              {competitors.filter((c2) => c2.title.toLowerCase().includes(compSearch.toLowerCase())).map((c2, i) => (
                <tr key={c2.title} onClick={() => { if (!c2.isOwn) { setViewBiz(c2.title); setTab("overview"); } else { setViewBiz(null); setTab("overview"); } }}
                  className="cursor-pointer border-b border-gray-50 hover:bg-gray-50/70" style={c2.isOwn ? { background: accent + "0D" } : {}}>
                  <td className="px-4 py-2.5">
                    <span className="ll-mono flex h-6 w-6 items-center justify-center rounded-full text-[10.5px] font-bold" style={c2.isOwn ? { background: "#111827", color: "#fff" } : { background: "#F3F4F6", color: "#6B7280" }}>{i + 1}</span>
                  </td>
                  <td className="px-2 py-2.5">
                    <span className="font-medium text-gray-800">{c2.title}</span>
                    {c2.isOwn && <span className="ml-1.5 rounded-full px-1.5 py-px text-[8.5px] font-bold uppercase text-white" style={{ background: accent }}>You</span>}
                  </td>
                  <td className="px-2 py-2.5">
                    <span className="ll-mono rounded-full px-2 py-0.5 text-[10.5px] font-bold text-white" style={{ background: rankColor(Math.round(c2.avg)) }}>{c2.avg.toFixed(1)}</span>
                  </td>
                  <td className="ll-mono px-2 py-2.5">{c2.solv.toFixed(1)}%</td>
                  <td className="ll-mono px-2 py-2.5">{c2.first} / {c2.top3}</td>
                  <td className="ll-mono px-2 py-2.5 text-gray-500">{c2.presence}/{rawPoints.filter((p) => !p.skipped).length}</td>
                  <td className="ll-mono px-4 py-2.5">{c2.rating ? `${c2.rating}★${c2.reviews ? ` (${fmt(c2.reviews)})` : ""}` : "—"}</td>
                </tr>
              ))}
              {competitors.length === 0 && <tr><td colSpan={7} className="px-5 py-6 text-center text-gray-400">No businesses captured in this snapshot — run a new scan (older snapshots predate competitor capture).</td></tr>}
            </tbody>
          </table>
        </Card>
      )}

      {share && (
        <Modal title="Share this report" onClose={() => setShare(null)}>
          {share.busy && <div className="flex items-center gap-2 py-4 text-[12.5px] text-gray-500"><RefreshCw size={13} className="animate-spin" /> Creating public link…</div>}
          {share.err && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11.5px] text-amber-800">{share.err}</div>}
          {share.link && (
            <div className="space-y-2.5">
              <div className="text-[12px] text-gray-500">Anyone with this link sees a <b>read-only</b> copy of the current snapshot — no login, no edit access, no credentials involved.</div>
              <div className="flex gap-1.5">
                <input readOnly value={share.link} className={"ll-mono flex-1 " + inputCls} onFocus={(e) => e.target.select()} />
                <button onClick={() => navigator.clipboard?.writeText(share.link)} className="rounded-lg px-3.5 py-2 text-[12px] font-semibold text-white" style={{ background: accent }}>Copy</button>
              </div>
            </div>
          )}
        </Modal>
      )}
      {overlay === "compare" && snaps.length > 0 && (
        <CompareOverlay rp={rp} biz={biz} center={center} accent={accent} onClose={() => setOverlay(null)} />
      )}
      {overlay === "snapshot" && snap && (
        <SnapshotReportOverlay rp={rp} biz={biz} center={center} accent={accent} snap={snap} onClose={() => setOverlay(null)} />
      )}

      {/* all-keywords side panel */}
      {kwPanel && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setKwPanel(false)}>
          <div className="h-full w-[380px] max-w-[85vw] overflow-y-auto bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <div className="ll-display text-[16px] font-semibold">All keywords</div>
              <button onClick={() => setKwPanel(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X size={15} /></button>
            </div>
            <div className="mb-3 text-[11px] text-gray-400">All unique keywords in this report.</div>
            <input value={kwSearch} onChange={(e) => setKwSearch(e.target.value)} placeholder="Search keywords…" className={inputCls + " mb-2"} />
            {rp.keywords.filter((k) => k.toLowerCase().includes(kwSearch.toLowerCase())).map((k) => {
              const km2 = snap?.grids[k] ? gridMetrics(snap.grids[k]) : null;
              return (
                <div key={k} className="flex items-center gap-2 border-b border-gray-50 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium text-gray-700">{k}</span>
                    {km2 && <span className="ll-mono text-[9.5px] text-gray-400">ARP {km2.arp != null ? km2.arp.toFixed(1) : "—"} · SoLV {km2.solv.toFixed(0)}%</span>}
                  </span>
                  {k === kw
                    ? <span className="text-[11px] font-semibold text-gray-400">Current</span>
                    : <button onClick={() => { setKw(k); setKwPanel(false); }} className="text-[11.5px] font-semibold" style={{ color: accent }}>View</button>}
                </div>
              );
            })}
          </div>
          <div className="flex-1 bg-gray-900/30" />
        </div>
      )}
      {setupModal}
    </div>
  );
}

export function ReportGridMap({ center, points: rawPts, size, spacingKm, prevPoints, px = 420 }) {
  const points = fillCoords(rawPts, center, size, spacingKm);
  if (!center) return (
    <div>
      <AbstractGrid points={points} size={size} spacingKm={spacingKm} prevPoints={prevPoints} />
      <div className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-center text-[10px] leading-snug text-amber-700">
        No map background — this scan has no coordinates. Locate the business in
        GBP Rank Tracking → Business location (Google Places or manual lat/lng), then re-run the scan.
      </div>
    </div>
  );
  const half = (size - 1) / 2;
  const extentKm = Math.max(0.5, half * 2 * spacingKm * 1.35);
  const z = zoomFor(extentKm, center.lat, px);
  const cx = lonToX(center.lng, z), cy = latToY(center.lat, z);
  const x0 = cx - px / 2, y0 = cy - px / 2;
  const t0x = Math.floor(x0 / 256), t0y = Math.floor(y0 / 256);
  const tiles = [];
  for (let ty = t0y; ty * 256 < y0 + px; ty++) for (let tx = t0x; tx * 256 < x0 + px; tx++) {
    if (ty >= 0 && ty < 2 ** z) tiles.push({ tx: ((tx % 2 ** z) + 2 ** z) % 2 ** z, ty, left: tx * 256 - x0, top: ty * 256 - y0 });
  }
  const prevAt = (p) => prevPoints?.find((x) => x.row === p.row && x.col === p.col);
  const bubble = Math.max(20, Math.min(34, (px / size) * 0.62));
  return (
    <div className="relative mx-auto overflow-hidden rounded-xl border border-gray-200" style={{ width: px, height: px, maxWidth: "100%" }}>
      {tiles.map((t, i) => (
        <img key={i} alt="" src={`https://${"abcd"[(t.tx + t.ty) % 4]}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${t.tx}/${t.ty}.png`}
          className="absolute select-none" style={{ left: t.left, top: t.top, width: 256, height: 256 }} draggable={false} crossOrigin="anonymous" />
      ))}
      {/* soften the basemap (building blocks read as dark noise behind the grid) —
          streets/labels stay visible, rank bubbles stay the hero */}
      <div className="pointer-events-none absolute inset-0 bg-white/55" />
      {points.filter((p) => !p.skipped && p.lat != null).map((p) => {
        const left = lonToX(p.lng, z) - x0, top = latToY(p.lat, z) - y0;
        if (left < -40 || left > px + 40 || top < -40 || top > px + 40) return null;
        const isCenter = p.row === half && p.col === half;
        const prev = prevAt(p);
        const delta = prev && prev.rank != null && p.rank != null ? prev.rank - p.rank : null;
        return (
          <div key={`${p.row}-${p.col}`} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left, top }}>
            <div className={"flex items-center justify-center rounded-full font-bold text-white " + (isCenter ? "ring-2 ring-gray-900 ring-offset-1" : "")}
              style={{ width: bubble, height: bubble, fontSize: bubble * 0.4, background: rankColor(p.rank) }}>
              {p.rank ?? "50+"}
            </div>
            {delta != null && delta !== 0 && (
              <span className="absolute -right-1 -top-1 flex items-center justify-center rounded-full border border-gray-200 bg-white font-bold shadow"
                style={{ height: bubble * 0.42, minWidth: bubble * 0.42, fontSize: bubble * 0.26, padding: "0 2px", color: delta > 0 ? "#16A34A" : "#DC2626" }}>
                {delta > 0 ? `+${delta}` : delta}
              </span>
            )}
          </div>
        );
      })}
      <span className="absolute bottom-0 left-0 rounded-tr bg-white/85 px-1 py-px text-[8px] text-gray-500">© OSM © CARTO</span>
    </div>
  );
}

/* ================= report suite: distribution, compare, print, share ================= */
const DIST_META = [["p3", "Position 1–3", "#16A34A"], ["p10", "Position 4–10", "#F59E0B"], ["p20", "Position 11–50", "#EF4444"], ["none", "No ranking", "#5B6472"]];
export function Distribution({ points, compact = false }) {
  const d = distFor(points);
  const data = DIST_META.map(([k, name, color]) => ({ name, value: d[k], color }));
  const donut = compact ? 72 : 110;
  return (
    <div className={"flex items-center " + (compact ? "gap-2.5" : "gap-4")}>
      <div style={{ width: donut, height: donut }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius={compact ? 20 : 32} outerRadius={compact ? 34 : 52} strokeWidth={1}>
              {data.map((x, i) => <Cell key={i} fill={x.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className={compact ? "space-y-0.5" : "space-y-1"}>
        {data.map((x) => (
          <div key={x.name} className={"flex items-center gap-2 " + (compact ? "text-[10.5px]" : "text-[12px]")}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.color }} />
            <span className={(compact ? "w-20" : "w-28") + " text-gray-600"}>{x.name}</span>
            <span className="ll-mono font-bold text-gray-800">{x.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const PrintStyle = () => (
  <style>{`@media print { body * { visibility: hidden !important; } .gg-print, .gg-print * { visibility: visible !important; } .gg-print { position: absolute !important; left: 0; top: 0; width: 100%; height: auto !important; overflow: visible !important; } .gg-nopdf { display: none !important; } .gg-page { page-break-inside: avoid; } }`}</style>
);

function CandidatePanel({ label, snap, bizName, kw, center, size, spacingKm, mapH = 430 }) {
  const raw = snap?.grids[kw];
  if (!raw) return <Card className="p-6 text-center text-[12px] text-gray-400">No data for "{kw}" in this snapshot.</Card>;
  const pts = bizGrid(raw, bizName);
  const own = raw.some((p) => (p.results || []).length === 0); // legacy snapshots
  const first = raw.flatMap((p) => p.results || []).find((r2) => normBiz(r2.title) === normBiz(bizName));
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-2 p-3.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-bold text-gray-900">{bizName}</div>
          <div className="ll-mono text-[10px] text-gray-400">{first?.rating ? `★ ${first.rating}${first.reviews ? ` · ${fmt(first.reviews)} reviews` : ""}` : own ? "legacy snapshot" : ""}</div>
        </div>
        <span className="rounded-lg bg-gray-900 px-2 py-1 text-[10px] font-bold text-white">{new Date(snap.at).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}{snap.live ? "" : " · demo"}</span>
      </div>
      <div className="border-t border-gray-50 px-3.5 py-2"><Distribution points={pts} /></div>
      {center && <MapCanvas center={center} points={pts} size={size} spacingKm={spacingKm} height={mapH} />}
    </Card>
  );
}

/* ---- comparison report: 2 candidates (snapshot + business) × all keywords ---- */
export function CompareOverlay({ rp, biz, center, accent, initialA, initialB, onClose }) {
  const snaps = rp.snapshots;
  const [aSnap, setASnap] = useState(initialA || snaps[Math.min(1, snaps.length - 1)]?.id);
  const [bSnap, setBSnap] = useState(initialB || snaps[0]?.id);
  const [aBiz, setABiz] = useState(biz.name);
  const [bBiz, setBBiz] = useState(biz.name);
  const A = snaps.find((x) => x.id === aSnap), B = snaps.find((x) => x.id === bSnap);
  const bizOptions = (snap) => {
    if (!snap) return [biz.name];
    const set2 = new Set([biz.name]);
    Object.values(snap.grids).forEach((pts) => pts.forEach((p) => (p.results || []).forEach((r2) => set2.add(r2.title))));
    return [...set2];
  };
  return (
    <div className="gg-print fixed inset-0 z-[100] overflow-auto bg-white">
      <PrintStyle />
      <div className="mx-auto max-w-6xl space-y-5 p-6">
        <div className="gg-nopdf flex flex-wrap items-center gap-2">
          <button onClick={onClose} className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-[12px] font-semibold text-gray-600"><ArrowLeft size={13} /> Back</button>
          <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
            {[["Before — snapshot", aSnap, setASnap, true], ["After — snapshot", bSnap, setBSnap, true]].map(([lbl, val, set2], i) => (
              <Labeled key={lbl} label={lbl}>
                <select value={val} onChange={(e) => set2(e.target.value)} className={inputCls}>
                  {snaps.map((s2) => <option key={s2.id} value={s2.id}>{new Date(s2.at).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}{s2.live ? "" : " (demo)"}</option>)}
                </select>
              </Labeled>
            ))}
            <Labeled label="Business (before)">
              <select value={aBiz} onChange={(e) => setABiz(e.target.value)} className={inputCls}>{bizOptions(A).map((x) => <option key={x}>{x}</option>)}</select>
            </Labeled>
            <Labeled label="Business (after)">
              <select value={bBiz} onChange={(e) => setBBiz(e.target.value)} className={inputCls}>{bizOptions(B).map((x) => <option key={x}>{x}</option>)}</select>
            </Labeled>
          </div>
          <button onClick={() => window.print()} className="rounded-lg px-4 py-2 text-[12.5px] font-bold text-white" style={{ background: accent }}>⭳ Save PDF (all keywords)</button>
        </div>

        <div>
          <div className="ll-display text-[20px] font-bold">Comparison report — {rp.name}</div>
          <div className="text-[11.5px] text-gray-400">{biz.name}{biz.address ? ` — ${biz.address}` : ""} · {rp.size}×{rp.size} grid · {A && B ? `${new Date(A.at).toLocaleDateString()} vs ${new Date(B.at).toLocaleDateString()}` : ""}</div>
        </div>

        {rp.keywords.map((kw) => (
          <div key={kw} className="gg-page space-y-2">
            <div className="ll-display border-b border-gray-100 pb-1 text-[15px] font-semibold">"{kw}"</div>
            <div className="grid gap-4 lg:grid-cols-2">
              <CandidatePanel label="Before" snap={A} bizName={aBiz} kw={kw} center={center} size={rp.size} spacingKm={effSpacing(rp)} />
              <CandidatePanel label="After" snap={B} bizName={bBiz} kw={kw} center={center} size={rp.size} spacingKm={effSpacing(rp)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- snapshot report: every keyword's current grid with deltas vs a baseline date ---- */
export function SnapshotReportOverlay({ rp, biz, center, accent, snap, onClose }) {
  const snaps = rp.snapshots;
  const [baseId, setBaseId] = useState(snaps.find((x) => x.at < snap.at)?.id || "");
  const base = snaps.find((x) => x.id === baseId) || null;
  return (
    <div className="gg-print fixed inset-0 z-[100] overflow-auto bg-white">
      <PrintStyle />
      <div className="mx-auto max-w-4xl space-y-5 p-6">
        <div className="gg-nopdf flex flex-wrap items-center gap-2">
          <button onClick={onClose} className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-[12px] font-semibold text-gray-600"><ArrowLeft size={13} /> Back</button>
          <Labeled label="Compare against (baseline for change badges)">
            <select value={baseId} onChange={(e) => setBaseId(e.target.value)} className={inputCls}>
              <option value="">— no comparison —</option>
              {snaps.filter((x) => x.id !== snap.id).map((s2) => <option key={s2.id} value={s2.id}>{new Date(s2.at).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</option>)}
            </select>
          </Labeled>
          <button onClick={() => window.print()} className="ml-auto rounded-lg px-4 py-2 text-[12.5px] font-bold text-white" style={{ background: accent }}>⭳ Save PDF (all keywords)</button>
        </div>
        <div>
          <div className="ll-display text-[20px] font-bold">GBP ranking report — {rp.name}</div>
          <div className="text-[11.5px] text-gray-400">{biz.name}{biz.address ? ` — ${biz.address}` : ""} · snapshot {fmtTs2(snap.at)}{base ? ` · changes vs ${fmtTs2(base.at)}` : ""}{snap.live ? "" : " · demo data"}</div>
        </div>
        {rp.keywords.map((kw) => {
          const pts = snap.grids[kw];
          if (!pts) return null;
          const m = gridMetrics(pts);
          return (
            <div key={kw} className="gg-page space-y-2">
              <div className="ll-display border-b border-gray-100 pb-1 text-[15px] font-semibold">"{kw}"</div>
              <div className="flex flex-wrap gap-4 text-[12px]">
                <span>ARP <b className="ll-mono">{m.arp != null ? "#" + m.arp.toFixed(1) : "—"}</b></span>
                <span>ATRP <b className="ll-mono">{m.atrp != null ? "#" + m.atrp.toFixed(1) : "—"}</b></span>
                <span>SoLV <b className="ll-mono">{m.solv.toFixed(0)}%</b></span>
                <span>Coverage <b className="ll-mono">{m.coverage.toFixed(0)}%</b></span>
              </div>
              <div className="mb-2"><Distribution points={pts} /></div>
              {center && <MapCanvas center={center} points={pts} size={snap.size} spacingKm={snap.spacingKm} prevPoints={base?.grids[kw]} height={430} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---- read-only shared report (public link receiver) ---- */
export function SharedReportView({ shareId }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [kw, setKw] = useState(null);
  useEffect(() => {
    fetch("/api/share/" + shareId).then(async (r2) => {
      if (!r2.ok) throw new Error((await r2.json().catch(() => ({}))).error || r2.status);
      const d = await r2.json();
      setData(d); setKw(d.keywords[0]);
    }).catch((e) => setErr(String(e.message || e)));
  }, [shareId]);
  if (err) return <div className="flex min-h-screen items-center justify-center bg-[#F5F6F8] text-[13px] text-gray-500">Shared report unavailable ({err}) — the link may have expired or the API server is offline.</div>;
  if (!data) return <div className="flex min-h-screen items-center justify-center bg-[#F5F6F8] text-[13px] text-gray-400">Loading shared report…</div>;
  const pts = data.snapshot.grids[kw];
  const m = pts ? gridMetrics(pts) : null;
  const center = isFinite(data.biz?.lat) ? { lat: data.biz.lat, lng: data.biz.lng } : null;
  return (
    <div className="min-h-screen bg-[#F5F6F8] p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <Card className="flex flex-wrap items-center gap-2 p-4">
          <MapPin size={15} className="text-gray-500" />
          <div className="min-w-0 flex-1">
            <div className="ll-display text-[16px] font-bold">{data.name}</div>
            <div className="text-[11px] text-gray-400">{data.biz?.name}{data.biz?.address ? ` — ${data.biz.address}` : ""} · snapshot {fmtTs2(data.snapshot.at)}{data.snapshot.live ? "" : " · demo data"} · shared read-only</div>
          </div>
          <select value={kw || ""} onChange={(e) => setKw(e.target.value)} className={inputCls + " w-auto"}>
            {data.keywords.map((k) => <option key={k}>{k}</option>)}
          </select>
        </Card>
        {m && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[["ARP", m.arp != null ? "#" + m.arp.toFixed(1) : "—"], ["ATRP", m.atrp != null ? "#" + m.atrp.toFixed(1) : "—"], ["SoLV", m.solv.toFixed(0) + "%"], ["Coverage", m.coverage.toFixed(0) + "%"]].map(([l, v]) => (
              <Card key={l} className="p-3.5"><div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">{l}</div><div className="ll-display text-[20px] font-bold text-gray-800">{v}</div></Card>
            ))}
          </div>
        )}
        {pts && <Card className="p-2">{center ? <MapCanvas center={center} points={pts} size={data.snapshot.size} spacingKm={data.snapshot.spacingKm} /> : <AbstractGrid points={pts} size={data.snapshot.size} spacingKm={data.snapshot.spacingKm} />}</Card>}
        {pts && <Card className="px-4 py-3"><Distribution points={pts} /></Card>}
      </div>
    </div>
  );
}
