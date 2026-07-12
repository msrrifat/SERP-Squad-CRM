/* Automated work-logging: Optimization Studio → Project Management.
   Every action performed in the studio is recorded as a completed task inside
   the current month's auto-created record ("Optimization Work — July 2026")
   under the project's "Monthly Tasks" list. One checklist per studio sidebar
   section; repeated work of the same type increments a count in the task name
   ("3 services added with service descriptions (Invisalign; Veneers, +1 more)")
   and the acting member is added as a task assignee — so the record doubles as
   a live who-did-what work report (and feeds Report builder record imports,
   which show completed tasks). */
import { createContext, useContext } from "react";

/* mirrors the Optimization Studio left-sidebar buttons, in order */
export const OPT_WORK_SECTIONS = [
  ["brandvoice", "Brand Voice"],
  ["gbp", "Google Business Profile"],
  ["bing", "Bing Places"],
  ["apple", "Apple Maps"],
  ["website", "Business Website"],
  ["listings", "Business Listings"],
  ["social", "Branding & Automation"],
  ["indexchk", "Index Checker"],
];
const SECTION_LABEL = Object.fromEntries(OPT_WORK_SECTIONS);

/* ---- the event catalog: proper text for every feature edit type ----
   one  = task name for a single occurrence
   many = phrase after the count for repeats ("2 services added …")     */
export const WORK_EVENTS = {
  /* business profiles (gbp / bing / apple share the generic ones) */
  infoSaved:          { one: "Business information updated & saved", many: "business information updates saved" },
  svcAdded:           { one: "Service added with service description", many: "services added with service descriptions" },
  svcUpdated:         { one: "Service updated (name, price or description)", many: "services updated (name, price or description)" },
  svcDeleted:         { one: "Service removed", many: "services removed" },
  catAdded:           { one: "Business category added", many: "business categories added" },
  catDeleted:         { one: "Business category removed", many: "business categories removed" },
  prodAdded:          { one: "Product published with description", many: "products published with descriptions" },
  prodUpdated:        { one: "Product updated", many: "products updated" },
  prodDeleted:        { one: "Product removed", many: "products removed" },
  postPublished:      { one: "Post/update published", many: "posts/updates published" },
  postScheduled:      { one: "Post/update scheduled", many: "posts/updates scheduled" },
  postDeleted:        { one: "Post removed", many: "posts removed" },
  photosUploaded:     { one: "Photo uploaded to the profile", many: "photos uploaded to the profile" },
  photoDeleted:       { one: "Photo removed from the profile", many: "photos removed from the profile" },
  reviewReplied:      { one: "Customer review replied", many: "customer reviews replied" },
  reviewReplyUpdated: { one: "Review reply edited", many: "review replies edited" },
  reviewReplyDeleted: { one: "Review reply removed", many: "review replies removed" },
  profileConnected:   { one: "Business profile connected", many: "business profiles connected" },
  showcasePublished:  { one: "Showcase published to the place card", many: "showcases published to the place card" },
  showcaseDeleted:    { one: "Showcase removed", many: "showcases removed" },

  /* business website */
  webConnected:       { one: "Website connector configured", many: "website connector configurations" },
  pixelVerified:      { one: "Optimization pixel installed & verified", many: "pixel verifications" },
  wpConnected:        { one: "WordPress publishing credential connected", many: "publishing credentials connected" },
  siteCrawled:        { one: "Site crawled & pages imported", many: "site crawls with pages imported" },
  pageOptimized:      { one: "Page optimized (meta, headings or content)", many: "pages optimized (meta, headings or content)" },
  changesDeployed:    { one: "Page changes deployed to the live site", many: "page-change deploys to the live site" },
  blogPublished:      { one: "Blog post written & published", many: "blog posts written & published" },
  blogScheduled:      { one: "Blog post scheduled", many: "blog posts scheduled" },
  blogDrafted:        { one: "Blog post drafted", many: "blog posts drafted" },
  blogUpdated:        { one: "Blog post updated", many: "blog posts updated" },
  blogDeleted:        { one: "Blog post removed", many: "blog posts removed" },
  blogAutoPublished:  { one: "Scheduled blog post auto-published", many: "scheduled blog posts auto-published" },
  mediaSynced:        { one: "Media library synced from the site", many: "media library syncs" },
  indexRechecked:     { one: "Google index status rechecked", many: "Google index rechecks" },
  archGenerated:      { one: "Website architecture generated", many: "website architectures generated" },
  serpScanned:        { one: "Competitor SERP scan run", many: "competitor SERP scans run" },
  contentWritten:     { one: "Page content researched & written", many: "pages of content researched & written" },
  siteDeployed:       { one: "Full website built & deployed from the site map", many: "full website deploys from the site map" },
  pagePublished:      { one: "Single page published from the site map", many: "single pages published from the site map" },

  /* brand voice */
  bvUpdated:          { one: "Brand voice guidelines updated", many: "brand voice guideline updates" },
  bvFileAdded:        { one: "Brand guideline file added", many: "brand guideline files added" },

  /* listings / branding / index checker */
  citationScan:       { one: "Citation & NAP audit scan run", many: "citation & NAP audit scans run" },
  socialConnected:    { one: "Social profile connected", many: "social profiles connected" },
  socialPosted:       { one: "Social post published", many: "social posts published" },
  socialScheduled:    { one: "Social post scheduled", many: "social posts scheduled" },
  socialInfoUpdated:  { one: "Social page info updated", many: "social page info updates" },
  brandedSite:        { one: "Branded Web 2.0 site provisioned", many: "branded Web 2.0 sites provisioned" },
  campaignLaunched:   { one: "Content campaign launched", many: "content campaigns launched" },
  indexCheckRun:      { one: "Google index check run", many: "Google index checks run" },
};

/* ---- month helpers (event-time, not render-time) ---- */
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const workMonthTag = (now) => { const d = new Date(now); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const monthName = (now) => new Date(now).toLocaleString("en", { month: "long", year: "numeric" });
const monthEndIso = (now) => { const d = new Date(now); return isoDay(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };

const wuid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const taskTitle = (ev, count, details) => {
  const base = count === 1 ? ev.one : `${count} ${ev.many}`;
  const ds = (details || []).filter(Boolean);
  if (!ds.length) return base;
  let s = ds.slice(-3).join("; ");
  if (s.length > 60) s = s.slice(0, 57) + "…";
  return `${base} (${s}${ds.length > 3 ? `, +${ds.length - 3} more` : ""})`;
};

/* record + "Monthly Tasks" list for the month of `now` — created if missing.
   Returns a project patch ({records, lists}) or null when nothing changed. */
export function ensureMonthlyWorkRecord(project, teamNames, now = Date.now()) {
  const tag = workMonthTag(now);
  const records = project.records || [];
  if (records.some((r) => r.autoKey === `optwork-${tag}`)) return null;
  const lists = project.lists || [];
  let list = lists.find((l) => /monthly tasks/i.test(l.name));
  const nextLists = list ? lists : [...lists, (list = { id: wuid("l"), name: "Monthly Tasks" })];
  const record = {
    id: wuid("r"), autoKey: `optwork-${tag}`, auto: true, listId: list.id,
    name: `Optimization Work — ${monthName(now)}`,
    createdAt: now, updatedAt: now, dueDate: monthEndIso(now), completedAt: null,
    assignees: [...new Set(teamNames)],
    checklists: OPT_WORK_SECTIONS.map(([key, label]) => ({ id: wuid("cl"), sectionKey: key, name: label, tasks: [] })),
    comments: [],
    activity: [{ id: wuid("pa"), ts: now, author: "Automation", text: "created this record — Optimization Studio work is logged here automatically" }],
  };
  return { records: [record, ...records], lists: nextLists };
}

/* log one unit of work → project patch. Aggregates by event key + section:
   the matching task's count goes up, the actor joins its assignees, and the
   task stays marked completed (the work already happened). */
export function applyOptWork(project, { section, key, count = 1, detail = "", member = "You (Owner)", teamNames = [], now = Date.now() }) {
  const ev = WORK_EVENTS[key];
  if (!ev) return null;
  detail = String(detail || "").trim();
  if (detail.length > 48) detail = detail.slice(0, 48).replace(/\s+\S*$/, "") + "…"; // word-boundary trim
  const ensured = ensureMonthlyWorkRecord(project, teamNames, now);
  const records = ensured ? ensured.records : project.records || [];
  const tag = workMonthTag(now);
  const sectionLabel = SECTION_LABEL[section] || section;

  const nextRecords = records.map((r) => {
    if (r.autoKey !== `optwork-${tag}`) return r;
    /* older auto-records may predate a newly added sidebar section */
    let checklists = r.checklists.some((c) => c.sectionKey === section || c.name === sectionLabel)
      ? r.checklists
      : [...r.checklists, { id: wuid("cl"), sectionKey: section, name: sectionLabel, tasks: [] }];
    checklists = checklists.map((c) => {
      if (!(c.sectionKey === section || c.name === sectionLabel)) return c;
      const existing = c.tasks.find((t) => t.workKey === key);
      const tasks = existing
        ? c.tasks.map((t) => {
            if (t.workKey !== key) return t;
            const workCount = (t.workCount || 1) + count;
            const workDetails = [...(t.workDetails || []), detail].filter(Boolean).slice(-8);
            return {
              ...t, workCount, workDetails,
              title: taskTitle(ev, workCount, workDetails),
              completedAt: t.completedAt || now,
              assignees: t.assignees.includes(member) ? t.assignees : [...t.assignees, member],
            };
          })
        : [...c.tasks, {
            id: wuid("t"), workKey: key, workCount: count, workDetails: detail ? [detail] : [],
            title: taskTitle(ev, count, detail ? [detail] : []),
            createdAt: now, dueDate: null, completedAt: now, assignees: [member],
          }];
      return { ...c, tasks };
    });
    return {
      ...r, checklists, updatedAt: now,
      assignees: r.assignees.includes(member) ? r.assignees : [...r.assignees, member],
      activity: [
        { id: wuid("pa"), ts: now, author: member, text: `logged "${count > 1 ? `${count} ${ev.many}` : ev.one}"${detail ? ` (${detail.slice(0, 60)})` : ""} in ${sectionLabel}` },
        ...(r.activity || []),
      ].slice(0, 60),
    };
  });
  return { records: nextRecords, ...(ensured?.lists ? { lists: ensured.lists } : {}) };
}

/* context so deeply nested studio components (page editors, deploy modals,
   review panels…) can log work without prop-threading */
export const WorkCtx = createContext(null);
export const useWork = () => useContext(WorkCtx); // (sectionKey, eventKey, {count, detail}) => void, or null outside the studio
