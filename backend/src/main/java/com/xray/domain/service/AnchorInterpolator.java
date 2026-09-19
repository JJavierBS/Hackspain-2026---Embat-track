package com.xray.domain.service;

import java.util.List;

/** Piecewise-linear anchors, clamped to [0,100], NO extrapolation (ARCHITECTURE §4.3, SPEC §7.1). */
public final class AnchorInterpolator {

    private AnchorInterpolator() {
    }

    /** anchors = [x, score] pairs sorted by x. Below the first x or above the last, the end score holds. */
    public static double score(double value, List<double[]> anchors) {
        if (Double.isNaN(value)) throw new IllegalArgumentException("value is NaN");
        if (anchors == null || anchors.size() < 2) throw new IllegalArgumentException("need at least 2 anchors");
        double[] first = anchors.get(0);
        double[] last = anchors.get(anchors.size() - 1);
        if (value <= first[0]) return clamp(first[1]);
        if (value >= last[0]) return clamp(last[1]);
        for (int i = 1; i < anchors.size(); i++) {
            double[] a = anchors.get(i - 1), b = anchors.get(i);
            if (value <= b[0]) return clamp(a[1] + (value - a[0]) / (b[0] - a[0]) * (b[1] - a[1]));
        }
        return clamp(last[1]);
    }

    static double clamp(double s) {
        return Math.max(0, Math.min(100, s));
    }
}
