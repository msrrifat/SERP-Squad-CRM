/* =====================================================================
   WORKSPACE MERGE — what happens when two sessions have both moved on.

   The whole workspace is saved as one document, so two tabs (or two people,
   or a phone and a laptop) editing at once means one save is based on a copy
   that has since been overtaken. Writing it would erase the other side; that
   is how manually added records and tasks disappeared.

   Refusing the write stops the erasure but strands the work: the tab keeps
   its changes in memory, saves nothing, and everything since load is lost the
   moment it reloads — the same disappearance, just slower.

   So instead of choosing a winner, the two versions are merged:

     • start from the SERVER copy, so nothing anyone else saved is dropped
     • add back anything this tab has that the server lacks — clients,
       projects, records, checklists, tasks, templates, saved reports
     • where both sides changed the SAME item, keep the one edited last

   Deletions lose to additions. That is deliberate: re-deleting something is
   trivial and obvious, whereas silently losing an hour of typed-in tasks is
   neither. Collections are keyed by id, so an item that both sides merely
   read is never duplicated.
   ===================================================================== */

const byId = (arr) => new Map((arr || []).filter((x) => x && x.id != null).map((x) => [x.id, x]));
const ts = (x) => Math.max(+(x?.updatedAt || 0), +(x?.savedAt || 0), +(x?.createdAt || 0), +(x?.at || 0)) || 0;

/* union two id-keyed lists: server order first, local-only items appended,
   items present in both resolved by `pick` (default: whichever is newer) */
function unionById(server, local, pick) {
  const s = byId(server), l = byId(local);
  const resolve = pick || ((a, b) => (ts(b) > ts(a) ? b : a));
  const out = [];
  const seen = new Set();
  (server || []).forEach((item) => {
    if (item?.id == null) { out.push(item); return; }
    seen.add(item.id);
    const other = l.get(item.id);
    out.push(other ? resolve(item, other) : item);
  });
  (local || []).forEach((item) => {
    if (item?.id == null || seen.has(item.id)) return;
    if (!s.has(item.id)) out.push(item);        // added in this tab — keep it
  });
  return out;
}

/* a checklist keeps the union of its tasks; a task edited on both sides
   resolves to the later edit */
const mergeChecklist = (a, b) => ({
  ...(ts(b) > ts(a) ? b : a),
  tasks: unionById(a.tasks, b.tasks),
});

/* a record keeps the union of its checklists, comments and activity */
const mergeRecord = (a, b) => {
  const base = ts(b) > ts(a) ? { ...b } : { ...a };
  return {
    ...base,
    checklists: unionById(a.checklists, b.checklists, mergeChecklist),
    comments: unionById(a.comments, b.comments),
    activity: unionById(a.activity, b.activity).slice(0, 80),
    updatedAt: Math.max(ts(a), ts(b)) || base.updatedAt,
  };
};

/* meeting notes: { memberId: [meetings] } — union each member's list by id,
   newer updatedAt wins per meeting, so notes typed in one tab survive a save
   landing from another */
const mergeNotesMap = (a, b) => {
  const out = { ...(a || {}) };
  for (const [member, list] of Object.entries(b || {})) {
    out[member] = out[member] ? unionById(out[member], list) : list;
  }
  return out;
};

const mergeProject = (a, b) => {
  /* scalar/config fields follow the side edited last, so a settings change is
     not undone; the collections below are unions regardless */
  const base = ts(b) > ts(a) ? { ...a, ...b } : { ...b, ...a };
  return {
    ...base,
    records: unionById(a.records, b.records, mergeRecord),
    lists: unionById(a.lists, b.lists),
    tracking: unionById(a.tracking, b.tracking),
    chatMsgs: unionById(a.chatMsgs, b.chatMsgs),
    meetingNotes: mergeNotesMap(a.meetingNotes, b.meetingNotes),
  };
};

const mergeClient = (a, b) => {
  const base = ts(b) > ts(a) ? { ...a, ...b } : { ...b, ...a };
  return {
    ...base,
    projects: unionById(a.projects, b.projects, mergeProject),
    savedReports: unionById(a.savedReports, b.savedReports),
  };
};

const mergeCompany = (a, b) => {
  const base = { ...a, ...b };   // company settings: last write wins per field
  return {
    ...base,
    team: unionById(a.team, b.team),
    /* saved reports live on the company, keyed by project — union them like any
       other collection, or a report saved in one session is dropped when
       another session's save is merged in */
    savedReports: unionById(a.savedReports, b.savedReports),
    reportTemplates: unionById(a.reportTemplates, b.reportTemplates),
    recordTemplates: unionById(a.recordTemplates, b.recordTemplates),
    chatGroups: unionById(a.chatGroups, b.chatGroups),
    activity: unionById(a.activity, b.activity).slice(0, 400),
    meetingNotes: mergeNotesMap(a.meetingNotes, b.meetingNotes),
  };
};

/* server = what is stored now, local = what this tab holds */
export function mergeWorkspace(server, local) {
  const s = server || {}, l = local || {};
  return {
    ...s, ...l,
    company: mergeCompany(s.company || {}, l.company || {}),
    clients: unionById(s.clients, l.clients, mergeClient),
  };
}

/* what the merge recovered, for an honest message to the user */
export function mergeSummary(server, local, merged) {
  const countTasks = (st) => (st.clients || []).reduce((n, c) => n
    + (c.projects || []).reduce((m, p) => m
      + (p.records || []).reduce((k, r) => k
        + (r.checklists || []).reduce((j, cl) => j + (cl.tasks || []).length, 0), 0), 0), 0);
  const countRecords = (st) => (st.clients || []).reduce((n, c) => n
    + (c.projects || []).reduce((m, p) => m + (p.records || []).length, 0), 0);
  return {
    tasks: countTasks(merged) - countTasks(server),
    records: countRecords(merged) - countRecords(server),
    keptFromOthers: countTasks(server) - Math.min(countTasks(server), countTasks(local)),
  };
}
