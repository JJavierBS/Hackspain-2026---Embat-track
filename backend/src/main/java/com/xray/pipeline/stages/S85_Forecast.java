package com.xray.pipeline.stages;

import com.xray.domain.model.EntityPanel;
import com.xray.domain.model.Month;
import com.xray.domain.model.Profile;
import com.xray.domain.model.ProfileScore;
import com.xray.domain.service.ForecastCalculator;
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

/**
 * Score projection (phase 7 decisions H11–H16): one row per (entity, profile, origin month, horizon), for
 * every origin month with enough history, so the replay of any past month can show what was projected then.
 * month = the origin month; target_month = month + horizon. median = the value the projection reverts to.
 * Reads the panels only — no ctx.sql() — so LookAheadTest can run it on an in-memory database.
 * forecast_points is output (decision H16): nothing in scoring, products, alerts or analytics reads it.
 */
@Component
@Order(85)
public class S85_Forecast implements PipelineStage {

    private static final Logger log = LoggerFactory.getLogger(S85_Forecast.class);

    static final String DDL = "entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, profile VARCHAR, "
            + "horizon INTEGER, target_month VARCHAR, value DOUBLE, median DOUBLE, history INTEGER, "
            + "reliability VARCHAR";

    private final ResultWriter writer;

    public S85_Forecast(ResultWriter writer) {
        this.writer = writer;
    }

    @Override
    public String id() {
        return "S85_FORECAST";
    }

    @Override
    public void execute(PipelineContext ctx) {
        if (ctx.panels().isEmpty()) {
            ctx.report(id(), 85, "skipped: no panels");
            return;
        }
        ForecastCalculator.Params p = ctx.config().forecast().toParams();
        List<Object[]> rows = ctx.panels().parallelStream()
                .flatMap(panel -> Arrays.stream(Profile.values()).flatMap(profile -> rows(panel, profile, p).stream()))
                .toList();
        writer.replace("forecast_points", DDL, rows);
        log.info("{} wrote {} forecast points", id(), rows.size());
        ctx.report(id(), 88, rows.size() + " forecast points");
    }

    private static List<Object[]> rows(EntityPanel panel, Profile profile, ForecastCalculator.Params p) {
        ProfileScore[] s = panel.profileScores(profile);
        if (s == null) {
            return List.of();
        }
        Double[] fin = new Double[panel.size()];
        for (int m = 0; m < fin.length; m++) {
            fin[m] = s[m] == null ? null : s[m].finalScore();
        }
        ForecastCalculator.Result r = ForecastCalculator.forecast(fin, p);
        List<Object[]> out = new ArrayList<>();
        for (int m = 0; m < fin.length; m++) {
            Month origin = panel.months().get(m);
            for (ForecastCalculator.Point pt : r.points()[m]) {
                out.add(new Object[]{panel.key().type().name(), panel.key().id(), origin.toString(), profile.name(),
                        pt.horizon(), origin.plus(pt.horizon()).toString(), pt.value(), r.target()[m],
                        r.history()[m], r.reliability()[m].name()});
            }
        }
        return out;
    }
}
