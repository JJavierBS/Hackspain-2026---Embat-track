package com.xray.config;

import com.xray.domain.model.Band;
import com.xray.domain.model.EntityType;
import com.xray.domain.model.FlowClass;
import com.xray.domain.model.HealthStatus;
import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.Profile;
import com.xray.domain.service.ForecastCalculator;
import com.xray.domain.service.LeadTimeAnalyzer;
import com.xray.domain.service.MomentumScreen;
import com.xray.domain.service.ShowcaseFinder;
import com.xray.domain.service.PremiumEngine;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.ConstructorBinding;

import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

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
        RecommendationsConfig recommendations,
        ProductsConfig products,
        AlertsConfig alerts,
        LeadTimeConfig leadTime,
        ShowcaseConfig showcase,
        ForecastConfig forecast) {

    @ConstructorBinding
    public ScoringConfig {
        ScoringConfigValidator.validate(indicators, profiles);
        ScoringConfigValidator.validatePhase5(products, alerts, limitEngine);
        ScoringConfigValidator.validatePhase6(leadTime, showcase);
        ScoringConfigValidator.validatePhase7(forecast);
    }

    /** Source compatibility for focused tests and callers that predate entity-page recommendations. */
    public ScoringConfig(EntityType unit, MonthRange months, List<String> cashProductTypes,
                         List<String> semiLiquidTypes, List<String> bookedStatusValues, double runwayCapMonths,
                         TrajectoryConfig trajectory, Map<String, FlowClass> flowClasses, FlowClass defaultFlowClass,
                         boolean otherSignFallback, Map<IndicatorId, IndicatorConfig> indicators,
                         Map<Profile, ProfileConfig> profiles, RegimeConfig regimes, BandConfig bands,
                         LimitEngineConfig limitEngine, InsurerConfig insurer, DebtDscrConfig debtDscr,
                         DataRules dataRules, LevDebtToCfConfig levDebtToCf, MomentumConfig momentum,
                         ConcentrationConfig concentration, WindowConfig windows, TaxRegularityConfig taxRegularity,
                         StatusConfig statuses, ConfidenceConfig confidence, ExplanationConfig explanation,
                         ProductsConfig products, AlertsConfig alerts, LeadTimeConfig leadTime,
                         ShowcaseConfig showcase, ForecastConfig forecast) {
        this(unit, months, cashProductTypes, semiLiquidTypes, bookedStatusValues, runwayCapMonths, trajectory,
                flowClasses, defaultFlowClass, otherSignFallback, indicators, profiles, regimes, bands, limitEngine,
                insurer, debtDscr, dataRules, levDebtToCf, momentum, concentration, windows, taxRegularity, statuses,
                confidence, explanation, new RecommendationsConfig(3, 40, 40, Map.of()), products, alerts, leadTime,
                showcase, forecast);
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

    /** Entity-page recommendations. These affect prioritisation and urgency, not the score itself. */
    public record RecommendationsConfig(int topN, double urgentLevelBelow, double urgentTrajectoryBelow,
                                         Map<String, RecommendationRule> rules) {
    }

    public record RecommendationRule(boolean enabled, int priority, double maxLevel, double maxTrajectory,
                                     List<Profile> profiles, String title, String action) {
    }

    /** Lower bounds of bands A..D. Below d is band E. */
    public record BandConfig(double a, double b, double c, double d) {
    }

    /** A band missing from multiplierByBand means not insurable. */
    public record InsurerConfig(double basePremiumRate, Map<String, Double> multiplierByBand) {

        /** Domain parameters. Band keys are A..E strings in the YAML. */
        public PremiumEngine.Params toParams() {
            Map<Band, Double> multipliers = new EnumMap<>(Band.class);
            multiplierByBand.forEach((k, v) -> {
                if (v != null) multipliers.put(Band.valueOf(k.toUpperCase(Locale.ROOT)), v);
            });
            return new PremiumEngine.Params(basePremiumRate, multipliers);
        }
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

        public MomentumScreen.Params toParams() {
            return new MomentumScreen.Params(risingStarMaxLevel, risingStarMinTraj);
        }
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

    /**
     * SPEC §8.5 watchlist (phase 5 decision F15). An alert counts only while its negative run is confirmed
     * (at least confirmMonths long) and new (at most confirmMonths + recentMonths - 1 long).
     */
    public record WatchlistConfig(int minCritical, int minWarn, int confirmMonths, int recentMonths) {
    }

    /** SPEC §8.4 measured anticipation (phase 6 decisions G3–G7). Evaluation only: nothing scores from it. */
    public record LeadTimeConfig(int minHistoryMonths, int windowMonths, int horizonMonths,
                                 EventsConfig events, SignalConfig signal) {

        /** Domain parameters. The domain never imports config; config flattens itself into the record. */
        public LeadTimeAnalyzer.Params toParams() {
            return new LeadTimeAnalyzer.Params(minHistoryMonths, windowMonths, horizonMonths,
                    events.runwayBelow(), events.runwayMonths(), events.dscrBelow(), events.dscrMonths(),
                    events.overdueMaxLevel(), events.scoreBelow(), events.improvementCross(),
                    events.improvementCrossMonths(), events.improvementBelow(), events.improvementBelowMonths(),
                    Set.copyOf(signal.deteriorationStatuses()), signal.deteriorationMaxTraj(),
                    Set.copyOf(signal.improvementStatuses()), signal.improvementMinTraj(), signal.maxGapMonths());
        }
    }

    /** The proxy events of SPEC §8.4: no default label exists, so the conditions stand in for one. */
    public record EventsConfig(double runwayBelow, int runwayMonths, double dscrBelow, int dscrMonths,
                               double overdueMaxLevel, double scoreBelow, double improvementCross,
                               int improvementCrossMonths, double improvementBelow, int improvementBelowMonths) {
    }

    /** When the system "raised its hand" (decision G5). maxGapMonths: longest break a signal run may have. */
    public record SignalConfig(List<HealthStatus> deteriorationStatuses, double deteriorationMaxTraj,
                               List<HealthStatus> improvementStatuses, double improvementMinTraj,
                               int maxGapMonths) {
    }

    /** SPEC §10.4 showcase pairs (phase 6 decision G9). */
    public record ShowcaseConfig(double maxFinalGap, double upMinTraj, double downMaxTraj, int topN) {

        public ShowcaseFinder.Params toParams() {
            return new ShowcaseFinder.Params(maxFinalGap, upMinTraj, downMaxTraj, topN);
        }
    }

    /**
     * Score projection (phase 7 decisions H11–H15, docs/FORECAST.md). Output only: nothing scores from it (H16).
     * meanReversion = rho of the AR(1) toward the entity's own median. minPoints = fewest scored months to
     * project at all; below minHistoryMonths the forecast is LOW, below mediumHistoryMonths MEDIUM, else HIGH.
     */
    public record ForecastConfig(double meanReversion, int maxHorizonMonths, int minPoints, int minHistoryMonths,
                                 int mediumHistoryMonths) {

        public ForecastCalculator.Params toParams() {
            return new ForecastCalculator.Params(meanReversion, maxHorizonMonths, minPoints, minHistoryMonths,
                    mediumHistoryMonths);
        }
    }
}
