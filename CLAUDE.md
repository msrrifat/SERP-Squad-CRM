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
| Posts Architect (Blog/Answer post architecture, anchor-variety internal linking, media auto-images, duplicate cross-check) | src/features/optimization/postsarchitect.jsx |
| Brand Voice tab (business info + shared brand properties + tone/files fed to all writing tools) | src/features/optimization/brandvoice.jsx |
| AI agent (scoped brain: agent.js; chat panel: AgentPanel.jsx; SEO research lane — live crawls + guide-grounded audits: research.js) | src/features/agent/ |
| Google SEO knowledge (distilled core+topics injected into every writing/architecture prompt; full 60-chapter corpus: server/knowledge/seo-guide.json, queried via POST /api/seo-guide) | src/lib/seoknowledge.js |
| Chat lane: instant send/react/read + 5 s polling, delivery status, notifications (server: handleChat* in server/index.js; union-merge rules shared in chatmerge.js) | src/lib/chat.js, src/lib/chatmerge.js |
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
| Local AI agent control plane (devices, task queue, per-project working limits per task type, per-project work setup (working channels + the Chrome ID signed in to each, rules for on-page / off-page / social, a Business Profile tab with one rule per kind of profile change (not allowed / only with approval / allowed), brand voice + brand documents for the agent; Word uploads are read in the browser by src/lib/docxread.js), sign-in checks per channel, lessons learned per project and task type (Experience tab) fed back into every task, agency-wide Knowledge documents the agent studies into key points for every project, a Report tab per project fed by a durable work log (work.json), live SEO data through DataForSEO's MCP server (the CRM is the MCP client and signs in with the saved DataForSEO login; tools `seo_data_*`, company switch, company and per-project monthly spend limits in dollars), token limits, approvals, a second check of the agent's plan before a change (and acting alone only after it passes), AI search visibility kept as numbers per project (the rank tracker's AI Overview count and the agent's own checks of a fixed list of questions), photos taken from the project's Resources (folders and Drive links; photos are no longer uploaded, earlier uploads stay usable), screenshots kept with tasks as proof, alerts (a live "needs a person" list and one digest email through the CRM's SMTP account), the agency's time zone and working hours, triggers (a keyword fell, the website stopped answering), per-project Resources (media folders on the agent's computer and Google Drive links with use / do-not-use notes, and the website's code repository, set up under Settings → Website → Built with "GitHub repository", reached with a deploy key made on the device or with a GitHub token that only the device keeps), SEO tools the agent may open signed in (the sign-in itself is saved encrypted on the device, never on the server), blog publishing rules per kind of post and the agent working in the CRM's own Blogs & FAQs plan (tools `blog_plan*`, written through `updateProjectOptimization` in server/index.js; `keepAgentPosts` in src/lib/mergestate.js keeps its posts on a merge), a monthly trending services section, Google through its APIs for the agent (tools `analytics`, `index_status`, `index_check`: Search Console URL Inspection or the CRM's index checker, only for pages not recorded as indexed; task type `index_watch`), Google Drive through a service account (server/gdrive.js; key in the encrypted secrets, set under API setup; tools `drive_list`, `drive_read`, `drive_save`; device endpoint `agent/drive` so private folders need no public link), commanding the agent from the chat (`work_settings`, `propose_settings`, `propose_guide`, `cancel_task`: a proposal card in the chat that a person applies through `chat/change`), the agency chat on the AI agent's main screen (project id `_agency`, playbook `_company`, its own tool list `COMPANY_TOOLS`; instructions for every project, guides, company-wide settings and the same setting on many projects, each as a card a person applies), company-wide privacy settings (`global.privacy`: confidential words masked by `hideDeep` in everything a device receives, people's contact details, money and team chats kept out of `crm_read`), link building by kind of link (Offpage SEO: `rules.links`, one row per kind with off / a number a month / the agent decides, a preferable list of the only sites to use, a Chrome ID for the link-building accounts; tools `link_plan`, `link_check`, `log_link`, `account_request`; `links.json`; the agent never creates accounts), an SMM management tool per project (Social Media tab) with tool sign-ins relayed once through server memory to the device, copying one project's settings and notes to another (`project/copy`), a folder for working documents saved as real .xlsx and .docx files (Report tab, `Office.java`), carrying on with a run after a power cut (`agent/resume`), what the agent knows about each project kept as its status (eight sections plus the rankings now, given to every task), the weekly ranking report per project with the agent's review, read-only tools to look over the CRM, the agent's own DataForSEO login and the account balance, live chat per project kept as memory, per-project directions, API setup, playbook sync, the agency's own guides written in Playbooks and added to the playbooks they apply to, agent releases; Admin-only endpoints `/api/agentops/*`, device endpoints under `/api/agentops/agent/*`) | server/agentops.js, server/agentops-catalog.js (task types + default playbooks), dashboard src/features/company/agentdash.jsx |
| Local AI agent management screens inside the device application: the same agentdash.jsx, built as one script by `npm run build:agent-ui` (vite.agent.config.js, entry src/agent-app/main.jsx) into agent/src/main/resources/manage/; the application forwards `/api/agentops/*` with the device token and the server allows it only for devices with `canManage`. Rebuild it and the jar after changing agentdash.jsx | vite.agent.config.js, src/agent-app/main.jsx, scripts/export-agent-catalog.mjs |
| Local AI agent program (Java 17+, Maven; Claude tool loop, Chrome control, sync, self-update, runs as an application: standalone window, tray icon, shortcuts, `demo` mode with a made-up agency). Build: `cd agent && mvn package`. **Releases are automatic**: a push touching `agent/`, agentdash.jsx or the catalog runs `.github/workflows/agent-release.yml`, which builds the jar as MAJOR.MINOR.<run number>, copies it to the server's `data/agentops/incoming/`, and the CRM publishes it to devices (`adoptIncomingRelease` in agentops.js). Never hand-edit a patch version; raise MAJOR.MINOR in agent/pom.xml for bigger steps | agent/ (see agent/README.md); screens in agent/src/main/resources/ui.html served by LocalUi.java; AppWindow.java, Tray.java, Shortcuts.java, Demo.java; Checkpoint.java (resume after a power cut), LocalTools.java + Drive.java + Repo.java (working folder, media sources, code repository), Vault.java (saved sign-ins for SEO tools) |
| Internal product guide (A–Z manual read by the team tab + AI agent; team-session-only endpoints `/api/product-guide*`) | docs/product-guide/*.md, viewer src/features/company/guide.jsx |

`_archive/serp-squad-monolith-jul5.jsx` is the retired single-file version — never edit it.

`docs/product-guide/` is the internal product manual (one file per area, `00-index.md` is the A–Z index). When a feature's UI, labels, costs or live/demo status change, update the matching document in the same change set.

## Conventions

- **Deploys are automatic**: every push to `main` rebuilds app.serpsquad.com
  (.github/workflows/deploy.yml, with one automatic retry on the flaky VPS
  step). When a change set is complete and verified, commit and push it —
  never end a conversation with verified work sitting unpushed. A Stop hook
  warns when the tree is dirty or ahead of origin/main.
- **New API credentials**: add one entry to `API_REGISTRY` in
  src/features/company/settings.jsx — it appears in Company Settings → API settings
  automatically. Never build separate credential UIs. One deliberate exception:
  the local AI agent's Claude keys are set in Company Settings → AI agent → API
  setup (and per device in the agent's own dashboard). They are stored encrypted in
  server/data/agentops/secrets.json (master key outside the data folder, see server/README.md), never in the workspace state, because the
  workspace is readable by every signed-in session. The same holds for the
  optional DataForSEO login of the agent's own (AI agent → API setup → Live SEO
  data): it lives in the same encrypted file; the login in API settings stays
  the default.
- **Agent store text is scrubbed**: in server/agentops.js every stored free-text
  value goes through `clip()` (or `line`/`lines`/`para`, which use it); it masks
  anything shaped like a password or API key. Never store or forward free text
  there without it, and never route the agent's own keys through it. The device
  does the same with `Redact.java` before page text reaches Claude.
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
