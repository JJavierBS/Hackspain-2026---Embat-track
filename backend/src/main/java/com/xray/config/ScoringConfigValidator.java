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

    private static IllegalStateException fail(String message) {
        return new IllegalStateException("Invalid scoring config: " + message);
    }
}
