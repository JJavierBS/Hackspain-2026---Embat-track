package com.xray.alerting.rules;

import com.xray.alerting.AlertRule;
import com.xray.alerting.AlertSignal;
import com.xray.alerting.EntityMonthView;
import com.xray.config.ScoringConfig;
import com.xray.domain.model.AlertDirection;
import com.xray.domain.model.Band;
import com.xray.domain.model.ProfileScore;
import com.xray.domain.model.Severity;
import org.springframework.stereotype.Component;

import java.util.Optional;

/** SPEC §8.5 band worse than last month. In INSURER it is the premium tier alert (overview F9). */
@Component
public class BandDowngradeRule implements AlertRule {

    private final int criticalSteps;

    public BandDowngradeRule(ScoringConfig config) {
        this.criticalSteps = config.alerts().bandDowngradeCriticalSteps();
    }

    @Override public String code() { return "BAND_DOWNGRADE"; }
    @Override public AlertDirection direction() { return AlertDirection.NEGATIVE; }
    @Override public boolean event() { return true; }
    @Override public String trigger() { return "baja de banda / " + criticalSteps + " bandas o más, o a la banda E"; }

    @Override
    public Optional<AlertSignal> evaluate(EntityMonthView v) {
        ProfileScore now = v.score(v.m());
        ProfileScore before = v.score(v.m() - 1);
        if (now == null || before == null || now.band() == null || before.band() == null) return Optional.empty();
        int steps = now.band().ordinal() - before.band().ordinal();
        if (steps <= 0) return Optional.empty();
        Severity s = steps >= criticalSteps || now.band() == Band.E ? Severity.CRITICAL : Severity.WARN;
        return Optional.of(AlertSignal.negative(s,
                "Baja de banda " + before.band() + " a " + now.band(), now.finalScore()));
    }
}
