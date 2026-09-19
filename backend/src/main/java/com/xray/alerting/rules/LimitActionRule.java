package com.xray.alerting.rules;

import com.xray.alerting.AlertRule;
import com.xray.alerting.AlertSignal;
import com.xray.alerting.AlertText;
import com.xray.alerting.EntityMonthView;
import com.xray.domain.model.AlertDirection;
import com.xray.domain.model.LimitDecision;
import com.xray.domain.model.Severity;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * SPEC §10.1 the working-capital limit moved (limit profile only, overview F11). INCREASE is positive,
 * REDUCE WARN, FREEZE CRITICAL; MAINTAIN and DECLINE emit nothing (overview F13).
 */
@Component
public class LimitActionRule implements AlertRule {

    @Override public String code() { return "LIMIT_ACTION"; }
    @Override public AlertDirection direction() { return AlertDirection.BOTH; }
    @Override public boolean event() { return true; }
    @Override public String trigger() { return "el límite de circulante se amplía, reduce o congela"; }

    @Override
    public Optional<AlertSignal> evaluate(EntityMonthView v) {
        LimitDecision d = v.limit(v.m());
        if (d == null || d.prevLimitEur() == null) return Optional.empty();
        String change = AlertText.eur(d.prevLimitEur()) + " → " + AlertText.eur(d.limitEur());
        return switch (d.action()) {
            case INCREASE -> Optional.of(AlertSignal.positive("Límite ampliado: " + change, d.limitEur()));
            case REDUCE -> Optional.of(AlertSignal.negative(Severity.WARN, "Límite reducido: " + change, d.limitEur()));
            case FREEZE -> Optional.of(AlertSignal.negative(Severity.CRITICAL, "Límite congelado: " + change,
                    d.limitEur()));
            case MAINTAIN, DECLINE -> Optional.empty();
        };
    }
}
