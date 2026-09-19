package com.xray.pipeline.stages;

import com.xray.config.ScoringConfig;
import com.xray.domain.model.EntityPanel;
import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.RawIndicator;
import com.xray.domain.model.SubScore;
import com.xray.domain.service.AnchorInterpolator;
import com.xray.pipeline.PipelineContext;
import com.xray.pipeline.PipelineStage;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.EnumMap;
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
        Map<IndicatorId, List<double[]>> anchors = new EnumMap<>(IndicatorId.class);
        config.indicators().forEach((id, ic) -> anchors.put(id,
                ic.anchors().stream().map(p -> new double[]{p.get(0), p.get(1)}).toList()));
        ctx.panels().parallelStream().forEach(panel -> normalize(panel, anchors, config));
        ctx.report(id(), 50, ctx.panels().size() + " panels normalized");
    }

    private static void normalize(EntityPanel panel, Map<IndicatorId, List<double[]>> anchors, ScoringConfig config) {
        for (IndicatorId id : IndicatorId.values()) {
            RawIndicator[] raw = panel.rawSeries(id);
            for (int m = 0; m < panel.size(); m++) {
                RawIndicator r = raw[m];
                if (!r.available()) {
                    panel.setSubScore(id, m, SubScore.missing());
                    continue;
                }
                double level = r.value() == null
                        ? nullLevel(id, config)
                        : AnchorInterpolator.score(r.value(), anchors.get(id));
                panel.setSubScore(id, m, new SubScore(level, null, true));
            }
        }
    }

    /** Available with no value: a rule-defined level from config (phase 3 contract item 5). */
    private static double nullLevel(IndicatorId id, ScoringConfig c) {
        return switch (id) {
            case DEBT_DSCR -> c.debtDscr().noDebtLevel();
            case LEV_DEBT_TO_CF -> c.levDebtToCf().nonPositiveCfLevel();
            default -> throw new IllegalStateException(id + " is available with a null value");
        };
    }
}
