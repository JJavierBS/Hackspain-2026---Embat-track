package com.xray.pipeline.stages;

import com.xray.config.ScoringConfig;
import com.xray.domain.model.Category;
import com.xray.domain.model.Changepoint;
import com.xray.domain.model.Confidence;
import com.xray.domain.model.DynamicsPoint;
import com.xray.domain.model.EntityPanel;
import com.xray.domain.model.HealthStatus;
import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.Profile;
import com.xray.domain.model.ProfileScore;
import com.xray.domain.model.Regime;
import com.xray.domain.model.SubScore;
import com.xray.domain.service.ConfidenceResolver;
import com.xray.domain.service.CusumDetector;
import com.xray.domain.service.RegimeClassifier;
import com.xray.domain.service.StatusResolver;
import com.xray.infrastructure.duckdb.ResultWriter;
import com.xray.pipeline.PipelineContext;
import com.xray.pipeline.PipelineStage;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/** CUSUM changepoints, regimes, statuses and confidence (SPEC §7.6, §8.1–§8.3). Rewrites profile_scores. */
@Component
@Order(70)
public class S70_Dynamics implements PipelineStage {

    static final String CHANGEPOINTS_DDL = "entity_type VARCHAR, entity_id VARCHAR, profile VARCHAR, series VARCHAR, "
            + "month VARCHAR, alarm_month VARCHAR, direction VARCHAR";
    static final String FINAL_SERIES = "FINAL";

    private final ResultWriter writer;

    public S70_Dynamics(ResultWriter writer) {
        this.writer = writer;
    }

    @Override
    public String id() {
        return "S70_DYNAMICS";
    }

    private record Setup(CusumDetector.Params cusum, RegimeClassifier.Params regime, StatusResolver.Params status,
                         ConfidenceResolver.Params confidence, List<IndicatorId> cusumIndicators,
                         Map<Profile, List<IndicatorId>> used) {
    }

    @Override
    public void execute(PipelineContext ctx) {
        if (ctx.panels().isEmpty()) {
            ctx.report(id(), 70, "skipped: no panels");
            return;
        }
        Setup setup = setup(ctx.config());
        ctx.panels().parallelStream().forEach(panel -> dynamics(panel, setup));
        ctx.report(id(), 80, "writing profile_scores and changepoints");
        List<Object[]> profileRows = ctx.panels().parallelStream()
                .flatMap(panel -> ProfileScoreTable.rows(panel).stream()).toList();
        List<Object[]> changeRows = ctx.panels().parallelStream()
                .flatMap(panel -> changepointRows(panel).stream()).toList();
        writer.replace(ProfileScoreTable.NAME, ProfileScoreTable.DDL, profileRows);
        int n = writer.replace("changepoints", CHANGEPOINTS_DDL, changeRows);
        ctx.report(id(), 90, n + " changepoints");
    }

    private static Setup setup(ScoringConfig c) {
        var r = c.regimes();
        var s = c.statuses();
        var f = c.confidence();
        Map<Category, List<IndicatorId>> members = CategoryMembers.of(c);
        Map<Profile, List<IndicatorId>> used = new EnumMap<>(Profile.class);
        c.profiles().forEach((p, pc) -> {
            List<IndicatorId> ids = new ArrayList<>();
            pc.weights().forEach((cat, w) -> {
                if (cat != Category.MOMENTUM && w > 0) ids.addAll(members.get(cat));
            });
            used.put(p, ids);
        });
        return new Setup(
                new CusumDetector.Params(r.cusumK(), r.cusumH(), r.cusumZCap(), r.baselineMonths(), r.baselineMinPoints(),
                        r.sigmaFloor()),
                new RegimeClassifier.Params(r.slopeMonths(), r.slopeMinPoints(), r.slopeThreshold(),
                        r.persistenceMonths(), r.dipZ(), r.dipMaxMonths(), r.dipRecoveryMonths()),
                new StatusResolver.Params(s.criticalBelow(), s.turningMinLevel(), s.turningMaxTraj(),
                        s.improvingMinTraj(), s.exceptionalMinFinal(), s.exceptionalMinTraj(), s.healthyMinFinal()),
                new ConfidenceResolver.Params(f.lowHistoryMonths(), f.mediumHistoryMonths(), f.lowAvailableShare()),
                r.cusumIndicators(), used);
    }

    private static void dynamics(EntityPanel panel, Setup setup) {
        for (IndicatorId id : setup.cusumIndicators()) {
            SubScore[] s = panel.subScores(id);
            Double[] x = new Double[s.length];
            for (int m = 0; m < s.length; m++) x[m] = s[m].available() ? s[m].level() : null;
            for (CusumDetector.Alarm a : CusumDetector.run(x, setup.cusum()).alarms()) {
                panel.addChangepoint(new Changepoint(id.name(), null, a.changeMonth(), a.alarmMonth(), a.direction()));
            }
        }
        for (Profile p : Profile.values()) {
            ProfileScore[] s = panel.profileScores(p);
            Double[] x = new Double[s.length];
            for (int m = 0; m < s.length; m++) x[m] = s[m].finalScore();
            CusumDetector.Result cusum = CusumDetector.run(x, setup.cusum());
            for (CusumDetector.Alarm a : cusum.alarms()) {
                panel.addChangepoint(new Changepoint(FINAL_SERIES, p, a.changeMonth(), a.alarmMonth(), a.direction()));
            }
            RegimeClassifier.Result regimes = RegimeClassifier.classify(x, cusum, setup.regime());
            List<IndicatorId> used = setup.used().get(p);
            DynamicsPoint[] out = new DynamicsPoint[s.length];
            int history = 0;
            for (int m = 0; m < s.length; m++) {
                if (x[m] == null) continue;
                history++;
                Regime regime = regimes.regimes()[m];
                HealthStatus status = StatusResolver.resolve(x[m], s[m].level(), s[m].traj(), regime,
                        cusum.downActive()[m], setup.status());
                int avail = 0;
                boolean fallback = false;
                for (IndicatorId id : used) {
                    if (panel.subScores(id)[m].available()) {
                        avail++;
                        fallback |= panel.raw(id, m).fallback();
                    }
                }
                double share = used.isEmpty() ? 0 : (double) avail / used.size();
                Confidence conf = ConfidenceResolver.resolve(history, share, fallback, setup.confidence());
                out[m] = new DynamicsPoint(status, regime, regimes.seasonal()[m], conf);
            }
            panel.setDynamics(p, out);
        }
    }

    private static List<Object[]> changepointRows(EntityPanel panel) {
        List<Object[]> rows = new ArrayList<>(panel.changepoints().size());
        for (Changepoint c : panel.changepoints()) {
            rows.add(new Object[]{panel.key().type().name(), panel.key().id(),
                    c.profile() == null ? null : c.profile().name(), c.series(),
                    panel.months().get(c.month()).toString(), panel.months().get(c.alarmMonth()).toString(),
                    c.direction().name()});
        }
        return rows;
    }
}
