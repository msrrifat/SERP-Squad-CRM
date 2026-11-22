package com.serpsquad.agent;

import com.anthropic.core.JsonValue;
import com.anthropic.models.beta.messages.BetaTool;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * The tools one task may use. CRM tools are defined by the server (synced) and
 * proxied to it, so new ones need no new agent version. Local tools are the
 * browser and the two ways a task ends: finish_task and request_approval.
 */
final class ToolBox {
    static final class Outcome {
        final String text;
        final boolean error;

        Outcome(String text, boolean error) { this.text = text; this.error = error; }
    }

    private final JsonNode task;
    private final CrmClient crm;
    private final SyncStore store;
    private final Browser browser;          // null when this task type has none
    private final boolean browserReadOnly;  // prepare phase of a task that needs approval
    private final boolean canRequestApproval;
    private final Path shotsDir;
    private final List<String> crmToolNames = new ArrayList<>();

    JsonNode finished;      // set by finish_task
    JsonNode approval;      // set by request_approval

    ToolBox(JsonNode task, CrmClient crm, SyncStore store, Browser browser, Path shotsDir) {
        this.task = task;
        this.crm = crm;
        this.store = store;
        this.browser = browser;
        this.shotsDir = shotsDir;
        boolean write = task.path("write").asBoolean(false);
        boolean ask = "ask".equals(task.path("approval").asText(""));
        boolean execute = "execute".equals(task.path("phase").asText(""));
        this.canRequestApproval = write && ask && !execute;
        this.browserReadOnly = canRequestApproval;
    }

    boolean canRequestApproval() { return canRequestApproval; }

    boolean hasBrowser() { return browser != null; }

    static BetaTool tool(String name, String description, JsonNode schema) {
        BetaTool.InputSchema.Properties.Builder props = BetaTool.InputSchema.Properties.builder();
        Iterator<Map.Entry<String, JsonNode>> it = schema.path("properties").fields();
        while (it.hasNext()) {
            Map.Entry<String, JsonNode> e = it.next();
            props.putAdditionalProperty(e.getKey(), JsonValue.fromJsonNode(e.getValue()));
        }
        List<String> required = new ArrayList<>();
        for (JsonNode r : schema.path("required")) required.add(r.asText());
        return BetaTool.builder().name(name).description(description)
            .inputSchema(BetaTool.InputSchema.builder().properties(props.build()).required(required).build())
            .build();
    }

    private static ObjectNode schema(String... namesTypesDescs) {
        ObjectNode s = Json.obj();
        ObjectNode props = s.putObject("properties");
        for (int i = 0; i + 2 < namesTypesDescs.length; i += 3) {
            ObjectNode p = props.putObject(namesTypesDescs[i]);
            p.put("type", namesTypesDescs[i + 1]);
            p.put("description", namesTypesDescs[i + 2]);
        }
        s.putArray("required");
        return s;
    }

    private static ObjectNode require(ObjectNode schema, String... names) {
        for (String n : names) ((com.fasterxml.jackson.databind.node.ArrayNode) schema.get("required")).add(n);
        return schema;
    }

    /** Tool definitions in a fixed order (a stable list keeps the prompt cache warm). */
    List<BetaTool> definitions() {
        List<BetaTool> out = new ArrayList<>();
        for (JsonNode t : store.tools()) {
            String name = t.path("name").asText("");
            if (name.isEmpty()) continue;
            crmToolNames.add(name);
            out.add(tool(name, t.path("description").asText(""), t.path("input_schema")));
        }
        if (browser != null) {
            out.add(tool("browser_open", "Open an address in the agent's Chrome window and return the page as text with numbered elements.", require(schema("url", "string", "Full https address."), "url")));
            out.add(tool("browser_read", "Read the current page again: its text and the numbered elements you can act on.", schema()));
            out.add(tool("browser_click", "Click a numbered element from the latest page reading, then return the new page.", require(schema("ref", "integer", "The element number shown in square brackets."), "ref")));
            out.add(tool("browser_scroll", "Scroll the page and return what is now visible.", require(schema("direction", "string", "down, up or top."), "direction")));
            out.add(tool("browser_back", "Go back one page.", schema()));
            if (!browserReadOnly) {
                out.add(tool("browser_type", "Type text into a numbered text field (replaces what is there). Never for passwords or codes.", require(schema("ref", "integer", "The element number.", "text", "string", "The text to enter.", "press_enter", "boolean", "Press Enter afterwards."), "ref", "text")));
            }
        }
        if (canRequestApproval) {
            out.add(tool("request_approval", "End the prepare phase: hand your exact proposal to a person. Nothing has been changed yet. Put the exact text or values to be applied in details, so they can be approved or edited.",
                require(schema("summary", "string", "One or two sentences on what you propose.", "details", "string", "The exact content and steps to carry out once approved."), "summary", "details")));
        }
        ObjectNode fin = schema("summary", "string", "Two sentences: what you found or did.", "report", "string", "The full report in Markdown, conclusion first.");
        ObjectNode findings = ((ObjectNode) fin.get("properties")).putObject("findings");
        findings.put("type", "array");
        findings.put("description", "The individual findings, most important first. Empty when there is nothing to flag.");
        ObjectNode item = findings.putObject("items");
        item.put("type", "object");
        ObjectNode ip = item.putObject("properties");
        ip.putObject("severity").put("type", "string").put("description", "high, medium, low or info.");
        ip.putObject("title").put("type", "string");
        ip.putObject("detail").put("type", "string").put("description", "The evidence.");
        ip.putObject("action").put("type", "string").put("description", "The recommended action.");
        item.putArray("required").add("severity").add("title");
        out.add(tool("finish_task", "End the task with your result. Call this exactly once, when the work is complete.", require(fin, "summary", "report")));
        return out;
    }

    Outcome run(String name, JsonNode input) {
        try {
            switch (name) {
                case "finish_task":
                    finished = input;
                    return new Outcome("Recorded. The task is complete.", false);
                case "request_approval":
                    if (!canRequestApproval) return new Outcome("Approval is not part of this task. Use finish_task.", true);
                    approval = input;
                    return new Outcome("Sent for approval. Stop here.", false);
                case "browser_open": return new Outcome(needBrowser().open(input.path("url").asText("")), false);
                case "browser_read": return new Outcome(needBrowser().read(), false);
                case "browser_click": return new Outcome(needBrowser().click(input.path("ref").asInt(-1)), false);
                case "browser_scroll": return new Outcome(needBrowser().scroll(input.path("direction").asText("down")), false);
                case "browser_back": return new Outcome(needBrowser().back(), false);
                case "browser_type":
                    if (browserReadOnly) return new Outcome("Typing is not allowed before approval. Propose the change with request_approval.", true);
                    return new Outcome(needBrowser().type(input.path("ref").asInt(-1), input.path("text").asText(""), input.path("press_enter").asBoolean(false)), false);
                default:
                    if (!crmToolNames.contains(name)) return new Outcome("Unknown tool: " + name, true);
                    ObjectNode body = Json.obj();
                    body.put("taskId", task.path("id").asText());
                    body.put("name", name);
                    body.set("input", input == null || !input.isObject() ? Json.obj() : input);
                    JsonNode res = crm.post("agent/tool", body).path("result");
                    return new Outcome(Redact.text(Json.clip(Json.str(res), 60000)), res.has("error"));
            }
        } catch (Browser.BrowserException e) {
            return new Outcome("Browser: " + e.getMessage(), true);
        } catch (CrmClient.CrmException e) {
            return new Outcome("CRM: " + e.getMessage(), true);
        } catch (Exception e) {
            return new Outcome("Tool failed: " + e.getClass().getSimpleName() + " " + e.getMessage(), true);
        }
    }

    private Browser needBrowser() throws Browser.BrowserException {
        if (browser == null) throw new Browser.BrowserException("This task type has no browser.");
        return browser;
    }

    /** A screenshot kept on this device as evidence after a browser task. */
    String evidence(String label) {
        if (browser == null) return "";
        try {
            return browser.screenshot(shotsDir.resolve(task.path("id").asText("task") + "-" + label + ".png")).toString();
        } catch (Exception e) {
            return "";
        }
    }
}
