# SERP Squad local AI agent

A Java program that runs on an office computer, takes SEO tasks from the CRM
and does them with the Claude API. The CRM is the control centre; the computer
is only a worker.

- It makes outbound requests only (to the CRM and to Claude). No port is opened.
- What it may do is decided in the CRM: Company Settings, AI agent.
- Its instructions (playbooks), settings and CRM tools are synced from the CRM.
- Its memory lives in the CRM, so a second computer continues where this one stopped.
- It runs as an application on the computer: its own window, a Desktop and
  Start menu shortcut, and an icon near the clock.
- It answers a live chat per project (CRM: Company Settings, AI agent, Chat).

Server side: `server/agentops.js` and `server/agentops-catalog.js`.
Dashboard: `src/features/company/agentdash.jsx`.

## What you need on the computer

- Windows 10 or 11, macOS or Linux.
- Java 21 or newer (Temurin from adoptium.net is fine). The program is built for Java 17 and up.
- Google Chrome, for the tasks that use a browser.
- A Claude API key from the Claude Console. Set it once in the CRM (Company
  Settings, AI agent, API setup), or give this computer its own key in the
  agent's dashboard.

## Install

1. Put `serpsquad-agent.jar` in its own folder, for example `C:\SerpSquadAgent`.
2. In the CRM open Company Settings, AI agent, Devices & updates. Register a device and copy its token. The token is shown once.
3. In that folder run:

   ```
   java -jar serpsquad-agent.jar
   ```

   The agent starts and opens its application window. Paste the device token
   under "Connect this computer to the CRM" and press Connect. (`setup` does
   the same from the command line.) On Windows it also adds a "SERP Squad
   Agent" shortcut to the Desktop and the Start menu.
4. From then on start it from that shortcut (macOS: the `SERP Squad Agent.app`
   it creates in the folder; anywhere: `run.bat` or `./run.sh`). Starting it
   twice only brings the window back. "Start the agent when Windows starts" is
   a switch under Settings.
5. For tasks that work in a signed-in browser (Business Profile, Search
   Console, a website's editor, social profiles): under Settings, Chrome IDs,
   add a Chrome ID, press "Sign in", sign in yourself, then close that Chrome
   window. Then choose that Chrome ID for the channel in the project's Work
   setup.

## The application on the computer

The agent opens its own window: Chrome (or Edge) in application mode, with no
tabs and no address bar, using a separate profile folder (`data/app-window`).
Closing the window does not stop the agent. The tray icon (notification area
on Windows, menu bar on macOS) reopens the window, pauses, or quits.

Screens:

- **Overview**: the running task with its live steps, tokens used against the
  run's budget and which key it uses; Pause, Resume, "Check for work now";
  today's totals, this month across all projects, projects at a glance, and
  the recent tasks on this computer.
- **Projects**: every project with its token use against the limit, what is
  running, waiting or needs approval. Opening a project shows, at the top, its
  chat with the agent in the shape of a phone screen, with the project's
  directions beside it; below that the working limits per task type, recent
  tasks and what the agent remembers.
- **Tasks**: everything queued, running and finished, with filters and the
  reason a waiting task is held.
- **Activity**: the agent's log.
- **Settings**: connection and Sync now, this computer's own Claude key,
  Google sign-in, version and updates, "Start the agent when Windows starts".

**Settings from the application.** When an Admin has switched on "Manages
settings" for this device (CRM, AI agent, Devices & updates; it is ticked by
default when a device is registered), the application shows the same
management screens as the CRM, and its sidebar gains Chat, Playbooks and API
keys:

- **Projects**: the chat and directions, "Agent works on this project", the
  token limit per month and per day, and the working limit for every task
  type (Off, Limited to N per day, week or month, Open; starts by itself;
  ask before changing; model), plus project memory and the change journal.
- **Tasks**: give the agent a task, approve or reject a proposal (the text can
  be edited first), cancel, run again, read reports and findings.
- **Chat**, **Playbooks**, **API keys** (company key and a key per project).
- The company-wide switch, Pause all, default model, effort and the company
  token limit sit at the top of those screens.

Registering or removing devices and publishing a program version stay in the
CRM. Without the permission the application shows projects and tasks
read-only, and the chat still works.

How this stays safe: the settings requests are sent by the application window
to the agent's local server, which forwards them to the CRM with the device
token; the CRM checks the device's permission on every request and logs the
change under "<device> (agent's computer)". The AI model has no tool that
reaches these endpoints, and its browser refuses every address on this
computer or the local network, so the agent cannot raise its own limits or
approve its own work.

Under the hood the window shows a page the agent serves on 127.0.0.1 only
(port 7717, or the next free one). Requests must come from that page itself
(a random token per start, a matching Host and no foreign Origin), so a
website open in a browser on the same computer cannot call it. It never
returns a key or the device token.

To see the application with a made-up agency, without connecting anything:

```
java -jar serpsquad-agent.jar demo
```

## API usage on the Overview

The Overview shows what the agent used this month on every computer, by
provider: Claude's tokens (today, the month against the company limit, input,
output and cache, a bar per day, a line per model, the estimated cost) and
DataForSEO's spend and paid requests, then the projects that cost most. The
numbers come from the CRM (`usage` in the board the application reads): token
counts are the ones Claude returns with each call, DataForSEO amounts the ones
it states with each answer.

## Live chat

Each project has its own conversation in the CRM (AI agent, Chat). The agent
listens on a separate thread: it asks the CRM for a message and the CRM holds
that request open until one arrives, so an answer starts within a second or
two, even while a long task is running.

- A chat answer uses the same project-scoped CRM tools as a task, plus web
  search. It has no browser and cannot change anything live.
- Work asked for in the chat is queued as a normal task in the person's name
  and follows the project's limits and approvals.
- Chat tokens count against the project's token limit. One answer is capped
  at 150,000 tokens and twelve steps.
- The chat's instructions are the "Chat" playbook, editable in the CRM.
- Message text is not written to the agent's log.
- Every message is kept on the server as the project's memory. The agent sees
  the most recent thirty and reads older ones with its `chat_history` tool.
- A standing instruction given in chat ("from now on…", "never…") is saved by
  the agent as a **direction** for that project. Directions are listed beside
  the chat, can also be typed in the CRM, and are handed to the agent at the
  start of every task and every chat answer for that project.
- The same conversation is open in the CRM and in the application's project
  screen; a message sent from the application is marked with the computer's
  name.

## Claude API keys

Set in two places, and a task uses the most specific one:

1. the project's own key (CRM, API setup, "Own key per project");
2. the key saved on this computer (dashboard, API setup);
3. the company key (CRM, API setup).

A key that comes from the CRM is handed over with each task, used for that
task only and never written to disk on the computer. On the server the keys
are kept in `server/data/agentops/secrets.json` (owner-only file), outside the
workspace data, and are never sent back to a browser.

Then, in the CRM, enable the agent for a project and set its limits.

## Commands

| Command | What it does |
|---|---|
| `run` | Start working and open the application window (the default; what the shortcut calls) |
| `setup` | Connect this computer from the command line instead of the dashboard |
| `demo` | Open the application with a made-up agency, without connecting to anything |
| `status` | Show the connection, playbook revision, Chrome and key state |
| `sync` | Pull playbooks, settings and the CRM tool list now |
| `login-google` | Open the first Chrome ID (created if there is none) so a person can sign in |
| `version` | Print the version |

`--home <folder>` changes where `config.json`, `data` and `logs` live. The
default is the folder that holds the jar.

## Limits (set in the CRM, enforced by the CRM)

Per project:

- **Agent works on this project**: nothing runs until this is on.
- **API token limit** per month and per day. Every Claude call is reported to
  the CRM straight away. When a limit is reached the running task stops and
  no new task starts for that project until the period ends.
- **Working limit per task type**: Off, Limited (N per day, week or month) or
  Open. Open means no cap, and the agent may start that task whenever it
  judges it is needed. Tasks suggested by the agent follow the same rule.
- **Starts by itself**: the CRM queues that task on a schedule. Out of the box
  only the daily check does; "Use the recommended schedule" switches on more.
- **Ask before changing**: tasks that change something live first prepare a
  proposal. A person approves or edits it in the CRM, and the agent then
  carries out exactly the approved text.

- **Live SEO data spend limit** per month, in dollars (see "Live SEO data"
  below). 5 dollars unless changed; 0 stops paid requests for the project.

Company-wide: on/off, pause, default model and effort, and one token limit for
all projects together. Live SEO data has its own company switch and monthly
spend limit under API setup.

## Running the queue

- **Priority and due date.** A task added by hand can be High, Normal or
  Low and can carry a due date. Work is handed out in this order: approved
  changes first, then by priority, then what a person asked for before what
  the agent started itself, then the nearest due date, then the oldest. A
  task past its due date shows under Alerts.
- **Changing a waiting task.** Its title, instructions, priority and due
  date can be changed until it starts (**Change** in the task).
- **One automatic second try.** A run that only reads or proposes and fails
  for a reason that may pass (a page that did not load, a stuck run) goes
  back in the queue and is tried once more after ten minutes; the task says
  so while it waits. A task that was making a change is never retried by
  itself, and neither is a failure that would only repeat (a refusal, a
  rejected request).
- **Cost by kind of task.** API setup shows the month's tokens, calls and
  estimated cost by kind of task, by model and by project.
- **Playbook versions.** Every edited version is kept, the last ten; an
  earlier one can be looked at and put back from the playbook's editor.
- **Your own guides.** At the top of Playbooks the agency writes its own
  guides and keeps them up to date: a title, the text, and where it applies
  (every task and the chat, one area of work, or chosen kinds of task). The
  CRM adds each guide's text under the playbooks it applies to, in the files
  this program syncs, so the agent reads it as part of its instructions for
  exactly those tasks and no new version of the program is needed. A guide
  wins over the built-in playbook; a project's own brand voice and directions
  win over a guide. Guides can be switched off, keep their last ten versions,
  and never store anything shaped like a password or a key.
- **Finding tasks.** The task list can be narrowed to one project and
  searched.

## AI search visibility as a number, and two more kinds of work

- **AI search visibility** (Work setup, **AI search**). Two numbers, never
  mixed. The first comes from the rank tracker for free: for how many
  tracked keywords the business is cited in Google's AI Overview, per scan
  day. The second comes from the agent's own checks: a fixed list of up to
  20 questions per project, each asked of the AI engines the agent can
  really ask, and logged with `log_ai_visibility` (named or not, website
  linked or not, who else was named, which pages were cited). The list
  stays the same so the share compares from check to check; with an empty
  list the first check's questions become the list. An engine that was not
  asked has no row: nothing is estimated. With live SEO data on, the agent
  looks up DataForSEO's AI Overview and AI answer endpoints through the
  docs tools; without it, it answers each question itself with web search
  and logs that as the engine Claude.
- **Whole-site technical audit** (`site_audit`). Goes through the site
  (DataForSEO's crawl when live SEO data is on, otherwise up to 25 pages
  from the sitemap and the ranking pages) and lists the technical problems
  in priority order with the pages affected. Changes nothing.
- **Structured data for a page** (`schema_markup`). Writes the JSON-LD a
  page should carry from facts that are on the page or in the brand voice,
  ready to paste, and lists what was left out for lack of a fact. Putting
  it on the site is a separate, approved website change.

The work report can now be downloaded as a spreadsheet (CSV) and opened as
a clean page to print or to save as a PDF: what was done, when and where,
with no names and no costs.

## Photos, seeing a page as a picture, and proof

- **Photos.** Photos are not uploaded to the CRM any more. A project's
  photos are a folder on this computer or a Google Drive folder shared by
  link, listed under Work setup, **Resources** with a note on what they are
  for (see "Media sources" below). The agent lists a source with
  `resources_list`, looks at a candidate with `resource_look`, and attaches
  it with `browser_upload` (source and file), giving the number of the
  page's file field or of the button that opens the file chooser. The
  program answers the chooser itself, so no window opens on the screen.
  Nothing outside the listed sources can be attached, and nothing is
  attached in a run that only looks. The agent keeps a list of the pictures
  it published in the project's working folder (`media-used.md`) so it does
  not repeat one. Photos that were uploaded before 24 Nov 2026 stay usable
  (the `photos` tool, `browser_upload` with `photo_id`) and are shown under
  Resources until they are removed.
- **Seeing a page.** `browser_look` returns the visible page as a JPEG next
  to the tool's answer, for the times the text reading is not enough (a
  visual editor, a photo, a layout). It costs more tokens than a reading, and
  the rules tell the agent to use it sparingly. A picture cannot be scrubbed
  the way text is, so none is taken of a page that asks for a sign-in, has a
  field for a password, a code or a key, or shows something that looks like
  one. The switch is under API setup (**Looking at pages as pictures**).
- **Proof.** When a task that changed something ends, a picture of the page
  as the agent left it is sent to the CRM and kept with the task (shown in
  the task under **Proof**; four per task at most, kept 120 days). The same
  rule about passwords and keys holds. The PNG on the computer
  (`data/screenshots/`) is still written as before.

## The second check, and acting without a person's approval

Every task type that changes something live has an approval setting, per
project (Projects, the project's page, Work setup):

- **Ask before changing** (the default). The agent prepares the exact plan
  and waits. With the second check on, what it found is shown with the
  proposal.
- **Act after a second check.** The run starts as one that only looks. The
  agent hands in its exact plan with request_approval; a separate Claude
  call (no tools, its own model, set under API setup) reads that plan
  against the client's business facts, the brand voice, the manager's
  directions and the limits of that kind of task. If it passes, the browser
  is released and the same run carries out exactly that plan. If it does not
  pass, or its answer cannot be read, nothing is changed and the plan goes
  to a person with the problems found. A "pass" that still lists a problem
  counts as a fail.
- **4 and 5 star reviews after a second check, ask for the rest** (review
  replies only). The run may answer only reviews of 4 or 5 stars; for lower
  ones it queues a follow-up task that always asks a person, whatever the
  setting.

The check does not see the live page: it judges the plan, not the result.
It costs one short call per plan, counted in the task's tokens. A change
made without a person is kept with the plan that was passed, and the
activity log says nobody approved it. The switch and the model are under
API setup (**Second check before a change**). With the switch off, "act
alone" means with no check at all, and the screens say so.

Together with "starts by itself, every N days" on the same row, this is the
autopilot: a Business Profile post every 7 days, replies to good reviews
within a day (run the Business Profile guard daily), each one read by the
second check first.

## Alerts, the agency's time zone, working hours and triggers

All of it is set in the CRM (AI agent, **Alerts**) or in the application's
own Alerts page on a computer that manages settings.

- **Needs a person.** A list worked out from what is true right now:
  proposals waiting for approval, tasks that failed or were stopped (and
  approved changes that were cut off), limits at 80% and at 100%, a Chrome ID
  that asks for a sign-in, work that waits while no computer checks in or
  that is held for a reason only a person can remove, a website that does
  not answer, an update a computer could not install. A line drops off by
  itself when it stops being true; everything but a proposal can be
  dismissed. The application's Overview shows the same list.
- **Email alerts.** One email for everything new, at most every ten
  minutes, to the addresses typed there or else to the owner and the Admins.
  Nothing is mailed twice. It goes out through the email account saved in
  the CRM under Company Settings, API settings, Email SMTP.
- **Time zone.** Days, weeks (from Monday) and months are the agency's: a
  daily limit, "1 per day" and the monthly token limit turn over at midnight
  there. "4 per month" means this calendar month, not the last 30 days, and
  a daily task is due once per calendar day, so it no longer drifts later.
- **Working hours.** When set, work the agent starts by itself (scheduled
  tasks, its own follow-ups, triggers) only begins inside them. A task
  started by hand and a change a person approved run at any time.
- **Triggers** (per project, off until switched on, inside that project's
  working limits): a tracked keyword that was in the top 20 falls by the set
  number of positions in a new scan (queues a rank-drop diagnosis that names
  it; demo-data projects are skipped); the website stops answering (the CRM
  asks for the home page every 15 minutes with no Claude call; two failures
  in a row raise an alert and queue a site health check). The Business
  Profile guard also suggests one review-reply task for reviews without a
  reply, so running it daily gets replies drafted within a day.

## Live SEO data (DataForSEO, through its MCP server)

DataForSEO offers a hosted MCP server at `https://mcp.dataforseo.com/v3/mcp`
with four tools: three read its API documentation and one, `api_request`,
makes an authenticated request to any DataForSEO endpoint. The CRM server is
the MCP client (`server/agentops.js`, "SEO data from DataForSEO"). It signs in
with the DataForSEO login already saved in the CRM, so the login never reaches
this program or Claude, and it hands the tools to the agent as
`seo_data_docs_sections`, `seo_data_docs_index`, `seo_data_docs_search` (free)
and `seo_data_request` (paid).

Nothing is installed on this computer for it and there is nothing to configure
here: the tools arrive with the other CRM tools when the feature is switched
on in the CRM (AI agent, API setup), and disappear when it is switched off.

Every request costs money on the DataForSEO account, so the CRM checks each
one first: the company and project monthly spend limits, at most 20 requests
in a task and 6 in a chat answer, GET and POST only, only the SEO parts of the
API (never the account part), at most three task objects, and caps on `depth`,
`limit` and crawl size. The cost stated in DataForSEO's answer is counted per
project.

To point a test server at a stand-in instead of DataForSEO, start the CRM
server with `AGENTOPS_DFS_MCP_URL` (and `DFS_BASE` for the balance).

**The agent's own login, and the balance.** AI agent, API setup shows what is
left on the DataForSEO account (asked from DataForSEO at most every 20
minutes; the question is free). By default the agent uses the login saved in
Company Settings, API settings. An Admin can give the agent a separate
DataForSEO login there instead, for example a sub-account with its own
budget. It is checked against DataForSEO before it is saved, kept in the same
encrypted file as the agent's Claude keys, shown afterwards only as a hint,
and never sent to a browser, to this program or to Claude.

## What a task can use

| Tool | Where it runs | Notes |
|---|---|---|
| CRM tools (project brief, rank table and history, rank compare, Search Console, geo-grid, past reports, remember, change journal, suggest task) | CRM server | Defined by the server and synced, so new ones need no new jar. Always limited to the task's own project |
| Web search and page fetch | Anthropic's servers | Only for task types marked "Web research" |
| Live SEO data (`seo_data_*`: search results, keyword volumes, competitors' keywords, backlinks, on-page checks, listings) | CRM server, which asks DataForSEO's MCP server | Only when switched on in the CRM. Paid per request, inside the project's and the company's spend limits |
| Browser (open, read, click, type, scroll, back) | This computer's Chrome | Pages are read as text with numbered elements |

### Business Profile rules

In the CRM, Work setup has a **Business Profile** tab: the project's
profiles, their tasks, and one rule for each kind of change on a profile
(business name, address and service area, phone, website and booking links,
hours, special hours, categories, description, services, products, photos,
posts, review replies, questions and answers, attributes). Each rule is
**Not allowed**, **Only with my approval** or **Allowed**, with an optional
note on how that part may be changed. Name, address, phone and categories
start as not allowed; website and hours as only with approval.

- The rules are part of the work setup every Business Profile task receives,
  and the second check reads them with the plan.
- The CRM itself does not start a task whose whole purpose is not allowed
  (posts, review replies, or edits when every kind of edit is not allowed).
- Where posts or review replies need approval, the CRM hands the task out as
  one that asks a person, whatever the task type is set to. A profile edit
  task acts alone only when some part is plainly allowed and the second
  check is on; a part that needs approval is then stopped by the second
  check, which sends the plan to a person.
- Not allowed and approval for single fields inside one edit rest on the
  agent's instructions and the second check reading the plan. The program
  does not recognise which field of Google's editor a click belongs to.

### Chrome IDs and working channels

A **Chrome ID** (for example `CH-7K2Q`) is a separate Chrome profile under
`data/chrome-profiles/<id>` that a person signed in to once: one per Google
account or social login. Create them in the application under **Settings,
Chrome IDs** (Add, **Sign in**, Rename, Remove). The CRM is told only the ID
and its name.

In the CRM (or in this application when the device manages settings) each
project's **Work setup** names its working channels and the Chrome ID for
each: website and its editor, Google Business Profiles, Search Console,
Analytics and social profiles. A task that works in a channel's browser gets
that Chrome ID, limited to that channel's own sites, and waits with a plain
reason while the channel has no Chrome ID or no device has it. The other
three tabs (Onpage SEO, Offpage SEO, Social Media) hold the rules and working
limits of each area; the agent is told them at the start of every task of
that area.

### Sign-in checks and live work

"Check sign-in" under a channel in the project's Work setup makes this
computer open that Chrome ID at an address that only shows its real content
to a signed-in person, and report whether a sign-in page came up. Nothing is
clicked or typed and Claude is not called. The Settings tab also shows a
six-step checklist of what live Business Profile work needs.

Chrome is closed after every task and every check. The sign-in stays in the
profile folder; closing the window also closes the local control port, so a
signed-in session is never left open to other programs between tasks. A
Chrome left over from a crash is closed, never reused.

### The report

Each project has a Report tab: everything done for it, by period (all time,
a month, or custom dates) and by section (research and planning, on-page with
the live page links, off-page with links won and built, social media). The
agent adds to it by itself: every finished task, every logged change, and
single items it records with the `log_work` tool. People add work done
outside the agent there too.

The Report tab has two parts. **Working report** is the above. **Ranking
report** is the week in numbers: how many tracked keywords are in the top 3,
10 and 20 now and a week ago, which went up and down, which entered or left
the top 10, an eight-week trend, and (where the project's Search Console is
connected in the CRM) clicks, impressions, click rate and position for the
last seven full days against the seven before, with the queries and pages
that gained and lost most. It is worked out by the CRM from data it already
has, so it costs no tokens. Once a week the task type *Weekly ranking review*
has the agent read it (`ranking_report`), find the likely cause of each
important move, queue the tasks that should follow, and record its review
with `log_ranking_review`; the review and its actions are shown under the
numbers, and 26 weeks are kept. Business Profile performance numbers (calls,
direction requests) are not in it: the CRM has no source for them yet.

### What the agent knows about a project (status)

The agent does not look at a project afresh every time. What it has found
out is kept per project in eight short sections: the business, the website,
its technical state, the Business Profile, links and listings, the
competitors that rank, how the trade works, and what is in progress. Every
task and chat answer starts with them, together with the rankings as they
are right now from the rank tracker, and the rules tell the agent not to
fetch or audit again what is already recorded there unless a section is
marked as over 30 days old. It rewrites a section with `update_status`
when its work teaches it something that belongs there, and reads all of
them in full with `project_status`. People can read and correct every
section in Work setup, Experience. The status is kept on the CRM server
(`status.json`), so any computer continues with it.

Two task types keep it growing. **Learn the trade** (daily, when switched
on) studies one gap in what the agent knows about the client's trade from
sources that know it (trade bodies, regulators, manufacturers), checks each
fact in a second source and adds it to "How this trade works" with the
source named. **Study the competitors that rank** (weekly) looks at the two
or three businesses that outrank the client: site, Business Profile as it
shows in search, social profiles, listings and, with live SEO data, links;
it records what they do that the client does not and suggests at most three
tasks. Both only read public pages. Both are off until a project switches
them on, because they spend tokens every day or week.

### Looking over the CRM

With `crm_overview` and `crm_read` the agent can read the CRM itself. A task
on a client project sees everything of that project (its records, pages,
posts, reports, ads and rankings). The chat and agency-level tasks see every
client and project, and the task type *CRM oversight review* reports across
all of them. The tools only read. Anything named like a password, key, token
or sign-in is left out by name, embedded files are named but not returned,
and every value passes the same scrubbing as the rest. One switch on the API
setup tab turns it off for everything.

### Knowledge for every project

The Knowledge screen holds the agency's own documents: methods, standards,
checklists. The agent studies each one (a task of its own) and writes down
its key points; every task and chat answer on every project then starts
with them, and the full text can be opened with the `knowledge_document`
tool. A project's brand voice and the manager's directions win where they
differ.

### Experience

Every task and chat answer starts with what the agent has learned on that
project and about that kind of task: lessons it saved itself, and lessons
written whenever a person edits a proposal, rejects one or rates a result.
They are kept in the CRM (Work setup, Experience) so any device continues
with them. The AI model itself does not change.

### Brand voice

Each project has a **Brand voice** tab in its Work setup: brand and business
facts, tone rules, a writing sample and brand documents (Word, text or
Markdown; paste the text of a PDF). Every task and chat answer is given the
brand profile; tasks that write for the client also get the short documents
in full, and the agent opens longer ones with the `brand_document` tool.
While nothing is saved there, the agent uses the Brand Voice the team already
filled in for the project in the CRM.

`chrome-web` is a clean profile for the open web. The single `chrome-google`
profile of versions before 0.7.0 becomes the first Chrome ID automatically.

## Safety rules built into the program

- A signed-in Chrome ID opens only the exact sites of its channel. Mail,
  files, saved passwords, payments and account, security, user, plugin,
  settings, billing and API-key pages are refused, also when a link leads
  there.
- It never reads the content of a password, code or key field, and hides
  anything on a page that looks like a password or a key before the page
  text goes to Claude. It refuses to type such text anywhere.
- config.json, the data folder (Chrome IDs) and the logs are readable by
  this computer's user only. The log never contains a key or a token.
- It talks to the CRM and to Claude over https only (this computer itself is
  allowed, for tests).

- Claude never types on a page that has a password field or on Google's
  sign-in pages, and never into a password field. A person signs in. The one
  exception is the program itself (not Claude) signing in to a listed SEO
  tool with a sign-in saved on this computer, see below.
- Before approval, typing in the browser is switched off entirely.
- A Chrome ID opened for a channel refuses any address outside that channel's own sites.
- Text on web pages is passed to Claude as data. The agent rules tell it to
  ignore instructions found on pages and to report them.
- If Claude cannot be called (wrong key, no credit, outage, no network) the
  task goes back to the queue and the computer waits ten minutes. Tasks are
  not failed one after another.
- If token usage cannot be reported to the CRM, the task stops.

### A run that only looks

In a Chrome window a person signed in to, only a task that is there to make a
change (and, where approval is asked, has it) may type, choose in a list or
press a button that changes something. Checks, audits and the proposal before
an approval can open pages, follow links, tabs and menus, scroll and read.
This is enforced by the program, not only by the agent's instructions: a
button or link whose label says it changes something (Publish, Post, Save,
Send, Reply, Delete, Remove, Confirm, Update, Upload, Request indexing and
the like, or any submit button) is not clicked, and the agent is told to put
it in its proposal or report. The list of words is English.

A message box from the page ("are you sure?") no longer freezes the tab: a
plain message is closed, a yes/no question is answered Yes only in a run
that may act and No in a run that only looks, and the agent is told what the
box said. A link made to open a new tab opens in the tab the agent can see.
On a long page the reading follows the scroll position (browser_scroll takes
down, up, top or bottom). browser_select chooses an option in a drop-down
list by its text.

### Stopping in time

- When the CRM says stop (a limit, a cancel, the agent switched off), the
  actions Claude asked for in that same answer are not carried out. Only the
  tools that record work (finish_task, request_approval, log_work,
  log_change, remember, save_lesson) still run.
- When one run's budget or its 90 minutes are used up, the agent gets one
  closing call to say what it did and what is live, instead of stopping
  without a word.
- One run's budget counts tokens the way they are billed: a token read back
  from the cache counts as a tenth. The project's monthly and daily limits
  still count every token. Once a conversation passes 60,000 input tokens
  the API clears all but the six newest tool results (old page readings).
- A tool call that was cut off by the output limit is not run.
- Switching the agent off for the company or for a project stops its
  running tasks at their next step. Pause only stops new tasks from
  starting.
- A run with no answer from Claude and no finished step for 17 minutes is
  ended by the program itself, and the computer takes the next task. The
  CRM releases a task whose device reports no progress for 20 minutes, and
  ends any run after 3 hours.

### An approved change is never made twice by itself

If the computer goes silent (sleep, no network, a crash) while it is making
an approved change, the task is not put back in the queue: part of the change
may already be live. It stops with that explanation and a person decides.
**Run again** tells the agent to look at what is already live first and to do
only what is missing. Tasks that only read or propose are simply run again.

### Carrying on after a power cut or a restart

While a task runs, the program keeps where it stands in `data/checkpoints/`:
the conversation so far after every turn, and around every single step a
small file that says which steps of the current turn are finished (with
their results) and which one is in progress. The task's Claude key is never
written there.

When the program starts again after the computer stopped (power cut, crash,
restart, or it was closed), it first asks the CRM whether that run is still
its own (`agent/resume`). The CRM agrees when the task is still assigned to
this computer, or was released only because the computer went silent and
nobody has touched it since: not after a person ran it again, cancelled it or
another computer took it, not after 24 hours, and at most three times for one
run. The run then goes on from the saved conversation, on the same token
budget, with what it already spent still counted and the time it stood still
not counted against the longest a run may take. Nothing new is taken before
that is settled.

The agent is told plainly that the computer stopped. A step that had finished
keeps its result. The step that was in progress is reported as *not known to
have taken effect*, never as done, and the ones after it as not run. In a run
that was making an approved change, the agent must look at what is already
live and do only what is still missing; the browser has been restarted, so it
has to open the page again before it can act at all. With this, a cut-off
approved change no longer has to wait for a person, as long as the same
computer comes back within a day. The switch is in the CRM (AI agent, API
setup, "Carrying on after a power cut or a restart"); with it off the old
behaviour applies.

For the agent to come back by itself, switch on **Start the agent when this
computer starts** in its Settings (a Startup shortcut on Windows, a launch
agent on macOS, an autostart entry on Linux). The computer has to switch on
again when power returns (a BIOS setting, usually "Restore on AC power loss")
and sign this user in without waiting for a password.

When the CRM cannot be reached at the end of a task, the result is kept in
`data/outbox/` and delivered at the next check-in, before any new task is
taken. A result that arrives after the CRM released the task is still
accepted from the same computer, as long as nobody started the task again.

## Updates

- **Playbooks and settings** sync at start, once a day, when they change, and
  when "Sync now" is pressed in the CRM (takes effect within a minute). A sync
  is downloaded to a staging folder and every file is checked against its
  SHA-256 before it replaces the live copy.
- **The program** updates itself from the live CRM:
  1. A push to `main` that touches the agent (this folder, the management
     screens or the task catalog) starts the build
     `.github/workflows/agent-release.yml`. It builds the jar, gives it a
     version of its own (MAJOR.MINOR from `pom.xml`, PATCH = the build's run
     number, so every build is newer than the last), checks that it starts,
     and copies the jar and a small description to the server.
  2. The CRM checks the file against its SHA-256 and makes it the published
     version (it looks every 30 seconds). A version that is not newer, or a
     file that does not match, is ignored.
  3. Every computer is told at once. Between tasks it downloads the jar,
     checks size and SHA-256, runs its self-test, and restarts into it. The
     old jar is kept as `serpsquad-agent-prev.jar`.
  4. **Sync for update**, under Settings in the application, does step 3
     right now and says what it found: newest version already, installing,
     or why a version was not installed.
  A version that fails its self-test, or that cannot start, is not installed
  again by itself on that computer; Sync for update tries it once more. The
  application window reloads by itself when the new version is running.

The restart works however the agent was started: under `run.bat` / `run.sh`
(the shortcut and the macOS app use them) the script swaps the files; an
agent started straight from the jar starts that script itself before it
exits. It needs `serpsquad-agent.jar` to be in the agent's own folder.

A jar built by hand can still be published in the CRM under Devices &
updates.

Only one agent runs from a folder (`agent.lock`). Logs and screenshots older
than 45 days, and a log that has grown past 20 MB, are removed at start.

## Files on the computer

| Path | Contents |
|---|---|
| `config.json` | CRM address, device token, this computer's own Claude key if one was saved, Chrome path, dashboard port. Keep it private |
| `data/history.json` | The last tasks this computer ran, for the dashboard |
| `data/sync/current/` | Synced playbooks, `settings.json`, `tools.json`, `rev.txt` |
| `data/chrome-profiles/<Chrome ID>/`, `data/browser-profiles.json` | The signed-in Chrome profiles and their list |
| `data/chrome-web/` | The clean Chrome profile for the open web |
| `data/screenshots/` | A screenshot of the final browser state of each browser task |
| `data/checkpoints/` | Where the running task stands, so it can be carried on after a power cut. Emptied when the run ends |
| `data/signins.json`, `signins.key` | Saved sign-ins for SEO tools, encrypted, and the key that opens them (this user only) |
| `keys/` | The access key of each project's code repository (the private half never leaves this folder) |
| `work/<project>/files/` | The agent's own notes, inventories and drafts for the project |
| `work/<project>/drive/` | Copies of media it fetched from the project's Google Drive folders |
| `work/<project>/repo/` | Its working copy of the website's code |
| `logs/` | One log file per day. Keys and tokens are never logged |

## Build

```
npm run build:agent-ui     # in the CRM folder: packages the management screens and the demo catalog into agent/src/main/resources
cd agent
mvn package
```

`build:agent-ui` only needs to run again when `src/features/company/agentdash.jsx`
or `server/agentops-catalog.js` changed.

The result is `target/serpsquad-agent.jar` (about 50 MB, all dependencies
included). Released versions are built by GitHub Actions on every push that
touches the agent (see Updates): `pom.xml` only carries MAJOR.MINOR.0, and
the build numbers the PATCH. Raise MAJOR or MINOR in `pom.xml` for a larger
step; nothing else has to be remembered. `resources/manage/` and
`resources/catalog.json` are build output and are not in git.

Source layout (`src/main/java/com/serpsquad/agent/`):

| File | Role |
|---|---|
| `Main.java` | Commands, setup, launcher scripts |
| `Worker.java` | The always-on loop: check in, sync, update, claim, run; status for the dashboard |
| `LocalUi.java`, `resources/ui.html` | The application's screens, served on 127.0.0.1 |
| `AppWindow.java`, `Tray.java`, `Shortcuts.java` | The standalone window, the tray icon, launchers and shortcuts |
| `Demo.java` | The made-up agency shown by `demo`, including working settings |
| `resources/manage/`, `resources/catalog.json` | Built by `npm run build:agent-ui`: the CRM's management screens as one script and stylesheet, and the task catalog for the demo |
| `TaskRunner.java` | The Claude tool-use loop for one task, usage reporting |
| `ChatRunner.java` | Answers one chat message about one project |
| `ToolBox.java` | Tool definitions and dispatch |
| `Browser.java` | Chrome control over the DevTools connection on 127.0.0.1 |
| `SyncStore.java` | Verified, atomic playbook sync |
| `Updater.java` | Verified self-update and rollback bookkeeping |
| `CrmClient.java`, `Config.java`, `Json.java`, `Log.java` | Plumbing |

Claude is called through the official Anthropic Java SDK
(`com.anthropic:anthropic-java`): beta Messages endpoint, adaptive thinking,
effort from the CRM setting, prompt caching on the growing conversation, and
the server-side refusal fallback on Opus and Sonnet models.

## What runs where

The agent runs on this computer: the program, its Chrome windows, the files
it works with and the Git commands all use this computer's processor, memory
and disk (Settings, This computer shows them). The CRM server keeps only the
records: tasks, reports, limits, and what the agent knows about each project.
One task runs at a time on a computer, plus the chat; to work on several
projects at once, add a second computer.

## The project's working folder

Every project has a folder under `work/` on this computer. The tools
`files_list`, `file_read` and `file_write` let a task keep working material
there between runs (a page inventory, crawl results, drafts, notes on a
competitor) and read it before fetching anything again. The short facts go
into the project's status in the CRM; the detail stays here. Only text files
are written (Markdown, text, CSV, JSON, HTML, XML, YAML), up to 400,000
characters each and 300 MB per project. A path cannot leave the folder, and
text that contains something that looks like a password or a key is not
saved.

## Media sources (the Resources tab)

Photos are not uploaded to the CRM. The Photos tab of earlier versions is
gone: a project's photos are a folder or a Drive folder listed here. Photos
that were uploaded before stay usable (the `photos` tool, `browser_upload`
with `photo_id`) and are shown under the sources until they are removed.

In the CRM, Work setup, Resources lists where a project's pictures, video
and other media are: a folder on this computer, or a Google Drive folder
shared with "Anyone with the link". Each has a note on what it is for and
what it must not be used for, and every task is given those notes. The files
are never copied to the CRM.

- `resources_list` lists a source (pictures, video, audio and PDF; other
  files are left out), `resource_look` shows the agent one picture (JPG, PNG,
  GIF) so it can judge it before choosing it.
- `browser_upload` attaches a file from a source through a page's file
  chooser, in a run that may change things. `repo_add_media` copies one into
  a website's code.
- A folder is read on the computer it is on, and only inside that folder.
- A Drive folder is read without signing in, from this program and not from
  a signed-in Chrome window: the public folder page for the listing, the
  public download address for a file (up to 80 MB; Google Docs, Sheets and
  Slides are skipped). A folder that is not shared by link cannot be read.
  In the application on this computer the Resources tab has a **Choose
  folder** button that opens the computer's own folder window.

## A website's code repository

For a site built from code in a GitHub, GitLab or Bitbucket repository. In
the CRM, Work setup, Settings, choose **GitHub repository (custom code)**
under "Built with" in the Website box; the repository is then set up right
there: the address, the branch the site is built from, how the agent gets
in, and whether an approved change goes up for review (the default) or
straight to that branch. There are two ways in:

- **Access key** (below): a key pair made on this computer. Nothing secret
  is typed anywhere, it opens that one repository only, and it works with
  GitHub, GitLab and Bitbucket. The agent delivers a branch and gives the
  link to review it.
- **Access token** (GitHub only): a fine-grained token limited to that one
  repository, with *Contents: Read and write* and *Pull requests: Read and
  write*. It is pasted once in the CRM, which hands it to this computer at
  its next check-in and does not store it; here it is kept sealed in
  `data/signins.json` like the saved sign-ins. Git is given the token through
  its environment for that one call (never on a command line, never in the
  repository's settings), and the repository is reached over https, which
  also works where a network blocks SSH. After delivering the branch the
  program opens the pull request itself through GitHub's API, so a person
  only reviews and merges. If the pull request cannot be opened the branch
  is still delivered and the report gives the link to open it by hand.

- **The key.** This computer makes an ed25519 key pair for the project with
  `ssh-keygen` (`keys/repo-<project>`). Only the public half is sent to the
  CRM, where it is shown for a person to add to the repository as a deploy
  key with write access. The private half is used by Git itself and is never
  sent anywhere or given to Claude. **Test access** reads the repository and
  tries a push without changing anything.
- **Reading.** `repo_sync`, `repo_files`, `repo_read`, `repo_search` are
  given to every task of the project, so audits can read how the site is
  built.
- **Changing.** Only in the task type *Change the website's code
  (repository)*, and only after approval: `repo_write` (one file, complete
  content), `repo_add_media`, `repo_diff`, `repo_publish` (one commit, to
  `agent/<task id>` or to the working branch; never a forced push).
- **Limits built into the program.** It never runs anything from the
  repository; Git runs with hooks and the user's own settings switched off.
  It neither reads nor writes files that hold keys or server settings
  (`.env`, key files, `.git`, CI and workflow folders) and does not write
  what decides what is installed, built or deployed (`package.json`, lock
  files, Dockerfiles, `netlify.toml`, scripts and the like). Content that
  looks like a password or a key is not written.

Git and `ssh-keygen` have to be installed on the computer.

## SEO tools the agent may sign in to

Paid tools the agency has an account with are listed in the CRM (AI agent,
API setup): a name, the tool's address, the Chrome ID that is signed in to
it and what it is for. A task on a computer that has that Chrome ID can open
the tool with `seo_tool_open`; the browser tools then act in that window
until `seo_tool_close`. There the agent may search and filter, but a button
that would change the account, spend exports or credits, or send something
is not clicked, account and billing pages are not opened, and nothing is
uploaded.

**Saved sign-ins.** In this application, Settings, Saved sign-ins, a person
can save a tool's user name and password. They are encrypted on this
computer (AES-256-GCM, key in `signins.key`, readable by this user only),
never sent to the CRM, never given to Claude, never logged and never shown
again. When a tool has signed the agent out, the program types them into the
tool's sign-in page itself, and only when that page is on the site the
sign-in was saved for. It does not complete a captcha or a code: then, or
when the sign-in is not accepted, the agent is told that a person has to
sign in and carries on without the tool. Sign-ins for Google, Microsoft,
Apple, Facebook, payment sites and code hosts cannot be saved. This protects
the passwords from the file being read on its own; it does not protect them
from someone who can use this computer's user account.

## Blog publishing, and the month's trending services

**Blog publishing.** The task type *Write and publish blog posts* works in
the CRM's own Blogs & FAQs plan (Optimization Studio, Business Website). The
CRM tools `blog_plan`, `blog_plan_get`, `blog_plan_add`, `blog_plan_write`,
`blog_plan_publish` and `blog_plan_published` read the plan, add a topic,
save the written article into the plan (where the team sees it), publish it
and mark it. How a post reaches the website depends on the project: through
the CRM's website connector when the site is connected there (no browser
needed), through the repository for a site built from code, otherwise in the
site's editor in the browser. The rules are per kind of post (blog, news,
FAQ): how many a month, the website category, and whether a person approves
each one; they are enforced by the CRM (the task does not start when nothing
is allowed or the month is full, and a run asks a person when every kind
with room left needs approval). A tool that publishes runs only in a run
that may change things: this program tells the CRM so with every tool call.

**Trending services.** The task type *This month's trending services* works
out which of the client's own services are most in demand this month in its
area and writes or replaces one section for them on the page chosen in the
work setup, through the site's editor or its repository, after approval.

The website editor's sign-in can be handed over from the CRM like a tool's
(Settings, Website): the program then signs in to the editor itself when it
has been signed out.

## Google's data through the CRM, not the browser

Search Console, Analytics, rankings, the Maps geo-grid and index status reach
a task as CRM tools (`search_console`, `analytics`, `rank_table`, `geo_grid`,
`index_status`, `index_check`): the CRM's server asks Google's APIs with the
connection saved for the project and the agent sees a short table. That costs
far fewer tokens than reading the same numbers off a page, and no sign-in can
expire. `index_check` only checks pages the CRM does not record as indexed.
A browser on Search Console remains for what has no API (requesting indexing,
removals, manual actions): the task type *Search Console in the browser*.

## Google Drive without a public link

When the agency has connected Google Drive in the CRM (API setup, a Google
service account), the hello answer carries `driveApi: true` and `Drive.java`
asks the CRM for folder listings and files (`agent/drive`) instead of reading
Google's public folder pages. A media folder then only has to be shared with
the service account's address. Files up to 15 MB pass through the CRM;
larger ones belong in a folder on this computer. The account's key stays on
the CRM's server and never comes here. Reading documents and sheets
(`drive_read`) and saving working documents as Google sheets and documents
(`drive_save`) are CRM tools; they need nothing on this computer.

## Commands in the chat

In a project's chat the manager can tell the agent to change how it works:
a rule, a limit, a schedule, an approval, a list, a note, or a guide for
every project. The agent reads the settings (`work_settings`) and writes the
change down (`propose_settings`, `propose_guide`); the chat shows a card with
every value before and after, and a person presses **Apply**. The agent
cannot apply it, and those tools do not exist in a task, so nothing a web
page or a document says can change a setting.

## Privacy

Company-wide, under API setup (API keys in this application) in the management screens. This program takes
part in two ways: at every check-in it receives the agency's confidential
words and hides them (`Redact.confidential`) in every text that passes
through it, whatever their case, so they cannot reach Claude from a page and
cannot be typed into one; and with "basic web search and page reading" on it
uses the web tools whose results are not post-processed in Anthropic's code
sandbox. Everything else (what the agent may read from the CRM) is decided on
the CRM's server.

## Link building

The task type *Build links* works on the kinds of link the manager switched on
under Work setup, Offpage SEO, Link building: business listings, profile
backlinks, web 2.0 properties, article submissions, forum profiles and
replies, question and answer sites, social media commenting, image, video
and document sharing, social bookmarks, press releases, and three kinds the
agent only drafts for a person to send (sponsorships and resource pages,
unlinked mentions and broken links, journalist requests). Each kind has its
own number a month (or "the agent decides", at most twelve), its own
permission, and optionally a preferable list: with it on, only the listed
sites may be used.

The CRM tools are `link_plan` (what is allowed and left this month, the
sites, what was built already, the accounts asked for), `link_check` (may
this kind be made on this site), `log_link` (record a link; it counts
against the month and appears in the work report) and `account_request`.

What this program enforces, whatever a task says:

- **It never creates accounts.** The task works in one Chrome ID that holds
  the link-building accounts a person created and signed in to. Where a
  site has signed out and its sign-in was handed over from the CRM (Offpage
  SEO, Accounts for link building), the program signs in by itself; the
  mailbox the accounts are under is never opened and its password is never
  kept. That window
  may open any public site, but `Browser.wideRefusal` closes pages whose
  address is a sign-up page (`/register`, `/signup`, `/join`,
  `/create-account` and the like), before opening and again after every page
  change. Where an account is missing the agent calls `account_request` with
  everything a person needs to fill in, and carries on elsewhere.
- **Never mail, an account provider or money.** The same window refuses mail
  hosts, the big account providers' sign-in hosts and payment sites, on top
  of the pages no signed-in window ever shows (settings, security, billing).
- **No way round a site's checks.** The program does not complete captchas,
  phone or email verification; a task stops on that site and says so.
- **Without that Chrome ID the task does not start**, so it never falls back
  to a window without these limits.

Whether what is posted is useful and within a site's rules rests on the
playbook, the second check and, by default, a person's approval of every
link: each kind starts as "I approve each one before it is posted".

## Working documents (Excel and Word files)

In the CRM, a project's Report tab has **Working documents**: a folder on
this computer for what people open and work with. With it set, a task has
`work_file_save` (a **sheet** from rows, saved as `.xlsx`, or a **doc** from
simple Markdown, saved as `.docx`), `work_files_list` and `work_file_read`.
The files are plain Office Open XML written by this program (`Office.java`,
no library): Excel, Word, Google Sheets and Docs, Numbers, Pages and
LibreOffice open them. A sheet has a bold header that stays in view, numbers
are stored as numbers, and rows are added to an existing sheet with
`append`; an existing file is never replaced unless the agent says
`replace`. Text that looks like a password or a key is not saved, and a name
cannot leave the folder.

To have the documents in Google Drive, choose a folder inside **Google Drive
for desktop** on this computer: Drive does the syncing, and the Drive link
of that folder is kept in the CRM so the team can open it. The program does
not sign in to Drive itself; the signed-in Chrome windows are barred from
drive.google.com on purpose.

## An SMM management tool

On a project's Social Media tab an agency can set the tool it manages and
schedules social posts with (name, address, Chrome ID, the client's
workspace in it, notes). With it switched on, the task type *Publish to
social profiles* works in that tool's Chrome ID, limited to the tool's own
site, and the playbook tells the agent to work in exactly the client's
workspace and never to change accounts, plans or settings there. When the
tool asks for a sign-in, the program signs in itself with the sign-in saved
on this computer, as for the SEO tools.

A tool's sign-in can now also be entered in the CRM (under the SMM tool, and
under each SEO tool): the CRM holds it in memory only until this computer
takes it at its next check-in, then forgets it; this computer seals it in
`data/signins.json`. The CRM is told only which sites a sign-in is saved
for.

## Not built yet

- Several tasks at once on one computer.
- Creating native Google Sheets or Docs directly in Drive (it would need a
  Google sign-in for Drive, which the agent's windows are barred from, or an
  API route that Google only allows for Workspace shared drives or approved
  apps). Working documents in a Drive for desktop folder cover this.

- The agent changing the CRM's own code (planned as pull requests for review).
- Sending outreach email. It drafts; a person sends.
- Applying changes on a website and publishing to social profiles exist as
  task types but have never been run against real sites or platforms.
