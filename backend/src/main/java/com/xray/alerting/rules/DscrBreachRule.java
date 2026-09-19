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

/** SPEC §8.5 debt service coverage below the thresholds. No debt service → no value → no alert. */
@Component
public class DscrBreachRule implements AlertRule {

    private final Thresholds.Level level;

    public DscrBreachRule(ScoringConfig config) {
        var l = config.alerts().dscrBreach();
        this.level = new Thresholds.Level(l.warn(), l.critical());
    }

    @Override public String code() { return "DSCR_BREACH"; }
    @Override public AlertDirection direction() { return AlertDirection.NEGATIVE; }
    @Override public String trigger() { return "DSCR " + AlertText.level(level, "x", 2, "<"); }

    @Override
    public Optional<AlertSignal> evaluate(EntityMonthView v) {
        Double dscr = v.value(IndicatorId.DEBT_DSCR, v.m());
        return Thresholds.below(dscr, level).map(s -> AlertSignal.negative(s,
                "Cobertura del servicio de deuda " + AlertText.num(dscr, 2) + "x", dscr));
    }
}
