package com.serpsquad.agent;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.BufferedReader;
import java.io.Console;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/** Command line entry point: run (with the local dashboard), setup, status, sync, login-google, preview, selftest, version. */
public final class Main {
    private Main() {}

    static String version() {
        try (InputStream in = Main.class.getResourceAsStream("/version.txt")) {
            String v = in == null ? "" : new String(in.readAllBytes(), StandardCharsets.UTF_8).trim();
            return v.isEmpty() || v.startsWith("$") ? "0.0.0" : v;
        } catch (Exception e) {
            return "0.0.0";
        }
    }

    public static void main(String[] args) {
        System.setProperty("apple.awt.UIElement", "true");     // macOS: a menu-bar icon, no extra Dock icon
        String cmd = "run", homeArg = null;
        for (int i = 0; i < args.length; i++) {
            if ("--home".equals(args[i]) && i + 1 < args.length) homeArg = args[++i];
            else if (!args[i].startsWith("--")) cmd = args[i];
            else if ("--selftest".equals(args[i])) cmd = "selftest";
        }
        Path home = Config.resolveHome(homeArg);
        int code;
        try {
            code = dispatch(cmd, home);
        } catch (Throwable e) {
            System.err.println("Fatal: " + e);
            /* a freshly installed update that cannot even start asks the launcher to put the old version back */
            boolean pending = Files.exists(home.resolve("data").resolve("update-pending.txt"));
            code = pending && "run".equals(cmd) ? Updater.EXIT_ROLL_BACK : 1;
        }
        System.exit(code);
    }

    private static int dispatch(String cmd, Path home) throws Exception {
        switch (cmd) {
            case "version": System.out.println(version()); return 0;
            case "selftest": return selftest();
            case "help": help(); return 0;
            case "setup": return setup(home);
            default: break;
        }
        Config cfg = Config.load(home);
        if ("preview".equals(cmd) || "demo".equals(cmd)) return preview(cfg);
        if ("run".equals(cmd)) {
            /* starting it twice just brings the window back */
            String running = alreadyRunning(cfg);
            if (!running.isEmpty()) {
                System.out.println("The agent is already running. Opening its window.");
                if (cfg.openDashboard) AppWindow.open(cfg, running);
                return 0;
            }
        }
        Log.init(home.resolve("logs"));
        Secure.lockDown(home);
        Worker w = new Worker(cfg, version());
        switch (cmd) {
            case "run": {
                boolean afterUpdate = Files.exists(cfg.dataDir().resolve("update-pending.txt"));
                Shortcuts.writeLaunchers(home);      // every start: an older launcher script is brought up to date
                Path marker = cfg.dataDir().resolve("shortcuts-installed");
                if (Shortcuts.isWindows() && !Files.exists(marker)) {
                    Files.createDirectories(cfg.dataDir());
                    if (Shortcuts.installShortcuts(home)) Log.info("A \"" + Shortcuts.NAME + "\" shortcut was added to the Desktop and the Start menu.");
                    Files.writeString(marker, "done", StandardCharsets.UTF_8);
                }
                try {
                    LocalUi ui = new LocalUi(cfg, w, version(), false);
                    ui.start();
                    Log.info("Application window: " + ui.url());
                    if (cfg.openDashboard && !afterUpdate) AppWindow.open(cfg, ui.url());
                    if (cfg.openDashboard) {
                        boolean tray = Tray.install(Shortcuts.NAME, () -> AppWindow.open(cfg, ui.url()), () -> cfg.paused, w::setPaused, () -> { Log.info("Quit from the tray icon."); System.exit(0); });
                        Log.info(tray ? "Tray icon installed: use it to reopen the window, pause or quit." : "No tray icon on this system. Start the agent again to reopen its window.");
                    }
                } catch (Exception e) {
                    Log.warn("The application window could not start (" + e.getMessage() + "). The agent works without it.");
                }
                if (!w.configured()) Log.info("This computer is not connected to the CRM yet. Paste the device token in the application window.");
                return w.loop();
            }
            case "login-google":
                w.openGoogleProfile();
                System.out.println("A Chrome window opened with the agent's Google profile. Sign in to the Google account there yourself; the agent never types passwords.\nWhen you are signed in, CLOSE that Chrome window. The sign-in is kept, and the agent opens the profile itself when a task needs it.");
                return 0;
            default: break;
        }
        if (!w.configured()) {
            System.out.println("This computer is not connected to the CRM yet. Start the agent and use its dashboard, or run:  java -jar serpsquad-agent.jar setup");
            return 2;
        }
        switch (cmd) {
            case "sync": return w.sync("manual sync") ? 0 : 1;
            case "status": return status(cfg, w);
            default:
                help();
                return 2;
        }
    }

    /** Demo mode: the application with a made-up agency. No CRM, no key, nothing saved. */
    private static int preview(Config cfg) throws Exception {
        LocalUi ui = new LocalUi(cfg, null, version(), true);
        ui.start();
        System.out.println("Demo with sample data: " + ui.url() + "\nPress Ctrl+C (or Quit in the tray icon) to stop.");
        if (cfg.openDashboard) {
            AppWindow.open(cfg, ui.url());
            boolean tray = Tray.install(Shortcuts.NAME + " (demo)", () -> AppWindow.open(cfg, ui.url()), null, null, () -> System.exit(0));
            System.out.println(tray ? "Tray icon installed (Quit the agent ends the demo)." : "No tray icon on this system.");
        }
        Thread.currentThread().join();
        return 0;
    }

    /** Is an agent from this same folder already running? Then its window address is returned. */
    private static String alreadyRunning(Config cfg) {
        java.net.http.HttpClient http = java.net.http.HttpClient.newBuilder().connectTimeout(java.time.Duration.ofMillis(400)).build();
        String mine = LocalUi.homeId(cfg);
        for (int p = cfg.uiPort; p < cfg.uiPort + 10; p++) {
            try {
                java.net.http.HttpResponse<String> r = http.send(java.net.http.HttpRequest.newBuilder(java.net.URI.create("http://127.0.0.1:" + p + "/api/ping")).timeout(java.time.Duration.ofMillis(700)).GET().build(), java.net.http.HttpResponse.BodyHandlers.ofString());
                if (r.statusCode() != 200) continue;
                JsonNode n = Json.parse(r.body());
                if ("serpsquad-agent".equals(n.path("app").asText()) && mine.equals(n.path("home").asText()) && !n.path("demo").asBoolean(false)) return "http://127.0.0.1:" + p + "/";
            } catch (Exception ignored) { /* nothing on that port */ }
        }
        return "";
    }

    private static void help() {
        System.out.println("SERP Squad agent " + version() + "\n"
            + "  run           start working and open the application window (the default)\n"
            + "  setup         connect this device from the command line instead of the window\n"
            + "  demo          open the application with a made-up agency, without connecting to anything\n"
            + "  status        show the connection, sync state and what is configured\n"
            + "  sync          pull playbooks and settings now\n"
            + "  login-google  open the agent's Google Chrome profile so you can sign in\n"
            + "  version       print the version\n"
            + "Options: --home <folder>  where config.json, data and logs live (default: the folder of the jar)");
    }

    private static int selftest() throws Exception {
        JsonNode n = Json.parse("{\"ok\":true}");
        if (!n.path("ok").asBoolean()) return 1;
        Class.forName("com.anthropic.client.okhttp.AnthropicOkHttpClient");
        Class.forName("com.anthropic.models.beta.messages.MessageCreateParams");
        if (Updater.compare("1.2.10", "1.2.9") <= 0) return 1;
        if (!Browser.isLocalAddress("127.0.0.1") || !Browser.isLocalAddress("localhost") || !Browser.isLocalAddress("192.168.1.10") || !Browser.isLocalAddress("[::1]") || Browser.isLocalAddress("business.google.com") || Browser.isLocalAddress("8.8.8.8")) return 1;
        if (Main.class.getResource("/manage/manage.js") == null || Main.class.getResource("/ui.html") == null || Main.class.getResource("/catalog.json") == null) return 1;
        System.out.println("selftest ok " + version());
        return 0;
    }

    private static String ask(BufferedReader in, Console console, String prompt, boolean secret, String dflt) throws Exception {
        String shown = prompt + (dflt == null || dflt.isEmpty() || secret ? "" : " [" + dflt + "]") + ": ";
        String v;
        if (secret && console != null) {
            char[] c = console.readPassword("%s", shown);
            v = c == null ? "" : new String(c);
        } else {
            System.out.print(shown);
            System.out.flush();
            v = in.readLine();
        }
        v = v == null ? "" : v.trim();
        return v.isEmpty() && dflt != null ? dflt : v;
    }

    private static int setup(Path home) throws Exception {
        Files.createDirectories(home);
        Config cfg = Config.load(home);
        Console console = System.console();
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        System.out.println("SERP Squad agent setup (" + version() + ")\nFolder: " + home + "\nPress Enter to keep a value shown in [brackets].\n");
        cfg.serverUrl = ask(in, console, "CRM address", false, cfg.serverUrl).replaceAll("/+$", "");
        String tok = ask(in, console, "Device token from Company Settings, AI agent, Devices" + (cfg.deviceToken.isBlank() ? "" : " (Enter keeps the saved one)"), true, cfg.deviceToken);
        if (!tok.isBlank()) cfg.deviceToken = tok;
        String key = ask(in, console, "Claude API key for this computer" + (cfg.anthropicApiKey.isBlank() ? " (leave empty to use the key set in the CRM)" : " (Enter keeps the saved one)"), true, cfg.anthropicApiKey);
        if (!key.isBlank()) cfg.anthropicApiKey = key;
        String found = cfg.chromePath.isBlank() ? Config.findChrome() : cfg.chromePath;
        cfg.chromePath = ask(in, console, "Chrome location", false, found);
        cfg.save();
        Shortcuts.writeLaunchers(home);
        if (Shortcuts.installShortcuts(home)) System.out.println("A \"" + Shortcuts.NAME + "\" shortcut was added to the Desktop and the Start menu.");
        System.out.println("\nSaved " + cfg.file() + " (keep this file private: it holds the device token and the API key).");
        Log.init(home.resolve("logs"));
        Secure.lockDown(home);
        Worker w = new Worker(cfg, version());
        try {
            JsonNode h = w.hello();
            System.out.println("Connected to the CRM as \"" + h.path("device").path("name").asText("") + "\".");
            w.sync("first sync");
        } catch (CrmClient.CrmException e) {
            System.out.println("Could not connect yet: " + e.getMessage());
            return 1;
        }
        boolean win = System.getProperty("os.name", "").toLowerCase().contains("win");
        System.out.println("\nNext:\n  1. Start the agent with " + (win ? "the \"" + Shortcuts.NAME + "\" shortcut (or run.bat)" : "./run.sh") + ".\n  2. For Google Business Profile tasks, use \"Open Chrome to sign in\" in the application window and sign in yourself.");
        return 0;
    }

    private static int status(Config cfg, Worker w) {
        System.out.println("Agent version : " + version());
        System.out.println("Folder        : " + cfg.home);
        System.out.println("CRM           : " + cfg.serverUrl);
        System.out.println("Claude API key: " + (cfg.anthropicApiKey.isBlank() ? "none on this computer (the CRM's key is used when one is set there)" : "saved on this computer"));
        String chrome = cfg.chromePath.isBlank() ? Config.findChrome() : cfg.chromePath;
        System.out.println("Chrome        : " + (chrome.isBlank() ? "not found" : chrome));
        System.out.println("Google profile: " + (Files.isDirectory(cfg.dataDir().resolve("chrome-google")) ? "created (sign-in is kept in it)" : "not created yet (run login-google)"));
        try {
            JsonNode h = w.hello();
            System.out.println("Connection    : ok, device \"" + h.path("device").path("name").asText("") + "\"" + (h.path("device").path("paused").asBoolean(false) ? ", paused in the CRM" : ""));
            System.out.println("Playbooks     : CRM revision " + h.path("playbooksRev").asLong(0));
            if (h.path("release").isObject()) System.out.println("Published     : version " + h.path("release").path("version").asText(""));
            return 0;
        } catch (CrmClient.CrmException e) {
            System.out.println("Connection    : FAILED. " + e.getMessage());
            return 1;
        }
    }
}
