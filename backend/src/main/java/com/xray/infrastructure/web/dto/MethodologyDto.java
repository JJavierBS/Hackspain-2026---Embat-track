package com.xray.infrastructure.web.dto;

import java.util.List;
import java.util.Map;

/** GET /api/methodology (phase 5 contract item 8, decision F20). No weights: those come from /api/profiles. */
public record MethodologyDto(List<AlertRuleDto> alertRules, Products products, LimitEngine limitEngine,
                             Insurer insurer, Momentum momentum, Watchlist watchlist,
                             Forecast forecast) {

    /** trigger is Spanish, built from the config thresholds. fired = alerts of the unit in the last run. */
    public record AlertRuleDto(String code, String direction, boolean event, String trigger, long fired) {
    }

    public record Products(String limitProfile, String premiumProfile, String momentumProfile) {
    }

    public record LimitEngine(double scoreFloor, double factorAtFloor, double factorAt100, double trendModifierSpan,
                              double runwayGuardBelowMonths, double runwayGuardMultiplier, double dscrMin,
                              int defaultTermMonths, double referenceRate, boolean referenceRateIsExample,
                              Map<String, Integer> spreadBpsByBand, double actionThreshold, double roundingEur) {
    }

    public record Insurer(double basePremiumRate, Map<String, Double> multiplierByBand) {
    }

    public record Momentum(double risingStarMaxLevel, double risingStarMinTraj) {
    }

    public record Watchlist(int minCritical, int minWarn, int confirmMonths, int recentMonths) {
    }

    /** Phase 7 projection: method name and scoring.forecast values, so the UI never hardcodes them (B-4). */
    public record Forecast(String method, double meanReversion, int maxHorizonMonths, int minPoints,
                           int minHistoryMonths, int mediumHistoryMonths) {
    }
}
