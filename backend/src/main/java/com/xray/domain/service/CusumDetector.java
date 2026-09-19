package com.xray.domain.service;

import com.xray.domain.model.ChangeDirection;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Two-sided CUSUM (SPEC §8.1, phase 4 decision E4). The baseline at m is the median and MAD × 1.4826 of the
 * non-null values of the previous baselineMonths months (m excluded), with σ ≥ sigmaFloor. No reset after an
 * alarm: an alarm is active while its cumulative sum stays above h. Each z adds at most zCap to a sum, so one
 * outlier cannot hold an alarm for months. z[] keeps the raw z (RegimeClassifier uses it for dips).
 * A null value carries the sums and the state.
 */
public final class CusumDetector {

    public static final double MAD_TO_SIGMA = 1.4826;

    public record Params(double k, double h, double zCap, int baselineMonths, int baselineMinPoints, double sigmaFloor) {
    }

    /** changeMonth = last month the sum was 0 before the alarm; alarmMonth = the month it fired. */
    public record Alarm(int changeMonth, int alarmMonth, ChangeDirection direction) {
    }

    public record Result(boolean[] upActive, boolean[] downActive, Double[] z, Double[] median, Double[] sigma,
                         List<Alarm> alarms) {
    }

    private CusumDetector() {
    }

    public static Result run(Double[] x, Params p) {
        int n = x.length;
        boolean[] up = new boolean[n];
        boolean[] down = new boolean[n];
        Double[] z = new Double[n];
        Double[] med = new Double[n];
        Double[] sig = new Double[n];
        List<Alarm> alarms = new ArrayList<>();
        double sPos = 0;
        double sNeg = 0;
        int zeroPos = 0;
        int zeroNeg = 0;
        boolean upOn = false;
        boolean downOn = false;
        for (int m = 0; m < n; m++) {
            if (x[m] != null) {
                double[] base = baseline(x, m, p.baselineMonths());
                if (base.length >= p.baselineMinPoints()) {
                    double md = median(base);
                    double s = Math.max(p.sigmaFloor(), MAD_TO_SIGMA * mad(base, md));
                    double zz = (x[m] - md) / s;
                    med[m] = md;
                    sig[m] = s;
                    z[m] = zz;
                    double zc = Math.max(-p.zCap(), Math.min(p.zCap(), zz));   // Huber: one outlier adds at most zCap
                    sPos = Math.max(0, sPos + zc - p.k());
                    sNeg = Math.max(0, sNeg - zc - p.k());
                } else {
                    sPos = 0;   // no baseline yet: nothing to compare with
                    sNeg = 0;
                }
                if (sPos == 0) zeroPos = m;
                if (sNeg == 0) zeroNeg = m;
                boolean upNow = sPos > p.h();
                boolean downNow = sNeg > p.h();
                if (upNow && !upOn) alarms.add(new Alarm(zeroPos, m, ChangeDirection.UP));
                if (downNow && !downOn) alarms.add(new Alarm(zeroNeg, m, ChangeDirection.DOWN));
                upOn = upNow;
                downOn = downNow;
            }
            up[m] = upOn;
            down[m] = downOn;
        }
        return new Result(up, down, z, med, sig, List.copyOf(alarms));
    }

    /** Non-null values of the `size` months before m, m excluded (causal). */
    static double[] baseline(Double[] x, int m, int size) {
        int[] w = CausalWindow.window(m - 1, size);
        return Arrays.stream(x, w[0], w[1] + 1).filter(v -> v != null).mapToDouble(Double::doubleValue).toArray();
    }

    static double median(double[] v) {
        double[] a = v.clone();
        Arrays.sort(a);
        int k = a.length / 2;
        return a.length % 2 == 1 ? a[k] : (a[k - 1] + a[k]) / 2;
    }

    static double mad(double[] v, double md) {
        return median(Arrays.stream(v).map(d -> Math.abs(d - md)).toArray());
    }
}
