/* ================= DataForSEO client =================
   Pure module — no React/browser dependencies, so BOTH the frontend and the
   Node API server (server/index.js) import these same functions. */

export function dataForSeoAuthHeader(company) {
  const raw = `${company.dfs.login}:${company.dfs.password}`;
  return "Basic " + (typeof btoa === "function" ? btoa(raw) : Buffer.from(raw).toString("base64"));
}
export function buildSerpTask(entry) {
  return {
    keyword: entry.keyword,
    location_name: `${entry.city.city},${entry.city.region},${entry.city.country}`,
    language_code: "en",
    device: entry.device.toLowerCase(),            // "desktop" | "mobile"
    os: entry.device === "Mobile" ? "android" : "windows",
    depth: 100,                                    // scan top 100 organic results
  };
}
export function buildSerpBatches(dueEntries) {
  // DataForSEO routes by engine-specific endpoint (/v3/serp/{engine}/organic/task_post)
  // and accepts up to 100 task objects per POST — so group by engine, then chunk.
  // Returns [{ engine: "google"|"bing", tasks: [...≤100] }, ...] covering EVERY due entry.
  const byEngine = {};
  dueEntries.forEach((e) => {
    const engine = (e.engine || "Google").toLowerCase();
    (byEngine[engine] = byEngine[engine] || []).push(buildSerpTask(e));
  });
  return Object.entries(byEngine).flatMap(([engine, tasks]) => {
    const batches = [];
    for (let i = 0; i < tasks.length; i += 100) batches.push({ engine, tasks: tasks.slice(i, i + 100) });
    return batches;
  });
}

export async function rerunNow(entryIds, dfsCredentials) {
  // In the browser this call goes to YOUR backend proxy — never expose
  // DataForSEO credentials to the client directly.
  const res = await fetch("/api/rerun", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entryIds }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { updated: [{ id, positions: [...], url }] }
}
export function parseSerpRank(taskResult, domain) {
  const items = taskResult?.result?.[0]?.items || [];
  const clean = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
  const matches = (it) => {
    const hd = (it.domain || (it.url || "").replace(/^https?:\/\//, "")).replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
    return hd && (hd === clean || hd.endsWith("." + clean)); // subdomains rank for the site too
  };
  const hit = items.find((it) => it.type === "organic" && matches(it));
  /* local map pack (3-pack) — SAME response, zero extra cost: the business's
     position among the local_pack items, matched by its website domain */
  const pack = items.filter((it) => it.type === "local_pack");
  const mapIdx = pack.findIndex(matches);
  return {
    position: hit ? hit.rank_absolute : null,          // rank_absolute = true SERP position; null = not in top 100
    url: hit ? hit.url : null,
    mapPos: mapIdx >= 0 ? mapIdx + 1 : null,           // 1–3 inside the pack; null = not in the pack
    packShown: pack.length > 0,                        // whether Google showed a map pack for this query at all
  };
}

