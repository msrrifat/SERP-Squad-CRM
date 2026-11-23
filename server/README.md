# SERP Squad API server — what's real and what isn't

Run alongside the frontend:

```bash
npm run api          # http://localhost:8787  (vite proxies /api → here)
```

## Live today (real network calls, zero fabrication)

| Feature | How it works | Needs |
|---|---|---|
| **Business listing scanner** | One real `site:directory.com "Business Name" city` query per directory via DataForSEO SERP API (`/v3/serp/google/organic/live/advanced`), NAP checked against result title/snippet. Same technique as commercial citation tools. ~1 SERP credit per directory. | DataForSEO login/password — entered in Company Settings → API settings (sent per-request), or `server/credentials.json`, or `DFS_LOGIN`/`DFS_PASSWORD` env vars |
| **Google index checker** (Optimization Studio → Index Checker, + auto-tags on Business Website pages/posts) | One real `site:<url>` SERP query per URL; indexed only on exact-URL match (root URLs may prefix-match). No demo fallback — status is verified or shown as "Index unknown". Page/post tags auto-recheck when >7 days old. | same |
| **GBP geo-grid rank tracker** (Performance Studio → GBP Rank Tracking) | One coordinate-targeted Google Maps SERP task per grid point (`location_coordinate: lat,lng,17z`, depth 100, via DataForSEO's standard task queue: `task_post` → `tasks_ready` → `task_get/advanced`) — each point returns what a searcher at that exact spot sees; 17z keeps neighboring points differentiated. Business matched by place_id/CID first, normalized name second. Circle grids are radial (center + rings every `spacing`, ring k carrying ⌊2πk⌋ pins). Location resolved via the real Google Places Find Place API (or manual coordinates). Cost: points × keywords tasks @ $0.0006 per scan (vs $0.0035 live) — all queued in one batch, results within ~1–5 min. | DataForSEO (scans) + optional Google Places API key (location lookup) |
| **Website Architect & content writer** (Optimization Studio → Business Website → Website Mapping) | Every stage — site architecture, content structure, audit, adjust, page copy — calls the provider connected in API settings via `/api/generate` (OpenAI/Claude/Gemini/DeepSeek, JSON-validated). Competitor scan hits the real Google SERP **geo-targeted to the project's tracked market**. 503 → labeled local draft; 502 → surfaced error. | An AI provider key (any of the four) + DataForSEO for competitor scans |
| **Business-profile listing selection** (Project settings → Data sources → Connect) | Lists the listings an account manages so you pick which one to attach to a location group: GBP via the Business Profile APIs (needs a completed Google OAuth consent → access token), Apple via the Business Connect API (needs its API key). Bing has no public listings API (partner app required). Unconfigured → 503 and the UI offers a clearly-labeled demo account. | Google OAuth token / Apple Business Connect key |
| **Sign-in security (2FA)** | `/api/auth/2fa/start`, `/api/auth/2fa/verify`, `/api/auth/device-check` — email verification codes for new devices/browsers (hashed, 10-min expiry, 5 attempts, single-use), hashed 90-day trusted-device tokens, per-IP rate limits. Codes go out via real SMTP-over-TLS when configured (API settings → Email SMTP); otherwise a clearly-labeled demo code. See SECURITY.md. | SMTP credentials (optional — demo mode without) |
| **Ads platforms** (Ads & Paid Marketing) | `/api/ads/accounts`, `/api/ads/metrics`, `/api/ads/publish` — real calls to Meta Graph (adaccounts, insights, campaign create), Google Ads (listAccessibleCustomers, GAQL searchStream), TikTok Business, Reddit Ads, Nextdoor NAM and Yelp partner APIs when their credentials are configured in API settings. Unconfigured → 503 with the exact requirement; the UI runs in clearly-labeled Demo mode. Meta publishing creates campaigns **PAUSED** for review in Ads Manager. | Per-platform tokens/keys in Company Settings → API settings |
| **Rank re-check (Rank Tracking → Rerun now, and the every-N-days schedule)** | A persistent server-side run (`data/rank-runs/`, worker every 15 s): one standard-queue SERP task per keyword (Google or Bing endpoint by entry engine, city-targeted, device-aware, depth 100) parsed with `parseSerpRank` — `rank_group`, the ORGANIC position (what every rank tracker reports); `rank_absolute` is kept alongside as `absPos`. The SAME response also yields the local map-pack position (`mapPos`) and the Google AI Overview citation position (`aiPos` — the domain's 1-based place among the overview's cited references; cached/synchronous overviews only, so zero extra cost — `load_async_ai_overview` is deliberately not sent because it doubles the task price whenever an async overview exists). $0.0006 per 10 results, so $0.006 per keyword at depth 100; a 25-keyword batch returns in ~1–5 min. A task handed out twice (40601) is re-queued at the same price, never re-run on the live endpoint. | same |
| **Local AI agent control plane** (Company Settings → AI agent) | `agentops.js`: registers devices (token shown once, stored hashed), queues tasks, and enforces per-project working limits per task type and token limits before a task is handed to a device; each project's work setup (working channels with a Chrome ID per channel, rules per work area) is stored here too with each project's work log behind its Report tab (`work.json`: finished tasks, logged changes, items the agent records with `log_work`, entries added by hand), the agent's own list of projects (`projects.json`: ids imported from the CRM, and projects added by hand), the result of its sign-in checks and what the agent has learned (`lessons.json`), the agency's knowledge documents for every project (`knowledge.json` plus one text file per document in `data/agentops/knowledge-docs/`), together with its brand voice for the agent (profile in `data/agentops/brand.json`, each brand document's text as its own file in `data/agentops/brand-docs/`; the CRM's own Brand Voice is read as a fallback and never written), and a task that works in a channel's browser is handed out only to a device that reports that Chrome ID, with the sites that window may show; the device reports every Claude call's tokens and is told to stop when a limit is hit. Playbooks, settings and the CRM tool list sync to devices; agent jars are published and downloaded here; a jar that the build `.github/workflows/agent-release.yml` drops into `data/agentops/incoming/` (with `release.json`: version, sha256, notes) is verified and published automatically, and only the three newest jars are kept. The agent's Claude keys (company, optional per project) are set in the dashboard's API setup, kept in `data/agentops/secrets.json` (encrypted with AES-256-GCM, mode 600, never returned to a browser, never in the workspace state; the master key is `AGENTOPS_MASTER_KEY` (64 hex characters or base64 of 32 bytes) or, when that is not set, a file created on first use at `~/.serpsquad/agentops.key`, overridable with `AGENTOPS_MASTER_KEY_FILE`; without a writable place for it the file stays plain and the dashboard says so; if the master key is lost the keys must be entered again) and handed to a device only with a task. Every free-text value stored here passes a filter that masks anything shaped like a password or an API key. A live chat per project: the message is stored here, a listening device receives it through a long poll, answers with Claude using the project-scoped tools and posts the reply; chat tokens count against the project's token limit. Data lives in `data/agentops/` and never touches the workspace documents. | A registered device running `agent/` (0.3.0 or newer for chat), and a Claude API key set in API setup or on the device. Search Console tool needs the project's Google connection **Live SEO data**: `agentops.js` is also an MCP client of DataForSEO's hosted MCP server (`https://mcp.dataforseo.com/v3/mcp`, override with `AGENTOPS_DFS_MCP_URL` for tests). It signs in with the DataForSEO login resolved by `dfsForProject` (never sent to a device or to Claude) and offers the agent four tools (`seo_data_*`) only while the company switch is on; paid requests are checked against company and project monthly spend limits, a per-task and per-answer request cap and an allow-list of API parts, and their cost is kept in `usage.json` under `seo`. Live when a DataForSEO login is set; `seodata` test is free. **AI search visibility**: `visibility.json` holds each project's fixed questions and the checks the agent logged (`log_ai_visibility`, one result per question and engine really asked); `visibility` returns them with the trend and, from the rank scans the CRM already has, the keywords cited in Google's AI Overview per scan day. **Photos and proof**: `media.json` plus `data/agentops/media/` hold each project's photos (JPEG, PNG or WebP, checked by their first bytes, 2 MB and 60 per project); `agent/media` hands one file to the device for a running task of that project. `agent/evidence` takes up to four JPEGs per task into `data/agentops/evidence/` (removed after 120 days). Neither folder is part of the hourly backup. `global.vision` (on by default) is passed to the device as `vision`. **Second check**: `global.secondCheck` (on by default) and `global.checkModel` are handed to the device with every write task (`secondCheck`), and a task type's approval can be `ask`, `auto` or, for review replies, `auto_positive` (`POLICY` is the limit told to the agent and to the check). The device runs the check; the server stores what it reports (`proposal.check`, or `result.check` with the passed `plan`). **Alerts and triggers**: `attention()` works out what needs a person from the live state (nothing but "dismissed" and "already emailed" is stored, in `alerts.json`); `tickAlerts` sends one digest email through `storedSmtp()`/`sendMail` at most every ten minutes; `tickTriggers` queues a rank-drop diagnosis after a scan and fetches each enabled project's website every 15 minutes (plain GET, public hosts only). Days, weeks and months follow `global.timeZone`; `global.workHours` holds back work the agent starts by itself. Test hooks: `AGENTOPS_MAIL_TEST_FILE` (emails are appended to a file), `AGENTOPS_TRIGGER_TEST=1` (fast ticks, local sites allowed). **Data safety**: every store under `data/agentops/` that reads as valid JSON is copied, compressed, to `data/agentops/backups/<day>-<hour>/` once an hour (48 hourly copies, then one a day for 14 days; the first copy of a day also holds the uploaded brand and knowledge documents; `secrets.json` is included and stays encrypted). A store that exists but cannot be read is never treated as empty: a read error fails the request, and a file that is not valid JSON is moved aside as `<name>.json.damaged-<time>` and replaced from the newest backup. To restore by hand, stop the server, `gunzip` the wanted copy over the store file and start it again. |

Rules the server enforces:
- **No credentials → HTTP 503.** The endpoints never invent data.
- **Provider rejects (bad auth, quota) → HTTP 502** with the provider's message. The UI shows the error — it does not silently fall back.
- Only when the API server is **unreachable or unconfigured** does the UI fall back to the deterministic demo simulation, and every demo result is labeled **"Demo data"** in the UI.

**Local AI agent, added 24 Nov 2026** (all in `server/agentops.js`, Admin-only like the rest of `/api/agentops/*`):

- `POST /api/agentops/credentials` with `kind: "dataforseo"`: `set` (login + password, checked against
  DataForSEO's free `GET /v3/appendix/user_data` before it is saved), `remove`, `balance`. The login is kept
  encrypted in `data/agentops/secrets.json` beside the agent's Claude keys and is used for everything the agent
  asks DataForSEO; without one the login from API settings is used. Only a hint ever leaves the server. The
  overview's `seoData.balance` is asked at most every 20 minutes. Test hook: `DFS_BASE`.
- `POST /api/agentops/status` (`get`, `set` one section): what the agent knows about a project
  (`data/agentops/status.json`). It is added to every task claim and chat turn.
- `POST /api/agentops/ranking` (`get`, `refresh`): the weekly ranking report, worked out from the rank tracker's
  scans and, when the project's Google connection has a Search Console property, from Search Console
  (`data/agentops/ranking.json`, 26 weeks). No provider call other than Search Console; no fabrication: a project
  without Search Console says so.
- Tools for the device: `project_status`, `update_status`, `ranking_report`, `log_ranking_review`, and the
  read-only CRM tools `crm_overview`, `crm_read` (switch: `global.crmRead`). The CRM tools never return fields
  named like secrets (`CRM_HIDE`).

**Local AI agent, added 24 Nov 2026, second part** (all in `server/agentops.js`):

- `POST /api/agentops/resources` (`get`, `add`, `update`, `remove`, `check`): a project's media sources
  (`data/agentops/resources.json`). Only a place (a folder path on a named device, or a Google Drive folder id)
  and the notes are stored; the server never reads the files.
- `POST /api/agentops/repo` (`get`, `save`, `remove`, `key`, `test`): the website's code repository
  (`data/agentops/repos.json`). `key` and `test` are done by the device at its next check-in
  (`asks` in the answer to `agent/hello`, result through `agent/asked`). Only a value shaped like an SSH
  PUBLIC key is ever stored. Test hook: `AGENTOPS_REPO_TEST=1` accepts a `file:///` repository.
- `config` accepts `global.seoTools` (name, https address, Chrome ID, purpose; sign-in providers and payment
  sites refused) and `global.resume`. No sign-in of a tool is stored on the server. Test hook:
  `AGENTOPS_TOOL_TEST=1` accepts a tool on 127.0.0.1.
- `POST /api/agentops/agent/resume`: a device asks to carry on with the run it was in when it stopped. See
  "carrying on after the computer restarted" in the file for the exact conditions.
- Task claims now carry `resources`, `repo` and `seoTools` for the device that may use them.

- `POST /api/agentops/guide` (`list`, `get`, `add`, `save`, `toggle`, `restore`, `history`, `remove`): the
  agency's own guides (kept in the agent's `config.json` under `guides`, 40 at most, 12,000 characters each,
  40,000 per playbook they are added to). `playbookFiles()` appends them to the synced playbooks they apply to.

- Work setup rules gained `rules.gbp` (saved through `POST /api/agentops/config` like the other rules): one
  mode per part of a Business Profile (`never`, `ask`, `allowed`) with a note, which reviews are answered,
  posts per week, notes. `setupLines(pid, area, profile)` hands them to Business Profile tasks;
  `gbpBlocked` and `gbpNeedsPerson` are what the server enforces itself. The older
  `rules.offpage.reviewReplies` and `postsPerWeek` are read once as the starting values.

- Website channel: `cms` may be `github`, and `notes` is a list (up to 60, 400 characters each; an older single
  `note` becomes its first entry). A repository may be reached with `method: "token"`: `repo` action `token`
  takes a GitHub token, holds it in memory only (ten minutes at most) until the repository's own device takes
  it at its next check-in, and never writes it to a file, a log or an answer to a browser; `token-remove` has
  the device delete it.

## Still demo (frontend simulation, clearly labeled) — and what each needs to go live

| Feature | What going live requires |
|---|---|
| GBP / Bing Places / Apple Maps performance data | Google Business Profile Performance API (OAuth app + owner consent), Microsoft/Azure app, Apple Business Connect key — plus OAuth callback routes on this server and encrypted token storage |
| GA4 / Search Console dashboards | Google OAuth (analytics.readonly, webmasters.readonly) + Data API / Search Analytics API calls server-side |
| Scheduled rank tracking (cron) | a scheduler (cron/queue) calling the same `/api/rerun` logic on entry cadence, persisting to a database |
| CMS publishing (WordPress/Webflow/Wix/Shopify) | per-platform OAuth apps / application passwords; the payload builders (`buildPixelPayload`, `blocksToHtml`) are production-shaped already |
| Web 2.0 site provisioning & campaign publishing | per-platform apps: WordPress.com OAuth, Blogger via Google OAuth, Tumblr OAuth 1.0a, Ghost Admin JWT, Hashnode PAT, DEV.to API key, Wix API key — plus a publish scheduler |
| Social posting | Meta/LinkedIn/X/etc. apps with per-platform review processes; token storage server-side |
| AI content & agent NLU | any provider key from API settings; the agent's tools/permission walls are real, only the language layer is rule-based today |
| Persistence | everything lives in React state (in-memory). A real deployment needs a database behind this server; the state shapes are already normalized for it |

**Why the split:** browsers can't query third-party sites (CORS) and must never hold API secrets. Everything that *can* be real without your accounts/credentials now is; everything else fails honestly and documents its requirement.
