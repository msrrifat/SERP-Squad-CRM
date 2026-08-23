/* =====================================================================
   TEAM ↔ PROJECT SYNC

   A project's membership is DERIVED: a member is on a project when their
   own assignment list names it OR the project's Team grants (teamAccess)
   name them — and Project management's people list, assignee pickers and
   channel rosters all read that. Taking someone off a project, or off the
   team entirely, therefore has to drop the grants and chat memberships
   that still name them, or they keep surfacing as a channel member and
   an assignable person. Their WORK is never touched — see pruneProject.

   Both helpers are pure and return the SAME reference when nothing
   changed, so callers can hand the result straight to a state setter.
   ===================================================================== */

const without = (arr, name) => (Array.isArray(arr) && arr.includes(name) ? arr.filter((x) => x !== name) : arr);

/* one project, minus the member's access grant.

   Deliberately NOT touched: records, checklists, tasks, comments, activity —
   including the member's name on anything assigned to them. Work someone
   did or was given stays exactly as it was; only the person leaves. */
function pruneProject(p, member) {
  if (!p.teamAccess || !(member.id in p.teamAccess)) return p;
  const { [member.id]: _drop, ...rest } = p.teamAccess;
  return { ...p, teamAccess: rest };
}

/* Remove a member from projects. `projectIds` = null means everywhere (the
   member left the team): their 3-way client-chat assignments go too. */
export function pruneMemberFromClients(clients, member, projectIds = null) {
  if (!member) return clients;
  const all = projectIds == null;
  const ids = all ? null : new Set(projectIds);
  let changed = false;
  const next = (clients || []).map((c) => {
    let cc = c;
    const projects = (c.projects || []).map((p) => (all || ids.has(p.id) ? pruneProject(p, member) : p));
    if (projects.some((p, i) => p !== c.projects[i])) cc = { ...cc, projects };
    if (all && Array.isArray(c.chatMembers) && c.chatMembers.includes(member.id)) cc = { ...cc, chatMembers: c.chatMembers.filter((x) => x !== member.id) };
    if (cc !== c) changed = true;
    return cc;
  });
  return changed ? next : clients;
}

/* Company-level traces of a member who left the team: group-chat rooms. */
export function pruneMemberFromCompany(company, member) {
  if (!member || !Array.isArray(company?.chatGroups)) return company;
  let changed = false;
  const chatGroups = company.chatGroups.map((g) => {
    const m = without(g.members, member.name);
    if (m === g.members) return g;
    changed = true; return { ...g, members: m };
  });
  return changed ? { ...company, chatGroups } : company;
}

/* project ids a member is assigned to, given the full project list */
export const assignedIds = (member, allProjectIds) =>
  member?.projects === "all" ? [...allProjectIds] : (Array.isArray(member?.projects) ? member.projects : []);
