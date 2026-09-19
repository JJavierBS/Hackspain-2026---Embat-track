package com.xray.infrastructure.web.dto;

import java.util.List;

public record ActionPlanRequest(String entityId, String entityName, String month,
                                String profile, double score, Double level, Double trajectory,
                                String status, String regime, int activeAlerts, List<String> changes,
                                List<Recommendation> recommendations) {
    public record Recommendation(String category, String title, String action, String indicator, Double value,
                                 double level, Double trajectory) {
    }
}
