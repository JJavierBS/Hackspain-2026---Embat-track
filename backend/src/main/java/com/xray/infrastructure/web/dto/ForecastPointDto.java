package com.xray.infrastructure.web.dto;

/**
 * One projected month: month = origin + horizon. value is the projected final score, 1 decimal.
 * actual = the final score measured at that month, or null when the month has no score yet (display only:
 * the projection was made at the origin and never reads it).
 */
public record ForecastPointDto(String month, int horizon, Double value, Double actual) {
}
