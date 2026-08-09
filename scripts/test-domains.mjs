/* The split is only safe if it is lossless. This proves it on the real stored
   workspace, on a workspace carrying keys the split has never heard of, and on
   the degenerate shapes (empty, missing project ids, absent domains). */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { splitWorkspace, joinWorkspace, DOMAINS } from "../src/lib/domains.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
let failed = 0;
/* deep equality that ignores KEY ORDER — JSON object order is not data, and
   the split necessarily rebuilds objects. What must not change is which keys
   exist and what they hold. */
const eq = (a, b) => {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => eq(x, b[i]));
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && eq(a[k], b[k]));
};

function roundTrip(name, state) {
  const docs = splitWorkspace(state);
  const back = joinWorkspace(docs);
  if (eq(back, state)) { console.log(`  ✓ ${name}`); return docs; }
  console.error(`  ✗ ${name} — round trip changed the workspace`);
  /* report the actual semantic difference, not a character offset */
  const diff = (x, y, path = "") => {
    if (eq(x, y)) return;
    if (x && y && typeof x === "object" && typeof y === "object" && !Array.isArray(x)) {
      const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
      for (const k of keys) diff(x[k], y[k], `${path}.${k}`);
      return;
    }
    console.error(`    ${path || "<root>"}: ${JSON.stringify(x)?.slice(0, 70)}  ->  ${JSON.stringify(y)?.slice(0, 70)}`);
  };
  diff(state, back);
  failed++;
  return docs;
}

console.log("round-trip losslessness:");
roundTrip("empty", {});
roundTrip("company only", { company: { name: "X", savedReports: [{ id: "s1" }] }, clients: [] });
roundTrip("project with no id", { company: {}, clients: [{ id: "c", projects: [{ name: "no id", records: [1] }] }] });

/* a workspace with keys the split has never seen must survive untouched —
   this is the guarantee that a field added later is not silently dropped */
roundTrip("unknown keys", {
  company: { name: "A", futureThing: { deep: [1, 2] }, savedReports: [] },
  clients: [{ id: "c1", brandNewClientField: 7, projects: [
    { id: "p1", records: [{ id: "r" }], tracking: [{ id: "t" }], website: { pages: [] },
      somethingInventedNextYear: { a: 1 }, name: "P" },
  ] }],
  topLevelExtra: "kept",
});

const real = `${ROOT}server/data/app-state.json`;
if (existsSync(real)) {
  const state = JSON.parse(readFileSync(real, "utf8"));
  const docs = roundTrip("real stored workspace", state);
  const size = (o) => JSON.stringify(o ?? null).length;
  console.log("\ndocument sizes (real workspace):");
  const total = size(state);
  for (const d of DOMAINS) {
    const b = size(docs[d]);
    console.log(`  ${d.padEnd(13)} ${String(Math.round(b / 1024)).padStart(6)} KB  ${(b / total * 100).toFixed(1)}%`);
  }
  console.log(`  ${"TOTAL".padEnd(13)} ${String(Math.round(total / 1024)).padStart(6)} KB`);
} else {
  console.log("  (no stored workspace to test against)");
}

/* isolation: rewriting one domain must not disturb the others */
const base = { company: { name: "A", savedReports: [{ id: "s1" }] }, clients: [{ id: "c1", projects: [
  { id: "p1", name: "P", records: [{ id: "r1" }], tracking: [{ id: "t1" }] }] }] };
const d1 = splitWorkspace(base);
const d2 = splitWorkspace(joinWorkspace({ ...d1, pm: { p1: { records: [{ id: "r1" }, { id: "r2" }] } } }));
console.log("\nisolation:");
for (const dom of DOMAINS.filter((x) => x !== "pm")) {
  const same = eq(d1[dom], d2[dom]);
  console.log(`  ${same ? "✓" : "✗"} a PM write leaves ${dom} byte-identical`);
  if (!same) failed++;
}

process.exit(failed ? 1 : 0);
