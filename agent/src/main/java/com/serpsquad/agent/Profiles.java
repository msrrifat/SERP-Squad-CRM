package com.serpsquad.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;

/**
 * Chrome IDs: the named, separate Chrome profiles on this computer that a
 * person signed in to once (one per Google account or social login). A
 * project's channels in the CRM name the Chrome ID to use, so each client's
 * work happens in the right signed-in session and nowhere else. The agent
 * never signs in itself.
 */
final class Profiles {
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private final Config cfg;
    private ArrayNode list = Json.arr();

    Profiles(Config cfg) {
        this.cfg = cfg;
        load();
    }

    private Path file() { return cfg.dataDir().resolve("browser-profiles.json"); }

    private synchronized void load() {
        try {
            JsonNode n = Json.parse(Files.readString(file(), StandardCharsets.UTF_8));
            if (n.isArray()) list = (ArrayNode) n;
        } catch (Exception ignored) { /* none yet */ }
        /* the single Google profile of earlier versions becomes the first Chrome ID */
        if (list.isEmpty() && Files.isDirectory(cfg.dataDir().resolve("chrome-google"))) {
            ObjectNode p = list.addObject();
            p.put("id", newId()).put("name", "Google account").put("dir", "chrome-google").put("createdAt", System.currentTimeMillis());
            save();
        }
    }

    private void save() {
        try {
            Files.createDirectories(cfg.dataDir());
            Files.writeString(file(), Json.str(list), StandardCharsets.UTF_8);
        } catch (Exception e) {
            Log.warn("The list of Chrome IDs could not be saved: " + e.getMessage());
        }
    }

    private String newId() {
        SecureRandom r = new SecureRandom();
        while (true) {
            StringBuilder s = new StringBuilder("CH-");
            for (int i = 0; i < 4; i++) s.append(ALPHABET.charAt(r.nextInt(ALPHABET.length())));
            if (find(s.toString()) == null) return s.toString();
        }
    }

    private ObjectNode find(String id) {
        for (JsonNode p : list) if (p.path("id").asText().equals(id)) return (ObjectNode) p;
        return null;
    }

    /** For the CRM and the application: id, name and whether the profile folder exists yet. */
    synchronized ArrayNode view() {
        ArrayNode out = Json.arr();
        for (JsonNode p : list) {
            Path dir = dir(p.path("id").asText());
            out.addObject().put("id", p.path("id").asText()).put("name", p.path("name").asText()).put("createdAt", p.path("createdAt").asLong()).put("opened", dir != null && Files.isDirectory(dir));
        }
        return out;
    }

    synchronized int size() { return list.size(); }

    synchronized String add(String name) {
        String id = newId();
        list.addObject().put("id", id).put("name", Json.clip(name == null || name.isBlank() ? "Chrome profile" : name.trim(), 60)).put("dir", "chrome-profiles/" + id).put("createdAt", System.currentTimeMillis());
        save();
        return id;
    }

    synchronized boolean rename(String id, String name) {
        ObjectNode p = find(id);
        if (p == null || name == null || name.isBlank()) return false;
        p.put("name", Json.clip(name.trim(), 60));
        save();
        return true;
    }

    /** Forget a Chrome ID and delete its profile folder (the sign-in goes with it). */
    synchronized boolean remove(String id) {
        ObjectNode p = find(id);
        if (p == null) return false;
        Path dir = dir(id);
        for (int i = 0; i < list.size(); i++) if (list.get(i).path("id").asText().equals(id)) { list.remove(i); break; }
        save();
        if (dir != null && dir.startsWith(cfg.dataDir())) SyncStore.deleteTree(dir);
        return true;
    }

    /** The profile folder of a Chrome ID, or null when this computer does not have it. */
    synchronized Path dir(String id) {
        ObjectNode p = find(id);
        if (p == null) return null;
        String d = p.path("dir").asText("");
        if (d.isBlank() || d.contains("..")) return null;
        return cfg.dataDir().resolve(d).normalize();
    }

    /** A stable debugging port per Chrome ID, so two profiles never share a Chrome instance. */
    synchronized int port(String id) {
        for (int i = 0; i < list.size(); i++) if (list.get(i).path("id").asText().equals(id)) return 9340 + i;
        return 9339;
    }
}
