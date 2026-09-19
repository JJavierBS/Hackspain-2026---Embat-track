package com.xray.domain.service;

import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Java equivalent of scripts/scoring/cusum_forecast.py. */
@Service
public final class CusumForecast {

    private final HealthScoring healthScoring;

    public CusumForecast(HealthScoring healthScoring) {
        this.healthScoring = healthScoring;
    }

    public ForecastResult forecast(Path weightsPath, String profile, double alertThreshold,
                                   String entityId, int forecastMonths, int recentWindow,
                                   double damping, double cusumK, double cusumH) throws IOException {
        return forecast(weightsPath, profile, alertThreshold, entityId, null,
            forecastMonths, recentWindow, damping, cusumK, cusumH);
        }

        public ForecastResult forecast(Path weightsPath, String profile, double alertThreshold,
                       String entityId, String entityType, int forecastMonths,
                       int recentWindow, double damping, double cusumK, double cusumH)
            throws IOException {
        List<HealthScoring.HealthResult> history = "GROUP".equals(entityType)
            ? healthScoring.scoreGroupAverage(weightsPath, profile, alertThreshold, entityId)
            : healthScoring.score(weightsPath, profile, alertThreshold, entityId, entityType);
        history = history.stream()
                .sorted(Comparator.comparing(HealthScoring.HealthResult::month))
                .toList();

        List<Double> values = history.stream()
                .map(HealthScoring.HealthResult::globalIndex)
                .toList();
        List<Double> recent = values.subList(Math.max(0, values.size() - Math.max(2, recentWindow)), values.size());
        double slope = linearSlope(recent);
        CusumResult cusum = detectCusum(values, cusumK, cusumH);
        Reliability resultReliability = reliability(values.size());
        List<ForecastPoint> points = dampedForecast(values, forecastMonths, recentWindow, damping, alertThreshold);
        HealthScoring.HealthResult latest = history.isEmpty() ? null : history.get(history.size() - 1);

        return new ForecastResult(entityId, profile, values.size(), latest, slope, damping,
                resultReliability, cusum, points);
    }

    public static double linearSlope(List<Double> values) {
        if (values.size() < 2) {
            return 0;
        }
        double meanX = (values.size() - 1) / 2.0;
        double meanY = values.stream().mapToDouble(Double::doubleValue).average().orElse(0);
        double denominator = 0;
        double numerator = 0;
        for (int index = 0; index < values.size(); index++) {
            denominator += Math.pow(index - meanX, 2);
            numerator += (index - meanX) * (values.get(index) - meanY);
        }
        return numerator / denominator;
    }

    public static CusumResult detectCusum(List<Double> values, double k, double h) {
        if (k < 0 || h <= 0) {
            throw new IllegalArgumentException("CUSUM k must be >= 0 and h must be > 0");
        }
        if (values.size() < 2) {
            return new CusumResult(false, null, 0, null, null, k, h);
        }

        List<Double> deltas = new ArrayList<>();
        for (int index = 1; index < values.size(); index++) {
            deltas.add(values.get(index) - values.get(index - 1));
        }
        int baselineSize = Math.max(1, deltas.size() / 2);
        double baseline = deltas.subList(0, baselineSize).stream()
                .mapToDouble(Double::doubleValue).average().orElse(0);
        double positive = 0;
        double negative = 0;
        double maxScore = 0;
        Integer alarmIndex = null;
        String direction = null;
        for (int index = baselineSize; index < deltas.size(); index++) {
            double delta = deltas.get(index);
            positive = Math.max(0, positive + delta - baseline - k);
            negative = Math.max(0, negative + baseline - delta - k);
            maxScore = Math.max(maxScore, Math.max(positive, negative));
            if (alarmIndex == null && positive >= h) {
                alarmIndex = index + 1;
                direction = "IMPROVING";
            } else if (alarmIndex == null && negative >= h) {
                alarmIndex = index + 1;
                direction = "DECLINING";
            }
        }
        return new CusumResult(alarmIndex != null, direction, maxScore, alarmIndex, baseline, k, h);
    }

    public static List<ForecastPoint> dampedForecast(List<Double> values, int months,
                                                     int recentWindow, double damping,
                                                     double alertThreshold) {
        if (months < 1) {
            throw new IllegalArgumentException("forecast months must be at least 1");
        }
        if (damping <= 0 || damping > 1) {
            throw new IllegalArgumentException("damping must be greater than 0 and at most 1");
        }
        if (values.isEmpty()) {
            return List.of();
        }
        List<Double> recent = values.subList(Math.max(0, values.size() - Math.max(2, recentWindow)), values.size());
        double slope = linearSlope(recent);
        double previous = values.get(values.size() - 1);
        List<ForecastPoint> result = new ArrayList<>();
        for (int step = 1; step <= months; step++) {
            previous = clamp(previous + slope * Math.pow(damping, step - 1));
            result.add(new ForecastPoint(step, previous, previous < alertThreshold));
        }
        return result;
    }

    public static Reliability reliability(int historyMonths) {
        if (historyMonths < 6) {
            return new Reliability("LOW", false,
                    "Menos de 6 meses de histórico: el resultado CUSUM no es fiable.");
        }
        if (historyMonths < 8) {
            return new Reliability("MEDIUM", false,
                    "Entre 6 y 7 meses de histórico: la fiabilidad del resultado CUSUM es limitada.");
        }
        return new Reliability("HIGH", true,
                "Al menos 8 meses de histórico: el resultado CUSUM se considera fiable.");
    }

    private static double clamp(double value) {
        return Math.max(0, Math.min(1, value));
    }

    public record CusumResult(boolean alarm, String direction, double score, Integer monthIndex,
                              Double baselineDelta, double k, double h) {
    }

    public record Reliability(String level, boolean reliable, String message) {
    }

    public record ForecastPoint(int monthsAhead, double globalIndex, boolean imminentFailureRisk) {
    }

    public record ForecastResult(String entityId, String profile, int historyMonths,
                                 HealthScoring.HealthResult latest, double recentSlopePerMonth,
                                 double damping, Reliability reliability, CusumResult cusum,
                                 List<ForecastPoint> forecast) {
    }
}