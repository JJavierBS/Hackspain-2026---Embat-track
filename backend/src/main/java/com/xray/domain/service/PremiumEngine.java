package com.xray.domain.service;

import com.xray.domain.model.Band;
import com.xray.domain.model.ChangeDirection;
import com.xray.domain.model.PremiumQuote;

import java.util.Map;

/** SPEC §10.2 dynamic trade-credit premium, exactly as overview contract item 4. Pure: no Spring, no SQL. */
public final class PremiumEngine {

    private PremiumEngine() {
    }

    /** multiplierByBand: a band missing from the map is not insurable. */
    public record Params(double basePremiumRate, Map<Band, Double> multiplierByBand) {
    }

    /** opOutAvg3m, dpoDays and prev may be null (missing is never zero). */
    public static PremiumQuote quote(double finalScore, Band band, Double opOutAvg3m, Double dpoDays, PremiumQuote prev,
                                     Params p, LimitEngine.Params lp) {
        Double multiplier = p.multiplierByBand().get(band);
        boolean insurable = multiplier != null;
        Double rate = insurable ? p.basePremiumRate() * multiplier : null;
        Double buyerLimit = opOutAvg3m == null || dpoDays == null ? null
                : !insurable ? 0.0
                : LimitEngine.roundDown(opOutAvg3m * (dpoDays / 30) * LimitEngine.factor(finalScore, lp),
                lp.roundingEur());
        Band prevBand = prev == null ? null : prev.band();
        ChangeDirection tier = prevBand == null || prevBand == band ? null
                : band.ordinal() < prevBand.ordinal() ? ChangeDirection.UP : ChangeDirection.DOWN;
        return new PremiumQuote(finalScore, band, insurable, rate, prev == null ? null : prev.premiumRate(),
                prevBand, buyerLimit, tier);
    }
}
