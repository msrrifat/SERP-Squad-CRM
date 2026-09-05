import { compactSnapshot, expandGrid, pointResults, compactPerformanceEntry, isFatSnapshot } from "../src/lib/geosnap.js";
let failed = 0;
const ok = (name, cond) => { console.log(`  ${cond ? "✓" : "✗"} ${name}`); if (!cond) failed++; };
const biz = (t, i) => ({ title: t, rank: i + 1, rating: 4.5, reviews: 10 + t.length, category: "HVAC", address: `${t.length} Main St` });
const names = ["Acme", "Beta Co", "Gamma", "Delta"];
const pts = [
  { row: 0, col: 0, lat: 1, lng: 2, rank: 1, results: names.map(biz) },
  { row: 0, col: 1, lat: 1, lng: 3, rank: 3, results: [names[2], names[0], names[3]].map(biz) },
  { row: 1, col: 0, lat: 2, lng: 2, rank: null, results: [] },
  { row: 1, col: 1, lat: 2, lng: 3, skipped: true, rank: null },
  { row: 2, col: 0, lat: 3, lng: 2, rank: 2, results: [{ ...biz("Acme", 0), rank: 1 }, { ...biz("Gamma", 1), rank: 4 }] },
];
const snap = { id: "s1", at: 1, live: true, size: 3, grids: { "hvac repair": pts, "furnace": pts.slice(0, 2) } };
console.log("geo-grid snapshot compaction:");
ok("fat detected", isFatSnapshot(snap));
const c = compactSnapshot(snap);
ok("compact is not fat", !isFatSnapshot(c));
ok("places deduplicated", c.places.length === 4);
ok("rank preserved on points", c.grids["hvac repair"].map((p) => p.rank).join() === pts.map((p) => p.rank).join());
ok("no results left on points", c.grids["hvac repair"].every((p) => !("results" in p)));
ok("non-sequential ranks kept", JSON.stringify(c.grids["hvac repair"][4].rk) === "[1,4]" && !("rk" in c.grids["hvac repair"][0]));
const back = expandGrid(c, "hvac repair");
const norm = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((kk) => [kk, x[kk]])) : x));
ok("expand restores every result exactly", norm(back.map((p) => p.results ?? null)) === norm(pts.map((p) => p.results ?? null)));
ok("expand keeps other point fields", back[3].skipped === true && back[0].lat === 1);
ok("pointResults on a fat point passes through", pointResults(snap, pts[0]) === pts[0].results);
ok("idempotent", compactSnapshot(c) === c);
ok("smaller", JSON.stringify(c).length < JSON.stringify(snap).length * 0.6);
const entry = { tracking: [1], geoGrid: { reports: [{ id: "r", snapshots: [snap, c] }] } };
const ce = compactPerformanceEntry(entry);
ok("entry compaction touches only fat snapshots", ce !== entry && ce.geoGrid.reports[0].snapshots[1] === c && !isFatSnapshot(ce.geoGrid.reports[0].snapshots[0]));
ok("entry compaction is a no-op when compact", compactPerformanceEntry(ce) === ce);
ok("entry without geoGrid untouched", compactPerformanceEntry({ tracking: [] }).tracking.length === 0);
if (failed) { console.error(`${failed} geosnap check(s) failed`); process.exit(1); }
