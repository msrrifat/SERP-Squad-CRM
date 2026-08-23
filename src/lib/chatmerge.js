/* =====================================================================
   CHAT MERGE RULES — shared by the API server and the browser.

   Chat is append-only and multi-writer: two people post into the same
   thread from two tabs, a client posts from the portal while the owner's
   autosave is in flight. Every write path therefore UNIONS messages by id
   instead of replacing a thread wholesale, so no write can ever erase a
   message another session already stored.

     messages  — union by id; on a collision the copy with the newer `rts`
                 (reaction revision) wins, field by field. Sorted by ts,
                 capped to the newest CHAT_CAP.
     reads     — per reader, the later timestamp.

   `stripChatDocs` removes every chat field from the per-tool documents so
   the browser's "did anything change?" fingerprints ignore chat entirely —
   a message goes out through /api/chat/* the instant it is sent and must
   never light up the "Saving changes" banner meant for real edits.
   ===================================================================== */

export const CHAT_CAP = 1000;

export function mergeMsgList(stored, incoming) {
  const a = Array.isArray(stored) ? stored : [];
  const b = Array.isArray(incoming) ? incoming : [];
  if (!b.length) return a;
  if (!a.length) return b.slice().sort((x, y) => (x.ts || 0) - (y.ts || 0)).slice(-CHAT_CAP);
  const byId = new Map();
  for (const m of a) if (m && m.id) byId.set(m.id, m);
  let changed = false;
  for (const m of b) {
    if (!m || !m.id) continue;
    const cur = byId.get(m.id);
    if (!cur) { byId.set(m.id, m); changed = true; continue; }
    if (cur === m) continue;
    const next = (m.rts || 0) >= (cur.rts || 0) ? { ...cur, ...m } : { ...m, ...cur };
    if (JSON.stringify(next) !== JSON.stringify(cur)) { byId.set(m.id, next); changed = true; }
  }
  if (!changed) return a;
  return [...byId.values()].sort((x, y) => (x.ts || 0) - (y.ts || 0)).slice(-CHAT_CAP);
}

export function mergeReadMap(stored, incoming) {
  const out = { ...(stored || {}) };
  let changed = false;
  for (const [u, ts] of Object.entries(incoming || {})) {
    if ((+ts || 0) > (+out[u] || 0)) { out[u] = +ts; changed = true; }
  }
  return changed ? out : (stored || out);
}

const mergeThread = (stored, incoming) => {
  const s = stored || {}, i = incoming || {};
  return { ...s, ...i, msgs: mergeMsgList(s.msgs, i.msgs), reads: mergeReadMap(s.reads, i.reads) };
};

/* Fold the chat a store already holds into an incoming per-tool document
   set, so writing `docs` cannot lose a message. Only the chat fields are
   touched; everything else in `docs` is written exactly as sent. */
export function mergeChatDocs(docs, storedDocs) {
  const d = docs || {}, s = storedDocs || {};
  const out = { ...d };
  if (d.core && s.core) {
    const core = { ...d.core };
    if (core.company || s.core.company) {
      const co = { ...(core.company || {}) }, sc = s.core.company || {};
      const dms = { ...(co.dms || {}) };
      for (const [k, msgs] of Object.entries(sc.dms || {})) dms[k] = mergeMsgList(msgs, dms[k]);
      co.dms = dms;
      const dmReads = { ...(co.dmReads || {}) };
      for (const [k, r] of Object.entries(sc.dmReads || {})) dmReads[k] = mergeReadMap(r, dmReads[k]);
      co.dmReads = dmReads;
      if (Array.isArray(co.chatGroups) || Array.isArray(sc.chatGroups)) {
        const storedG = new Map((sc.chatGroups || []).map((g) => [g?.id, g]));
        co.chatGroups = (co.chatGroups || []).map((g) => (storedG.has(g?.id) ? mergeThread(storedG.get(g.id), g) : g));
      }
      core.company = co;
    }
    if (Array.isArray(core.clients)) {
      const storedC = new Map((s.core.clients || []).map((c) => [c?.id, c]));
      core.clients = core.clients.map((c) => {
        const sc = storedC.get(c?.id);
        if (!sc) return c;
        const next = { ...c };
        if (c.ownerChat || sc.ownerChat) next.ownerChat = mergeThread(sc.ownerChat, c.ownerChat);
        if (c.memberChats || sc.memberChats) {
          const mc = { ...(c.memberChats || {}) };
          for (const [mid, ch] of Object.entries(sc.memberChats || {})) mc[mid] = mergeThread(ch, mc[mid]);
          next.memberChats = mc;
        }
        return next;
      });
    }
    out.core = core;
  }
  if (d.pm && s.pm) {
    const pm = { ...d.pm };
    for (const [pid, doc] of Object.entries(pm)) {
      const sp = s.pm[pid];
      if (!sp || !doc) continue;
      if (!("chatMsgs" in doc) && !("chatMsgs" in sp) && !("chatReads" in doc) && !("chatReads" in sp)) continue;
      pm[pid] = { ...doc, chatMsgs: mergeMsgList(sp.chatMsgs, doc.chatMsgs), chatReads: mergeReadMap(sp.chatReads, doc.chatReads) };
    }
    out.pm = pm;
  }
  return out;
}

/* the same documents with every chat field removed (for change detection) */
export function stripChatDocs(docs) {
  const d = docs || {};
  const out = { ...d };
  if (d.core) {
    const core = { ...d.core };
    if (core.company) {
      const { dms, dmReads, chatGroups, ...rest } = core.company;
      core.company = { ...rest, chatGroups: (chatGroups || []).map(({ msgs, reads, ...g }) => g) };
    }
    if (Array.isArray(core.clients)) core.clients = core.clients.map(({ ownerChat, memberChats, ...c }) => c);
    out.core = core;
  }
  if (d.pm) {
    const pm = {};
    for (const [pid, doc] of Object.entries(d.pm)) {
      if (!doc) { pm[pid] = doc; continue; }
      const { chatMsgs, chatReads, ...rest } = doc;
      pm[pid] = rest;
    }
    out.pm = pm;
  }
  return out;
}
