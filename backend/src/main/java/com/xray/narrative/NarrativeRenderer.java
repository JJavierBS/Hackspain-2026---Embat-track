package com.xray.narrative;

import com.xray.domain.model.RawIndicator;
import com.xray.domain.service.RecommendationEngine;

/**
 * Extension point #3 (ARCHITECTURE §8.3). One line for a driver whose contribution moved by deltaPoints
 * between two months. before or after is null for MOMENTUM. Called at pipeline time only, never in a request.
 * The signature differs from ARCHITECTURE §8.3 so a 1-month and a 3-month delta can share it (phase 4 decision E7).
 */
public interface NarrativeRenderer {
    String render(String driverId, RawIndicator before, RawIndicator after, double deltaPoints);

    /** The text of one recommendation (docs/RECOMMENDATIONS.md). goal is null when the finding has no target. */
    RecommendationText recommendation(RecommendationEngine.Finding finding);

    /** The line that frames the recommendations of one entity-month-profile. */
    String situation(RecommendationEngine.Summary summary, int findings);

    record RecommendationText(String title, String why, String action, String goal) {
    }
}
