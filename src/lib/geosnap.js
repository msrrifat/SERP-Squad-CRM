/* =====================================================================
   GEO-GRID SNAPSHOT COMPACTION

   A scan stores, for every grid point, the top-20 listings Google returned
   there (title, rating, reviews, category, address) so competitor grids can
   be derived later at zero API cost. Across a 7x7 grid and a dozen keywords
   that is the same few hundred businesses repeated thousands of times:
   ~3 KB per point, 5 MB per project, and the single biggest reason the
   workspace grew to 30 MB.

   Compact form: the snapshot carries `places` (each business once) and a
   point carries `r`, the indices of its top-20 in rank order (plus `rk`
   only when ranks are not simply 1..n). `rank`, the client's own position,
   which every map and metric reads, stays on the point untouched.

   Readers call `pointResults` / `expandGrid` and get the original shape
   back; old fat snapshots pass through unchanged. Idempotent, lossless.
   ===================================================================== */

const placeKey = (r) => [r.title, r.rating, r.reviews, r.category, r.address].map((x) => (x == null ? "" : String(x))).join("");

/* is there anything to compact? cheap check so a save of an already-compact
   document costs nothing */
export function isFatSnapshot(snap) {
  const grids = snap?.grids;
  if (!grids || typeof grids !== "object") return false;
  for (const pts of Object.values(grids)) {
    if (!Array.isArray(pts)) continue;
    for (const p of pts) if (p && Array.isArray(p.results) && p.results.length) return true;
  }
  return false;
}

export function compactSnapshot(snap) {
  if (!isFatSnapshot(snap)) return snap;
  const places = Array.isArray(snap.places) ? snap.places.slice() : [];
  const index = new Map(places.map((pl, i) => [placeKey(pl), i]));
  const grids = {};
  for (const [kw, pts] of Object.entries(snap.grids)) {
    if (!Array.isArray(pts)) { grids[kw] = pts; continue; }
    grids[kw] = pts.map((p) => {
      if (!p || !Array.isArray(p.results)) return p;
      const { results, ...rest } = p;
      if (!results.length) return { ...rest, r: [] };
      const r = [], rk = [];
      let plain = true;
      results.forEach((res, i) => {
        const key = placeKey(res);
        let at = index.get(key);
        if (at == null) {
          at = places.length;
          places.push({ title: res.title, rating: res.rating ?? null, reviews: res.reviews ?? null, category: res.category ?? null, address: res.address ?? null });
          index.set(key, at);
        }
        r.push(at);
        const rank = res.rank == null ? i + 1 : res.rank;
        rk.push(rank);
        if (rank !== i + 1) plain = false;
      });
      return plain ? { ...rest, r } : { ...rest, r, rk };
    });
  }
  return { ...snap, grids, places };
}

/* the top-20 at one point, in the shape the scan produced */
export function pointResults(snap, p) {
  if (!p) return [];
  if (Array.isArray(p.results)) return p.results;
  if (!Array.isArray(p.r)) return [];
  const places = snap?.places || [];
  return p.r.map((i, k) => ({ ...(places[i] || { title: "" }), rank: p.rk ? p.rk[k] : k + 1 }));
}

/* one keyword's grid with `results` restored on every point (a fat grid is
   returned as-is, no copies) */
export function expandGrid(snap, kw) {
  const pts = snap?.grids?.[kw];
  if (!Array.isArray(pts)) return pts ?? null;
  if (!pts.some((p) => p && Array.isArray(p.r))) return pts;
  return pts.map((p) => (p && Array.isArray(p.r) ? { ...p, results: pointResults(snap, p) } : p));
}

/* every geo-grid snapshot inside one project's performance entry; returns
   the same object when nothing needed compacting */
export function compactPerformanceEntry(entry) {
  const reports = entry?.geoGrid?.reports;
  if (!Array.isArray(reports)) return entry;
  let changed = false;
  const next = reports.map((rp) => {
    if (!Array.isArray(rp?.snapshots)) return rp;
    let rc = false;
    const snaps = rp.snapshots.map((s) => { const c = compactSnapshot(s); if (c !== s) rc = true; return c; });
    if (!rc) return rp;
    changed = true;
    return { ...rp, snapshots: snaps };
  });
  return changed ? { ...entry, geoGrid: { ...entry.geoGrid, reports: next } } : entry;
}
