/* ================= Google Business Profile — live performance =================
   Reads the Business Profile Performance API through the API server (the same
   source GA4's Business Profile cards display). GA4's own Data API cannot
   serve those metrics — Google confines them to GA4's Standard Reports UI —
   so the numbers come from the profile itself, which also keeps ~18 months of
   history instead of GA4's rolling 6.

   Daily values are folded into the dashboards' 13-month grid, so every
   existing GBP widget and every date-range preset keeps working unchanged.
   Kept out of googlelive.jsx (lazy-loaded, chart-heavy) so App.jsx can use it
   without pulling that chunk into the main bundle. */
import { useEffect, useState } from "react";
import { projectLocations } from "../data/gen.js";
import { MONTH_DATES, isoDate } from "./months.jsx";

const monthIndexOf = (t) => { let i = -1; for (let j = 0; j < 13; j++) if (t >= MONTH_DATES[j].getTime()) i = j; return i; };
export async function fetchGbpMonths(project, conn) {
  const locs = projectLocations(project).filter((l) => l.integrations?.gbp && l.profiles?.gbp?.id && !l.profiles.gbp.demo);
  if (!conn?.connectionId || !locs.length) return null;
  const results = await Promise.all(locs.map((l) =>
    fetch("/api/gbp/performance", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: conn.connectionId, locationId: l.profiles.gbp.id,
        startDate: isoDate(MONTH_DATES[0]), endDate: isoDate(new Date()) }) })
      .then((r) => r.json()).then((j) => (j?.live ? j : { err: j?.detail || j?.error || null })).catch((e) => ({ err: String(e?.message || e) }))));
  const zeroGbp = () => ({ searchViews: 0, mapViews: 0, views: 0, searchMobile: 0, searchDesktop: 0, mapsMobile: 0, mapsDesktop: 0, calls: 0, directions: 0, websiteClicks: 0, totalReviews: 0 });
  const blank = () => Array.from({ length: 13 }, zeroGbp);
  const addDay = (arr, day) => {
    const i = monthIndexOf(Date.parse(day.date + "T12:00:00"));
    if (i < 0) return;
    const g = arr[i];
    g.views += day.views; g.searchViews += day.search; g.mapViews += day.maps;
    g.searchDesktop += day.searchDesktop; g.searchMobile += day.searchMobile;
    g.mapsDesktop += day.mapsDesktop; g.mapsMobile += day.mapsMobile;
    g.calls += day.calls; g.directions += day.directions; g.websiteClicks += day.websiteClicks;
  };
  const agg = blank();
  const perLoc = {};
  results.forEach((res, i) => {
    const own = blank();
    (res?.byDay || []).forEach((day) => { addDay(own, day); addDay(agg, day); });
    perLoc[locs[i].id] = own;
  });
  const err = results.find((r) => r?.err)?.err || null;
  return { agg, perLoc, err, live: results.some((r) => r?.live) };
}

/* fold fetched GBP months into a siteData object (aggregate + per location) */
export function applyGbpMonths(base, gbp) {
  if (!gbp) return base;
  base.months = base.months.map((m, i) => ({ ...m, gbp: gbp.agg[i] }));
  base.locations = base.locations.map((lo) => (gbp.perLoc[lo.id]
    ? { ...lo, months: base.months.map((m, i) => ({ ...m, gbp: gbp.perLoc[lo.id][i] })) }
    : lo));
  return base;
}

/* dashboard hook: live GBP months for a real (non-demo) project */
export function useLiveGbp(project) {
  const [out, setOut] = useState(null);
  const conn = project?.google || {};
  const sig = JSON.stringify(projectLocations(project || {}).map((l) => [l.id, l.profiles?.gbp?.id || null, !!l.integrations?.gbp]));
  useEffect(() => {
    if (!project || project.demoMode !== false) { setOut(null); return; }
    let alive = true;
    fetchGbpMonths(project, conn).then((r) => { if (alive) setOut(r); }).catch(() => { if (alive) setOut(null); });
    return () => { alive = false; };
  }, [project?.id, conn.connectionId, sig]); // eslint-disable-line
  return out;
}
