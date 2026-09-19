package com.xray.config;

import java.util.Map;

/** SPEC §10.1. A band missing from spreadBpsByBand means DECLINE. */
public record LimitEngineConfig(
        String base,
        double scoreFloor,
        double factorAtFloor,
        double factorAt100,
        double trendModifierSpan,
        RunwayGuard runwayGuard,
        double dscrMin,
        int defaultTermMonths,
        double referenceRate,
        Map<String, Integer> spreadBpsByBand,
        double actionThreshold,
        double roundingEur) {

    public record RunwayGuard(double belowMonths, double multiplier) {
    }
}
