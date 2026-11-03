# API server reference

INTERNAL. For SERP Squad team members and the in-app AI agent only.

The API server is `server/index.js`, a single Node process on `127.0.0.1:8787` behind the web server, reached as `/api/*` on the app domain. The Vite dev server proxies `/api` to it. Rules: no credentials → **503 not_configured** (nothing is fabricated); provider rejects → **502 provider_error** with the provider's message; bad input 400; no session 401; wrong session kind 403; save guards 409.

Authentication kinds: **TEAM** (header `X-SS-Token` with a team session), **CLIENT** (client-portal session), **SESSION** (either), **NONE**, **SIGNED** (WordPress agent HMAC), **LOCAL-ONLY** (behaviour allowed only on localhost).

DataForSEO credentials are resolved per request: the request body (sent by the UI from Company settings), then `server/credentials.json`, then `DFS_LOGIN` / `DFS_PASSWORD`.

## Health, pixel, misc

| Route | Auth | Purpose |
|---|---|---|
| GET /api/health | NONE | `{ok, dfsConfigured}` |
| GET /px.js | NONE | the tracking pixel script (origin baked in; sends one verify beacon) |
| GET /api/img?u= | NONE | image proxy; only hosts that belong to a project website |
| GET /api/geo/snapshot/<id>.png | NONE | Static Maps image written by insight audits |
| GET /api/t/o/<token>.gif, GET /api/t/c/<token>?u= | NONE | outreach open and click tracking (click = redirect) |

## Authentication and sessions

| Route | Auth | Purpose |
|---|---|---|
| POST /api/app/login | NONE (rate 20 / 10 min) | `{login, password, deviceToken}` → session, or `needs2fa` |
| POST /api/app/2fa | NONE | `{email, code}` → `{token, deviceToken, identity}` |
| POST /api/app/logout | token | deletes the session |
| POST /api/auth/2fa/start, /verify | NONE (rate 20 / 10 min) | email code (hashed, 10 min, 5 attempts); demo code only on localhost without SMTP |
| POST /api/auth/device-check | NONE | `{email, deviceToken}` → `{trusted}` (90 days) |

## Workspace state

| Route | Auth | Purpose |
|---|---|---|
| GET /api/state[?slim=1] | SESSION | whole workspace (`slim` omits saved reports); `{state, exists, rev, revs, omitted}` |
| GET /api/state/slice?path=company.savedReports | SESSION | lazy slice |
| POST /api/state | TEAM | full save `{state, baseRev, force, keep[]}`; guards: keep rehydration, lazy-slice protection, 60 MB cap, catastrophic-overwrite (client count drops and payload < 35%), hollowing (same item count but < 40% bytes of a ≥ 200 KB doc), stale baseRev → 409 |
| POST /api/state/domains | TEAM | granular save `{docs, baseRevs, partial}` for domains core, pm, performance, optimization, ads, reports; per-domain stale and hollowing checks; project-keyed docs merged per project |
| POST /api/state/client | CLIENT | allow-listed client edits (profile, white label when enabled, DataForSEO toggle, affiliate payout and prospects, chat append-only, comments and task completion on allowed projects) |
| GET /api/state/backups | TEAM | hourly snapshots (72), daily backups (14), pre-restore copy |
| POST /api/state/restore | TEAM | merge (default) or replace from a backup; writes a pre-restore copy first |
| POST /api/state/backup-extract | TEAM | read PM, geo, sizes, one project or reports out of a backup without restoring |

## Rank tracking (DataForSEO SERP)

| Route | Purpose |
|---|---|
| POST /api/rank/run (TEAM) | `{projectId, entries[], depth}` → creates a persistent server-side run; `{runId, total, skipped}`. Keywords already in an active run are skipped |
| POST /api/rank/run/status (SESSION) | `{projectId, runId?, since?}` → `{runs:[{status queued/running/paused/done/cancelled, reason, total, done, failed, pending, posted, billedTasks, liveTasks, updated[] (results applied since `since`, each with `at`), errors[], waiting[]}]}` |
| POST /api/rank/run/cancel (TEAM) | `{runId}` → drops unposted keywords; posted tasks are still collected |
| POST /api/rank/start | `{entries[], depth, projectId}` → posts standard-priority organic tasks (location code, se_domain per country, device/OS, stop_crawl_on_match on the domain, async AI Overview); refuses search operators; `{jobId, total, posted, reused}`; job file under `server/data/rank-jobs/` |
| POST /api/rank/status | `{jobId}` → collects finished tasks (task_get), re-runs handed tasks live once, parses position / absPos / url / mapPos / packShown / aiPos / aiShown / aiRefs, resolves goto landing pages through `goto_url_converter` (40 s cap, cached 7 days); `{updated[], errors[], billedTasks, liveTasks}`; 202 busy while another pass runs |
| POST /api/rerun | older synchronous re-check, ≤ 25 entries, queue with 480 s budget, location ladder retries |
| POST /api/serp-top | `{keyword, location_name, count ≤ 10}` → live top results (competitor discovery) |
| POST /api/check-index | `{urls ≤ 50}` → `site:` query per URL, exact-URL match |
| POST /api/scan-listings | `{biz, directories ≤ 60}` → one `site:` query per directory with NAP check |
| POST /api/dfs-balance | DataForSEO account balance |
| POST /api/dfs/goto-convert | `{urls ≤ 100}` → resolved map and the provider's raw reply (diagnostic) |

The legacy start/status/rerun routes are Auth NONE today (see 21-data-and-operations.md, security gaps).

## Geo-grid and places

| Route | Purpose |
|---|---|
| POST /api/geo-grid | `{center, grid{size, spacingKm, shape}, keywords ≤ 40, business{name, placeId}, mode queue|live, zoom 13, depth 50}` → one Maps task per keyword × point; business matched by place_id, feature id, CID, name; `{grids, scanned, failed, errors}` |
| POST /api/places-locate | `{query, placesKey}` → Google Places Find Place |

## Crawl, audits, keyword research, guest posts

| Route | Purpose |
|---|---|
| POST /api/crawl/sitemap | sitemap (and index) → pages and posts (≤ 300 each) |
| POST /api/crawl/page | one page → meta, H1, markdown, headings, words |
| POST /api/crawl/meta | ≤ 120 URLs → meta, H1, noindex, canonical; blocked pages rescued through DataForSEO instant pages |
| POST /api/audit/website | crawl up to 400 sitemap pages with per-page analysis |
| POST /api/audit/profile | Google Places profile details |
| POST /api/leads/search | Places Text Search (≤ 60) + details |
| POST /api/scrape-email | emails and socials from a site's public pages |
| POST /api/insight/audit | prospect audit bundle (Places, mini crawl, 6 live SERPs, small map grid, Static Maps snapshot). Known gap: crashes when a location resolves (undefined helper); fix pending |
| POST /api/kw/volume | Google Ads search volume for ≤ 700 keywords |
| POST /api/kw/research, /api/kw/domain | DataForSEO Labs keyword suggestions / ranked keywords |
| POST /api/kw/locations | DataForSEO location search (free, cached on disk) |
| POST /api/guestpost/search | Google CSE or DataForSEO footprint search |
| POST /api/guestpost/metrics | Open PageRank authority, optional DataForSEO traffic |
| POST /api/posts/community | Reddit / Quora questions (DataForSEO fallback) |
| POST /api/posts/competitors | competitor sitemap topics |

## AI

| Route | Purpose |
|---|---|
| POST /api/generate | `{provider, apiKey, model, system, prompt, json}` → `{text}`; Claude, OpenAI, Gemini, DeepSeek |
| POST /api/seo-guide, GET /api/seo-guide/toc | SESSION; search the Google SEO PRO Guides corpus |
| POST /api/product-guide, GET /api/product-guide/toc, GET /api/product-guide/doc?file= | TEAM only; search and read this internal manual |

## WordPress, Webflow, custom sites

| Route | Purpose |
|---|---|
| POST /api/wp/test | reachability, REST route, auth, publish capability; detects firewalls and PHP fatals; suggests the agent |
| POST /api/wp/media, /api/wp/media-update, /api/wp/content, /api/wp/categories | media library, alt/title update, pages and posts import, categories |
| POST /api/wp/deploy | upsert a page or post by slug (meta fields, Elementor data, categories, tags, status, date) |
| POST /api/wp/cleanup | permanently deletes pages and posts not in `keepSlugs` (first 100 of each type) |
| POST /api/wp/agent/key (TEAM), /pair, /poll (SIGNED), /result (SIGNED), /status (TEAM), /exec (TEAM) | outbound plugin agent for firewalled sites |
| POST /api/webflow/deploy, /api/webflow/publish | Webflow Data API v2 collections and publish |
| POST /api/custom/test, /api/custom/deploy | `serp-squad-publish.php` / `.js` endpoint with `X-SS-Key` |

## Ads, Google, social, mail, forms, chat, share, pixel, files

| Route | Purpose |
|---|---|
| POST /api/ads/accounts, /metrics, /publish | Meta, Google Ads, TikTok, Reddit, Nextdoor, Yelp account lists; Meta/Google metrics; Meta campaign creation (PAUSED) |
| POST /api/oauth/google/start, GET /api/oauth/google/callback | Google consent; refresh tokens stored server-side with who added them |
| POST /api/google/accounts (TEAM) | list or remove connected Google accounts (admins all, others their own) |
| POST /api/google/gsc/sites, /gsc/query, /ga4/properties, /ga4/report | Search Console and GA4 data by connection id |
| POST /api/social/start, GET /api/oauth/social/callback, POST /api/social/status, /pages, /select, /disconnect, /bluesky | social connectors per owner id |
| POST /api/mail/test, /mail/inbox, /mail/message | SMTP login test (optional real test mail), IMAP inbox and message |
| POST /api/outreach/send (rate 60 / hour) | one outreach email |
| POST /api/track/stats | opens and clicks per campaign |
| POST /api/form/register, /form/submit (public, rate 8 / 10 min, honeypot), /form/leads | website lead forms; leads stored then emailed through the agency SMTP |
| POST /api/chat/send, /react, /read, /typing; GET /api/chat/since?ts= | SESSION; instant chat lane with union merge; clients poll |
| POST /api/share, GET /api/share/<id> | public read-only geo-grid report payloads |
| POST /api/pixel/verify (public, rate 30 / min), /pixel/status, /pixel/check | pixel beacons and installation checks |
| POST /api/files (TEAM, ≤ 6 MB image or PDF), GET /api/files/<id> (SESSION; clients only their own) | payment proofs and attachments |

## Limits

Rate limits per IP: 240 requests / minute overall; sign-in and 2FA 20 / 10 minutes; pixel 30 / minute; lead form 8 / 10 minutes; outreach 60 / hour. Body caps: state saves 32 MB, client save 8 MB, files 9 MB, everything else 4 MB, 64 MB after gzip. CORS origins: localhost dev and app.serpsquad.com (the session header is only accepted same-origin).
