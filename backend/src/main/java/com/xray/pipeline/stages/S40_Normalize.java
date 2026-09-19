package com.xray.pipeline.stages;

import com.xray.config.ScoringConfig;
import com.xray.domain.model.IndicatorId;
import com.xray.pipeline.PipelineContext;
import com.xray.pipeline.PipelineStage;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/** Raw value -> level sub-score through the indicator's anchors (SPEC §7.1). Trajectory comes in S50. */
@Component
@Order(40)
public class S40_Normalize implements PipelineStage {

    @Override
    public String id() {
        return "S40_NORMALIZE";
    }

    @Override
    public void execute(PipelineContext ctx) {
        if (ctx.panels().isEmpty()) {
            ctx.report(id(), 40, "skipped: no panels");
            return;
        }
        ScoringConfig config = ctx.config();
        Map<IndicatorId, List<double[]>> anchors = PanelScoring.anchors(config);
        ctx.panels().parallelStream().forEach(panel -> PanelScoring.normalize(panel, anchors, config));
        ctx.report(id(), 50, ctx.panels().size() + " panels normalized");
    }
}
