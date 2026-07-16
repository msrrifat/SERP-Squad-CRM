/* ================= background scan jobs =================
   Module-level job manager: rank-tracking and geo-grid scans run HERE, not
   inside view components — navigating to another page (or another project)
   never interrupts a scan. Views subscribe to render progress/results, and
   the app shell shows a global "scan running" chip while any job is live.
   (Scans are client-driven requests; a full browser reload still cancels
   an in-flight run — jobs survive navigation, not page reloads.) */
import { useEffect, useReducer } from "react";

const jobs = new Map(); // key → { key, label, status, progress, startedAt, finishedAt, error, summary }
const subs = new Set();
const emit = () => subs.forEach((fn) => fn());

/* start a job unless one with the same key is already running.
   runner(setProgress) is an async fn — its closures must apply results via
   functional state updates so they land even after the view unmounted. */
export function startScanJob(key, label, runner) {
  if (jobs.get(key)?.status === "running") return false;
  const job = { key, label, status: "running", progress: null, startedAt: Date.now(), finishedAt: null, error: null, summary: null };
  jobs.set(key, job);
  emit();
  (async () => {
    try {
      job.summary = (await runner((progress) => { job.progress = progress; emit(); })) || null;
      job.status = "done";
    } catch (e) {
      job.status = "error";
      job.error = String(e?.message || e);
    }
    job.finishedAt = Date.now();
    emit();
  })();
  return true;
}

export const getScanJob = (key) => jobs.get(key) || null;
export const clearScanJob = (key) => { jobs.delete(key); emit(); };
export const runningScanJobs = () => [...jobs.values()].filter((j) => j.status === "running");

/* subscribe a component to job changes; returns a lookup + the running list */
export function useScanJobs() {
  const [, force] = useReducer((n) => n + 1, 0);
  useEffect(() => { subs.add(force); return () => subs.delete(force); }, []);
  return { get: getScanJob, running: runningScanJobs() };
}
