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
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { connect as tlsConnect } from "node:tls";
import { parseSerpRank } from "../src/lib/dataforseo.js";

const PORT = process.env.PORT || 8787;
const DFS_BASE = "https://api.dataforseo.com/v3";

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
const authHeader = (c) => "Basic " + Buffer.from(`${c.login}:${c.password}`).toString("base64");

async function dfsLive(creds, pathSeg, task) { // pathSeg: "google/organic" | "bing/organic" | "google/maps"
  const res = await fetch(`${DFS_BASE}/serp/${pathSeg}/live/advanced`, {
    method: "POST",
    headers: { Authorization: authHeader(creds), "Content-Type": "application/json" },
    body: JSON.stringify([task]),
  });
  if (!res.ok) throw new Error(`DataForSEO HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const t = data.tasks?.[0];
  if (!t || t.status_code !== 20000) throw new Error(`DataForSEO task ${t?.status_code}: ${t?.status_message}`);
  return t;
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
  const task = await dfsLive(creds, "google/organic", { keyword: `site:${bare}`, location_name: "United States", language_code: "en", depth: 10 });
  const items = (task.result?.[0]?.items || []).filter((it) => it.type === "organic");
  const target = normUrl(url);
  // exact match first; then prefix match ONLY for a root URL (site:example.com
  // legitimately returns deeper pages — a deep URL must match exactly)
  const isRoot = !target.includes("/");
  const hit = items.find((it) => normUrl(it.url) === target) || (isRoot ? items.find((it) => normUrl(it.url).startsWith(target)) : null);
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
  if (!creds) return [503, { error: "not_configured" }];
  const keyword = String(body.keyword || "").trim();
  if (!keyword) return [400, { error: "keyword required" }];
  const location = body.location_name || "United States";
  const n = Math.min(10, Math.max(1, +body.count || 5));
  const task = await dfsLive(creds, "google/organic", { keyword, location_name: location, language_code: "en", depth: 20 })
    .catch((e) => ({ __err: String(e.message || e) }));
  if (task.__err) return [502, { error: "provider_error", detail: task.__err }];
  const items = (task.result?.[0]?.items || []).filter((it) => it.type === "organic").slice(0, n);
  return [200, { live: true, keyword, results: items.map((it) => ({
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
const loadState = () => { try { return JSON.parse(readFileSync(STATE_FILE, "utf8")); } catch { return null; } };
const saveState = (state) => {
  mkdirSync(new URL("./data/", import.meta.url), { recursive: true });
  const tmp = new URL("./data/app-state.json.tmp", import.meta.url);
  writeFileSync(tmp, JSON.stringify(state));
  renameSync(tmp, STATE_FILE); // atomic swap
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
function handleStateGet(req) {
  if (!sessionFromReq(req)) return [401, { error: "unauthorized", detail: "Session required." }];
  return [200, { live: true, state: loadState() }]; // null on first run → client seeds it
}
function handleStateSave(req, body) {
  const sess = sessionFromReq(req);
  if (!sess) return [401, { error: "unauthorized", detail: "Session required." }];
  if (sess.kind !== "team") return [403, { error: "forbidden", detail: "Only team accounts can write app state." }];
  if (!body?.state || typeof body.state !== "object") return [400, { error: "bad_request", detail: "state object required." }];
  const raw = JSON.stringify(body.state);
  if (raw.length > 60_000_000) return [413, { error: "too_large", detail: "State exceeds 60 MB — trim large embedded images." }];
  try { saveState(body.state); return [200, { ok: true, bytes: raw.length, at: Date.now() }]; }
  catch (e) { return [500, { error: "write_failed", detail: String(e?.message || e).slice(0, 120) }]; }
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
      const head = `From: ${cfg.from || cfg.user}\r\nTo: ${to}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\nDate: ${new Date().toUTCString()}`;
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
  if (/=\r?\n|=[0-9A-F]{2}/i.test(s) && !/[<>]/.test(s.slice(0, 200))) // quoted-printable
    s = s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  else if (/^[A-Za-z0-9+/=\r\n]+$/.test(s.trim()) && s.trim().length > 40) {
    try { const dec = Buffer.from(s.replace(/\s/g, ""), "base64").toString("utf8"); if (/[ a-z]/i.test(dec)) s = dec; } catch { /* keep raw */ }
  }
  return s.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/[ \t]+/g, " ").trim();
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
    const token = body?.accessToken || process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
    if (!token) return [503, { error: "not_configured", detail: "Google OAuth is not connected. Add the Google Cloud OAuth app in Company Settings → API settings and complete the consent flow — listing selection then reads your accounts' locations from the Business Profile API (mybusinessbusinessinformation.googleapis.com)." }];
    try {
      const accRes = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", { headers: { Authorization: "Bearer " + token } });
      if (!accRes.ok) return [502, { error: "provider_error", detail: `Google account list failed (HTTP ${accRes.status})` }];
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
    return [503, { error: "not_configured", detail: "Bing Places has no public listings API — access requires an approved Microsoft partner application. Store its credentials in Company Settings → API settings once Microsoft grants access; this endpoint then lists your store locations." }];
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
const wpBase = (site) => "https://" + String(site || "").replace(/^https?:\/\//, "").replace(/\/$/, "") + "/wp-json/wp/v2";
const wpAuth = (credential) => "Basic " + Buffer.from(String(credential || "").trim()).toString("base64");
const wpGuard = (body) => {
  if (!body?.site) return [400, { error: "bad_request", detail: "site (domain) required" }];
  if (!body?.credential || !String(body.credential).includes(":"))
    return [503, { error: "not_configured", detail: "WordPress Application Password missing — add it in the Connector tab (wp-admin → Users → Profile → Application Passwords)." }];
  return null;
};
async function wpFetch(body, path, init = {}) {
  const r = await fetch(wpBase(body.site) + path, {
    signal: AbortSignal.timeout(30000),
    ...init,
    headers: { Authorization: wpAuth(body.credential), "content-type": "application/json", ...(init.headers || {}) },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.message || `WordPress ${r.status}`); e.wp = r.status; throw e; }
  return d;
}
const wpErr = (e) => [502, { error: "provider_error", detail: "WordPress: " + (e?.message || e) }];

async function handleWpMedia(body) {
  const g = wpGuard(body); if (g) return g;
  try {
    const items = await wpFetch(body, "/media?per_page=100&_fields=id,source_url,title,alt_text,media_type,mime_type,date");
    return [200, { live: true, media: items.map((m) => ({ id: m.id, url: m.source_url, name: m.title?.rendered || "", alt: m.alt_text || "", type: m.media_type, mime: m.mime_type, date: m.date })) }];
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
    const existing = await wpFetch(body, `/${kind}?slug=${encodeURIComponent(p2.slug)}&status=any&_fields=id`);
    const payload = {
      title: p2.title, slug: p2.slug, content: p2.content || "",
      status: p2.status || "publish",
      ...(p2.date ? { date: p2.date } : {}),
      ...(kind === "pages" && parentId ? { parent: parentId } : {}),
      /* blank canvas template (theme bypass); WP ignores it gracefully when
         the template isn't registered on the site */
      ...(kind === "pages" && p2.template ? { template: p2.template } : {}),
      excerpt: p2.metaDesc || "",
      meta: {
        ...(p2.elementorData ? { _elementor_data: p2.elementorData, _elementor_edit_mode: "builder" } : {}),
        /* written into Yoast/RankMath when the companion plugin maps them */
        _serpsquad_meta_title: p2.metaTitle || "", _serpsquad_meta_desc: p2.metaDesc || "",
      },
    };
    const res2 = existing[0]?.id
      ? await wpFetch(body, `/${kind}/${existing[0].id}`, { method: "POST", body: JSON.stringify(payload) })
      : await wpFetch(body, `/${kind}`, { method: "POST", body: JSON.stringify(payload) });
    return [200, { live: true, id: res2.id, link: res2.link, updated: !!existing[0]?.id }];
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
  const engine = cse?.key && cse?.cx ? "cse" : creds ? "dfs" : null;
  if (!engine) return [503, { error: "not_configured", detail: "Add a Google Custom Search key + engine ID (free — 100 searches/day) or DataForSEO credentials in Company Settings → API settings." }];
  const byDomain = new Map();
  try {
    for (const fp of footprints) {
      const q = [niche, loc, fp].filter(Boolean).join(" ");
      let items = [];
      if (engine === "cse") {
        const u = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(cse.key)}&cx=${encodeURIComponent(cse.cx)}&q=${encodeURIComponent(q)}&num=10${gl ? `&gl=${gl}` : ""}`;
        const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
        const d = await r.json();
        if (d.error) return [502, { error: "provider_error", detail: `Google Custom Search: ${d.error.message || d.error.status}` }];
        items = (d.items || []).map((it) => ({ url: it.link, title: it.title || "", snippet: it.snippet || "" }));
      } else {
        const task = await dfsLive(creds, "google/organic", { keyword: q, location_name: country || "United States", language_code: "en", depth: 20 });
        items = (task.result?.[0]?.items || []).filter((it) => it.type === "organic").map((it) => ({ url: it.url, title: it.title || "", snippet: it.description || "" }));
      }
      for (const it of items) {
        let host; try { host = new URL(it.url).hostname.replace(/^www\./, ""); } catch { continue; }
        if (GP_BLOCKLIST.some((b) => host === b || host.endsWith("." + b))) continue;
        if (!byDomain.has(host)) byDomain.set(host, { domain: host, url: it.url, title: it.title.slice(0, 140), snippet: it.snippet.slice(0, 220), footprint: fp });
      }
    }
    return [200, { live: true, engine, niche, queries: footprints.length, results: [...byDomain.values()] }];
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
async function handleKwResearch(body) {
  const creds = resolveCreds(body);
  if (!creds) return [503, { error: "not_configured", detail: "Keyword research runs on DataForSEO Labs — add the credentials in Company Settings → API settings." }];
  const keyword = String(body?.keyword || "").trim().toLowerCase();
  if (!keyword) return [400, { error: "bad_request", detail: "A seed keyword is required." }];
  const location_name = String(body?.locationName || "United States");
  const language_code = String(body?.languageCode || "en");
  const limit = Math.min(Math.max(+body?.limit || 200, 20), 400);
  try {
    const r = await dfsLabs(creds, "keyword_suggestions", { keyword, location_name, language_code, limit, include_seed_keyword: true, include_serp_info: false });
    const rows = [];
    if (r.seed_keyword_data) rows.push(kwRow(r.seed_keyword || keyword, r.seed_keyword_data.keyword_info, r.seed_keyword_data.keyword_properties, { seed: true }));
    (r.items || []).forEach((it) => { if ((it.keyword || "") !== (r.seed_keyword || keyword) || !rows.length) rows.push(kwRow(it.keyword, it.keyword_info, it.keyword_properties)); });
    rows.sort((a, b) => (b.seed ? 1 : 0) - (a.seed ? 1 : 0) || (b.volume ?? -1) - (a.volume ?? -1));
    return [200, { live: true, mode: "keyword", keyword, locationName: location_name, total: rows.length, rows }];
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
    const r = await dfsLabs(creds, "ranked_keywords", { target, location_name, language_code, limit,
      order_by: ["keyword_data.keyword_info.search_volume,desc"] });
    const rows = (r.items || []).map((it) => kwRow(
      it.keyword_data?.keyword, it.keyword_data?.keyword_info, it.keyword_data?.keyword_properties,
      { rank: it.ranked_serp_element?.serp_item?.rank_absolute ?? null, url: it.ranked_serp_element?.serp_item?.url || "" }));
    return [200, { live: true, mode: "domain", domain: target, locationName: location_name, total: r.total_count ?? rows.length, rows }];
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
const PIXEL_ROUTES = ["/api/pixel/verify"];
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
const PX_JS = `(function(){try{var s=document.currentScript,k=s&&s.getAttribute("data-key");if(!k)return;var o=s.src.replace(/\/px\.js.*$/,"");var b=JSON.stringify({key:k,page:location.href});if(navigator.sendBeacon){navigator.sendBeacon(o+"/api/pixel/verify",b);}else{fetch(o+"/api/pixel/verify",{method:"POST",body:b,keepalive:true}).catch(function(){});}}catch(e){}})();`;

/* ---- WordPress connection tester: pinpoint exactly what's wrong ---- */
async function handleWpTest(body) {
  if (!body?.site) return [400, { error: "bad_request", detail: "site required" }];
  const checks = { reachable: false, restApi: false, authenticated: false, user: null, canPublish: false };
  try {
    const ping = await fetch(wpBase(body.site).replace("/wp/v2", ""), { signal: AbortSignal.timeout(10000) });
    checks.reachable = true;
    checks.restApi = ping.ok;
    if (!ping.ok) return [200, { checks, detail: `Site reached but /wp-json returned HTTP ${ping.status} — REST API may be disabled or blocked by a security plugin.` }];
  } catch (e) {
    return [200, { checks, detail: `Could not reach https://${body.site}/wp-json — check the domain, DNS and that the site is online. (${e?.message || e})` }];
  }
  if (!body.credential || !String(body.credential).includes(":"))
    return [200, { checks, detail: "REST API reachable ✓ — now add the Application Password as username:xxxx xxxx xxxx xxxx (the USERNAME prefix and the colon are required, not just the password)." }];
  try {
    const me = await fetch(wpBase(body.site) + "/users/me?context=edit", { headers: { Authorization: wpAuth(body.credential) }, signal: AbortSignal.timeout(10000) });
    const d = await me.json().catch(() => ({}));
    if (!me.ok) return [200, { checks, detail: `Authentication failed (HTTP ${me.status}): ${d.message || "check the username and that the Application Password was copied with its spaces"}. Note: some hosts strip the Authorization header — add "SetEnvIf Authorization" rules or enable it in the host panel.` }];
    checks.authenticated = true; checks.user = d.name || d.slug;
    checks.canPublish = (d.capabilities && (d.capabilities.publish_pages || d.capabilities.publish_posts)) || ["administrator", "editor"].some((r) => (d.roles || []).includes(r));
    return [200, { checks, detail: checks.canPublish ? `Connected as ${checks.user} ✓ — full-site deploys, scheduled posts and media sync are ready.` : `Authenticated as ${checks.user}, but this user can't publish pages — use an Administrator or Editor account.` }];
  } catch (e) { return [200, { checks, detail: "Auth check failed: " + (e?.message || e) }]; }
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

async function handleRerun(body) {
  const creds = resolveCreds(body);
  if (!creds) return [503, { error: "not_configured" }];
  const { entries } = body; // [{ id, keyword, city:{city,region,country}, device, engine, domain }]
  if (!Array.isArray(entries) || !entries.length) return [400, { error: "entries[] required" }];
  const updated = await pool(entries.slice(0, 25), async (e) => {
    const engine = (e.engine || "Google").toLowerCase() === "bing" ? "bing" : "google";
    const task = await dfsLive(creds, engine + "/organic", {
      keyword: e.keyword,
      location_name: `${e.city.city},${e.city.region},${e.city.country}`,
      language_code: "en",
      device: (e.device || "Desktop").toLowerCase(),
      os: e.device === "Mobile" ? "android" : "windows",
      depth: 100,
    });
    const { position, url } = parseSerpRank(task, e.domain);
    return { id: e.id, position, url };
  }, 3);
  return [200, { live: true, updated: updated.map((u, i) => (u.error ? { id: entries[i].id, error: u.error } : u)) }];
}

/* ---- GBP geo-grid rank scan =================================
   The Local Falcon / BrightLocal technique, for real: one Google Maps SERP
   request per grid point with an exact location_coordinate (lat,lng,15z),
   then find the business in the local results by name/CID. Accuracy comes
   from the coordinate targeting — each point returns what a searcher AT
   that spot would see. Cost: gridSize² live Maps requests per scan. ---- */
const normName = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
function gridPoints(center, size, spacingKm, shape = "square") {
  const half = (size - 1) / 2, pts = [];
  const maxR = half * spacingKm + 1e-6; // circle clip radius
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    const dLatKm = (half - r) * spacingKm, dLngKm = (c - half) * spacingKm;
    const skipped = shape === "circle" && Math.hypot(dLatKm, dLngKm) > maxR;
    pts.push({
      row: r, col: c, skipped,
      lat: +(center.lat + dLatKm / 111.32).toFixed(6),
      lng: +(center.lng + dLngKm / (111.32 * Math.cos((center.lat * Math.PI) / 180))).toFixed(6),
    });
  }
  return pts;
}
async function scanGridPoint(creds, keyword, pt, business, languageCode = "en") {
  if (pt.skipped) return { ...pt, rank: null, results: [] }; // circle-clipped corner — not scanned, not billed
  const task = await dfsLive(creds, "google/maps", {
    keyword, location_coordinate: `${pt.lat},${pt.lng},15z`, language_code: languageCode, depth: 20,
  });
  const items = (task.result?.[0]?.items || []).filter((it) => it.type === "maps_search");
  const target = normName(business.name);
  const hit = items.find((it) =>
    (business.cid && String(it.cid) === String(business.cid)) ||
    (business.placeId && it.place_id === business.placeId) ||
    normName(it.title).includes(target) || target.includes(normName(it.title)));
  return {
    ...pt,
    rank: hit ? hit.rank_group : null, // rank among local results; null = not in top 20
    /* FULL top-20 stored per point — competitor grids are derived from this
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
  if (!creds) return [503, { error: "not_configured" }];
  const { keyword, center, grid, business } = body;
  if (!keyword || !business?.name || !isFinite(center?.lat) || !isFinite(center?.lng)) return [400, { error: "keyword, business.name, center.lat/lng required" }];
  const size = [3, 5, 7, 9, 11, 13].includes(+grid?.size) ? +grid.size : 5;
  const spacingKm = Math.min(10, Math.max(0.05, +grid?.spacingKm || 1));
  const pts = gridPoints(center, size, spacingKm, grid?.shape === "circle" ? "circle" : "square");
  const results = await pool(pts, (pt) => scanGridPoint(creds, keyword, pt, business, body.language_code || "en"), 5);
  const clean = results.map((r, i) => (r.error ? { ...pts[i], rank: null, error: r.error, results: [] } : r));
  if (clean.every((r) => r.error)) return [502, { error: "provider_error", detail: clean[0].error }];
  return [200, { live: true, points: clean, size, spacingKm, checkedAt: Date.now() }];
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
  const max = Math.min(8000, Math.max(256, +maxTokens || 4000));
  let text;
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
    } else if (provider === "gemini") {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(mdl)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: max, ...(json ? { responseMimeType: "application/json" } : {}) },
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(`Gemini ${r.status}: ${d.error?.message || JSON.stringify(d).slice(0, 200)}`);
      text = (d.candidates?.[0]?.content?.parts || []).map((pt) => pt.text || "").join("");
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
    }
  } catch (e) {
    return [502, { error: "provider_error", detail: String(e.message || e).slice(0, 400) }];
  }
  if (!text.trim()) return [502, { error: "provider_error", detail: "provider returned empty output" }];
  return [200, { live: true, provider, model: mdl, text }];
}

/* ---- tiny http layer ---- */
http.createServer(async (req, res) => {
  const CORS = { ...corsFor(req), ...SEC_HEADERS };
  const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json", ...CORS, ...(PIXEL_ROUTES.includes((req.url || "").split("?")[0]) ? { "Access-Control-Allow-Origin": "*" } : {}) }); res.end(JSON.stringify(obj)); };
  if (req.method === "OPTIONS") { const px = PIXEL_ROUTES.includes((req.url || "").split("?")[0]); res.writeHead(204, px ? { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } : corsFor(req)); return res.end(); }
  const ip = req.socket.remoteAddress || "?";
  if (rateLimited(ip, "all", 240, 60e3)) return send(429, { error: "rate_limited", detail: "Too many requests — slow down." });
  if (req.url.startsWith("/api/auth/") && rateLimited(ip, "auth", 20, 10 * 60e3)) return send(429, { error: "rate_limited", detail: "Too many authentication attempts — try again later." });
  if ((req.url === "/api/app/login" || req.url === "/api/app/2fa") && rateLimited(ip, "applogin", 20, 10 * 60e3)) return send(429, { error: "rate_limited", detail: "Too many sign-in attempts — try again in a few minutes." });
  if (req.url.startsWith("/api/pixel/verify") && rateLimited(ip, "pixel", 30, 60e3)) return send(429, { error: "rate_limited" });
  if (req.url.startsWith("/api/outreach/") && rateLimited(ip, "outreach", 60, 60 * 60e3)) return send(429, { error: "rate_limited", detail: "Outreach send limit reached (60/hour) — protects your sender reputation." });
  try {
    if (req.method === "GET" && req.url === "/api/health") return send(200, { ok: true, dfsConfigured: !!fileCreds() });
    if (req.method === "GET" && req.url.startsWith("/px.js")) {
      res.writeHead(200, { "Content-Type": "application/javascript", "Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*" });
      return res.end(PX_JS);
    }
    if (req.method === "GET" && req.url.startsWith("/api/share/")) { const [c2, p2] = handleShareGet(req.url.slice(11)); return send(c2, p2); }
    if (req.method === "GET" && req.url === "/api/state") { const [c2, p2] = handleStateGet(req); return send(c2, p2); }
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
    if (req.method === "POST" && ["/api/scan-listings", "/api/rerun", "/api/check-index", "/api/geo-grid", "/api/places-locate", "/api/share", "/api/serp-top", "/api/generate", "/api/profile-listings", "/api/ads/accounts", "/api/ads/metrics", "/api/ads/publish", "/api/auth/2fa/start", "/api/auth/2fa/verify", "/api/auth/device-check", "/api/custom/test", "/api/custom/deploy", "/api/dfs-balance", "/api/wp/media", "/api/wp/deploy", "/api/wp/cleanup", "/api/wp/test", "/api/webflow/deploy", "/api/webflow/publish", "/api/pixel/verify", "/api/pixel/status", "/api/audit/website", "/api/audit/profile", "/api/leads/search", "/api/scrape-email", "/api/outreach/send", "/api/guestpost/search", "/api/guestpost/metrics", "/api/mail/test", "/api/mail/inbox", "/api/track/stats", "/api/kw/research", "/api/kw/domain", "/api/insight/audit", "/api/app/login", "/api/app/2fa", "/api/app/logout", "/api/state"].includes(req.url)) {
      let raw = "";
      for await (const chunk of req) { raw += chunk; if (raw.length > 2e6) throw new Error("payload too large"); }
      const body = JSON.parse(raw || "{}");
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
        : req.url === "/api/wp/deploy" ? await handleWpDeploy(body)
        : req.url === "/api/wp/cleanup" ? await handleWpCleanup(body)
        : req.url === "/api/wp/test" ? await handleWpTest(body)
        : req.url === "/api/webflow/deploy" ? await handleWebflowDeploy(body)
        : req.url === "/api/webflow/publish" ? await handleWebflowPublish(body)
        : req.url === "/api/pixel/verify" ? handlePixelVerify(body, req)
        : req.url === "/api/pixel/status" ? handlePixelStatus(body)
        : req.url === "/api/audit/website" ? await handleAuditWebsite(body)
        : req.url === "/api/audit/profile" ? await handleAuditProfile(body)
        : req.url === "/api/leads/search" ? await handleLeadsSearch(body)
        : req.url === "/api/scrape-email" ? await handleScrapeEmail(body)
        : req.url === "/api/outreach/send" ? await handleOutreachSend(body)
        : req.url === "/api/guestpost/search" ? await handleGuestSearch(body)
        : req.url === "/api/guestpost/metrics" ? await handleGuestMetrics(body)
        : req.url === "/api/mail/test" ? await handleMailTest(body)
        : req.url === "/api/mail/inbox" ? await handleMailInbox(body)
        : req.url === "/api/track/stats" ? handleTrackStats(body)
        : req.url === "/api/kw/research" ? await handleKwResearch(body)
        : req.url === "/api/kw/domain" ? await handleKwDomain(body)
        : req.url === "/api/insight/audit" ? await handleInsightAudit(body)
        : req.url === "/api/app/login" ? await handleAppLogin(body)
        : req.url === "/api/app/2fa" ? handleAppTwofa(body)
        : req.url === "/api/app/logout" ? handleAppLogout(req)
        : req.url === "/api/state" ? handleStateSave(req, body)
        : await handleRerun(body);
      return send(code, payload);
    }
    send(404, { error: "not_found" });
  } catch (e) {
    send(500, { error: String(e.message || e) });
  }
}).listen(PORT, process.env.HOST || "127.0.0.1", () => console.log(`SERP Squad API server on http://${process.env.HOST || "127.0.0.1"}:${PORT} — CORS allowlist: ${APP_ORIGINS.join(", ")} (DataForSEO ${fileCreds() ? "configured" : "not configured — UI can still pass credentials per request"})`));
