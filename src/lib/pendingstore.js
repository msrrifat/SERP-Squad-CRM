/* =====================================================================
   UNSAVED-WORK SAFETY NET — a durable local copy of what the server has
   not confirmed yet.

   Every path that loses data ends the same way: the browser holds work the
   server never accepted (a paused save, a failed request, a refused write,
   a tab closed mid-save), then the tab reloads and the in-memory workspace
   is gone. The server's revision guards stop bad writes; they cannot stop
   a tab from simply forgetting.

   So while a save is pending or failing, the workspace this tab holds is
   written to IndexedDB (the report archive excluded — it is served lazily
   and can be tens of megabytes). On the next load, a copy newer than the
   server's revision is merged back in and saved, so a day's work survives a
   crash, a closed laptop or a bad network. Cleared the moment a save is
   confirmed. localStorage is not used: a workspace runs to ~20 MB.
   ===================================================================== */
const DB = "ss-pending", STORE = "ws";
const open = () => new Promise((res, rej) => {
  if (typeof indexedDB === "undefined") return rej(new Error("no idb"));
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = async (mode, fn) => {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode); const st = t.store || t.objectStore(STORE);
    const out = fn(st);
    t.oncomplete = () => { db.close(); res(out && "result" in out ? out.result : undefined); };
    t.onerror = () => { db.close(); rej(t.error); };
  });
};
const LAZY = ["savedReports", "reportTemplates"];
const slim = (state) => {
  const company = { ...(state.company || {}) };
  LAZY.forEach((k) => delete company[k]);
  return { company, clients: state.clients || [] };
};

/* record this tab's unconfirmed workspace (keyed per signed-in user) */
export async function stashPending(userKey, state, rev) {
  try { await tx("readwrite", (st) => st.put({ at: Date.now(), rev: rev ?? null, state: slim(state) }, userKey)); } catch { /* storage unavailable — nothing to do */ }
}
export async function readPending(userKey) {
  try { return (await tx("readonly", (st) => st.get(userKey))) || null; } catch { return null; }
}
export async function clearPending(userKey) {
  try { await tx("readwrite", (st) => st.delete(userKey)); } catch { /* ok */ }
}
