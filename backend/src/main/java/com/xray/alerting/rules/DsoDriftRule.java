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

/** SPEC §8.5 DSO drifting up: days above the entity's own median of the previous months. */
@Component
public class DsoDriftRule implements AlertRule {

    private final Thresholds.Level level;
    private final int baselineMonths;
    private final int minPoints;

    public DsoDriftRule(ScoringConfig config) {
        var a = config.alerts();
        this.level = new Thresholds.Level(a.dsoDrift().warn(), a.dsoDrift().critical());
        this.baselineMonths = a.driftBaselineMonths();
        this.minPoints = a.driftBaselineMinPoints();
    }

    @Override public String code() { return "DSO_DRIFT"; }
    @Override public AlertDirection direction() { return AlertDirection.NEGATIVE; }

    @Override
    public String trigger() {
        return "+" + AlertText.num(level.warn(), 0) + " días / +" + AlertText.num(level.critical(), 0)
                + " días sobre la mediana de " + baselineMonths + " meses";
    }

    @Override
    public Optional<AlertSignal> evaluate(EntityMonthView v) {
        Double dso = v.value(IndicatorId.PAY_DSO, v.m());
        Double base = v.baselineMedian(IndicatorId.PAY_DSO, baselineMonths, minPoints);
        if (dso == null || base == null) return Optional.empty();
        double drift = dso - base;
        return Thresholds.above(drift, level).map(s -> AlertSignal.negative(s,
                "Cobra a " + AlertText.num(dso, 0) + " días, +" + AlertText.num(drift, 0)
                        + " sobre su mediana de " + baselineMonths + " meses", dso));
    }
}
