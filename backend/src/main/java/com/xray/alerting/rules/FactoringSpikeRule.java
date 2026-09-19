package com.xray.alerting.rules;

import com.xray.alerting.AlertRule;
import com.xray.alerting.AlertSignal;
import com.xray.alerting.AlertText;
import com.xray.alerting.EntityMonthView;
import com.xray.alerting.Thresholds;
import com.xray.config.ScoringConfig;
import com.xray.domain.model.AlertDirection;
import com.xray.domain.model.SignalId;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * SPEC §8.5 working-capital financing inflow multiplying in 3 months. No category maps to FINANCING_IN in
 * this dataset, so it never fires (overview F18); mapping one is a config edit.
 */
@Component
public class FactoringSpikeRule implements AlertRule {

    private final Thresholds.Level level;

    public FactoringSpikeRule(ScoringConfig config) {
        var l = config.alerts().factoringSpike();
        this.level = new Thresholds.Level(l.warn(), l.critical());
    }

    @Override public String code() { return "FACTORING_SPIKE"; }
    @Override public AlertDirection direction() { return AlertDirection.NEGATIVE; }
    @Override public String trigger() { return "financiación 3m " + AlertText.level(level, "× los 3m previos", 1, ">"); }

    @Override
    public Optional<AlertSignal> evaluate(EntityMonthView v) {
        Double now = v.signal(SignalId.FINANCING_IN_3M, v.m());
        Double prev = v.signal(SignalId.FINANCING_IN_PREV_3M, v.m());
        if (now == null || prev == null || prev <= 0) return Optional.empty();
        double ratio = now / prev;
        return Thresholds.above(ratio, level).map(s -> AlertSignal.negative(s,
                "La financiación de circulante se multiplica por " + AlertText.num(ratio, 1) + " en 3 meses", ratio));
    }
}
