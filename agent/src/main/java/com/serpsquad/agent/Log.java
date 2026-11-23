package com.serpsquad.agent;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

/** Console plus a daily log file. Secrets are never passed in here. */
final class Log {
    private static volatile Path dir;
    private static final DateTimeFormatter T = DateTimeFormatter.ofPattern("HH:mm:ss");
    private static final ArrayDeque<String> RECENT = new ArrayDeque<>();

    private Log() {}

    static void init(Path logDir) {
        try { Files.createDirectories(logDir); dir = logDir; } catch (Exception e) { dir = null; }
    }

    /**
     * Housekeeping at start: files in a folder that have not been written to
     * for the given number of days are removed, and so is a log that has
     * grown past 20 MB (Chrome's own log is only ever added to). Daily logs
     * and screenshots would otherwise pile up for ever.
     */
    static void prune(Path folder, int days) {
        if (folder == null || !Files.isDirectory(folder)) return;
        long old = System.currentTimeMillis() - days * 86400000L;
        try (java.util.stream.Stream<Path> files = Files.list(folder)) {
            for (Path f : (Iterable<Path>) files::iterator) {
                try {
                    if (!Files.isRegularFile(f)) continue;
                    boolean big = f.getFileName().toString().endsWith(".log") && Files.size(f) > 20_000_000L;
                    if (big || Files.getLastModifiedTime(f).toMillis() < old) Files.deleteIfExists(f);
                } catch (Exception ignored) { /* a file in use is left for the next start */ }
            }
        } catch (Exception ignored) { /* housekeeping must never stop the agent */ }
    }

    static synchronized void info(String msg) {
        String line = LocalTime.now().format(T) + "  " + Redact.text(msg);
        System.out.println(line);
        RECENT.addLast(line);
        while (RECENT.size() > 200) RECENT.removeFirst();
        Path d = dir;
        if (d == null) return;
        try {
            Files.writeString(d.resolve("agent-" + LocalDate.now() + ".log"), line + System.lineSeparator(), StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (Exception ignored) { /* logging must never stop the agent */ }
    }

    static void warn(String msg) { info("WARN  " + msg); }

    /** The latest lines, oldest first (shown in the local dashboard). */
    static synchronized List<String> recent(int max) {
        List<String> all = new ArrayList<>(RECENT);
        return all.subList(Math.max(0, all.size() - max), all.size());
    }
}
