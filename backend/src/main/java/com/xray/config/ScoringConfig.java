package com.xray.config;

import com.xray.domain.model.EntityType;
import com.xray.domain.model.FlowClass;
import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.Profile;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;
import java.util.Map;

/** Binds scoring-config.yml. The compact constructor validates, so a bad config stops the boot. */
@ConfigurationProperties(prefix = "scoring")
public record ScoringConfig(
        EntityType unit,
        MonthRange months,
        List<String> cashProductTypes,
        List<String> semiLiquidTypes,
        List<String> bookedStatusValues,
        double runwayCapMonths,
        TrajectoryConfig trajectory,
        Map<String, FlowClass> flowClasses,
        FlowClass defaultFlowClass,
        boolean otherSignFallback,
        Map<IndicatorId, IndicatorConfig> indicators,
        Map<Profile, ProfileConfig> profiles,
        RegimeConfig regimes,
        BandConfig bands,
        LimitEngineConfig limitEngine,
        InsurerConfig insurer,
        DebtDscrConfig debtDscr,
        DataRules dataRules) {

    public ScoringConfig {
        ScoringConfigValidator.validate(indicators, profiles);
    }

    public record MonthRange(String start, String end) {
    }

    public record TrajectoryConfig(int smoothingWindow, int slopeWindow, int minPoints,
                                   double slopeToScoreSpan, double slopeWeight, double deltaWeight) {
    }

    public record RegimeConfig(double cusumK, double cusumH, int persistenceMonths,
                               double slopeThreshold, double dipZ, int dipMaxMonths) {
    }

    /** Lower bounds of bands A..D. Below d is band E. */
    public record BandConfig(double a, double b, double c, double d) {
    }

    /** A band missing from multiplierByBand means not insurable. */
    public record InsurerConfig(double basePremiumRate, Map<String, Double> multiplierByBand) {
    }

    /** DEBT_DSCR level when the entity has no debt service (CLAUDE.md resolved conflict 7). */
    public record DebtDscrConfig(double noDebtLevel) {
    }
}
