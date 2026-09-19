package com.xray.domain.service;

import com.xray.domain.model.Band;
import com.xray.domain.model.BindingConstraint;
import com.xray.domain.model.LimitAction;
import com.xray.domain.model.LimitDecision;
import com.xray.domain.model.LimitSimulation;

import java.util.Map;

/** SPEC §10.1 working-capital limit, exactly as overview contract item 3. Pure: no Spring, no SQL. */
public final class LimitEngine {

    private LimitEngine() {
    }

    /** spreadBpsByBand: a band missing from the map has no spread (DECLINE). */
    public record Params(double scoreFloor, double factorAtFloor, double factorAt100, double trendModifierSpan,
                         double runwayGuardBelowMonths, double runwayGuardMultiplier, double dscrMin,
                         int defaultTermMonths, double referenceRate, Map<Band, Integer> spreadBpsByBand,
                         double actionThreshold, double roundingEur) {
    }

    /** traj, runwayMonths, nocf12m, debtService12m, prevLimitEur may be null (overview F6). */
    public record Inputs(double finalScore, Double traj, Band band, double baseEur, Double runwayMonths,
                         Double nocf12m, Double debtService12m, Double prevLimitEur) {
    }

    public static double factor(double finalScore, Params p) {
        if (finalScore < p.scoreFloor()) {
            return 0;
        }
        return p.factorAtFloor()
                + (finalScore - p.scoreFloor()) / (100 - p.scoreFloor()) * (p.factorAt100() - p.factorAtFloor());
    }

    static double trend(Double traj, Params p) {
        if (traj == null) {
            return 1;
        }
        double s = p.trendModifierSpan();
        return Math.max(1 - s, Math.min(1 + s, 1 + s * (traj - 50) / 50));
    }

    static double annualCostFactor(int termMonths, int spreadBps, Params p) {
        return 12.0 / termMonths + p.referenceRate() + spreadBps / 10_000.0;
    }

    /** Rounds down to a multiple of step; negative amounts give 0. Shared with the premium buyer limit. */
    public static double roundDown(double eur, double step) {
        return Math.floor(Math.max(0, eur) / step) * step;
    }

    static Double dscr(Double nocf, double denominator) {
        return nocf == null || denominator <= 0 ? null : nocf / denominator;
    }

    /** DSCR cap for a term, or null when NOCF is missing (overview F6). */
    static Double cap(Double nocf12m, double ds, double acf, Params p) {
        return nocf12m == null ? null : Math.max(0, nocf12m / p.dscrMin() - ds) / acf;
    }

    public static LimitDecision decide(Inputs in, Params p) {
        Integer spread = p.spreadBpsByBand().get(in.band());
        double factor = factor(in.finalScore(), p);
        double trend = trend(in.traj(), p);
        boolean guard = in.runwayMonths() != null && in.runwayMonths() < p.runwayGuardBelowMonths();
        double raw = Math.max(0, in.baseEur() * factor * trend * (guard ? p.runwayGuardMultiplier() : 1));
        double ds = in.debtService12m() == null ? 0 : in.debtService12m();

        Double acf = spread == null ? null : annualCostFactor(p.defaultTermMonths(), spread, p);
        Double cap = acf == null ? null : cap(in.nocf12m(), ds, acf, p);
        double limit = spread == null ? 0 : roundDown(cap == null ? raw : Math.min(raw, cap), p.roundingEur());
        BindingConstraint binding = cap != null && cap < raw ? BindingConstraint.DSCR
                : guard ? BindingConstraint.RUNWAY : BindingConstraint.SCORE;
        Double projected = dscr(in.nocf12m(), ds + (limit > 0 ? limit * acf : 0));
        Double allIn = spread == null ? null : p.referenceRate() + spread / 10_000.0;

        return new LimitDecision(in.finalScore(), in.traj(), in.band(), in.baseEur(), factor, trend, guard, raw,
                in.nocf12m(), in.debtService12m(), cap, limit, in.prevLimitEur(), spread, allIn,
                action(limit, in.prevLimitEur(), spread != null, p.actionThreshold()), binding, projected);
    }

    /** Overview contract item 3, first match wins. */
    static LimitAction action(double limit, Double prev, boolean hasSpread, double t) {
        if (limit == 0 && prev != null && prev > 0) return LimitAction.FREEZE;
        if (!hasSpread) return LimitAction.DECLINE;
        if (prev == null) return LimitAction.MAINTAIN;
        if (limit > prev && limit >= prev * (1 + t)) return LimitAction.INCREASE;
        if (limit < prev && limit <= prev * (1 - t)) return LimitAction.REDUCE;
        return LimitAction.MAINTAIN;
    }

    /** SPEC §10.1 simulator on a stored decision: same caps, the user's term (overview F8). */
    public static LimitSimulation simulate(LimitDecision d, double requestedEur, int termMonths, Params p) {
        double ds = d.debtService12m() == null ? 0 : d.debtService12m();
        if (d.spreadBps() == null) {
            return new LimitSimulation("DECLINE", requestedEur, 0, 0, termMonths, null, null,
                    dscr(d.nocf12m(), ds), BindingConstraint.BAND);
        }
        double acf = annualCostFactor(termMonths, d.spreadBps(), p);
        Double cap = cap(d.nocf12m(), ds, acf, p);
        double capacity = roundDown(cap == null ? d.rawLimitEur() : Math.min(d.rawLimitEur(), cap), p.roundingEur());
        BindingConstraint binding = cap != null && cap < d.rawLimitEur() ? BindingConstraint.DSCR
                : d.runwayGuard() ? BindingConstraint.RUNWAY : BindingConstraint.SCORE;
        double approved = Math.min(requestedEur, capacity);
        String decision = capacity <= 0 ? "DECLINE" : requestedEur <= capacity ? "APPROVE" : "PARTIAL";
        return new LimitSimulation(decision, requestedEur, approved, capacity, termMonths, d.spreadBps(),
                d.allInRate(), dscr(d.nocf12m(), ds + approved * acf), binding);
    }
}
