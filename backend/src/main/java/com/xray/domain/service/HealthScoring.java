package com.xray.domain.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xray.config.IndicatorConfig;
import com.xray.config.ScoringConfig;
import com.xray.domain.model.IndicatorId;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Java equivalent of scripts/scoring/health_scoring.py. */
@Service
public final class HealthScoring {

    private static final Map<String, IndicatorId> INDICATOR_ALIASES = Map.of(
            "ACT_GROWTH", IndicatorId.ACT_COLLECTIONS_GROWTH,
            "PAY_LATENESS", IndicatorId.PAY_SUPPLIER_LATENESS,
            "PAY_OVERDUE", IndicatorId.PAY_OVERDUE_PAYABLES);

    private final JdbcTemplate jdbc;
    private final ScoringConfig config;
    private final ObjectMapper objectMapper;

    public HealthScoring(JdbcTemplate jdbc, ScoringConfig config, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.config = config;
        this.objectMapper = objectMapper;
    }

    public List<HealthResult> score(Path weightsPath, String profile, double alertThreshold, String entityId)
            throws IOException {
        return score(weightsPath, profile, alertThreshold, entityId, null);
        }

        public List<HealthResult> score(Path weightsPath, String profile, double alertThreshold,
                        String entityId, String entityType) throws IOException {
        Map<IndicatorId, Double> weights = loadWeights(weightsPath, profile);
        validateWeights(weights);
        Map<IndicatorId, RawValue> requested = new LinkedHashMap<>();
        for (IndicatorId indicator : weights.keySet()) {
            requested.put(indicator, null);
        }

        String sql = """
                SELECT entity_type, entity_id, month, indicator_id, value, available
                FROM indicator_values_raw
                WHERE indicator_id IN (%s)
                """.formatted("?".repeat(Math.max(0, requested.size() - 1)).replace("?", "?,") + "?");
        List<Object> arguments = new ArrayList<>(requested.keySet().stream().map(Enum::name).toList());
        if (entityId != null) {
            sql += " AND entity_id = ?";
            arguments.add(entityId);
        }
        if (entityType != null) {
            sql += " AND entity_type = ?";
            arguments.add(entityType);
        }
        sql += " ORDER BY entity_type, entity_id, month, indicator_id";

        Map<String, Map<IndicatorId, RawValue>> grouped = new LinkedHashMap<>();
        jdbc.query(sql, rs -> {
            String key = rs.getString("entity_type") + "\u0000"
                    + rs.getString("entity_id") + "\u0000" + rs.getString("month");
            IndicatorId indicator = IndicatorId.valueOf(rs.getString("indicator_id"));
            Double value = rs.getObject("value") == null ? null : rs.getDouble("value");
            grouped.computeIfAbsent(key, ignored -> new LinkedHashMap<>())
                    .put(indicator, rs.getBoolean("available") ? new RawValue(value, true) : new RawValue(null, false));
        }, arguments.toArray());

        List<HealthResult> results = new ArrayList<>();
        for (var entry : grouped.entrySet()) {
            String[] identity = entry.getKey().split("\u0000", -1);
            Map<IndicatorId, Double> scores = new LinkedHashMap<>();
            for (var value : entry.getValue().entrySet()) {
                if (value.getValue().available()) {
                    scores.put(value.getKey(), normalize(value.getValue().value(), config.indicators().get(value.getKey())));
                }
            }
            if (scores.isEmpty()) {
                continue;
            }
            results.add(diagnose(identity[0], identity[1], identity[2], profile, scores, weights, alertThreshold));
        }
        return results;
    }

        /** Average the individual COMPANY health results belonging to one group, month by month. */
        public List<HealthResult> scoreGroupAverage(Path weightsPath, String profile,
                            double alertThreshold, String groupId)
            throws IOException {
        List<String> companyIds = jdbc.query(
            "SELECT entity_id FROM entities WHERE entity_type = 'COMPANY' AND group_id = ? ORDER BY entity_id",
            (rs, rowNum) -> rs.getString(1), groupId);
        List<HealthResult> companyResults = new ArrayList<>();
        for (String companyId : companyIds) {
            companyResults.addAll(score(weightsPath, profile, alertThreshold, companyId, "COMPANY"));
        }
        return averageGroupResults(companyResults, profile, alertThreshold, groupId);
        }

        static List<HealthResult> averageGroupResults(List<HealthResult> companyResults,
                              String profile, double alertThreshold,
                              String groupId) {
        Map<String, List<HealthResult>> byMonth = new LinkedHashMap<>();
        companyResults.stream().sorted(Comparator.comparing(HealthResult::month))
            .forEach(result -> byMonth.computeIfAbsent(result.month(), ignored -> new ArrayList<>()).add(result));

        List<HealthResult> results = new ArrayList<>();
        for (var month : byMonth.entrySet()) {
            List<HealthResult> entries = month.getValue();
            Map<IndicatorId, Double> indicatorScores = averageIndicatorScores(entries);
            Map<IndicatorId, Double> effectiveWeights = averageIndicatorWeights(entries);
            Map<String, Double> categoryScores = averageCategoryScores(entries);
            Map<String, List<RiskContribution>> groupedContributions = new LinkedHashMap<>();
            entries.stream().flatMap(entry -> entry.riskContributions().stream())
                .forEach(contribution -> groupedContributions
                    .computeIfAbsent(contribution.indicator(), ignored -> new ArrayList<>())
                    .add(contribution));
            List<RiskContribution> contributions = groupedContributions.entrySet().stream()
                .map(entry -> averageContribution(entry.getValue()))
                .sorted(Comparator.comparingDouble(RiskContribution::riskContribution).reversed()
                    .thenComparing(RiskContribution::indicator))
                .toList();
            double globalIndex = entries.stream().mapToDouble(HealthResult::globalIndex).average().orElse(0);
            results.add(new HealthResult("GROUP", groupId, month.getKey(), profile, globalIndex,
                alertThreshold, globalIndex < alertThreshold, indicatorScores, effectiveWeights,
                categoryScores, contributions,
                contributions.stream().mapToDouble(RiskContribution::riskContribution).sum()));
        }
        return results;
        }

        private static Map<IndicatorId, Double> averageIndicatorScores(List<HealthResult> entries) {
        Map<IndicatorId, List<Double>> values = new LinkedHashMap<>();
        entries.forEach(entry -> entry.indicatorScores().forEach((indicator, score) ->
            values.computeIfAbsent(indicator, ignored -> new ArrayList<>()).add(score)));
        return averageIndicatorMap(values);
        }

        private static Map<IndicatorId, Double> averageIndicatorWeights(List<HealthResult> entries) {
        Map<IndicatorId, List<Double>> values = new LinkedHashMap<>();
        entries.forEach(entry -> entry.effectiveWeights().forEach((indicator, weight) ->
            values.computeIfAbsent(indicator, ignored -> new ArrayList<>()).add(weight)));
        return averageIndicatorMap(values);
        }

        private static Map<IndicatorId, Double> averageIndicatorMap(Map<IndicatorId, List<Double>> values) {
        Map<IndicatorId, Double> result = new LinkedHashMap<>();
        values.forEach((indicator, scores) -> result.put(indicator,
            scores.stream().mapToDouble(Double::doubleValue).average().orElse(0)));
        return result;
        }

        private static Map<String, Double> averageCategoryScores(List<HealthResult> entries) {
        Map<String, List<Double>> values = new LinkedHashMap<>();
        entries.forEach(entry -> entry.categoryScores().forEach((category, score) ->
            values.computeIfAbsent(category, ignored -> new ArrayList<>()).add(score)));
        Map<String, Double> result = new LinkedHashMap<>();
        values.forEach((category, scores) -> result.put(category,
            scores.stream().mapToDouble(Double::doubleValue).average().orElse(0)));
        return result;
        }

        private static RiskContribution averageContribution(List<RiskContribution> contributions) {
        RiskContribution first = contributions.get(0);
        return new RiskContribution(first.indicator(), first.category(),
            contributions.stream().mapToDouble(RiskContribution::score).average().orElse(0),
            contributions.stream().mapToDouble(RiskContribution::weight).average().orElse(0),
            contributions.stream().mapToDouble(RiskContribution::riskContribution).average().orElse(0));
        }

    public static double normalize(double value, IndicatorConfig indicator) {
        List<double[]> anchors = indicator.anchors().stream()
                .map(anchor -> new double[]{anchor.get(0), anchor.get(1)})
                .toList();
        return AnchorInterpolator.score(value, anchors) / 100.0;
    }

    private HealthResult diagnose(String entityType, String entityId, String month, String profile,
                                  Map<IndicatorId, Double> scores, Map<IndicatorId, Double> weights,
                                  double alertThreshold) {
        Map<IndicatorId, Double> availableWeights = new LinkedHashMap<>();
        for (var entry : weights.entrySet()) {
            if (entry.getValue() > 0 && scores.containsKey(entry.getKey())) {
                availableWeights.put(entry.getKey(), entry.getValue());
            }
        }
        double total = availableWeights.values().stream().mapToDouble(Double::doubleValue).sum();
        if (total <= 0) {
            throw new IllegalArgumentException("no configured profile weight is available for the supplied values");
        }
        Map<IndicatorId, Double> effectiveWeights = new LinkedHashMap<>();
        for (var entry : availableWeights.entrySet()) {
            effectiveWeights.put(entry.getKey(), entry.getValue() / total);
        }

        double globalIndex = 0;
        List<RiskContribution> contributions = new ArrayList<>();
        for (var entry : effectiveWeights.entrySet()) {
            double score = scores.get(entry.getKey());
            double risk = (1 - score) * entry.getValue();
            globalIndex += score * entry.getValue();
            contributions.add(new RiskContribution(entry.getKey().name(),
                    config.indicators().get(entry.getKey()).category().name(), score, entry.getValue(), risk));
        }
        contributions.sort(Comparator.comparingDouble(RiskContribution::riskContribution).reversed()
                .thenComparing(RiskContribution::indicator));

        Map<String, Double> categoryScores = new LinkedHashMap<>();
        Map<String, Double> categoryWeights = new HashMap<>();
        for (var entry : effectiveWeights.entrySet()) {
            String category = config.indicators().get(entry.getKey()).category().name();
            categoryScores.merge(category, scores.get(entry.getKey()) * entry.getValue(), Double::sum);
            categoryWeights.merge(category, entry.getValue(), Double::sum);
        }
        categoryScores.replaceAll((category, value) -> value / categoryWeights.get(category));

        return new HealthResult(entityType, entityId, month, profile, globalIndex, alertThreshold,
                globalIndex < alertThreshold, scores, effectiveWeights, categoryScores, contributions,
                contributions.stream().mapToDouble(RiskContribution::riskContribution).sum());
    }

    private Map<IndicatorId, Double> loadWeights(Path path, String profile) throws IOException {
        JsonNode profiles = objectMapper.readTree(path.toFile()).path("profiles");
        JsonNode weights = profiles.path(profile).path("weights");
        if (weights.isMissingNode() || !weights.isObject()) {
            throw new IllegalArgumentException("profile " + profile + " is missing from weights.json");
        }
        Map<IndicatorId, Double> result = new LinkedHashMap<>();
        for (var field : weights.properties()) {
            String name = field.getKey();
                IndicatorId indicator = INDICATOR_ALIASES.containsKey(name)
                    ? INDICATOR_ALIASES.get(name)
                    : IndicatorId.valueOf(name);
            result.put(indicator, field.getValue().doubleValue());
        }
        return result;
    }

    private void validateWeights(Map<IndicatorId, Double> weights) {
        for (IndicatorId indicator : weights.keySet()) {
            if (!config.indicators().containsKey(indicator)) {
                throw new IllegalArgumentException("weights.json contains indicator without anchors: " + indicator);
            }
        }
    }

    private record RawValue(Double value, boolean available) {
    }

    public record RiskContribution(String indicator, String category, double score, double weight,
                                   double riskContribution) {
    }

    public record HealthResult(String entityType, String entityId, String month, String profile,
                               double globalIndex, double alertThreshold, boolean imminentFailureRisk,
                               Map<IndicatorId, Double> indicatorScores,
                               Map<IndicatorId, Double> effectiveWeights,
                               Map<String, Double> categoryScores,
                               List<RiskContribution> riskContributions,
                               double riskContributionTotal) {
    }
}