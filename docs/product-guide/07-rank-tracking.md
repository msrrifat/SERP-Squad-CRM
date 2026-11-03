# Website Rank Tracking (keyword rank tracker)

INTERNAL. For SERP Squad team members and the in-app AI agent only.

Path: project → Performance Studio → **Website Rank Tracking**. City-level organic positions for the project's domain on Google or Bing, scanned through the company's DataForSEO account. The same scan also records the local map-pack position and the Google AI Overview citation position at no extra cost.

## Header

- Sticky **Compare vs** bar: **Prev scan / 7D / 14D / 30D / Lifetime**.
- Stat cards: Keywords tracked (and city count), In Google 3-Pack (% of tracked), Top 3, Top 10, Top 20 (each with the change vs the comparison), Movement (up/down counts).
- **Ranking distribution** bars: Top 3 / 4–10 / 11–20 / 21+.

## Tabs

### Live rankings

- Subtitle (agency view): "City-level positions · scraped via your company DataForSEO API", or a pointer to Company Settings → API settings when not connected, plus "N paused".
- Toolbar: **View** column menu (Volume, Search trend, Start, Current (web), Map pack, AI Overview, Change columns, Lifetime, Ranking URL; remembered per browser), keyword filter box, city select, **+ Add keywords**. With rows selected: cost chip, **Pause (n)** / **Resume (n)**, **Delete (n)** (removes their scan history too), **Rerun now (n)** (reads "Scanning N keywords… (runs in background)" while running).
- Columns: checkbox, Keyword (PAUSED badge; agency view shows city, device, engine and schedule under the keyword), Volume ("~N searches/mo"; demo-labelled on demo projects), Search trend (12-bar histogram), Start, Current (website organic position), Map pack (green #n or —), AI Overview (violet #n or —), the change columns, Lifetime, Ranking URL ("not scanned yet" / "not in top 100"), delete.
- Sorting on every column except Search trend and Ranking URL; default Current ascending; unscanned rows sink to the bottom.
- Change badges on Map pack and AI Overview chips: NEW, ▲n, ▼n versus the previous scan that captured that surface. Tooltips explain states such as "Google shows a map pack for this search — the business isn't in it" or "No AI Overview captured for this search yet".
- Empty state: "No keywords tracked yet — add your first keywords to start collecting daily positions."

### Ranking history

Scan date select (newest first). Columns: Keyword (city, device, engine), Position on that date, vs previous scan, Scanned at, Ranking URL. Every Rerun now and the automatic initial scan are logged here.

### All cities

One collapsible card per city with keyword count and average position. **+ Add keywords** on a city card opens the add modal pre-filled with that city, device, engine and schedule so new keywords join the existing group. **Delete city** removes all keywords for that city. Expanded table: Keyword, Current, Lifetime, Device, Schedule.

## Adding keywords

**+ Add keywords** opens "Add keywords to track":

- **Domain** (defaults to the project website).
- **Keywords — one per line** (commas also split).
- **Search engine**: Google | Bing. **Search device**: Mobile (default) | Desktop.
- **Targeted city**: "Already tracked:" chips for cities the project already uses (pick one to keep the keywords in that group), or search a new city. With DataForSEO connected, typing two or more characters searches DataForSEO's locations database (first search after a server restart can take up to a minute). Without it, the built-in city list. Free-text cities are not allowed.
- **Reporting type**: One time | Recurring (default), with **Rerun every N days** (1 to 30).
- **Scrape SERP with**: DataForSEO SERP API (recommended; disabled until credentials exist) or My Own IP (free, can be blocked or personalised).
- Cost line: "Initial scan of N keywords on <engine>" with the estimate, "repeats every N days".
- **Start tracking N keywords**. On a real project with DataForSEO connected, the initial scan starts at once for DataForSEO-mode entries. Demo projects already show generated history.

Known gap: the My Own IP mode is saved but Rerun now sends every selected keyword to DataForSEO regardless.

## Rerun / re-check: what happens

1. The browser hands the whole selection to the server as one **rank run** (`/api/rank/run`) and only watches it afterwards. The run is stored on the server (`server/data/rank-runs/`) and keeps going if the tab is closed, the laptop sleeps or the connection drops. Reopening the project picks the run up again (the bottom-right chip reads "running on the server").
2. A worker tick on the server (every 15 s) posts tasks to DataForSEO's standard queue (up to 100 per request, city-targeted with an exact location code, the country's Google domain, Android or Windows user agent, depth 100, AI Overview loaded, stop-on-match for the client's domain), collects finished tasks, and writes every landed position straight into the workspace.
3. Problems are waited out, not failed: a DataForSEO outage, HTTP 5xx, timeout or internal task error retries with backoff (1, 2, 5, 10, 15, 30 minutes, then hourly) for up to ten attempts and 48 hours. Missing credentials or an empty balance pause the run with the reason shown in the chip, and it resumes by itself. A task DataForSEO will not re-queue ("handed") is re-run live once. Google goto landing links are resolved through the converter (see below).
4. Keywords already waiting in an active run are never queued twice.
5. Result banner: "Re-checked N keywords via DataForSEO (ran on the server)", amber with any failures, plus "Charged $x (n queued + m live)".

How results are stored on each tracking entry: the position is appended to `extraPositions` (unranked = 101, shown as "100+"); a dated entry `{t, p, u, mp, ai}` is appended to `scans` (feeds Ranking history and the dated change columns); `rankUrl`, map-pack and AI-overview fields are updated. These survive workspace merges.

Demo projects without a reachable API get a small random nudge labelled demo. Real projects never get invented positions; they show the error instead.

## Position semantics

- **Position** = DataForSEO `rank_group`, the position among organic results. This is what every rank tracker reports. `rank_absolute` (counts ads, AI overview, map pack, People Also Ask) is kept as `absPos` for display only.
- A result counts as the client's when DataForSEO's domain field, the unwrapped URL or the breadcrumb host matches the domain or a subdomain. A google.* host never counts.
- **Map pack** = position 1 to 3 among the local_pack items in the same response; also whether a pack was shown at all.
- **AI Overview** = 1-based position among the overview's cited sources, collected in page order; also how many sources were cited.

## Google redirect links (since 30/31 Oct 2026)

Google now wraps result links as `google.com/goto?url=<token>` or `google.com/url?q=<real>` and throttles how many goto links resolve per results page. DataForSEO's standard priority (what the tracker uses) resolves most; Live and High priority come back with about half unresolved. The tracker:

- unwraps `url?q=` links offline;
- rebuilds a goto link from DataForSEO's breadcrumb or domain field so rankings are never missed and competitor rows show the right site;
- sends the ranked keyword's goto link to DataForSEO's free `goto_url_converter` (up to 100 per call, 40 to 60 s for a full page) to recover the real landing page; unresolved pages fall back to the site root and are retried on the next poll;
- shows stored redirect links unwrapped in the Ranking URL column.

Keywords scanned on 31 Oct 2026 before the fix may hold "not ranked" rows; a rerun corrects them.

## Costs

Standard queue at depth 100: $0.0006 base + 9 × $0.00045 = about $0.00465 per keyword (Google and Bing). Stop-on-match can make the real bill lower (down to $0.0006 when the site is on page 1). The async AI Overview adds $0.0006 per task (refunded when no overview exists) and is not in the estimate. Live fallback at depth 100 is about $0.0155. The depth is fixed at 100 in the UI.

Search volume: one DataForSEO request per city on real projects, cached per keyword for about 35 days.

## Scheduling

Entries carry a reporting type (Recurring every N days, or One time). The change columns follow the most common recurring interval (daily: 1d / 7d / 30d; N-day: Nd / 2Nd / 30d). On real projects (Demo data mode off) the server checks every 10 minutes for recurring keywords whose last scan is older than their interval and queues a rank run for them automatically, using the agency's DataForSEO account (or the client's own when enabled). Paused keywords are skipped, and a keyword whose last scheduled run failed waits six hours before being tried again.

## Client view and read-only

Client view hides the per-row meta line and shows the shared facts once as chips under the header (city or "N locations", devices, engines, "checked every N days", last scan date), with slimmer rows and a thin separator per row. Team members without the Manage keywords permission, and all clients, see the tracker read-only (no Add, Pause, Delete or Rerun).

Known inconsistency: unranked keywords stored as 101 count in the "21+" bucket and in averages (city average, Overview average position).
