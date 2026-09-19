package com.xray.infrastructure.web.dto;

import java.util.List;

/**
 * The "Qué hacer ahora" block of the entity page (docs/RECOMMENDATIONS.md). situation null when the pipeline predates
 * the recommendations stage. missing = categories of the profile with no data this month.
 */
public record RecommendationsDto(String situation, String summary, int history, boolean limitedHistory,
                                 List<String> missing, List<Item> items) {

    /** points null for an opportunity; target and goal null when there is no target value. */
    public record Item(int rank, String indicatorId, String category, String kind, String variant, String severity,
                       boolean survival, boolean worsening, Double points, Double value, Double target, String title,
                       String why, String action, String goal) {
    }

    public static RecommendationsDto empty() {
        return new RecommendationsDto(null, null, 0, false, List.of(), List.of());
    }
}
