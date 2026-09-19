package com.xray.infrastructure.web.dto;

/** One projected month: month = origin + horizon. value is the projected final score, 1 decimal. */
public record ForecastPointDto(String month, int horizon, Double value) {
}
