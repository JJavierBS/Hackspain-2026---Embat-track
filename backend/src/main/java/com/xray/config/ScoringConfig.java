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
        TaxRegularityConfig taxRegularity,
        StatusConfig statuses,
        ConfidenceConfig confidence,
        ExplanationConfig explanation,
        ProductsConfig products,
        AlertsConfig alerts) {

    public ScoringConfig {
        ScoringConfigValidator.validate(indicators, profiles);
        ScoringConfigValidator.validatePhase5(products, alerts, limitEngine);
    }

    public record MonthRange(String start, String end) {
    }

    public record TrajectoryConfig(int smoothingWindow, int slopeWindow, int minPoints,
                                   double slopeToScoreSpan, double slopeWeight, double deltaWeight) {
    }

    /** SPEC §8.1–§8.2 and phase 4 decisions E3–E5. */
    public record RegimeConfig(double cusumK, double cusumH, double cusumZCap, int persistenceMonths, double slopeThreshold,
                               double dipZ, int dipMaxMonths, int baselineMonths, int baselineMinPoints,
                               double sigmaFloor, int dipRecoveryMonths, int slopeMonths, int slopeMinPoints,
                               List<IndicatorId> cusumIndicators) {
    }

    /** SPEC §8.3 status thresholds, in points. */
    public record StatusConfig(double criticalBelow, double turningMinLevel, double turningMaxTraj,
                               double improvingMinTraj, double exceptionalMinFinal, double exceptionalMinTraj,
                               double healthyMinFinal) {
    }

    /** SPEC §7.6. */
    public record ConfidenceConfig(int lowHistoryMonths, int mediumHistoryMonths, double lowAvailableShare) {
    }

    /** SPEC §7.5 narratives (phase 4 decision E6). */
    public record ExplanationConfig(int narrativeTopN, double minNarratedDelta) {
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

    /** Phase 5 decision F5: the profile each product reads (SPEC §10). */
    public record ProductsConfig(Profile limitProfile, Profile premiumProfile, Profile momentumProfile,
                                 MomentumScreenConfig momentum) {
    }

    /** SPEC §10.3 rising stars: level below risingStarMaxLevel and traj at or above risingStarMinTraj. */
    public record MomentumScreenConfig(double risingStarMaxLevel, double risingStarMinTraj) {
    }

    /** SPEC §8.5 early-warning thresholds. PROVISIONAL, review with the first run. */
    public record AlertsConfig(Level runwayLow, Level dscrBreach, Level lineUtilHigh, Level dsoDrift,
                               Level supplierLatenessUp, Level overdueReceivables, Level taxGap,
                               Level concentrationHigh, Level factoringSpike, Level scoreDrop, int scoreDropMonths,
                               int driftBaselineMonths, int driftBaselineMinPoints, int bandDowngradeCriticalSteps,
                               WatchlistConfig watchlist) {
    }

    /** One alert threshold pair. For "below" rules critical < warn; for "above" rules critical > warn. */
    public record Level(double warn, double critical) {
    }

    /** SPEC §8.5 watchlist (phase 5 decision F15). */
    public record WatchlistConfig(int minCritical, int minWarn) {
    }
}
