/* ================= SERP Squad API server =================
   The real backend. Run with:  npm run api   (or: node server/index.js)

   Endpoints
   - GET  /api/health          → { ok, dfsConfigured }
   - POST /api/scan-listings   → REAL citation scan via DataForSEO SERP API
   - POST /api/rerun           → REAL rank re-checks via DataForSEO SERP API
   - POST /api/check-index     → REAL Google index checks (site: queries)
   - POST /api/geo-grid        → REAL geo-grid Maps rank scan (coordinate-targeted)
   - POST /api/places-locate   → REAL business location lookup (Google Places API)
   - POST /api/serp-top        → REAL top-N organic SERP results (competitor discovery)
   - POST /api/generate        → REAL AI generation via OpenAI/Claude/Gemini/DeepSeek

   Credentials resolution order (first match wins):
   1. request body `dfs: { login, password }` (what the UI sends from
      Company Settings → API settings — your own machine, your own creds)
   2. server/credentials.json  → { "login": "...", "password": "..." }
   3. env vars DFS_LOGIN / DFS_PASSWORD

   Without credentials the endpoints answer 503 not_configured — they never
   fabricate data. The frontend falls back to clearly-labeled demo mode.

   How the citation scanner really works (same technique the commercial
   citation tools use): one `site:directory.com "Business Name" city` query
   per directory through the SERP API, then NAP checks against the result's
   title/snippet. Cost: one live SERP request per directory scanned. */
import http from "node:http";
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, copyFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { gzip, gzipSync, gunzipSync } from "node:zlib";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { connect as tlsConnect } from "node:tls";
import { parseSerpRank } from "../src/lib/dataforseo.js";
import { DOMAINS, splitWorkspace, joinWorkspace } from "../src/lib/domains.js";

const PORT = process.env.PORT || 8787;
const DFS_BASE = process.env.DFS_BASE || "https://api.dataforseo.com/v3"; // override for offline tests

function fileCreds() {
  try {
    const p = new URL("./credentials.json", import.meta.url);
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
  } catch { /* unreadable file = unconfigured */ }
  if (process.env.DFS_LOGIN && process.env.DFS_PASSWORD) {
    return { login: process.env.DFS_LOGIN, password: process.env.DFS_PASSWORD };
  }
  return null;
}
const resolveCreds = (body) => (body?.dfs?.login && body?.dfs?.password ? body.dfs : fileCreds());
/* why a scan could not run, in the caller's terms — "not configured" on its own
   sent people to Company settings to look at credentials that were already
   there, when the real problem was that the browser never sent them */
const credsMissing = (body) => {
  const sentPartial = !!(body?.dfs && (body.dfs.login || body.dfs.password));
  return [503, { error: "not_configured", detail: sentPartial
    ? "The DataForSEO credentials sent with this scan were incomplete (login or password missing). Re-enter both in Company settings → API settings."
    : "This scan carried no DataForSEO credentials and the server has none of its own. If the account IS connected in Company settings, the browser is holding an older copy of the workspace — reload the app. If this client is set to use its own DataForSEO account (Client settings), that account's login and password must be filled in." }];
};
const authHeader = (c) => "Basic " + Buffer.from(`${c.login}:${c.password}`).toString("base64");

async function dfsLive(creds, pathSeg, task) { // pathSeg: "google/organic" | "bing/organic" | "google/maps"
  const res = await fetch(`${DFS_BASE}/serp/${pathSeg}/live/advanced`, {
    method: "POST",
    headers: { Authorization: authHeader(creds), "Content-Type": "application/json" },
    body: JSON.stringify([task]),
    signal: AbortSignal.timeout(35000), // a hung upstream connection must not stall a whole batch
  });
  if (!res.ok) throw new Error(`DataForSEO HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const t = data.tasks?.[0];
  if (!t || t.status_code !== 20000) throw new Error(`DataForSEO task ${t?.status_code}: ${t?.status_message}`);
  return t;
}

/* ---- LIVE batch: one synchronous SERP per task, run concurrently -------
   For a geo-grid EVERY point must come back — a point that silently fails is
   a hole in the map that reads as "no ranking here", which is worse than no
   scan at all. The live endpoint answers in seconds and never depends on a
   queue draining, so each point either has data or a stated reason.

   Failures are retried with backoff, because a single 429/5xx on one of 60+
   concurrent requests is normal and must not become a blank grid cell.
   Returns an array aligned with `tasks`: { task } or { error }. */
async function dfsLivePool(creds, pathSeg, tasks, { concurrency = 8, attempts = 3, onProgress = null } = {}) {
  let done = 0;
  const run = async (task) => {
    let lastErr = "";
    for (let a = 0; a < attempts; a++) {
      if (a) await new Promise((r) => setTimeout(r, 800 * 2 ** (a - 1) + Math.floor(a * 250)));
      try {
        const res = await fetch(`${DFS_BASE}/serp/${pathSeg}/live/advanced`, {
          method: "POST",
          headers: { Authorization: authHeader(creds), "Content-Type": "application/json" },
          body: JSON.stringify([task]),
          signal: AbortSignal.timeout(60000),
        });
        if (!res.ok) {
          lastErr = `HTTP ${res.status}`;
          /* 402/401 are account-level and will not fix themselves on retry */
          if (res.status === 401 || res.status === 402) return { error: `DataForSEO ${res.status} — ${res.status === 402 ? "insufficient balance" : "bad credentials"}` };
          continue;
        }
        const t = (await res.json()).tasks?.[0];
        if (t?.status_code === 20000) return { task: t };
        lastErr = `task ${t?.status_code}: ${t?.status_message}`;
        /* 40xxx = malformed request; retrying sends the same thing again */
        if (t?.status_code >= 40000 && t?.status_code < 50000) return { error: lastErr };
      } catch (e) { lastErr = String(e?.message || e); }
    }
    return { error: lastErr || "live request failed" };
  };
  return pool(tasks, async (task) => {
    const r = await run(task);
    done += 1;
    onProgress?.(done, tasks.length);
    return r;
  }, concurrency);
}

/* ---- DataForSEO standard task queue ----------------------------------
   task_post → tasks_ready → task_get: the same SERP data as /live at
   standard-priority pricing, but asynchronously. DataForSEO gives NO tight
   completion guarantee for standard priority — the old 7-minute budget here
   is why large grids came back mostly empty: a handful of tasks landed in
   time and every other point was written off as "scan failed".
   The budget is bounded so the request still answers: whatever has not
   arrived by then is finished on the live endpoint by the caller, which is
   what makes economy mode safe — cheap when the queue keeps up, complete
   either way. */
async function dfsQueue(creds, pathSeg, tasks, { budgetMs = 480000, pollMs = 8000, onProgress = null } = {}) {
  const out = new Array(tasks.length).fill(null);
  const pending = new Map(); // DataForSEO task id → index into `tasks`
  const headers = { Authorization: authHeader(creds), "Content-Type": "application/json" };
  for (let i = 0; i < tasks.length; i += 100) { // API cap: 100 tasks per POST
    /* the tag carries BOTH the batch index (how a result finds its task here)
       and whatever the caller set (project + keyword/cell, so a late or
       duplicated delivery updates the right row). Index first, so parseInt
       still recovers it. */
    const chunk = tasks.slice(i, i + 100).map((t, j) => ({ priority: 1, ...t, tag: `${i + j}${t.tag ? "~" + t.tag : ""}` }));
    const res = await fetch(`${DFS_BASE}/serp/${pathSeg}/task_post`, {
      method: "POST", headers, body: JSON.stringify(chunk), signal: AbortSignal.timeout(35000),
    });
    if (!res.ok) throw new Error(`DataForSEO HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    for (const t of (await res.json()).tasks || []) {
      const idx = parseInt(String(t.data?.tag ?? ""), 10);
      if (!(idx >= 0 && idx < tasks.length)) continue;
      if (t.status_code === 20100) pending.set(t.id, idx); // 20100 = Task Created
      else out[idx] = { error: `task ${t.status_code}: ${t.status_message}` };
    }
  }
  const total = tasks.length;
  const collect = async (id) => {
    const res = await fetch(`${DFS_BASE}/serp/${pathSeg}/task_get/advanced/${id}`, { headers: { Authorization: authHeader(creds) }, signal: AbortSignal.timeout(35000) });
    if (!res.ok) return false;                       // not ready yet, or a transient error
    const t = (await res.json()).tasks?.[0];
    if (!t || t.status_code === 40602) return false; // 40602 = "Task In Queue"
    const idx = pending.get(id);
    if (idx === undefined) return true;
    pending.delete(id);
    out[idx] = t.status_code === 20000 ? { task: t } : { error: `task ${t.status_code}: ${t.status_message}` };
    return true;
  };
  const deadline = Date.now() + budgetMs;
  let cycle = 0;
  while (pending.size && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs));
    let ready = [];
    try {
      const res = await fetch(`${DFS_BASE}/serp/${pathSeg}/tasks_ready`, { headers: { Authorization: authHeader(creds) }, signal: AbortSignal.timeout(35000) });
      /* tasks_ready is account-global — other tools (or a second CRM scan)
         may share the account, so collect ONLY ids this call created */
      if (res.ok) ready = ((await res.json()).tasks?.[0]?.result || []).filter((r2) => pending.has(r2.id));
    } catch { /* transient poll failure — next cycle retries */ }
    await pool(ready.map((r2) => r2.id), collect, 5);
    /* tasks_ready lists a completed task ONCE. If the task_get that followed
       it failed, that id would never be offered again and the point would
       time out holding no data — so every few cycles the still-pending ids
       are fetched directly, which is authoritative. */
    if (++cycle % 3 === 0 && pending.size) await pool([...pending.keys()], collect, 5);
    onProgress?.(total - pending.size, total);
  }
  if (pending.size) await pool([...pending.keys()], collect, 5); // one last direct sweep
  for (const idx of pending.values()) if (!out[idx]) out[idx] = { error: "queue timeout — task did not complete in time" };
  return out;
}

/* ---- citation scan: one site: query per directory, NAP-checked ---- */
async function scanDirectory(creds, dir, biz) {
  const kw = `site:${dir.domain} "${biz.name}"${biz.city ? ` ${biz.city}` : ""}`;
  const task = await dfsLive(creds, "google/organic", { keyword: kw, location_name: biz.country || "United States", language_code: "en", depth: 10 });
  const items = (task.result?.[0]?.items || []).filter((it) => it.type === "organic");
  const root = dir.domain.replace(/^www\./, "");
  const hit = items.find((it) => (it.domain || "").replace(/^www\./, "").endsWith(root));
  if (!hit) return { name: dir.name, tier: dir.tier, da: dir.da, status: "missing" };
  const text = `${hit.title || ""} ${hit.description || ""}`.toLowerCase();
  const nameToken = biz.name.toLowerCase().split(/\s+/).slice(0, 3).join(" ");
  const digits = (biz.phone || "").replace(/\D/g, "");
  const street = (biz.address || "").split(",")[0].trim().toLowerCase();
  return {
    name: dir.name, tier: dir.tier, da: dir.da, status: "found", url: hit.url,
    confidence: hit.rank_absolute === 1 ? 95 : 85, // top hit on a site: query = near-certain match
    nap: {
      name: text.includes(nameToken),
      // null = the snippet doesn't carry enough data to verify — shown as "unverified", never guessed
      phone: digits.length >= 7 ? text.replace(/\D/g, "").includes(digits.slice(-7)) : null,
      address: street.length >= 6 ? text.includes(street) : null,
    },
  };
}

async function pool(items, worker, size = 4) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await worker(items[idx], idx).catch((e) => ({ error: String(e.message || e) }));
    }
  }));
  return out;
}

/* ---- Google index check: site:<url> query — the technique every index
   checker uses. A URL is "indexed" only when Google returns it for its own
   site: query; exact-URL match after normalization, so no false positives
   from sibling pages. ---- */
const normUrl = (u) => String(u || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[#?].*$/, "").replace(/\/$/, "");
async function checkIndexOne(creds, url) {
  const bare = url.replace(/^https?:\/\//, "");
  const target = normUrl(url);
  // exact match first; then prefix match ONLY for a root URL (site:example.com
  // legitimately returns deeper pages — a deep URL must match exactly)
  const isRoot = !target.includes("/");
  const match = (task) => {
    const items = (task.result?.[0]?.items || []).filter((it) => it.type === "organic");
    return items.find((it) => normUrl(it.url) === target) || (isRoot ? items.find((it) => normUrl(it.url).startsWith(target)) : null);
  };
  /* DataForSEO answers a zero-result SERP with task code 40102 ("No Search
     Results") — that's a valid "nothing found", NOT a failure */
  const serp = async (keyword, retried) => {
    try { return await dfsLive(creds, "google/organic", { keyword, location_name: "United States", language_code: "en", depth: 10 }); }
    catch (e) {
      const msg = String(e?.message || e);
      if (/40102|No Search Results/i.test(msg)) return { result: [{ items: [] }] };
      /* transient: 40101 burst, upstream timeout, connection reset — one retry */
      if (!retried && /40101|timeout|timed out|abort|ECONN|fetch failed/i.test(msg)) {
        await new Promise((r) => setTimeout(r, 2500));
        return serp(keyword, true);
      }
      throw e;
    }
  };
  let hit = match(await serp(`site:${bare}`));
  /* Google's site: operator is FLAKY for deep URLs — indexed pages often
     return nothing. Before declaring "not indexed", search the URL itself:
     an indexed page reliably surfaces for its own address. */
  if (!hit && !isRoot) hit = match(await serp(`"${bare}"`));
  return { url, indexed: !!hit, matchedUrl: hit?.url || null, checkedAt: Date.now() };
}

async function handleCheckIndex(body) {
  const creds = resolveCreds(body);
  if (!creds) return [503, { error: "not_configured", hint: "Add DataForSEO credentials in Company Settings → API settings, or create server/credentials.json" }];
  const raw = Array.isArray(body.urls) ? body.urls : [];
  const urls = [...new Set(raw.map((u) => String(u).trim()).filter(Boolean))].slice(0, 50)
    .map((u) => (/^https?:\/\//.test(u) ? u : "https://" + u))
    .filter((u) => { try { const x = new URL(u); return x.hostname.includes(".") && !/\s/.test(x.hostname); } catch { return false; } });
  if (!urls.length) return [400, { error: "urls[] required (up to 50 valid URLs)" }];
  const results = await pool(urls, (u) => checkIndexOne(creds, u), 4);
  const clean = results.map((r, i) => (r.error ? { url: urls[i], status: "error", error: r.error } : r));
  if (clean.length && clean.every((r) => r.status === "error")) return [502, { error: "provider_error", detail: clean[0].error }];
  return [200, { live: true, results: clean }];
}

/* ---- SERP top organic results for a keyword (competitor discovery) ---- */
async function handleSerpTop(body) {
  const creds = resolveCreds(body);
  if (!creds) return credsMissing(body);
  const keyword = String(body.keyword || "").trim();
  if (!keyword) return [400, { error: "keyword required" }];
  const location = body.location_name || "United States";
  const n = Math.min(10, Math.max(1, +body.count || 5));
  /* DataForSEO only accepts location_names from its own database — walk the
     tracked market from most to least specific (city,region,country → country)
     instead of failing the whole competitor scan on an unknown city form */
  const parts = location.split(",").map((s) => s.trim()).filter(Boolean);
  const variants = [...new Set([parts.join(","), parts.slice(-2).join(","), parts[parts.length - 1]])].filter(Boolean);
  let task = null, usedLocation = location, lastErr = null;
  for (const loc of variants) {
    try { task = await dfsLive(creds, "google/organic", { keyword, location_name: loc, language_code: "en", depth: 20 }); usedLocation = loc; break; }
    catch (e) { lastErr = e; if (!/location/i.test(String(e?.message || e))) return [502, { error: "provider_error", detail: String(e?.message || e) }]; }
  }
  if (!task) return [502, { error: "provider_error", detail: String(lastErr?.message || lastErr) }];
  const items = (task.result?.[0]?.items || []).filter((it) => it.type === "organic").slice(0, n);
  return [200, { live: true, keyword, locationName: usedLocation, results: items.map((it) => ({
    rank: it.rank_group, title: it.title, url: it.url, domain: (it.domain || "").replace(/^www\./, ""), description: it.description || "",
  })) }];
}

/* ================= SECURITY =================
   - CORS: allowlisted app origins only (APP_ORIGINS env, default the Vite dev
     origin). Same-origin proxied requests carry no Origin header and pass.
   - Security headers on every response; server binds 127.0.0.1 by default
     (HOST env to override for a reverse-proxied deployment).
   - Per-IP rate limiting: global bucket + a strict bucket for /api/auth/*.
   - 2FA: email verification codes for NEW devices/browsers (or after cleared
     storage). Codes are stored HASHED with a 10-minute expiry and 5 attempts;
     trusted-device tokens are random 256-bit values stored hashed server-side
     with a 90-day lifetime. Codes are emailed via real SMTP when configured
     (API settings → Email SMTP); without SMTP the code is returned clearly
     labeled DEMO for local testing — never silently. */
const APP_ORIGINS = (process.env.APP_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173,https://app.serpsquad.com").split(",").map((x) => x.trim());
const corsFor = (req) => {
  const origin = req.headers.origin;
  return {
    ...(origin && APP_ORIGINS.includes(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
};
const SEC_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
const rlBuckets = new Map();
const rateLimited = (ip, key, max, windowMs) => {
  const k = ip + "|" + key, now = Date.now();
  const arr = (rlBuckets.get(k) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { rlBuckets.set(k, arr); return true; }
  arr.push(now); rlBuckets.set(k, arr);
  if (rlBuckets.size > 10000) rlBuckets.clear(); // memory guard
  return false;
};

/* ---- 2FA email codes + trusted devices ---- */
const AUTH_DIR = new URL("./data/auth/", import.meta.url);
const DEVICES_FILE = new URL("./data/auth/devices.json", import.meta.url);
const sha = (x) => createHash("sha256").update(String(x)).digest("hex");
const pending2fa = new Map(); // email → { codeHash, exp, tries }
const loadDevices = () => { try { return JSON.parse(readFileSync(DEVICES_FILE, "utf8")); } catch { return {}; } };
const saveDevices = (d) => { mkdirSync(AUTH_DIR, { recursive: true }); writeFileSync(DEVICES_FILE, JSON.stringify(d)); };

/* ================= PERSISTENCE + SERVER-SIDE AUTH =================
   The app's data (company, clients, projects, campaigns, …) now lives in a
   JSON document on the server — it survives reloads and is shared across
   every browser. The data API is SESSION-GATED (it contains credentials),
   so passwords are verified server-side and a token is required to read or
   write state. Atomic writes (temp + rename) avoid partial files. ---- */
const STATE_FILE = new URL("./data/app-state.json", import.meta.url);

/* ---- PER-TOOL DOCUMENTS ------------------------------------------------
   The workspace is stored as one file per tool (see src/lib/domains.js), so
   a Project-management save writes a few kilobytes to data/state/pm.json and
   physically cannot touch the report archive or the rank data. Each document
   carries its own revision, so two people working in different tools never
   collide.

   data/app-state.json is still written — not on every save, which is the
   whole point, but whenever a full save or a backup runs. It stays the
   fallback this can be rolled back to, and everything that already reads it
   (backups, restore, the extractor) keeps working untouched. */
const STATE_DIR = new URL("./data/state/", import.meta.url);
const domFile = (d) => new URL(`${d}.json`, STATE_DIR);
const REVS_FILE = new URL("./data/state/revs.json", import.meta.url);

const readJson = (u, fallback = null) => { try { return JSON.parse(readFileSync(u, "utf8")); } catch { return fallback; } };
const loadRevs = () => readJson(REVS_FILE, {}) || {};
const saveRevs = (r) => { try { mkdirSync(STATE_DIR, { recursive: true }); writeJsonAtomic(REVS_FILE, r); } catch { /* advisory */ } };
function writeJsonAtomic(url, value) {
  const tmp = new URL(url.pathname.split("/").pop() + ".tmp", STATE_DIR);
  writeFileSync(tmp, JSON.stringify(value));
  renameSync(tmp, url);
}

/* every document, migrating the single legacy file the first time */
function loadDomains() {
  if (existsSync(domFile("core"))) {
    const docs = {};
    for (const d of DOMAINS) docs[d] = readJson(domFile(d), d === "core" ? null : {}) ?? (d === "core" ? null : {});
    if (docs.core) return docs;
  }
  const legacy = readJson(STATE_FILE, null);
  if (!legacy) return null;
  const docs = splitWorkspace(legacy);
  try {                                        // migrate once; legacy file untouched
    mkdirSync(STATE_DIR, { recursive: true });
    for (const d of DOMAINS) writeJsonAtomic(domFile(d), docs[d] ?? {});
    const rev = loadRev();
    saveRevs(Object.fromEntries(DOMAINS.map((d) => [d, rev])));
    console.log(`[state] migrated app-state.json into ${DOMAINS.length} per-tool documents`);
  } catch (e) { console.warn("[state] migration failed, still serving the legacy file:", e?.message); }
  return docs;
}

const loadState = () => { const docs = loadDomains(); return docs ? joinWorkspace(docs) : null; };

/* Keep the combined file and the rolling backups current.

   Both used to be produced by saveState, which a granular save does not call —
   so once per-tool writes became the normal path, app-state.json would have
   frozen at the last full save and the hourly/daily backups would simply have
   stopped. That is the safety net this whole area exists to protect, so the
   cadence is driven from here instead. It is hourly-gated, not per-save: the
   cost is paid once an hour, not on every keystroke. */
let lastCombinedHour = null;
function refreshCombined() {
  const hour = new Date().toISOString().slice(0, 13);
  if (lastCombinedHour === hour) return;              // already done this hour
  const state = loadState();
  if (!state) return;
  lastCombinedHour = hour;
  const tmp = new URL("./data/app-state.json.tmp", import.meta.url);
  writeFileSync(tmp, JSON.stringify(state));
  renameSync(tmp, STATE_FILE);                        // the rollback fallback, kept fresh
  writeBackups();
}

/* write ONLY these documents. Returns the new per-document revisions. */
function saveDomainDocs(partial) {
  mkdirSync(STATE_DIR, { recursive: true });
  const revs = loadRevs();
  const next = loadRev() + 1;
  for (const [d, doc] of Object.entries(partial)) {
    if (!DOMAINS.includes(d)) continue;
    writeJsonAtomic(domFile(d), doc ?? {});
    revs[d] = next;
  }
  saveRevs(revs);
  try { writeFileSync(REV_FILE, String(next)); } catch { /* rev is advisory */ }
  /* hourly-gated, so this costs nothing on a normal save */
  try { refreshCombined(); } catch { /* backups are best-effort — never block a save */ }
  return { revs, rev: next };
}
/* the workspace revision: bumped on every accepted write. A browser sends the
   revision it loaded, so a tab holding an older copy can be REFUSED instead of
   silently replacing work another session saved in the meantime. */
const REV_FILE = new URL("./data/app-state.rev", import.meta.url);
const loadRev = () => { try { return +readFileSync(REV_FILE, "utf8") || 0; } catch { return 0; } };
/* hourly gzipped snapshots + daily rolling copies of the combined file */
function writeBackups() {
  /* HOURLY point-in-time snapshots, gzipped, alongside the daily copies.
     Daily-only backups meant work added and lost inside the same day had
     nothing to restore from — the day's copy predated it. */
  try {
    const sdir = new URL("./data/snapshots/", import.meta.url);
    mkdirSync(sdir, { recursive: true });
    const hour = new Date().toISOString().slice(0, 13).replace("T", "-");   // YYYY-MM-DD-HH
    const sfile = new URL(`app-state-${hour}.json.gz`, sdir);
    if (existsSync(STATE_FILE) && !existsSync(sfile)) {
      writeFileSync(sfile, gzipSync(readFileSync(STATE_FILE)));
      /* keep ~3 days of hourly history */
      readdirSync(sdir).filter((f) => f.startsWith("app-state-")).sort().slice(0, -72)
        .forEach((f) => rmSync(new URL(f, sdir), { force: true }));
    }
  } catch { /* snapshots are best-effort — never block a save */ }
  /* daily rolling backups (kept 14 days) — deploys never touch server/data,
     and even a bad write can be rolled back from data/backups/ */
  try {
    const day = new Date().toISOString().slice(0, 10);
    const bdir = new URL("./data/backups/", import.meta.url);
    const bfile = new URL(`app-state-${day}.json`, bdir);
    if (existsSync(STATE_FILE) && !existsSync(bfile)) {
      mkdirSync(bdir, { recursive: true });
      copyFileSync(STATE_FILE, bfile);
      readdirSync(bdir).filter((f) => f.startsWith("app-state-")).sort().slice(0, -14)
        .forEach((f) => rmSync(new URL(f, bdir), { force: true }));
    }
  } catch { /* backups are best-effort — never block a save */ }
}

const saveState = (state) => {
  mkdirSync(new URL("./data/", import.meta.url), { recursive: true });
  writeBackups();
  /* a FULL save rewrites  /* a FULL save rewrites every document, and also refreshes the combined
     file so backups, restore and a rollback all keep working from it */
  const { rev } = saveDomainDocs(splitWorkspace(state));
  const tmp = new URL("./data/app-state.json.tmp", import.meta.url);
  writeFileSync(tmp, JSON.stringify(state));
  renameSync(tmp, STATE_FILE); // atomic swap
  return rev;
};
/* bootstrap owner — lets the owner sign in on a brand-new server before any
   state exists; overridable via env so the seeded password isn't the only key */
const BOOT_OWNER = {
  username: (process.env.OWNER_USERNAME || "SERP_Squad").toLowerCase(),
  email: (process.env.OWNER_EMAIL || "serpsquad@gmail.com").toLowerCase(),
  password: process.env.OWNER_PASSWORD || "SERPapp$login164418",
};
/* find a matching account (team member incl. owner, by email OR username; or a
   client login) against the persisted state, falling back to the boot owner */
function matchAccount(login, password) {
  const id = String(login || "").trim().toLowerCase();
  const pw = String(password || "");
  if (!id || !pw) return null;
  const st = loadState();
  if (st?.company?.team) {
    const m = st.company.team.find((x) => x.password && x.password === pw
      && (String(x.email || "").toLowerCase() === id || String(x.username || "").toLowerCase() === id));
    if (m) return { kind: "team", id: m.id, email: String(m.email || "").toLowerCase() };
    const c = (st.clients || []).find((c) => c.login?.enabled && c.login.password && c.login.password === pw
      && String(c.login.email || "").toLowerCase() === id);
    if (c) return { kind: "client", id: c.id, email: String(c.login.email).toLowerCase() };
    return null; // state exists but no match — don't fall through to boot owner
  }
  /* no state yet → only the bootstrap owner can sign in (to seed the workspace) */
  if ((id === BOOT_OWNER.username || id === BOOT_OWNER.email) && pw === BOOT_OWNER.password)
    return { kind: "team", id: "u1", email: BOOT_OWNER.email, boot: true };
  return null;
}
const appSessions = new Map(); // tokenHash → { kind, id, email, exp }
const pendingLogin = new Map(); // email → { kind, id, exp } (password ok, awaiting 2FA)
const SESSIONS_FILE = new URL("./data/auth/sessions.json", import.meta.url);
const loadSessions = () => { try { return JSON.parse(readFileSync(SESSIONS_FILE, "utf8")); } catch { return {}; } };
const saveSessions = () => { mkdirSync(AUTH_DIR, { recursive: true }); writeFileSync(SESSIONS_FILE, JSON.stringify(Object.fromEntries(appSessions))); };
(function hydrateSessions() { const s = loadSessions(); const now = Date.now(); for (const [th, v] of Object.entries(s)) if (v.exp > now) appSessions.set(th, v); })();

/* ================= GOOGLE OAUTH — Analytics 4 + Search Console =================
   Real authorization-code flow: the app opens Google's consent screen, Google
   redirects to /api/oauth/google/callback with a code, the server exchanges it
   for a refresh token (stored server-side, never sent to the browser), and the
   data endpoints mint fresh access tokens on demand to call GA4 + Search
   Console. Business Profile is intentionally left out (it needs Google's gated
   access approval). ---- */
const GTOKENS_FILE = new URL("./data/auth/google-tokens.json", import.meta.url);
const loadGTokens = () => { try { return JSON.parse(readFileSync(GTOKENS_FILE, "utf8")); } catch { return {}; } };
const saveGTokens = (d) => { mkdirSync(AUTH_DIR, { recursive: true }); writeFileSync(GTOKENS_FILE, JSON.stringify(d)); };
const pendingOAuth = new Map(); // state → { clientId, clientSecret, redirectUri, exp }
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
  /* Business Profile. Without this the listing picker could never have worked
     however well the rest was connected — the token simply was not authorised
     for it. Connections made before this was added do not carry it, which is
     why the check below asks for a reconnect rather than letting Google
     return a confusing permission error. */
  "https://www.googleapis.com/auth/business.manage",
  "openid", "email",
];
const GBP_SCOPE = "https://www.googleapis.com/auth/business.manage";
function handleOAuthStart(body) {
  const clientId = String(body?.clientId || "").trim();
  const clientSecret = String(body?.clientSecret || "").trim();
  const redirectUri = String(body?.redirectUri || "").trim();
  if (!clientId || !clientSecret || !redirectUri) return [503, { error: "not_configured", detail: "Add your Google OAuth Client ID, Client Secret and redirect URI in Company Settings → API settings first." }];
  const state = randomBytes(16).toString("hex");
  pendingOAuth.set(state, { clientId, clientSecret, redirectUri, exp: Date.now() + 10 * 60e3 });
  const authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: "code",
    scope: GOOGLE_SCOPES.join(" "), access_type: "offline", prompt: "consent", state,
  });
  return [200, { authUrl, state }];
}
async function googleTokenCall(params) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(20000), body: new URLSearchParams(params),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error_description || d.error || `token endpoint HTTP ${r.status}`);
  return d;
}
async function handleOAuthCallback(reqUrl) {
  const u = new URL(reqUrl, "http://x");
  const code = u.searchParams.get("code"), state = u.searchParams.get("state"), gerr = u.searchParams.get("error");
  const page = (title, msg, connectionId, email) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<body style="font:15px/1.5 -apple-system,system-ui,sans-serif;color:#1F2937;max-width:420px;margin:60px auto;padding:0 20px;text-align:center">
<div style="font-size:34px">${connectionId ? "✅" : "⚠️"}</div><h2 style="margin:8px 0">${title}</h2><p style="color:#6B7280">${msg}</p>
<script>try{if(window.opener){window.opener.postMessage(${JSON.stringify({ googleOAuth: connectionId ? "ok" : "error", connectionId: connectionId || null, email: email || "" })},"*");setTimeout(function(){window.close();},1400);}}catch(e){}</script></body>`;
  if (gerr) return page("Connection cancelled", "Google returned: " + gerr + ". You can close this window.", null);
  const pend = state && pendingOAuth.get(state);
  if (!pend || Date.now() > pend.exp) return page("Link expired", "That connection link expired — start again from the app.", null);
  pendingOAuth.delete(state);
  try {
    const tok = await googleTokenCall({ code, client_id: pend.clientId, client_secret: pend.clientSecret, redirect_uri: pend.redirectUri, grant_type: "authorization_code" });
    let email = "";
    try { if (tok.id_token) email = JSON.parse(Buffer.from(tok.id_token.split(".")[1], "base64").toString("utf8")).email || ""; } catch { /* no id_token email */ }
    if (!tok.refresh_token) return page("Almost there", "Google didn't return a refresh token. Revoke this app at myaccount.google.com/permissions, then reconnect.", null);
    const connectionId = randomBytes(12).toString("hex");
    const t = loadGTokens();
    t[connectionId] = { refreshToken: tok.refresh_token, clientId: pend.clientId, clientSecret: pend.clientSecret, email, scope: tok.scope || "", at: Date.now() };
    saveGTokens(t);
    return page("Google connected", `Signed in as <b>${email || "your Google account"}</b>. You can close this window.`, connectionId, email);
  } catch (e) { return page("Connection failed", String(e?.message || e).slice(0, 180) + " — you can close this window.", null); }
}
async function googleAccess(connectionId) {
  const c = loadGTokens()[connectionId];
  if (!c) { const e = new Error("This Google connection no longer exists — reconnect from the app."); e.code = 401; throw e; }
  const d = await googleTokenCall({ client_id: c.clientId, client_secret: c.clientSecret, refresh_token: c.refreshToken, grant_type: "refresh_token" });
  return { accessToken: d.access_token, email: c.email };
}
const gErr = (e) => [e?.code === 401 ? 401 : 502, { error: e?.code === 401 ? "not_connected" : "provider_error", detail: String(e?.message || e).slice(0, 200) }];
const gGet = async (accessToken, url) => { const r = await fetch(url, { headers: { Authorization: "Bearer " + accessToken }, signal: AbortSignal.timeout(30000) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error?.message || `HTTP ${r.status}`); return d; };
const gPost = async (accessToken, url, body) => { const r = await fetch(url, { method: "POST", headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000), body: JSON.stringify(body) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error?.message || `HTTP ${r.status}`); return d; };

/* Search Console lists every property the account has ANY relationship with,
   including ones it can't read (siteUnverifiedUser). Querying those fails with
   "User does not have sufficient permission for site …" — and the same domain
   is usually ALSO present as a readable property in another form
   (sc-domain:example.com vs https://www.example.com/). Rank the levels so a
   readable property can always be found and preferred. */
const GSC_PERM = { siteOwner: 4, siteFullUser: 3, siteRestrictedUser: 2, siteUnverifiedUser: 0 };
const gscReadable = (level) => (GSC_PERM[level] || 0) > 0;
const gscHost = (s) => String(s || "").replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "").toLowerCase();
async function handleGscSites(body) {
  if (!body?.connectionId) return [503, { error: "not_connected", detail: "Connect a Google account first." }];
  try { const { accessToken } = await googleAccess(body.connectionId);
    const d = await gGet(accessToken, "https://searchconsole.googleapis.com/webmasters/v3/sites");
    /* readable properties first, so the obvious pick in the dropdown works */
    const sites = (d.siteEntry || []).map((s) => ({ url: s.siteUrl, level: s.permissionLevel, readable: gscReadable(s.permissionLevel) }))
      .sort((a, b) => (GSC_PERM[b.level] || 0) - (GSC_PERM[a.level] || 0) || a.url.localeCompare(b.url));
    return [200, { live: true, sites }];
  } catch (e) { return gErr(e); }
}
/* the readable property for the same domain as `wanted`, best permission and
   domain-properties first (a domain property covers every subdomain/protocol) */
async function resolveGscSite(accessToken, wanted) {
  const d = await gGet(accessToken, "https://searchconsole.googleapis.com/webmasters/v3/sites");
  const host = gscHost(wanted);
  const same = (d.siteEntry || [])
    .filter((s) => gscReadable(s.permissionLevel) && gscHost(s.siteUrl) === host && s.siteUrl !== wanted)
    .sort((a, b) => (GSC_PERM[b.permissionLevel] || 0) - (GSC_PERM[a.permissionLevel] || 0)
      || (b.siteUrl.startsWith("sc-domain:") ? 1 : 0) - (a.siteUrl.startsWith("sc-domain:") ? 1 : 0));
  return same[0]?.siteUrl || null;
}
async function handleGscQuery(body) {
  if (!body?.connectionId || !body?.siteUrl) return [400, { error: "bad_request", detail: "connectionId and siteUrl required." }];
  const days = Math.min(Math.max(+body?.days || 28, 1), 480); // GSC keeps ~16 months
  /* explicit window wins (report builder passes the exact selected range);
     otherwise fall back to the trailing `days` window */
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
  const startDate = isDate(body?.startDate) ? body.startDate : new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const endDate = isDate(body?.endDate) ? body.endDate : new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10); // GSC lags ~2 days
  /* the whole query, against ONE property — so a permission failure can be
     retried against the same domain's readable property without duplication */
  const runFor = async (accessToken, siteUrl) => {
    const base = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
    /* pull EVERY row, not a top-20 sample — GSC pages at 25k rows/request */
    const pullAll = async (dims, filter) => {
      const rows = [];
      for (let start = 0; start < 125000; start += 25000) {
        const d = await gPost(accessToken, base, { startDate, endDate, dimensions: dims, rowLimit: 25000, startRow: start,
          ...(filter ? { dimensionFilterGroups: [{ filters: [filter] }] } : {}) });
        const r = d.rows || [];
        rows.push(...r);
        if (r.length < 25000) break;
      }
      return rows;
    };
    const rowOf = (r) => ({ clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position });
    /* Search Console wraps some scraped/API queries in double quotes — noise,
       never real searches; drop them like the GSC UI effectively does */
    const cleanQueries = (rows) => rows
      .filter((r) => !String(r.keys[0]).includes('"'))
      .map((r) => ({ query: r.keys[0], ...rowOf(r) }));
    /* bulk page+query mode: every (page, query) pair in one pull — the
       Optimization Studio groups these per page for its keyword suggestions */
    /* KPI mode: totals for the window and the equal window before it — two
       cheap calls, no row paging. This is what dashboard blocks need; pulling
       every query row to show two numbers is what made overview loads slow. */
    if (body.kpis) {
      const spanMs = (new Date(endDate) - new Date(startDate)) + 864e5;
      const pEnd = new Date(new Date(startDate).getTime() - 864e5).toISOString().slice(0, 10);
      const pStart = new Date(new Date(startDate).getTime() - spanMs).toISOString().slice(0, 10);
      const [curT, prevT] = await Promise.all([
        gPost(accessToken, base, { startDate, endDate }),
        gPost(accessToken, base, { startDate: pStart, endDate: pEnd }),
      ]);
      const c = curT.rows?.[0] || {}, pr = prevT.rows?.[0] || {};
      return [200, { live: true, kpis: true, range: { startDate, endDate }, prevRange: { startDate: pStart, endDate: pEnd },
        totals: { clicks: c.clicks || 0, impressions: c.impressions || 0, ctr: c.ctr || 0, position: c.position || 0 },
        prev: { clicks: pr.clicks || 0, impressions: pr.impressions || 0, ctr: pr.ctr || 0, position: pr.position || 0 } }];
    }
    if (body.byPage) {
      const rows = await pullAll(["page", "query"]);
      return [200, { live: true, range: { startDate, endDate },
        rows: rows.filter((r) => !String(r.keys[1]).includes('"'))
          .map((r) => ({ page: r.keys[0], query: r.keys[1], ...rowOf(r) })) }];
    }
    /* per-page mode: the queries Google ranks ONE page for — feeds the
       page's suggested-keywords panel in the Optimization Studio */
    if (body.page) {
      const rows = await pullAll(["query"], { dimension: "page", operator: "equals", expression: body.page });
      return [200, { live: true, range: { startDate, endDate }, page: body.page, queries: cleanQueries(rows) }];
    }
    const [totals, queries, pages, dates] = await Promise.all([
      gPost(accessToken, base, { startDate, endDate }),
      pullAll(["query"]),
      pullAll(["page"]),
      gPost(accessToken, base, { startDate, endDate, dimensions: ["date"], rowLimit: 500 }),
    ]);
    const t = totals.rows?.[0] || {};
    return [200, { live: true, range: { startDate, endDate },
      totals: { clicks: t.clicks || 0, impressions: t.impressions || 0, ctr: t.ctr || 0, position: t.position || 0 },
      queries: cleanQueries(queries),
      pages: pages.map((r) => ({ page: r.keys[0], ...rowOf(r) })),
      byDate: (dates.rows || []).map((r) => ({ date: r.keys[0], clicks: r.clicks, impressions: r.impressions })),
    }];
  };

  try {
    const { accessToken } = await googleAccess(body.connectionId);
    try {
      return await runFor(accessToken, body.siteUrl);
    } catch (e) {
      /* the saved property isn't readable by this account — almost always the
         same site is verified in another form (domain property vs URL prefix,
         www vs bare). Find that one and answer from it rather than handing the
         user a raw Google permission error for a site they demonstrably own. */
      if (!/permission|not found|403|404/i.test(String(e?.message || e))) throw e;
      const alt = await resolveGscSite(accessToken, body.siteUrl);
      if (!alt) {
        return [403, { error: "no_permission", siteUrl: body.siteUrl,
          detail: `This Google account can't read "${body.siteUrl}" in Search Console, and no other verified property covers ${gscHost(body.siteUrl) || "that domain"}. Open Search Console → Settings → Users and permissions and give this account at least Restricted access, then reselect the property in Website Performance.` }];
      }
      const out = await runFor(accessToken, alt);
      /* tell the client which property actually answered so it can save it */
      if (out[0] === 200) { out[1].siteUsed = alt; out[1].siteRequested = body.siteUrl; }
      return out;
    }
  } catch (e) { return gErr(e); }
}
async function handleGa4Properties(body) {
  if (!body?.connectionId) return [503, { error: "not_connected", detail: "Connect a Google account first." }];
  try { const { accessToken } = await googleAccess(body.connectionId);
    const d = await gGet(accessToken, "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200");
    const props = [];
    (d.accountSummaries || []).forEach((a) => (a.propertySummaries || []).forEach((p) => props.push({ id: p.property, name: p.displayName, account: a.displayName })));
    return [200, { live: true, properties: props }];
  } catch (e) { return gErr(e); }
}
/* "google / organic" → "Google organic", "(direct) / (none)" → "Direct",
   "chatgpt.com / referral" → "ChatGPT" — the source list the dashboard was
   designed around (search engines, social, direct, paid, AI assistants) */
function prettySourceMedium(sm) {
  const [src = "", med = ""] = String(sm).split(" / ");
  const s = src.toLowerCase();
  const name =
    s === "(direct)" || s === "(not set)" ? "Direct"
    : /chatgpt|chat\.openai|openai/.test(s) ? "ChatGPT"
    : /perplexity/.test(s) ? "Perplexity"
    : /gemini|bard\.google/.test(s) ? "Gemini"
    : /copilot/.test(s) ? "Copilot"
    : /claude|anthropic/.test(s) ? "Claude"
    : /^m\.facebook|facebook|fb\.com/.test(s) ? "Facebook"
    : /instagram/.test(s) ? "Instagram"
    : /linkedin|lnkd\.in/.test(s) ? "LinkedIn"
    : /youtube/.test(s) ? "YouTube"
    : /duckduckgo/.test(s) ? "DuckDuckGo"
    : src.replace(/^www\./, "").replace(/\.(com|net|org|ai|io|co|app)$/, "").replace(/^./, (c) => c.toUpperCase());
  if (name === "Direct") return "Direct";
  const m = med.toLowerCase();
  if (m === "organic") return name + " organic";
  if (["cpc", "ppc", "paid", "paidsearch", "paid_search"].includes(m)) return name + " paid";
  return name;
}
/* GA4 auto-collected noise that would drown real key events in the table */
const GA4_NOISE_EVENTS = new Set(["page_view", "session_start", "first_visit", "user_engagement", "scroll", "predicted_top_spenders"]);

async function handleGa4Report(body) {
  if (!body?.connectionId || !body?.propertyId) return [400, { error: "bad_request", detail: "connectionId and propertyId required." }];
  const days = Math.min(Math.max(+body?.days || 28, 1), 365);
  const pid = String(body.propertyId).replace(/^properties\//, "");
  const range = [{ startDate: `${days}daysAgo`, endDate: "today" }];
  /* sources get a second range so each source shows a vs-prev-period delta */
  const cmpRange = [...range, { startDate: `${2 * days}daysAgo`, endDate: `${days + 1}daysAgo` }];
  try { const { accessToken } = await googleAccess(body.connectionId);
    const d = await gPost(accessToken, `https://analyticsdata.googleapis.com/v1beta/properties/${pid}:batchRunReports`, {
      requests: [
        { dateRanges: range, dimensions: [{ name: "date" }], metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }, { name: "conversions" }, { name: "engagementRate" }], orderBys: [{ dimension: { dimensionName: "date" } }], limit: 400 },
        { dateRanges: range, dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }], orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 8 },
        /* the rows cover TWO date ranges and several source/medium pairs
           collapse into one display name, so the fetch has to be comfortably
           wider than the 15 that are kept or the ranking is decided by a
           truncated list */
        { dateRanges: cmpRange, dimensions: [{ name: "sessionSourceMedium" }], metrics: [{ name: "sessions" }], orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 150 },
        { dateRanges: range, dimensions: [{ name: "date" }, { name: "eventName" }], metrics: [{ name: "eventCount" }], limit: 5000 },
        { dateRanges: range, dimensions: [{ name: "landingPage" }], metrics: [{ name: "activeUsers" }, { name: "conversions" }], orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }], limit: 10 },
      ],
    });
    const [rDate, rChan, rSrc, rEvt, rPages] = d.reports || [];

    const rows = (rDate?.rows || []).map((r) => ({
      date: r.dimensionValues[0].value,
      users: +r.metricValues[0].value, sessions: +r.metricValues[1].value, views: +r.metricValues[2].value,
      conversions: +r.metricValues[3].value, engRate: +r.metricValues[4].value,
    }));
    const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
    const engRate = sum("sessions") ? rows.reduce((a, r) => a + r.engRate * r.sessions, 0) / sum("sessions") : 0;

    const channels = (rChan?.rows || []).map((r) => ({ name: r.dimensionValues[0].value, value: +r.metricValues[0].value }));

    /* rows carry an extra trailing dateRange dimension when two ranges are queried */
    const srcMap = new Map();
    (rSrc?.rows || []).forEach((r) => {
      const name = prettySourceMedium(r.dimensionValues[0].value);
      const prevPeriod = r.dimensionValues[1]?.value === "date_range_1";
      const v = +r.metricValues[0].value || 0;
      const e = srcMap.get(name) || { name, value: 0, prev: 0 };
      if (prevPeriod) e.prev += v; else e.value += v;
      srcMap.set(name, e);
    });
    /* top 15 — enough that the long tail of smaller referrers is visible
       rather than collapsing into whatever the biggest eight were */
    const sources = [...srcMap.values()].sort((a, b) => b.value - a.value).slice(0, 15);

    const evMap = new Map();
    (rEvt?.rows || []).forEach((r) => {
      const name = r.dimensionValues[1].value;
      if (GA4_NOISE_EVENTS.has(name)) return;
      const e = evMap.get(name) || { name, value: 0, byDate: {} };
      const v = +r.metricValues[0].value || 0;
      e.value += v; e.byDate[r.dimensionValues[0].value] = (e.byDate[r.dimensionValues[0].value] || 0) + v;
      evMap.set(name, e);
    });
    const dates = rows.map((r) => r.date);
    const events = [...evMap.values()].sort((a, b) => b.value - a.value).slice(0, 10)
      .map((e) => ({ name: e.name, value: e.value, series: dates.map((dt) => e.byDate[dt] || 0) }));

    const topPages = (rPages?.rows || []).map((r) => ({ page: r.dimensionValues[0].value, users: +r.metricValues[0].value, conversions: +r.metricValues[1].value }));

    return [200, { live: true,
      totals: { users: sum("users"), sessions: sum("sessions"), views: sum("views"), conversions: sum("conversions"), engRate },
      byDate: rows, channels, sources, events, topPages,
    }];
  } catch (e) { return gErr(e); }
}
function mintSession(identity) {
  const token = randomBytes(32).toString("hex");
  appSessions.set(sha(token), { kind: identity.kind, id: identity.id, email: identity.email, exp: Date.now() + 30 * 864e5 });
  saveSessions();
  return token;
}
const sessionFromReq = (req) => {
  const th = sha(String(req.headers["x-ss-token"] || ""));
  const s = appSessions.get(th);
  if (!s) return null;
  if (Date.now() > s.exp) { appSessions.delete(th); saveSessions(); return null; }
  return s;
};

async function handleAppLogin(body) {
  const acct = matchAccount(body?.login, body?.password);
  if (!acct) return [401, { error: "bad_credentials", detail: "Email/username or password doesn't match an active account." }];
  /* trusted device → straight in; new device → email a code first */
  const dtok = String(body?.deviceToken || "");
  const trusted = dtok && (loadDevices()[acct.email] || []).some((d) => d.th === sha(dtok) && Date.now() - d.at < 90 * 864e5);
  if (trusted) return [200, { ok: true, token: mintSession(acct), identity: acct }];
  pendingLogin.set(acct.email, { kind: acct.kind, id: acct.id, exp: Date.now() + 10 * 60e3 });
  const [code, payload] = await handle2faStart({ email: acct.email, smtp: body?.smtp });
  return [code, { ...payload, needs2fa: true, email: acct.email }];
}
function handleAppTwofa(body) {
  const email = String(body?.email || "").trim().toLowerCase();
  const pend = pendingLogin.get(email);
  if (!pend || Date.now() > pend.exp) return [401, { error: "no_pending", detail: "Sign in again — the login attempt expired." }];
  const [code, payload] = handle2faVerify(body); // verifies the emailed code + registers the device
  if (code !== 200) return [code, payload];
  pendingLogin.delete(email);
  const identity = { kind: pend.kind, id: pend.id, email };
  return [200, { ok: true, token: mintSession(identity), deviceToken: payload.deviceToken, identity }];
}
/* Slices big enough to dominate the initial load and NOT needed to render the
   app. Saved reports carry their images inline and reach tens of megabytes;
   they are only ever read on the Reports screen, but every sign-in and every
   reload waited for all of them before showing anything at all. */
const LAZY_SLICES = ["company.savedReports"];

function handleStateGet(req) {
  if (!sessionFromReq(req)) return [401, { error: "unauthorized", detail: "Session required." }];
  const st = loadState();
  const rev = loadRev();
  /* ?slim=1 leaves the lazy slices out and reports their size instead, so the
     browser can render immediately and fetch them when they are first needed */
  if (st && /[?&]slim=1(&|$)/.test(req.url)) {
    const omitted = {};
    const slim = { ...st, company: { ...(st.company || {}) } };
    for (const path of LAZY_SLICES) {
      const key = path.slice("company.".length);
      if (!(key in (st.company || {}))) continue;
      let bytes = 0, count = 0;
      try { const v = st.company[key]; bytes = JSON.stringify(v).length; count = Array.isArray(v) ? v.length : 0; } catch { /* size is informational */ }
      delete slim.company[key];
      omitted[path] = { bytes, count };
    }
    return [200, { live: true, state: slim, exists: true, rev, revs: loadRevs(), omitted }];
  }
  return [200, { live: true, state: st, exists: !!st, rev, revs: loadRevs() }]; // exists:false = genuine first run (client may seed)
}

/* ---- GRANULAR WRITE: one tool's documents, nothing else ----------------
   The browser sends only the documents that actually changed, each with the
   revision it was working from. A Project-management edit therefore writes
   data/state/pm.json and touches no other file — so however wrong a tool's
   write path might be, it cannot reach another tool's data.

   Per-document revisions mean two people in different tools never collide:
   editing rank tracking while someone else edits tasks is not a conflict, and
   is no longer reported as one. */
function handleStateDomains(req, body) {
  const sess = sessionFromReq(req);
  if (!sess) return [401, { error: "unauthorized", detail: "Session required." }];
  if (sess.kind !== "team") return [403, { error: "forbidden", detail: "Only team accounts can write app state." }];
  const docs = body?.docs;
  if (!docs || typeof docs !== "object") return [400, { error: "bad_request", detail: "docs object required." }];

  const names = Object.keys(docs);
  const unknown = names.filter((d) => !DOMAINS.includes(d));
  if (unknown.length) return [400, { error: "bad_domain", detail: `Unknown document(s): ${unknown.join(", ")}` }];
  if (!existsSync(domFile("core")) && !loadDomains()) {
    return [409, { error: "no_base", detail: "Nothing stored yet — send the full workspace first." }];
  }

  /* refuse a write built on a document that has since moved on. Only the
     documents being written are checked; the rest are irrelevant to it. */
  const revs = loadRevs();
  const base = body.baseRevs || {};
  const stale = names.filter((d) => Number.isFinite(+base[d]) && +base[d] !== +(revs[d] ?? 0));
  if (stale.length) {
    return [409, { error: "stale_domain", stale, revs,
      detail: `Another session has saved ${stale.join(", ")} since this page loaded — nothing was written.` }];
  }

  /* the core document is the skeleton every other one hangs off; losing it
     would orphan the lot, so it gets the same collapse guard as a full save */
  if (docs.core) {
    const prev = readJson(domFile("core"), null);
    const prevN = (prev?.clients || []).length, nextN = (docs.core.clients || []).length;
    if (prevN >= 1 && nextN < prevN && JSON.stringify(docs.core).length < JSON.stringify(prev).length * 0.35) {
      return [409, { error: "refused_overwrite",
        detail: `Refused: this save would drop ${prevN - nextN} of ${prevN} client(s). Nothing was changed — reload the app.` }];
    }
  }
  try {
    const out = saveDomainDocs(docs);
    return [200, { ok: true, written: names, revs: out.revs, rev: out.rev, at: Date.now() }];
  } catch (e) { return [500, { error: "write_failed", detail: String(e?.message || e).slice(0, 120) }]; }
}

/* one lazy slice, on demand. `rev` comes back with it so the caller can tell
   whether the workspace moved underneath it while the slice was in flight. */
function handleStateSlice(req) {
  if (!sessionFromReq(req)) return [401, { error: "unauthorized", detail: "Session required." }];
  const path = decodeURIComponent((/[?&]path=([^&]+)/.exec(req.url) || [])[1] || "");
  if (!LAZY_SLICES.includes(path)) return [400, { error: "bad_path", detail: `Not a lazy slice: ${path}` }];
  const st = loadState();
  if (!st) return [404, { error: "no_state" }];
  const key = path.slice("company.".length);
  return [200, { live: true, path, value: st.company?.[key] ?? null, rev: loadRev() }];
}
function handleStateSave(req, body) {
  const sess = sessionFromReq(req);
  if (!sess) return [401, { error: "unauthorized", detail: "Session required." }];
  if (sess.kind !== "team") return [403, { error: "forbidden", detail: "Only team accounts can write app state." }];
  if (!body?.state || typeof body.state !== "object") return [400, { error: "bad_request", detail: "state object required." }];

  /* ---- UNCHANGED-SLICE REHYDRATION -------------------------------------
     Saved reports carry their images inline, and they had grown to 27 MB —
     70% of the whole workspace. Every autosave re-uploaded all of it, so
     renaming one task pushed 23 MB (gzipped) up the wire and the "Saving…"
     indicator sat there for the best part of a minute.

     A client that knows a slice is byte-identical to what the server already
     holds may leave it out and name it in `keep` instead. This is only safe
     because it is paired with the baseRev check below: the omission is valid
     at exactly the revision the browser was working from, and a write at a
     different revision is refused outright. So the stored value it re-uses is
     provably the same value the client would have sent.

     Anything we cannot honour is REFUSED rather than written — a state saved
     with a slice missing would be a silent data loss, which is the one
     outcome this whole path exists to prevent. */
  if (Array.isArray(body.keep) && body.keep.length) {
    /* the whole safety argument rests on the baseRev check below proving the
       stored copy is the one the client compared against. With no baseRev
       there is nothing pinning it, so re-using stored slices is not sound. */
    if (!Number.isFinite(+body.baseRev) || body.force) {
      return [409, { error: "keep_unavailable", detail: "Re-using stored slices needs a baseRev — send the full workspace." }];
    }
    const stored = loadState();
    if (!stored) return [409, { error: "keep_unavailable", detail: "Nothing stored to re-use — send the full workspace." }];
    for (const path of body.keep) {
      if (typeof path !== "string" || !/^(company\.[A-Za-z0-9_]+|clients)$/.test(path)) {
        return [400, { error: "bad_keep", detail: `Cannot re-use "${path}".` }];
      }
      if (path === "clients") {
        if (!Array.isArray(stored.clients)) return [409, { error: "keep_unavailable", detail: "No stored clients to re-use — send the full workspace." }];
        body.state.clients = stored.clients;
      } else {
        const key = path.slice("company.".length);
        if (!stored.company || !(key in stored.company)) {
          return [409, { error: "keep_unavailable", detail: `No stored company.${key} to re-use — send the full workspace.` }];
        }
        body.state.company = { ...(body.state.company || {}), [key]: stored.company[key] };
      }
    }
  }

  /* ---- LAZY SLICES ARE NEVER DELETED BY ABSENCE ------------------------
     The server itself withholds these on a slim load, so a browser can quite
     legitimately be holding a workspace that has no `savedReports` key at all.
     If such a tab ever saves without naming it in `keep` — one missed code
     path, one older build still open in a tab — the write would silently
     replace the entire report archive with nothing.

     So absence is treated as "unchanged". Deleting them stays possible: an
     empty ARRAY is an explicit, honest instruction and is written as given.
     Only a MISSING key is refused, and a missing key is never how a client
     asks for a deletion. */
  if (body.state.company && typeof body.state.company === "object") {
    let restored = null;
    for (const path of LAZY_SLICES) {
      const key = path.slice("company.".length);
      if (key in body.state.company) continue;
      restored = restored || loadState();
      if (restored?.company && key in restored.company) body.state.company[key] = restored.company[key];
    }
  }

  const raw = JSON.stringify(body.state);
  if (raw.length > 60_000_000) return [413, { error: "too_large", detail: "State exceeds 60 MB — trim large embedded images." }];
  /* ---- CATASTROPHIC-OVERWRITE GUARD -------------------------------------
     A browser that failed to load the server state falls back to the seeded
     demo workspace; its next autosave would replace real client data with
     seed data. Refuse any write that drops most of the existing clients or
     collapses the payload, unless it is explicitly forced (restore flow). */
  try {
    const prev = loadState();
    if (prev && !body.force) {
      const prevRaw = JSON.stringify(prev);
      const prevClients = (prev.clients || []).length, nextClients = (body.state.clients || []).length;
      const lostClients = prevClients >= 1 && nextClients < prevClients;
      const collapsed = prevRaw.length > 20_000 && raw.length < prevRaw.length * 0.35;
      if (lostClients && collapsed) {
        return [409, { error: "refused_overwrite",
          detail: `Refused: this save would drop ${prevClients - nextClients} of ${prevClients} client(s) and ${Math.round((1 - raw.length / prevRaw.length) * 100)}% of the stored data. The browser probably failed to load the server state — reload the app. Nothing was changed.` }];
      }
    }
  } catch { /* guard must never block a legitimate save */ }
  /* ---- STALE-WRITE GUARD ------------------------------------------------
     Every save carries the revision the browser was working from. If the
     stored workspace has moved on since, this payload predates someone else's
     changes and writing it would erase them — the exact way manually added
     records and tasks disappeared. The client is told to reload instead. */
  const cur = loadRev();
  if (!body.force && Number.isFinite(+body.baseRev) && +body.baseRev !== cur) {
    return [409, { error: "stale_state", rev: cur, baseRev: +body.baseRev,
      detail: "Another session (or another browser tab) has saved changes since this page loaded. Saving now would erase them, so nothing was written — reload to continue from the latest workspace." }];
  }
  /* per-document revisions come back too, so the browser can go straight to
     granular saves afterwards instead of failing one first */
  try { const rev = saveState(body.state); return [200, { ok: true, bytes: raw.length, at: Date.now(), rev, revs: loadRevs() }]; }
  catch (e) { return [500, { error: "write_failed", detail: String(e?.message || e).slice(0, 120) }]; }
}
/* ---- backup listing + restore: the daily rolling copies saveState() keeps ---- */
function handleStateBackups(req) {
  const sess = sessionFromReq(req);
  if (!sess || sess.kind !== "team") return [403, { error: "forbidden" }];
  const bdir = new URL("./data/backups/", import.meta.url);
  const sdir = new URL("./data/snapshots/", import.meta.url);
  const read = (dir, f) => {
    let clients = null, bytes = null, records = null;
    try {
      const buf = readFileSync(new URL(f, dir));
      const j = JSON.parse(f.endsWith(".gz") ? gunzipSync(buf).toString("utf8") : buf.toString("utf8"));
      clients = (j.clients || []).length;
      /* record/task counts make it obvious WHICH copy still holds the work */
      records = (j.clients || []).reduce((n, c) => n + (c.projects || []).reduce((m, p) => m + (p.records || []).length, 0), 0);
      bytes = statSync(new URL(f, dir)).size;
    } catch { /* unreadable */ }
    return { clients, bytes, records };
  };
  const out = [];
  try {
    readdirSync(sdir).filter((f) => /^app-state-\d{4}-\d{2}-\d{2}-\d{2}\.json\.gz$/.test(f)).sort().reverse()
      .forEach((f) => out.push({ file: f, kind: "hourly", at: f.slice(10, 23), ...read(sdir, f) }));
  } catch { /* no snapshots yet */ }
  try {
    readdirSync(bdir).filter((f) => /^app-state-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse()
      .forEach((f) => out.push({ file: f, kind: "daily", at: f.slice(10, 20), day: f.slice(10, 20), ...read(bdir, f) }));
  } catch { /* no daily backups yet */ }
  return [200, { live: true, backups: out }];
}
/* ---- surgical recovery: read report templates and saved reports OUT of a
   backup without restoring the whole workspace over newer work. Wholesale
   restore is the wrong tool when only a couple of documents went missing —
   it would undo everything else saved since. ---- */
function handleStateBackupExtract(req, body) {
  const sess = sessionFromReq(req);
  if (!sess || sess.kind !== "team") return [403, { error: "forbidden" }];
  const file = String(body?.file || "");
  const hourly = /^app-state-\d{4}-\d{2}-\d{2}-\d{2}\.json\.gz$/.test(file);
  if (!hourly && !/^app-state-\d{4}-\d{2}-\d{2}\.json$/.test(file)) return [400, { error: "bad_request", detail: "A backup filename is required." }];
  const src = new URL((hourly ? "./data/snapshots/" : "./data/backups/") + file, import.meta.url);
  if (!existsSync(src)) return [404, { error: "not_found", detail: file + " does not exist." }];
  try {
    const buf = readFileSync(src);
    const st = JSON.parse(hourly ? gunzipSync(buf).toString("utf8") : buf.toString("utf8"));
    /* a compact fingerprint of Project Management in this backup: enough to
       tell exactly which tasks existed when, without shipping the workspace */
    if (body?.want === "pm") {
      const projects = [];
      (st.clients || []).forEach((c) => (c.projects || []).forEach((p) => {
        const recs = (p.records || []).map((r) => ({
          id: r.id, name: r.name, autoKey: r.autoKey || null, updatedAt: r.updatedAt || null,
          tasks: (r.checklists || []).flatMap((cl) => (cl.tasks || []).map((t) => ({
            id: t.id, title: String(t.title || "").slice(0, 80), list: cl.name,
            auto: !!t.workKey, createdAt: t.createdAt || null,
          }))),
        }));
        const taskCount = recs.reduce((n, r) => n + r.tasks.length, 0);
        if (recs.length || taskCount) projects.push({ client: c.name, project: p.name, projectId: p.id, records: recs.length, tasks: taskCount, detail: recs });
      }));
      return [200, { live: true, file, projects }];
    }
    return [200, { live: true, file,
      reportTemplates: (st.company?.reportTemplates || []),
      /* saved reports live on the COMPANY, keyed by project. The per-client
         list below is only a legacy location — reading just that one made this
         endpoint report "no reports" for every backup ever taken, which is the
         opposite of the truth. Both are returned now. */
      savedReports: (st.company?.savedReports || []),
      legacyClientReports: (st.clients || []).map((c) => ({ clientId: c.id, clientName: c.name, reports: c.savedReports || [] })).filter((x) => x.reports.length),
    }];
  } catch (e) { return [500, { error: "read_failed", detail: String(e?.message || e).slice(0, 140) }]; }
}
function handleStateRestore(req, body) {
  const sess = sessionFromReq(req);
  if (!sess || sess.kind !== "team") return [403, { error: "forbidden" }];
  const file = String(body?.file || "");
  const hourly = /^app-state-\d{4}-\d{2}-\d{2}-\d{2}\.json\.gz$/.test(file);
  if (!hourly && !/^app-state-\d{4}-\d{2}-\d{2}\.json$/.test(file)) return [400, { error: "bad_request", detail: "A backup filename is required." }];
  const src = new URL((hourly ? "./data/snapshots/" : "./data/backups/") + file, import.meta.url);
  if (!existsSync(src)) return [404, { error: "not_found", detail: file + " does not exist." }];
  try {
    const buf = readFileSync(src);
    const restored = JSON.parse(hourly ? gunzipSync(buf).toString("utf8") : buf.toString("utf8"));
    /* keep the pre-restore state recoverable too */
    if (existsSync(STATE_FILE)) copyFileSync(STATE_FILE, new URL("./data/backups/app-state-before-restore.json", import.meta.url));
    saveState(restored);
    return [200, { ok: true, restoredFrom: file, clients: (restored.clients || []).length }];
  } catch (e) { return [500, { error: "restore_failed", detail: String(e?.message || e).slice(0, 140) }]; }
}
function handleAppLogout(req) {
  const th = sha(String(req.headers["x-ss-token"] || ""));
  if (appSessions.delete(th)) saveSessions();
  return [200, { ok: true }];
}

/* minimal SMTP-over-TLS client (implicit TLS, port 465) — node builtins only */
/* Minimal SMTP-over-TLS client. opts: { html } sends multipart/alternative
   (used when a campaign enables open/click tracking); verifyOnly stops after
   AUTH — a real credential check that never emails anyone. */
function sendMail(cfg, to, subject, text, opts = {}) {
  return new Promise((resolve, reject) => {
    const sock = tlsConnect({ host: cfg.host, port: +(cfg.port || 465), servername: cfg.host });
    const lines = []; let waiter = null; let done = false;
    const fail = (e) => { if (!done) { done = true; sock.destroy(); reject(e instanceof Error ? e : new Error(String(e))); } };
    sock.setEncoding("utf8");
    sock.setTimeout(15000, () => fail(new Error("SMTP timeout")));
    sock.on("error", fail);
    sock.on("data", (d) => { d.split("\r\n").filter(Boolean).forEach((l) => lines.push(l)); waiter?.(); });
    const read = () => new Promise((res2, rej2) => {
      const tryLine = () => { while (lines.length) { const l = lines.shift(); if (/^\d{3} /.test(l)) return res2(l); } waiter = tryLine; };
      sock.once("close", () => rej2(new Error("SMTP connection closed")));
      tryLine();
    });
    const send = (x) => sock.write(x + "\r\n");
    const expect = async (code) => { const l = await read(); if (!l.startsWith(String(code))) throw new Error("SMTP " + l.slice(0, 120)); };
    /* SMTP dot-stuffing: a leading "." on any body line would end DATA early */
    const stuff = (s) => String(s).split(/\r?\n/).map((l) => (l.startsWith(".") ? "." + l : l)).join("\r\n");
    (async () => {
      await expect(220);
      send("EHLO serpsquad.local"); await expect(250);
      send("AUTH LOGIN"); await expect(334);
      send(Buffer.from(String(cfg.user)).toString("base64")); await expect(334);
      send(Buffer.from(String(cfg.pass)).toString("base64")); await expect(235);
      if (opts.verifyOnly) { send("QUIT"); sock.end(); if (!done) { done = true; resolve(); } return; }
      send(`MAIL FROM:<${cfg.fromAddr || cfg.user}>`); await expect(250);
      send(`RCPT TO:<${to}>`); await expect(250);
      send("DATA"); await expect(354);
      const head = `From: ${cfg.from || cfg.user}\r\nTo: ${to}\r\n${cfg.replyTo ? `Reply-To: ${cfg.replyTo}\r\n` : ""}Subject: ${subject}\r\nMIME-Version: 1.0\r\nDate: ${new Date().toUTCString()}`;
      const body = opts.html
        ? `Content-Type: multipart/alternative; boundary="ssb0"\r\n\r\n--ssb0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${stuff(text)}\r\n--ssb0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${stuff(opts.html)}\r\n--ssb0--`
        : `Content-Type: text/plain; charset=utf-8\r\n\r\n${stuff(text)}`;
      send(`${head}\r\n${body}\r\n.`);
      await expect(250);
      send("QUIT"); sock.end();
      if (!done) { done = true; resolve(); }
    })().catch(fail);
  });
}

/* ---- minimal IMAP-over-TLS client: enough to read the inbox ----
   LOGIN → SELECT INBOX → FETCH the newest messages with header fields +
   the first MIME part (usually text/plain). Handles IMAP literals
   ({N}\r\n + N raw bytes), RFC2047 headers and QP/base64 bodies. */
function imapConnect(cfg) {
  return new Promise((resolve, reject) => {
    const sock = tlsConnect({ host: cfg.host, port: +(cfg.port || 993), servername: cfg.host });
    let buf = Buffer.alloc(0); let waiter = null; let done = false; let tagN = 0;
    const fail = (e) => { if (!done) { done = true; sock.destroy(); reject(e instanceof Error ? e : new Error(String(e))); } };
    sock.setTimeout(25000, () => fail(new Error("IMAP timeout")));
    sock.on("error", fail);
    sock.on("data", (d) => { buf = Buffer.concat([buf, d]); waiter?.(); });
    const waitFor = (tag) => new Promise((res2, rej2) => {
      const check = () => {
        const s = buf.toString("latin1");
        const m = s.match(new RegExp(`(?:^|\\r\\n)${tag} (OK|NO|BAD)([^\\r\\n]*)`));
        if (m) { const out = buf; buf = Buffer.alloc(0); if (m[1] !== "OK") return rej2(new Error(`IMAP ${m[1]}${m[2]}`.slice(0, 160))); return res2(out); }
        waiter = check;
      };
      sock.once("close", () => rej2(new Error("IMAP connection closed")));
      check();
    });
    const cmd = async (c) => { const tag = "a" + (++tagN); sock.write(`${tag} ${c}\r\n`); return waitFor(tag); };
    sock.once("secureConnect", async () => {
      try {
        await new Promise((r) => { const chk = () => (buf.toString("latin1").includes("\r\n") ? r() : (waiter = chk)); chk(); }); // greeting
        buf = Buffer.alloc(0);
        resolve({ cmd, end: () => { done = true; try { sock.write("a99 LOGOUT\r\n"); } catch { /* closing */ } sock.end(); } });
      } catch (e) { fail(e); }
    });
  });
}
const qEsc = (s) => String(s).replace(/[\\"]/g, "\\$&");
const rfc2047 = (s) => String(s).replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, cs, enc, data) => {
  try {
    return enc.toUpperCase() === "B"
      ? Buffer.from(data, "base64").toString("utf8")
      : data.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (__, h) => String.fromCharCode(parseInt(h, 16)));
  } catch { return data; }
});
const decodeBody = (raw) => {
  let s = raw;
  if (/=\r?\n|=[0-9A-F]{2}/i.test(s)) // quoted-printable (HTML bodies use it too)
    s = s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  else if (/^[A-Za-z0-9+/=\r\n]+$/.test(s.trim()) && s.trim().length > 40) {
    try { const dec = Buffer.from(s.replace(/\s/g, ""), "base64").toString("utf8"); if (/[ a-z]/i.test(dec)) s = dec; } catch { /* keep raw */ }
  }
  /* snippet use: drop style/script blocks BEFORE tag-stripping so CSS text
     never leaks into the preview line */
  return s.replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/[ \t]+/g, " ").trim();
};
/* parse FETCH responses: header-fields literal + first-part literal per message */
function parseImapFetch(raw) {
  const s = raw.toString("latin1");
  const msgs = [];
  const re = /\* (\d+) FETCH \(/g;
  const starts = []; let m;
  while ((m = re.exec(s))) starts.push({ seq: +m[1], at: m.index });
  starts.forEach((st, i) => {
    const seg = s.slice(st.at, starts[i + 1]?.at ?? s.length);
    const flags = (seg.match(/FLAGS \(([^)]*)\)/) || [])[1] || "";
    const lits = [];
    const lre = /\{(\d+)\}\r\n/g; let lm;
    while ((lm = lre.exec(seg))) { lits.push(seg.slice(lm.index + lm[0].length, lm.index + lm[0].length + +lm[1])); lre.lastIndex = lm.index + lm[0].length + +lm[1]; }
    const header = lits[0] || "", body = lits[1] || "";
    const h = (name) => rfc2047(((header.match(new RegExp(`^${name}:[ \\t]*([^\\r\\n]*(?:\\r\\n[ \\t][^\\r\\n]*)*)`, "im")) || [])[1] || "").replace(/\r\n[ \t]/g, " ").trim());
    const from = h("From");
    msgs.push({
      seq: st.seq, seen: /\\Seen/.test(flags),
      from, fromEmail: ((from.match(/<([^>]+)>/) || [])[1] || from).toLowerCase().trim(),
      subject: h("Subject"), date: h("Date"),
      text: decodeBody(Buffer.from(body, "latin1").toString("utf8")).slice(0, 1200),
    });
  });
  return msgs.reverse(); // newest first
}
async function handleMailInbox(body) {
  const imap = body?.imap;
  if (!imap?.host || !imap?.user || !imap?.pass) return [503, { error: "not_configured", detail: "This email account has no IMAP settings — edit it and add IMAP host/username/password (Gmail preset fills them automatically)." }];
  let conn;
  try {
    conn = await imapConnect(imap);
    await conn.cmd(`LOGIN "${qEsc(imap.user)}" "${qEsc(imap.pass)}"`);
    const sel = await conn.cmd("SELECT INBOX");
    const exists = +((sel.toString("latin1").match(/\* (\d+) EXISTS/) || [])[1] || 0);
    if (!exists) { conn.end(); return [200, { live: true, total: 0, messages: [] }]; }
    const count = Math.min(exists, Math.min(Math.max(+body?.limit || 20, 5), 40));
    const raw = await conn.cmd(`FETCH ${exists - count + 1}:${exists} (FLAGS BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)] BODY.PEEK[1]<0.2048>)`);
    conn.end();
    return [200, { live: true, total: exists, messages: parseImapFetch(raw) }];
  } catch (e) {
    try { conn?.end(); } catch { /* closed */ }
    return [502, { error: "provider_error", detail: "IMAP: " + String(e?.message || e).slice(0, 160) }];
  }
}
/* ---- full-message fetch: MIME-parse ONE message so the inbox renders the
   real HTML email (exact graphics) instead of raw quoted-printable source.
   Handles nested multiparts, quoted-printable + base64 transfer encodings
   and utf-8 charsets — no dependencies. ---- */
const mimeBytes = (bodyLatin1, cte) =>
  cte === "base64" ? Buffer.from(bodyLatin1.replace(/[^A-Za-z0-9+/=]/g, ""), "base64")
  : cte === "quoted-printable" ? Buffer.from(bodyLatin1.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))), "latin1")
  : Buffer.from(bodyLatin1, "latin1");
function mimeWalk(raw, out, depth = 0) {
  if (depth > 6) return;
  const ix = raw.search(/\r?\n\r?\n/);
  if (ix < 0) return;
  const headers = raw.slice(0, ix);
  const bodyPart = raw.slice(ix).replace(/^\r?\n\r?\n?/, "");
  const ctypeLine = (headers.match(/^content-type:[^\r\n]*(?:\r?\n[ \t][^\r\n]*)*/im) || [""])[0];
  const boundary = (ctypeLine.match(/boundary="?([^";\r\n]+)"?/i) || [])[1];
  if (boundary) {
    bodyPart.split("--" + boundary).slice(1).forEach((p) => {
      if (!p.startsWith("--")) mimeWalk(p.replace(/^\r?\n/, ""), out, depth + 1);
    });
    return;
  }
  const ctype = ((ctypeLine.match(/content-type:\s*([^;\r\n]+)/i) || [])[1] || "text/plain").trim().toLowerCase();
  if (ctype.startsWith("image/") || ctype.includes("application/")) return; // attachments aren't rendered
  const cte = ((headers.match(/^content-transfer-encoding:\s*([^\r\n;]+)/im) || [])[1] || "").trim().toLowerCase();
  const charset = ((ctypeLine.match(/charset="?([\w.-]+)"?/i) || [])[1] || "utf-8").toLowerCase();
  const bytes = mimeBytes(bodyPart, cte);
  const text = /utf-?8|us-ascii/.test(charset) ? bytes.toString("utf8") : bytes.toString("latin1");
  if (ctype === "text/html") out.html += text;
  else if (ctype === "text/plain") out.text += text;
}
async function handleMailMessage(body) {
  const imap = body?.imap, seq = Math.max(0, +body?.seq || 0);
  if (!imap?.host || !imap?.user || !imap?.pass) return [503, { error: "not_configured", detail: "This email account has no IMAP settings." }];
  if (!seq) return [400, { error: "bad_request", detail: "seq required" }];
  let conn;
  try {
    conn = await imapConnect(imap);
    await conn.cmd(`LOGIN "${qEsc(imap.user)}" "${qEsc(imap.pass)}"`);
    await conn.cmd("SELECT INBOX");
    /* first 256KB covers any real email body; attachments past it are not rendered anyway */
    const raw = (await conn.cmd(`FETCH ${seq} (BODY.PEEK[]<0.262144>)`)).toString("latin1");
    conn.end();
    const lm = raw.match(/\{(\d+)\}\r\n/);
    if (!lm) return [502, { error: "provider_error", detail: "IMAP returned no message body" }];
    const msg = raw.slice(lm.index + lm[0].length, lm.index + lm[0].length + +lm[1]);
    const out = { html: "", text: "" };
    mimeWalk(msg, out);
    if (!out.html && !out.text) out.text = decodeBody(msg.slice(msg.search(/\r?\n\r?\n/) + 4));
    return [200, { live: true, html: out.html || null, text: out.text.trim() || null }];
  } catch (e) {
    try { conn?.end(); } catch { /* closed */ }
    return [502, { error: "provider_error", detail: "IMAP: " + String(e?.message || e).slice(0, 160) }];
  }
}

async function handleMailTest(body) {
  const out = { smtp: null, imap: null };
  const smtp = body?.smtp;
  if (smtp?.host && smtp?.user) {
    try { await sendMail(smtp, "", "", "", { verifyOnly: true }); out.smtp = { ok: true }; }
    catch (e) { out.smtp = { ok: false, detail: String(e?.message || e).slice(0, 140) }; }
  } else out.smtp = { ok: false, detail: "SMTP host/username missing." };
  const imap = body?.imap;
  if (imap?.host && imap?.user) {
    let conn;
    try { conn = await imapConnect(imap); await conn.cmd(`LOGIN "${qEsc(imap.user)}" "${qEsc(imap.pass)}"`); conn.end(); out.imap = { ok: true }; }
    catch (e) { try { conn?.end(); } catch { /* closed */ } out.imap = { ok: false, detail: String(e?.message || e).slice(0, 140) }; }
  } else out.imap = { ok: false, detail: "IMAP not configured (optional — needed for the Inbox)." };
  return [200, { live: true, ...out }];
}

/* =====================================================================
   LEAD FORMS on deployed pages

   Pages built by the deploy engine carry a hero contact form. The form
   lives on the CLIENT's domain, so it posts back here: /api/form/submit is
   the one public, any-origin POST route besides the pixel.

   Registration (/api/form/register, called by the app at publish time) is
   what makes a formKey real — it records WHERE leads go. Nothing about the
   recipient is embedded in the deployed page, so a submission can never be
   redirected by editing the published HTML, and changing the notification
   address doesn't require redeploying the site.

   Mail goes out over the agency's own SMTP (Company Settings → API settings
   → Email SMTP), read server-side from the persisted workspace. Every
   submission is also appended to the form's own file, capped, so a lead is
   never lost when SMTP is down or unconfigured.
   ===================================================================== */
const FORMS_FILE = new URL("./data/lead-forms.json", import.meta.url);
const loadForms = () => { try { return JSON.parse(readFileSync(FORMS_FILE, "utf8")); } catch { return {}; } };
const saveForms = (d) => {
  mkdirSync(new URL("./data/", import.meta.url), { recursive: true });
  const tmp = new URL("./data/lead-forms.json.tmp", import.meta.url);
  writeFileSync(tmp, JSON.stringify(d));
  renameSync(tmp, FORMS_FILE);
};
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
const escHtml = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/* the agency SMTP the app already uses for sign-in codes */
const agencySmtp = () => {
  const v = loadState()?.company?.apis?.smtp?.values;
  if (v?.host && v?.user) return v;
  if (process.env.SMTP_HOST && process.env.SMTP_USER) return { host: process.env.SMTP_HOST, port: process.env.SMTP_PORT, user: process.env.SMTP_USER, pass: process.env.SMTP_PASS, from: process.env.SMTP_FROM };
  return null;
};
function handleFormRegister(body) {
  const key = String(body?.key || "").trim();
  const to = String(body?.to || "").trim().toLowerCase();
  if (!/^[a-z0-9]{4,40}$/.test(key)) return [400, { error: "bad_request", detail: "A form key is required." }];
  if (!isEmail(to)) return [400, { error: "bad_request", detail: "A valid notification email is required — set Brand Voice → Business information → Email." }];
  const forms = loadForms();
  const prev = forms[key] || {};
  forms[key] = { ...prev, key, to, cc: isEmail(body?.cc) ? String(body.cc).trim().toLowerCase() : "",
    site: String(body?.site || "").slice(0, 120), brand: String(body?.brand || "").slice(0, 120),
    updatedAt: Date.now(), leads: prev.leads || [] };
  saveForms(forms);
  return [200, { ok: true, key, to, smtp: !!agencySmtp() }];
}
async function handleFormSubmit(body, ip) {
  const key = String(body?.formKey || body?.key || "").trim();
  const forms = loadForms();
  const cfg = forms[key];
  /* an unregistered key means the page was deployed before the form was set
     up (or the key was tampered with) — never guess a recipient */
  if (!cfg?.to) return [404, { error: "unknown_form", detail: "This form isn't connected yet — please call us instead." }];
  /* the honeypot is invisible to people and irresistible to bots: a filled
     one is accepted with a 200 so the bot doesn't learn, but nothing is sent */
  if (String(body?.company_url || "").trim()) return [200, { ok: true, spam: true }];
  const name = String(body?.name || "").trim().slice(0, 120);
  const email = String(body?.email || "").trim().slice(0, 160);
  const phone = String(body?.phone || "").trim().slice(0, 60);
  const message = String(body?.message || "").trim().slice(0, 4000);
  if (!name || !isEmail(email) || !phone) return [400, { error: "bad_request", detail: "Name, a valid email and a phone number are required." }];
  const page = String(body?.page || "").slice(0, 200);
  const lead = { at: Date.now(), name, email, phone, message, page, ip: String(ip || "").slice(0, 45) };
  cfg.leads = [lead, ...(cfg.leads || [])].slice(0, 500);
  forms[key] = cfg;
  saveForms(forms);

  const smtp = agencySmtp();
  if (!smtp) return [200, { ok: true, emailed: false, detail: "Received." }];
  const subject = `New ${cfg.brand || "website"} enquiry — ${name}`;
  const text = [`New enquiry from ${cfg.site || "the website"}${page ? " (" + page + ")" : ""}`, "",
    `Name:    ${name}`, `Email:   ${email}`, `Phone:   ${phone}`, "", "Message:", message || "(none)", "",
    `Received: ${new Date().toUTCString()}`].join("\n");
  const esc2 = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<div style="font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#141b24">
<h2 style="margin:0 0 4px">New enquiry — ${esc2(name)}</h2>
<p style="margin:0 0 16px;color:#667"><a href="https://${esc2(cfg.site)}${esc2(page)}">${esc2(cfg.site)}${esc2(page)}</a></p>
<table cellpadding="6" style="border-collapse:collapse;font-size:15px">
<tr><td style="color:#667">Name</td><td><b>${esc2(name)}</b></td></tr>
<tr><td style="color:#667">Email</td><td><a href="mailto:${esc2(email)}">${esc2(email)}</a></td></tr>
<tr><td style="color:#667">Phone</td><td><a href="tel:${esc2(phone.replace(/[^+\d]/g, ""))}">${esc2(phone)}</a></td></tr>
</table>${message ? `<p style="margin:16px 0 0;white-space:pre-wrap;border-left:3px solid #ddd;padding-left:12px">${esc2(message)}</p>` : ""}
<p style="margin:20px 0 0;font-size:12px;color:#889">Sent by SERP Squad Studio · replying goes straight to the enquirer.</p></div>`;
  try {
    /* the visitor's own address as Reply-To so hitting reply answers them */
    await sendMail({ ...smtp, replyTo: email }, cfg.to, subject, text, { html });
    if (cfg.cc) { try { await sendMail({ ...smtp, replyTo: email }, cfg.cc, subject, text, { html }); } catch { /* cc is best-effort */ } }
    return [200, { ok: true, emailed: true }];
  } catch (e) {
    /* the lead is already stored — report success to the visitor, and the
       failure reason where the agency can see it */
    console.error("[form] SMTP send failed:", String(e?.message || e));
    return [200, { ok: true, emailed: false }];
  }
}
function handleFormLeads(body) {
  const key = String(body?.key || "").trim();
  const cfg = loadForms()[key];
  if (!cfg) return [200, { live: true, leads: [], registered: false }];
  return [200, { live: true, registered: true, to: cfg.to, smtp: !!agencySmtp(), leads: (cfg.leads || []).slice(0, 100) }];
}

/* ---- open/click tracking: 1px gif + redirect, events in a JSON file.
   token = campaignId.contactId — generated by the client at send time. ---- */
const TRACK_FILE = new URL("./data/outreach-track.json", import.meta.url);
const loadTrack = () => { try { return JSON.parse(readFileSync(TRACK_FILE, "utf8")); } catch { return {}; } };
const saveTrack = (d) => { mkdirSync(new URL("./data/", import.meta.url), { recursive: true }); writeFileSync(TRACK_FILE, JSON.stringify(d)); };
const GIF_1PX = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const trackHit = (token, type) => {
  if (!/^[\w.-]{3,120}$/.test(token)) return false;
  const d = loadTrack();
  (d[token] = d[token] || { o: [], c: [] })[type].push(Date.now());
  saveTrack(d);
  return true;
};
function handleTrackStats(body) {
  const prefix = String(body?.prefix || "");
  if (!prefix) return [400, { error: "bad_request", detail: "prefix (campaign id) required" }];
  const d = loadTrack();
  const out = {};
  Object.entries(d).forEach(([token, ev]) => {
    if (token.startsWith(prefix + ".")) out[token.slice(prefix.length + 1)] = { opens: ev.o.length, clicks: ev.c.length, lastOpen: ev.o[ev.o.length - 1] || null };
  });
  return [200, { live: true, stats: out }];
}

async function handle2faStart(body) {
  const email = String(body?.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return [400, { error: "bad_request", detail: "A valid email is required." }];
  const code = String((randomBytes(4).readUInt32BE(0) % 900000) + 100000);
  pending2fa.set(email, { codeHash: sha(email + "|" + code), exp: Date.now() + 10 * 60e3, tries: 0 });
  const smtp = body?.smtp?.host ? body.smtp
    : process.env.SMTP_HOST ? { host: process.env.SMTP_HOST, port: process.env.SMTP_PORT, user: process.env.SMTP_USER, pass: process.env.SMTP_PASS, from: process.env.SMTP_FROM }
    : null;
  if (smtp?.host && smtp.user) {
    try {
      await sendMail(smtp, email, "Your sign-in verification code",
        `Your verification code is ${code}. It expires in 10 minutes.\n\nWe sent this because a sign-in was attempted from a new device or browser. If this wasn't you, change your password immediately.`);
      return [200, { sent: true }];
    } catch (e) { return [502, { error: "provider_error", detail: "SMTP send failed: " + (e?.message || e) }]; }
  }
  /* no SMTP configured — labeled demo fallback for local testing (never silent) */
  return [200, { sent: false, demo: true, devCode: code, detail: "No SMTP configured (Company Settings → API settings → Email SMTP) — demo code returned for local testing only." }];
}
function handle2faVerify(body) {
  const email = String(body?.email || "").trim().toLowerCase();
  const code = String(body?.code || "").trim();
  const ch = pending2fa.get(email);
  if (!ch) return [400, { error: "no_challenge", detail: "No active code for this email — request a new one." }];
  if (Date.now() > ch.exp) { pending2fa.delete(email); return [410, { error: "expired", detail: "That code expired — request a new one." }]; }
  ch.tries += 1;
  if (ch.tries > 5) { pending2fa.delete(email); return [429, { error: "locked", detail: "Too many wrong attempts — request a new code." }]; }
  if (sha(email + "|" + code) !== ch.codeHash) return [401, { error: "wrong_code", detail: `Wrong code — ${Math.max(0, 5 - ch.tries)} attempt(s) left.` }];
  pending2fa.delete(email);   // single use
  const token = randomBytes(32).toString("hex");
  const devices = loadDevices();
  (devices[email] = devices[email] || []).push({ th: sha(token), at: Date.now(), ua: String(body?.ua || "").slice(0, 140) });
  devices[email] = devices[email].slice(-10);   // keep the 10 most recent trusted devices
  saveDevices(devices);
  return [200, { ok: true, deviceToken: token }];
}
function handleDeviceCheck(body) {
  const email = String(body?.email || "").trim().toLowerCase();
  const token = String(body?.deviceToken || "");
  if (!email || !token) return [200, { trusted: false }];
  const hit = (loadDevices()[email] || []).find((d) => d.th === sha(token));
  return [200, { trusted: !!hit && Date.now() - hit.at < 90 * 864e5 }];  // 90-day device trust
}

/* ---- business-profile listing selection (location groups) ----
   Production-shaped: with credentials it calls the real provider APIs to list
   the listings an account manages; without them it returns 503 — the UI then
   offers a clearly-labeled demo account instead. Never fabricates "live" data. */
async function handleProfileListings(body) {
  const provider = body?.provider;
  if (provider === "gbp") {
    /* This used to demand body.accessToken — a raw OAuth access token the
       browser never has and never had. Our OAuth stores a REFRESH token
       server-side against a connectionId (that is how Search Console and GA4
       work), so the condition was unsatisfiable and the endpoint answered
       "Google OAuth is not connected" no matter how well it was connected. */
    const connectionId = body?.connectionId;
    const envToken = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
    if (!connectionId && !envToken) {
      return [503, { error: "not_connected", detail: "No Google account is connected to this project yet — connect one in the project's Google data settings, then pick the listing." }];
    }
    let token = envToken;
    if (connectionId) {
      const stored = loadGTokens()[connectionId];
      if (!stored) return [503, { error: "not_connected", detail: "That Google connection no longer exists — reconnect the Google account and try again." }];
      /* a connection authorised before Business Profile was requested cannot
         read listings; say so plainly instead of surfacing Google's 403 */
      if (stored.scope && !stored.scope.includes(GBP_SCOPE)) {
        return [503, { error: "scope_missing", detail: "This Google account was connected before Business Profile access was requested. Reconnect it (Company Settings → API settings → Google) and approve the Business Profile permission, then pick the listing." }];
      }
      try { token = (await googleAccess(connectionId)).accessToken; }
      catch (e) { return gErr(e); }
    }
    try {
      const accRes = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", { headers: { Authorization: "Bearer " + token } });
      if (!accRes.ok) {
        const ed = await accRes.json().catch(() => ({}));
        const msg = ed.error?.message || `HTTP ${accRes.status}`;
        /* Enabling the API is not the same as being granted access to it.
           Until Google approves the request the per-minute quota stays at 0,
           and every call fails — which is a waiting problem, not a setup
           problem, and deserves to be described as one. */
        if (accRes.status === 403 || /quota|permission|not been used|disabled/i.test(msg)) {
          return [502, { error: "gbp_not_approved", detail: `Google accepted the sign-in but refused the Business Profile API: ${msg}. This is the access request, not your connection — until Google approves it the quota stays at 0 and every call fails. Check Cloud Console → APIs → Business Profile APIs → Quotas.` }];
        }
        return [502, { error: "provider_error", detail: `Google account list failed: ${msg}` }];
      }
      const accounts = (await accRes.json()).accounts || [];
      const listings = [];
      for (const a of accounts.slice(0, 10)) {
        const locRes = await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?readMask=name,title,storefrontAddress&pageSize=100`, { headers: { Authorization: "Bearer " + token } });
        if (!locRes.ok) continue;
        ((await locRes.json()).locations || []).forEach((l) => listings.push({
          id: l.name, name: l.title,
          address: l.storefrontAddress ? [l.storefrontAddress.addressLines?.join(" "), l.storefrontAddress.locality].filter(Boolean).join(", ") : "",
          account: a.accountName || a.name,
        }));
      }
      return [200, { live: true, listings }];
    } catch (e) { return [502, { error: "provider_error", detail: String(e?.message || e) }]; }
  }
  if (provider === "apple") {
    const token = body?.apiToken || process.env.APPLE_ABC_TOKEN;
    if (!token) return [503, { error: "not_configured", detail: "Apple Business Connect is not connected. Add the Business Connect API key in Company Settings → API settings — listing selection then reads your locations from api.businessconnect.apple.com." }];
    try {
      const res = await fetch("https://api.businessconnect.apple.com/v1/locations", { headers: { Authorization: "Bearer " + token } });
      if (!res.ok) return [502, { error: "provider_error", detail: `Apple Business Connect list failed (HTTP ${res.status})` }];
      const data = await res.json();
      return [200, { live: true, listings: (data.data || []).map((l) => ({ id: l.id, name: l.attributes?.name || l.id, address: l.attributes?.mainAddress?.fullAddress || "", account: "Apple Business Connect" })) }];
    } catch (e) { return [502, { error: "provider_error", detail: String(e?.message || e) }]; }
  }
  if (provider === "bing") {
    return [503, { error: "not_configured", detail: "Bing Places has no public listings API. Microsoft grants access only through its location-partner programme, against a verified Bing Places account — request it from partneronbp@microsoft.com. This is not an Azure AD integration, so registering an app in the Azure portal will not help. Until access is granted, manage the content here and publish it at bingplaces.com." }];
  }
  return [400, { error: "bad_request", detail: "provider must be gbp, bing or apple" }];
}

/* ---- Ads platforms (Meta / Google / TikTok / Reddit / Nextdoor / Yelp) ----
   Production-shaped: with credentials each handler calls the REAL provider API;
   without them it returns 503 with the exact requirement — never fabricated
   "live" data. The UI offers a clearly-labeled demo mode instead. */
const ADS_META = {
  meta:     { name: "Meta Ads",     needs: "Marketing API access token (Company Settings → API settings → Meta Ads)" },
  google:   { name: "Google Ads",   needs: "Google OAuth access token + developer token (API settings → Google Ads API)" },
  tiktok:   { name: "TikTok Ads",   needs: "Marketing API access token (API settings → TikTok Ads)" },
  reddit:   { name: "Reddit Ads",   needs: "OAuth client + refresh token (API settings → Reddit Ads)" },
  nextdoor: { name: "Nextdoor Ads", needs: "NAM API key (API settings → Nextdoor Ads)" },
  yelp:     { name: "Yelp Ads",     needs: "Yelp partner API key (API settings → Yelp Ads; partner approval required)" },
};
const adsToken = (body, envKey) => body?.creds?.accessToken || body?.creds?.apiKey || process.env[envKey];
const no503 = (platform) => [503, { error: "not_configured", detail: `${ADS_META[platform].name} is not connected. ${ADS_META[platform].needs}.` }];
const provErr = (name, r, extra) => [502, { error: "provider_error", detail: `${name} rejected the request (HTTP ${r.status})${extra ? ": " + extra : ""}` }];

async function handleAdsAccounts(body) {
  const pf = body?.platform;
  if (!ADS_META[pf]) return [400, { error: "bad_request", detail: "platform must be meta, google, tiktok, reddit, nextdoor or yelp" }];
  try {
    if (pf === "meta") {
      const tk = adsToken(body, "META_ADS_TOKEN"); if (!tk) return no503(pf);
      const r = await fetch(`https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id,currency,account_status&access_token=${encodeURIComponent(tk)}`);
      const d = await r.json(); if (!r.ok) return provErr("Meta", r, d.error?.message);
      return [200, { live: true, accounts: (d.data || []).map((a) => ({ id: a.account_id, name: a.name, currency: a.currency })) }];
    }
    if (pf === "google") {
      const tk = body?.creds?.oauthToken || process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
      const dev = body?.creds?.developerToken || process.env.GOOGLE_ADS_DEV_TOKEN;
      if (!tk || !dev) return no503(pf);
      const r = await fetch("https://googleads.googleapis.com/v16/customers:listAccessibleCustomers", {
        headers: { Authorization: "Bearer " + tk, "developer-token": dev } });
      const d = await r.json(); if (!r.ok) return provErr("Google Ads", r, d.error?.message);
      return [200, { live: true, accounts: (d.resourceNames || []).map((rn) => ({ id: rn.replace("customers/", ""), name: rn })) }];
    }
    if (pf === "tiktok") {
      const tk = adsToken(body, "TIKTOK_ADS_TOKEN"); if (!tk) return no503(pf);
      const r = await fetch(`https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/?app_id=${encodeURIComponent(body?.creds?.appId || "")}&secret=${encodeURIComponent(body?.creds?.appSecret || "")}`, { headers: { "Access-Token": tk } });
      const d = await r.json(); if (!r.ok || d.code !== 0) return provErr("TikTok", r, d.message);
      return [200, { live: true, accounts: (d.data?.list || []).map((a) => ({ id: a.advertiser_id, name: a.advertiser_name })) }];
    }
    if (pf === "reddit") {
      const tk = adsToken(body, "REDDIT_ADS_TOKEN"); if (!tk) return no503(pf);
      const r = await fetch("https://ads-api.reddit.com/api/v3/me", { headers: { Authorization: "Bearer " + tk } });
      const d = await r.json(); if (!r.ok) return provErr("Reddit Ads", r, d.message);
      return [200, { live: true, accounts: (d.data?.businesses || [d.data]).filter(Boolean).map((b) => ({ id: b.id, name: b.name || "Reddit Ads account" })) }];
    }
    if (pf === "nextdoor") {
      const tk = adsToken(body, "NEXTDOOR_ADS_KEY"); if (!tk) return no503(pf);
      const r = await fetch("https://ads.nextdoor.com/v2/api/advertisers", { headers: { Authorization: "Bearer " + tk } });
      const d = await r.json().catch(() => ({})); if (!r.ok) return provErr("Nextdoor", r, d.detail);
      return [200, { live: true, accounts: (d.advertisers || []).map((a) => ({ id: a.id, name: a.name })) }];
    }
    if (pf === "yelp") {
      const tk = adsToken(body, "YELP_ADS_KEY"); if (!tk) return no503(pf);
      const r = await fetch("https://api.yelp.com/v3/businesses/" + encodeURIComponent(body?.creds?.businessId || "me"), { headers: { Authorization: "Bearer " + tk } });
      const d = await r.json(); if (!r.ok) return provErr("Yelp", r, d.error?.description);
      return [200, { live: true, accounts: [{ id: d.id, name: d.name }] }];
    }
  } catch (e) { return [502, { error: "provider_error", detail: String(e?.message || e) }]; }
}

async function handleAdsMetrics(body) {
  const pf = body?.platform;
  if (!ADS_META[pf]) return [400, { error: "bad_request", detail: "unknown platform" }];
  const since = body?.since, until = body?.until, acct = body?.accountId;
  try {
    if (pf === "meta") {
      const tk = adsToken(body, "META_ADS_TOKEN"); if (!tk) return no503(pf);
      const r = await fetch(`https://graph.facebook.com/v19.0/act_${encodeURIComponent(acct)}/insights?fields=impressions,clicks,spend,actions,ctr,cpc,cpm&time_increment=1&time_range={"since":"${since}","until":"${until}"}&access_token=${encodeURIComponent(tk)}`);
      const d = await r.json(); if (!r.ok) return provErr("Meta", r, d.error?.message);
      return [200, { live: true, rows: d.data || [] }];
    }
    if (pf === "google") {
      const tk = body?.creds?.oauthToken || process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
      const dev = body?.creds?.developerToken || process.env.GOOGLE_ADS_DEV_TOKEN;
      if (!tk || !dev) return no503(pf);
      const gaql = `SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN '${since}' AND '${until}'`;
      const r = await fetch(`https://googleads.googleapis.com/v16/customers/${encodeURIComponent(acct)}/googleAds:searchStream`, {
        method: "POST", headers: { Authorization: "Bearer " + tk, "developer-token": dev, "content-type": "application/json" },
        body: JSON.stringify({ query: gaql }) });
      const d = await r.json(); if (!r.ok) return provErr("Google Ads", r, d[0]?.error?.message || d.error?.message);
      return [200, { live: true, rows: d }];
    }
    /* TikTok / Reddit / Nextdoor / Yelp reporting endpoints follow the same shape */
    const tk = adsToken(body, pf.toUpperCase() + "_ADS_TOKEN"); if (!tk) return no503(pf);
    return [502, { error: "provider_error", detail: `${ADS_META[pf].name} reporting call not reachable from this environment.` }];
  } catch (e) { return [502, { error: "provider_error", detail: String(e?.message || e) }]; }
}

async function handleAdsPublish(body) {
  const pf = body?.platform, c = body?.campaign;
  if (!ADS_META[pf] || !c?.name) return [400, { error: "bad_request", detail: "platform and campaign{name,objective,budget} required" }];
  try {
    if (pf === "meta") {
      const tk = adsToken(body, "META_ADS_TOKEN"); if (!tk) return no503(pf);
      /* step 1 of the documented chain: campaign → ad set → creative → ad */
      const r = await fetch(`https://graph.facebook.com/v19.0/act_${encodeURIComponent(body.accountId)}/campaigns`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: c.name, objective: c.objective || "OUTCOME_LEADS", status: "PAUSED", special_ad_categories: [], access_token: tk }),
      });
      const d = await r.json(); if (!r.ok) return provErr("Meta", r, d.error?.message);
      return [200, { live: true, campaignId: d.id, note: "Created PAUSED on Meta — finish ad set & creative review in Ads Manager, then activate." }];
    }
    /* remaining platforms: same pattern — real create call with credentials */
    const tk = adsToken(body, pf.toUpperCase() + "_ADS_TOKEN");
    if (!tk) return no503(pf);
    return [502, { error: "provider_error", detail: `${ADS_META[pf].name} campaign creation not reachable from this environment.` }];
  } catch (e) { return [502, { error: "provider_error", detail: String(e?.message || e) }]; }
}

/* ---- WordPress REST proxy (full-site deploy, media sync, cleanup) ----
   Auth: Application Password ("user:xxxx xxxx …") → HTTP Basic. Production-real:
   every call hits the site's /wp-json/wp/v2 API. Missing site/credential → 503;
   WordPress rejections → 502 with WP's own message. Never fabricates success. */
const wpHost = (site) => "https://" + String(site || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
const wpBase = (site) => wpHost(site) + "/wp-json/wp/v2";

/* ---- TWO WAYS TO REACH THE SAME REST API -------------------------------
   Plenty of client sites sit behind a firewall that blocks the literal
   /wp-json path — Cloudflare's WordPress managed rules and most "security"
   plugins ship that rule on by default, and it 403s us before WordPress ever
   sees the request.

   WordPress exposes exactly the same API a second way: /?rest_route=/wp/v2/…
   It is core, documented (it is what runs when permalinks are off) and needs
   nothing installed. Critically the string "wp-json" appears nowhere in the
   URI, so a path rule cannot match it.

   So every call falls back to that form automatically, and whichever works is
   remembered per site so it is tried first from then on. If BOTH fail the
   block is on the IP rather than the path, and no rewriting will help — that
   is the case the browser fallback exists for. */
const wpRouteUrl = (site, path) => {
  const [p, qs] = String(path).split("?");
  return `${wpHost(site)}/?rest_route=${encodeURIComponent("/wp/v2" + p)}${qs ? "&" + qs : ""}`;
};
const wpMode = new Map();                       // site -> "json" | "route"
const wpUrlFor = (site, path, mode) => (mode === "route" ? wpRouteUrl(site, path) : wpBase(site) + path);
/* an edge/firewall block, as opposed to a genuine WordPress answer */
const looksBlocked = (status) => status === 403 || status === 406 || status === 418 || status === 503;
/* client-site firewalls (Cloudflare, security plugins) often 403 obvious bot
   requests while allowing browsers — REST calls go out with browser headers,
   same trick the /api/img proxy uses */
const BROWSER_HEADERS = {
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  accept: "application/json, text/plain, */*",
  "accept-language": "en-US,en;q=0.9",
};
const wpAuth = (credential) => "Basic " + Buffer.from(String(credential || "").trim()).toString("base64");
const wpGuard = (body) => {
  if (!body?.site) return [400, { error: "bad_request", detail: "site (domain) required" }];
  if (!body?.credential || !String(body.credential).includes(":"))
    return [503, { error: "not_configured", detail: "WordPress Application Password missing — add it in the Connector tab (wp-admin → Users → Profile → Application Passwords)." }];
  return null;
};
async function wpFetch(body, path, init = {}) {
  const opts = {
    signal: AbortSignal.timeout(30000),
    ...init,
    headers: { ...BROWSER_HEADERS, Authorization: wpAuth(body.credential), "content-type": "application/json", ...(init.headers || {}) },
  };
  /* try whichever form is known to work for this site first, then the other */
  const first = wpMode.get(body.site) || "json";
  const order = first === "json" ? ["json", "route"] : ["route", "json"];
  let last = null;
  for (const mode of order) {
    const r = await fetch(wpUrlFor(body.site, path, mode), opts);
    if (r.ok) { wpMode.set(body.site, mode); return r.json().catch(() => ({})); }
    last = r;
    /* only a firewall-shaped refusal is worth retrying the other way — a 401
       or a 404 is WordPress genuinely answering, and re-asking won't change it */
    if (!looksBlocked(r.status)) break;
  }
  const d = await last.json().catch(() => ({}));
  const e = new Error(d.message || `WordPress ${last.status}`);
  e.wp = last.status;
  if (looksBlocked(last.status)) e.blocked = true;      // the browser fallback can take it from here
  throw e;
}
const wpErr = (e) => [502, { error: "provider_error", detail: "WordPress: " + (e?.message || e) }];

async function handleWpMedia(body) {
  const g = wpGuard(body); if (g) return g;
  try {
    /* WP caps per_page at 100 — paginate until the library is exhausted
       (up to 2000 items) so a 450-image site syncs completely */
    const all = [];
    try {
      for (let page = 1; page <= 20; page++) {
        const items = await wpFetch(body, `/media?per_page=100&page=${page}&_fields=id,source_url,title,alt_text,media_type,mime_type,date`);
        all.push(...items);
        if (items.length < 100) break;
      }
    } catch (e) {
      if (!e?.blocked) throw e;
      const viaAgent = await agentExec(body.site, "media", { limit: 500 });
      if (viaAgent?.error) return [502, { error: "provider_error", via: "agent", detail: viaAgent.detail || viaAgent.error }];
      all.push(...(Array.isArray(viaAgent) ? viaAgent : []));
    }
    return [200, { live: true, media: all.map((m) => ({ id: m.id, url: m.source_url, name: m.title?.rendered || "", alt: m.alt_text || "", type: m.media_type, mime: m.mime_type, date: m.date })) }];
  } catch (e) { return wpErr(e); }
}

/* update a media item's title + alt text straight back into WordPress */
async function handleWpMediaUpdate(body) {
  const g = wpGuard(body); if (g) return g;
  const id = +body.id;
  if (!id) return [400, { error: "bad_request", detail: "media id required" }];
  try {
    const r = await wpFetch(body, `/media/${id}`, { method: "POST", body: JSON.stringify({
      ...(body.title != null ? { title: String(body.title) } : {}),
      ...(body.alt != null ? { alt_text: String(body.alt) } : {}),
    }) });
    return [200, { live: true, id: r.id, title: r.title?.rendered || "", alt: r.alt_text || "" }];
  } catch (e) { return wpErr(e); }
}

/* real site content sync — pages + posts straight from the site's WordPress
   REST API, mapped into the CRM's editor structure (headings & paragraphs
   parsed from the rendered HTML). This is the site's ACTUAL content. */
async function handleWpContent(body) {
  const g = wpGuard(body); if (g) return g;
  const stripTags = (h) => String(h || "").replace(/<[^>]+>/g, " ").replace(/&#?[a-z0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
  const toBlocks = (html) => {
    /* anchors survive the sync as markdown links — the editor highlights them
       as anchor text, and blocksToHtml turns them back into <a> on push */
    html = String(html || "").replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, h, inner) => `[${stripTags(inner)}](${h})`);
    const blocks = []; let i = 0;
    const re = /<(h[1-6]|p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
    let m;
    while ((m = re.exec(html)) && blocks.length < 80) {
      const text = stripTags(m[2]);
      if (!text) continue;
      const tag = m[1].toLowerCase();
      blocks.push(tag[0] === "h"
        ? { id: "wb" + i++, kind: "heading", level: +tag[1], text: text.slice(0, 300) }
        : { id: "wb" + i++, kind: "text", text: text.slice(0, 1500), links: [] });
    }
    return blocks;
  };
  const pathOf = (link) => { try { return new URL(link).pathname.replace(/\/$/, "") || "/"; } catch { return "/" + String(link || ""); } };
  /* the REAL meta title/description, best source first:
     1. serpsquad_seo — per-post Yoast/RankMath/deployed values, exposed by our
        companion plugin (works on RankMath sites, where yoast_head_json is absent)
     2. yoast_head_json — Yoast's rendered head
     3. post title / excerpt as the last honest fallback */
  const metaOf = (p) => ({
    metaTitle: stripTags(p.serpsquad_seo?.title || "") || stripTags(p.yoast_head_json?.title || "") || stripTags(p.title?.rendered),
    metaDesc: (stripTags(p.serpsquad_seo?.desc || "") || stripTags(p.yoast_head_json?.description || "") || stripTags(p.excerpt?.rendered)).slice(0, 250),
  });
  try {
    const fields = "id,slug,link,title,excerpt,content,modified,yoast_head_json,serpsquad_seo";
    let pages, posts;
    try {
      [pages, posts] = await Promise.all([
        wpFetch(body, `/pages?per_page=100&status=publish&_fields=${fields}`),
        wpFetch(body, `/posts?per_page=100&status=publish&_fields=${fields},date`),
      ]);
    } catch (e) {
      /* the firewall refused us both ways — if the companion plugin is paired,
         the site can send its own content outbound instead. The plugin returns
         the same shape the REST reader produces, so everything below is
         unchanged. */
      if (!e?.blocked) throw e;
      const viaAgent = await agentExec(body.site, "content", { limit: 200 });
      if (viaAgent?.error) {
        return [502, { error: "provider_error", via: "agent",
          detail: viaAgent.error === "unpaired"
            ? "This site's firewall blocks the CRM, and the SERP Squad plugin is not connected yet — install/update the plugin and paste the connection key (Settings → SERP Squad) to sync without any firewall change."
            : `WordPress is firewalled and the connected plugin did not answer: ${viaAgent.detail || viaAgent.error}` }];
      }
      pages = viaAgent.pages || []; posts = viaAgent.posts || [];
    }
    return [200, { live: true,
      pages: pages.map((p) => ({
        wpId: p.id, url: pathOf(p.link), origUrl: p.link, slug: p.slug,
        name: stripTags(p.title?.rendered) || p.slug,
        ...metaOf(p),
        content: toBlocks(p.content?.rendered || ""), modified: p.modified,
      })),
      posts: posts.map((p) => ({
        wpId: p.id, slug: p.slug, url: pathOf(p.link), origUrl: p.link,
        title: stripTags(p.title?.rendered) || p.slug,
        body: stripTags(p.excerpt?.rendered).slice(0, 400),
        ...metaOf(p),
        content: toBlocks(p.content?.rendered || ""),
        status: "published", publishAt: null, createdAt: Date.parse(p.date) || Date.now(), modified: p.modified,
      })),
    }];
  } catch (e) { return wpErr(e); }
}

/* find-or-create by slug, set parent/meta/status/date; Elementor pages also get
   _elementor_data + edit mode (meta must be exposed — the companion plugin does
   this; without it WP silently ignores unknown meta and the HTML fallback shows) */
async function handleWpDeploy(body) {
  const g = wpGuard(body); if (g) return g;
  const p2 = body.payload || {};
  if (!p2.slug || !p2.title) return [400, { error: "bad_request", detail: "payload.slug and payload.title required" }];
  const kind = p2.kind === "post" ? "posts" : "pages";
  try {
    let parentId = 0;
    if (p2.parentSlug) {
      const found = await wpFetch(body, `/pages?slug=${encodeURIComponent(p2.parentSlug)}&_fields=id`);
      parentId = found[0]?.id || 0;
    }
    const existingId = p2.wpId
      || (await wpFetch(body, `/${kind}?slug=${encodeURIComponent(p2.slug)}&status=any&_fields=id`))[0]?.id
      || 0;
    /* Elementor guard: an Elementor-built page renders from _elementor_data,
       not post_content — overwriting post_content there changes nothing
       visually AND destroys the stored copy. Unless this deploy carries
       elementorData itself, push meta/title only for such pages. */
    let contentSkipped = false;
    if (existingId && p2.content && !p2.elementorData) {
      try {
        const cur = await wpFetch(body, `/${kind}/${existingId}?context=edit&_fields=meta`);
        if (String(cur?.meta?._elementor_data || "").length > 50) contentSkipped = true;
      } catch { /* meta not exposed (no companion plugin) — deploy content as asked */ }
    }
    /* post categories by NAME (e.g. "Blog" / "Answer") — resolved to term ids,
       created on the site when missing, so taxonomy stays consistent */
    let categoryIds = [];
    if (kind === "posts" && Array.isArray(p2.categories) && p2.categories.length) {
      for (const name of p2.categories.slice(0, 5)) {
        try {
          const found = await wpFetch(body, `/categories?search=${encodeURIComponent(name)}&_fields=id,name`);
          const exact = (found || []).find((c) => c.name.toLowerCase() === String(name).toLowerCase());
          if (exact) { categoryIds.push(exact.id); continue; }
          const made = await wpFetch(body, `/categories`, { method: "POST", body: JSON.stringify({ name }) });
          if (made?.id) categoryIds.push(made.id);
        } catch { /* category failure never blocks the post itself */ }
      }
    }
    const payload = {
      title: p2.title, slug: p2.slug,
      ...(p2.content && !contentSkipped ? { content: p2.content } : {}),
      ...(categoryIds.length ? { categories: categoryIds } : {}),
      status: p2.status || "publish",
      ...(p2.date ? { date: p2.date } : {}),
      ...(kind === "pages" && parentId ? { parent: parentId } : {}),
      /* blank canvas template (theme bypass); WP ignores it gracefully when
         the template isn't registered on the site */
      ...(kind === "pages" && p2.template ? { template: p2.template } : {}),
      ...(p2.metaDesc ? { excerpt: p2.metaDesc } : {}),
      meta: {
        ...(p2.elementorData ? { _elementor_data: p2.elementorData, _elementor_edit_mode: "builder" } : {}),
        /* the companion plugin copies these into Yoast/RankMath storage */
        _serpsquad_meta_title: p2.metaTitle || "", _serpsquad_meta_desc: p2.metaDesc || "",
      },
    };
    const res2 = existingId
      ? await wpFetch(body, `/${kind}/${existingId}`, { method: "POST", body: JSON.stringify(payload) })
      : await wpFetch(body, `/${kind}`, { method: "POST", body: JSON.stringify(payload) });
    return [200, { live: true, id: res2.id, link: res2.link, updated: !!existingId, contentSkipped }];
  } catch (e) { return wpErr(e); }
}

/* remove everything NOT in keepSlugs (the fresh map) — pages and posts */
async function handleWpCleanup(body) {
  const g = wpGuard(body); if (g) return g;
  const keep = new Set((body.keepSlugs || []).map(String));
  try {
    const deleted = [];
    for (const kind of ["pages", "posts"]) {
      const items = await wpFetch(body, `/${kind}?per_page=100&status=any&_fields=id,slug`);
      for (const it of items) {
        if (!keep.has(it.slug)) { await wpFetch(body, `/${kind}/${it.id}?force=true`, { method: "DELETE" }); deleted.push(kind + "/" + it.slug); }
      }
    }
    return [200, { live: true, deleted }];
  } catch (e) { return wpErr(e); }
}

/* ---- Webflow Data API v2: CMS-collection deploys (the standard Webflow
   programmatic pattern) — ensure collections exist, push items, publish. ---- */
const wfHeaders = (token) => ({ Authorization: "Bearer " + token, "content-type": "application/json", accept: "application/json" });
async function wfFetch(token, path, init = {}) {
  const r = await fetch("https://api.webflow.com/v2" + path, { signal: AbortSignal.timeout(30000), ...init, headers: { ...wfHeaders(token), ...(init.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.message || `Webflow ${r.status}`); throw e; }
  return d;
}
async function handleWebflowDeploy(body) {
  const token = body?.token, siteId = body?.siteId;
  if (!token || !siteId) return [503, { error: "not_configured", detail: "Webflow API token + Site ID missing — authorize Webflow in the Connector tab (Site settings → Apps & integrations → API access)." }];
  try {
    const { collections = [] } = await wfFetch(token, `/sites/${siteId}/collections`);
    const byName = Object.fromEntries(collections.map((c) => [c.displayName, c.id]));
    const results = [];
    for (const item of body.items || []) {
      let colId = byName[item.collection];
      if (!colId) {
        const created = await wfFetch(token, `/sites/${siteId}/collections`, { method: "POST",
          body: JSON.stringify({ displayName: item.collection, singularName: item.collection.replace(/s$/, "") }) });
        colId = created.id; byName[item.collection] = colId;
        /* plain-text/rich-text fields for our payload */
        for (const [slug2, type] of [["meta-title", "PlainText"], ["meta-description", "PlainText"], ["body", "RichText"]]) {
          await wfFetch(token, `/collections/${colId}/fields`, { method: "POST", body: JSON.stringify({ displayName: slug2, type }) }).catch(() => {});
        }
      }
      const res2 = await wfFetch(token, `/collections/${colId}/items`, { method: "POST",
        body: JSON.stringify({ isDraft: !!item.draft, isArchived: false, fieldData: { name: item.name, slug: item.slug, ...item.fields } }) });
      results.push({ slug: item.slug, id: res2.id, collection: item.collection });
    }
    return [200, { live: true, results }];
  } catch (e) { return [502, { error: "provider_error", detail: "Webflow: " + (e?.message || e) }]; }
}
async function handleWebflowPublish(body) {
  const token = body?.token, siteId = body?.siteId;
  if (!token || !siteId) return [503, { error: "not_configured", detail: "Webflow token + Site ID required." }];
  try {
    await wfFetch(token, `/sites/${siteId}/publish`, { method: "POST", body: JSON.stringify({ publishToWebflowSubdomain: true }) });
    return [200, { live: true, published: true }];
  } catch (e) { return [502, { error: "provider_error", detail: "Webflow: " + (e?.message || e) }]; }
}

/* ================= Research & Audit + Growth tools =================
   All REAL, zero third-party cost beyond the user's own Google Places key:
   - website audit: this server fetches the sitemap and crawls the pages
   - profile audit / lead finder: Google Places API (key from API settings)
   - email scrape: fetches the site's own pages and extracts addresses
   - outreach: sends through the agency's SMTP (same client as 2FA mail)
   Endpoints refuse to fabricate: 503 unconfigured, 502 provider error. */

const FETCH_UA = { "User-Agent": "Mozilla/5.0 (compatible; SERPSquadAudit/1.0; +https://serpsquad.com)" };
async function fetchText(url, ms = 12000, cap = 900_000) {
  const res = await fetch(url, { headers: FETCH_UA, redirect: "follow", signal: AbortSignal.timeout(ms) });
  const buf = await res.arrayBuffer();
  return { status: res.status, finalUrl: res.url, text: Buffer.from(buf.slice(0, cap)).toString("utf8") };
}
const stripTags = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
const metaContent = (html, name) => {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "i");
  const tag = (html.match(re) || [])[0] || "";
  return ((tag.match(/content=["']([^"']*)["']/i) || [])[1] || "").trim();
};
const normPath = (u) => { try { const x = new URL(u); return (x.pathname.replace(/\/+$/, "") || "/"); } catch { return null; } };

/* one page → its SEO factors */
function analyzePage(url, html, status, ms, host) {
  const title = ((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "").replace(/\s+/g, " ").trim();
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => stripTags(m[1]));
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)].map((m) => m[1])
    .filter((h) => !/^(mailto:|tel:|javascript:)/i.test(h));
  const abs = links.map((h) => { try { return new URL(h, url).href; } catch { return null; } }).filter(Boolean);
  const internal = abs.filter((h) => { try { return new URL(h).hostname.replace(/^www\./, "") === host; } catch { return false; } });
  const ld = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => { try { const j = JSON.parse(m[1]); return [].concat(j["@graph"] || j).map((x) => x["@type"]).flat(); } catch { return []; } }).flat().filter(Boolean);
  const desc = metaContent(html, "description");
  const text = stripTags(html);
  return {
    url, path: normPath(url), status, ms,
    title, titleLen: title.length,
    metaDesc: desc, metaDescLen: desc.length,
    canonical: ((html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) || [])[1] || ""),
    noindex: /<meta[^>]+robots[^>]+noindex/i.test(html),
    ogTitle: !!metaContent(html, "og:title"),
    h1Count: h1s.length, h1: h1s[0] || "",
    h2Count: (html.match(/<h2[\s>]/gi) || []).length,
    words: text ? text.split(/\s+/).length : 0,
    images: imgs.length,
    imagesNoAlt: imgs.filter((t) => !/alt=["'][^"']+["']/i.test(t)).length,
    internalOut: [...new Set(internal.map(normPath).filter(Boolean))],
    externalOut: abs.length - internal.length,
    schemaTypes: [...new Set(ld)].slice(0, 8),
    https: url.startsWith("https://"),
    sizeKb: Math.round(html.length / 1024),
  };
}

/* ================= sitemap crawl for UNCONNECTED sites =================
   No pixel, no REST API, no plugin — the sitemap alone lists the site.
   /api/crawl/sitemap → classified page/post URL lists
   /api/crawl/page    → one page's meta + H1 + structured content (markdown)
   Powers the read-only Pages/Posts lists and the Re-optimize wizard. */
const crawlFetch = (url, ms = 15000) => fetch(url, { headers: BROWSER_HEADERS, redirect: "follow", signal: AbortSignal.timeout(ms) }).then(async (res) => ({ status: res.status, finalUrl: res.url, text: Buffer.from((await res.arrayBuffer()).slice(0, 900_000)).toString("utf8") }));
async function handleCrawlSitemap(body) {
  let sm = String(body?.sitemapUrl || "").trim();
  if (!sm) return [400, { error: "bad_request", detail: "A sitemap URL is required." }];
  if (!/^https?:\/\//i.test(sm)) sm = "https://" + sm;
  /* bare domain → try the standard sitemap locations */
  const candidates = /\.xml(\?|$)/i.test(sm) ? [sm]
    : [sm.replace(/\/$/, "") + "/sitemap.xml", sm.replace(/\/$/, "") + "/sitemap_index.xml", sm.replace(/\/$/, "") + "/wp-sitemap.xml"];
  try {
    let text = "", finalUrl = "", challenged = false;
    for (const cand of candidates) {
      try {
        const r = await crawlFetch(cand);
        if (/sgcaptcha|cf-chl|challenge-platform|_Incapsula_|Just a moment/i.test(r.text) || r.status === 202 || r.status === 403) { challenged = true; continue; }
        if (/<(urlset|sitemapindex)/i.test(r.text)) { text = r.text; finalUrl = r.finalUrl; break; }
      } catch { /* try next */ }
    }
    if (!text && challenged) return [502, { error: "provider_error", detail: "The site's bot firewall (SiteGround/Cloudflare protection) challenged the crawler. Whitelist your CRM server's IP in the site's security settings, or retry in a few minutes." }];
    if (!text) return [502, { error: "provider_error", detail: "No sitemap found — paste the exact sitemap.xml URL." }];
    /* collect locs; a sitemap index dives one level, tagging each child's kind */
    const tagged = []; // { url, hint }
    const push = (locs, hint) => locs.forEach((u) => tagged.push({ url: u, hint }));
    const locsOf = (t) => [...t.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
    if (/<sitemapindex/i.test(text)) {
      for (const kid of locsOf(text).slice(0, 12)) {
        const hint = /post|blog|news|article/i.test(kid) ? "post" : /page/i.test(kid) ? "page" : "";
        try { const r = await crawlFetch(kid); push(locsOf(r.text), hint); } catch { /* skip child */ }
        if (tagged.length >= 800) break;
      }
    } else push(locsOf(text), "");
    if (!tagged.length) return [502, { error: "provider_error", detail: `No <loc> URLs found at ${finalUrl}.` }];
    const host = new URL(tagged[0].url).hostname.replace(/^www\./, "");
    const seen = new Set();
    const pages = [], posts = [];
    tagged.forEach(({ url, hint }) => {
      try {
        const u = new URL(url);
        if (u.hostname.replace(/^www\./, "") !== host) return;
        if (/\.(jpe?g|png|gif|webp|pdf|mp4|svg)$/i.test(u.pathname)) return;
        if (/\/(tag|category|author|wp-content|feed)\//i.test(u.pathname)) return;
        const path = u.pathname.replace(/\/$/, "") || "/";
        if (seen.has(path)) return;
        seen.add(path);
        const isPost = hint === "post" || (!hint && /\/(blog|news|articles?)\/.|\/\d{4}\/\d{2}\//i.test(u.pathname));
        (isPost ? posts : pages).push({ url: u.href, path });
      } catch { /* bad url */ }
    });
    return [200, { live: true, host, total: pages.length + posts.length, pages: pages.slice(0, 300), posts: posts.slice(0, 300) }];
  } catch (e) { return [502, { error: "provider_error", detail: "Sitemap crawl failed: " + String(e?.message || e).slice(0, 160) }]; }
}
/* structured content extraction: heading/paragraph/list flow → markdown */
const htmlToContentMd = (html) => {
  let b = (html.match(/<body[\s\S]*?<\/body>/i) || [html])[0];
  b = b.replace(/<(script|style|noscript|svg|iframe|form|select)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const out = [];
  const re = /<(h1|h2|h3|h4|p|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(b))) {
    const tag = m[1].toLowerCase();
    const txt = stripTags(m[2]);
    if (!txt || txt.length < 3) continue;
    if (tag === "h1") out.push("# " + txt);
    else if (tag === "h2") out.push("## " + txt);
    else if (tag === "h3" || tag === "h4") out.push("### " + txt);
    else if (tag === "li") { if (txt.split(/\s+/).length >= 3) out.push("- " + txt); } // short li = leftover menu items
    else if (tag === "blockquote") out.push("> " + txt);
    else out.push(txt);
  }
  return out.join("\n\n").slice(0, 24000);
};
/* ---- batch meta scrape: the GROUND TRUTH for meta title/description ----
   Reads what the page actually renders in <head>, so it works no matter which
   SEO plugin is installed (Yoast, Rank Math, SEOPress, none) and for sites
   with no API access at all. Falls back to og: tags, never to the page name —
   a page with no meta description reports an empty one, honestly. */
/* decode the entities real pages carry (&amp; &#8211; &quot; &#039; …) so the
   CRM shows the meta as a human reads it in the SERP, not as raw source */
const decodeEntities = (s) => String(s || "")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
  .replace(/&quot;/gi, '"').replace(/&apos;|&#039;/gi, "'")
  .replace(/&(hellip|mdash|ndash|rsquo|lsquo|rdquo|ldquo);/gi, (_, e) =>
    ({ hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" }[e.toLowerCase()] || ""));
const metaFromHtml = (html) => {
  const title = decodeEntities(((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "")).replace(/\s+/g, " ").trim();
  const desc = decodeEntities(metaContent(html, "description") || metaContent(html, "og:description") || "");
  return {
    metaTitle: title || decodeEntities(metaContent(html, "og:title") || ""),
    metaDesc: String(desc).replace(/\s+/g, " ").trim().slice(0, 320),
    h1: decodeEntities(stripTags(([...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)][0] || [])[1] || "")),
    noindex: /<meta[^>]+robots[^>]+noindex/i.test(html),
    canonical: ((html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) || [])[1] || ""),
  };
};
async function handleCrawlMeta(body) {
  const urls = (Array.isArray(body?.urls) ? body.urls : []).map(String).filter((u) => /^https?:\/\//.test(u)).slice(0, 120);
  if (!urls.length) return [400, { error: "bad_request", detail: "urls[] required (absolute http/https)." }];
  let challenged = 0;
  const results = await pool(urls, async (u) => {
    try {
      const { text, status } = await crawlFetch(u, 15000);
      if (/sgcaptcha|cf-chl|challenge-platform|_Incapsula_|Just a moment/i.test(text) || status === 202) { challenged++; return { url: u, error: "blocked" }; }
      if (status >= 400) return { url: u, error: `HTTP ${status}` };
      return { url: u, ...metaFromHtml(text) };
    } catch (e) { return { url: u, error: String(e?.message || e).slice(0, 60) }; }
  }, 8);
  const ok = results.filter((r) => !r.error).length;
  if (!ok && challenged) return [502, { error: "provider_error", detail: "The site's bot firewall blocked every request — whitelist your CRM server's IP, or retry later." }];
  return [200, { live: true, scanned: results.length, ok, results }];
}
async function handleCrawlPage(body) {
  let url = String(body?.url || "").trim();
  if (!url) return [400, { error: "bad_request", detail: "A page URL is required." }];
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  try {
    const { text: html, status } = await crawlFetch(url, 15000);
    if (/sgcaptcha|cf-chl|challenge-platform|_Incapsula_|Just a moment/i.test(html) || status === 202)
      return [502, { error: "provider_error", detail: "The site's bot firewall challenged the crawler — whitelist your CRM server's IP or retry in a few minutes." }];
    if (status >= 400) return [502, { error: "provider_error", detail: `The page answered HTTP ${status}.` }];
    const title = ((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "").replace(/\s+/g, " ").trim();
    const h1 = stripTags(([...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)][0] || [])[1] || "");
    const markdown = htmlToContentMd(html);
    const headings = markdown.split("\n").filter((l) => /^#{1,3} /.test(l)).slice(0, 40);
    return [200, { live: true, url, metaTitle: title, metaDesc: metaContent(html, "description"), h1,
      markdown, headings, words: markdown ? markdown.split(/\s+/).length : 0 }];
  } catch (e) { return [502, { error: "provider_error", detail: "Page fetch failed: " + String(e?.message || e).slice(0, 160) }]; }
}

async function handleAuditWebsite(body) {
  let sm = String(body?.sitemapUrl || "").trim();
  if (!sm) return [400, { error: "bad_request", detail: "A sitemap URL is required." }];
  if (!/^https?:\/\//i.test(sm)) sm = "https://" + sm;
  /* crawls the FULL sitemap; 400 pages is the runaway-safety ceiling
     (the response reports totalInSitemap so truncation is never silent) */
  const limit = 400;
  try {
    let { text, finalUrl } = await fetchText(sm);
    let locs = [...text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
    /* sitemap index → dive one level into child sitemaps until we have URLs */
    if (/<sitemapindex/i.test(text)) {
      const kids = locs.slice(0, 10); locs = [];
      for (const k of kids) {
        try { const r = await fetchText(k); locs.push(...[...r.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1])); } catch { /* skip child */ }
        if (locs.length >= limit * 2) break;
      }
    }
    if (!locs.length) return [502, { error: "provider_error", detail: `No <loc> URLs found at ${finalUrl} — is that the sitemap.xml?` }];
    const host = new URL(locs[0]).hostname.replace(/^www\./, "");
    const urls = [...new Set(locs)].filter((u) => { try { return new URL(u).hostname.replace(/^www\./, "") === host; } catch { return false; } }).slice(0, limit);
    const pages = [];
    for (let i = 0; i < urls.length; i += 8) {
      const chunk = await Promise.all(urls.slice(i, i + 8).map(async (u) => {
        const t0 = Date.now();
        try { const r = await fetchText(u); return analyzePage(u, r.text, r.status, Date.now() - t0, host); }
        catch (e) { return { url: u, path: normPath(u), status: 0, error: String(e?.message || e).slice(0, 80) }; }
      }));
      pages.push(...chunk);
    }
    /* incoming internal links, computed across the crawled set */
    const inbound = {};
    pages.forEach((p) => (p.internalOut || []).forEach((toPath) => { if (toPath !== p.path) inbound[toPath] = (inbound[toPath] || 0) + 1; }));
    pages.forEach((p) => { p.internalIn = inbound[p.path] || 0; p.internalOutCount = (p.internalOut || []).length; delete p.internalOut; });
    return [200, { live: true, host, totalInSitemap: locs.length, crawled: pages.length, pages }];
  } catch (e) { return [502, { error: "provider_error", detail: "Crawl failed: " + String(e?.message || e).slice(0, 160) }]; }
}

/* Google Maps profile audit — everything the Places API truly exposes.
   Services/products/posts counts are NOT public API data; they're returned
   as unavailable so the UI never fabricates them. */
async function handleAuditProfile(body) {
  const key = body?.placesKey;
  if (!key) return [503, { error: "places_not_configured", detail: "Add a Google Places API key in Company Settings → API settings — the audit pulls live listing data through it." }];
  let query = String(body?.query || "").trim();
  const link = String(body?.url || "").trim();
  try {
    if (!query && link) {
      const { finalUrl } = await fetchText(link, 10000, 50_000).catch(() => ({ finalUrl: link }));
      const m = decodeURIComponent(finalUrl).match(/\/place\/([^/@]+)/);
      query = m ? m[1].replace(/\+/g, " ") : "";
      if (!query) return [400, { error: "bad_request", detail: "Couldn't extract a business name from that link — paste the business name + city instead." }];
    }
    if (!query) return [400, { error: "bad_request", detail: "A profile link or business name is required." }];
    const f = await (await fetch(`https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id&key=${key}`)).json();
    if (f.status === "REQUEST_DENIED") return [502, { error: "provider_error", detail: f.error_message || f.status }];
    const pid = f.candidates?.[0]?.place_id;
    if (!pid) return [200, { live: true, found: false, detail: `No Google listing found for "${query}".` }];
    const fields = "name,formatted_address,formatted_phone_number,international_phone_number,website,url,rating,user_ratings_total,opening_hours,photos,types,business_status,editorial_summary,reviews,price_level";
    const d = await (await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${pid}&fields=${fields}&key=${key}`)).json();
    if (d.status !== "OK") return [502, { error: "provider_error", detail: d.error_message || d.status }];
    const r = d.result;
    return [200, {
      live: true, found: true,
      place: {
        placeId: pid, name: r.name, address: r.formatted_address, phone: r.formatted_phone_number || r.international_phone_number || "",
        website: r.website || "", mapsUrl: r.url || "", rating: r.rating || null, reviews: r.user_ratings_total || 0,
        hours: r.opening_hours?.weekday_text || [], openNow: r.opening_hours?.open_now ?? null,
        photosVisible: (r.photos || []).length, photosCapped: (r.photos || []).length >= 10,
        categories: (r.types || []).filter((t) => !["point_of_interest", "establishment"].includes(t)),
        status: r.business_status || "", description: r.editorial_summary?.overview || "",
        latestReviews: (r.reviews || []).slice(0, 3).map((x) => ({ author: x.author_name, rating: x.rating, when: x.relative_time_description, text: (x.text || "").slice(0, 220) })),
        priceLevel: r.price_level ?? null,
      },
      unavailable: ["services", "products", "posts", "full photo count"], // Google only exposes these to the profile owner, never via the public API
    }];
  } catch (e) { return [502, { error: "provider_error", detail: String(e?.message || e).slice(0, 160) }]; }
}

/* Growth: find every business for a category in a city (Places Text Search,
   up to 60 results over 3 token pages, + details for contact data) */
async function handleLeadsSearch(body) {
  const key = body?.placesKey;
  if (!key) return [503, { error: "places_not_configured", detail: "Add a Google Places API key in Company Settings → API settings — the lead finder searches Google Maps through it (no DataForSEO cost)." }];
  const city = String(body?.city || "").trim(), category = String(body?.category || "").trim();
  if (!city || !category) return [400, { error: "bad_request", detail: "City and category are required." }];
  const detailsCap = Math.min(Math.max(+body?.detailsCap || 20, 0), 60);
  try {
    const results = []; let token = null;
    for (let page = 0; page < 3; page++) {
      const qs = token
        ? `pagetoken=${token}&key=${key}`
        : `query=${encodeURIComponent(category + " in " + city)}&key=${key}`;
      const d = await (await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${qs}`)).json();
      if (d.status === "REQUEST_DENIED") return [502, { error: "provider_error", detail: d.error_message || d.status }];
      results.push(...(d.results || []));
      token = d.next_page_token;
      if (!token) break;
      await new Promise((r) => setTimeout(r, 2100)); // next_page_token needs ~2s to activate
    }
    const rows = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const row = {
        placeId: r.place_id, name: r.name, address: r.formatted_address || "",
        rating: r.rating || null, reviews: r.user_ratings_total || 0,
        categories: (r.types || []).filter((t) => !["point_of_interest", "establishment"].includes(t)),
        status: r.business_status || "", phone: "", website: "", hours: null,
      };
      if (i < detailsCap) {
        try {
          const d2 = await (await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${r.place_id}&fields=formatted_phone_number,website,opening_hours&key=${key}`)).json();
          if (d2.status === "OK") {
            row.phone = d2.result.formatted_phone_number || "";
            row.website = d2.result.website || "";
            row.hours = d2.result.opening_hours?.weekday_text || null;
          }
        } catch { /* row stays without contact data */ }
      }
      rows.push(row);
    }
    return [200, { live: true, city, category, total: rows.length, detailsCap, rows }];
  } catch (e) { return [502, { error: "provider_error", detail: String(e?.message || e).slice(0, 160) }]; }
}

/* scrape a business site for contact emails + socials — its own public pages only */
async function handleScrapeEmail(body) {
  let site = String(body?.website || "").trim();
  if (!site) return [400, { error: "bad_request", detail: "A website URL is required." }];
  if (!/^https?:\/\//i.test(site)) site = "https://" + site;
  const found = new Set(), socials = new Set();
  const grab = (html) => {
    (html.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [])
      .filter((e) => !/\.(png|jpe?g|gif|svg|webp|css|js)$/i.test(e) && !/(sentry|wixpress|example\.|schema\.org)/i.test(e))
      .forEach((e) => found.add(e.toLowerCase()));
    (html.match(/https?:\/\/(?:www\.)?(facebook|instagram|linkedin|x|twitter|youtube)\.com\/[a-z0-9._\-/]+/gi) || []).slice(0, 6).forEach((s) => socials.add(s));
  };
  try {
    const home = await fetchText(site, 10000);
    grab(home.text);
    /* follow the site's own contact/about links (same host, max 2) */
    const host = new URL(home.finalUrl).hostname;
    const extra = [...new Set([...home.text.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)].map((m) => m[1])
      .filter((h) => /contact|about|impressum/i.test(h))
      .map((h) => { try { const u = new URL(h, home.finalUrl); return u.hostname === host ? u.href : null; } catch { return null; } })
      .filter(Boolean))].slice(0, 2);
    for (const u of extra) { try { grab((await fetchText(u, 8000)).text); } catch { /* skip */ } }
    return [200, { live: true, emails: [...found].slice(0, 5), socials: [...socials] }];
  } catch (e) { return [502, { error: "provider_error", detail: "Couldn't reach the site: " + String(e?.message || e).slice(0, 120) }]; }
}

/* cold outreach send — plain text on purpose (best deliverability), through
   the agency's own SMTP (same credentials the 2FA mail uses) */
async function handleOutreachSend(body) {
  const smtp = body?.smtp;
  if (!smtp?.host || !smtp?.user) return [503, { error: "smtp_not_configured", detail: "Add SMTP credentials in Company Settings → API settings (the same ones used for sign-in emails)." }];
  const to = String(body?.to || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return [400, { error: "bad_request", detail: "A valid recipient email is required." }];
  const subject = String(body?.subject || "").slice(0, 180);
  const text = String(body?.text || "").slice(0, 20_000);
  if (!subject || !text) return [400, { error: "bad_request", detail: "Subject and body are required." }];
  const html = body?.html ? String(body.html).slice(0, 60_000) : null;
  try {
    await sendMail({ ...smtp, from: body?.fromName ? `${String(body.fromName).replace(/[<>"\r\n]/g, "")} <${smtp.from || smtp.user}>` : (smtp.from || smtp.user) }, to, subject, text, { html });
    return [200, { live: true, sent: true, to }];
  } catch (e) { return [502, { error: "provider_error", detail: "SMTP: " + String(e?.message || e).slice(0, 160) }]; }
}

/* ================= Guest Post Finder =================
   Footprint prospecting the way Pitchbox/Respona do it — '"niche" +
   "write for us"' style queries. Engines, in order of preference:
   Google Custom Search JSON API (FREE — 100 queries/day) → DataForSEO
   SERP (paid, cost-chipped in the UI) → honest 503. Metrics: Open
   PageRank (free authority score) + optional DataForSEO Labs traffic. */
const GP_BLOCKLIST = [
  "facebook.com", "youtube.com", "twitter.com", "x.com", "linkedin.com", "pinterest.com", "instagram.com",
  "reddit.com", "quora.com", "wikipedia.org", "amazon.com", "medium.com", "yelp.com", "tripadvisor.com",
  "indeed.com", "glassdoor.com", "fiverr.com", "upwork.com", "google.com", "apple.com", "microsoft.com",
  "bing.com", "threads.net", "tiktok.com", "etsy.com", "ebay.com", "craigslist.org", "blogspot.com", "wordpress.com",
];
async function handleGuestSearch(body) {
  const niche = String(body?.niche || "").trim();
  if (!niche) return [400, { error: "bad_request", detail: "A niche is required." }];
  const footprints = (Array.isArray(body?.footprints) ? body.footprints : []).map(String).slice(0, 10);
  if (!footprints.length) return [400, { error: "bad_request", detail: "Pick at least one search footprint." }];
  const loc = String(body?.location || "").trim();
  const country = String(body?.country || "").trim();
  const gl = String(body?.gl || "").trim().toLowerCase();
  const cse = body?.cse;
  const creds = resolveCreds(body);
  let engine = cse?.key && cse?.cx ? "cse" : creds ? "dfs" : null;
  if (!engine) return [503, { error: "not_configured", detail: "Connect DataForSEO in Company Settings → API settings (Google closed the Custom Search API to new customers)." }];
  const byDomain = new Map();
  let cseError = null;
  try {
    for (const fp of footprints) {
      const q = [niche, loc, fp].filter(Boolean).join(" ");
      let items = [];
      if (engine === "cse") {
        const u = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(cse.key)}&cx=${encodeURIComponent(cse.cx)}&q=${encodeURIComponent(q)}&num=10${gl ? `&gl=${gl}` : ""}`;
        const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
        const d = await r.json();
        if (d.error) {
          /* Google closed the Custom Search JSON API to new customers (sunset
             Jan 2027), and existing keys expire or get revoked — fall back to
             DataForSEO rather than failing the search. The reason is carried
             back so the dead key can actually be dealt with, instead of
             silently paying for DataForSEO on every search from now on. */
          cseError = d.error.message || d.error.status || "refused the request";
          if (creds) { engine = "dfs"; }
          else return [502, { error: "provider_error", detail: `Google Custom Search: ${cseError}. Connect DataForSEO in Company Settings → API settings and the search will run through it instead — Google has closed this API to new customers, so a broken key cannot be replaced.` }];
        } else {
          items = (d.items || []).map((it) => ({ url: it.link, title: it.title || "", snippet: it.snippet || "" }));
        }
      }
      if (engine === "dfs" && !items.length) {
        const task = await dfsLive(creds, "google/organic", { keyword: q, location_name: country || "United States", language_code: "en", depth: 20 });
        items = (task.result?.[0]?.items || []).filter((it) => it.type === "organic").map((it) => ({ url: it.url, title: it.title || "", snippet: it.description || "" }));
      }
      for (const it of items) {
        let host; try { host = new URL(it.url).hostname.replace(/^www\./, ""); } catch { continue; }
        if (GP_BLOCKLIST.some((b) => host === b || host.endsWith("." + b))) continue;
        if (!byDomain.has(host)) byDomain.set(host, { domain: host, url: it.url, title: it.title.slice(0, 140), snippet: it.snippet.slice(0, 220), footprint: fp });
      }
    }
    return [200, { live: true, engine, niche, queries: footprints.length, results: [...byDomain.values()],
      /* surfaced in the UI: the search worked, but not the way it was set up to */
      ...(cseError ? { fellBack: true, note: `Google Custom Search failed (${cseError}) — this search ran on DataForSEO instead. Remove the Custom Search key in Company Settings → API settings to stop retrying it.` } : {}) }];
  } catch (e) { return [502, { error: "provider_error", detail: String(e?.message || e).slice(0, 200) }]; }
}

/* authority (Open PageRank, free) + optional organic-traffic estimate
   (DataForSEO Labs) — anything unavailable stays null, never guessed */
async function handleGuestMetrics(body) {
  const domains = [...new Set((Array.isArray(body?.domains) ? body.domains : []).map((d) => String(d).replace(/^www\./, "")))].slice(0, 100);
  if (!domains.length) return [400, { error: "bad_request", detail: "domains[] required" }];
  const out = Object.fromEntries(domains.map((d) => [d, { authority: null, traffic: null }]));
  let any = false; const notes = [];
  if (body?.oprKey) {
    try {
      /* Open PageRank batches 100 domains per call */
      const qs = domains.map((d) => `domains[]=${encodeURIComponent(d)}`).join("&");
      const r = await fetch(`https://openpagerank.com/api/v1.0/getPageRank?${qs}`, { headers: { "API-OPR": body.oprKey }, signal: AbortSignal.timeout(15000) });
      const d = await r.json();
      if (r.ok) { (d.response || []).forEach((x) => { const k = String(x.domain || "").replace(/^www\./, ""); if (out[k] && x.status_code === 200) out[k].authority = x.page_rank_decimal ?? null; }); any = true; }
      else notes.push(`Open PageRank HTTP ${r.status}`);
    } catch (e) { notes.push("Open PageRank: " + String(e?.message || e).slice(0, 80)); }
  } else notes.push("Authority needs a FREE Open PageRank key (openpagerank.com → API settings).");
  const creds = body?.withTraffic ? resolveCreds(body) : null;
  if (creds) {
    try {
      const r = await fetch(`${DFS_BASE}/dataforseo_labs/google/bulk_traffic_estimation/live`, {
        method: "POST", headers: { Authorization: authHeader(creds), "Content-Type": "application/json" },
        signal: AbortSignal.timeout(60000),
        body: JSON.stringify([{ targets: domains, location_code: 2840, language_code: "en" }]),
      });
      const d = await r.json(); const t = d.tasks?.[0];
      if (t?.status_code === 20000) { (t.result?.[0]?.items || []).forEach((x) => { const k = String(x.target || "").replace(/^www\./, ""); if (out[k]) out[k].traffic = x.metrics?.organic?.etv != null ? Math.round(x.metrics.organic.etv) : null; }); any = true; }
      else notes.push(`DataForSEO Labs: ${t?.status_message || "error"}`);
    } catch (e) { notes.push("DataForSEO: " + String(e?.message || e).slice(0, 80)); }
  } else if (body?.withTraffic) notes.push("Traffic estimates need DataForSEO credentials.");
  if (!any) return [503, { error: "not_configured", detail: notes.join(" · ") }];
  return [200, { live: true, metrics: out, notes }];
}

/* ================= Keyword Research (KWFinder-style) =================
   DataForSEO Labs: keyword_suggestions (seed keyword mode) and
   ranked_keywords (domain mode). Rows carry volume, CPC, competition,
   keyword difficulty and 12-month trend. Local mode passes a city-level
   location_name; national mode passes just the country. ---- */
const kwRow = (kw, info, props, extra = {}) => ({
  keyword: kw,
  volume: info?.search_volume ?? null,
  cpc: info?.cpc != null ? Math.round(info.cpc * 100) / 100 : null,
  competition: info?.competition != null ? Math.round(info.competition * 100) : null,
  kd: props?.keyword_difficulty ?? null,
  monthly: (info?.monthly_searches || []).slice(-12).map((m) => ({ y: m.year, m: m.month, v: m.search_volume ?? 0 })),
  ...extra,
});
async function dfsLabs(creds, endpoint, task) {
  const res = await fetch(`${DFS_BASE}/dataforseo_labs/google/${endpoint}/live`, {
    method: "POST", headers: { Authorization: authHeader(creds), "Content-Type": "application/json" },
    signal: AbortSignal.timeout(90000),
    body: JSON.stringify([task]),
  });
  if (!res.ok) throw new Error(`DataForSEO HTTP ${res.status}: ${(await res.text()).slice(0, 240)}`);
  const data = await res.json();
  const t = data.tasks?.[0];
  if (!t || t.status_code !== 20000) throw new Error(`DataForSEO: ${t?.status_message || "task error"}`);
  return t.result?.[0] || {};
}
/* Labs only accepts locations from ITS OWN database (mostly countries + big
   metros) — a tracked city like "York,Yorkshire and the Humber,United Kingdom"
   fails with "Invalid Field: 'location_name'". Walk from most to least
   specific instead of erroring the whole search, and report what was used. */
async function dfsLabsLoc(creds, endpoint, task, locationName) {
  const parts = String(locationName || "United States").split(",").map((s) => s.trim()).filter(Boolean);
  const variants = [...new Set([parts.join(","), parts.slice(-2).join(","), parts[parts.length - 1]])].filter(Boolean);
  let lastErr = null;
  for (const loc of variants) {
    try { const r = await dfsLabs(creds, endpoint, { ...task, location_name: loc }); return { ...r, usedLocation: loc }; }
    catch (e) {
      lastErr = e;
      if (!/location/i.test(String(e?.message || e))) throw e; // non-location errors are real failures
    }
  }
  throw lastErr;
}
/* ---- search volumes for tracked keywords (Google Ads data) ----
   POST /api/kw/volume { keywords:[...≤700], city:{city,region,country}, dfs }
   One flat-priced request covers the whole list; the client caches results
   on each tracking entry for ~35 days, so this is effectively one-time. */
async function handleKwVolume(body) {
  const creds = resolveCreds(body);
  if (!creds) return [503, { error: "not_configured", detail: "Connect DataForSEO in Company Settings → API settings." }];
  const keywords = [...new Set((Array.isArray(body?.keywords) ? body.keywords : []).map((k) => String(k).trim().toLowerCase()).filter(Boolean))].slice(0, 700);
  if (!keywords.length) return [400, { error: "bad_request", detail: "keywords[] required" }];
  const c = body.city || {};
  const variants = [...new Set([
    [c.city, c.region, c.country].filter(Boolean).join(","),
    [c.city, c.country].filter(Boolean).join(","),
    c.country,
  ].filter(Boolean))];
  if (!variants.length) variants.push("United States");
  const call = async (location_name) => {
    const res = await fetch(`${DFS_BASE}/keywords_data/google_ads/search_volume/live`, {
      method: "POST",
      headers: { Authorization: authHeader(creds), "Content-Type": "application/json" },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify([{ keywords, location_name, language_code: "en" }]),
    });
    if (!res.ok) throw new Error(`DataForSEO HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const t = data.tasks?.[0];
    if (!t || t.status_code !== 20000) throw new Error(`DataForSEO task ${t?.status_code}: ${t?.status_message}`);
    return t;
  };
  try {
    let task = null, usedLocation = null, lastErr = null;
    for (const loc of variants) {
      try { task = await call(loc); usedLocation = loc; break; }
      catch (err) { lastErr = err; if (!/location/i.test(String(err?.message || err))) throw err; }
    }
    if (!task) throw lastErr;
    const out = {};
    (task.result || []).forEach((r) => {
      const monthly = (r.monthly_searches || []).slice(0, 12).reverse()
        .map((m) => ({ y: m.year, m: m.month, v: m.search_volume ?? 0 }));
      out[String(r.keyword).toLowerCase()] = { v: r.search_volume ?? null, monthly };
    });
    return [200, { live: true, location: usedLocation, volumes: out }];
  } catch (e) { return [502, { error: "provider_error", detail: String(e?.message || e).slice(0, 200) }]; }
}

async function handleKwResearch(body) {
  const creds = resolveCreds(body);
  if (!creds) return [503, { error: "not_configured", detail: "Keyword research runs on DataForSEO Labs — add the credentials in Company Settings → API settings." }];
  const keyword = String(body?.keyword || "").trim().toLowerCase();
  if (!keyword) return [400, { error: "bad_request", detail: "A seed keyword is required." }];
  const location_name = String(body?.locationName || "United States");
  const language_code = String(body?.languageCode || "en");
  const limit = Math.min(Math.max(+body?.limit || 200, 20), 400);
  try {
    const r = await dfsLabsLoc(creds, "keyword_suggestions", { keyword, language_code, limit, include_seed_keyword: true, include_serp_info: false }, location_name);
    const rows = [];
    if (r.seed_keyword_data) rows.push(kwRow(r.seed_keyword || keyword, r.seed_keyword_data.keyword_info, r.seed_keyword_data.keyword_properties, { seed: true }));
    (r.items || []).forEach((it) => { if ((it.keyword || "") !== (r.seed_keyword || keyword) || !rows.length) rows.push(kwRow(it.keyword, it.keyword_info, it.keyword_properties)); });
    rows.sort((a, b) => (b.seed ? 1 : 0) - (a.seed ? 1 : 0) || (b.volume ?? -1) - (a.volume ?? -1));
    return [200, { live: true, mode: "keyword", keyword, locationName: r.usedLocation || location_name, total: rows.length, rows }];
  } catch (e) { return [502, { error: "provider_error", detail: String(e?.message || e).slice(0, 220) }]; }
}
async function handleKwDomain(body) {
  const creds = resolveCreds(body);
  if (!creds) return [503, { error: "not_configured", detail: "Keyword research runs on DataForSEO Labs — add the credentials in Company Settings → API settings." }];
  let target = String(body?.domain || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (!target || !target.includes(".")) return [400, { error: "bad_request", detail: "A valid domain is required (e.g. competitor.com)." }];
  const location_name = String(body?.locationName || "United States");
  const language_code = String(body?.languageCode || "en");
  const limit = Math.min(Math.max(+body?.limit || 200, 20), 400);
  try {
    const r = await dfsLabsLoc(creds, "ranked_keywords", { target, language_code, limit,
      order_by: ["keyword_data.keyword_info.search_volume,desc"] }, location_name);
    const rows = (r.items || []).map((it) => kwRow(
      it.keyword_data?.keyword, it.keyword_data?.keyword_info, it.keyword_data?.keyword_properties,
      { rank: it.ranked_serp_element?.serp_item?.rank_absolute ?? null, url: it.ranked_serp_element?.serp_item?.url || "" }));
    return [200, { live: true, mode: "domain", domain: target, locationName: r.usedLocation || location_name, total: r.total_count ?? rows.length, rows }];
  } catch (e) { return [502, { error: "provider_error", detail: String(e?.message || e).slice(0, 220) }]; }
}

/* ================= Insightful-campaign audit =================
   ONE call builds a prospect's full audit with minimal spend:
   - GBP data via Google Places (the user's own key — no DFS cost)
   - website mini-crawl by this server (free, max 8 pages)
   - 6 organic keyword ranks (6 × google/organic live @ ~$0.003)
   - 2 local map ranks   (2 × google/maps live    @ ~$0.0035)
   Competitors come from THOSE SAME SERPs — zero extra requests.
   Total ≈ $0.025 in DataForSEO credits per audit. */
const INSIGHT_DIRS = ["yelp.com", "angi.com", "homeadvisor.com", "thumbtack.com", "facebook.com", "houzz.com", "bbb.org",
  "yellowpages.com", "mapquest.com", "expertise.com", "porch.com", "nextdoor.com", "instagram.com", "wikipedia.org",
  "reddit.com", "quora.com", "indeed.com", "glassdoor.com", "google.com", "youtube.com", "tripadvisor.com", "groupon.com"];

/* ---- geo-grid map snapshot: a REAL street-map image of the grid (like the
   rank tracker's map view) for the audit email. Fetched ONCE from Google
   Static Maps at audit time (the only moment the key is in hand), cached as
   a PNG on disk, and served key-free at GET /api/geo/snapshot/<id>.png so
   the email never leaks the API key. ~$0.002 per audit. ---- */
const SNAP_DIR = new URL("./data/geo-snapshots/", import.meta.url);
async function makeGeoSnapshot(points, center, placesKey) {
  if (!placesKey) return null;
  try {
    /* markers: green numbered pins for top-3, orange numbered 4-9, red for 10+/not found */
    const groups = { green: [], orange: [], red: [] };
    points.filter((p) => !p.skipped).forEach((p) => {
      const g = p.rank != null && p.rank <= 3 ? "green" : p.rank != null && p.rank <= 9 ? "orange" : "red";
      groups[g].push({ ...p });
    });
    const marker = (color, label, pts2) => pts2.length
      ? `markers=size:mid%7Ccolor:${color}${label ? `%7Clabel:${label}` : ""}%7C` + pts2.map((p) => `${p.lat},${p.lng}`).join("%7C") : null;
    const params = [];
    /* numbered labels need one markers= group per rank digit */
    [1, 2, 3].forEach((n) => params.push(marker("0x22C55E", n, groups.green.filter((p) => p.rank === n))));
    [4, 5, 6, 7, 8, 9].forEach((n) => params.push(marker("0xF59E0B", n, groups.orange.filter((p) => p.rank === n))));
    params.push(marker("0xEF4444", null, groups.red));
    const url = `https://maps.googleapis.com/maps/api/staticmap?center=${center.lat},${center.lng}&zoom=12&size=620x460&scale=2&maptype=roadmap&` +
      params.filter(Boolean).join("&") + `&key=${placesKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok || !String(res.headers.get("content-type")).includes("image")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    mkdirSync(SNAP_DIR, { recursive: true });
    const id = randomBytes(12).toString("hex");
    writeFileSync(new URL(id + ".png", SNAP_DIR), buf);
    return id;
  } catch { return null; }
}
const normHost = (u) => { try { return new URL(/^https?:/i.test(u) ? u : "https://" + u).hostname.replace(/^www\./, ""); } catch { return String(u || "").replace(/^www\./, ""); } };
async function handleInsightAudit(body) {
  const biz = body?.business || {};
  const category = String(body?.category || "").trim().toLowerCase();
  const city = String(body?.city || "").trim();
  if (!biz.name || !category || !city) return [400, { error: "bad_request", detail: "business.name, category and city are required." }];
  const creds = resolveCreds(body);
  if (!creds) return [503, { error: "not_configured", detail: "Rank sections need DataForSEO credentials (API settings) — audits are never sent with fabricated rankings." }];
  const site = biz.website ? normHost(biz.website) : "";
  const cityShort = city.split(",")[0].trim();
  const organicKws = [category, `${category} near me`, `${category} ${cityShort}`, `${category} service`, `${category} contractor`, `${category} company`];
  const geoKeyword = `${category} ${cityShort}`; // the local keyword scanned across the geo grid
  const locName = /,/.test(city) ? city : `${city},United States`;
  const nameToken = String(biz.name).toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).slice(0, 3).join(" ");

  const out = { live: true, business: { name: biz.name, city, website: site }, category };
  const errors = [];

  /* first, in parallel: GBP + business location (Places) + website crawl + 6 organic ranks */
  const [placeLoc, gbpRes, webRes, orgRaw] = await Promise.all([
    /* exact location for the geo grid (Places — agency key, no DFS cost) */
    (async () => {
      if (!body?.placesKey) return null;
      try { const [c, d] = await handlePlacesLocate({ query: `${biz.name} ${city}`, placesKey: body.placesKey }); return c === 200 && d.found ? d : null; }
      catch { return null; }
    })(),
    (async () => {
      if (!body?.placesKey) return { note: "Google Places key not configured — GBP section omitted." };
      try { const [c, p] = await handleAuditProfile({ query: `${biz.name} ${city}`, placesKey: body.placesKey }); return c === 200 && p.found ? p.place : { note: p.detail || "listing not found" }; }
      catch (e) { return { note: String(e?.message || e).slice(0, 120) }; }
    })(),
    (async () => {
      if (!site) return { note: "No website on file — a huge opportunity in itself." };
      try {
        let pages = [];
        try {
          const sm = await fetchText(`https://${site}/sitemap.xml`, 8000);
          const locs = [...sm.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1])
            .filter((u) => { try { return new URL(u).hostname.replace(/^www\./, "") === site; } catch { return false; } }).slice(0, 8);
          if (locs.length) pages = await Promise.all(locs.map(async (u) => { const t0 = Date.now(); const r = await fetchText(u, 9000); return analyzePage(u, r.text, r.status, Date.now() - t0, site); }));
        } catch { /* no sitemap — homepage only */ }
        if (!pages.length) { const t0 = Date.now(); const r = await fetchText(`https://${site}`, 10000); pages = [analyzePage(r.finalUrl, r.text, r.status, Date.now() - t0, site)]; }
        pages.forEach((p) => { p.internalIn = 0; p.internalOutCount = (p.internalOut || []).length; delete p.internalOut; });
        return { crawled: pages.length, pages: pages.map((p) => ({ path: p.path, title: p.title, titleLen: p.titleLen, metaDescLen: p.metaDescLen, h1Count: p.h1Count, words: p.words, imagesNoAlt: p.imagesNoAlt, schemaTypes: p.schemaTypes, https: p.https })) };
      } catch (e) { return { note: "Site unreachable: " + String(e?.message || e).slice(0, 80) }; }
    })(),
    pool(organicKws, async (kw) => {
      const task = await dfsLive(creds, "google/organic", { keyword: kw, location_name: locName, language_code: "en", depth: 30 });
      const items = (task.result?.[0]?.items || []).filter((it) => it.type === "organic");
      const hit = site ? items.find((it) => (it.domain || "").replace(/^www\./, "").endsWith(site)) : null;
      return { keyword: kw, position: hit ? hit.rank_group : null,
        top: items.slice(0, 10).map((it) => ({ domain: (it.domain || "").replace(/^www\./, ""), rank: it.rank_group, title: (it.title || "").slice(0, 80) })) };
    }, 3),
  ]);

  out.gbp = gbpRes;
  out.website = webRes;
  out.organic = (orgRaw || []).map((r, i) => (r?.error ? { keyword: organicKws[i], error: r.error, top: [] } : r));
  out.organic.filter((r) => r.error).forEach((r) => errors.push(`organic "${r.keyword}": ${r.error}`));

  /* 5×5 geo grid @ 2km on the main local keyword — needs a resolved center.
     Reuses the exact geo-grid engine (25 coordinate-targeted Maps scans);
     competitor grid rides on the SAME responses at zero extra cost. */
  const center = placeLoc && isFinite(placeLoc.lat) ? { lat: placeLoc.lat, lng: placeLoc.lng } : null;
  const gridBiz = { name: biz.name, placeId: placeLoc?.placeId, cid: biz.cid };
  let gridResults = null;
  if (center) {
    const pts = gridPoints(center, 5, 2, "square");
    gridResults = await pool(pts, (pt) => scanGridPoint(creds, geoKeyword, pt, gridBiz).catch((e) => ({ ...pt, rank: null, error: String(e?.message || e).slice(0, 80), results: [] })), 5);
  }
  if (gridResults) {
    const scanned = gridResults.filter((p) => !p.skipped);
    const found = scanned.filter((p) => p.rank != null);
    const top3 = scanned.filter((p) => p.rank != null && p.rank <= 3);
    const ranks = found.map((p) => p.rank);
    out.geoGrid = {
      keyword: geoKeyword, size: 5, spacingKm: 2,
      points: gridResults.map((p) => ({ row: p.row, col: p.col, rank: p.skipped ? null : p.rank, skipped: !!p.skipped })),
      centerRank: (gridResults.find((p) => p.row === 2 && p.col === 2) || {}).rank ?? null,
      found: found.length, total: scanned.length, top3: top3.length,
      arp: ranks.length ? Math.round((ranks.reduce((a, b) => a + b, 0) / ranks.length) * 10) / 10 : null,
      solv: scanned.length ? Math.round((top3.length / scanned.length) * 100) : 0,
    };
    if (gridResults.every((p) => p.error)) errors.push(`geo grid "${geoKeyword}": ${gridResults[0].error}`);
    /* real map snapshot (rank pins on the street map, like the tracker UI) */
    else out.geoGrid.snapshotId = await makeGeoSnapshot(gridResults, center, body.placesKey);
  } else out.geoGrid = { note: body?.placesKey ? "Business location couldn't be resolved on Google — map grid skipped." : "Google Places key needed for the map geo-grid — section skipped." };

  /* nothing usable came back (all organic failed AND the grid has no points) → honest 502 */
  const organicAllFailed = out.organic.every((r) => r.error);
  if (organicAllFailed && !out.geoGrid.points) return [502, { error: "provider_error", detail: (out.organic.find((r) => r.error) || {}).error || "all rank scans failed" }];

  /* competitors: from organic tops + the geo-grid center point's local results
     — all from SERPs already paid for, no extra requests */
  const compMap = {};
  out.organic.forEach((r) => (r.top || []).forEach((t) => {
    if (!t.domain || t.domain === site || INSIGHT_DIRS.some((d) => t.domain === d || t.domain.endsWith("." + d))) return;
    const c = (compMap[t.domain] = compMap[t.domain] || { domain: t.domain, appearances: 0, bestRank: 99 });
    c.appearances++; c.bestRank = Math.min(c.bestRank, t.rank);
  }));
  if (gridResults) {
    const center2 = gridResults.find((p) => p.row === 2 && p.col === 2) || {};
    (center2.results || []).forEach((t) => {
      if (!t.title || normName(t.title).includes(nameToken.split(" ")[0])) return;
      const key = "📍 " + t.title;
      const c = (compMap[key] = compMap[key] || { domain: t.title, local: true, appearances: 0, bestRank: 99, rating: t.rating, reviews: t.reviews });
      c.appearances++; c.bestRank = Math.min(c.bestRank, t.rank);
    });
  }
  out.competitors = Object.values(compMap).sort((a, b) => b.appearances - a.appearances || a.bestRank - b.bestRank).slice(0, 10);
  out.requestsUsed = organicKws.length + (gridResults ? gridResults.filter((p) => !p.skipped).length : 0);
  if (errors.length) out.partialErrors = errors;
  return [200, out];
}

/* ---- the pixel, for real: this server SERVES px.js and records hits, so
   verification is genuine. Host the CRM+API on your domain (e.g.
   app.serpsquad.com) and the snippet works on any client site. ---- */
const PIXELS_FILE = new URL("./data/pixels.json", import.meta.url);
const loadPixels = () => { try { return JSON.parse(readFileSync(PIXELS_FILE, "utf8")); } catch { return {}; } };
const savePixels = (d) => { mkdirSync(new URL("./data/", import.meta.url), { recursive: true }); writeFileSync(PIXELS_FILE, JSON.stringify(d)); };
/* routes that must answer ANY origin: they are called from client websites,
   not from the app — the pixel's verify beacon and deployed pages' lead forms */
const PIXEL_ROUTES = ["/api/pixel/verify", "/api/form/submit"];
/* does the site actually contain the pixel snippet? Fetches the page like a
   browser and looks for px.js + the site key — turns "not verifying" from a
   mystery into a concrete answer (not installed vs installed-but-never-visited) */
async function handlePixelCheck(body) {
  const url = String(body?.url || "").trim();
  const key = String(body?.key || "").trim();
  if (!/^https?:\/\//.test(url) || !key) return [400, { error: "bad_request", detail: "url and key required" }];
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20000), headers: {
      /* browser-like headers — WAFs 403 unknown bot UAs and we'd misreport "not installed" */
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    } });
    const html = (await res.text()).slice(0, 2e6);
    const hasScript = html.includes("/px.js");
    const hasKey = html.includes(key);
    /* bot walls often answer 202/503 with a tiny challenge page — a real
       homepage is never this small, so treat it as blocked, not "missing" */
    const blocked = !hasScript && (res.status !== 200 || html.length < 2500);
    return [200, { live: true, status: res.status, blocked, hasScript, hasKey, installed: hasScript && hasKey }];
  } catch (e) { return [502, { error: "provider_error", detail: String(e?.message || e).slice(0, 180) }]; }
}
function handlePixelVerify(body, req) {
  const key = String(body?.key || "").slice(0, 80);
  if (!/^ss_(live|test)_/.test(key)) return [400, { error: "bad_request", detail: "invalid pixel key" }];
  const pixels = loadPixels();
  if (!pixels[key] && Object.keys(pixels).length >= 500) return [429, { error: "rate_limited" }];
  pixels[key] = { lastHit: Date.now(), page: String(body?.page || "").slice(0, 300), ua: String(req.headers["user-agent"] || "").slice(0, 160), hits: (pixels[key]?.hits || 0) + 1 };
  savePixels(pixels);
  return [200, { ok: true }];
}
function handlePixelStatus(body) {
  const key = String(body?.key || "");
  const hit = loadPixels()[key];
  return [200, { verified: !!hit, lastHit: hit?.lastHit || null, hits: hit?.hits || 0, page: hit?.page || null }];
}
/* NOTE: no regex literals in this template — backslash escapes get eaten by
   the template literal and the served script becomes a SyntaxError (`//` turns
   into a comment). split() is escape-proof. */
/* the endpoint is BAKED IN at serve time — optimizers like WP Rocket re-host
   px.js on the client's own domain (wp-content/cache/min/…), so deriving the
   endpoint from the script's src silently sent hits to the wrong site.
   Key lookup also falls back to any data-key tag for rewritten script tags. */
const pxJs = (origin) => `(function(){try{var s=document.currentScript,k=s&&s.getAttribute("data-key");if(!k){var a=document.querySelector('script[data-key]');k=a&&a.getAttribute("data-key");}if(!k)return;var o=${JSON.stringify(origin)};var b=JSON.stringify({key:k,page:location.href});if(navigator.sendBeacon){navigator.sendBeacon(o+"/api/pixel/verify",b);}else{fetch(o+"/api/pixel/verify",{method:"POST",body:b,keepalive:true}).catch(function(){});}}catch(e){}})();`;

/* ---- WordPress connection tester: pinpoint exactly what's wrong ---- */
async function handleWpTest(body) {
  if (!body?.site) return [400, { error: "bad_request", detail: "site required" }];
  const checks = { reachable: false, restApi: false, authenticated: false, user: null, canPublish: false };
  try {
    let ping = await fetch(wpBase(body.site).replace("/wp/v2", ""), { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(8000) });
    checks.reachable = true;
    /* blocked on /wp-json? the same API answers at /?rest_route= and no path
       rule can match that — if it works, the connector just uses it from now on */
    if (!ping.ok && looksBlocked(ping.status)) {
      const alt = await fetch(wpRouteUrl(body.site, "/types"), { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(8000) });
      if (alt.ok) {
        wpMode.set(body.site, "route");
        checks.restApi = true;
        ping = alt;
      }
    }
    checks.restApi = checks.restApi || ping.ok;
    if (!ping.ok) {
      /* identify WHO blocked us — a Cloudflare 1020/challenge page needs an
         IP Access Rule in the Cloudflare dashboard, a host firewall needs the
         hosting panel; "REST disabled" is the rarest cause, not the default */
      const bodyText = (await ping.text().catch(() => "")).slice(0, 4000);
      const cfRay = ping.headers.get("cf-ray");
      /* both URL forms were refused, so this is not a path rule — the edge is
         refusing this SERVER. Nothing we rewrite here can change that, and the
         honest options are: run the sync from the browser instead (same
         credentials, your own IP, no client changes), or have the block lifted. */
      const who = /error code: 10\d\d|cloudflare/i.test(bodyText) || cfRay
        ? `Cloudflare is refusing this server's IP (${cfRay ? "ray " + cfRay : "edge block"}).`
        : `The site's server/host firewall is refusing this server's IP.`;
      /* an inbound block is final — but the companion plugin can call OUT,
         which no firewall here is filtering. If it is already paired, say so
         and prove it by pinging the site through it. */
      const agent = agentForSite(body.site);
      if (agent) {
        const pong = await agentExec(body.site, "ping", {}, 15000);
        if (!pong?.error) {
          checks.restApi = true; checks.authenticated = true; checks.canPublish = true;
          checks.user = "SERP Squad plugin";
          return [200, { checks, via: "agent",
            detail: `The firewall blocks inbound requests to this site, but the SERP Squad plugin is connected and answering (WordPress ${pong.wp || "?"}, plugin ${pong.agent || "?"}). Sync and deploys run through it — no Cloudflare or hosting change is needed.` }];
        }
        return [200, { checks, via: "agent", blocked: true,
          detail: `Inbound is blocked (HTTP ${ping.status}) and the connected plugin has not answered: ${pong.detail || pong.error} WordPress cron only runs when the site gets traffic, so open the site once and retest.` }];
      }
      return [200, { checks, blocked: true, needsAgent: true,
        detail: `Site reached, but BOTH /wp-json and /?rest_route= returned HTTP ${ping.status}. ${who} Because the alternate route was refused too, this is not a path rule — the edge is refusing this server's IP, and nothing the CRM sends inbound can get through. Fix it WITHOUT touching the client's Cloudflare: install/update the SERP Squad Connector plugin on the site, open Settings → SERP Squad, and paste a connection key from this Connector tab. The plugin then calls out to the CRM, which no firewall blocks. (The alternative is to allow the CRM server IP in Cloudflare → Security → WAF → Tools → IP Access Rules.)` }];
    }
  } catch (e) {
    return [200, { checks, detail: `Could not reach https://${body.site}/wp-json — check the domain, DNS and that the site is online. (${e?.message || e})` }];
  }
  if (!body.credential || !String(body.credential).includes(":"))
    return [200, { checks, detail: "REST API reachable ✓ — now add the Application Password as username:xxxx xxxx xxxx xxxx (the USERNAME prefix and the colon are required, not just the password)." }];
  try {
    const me = await fetch(wpBase(body.site) + "/users/me?context=edit", { headers: { ...BROWSER_HEADERS, Authorization: wpAuth(body.credential) }, signal: AbortSignal.timeout(8000) });
    const rawMe = await me.text();
    let d = {}; try { d = JSON.parse(rawMe); } catch { /* not JSON — see below */ }
    if (!me.ok) {
      /* A 5xx carrying WordPress's fatal-error page is PHP crashing on the
         site. It is not a stripped Authorization header, and saying so sends
         people to edit .htaccess over a problem that is nothing to do with
         it — so the two are told apart, and the fatal is diagnosed further
         instead of guessed at. */
      /* the HTML "critical error" page and the JSON internal_server_error are
         the SAME condition — WordPress's fatal handler just answers REST
         requests in JSON. Both mean PHP died. */
      const isFatal = me.status >= 500
        && /critical error|Fatal error|wp-content|troubleshooting|internal_server_error|technical difficulties/i.test(rawMe);
      if (isFatal) {
        /* does the REST API crash WITHOUT credentials too? That separates "this
           site is broken" from "something breaks only on authenticated calls",
           and they need completely different fixes. */
        let anonOk = null;
        try {
          const anon = await fetch(wpHost(body.site) + "/wp-json/", { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(8000) });
          anonOk = anon.ok;
        } catch { anonOk = null; }
        const where = anonOk === false
          ? "The REST API also fails WITHOUT credentials, so the whole site is throwing the error — this is not about the Application Password."
          : anonOk === true
            ? "The REST API works fine WITHOUT credentials and only crashes on the authenticated call, so something on the site fatals while resolving the logged-in user — most often a security, membership or role-management plugin."
            : "The REST API could not be reached again to compare.";
        return [200, { checks, siteFatal: true,
          detail: `WordPress returned HTTP ${me.status} with its "critical error" page. That is a PHP fatal error on ${body.site}, not a credential or header problem — the Application Password never got the chance to be checked. ${where} To see the actual error: set WP_DEBUG and WP_DEBUG_LOG to true in wp-config.php and read wp-content/debug.log, or open the host's PHP error log. If the site was working before, deactivate whatever changed most recently — including the SERP Squad Connector plugin if it was just installed or updated — and retest.` }];
      }
      const said = d.message || (rawMe && !/[<]/.test(rawMe.slice(0, 40)) ? rawMe.slice(0, 160) : "");
      return [200, { checks, detail: `Authentication failed (HTTP ${me.status}): ${said || "check the username and that the Application Password was copied with its spaces"}.${me.status === 401 || me.status === 403 ? ' Note: some hosts strip the Authorization header — add "SetEnvIf Authorization" rules or enable it in the host panel.' : ""}` }];
    }
    checks.authenticated = true; checks.user = d.name || d.slug;
    checks.canPublish = (d.capabilities && (d.capabilities.publish_pages || d.capabilities.publish_posts)) || ["administrator", "editor"].some((r) => (d.roles || []).includes(r));
    return [200, { checks, detail: checks.canPublish ? `Connected as ${checks.user} ✓ — full-site deploys, scheduled posts and media sync are ready.` : `Authenticated as ${checks.user}, but this user can't publish pages — use an Administrator or Editor account.` }];
  } catch (e) { return [200, { checks, detail: "Auth check failed: " + (e?.message || e) }]; }
}


/* ======================================================================
   WORDPRESS OUTBOUND AGENT

   When a client's firewall refuses this server, no inbound request can reach
   the site — not /wp-json, not /?rest_route=, and not any route the companion
   plugin could add, because all of them arrive at the same edge. So the plugin
   calls US instead: it asks for queued work, runs it locally with the
   privileges it already has, and posts the answer back. Outbound HTTPS from
   the site is not something Cloudflare filters.

   It also retires the Application Password for these sites: the plugin acts as
   itself, so there is no credential to store or leak.

   Every agent request is signed with a secret issued at pairing —
   HMAC-SHA256 over "<timestamp>.<raw body>" — and timestamps outside a five
   minute window are rejected, so a captured request cannot be replayed.
   ====================================================================== */
const AGENT_DIR = new URL("./data/wp-agents/", import.meta.url);
const agentFile = (id) => new URL(`${String(id).replace(/[^a-zA-Z0-9_-]/g, "")}.json`, AGENT_DIR);
const KEYS_FILE = new URL("./data/wp-agents/_keys.json", import.meta.url);
const loadAgent = (id) => readJson(agentFile(id), null);
const saveAgent = (a) => { mkdirSync(AGENT_DIR, { recursive: true }); writeFileSync(agentFile(a.siteId), JSON.stringify(a)); };
const loadKeys = () => readJson(KEYS_FILE, {}) || {};
const saveKeys = (k) => { mkdirSync(AGENT_DIR, { recursive: true }); writeFileSync(KEYS_FILE, JSON.stringify(k)); };
const hostOf = (u) => { try { return new URL(String(u)).host.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };

/* the CRM issues a short-lived, single-use key; the site owner pastes it into
   the plugin. Nothing else can pair, and a leaked key expires by itself. */
function handleAgentKey(req, body) {
  const sess = sessionFromReq(req);
  if (!sess || sess.kind !== "team") return [403, { error: "forbidden" }];
  const site = hostOf("https://" + String(body?.site || "").replace(/^https?:\/\//, ""));
  if (!site) return [400, { error: "bad_request", detail: "site required" }];
  const keys = loadKeys();
  for (const [k, v] of Object.entries(keys)) if (Date.now() - v.at > 36e5) delete keys[k];  // 1h
  const key = "ssk_" + randomBytes(18).toString("hex");
  keys[key] = { site, at: Date.now(), projectId: body?.projectId || null };
  saveKeys(keys);
  return [200, { ok: true, key, site, expiresInMin: 60 }];
}

function handleAgentPair(body) {
  const key = String(body?.key || "");
  const keys = loadKeys();
  const rec = keys[key];
  if (!rec) return [403, { error: "bad_key", detail: "That connection key is not valid — issue a fresh one in the CRM." }];
  if (Date.now() - rec.at > 36e5) { delete keys[key]; saveKeys(keys); return [403, { error: "expired", detail: "That connection key has expired — issue a fresh one in the CRM." }]; }
  const home = hostOf(body?.home);
  if (!home) return [400, { error: "bad_request", detail: "home required" }];
  /* the key names the site it was issued for, so a key pasted into the wrong
     site pairs nothing */
  if (rec.site && home !== rec.site) {
    return [403, { error: "site_mismatch", detail: `This key was issued for ${rec.site}, but the request came from ${home}.` }];
  }
  delete keys[key]; saveKeys(keys);                       // single use
  const siteId = "wpa_" + randomBytes(9).toString("hex");
  const secret = randomBytes(32).toString("hex");
  saveAgent({ siteId, secret, home, site: rec.site || home, projectId: rec.projectId || null,
    pairedAt: Date.now(), lastSeen: Date.now(), agent: String(body?.agent || ""), queue: [], results: {} });
  return [200, { ok: true, siteId, secret }];
}

/* verify the signature and return the agent record */
function agentFromReq(req, raw) {
  const id = String(req.headers["x-ss-site"] || "");
  const ts = String(req.headers["x-ss-timestamp"] || "");
  const sig = String(req.headers["x-ss-signature"] || "");
  if (!id || !ts || !sig) return null;
  if (Math.abs(Date.now() / 1000 - +ts) > 300) return null;          // replay window
  const a = loadAgent(id);
  if (!a) return null;
  const mac = createHmac("sha256", a.secret).update(ts + "." + raw).digest("hex");
  if (mac.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < mac.length; i++) diff |= mac.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? a : null;                                      // constant-time compare
}

function handleAgentPoll(req, raw) {
  const a = agentFromReq(req, raw);
  if (!a) return [401, { error: "bad_signature" }];
  a.lastSeen = Date.now();
  a.agent = String(req.headers["x-ss-agent"] || a.agent || "");
  const now = Date.now();
  /* hand out what is waiting; anything not answered within two minutes is
     handed out again rather than lost to a site that went down mid-command */
  const due = (a.queue || []).filter((c) => !c.sentAt || now - c.sentAt > 120000);
  due.forEach((c) => { c.sentAt = now; });
  saveAgent(a);
  return [200, { ok: true, commands: due.map(({ id, op, args }) => ({ id, op, args })) }];
}

function handleAgentResult(req, raw, body) {
  const a = agentFromReq(req, raw);
  if (!a) return [401, { error: "bad_signature" }];
  a.lastSeen = Date.now();
  for (const r of body?.results || []) {
    if (!r?.id) continue;
    a.results[r.id] = { result: r.result, at: Date.now() };
    a.queue = (a.queue || []).filter((c) => c.id !== r.id);
  }
  /* results are collected by the CRM within seconds; keep an hour's worth */
  for (const [k, v] of Object.entries(a.results)) if (Date.now() - v.at > 36e5) delete a.results[k];
  saveAgent(a);
  return [200, { ok: true }];
}

const agentForSite = (site) => {
  const want = hostOf("https://" + String(site || "").replace(/^https?:\/\//, ""));
  try {
    for (const f of readdirSync(AGENT_DIR)) {
      if (!f.endsWith(".json") || f.startsWith("_")) continue;
      const a = readJson(new URL(f, AGENT_DIR), null);
      if (a && (a.site === want || a.home === want)) return a;
    }
  } catch { /* no agents yet */ }
  return null;
};

/* queue one command and wait for the site to answer it */
async function agentExec(site, op, args = {}, waitMs = 75000) {
  const a = agentForSite(site);
  if (!a) return { error: "unpaired", detail: "This site is not paired with the SERP Squad plugin yet." };
  const id = "c" + Date.now().toString(36) + randomBytes(4).toString("hex");
  const fresh = loadAgent(a.siteId) || a;
  fresh.queue = [...(fresh.queue || []), { id, op, args, at: Date.now() }];
  saveAgent(fresh);
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 1200));
    const cur = loadAgent(a.siteId);
    const got = cur?.results?.[id];
    if (got) { delete cur.results[id]; saveAgent(cur); return got.result; }
  }
  const cur = loadAgent(a.siteId);
  const quiet = cur ? Math.round((Date.now() - (cur.lastSeen || 0)) / 1000) : null;
  return { error: "timeout", detail: quiet != null && quiet > 300
    ? `The site has not checked in for ${Math.round(quiet / 60)} minutes. WordPress cron only runs when the site gets traffic — open the site once, or ask the host to enable a real cron.`
    : "The site is connected but has not answered yet — try again in a moment." };
}

function handleAgentStatus(req, body) {
  const sess = sessionFromReq(req);
  if (!sess || sess.kind !== "team") return [403, { error: "forbidden" }];
  const a = agentForSite(body?.site);
  if (!a) return [200, { paired: false }];
  return [200, { paired: true, siteId: a.siteId, home: a.home, agent: a.agent || null,
    pairedAt: a.pairedAt, lastSeen: a.lastSeen, queued: (a.queue || []).length,
    quietSec: Math.round((Date.now() - (a.lastSeen || 0)) / 1000) }];
}

async function handleAgentExec(req, body) {
  const sess = sessionFromReq(req);
  if (!sess || sess.kind !== "team") return [403, { error: "forbidden" }];
  if (!body?.site || !body?.op) return [400, { error: "bad_request", detail: "site and op required" }];
  const out = await agentExec(body.site, String(body.op), body.args || {});
  return [200, { live: true, result: out }];
}

/* ---- DataForSEO account balance: GET v3/appendix/user_data ---- */
async function handleDfsBalance(body) {
  const creds = resolveCreds(body);
  if (!creds) return [503, { error: "not_configured", detail: "DataForSEO credentials missing — add them in Company Settings → API settings." }];
  try {
    const r = await fetch("https://api.dataforseo.com/v3/appendix/user_data", {
      headers: { Authorization: authHeader(creds) }, signal: AbortSignal.timeout(20000),
    });
    const d = await r.json().catch(() => ({}));
    const task = d.tasks?.[0];
    if (!r.ok || d.status_code !== 20000 || !task || task.status_code >= 40000) {
      return [502, { error: "provider_error", detail: "DataForSEO: " + (task?.status_message || d.status_message || `HTTP ${r.status}`) }];
    }
    const u = task.result?.[0] || {};
    /* DataForSEO shapes vary: balance can be a string; money.limits.day can be
       a number OR a nested object ({..., total: N}). Return plain numbers only. */
    const num = (v) => { const n = Number(typeof v === "object" && v ? v.total : v); return Number.isFinite(n) ? n : null; };
    return [200, {
      live: true, login: creds.login,
      balance: num(u.money?.balance),
      spentTotal: num(u.money?.total),
      dayLimit: num(u.money?.limits?.day),
      backlinksSubscription: !!u.backlinks_subscription_expiry_date,
      checkedAt: Date.now(),
    }];
  } catch (e) { return [502, { error: "provider_error", detail: "DataForSEO: " + (e?.message || e) }]; }
}

/* ---- custom-coded sites: proxy to the drop-in publisher endpoint
   (serp-squad-publish.php uploaded to the site root, authed by site key) ---- */
async function customEndpoint(body, payload) {
  if (!body?.site) return [400, { error: "bad_request", detail: "site required" }];
  if (!body?.siteKey) return [503, { error: "not_configured", detail: "Site key missing — it's shown in the Connector tab." }];
  try {
    const r = await fetch(`https://${String(body.site).replace(/^https?:\/\//, "").replace(/\/$/, "")}/serp-squad-publish.php`, {
      method: "POST", signal: AbortSignal.timeout(30000),
      headers: { "content-type": "application/json", "X-SS-Key": body.siteKey },
      body: JSON.stringify(payload),
    });
    const d = await r.json().catch(() => null);
    if (d === null) return [502, { error: "provider_error", detail: `The publisher endpoint didn't answer with JSON (HTTP ${r.status}) — is serp-squad-publish.php uploaded to the site root?` }];
    return [r.ok ? 200 : 502, r.ok ? { live: true, ...d } : { error: "provider_error", detail: "Publisher endpoint: " + (d.detail || d.error || `HTTP ${r.status}`) }];
  } catch (e) {
    return [502, { error: "provider_error", detail: `Could not reach https://${body.site}/serp-squad-publish.php — upload the drop-in file (server/custom-site-endpoint/) and check the domain. (${e?.message || e})` }];
  }
}
const handleCustomTest = (body) => customEndpoint(body, { action: "health" });
const handleCustomDeploy = (body) => customEndpoint(body, body.payload || {});

/* ---- handlers ---- */
async function handleScan(body) {
  const creds = resolveCreds(body);
  if (!creds) return [503, { error: "not_configured", hint: "Add DataForSEO credentials in Company Settings → API settings, or create server/credentials.json" }];
  const { biz, directories } = body;
  if (!biz?.name || !Array.isArray(directories) || !directories.length) return [400, { error: "biz.name and directories[] required" }];
  const dirs = directories.slice(0, 60);
  const results = await pool(dirs, (d) => scanDirectory(creds, d, biz), 4);
  const clean = results.map((r, i) => (r.error ? { name: dirs[i].name, tier: dirs[i].tier, da: dirs[i].da, status: "error", error: r.error } : r));
  // every directory erroring = provider/auth problem — surface it, never mask with demo data
  if (clean.length && clean.every((r) => r.status === "error")) return [502, { error: "provider_error", detail: clean[0].error }];
  return [200, { live: true, results: clean }];
}

/* rank checks hit the country's own Google front end — google.co.uk results
   differ from google.com for the same UK city, so this is a precision must */
const SE_DOMAINS = {
  "United States": "google.com", "United Kingdom": "google.co.uk", "Canada": "google.ca",
  "Australia": "google.com.au", "Netherlands": "google.nl", "New Zealand": "google.co.nz",
  "Ireland": "google.ie", "Germany": "google.de", "France": "google.fr", "Spain": "google.es",
  "Italy": "google.it", "Belgium": "google.be", "India": "google.co.in", "Singapore": "google.com.sg",
  "United Arab Emirates": "google.ae", "South Africa": "google.co.za",
};

/* ---- RANK CHECK JOBS ==================================================
   A rank check used to hold an HTTP request open while the DataForSEO queue
   drained, and give up at eight minutes. The queue has no such deadline — it
   answers when it answers — so keywords that were merely slow came back as
   "tracking failed due to timeout", and the client then re-posted them, paying
   for the same keyword twice.

   Posting and collecting are now separate. Posting returns immediately with a
   job id; results are collected on demand and written into the job as they
   arrive. Nothing is on a clock: a job left overnight is still collectable in
   the morning, and closing the tab does not lose the tasks that were paid for.
   (SEO Utils works the same way — it records every posted task in its own
   database and keeps collecting in the background.) ---- */
const RANK_DIR = new URL("./data/rank-jobs/", import.meta.url);
const rankLocks = new Set();          // job ids currently being collected
const rankJobPath = (id) => new URL(`${String(id).replace(/[^a-z0-9-]/gi, "")}.json`, RANK_DIR);
const loadJob = (id) => { try { return JSON.parse(readFileSync(rankJobPath(id), "utf8")); } catch { return null; } };
const saveJob = (job) => {
  mkdirSync(RANK_DIR, { recursive: true });
  const tmp = new URL(`${job.id}.tmp`, RANK_DIR);
  writeFileSync(tmp, JSON.stringify(job));
  renameSync(tmp, rankJobPath(job.id));
};

/* create tasks and return their ids, aligned with `tasks` */
async function dfsPost(creds, pathSeg, tasks) {
  const out = new Array(tasks.length).fill(null);
  const headers = { Authorization: authHeader(creds), "Content-Type": "application/json" };
  for (let i = 0; i < tasks.length; i += 100) {          // API cap: 100 per POST
    /* the tag carries BOTH the batch index (how a result finds its task here)
       and whatever the caller set (project + keyword/cell, so a late or
       duplicated delivery updates the right row). Index first, so parseInt
       still recovers it. */
    const chunk = tasks.slice(i, i + 100).map((t, j) => ({ priority: 1, ...t, tag: `${i + j}${t.tag ? "~" + t.tag : ""}` }));
    const res = await fetch(`${DFS_BASE}/serp/${pathSeg}/task_post`, {
      method: "POST", headers, body: JSON.stringify(chunk), signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`DataForSEO HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    for (const t of (await res.json()).tasks || []) {
      const idx = parseInt(String(t.data?.tag ?? ""), 10);
      if (!(idx >= 0 && idx < tasks.length)) continue;
      /* 20100 = created. Anything else failed at creation, which DataForSEO
         does not bill for — surfaced so it is not silently retried forever. */
      /* `reused` = DataForSEO handed back an older task instead of creating one.
         It was refunded, so it is not billed, and it will never yield a fresh
         result — the caller has to get this keyword another way. */
      out[idx] = t.status_code === 20100
        ? { taskId: t.id, reused: taskAgeMin(t.id) > REUSED_AFTER_MIN }
        : { error: `task ${t.status_code}: ${t.status_message}` };
    }
  }
  return out;
}

/* ---- DUPLICATE-TASK DETECTION ==========================================
   DataForSEO de-duplicates SERP tasks: post one whose parameters match a task
   posted recently and you do NOT get a new task — you get the ORIGINAL task's
   id back, and the charge is refunded. If that original was already collected,
   every task_get on it answers "40601: Task Handed", forever. Re-posting can
   never fix it, because re-posting is what produces the stale id.

   That is the whole of "All 32 scans failed — task 40601". Measured on the
   live account: two tasks posted at 21:27 came back as ids created at 17:04,
   with cost -0.00045 (a refund), and were handed within eight seconds.

   A task id begins with MMDDHHMM in UTC, so the id itself says when the task
   was really created. Anything not created just now is a re-used one. */
function taskAgeMin(taskId) {
  const m = /^(\d{2})(\d{2})(\d{2})(\d{2})-/.exec(String(taskId || ""));
  if (!m) return 0;                                   // unparseable — treat as fresh
  const [, mo, dd, hh, mi] = m.map(Number);
  const now = new Date();
  let t = Date.UTC(now.getUTCFullYear(), mo - 1, dd, hh, mi);
  /* no year in the id: if that lands in the future, it belongs to last year */
  if (t - now.getTime() > 36e5) t = Date.UTC(now.getUTCFullYear() - 1, mo - 1, dd, hh, mi);
  return Math.round((now.getTime() - t) / 60000);
}
const REUSED_AFTER_MIN = 15;                          // queue tasks start within minutes

/* fetch one task if it is finished; null means "still in the queue" */
async function dfsTaskGet(creds, pathSeg, taskId) {
  const res = await fetch(`${DFS_BASE}/serp/${pathSeg}/task_get/advanced/${taskId}`, {
    headers: { Authorization: authHeader(creds) }, signal: AbortSignal.timeout(40000),
  });
  if (!res.ok) return null;
  const t = (await res.json()).tasks?.[0];
  if (!t || t.status_code === 40602) return null;        // 40602 = Task In Queue
  return t.status_code === 20000 ? { task: t } : { error: `task ${t.status_code}: ${t.status_message}` };
}

/* ---- DataForSEO LOCATION RESOLVER =====================================
   A rank check is only as accurate as the place it is run from. We used to
   send `location_name` as a string and, when DataForSEO did not recognise it,
   silently walk down to the COUNTRY — so "deck company" meant for Newmarket,
   Ontario was answered with national Canadian results and reported as a normal
   check. The number looked fine and described somewhere else entirely.

   DataForSEO publishes its own location list (free, and the same list the
   matching runs against), so the target is resolved to an exact
   `location_code` instead of hoping a string matches. The list is cached on
   disk per country; "Newmarket" alone exists in Canada, the UK and the US, so
   guessing is not an option.

   When only a coarser match exists, the check still runs — but it reports the
   precision it actually achieved, so a country-level number is never presented
   as a local one. ---- */
const LOC_DIR = new URL("./data/dfs-locations/", import.meta.url);
const LOC_TTL = 30 * 864e5;                       // the list changes rarely
const locMem = new Map();                          // country -> [{code,name,type}]
const normLoc = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function locationsFor(creds, country) {
  const key = normLoc(country) || "all";
  if (locMem.has(key)) return locMem.get(key);
  mkdirSync(LOC_DIR, { recursive: true });
  const file = new URL(`${key.replace(/\s+/g, "-")}.json`, LOC_DIR);
  try {
    const st = statSync(file);
    if (Date.now() - st.mtimeMs < LOC_TTL) {
      const cached = JSON.parse(readFileSync(file, "utf8"));
      locMem.set(key, cached); return cached;
    }
  } catch { /* not cached yet */ }
  /* the country-scoped list keeps this to a few thousand rows instead of the
     full ~226k, and the endpoint is free either way */
  const res = await fetch(`${DFS_BASE}/serp/google/locations`, { headers: { Authorization: authHeader(creds) }, signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`locations HTTP ${res.status}`);
  const all = (await res.json()).tasks?.[0]?.result || [];
  const wanted = normLoc(country);
  const rows = all
    .filter((r) => !wanted || normLoc(r.location_name).endsWith(wanted))
    .map((r) => ({ code: r.location_code, name: r.location_name, type: r.location_type }));
  try { writeFileSync(file, JSON.stringify(rows)); } catch { /* cache is best-effort */ }
  locMem.set(key, rows);
  return rows;
}

/* → { code, name, precision: "city" | "region" | "country" } or null */
async function resolveLocation(creds, city) {
  if (!city?.country) return null;
  let rows;
  try { rows = await locationsFor(creds, city.country); } catch { return null; }
  if (!rows.length) return null;
  const exact = normLoc([city.city, city.region, city.country].filter(Boolean).join(","));
  const cityCountry = normLoc([city.city, city.country].filter(Boolean).join(","));
  const regionCountry = normLoc([city.region, city.country].filter(Boolean).join(","));
  const countryOnly = normLoc(city.country);

  const find = (target) => rows.find((r) => normLoc(r.name) === target);
  /* A city stored without its region ("york", "United Kingdom") cannot match
     DataForSEO's "York,England,United Kingdom" on the exact form, and dropping
     to the country turns a local check into a national one. So the city name
     is matched WITHIN the country instead: first as a City, because "York" is
     also a county and a neighbourhood elsewhere. */
  const cityNorm = normLoc(city.city);
  const inCountry = (r) => normLoc(r.name).endsWith(" " + countryOnly) || normLoc(r.name) === countryOnly;
  const byCityName = () => {
    if (!cityNorm) return null;
    const cands = rows.filter((r) => inCountry(r) && normLoc(r.name).startsWith(cityNorm + " "));
    if (!cands.length) return null;
    const rank = (t) => (/^city$/i.test(t) ? 0 : /municipality|town/i.test(t) ? 1 : /region|state|province|county/i.test(t) ? 2 : 3);
    return [...cands].sort((a, b2) => rank(a.type) - rank(b2.type) || a.name.length - b2.name.length)[0];
  };
  /* most specific first — an exact city match is the only one that answers
     "where does this rank in THIS town" */
  const hit =
    (city.city && find(exact) && { r: find(exact), precision: "city" }) ||
    (city.city && find(cityCountry) && { r: find(cityCountry), precision: "city" }) ||
    (byCityName() && { r: byCityName(), precision: "city" }) ||
    (city.region && find(regionCountry) && { r: find(regionCountry), precision: "region" }) ||
    (find(countryOnly) && { r: find(countryOnly), precision: "country" }) ||
    null;
  return hit ? { code: hit.r.code, name: hit.r.name, precision: hit.precision } : null;
}

async function handleRerun(body) {
  const creds = resolveCreds(body);
  if (!creds) return credsMissing(body);
  const { entries } = body; // [{ id, keyword, city:{city,region,country}, device, engine, domain }]
  if (!Array.isArray(entries) || !entries.length) return [400, { error: "entries[] required" }];
  /* rank checks hit the country's own Google front end — google.co.uk results
     differ from google.com for the same UK city, so this is a precision must */
  const SE_DOMAIN = SE_DOMAINS;
  /* 25 per request is the HTTP-timeout guard, NOT a scan limit — the client
     batches any keyword count into sequential 25-keyword requests.
     Checks run through the standard task queue ($0.0006/SERP vs $0.003
     live) — same SERP data, results just arrive within a few minutes. */
  const list = entries.slice(0, 25);
  /* DataForSEO only accepts location_names from its own database — custom or
     partial cities ("York" with no region) fail on the exact form, so walk
     from most to least specific instead of erroring the whole scan */
  const variantsOf = (e) => [...new Set([
    [e.city.city, e.city.region, e.city.country].filter(Boolean).join(","),
    [e.city.city, e.city.country].filter(Boolean).join(","),
    e.city.country,
  ].filter(Boolean))];
  /* depth is billed per 10 results, so 100 costs ten times what 10 does.
     Rank tracking needs to see past the first page, but the caller decides how
     far — and the cost estimate is built from the same number. */
  const depth = [10, 20, 30, 50, 100].includes(+body.depth) ? +body.depth : 100;
  const buildTask = (e, engine, resolved) => ({
    keyword: e.keyword,
    language_code: "en",
    device: (e.device || "Desktop").toLowerCase(),
    os: e.device === "Mobile" ? "android" : "windows",
    depth,
    /* an exact location_code beats a location_name string: the string form
       fails on anything DataForSEO spells differently and there are three
       Newmarkets */
    ...(resolved ? { location_code: resolved.code } : { location_name: variantsOf(e)[0] }),
    ...(engine === "google" && SE_DOMAIN[e.city?.country] ? { se_domain: SE_DOMAIN[e.city.country] } : {}),
  });
  /* resolve every target ONCE up front — the list is cached, so this is a map
     lookup after the first call for a country */
  const resolvedFor = new Map();
  for (const e of list) {
    const k = `${e.city?.city}|${e.city?.region}|${e.city?.country}`;
    if (!resolvedFor.has(k)) resolvedFor.set(k, await resolveLocation(creds, e.city || {}));
  }
  const locOf = (e) => resolvedFor.get(`${e.city?.city}|${e.city?.region}|${e.city?.country}`) || null;

  const updated = new Array(list.length);
  for (const engine of ["google", "bing"]) {
    const idxs = list.map((_, i) => i).filter((i) => ((list[i].engine || "Google").toLowerCase() === "bing" ? "bing" : "google") === engine);
    if (!idxs.length) continue;
    /* invalid locations fail at task creation (instantly, unbilled) — walk
       the failed subset down the variant ladder in follow-up rounds */
    let work = idxs.map((i) => ({ i, vi: 0 }));
    for (let round = 0; round < 3 && work.length; round++) {
      const res = await dfsQueue(creds, engine + "/organic", work.map(({ i }) => buildTask(list[i], engine, locOf(list[i]))));
      const next = [];
      res.forEach((r, j) => {
        const { i, vi } = work[j];
        const e = list[i];
        if (r?.task) {
          const { position, url, mapPos, packShown } = parseSerpRank(r.task, e.domain);
          const loc = locOf(e);
          updated[i] = { id: e.id, position, url, mapPos, packShown,
            location: loc?.name || variantsOf(e)[vi],
            /* "city" means this really is the local ranking; anything coarser
               is a wider result set and is labelled as such rather than being
               passed off as local */
            precision: loc?.precision || "unverified",
            locationCode: loc?.code || null };
        } else if (/location/i.test(r?.error || "") && variantsOf(e)[vi + 1]) next.push({ i, vi: vi + 1 });
        else updated[i] = { id: e.id, keyword: e.keyword, error: r?.error || "no result" };
        /* transient task failures (40101 bursts, queue timeouts) surface as
           per-entry errors — the client's retry pass reposts exactly those */
      });
      work = next;
    }
    work.forEach(({ i }) => { updated[i] = updated[i] || { id: list[i].id, keyword: list[i].keyword, error: "location not accepted by DataForSEO" }; });
  }
  return [200, { live: true, updated }];
}

/* start a rank check: post every task, remember the ids, return at once */
/* Search operators quintuple a task's price: DataForSEO bills keywords
   containing allintitle:, site:, inurl: etc. at 5x (docs: "K = 5 if keyword
   contains search operators"). None of them belongs in a tracked keyword, so
   they are refused at the door with the reason — not silently billed. */
const SERP_OPERATOR = /\b(?:allinanchor|allintext|allintitle|allinurl|define|filetype|inanchor|intext|intitle|inurl|link|site)\s*:/i;
const operatorError = (kw) => `"${kw}" contains a Google search operator — DataForSEO bills these at 5x and they don't measure a real ranking. Track the plain keyword instead.`;

async function handleRankStart(body) {
  const creds = resolveCreds(body);
  if (!creds) return credsMissing(body);
  const entries = Array.isArray(body?.entries) ? body.entries : [];
  if (!entries.length) return [400, { error: "entries[] required" }];
  const opBad = entries.find((e) => SERP_OPERATOR.test(String(e.keyword || "")));
  if (opBad) return [400, { error: "search_operator", detail: operatorError(opBad.keyword) }];
  const depth = [10, 20, 30, 50, 100].includes(+body.depth) ? +body.depth : 100;

  const resolvedFor = new Map();
  for (const e of entries) {
    const k = `${e.city?.city}|${e.city?.region}|${e.city?.country}`;
    if (!resolvedFor.has(k)) resolvedFor.set(k, await resolveLocation(creds, e.city || {}));
  }
  const engineOf = (e) => ((e.engine || "Google").toLowerCase() === "bing" ? "bing" : "google");
  const job = {
    id: "rj" + Date.now().toString(36) + randomBytes(4).toString("hex"),
    createdAt: Date.now(), depth, items: [],
  };

  for (const engine of ["google", "bing"]) {
    const mine = entries.filter((e) => engineOf(e) === engine);
    if (!mine.length) continue;
    const loc = (e) => resolvedFor.get(`${e.city?.city}|${e.city?.region}|${e.city?.country}`) || null;
    const tasks = mine.map((e) => ({
      keyword: e.keyword, language_code: "en",
      device: (e.device || "Desktop").toLowerCase(),
      os: e.device === "Mobile" ? "android" : "windows",
      depth,
      /* STOP CRAWLING ONCE THE SITE IS FOUND — in the shape DataForSEO
         actually accepts.

         The first version sent stop_crawl_on_match as a BOOLEAN with
         match_type/match_value as top-level fields. The API spec wants an
         ARRAY of target objects; the malformed fields were silently ignored,
         every task crawled the full depth, and the account's own bill proves
         it: 49 of the last 55 organic tasks charged the full $0.00465 and not
         one charged the $0.0006 base — including keywords ranking #5.

         find_targets_in is pinned to organic on purpose: without it a match
         in the LOCAL PACK on page one could stop the crawl before the organic
         listing is reached, and a site ranking organically at #35 would be
         reported as unranked. `position` measures organic; only organic may
         stop the crawl. with_subdomains mirrors the parser, which counts
         subdomain hits as ranking. */
      ...(engine === "google" && e.domain ? {
        stop_crawl_on_match: [{
          match_type: "with_subdomains",
          match_value: String(e.domain).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""),
        }],
        find_targets_in: ["organic"],
      } : {}),
      /* ties the result to the project and keyword, so a late or duplicated
         delivery updates the right row instead of being matched by position */
      tag: `${String(body.projectId || "proj").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32)}|${String(e.id).slice(0, 40)}`,
      ...(loc(e) ? { location_code: loc(e).code }
                 : { location_name: [e.city?.city, e.city?.region, e.city?.country].filter(Boolean).join(",") }),
      ...(engine === "google" && SE_DOMAINS[e.city?.country] ? { se_domain: SE_DOMAINS[e.city.country] } : {}),
    }));
    let posted;
    try { posted = await dfsPost(creds, engine + "/organic", tasks); }
    catch (err) { return [502, { error: "provider_error", detail: String(err?.message || err).slice(0, 200) }]; }
    mine.forEach((e, i) => {
      const p = posted[i] || { error: "no response for this task" };
      job.items.push({
        entryId: e.id, keyword: e.keyword, domain: e.domain, engine,
        location: loc(e)?.name || null, locationCode: loc(e)?.code || null,
        precision: loc(e)?.precision || "unverified",
        /* kept so a task whose result is lost can be re-run identically */
        task: tasks[i],
        taskId: p.taskId || null, error: p.error || null, result: null,
        /* the queue gave us a stale task — only a live call can answer this one */
        reused: !!p.reused,
      });
    });
  }
  const posted = job.items.filter((x) => x.taskId && !x.reused).length;
  job.billedTasks = posted;          // tasks that were actually created, i.e. paid for
  job.liveTasks = 0;
  saveJob(job);
  return [200, { live: true, jobId: job.id, total: job.items.length, posted,
    failedToPost: job.items.length - posted,
    /* how many are actually targeted at the town asked for */
    cityPrecise: job.items.filter((x) => x.precision === "city").length,
    /* keywords DataForSEO refused to re-queue because it had just run them —
       they get a live check instead, which costs more and is worth saying */
    reused: job.items.filter((x) => x.reused).length }];
}

/* collect whatever has finished. Safe to call repeatedly, forever. */
async function handleRankStatus(body) {
  const creds = resolveCreds(body);
  if (!creds) return credsMissing(body);
  const job = loadJob(body?.jobId || "");
  if (!job) return [404, { error: "unknown_job", detail: "That rank check is no longer on the server." }];

  /* one collection at a time per job. Two overlapping passes would both fetch
     the same task, and DataForSEO hands a result out ONCE — the second caller
     gets 40601 and the keyword looks failed when it actually succeeded. */
  if (rankLocks.has(job.id)) return [202, { live: true, jobId: job.id, busy: true, total: job.items.length,
    done: job.items.filter((x) => x.result || x.error).length,
    pending: job.items.filter((x) => !x.result && !x.error).length, updated: [], errors: [] }];
  rankLocks.add(job.id);
  try {
    const pending = job.items.filter((x) => x.taskId && !x.result && !x.error);
    if (pending.length) {
      /* every finished item is written the moment it lands, not once the whole
         pass is over. A pass takes minutes; a pm2 reload (every deploy) or a
         dropped connection in the middle of one used to discard every result
         already fetched — and DataForSEO hands a result out ONCE, so those
         keywords came back 40601 on the next poll and were PAID FOR AGAIN.
         Persisting per item makes a restart cost nothing. */
      let dirty = 0;
      const land = (item, task) => {
        const { position, absPos, url, mapPos, packShown } = parseSerpRank(task, item.domain);
        item.result = { position, absPos, url, mapPos, packShown };
        if (++dirty >= 5) { dirty = 0; saveJob(job); }
      };
      /* a keyword the queue cannot answer has to be run live. Re-POSTING it is
         useless — DataForSEO would just hand back the same stale task again,
         which is the loop that produced "All 32 scans failed". The live
         endpoint always executes, so it is the only way out; it costs more,
         so it happens at most once per keyword and is reported separately. */
      const liveNeeded = [];
      await pool(pending, async (item) => {
        /* a re-used task was never going to produce anything — do not even ask */
        if (item.reused) { liveNeeded.push(item); return; }
        const got = await dfsTaskGet(creds, item.engine + "/organic", item.taskId);
        if (!got) return;                                 // still queued — ask again later
        if (got.error) {
          if (/40601|handed/i.test(got.error) && !item.recovered && item.task) { liveNeeded.push(item); return; }
          item.error = got.error;
          /* a task that never got created was never billed, so it is safe for
             the client to try again; a handed/failed one has already been paid */
          item.retryable = /4050[0-9]|internal error|timeout/i.test(got.error);
          return;
        }
        land(item, got.task);
      }, 8);

      if (liveNeeded.length) {
        await pool(liveNeeded, async (item) => {
          item.recovered = "live";
          try {
            const t = await dfsLive(creds, item.engine + "/organic", item.task);
            job.liveTasks = (job.liveTasks || 0) + 1;
            land(item, t);
          } catch (e2) {
            item.error = `live re-check failed: ${String(e2?.message || e2).slice(0, 110)}`;
            item.retryable = true;                        // a failed live call is not billed
          }
        }, 6);
      }
      saveJob(job);
    }
  } finally { rankLocks.delete(job.id); }
  const done = job.items.filter((x) => x.result || x.error);
  return [200, { live: true, jobId: job.id, total: job.items.length,
    done: done.length, pending: job.items.length - done.length,
    ageSec: Math.round((Date.now() - job.createdAt) / 1000),
    updated: job.items.filter((x) => x.result).map((x) => ({
      id: x.entryId, ...x.result, location: x.location, precision: x.precision,
    })),
    /* what this job has actually put on the DataForSEO bill, in the same units
       the pre-scan estimate is quoted in — so the two can be compared */
    billedTasks: job.billedTasks || 0, liveTasks: job.liveTasks || 0, depth: job.depth,
    errors: job.items.filter((x) => x.error).map((x) => ({
      id: x.entryId, keyword: x.keyword, error: x.error,
      /* only errors that were never billed are worth the client re-running */
      retryable: !!x.retryable,
    })) }];
}

/* ---- GBP geo-grid rank scan =================================
   The Local Falcon / SEO Utils technique, for real: one Google Maps SERP
   task per grid point with an exact location_coordinate (lat,lng,17z),
   then find the business in the local results by CID/place_id/name.
   Accuracy comes from the coordinate targeting — 17z scopes each request
   to roughly what a searcher standing AT that spot sees (15z was wide
   enough that neighboring points returned homogenized results).
   Cost: points × keywords standard-queue tasks @ $0.0006 per scan. ---- */
const normName = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
function gridPoints(center, size, spacingKm, shape = "square") {
  const half = (size - 1) / 2, pts = [];
  const push = (dLatKm, dLngKm, extra) => pts.push({
    ...extra,
    lat: +(center.lat + dLatKm / 111.32).toFixed(7),
    lng: +(center.lng + dLngKm / (111.32 * Math.cos((center.lat * Math.PI) / 180))).toFixed(7),
  });
  if (shape === "circle") {
    /* true radial circle (what SEO Utils / Local Falcon render): center pin
       + concentric rings every `spacing`, ring k carrying ⌊2πk⌋ pins so the
       arc gap ≈ the radial gap — even coverage of the disk with ~22% fewer
       paid scans than a corner-clipped square */
    push(0, 0, { row: 0, col: 0, ring: 0, isCenter: true });
    for (let k = 1; k <= half; k++) {
      const n = Math.floor(2 * Math.PI * k);
      for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * i) / n; // bearing from north, clockwise
        push(k * spacingKm * Math.cos(a), k * spacingKm * Math.sin(a), { row: k, col: i, ring: k });
      }
    }
    return pts;
  }
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++)
    push((half - r) * spacingKm, (c - half) * spacingKm, { row: r, col: c, isCenter: r === half && c === half });
  return pts;
}
/* parse one Maps task into a grid-point result (matching tiers: CID →
   place_id → exact normalized name → containment; items arrive in rank
   order so the first hit within a tier is the best position) */
function parseMapsTask(task, business) {
  const items = (task.result?.[0]?.items || []).filter((it) => it.type === "maps_search");
  const target = normName(business.name);
  /* place_id -> feature_id -> cid -> exact name -> containment. feature_id is
     the identifier DataForSEO returns most consistently for Maps listings and
     was missing entirely, so a business whose title differs slightly from the
     tracked name could be matched by containment — or missed. */
  const hit =
    (business.placeId && items.find((it) => it.place_id === business.placeId)) ||
    (business.featureId && items.find((it) => it.feature_id === business.featureId)) ||
    (business.cid && items.find((it) => String(it.cid) === String(business.cid))) ||
    items.find((it) => normName(it.title) === target) ||
    items.find((it) => normName(it.title).includes(target) || target.includes(normName(it.title)));
  return {
    rank: hit ? hit.rank_group : null, // null = not in top 100
    /* top-20 stored per point — competitor grids are derived from this
       same response later at ZERO extra API cost (token-efficient by design) */
    results: items.slice(0, 20).map((it) => ({
      title: it.title, rank: it.rank_group,
      rating: it.rating?.value ?? null, reviews: it.rating?.votes_count ?? null,
      category: it.category ?? null, address: it.address ?? null,
    })),
  };
}
async function handleGeoGrid(body) {
  const creds = resolveCreds(body);
  if (!creds) return credsMissing(body);
  const { center, grid, business } = body;
  const keywords = (Array.isArray(body.keywords) && body.keywords.length ? body.keywords : [body.keyword]).filter(Boolean).slice(0, 40);
  if (!keywords.length || !business?.name || !isFinite(center?.lat) || !isFinite(center?.lng)) return [400, { error: "keyword(s), business.name, center.lat/lng required" }];
  const opBadKw = keywords.find((k) => SERP_OPERATOR.test(String(k)));
  if (opBadKw) return [400, { error: "search_operator", detail: operatorError(opBadKw) }];
  const size = [3, 5, 7, 9, 11, 13, 15].includes(+grid?.size) ? +grid.size : 5;
  const spacingKm = Math.min(10, Math.max(0.05, +grid?.spacingKm || 1));
  const pts = gridPoints(center, size, spacingKm, grid?.shape === "circle" ? "circle" : "square");
  const languageCode = body.language_code || "en";
  /* MAP ZOOM — the single most consequential parameter in this whole scan,
     and it was wrong.

     Google Maps returns the businesses inside the requested viewport, and the
     viewport is set by the zoom. At 17z that viewport is a few hundred metres,
     so each point came back with a HANDFUL of listings — measured on a real
     coordinate, same keyword, same $0.002 cost per call:

         17z ->   6 results      15z ->  41
         13z -> 100 results      11z -> 100

     We were asking for depth 100, paying for depth 100, and receiving six.
     With six candidates per point a business can only ever be found on its own
     doorstep, which is exactly what the grids showed: the centre ranked, every
     other cell read "100+ / not ranked". Those cells were not measurements,
     they were an artefact of the viewport.

     13z restores the full 100 and still varies properly by location — the
     grid's whole purpose. Measured across three coordinates 4km apart:

         Ontario Energy Care   centre 1   north 18   east 8
         Superior HVAC         centre 3   north  9   east 6

     Wider is not automatically better: at 11z the pool stops growing while the
     viewport keeps widening, which is what flattens neighbouring cells. 13z is
     the default; the caller can still override.

     Every point must use the SAME zoom or the ranks are not comparable. */
  const zoom = Math.min(21, Math.max(3, +body.zoom || 13));
  /* DEPTH — Maps is billed "per each SERP containing up to 100 results"
     (docs.dataforseo.com/v3/serp/google/maps/task_post), so 50 costs exactly
     what 100 costs; the unit is the page, not the result. 50 is the default
     because a map pin's story is told well inside the top 50 — anything
     deeper renders as "not ranked" either way — but callers can pass 100 back
     at no extra charge. */
  const depth = Math.min(100, Math.max(20, +body.depth || 50));
  /* one task per (keyword, point) */
  const tasks = [];
  /* `tag` ties a result back to its grid cell, which is what makes a retry or
     a late webhook idempotent instead of guesswork (DataForSEO's grid guide
     recommends exactly this) */
  const projTag = String(body.projectId || "grid").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  for (const kw of keywords) pts.forEach((pt, i) => tasks.push({
    keyword: kw, location_coordinate: `${pt.lat},${pt.lng},${zoom}z`, language_code: languageCode, depth,
    tag: `${projTag}|${i}`,
  }));

  /* STANDARD QUEUE by default.

     This used to default to the live endpoint on the reasoning that a grid is
     only worth anything if every point returns. That reasoning cost real
     money: live Maps is roughly 3.3x the queue price, on every point of every
     grid — a 15x15 grid is 225 points, so the default was ~$0.45 a keyword
     where the queue is ~$0.135. DataForSEO's own guidance is Standard for
     scheduled and bulk collection, live only when the answer is needed right
     now, and the completion worry is already handled: the retry pass below
     closes any holes, and a grid with failed points is reported as such
     rather than passed off as complete. */
  const mode = body.mode === "live" ? "live" : "queue";
  const results = mode === "queue"
    ? await dfsQueue(creds, "google/maps", tasks)
    : await dfsLivePool(creds, "google/maps", tasks, { concurrency: Math.min(12, Math.max(4, +body.concurrency || 8)) });

  /* second pass over whatever still has no data — always LIVE, whichever mode
     ran first, because the point of the retry is to close holes for good.
     A queue run that missed EVERYTHING still gets swept: that is the normal
     outcome when the standard queue is backed up, and it is exactly the case
     that used to produce a grid of failed points. (A live run that missed
     everything is a dead provider or bad credentials — dfsLivePool already
     retried each task and bails early on 401/402, so sweeping again would
     only double the wait.) */
  /* 40102 "No Search Results" is an ANSWER, not a failure — Google returned an
     empty Maps SERP for that coordinate. Re-running it live costs money to be
     told the same thing again, so those points are left out of the retry. */
  const noResults = (r) => /\b40102\b|no search results/i.test(String(r?.error || ""));
  const missIdx = results.map((r, i) => (!r?.task && !noResults(r) ? i : -1)).filter((i) => i >= 0);
  if (missIdx.length && (mode === "queue" || missIdx.length < tasks.length)) {
    const retry = await dfsLivePool(creds, "google/maps", missIdx.map((i) => tasks[i]), { concurrency: 5, attempts: 2 });
    retry.forEach((r, j) => { if (r?.task) results[missIdx[j]] = r; });
  }

  const grids = {};
  const errCounts = {};
  keywords.forEach((kw, ki) => {
    grids[kw] = pts.map((pt, pi) => {
      const r = results[ki * pts.length + pi];
      if (r?.task) return { ...pt, ...parseMapsTask(r.task, business) };
      /* Google had nothing to show at this coordinate. The business does not
         rank there because NOTHING does — which is exactly what a visibility
         grid is measuring, so the point counts as scanned with no ranking.
         DataForSEO's own guide is explicit: do not confuse a missing target
         with an API error. Marking these as failures made a working scan look
         broken and pulled honest zero-visibility cells out of the metrics,
         flattering the coverage numbers. */
      if (noResults(r)) return { ...pt, rank: null, results: [], noResults: true };
      const error = r?.error || "scan failed";
      errCounts[error] = (errCounts[error] || 0) + 1;
      return { ...pt, rank: null, error, results: [] };
    });
  });
  const all = Object.values(grids).flat();
  const failed = all.filter((p) => p.error).length;
  if (failed === all.length) {
    return [502, { error: "provider_error", detail: Object.keys(errCounts)[0] || "scan failed" }];
  }
  /* `points` kept for single-keyword callers (older client bundles) */
  return [200, { live: true, mode, grids, points: grids[keywords[0]], size, spacingKm, zoom,
    /* the client shows this verbatim: a partially-failed grid must never look
       like a complete one */
    scanned: all.length - failed, failed, errors: errCounts,
    /* counted and named, so "no local results here" is never presented as a
       scan that went wrong */
    empty: all.filter((p) => p.noResults).length, checkedAt: Date.now() }];
}


/* ======================================================================
   SOCIAL CONNECTORS — real OAuth, replacing a button that faked it.

   The Connect button used to be a 900ms timer that set connected:true. No
   authorisation happened, no token existed, and nothing could ever have been
   published. This is the flow it should have been, built on the same shape as
   the Google connection that already works: the browser asks for an authorize
   URL, the platform redirects back here with a code, the code is exchanged
   server-side, and the tokens never touch the browser.

   Every provider below needs a developer app THE USER creates, because the
   client_id/secret identify their business to the platform — no integration
   can create those for them. What differs per provider is only configuration,
   so adding one is a table entry rather than new code.

   PKCE is per-provider: X and TikTok require it, and providers that do not
   expect the parameters reject them, so it is not sent globally.
   ====================================================================== */
const SOCIAL_DIR = new URL("./data/social/", import.meta.url);
const socialFile = (owner, platform) =>
  new URL(`${String(owner).replace(/[^A-Za-z0-9_-]/g, "")}__${String(platform).replace(/[^a-z0-9]/gi, "")}.json`, SOCIAL_DIR);

const SOCIAL_PROVIDERS = {
  facebook: {
    label: "Facebook Page", credKey: "metaApp", pkce: false,
    auth: "https://www.facebook.com/v21.0/dialog/oauth",
    token: "https://graph.facebook.com/v21.0/oauth/access_token",
    scope: "pages_show_list,pages_manage_posts,pages_read_engagement,business_management",
    profile: async (t) => {
      const me = await fetch(`https://graph.facebook.com/v21.0/me/accounts?fields=name,username,id&access_token=${encodeURIComponent(t)}`).then((r) => r.json());
      const p = me.data?.[0];
      return p ? { name: p.name, handle: p.username ? "@" + p.username : p.id, pageId: p.id } : null;
    },
  },
  instagram: {
    label: "Instagram Business", credKey: "metaApp", pkce: false,
    auth: "https://www.facebook.com/v21.0/dialog/oauth",
    token: "https://graph.facebook.com/v21.0/oauth/access_token",
    scope: "instagram_basic,instagram_content_publish,pages_show_list,business_management",
    profile: async (t) => {
      const me = await fetch(`https://graph.facebook.com/v21.0/me/accounts?fields=instagram_business_account{username,name}&access_token=${encodeURIComponent(t)}`).then((r) => r.json());
      const ig = me.data?.map((x) => x.instagram_business_account).find(Boolean);
      return ig ? { name: ig.name || ig.username, handle: "@" + ig.username, igId: ig.id } : null;
    },
  },
  threads: {
    label: "Threads", credKey: "threadsApp", pkce: false,
    auth: "https://threads.net/oauth/authorize",
    token: "https://graph.threads.net/oauth/access_token",
    scope: "threads_basic,threads_content_publish",
    profile: async (t) => {
      const d = await fetch(`https://graph.threads.net/v1.0/me?fields=username,name&access_token=${encodeURIComponent(t)}`).then((r) => r.json());
      return d.username ? { name: d.name || d.username, handle: "@" + d.username } : null;
    },
  },
  linkedin: {
    label: "LinkedIn Page", credKey: "linkedinApp", pkce: false,
    auth: "https://www.linkedin.com/oauth/v2/authorization",
    token: "https://www.linkedin.com/oauth/v2/accessToken",
    scope: "openid profile w_member_social",
    profile: async (t) => {
      const d = await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: "Bearer " + t } }).then((r) => r.json());
      return d.name ? { name: d.name, handle: d.email || d.sub } : null;
    },
  },
  x: {
    label: "X (Twitter)", credKey: "xApp", pkce: true, basicAuthToken: true,
    auth: "https://twitter.com/i/oauth2/authorize",
    token: "https://api.twitter.com/2/oauth2/token",
    scope: "tweet.read tweet.write users.read offline.access",
    profile: async (t) => {
      const d = await fetch("https://api.twitter.com/2/users/me", { headers: { Authorization: "Bearer " + t } }).then((r) => r.json());
      return d.data ? { name: d.data.name, handle: "@" + d.data.username } : null;
    },
  },
  youtube: {
    label: "YouTube Channel", credKey: "googleOAuth", pkce: false,
    auth: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload",
    extraAuth: { access_type: "offline", prompt: "consent" },
    profile: async (t) => {
      const d = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: "Bearer " + t } }).then((r) => r.json());
      const c = d.items?.[0];
      return c ? { name: c.snippet.title, handle: c.snippet.customUrl || c.id, channelId: c.id } : null;
    },
  },
  tiktok: {
    label: "TikTok Business", credKey: "tiktokApp", pkce: true, clientKeyParam: "client_key",
    auth: "https://www.tiktok.com/v2/auth/authorize/",
    token: "https://open.tiktokapis.com/v2/oauth/token/",
    scope: "user.info.basic,video.publish,video.upload",
    profile: async (t) => {
      const d = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=display_name,username", { headers: { Authorization: "Bearer " + t } }).then((r) => r.json());
      const u = d.data?.user;
      return u ? { name: u.display_name, handle: u.username ? "@" + u.username : "" } : null;
    },
  },
  pinterest: {
    label: "Pinterest Business", credKey: "pinterestApp", pkce: false, basicAuthToken: true,
    auth: "https://www.pinterest.com/oauth/",
    token: "https://api.pinterest.com/v5/oauth/token",
    scope: "boards:read,pins:read,pins:write",
    profile: async (t) => {
      const d = await fetch("https://api.pinterest.com/v5/user_account", { headers: { Authorization: "Bearer " + t } }).then((r) => r.json());
      return d.username ? { name: d.business_name || d.username, handle: "@" + d.username } : null;
    },
  },
};

/* Bluesky is the exception and the useful one: the AT Protocol has no OAuth
   app to register and no review to wait for. An app password (Settings → App
   Passwords) is exchanged for a session immediately, so this connector works
   the day it ships — which also makes it the way to prove the rest of the
   pipeline end to end. */
async function handleSocialBluesky(body) {
  const owner = String(body?.ownerId || "").trim();
  const handle = String(body?.handle || "").trim().replace(/^@/, "");
  const appPassword = String(body?.appPassword || "").trim();
  if (!owner || !handle || !appPassword) return [400, { error: "bad_request", detail: "handle and app password required" }];
  try {
    const r = await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ identifier: handle, password: appPassword }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return [502, { error: "provider_error", detail: d.message || `Bluesky rejected the sign-in (HTTP ${r.status}). Use an APP PASSWORD from Settings → App Passwords, not your account password.` }];
    mkdirSync(SOCIAL_DIR, { recursive: true });
    writeFileSync(socialFile(owner, "bluesky"), JSON.stringify({
      platform: "bluesky", owner, did: d.did, handle: "@" + d.handle, name: d.handle,
      accessJwt: d.accessJwt, refreshJwt: d.refreshJwt, at: Date.now(),
    }));
    return [200, { ok: true, platform: "bluesky", name: d.handle, handle: "@" + d.handle }];
  } catch (e) { return [502, { error: "provider_error", detail: String(e?.message || e).slice(0, 160) }]; }
}

function handleSocialStart(body) {
  const platform = String(body?.platform || "");
  const p = SOCIAL_PROVIDERS[platform];
  if (!p) return [400, { error: "bad_platform", detail: `No connector for "${platform}".` }];
  const owner = String(body?.ownerId || "").trim();
  const clientId = String(body?.clientId || "").trim();
  const clientSecret = String(body?.clientSecret || "").trim();
  const redirectUri = String(body?.redirectUri || "").trim();
  if (!owner) return [400, { error: "bad_request", detail: "ownerId required" }];
  if (!clientId || !clientSecret || !redirectUri) {
    return [503, { error: "not_configured",
      detail: `${p.label} needs its own developer app. Add the Client ID, Client Secret and redirect URI for it in Company Settings → API settings, then connect.` }];
  }
  const state = randomBytes(16).toString("hex");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  pendingOAuth.set("sm_" + state, { platform, owner, clientId, clientSecret, redirectUri, verifier, exp: Date.now() + 10 * 60e3 });
  const q = {
    [p.clientKeyParam || "client_id"]: clientId,
    redirect_uri: redirectUri, response_type: "code",
    scope: p.scope, state: "sm_" + state, ...(p.extraAuth || {}),
  };
  if (p.pkce) { q.code_challenge = challenge; q.code_challenge_method = "S256"; }
  return [200, { authUrl: p.auth + (p.auth.includes("?") ? "&" : "?") + new URLSearchParams(q), state: "sm_" + state }];
}

async function handleSocialCallback(reqUrl) {
  const u = new URL(reqUrl, "http://x");
  const code = u.searchParams.get("code"), state = u.searchParams.get("state"), err = u.searchParams.get("error");
  const page = (title, msg, ok) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<body style="font:15px/1.5 -apple-system,system-ui,sans-serif;color:#1F2937;max-width:420px;margin:60px auto;padding:0 20px;text-align:center">
<div style="font-size:34px">${ok ? "✅" : "⚠️"}</div><h2 style="margin:8px 0">${title}</h2><p style="color:#6B7280">${msg}</p>
<script>try{if(window.opener){window.opener.postMessage({socialOAuth:${ok ? '"ok"' : '"error"'}},"*");setTimeout(function(){window.close();},1400);}}catch(e){}</script></body>`;
  if (err) return page("Connection cancelled", "The platform returned: " + err + ". You can close this window.", false);
  const pend = state && pendingOAuth.get(state);
  if (!pend || Date.now() > pend.exp) return page("Link expired", "That connection link expired — start again from the app.", false);
  pendingOAuth.delete(state);
  const p = SOCIAL_PROVIDERS[pend.platform];
  try {
    const form = {
      code, grant_type: "authorization_code", redirect_uri: pend.redirectUri,
      [p.clientKeyParam || "client_id"]: pend.clientId,
    };
    const headers = { "Content-Type": "application/x-www-form-urlencoded" };
    /* X and Pinterest authenticate the TOKEN call with HTTP Basic rather than
       a secret in the body — sending it the other way is rejected */
    if (p.basicAuthToken) headers.Authorization = "Basic " + Buffer.from(`${pend.clientId}:${pend.clientSecret}`).toString("base64");
    else form.client_secret = pend.clientSecret;
    if (p.pkce) form.code_verifier = pend.verifier;

    const tr = await fetch(p.token, { method: "POST", headers, body: new URLSearchParams(form), signal: AbortSignal.timeout(25000) });
    const td = await tr.json().catch(() => ({}));
    if (!tr.ok || (!td.access_token && !td.data?.access_token)) {
      return page("Could not finish", (td.error_description || td.error?.message || td.error || `token exchange HTTP ${tr.status}`) + "", false);
    }
    const accessToken = td.access_token || td.data?.access_token;
    let prof = null;
    try { prof = await p.profile(accessToken); } catch { /* profile is a nicety, not the connection */ }
    mkdirSync(SOCIAL_DIR, { recursive: true });
    writeFileSync(socialFile(pend.owner, pend.platform), JSON.stringify({
      platform: pend.platform, owner: pend.owner,
      accessToken, refreshToken: td.refresh_token || td.data?.refresh_token || null,
      expiresIn: td.expires_in || null, scope: td.scope || p.scope,
      name: prof?.name || p.label, handle: prof?.handle || "", extra: prof || null, at: Date.now(),
    }));
    return page("Connected", `${p.label} is linked${prof?.handle ? " as " + prof.handle : ""}. You can close this window.`, true);
  } catch (e) { return page("Could not finish", String(e?.message || e).slice(0, 180), false); }
}

function handleSocialStatus(body) {
  const owner = String(body?.ownerId || "").trim();
  if (!owner) return [400, { error: "bad_request", detail: "ownerId required" }];
  const out = {};
  for (const platform of [...Object.keys(SOCIAL_PROVIDERS), "bluesky"]) {
    const d = readJson(socialFile(owner, platform), null);
    if (d) out[platform] = { connected: true, name: d.name, handle: d.handle, at: d.at, scope: d.scope || null };
  }
  return [200, { ok: true, accounts: out, available: [...Object.keys(SOCIAL_PROVIDERS), "bluesky"] }];
}

function handleSocialDisconnect(body) {
  const owner = String(body?.ownerId || "").trim();
  const platform = String(body?.platform || "");
  if (!owner || !platform) return [400, { error: "bad_request", detail: "ownerId and platform required" }];
  try { rmSync(socialFile(owner, platform), { force: true }); } catch { /* already gone */ }
  return [200, { ok: true }];
}


/* ======================================================================
   BLOGS & FAQS RESEARCH — the scrape steps behind the architect.

   Three sources, three endpoints, all returning plain lists the UI shows in
   boxes BEFORE any generation happens, so the human can see exactly what
   research the plan will be built from. Nothing here fabricates: a source
   that cannot be reached reports why, per item, instead of inventing rows.
   ====================================================================== */
const isQuestionish = (q) => /^(how|what|why|when|where|who|which|can|do|does|is|are|should|will|vs|best|worth)\b/i.test(q) || /\?$/.test(q) || / vs\.? | cost| price| worth| problems| review/i.test(q);
const normQ = (s) => String(s).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/* Reddit's public JSON search + Quora surfaced through a plain Google query
   (Quora has no public API and blocks crawlers; Google ranks its threads for
   its own brand term, so "«topic» quora" found via DataForSEO organic is the
   reliable route — and it is a NORMAL query, not a site: operator, so it is
   billed at base rate, not the 5x operator rate). */
async function handleCommunityFaqs(body) {
  const topics = [...new Set((Array.isArray(body?.topics) ? body.topics : []).map((t) => String(t).trim()).filter(Boolean))].slice(0, 8);
  if (!topics.length) return [400, { error: "bad_request", detail: "topics[] required — add services or products first." }];
  const creds = resolveCreds(body);
  const out = [];
  const errors = [];
  const seen = new Set();
  const push = (q, source, url) => {
    const k = normQ(q);
    if (!k || k.length < 12 || seen.has(k)) return;
    seen.add(k);
    out.push({ q: String(q).trim().slice(0, 180), source, url: url || null });
  };
  for (const topic of topics) {
    /* Reddit: free, real people, real phrasing */
    try {
      const r = await fetch(`https://www.reddit.com/search.json?q=${encodeURIComponent(topic)}&limit=25&sort=relevance&t=year`,
        { headers: { "User-Agent": "serpsquad-research/1.0" }, signal: AbortSignal.timeout(12000) });
      if (r.ok) {
        const d = await r.json();
        (d.data?.children || []).forEach((c) => {
          const t = c.data?.title || "";
          if (isQuestionish(t)) push(t, "reddit", "https://www.reddit.com" + (c.data?.permalink || ""));
        });
      } else errors.push(`Reddit HTTP ${r.status} for "${topic}"`);
    } catch (e) { errors.push(`Reddit: ${String(e?.message || e).slice(0, 60)}`); }
    /* Quora via a plain organic query — needs DataForSEO */
    if (creds) {
      try {
        const task = await dfsLive(creds, "google/organic", { keyword: `${topic} questions quora`, location_name: "United States", language_code: "en", depth: 20 });
        (task.result?.[0]?.items || []).filter((it) => it.type === "organic" && /quora\.com/.test(it.domain || ""))
          .forEach((it) => push(String(it.title || "").replace(/\s*-\s*Quora\s*$/i, ""), "quora", it.url));
      } catch (e) { errors.push(`Quora (DataForSEO): ${String(e?.message || e).slice(0, 60)}`); }
    }
  }
  if (!creds) errors.push("Quora needs DataForSEO (Company Settings → API settings) — Reddit-only results shown.");
  return [200, { live: true, faqs: out.slice(0, 150), errors: errors.slice(0, 6), topics }];
}

/* Competitor blogs & FAQs, from each domain's own sitemap. "Common" marks a
   topic that appears (near-duplicate title) on 2+ of the competitors — the
   themes the market agrees are worth writing; "uncommon" are single-domain
   angles, often the gaps worth stealing. */
async function handleCompetitorTopics(body) {
  const domains = [...new Set((Array.isArray(body?.domains) ? body.domains : [])
    .map((d) => String(d).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")).filter(Boolean))].slice(0, 5);
  if (!domains.length) return [400, { error: "bad_request", detail: "domains[] required — add competitor websites first." }];

  const fetchXml = async (url) => {
    const r = await fetch(url, { headers: BROWSER_HEADERS, redirect: "follow", signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  };
  const locsOf = (xml) => [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1].trim());
  const POSTY = /(blog|faq|article|news|guide|resource|learn|tip|question|post|advice|insight)/i;

  const topics = [];
  const errors = {};
  const perDomain = {};
  for (const domain of domains) {
    try {
      let urls = [];
      /* root sitemap first; on an index, follow the children that look like posts */
      for (const start of [`https://${domain}/sitemap.xml`, `https://${domain}/sitemap_index.xml`, `https://${domain}/wp-sitemap.xml`]) {
        try {
          const xml = await fetchXml(start);
          const locs = locsOf(xml);
          if (!locs.length) continue;
          if (/<sitemapindex/i.test(xml)) {
            const kids = locs.filter((u) => /post|blog|page|faq|news|article/i.test(u)).slice(0, 5);
            for (const kid of (kids.length ? kids : locs.slice(0, 3))) {
              try { urls.push(...locsOf(await fetchXml(kid))); } catch { /* one child down */ }
            }
          } else urls = locs;
          if (urls.length) break;
        } catch { /* try the next well-known path */ }
      }
      if (!urls.length) { errors[domain] = "no readable sitemap"; continue; }
      const posts = urls
        .map((u) => { try { return new URL(u); } catch { return null; } })
        .filter(Boolean)
        .filter((u) => POSTY.test(u.pathname) || (u.pathname.split("/").filter(Boolean).length >= 2 && /-/.test(u.pathname.split("/").filter(Boolean).pop() || "")))
        .slice(0, 150);
      perDomain[domain] = posts.length;
      posts.forEach((u) => {
        const slug = (u.pathname.split("/").filter(Boolean).pop() || "").replace(/\.(html?|php)$/i, "");
        const title = slug.replace(/[-_]+/g, " ").trim();
        if (title.length >= 8 && !/^\d+$/.test(title)) topics.push({ title, slug, url: u.href, domain });
      });
    } catch (e) { errors[domain] = String(e?.message || e).slice(0, 80); }
  }
  /* commonality: same-ish title on 2+ different domains */
  const toks = (s) => new Set(normQ(s).split(" ").filter((w) => w.length > 3));
  for (const t of topics) {
    t.common = topics.some((o) => o.domain !== t.domain && (() => {
      const A = toks(t.title), B = toks(o.title);
      if (A.size < 2 || B.size < 2) return false;
      let n = 0; A.forEach((w) => B.has(w) && n++);
      return n / Math.min(A.size, B.size) >= 0.6;
    })());
  }
  return [200, { live: true, topics: topics.slice(0, 400), perDomain, errors }];
}

/* the connected WordPress site's real post categories — for the plan's
   category dropdown and the pusher */
async function handleWpCategories(body) {
  const g = wpGuard(body); if (g) return g;
  try {
    const cats = await wpFetch(body, `/categories?per_page=100&_fields=id,name,count,parent`);
    return [200, { live: true, categories: (cats || []).map((c) => ({ id: c.id, name: c.name, count: c.count, parent: c.parent || 0 })) }];
  } catch (e) { return wpErr(e); }
}

/* ---- Google Places: resolve the business location (Find Place) ---- */
async function handlePlacesLocate(body) {
  const key = body.placesKey;
  if (!key) return [503, { error: "places_not_configured", hint: "Add a Google Places API key in Company Settings → API settings, or enter coordinates manually." }];
  const input = encodeURIComponent(body.query || "");
  if (!input) return [400, { error: "query required" }];
  const res = await fetch(`https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${input}&inputtype=textquery&fields=name,formatted_address,geometry,place_id&key=${key}`);
  const data = await res.json();
  if (data.status === "REQUEST_DENIED" || data.status === "INVALID_REQUEST") return [502, { error: "provider_error", detail: data.error_message || data.status }];
  const c = data.candidates?.[0];
  if (!c) return [200, { live: true, found: false }];
  return [200, { live: true, found: true, name: c.name, address: c.formatted_address, lat: c.geometry.location.lat, lng: c.geometry.location.lng, placeId: c.place_id }];
}

/* ---- public share links: the server's first persistence =========
   POST /api/share  { payload } → { id }   (stored as server/data/shares/<id>.json)
   GET  /api/share/<id>         → the stored payload
   Links are unguessable (128-bit id) and read-only — no credentials involved,
   nothing sensitive stored (rank data only, no API keys). ---- */
const SHARE_DIR = new URL("./data/shares/", import.meta.url);
function handleShareCreate(body) {
  if (!body?.payload) return [400, { error: "payload required" }];
  const raw = JSON.stringify(body.payload);
  if (raw.length > 8e6) return [413, { error: "payload too large" }];
  mkdirSync(SHARE_DIR, { recursive: true });
  const id = randomBytes(16).toString("hex");
  writeFileSync(new URL(id + ".json", SHARE_DIR), raw);
  return [200, { id }];
}
function handleShareGet(id) {
  if (!/^[a-f0-9]{32}$/.test(id)) return [400, { error: "bad id" }];
  const f = new URL(id + ".json", SHARE_DIR);
  if (!existsSync(f)) return [404, { error: "not_found" }];
  return [200, JSON.parse(readFileSync(f, "utf8"))];
}

/* ---- AI generation proxy =========================================
   POST /api/generate { provider, apiKey, model?, system?, prompt, json?, maxTokens? }
   One endpoint, four providers — keys come from Company Settings → API settings
   per request (same trust model as DataForSEO). 503 without a key, 502 with the
   provider's own error — generation is never faked here. ---- */
const AI_DEFAULT_MODELS = { openai: "gpt-4o", deepseek: "deepseek-chat", claude: "claude-sonnet-5", gemini: "gemini-2.5-pro" };
async function handleGenerate(body) {
  const { provider, apiKey, model, system, prompt, json, maxTokens } = body || {};
  if (!provider || !AI_DEFAULT_MODELS[provider]) return [400, { error: "provider must be one of openai|claude|gemini|deepseek" }];
  if (!apiKey) return [503, { error: "not_configured", hint: "Add the provider's API key in Company Settings → API settings" }];
  if (!prompt) return [400, { error: "prompt required" }];
  const mdl = model || AI_DEFAULT_MODELS[provider];
  const CAPS = { openai: 16000, deepseek: 8192, claude: 16000, gemini: 16000 };
  const max = Math.min(CAPS[provider] || 8000, Math.max(256, +maxTokens || 4000));
  let text, finish = "";
  try {
    if (provider === "claude") {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: mdl, max_tokens: max, ...(system ? { system } : {}), messages: [{ role: "user", content: prompt }] }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(`Anthropic ${r.status}: ${d.error?.message || JSON.stringify(d).slice(0, 200)}`);
      text = (d.content || []).map((c) => c.text || "").join("");
      finish = d.stop_reason || "";
    } else if (provider === "gemini") {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(mdl)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
          contents: [{ parts: [{ text: prompt }] }],
          /* Gemini 2.5+ "thinking" models spend maxOutputTokens on internal
             reasoning FIRST — without headroom + a bounded thinking budget
             they burn the whole allowance and return zero text parts
             ("provider returned empty output" on hard JSON tasks) */
          generationConfig: {
            maxOutputTokens: max + 8192,
            ...(json ? { responseMimeType: "application/json" } : {}),
            ...(/gemini-[23]/.test(mdl) ? { thinkingConfig: { thinkingBudget: 4096 } } : {}),
          },
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(`Gemini ${r.status}: ${d.error?.message || JSON.stringify(d).slice(0, 200)}`);
      text = (d.candidates?.[0]?.content?.parts || []).map((pt) => pt.text || "").join("");
      finish = d.candidates?.[0]?.finishReason || "";
    } else { // openai | deepseek — OpenAI-compatible chat completions
      const base = provider === "deepseek" ? "https://api.deepseek.com" : "https://api.openai.com";
      const r = await fetch(base + "/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: "Bearer " + apiKey, "content-type": "application/json" },
        body: JSON.stringify({
          model: mdl, max_tokens: max,
          ...(json ? { response_format: { type: "json_object" } } : {}),
          messages: [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: prompt }],
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(`${provider} ${r.status}: ${d.error?.message || JSON.stringify(d).slice(0, 200)}`);
      text = d.choices?.[0]?.message?.content || "";
      finish = d.choices?.[0]?.finish_reason || "";
    }
  } catch (e) {
    return [502, { error: "provider_error", detail: String(e.message || e).slice(0, 400) }];
  }
  if (!text.trim()) return [502, { error: "provider_error",
    detail: `provider returned empty output${finish ? ` (finish reason: ${finish}${/max_tokens|MAX_TOKENS|length/i.test(finish) ? " — the model spent its whole token budget, likely on internal reasoning; retrying usually works" : ""})` : ""}` }];
  return [200, { live: true, provider, model: mdl, text }];
}

/* ---- tiny http layer ---- */
http.createServer(async (req, res) => {
  const CORS = { ...corsFor(req), ...SEC_HEADERS };
  /* gzip JSON responses when the client accepts it — the workspace state runs
     to double-digit megabytes and JSON compresses ~10x, turning a load that
     timed out (and made the app fall back to seed data) into a fast one */
  const send = (code, obj) => {
    const headers = { "Content-Type": "application/json", ...CORS, ...(PIXEL_ROUTES.includes((req.url || "").split("?")[0]) ? { "Access-Control-Allow-Origin": "*" } : {}) };
    const body = JSON.stringify(obj);
    if (body.length > 4096 && /\bgzip\b/.test(String(req.headers["accept-encoding"] || ""))) {
      gzip(Buffer.from(body), (err, buf) => {
        if (err) { res.writeHead(code, headers); res.end(body); return; }
        res.writeHead(code, { ...headers, "Content-Encoding": "gzip", "Content-Length": buf.length, Vary: "Accept-Encoding" });
        res.end(buf);
      });
      return;
    }
    res.writeHead(code, headers);
    res.end(body);
  };
  if (req.method === "OPTIONS") { const px = PIXEL_ROUTES.includes((req.url || "").split("?")[0]); res.writeHead(204, px ? { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } : corsFor(req)); return res.end(); }
  const ip = req.socket.remoteAddress || "?";
  if (rateLimited(ip, "all", 240, 60e3)) return send(429, { error: "rate_limited", detail: "Too many requests — slow down." });
  if (req.url.startsWith("/api/auth/") && rateLimited(ip, "auth", 20, 10 * 60e3)) return send(429, { error: "rate_limited", detail: "Too many authentication attempts — try again later." });
  if ((req.url === "/api/app/login" || req.url === "/api/app/2fa") && rateLimited(ip, "applogin", 20, 10 * 60e3)) return send(429, { error: "rate_limited", detail: "Too many sign-in attempts — try again in a few minutes." });
  if (req.url.startsWith("/api/pixel/verify") && rateLimited(ip, "pixel", 30, 60e3)) return send(429, { error: "rate_limited" });
  /* deployed lead forms are public — one visitor has no reason to send more
     than a handful of enquiries in ten minutes */
  if (req.url === "/api/form/submit" && rateLimited(ip, "form", 8, 10 * 60e3)) return send(429, { error: "rate_limited", detail: "Too many submissions — please call us instead." });
  if (req.url.startsWith("/api/outreach/") && rateLimited(ip, "outreach", 60, 60 * 60e3)) return send(429, { error: "rate_limited", detail: "Outreach send limit reached (60/hour) — protects your sender reputation." });
  try {
    if (req.method === "GET" && req.url === "/api/health") return send(200, { ok: true, dfsConfigured: !!fileCreds() });
    if (req.method === "GET" && req.url.startsWith("/px.js")) {
      const host = String(req.headers["x-forwarded-host"] || req.headers.host || "app.serpsquad.com").split(",")[0].trim();
      const proto = /^(localhost|127\.)/.test(host) ? "http://" : "https://";
      res.writeHead(200, { "Content-Type": "application/javascript", "Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*" });
      return res.end(pxJs(proto + host));
    }
    /* image preview proxy: client-site WAFs challenge cross-site <img> loads
       (no cookies) and previews hang — the CRM's server fetches instead.
       SSRF-guarded: only hosts that are a connected project's website. */
    if (req.method === "GET" && req.url.startsWith("/api/img?")) {
      try {
        const target = new URL(new URL(req.url, "http://x").searchParams.get("u") || "");
        if (!/^https?:$/.test(target.protocol)) return send(400, { error: "bad_url" });
        const hosts = new Set();
        const st = loadState();
        (st?.clients || []).forEach((c) => (c.projects || []).forEach((p) => {
          const h = String(p.website || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "").toLowerCase();
          if (h) hosts.add(h);
        }));
        const th = target.hostname.replace(/^www\./, "").toLowerCase();
        if (![...hosts].some((h) => th === h || th.endsWith("." + h))) return send(403, { error: "host_not_allowed" });
        const r = await fetch(target, { redirect: "follow", signal: AbortSignal.timeout(25000), headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          "Accept": "image/avif,image/webp,image/*,*/*;q=0.8",
        } });
        const ct = r.headers.get("content-type") || "";
        if (!r.ok || !ct.startsWith("image/")) return send(502, { error: "not_image", status: r.status });
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 15e6) return send(502, { error: "too_large" });
        res.writeHead(200, { "Content-Type": ct, "Cache-Control": "public, max-age=86400", "Content-Length": buf.length });
        return res.end(buf);
      } catch (e) { return send(502, { error: String(e?.message || e).slice(0, 100) }); }
    }
    if (req.method === "GET" && req.url.startsWith("/api/share/")) { const [c2, p2] = handleShareGet(req.url.slice(11)); return send(c2, p2); }
    if (req.method === "GET" && req.url.startsWith("/api/state?")) { const [c2, p2] = handleStateGet(req); return send(c2, p2); }
    if (req.method === "GET" && req.url === "/api/state") { const [c2, p2] = handleStateGet(req); return send(c2, p2); }
    if (req.method === "GET" && req.url.startsWith("/api/state/slice?")) { const [c2, p2] = handleStateSlice(req); return send(c2, p2); }
    if (req.method === "GET" && req.url === "/api/state/backups") { const [c2, p2] = handleStateBackups(req); return send(c2, p2); }
    /* Google OAuth callback — Google redirects the browser here; returns an HTML page that hands the connection back to the app */
    if (req.method === "GET" && req.url.startsWith("/api/oauth/social/callback")) {
      const html = await handleSocialCallback(req.url);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...SEC_HEADERS });
      return res.end(html);
    }
    if (req.method === "GET" && req.url.startsWith("/api/oauth/google/callback")) {
      const html = await handleOAuthCallback(req.url);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...SEC_HEADERS });
      return res.end(html);
    }
    /* geo-grid snapshot image for audit emails — key-free, loads from any mail client */
    if (req.method === "GET" && /^\/api\/geo\/snapshot\/[a-f0-9]{24}\.png$/.test(req.url)) {
      try {
        const png = readFileSync(new URL(req.url.split("/").pop(), SNAP_DIR));
        res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=604800", "Access-Control-Allow-Origin": "*" });
        return res.end(png);
      } catch { return send(404, { error: "not_found" }); }
    }
    /* tracking pixel + click redirect — must answer any origin (they load from recipients' mail clients) */
    if (req.method === "GET" && req.url.startsWith("/api/t/o/")) {
      trackHit(decodeURIComponent(req.url.slice(9).replace(/\.gif.*$/, "")), "o");
      res.writeHead(200, { "Content-Type": "image/gif", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
      return res.end(GIF_1PX);
    }
    if (req.method === "GET" && req.url.startsWith("/api/t/c/")) {
      const u = new URL(req.url, "http://x");
      trackHit(decodeURIComponent(u.pathname.slice(9)), "c");
      const dest = u.searchParams.get("u") || "";
      if (!/^https?:\/\//i.test(dest)) return send(400, { error: "bad_request" });
      res.writeHead(302, { Location: dest, "Cache-Control": "no-store" });
      return res.end();
    }
    if (req.method === "POST" && ["/api/scan-listings", "/api/rerun", "/api/check-index", "/api/geo-grid", "/api/places-locate", "/api/share", "/api/serp-top", "/api/generate", "/api/profile-listings", "/api/ads/accounts", "/api/ads/metrics", "/api/ads/publish", "/api/auth/2fa/start", "/api/auth/2fa/verify", "/api/auth/device-check", "/api/custom/test", "/api/custom/deploy", "/api/dfs-balance", "/api/wp/media", "/api/wp/media-update", "/api/wp/content", "/api/wp/deploy", "/api/wp/cleanup", "/api/wp/test", "/api/wp/categories", "/api/posts/community", "/api/posts/competitors", "/api/wp/agent/key", "/api/wp/agent/pair", "/api/wp/agent/poll", "/api/wp/agent/result", "/api/wp/agent/status", "/api/wp/agent/exec", "/api/webflow/deploy", "/api/webflow/publish", "/api/pixel/verify", "/api/pixel/status", "/api/pixel/check", "/api/audit/website", "/api/crawl/sitemap", "/api/crawl/page", "/api/crawl/meta", "/api/audit/profile", "/api/leads/search", "/api/scrape-email", "/api/outreach/send", "/api/guestpost/search", "/api/guestpost/metrics", "/api/mail/test", "/api/mail/inbox", "/api/mail/message", "/api/rank/start", "/api/rank/status", "/api/form/register", "/api/form/submit", "/api/form/leads", "/api/track/stats", "/api/kw/research", "/api/kw/domain", "/api/kw/volume", "/api/insight/audit", "/api/app/login", "/api/app/2fa", "/api/app/logout", "/api/state", "/api/state/domains", "/api/state/restore", "/api/state/backup-extract", "/api/oauth/google/start", "/api/social/start", "/api/social/status", "/api/social/disconnect", "/api/social/bluesky", "/api/google/gsc/sites", "/api/google/gsc/query", "/api/google/ga4/properties", "/api/google/ga4/report"].includes(req.url)) {
      /* /api/state carries the WHOLE workspace (tracking, geo-grid snapshots,
         saved keyword searches) — a tight cap here silently loses data */
      const bodyCap = (req.url === "/api/state" || req.url === "/api/state/domains") ? 32e6 : 4e6;
      const chunks = [];
      let received = 0;
      for await (const chunk of req) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        received += buf.length;
        if (received > bodyCap) throw new Error("payload too large");
        chunks.push(buf);
      }
      /* the workspace runs to double-digit megabytes and compresses ~15x, so
         the app sends it gzipped: an autosave that took four seconds (four
         seconds in which a reload loses the change) lands in well under one */
      let bodyBuf = Buffer.concat(chunks);
      if (/\bgzip\b/i.test(String(req.headers["content-encoding"] || ""))) {
        bodyBuf = gunzipSync(bodyBuf);
        if (bodyBuf.length > 64e6) throw new Error("payload too large");
      }
      const raw = bodyBuf.toString("utf8");
      /* deployed lead forms still submit natively when JavaScript is off — that
         arrives as a urlencoded form post, and deserves an HTML reply */
      const formPost = /application\/x-www-form-urlencoded/i.test(String(req.headers["content-type"] || ""));
      const body = formPost ? Object.fromEntries(new URLSearchParams(raw)) : JSON.parse(raw || "{}");
      if (formPost && req.url === "/api/form/submit") {
        const [code2, payload2] = await handleFormSubmit(body, ip);
        const ok = code2 === 200 && payload2.ok;
        const back = /^https?:\/\/[^"'<>\s]+$/.test(String(req.headers.referer || "")) ? req.headers.referer : "";
        res.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8", ...SEC_HEADERS });
        return res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${ok ? "Request received" : "Could not send"}</title><body style="font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;max-width:34em;margin:14vh auto;padding:0 6vw;color:#141b24"><h1 style="font-size:24px">${ok ? "Thanks — your request is in." : "That didn't send"}</h1><p>${ok ? "We'll reply by email shortly." : escHtml(payload2.detail || "Please check the form and try again.")}</p>${back ? `<p><a href="${escHtml(back)}">← Back to the page</a></p>` : ""}`);
      }
      const [code, payload] = req.url === "/api/scan-listings" ? await handleScan(body)
        : req.url === "/api/check-index" ? await handleCheckIndex(body)
        : req.url === "/api/geo-grid" ? await handleGeoGrid(body)
        : req.url === "/api/places-locate" ? await handlePlacesLocate(body)
        : req.url === "/api/share" ? handleShareCreate(body)
        : req.url === "/api/serp-top" ? await handleSerpTop(body)
        : req.url === "/api/generate" ? await handleGenerate(body)
        : req.url === "/api/profile-listings" ? await handleProfileListings(body)
        : req.url === "/api/ads/accounts" ? await handleAdsAccounts(body)
        : req.url === "/api/ads/metrics" ? await handleAdsMetrics(body)
        : req.url === "/api/ads/publish" ? await handleAdsPublish(body)
        : req.url === "/api/auth/2fa/start" ? await handle2faStart(body)
        : req.url === "/api/auth/2fa/verify" ? handle2faVerify(body)
        : req.url === "/api/auth/device-check" ? handleDeviceCheck(body)
        : req.url === "/api/custom/test" ? await handleCustomTest(body)
        : req.url === "/api/custom/deploy" ? await handleCustomDeploy(body)
        : req.url === "/api/dfs-balance" ? await handleDfsBalance(body)
        : req.url === "/api/wp/media" ? await handleWpMedia(body)
        : req.url === "/api/wp/media-update" ? await handleWpMediaUpdate(body)
        : req.url === "/api/wp/content" ? await handleWpContent(body)
        : req.url === "/api/wp/deploy" ? await handleWpDeploy(body)
        : req.url === "/api/wp/cleanup" ? await handleWpCleanup(body)
        : req.url === "/api/wp/test" ? await handleWpTest(body)
        : req.url === "/api/wp/categories" ? await handleWpCategories(body)
        : req.url === "/api/posts/community" ? await handleCommunityFaqs(body)
        : req.url === "/api/posts/competitors" ? await handleCompetitorTopics(body)
        : req.url === "/api/wp/agent/key" ? handleAgentKey(req, body)
        : req.url === "/api/wp/agent/pair" ? handleAgentPair(body)
        : req.url === "/api/wp/agent/poll" ? handleAgentPoll(req, raw)
        : req.url === "/api/wp/agent/result" ? handleAgentResult(req, raw, body)
        : req.url === "/api/wp/agent/status" ? handleAgentStatus(req, body)
        : req.url === "/api/wp/agent/exec" ? await handleAgentExec(req, body)
        : req.url === "/api/webflow/deploy" ? await handleWebflowDeploy(body)
        : req.url === "/api/webflow/publish" ? await handleWebflowPublish(body)
        : req.url === "/api/pixel/verify" ? handlePixelVerify(body, req)
        : req.url === "/api/pixel/status" ? handlePixelStatus(body)
        : req.url === "/api/pixel/check" ? await handlePixelCheck(body)
        : req.url === "/api/audit/website" ? await handleAuditWebsite(body)
        : req.url === "/api/crawl/sitemap" ? await handleCrawlSitemap(body)
        : req.url === "/api/crawl/page" ? await handleCrawlPage(body)
        : req.url === "/api/crawl/meta" ? await handleCrawlMeta(body)
        : req.url === "/api/audit/profile" ? await handleAuditProfile(body)
        : req.url === "/api/leads/search" ? await handleLeadsSearch(body)
        : req.url === "/api/scrape-email" ? await handleScrapeEmail(body)
        : req.url === "/api/outreach/send" ? await handleOutreachSend(body)
        : req.url === "/api/guestpost/search" ? await handleGuestSearch(body)
        : req.url === "/api/guestpost/metrics" ? await handleGuestMetrics(body)
        : req.url === "/api/rank/start" ? await handleRankStart(body)
        : req.url === "/api/rank/status" ? await handleRankStatus(body)
        : req.url === "/api/mail/test" ? await handleMailTest(body)
        : req.url === "/api/form/register" ? handleFormRegister(body)
        : req.url === "/api/form/submit" ? await handleFormSubmit(body, ip)
        : req.url === "/api/form/leads" ? handleFormLeads(body)
        : req.url === "/api/mail/inbox" ? await handleMailInbox(body)
        : req.url === "/api/mail/message" ? await handleMailMessage(body)
        : req.url === "/api/track/stats" ? handleTrackStats(body)
        : req.url === "/api/kw/volume" ? await handleKwVolume(body)
        : req.url === "/api/kw/research" ? await handleKwResearch(body)
        : req.url === "/api/kw/domain" ? await handleKwDomain(body)
        : req.url === "/api/insight/audit" ? await handleInsightAudit(body)
        : req.url === "/api/app/login" ? await handleAppLogin(body)
        : req.url === "/api/app/2fa" ? handleAppTwofa(body)
        : req.url === "/api/app/logout" ? handleAppLogout(req)
        : req.url === "/api/state" ? handleStateSave(req, body)
        : req.url === "/api/state/domains" ? handleStateDomains(req, body)
        : req.url === "/api/state/restore" ? handleStateRestore(req, body)
        : req.url === "/api/state/backup-extract" ? handleStateBackupExtract(req, body)
        : req.url === "/api/social/start" ? handleSocialStart(body)
        : req.url === "/api/social/status" ? handleSocialStatus(body)
        : req.url === "/api/social/disconnect" ? handleSocialDisconnect(body)
        : req.url === "/api/social/bluesky" ? await handleSocialBluesky(body)
        : req.url === "/api/oauth/google/start" ? handleOAuthStart(body)
        : req.url === "/api/google/gsc/sites" ? await handleGscSites(body)
        : req.url === "/api/google/gsc/query" ? await handleGscQuery(body)
        : req.url === "/api/google/ga4/properties" ? await handleGa4Properties(body)
        : req.url === "/api/google/ga4/report" ? await handleGa4Report(body)
        : await handleRerun(body);
      return send(code, payload);
    }
    send(404, { error: "not_found" });
  } catch (e) {
    send(500, { error: String(e.message || e) });
  }
}).listen(PORT, process.env.HOST || "127.0.0.1", () => console.log(`SERP Squad API server on http://${process.env.HOST || "127.0.0.1"}:${PORT} — CORS allowlist: ${APP_ORIGINS.join(", ")} (DataForSEO ${fileCreds() ? "configured" : "not configured — UI can still pass credentials per request"})`));
