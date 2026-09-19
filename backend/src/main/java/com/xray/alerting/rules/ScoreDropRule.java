package com.xray.alerting.rules;

import com.xray.alerting.AlertRule;
import com.xray.alerting.AlertSignal;
import com.xray.alerting.AlertText;
import com.xray.alerting.EntityMonthView;
import com.xray.alerting.Thresholds;
import com.xray.config.ScoringConfig;
import com.xray.domain.model.AlertDirection;
import org.springframework.stereotype.Component;

import java.util.Optional;

/** SPEC §8.5 final score falling by more than the thresholds over score-drop-months. */
@Component
public class ScoreDropRule implements AlertRule {

    private final Thresholds.Level level;
    private final int months;

    public ScoreDropRule(ScoringConfig config) {
        var a = config.alerts();
        this.level = new Thresholds.Level(a.scoreDrop().warn(), a.scoreDrop().critical());
        this.months = a.scoreDropMonths();
    }

    @Override public String code() { return "SCORE_DROP"; }
    @Override public AlertDirection direction() { return AlertDirection.NEGATIVE; }

    @Override
    public String trigger() {
        return "cae > " + AlertText.num(level.warn(), 0) + " / > " + AlertText.num(level.critical(), 0)
                + " puntos en " + months + " meses";
    }

    @Override
    public Optional<AlertSignal> evaluate(EntityMonthView v) {
        Double before = v.finalScore(v.m() - months);
        Double now = v.finalScore(v.m());
        if (before == null || now == null) return Optional.empty();
        double drop = before - now;
        return Thresholds.above(drop, level).map(s -> AlertSignal.negative(s,
                "La nota cae " + AlertText.num(drop, 1) + " puntos en " + months + " meses ("
                        + AlertText.num(before, 1) + " → " + AlertText.num(now, 1) + ")", drop));
    }
}
