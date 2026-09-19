package com.xray.alerting.rules;

import com.xray.alerting.AlertRule;
import com.xray.alerting.AlertSignal;
import com.xray.alerting.AlertText;
import com.xray.alerting.EntityMonthView;
import com.xray.alerting.Thresholds;
import com.xray.config.ScoringConfig;
import com.xray.domain.model.AlertDirection;
import com.xray.domain.model.IndicatorId;
import org.springframework.stereotype.Component;

import java.util.Optional;

/** SPEC §8.5 cash runway below the thresholds. */
@Component
public class RunwayLowRule implements AlertRule {

    private final Thresholds.Level level;

    public RunwayLowRule(ScoringConfig config) {
        var l = config.alerts().runwayLow();
        this.level = new Thresholds.Level(l.warn(), l.critical());
    }

    @Override public String code() { return "RUNWAY_LOW"; }
    @Override public AlertDirection direction() { return AlertDirection.NEGATIVE; }
    @Override public String trigger() { return AlertText.level(level, "meses de caja", 1, "<"); }

    @Override
    public Optional<AlertSignal> evaluate(EntityMonthView v) {
        Double runway = v.value(IndicatorId.LIQ_RUNWAY, v.m());
        return Thresholds.below(runway, level).map(s -> AlertSignal.negative(s,
                "Caja para " + AlertText.num(runway, 1) + " meses de gasto neto", runway));
    }
}
