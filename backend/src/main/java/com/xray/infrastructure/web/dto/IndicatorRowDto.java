package com.xray.infrastructure.web.dto;

public record IndicatorRowDto(String indicatorId, String category, Double value, Double level, Double traj,
                              boolean available, boolean isStatic, boolean fallback, String anchorStatus) {
}
