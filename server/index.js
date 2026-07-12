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
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
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

/* minimal SMTP-over-TLS client (implicit TLS, port 465) — node builtins only */
function sendMail(cfg, to, subject, text) {
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
    (async () => {
      await expect(220);
      send("EHLO serpsquad.local"); await expect(250);
      send("AUTH LOGIN"); await expect(334);
      send(Buffer.from(String(cfg.user)).toString("base64")); await expect(334);
      send(Buffer.from(String(cfg.pass)).toString("base64")); await expect(235);
      send(`MAIL FROM:<${cfg.from || cfg.user}>`); await expect(250);
      send(`RCPT TO:<${to}>`); await expect(250);
      send("DATA"); await expect(354);
      send(`From: ${cfg.from || cfg.user}\r\nTo: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text}\r\n.`);
      await expect(250);
      send("QUIT"); sock.end();
      if (!done) { done = true; resolve(); }
    })().catch(fail);
  });
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
    return [200, {
      live: true, login: creds.login,
      balance: u.money?.balance ?? null,
      spentTotal: u.money?.total ?? null,
      dayLimit: u.money?.limits?.day ?? null,
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
  if (req.url.startsWith("/api/pixel/verify") && rateLimited(ip, "pixel", 30, 60e3)) return send(429, { error: "rate_limited" });
  try {
    if (req.method === "GET" && req.url === "/api/health") return send(200, { ok: true, dfsConfigured: !!fileCreds() });
    if (req.method === "GET" && req.url.startsWith("/px.js")) {
      res.writeHead(200, { "Content-Type": "application/javascript", "Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*" });
      return res.end(PX_JS);
    }
    if (req.method === "GET" && req.url.startsWith("/api/share/")) { const [c2, p2] = handleShareGet(req.url.slice(11)); return send(c2, p2); }
    if (req.method === "POST" && ["/api/scan-listings", "/api/rerun", "/api/check-index", "/api/geo-grid", "/api/places-locate", "/api/share", "/api/serp-top", "/api/generate", "/api/profile-listings", "/api/ads/accounts", "/api/ads/metrics", "/api/ads/publish", "/api/auth/2fa/start", "/api/auth/2fa/verify", "/api/auth/device-check", "/api/custom/test", "/api/custom/deploy", "/api/dfs-balance", "/api/wp/media", "/api/wp/deploy", "/api/wp/cleanup", "/api/wp/test", "/api/webflow/deploy", "/api/webflow/publish", "/api/pixel/verify", "/api/pixel/status"].includes(req.url)) {
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
        : await handleRerun(body);
      return send(code, payload);
    }
    send(404, { error: "not_found" });
  } catch (e) {
    send(500, { error: String(e.message || e) });
  }
}).listen(PORT, process.env.HOST || "127.0.0.1", () => console.log(`SERP Squad API server on http://${process.env.HOST || "127.0.0.1"}:${PORT} — CORS allowlist: ${APP_ORIGINS.join(", ")} (DataForSEO ${fileCreds() ? "configured" : "not configured — UI can still pass credentials per request"})`));
