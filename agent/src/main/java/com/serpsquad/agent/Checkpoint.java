package com.serpsquad.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.stream.Stream;

/**
 * Where a running task stands, kept on this computer so the run can be
 * carried on after a power cut, a crash or a restart.
 *
 * Two files per task. The first holds the conversation so far and is written
 * once per turn. The second is small and written around every single step: it
 * says which steps of the current turn are finished (with their results) and
 * which one was in progress. After a restart that is what tells the agent
 * exactly where it stopped, and which step may or may not have taken effect.
 *
 * Nothing here is a key: the task's Claude key is never written, and the
 * conversation holds only what the agent was given, which had passwords and
 * keys masked before it reached Claude. Both files are deleted when the run
 * ends in any ordinary way.
 */
final class Checkpoint {
    private static final long KEEP_MS = 24 * 3600000L;      // the CRM does not hand a run back after this long either
    private final Path main, step;

    Checkpoint(Path dataDir, String taskId) {
        String id = taskId.replaceAll("[^A-Za-z0-9_-]", "");
        Path dir = dir(dataDir);
        this.main = dir.resolve(id + ".json");
        this.step = dir.resolve(id + ".step.json");
    }

    static Path dir(Path dataDir) { return dataDir.resolve("checkpoints"); }

    private static void write(Path file, JsonNode body) {
        try {
            Files.createDirectories(file.getParent());
            Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
            Files.writeString(tmp, Json.str(body), StandardCharsets.UTF_8);
            try { Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE); }
            catch (java.nio.file.AtomicMoveNotSupportedException e) { Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING); }
        } catch (Exception e) {
            Log.warn("The run's progress could not be saved on this computer: " + e.getMessage());
        }
    }

    /** The conversation and the state of the run, after a turn. Clears the step file: no step is in progress. */
    void turn(ObjectNode state) {
        state.put("savedAt", System.currentTimeMillis());
        write(main, state);
        try { Files.deleteIfExists(step); } catch (Exception ignored) { /* overwritten at the next step */ }
    }

    /** The steps of the turn that is being carried out. */
    void step(ObjectNode state) { write(step, state); }

    void delete() {
        try { Files.deleteIfExists(main); } catch (Exception ignored) { /* found and removed at the next start */ }
        try { Files.deleteIfExists(step); } catch (Exception ignored) { /* as above */ }
    }

    /**
     * The run that was in progress when this computer last stopped, or null.
     * Anything unreadable or too old to be carried on is removed.
     */
    static ObjectNode pending(Path dataDir) {
        Path dir = dir(dataDir);
        if (!Files.isDirectory(dir)) return null;
        ObjectNode newest = null;
        try (Stream<Path> files = Files.list(dir)) {
            for (Path f : (Iterable<Path>) files::iterator) {
                String name = f.getFileName().toString();
                if (name.endsWith(".tmp")) { Files.deleteIfExists(f); continue; }
                if (!name.endsWith(".json") || name.endsWith(".step.json")) continue;
                JsonNode j = null;
                try { j = Json.parse(Files.readString(f, StandardCharsets.UTF_8)); } catch (Exception ignored) { /* half written when the power went: the earlier turn is gone too */ }
                boolean usable = j != null && j.isObject() && j.path("history").isArray() && j.path("history").size() > 0 && !j.path("taskId").asText("").isEmpty()
                    && System.currentTimeMillis() - j.path("savedAt").asLong(0) < KEEP_MS;
                if (!usable) { new Checkpoint(dataDir, name.substring(0, name.length() - 5)).delete(); continue; }
                ObjectNode o = (ObjectNode) j;
                Path s = dir.resolve(name.substring(0, name.length() - 5) + ".step.json");
                if (Files.exists(s)) {
                    try { JsonNode st = Json.parse(Files.readString(s, StandardCharsets.UTF_8)); if (st != null && st.isObject() && st.path("turn").asInt(-1) == o.path("turn").asInt(-2)) o.set("step", st); } catch (Exception ignored) { /* the step file was being written: treated as "in progress, unknown" */ }
                }
                if (newest == null || o.path("savedAt").asLong(0) > newest.path("savedAt").asLong(0)) newest = o;
            }
        } catch (Exception e) {
            return null;
        }
        return newest;
    }

    static void forget(Path dataDir, String taskId) { new Checkpoint(dataDir, taskId).delete(); }
}
