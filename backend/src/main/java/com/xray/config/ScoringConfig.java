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
        DataRules dataRules,
        LevDebtToCfConfig levDebtToCf,
        MomentumConfig momentum,
        ConcentrationConfig concentration,
        WindowConfig windows,
        TaxRegularityConfig taxRegularity) {

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

    /** LEV_DEBT_TO_CF level when the entity has debt and NOCF_12m <= 0 (SPEC §6: "NOCF <= 0 -> level 0"). */
    public record LevDebtToCfConfig(double nonPositiveCfLevel) {
    }

    /** MOMENTUM category (SPEC §7.3): TrajOverall + pointsPerMonth x MOM_PERSISTENCE, capped at +/- cap points. */
    public record MomentumConfig(double pointsPerMonth, double cap) {
    }

    /**
     * CON_* indicators: available only when counterparty-identified operating flow covers at least this share
     * of the window's operating flow (phase 3 decision D9; only 4.9 % of inflow amount has a counterparty).
     */
    public record ConcentrationConfig(double minCounterpartyCoverage) {
    }

    /** 12m windows annualize over active months (phase 3 contract item 6). */
    public record WindowConfig(int annualizeMinMonths) {
    }

    /** TAX_REGULARITY cadence rule (phase 3 decision D2). */
    public record TaxRegularityConfig(int windowMonths, double monthlyMaxMedianGap, int monthlyCadenceMonths,
                                      int quarterlyCadenceMonths, int minTaxMonths) {
    }
}
