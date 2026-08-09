/* =====================================================================
   DOMAIN SPLIT — one workspace in memory, separate documents on disk.

   Everything used to live in a single app-state.json. Two consequences, both
   of which have cost real work:

     • adding one task in Project management re-sent the entire clients tree
       (11 MB) because that tree was the smallest thing anyone could write;
     • any save carried every tool's data, so a bug in one tool's write path
       could — and did — overwrite another tool's.

   The app's in-memory shape is NOT changed by this file. Every screen still
   reads project.records, project.tracking, project.website exactly as before.
   The split happens only at the storage boundary: `splitWorkspace` breaks a
   workspace into per-domain documents that are stored and written
   independently, and `joinWorkspace` puts them back together on load.

   THE SAFETY PROPERTY, on which all of this rests:

       joinWorkspace(splitWorkspace(x)) deep-equals x

   for ANY workspace, including one holding keys this file has never heard of.
   That is why the split is total: keys are routed by an explicit map, and
   anything unrecognised goes to `core` rather than being dropped. A key added
   to a project next year lands in core untouched instead of disappearing.
   ===================================================================== */

/* project-level keys that belong to a tool. Everything else — id, name,
   demoMode, accent, logo, google, teamAccess, integrations, widgets, and
   whatever gets added later — stays in core, which is small and shared. */
export const PROJECT_DOMAINS = {
  pm:           ["records", "lists", "chatMsgs", "chatReads", "wiki"],
  performance:  ["tracking", "geoGrid"],
  optimization: ["website", "opt", "listings", "gbp", "bing", "apple"],
  ads:          ["ads", "adsAccounts", "campaigns"],
};
/* company-level keys that belong to a tool */
export const COMPANY_DOMAINS = {
  reports: ["savedReports", "reportTemplates"],
};

export const DOMAINS = ["core", "pm", "performance", "optimization", "ads", "reports"];

const projectKeyDomain = (() => {
  const m = new Map();
  for (const [d, keys] of Object.entries(PROJECT_DOMAINS)) for (const k of keys) m.set(k, d);
  return m;
})();
const companyKeyDomain = (() => {
  const m = new Map();
  for (const [d, keys] of Object.entries(COMPANY_DOMAINS)) for (const k of keys) m.set(k, d);
  return m;
})();

/* Break a workspace into { core, pm, performance, optimization, ads, reports }.

   Tool documents are keyed by project id (or are flat, for company-level
   ones), so a Project-management save touches pm[projectId] and nothing else.
   Core keeps the skeleton — which clients exist, which projects they have, and
   every field that is not a tool's — so the tree can be rebuilt. */
export function splitWorkspace(state) {
  const s = state || {};
  const out = { core: { ...s }, pm: {}, performance: {}, optimization: {}, ads: {}, reports: {} };

  /* only rebuild what was actually there — a workspace with no `company` key
     must not come back with an invented empty one */
  if (!("company" in s) && !("clients" in s)) return out;

  if ("company" in s) {
    out.core.company = {};
    for (const [k, v] of Object.entries(s.company || {})) {
      const d = companyKeyDomain.get(k);
      if (d) out[d][k] = v; else out.core.company[k] = v;
    }
  }
  if (!("clients" in s)) return out;

  out.core.clients = (s.clients || []).map((c) => ({
    ...c,
    projects: (c.projects || []).map((p) => {
      const core = {};
      for (const [k, v] of Object.entries(p || {})) {
        const d = projectKeyDomain.get(k);
        if (!d) { core[k] = v; continue; }
        /* `id` is needed to put it back; a project with no id cannot be split
           apart safely, so its tool keys stay in core where they came from */
        if (p.id == null) { core[k] = v; continue; }
        (out[d][p.id] ||= {})[k] = v;
      }
      return core;
    }),
  }));
  return out;
}

/* Rebuild the workspace from its documents. Missing documents are tolerated:
   a domain that has never been written simply contributes nothing, which is
   what a fresh workspace looks like. */
export function joinWorkspace(docs) {
  const d = docs || {};
  const core = d.core || {};
  const state = { ...core };

  if ("company" in core) {
    state.company = { ...(core.company || {}) };
    for (const dom of Object.keys(COMPANY_DOMAINS)) {
      for (const [k, v] of Object.entries(d[dom] || {})) state.company[k] = v;
    }
  }
  if (!("clients" in core)) return state;

  state.clients = (core.clients || []).map((c) => ({
    ...c,
    projects: (c.projects || []).map((p) => {
      const merged = { ...p };
      if (p?.id == null) return merged;
      for (const dom of Object.keys(PROJECT_DOMAINS)) {
        const doc = (d[dom] || {})[p.id];
        if (doc) Object.assign(merged, doc);
      }
      return merged;
    }),
  }));
  return state;
}

/* Which domains a project-level key belongs to — used by callers that want to
   know what a given edit will actually write. */
export const domainOfProjectKey = (k) => projectKeyDomain.get(k) || "core";
export const domainOfCompanyKey = (k) => companyKeyDomain.get(k) || "core";
