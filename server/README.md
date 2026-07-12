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
| **GBP geo-grid rank tracker** (Performance Studio → GBP Rank Tracking) | One coordinate-targeted Google Maps SERP request per grid point (`location_coordinate: lat,lng,15z` via DataForSEO `/v3/serp/google/maps/live/advanced`) — each point returns what a searcher at that exact spot sees. Business matched by place_id/CID first, normalized name second. Location resolved via the real Google Places Find Place API (or manual coordinates). Cost: gridSize² Maps requests per scan. | DataForSEO (scans) + optional Google Places API key (location lookup) |
| **Website Architect & content writer** (Optimization Studio → Business Website → Website Mapping) | Every stage — site architecture, content structure, audit, adjust, page copy — calls the provider connected in API settings via `/api/generate` (OpenAI/Claude/Gemini/DeepSeek, JSON-validated). Competitor scan hits the real Google SERP **geo-targeted to the project's tracked market**. 503 → labeled local draft; 502 → surfaced error. | An AI provider key (any of the four) + DataForSEO for competitor scans |
| **Business-profile listing selection** (Project settings → Data sources → Connect) | Lists the listings an account manages so you pick which one to attach to a location group: GBP via the Business Profile APIs (needs a completed Google OAuth consent → access token), Apple via the Business Connect API (needs its API key). Bing has no public listings API (partner app required). Unconfigured → 503 and the UI offers a clearly-labeled demo account. | Google OAuth token / Apple Business Connect key |
| **Sign-in security (2FA)** | `/api/auth/2fa/start`, `/api/auth/2fa/verify`, `/api/auth/device-check` — email verification codes for new devices/browsers (hashed, 10-min expiry, 5 attempts, single-use), hashed 90-day trusted-device tokens, per-IP rate limits. Codes go out via real SMTP-over-TLS when configured (API settings → Email SMTP); otherwise a clearly-labeled demo code. See SECURITY.md. | SMTP credentials (optional — demo mode without) |
| **Ads platforms** (Ads & Paid Marketing) | `/api/ads/accounts`, `/api/ads/metrics`, `/api/ads/publish` — real calls to Meta Graph (adaccounts, insights, campaign create), Google Ads (listAccessibleCustomers, GAQL searchStream), TikTok Business, Reddit Ads, Nextdoor NAM and Yelp partner APIs when their credentials are configured in API settings. Unconfigured → 503 with the exact requirement; the UI runs in clearly-labeled Demo mode. Meta publishing creates campaigns **PAUSED** for review in Ads Manager. | Per-platform tokens/keys in Company Settings → API settings |
| **Rank re-check (Rank Tracking → Re-check)** | One live SERP request per keyword (Google or Bing endpoint by entry engine, city-targeted, device-aware, depth 100) parsed with `parseSerpRank` — the true `rank_absolute`. | same |

Rules the server enforces:
- **No credentials → HTTP 503.** The endpoints never invent data.
- **Provider rejects (bad auth, quota) → HTTP 502** with the provider's message. The UI shows the error — it does not silently fall back.
- Only when the API server is **unreachable or unconfigured** does the UI fall back to the deterministic demo simulation, and every demo result is labeled **"Demo data"** in the UI.

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
