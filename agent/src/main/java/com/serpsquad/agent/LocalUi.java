package com.serpsquad.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.InputStream;
import java.net.BindException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.concurrent.Executors;

/**
 * The agent's own dashboard on this computer: one page served on 127.0.0.1
 * only. It shows what the agent is doing and holds this device's API setup.
 *
 * Because any website open in a browser on this PC could try to call a local
 * port, every /api request must (1) be addressed to 127.0.0.1 or localhost,
 * (2) carry the random token that is only ever written into the served page,
 * and (3) not come from another origin. No response ever contains the Claude
 * key or the device token, only their last four characters.
 */
final class LocalUi {
    private final Config cfg;
    private final Worker worker;      // null in preview mode
    private final String version;
    private final boolean preview;
    private final Demo demo;
    private final String token;
    private final long startedAt = System.currentTimeMillis();
    private HttpServer server;
    private int port;

    LocalUi(Config cfg, Worker worker, String version, boolean preview) {
        this.cfg = cfg;
        this.worker = worker;
        this.version = version;
        this.preview = preview;
        this.demo = preview ? new Demo(version) : null;
        byte[] b = new byte[24];
        new SecureRandom().nextBytes(b);
        this.token = HexFormat.of().formatHex(b);
    }

    String url() { return "http://127.0.0.1:" + port + "/"; }

    /** Identifies the folder an agent runs from, so a second start can find the first one. */
    static String homeId(Config cfg) {
        try { return SyncStore.sha256(cfg.home.toAbsolutePath().toString().getBytes(StandardCharsets.UTF_8)).substring(0, 16); } catch (Exception e) { return "unknown"; }
    }

    /** Start on the configured port, or the next free one. */
    int start() throws IOException {
        IOException last = null;
        for (int p = cfg.uiPort; p < cfg.uiPort + 10; p++) {
            try {
                server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), p), 16);
                port = p;
                break;
            } catch (BindException e) {
                last = e;
            }
        }
        if (server == null) throw last == null ? new IOException("No free port for the dashboard.") : last;
        server.createContext("/", this::handle);
        /* the chat widget holds one request open at a time, so the pool must not be a small fixed one */
        server.setExecutor(Executors.newCachedThreadPool((r) -> { Thread t = new Thread(r, "dashboard"); t.setDaemon(true); return t; }));
        server.start();
        return port;
    }

    private void send(HttpExchange ex, int code, String type, byte[] body) throws IOException {
        ex.getResponseHeaders().set("Content-Type", type);
        ex.getResponseHeaders().set("Cache-Control", "no-store");
        ex.getResponseHeaders().set("X-Frame-Options", "DENY");
        ex.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
        ex.getResponseHeaders().set("Referrer-Policy", "no-referrer");
        ex.sendResponseHeaders(code, body.length);
        ex.getResponseBody().write(body);
        ex.close();
    }

    private void json(HttpExchange ex, int code, JsonNode n) throws IOException {
        send(ex, code, "application/json; charset=utf-8", Json.str(n).getBytes(StandardCharsets.UTF_8));
    }

    private void refuse(HttpExchange ex, int code, String detail) throws IOException {
        ObjectNode n = Json.obj();
        n.put("ok", false);
        n.put("detail", detail);
        json(ex, code, n);
    }

    private boolean ourHost(String host) {
        return ("127.0.0.1:" + port).equals(host) || ("localhost:" + port).equals(host);
    }

    private void handle(HttpExchange ex) throws IOException {
        try {
            String path = ex.getRequestURI().getPath();
            String host = ex.getRequestHeaders().getFirst("Host");
            if (host == null || !ourHost(host)) { refuse(ex, 403, "Open the dashboard at " + url()); return; }
            if ("/".equals(path) || "/index.html".equals(path)) {
                if (!"GET".equals(ex.getRequestMethod())) { refuse(ex, 405, "Not allowed."); return; }
                try (InputStream in = LocalUi.class.getResourceAsStream("/ui.html")) {
                    if (in == null) { refuse(ex, 500, "The dashboard page is missing from this build."); return; }
                    String html = new String(in.readAllBytes(), StandardCharsets.UTF_8).replace("{{TOKEN}}", token);
                    ex.getResponseHeaders().set("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'");
                    send(ex, 200, "text/html; charset=utf-8", html.getBytes(StandardCharsets.UTF_8));
                }
                return;
            }
            if ("/manage/manage.js".equals(path) || "/manage/manage.css".equals(path)) {
                /* the management screens: the same code the CRM shows, built into this program */
                try (InputStream in = LocalUi.class.getResourceAsStream(path)) {
                    if (in == null) { refuse(ex, 404, "The management screens are missing from this build."); return; }
                    send(ex, 200, path.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/css; charset=utf-8", in.readAllBytes());
                }
                return;
            }
            if ("/icon.png".equals(path)) {
                java.io.ByteArrayOutputStream png = new java.io.ByteArrayOutputStream();
                javax.imageio.ImageIO.write(Tray.icon(192), "png", png);
                send(ex, 200, "image/png", png.toByteArray());
                return;
            }
            if ("/api/ping".equals(path)) {            // no secrets: lets a second start recognise a running agent
                ObjectNode n = Json.obj();
                n.put("app", "serpsquad-agent");
                n.put("version", version);
                n.put("home", homeId(cfg));
                n.put("demo", preview);
                json(ex, 200, n);
                return;
            }
            if (!path.startsWith("/api/")) { refuse(ex, 404, "Not found."); return; }
            String origin = ex.getRequestHeaders().getFirst("Origin");
            if (origin != null && !origin.equals("http://127.0.0.1:" + port) && !origin.equals("http://localhost:" + port)) { refuse(ex, 403, "Refused."); return; }
            if (!token.equals(ex.getRequestHeaders().getFirst("X-Agent-Ui"))) { refuse(ex, 403, "Reload the dashboard page."); return; }
            String name = path.substring(5);
            if (name.startsWith("agentops/")) {
                /* settings requests of the management screens: answered by the demo, or forwarded to the CRM as this device */
                String sub = name.substring(9);
                String method = ex.getRequestMethod();
                if (sub.startsWith("agent/") || sub.startsWith("device/") || sub.startsWith("release/") || !(method.equals("GET") || method.equals("POST"))) { refuse(ex, 403, "Devices and program versions are managed in the CRM."); return; }
                String text = method.equals("POST") ? new String(ex.getRequestBody().readNBytes(3_000_000), StandardCharsets.UTF_8) : "";
                if (preview) {
                    JsonNode b;
                    try { b = text.isBlank() ? Json.obj() : Json.parse(text); } catch (Exception e) { refuse(ex, 400, "The request was not valid."); return; }
                    Demo.Reply r = demo.manage(method, sub, b);
                    json(ex, r.status, r.body);
                    return;
                }
                try {
                    String q = ex.getRequestURI().getRawQuery();
                    CrmClient.Raw r = worker.manage(method, sub + (q == null ? "" : "?" + q), text);
                    send(ex, r.status, "application/json; charset=utf-8", r.body.getBytes(StandardCharsets.UTF_8));
                } catch (CrmClient.CrmException e) {
                    refuse(ex, 502, e.getMessage());
                }
                return;
            }
            if ("GET".equals(ex.getRequestMethod())) {
                if ("status".equals(name)) { json(ex, 200, preview ? demo.status() : worker.status()); return; }
                if ("board".equals(name)) { json(ex, 200, preview ? demo.board() : worker.board()); return; }
                refuse(ex, 404, "Not found.");
                return;
            }
            if (!"POST".equals(ex.getRequestMethod())) { refuse(ex, 405, "Not allowed."); return; }
            byte[] raw = ex.getRequestBody().readNBytes(20000);
            JsonNode body;
            try { body = raw.length == 0 ? Json.obj() : Json.parse(new String(raw, StandardCharsets.UTF_8)); } catch (Exception e) { refuse(ex, 400, "The request was not valid."); return; }
            if (name.startsWith("chat/")) {
                String action = name.substring(5);
                if (!action.equals("get") && !action.equals("send") && !action.equals("stop")) { refuse(ex, 404, "Not found."); return; }
                ObjectNode b = body.isObject() ? (ObjectNode) body : Json.obj();
                if (preview) { json(ex, 200, demo.chat(action, b)); return; }
                try {
                    json(ex, 200, worker.chat(action, b));
                } catch (CrmClient.CrmException e) {
                    refuse(ex, e.status == 409 || e.status == 400 || e.status == 404 ? e.status : 502, e.status == 404 ? "This CRM does not offer chat from the application yet." : e.getMessage());
                }
                return;
            }
            ObjectNode out = Json.obj();
            out.put("ok", true);
            if (preview) {
                if ("pause".equals(name)) demo.setPaused(body.path("paused").asBoolean(false));
                out.put("preview", true);
                json(ex, 200, out);
                return;
            }
            switch (name) {
                case "sync": worker.requestSync(); break;
                case "update": worker.requestUpdateCheck(); break;
                case "poke": worker.poke(); break;
                case "retry": worker.unblock(); break;
                case "pause": worker.setPaused(body.path("paused").asBoolean(false)); break;
                case "google": worker.openGoogleProfile(); break;
                case "profile": {
                    /* Chrome IDs: the signed-in Chrome profiles on this computer */
                    String action = body.path("action").asText(""), id = body.path("id").asText("");
                    if ("add".equals(action)) { out.put("id", worker.profiles().add(body.path("name").asText(""))); worker.poke(); break; }
                    if ("open".equals(action)) { worker.openProfile(id, body.path("url").asText("")); break; }
                    if ("rename".equals(action)) { if (!worker.profiles().rename(id, body.path("name").asText(""))) { refuse(ex, 400, "Give the Chrome ID a name."); return; } worker.poke(); break; }
                    if ("remove".equals(action)) { if (!worker.profiles().remove(id)) { refuse(ex, 404, "That Chrome ID does not exist on this computer."); return; } worker.poke(); break; }
                    refuse(ex, 400, "Unknown action.");
                    return;
                }
                case "autostart":
                    if (!Shortcuts.setAutostart(cfg.home, body.path("on").asBoolean(false))) { refuse(ex, 400, Shortcuts.isWindows() ? "Windows did not allow the start-up shortcut to be changed." : "The start-up entry could not be written on this computer."); return; }
                    break;
                case "signin": {
                    /* sign-ins for SEO tools: saved encrypted on this computer, never sent anywhere, never shown again */
                    String action = body.path("action").asText("");
                    try {
                        if ("add".equals(action)) { worker.vault().add(body.path("name").asText(""), body.path("loginUrl").asText(""), body.path("user").asText(""), body.path("password").asText("")); Log.info("A sign-in for an SEO tool was saved on this computer."); break; }
                        if ("remove".equals(action)) { if (!worker.vault().remove(body.path("id").asText(""))) { refuse(ex, 404, "That sign-in is no longer saved."); return; } Log.info("A saved sign-in was removed from this computer."); break; }
                    } catch (IllegalArgumentException | IllegalStateException e) { refuse(ex, 400, e.getMessage()); return; }
                    refuse(ex, 400, "Unknown action.");
                    return;
                }
                case "choose-folder": {
                    /* a folder picker of this computer, for the Resources tab: only the chosen path goes back to the page */
                    if (java.awt.GraphicsEnvironment.isHeadless()) { refuse(ex, 400, "This computer has no screen for a folder window. Type the folder's path instead."); return; }
                    final String[] picked = { null };
                    javax.swing.SwingUtilities.invokeAndWait(() -> {
                        javax.swing.JFileChooser fc = new javax.swing.JFileChooser(System.getProperty("user.home"));
                        fc.setDialogTitle("Choose the folder with this project's pictures and media");
                        fc.setFileSelectionMode(javax.swing.JFileChooser.DIRECTORIES_ONLY);
                        javax.swing.JFrame owner = new javax.swing.JFrame();
                        owner.setAlwaysOnTop(true);
                        owner.setUndecorated(true);
                        owner.setLocationRelativeTo(null);
                        owner.setVisible(true);
                        try { if (fc.showOpenDialog(owner) == javax.swing.JFileChooser.APPROVE_OPTION && fc.getSelectedFile() != null) picked[0] = fc.getSelectedFile().getAbsolutePath(); } finally { owner.dispose(); }
                    });
                    out.put("path", picked[0] == null ? "" : picked[0]);
                    break;
                }
                case "open-work": {
                    java.nio.file.Path w = cfg.home.resolve("work");
                    java.nio.file.Files.createDirectories(w);
                    if (java.awt.GraphicsEnvironment.isHeadless() || !java.awt.Desktop.isDesktopSupported()) { refuse(ex, 400, "The folder is " + w); return; }
                    java.awt.Desktop.getDesktop().open(w.toFile());
                    break;
                }
                case "connect": {
                    String url = body.path("serverUrl").asText("").trim().replaceAll("/+$", "");
                    String tok = body.path("deviceToken").asText("").trim();
                    if (!url.matches("(?i)https://[^\\s/]+(/.*)?") && !url.matches("(?i)http://(localhost|127\\.0\\.0\\.1)(:\\d+)?")) { refuse(ex, 400, "Enter the CRM address, starting with https://"); return; }
                    if (tok.isEmpty() && cfg.deviceToken.isBlank()) { refuse(ex, 400, "Paste the device token from the CRM."); return; }
                    if (!tok.isEmpty() && !tok.matches("ssa_[a-f0-9]{40,}")) { refuse(ex, 400, "That is not a device token. It starts with ssa_ and comes from the CRM's Devices screen."); return; }
                    cfg.serverUrl = url;
                    if (!tok.isEmpty()) cfg.deviceToken = tok;
                    cfg.save();
                    worker.rebuildClient();
                    worker.poke();
                    Log.info("Connection settings changed in the dashboard.");
                    break;
                }
                case "key": {
                    String action = body.path("action").asText("");
                    String key = body.path("key").asText("").trim();
                    if ("test".equals(action)) { ObjectNode r = worker.testKey(key); r.put("ok", true); json(ex, 200, r); return; }
                    if ("remove".equals(action)) { cfg.anthropicApiKey = ""; cfg.save(); Log.info("The Claude API key was removed from this computer."); worker.poke(); break; }
                    if ("set".equals(action)) {
                        if (key.length() < 20 || key.length() > 400 || key.matches(".*\\s.*")) { refuse(ex, 400, "That does not look like an API key. Paste the whole key, with no spaces."); return; }
                        cfg.anthropicApiKey = key;
                        cfg.save();
                        Log.info("A Claude API key was saved on this computer.");
                        worker.unblock();
                        break;
                    }
                    refuse(ex, 400, "Unknown action.");
                    return;
                }
                default: refuse(ex, 404, "Not found."); return;
            }
            json(ex, 200, out);
        } catch (Exception e) {
            try { refuse(ex, 500, "The agent could not do that: " + Json.clip(String.valueOf(e.getMessage()), 200)); } catch (IOException ignored) { /* the browser went away */ }
        }
    }
}
