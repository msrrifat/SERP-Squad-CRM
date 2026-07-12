/* ================= SERP Squad AI agent — the brain =================
   A scoped, data-grounded assistant. Every answer is computed from the SAME
   deterministic data layer the dashboards render (genSiteData / hydrate /
   genPageQueries), so the agent can never contradict the UI.

   Security model (enforced HERE, not in the UI):
   - ctx.allowed is the ONLY data the agent ever touches. Callers build it from
     the signed-in user's grants; projects outside it are invisible.
   - Mentions of non-permitted projects (ctx.deniedNames) get a hard refusal.
   - Credential/secret questions are refused before any other parsing.
   - The snapshot builder never receives company.apis, logins or passwords.

   PROD: swap composeAnswer() internals for a tool-calling loop against the
   AI provider configured in Company Settings → API settings. The tools stay
   exactly these functions; only the natural-language layer changes. */
import { genSiteData, hydrate } from "../../data/gen.js";
import { genPageQueries } from "../../lib/seo.js";
import { fmt, pctDelta } from "../../lib/format.jsx";
import { isoDate } from "../../lib/months.jsx";

/* ---------- safe per-project snapshot ---------- */
export function snapshot(client, project) {
  const kws = [...new Set(project.tracking.map((t) => t.keyword))];
  const data = genSiteData(project, kws, client.companyName);
  const tracking = project.tracking.map(hydrate);
  return { client, project, data, tracking, kws };
}

/* ---- PM lookups for edit commands ---- */
const findTask = (project, needle) => {
  const n = needle.toLowerCase().trim();
  for (const r of project.records || [])
    for (const c of r.checklists || [])
      for (const t of c.tasks)
        if (t.title.toLowerCase().includes(n)) return { record: r, checklist: c, task: t };
  return null;
};
const findRecord = (project, needle) =>
  (project.records || []).find((r) => r.name.toLowerCase().includes(needle.toLowerCase().trim()));
const parseDue = (q) => {
  const iso = q.match(/\d{4}-\d{2}-\d{2}/); if (iso) return iso[0];
  const now = new Date();
  const shift = (d) => isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + d));
  if (/tomorrow/.test(q)) return shift(1);
  if (/next week/.test(q)) return shift(7);
  if (/end of (the )?month/.test(q)) return isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const di = days.findIndex((d) => q.includes(d));
  if (di >= 0) { const dd = (di - now.getDay() + 7) % 7 || 7; return shift(dd); }
  return null;
};
const findMember = (names, needle) => names.find((n) => n.toLowerCase().includes(needle.toLowerCase().trim()));

const delta = (cur, prev) => {
  const d = pctDelta(cur, prev);
  return `${d >= 0 ? "up" : "down"} ${Math.abs(d).toFixed(0)}%`;
};
const monthsBack = (input) => {
  const m = input.match(/(\d+)\s*(?:mo|month)/);
  const n = m ? parseInt(m[1], 10) : 3;
  return Math.min(12, Math.max(1, n));
};

/* ---------- answer composers (each = one "tool") ---------- */
function overviewAnswer(s, cmp) {
  const { data, tracking, project } = s;
  const cur = data.months[12], prev = data.months[12 - cmp];
  const I = project.integrations;
  const profViews = (m) => (I.gbp ? m.gbp.views : 0) + (I.bing ? m.bing?.impressions || 0 : 0) + (I.apple ? m.apple?.views || 0 : 0);
  const top3 = tracking.filter((t) => t.stats.cur <= 3).length;
  const lines = [
    `**${project.name}** — this month vs ${cmp}mo ago:`,
    `• Profile views (all business profiles): ${fmt(profViews(cur))} (${delta(profViews(cur), profViews(prev))})`,
    `• Phone calls (GBP): ${fmt(cur.gbp.calls)} (${delta(cur.gbp.calls, prev.gbp.calls)})`,
  ];
  if (I.ga) lines.push(`• Website users: ${fmt(cur.ga.users)} (${delta(cur.ga.users, prev.ga.users)}) · Conversions: ${fmt(cur.ga.conversions)} (${delta(cur.ga.conversions, prev.ga.conversions)})`);
  if (I.gsc) lines.push(`• Search clicks: ${fmt(cur.gsc.clicks)} (${delta(cur.gsc.clicks, prev.gsc.clicks)}) from ${fmt(cur.gsc.impressions)} impressions`);
  if (tracking.length) lines.push(`• Rank tracking: ${tracking.length} keywords, ${top3} in Google's top 3`);
  const overdue = (project.records || []).reduce((n, r) => n + (r.completedAt ? 0 : (r.checklists || []).flatMap((c) => c.tasks).filter((t) => !t.completedAt && t.dueDate && t.dueDate < isoDate(new Date())).length), 0);
  if (overdue) lines.push(`• ⚠ ${overdue} overdue task${overdue > 1 ? "s" : ""} in Project Management`);
  return lines.join("\n");
}

function ranksAnswer(s) {
  const { tracking, project } = s;
  if (!tracking.length) return `${project.name} has no tracked keywords yet — add some in Website Rank Tracking.`;
  const sorted = [...tracking].sort((a, b) => a.stats.cur - b.stats.cur);
  const movers = [...tracking].map((t) => ({ t, ch: t.stats.d30 ?? t.stats.life ?? 0 })).sort((a, b) => Math.abs(b.ch) - Math.abs(a.ch));
  const up = movers.find((m) => m.ch > 0), down = movers.find((m) => m.ch < 0);
  const lines = [
    `**${project.name}** rank tracking (${tracking.length} keywords):`,
    ...sorted.slice(0, 5).map((t) => `• "${t.keyword}" (${t.city.city}, ${t.device}) — #${t.stats.cur}${t.stats.d30 != null ? ` (30d: ${t.stats.d30 > 0 ? "+" : ""}${t.stats.d30})` : ""}`),
  ];
  if (up) lines.push(`📈 Best mover: "${up.t.keyword}" improved ${up.ch} spots in 30 days.`);
  if (down) lines.push(`📉 Needs attention: "${down.t.keyword}" dropped ${Math.abs(down.ch)} spots — worth investigating.`);
  return lines.join("\n");
}

function opportunitiesAnswer(s) {
  const { project, kws, data } = s;
  const pages = project.opt?.website?.pages?.length
    ? project.opt.website.pages.map((p) => p.origUrl || p.url)
    : data.topPages.map((tp) => tp.page);
  const opps = pages.flatMap((url) => {
    const { queries } = genPageQueries(project.id, url, kws, project.name);
    return queries.filter((q) => q.position > 3 && q.position <= 25).map((q) => ({ url, ...q }));
  }).sort((a, b) => b.score - a.score).slice(0, 5);
  if (!opps.length) return `No striking-distance keywords found for ${project.name} right now.`;
  return [
    `**${project.name}** — top keyword opportunities (striking distance, positions 4–25):`,
    ...opps.map((o) => `• "${o.query}" on ${o.url} — #${o.position}, ${fmt(o.impressions)} impressions, only ${o.clicks} clicks`),
    `Open any page in Optimization Studio → Pages → **Live edit & re-optimize** to act on these.`,
  ].join("\n");
}

function compareAnswer(s, cmp) {
  const { data, project } = s;
  const cur = data.months[12], prev = data.months[12 - cmp];
  const rows = [
    ["Profile views (GBP)", cur.gbp.views, prev.gbp.views],
    ["Phone calls", cur.gbp.calls, prev.gbp.calls],
    ["Website users", cur.ga.users, prev.ga.users],
    ["Conversions", cur.ga.conversions, prev.ga.conversions],
    ["Search clicks", cur.gsc.clicks, prev.gsc.clicks],
  ];
  return [
    `**${project.name}** — ${data.months[12].label} vs ${data.months[12 - cmp].label}:`,
    ...rows.map(([label, c, p]) => `• ${label}: ${fmt(c)} vs ${fmt(p)} (${delta(c, p)})`),
  ].join("\n");
}

/* ---------- the monthly-plan generator (a real automation) ---------- */
export function buildMonthlyPlan(s, assignees) {
  const { project, kws, data } = s;
  const now = new Date();
  const month = now.toLocaleString("en", { month: "long", year: "numeric" });
  const endOfMonth = isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const mid = isoDate(new Date(now.getFullYear(), now.getMonth(), Math.min(now.getDate() + 14, 28)));
  const pages = project.opt?.website?.pages?.length
    ? project.opt.website.pages.map((p) => p.origUrl || p.url)
    : data.topPages.map((tp) => tp.page);
  const opps = pages.flatMap((url) => {
    const { queries } = genPageQueries(project.id, url, kws, project.name);
    return queries.filter((q) => q.position > 3 && q.position <= 25).map((q) => ({ url, ...q }));
  }).sort((a, b) => b.score - a.score);

  const pick = (i) => assignees[i % Math.max(1, assignees.length)] || assignees[0];
  let ti = 0;
  const task = (title, dueDate) => ({ id: "t" + Date.now() + ti, title, createdAt: Date.now(), dueDate, completedAt: null, assignees: assignees.length ? [pick(ti++)] : [] });

  const content = opps.slice(0, 3).map((o) =>
    task(`Re-optimize ${o.url} for "${o.query}" (#${o.position}, ${fmt(o.impressions)} impressions/mo)`, mid));
  const gbp = [];
  const g = project.opt?.gbp;
  if (!g?.photos?.length || g.photos.length < 3) gbp.push(task("Upload 5 fresh photos to Google Business Profile", mid));
  if (!(g?.posts || []).some((p) => Date.now() - p.createdAt < 14 * 864e5)) gbp.push(task("Publish 2 GBP updates (offer + service highlight)", endOfMonth));
  if ((g?.description || "").length < 400) gbp.push(task("Expand GBP description toward the 750-char limit with service keywords", mid));
  if (project.integrations.bing === false || project.integrations.apple === false) gbp.push(task("Connect remaining business profiles (Bing Places / Apple Maps)", endOfMonth));
  const tech = [
    task("Review Keyword opportunities table and queue next month's targets", endOfMonth),
    task("Check internal links on top 3 pages (partial-match anchors, no orphan pages)", endOfMonth),
  ];

  return {
    id: "r" + Date.now(),
    name: `AI Monthly Plan — ${month}`,
    createdAt: Date.now(), updatedAt: Date.now(), dueDate: endOfMonth, completedAt: null,
    assignees: [...new Set([...content, ...gbp, ...tech].flatMap((t) => t.assignees))],
    checklists: [
      { id: "cl" + Date.now() + "a", name: "Content & on-page (from Search Console data)", tasks: content },
      { id: "cl" + Date.now() + "b", name: "Business profiles", tasks: gbp },
      { id: "cl" + Date.now() + "c", name: "Technical & housekeeping", tasks: tech },
    ],
    comments: [], activity: [{ id: "pa" + Date.now(), ts: Date.now(), author: "AI Agent", text: "drafted this plan from live project data" }],
  };
}

/* ---------- the router ---------- */
export function agentReply(input, ctx) {
  const q = input.toLowerCase();

  /* 1. hard privacy wall — before anything else */
  if (/password|credential|api.?key|secret|token|login detail|\.p8|client secret/.test(q)) {
    return { text: "I can't help with credentials, passwords, API keys or any login details — I don't have access to them by design. An admin can manage those in Company Settings → API settings." };
  }

  /* 2. project resolution inside the permission scope */
  const hit = ctx.allowed.find(({ project, client }) =>
    q.includes(project.name.toLowerCase()) || q.includes(client.name.toLowerCase()));
  const deniedHit = !hit && (ctx.deniedNames || []).find((n) => q.includes(n.toLowerCase()));
  if (deniedHit) {
    return { text: `You don't have access to "${deniedHit}", so I can't discuss it. I can help with: ${ctx.allowed.map((a) => a.project.name).join(", ") || "no projects yet — ask an admin to grant AI agent access"}.` };
  }
  const scoped = hit || ctx.allowed.find((a) => a.project.id === ctx.activeProjectId) || ctx.allowed[0];
  if (!scoped) return { text: "You don't have AI agent access to any project yet — an admin can grant it per client in Client settings → Team → AI Agent." };
  const s = snapshot(scoped.client, scoped.project);
  const cmp = monthsBack(q);

  /* 3. intents */
  if (/^(hi|hello|hey)\b|help|what can you/.test(q)) {
    return { text: [
      `Hi${ctx.userName ? " " + ctx.userName.split(" ")[0] : ""}! I'm scoped to ${ctx.allowed.length} project${ctx.allowed.length > 1 ? "s" : ""}: ${ctx.allowed.map((a) => a.project.name).join(", ")}.`,
      "Ask me things like:",
      "• \"overview\" / \"how is Bright Smile doing\"",
      "• \"compare vs 6 months ago\"",
      "• \"keyword opportunities\" · \"rankings\"",
      ...(ctx.isClient ? [] : [
        "• \"create a monthly plan\" — I'll research the data and draft assigned tasks",
        "• \"generate a performance/work report\" — I'll write the executive summary too",
        "• edit tasks: \"mark <task> as done\", \"assign <task> to Sara\", \"due <task> to friday\", \"add task '<title>' to <record>\", \"comment on <record>: <text>\"",
      ]),
    ].join("\n") };
  }
  /* PM editing — strong patterns first so "add task 'write report'…" isn't read as a report ask */
  const pmDenied = ctx.isClient
    ? { text: "Task editing is handled by your agency team — I can give you performance info anytime." }
    : !ctx.canPlan ? { text: "You don't have task-management permission, so I can't edit records or tasks." } : null;
  const pmIds = (r, c, t) => ({ projectId: s.project.id, clientId: s.client.id, recordId: r.id, checklistId: c?.id, taskId: t?.id });

  let m;
  if ((m = input.match(/add (?:a )?task ["“']?([^"“”']+?)["“”']? to ["“']?([^"“”']+?)["“”']?$/i))) {
    if (pmDenied) return pmDenied;
    const rec = findRecord(s.project, m[2]);
    if (!rec) return { text: `I couldn't find a record matching "${m[2]}" in ${s.project.name}. Records: ${(s.project.records || []).map((r) => r.name).join(", ") || "none yet"}.` };
    const cl = rec.checklists[0];
    if (!cl) return { text: `"${rec.name}" has no checklists yet — open it in Project Management and add one first.` };
    return { text: `I'll add **"${m[1]}"** to **${rec.name}** → ${cl.name}.`,
      action: { type: "taskAdd", label: "Add task", title: m[1], ...pmIds(rec, cl) } };
  }
  if ((m = q.match(/assign (?:the )?(?:task )?["“']?([^"“”']+?)["“”']? to ([a-z .]+)$/))) {
    if (pmDenied) return pmDenied;
    const hit2 = findTask(s.project, m[1]);
    if (!hit2) return { text: `No task matching "${m[1]}" in ${s.project.name}.` };
    const member = findMember(ctx.assignableNames || [], m[2]);
    if (!member) return { text: `"${m[2]}" isn't an assignable team member on this project. Available: ${(ctx.assignableNames || []).join(", ") || "nobody yet"}.` };
    return { text: `I'll assign **"${hit2.task.title}"** (${hit2.record.name}) to **${member}**.`,
      action: { type: "taskAssign", label: `Assign to ${member}`, assignee: member, ...pmIds(hit2.record, hit2.checklist, hit2.task) } };
  }
  if ((m = q.match(/(?:set )?due (?:date )?(?:of |for )?["“']?([^"“”']+?)["“”']? (?:to|on) (.+)$/))) {
    if (pmDenied) return pmDenied;
    const hit2 = findTask(s.project, m[1]);
    if (!hit2) return { text: `No task matching "${m[1]}" in ${s.project.name}.` };
    const due = parseDue(m[2]);
    if (!due) return { text: `I couldn't parse "${m[2]}" as a date — try "tomorrow", "next week", "friday", "end of month" or YYYY-MM-DD.` };
    return { text: `I'll set **"${hit2.task.title}"** due **${due}**.`,
      action: { type: "taskDue", label: `Set due ${due}`, dueDate: due, ...pmIds(hit2.record, hit2.checklist, hit2.task) } };
  }
  if ((m = q.match(/(?:mark|complete|finish|check off) (?:the )?(?:task )?["“']?([^"“”']+?)["“”']?(?: as done| as completed?| done| complete)?$/)) && /mark|complete|finish|check/.test(q)) {
    if (pmDenied) return pmDenied;
    const hit2 = findTask(s.project, m[1]);
    if (!hit2) return { text: `No task matching "${m[1]}" in ${s.project.name}.` };
    if (hit2.task.completedAt) return { text: `"${hit2.task.title}" is already completed. Say "reopen ${hit2.task.title}" to undo it.` };
    return { text: `I'll mark **"${hit2.task.title}"** (${hit2.record.name} → ${hit2.checklist.name}) as complete.`,
      action: { type: "taskComplete", label: "Mark complete", ...pmIds(hit2.record, hit2.checklist, hit2.task) } };
  }
  if ((m = q.match(/reopen (?:the )?(?:task )?["“']?([^"“”']+?)["“”']?$/))) {
    if (pmDenied) return pmDenied;
    const hit2 = findTask(s.project, m[1]);
    if (!hit2) return { text: `No task matching "${m[1]}" in ${s.project.name}.` };
    return { text: `I'll reopen **"${hit2.task.title}"**.`,
      action: { type: "taskReopen", label: "Reopen task", ...pmIds(hit2.record, hit2.checklist, hit2.task) } };
  }
  if ((m = input.match(/comment (?:on )?["“']?([^"“”':,]+?)["“”']?\s*[:,]\s*(.+)$/i))) {
    if (pmDenied) return pmDenied;
    const rec = findRecord(s.project, m[1]);
    if (!rec) return { text: `No record matching "${m[1]}" in ${s.project.name}.` };
    return { text: `I'll comment on **${rec.name}**: "${m[2]}"`,
      action: { type: "recordComment", label: "Post comment", text: m[2], ...pmIds(rec) } };
  }

  if (/plan/.test(q)) {
    if (ctx.isClient) return { text: "Planning and task automation is handled by your agency team — ask them to run a monthly plan. I can give you performance info anytime." };
    if (!ctx.canPlan) return { text: "You don't have task-management permission, so I can't create plans for you." };
    const record = buildMonthlyPlan(s, ctx.assignableNames || []);
    const n = record.checklists.reduce((x, c) => x + c.tasks.length, 0);
    return {
      text: `I researched ${s.project.name}'s Search Console data, rankings and business profiles and drafted **${record.name}** — ${n} tasks in 3 checklists${record.assignees.length ? `, assigned across ${record.assignees.join(", ")}` : ""}. Preview:\n` +
        record.checklists.map((c) => `• ${c.name}: ${c.tasks.length} task${c.tasks.length > 1 ? "s" : ""}`).join("\n"),
      action: { type: "plan", label: "Create plan in Project Management", projectId: s.project.id, clientId: s.client.id, record },
    };
  }
  if (/report/.test(q)) {
    if (ctx.isClient) return { text: "You can print/download the current view with the Report button in your portal header (if enabled). Full report building is on the agency side." };
    if (!ctx.canReports) return { text: "You don't have report-builder permission, so I can't open it for you." };
    const template = /work/.test(q) ? "work" : "performance";
    const cur = s.data.months[12], prev = s.data.months[12 - cmp];
    const top3n = s.tracking.filter((t) => t.stats.cur <= 3).length;
    const aiSummary = template === "work"
      ? `All work delivered for ${s.project.name} this period: ${(s.project.records || []).length} records tracked, with ${(s.project.records || []).filter((r) => r.completedAt).length} completed. Detail per record, checklist and task follows.`
      : `${s.project.name} — ${s.data.months[12].label} vs ${s.data.months[12 - cmp].label}: profile views ${fmt(cur.gbp.views)} (${delta(cur.gbp.views, prev.gbp.views)}), website users ${fmt(cur.ga.users)} (${delta(cur.ga.users, prev.ga.users)}), conversions ${fmt(cur.ga.conversions)} (${delta(cur.ga.conversions, prev.ga.conversions)}), search clicks ${fmt(cur.gsc.clicks)} (${delta(cur.gsc.clicks, prev.gsc.clicks)}). ${top3n} of ${s.tracking.length} tracked keywords rank in Google's top 3.`;
    return {
      text: `I'll open the **${template} report** for **${s.project.name}**${template === "performance" ? ` comparing vs ${cmp} month${cmp > 1 ? "s" : ""} ago` : ""} — with an executive summary I wrote from the live numbers (fully editable in the builder):\n_"${aiSummary.slice(0, 180)}…"_`,
      action: { type: "report", label: `Open ${template} report`, template, cmp, aiSummary, projectId: s.project.id, clientId: s.client.id },
    };
  }
  if (/compare|vs\b|versus/.test(q)) return { text: compareAnswer(s, cmp) };
  if (/opportunit|striking|low.?hanging/.test(q)) return { text: opportunitiesAnswer(s) };
  if (/rank|keyword|serp|position/.test(q)) return { text: ranksAnswer(s) };
  if (/overview|how is|performance|status|summary|doing|info/.test(q)) return { text: overviewAnswer(s, cmp) };

  return { text: `I didn't catch that. Try "overview", "rankings", "keyword opportunities", "compare vs 6 months"${ctx.isClient ? "" : ", \"create a monthly plan\" or \"generate a report\""} — optionally with a project name (${ctx.allowed.map((a) => a.project.name).join(", ")}).` };
}
