package com.xray.infrastructure.web.dto;

import java.util.List;

public record ActionPlanDto(String source, String objective, String diagnosis, List<String> risks,
                            String summary, List<ActionStepDto> steps) {
    public record ActionStepDto(String phase, String priority, String title, String why, String action,
                                 String firstStep, String timeframe, String owner, String metric) {
    }
}
