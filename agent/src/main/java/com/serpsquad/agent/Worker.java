package com.serpsquad.agent;

import com.anthropic.client.AnthropicClient;
import com.anthropic.client.okhttp.AnthropicOkHttpClient;
import com.anthropic.errors.AnthropicIoException;
import com.anthropic.errors.AnthropicServiceException;
import com.anthropic.errors.PermissionDeniedException;
import com.anthropic.errors.UnauthorizedException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * The always-on loop: check in with the CRM, sync when asked or once a day,
 * install a published update, then take the next task the limits allow.
 * It also keeps the facts the device's own dashboard shows (LocalUi).
 */
final class Worker {
    private static final long DAILY_SYNC_MS = 24L * 3600 * 1000;

    private final Config cfg;
    private final String version;
    private final SyncStore store;
    private final Profiles profiles;
    private final java.util.Map<String, Browser> channelBrowsers = new java.util.HashMap<>();
    private final java.util.List<Browser> toolBrowsers = new java.util.concurrent.CopyOnWriteArrayList<>();     // SEO tools opened by the running task
    private final Vault vault;
    private volatile CrmClient crm;
    private volatile Updater updater;
    private final LinkedBlockingQueue<Boolean> wake = new LinkedBlockingQueue<>();

    private volatile String state = "starting";
    private volatile long lastSyncAt = 0;
    private volatile long blockedUntil = 0;
    private volatile String blockedWhy = "";
    private volatile boolean syncRequested = false;
    private volatile boolean updateRequested = false;
    private volatile String updateState = "", updateDetail = "";      // "", checking, installing, restarting, current, failed, waiting
    private volatile long updateCheckedAt = 0;
    /* what the dashboard shows */
    private volatile boolean connected = false;
    private volatile String deviceName = "";
    private volatile long lastCheckIn = 0;
    private volatile String lastError = "";
    private volatile boolean pausedByCrm = false;
    private volatile boolean keyOnServer = false;
    private volatile boolean canManage = false;
    private volatile long crmRev = 0;
    private volatile String published = "";
    private volatile ObjectNode current = null;
    private volatile String chatting = "";
    private volatile ObjectNode boardCache = null;
    private volatile long boardAt = 0;
    private volatile long lastChatAt = 0;
    private final ArrayNode history;
    private Browser google, web;
    /* the running task: when it last moved on, its thread and its Chrome window (for the watchdog and for a clean stop) */
    private volatile long progressAt = 0;
    private volatile Thread taskThread = null;
    private volatile Browser taskBrowser = null;
    private volatile boolean stalled = false;
    /** A run with no answer from Claude and no finished step for this long is stuck, and is ended. */
    private static final long STALL_MS = stallMs();

    private static long stallMs() {
        try { return Math.max(20, Long.parseLong(System.getenv("SERPSQUAD_STALL_SECONDS"))) * 1000L; } catch (Exception e) { return 17 * 60000L; }   // the override is for tests
    }

    Worker(Config cfg, String version) {
        this.cfg = cfg;
        this.version = version;
        this.store = new SyncStore(cfg.dataDir());
        this.profiles = new Profiles(cfg);
        this.history = loadHistory();
        this.vault = new Vault(cfg);
        rebuildClient();
        /* Quit, a restart for an update or the computer shutting down: close the
           Chrome window the agent opened, so a signed-in profile is never left
           running with its control port open. */
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            Browser b = taskBrowser;
            if (b != null) { try { b.close(); } catch (Throwable ignored) { /* the process is ending */ } }
            for (Browser t : toolBrowsers) { try { t.close(); } catch (Throwable ignored) { /* the process is ending */ } }
        }, "close-chrome"));
    }

    /** Called at start and whenever the CRM address or the device token changes. */
    final synchronized void rebuildClient() {
        this.crm = new CrmClient(cfg);
        this.updater = new Updater(cfg, crm);
        this.connected = false;
        this.lastError = "";
    }

    boolean configured() { return !cfg.deviceToken.isBlank(); }

    /** Wake the loop now (a button was pressed in the dashboard). */
    void poke() { wake.offer(Boolean.TRUE); }

    void requestSync() { syncRequested = true; poke(); }

    void setPaused(boolean p) {
        cfg.paused = p;
        try { cfg.save(); } catch (Exception e) { Log.warn("The pause setting could not be saved: " + e.getMessage()); }
        Log.info(p ? "Paused on this device." : "Resumed on this device.");
        poke();
    }

    // ---------- CRM ----------

    private ObjectNode helloBody(boolean synced) {
        ObjectNode b = Json.obj();
        b.put("version", version);
        b.put("os", System.getProperty("os.name", "") + " " + System.getProperty("os.version", ""));
        try { b.put("host", InetAddress.getLocalHost().getHostName()); } catch (Exception e) { b.put("host", "unknown"); }
        b.put("state", cfg.paused && !state.startsWith("working") ? "paused on the device" : state);
        b.put("playbooksRev", store.rev());
        b.put("googleProfile", profiles.size() > 0);
        b.set("browserProfiles", profiles.view());
        b.put("updateSkipped", updater.skipped());
        b.put("localKey", !cfg.anthropicApiKey.isBlank());
        b.set("signins", vault.names());        // which tools a sign-in is saved for here: names and sites only
        if (taskThread != null && progressAt > 0) b.put("idleSeconds", Math.max(0, (System.currentTimeMillis() - progressAt) / 1000));   // lets the CRM tell a working run from a stuck one
        if (synced) b.put("synced", true);
        return b;
    }

    JsonNode hello() throws CrmClient.CrmException {
        JsonNode h = crm.post("agent/hello", helloBody(false));
        connected = true;
        lastCheckIn = System.currentTimeMillis();
        lastError = "";
        deviceName = h.path("device").path("name").asText(deviceName);
        pausedByCrm = h.path("device").path("paused").asBoolean(false);
        keyOnServer = h.path("keyOnServer").asBoolean(false);
        canManage = h.path("device").path("canManage").asBoolean(false);
        crmRev = h.path("playbooksRev").asLong(crmRev);
        published = h.path("release").path("version").asText("");
        return h;
    }

    /** Pull playbooks, settings and the CRM tool list. */
    boolean sync(String why) {
        try {
            JsonNode payload = crm.post("agent/sync", Json.obj());
            int n = store.apply(payload);
            lastSyncAt = System.currentTimeMillis();
            crm.post("agent/hello", helloBody(true));
            Log.info("Synced " + n + " playbooks (revision " + store.rev() + "): " + why);
            return true;
        } catch (Exception e) {
            Log.warn("Sync failed, keeping the current playbooks: " + e.getMessage());
            return false;
        }
    }

    // ---------- Claude ----------

    /**
     * The key for one task: the one the CRM hands over with the task (a
     * project's own key, or the company key when this device has none), else
     * the key saved on this device. A key from the CRM is used for that task
     * only and is never written to disk here.
     */
    private AnthropicClient claude(String taskKey) {
        String key = taskKey != null && !taskKey.isBlank() ? taskKey : cfg.anthropicApiKey;
        AnthropicOkHttpClient.Builder b = AnthropicOkHttpClient.builder();
        if (!key.isBlank()) b.apiKey(key); else b.fromEnv();
        if (safeBase()) b.baseUrl(cfg.anthropicBaseUrl);
        return b.timeout(Duration.ofMinutes(15)).maxRetries(2).build();
    }

    /** A custom Claude address is used only over https (or on this computer, for tests): a key is never sent in clear text. */
    private boolean safeBase() {
        String u = cfg.anthropicBaseUrl;
        if (u.isBlank()) return false;
        if (u.matches("(?i)https://.+") || u.matches("(?i)http://(localhost|127\\.0\\.0\\.1)(:\\d+)?(/.*)?")) return true;
        Log.warn("The Claude address in config.json is not https, so it is ignored.");
        return false;
    }

    /** Ask Claude whether it accepts a key (listing models costs nothing). Returns {valid, detail}. */
    ObjectNode testKey(String key) {
        ObjectNode out = Json.obj();
        String k = key == null || key.isBlank() ? cfg.anthropicApiKey : key.trim();
        if (k.isBlank()) { out.putNull("valid"); out.put("detail", "There is no key on this device to test."); return out; }
        try {
            AnthropicOkHttpClient.Builder b = AnthropicOkHttpClient.builder().apiKey(k);
            if (safeBase()) b.baseUrl(cfg.anthropicBaseUrl);
            b.timeout(Duration.ofSeconds(25)).maxRetries(0).build().models().list();
            out.put("valid", true);
            out.put("detail", "Claude accepted this key.");
        } catch (UnauthorizedException e) {
            out.put("valid", false);
            out.put("detail", "Claude rejected this key. It is wrong or was revoked.");
        } catch (PermissionDeniedException e) {
            out.put("valid", false);
            out.put("detail", "Claude knows this key but it is not allowed to use the API.");
        } catch (AnthropicServiceException e) {
            out.putNull("valid");
            out.put("detail", "Claude answered with error " + e.statusCode() + ". Try again in a minute.");
        } catch (AnthropicIoException e) {
            out.putNull("valid");
            out.put("detail", "Claude could not be reached from this computer.");
        } catch (Exception e) {
            out.putNull("valid");
            out.put("detail", "The key could not be tested: " + e.getClass().getSimpleName());
        }
        return out;
    }

    // ---------- browser ----------

    private String chromePath() { return cfg.chromePath.isBlank() ? Config.findChrome() : cfg.chromePath; }

    Profiles profiles() { return profiles; }

    Vault vault() { return vault; }

    /** Opening a signed-in SEO tool for the running task, and signing in again with the sign-in saved here. */
    private ToolBox.ToolSites toolSites(JsonNode task) {
        return new ToolBox.ToolSites() {
            @Override
            public Browser open(JsonNode tool) throws Browser.BrowserException {
                String id = tool.path("profileId").asText("");
                Path dir = profiles.dir(id);
                if (dir == null) throw new Browser.BrowserException("This computer does not have Chrome ID " + id + ", which " + tool.path("name").asText("the tool") + " is set to use.");
                if (id.equals(task.path("browser").path("profileId").asText("-"))) throw new Browser.BrowserException("That tool uses the same Chrome ID as this task's own window, so it cannot be opened beside it.");
                for (Browser open : toolBrowsers) { try { open.close(); } catch (Throwable ignored) { /* a new window is opened below */ } }
                toolBrowsers.clear();
                List<String> hosts = new ArrayList<>();
                for (JsonNode h : tool.path("hosts")) hosts.add(h.asText());
                if (hosts.isEmpty()) throw new Browser.BrowserException("The tool has no address.");
                Browser b = new Browser(dir, profiles.port(id), chromePath(), cfg.headless, Browser.onlyHosts(hosts), true, cfg.home.resolve("logs").resolve("chrome-" + id + ".log"));
                b.setToolMode(true);
                toolBrowsers.add(b);
                return b;
            }

            @Override
            public String signIn(Browser b, JsonNode tool) throws Browser.BrowserException {
                String host = Vault.hostOf(tool.path("url").asText(""));
                String[] c = vault.forHost(host);
                if (c == null) throw new Browser.BrowserException(tool.path("name").asText("The tool") + " asks for a sign-in, and no sign-in is saved for it on this computer (Settings, Saved sign-ins). A person has to sign in in its Chrome ID. Carry on without this tool and say so in the report.");
                Log.info("  signing in to " + tool.path("name").asText("an SEO tool") + " with the sign-in saved on this computer");
                return b.signIn(c[0], c[1], Vault.site(host));
            }
        };
    }

    /**
     * The browser a task works in. A task that belongs to one of the project's
     * channels gets the Chrome ID the CRM named for that channel, limited to
     * that channel's own sites; other tasks get the clean profile for the open
     * web. If this computer does not have the Chrome ID, the task has no
     * browser and says so.
     */
    private Browser browserFor(JsonNode task) throws Browser.BrowserException {
        JsonNode br = task.path("browser");
        if (br.isObject()) {
            String id = br.path("profileId").asText("");
            Path dir = profiles.dir(id);
            if (dir == null) throw new Browser.BrowserException("This computer does not have Chrome ID " + id + ". Create it under Settings and sign in.");
            List<String> hosts = new ArrayList<>();
            for (JsonNode h : br.path("hosts")) hosts.add(h.asText());
            String key = id + "|" + String.join(",", hosts);
            Browser b = channelBrowsers.get(key);
            if (b == null) {
                b = new Browser(dir, profiles.port(id), chromePath(), cfg.headless, Browser.onlyHosts(hosts), true, cfg.home.resolve("logs").resolve("chrome-" + id + ".log"));
                channelBrowsers.put(key, b);
            }
            return b;
        }
        return legacyBrowserFor(task);
    }

    private Browser legacyBrowserFor(JsonNode task) {
        boolean wantsGoogle = false, wantsWeb = false;
        for (JsonNode n : task.path("needs")) { if ("google".equals(n.asText())) wantsGoogle = true; if ("browser".equals(n.asText())) wantsWeb = true; }
        if (wantsGoogle) {
            if (google == null) {
                List<String> hosts = new ArrayList<>();
                for (JsonNode h : store.settings().path("googleHosts")) hosts.add(h.asText());
                if (hosts.isEmpty()) hosts.add("google.com");
                google = new Browser(cfg.dataDir().resolve("chrome-google"), 9331, chromePath(), cfg.headless, Browser.onlyHosts(hosts), true, cfg.home.resolve("logs").resolve("chrome-google.log"));
            }
            return google;
        }
        if (wantsWeb) {
            if (web == null) web = new Browser(cfg.dataDir().resolve("chrome-web"), 9332, chromePath(), cfg.headless, null, false, cfg.home.resolve("logs").resolve("chrome-web.log"));
            return web;
        }
        return null;
    }

    /**
     * Open the Google profile in an ordinary Chrome window (no remote control
     * attached) so a person can sign in. The sign-in is stored in the profile
     * folder; the agent later starts Chrome with the same folder.
     */
    void openGoogleProfile() throws Exception {
        if (profiles.size() == 0) profiles.add("Google account");
        openProfile(profiles.view().get(0).path("id").asText(), "https://business.google.com/");
    }

    /** Open one Chrome ID in an ordinary Chrome window so a person can sign in to it. */
    void openProfile(String id, String url) throws Exception {
        String chrome = chromePath();
        if (chrome.isBlank()) throw new IllegalStateException("Chrome was not found on this device. Set chromePath in config.json.");
        Path dir = profiles.dir(id);
        if (dir == null) throw new IllegalStateException("This computer does not have Chrome ID " + id + ".");
        Files.createDirectories(dir);
        new ProcessBuilder(chrome, "--user-data-dir=" + dir.toAbsolutePath(), "--no-first-run", "--no-default-browser-check", url == null || url.isBlank() ? "https://accounts.google.com/" : url)
            .redirectErrorStream(true).redirectOutput(ProcessBuilder.Redirect.DISCARD).start();
        poke();
    }

    // ---------- live chat ----------

    /**
     * Listens for chat messages on its own thread, so a question is answered
     * within seconds even while a long task is running. The CRM holds each
     * request open until a message arrives (or 25 seconds pass).
     */
    private void chatLoop() {
        while (!Thread.currentThread().isInterrupted()) {
            try {
                if (!configured() || !connected || store.rev() == 0) { Thread.sleep(4000); continue; }
                JsonNode waited = crm.post("agent/chat/wait", Json.obj());
                if (waited.path("poke").asBoolean(false)) poke();      // the CRM has work for this computer now: a new task, an approval, a sign-in check
                JsonNode turn = waited.path("turn");
                if (!turn.isObject()) continue;
                chatting = turn.path("projectName").asText("a project");
                Log.info("Chat: answering a message about " + chatting);
                try {
                    new ChatRunner(claude(turn.path("claudeApiKey").asText("")), crm, store, turn).run();
                } finally {
                    chatting = "";
                    lastChatAt = System.currentTimeMillis();
                }
            } catch (CrmClient.CrmException e) {
                /* 404 = a CRM that has no chat yet; anything else = try again shortly */
                try { Thread.sleep(e.status == 404 ? 5 * 60000L : 10000L); } catch (InterruptedException ie) { return; }
            } catch (InterruptedException e) {
                return;
            } catch (Throwable e) {
                Log.warn("Chat listener error: " + e);
                try { Thread.sleep(10000L); } catch (InterruptedException ie) { return; }
            }
        }
    }

    // ---------- one task ----------

    private void runTask(JsonNode task) { runTask(task, null); }

    /**
     * A run was in progress when this computer last stopped. Ask the CRM
     * whether it is still ours to carry on (nobody ran it again, cancelled it
     * or gave it to another computer in the meantime); if so, go on from the
     * conversation kept on disk. Returns true when the saved run was dealt
     * with, one way or the other.
     */
    private boolean resumeRun(ObjectNode saved) throws CrmClient.CrmException {
        String id = saved.path("taskId").asText(""), title = saved.path("title").asText("a task");
        ObjectNode ask = Json.obj();
        ask.put("taskId", id);
        JsonNode r;
        try {
            r = crm.post("agent/resume", ask);
        } catch (CrmClient.CrmException e) {
            if (e.status == 409 || e.status == 404 || e.status == 400) {
                Log.info("\"" + title + "\" was cut off when this computer stopped and is not carried on: " + e.getMessage());
                Checkpoint.forget(cfg.dataDir(), id);
                return true;
            }
            throw e;
        }
        if (!r.path("task").isObject()) {
            Log.info("\"" + title + "\" was cut off when this computer stopped. It is carried on later: " + r.path("reason").asText("the CRM said to wait") + ".");
            return false;
        }
        Log.info("Carrying on with \"" + title + "\" where it stopped (step " + (saved.path("turn").asInt(0) + 1) + ").");
        if (r.path("playbooksRev").asLong(store.rev()) != store.rev()) sync("playbooks changed");
        runTask(r.path("task"), saved);
        return true;
    }

    /** Things asked for in the CRM outside a task: make the repository's key, test access to it, look into a media source. */
    private void runAsks(JsonNode asks) {
        for (JsonNode a : asks) {
            String kind = a.path("kind").asText(""), pid = a.path("projectId").asText("");
            ObjectNode body = Json.obj();
            body.put("id", a.path("id").asText("")).put("kind", kind).put("projectId", pid);
            try {
                if ("repoKey".equals(kind)) {
                    body.put("publicKey", new Repo(cfg, pid).ensureKey()).put("ok", true);       // the public half only
                    Log.info("Made the access key for a project's code repository. Its public half was sent to the CRM; the private half stays on this computer.");
                } else if ("repoTest".equals(kind)) {
                    state = "working: testing access to a code repository";
                    body.put("detail", new Repo(cfg, pid).with(vault, a.path("method").asText("key")).test(a.path("url").asText(""), a.path("branch").asText("main"))).put("ok", true);
                } else if ("repoToken".equals(kind)) {
                    new Repo(cfg, pid).with(vault, "token").saveToken(a.path("token").asText(""));        // sealed on this computer; never logged, never sent back
                    body.put("ok", true);
                    Log.info("An access token for a project's code repository was handed over by the CRM and is kept sealed on this computer.");
                } else if ("repoTokenRemove".equals(kind)) {
                    new Repo(cfg, pid).with(vault, "token").removeToken();
                    body.put("ok", true);
                } else if ("resource".equals(kind)) {
                    body.setAll(LocalTools.checkSource(a.path("source")));
                } else if ("output".equals(kind)) {
                    body.setAll(LocalTools.checkOutput(a.path("folder").asText("")));
                } else if ("signin".equals(kind)) {
                    /* a tool's sign-in typed in the CRM: sealed here, never logged, never sent back */
                    try { vault.add(a.path("name").asText(""), a.path("loginUrl").asText(""), a.path("user").asText(""), a.path("password").asText("")); body.put("ok", true); Log.info("A sign-in for " + Json.clip(a.path("name").asText("a tool"), 60) + " was handed over by the CRM and is kept sealed on this computer."); }
                    catch (IllegalArgumentException | IllegalStateException e) { body.put("ok", false).put("detail", Json.clip(e.getMessage(), 200)); }
                } else if ("signinRemove".equals(kind)) {
                    body.put("ok", vault.removeSite(a.path("site").asText("")));
                } else continue;
            } catch (Repo.RepoException e) {
                body.put("ok", false).put("detail", Json.clip(e.getMessage(), 280));
            } catch (Throwable e) {
                body.put("ok", false).put("detail", "The check could not run on this computer: " + e.getClass().getSimpleName());
            } finally {
                state = "idle";
            }
            try { crm.post("agent/asked", body); } catch (Exception e) { Log.warn("The result could not be reported to the CRM: " + e.getMessage()); }
        }
    }

    private void runTask(JsonNode task, ObjectNode resume) {
        state = "working: " + Json.clip(task.path("title").asText(""), 80);
        Log.info("Task: " + task.path("title").asText("") + "  [" + task.path("label").asText("") + ", " + task.path("projectName").asText("") + ", " + task.path("model").asText("") + "]");
        ObjectNode cur = Json.obj();
        cur.put("title", task.path("title").asText(""));
        cur.put("project", task.path("projectName").asText(""));
        cur.put("label", task.path("label").asText(""));
        cur.put("model", task.path("model").asText(""));
        cur.put("phase", task.path("phase").asText("run"));
        cur.put("keySource", task.path("keySource").asText("device"));
        cur.put("startedAt", System.currentTimeMillis());
        cur.put("resumed", resume != null);
        cur.put("tokens", 0);
        cur.put("budget", task.path("runBudgetTokens").asLong(0));
        cur.putArray("steps");
        current = cur;
        final String[] outcome = { "failed", "" };
        TaskRunner.Watcher watcher = new TaskRunner.Watcher() {
            @Override
            public void step(String text) {
                synchronized (cur) {
                    ArrayNode steps = (ArrayNode) cur.get("steps");
                    steps.addObject().put("at", System.currentTimeMillis()).put("text", text);
                    while (steps.size() > 40) steps.remove(0);
                }
            }

            @Override
            public void tokens(long total) { synchronized (cur) { cur.put("tokens", cur.path("tokens").asLong(0) + total); } }

            @Override
            public void finished(String status, String summary) { outcome[0] = status; outcome[1] = summary; }

            @Override
            public void progress() { progressAt = System.currentTimeMillis(); }
        };
        Browser b = null;
        ToolBox tools = null;
        progressAt = System.currentTimeMillis();
        stalled = false;
        taskThread = Thread.currentThread();
        try {
            b = browserFor(task);
            taskBrowser = b;
            tools = new ToolBox(task, crm, store, b, cfg.dataDir().resolve("screenshots"));
            tools.local = new LocalTools(cfg, task, vault);
            if (task.path("seoTools").size() > 0 || task.path("browser").path("signIn").asBoolean(false)) tools.sites = toolSites(task);
            TaskRunner runner = new TaskRunner(claude(task.path("claudeApiKey").asText("")), crm, store, task, tools, watcher);
            runner.checkpoint = new Checkpoint(cfg.dataDir(), task.path("id").asText("task"));
            runner.resume = resume;
            runner.keepForLater = this::keepResult;
            runner.ended = () -> stalled;
            String problem = runner.run();
            if (problem != null) { block(problem); if (store.playbook("_rules").isBlank()) syncRequested = true; }
        } catch (Throwable e) {
            Log.warn("Task crashed before it could start: " + e);
            outcome[1] = "The agent could not start the task.";
            try {
                ObjectNode body = Json.obj();
                body.put("taskId", task.path("id").asText());
                body.put("status", "failed");
                body.put("error", "The agent could not start the task: " + Json.clip(String.valueOf(e.getMessage()), 300));
                crm.post("agent/complete", body);
            } catch (Exception ignored) { /* the CRM releases the task by itself after 20 minutes */ }
        } finally {
            taskThread = null;
            Thread.interrupted();           // the watchdog's interrupt ends with the task; the loop goes on
            if (tools != null) tools.cleanUp();      // first of all: the files fetched for this task are gone before anything slower happens
            Checkpoint.forget(cfg.dataDir(), task.path("id").asText("task"));      // the run ended here, whatever its outcome: nothing is left to carry on
            if (b != null) b.close();
            taskBrowser = null;
            for (Browser t : toolBrowsers) { try { t.close(); } catch (Throwable ignored) { /* closed with the program at the latest */ } }
            toolBrowsers.clear();
            if (stalled) { outcome[0] = "failed"; outcome[1] = "The run stood still for too long and was ended."; }
            remember(cur, outcome[0], outcome[1]);
            current = null;
            state = System.currentTimeMillis() < blockedUntil ? "blocked: " + blockedWhy : "idle";
        }
    }

    /**
     * Sign-in checks asked for in the CRM: open the channel's Chrome ID at the
     * address the CRM names and report whether a sign-in page came up. No
     * Claude call, nothing clicked or typed.
     */
    private void runChecks(JsonNode checks) {
        for (JsonNode c : checks) {
            String id = c.path("profileId").asText("");
            ObjectNode body = Json.obj();
            body.put("id", c.path("id").asText()).put("projectId", c.path("projectId").asText()).put("key", c.path("key").asText());
            state = "working: checking the sign-in for " + Json.clip(c.path("label").asText("a channel"), 60);
            Log.info("Checking the sign-in for the " + c.path("label").asText("channel") + " of " + c.path("projectName").asText("a project") + " in Chrome ID " + id + ".");
            Browser b = null;
            try {
                Path dir = profiles.dir(id);
                if (dir == null) throw new Browser.BrowserException("This computer does not have Chrome ID " + id + ".");
                List<String> hosts = new ArrayList<>();
                for (JsonNode h : c.path("hosts")) hosts.add(h.asText());
                b = new Browser(dir, profiles.port(id), chromePath(), cfg.headless, Browser.onlyHosts(hosts), false, cfg.home.resolve("logs").resolve("chrome-" + id + ".log"));
                ObjectNode r = b.check(c.path("url").asText(""));
                body.setAll(r);
                Log.info("  result: " + r.path("state").asText() + ". " + r.path("detail").asText(""));
            } catch (Browser.BrowserException e) {
                body.put("state", "error").put("detail", Json.clip(e.getMessage(), 280));
                Log.warn("  the check could not run: " + e.getMessage());
            } finally {
                if (b != null) b.close();
                state = "idle";
            }
            try { crm.post("agent/check", body); } catch (Exception e) { Log.warn("The check result could not be reported: " + e.getMessage()); }
        }
    }

    // ---------- results the CRM could not take ----------

    private Path outbox() { return cfg.dataDir().resolve("outbox"); }

    /** Keep a finished task's result on disk while the CRM cannot be reached. */
    private void keepResult(ObjectNode body) {
        try {
            Files.createDirectories(outbox());
            String id = body.path("taskId").asText("task").replaceAll("[^A-Za-z0-9_-]", "");
            Path tmp = outbox().resolve(id + ".tmp"), file = outbox().resolve(id + ".json");
            Files.writeString(tmp, Json.str(body), StandardCharsets.UTF_8);
            Files.move(tmp, file, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        } catch (Exception e) {
            Log.warn("The result could not be kept on this computer either: " + e.getMessage());
        }
    }

    /** Deliver kept results. Called when the CRM answers again, before any new task is taken. */
    private void deliverKept() {
        if (!Files.isDirectory(outbox())) return;
        try (java.util.stream.Stream<Path> files = Files.list(outbox())) {
            for (Path f : (Iterable<Path>) files.filter((x) -> x.getFileName().toString().endsWith(".json"))::iterator) {
                try {
                    JsonNode body = Json.parse(Files.readString(f, StandardCharsets.UTF_8));
                    boolean old = System.currentTimeMillis() - Files.getLastModifiedTime(f).toMillis() > 3 * 24 * 3600000L;
                    try {
                        if (!old && body.isObject()) { crm.post("agent/complete", (ObjectNode) body); Log.info("Delivered the kept result of task " + body.path("taskId").asText("") + "."); }
                        Files.deleteIfExists(f);
                    } catch (CrmClient.CrmException e) {
                        if (e.status == 409 || e.status == 400 || e.status == 404) Files.deleteIfExists(f);   // the CRM no longer wants it (run again or cancelled since)
                        else return;                                                                         // still unreachable: try at the next check-in
                    }
                } catch (Exception e) {
                    try { Files.deleteIfExists(f); } catch (Exception ignored) { /* unreadable and undeletable: skipped */ }
                }
            }
        } catch (Exception ignored) { /* looked at again at the next check-in */ }
    }

    /** This device cannot call Claude right now: stop taking tasks for ten minutes and say why in the CRM. */
    private void block(String why) {
        blockedWhy = Json.clip(why, 90);
        blockedUntil = System.currentTimeMillis() + 10 * 60000;
        Log.warn(why + " No tasks will be taken for 10 minutes.");
    }

    /**
     * "Sync for update" in the application: ask the CRM now whether a newer
     * version is published and install it. While a task is running the check
     * waits until the task has finished, so work is never cut off.
     */
    void requestUpdateCheck() {
        updateRequested = true;
        boolean busy = state.startsWith("working");
        updateState = busy ? "waiting" : "checking";
        updateDetail = busy ? "A task is running. The check happens as soon as it has finished." : "Asking the CRM for the newest version.";
        updateCheckedAt = System.currentTimeMillis();
        poke();
    }

    /** A new key or a "try again" clears the ten-minute wait. */
    void unblock() { blockedUntil = 0; blockedWhy = ""; poke(); }

    // ---------- the last tasks, kept for the dashboard ----------

    private Path historyFile() { return cfg.dataDir().resolve("history.json"); }

    private ArrayNode loadHistory() {
        try {
            JsonNode n = Json.parse(Files.readString(historyFile(), StandardCharsets.UTF_8));
            if (n.isArray()) return (ArrayNode) n;
        } catch (Exception ignored) { /* first run */ }
        return Json.arr();
    }

    private void remember(ObjectNode cur, String status, String summary) {
        synchronized (history) {
            ObjectNode h = history.insertObject(0);
            h.put("title", cur.path("title").asText(""));
            h.put("project", cur.path("project").asText(""));
            h.put("label", cur.path("label").asText(""));
            h.put("status", status);
            h.put("summary", Json.clip(summary, 300));
            h.put("tokens", cur.path("tokens").asLong(0));
            h.put("finishedAt", System.currentTimeMillis());
            while (history.size() > 60) history.remove(history.size() - 1);
            try {
                Files.createDirectories(cfg.dataDir());
                Files.writeString(historyFile(), Json.str(history), StandardCharsets.UTF_8);
            } catch (Exception ignored) { /* the list is a convenience */ }
        }
    }

    /** Projects and recent tasks from the CRM for the application's own screens (cached for a few seconds). */
    ObjectNode board() {
        ObjectNode cached = boardCache;
        if (cached != null && System.currentTimeMillis() - boardAt < 8000) return cached;
        if (!configured()) { ObjectNode n = Json.obj(); n.put("ok", false); n.put("detail", "Not connected yet."); return n; }
        try {
            JsonNode b = crm.post("agent/board", Json.obj());
            if (b.isObject()) { boardCache = (ObjectNode) b; boardAt = System.currentTimeMillis(); return boardCache; }
        } catch (CrmClient.CrmException e) {
            if (cached != null) return cached;
            ObjectNode n = Json.obj();
            n.put("ok", false);
            n.put("detail", e.status == 404 ? "This CRM does not provide the project list yet." : e.getMessage());
            return n;
        }
        ObjectNode n = Json.obj();
        n.put("ok", false);
        return n;
    }

    /** A settings request from the application window, forwarded to the CRM as this device. */
    CrmClient.Raw manage(String method, String pathAndQuery, String body) throws CrmClient.CrmException {
        if (!configured()) throw new CrmClient.CrmException(0, "Connect this computer to the CRM first.");
        return crm.forward(method, pathAndQuery, body);
    }

    /** The project chat, for the application's own chat widget: read (optionally held until it changes), send, stop. */
    JsonNode chat(String action, ObjectNode body) throws CrmClient.CrmException {
        if (!configured()) throw new CrmClient.CrmException(0, "Connect this computer to the CRM first.");
        return crm.post("agent/chat/" + action, body);
    }

    // ---------- status for the local dashboard (never contains a key or a token) ----------

    ObjectNode status() {
        ObjectNode s = Json.obj();
        s.put("version", version);
        s.put("preview", false);
        s.put("configured", configured());
        s.put("serverUrl", cfg.serverUrl);
        s.put("tokenLast4", cfg.deviceToken.length() >= 4 ? cfg.deviceToken.substring(cfg.deviceToken.length() - 4) : "");
        s.put("connected", connected);
        s.put("deviceName", deviceName);
        s.put("lastCheckIn", lastCheckIn);
        s.put("lastError", lastError);
        s.put("manage", canManage);
        boolean working = current != null;
        String st = !configured() ? "setup" : working ? "working" : !connected ? "offline" : cfg.paused || pausedByCrm ? "paused" : System.currentTimeMillis() < blockedUntil ? "blocked" : "idle";
        s.put("state", st);
        s.put("stateDetail", "blocked".equals(st) ? blockedWhy : "paused".equals(st) ? (cfg.paused ? "Paused on this computer." : "Paused in the CRM.") : "offline".equals(st) ? lastError : "");
        s.put("blockedUntil", blockedUntil);
        s.put("pausedLocal", cfg.paused);
        s.put("pausedCrm", pausedByCrm);
        ObjectNode cur = current;
        if (cur != null) { synchronized (cur) { s.set("current", cur.deepCopy()); } } else s.putNull("current");
        s.put("platform", Shortcuts.isWindows() ? "windows" : Shortcuts.isMac() ? "mac" : "other");
        s.put("autostart", Shortcuts.autostartOn());
        s.set("signins", vault.view());
        ObjectNode pc = s.putObject("computer");
        pc.put("cores", Runtime.getRuntime().availableProcessors());
        try { pc.put("memoryMb", ((com.sun.management.OperatingSystemMXBean) java.lang.management.ManagementFactory.getOperatingSystemMXBean()).getTotalMemorySize() / 1048576L); } catch (Throwable e) { pc.put("memoryMb", 0); }
        pc.put("agentMemoryMb", Runtime.getRuntime().maxMemory() / 1048576L);
        pc.put("freeDiskGb", cfg.home.toFile().getUsableSpace() / 1073741824L);
        pc.put("workDir", cfg.home.resolve("work").toString());
        ObjectNode saved = Checkpoint.pending(cfg.dataDir());
        if (saved != null && current == null) pc.put("cutOff", saved.path("title").asText(""));
        ObjectNode chat = s.putObject("chat");
        chat.put("answering", chatting);
        chat.put("lastAt", lastChatAt);
        ObjectNode sync = s.putObject("sync");
        sync.put("rev", store.rev());
        sync.put("crmRev", crmRev);
        sync.put("lastSyncAt", lastSyncAt);
        ObjectNode up = s.putObject("update");
        up.put("published", published);
        up.put("skipped", updater.skipped());
        up.put("state", updateState).put("detail", updateDetail).put("checkedAt", updateCheckedAt);
        ObjectNode key = s.putObject("key");
        key.put("local", !cfg.anthropicApiKey.isBlank());
        key.put("localLast4", cfg.anthropicApiKey.length() >= 4 ? cfg.anthropicApiKey.substring(cfg.anthropicApiKey.length() - 4) : "");
        key.put("crm", keyOnServer);
        String chrome = chromePath();
        ObjectNode ch = s.putObject("chrome");
        ch.put("found", !chrome.isBlank());
        ch.put("path", chrome);
        ch.put("googleProfile", profiles.size() > 0);
        s.set("profiles", profiles.view());
        long startOfDay = LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli();
        long tokens = 0;
        int done = 0;
        ArrayNode recent = s.putArray("recent");
        synchronized (history) {
            for (JsonNode h : history) {
                if (h.path("finishedAt").asLong(0) >= startOfDay) { tokens += h.path("tokens").asLong(0); done += 1; }
                if (recent.size() < 25) recent.add(h.deepCopy());
            }
        }
        if (cur != null) tokens += cur.path("tokens").asLong(0);
        ObjectNode today = s.putObject("today");
        today.put("tasks", done);
        today.put("tokens", tokens);
        ArrayNode log = s.putArray("log");
        for (String line : Log.recent(60)) log.add(line);
        s.put("now", Instant.now().toEpochMilli());
        return s;
    }

    // ---------- the loop ----------

    private void sleep(long ms) {
        try { wake.poll(ms, TimeUnit.MILLISECONDS); wake.clear(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }

    /** Run until the process is stopped. Returns only to ask for a restart (update). */
    int loop() {
        updater.reconcile(version);
        boolean firstHello = true;
        long backoff = 5000;
        ScheduledExecutorService beat = Executors.newSingleThreadScheduledExecutor((r) -> { Thread t = new Thread(r, "heartbeat"); t.setDaemon(true); return t; });
        beat.scheduleAtFixedRate(() -> {
            if (!state.startsWith("working")) return;
            try { hello(); } catch (Exception ignored) { /* next beat */ }
            /* the watchdog: a run that has not moved for a long time is ended, so the computer is free for the next task */
            Thread t = taskThread;
            if (t != null && progressAt > 0 && System.currentTimeMillis() - progressAt > STALL_MS && !stalled) {
                stalled = true;
                Log.warn("The running task has not moved for " + (STALL_MS / 1000) + " seconds. Ending it.");
                Browser b = taskBrowser;
                if (b != null) { try { b.close(); } catch (Throwable ignored) { /* the interrupt below still ends the run */ } }
                t.interrupt();
            }
        }, 60, 60, TimeUnit.SECONDS);
        Thread chat = new Thread(this::chatLoop, "chat");
        chat.setDaemon(true);
        chat.start();
        Log.info("SERP Squad agent " + version + " started. CRM: " + cfg.serverUrl + ". Press Ctrl+C to stop.");
        state = "idle";
        while (!Thread.currentThread().isInterrupted()) {
            long sleepMs = 60000;
            if (!configured()) {
                state = "not connected";
                sleep(5000);
                firstHello = true;
                continue;
            }
            try {
                JsonNode h = hello();
                backoff = 5000;
                if (firstHello) {
                    firstHello = false;
                    Log.info("Connected as \"" + deviceName + "\".");
                }
                sleepMs = Math.max(15, h.path("pollSeconds").asLong(60)) * 1000;
                boolean askedForUpdate = updateRequested;
                updateRequested = false;
                if (askedForUpdate) updater.forget();
                JsonNode rel = h.path("release");
                String offered = rel.path("version").asText("");
                if (rel.isObject() && Updater.compare(offered, version) > 0 && offered.equals(updater.skipped())) {
                    /* refused earlier on this computer: not tried again until someone presses Sync for update */
                    if (!"failed".equals(updateState)) { updateState = "failed"; updateDetail = "Version " + offered + " could not start on this computer earlier, so it is not installed by itself. Press Sync for update to try it once more."; updateCheckedAt = System.currentTimeMillis(); }
                } else if (rel.isObject() && Updater.compare(offered, version) > 0) {
                    updateState = "installing"; updateDetail = "Downloading version " + offered + " and checking it."; updateCheckedAt = System.currentTimeMillis();
                    if (updater.stage(rel, version)) {
                        updateState = "restarting"; updateDetail = "Version " + offered + " is ready. Restarting to install it.";
                        beat.shutdownNow();
                        Shortcuts.relaunchIfAlone(cfg.home);
                        return Updater.EXIT_RESTART_FOR_UPDATE;
                    }
                    updateState = "failed"; updateDetail = updater.problem();
                } else if (askedForUpdate) {
                    updateState = "current"; updateCheckedAt = System.currentTimeMillis();
                    updateDetail = offered.isEmpty() ? "No version of the agent has been published in the CRM yet. This is version " + version + "." : "This is the newest version (" + version + ").";
                }
                boolean stale = store.rev() != h.path("playbooksRev").asLong(0);
                boolean asked = h.path("syncNow").asBoolean(false) || syncRequested;
                if (stale || asked || System.currentTimeMillis() - lastSyncAt > DAILY_SYNC_MS) {
                    syncRequested = false;
                    sync(h.path("syncNow").asBoolean(false) ? "sync requested in the CRM" : asked ? "sync requested on this computer" : stale ? "playbooks changed" : lastSyncAt == 0 ? "start-up sync" : "daily sync");
                }
                deliverKept();
                if (h.path("checks").size() > 0) runChecks(h.path("checks"));
                if (h.path("asks").size() > 0) runAsks(h.path("asks"));
                if (pausedByCrm || cfg.paused) {
                    if (!"paused".equals(state)) Log.info(cfg.paused ? "Paused on this computer. Waiting." : "Paused in the CRM. Waiting.");
                    state = "paused";
                } else if (store.rev() == 0) {
                    Log.warn("No playbooks are installed yet, so no task can start.");
                } else if (System.currentTimeMillis() < blockedUntil) {
                    state = "blocked: " + blockedWhy;
                } else {
                    state = "idle";
                    ObjectNode saved = Checkpoint.pending(cfg.dataDir());
                    if (saved != null) {
                        /* first what was cut off when this computer stopped; new work only after that */
                        if (resumeRun(saved)) sleepMs = 3000;
                        sleep(sleepMs);
                        continue;
                    }
                    JsonNode c = crm.post("agent/claim", Json.obj());
                    if (c.path("task").isObject()) {
                        if (c.path("playbooksRev").asLong(store.rev()) != store.rev()) sync("playbooks changed");
                        runTask(c.path("task"));
                        sleepMs = 3000;     // look for the next task straight away
                    }
                }
            } catch (CrmClient.CrmException e) {
                connected = false;
                if (updateRequested || updateState.equals("checking") || updateState.equals("installing")) { updateRequested = false; updateState = "failed"; updateDetail = "The CRM could not be reached, so the check for a new version did not happen. " + Json.clip(e.getMessage(), 140); }
                lastError = e.status == 401 ? "The CRM does not accept this device's token. Register the device again and enter the new token." : e.getMessage();
                if (e.status == 401) {
                    Log.warn("The CRM does not accept this device's token (removed or wrong). Enter a new token in the dashboard.");
                    sleepMs = 10 * 60000;
                } else {
                    Log.warn(e.getMessage() + " Trying again in " + (backoff / 1000) + " s.");
                    sleepMs = backoff;
                    backoff = Math.min(backoff * 2, 5 * 60000);
                }
            } catch (Throwable e) {
                Log.warn("Unexpected error in the main loop: " + e);
                sleepMs = 60000;
            }
            sleep(sleepMs);
        }
        beat.shutdownNow();
        return 0;
    }
}
