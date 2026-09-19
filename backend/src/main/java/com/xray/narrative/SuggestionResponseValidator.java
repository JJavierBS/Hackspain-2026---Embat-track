package com.xray.narrative;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class SuggestionResponseValidator {
    private final ObjectMapper json;

    public SuggestionResponseValidator(ObjectMapper json) {
        this.json = json;
    }

    public List<String> validate(String content, List<AttentionPlanner.Candidate> candidates) {
        try {
            JsonNode root = json.readTree(content);
            if (!fields(root, Set.of("v", "mode", "items")) || !"suggestions.v3".equals(root.path("v").asText())
                    || !"atencion".equals(root.path("mode").asText()) || !root.path("items").isArray()
                    || root.path("items").size() != candidates.size()) throw new IllegalArgumentException();
            List<String> result = new ArrayList<>();
            for (int i = 0; i < candidates.size(); i++) {
                var c = candidates.get(i);
                var item = root.path("items").get(i);
                String text = item.path("text").asText();
                if (!fields(item, Set.of("id", "text", "refs")) || !c.id().equals(item.path("id").asText())
                        || !c.allowedTexts().contains(text) || text.strip().split("\\s+").length > 25
                        || !item.path("refs").isArray() || item.path("refs").size() != 1
                        || !c.evidence().ref().equals(item.path("refs").get(0).asText())) {
                    throw new IllegalArgumentException();
                }
                result.add(text);
            }
            return List.copyOf(result);
        } catch (Exception e) {
            throw new IllegalArgumentException("Respuesta de sugerencias no válida");
        }
    }

    private boolean fields(JsonNode node, Set<String> allowed) {
        if (node == null || !node.isObject()) return false;
        Set<String> actual = new HashSet<>();
        node.fieldNames().forEachRemaining(actual::add);
        return actual.equals(allowed);
    }
}
