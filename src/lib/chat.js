/* =====================================================================
   CHAT LANE (browser side)

   Messages do not wait for the workspace autosave. A send updates local
   state for an instant bubble AND posts to /api/chat/send in the same tick;
   every tab polls /api/chat/since for what others wrote, so unread badges
   move while the page is open and nobody reloads to see a reply.

   Three pieces:
     chatSend / chatReact / chatRead — fire the request, mark the change as
       chat-only (so App's autosave never shows "Saving changes…" for it) and
       track per-message delivery status for the thread UI.
     useMsgStatus — subscription to that delivery status, no prop plumbing.
     useChatSync — the poller; hands batches to App to fold into state.
   ===================================================================== */
import { useEffect, useRef, useSyncExternalStore } from "react";
import { mergeMsgList, mergeReadMap } from "./chatmerge.js";

/* ---- "this state change is chat only" ---------------------------------
   App's autosave effect reads and clears this flag: when set, the change
   still goes through the normal (fingerprint-based) save pass, which will
   find nothing to write, but the banner never lights up. */
let chatLocal = false;
export const markChatLocal = () => { chatLocal = true; };
export const consumeChatLocal = () => { const v = chatLocal; chatLocal = false; return v; };

/* ---- per-message delivery status --------------------------------------- */
const status = new Map();          // id → { state: "pending"|"failed", retry? }
const listeners = new Set();
let snapshot = { v: 0, get: (id) => status.get(id) };
const notify = () => { snapshot = { v: snapshot.v + 1, get: (id) => status.get(id) }; listeners.forEach((l) => l()); };
const setStatus = (id, s) => { if (s) status.set(id, s); else status.delete(id); notify(); };
export function useMsgStatus() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => snapshot);
}

/* stable key for a thread descriptor — the same string the server uses */
export const threadKey = (t, me) => !t ? "" : t.kind === "dm" ? `dm:${t.key || [me, t.other].sort().join("|")}` : t.kind === "group" ? `group:${t.groupId}`
  : t.kind === "project" ? `project:${t.clientId}:${t.projectId}` : t.kind === "owner" ? `owner:${t.clientId}` : `trio:${t.clientId}:${t.memberId}`;

/* ---- who is typing, per thread (ephemeral, refreshed by every poll) ---- */
let typingSnap = { v: 0, map: new Map() };
const typingListeners = new Set();
const setTyping = (list) => {
  const map = new Map((list || []).map((t) => [t.key, t.names || []]));
  typingSnap = { v: typingSnap.v + 1, map };
  typingListeners.forEach((l) => l());
};
export function useTyping(key) {
  const snap = useSyncExternalStore((l) => { typingListeners.add(l); return () => typingListeners.delete(l); }, () => typingSnap);
  return key ? (snap.map.get(key) || []) : [];
}
const lastTyped = new Map();
/* throttled: at most one ping per thread every 2.5 s while the user types */
export function chatTyping(thread, me) {
  if (!thread || !localStorage.getItem("ss_token")) return;
  const key = threadKey(thread, me), now = Date.now();
  if (now - (lastTyped.get(key) || 0) < 2500) return;
  lastTyped.set(key, now);
  post("/api/chat/typing", { thread }).catch(() => {});
}

const tokenHeaders = () => ({ "Content-Type": "application/json", "X-SS-Token": localStorage.getItem("ss_token") || "" });
async function post(path, body) {
  const r = await fetch(path, { method: "POST", headers: tokenHeaders(), body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.detail || `HTTP ${r.status}`), { status: r.status, body: j });
  return j;
}

export const newMsgId = (prefix = "m") => prefix + Date.now() + Math.random().toString(36).slice(2, 6);

/* send: returns a promise but callers need not await it */
export function chatSend(thread, msg) {
  markChatLocal();
  if (!localStorage.getItem("ss_token")) return Promise.resolve(null); // demo / no server session
  setStatus(msg.id, { state: "pending" });
  return post("/api/chat/send", { thread, msg: { id: msg.id, text: msg.text, replyTo: msg.replyTo || null } })
    .then((j) => { setStatus(msg.id, null); return j; })
    .catch((e) => {
      console.warn("[chat] send failed:", e?.message);
      setStatus(msg.id, { state: "failed", retry: () => chatSend(thread, msg) });
      return null;
    });
}
export function chatReact(thread, msgId, emoji, on) {
  markChatLocal();
  if (!localStorage.getItem("ss_token")) return Promise.resolve(null);
  return post("/api/chat/react", { thread, msgId, emoji, ...(typeof on === "boolean" ? { on } : {}) })
    .catch((e) => { console.warn("[chat] reaction failed:", e?.message); return null; });
}
export function chatRead(thread) {
  markChatLocal();
  if (!localStorage.getItem("ss_token")) return Promise.resolve(null);
  return post("/api/chat/read", { thread }).catch(() => null);
}

/* ---- polling ----------------------------------------------------------
   3 s while the tab is visible, 20 s in the background (so a desktop
   notification still arrives), plus an immediate pull on focus. `since`
   is the server clock from the previous answer, so nothing is missed
   across clock skew; overlap is harmless — everything is a union. */
export function useChatSync({ enabled, onBatch, visibleMs = 3000, hiddenMs = 20000 }) {
  const cb = useRef(onBatch); cb.current = onBatch;
  const since = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    const token = localStorage.getItem("ss_token");
    if (!token) return;
    if (!since.current) since.current = Date.now() - 2 * 60 * 1000;
    let stopped = false, timer = null, inflight = false;
    const tick = async () => {
      if (stopped || inflight) return;
      inflight = true;
      try {
        const r = await fetch(`/api/chat/since?ts=${since.current}`, { headers: { "X-SS-Token": token }, signal: AbortSignal.timeout(15000) });
        if (r.ok) {
          const j = await r.json();
          if (j && Number.isFinite(+j.now)) {
            if (j.threads?.length) cb.current?.(j.threads);
            setTyping(j.typing);
            since.current = +j.now;
          }
        }
      } catch { /* transient — next tick retries */ }
      inflight = false;
      if (!stopped) { clearTimeout(timer); timer = setTimeout(tick, document.hidden ? hiddenMs : visibleMs); }
    };
    const onVisible = () => { if (!document.hidden) { clearTimeout(timer); tick(); } };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    tick();
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible); };
  }, [enabled, visibleMs, hiddenMs]);
}

/* ---- folding a batch into state -----------------------------------------
   Pure helpers: given the current company/clients, return the next ones
   (same reference when nothing changed) and how many messages are NEW for
   `me` — used for the notification. */
const threadMerge = (cur, t) => ({ ...(cur || {}), msgs: mergeMsgList(cur?.msgs, t.msgs), reads: mergeReadMap(cur?.reads, t.reads) });
const isNew = (m, have, me, readTs) => m && m.author !== me && !have.has(m.id) && (+m.ts || 0) > readTs;

export function applyChatBatch(threads, { company, clients, me }) {
  let co = company, cl = clients, fresh = 0;
  const fromMsgs = (cur, t) => {
    const have = new Set((cur?.msgs || []).map((m) => m?.id));
    const readTs = +((cur?.reads || {})[me]) || 0;
    fresh += (t.msgs || []).filter((m) => isNew(m, have, me, readTs)).length;
  };
  for (const t of threads || []) {
    if (t.kind === "dm") {
      const cur = { msgs: (co.dms || {})[t.key] || [], reads: (co.dmReads || {})[t.key] || {} };
      fromMsgs(cur, t);
      const next = threadMerge(cur, t);
      if (next.msgs !== cur.msgs || next.reads !== cur.reads) co = { ...co, dms: { ...(co.dms || {}), [t.key]: next.msgs }, dmReads: { ...(co.dmReads || {}), [t.key]: next.reads } };
    } else if (t.kind === "group") {
      const groups = co.chatGroups || [];
      const g = groups.find((x) => x.id === t.groupId);
      if (!g) {
        if (t.meta) co = { ...co, chatGroups: [...groups, { ...t.meta, msgs: mergeMsgList([], t.msgs), reads: t.reads || {} }] };
        fresh += (t.msgs || []).filter((m) => m && m.author !== me).length;
        continue;
      }
      fromMsgs(g, t);
      const next = threadMerge(g, t);
      const meta = t.meta && (t.meta.updatedAt || 0) >= (g.updatedAt || 0) ? t.meta : null;
      if (meta || next.msgs !== g.msgs || next.reads !== g.reads) co = { ...co, chatGroups: groups.map((x) => (x.id === g.id ? { ...x, ...(meta || {}), msgs: next.msgs, reads: next.reads } : x)) };
    } else {
      const ci = cl.findIndex((c) => c.id === t.clientId);
      if (ci < 0) continue;
      const c = cl[ci];
      let nc = null;
      if (t.kind === "owner") {
        fromMsgs(c.ownerChat, t);
        const next = threadMerge(c.ownerChat, t);
        if (next.msgs !== c.ownerChat?.msgs || next.reads !== c.ownerChat?.reads) nc = { ...c, ownerChat: next };
      } else if (t.kind === "trio") {
        const cur = (c.memberChats || {})[t.memberId];
        fromMsgs(cur, t);
        const next = threadMerge(cur, t);
        if (next.msgs !== cur?.msgs || next.reads !== cur?.reads) nc = { ...c, memberChats: { ...(c.memberChats || {}), [t.memberId]: next } };
      } else if (t.kind === "project") {
        const pi = (c.projects || []).findIndex((p) => p.id === t.projectId);
        if (pi < 0) continue;
        const p = c.projects[pi];
        const cur = { msgs: p.chatMsgs || [], reads: p.chatReads || {} };
        fromMsgs(cur, t);
        const next = threadMerge(cur, t);
        if (next.msgs !== cur.msgs || next.reads !== cur.reads) {
          nc = { ...c, projects: c.projects.map((x) => (x.id === p.id ? { ...x, chatMsgs: next.msgs, chatReads: next.reads } : x)) };
        }
      }
      if (nc) { cl = cl.slice(); cl[ci] = nc; }
    }
  }
  return { company: co, clients: cl, fresh };
}

/* ---- notifications ------------------------------------------------------ */
let permissionAsked = false;
export function ensureNotifyPermission() {
  if (permissionAsked || typeof Notification === "undefined" || Notification.permission !== "default") return;
  permissionAsked = true;
  const ask = () => { try { Notification.requestPermission(); } catch { /* unsupported */ } window.removeEventListener("pointerdown", ask); };
  window.addEventListener("pointerdown", ask, { once: true });
}
export function notifyNewMessages(n, brand = "SERP Squad") {
  if (!n) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (!document.hidden && document.hasFocus()) return;   // they're looking at it already
  try {
    const note = new Notification(brand, { body: n === 1 ? "New message" : `${n} new messages`, tag: "ss-chat", renotify: true });
    note.onclick = () => { window.focus(); note.close(); };
  } catch { /* some browsers throw outside a secure context */ }
}

/* "(3) Title" while unread messages wait */
export function useTitleBadge(count) {
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = count > 0 ? `(${count}) ${base}` : base;
  }, [count]);
}
