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
