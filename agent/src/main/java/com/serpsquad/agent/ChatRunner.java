package com.serpsquad.agent;

import com.anthropic.client.AnthropicClient;
import com.anthropic.errors.AnthropicException;
import com.anthropic.errors.AnthropicIoException;
import com.anthropic.errors.BadRequestException;
import com.anthropic.errors.PermissionDeniedException;
import com.anthropic.errors.RateLimitException;
import com.anthropic.errors.UnauthorizedException;
import com.anthropic.models.beta.messages.BetaCacheControlEphemeral;
import com.anthropic.models.beta.messages.BetaContentBlock;
import com.anthropic.models.beta.messages.BetaContentBlockParam;
import com.anthropic.models.beta.messages.BetaMessage;
import com.anthropic.models.beta.messages.BetaMessageParam;
import com.anthropic.models.beta.messages.BetaOutputConfig;
import com.anthropic.models.beta.messages.BetaStopReason;
import com.anthropic.models.beta.messages.BetaTextBlockParam;
import com.anthropic.models.beta.messages.BetaThinkingConfigAdaptive;
import com.anthropic.models.beta.messages.BetaTool;
import com.anthropic.models.beta.messages.BetaToolResultBlockParam;
import com.anthropic.models.beta.messages.BetaToolUseBlock;
import com.anthropic.models.beta.messages.BetaWebFetchTool20250910;
import com.anthropic.models.beta.messages.BetaWebFetchTool20260209;
import com.anthropic.models.beta.messages.BetaWebSearchTool20250305;
import com.anthropic.models.beta.messages.BetaWebSearchTool20260209;
import com.anthropic.models.beta.messages.MessageCreateParams;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Answers one chat message about one project. It reads the same
 * project-scoped CRM tools a task uses (plus web search), reports its token
 * use after every Claude call, and always ends by sending a reply, even when
 * something went wrong, so the person is never left waiting.
 */
final class ChatRunner {
    private static final int MAX_TURNS = 12;
    private static final Map<String, String> DOING = Map.ofEntries(
        Map.entry("project_brief", "Reading the project"), Map.entry("rank_table", "Reading the rankings"), Map.entry("rank_history", "Reading a keyword's history"),
        Map.entry("rank_compare", "Comparing rankings between two dates"), Map.entry("search_console", "Reading Search Console"), Map.entry("geo_grid", "Reading the map grid"),
        Map.entry("past_reports", "Reading earlier reports"), Map.entry("project_tasks", "Checking the task list"), Map.entry("remember", "Saving a note"),
        Map.entry("log_change", "Logging a change"), Map.entry("suggest_task", "Queueing a task"));

    private final AnthropicClient claude;
    private final CrmClient crm;
    private final SyncStore store;
    private final JsonNode turn;
    private final String turnId;
    private final String model;

    ChatRunner(AnthropicClient claude, CrmClient crm, SyncStore store, JsonNode turn) {
        this.claude = claude;
        this.crm = crm;
        this.store = store;
        this.turn = turn;
        this.turnId = turn.path("id").asText();
        this.model = turn.path("model").asText("claude-opus-5-5");
    }

    private String system() {
        String chat = store.playbook("_chat");
        StringBuilder s = new StringBuilder();
        s.append(chat.isBlank() ? "You are the SEO operations agent of a local-SEO agency, talking to a manager in a live chat about one client project. Be direct and brief. Use the tools for every fact and never invent a number." : chat);
        s.append("\n\n---\n\nProject: ").append(turn.path("projectName").asText(""));
        String client = turn.path("clientName").asText("");
        if (!client.isBlank()) s.append(" (client: ").append(client).append(')');
        s.append("\nToday: ").append(LocalDate.now());
        String by = turn.path("by").asText("");
        if (!by.isBlank()) s.append("\nYou are talking to: ").append(by);
        String knowledge = turn.path("knowledge").asText("");
        if (!knowledge.isBlank()) s.append("\n\n").append(knowledge);
        String brand = turn.path("brand").asText("");
        if (!brand.isBlank()) s.append("\n\n").append(brand);
        if (turn.path("lessons").size() > 0) {
            s.append("\n\nWhat you have learned so far on this project (your own notes from earlier work, and corrections from the manager):\n");
            for (JsonNode d : turn.path("lessons")) s.append("- ").append(d.asText("")).append('\n');
        }
        s.append("\n\nDirections the manager has given for this project (follow them in every answer):\n");
        if (turn.path("directions").size() == 0) s.append("None saved yet.\n");
        int n = 1;
        for (JsonNode d : turn.path("directions")) s.append(n++).append(". ").append(d.asText("")).append('\n');
        long older = turn.path("olderMessages").asLong(0);
        if (older > 0) s.append("\nThis conversation has ").append(older).append(" earlier messages that are not shown below. Read them with chat_history when you need them.\n");
        return s.toString();
    }

    private List<BetaTool> tools() {
        List<BetaTool> out = new ArrayList<>();
        for (JsonNode t : store.tools()) {
            String name = t.path("name").asText("");
            if (!name.isEmpty()) out.add(ToolBox.tool(name, t.path("description").asText(""), t.path("input_schema")));
        }
        return out;
    }

    private MessageCreateParams params(String system, List<BetaTool> toolDefs, List<BetaMessageParam> history) {
        String effort = turn.path("effort").asText("medium");
        MessageCreateParams.Builder b = MessageCreateParams.builder()
            .model(model)
            .maxTokens(8000L)
            .systemOfBetaTextBlockParams(List.of(BetaTextBlockParam.builder().text(system).build()))
            .cacheControl(BetaCacheControlEphemeral.builder().build())
            .thinking(BetaThinkingConfigAdaptive.builder().build())
            .outputConfig(BetaOutputConfig.builder().effort("low".equals(effort) ? BetaOutputConfig.Effort.LOW : "high".equals(effort) ? BetaOutputConfig.Effort.HIGH : BetaOutputConfig.Effort.MEDIUM).build())
            .messages(history);
        for (BetaTool t : toolDefs) b.addTool(t);
        if (model.contains("haiku") || Redact.basicWeb()) {
            b.addTool(BetaWebSearchTool20250305.builder().maxUses(4L).build());
            b.addTool(BetaWebFetchTool20250910.builder().maxUses(4L).maxContentTokens(12000L).build());
        } else {
            b.addTool(BetaWebSearchTool20260209.builder().maxUses(4L).build());
            b.addTool(BetaWebFetchTool20260209.builder().maxUses(4L).maxContentTokens(12000L).build());
            b.addBeta("server-side-fallback-2026-07-01").fallbacksDefault();
        }
        return b.build();
    }

    private ObjectNode body() {
        ObjectNode b = Json.obj();
        b.put("turnId", turnId);
        return b;
    }

    /** Tell the chat what is happening. Returns true when the person pressed Stop. */
    private boolean progress(String text) {
        try {
            ObjectNode b = body();
            b.put("text", text);
            return crm.post("agent/chat/progress", b).path("stop").asBoolean(false);
        } catch (CrmClient.CrmException e) {
            return false;
        }
    }

    private String reportUsage(BetaMessage m) {
        ObjectNode b = body();
        b.put("model", model);
        b.put("input", m.usage().inputTokens());
        b.put("output", m.usage().outputTokens());
        b.put("cacheRead", m.usage().cacheReadInputTokens().orElse(0L));
        b.put("cacheWrite", m.usage().cacheCreationInputTokens().orElse(0L));
        for (int i = 0; i < 3; i++) {
            try {
                JsonNode r = crm.post("agent/chat/usage", b);
                return r.path("stop").asBoolean(false) ? r.path("reason").asText("Stopped.") : null;
            } catch (CrmClient.CrmException e) {
                try { Thread.sleep(3000); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); break; }
            }
        }
        return "Token usage could not be reported to the CRM.";
    }

    /** One Claude call. A rate limit, a busy API or a dropped connection is tried again twice before the person is told. */
    private BetaMessage ask(String system, List<BetaTool> toolDefs, List<BetaMessageParam> history) {
        for (int attempt = 1; ; attempt++) {
            try {
                return claude.beta().messages().create(params(system, toolDefs, history));
            } catch (RateLimitException | AnthropicIoException e) {
                if (attempt >= 3) throw e;
            } catch (com.anthropic.errors.AnthropicServiceException e) {
                if (e.statusCode() < 500 || attempt >= 3) throw e;
            }
            progress("Waiting for Claude");
            try { Thread.sleep(8000L * attempt); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); throw new IllegalStateException("interrupted"); }
        }
    }

    private void reply(String text, boolean error) {
        ObjectNode b = body();
        b.put("text", text);
        if (error) b.put("error", true);
        for (int i = 0; i < 4; i++) {
            try { crm.post("agent/chat/reply", b); return; } catch (CrmClient.CrmException e) {
                if (e.status == 409) return;          // stopped in the meantime
                try { Thread.sleep(3000L * (i + 1)); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); return; }
            }
        }
    }

    private static String textOf(BetaMessage m) {
        StringBuilder s = new StringBuilder();
        for (BetaContentBlock b : m.content()) b.text().ifPresent((t) -> { if (s.length() > 0) s.append("\n\n"); s.append(t.text()); });
        return s.toString().trim();
    }

    void run() {
        String last = "";
        try {
            List<BetaMessageParam> history = new ArrayList<>();
            for (JsonNode h : turn.path("history")) {
                String text = h.path("text").asText("");
                if (text.isBlank()) continue;
                history.add("assistant".equals(h.path("role").asText()) ? BetaMessageParam.ofAssistant(text) : BetaMessageParam.ofUser(text));
            }
            history.add(BetaMessageParam.ofUser(turn.path("text").asText("")));
            String system = system();
            List<BetaTool> toolDefs = tools();
            progress("Thinking");
            for (int i = 1; i <= MAX_TURNS; i++) {
                BetaMessage m = ask(system, toolDefs, history);
                String stopWhy = reportUsage(m);
                String text = textOf(m);
                if (!text.isBlank()) last = text;
                history.add(m.toParam());
                BetaStopReason stop = m.stopReason().orElse(BetaStopReason.END_TURN);
                if (stop.equals(BetaStopReason.REFUSAL)) {
                    reply("I can't help with that request: " + m.stopDetails().flatMap((d) -> d.explanation()).orElse("it was declined by a safety check") + ".", true);
                    return;
                }
                List<BetaContentBlockParam> results = new ArrayList<>();
                for (BetaContentBlock block : m.content()) {
                    if (block.toolUse().isEmpty()) continue;
                    BetaToolUseBlock use = block.toolUse().get();
                    JsonNode input;
                    try { input = use._input().convert(JsonNode.class); } catch (Exception e) { input = null; }
                    if (progress(DOING.getOrDefault(use.name(), "Working"))) { Log.info("  chat answer stopped by the person"); return; }
                    String out;
                    boolean err = false;
                    try {
                        ObjectNode b = body();
                        b.put("name", use.name());
                        b.set("input", input == null || !input.isObject() ? Json.obj() : input);
                        JsonNode res = crm.post("agent/tool", b).path("result");
                        out = Redact.text(Json.clip(Json.str(res), 50000));
                        err = res.has("error");
                    } catch (CrmClient.CrmException e) {
                        if (e.status == 409) return;   // stopped
                        out = "CRM: " + e.getMessage();
                        err = true;
                    }
                    results.add(BetaContentBlockParam.ofToolResult(BetaToolResultBlockParam.builder().toolUseId(use.id()).content(out).isError(err).build()));
                }
                if (stopWhy != null) {
                    reply((last.isBlank() ? "" : last + "\n\n") + "I had to stop here: " + stopWhy, last.isBlank());
                    return;
                }
                if (!results.isEmpty()) { history.add(BetaMessageParam.ofUserOfContentBlockParams(results)); continue; }
                if (stop.equals(BetaStopReason.PAUSE_TURN)) { progress("Searching the web"); continue; }
                if (stop.equals(BetaStopReason.MAX_TOKENS)) { reply((last.isBlank() ? "" : last + "\n\n") + "(My answer was cut off here by the length limit. Ask me to continue.)", false); return; }
                reply(last.isBlank() ? "I have no answer to give for that." : last, false);
                return;
            }
            reply((last.isBlank() ? "" : last + "\n\n") + "I stopped after " + MAX_TURNS + " steps. Ask me to continue if you need more.", false);
        } catch (UnauthorizedException e) {
            reply("I could not answer: Claude rejected the API key. Check the key in API setup.", true);
        } catch (PermissionDeniedException e) {
            reply("I could not answer: the Claude API key is not allowed to use " + model + ".", true);
        } catch (RateLimitException e) {
            reply("I could not answer: Claude is rate limiting requests right now. Try again in a minute.", true);
        } catch (BadRequestException e) {
            String msg = String.valueOf(e.getMessage());
            reply("I could not answer: " + (msg.toLowerCase().contains("credit balance") ? "the Claude account has no credit left." : "Claude rejected the request. " + Json.clip(msg, 200)), true);
        } catch (AnthropicIoException e) {
            reply("I could not answer: Claude could not be reached from the agent's computer.", true);
        } catch (AnthropicException e) {
            reply("I could not answer: " + Json.clip(String.valueOf(e.getMessage()), 200), true);
        } catch (Throwable e) {
            reply("I could not answer because of an unexpected error on the agent's computer (" + e.getClass().getSimpleName() + ").", true);
        }
    }
}
