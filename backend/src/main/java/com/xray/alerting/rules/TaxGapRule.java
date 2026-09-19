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

/** SPEC §8.5 months since the last tax payment, relative to the entity's own cadence. */
@Component
public class TaxGapRule implements AlertRule {

    private final Thresholds.Level level;

    public TaxGapRule(ScoringConfig config) {
        var l = config.alerts().taxGap();
        this.level = new Thresholds.Level(l.warn(), l.critical());
    }

    @Override public String code() { return "TAX_GAP"; }
    @Override public AlertDirection direction() { return AlertDirection.NEGATIVE; }

    @Override
    public String trigger() {
        return "hueco > " + AlertText.num(level.warn(), 1) + " × su cadencia / > "
                + AlertText.num(level.critical(), 1) + " ×";
    }

    @Override
    public Optional<AlertSignal> evaluate(EntityMonthView v) {
        Double gap = v.signal(SignalId.TAX_GAP_MONTHS, v.m());
        Double cadence = v.signal(SignalId.TAX_CADENCE_MONTHS, v.m());
        if (gap == null || cadence == null || cadence <= 0) return Optional.empty();
        double ratio = gap / cadence;
        return Thresholds.above(ratio, level).map(s -> AlertSignal.negative(s,
                AlertText.num(gap, 0) + " meses sin pagar impuestos (lo habitual: cada "
                        + AlertText.num(cadence, 0) + ")", gap));
    }
}
