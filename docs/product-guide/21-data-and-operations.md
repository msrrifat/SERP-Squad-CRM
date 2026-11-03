# Data, saving, backups, deployment and known gaps

INTERNAL. For SERP Squad team members and the in-app AI agent only.

## How the workspace is stored

The whole agency workspace is one JSON document split into domains on the server under `server/data/` (never in git):

| Path | Contents |
|---|---|
| `state/core.json` | company, clients, project shells |
| `state/reports.json` | saved reports and report templates |
| `state/{pm, performance, optimization, ads}/<projectId>.json` | one file per project per tool domain |
| `state/revs.json`, `app-state.rev` | per-domain and global revision counters |
| `app-state.json` | combined copy, rebuilt at most hourly (rollback fallback) |
| `snapshots/` | hourly gzip snapshots, newest 72 (3 days) |
| `backups/` | daily copies, newest 14, plus `app-state-before-restore.json` |
| `auth/sessions.json`, `auth/devices.json`, `auth/google-tokens.json` | sessions (hashed tokens, 30 days), trusted devices (90 days), Google refresh tokens |
| `rank-runs/` | persistent server-side rank runs (worker every 15 s; scheduler every 10 min) |
| `social/`, `wp-agents/`, `rank-jobs/`, `dfs-locations/`, `geo-snapshots/`, `files/`, `shares/` | social tokens, WordPress agents, rank jobs, DataForSEO location lists (30 days), map images, uploads, share payloads |
| `pixels.json`, `lead-forms.json`, `outreach-track.json` | pixel hits, lead forms and leads, outreach opens/clicks |

`server/credentials.json` (gitignored) may hold the DataForSEO login as a server-side fallback.

## Saving from the app

- Team sessions autosave 400 ms after the last edit. Changed domains are sent individually (gzipped when large), each with the revision it was based on. If the server's revision moved on, the app fetches the server copy, union-merges, and retries up to four times.
- Union merge rules: items are keyed by id, the newer timestamp wins, **additions beat deletions**; the capped collections are activity (400) and record activity (80). Tracking scans are unioned by timestamp and the longer position history wins. Chat is merged on every write path.
- While a save is pending or failing, the workspace is also written to the browser's IndexedDB; on the next load it is merged back and the green "Recovered unsaved changes" note appears.
- Client sessions save through a restricted endpoint that allows only their own fields.
- Server guards refuse saves that would hollow out a document or drop clients while shrinking the payload, and refuse stale saves (409), which the UI shows as "Another session has saved changes" with a reload button.
- Saved reports are loaded lazily and are never deleted by a payload that simply omits them.
- Restores (Company admins through the backup endpoints) merge by default and always write a pre-restore copy first.

## Deployment

- Push to `main` triggers GitHub Actions: SSH to the VPS, `git reset --hard origin/main`, `npm ci`, `npm run build` (with temporary swap when RAM is low), refuse to restart if `dist/index.html` is missing, then `pm2 restart serpsquad-api`. One automatic retry on failure. `server/data/` is untouched by deploys.
- The web server (Caddy in production; an nginx config is kept as an alternative) serves `dist/` with an SPA fallback and proxies `/api/*` and `/px.js` to the Node process; `/assets/*` is cached immutable; HSTS and nosniff are set.
- Before pushing, run `npm run build` (the `npm run check` script runs the unit tests and a server syntax check but does not compile).
- Env vars: `PORT`, `HOST`, `APP_ORIGINS`, `DFS_LOGIN`/`DFS_PASSWORD`, `OWNER_USERNAME`/`OWNER_EMAIL`/`OWNER_PASSWORD` (override the hard-coded bootstrap owner), `SMTP_*` fallback, `GOOGLE_OAUTH_ACCESS_TOKEN`, `GOOGLE_ADS_DEV_TOKEN`, `APPLE_ABC_TOKEN`, ads tokens. Most provider credentials come from Company settings → API settings and are sent per request.
- Two timers run inside the server: the rank-run worker (every 15 s) and the recurring-scan scheduler (every 10 min). Geo-grid scans still start from the UI; chat is polled by clients; hourly snapshots happen as a side effect of saves; Google tokens refresh on demand. Lost on restart: pending 2FA codes, OAuth states, rate-limit buckets, caches. Sessions survive (on disk).

## Demo versus live, in one place

| Feature | Live today | Demo / stored only |
|---|---|---|
| Keyword rank tracking, geo-grid, index checks, listings scan, keyword research, competitor SERPs | DataForSEO | demo numbers only when the project is in Demo data mode or the API is unreachable, always labelled |
| GA4 and Search Console dashboards | Google OAuth | demo generator on demo projects |
| GBP / Bing / Apple performance numbers | not yet (listing selection is real for GBP) | demo generator |
| GBP / Bing / Apple edits, posts, photos, reviews | stored in the CRM, logged as work | no provider write calls; reviews are sample |
| Website pages and posts | WordPress (REST or agent), Webflow, custom endpoint | other platforms store locally |
| Pixel | verifies installation | does not apply edits or track events |
| AI writing, architect, posts, proposals, agent free-form lane | any connected AI provider | labelled drafts where a fallback exists |
| Ads | account listing; Meta campaign creation (PAUSED) | metrics are always simulated in the CRM |
| Social connectors | OAuth connections and page selection | campaign launches do not post |
| Web 2.0 branded sites | credential storage | site creation is simulated |
| Email outreach, inbox, lead forms, 2FA | SMTP / IMAP | demo 2FA code on localhost only |
| Recurring rank scans | automated on the server for real projects (every N days per keyword) | |
| Scheduled geo-grid runs | not automated (runs when the workspace is open past the due time) | |

## Known gaps and risks (as of 2 Nov 2026)

Security:

- Team and client passwords are stored and compared in plain text; the bootstrap owner password has a hard-coded default (override with `OWNER_PASSWORD`). The team panel shows passwords in plain inputs.
- A client session can read the whole workspace through `GET /api/state` (the portal only renders its own slice, but the data is served). Needs a server-side filter for client sessions.
- Most provider endpoints (rank, geo-grid, audits, outreach, WordPress, ads, social) require no session, so anyone who can reach `/api/*` can spend the server's DataForSEO credentials. Needs session checks.
- Google refresh tokens and social tokens are stored unencrypted on the server.
- The click tracker `/api/t/c/…?u=` redirects to any URL (open redirect).
- The GitHub repository is public; this guide and the source are readable by anyone until the repository is made private.

Functional:

- `/api/insight/audit` fails when the business location resolves (undefined helper).
- Ads metrics never come from the platforms; campaign launch is real for Meta only.
- The Posts tab editor does not send featured image, categories, tags or excerpt to WordPress (the Posts Architect does send categories and tags).
- WordPress cleanup inspects only the first 100 pages and posts.
- Unranked keywords (stored as 101) are included in averages and the 21+ bucket.
- Dark mode preference is not persisted.
- Stale help text: Team panel points to "client settings → Team" (grants live in Project settings → Team); Account settings mentions `#login`; the Guest Post Finder still calls Google Custom Search free; three different insight-audit cost figures appear in the UI and code.
- A client-portal save bumps every revision, so an open team tab may get one stale-save retry.
