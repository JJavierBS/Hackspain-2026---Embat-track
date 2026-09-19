package com.xray.pipeline.stages;

import com.xray.alerting.AlertRule;
import com.xray.config.ScoringConfig;
import com.xray.domain.model.Alert;
import com.xray.domain.model.AlertDirection;
import com.xray.domain.model.AlertState;
import com.xray.domain.model.EntityKey;
import com.xray.domain.model.Month;
import com.xray.domain.model.Profile;
import com.xray.domain.model.Severity;
import com.xray.domain.service.AlertEngine;
import com.xray.infrastructure.duckdb.ResultWriter;
import com.xray.pipeline.PipelineContext;
import com.xray.pipeline.PipelineStage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * SPEC §8.5 early warnings: alert transitions, active states and the watchlist (overview contract items 6–7).
 * Runs after S75 because LIMIT_ACTION reads the limit decisions (decision F3).
 */
@Component
@Order(80)
public class S80_Alerts implements PipelineStage {

    private static final Logger log = LoggerFactory.getLogger(S80_Alerts.class);

    static final String ALERTS_DDL = "entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, profile VARCHAR, "
            + "code VARCHAR, severity VARCHAR, direction VARCHAR, message VARCHAR, value DOUBLE";
    static final String STATES_DDL = "entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, profile VARCHAR, "
            + "code VARCHAR, severity VARCHAR, direction VARCHAR, value DOUBLE";
    static final String WATCHLIST_DDL = "entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, profile VARCHAR, "
            + "n_critical INTEGER, n_warn INTEGER";

    private final ResultWriter writer;
    private final List<AlertRule> rules;

    public S80_Alerts(ResultWriter writer, List<AlertRule> rules) {
        Set<String> codes = new HashSet<>();
        for (AlertRule r : rules) {
            if (!codes.add(r.code())) {
                throw new IllegalStateException("duplicate alert code " + r.code());
            }
        }
        this.writer = writer;
        this.rules = List.copyOf(rules);
    }

    @Override
    public String id() {
        return "S80_ALERTS";
    }

    @Override
    public void execute(PipelineContext ctx) {
        if (ctx.panels().isEmpty()) {
            ctx.report(id(), 80, "skipped: no panels");
            return;
        }
        Profile limitProfile = ctx.config().products().limitProfile();
        ScoringConfig.WatchlistConfig wl = ctx.config().alerts().watchlist();
        List<Month> months = ctx.panels().getFirst().months();

        List<AlertEngine.Output> outputs = ctx.panels().parallelStream()
                .flatMap(panel -> Arrays.stream(Profile.values())
                        .map(p -> AlertEngine.run(panel, p, p == limitProfile, rules)))
                .toList();

        List<Object[]> alertRows = new ArrayList<>();
        List<Object[]> stateRows = new ArrayList<>();
        Map<WatchKey, int[]> counts = new LinkedHashMap<>();
        for (AlertEngine.Output out : outputs) {
            for (Alert a : out.alerts()) {
                alertRows.add(new Object[]{a.key().type().name(), a.key().id(), months.get(a.month()).toString(),
                        a.profile().name(), a.code(), a.severity().name(), a.direction().name(), a.message(),
                        a.value()});
            }
            for (AlertState s : out.states()) {
                stateRows.add(new Object[]{s.key().type().name(), s.key().id(), months.get(s.month()).toString(),
                        s.profile().name(), s.code(), s.severity().name(), s.direction().name(), s.value()});
                if (s.direction() == AlertDirection.NEGATIVE) {
                    int[] c = counts.computeIfAbsent(new WatchKey(s.key(), s.month(), s.profile()), k -> new int[2]);
                    c[s.severity() == Severity.CRITICAL ? 0 : 1]++;
                }
            }
        }
        List<Object[]> watchRows = new ArrayList<>();
        counts.forEach((k, c) -> {
            if (c[0] >= wl.minCritical() || c[1] >= wl.minWarn()) {
                watchRows.add(new Object[]{k.key().type().name(), k.key().id(), months.get(k.month()).toString(),
                        k.profile().name(), c[0], c[1]});
            }
        });

        writer.replace("alerts", ALERTS_DDL, alertRows);
        writer.replace("alert_states", STATES_DDL, stateRows);
        writer.replace("watchlist", WATCHLIST_DDL, watchRows);
        log.info("{} wrote {} alerts, {} states, {} watchlist rows", id(), alertRows.size(), stateRows.size(),
                watchRows.size());
        ctx.report(id(), 85, alertRows.size() + " alerts");
    }

    private record WatchKey(EntityKey key, int month, Profile profile) {
    }
}
