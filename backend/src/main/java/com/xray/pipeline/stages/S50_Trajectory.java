package com.xray.pipeline.stages;

import com.xray.domain.service.TrajectoryCalculator;
import com.xray.pipeline.PipelineContext;
import com.xray.pipeline.PipelineStage;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Trajectory sub-score of every indicator from its level series (SPEC §7.2). Causal per TrajectoryCalculator.
 * Months with full data never compare against data-gap months (EntityPanel.dataGap, rule 3).
 */
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
        TrajectoryCalculator.Params params = PanelScoring.trajectoryParams(ctx.config());
        ctx.panels().parallelStream().forEach(panel -> PanelScoring.trajectories(panel, params));
        ctx.report(id(), 60, ctx.panels().size() + " panels with trajectories");
    }
}
