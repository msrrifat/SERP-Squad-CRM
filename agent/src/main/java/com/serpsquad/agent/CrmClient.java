package com.serpsquad.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;

/** Outbound-only HTTP to the CRM's agent endpoints, signed with this device's token. */
final class CrmClient {
    static final class CrmException extends Exception {
        final int status;

        CrmException(int status, String message) { super(message); this.status = status; }
    }

    private final String base;
    private final String token;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(20)).followRedirects(HttpClient.Redirect.NEVER).build();

    CrmClient(Config cfg) {
        this.base = cfg.serverUrl + "/api/agentops/";
        this.token = cfg.deviceToken;
    }

    /** The device token and the keys the CRM hands over travel only over https (or to this computer, for tests). */
    private void requireSecure() throws CrmException {
        if (!base.matches("(?i)https://.+") && !base.matches("(?i)http://(localhost|127\\.0\\.0\\.1)(:\\d+)?/.*")) throw new CrmException(0, "The CRM address must start with https://. Change it under Settings, Change connection.");
    }

    /**
     * One request to the CRM. "Too many requests" is not a failure of the
     * request itself: it is sent again after a short wait (twice at most), so
     * a burst of tool calls does not turn into errors the agent has to reason
     * about.
     */
    JsonNode post(String path, ObjectNode body) throws CrmException {
        for (int attempt = 1; ; attempt++) {
            try {
                return postOnce(path, body);
            } catch (CrmException e) {
                if (e.status != 429 || attempt >= 3) throw e;
                try { Thread.sleep(6000L * attempt); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); throw new CrmException(0, "interrupted"); }
            }
        }
    }

    private JsonNode postOnce(String path, ObjectNode body) throws CrmException {
        requireSecure();
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(base + path))
                .timeout(Duration.ofSeconds(90))
                .header("Content-Type", "application/json")
                .header("X-Agent-Token", token)
                .POST(HttpRequest.BodyPublishers.ofString(Json.str(body == null ? Json.obj() : body), StandardCharsets.UTF_8))
                .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            JsonNode out;
            try { out = Json.parse(res.body()); } catch (Exception e) { out = Json.obj(); }
            if (res.statusCode() == 409 && out.has("stop")) return out;           // "this task is no longer yours" is an answer, not a failure
            if (res.statusCode() / 100 != 2) {
                throw new CrmException(res.statusCode(), Json.text(out, "detail", Json.text(out, "error", "HTTP " + res.statusCode())));
            }
            return out;
        } catch (CrmException e) {
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new CrmException(0, "interrupted");
        } catch (Exception e) {
            throw new CrmException(0, "The CRM could not be reached: " + e.getClass().getSimpleName() + (e.getMessage() == null ? "" : " " + e.getMessage()));
        }
    }

    static final class Raw {
        final int status;
        final String body;

        Raw(int status, String body) { this.status = status; this.body = body; }
    }

    /**
     * Forward one settings request from the application window to the CRM,
     * signed with this device's token, and hand back the CRM's answer as it
     * is. The CRM decides whether this device may manage settings.
     */
    Raw forward(String method, String pathAndQuery, String jsonBody) throws CrmException {
        requireSecure();
        try {
            HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(base + pathAndQuery)).timeout(Duration.ofSeconds(90)).header("X-Agent-Token", token);
            if ("GET".equals(method)) b.GET();
            else b.header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(jsonBody == null || jsonBody.isBlank() ? "{}" : jsonBody, StandardCharsets.UTF_8));
            HttpResponse<String> res = http.send(b.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            return new Raw(res.statusCode(), res.body());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new CrmException(0, "interrupted");
        } catch (Exception e) {
            throw new CrmException(0, "The CRM could not be reached: " + e.getClass().getSimpleName());
        }
    }

    /** Download the published agent jar to a file. */
    void downloadRelease(Path target) throws CrmException {
        requireSecure();
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(base + "release/download")).timeout(Duration.ofMinutes(10)).header("X-Agent-Token", token).GET().build();
            HttpResponse<Path> res = http.send(req, HttpResponse.BodyHandlers.ofFile(target));
            if (res.statusCode() != 200) throw new CrmException(res.statusCode(), "The release download failed with HTTP " + res.statusCode());
        } catch (CrmException e) {
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new CrmException(0, "interrupted");
        } catch (Exception e) {
            throw new CrmException(0, "The release could not be downloaded: " + e.getMessage());
        }
    }
}
