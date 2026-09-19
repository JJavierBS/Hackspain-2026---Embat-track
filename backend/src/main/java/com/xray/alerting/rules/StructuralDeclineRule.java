package com.xray.alerting.rules;

import com.xray.alerting.AlertRule;
import com.xray.alerting.AlertSignal;
import com.xray.alerting.EntityMonthView;
import com.xray.domain.model.AlertDirection;
import com.xray.domain.model.DynamicsPoint;
import com.xray.domain.model.Regime;
import com.xray.domain.model.Severity;
import org.springframework.stereotype.Component;

import java.util.Optional;

/** SPEC §8.5 the final score enters the structural decline regime (SPEC §8.2). */
@Component
public class StructuralDeclineRule implements AlertRule {

    @Override public String code() { return "STRUCTURAL_DECLINE"; }
    @Override public AlertDirection direction() { return AlertDirection.NEGATIVE; }
    @Override public String trigger() { return "entra en régimen de deterioro estructural"; }

    @Override
    public Optional<AlertSignal> evaluate(EntityMonthView v) {
        DynamicsPoint d = v.dynamics(v.m());
        if (d == null || d.regime() != Regime.STRUCTURAL_DECLINE) return Optional.empty();
        return Optional.of(AlertSignal.negative(Severity.CRITICAL, "Entra en deterioro estructural", v.finalScore(v.m())));
    }
}
