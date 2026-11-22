package com.serpsquad.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.attribute.PosixFilePermissions;

/**
 * Settings that belong to THIS device and are never synced: where the CRM is,
 * this device's token, the Claude API key and the Chrome location. They live
 * in config.json beside the jar; environment variables override the file.
 */
final class Config {
    final Path home;
    String serverUrl = "https://app.serpsquad.com";
    String deviceToken = "";
    String anthropicApiKey = "";
    String anthropicBaseUrl = "";
    String chromePath = "";
    boolean headless = false;
    int uiPort = 7717;
    boolean openDashboard = true;
    boolean paused = false;

    Config(Path home) { this.home = home; }

    static Path resolveHome(String override) {
        if (override != null && !override.isBlank()) return Paths.get(override).toAbsolutePath().normalize();
        String env = System.getenv("SERPSQUAD_AGENT_HOME");
        if (env != null && !env.isBlank()) return Paths.get(env).toAbsolutePath().normalize();
        try {
            Path self = Paths.get(Config.class.getProtectionDomain().getCodeSource().getLocation().toURI());
            if (Files.isRegularFile(self)) return self.getParent().toAbsolutePath().normalize();
        } catch (Exception ignored) { /* fall through to the working directory */ }
        return Paths.get("").toAbsolutePath().normalize();
    }

    Path file() { return home.resolve("config.json"); }

    Path dataDir() { return home.resolve("data"); }

    static Config load(Path home) {
        Config c = new Config(home);
        try {
            if (Files.exists(c.file())) {
                JsonNode n = Json.parse(Files.readString(c.file(), StandardCharsets.UTF_8));
                c.serverUrl = Json.text(n, "serverUrl", c.serverUrl);
                c.deviceToken = Json.text(n, "deviceToken", "");
                c.anthropicApiKey = Json.text(n, "anthropicApiKey", "");
                c.anthropicBaseUrl = Json.text(n, "anthropicBaseUrl", "");
                c.chromePath = Json.text(n, "chromePath", "");
                c.headless = n.path("headless").asBoolean(false);
                c.uiPort = n.path("uiPort").asInt(7717);
                c.openDashboard = n.path("openDashboard").asBoolean(true);
                c.paused = n.path("paused").asBoolean(false);
            }
        } catch (Exception e) {
            Log.warn("config.json could not be read: " + e.getMessage());
        }
        c.serverUrl = env("SERPSQUAD_SERVER", c.serverUrl).replaceAll("/+$", "");
        c.deviceToken = env("SERPSQUAD_DEVICE_TOKEN", c.deviceToken).trim();
        c.anthropicApiKey = env("ANTHROPIC_API_KEY", c.anthropicApiKey).trim();
        c.anthropicBaseUrl = env("ANTHROPIC_BASE_URL", c.anthropicBaseUrl).trim();
        c.chromePath = env("SERPSQUAD_CHROME", c.chromePath).trim();
        if ("1".equals(System.getenv("SERPSQUAD_HEADLESS"))) c.headless = true;
        if ("1".equals(System.getenv("SERPSQUAD_NO_OPEN"))) c.openDashboard = false;
        String port = System.getenv("SERPSQUAD_UI_PORT");
        if (port != null && port.matches("\\d{2,5}")) c.uiPort = Integer.parseInt(port);
        return c;
    }

    private static String env(String name, String dflt) {
        String v = System.getenv(name);
        return v == null || v.isBlank() ? dflt : v;
    }

    synchronized void save() throws Exception {
        Files.createDirectories(home);
        ObjectNode n = Json.obj();
        n.put("serverUrl", serverUrl);
        n.put("deviceToken", deviceToken);
        n.put("anthropicApiKey", anthropicApiKey);
        if (!anthropicBaseUrl.isBlank()) n.put("anthropicBaseUrl", anthropicBaseUrl);
        n.put("chromePath", chromePath);
        n.put("headless", headless);
        n.put("uiPort", uiPort);
        n.put("openDashboard", openDashboard);
        n.put("paused", paused);
        Files.writeString(file(), Json.pretty(n), StandardCharsets.UTF_8);
        Secure.ownerOnly(file(), false);
    }

    /** Where Chrome usually is on Windows, macOS and Linux. Empty when not found. */
    static String findChrome() {
        String[] candidates = {
            System.getenv("ProgramFiles") + "\\Google\\Chrome\\Application\\chrome.exe",
            System.getenv("ProgramFiles(x86)") + "\\Google\\Chrome\\Application\\chrome.exe",
            System.getenv("LOCALAPPDATA") + "\\Google\\Chrome\\Application\\chrome.exe",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
        };
        for (String c : candidates) {
            try { if (c != null && !c.startsWith("null") && Files.isRegularFile(Paths.get(c))) return c; } catch (Exception ignored) { /* next */ }
        }
        return "";
    }
}
