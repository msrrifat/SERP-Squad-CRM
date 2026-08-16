import React from "react";

/* =====================================================================
   DataForSEO COST CALCULATOR — one shared rate table so every action
   that spends DataForSEO credits shows its price BEFORE you run it.

   Rank tracking (organic re-checks + geo-grid) runs through the STANDARD
   TASK QUEUE — $0.0006/SERP, results within ~1–5 min. Tools that need an
   instant answer (index checks, citations, competitor discovery) stay on
   the live endpoints at live-advanced list prices. Verify against your
   plan at app.dataforseo.com → Billing (high-priority queues cost more).
   ===================================================================== */
/* `rate` is the first 10 results, `extra` each additional 10. DataForSEO does
   NOT charge the full rate per page: the first page costs the headline price
   and the rest are cheaper. Read straight off the account's own task costs
   (v3/serp/id_list reports the real price of every task):

     live  depth 20  = 0.002  + 1×0.0015  = 0.0035   ✓ observed
     live  depth 100 = 0.002  + 9×0.0015  = 0.0155   ✓ observed
     queue depth 100 = 0.0006 + 9×0.00045 = 0.00465  ✓ observed
     queue depth 80  = 0.0006 + 7×0.00045 = 0.00375  ✓ observed (short SERP)

   Pricing every page at the headline rate — what this file used to do — put
   the queued rank check at $0.006 when it really costs $0.00465, so the
   estimate ran ~29% high even before anything went wrong. */
/* `page` is the BILLING UNIT — and it differs by engine, which is exactly the
   trap this table exists to avoid. Organic/Bing are billed per SERP page of
   TEN results (measured on the live account: queue depth-100 = 0.0006 +
   9x0.00045 = $0.00465). Google Maps is billed "per each SERP containing up
   to 100 results" (its own task_post doc; measured: live depth-100 = $0.002
   flat) — so a Maps scan at depth 50 and depth 100 cost the SAME, and pricing
   Maps per-10 like organic would overstate a depth-100 grid tenfold. */
export const DFS_RATES = {
  organic:      { rate: 0.002,  extra: 0.0015,  page: 10,  label: "Google organic live-advanced" },
  bing:         { rate: 0.002,  extra: 0.0015,  page: 10,  label: "Bing organic live-advanced" },
  maps:         { rate: 0.002,  extra: 0.002,   page: 100, label: "Google Maps live-advanced" },
  organicQueue: { rate: 0.0006, extra: 0.00045, page: 10,  label: "Google organic standard queue" },
  bingQueue:    { rate: 0.0006, extra: 0.00045, page: 10,  label: "Bing organic standard queue" },
  mapsQueue:    { rate: 0.0006, extra: 0.0006,  page: 100, label: "Google Maps standard queue" },
};

/* how many billing pages a depth asks for, in THIS engine's page size */
export const depthUnits = (depth, kind = "organic") => {
  const page = (DFS_RATES[kind] || DFS_RATES.organic).page || 10;
  return Math.max(1, Math.ceil((+depth || page) / page));
};
/* what ONE task at this depth costs */
export const taskCost = (kind = "organic", depth) => {
  const r = DFS_RATES[kind] || DFS_RATES.organic;
  return r.rate + (depthUnits(depth ?? r.page, kind) - 1) * (r.extra ?? r.rate);
};
export const dfsCost = (requests, kind = "organic", depth) => requests * taskCost(kind, depth);
export const fmtDfsCost = (v) => (v > 0 && v < 0.01 ? "$" + v.toFixed(4) : "$" + v.toFixed(2));

/* the chip that sits next to every run button */
export function DfsCostChip({ requests, kind = "organic", depth, className = "" }) {
  if (!requests || requests <= 0) return null;
  const r = DFS_RATES[kind] || DFS_RATES.organic;
  const units = depthUnits(depth ?? r.page, kind);
  return (
    <span className={"ll-mono inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9.5px] font-bold text-amber-700 " + className}
      title={`Estimated DataForSEO cost: ${requests.toLocaleString()} request${requests === 1 ? "" : "s"} × $${taskCost(kind, depth).toFixed(5)} (${r.label}${units > 1 ? `, top ${units * (r.page || 10)} results: $${r.rate} for the first ${r.page || 10} + ${units - 1} × $${r.extra ?? r.rate}` : ""}). A keyword DataForSEO has run recently cannot be re-queued and is re-checked live, which costs more.`}>
      ⛁ {requests.toLocaleString()} req ≈ {fmtDfsCost(dfsCost(requests, kind, depth))}
    </span>
  );
}
