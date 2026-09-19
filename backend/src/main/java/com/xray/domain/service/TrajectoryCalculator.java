package com.xray.domain.service;

/**
 * Trajectory sub-score from a level series (SPEC §7.2). Causal: out[m] reads levels[0..m] only.
 * levels[i] == null means the indicator is unavailable in month i.
 */
public final class TrajectoryCalculator {

    /** SPEC §7.2 "delta3": smoothed(m) − smoothed(m−3). Part of the definition, not a tunable. */
    static final int DELTA_MONTHS = 3;

    public record Params(int smoothingWindow, int slopeWindow, int minPoints,
                         double slopeToScoreSpan, double slopeWeight, double deltaWeight) {
    }

    private TrajectoryCalculator() {
    }

    /**
     * dataGap[m] marks months whose level reads missing flows as zero. A month with full data never compares
     * against them: its smoothing, slope and delta3 skip gap levels, so a return after a gap is not a jump.
     * A gap month keeps the plain computation, so an entity that stops transacting still shows its decline.
     */
    public static Double[] compute(Double[] levels, boolean[] dataGap, Params p) {
        Double[] clean = new Double[levels.length];
        for (int m = 0; m < levels.length; m++) clean[m] = dataGap[m] ? null : levels[m];
        Double[] plain = compute(levels, p);
        Double[] fromClean = compute(clean, p);
        Double[] out = new Double[levels.length];
        for (int m = 0; m < levels.length; m++) out[m] = dataGap[m] ? plain[m] : fromClean[m];
        return out;
    }

    public static Double[] compute(Double[] levels, Params p) {
        int n = levels.length;
        Double[] smooth = new Double[n];
        for (int m = 0; m < n; m++) {
            int[] w = CausalWindow.window(m, p.smoothingWindow());
            double sum = 0;
            int k = 0;
            for (int i = w[0]; i <= w[1]; i++) {
                if (levels[i] != null) {
                    sum += levels[i];
                    k++;
                }
            }
            smooth[m] = k == 0 ? null : sum / k;
        }
        Double[] out = new Double[n];
        for (int m = 0; m < n; m++) {
            if (levels[m] == null || smooth[m] == null || m < DELTA_MONTHS || smooth[m - DELTA_MONTHS] == null) continue;
            int[] w = CausalWindow.window(m, p.slopeWindow());
            double sx = 0, sy = 0, sxx = 0, sxy = 0;
            int k = 0;
            for (int i = w[0]; i <= w[1]; i++) {
                if (smooth[i] == null) continue;
                sx += i;
                sy += smooth[i];
                sxx += (double) i * i;
                sxy += i * smooth[i];
                k++;
            }
            if (k < p.minPoints()) continue;
            double den = k * sxx - sx * sx;
            if (den == 0) continue;
            double slope = (k * sxy - sx * sy) / den;
            double delta = smooth[m] - smooth[m - DELTA_MONTHS];
            double raw = p.slopeWeight() * slope + p.deltaWeight() * (delta / DELTA_MONTHS);
            out[m] = Math.max(0, Math.min(100, 50 + 50 * raw / p.slopeToScoreSpan()));
        }
        return out;
    }
}
