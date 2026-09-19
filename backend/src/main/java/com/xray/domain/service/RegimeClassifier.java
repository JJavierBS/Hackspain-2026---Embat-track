package com.xray.domain.service;

import com.xray.domain.model.Regime;

/**
 * Regime per month on a final-score series (SPEC §8.2). Causal: month m reads 0..m and the CUSUM result at 0..m.
 * Persistence counts consecutive months with the same sign of change of the series (phase 4 decision E5).
 */
public final class RegimeClassifier {

    /** SPEC §8.2 "the same month last year". Part of the definition, not a tunable. */
    static final int YEAR = 12;
    private static final double EPS = 1e-9;

    public record Params(int slopeMonths, int slopeMinPoints, double slopeThreshold, int persistenceMonths,
                         double dipZ, int dipMaxMonths, int dipRecoveryMonths) {
    }

    /** regimes[m] null when x[m] is null. seasonal[m] true only for a DIP month. */
    public record Result(Regime[] regimes, boolean[] seasonal) {
    }

    private RegimeClassifier() {
    }

    public static Result classify(Double[] x, CusumDetector.Result c, Params p) {
        int n = x.length;
        Regime[] out = new Regime[n];
        boolean[] seasonal = new boolean[n];
        int persistence = 0;
        Double prev = null;
        int dipRun = 0;
        int lastDip = -1;
        double dipMedian = 0;
        double dipMad = 0;
        for (int m = 0; m < n; m++) {
            if (x[m] == null) {
                persistence = 0;
                prev = null;
                dipRun = 0;
                continue;
            }
            if (prev != null) {
                double d = x[m] - prev;
                int sign = d > EPS ? 1 : d < -EPS ? -1 : 0;
                persistence = sign == 0 ? 0 : Integer.signum(persistence) == sign ? persistence + sign : sign;
            }
            prev = x[m];
            Double slope = slope(x, m, p);
            if (c.downActive()[m] && slope != null && slope < -p.slopeThreshold() && persistence <= -p.persistenceMonths()) {
                out[m] = Regime.STRUCTURAL_DECLINE;
                dipRun = 0;
                lastDip = -1;
                continue;
            }
            if (c.upActive()[m] && slope != null && slope > p.slopeThreshold() && persistence >= p.persistenceMonths()) {
                out[m] = Regime.STRUCTURAL_IMPROVEMENT;
                dipRun = 0;
                lastDip = -1;
                continue;
            }
            Double z = c.z()[m];
            if (z != null && z <= p.dipZ()) {
                dipRun++;
                if (dipRun == 1) {
                    dipMedian = c.median()[m];
                    dipMad = c.sigma()[m] / CusumDetector.MAD_TO_SIGMA;
                }
                if (dipRun <= p.dipMaxMonths()) {
                    out[m] = Regime.DIP;
                    lastDip = m;
                    seasonal[m] = m >= YEAR && c.z()[m - YEAR] != null && c.z()[m - YEAR] <= p.dipZ();
                } else {
                    out[m] = Regime.STABLE;   // too long for a dip, not structural either
                    lastDip = -1;
                }
                continue;
            }
            dipRun = 0;
            if (lastDip >= 0 && m - lastDip <= p.dipRecoveryMonths() && Math.abs(x[m] - dipMedian) <= dipMad) {
                out[m] = Regime.DIP_RECOVERED;
                lastDip = -1;
                continue;
            }
            if (lastDip >= 0 && m - lastDip > p.dipRecoveryMonths()) {
                lastDip = -1;
            }
            out[m] = Regime.STABLE;
        }
        return new Result(out, seasonal);
    }

    /** OLS slope (points/month) of the non-null values in the window ending at m. Null below slopeMinPoints. */
    static Double slope(Double[] x, int m, Params p) {
        int[] w = CausalWindow.window(m, p.slopeMonths());
        double sx = 0, sy = 0, sxx = 0, sxy = 0;
        int k = 0;
        for (int i = w[0]; i <= w[1]; i++) {
            if (x[i] == null) continue;
            sx += i;
            sy += x[i];
            sxx += (double) i * i;
            sxy += i * x[i];
            k++;
        }
        if (k < p.slopeMinPoints()) return null;
        double den = k * sxx - sx * sx;
        return den == 0 ? null : (k * sxy - sx * sy) / den;
    }
}
