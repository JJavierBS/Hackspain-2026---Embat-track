package com.xray.pipeline.stages;

import com.xray.domain.model.DynamicsPoint;
import com.xray.domain.model.EntityPanel;
import com.xray.domain.model.EntityType;
import com.xray.domain.model.EventType;
import com.xray.domain.model.HealthStatus;
import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.LeadTimeEvent;
import com.xray.domain.model.LeadTimeSignal;
import com.xray.domain.model.LimitAction;
import com.xray.domain.model.LimitDecision;
import com.xray.domain.model.Month;
import com.xray.domain.model.Profile;
import com.xray.domain.model.ProfileScore;
import com.xray.domain.model.RawIndicator;
import com.xray.domain.model.Regime;
import com.xray.domain.model.ShowcasePair;
import com.xray.domain.model.SubScore;
import com.xray.domain.service.LeadTimeAnalyzer;
import com.xray.domain.service.ShowcaseFinder;
import com.xray.infrastructure.duckdb.ResultWriter;
import com.xray.pipeline.PipelineContext;
import com.xray.pipeline.PipelineStage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

/**
 * SPEC §8.4 lead time and SPEC §10.4 showcase pairs (phase 6 contract items 3–5).
 * Reads the panels only — no ctx.sql() — so LookAheadTest can run it on an in-memory database.
 * Its tables are evaluation output (decision G8): nothing in scoring, products or alerts reads them back.
 */
@Component
@Order(90)
public class S90_Analytics implements PipelineStage {

    private static final Logger log = LoggerFactory.getLogger(S90_Analytics.class);

    // "trigger" and "rank" are reserved words in some engines: DuckDB accepts them, but always quote them in SQL.
    static final String EVENTS_DDL = "entity_type VARCHAR, entity_id VARCHAR, profile VARCHAR, event_type VARCHAR, "
            + "trigger VARCHAR, event_month VARCHAR, signal_month VARCHAR, lead_months INTEGER, "
            + "limit_signal_month VARCHAR, limit_lead_months INTEGER";
    static final String SIGNALS_DDL = "entity_type VARCHAR, entity_id VARCHAR, profile VARCHAR, event_type VARCHAR, "
            + "signal_month VARCHAR, evaluable BOOLEAN, followed BOOLEAN";
    static final String PAIRS_DDL = "entity_type VARCHAR, month VARCHAR, profile VARCHAR, rank INTEGER, "
            + "up_id VARCHAR, down_id VARCHAR, up_final DOUBLE, down_final DOUBLE, up_traj DOUBLE, down_traj DOUBLE, "
            + "final_gap DOUBLE, traj_gap DOUBLE, meets_spec BOOLEAN";

    private final ResultWriter writer;

    public S90_Analytics(ResultWriter writer) {
        this.writer = writer;
    }

    @Override
    public String id() {
        return "S90_ANALYTICS";
    }

    @Override
    public void execute(PipelineContext ctx) {
        if (ctx.panels().isEmpty()) {
            ctx.report(id(), 90, "skipped: no panels");
            return;
        }
        LeadTimeAnalyzer.Params lp = ctx.config().leadTime().toParams();
        ShowcaseFinder.Params sp = ctx.config().showcase().toParams();
        Profile limitProfile = ctx.config().products().limitProfile();
        List<Month> months = ctx.panels().getFirst().months();

        List<Analysis> analyses = ctx.panels().parallelStream()
                .flatMap(panel -> Arrays.stream(Profile.values())
                        .map(p -> new Analysis(panel, p,
                                LeadTimeAnalyzer.analyze(series(panel, p, p == limitProfile), lp))))
                .toList();

        List<Object[]> eventRows = new ArrayList<>();
        List<Object[]> signalRows = new ArrayList<>();
        for (Analysis a : analyses) {
            for (LeadTimeAnalyzer.Event e : a.result().events()) {
                LeadTimeEvent row = new LeadTimeEvent(a.panel().key(), a.profile(), e.type(), e.trigger(), e.month(),
                        e.signalMonth(), e.limitSignalMonth());
                eventRows.add(new Object[]{row.key().type().name(), row.key().id(), row.profile().name(),
                        row.type().name(), row.trigger().name(), months.get(row.eventMonth()).toString(),
                        month(months, row.signalMonth()), row.leadMonths(),
                        month(months, row.limitSignalMonth()), row.limitLeadMonths()});
            }
            for (LeadTimeAnalyzer.Signal s : a.result().signals()) {
                LeadTimeSignal row = new LeadTimeSignal(a.panel().key(), a.profile(), s.type(), s.month(),
                        s.evaluable(), s.followed());
                signalRows.add(new Object[]{row.key().type().name(), row.key().id(), row.profile().name(),
                        row.type().name(), months.get(row.month()).toString(), row.evaluable(), row.followed()});
            }
        }

        List<Object[]> pairRows = pairs(ctx.panels(), months, sp);

        writer.replace("lead_time_events", EVENTS_DDL, eventRows);
        writer.replace("lead_time_signals", SIGNALS_DDL, signalRows);
        writer.replace("showcase_pairs", PAIRS_DDL, pairRows);
        log.info("{} wrote {} events, {} signal onsets, {} showcase pairs", id(), eventRows.size(), signalRows.size(),
                pairRows.size());
        ctx.report(id(), 95, eventRows.size() + " lead-time events");
    }

    private record Analysis(EntityPanel panel, Profile profile, LeadTimeAnalyzer.Result result) {
    }

    private static String month(List<Month> months, Integer ordinal) {
        return ordinal == null ? null : months.get(ordinal).toString();
    }

    /** SPEC §10.4: pairs are picked inside one month and one profile, which keeps them causal. */
    private static List<Object[]> pairs(List<EntityPanel> panels, List<Month> months, ShowcaseFinder.Params sp) {
        Map<EntityType, List<EntityPanel>> byType = panels.stream()
                .collect(Collectors.groupingBy(p -> p.key().type()));
        int n = months.size();
        return byType.entrySet().parallelStream()
                .flatMap(entry -> IntStream.range(0, n).boxed().flatMap(m -> Arrays.stream(Profile.values())
                        .flatMap(profile -> {
                            List<ShowcaseFinder.Candidate> candidates = new ArrayList<>();
                            for (EntityPanel panel : entry.getValue()) {
                                ProfileScore[] s = panel.profileScores(profile);
                                if (s == null || s[m] == null || s[m].finalScore() == null) {
                                    continue;
                                }
                                candidates.add(new ShowcaseFinder.Candidate(panel.key().id(), s[m].finalScore(),
                                        s[m].traj()));
                            }
                            List<ShowcaseFinder.Pair> found = ShowcaseFinder.find(candidates, sp);
                            int month = m;
                            return IntStream.range(0, found.size()).mapToObj(i -> {
                                ShowcaseFinder.Pair f = found.get(i);
                                ShowcasePair row = new ShowcasePair(entry.getKey(), month, profile, i + 1, f.upId(),
                                        f.downId(), f.upFinal(), f.downFinal(), f.upTraj(), f.downTraj(),
                                        f.meetsSpec());
                                return new Object[]{row.entityType().name(), months.get(row.month()).toString(),
                                        row.profile().name(), row.rank(), row.upId(), row.downId(), row.upFinal(),
                                        row.downFinal(), row.upTraj(), row.downTraj(), row.finalGap(), row.trajGap(),
                                        row.meetsSpec()};
                            });
                        })))
                .toList();
    }

    private static LeadTimeAnalyzer.Series series(EntityPanel panel, Profile p, boolean limitProfile) {
        int n = panel.size();
        ProfileScore[] ps = panel.profileScores(p);
        DynamicsPoint[] dyn = panel.dynamics(p);
        Double[] fin = new Double[n];
        Double[] level = new Double[n];
        Double[] traj = new Double[n];
        Double[] runway = new Double[n];
        Double[] dscr = new Double[n];
        Double[] recv = new Double[n];
        Double[] pay = new Double[n];
        HealthStatus[] status = new HealthStatus[n];
        Regime[] regime = new Regime[n];
        for (int m = 0; m < n; m++) {
            if (ps != null && ps[m] != null) {
                fin[m] = ps[m].finalScore();
                level[m] = ps[m].level();
                traj[m] = ps[m].traj();
            }
            if (dyn != null && dyn[m] != null) {
                status[m] = dyn[m].status();
                regime[m] = dyn[m].regime();
            }
            runway[m] = rawValue(panel, IndicatorId.LIQ_RUNWAY, m);
            dscr[m] = rawValue(panel, IndicatorId.DEBT_DSCR, m);       // null value = no debt: never triggers
            recv[m] = levelValue(panel, IndicatorId.DEL_OVERDUE_RECEIVABLES, m);
            pay[m] = levelValue(panel, IndicatorId.PAY_OVERDUE_PAYABLES, m);
        }
        LimitAction[] actions = null;
        if (limitProfile && panel.limits() != null) {
            actions = new LimitAction[n];
            for (int m = 0; m < n; m++) {
                LimitDecision d = panel.limits()[m];
                actions[m] = d == null ? null : d.action();
            }
        }
        return new LeadTimeAnalyzer.Series(fin, level, traj, status, regime, runway, dscr, recv, pay, actions);
    }

    private static Double rawValue(EntityPanel panel, IndicatorId id, int m) {
        RawIndicator r = panel.raw(id, m);
        return r.available() ? r.value() : null;
    }

    private static Double levelValue(EntityPanel panel, IndicatorId id, int m) {
        SubScore s = panel.subScores(id)[m];
        return s != null && s.available() ? s.level() : null;
    }
}
