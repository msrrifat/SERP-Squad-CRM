/* The AI agent's management screens, built as one script for the agent's own
   application (agent/src/main/resources/manage/). The application's local
   server forwards /api/agentops/* to the CRM with the device's token; this
   bundle is the same code the CRM shows under Company Settings → AI agent.
   Build: npm run build:agent-ui */
import React from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { AgentOpsSection } from "../features/company/agentdash.jsx";
import { DialogHost } from "../ui/primitives.jsx";

const ACCENT = "#1F2A44";
window.SerpSquadManage = {
  mount(el, opts) {
    const root = createRoot(el);
    const render = (o) => root.render(
      <div style={{ fontFamily: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>
        <AgentOpsSection company={{ accent: ACCENT }} app={o} />
        <DialogHost accent={ACCENT} />
      </div>
    );
    render(opts);
    return { set: render, unmount: () => root.unmount() };
  },
};
