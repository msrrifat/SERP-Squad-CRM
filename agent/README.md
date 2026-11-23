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
server with `AGENTOPS_DFS_MCP_URL`.

## What a task can use

| Tool | Where it runs | Notes |
|---|---|---|
| CRM tools (project brief, rank table and history, rank compare, Search Console, geo-grid, past reports, remember, change journal, suggest task) | CRM server | Defined by the server and synced, so new ones need no new jar. Always limited to the task's own project |
| Web search and page fetch | Anthropic's servers | Only for task types marked "Web research" |
| Live SEO data (`seo_data_*`: search results, keyword volumes, competitors' keywords, backlinks, on-page checks, listings) | CRM server, which asks DataForSEO's MCP server | Only when switched on in the CRM. Paid per request, inside the project's and the company's spend limits |
| Browser (open, read, click, type, scroll, back) | This computer's Chrome | Pages are read as text with numbered elements |

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

- It never types on a page that has a password field or on Google's sign-in
  pages, and it never types into a password field. A person signs in.
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

## Not built yet

- The agent changing the CRM's own code (planned as pull requests for review).
- Sending outreach email. It drafts; a person sends.
- Uploading photos to a Business Profile.
- Applying changes on a website and publishing to social profiles exist as
  task types but have never been run against real sites or platforms.
