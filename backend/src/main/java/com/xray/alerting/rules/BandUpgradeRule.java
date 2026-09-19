package com.xray.alerting.rules;

import com.xray.alerting.AlertRule;
import com.xray.alerting.AlertSignal;
import com.xray.alerting.EntityMonthView;
import com.xray.domain.model.AlertDirection;
import com.xray.domain.model.ProfileScore;
import org.springframework.stereotype.Component;

import java.util.Optional;

/** SPEC §8.5 band better than last month. Positive. */
@Component
public class BandUpgradeRule implements AlertRule {

    @Override public String code() { return "BAND_UPGRADE"; }
    @Override public AlertDirection direction() { return AlertDirection.POSITIVE; }
    @Override public boolean event() { return true; }
    @Override public String trigger() { return "sube de banda"; }

    @Override
    public Optional<AlertSignal> evaluate(EntityMonthView v) {
        ProfileScore now = v.score(v.m());
        ProfileScore before = v.score(v.m() - 1);
        if (now == null || before == null || now.band() == null || before.band() == null) return Optional.empty();
        if (now.band().ordinal() >= before.band().ordinal()) return Optional.empty();
        return Optional.of(AlertSignal.positive("Sube de banda " + before.band() + " a " + now.band(), now.finalScore()));
    }
}
