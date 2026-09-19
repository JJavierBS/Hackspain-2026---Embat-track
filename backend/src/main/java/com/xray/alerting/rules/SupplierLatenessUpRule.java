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

/** SPEC §8.5 supplier payments getting later: days above the entity's own median of the previous months. */
@Component
public class SupplierLatenessUpRule implements AlertRule {

    private final Thresholds.Level level;
    private final int baselineMonths;
    private final int minPoints;

    public SupplierLatenessUpRule(ScoringConfig config) {
        var a = config.alerts();
        this.level = new Thresholds.Level(a.supplierLatenessUp().warn(), a.supplierLatenessUp().critical());
        this.baselineMonths = a.driftBaselineMonths();
        this.minPoints = a.driftBaselineMinPoints();
    }

    @Override public String code() { return "SUPPLIER_LATENESS_UP"; }
    @Override public AlertDirection direction() { return AlertDirection.NEGATIVE; }

    @Override
    public String trigger() {
        return "+" + AlertText.num(level.warn(), 0) + " días / +" + AlertText.num(level.critical(), 0)
                + " días de retraso sobre la mediana de " + baselineMonths + " meses";
    }

    @Override
    public Optional<AlertSignal> evaluate(EntityMonthView v) {
        Double late = v.value(IndicatorId.PAY_SUPPLIER_LATENESS, v.m());
        Double base = v.baselineMedian(IndicatorId.PAY_SUPPLIER_LATENESS, baselineMonths, minPoints);
        if (late == null || base == null) return Optional.empty();
        double drift = late - base;
        return Thresholds.above(drift, level).map(s -> AlertSignal.negative(s,
                "Paga con " + AlertText.num(late, 0) + " días de retraso, +" + AlertText.num(drift, 0)
                        + " sobre su mediana", late));
    }
}
