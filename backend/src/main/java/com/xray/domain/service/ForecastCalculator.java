package com.xray.domain.service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Projects the final score month by month (phase 7 decisions H11–H15, docs/FORECAST.md).
 * Method: mean reversion (AR(1)) toward the entity's own median, v[h] = median + rho · (v[h-1] − median),
 * v[0] = final[m], clamped to [0, 100]. The backtest in docs/FORECAST.md picked it: it beats persistence
 * from h = 2 on, and the damped linear trend of the source branch loses to persistence at every horizon.
 * <p>
 * Causal (decision H12): the forecast made at month m reads final[0..m] only. No forecast when final[m]
 * is null or fewer than minPoints scored months exist. Reliability comes from the scored months up to m:
 * below minHistoryMonths LOW, below mediumHistoryMonths MEDIUM, else HIGH (decision H14).
 */
public final class ForecastCalculator {

    public enum Reliability { LOW, MEDIUM, HIGH }

    public record Params(double meanReversion, int maxHorizonMonths, int minPoints, int minHistoryMonths,
                         int mediumHistoryMonths) {
    }

    /** horizon 1..maxHorizonMonths months after the origin month. */
    public record Point(int horizon, double value) {
    }

    /** points[m] is empty when month m has no forecast; target[m] is the median the projection reverts to. */
    public record Result(List<Point>[] points, Reliability[] reliability, Double[] target, int[] history) {
    }

    private ForecastCalculator() {
    }

    @SuppressWarnings("unchecked")
    public static Result forecast(Double[] finalSeries, Params p) {
        int n = finalSeries.length;
        List<Point>[] points = new List[n];
        Reliability[] reliability = new Reliability[n];
        Double[] target = new Double[n];
        int[] history = new int[n];
        for (int m = 0; m < n; m++) {
            double[] past = Arrays.stream(finalSeries, 0, m + 1).filter(v -> v != null)
                    .mapToDouble(Double::doubleValue).toArray();
            history[m] = past.length;
            points[m] = List.of();
            if (finalSeries[m] == null || past.length < p.minPoints()) {
                continue;
            }
            reliability[m] = past.length < p.minHistoryMonths() ? Reliability.LOW
                    : past.length < p.mediumHistoryMonths() ? Reliability.MEDIUM : Reliability.HIGH;
            double median = CusumDetector.median(past);
            target[m] = median;
            List<Point> out = new ArrayList<>(p.maxHorizonMonths());
            double v = finalSeries[m];
            for (int h = 1; h <= p.maxHorizonMonths(); h++) {
                v = Math.max(0, Math.min(100, median + p.meanReversion() * (v - median)));
                out.add(new Point(h, v));
            }
            points[m] = List.copyOf(out);
        }
        return new Result(points, reliability, target, history);
    }
}
