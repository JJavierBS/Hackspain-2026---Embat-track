package com.xray.domain.service;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import com.xray.domain.model.IndicatorId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CusumForecastTest {

    @Test
    void detectsSustainedDecline() {
        var result = CusumForecast.detectCusum(List.of(0.8, 0.8, 0.8, 0.7, 0.6, 0.5), 0.01, 0.05);

        assertTrue(result.alarm());
        assertEquals("DECLINING", result.direction());
    }

    @Test
    void forecastDampsTrend() {
        var result = CusumForecast.dampedForecast(List.of(0.2, 0.3), 3, 2, 0.8, 0.4);

        assertEquals(0.4, result.get(0).globalIndex(), 1e-9);
        assertEquals(0.48, result.get(1).globalIndex(), 1e-9);
        assertEquals(0.544, result.get(2).globalIndex(), 1e-9);
    }

    @Test
    void reportsShortHistoryWithoutHidingResult() {
        var result = CusumForecast.reliability(4);

        assertEquals("LOW", result.level());
        assertTrue(!result.reliable());
    }

    @Test
    void considersEightMonthsReliable() {
        assertTrue(CusumForecast.reliability(8).reliable());
    }

    @Test
    void averagesCompanyHealthByMonthForGroup() {
        var first = health("COMPANY_A", 0.2);
        var second = health("COMPANY_B", 0.8);

        var result = HealthScoring.averageGroupResults(
                List.of(first, second), "bank", 0.4, "GROUP_0001");

        assertEquals(1, result.size());
        assertEquals("GROUP", result.get(0).entityType());
        assertEquals("GROUP_0001", result.get(0).entityId());
        assertEquals(0.5, result.get(0).globalIndex(), 1e-9);
        assertFalse(result.get(0).imminentFailureRisk());
    }

    private static HealthScoring.HealthResult health(String entityId, double score) {
        var contribution = new HealthScoring.RiskContribution(
                IndicatorId.LIQ_RUNWAY.name(), "LIQUIDITY", score, 1.0, 1.0 - score);
        return new HealthScoring.HealthResult(
                "COMPANY", entityId, "2025-12", "bank", score, 0.4, score < 0.4,
                Map.of(IndicatorId.LIQ_RUNWAY, score), Map.of(IndicatorId.LIQ_RUNWAY, 1.0),
                Map.of("LIQUIDITY", score), List.of(contribution), 1.0 - score);
    }
}