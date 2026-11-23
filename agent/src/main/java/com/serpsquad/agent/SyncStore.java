package com.serpsquad.agent;

import com.fasterxml.jackson.databind.JsonNode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.stream.Stream;

/**
 * The synced copy of what the CRM controls: playbooks, shared settings and the
 * list of CRM tools. A sync is written to a staging folder, every file is
 * checked against its SHA-256, and only then does the staging folder replace
 * the live one, so a half-finished download can never be used.
 */
final class SyncStore {
    private final Path root;
    private volatile JsonNode settings = Json.obj();
    private volatile JsonNode tools = Json.arr();
    private volatile long rev = 0;

    SyncStore(Path dataDir) {
        this.root = dataDir.resolve("sync");
        reload();
    }

    private Path current() { return root.resolve("current"); }

    long rev() { return rev; }

    JsonNode settings() { return settings; }

    JsonNode tools() { return tools; }

    String playbook(String key) {
        try { return Files.readString(current().resolve(key + ".md"), StandardCharsets.UTF_8); } catch (Exception e) { return ""; }
    }

    static String sha256(byte[] bytes) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    private void reload() {
        try {
            Path cur = current();
            if (!Files.isDirectory(cur)) return;
            rev = Long.parseLong(Files.readString(cur.resolve("rev.txt"), StandardCharsets.UTF_8).trim());
            settings = Json.parse(Files.readString(cur.resolve("settings.json"), StandardCharsets.UTF_8));
            tools = Json.parse(Files.readString(cur.resolve("tools.json"), StandardCharsets.UTF_8));
        } catch (Exception e) {
            rev = 0;
        }
    }

    /** Apply a sync payload. Returns the number of playbooks installed. */
    synchronized int apply(JsonNode payload) throws Exception {
        Files.createDirectories(root);
        Path staging = root.resolve("staging-" + System.currentTimeMillis());
        Files.createDirectories(staging);
        int n = 0;
        try {
            for (JsonNode f : payload.path("files")) {
                String name = f.path("name").asText("");
                if (!name.matches("[A-Za-z0-9_-]+\\.md")) throw new IllegalStateException("Unexpected file name in sync: " + name);
                byte[] bytes = f.path("text").asText("").getBytes(StandardCharsets.UTF_8);
                if (!sha256(bytes).equals(f.path("sha256").asText(""))) throw new IllegalStateException("Checksum mismatch for " + name);
                Files.write(staging.resolve(name), bytes);
                n += 1;
            }
            if (n == 0) throw new IllegalStateException("The sync contained no playbooks.");
            Files.writeString(staging.resolve("settings.json"), Json.str(payload.path("settings")), StandardCharsets.UTF_8);
            Files.writeString(staging.resolve("tools.json"), Json.str(payload.path("tools")), StandardCharsets.UTF_8);
            Files.writeString(staging.resolve("rev.txt"), String.valueOf(payload.path("rev").asLong(0)), StandardCharsets.UTF_8);
            Path prev = root.resolve("previous");
            deleteTree(prev);
            boolean moved = false;
            if (Files.isDirectory(current())) { Files.move(current(), prev, StandardCopyOption.ATOMIC_MOVE); moved = true; }
            try {
                Files.move(staging, current(), StandardCopyOption.ATOMIC_MOVE);
            } catch (Exception e) {
                /* the new set could not be put in place: the old one goes back, so the agent is never left without playbooks */
                if (moved && !Files.exists(current())) { try { Files.move(prev, current(), StandardCopyOption.ATOMIC_MOVE); } catch (Exception ignored) { /* reported by the caller */ } }
                throw e;
            }
        } catch (Exception e) {
            deleteTree(staging);
            throw e;
        }
        reload();
        return n;
    }

    static void deleteTree(Path p) {
        if (!Files.exists(p)) return;
        try (Stream<Path> walk = Files.walk(p)) {
            walk.sorted(Comparator.reverseOrder()).forEach((x) -> { try { Files.delete(x); } catch (Exception ignored) { /* best effort */ } });
        } catch (Exception ignored) { /* best effort */ }
    }
}
