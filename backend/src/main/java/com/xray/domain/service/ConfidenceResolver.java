package com.xray.domain.service;

import com.xray.domain.model.Confidence;

/**
 * SPEC §7.6. history = scored months up to m. availableShare = available indicators of the profile's weighted
 * categories. A fallback indicator (e.g. QoQ growth before M14) caps the confidence at MEDIUM.
 * weightShare = profile weight of the available categories / profile weight, MOMENTUM excluded. Below
 * minTrustedWeightShare the confidence is INSUFFICIENT, whatever the history.
 */
public final class ConfidenceResolver {

    public record Params(int lowHistoryMonths, int mediumHistoryMonths, double lowAvailableShare,
                         double minTrustedWeightShare) {
    }

    private ConfidenceResolver() {
    }

    public static Confidence resolve(int historyMonths, double availableShare, double weightShare,
                                     boolean fallbackUsed, Params p) {
        if (weightShare < p.minTrustedWeightShare()) return Confidence.INSUFFICIENT;
        if (historyMonths < p.lowHistoryMonths() || availableShare < p.lowAvailableShare()) return Confidence.LOW;
        if (historyMonths < p.mediumHistoryMonths() || fallbackUsed) return Confidence.MEDIUM;
        return Confidence.HIGH;
    }
}
