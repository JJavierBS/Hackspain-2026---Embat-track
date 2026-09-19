package com.xray.config;

import com.xray.domain.model.Band;
import com.xray.domain.service.LimitEngine;

import java.util.EnumMap;
import java.util.Locale;
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

    /** Domain parameters. Band keys of spreadBpsByBand are S..E strings in the YAML. */
    public LimitEngine.Params toParams() {
        Map<Band, Integer> spreads = new EnumMap<>(Band.class);
        spreadBpsByBand.forEach((k, v) -> {
            if (v != null) spreads.put(Band.valueOf(k.toUpperCase(Locale.ROOT)), v);
        });
        return new LimitEngine.Params(scoreFloor, factorAtFloor, factorAt100, trendModifierSpan,
                runwayGuard.belowMonths(), runwayGuard.multiplier(), dscrMin, defaultTermMonths, referenceRate,
                spreads, actionThreshold, roundingEur);
    }

    public record RunwayGuard(double belowMonths, double multiplier) {
    }
}
