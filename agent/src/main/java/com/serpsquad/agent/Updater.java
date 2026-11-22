package com.serpsquad.agent;

import com.fasterxml.jackson.databind.JsonNode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.concurrent.TimeUnit;

/**
 * Installs a newer agent version published in the CRM.
 *
 * The jar is downloaded beside the running one, its size and SHA-256 are
 * checked against what the CRM announced, and it is started once with
 * "selftest". Only then is it left as serpsquad-agent-next.jar and the agent
 * exits with code 75, which tells the launcher script to swap the files and
 * start again (keeping the old jar as serpsquad-agent-prev.jar). If the new
 * version cannot start, the launcher puts the old one back and that version is
 * skipped from then on.
 */
final class Updater {
    static final int EXIT_RESTART_FOR_UPDATE = 75;
    static final int EXIT_ROLL_BACK = 76;

    private final Config cfg;
    private final CrmClient crm;
    private volatile String problem = "";

    /** Why the last update attempt did not install (empty when it did, or when none was tried). */
    String problem() { return problem; }

    /** "Sync for update" was pressed: a version that was refused before may be tried again. */
    void forget() { try { Files.deleteIfExists(skipFile()); } catch (Exception ignored) { /* tried again anyway */ } }

    Updater(Config cfg, CrmClient crm) { this.cfg = cfg; this.crm = crm; }

    private Path pendingFile() { return cfg.dataDir().resolve("update-pending.txt"); }

    private Path skipFile() { return cfg.dataDir().resolve("update-skip.txt"); }

    static int compare(String a, String b) {
        String[] x = a.trim().split("\\."), y = b.trim().split("\\.");
        for (int i = 0; i < 3; i++) {
            int p = i < x.length ? parse(x[i]) : 0, q = i < y.length ? parse(y[i]) : 0;
            if (p != q) return Integer.compare(p, q);
        }
        return 0;
    }

    private static int parse(String s) { try { return Integer.parseInt(s.replaceAll("[^0-9]", "")); } catch (Exception e) { return 0; } }

    private String read(Path p) { try { return Files.readString(p, StandardCharsets.UTF_8).trim(); } catch (Exception e) { return ""; } }

    /** Called at start-up: was an update tried and rolled back, or did it succeed? */
    void reconcile(String runningVersion) {
        /* a version that was refused is forgotten once a newer one is running */
        String refused = read(skipFile());
        if (!refused.isEmpty() && compare(refused, runningVersion) <= 0) { try { Files.deleteIfExists(skipFile()); } catch (Exception ignored) { /* harmless */ } }
        String pending = read(pendingFile());
        if (pending.isEmpty()) return;
        try {
            if (!pending.equals(runningVersion)) {
                Files.writeString(skipFile(), pending, StandardCharsets.UTF_8);
                Log.warn("Version " + pending + " failed to start and was rolled back. It will not be installed again.");
            }
            Files.deleteIfExists(pendingFile());
        } catch (Exception ignored) { /* best effort */ }
    }

    boolean updatePending() { return !read(pendingFile()).isEmpty(); }

    /** The published version this device refused (failed self-test or rolled back), or empty. */
    String skipped() { return read(skipFile()); }

    /** True when a verified newer jar is staged and the agent should exit with code 75. */
    boolean stage(JsonNode release, String runningVersion) {
        String v = release.path("version").asText("");
        if (v.isEmpty() || compare(v, runningVersion) <= 0) return false;
        if (v.equals(read(skipFile()))) { problem = "Version " + v + " could not start on this computer earlier and is not installed again by itself. Press Sync for update to try it once more."; return false; }
        problem = "";
        Path self = cfg.home.resolve("serpsquad-agent.jar");
        if (!Files.isRegularFile(self)) {
            problem = "Version " + v + " is published, but this agent was not started from serpsquad-agent.jar in its own folder, so it cannot update itself.";
            Log.info("Version " + v + " is published, but this agent was not started from serpsquad-agent.jar in " + cfg.home + ", so it cannot update itself.");
            return false;
        }
        Path part = cfg.home.resolve("serpsquad-agent-download.part");
        try {
            Log.info("Downloading agent version " + v + "…");
            Files.deleteIfExists(part);
            crm.downloadRelease(part);
            byte[] bytes = Files.readAllBytes(part);
            if (bytes.length != release.path("size").asLong(-1) || !SyncStore.sha256(bytes).equals(release.path("sha256").asText(""))) {
                Files.deleteIfExists(part);
                problem = "The download of version " + v + " did not match its checksum and was discarded. It is tried again at the next check.";
                Log.warn("The downloaded update did not match its checksum and was discarded.");
                return false;
            }
            String java = Path.of(System.getProperty("java.home"), "bin", "java").toString();
            Process p = new ProcessBuilder(java, "-jar", part.toString(), "selftest").redirectErrorStream(true).redirectOutput(ProcessBuilder.Redirect.DISCARD).start();
            if (!p.waitFor(60, TimeUnit.SECONDS) || p.exitValue() != 0) {
                p.destroyForcibly();
                Files.deleteIfExists(part);
                Files.writeString(skipFile(), v, StandardCharsets.UTF_8);
                problem = "Version " + v + " failed its self-test on this computer and was not installed. This version keeps working.";
                Log.warn("Version " + v + " failed its self-test and was not installed.");
                return false;
            }
            Files.createDirectories(cfg.dataDir());
            Files.move(part, cfg.home.resolve("serpsquad-agent-next.jar"), StandardCopyOption.REPLACE_EXISTING);
            Files.writeString(pendingFile(), v, StandardCharsets.UTF_8);
            Log.info("Version " + v + " is verified. Restarting to install it.");
            return true;
        } catch (Exception e) {
            try { Files.deleteIfExists(part); } catch (Exception ignored) { /* best effort */ }
            problem = "The update could not be downloaded: " + Json.clip(String.valueOf(e.getMessage()), 160);
            Log.warn("The update could not be installed: " + e.getMessage());
            return false;
        }
    }
}
