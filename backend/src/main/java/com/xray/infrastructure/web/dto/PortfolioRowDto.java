package com.xray.infrastructure.web.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/** One scored entity at one month. `final` is a Java keyword, so the component is finalScore. */
public record PortfolioRowDto(String id, String name, String entityType, @JsonProperty("final") double finalScore,
                              double level, Double traj, String band, String status, String regime, Double delta3m,
                              List<Double> sparkline, int activeAlerts, String confidence) {
}
