/* Writes the task catalog and default playbooks as JSON for the agent
   application's demo mode (agent/src/main/resources/catalog.json). */
import { writeFileSync, mkdirSync } from "node:fs";
import { CATALOG, DEFAULT_PLAYBOOKS, MODELS } from "../server/agentops-catalog.js";
const out = {
  catalog: CATALOG.map((c) => ({ key: c.key, label: c.label, group: c.group, desc: c.desc, needs: c.needs || [], write: !!c.write, agencyOnly: !!c.agencyOnly, defaults: c.defaults })),
  models: MODELS,
  playbooks: DEFAULT_PLAYBOOKS,
};
mkdirSync(new URL("../agent/src/main/resources/", import.meta.url), { recursive: true });
writeFileSync(new URL("../agent/src/main/resources/catalog.json", import.meta.url), JSON.stringify(out));
console.log("catalog.json:", out.catalog.length, "task types,", Object.keys(out.playbooks).length, "playbooks");
