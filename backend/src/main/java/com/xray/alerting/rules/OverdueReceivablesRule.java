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

/** SPEC §8.5 share of issued invoices overdue and unpaid above the thresholds. */
@Component
public class OverdueReceivablesRule implements AlertRule {

    private final Thresholds.Level level;

    public OverdueReceivablesRule(ScoringConfig config) {
        var l = config.alerts().overdueReceivables();
        this.level = new Thresholds.Level(l.warn(), l.critical());
    }

    @Override public String code() { return "OVERDUE_RECEIVABLES"; }
    @Override public AlertDirection direction() { return AlertDirection.NEGATIVE; }

    @Override
    public String trigger() {
        return "vencido > " + AlertText.pct(level.warn()) + " / > " + AlertText.pct(level.critical())
                + " de lo facturado";
    }

    @Override
    public Optional<AlertSignal> evaluate(EntityMonthView v) {
        Double share = v.value(IndicatorId.DEL_OVERDUE_RECEIVABLES, v.m());
        return Thresholds.above(share, level).map(s -> AlertSignal.negative(s,
                AlertText.pct(share) + " de lo facturado está vencido sin cobrar", share));
    }
}
