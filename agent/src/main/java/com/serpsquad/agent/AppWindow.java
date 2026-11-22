package com.serpsquad.agent;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Opens the dashboard as its own application window: Chrome or Edge in "app"
 * mode, which shows no tabs and no address bar and gets its own taskbar entry.
 * It uses a separate profile folder, so it shares nothing with the person's
 * own browser or with the agent's working profiles.
 */
final class AppWindow {
    private AppWindow() {}

    static String findEdge() {
        String[] candidates = {
            System.getenv("ProgramFiles(x86)") + "\\Microsoft\\Edge\\Application\\msedge.exe",
            System.getenv("ProgramFiles") + "\\Microsoft\\Edge\\Application\\msedge.exe",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/usr/bin/microsoft-edge",
        };
        for (String c : candidates) {
            try { if (c != null && !c.startsWith("null") && Files.isRegularFile(Paths.get(c))) return c; } catch (Exception ignored) { /* next */ }
        }
        return "";
    }

    /** True when an application window was opened; false when it fell back to a normal browser tab. */
    static boolean open(Config cfg, String url) {
        String exe = cfg.chromePath.isBlank() ? Config.findChrome() : cfg.chromePath;
        if (exe.isBlank()) exe = findEdge();
        try {
            if (!exe.isBlank()) {
                Path profile = cfg.dataDir().resolve("app-window");
                Files.createDirectories(profile);
                new ProcessBuilder(exe, "--app=" + url, "--user-data-dir=" + profile.toAbsolutePath(), "--no-first-run", "--no-default-browser-check", "--window-size=1320,880")
                    .redirectErrorStream(true).redirectOutput(ProcessBuilder.Redirect.DISCARD).start();
                return true;
            }
        } catch (Exception ignored) { /* fall back to the default browser */ }
        try {
            String os = System.getProperty("os.name", "").toLowerCase();
            String[] cmd = os.contains("win") ? new String[] { "rundll32", "url.dll,FileProtocolHandler", url } : os.contains("mac") ? new String[] { "open", url } : new String[] { "xdg-open", url };
            new ProcessBuilder(cmd).redirectErrorStream(true).redirectOutput(ProcessBuilder.Redirect.DISCARD).start();
        } catch (Exception ignored) { /* the address is in the log */ }
        return false;
    }
}
