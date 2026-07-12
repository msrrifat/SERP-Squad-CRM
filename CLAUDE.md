# SERP Squad SEO CRM

Local-SEO agency CRM (React 18 + Vite + Tailwind 4 + recharts + lucide-react).
Frontend prototype: all data comes from deterministic mock generators; the
DataForSEO client, pixel runtime, and publishing serializers are production-shaped.

Dev server: `npm run dev` (or preview_start "vite-dev"), port 5173.
API server: `npm run api` (server/index.js, port 8787; vite proxies /api).
Real integrations (listing scanner, rank re-checks via DataForSEO) live there —
see server/README.md for the live-vs-demo matrix. Endpoints refuse to fabricate:
503 when unconfigured, 502 on provider errors; the UI labels demo fallbacks.
Node lives in `~/.local/node/bin` (added to PATH in ~/.zshrc).

## Where to edit what

| Feature / concern | File |
|---|---|
| DataForSEO API client (auth, SERP tasks, batching, rank parsing) | src/lib/dataforseo.js |
| Cities/regions data, findCity | src/lib/geo.js |
| Deterministic RNG (hashStr, mulberry32) | src/lib/rng.js |
| 13-month grid, date ranges, month-rollover refresh (useMonthGrid) | src/lib/months.jsx |
| Formatters (fmt, money, pctDelta, dates, uid) | src/lib/format.jsx |
| Text/HTML helpers (escaping, markdown-ish, blocksToHtml) | src/lib/text.jsx |
| Mock data generators (genSiteData, genPositions, hydrate) | src/data/gen.js |
| SEO opportunity engine (per-page GSC queries, relevancy/intent, AI suggestions, anchor-text engine) | src/lib/seo.js |
| Website architecture + content engine (IA generator, content structure from SERP entities, audit/adjust, content writer) | src/lib/architect.js |
| Website Mapping & Content Architect tab (Business Website sub-tab) | src/features/optimization/architect.jsx |
| Brand Voice tab (guidelines/tone/files fed to all writing tools) | src/features/optimization/brandvoice.jsx |
| AI agent (scoped brain: agent.js; chat panel: AgentPanel.jsx) | src/features/agent/ |
| Seed company/clients/projects, ROLE_PRESETS, demo teamAccess grants | src/data/seed.js |
| Shared UI primitives (Card, StatCard, Modal, Toggle, inputs, FONT_CSS) | src/ui/primitives.jsx |
| Dashboard views: Overview, Rank Tracking, GBP, Website Perf, NAV | src/features/performance/views.jsx |
| Company Settings incl. API settings (API_REGISTRY), Team, Accounting, Invoices | src/features/company/settings.jsx |
| Client/project settings modals, ACCESS_TREE, add client/project | src/features/clients/modals.jsx |
| Login screen (clients + team members), client portal | src/features/clients/portal.jsx |
| Report builder (performance & work reports) | src/features/reports/ReportBuilder.jsx |
| Project management (records, checklists, wiki) | src/features/pm/board.jsx |
| Optimization Studio (GBP / Bing Places / Apple Maps / Business Website tabs, page editor, posts, pixel) | src/features/optimization/studio.jsx |
| Google index checker (real site: checks via API server; page/post index tags) | src/features/optimization/indexcheck.jsx |
| GBP geo-grid rank tracker (coordinate-targeted Maps scans, ARP/SoLV metrics) | src/features/performance/geogrid.jsx |
| Branding & Automation (media library, Web 2.0 branded sites, campaign wizard) | src/features/optimization/branding.jsx |
| App shell, routing, sessions, permission gates, lazy loading | src/App.jsx |

`_archive/serp-squad-monolith-jul5.jsx` is the retired single-file version — never edit it.

## Conventions

- **New API credentials**: add one entry to `API_REGISTRY` in
  src/features/company/settings.jsx — it appears in Company Settings → API settings
  automatically. Never build separate credential UIs.
- **Code-splitting**: heavy screens (portal, company settings, reports, PM,
  optimization) are React.lazy'd in src/App.jsx via `lazyOf`. New heavy features
  should follow the same pattern.
- **Permissions**: dashboard gates derive from the signed-in team member
  (`teamSession` in App.jsx): role presets in src/data/seed.js, per-project section
  grants in `project.teamAccess` (edited in Client settings → Team; applies to all
  of the client's projects). Client portal gates come from `client.login` flags,
  organized by CLIENT_ACCESS_TREE in src/features/clients/modals.jsx (flags listed
  in CLIENT_DEFAULT_ON default to true when unset).
- **Identity isolation**: clients and team members never see each other. `people`
  lists are pre-filtered per viewer, and PM views take a `maskName` prop that
  renders the other side as "Agency team" / "Client". Keep both when adding any
  feature that displays names.
- **Sign-in screen** has no dashboard button — it's reached via `#login`
  (in production it's linked from the agency's website).
- **Mock data must stay deterministic**: seed all randomness through
  hashStr/mulberry32 keyed on stable ids. No Math.random()/Date.now() in render paths
  (demo rerun in RankTrackingView persists via `extraPositions` on tracking entries).
- The month grid (LABELS/MONTH_DATES) is module state in src/lib/months.jsx refreshed
  by useMonthGrid(); include the returned key in any useMemo that bakes in month labels.
