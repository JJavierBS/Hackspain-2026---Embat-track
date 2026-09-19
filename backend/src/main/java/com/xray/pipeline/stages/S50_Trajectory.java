package com.xray.pipeline.stages;

import com.xray.config.ScoringConfig;
import com.xray.domain.model.EntityPanel;
import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.SubScore;
import com.xray.domain.service.TrajectoryCalculator;
import com.xray.pipeline.PipelineContext;
import com.xray.pipeline.PipelineStage;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/** Trajectory sub-score of every indicator from its level series (SPEC §7.2). Causal per TrajectoryCalculator. */
@Component
@Order(50)
public class S50_Trajectory implements PipelineStage {

    @Override
    public String id() {
        return "S50_TRAJECTORY";
    }

    @Override
    public void execute(PipelineContext ctx) {
        if (ctx.panels().isEmpty()) {
            ctx.report(id(), 50, "skipped: no panels");
            return;
        }
        ScoringConfig.TrajectoryConfig t = ctx.config().trajectory();
        TrajectoryCalculator.Params params = new TrajectoryCalculator.Params(t.smoothingWindow(), t.slopeWindow(),
                t.minPoints(), t.slopeToScoreSpan(), t.slopeWeight(), t.deltaWeight());
        ctx.panels().parallelStream().forEach(panel -> trajectories(panel, params));
        ctx.report(id(), 60, ctx.panels().size() + " panels with trajectories");
    }

    private static void trajectories(EntityPanel panel, TrajectoryCalculator.Params params) {
        for (IndicatorId id : IndicatorId.values()) {
            SubScore[] s = panel.subScores(id);
            Double[] levels = new Double[s.length];
            for (int m = 0; m < s.length; m++) {
                levels[m] = s[m].available() ? s[m].level() : null;
            }
            Double[] traj = TrajectoryCalculator.compute(levels, params);
            for (int m = 0; m < s.length; m++) {
                if (s[m].available()) {
                    panel.setSubScore(id, m, s[m].withTrajectory(traj[m]));
                }
            }
        }
    }
}
