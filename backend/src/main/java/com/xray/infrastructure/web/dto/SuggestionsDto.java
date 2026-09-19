package com.xray.infrastructure.web.dto;

import java.util.List;

public record SuggestionsDto(String v, String mode, String state, String source, String runId, String model,
                             String generatedAt, String limitation, List<Item> items) {
    public record Evidence(String ref, String indicatorId, String month, Double value, Double level, Double trajectory,
                           double effectiveWeight, boolean isStatic, boolean fallback, String anchorStatus, String unit) {}
    public record Item(String id, String text, List<String> refs, Evidence evidence, Double impactoCalculado) {}

    public static SuggestionsDto unavailable(String state) {
        return new SuggestionsDto("suggestions.v3", "atencion", state, "none", null, null, null,
                "Prioridades de atención, no mejoras de puntuación calculadas ni recomendaciones de financiación.", List.of());
    }
}
