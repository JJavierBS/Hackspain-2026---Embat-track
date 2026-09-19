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

/** SPEC §8.5 customer concentration (HHI) above the thresholds. */
@Component
public class ConcentrationHighRule implements AlertRule {

    private final Thresholds.Level level;

    public ConcentrationHighRule(ScoringConfig config) {
        var l = config.alerts().concentrationHigh();
        this.level = new Thresholds.Level(l.warn(), l.critical());
    }

    @Override public String code() { return "CONCENTRATION_HIGH"; }
    @Override public AlertDirection direction() { return AlertDirection.NEGATIVE; }
    @Override public String trigger() { return "HHI clientes " + AlertText.level(level, "", 0, ">"); }

    @Override
    public Optional<AlertSignal> evaluate(EntityMonthView v) {
        Double hhi = v.value(IndicatorId.CON_HHI_CUSTOMERS, v.m());
        return Thresholds.above(hhi, level).map(s -> AlertSignal.negative(s,
                "Concentración de clientes alta: HHI " + AlertText.num(hhi, 0), hhi));
    }
}
