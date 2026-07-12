import React from "react";

/* =====================================================================
   DataForSEO COST CALCULATOR — one shared rate table so every action
   that spends DataForSEO credits shows its price BEFORE you run it.

   Rates are the standard live-advanced list prices; verify against your
   plan at app.dataforseo.com → Billing (priority queues cost more).
   ===================================================================== */
export const DFS_RATES = {
  organic: { rate: 0.003,  label: "Google organic live-advanced" },   // rank re-checks, index checks, citations, competitor scans
  bing:    { rate: 0.003,  label: "Bing organic live-advanced" },
  maps:    { rate: 0.0035, label: "Google Maps live-advanced" },      // geo-grid points
};

export const dfsCost = (requests, kind = "organic") => requests * (DFS_RATES[kind]?.rate || DFS_RATES.organic.rate);
export const fmtDfsCost = (v) => (v > 0 && v < 0.01 ? "$" + v.toFixed(4) : "$" + v.toFixed(2));

/* the chip that sits next to every run button */
export function DfsCostChip({ requests, kind = "organic", className = "" }) {
  if (!requests || requests <= 0) return null;
  const r = DFS_RATES[kind] || DFS_RATES.organic;
  return (
    <span className={"ll-mono inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9.5px] font-bold text-amber-700 " + className}
      title={`Estimated DataForSEO cost: ${requests.toLocaleString()} request${requests === 1 ? "" : "s"} × $${r.rate}/req (${r.label}). Verify the exact rate on your DataForSEO plan — priority queues cost more.`}>
      ⛁ {requests.toLocaleString()} req ≈ {fmtDfsCost(dfsCost(requests, kind))}
    </span>
  );
}
