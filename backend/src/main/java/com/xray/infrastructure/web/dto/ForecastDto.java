package com.xray.infrastructure.web.dto;

import java.util.List;

/**
 * The projection made at the origin month (phase 7, decisions H11–H14). reliability is LOW, MEDIUM or HIGH from
 * the scored months up to the origin (history), or null with no points when the origin has no forecast.
 * horizon = months served (the ?horizon param, clamped to 1..maxHorizon). median = the value it reverts to.
 * meanAbsError and bias (mean of value - actual) cover the points with an actual; null when none has one.
 */
public record ForecastDto(String origin, String reliability, Integer history, Double median, int horizon,
                          int maxHorizon, List<ForecastPointDto> points, Double meanAbsError, Double bias) {
}
