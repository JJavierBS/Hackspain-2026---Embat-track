package com.xray.domain.service;

import com.xray.alerting.AlertRule;
import com.xray.alerting.AlertSignal;
import com.xray.alerting.EntityMonthView;
import com.xray.domain.model.Alert;
import com.xray.domain.model.AlertState;
import com.xray.domain.model.EntityPanel;
import com.xray.domain.model.Profile;
import com.xray.domain.model.ProfileScore;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Runs the rules over one panel and profile; emits alerts on transitions only (SPEC §8.5, overview F12). */
public final class AlertEngine {

    private AlertEngine() {
    }

    public record Output(List<Alert> alerts, List<AlertState> states) {
    }

    public static Output run(EntityPanel panel, Profile profile, boolean limitProfile, List<AlertRule> rules) {
        List<Alert> alerts = new ArrayList<>();
        List<AlertState> states = new ArrayList<>();
        ProfileScore[] scores = panel.profileScores(profile);
        if (scores == null) {
            return new Output(alerts, states);
        }
        Map<String, AlertSignal> prev = Map.of();
        boolean seeded = false;
        for (int m = 0; m < panel.size(); m++) {
            if (scores[m] == null || scores[m].finalScore() == null) {
                continue;
            }
            EntityMonthView view = new EntityMonthView(panel, profile, m, limitProfile);
            Map<String, AlertSignal> now = new HashMap<>();
            for (AlertRule rule : rules) {
                Optional<AlertSignal> s = rule.evaluate(view);
                if (s.isEmpty()) {
                    continue;
                }
                AlertSignal sig = s.get();
                now.put(rule.code(), sig);
                states.add(new AlertState(panel.key(), m, profile, rule.code(), sig.severity(), sig.direction(),
                        sig.value()));
                AlertSignal before = prev.get(rule.code());
                boolean transition = rule.event() || before == null
                        || before.severity() != sig.severity() || before.direction() != sig.direction();
                if (seeded && transition) {
                    alerts.add(new Alert(panel.key(), m, profile, rule.code(), sig.severity(), sig.direction(),
                            sig.message(), sig.value()));
                }
            }
            prev = now;
            seeded = true;
        }
        return new Output(alerts, states);
    }
}
