/* =====================================================================
   STATIC IMPORT CHECK

   Vite does not fail a build when a file calls a helper it never imported —
   the bundle is produced happily and the app dies at the moment the user
   clicks the thing. That has now shipped twice: `askInput` (Save as template
   did nothing) and `dfsCost` (the scan summary would have crashed the whole
   Rank Tracking view on completion).

   So: for every shared helper exported from src/lib and src/ui, check that a
   file which USES the name actually imports or defines it. Heuristic by
   design — it only looks at names the project itself exports, so an unknown
   global cannot produce noise.
   ===================================================================== */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/* fileURLToPath, not .pathname — the repo path contains spaces */
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.jsx?$/.test(p)) out.push(p);
  }
  return out;
};

const files = walk(SRC);

/* React hooks are the other half of this: `useCallback` used without being
   imported builds perfectly and throws the moment the component renders. They
   are not project exports, so they have to be listed explicitly. */
const REACT_HOOKS = ["useState", "useEffect", "useMemo", "useRef", "useCallback",
  "useContext", "useReducer", "useLayoutEffect", "useImperativeHandle", "useTransition",
  "useDeferredValue", "useId", "useSyncExternalStore"];

/* every name exported from a shared module — these are the ones worth checking */
const shared = new Set(REACT_HOOKS);
for (const f of files) {
  if (!/\/(lib|ui|data)\//.test(f)) continue;
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) shared.add(m[1]);
}

const problems = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  /* names this file has available: imported, or declared anywhere in it */
  const have = new Set();
  for (const m of code.matchAll(/import\s+([\s\S]*?)\s+from\s+["'][^"']+["']/g)) {
    for (const n of m[1].replace(/[{}]/g, " ").split(",")) {
      const name = n.trim().split(/\s+as\s+/).pop().trim();
      if (name) have.add(name.replace(/^\*\s*/, ""));
    }
  }
  for (const m of code.matchAll(/(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) have.add(m[1]);
  /* destructured locals: const { a, b } = ... and function params */
  for (const m of code.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g))
    for (const n of m[1].split(",")) { const name = n.trim().split(":").pop().trim().split("=")[0].trim(); if (name) have.add(name); }

  /* used as a call `name(` or as a JSX tag `<Name`. A call preceded by a dot is
     a METHOD — `React.useMemo(...)` needs no import of `useMemo`, and counting
     it would bury the real findings in noise. */
  const used = new Set();
  for (const m of code.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) used.add(m[2]);
  for (const m of code.matchAll(/<([A-Z][\w$]*)[\s/>]/g)) used.add(m[1]);

  for (const name of used)
    if (shared.has(name) && !have.has(name)) problems.push(`${relative(ROOT, f)}: uses "${name}" but never imports it`);
}

if (problems.length) {
  console.error("\n✗ Static import check failed:\n" + problems.map((p) => "  " + p).join("\n") + "\n");
  process.exit(1);
}
console.log(`✓ Static import check passed (${files.length} files, ${shared.size} shared exports)`);
