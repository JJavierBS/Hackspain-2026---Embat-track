package com.xray.narrative;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import com.xray.infrastructure.web.dto.SuggestionsDto.Evidence;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

class HelmcodeSuggestionRendererTest {
    private final ObjectMapper json = new ObjectMapper();
    private final List<AttentionPlanner.Candidate> candidates = new AttentionPlanner().plan(List.of(
            new Evidence("2026-07:CF_IN_OUT_RATIO", "CF_IN_OUT_RATIO", "2026-07", .4, 10.0,
                    40.0, .2, false, false, "CLOSED", "ratio")), "2026-07");

    @Test
    void validResponseAndMinimalRequestWithoutEntityIdentifiers() throws Exception {
        var c = candidates.getFirst();
        String content = json.writeValueAsString(Map.of("v", "suggestions.v3", "mode", "atencion", "items",
                List.of(Map.of("id", c.id(), "text", c.text(), "refs", List.of(c.evidence().ref())))));
        String body = json.writeValueAsString(Map.of("choices", List.of(Map.of("finish_reason", "stop",
                "message", Map.of("content", content)))));
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var calls = new AtomicInteger();
        server.createContext("/chat/completions", exchange -> {
            calls.incrementAndGet();
            String request = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            assertFalse(request.contains("GROUP_"));
            assertFalse(request.contains("COMP_"));
            assertFalse(request.contains("test-token"));
            assertEquals("Bearer test-token", exchange.getRequestHeaders().getFirst("Authorization"));
            assertEquals("low", json.readTree(request).path("reasoning_effort").asText());
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        try {
            var result = renderer(server, Duration.ofSeconds(2)).render("test-token", "glm5.3", candidates);
            assertEquals("READY", result.state());
            assertEquals(List.of(c.text()), result.texts());
            assertEquals(1, calls.get());
        } finally { server.stop(0); }
    }

    @Test
    void httpFailuresDoNotRetryAndMissingKeyDoesNotCall() throws Exception {
        for (int status : List.of(402, 429, 500)) {
            var calls = new AtomicInteger();
            var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/chat/completions", exchange -> {
                calls.incrementAndGet(); exchange.sendResponseHeaders(status, -1); exchange.close();
            });
            server.start();
            try {
                var renderer = renderer(server, Duration.ofSeconds(2));
                assertEquals("MISSING_KEY", renderer.render(null, "glm5.3", candidates).state());
                assertEquals(0, calls.get());
                assertEquals("PROVIDER_UNAVAILABLE", renderer.render("test-token", "deepseek-v4-flash", candidates).state());
                assertEquals(1, calls.get());
            } finally { server.stop(0); }
        }
    }

    @Test
    void timeoutFallsBack() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/chat/completions", exchange -> {
            try { Thread.sleep(150); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            exchange.close();
        });
        server.start();
        try {
            var result = renderer(server, Duration.ofMillis(30)).render("test-token", "glm5.3", candidates);
            assertTrue(result.texts().isEmpty());
            assertNotEquals("READY", result.state());
        } finally { server.stop(0); }
    }

    private HelmcodeSuggestionRenderer renderer(HttpServer server, Duration timeout) {
        return new HelmcodeSuggestionRenderer(json, HttpClient.newHttpClient(),
                URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/chat/completions"), timeout);
    }
}
