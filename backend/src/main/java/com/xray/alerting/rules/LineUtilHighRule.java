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

/** SPEC §8.5 credit line drawn above the thresholds. */
@Component
public class LineUtilHighRule implements AlertRule {

    private final Thresholds.Level level;

    public LineUtilHighRule(ScoringConfig config) {
        var l = config.alerts().lineUtilHigh();
        this.level = new Thresholds.Level(l.warn(), l.critical());
    }

    @Override public String code() { return "LINE_UTIL_HIGH"; }
    @Override public AlertDirection direction() { return AlertDirection.NEGATIVE; }

    @Override
    public String trigger() {
        return "póliza dispuesta > " + AlertText.pct(level.warn()) + " / > " + AlertText.pct(level.critical());
    }

    @Override
    public Optional<AlertSignal> evaluate(EntityMonthView v) {
        Double util = v.value(IndicatorId.DEBT_LINE_UTIL, v.m());
        return Thresholds.above(util, level).map(s -> AlertSignal.negative(s,
                "Póliza de crédito dispuesta al " + AlertText.pct(util), util));
    }
}
