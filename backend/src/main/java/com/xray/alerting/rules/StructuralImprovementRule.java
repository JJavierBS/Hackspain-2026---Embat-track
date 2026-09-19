package com.xray.alerting.rules;

import com.xray.alerting.AlertRule;
import com.xray.alerting.AlertSignal;
import com.xray.alerting.EntityMonthView;
import com.xray.domain.model.AlertDirection;
import com.xray.domain.model.DynamicsPoint;
import com.xray.domain.model.Regime;
import org.springframework.stereotype.Component;

import java.util.Optional;

/** SPEC §8.5 the final score enters the structural improvement regime (SPEC §8.2). Positive. */
@Component
public class StructuralImprovementRule implements AlertRule {

    @Override public String code() { return "STRUCTURAL_IMPROVEMENT"; }
    @Override public AlertDirection direction() { return AlertDirection.POSITIVE; }
    @Override public String trigger() { return "entra en régimen de mejora estructural"; }

    @Override
    public Optional<AlertSignal> evaluate(EntityMonthView v) {
        DynamicsPoint d = v.dynamics(v.m());
        if (d == null || d.regime() != Regime.STRUCTURAL_IMPROVEMENT) return Optional.empty();
        return Optional.of(AlertSignal.positive("Entra en mejora estructural", v.finalScore(v.m())));
    }
}
