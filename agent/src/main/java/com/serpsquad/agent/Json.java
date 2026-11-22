package com.serpsquad.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/** One shared JSON mapper and a few shorthands. */
final class Json {
    static final ObjectMapper M = new ObjectMapper();

    private Json() {}

    static ObjectNode obj() { return M.createObjectNode(); }

    static ArrayNode arr() { return M.createArrayNode(); }

    static JsonNode parse(String s) {
        try { return M.readTree(s); } catch (Exception e) { throw new IllegalArgumentException("Not valid JSON: " + e.getMessage()); }
    }

    static String str(JsonNode n) {
        try { return M.writeValueAsString(n); } catch (Exception e) { throw new IllegalStateException(e); }
    }

    static String pretty(JsonNode n) {
        try { return M.writerWithDefaultPrettyPrinter().writeValueAsString(n); } catch (Exception e) { throw new IllegalStateException(e); }
    }

    static String text(JsonNode n, String field, String dflt) {
        JsonNode v = n == null ? null : n.get(field);
        return v == null || v.isNull() ? dflt : v.asText(dflt);
    }

    static String clip(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max) + "…";
    }
}
