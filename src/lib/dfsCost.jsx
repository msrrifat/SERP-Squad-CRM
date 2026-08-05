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
export const DFS_RATES = {
  organic:      { rate: 0.003,  label: "Google organic live-advanced" },    // index checks, citations, competitor scans
  bing:         { rate: 0.003,  label: "Bing organic live-advanced" },
  maps:         { rate: 0.0035, label: "Google Maps live-advanced" },
  organicQueue: { rate: 0.0006, label: "Google organic standard queue" },   // rank re-checks
  bingQueue:    { rate: 0.0006, label: "Bing organic standard queue" },
  mapsQueue:    { rate: 0.0006, label: "Google Maps standard queue" },      // geo-grid points
};

/* DataForSEO bills "per each SERP containing up to 10 results", so a task
   asking for 100 results costs TEN times one asking for 10. The estimate used
   to price every rank check as a single SERP while the tracker asked for depth
   100 — which is why the bill came in far above the figure on the button. */
export const depthUnits = (depth) => Math.max(1, Math.ceil((+depth || 10) / 10));
export const dfsCost = (requests, kind = "organic", depth = 10) =>
  requests * depthUnits(depth) * (DFS_RATES[kind]?.rate || DFS_RATES.organic.rate);
export const fmtDfsCost = (v) => (v > 0 && v < 0.01 ? "$" + v.toFixed(4) : "$" + v.toFixed(2));

/* the chip that sits next to every run button */
export function DfsCostChip({ requests, kind = "organic", depth = 10, className = "" }) {
  if (!requests || requests <= 0) return null;
  const r = DFS_RATES[kind] || DFS_RATES.organic;
  const units = depthUnits(depth);
  return (
    <span className={"ll-mono inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9.5px] font-bold text-amber-700 " + className}
      title={`Estimated DataForSEO cost: ${requests.toLocaleString()} request${requests === 1 ? "" : "s"}${units > 1 ? ` × ${units} (top ${units * 10} results — DataForSEO bills per 10)` : ""} × $${r.rate} (${r.label}). Verify the exact rate on your DataForSEO plan — priority queues cost more.`}>
      ⛁ {requests.toLocaleString()} req ≈ {fmtDfsCost(dfsCost(requests, kind, depth))}
    </span>
  );
}
