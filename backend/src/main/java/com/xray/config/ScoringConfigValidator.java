package com.xray.config;

import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.Profile;

import java.util.List;
import java.util.Map;

/** Fail-fast checks of ARCHITECTURE §6. Every message names the offending key. */
final class ScoringConfigValidator {

    private ScoringConfigValidator() {
    }

    static void validate(Map<IndicatorId, IndicatorConfig> indicators, Map<Profile, ProfileConfig> profiles) {
        if (indicators == null) {
            throw fail("scoring.indicators is missing");
        }
        for (IndicatorId id : IndicatorId.values()) {
            IndicatorConfig ic = indicators.get(id);
            String key = "scoring.indicators." + id;
            if (ic == null) {
                throw fail(key + " is missing");
            }
            if (ic.category() == null) {
                throw fail(key + ".category is missing");
            }
            if (ic.weight() != null && !(ic.weight() > 0)) {
                throw fail(key + ".weight " + ic.weight() + " must be > 0");
            }
            List<List<Double>> a = ic.anchors();
            if (a == null || a.size() < 2) {
                throw fail(key + ".anchors needs at least 2 points");
            }
            for (int i = 0; i < a.size(); i++) {
                List<Double> p = a.get(i);
                if (p == null || p.size() != 2) {
                    throw fail(key + ".anchors[" + i + "] must be [x, score]");
                }
                if (p.get(1) < 0 || p.get(1) > 100) {
                    throw fail(key + ".anchors[" + i + "] score " + p.get(1) + " is outside [0, 100]");
                }
                if (i > 0 && p.get(0) <= a.get(i - 1).get(0)) {
                    throw fail(key + ".anchors[" + i + "] x " + p.get(0) + " is not strictly increasing");
                }
            }
        }
        if (profiles == null) {
            throw fail("scoring.profiles is missing");
        }
        for (Profile p : Profile.values()) {
            ProfileConfig pc = profiles.get(p);
            String key = "scoring.profiles." + p;
            if (pc == null || pc.weights() == null) {
                throw fail(key + " is missing");
            }
            double sum = pc.weights().values().stream().mapToDouble(Double::doubleValue).sum();
            if (Math.abs(sum - 100.0) > 0.01) {
                throw fail(key + ".weights sum to " + sum + ", expected 100");
            }
            if (pc.lambda() < 0 || pc.lambda() > 1) {
                throw fail(key + ".lambda " + pc.lambda() + " is outside [0, 1]");
            }
        }
    }

    /** Phase 5 keys: products, limit rounding and alert thresholds. */
    static void validatePhase5(ScoringConfig.ProductsConfig products, ScoringConfig.AlertsConfig alerts,
                               LimitEngineConfig limitEngine) {
        if (products == null || products.momentum() == null) {
            throw fail("scoring.products is missing");
        }
        if (products.limitProfile() == null) {
            throw fail("scoring.products.limit-profile is missing");
        }
        if (products.premiumProfile() == null) {
            throw fail("scoring.products.premium-profile is missing");
        }
        if (products.momentumProfile() == null) {
            throw fail("scoring.products.momentum-profile is missing");
        }
        if (limitEngine == null || !(limitEngine.roundingEur() > 0)) {
            throw fail("scoring.limit-engine.rounding-eur must be > 0");
        }
        if (alerts == null || alerts.watchlist() == null) {
            throw fail("scoring.alerts is missing");
        }
        below("runway-low", alerts.runwayLow());
        below("dscr-breach", alerts.dscrBreach());
        above("line-util-high", alerts.lineUtilHigh());
        above("dso-drift", alerts.dsoDrift());
        above("supplier-lateness-up", alerts.supplierLatenessUp());
        above("overdue-receivables", alerts.overdueReceivables());
        above("tax-gap", alerts.taxGap());
        above("concentration-high", alerts.concentrationHigh());
        above("factoring-spike", alerts.factoringSpike());
        above("score-drop", alerts.scoreDrop());
        if (alerts.scoreDropMonths() < 1) {
            throw fail("scoring.alerts.score-drop-months " + alerts.scoreDropMonths() + " must be >= 1");
        }
        if (alerts.driftBaselineMinPoints() < 1 || alerts.driftBaselineMinPoints() > alerts.driftBaselineMonths()) {
            throw fail("scoring.alerts.drift-baseline-min-points " + alerts.driftBaselineMinPoints()
                    + " must be in [1, drift-baseline-months " + alerts.driftBaselineMonths() + "]");
        }
        if (alerts.bandDowngradeCriticalSteps() < 1) {
            throw fail("scoring.alerts.band-downgrade-critical-steps must be >= 1");
        }
        if (alerts.watchlist().minCritical() < 1) {
            throw fail("scoring.alerts.watchlist.min-critical must be >= 1");
        }
        if (alerts.watchlist().minWarn() < 1) {
            throw fail("scoring.alerts.watchlist.min-warn must be >= 1");
        }
        if (alerts.watchlist().confirmMonths() < 1) {
            throw fail("scoring.alerts.watchlist.confirm-months must be >= 1");
        }
        if (alerts.watchlist().recentMonths() < 1) {
            throw fail("scoring.alerts.watchlist.recent-months must be >= 1");
        }
    }

    /** Phase 6 keys: lead-time windows, event thresholds and showcase ranking (decisions G3–G9, G16). */
    static void validatePhase6(ScoringConfig.LeadTimeConfig leadTime, ScoringConfig.ShowcaseConfig showcase) {
        if (leadTime == null || leadTime.events() == null || leadTime.signal() == null) {
            throw fail("scoring.lead-time is missing");
        }
        positive("scoring.lead-time.min-history-months", leadTime.minHistoryMonths());
        positive("scoring.lead-time.window-months", leadTime.windowMonths());
        positive("scoring.lead-time.horizon-months", leadTime.horizonMonths());
        ScoringConfig.EventsConfig e = leadTime.events();
        positive("scoring.lead-time.events.runway-months", e.runwayMonths());
        positive("scoring.lead-time.events.dscr-months", e.dscrMonths());
        positive("scoring.lead-time.events.improvement-below-months", e.improvementBelowMonths());
        positive("scoring.lead-time.events.improvement-cross-months", e.improvementCrossMonths());
        if (!(e.improvementBelow() < e.improvementCross())) {
            throw fail("scoring.lead-time.events.improvement-below " + e.improvementBelow()
                    + " must be below improvement-cross " + e.improvementCross());
        }
        ScoringConfig.SignalConfig s = leadTime.signal();
        if (s.deteriorationStatuses() == null || s.deteriorationStatuses().isEmpty()) {
            throw fail("scoring.lead-time.signal.deterioration-statuses is empty");
        }
        if (s.improvementStatuses() == null || s.improvementStatuses().isEmpty()) {
            throw fail("scoring.lead-time.signal.improvement-statuses is empty");
        }
        if (s.maxGapMonths() < 0 || s.maxGapMonths() >= leadTime.windowMonths()) {
            throw fail("scoring.lead-time.signal.max-gap-months " + s.maxGapMonths()
                    + " must be >= 0 and below window-months " + leadTime.windowMonths());
        }
        if (showcase == null) {
            throw fail("scoring.showcase is missing");
        }
        if (!(showcase.maxFinalGap() > 0)) {
            throw fail("scoring.showcase.max-final-gap " + showcase.maxFinalGap() + " must be > 0");
        }
        positive("scoring.showcase.top-n", showcase.topN());
        if (!(showcase.downMaxTraj() < showcase.upMinTraj())) {
            throw fail("scoring.showcase.down-max-traj " + showcase.downMaxTraj()
                    + " must be below up-min-traj " + showcase.upMinTraj());
        }
    }

    /** Phase 7 keys: the forecast block (decisions H11, H14, H15). */
    static void validatePhase7(ScoringConfig.ForecastConfig forecast) {
        if (forecast == null) {
            throw fail("scoring.forecast is missing");
        }
        if (!(forecast.meanReversion() > 0 && forecast.meanReversion() <= 1)) {
            throw fail("scoring.forecast.mean-reversion " + forecast.meanReversion() + " must be in (0, 1]");
        }
        positive("scoring.forecast.max-horizon-months", forecast.maxHorizonMonths());
        positive("scoring.forecast.min-points", forecast.minPoints());
        positive("scoring.forecast.min-history-months", forecast.minHistoryMonths());
        positive("scoring.forecast.medium-history-months", forecast.mediumHistoryMonths());
        if (!(forecast.minPoints() <= forecast.minHistoryMonths())) {
            throw fail("scoring.forecast.min-points " + forecast.minPoints()
                    + " must be at most min-history-months " + forecast.minHistoryMonths());
        }
        if (!(forecast.minHistoryMonths() < forecast.mediumHistoryMonths())) {
            throw fail("scoring.forecast.min-history-months " + forecast.minHistoryMonths()
                    + " must be below medium-history-months " + forecast.mediumHistoryMonths());
        }
    }

    static void validateRecommendations(ScoringConfig.RecommendationsConfig r) {
        if (r == null) {
            throw fail("scoring.recommendations is missing");
        }
        if (r.severityFactor() == null || r.opportunity() == null) {
            throw fail("scoring.recommendations needs severity-factor and opportunity");
        }
        positive("scoring.recommendations.top-n", r.topN());
        positive("scoring.recommendations.min-history-months", r.minHistoryMonths());
        if (!(r.minHistoryMonths() <= r.fullHistoryMonths())) {
            throw fail("scoring.recommendations.min-history-months " + r.minHistoryMonths()
                    + " must be at most full-history-months " + r.fullHistoryMonths());
        }
        if (!(0 <= r.criticalMaxLevel() && r.criticalMaxLevel() <= r.highMaxLevel()
                && r.highMaxLevel() <= r.problemMaxLevel() && r.problemMaxLevel() <= 100)) {
            throw fail("scoring.recommendations needs 0 <= critical-max-level <= high-max-level <= problem-max-level <= 100");
        }
        if (!(0 <= r.trendHighMaxTraj() && r.trendHighMaxTraj() <= r.trendMaxTraj() && r.trendMaxTraj() < 50)) {
            throw fail("scoring.recommendations needs 0 <= trend-high-max-traj <= trend-max-traj < 50 (50 = flat)");
        }
        if (!(r.trendMaxLevel() > r.problemMaxLevel() && r.trendMaxLevel() <= 100)) {
            throw fail("scoring.recommendations.trend-max-level must be in (problem-max-level, 100]");
        }
        if (!(r.targetLevel() > r.problemMaxLevel() && r.targetLevel() <= 100)) {
            throw fail("scoring.recommendations.target-level " + r.targetLevel()
                    + " must be above problem-max-level and at most 100");
        }
        if (!(r.limitedMaxLevel() >= 0 && r.limitedMaxLevel() <= r.problemMaxLevel())) {
            throw fail("scoring.recommendations.limited-max-level must be in [0, problem-max-level]");
        }
        ScoringConfig.SeverityFactors f = r.severityFactor();
        if (!(f.critical() >= f.high() && f.high() >= f.medium() && f.medium() > 0)) {
            throw fail("scoring.recommendations.severity-factor needs critical >= high >= medium > 0");
        }
    }

    private static void positive(String key, int value) {
        if (value < 1) {
            throw fail(key + " " + value + " must be >= 1");
        }
    }

    private static void below(String key, ScoringConfig.Level l) {
        if (l == null) {
            throw fail("scoring.alerts." + key + " is missing");
        }
        if (!(l.critical() < l.warn())) {
            throw fail("scoring.alerts." + key + " critical " + l.critical() + " must be below warn " + l.warn());
        }
    }

    private static void above(String key, ScoringConfig.Level l) {
        if (l == null) {
            throw fail("scoring.alerts." + key + " is missing");
        }
        if (!(l.critical() > l.warn())) {
            throw fail("scoring.alerts." + key + " critical " + l.critical() + " must be above warn " + l.warn());
        }
    }

    private static IllegalStateException fail(String message) {
        return new IllegalStateException("Invalid scoring config: " + message);
    }
}
