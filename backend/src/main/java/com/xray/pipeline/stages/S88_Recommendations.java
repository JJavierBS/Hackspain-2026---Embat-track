package com.xray.pipeline.stages;

import com.xray.config.ScoringConfig;
import com.xray.domain.model.Category;
import com.xray.domain.model.DynamicsPoint;
import com.xray.domain.model.EntityPanel;
import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.Profile;
import com.xray.domain.model.ProfileScore;
import com.xray.domain.model.RawIndicator;
import com.xray.domain.model.SubScore;
import com.xray.domain.service.RecommendationEngine;
import com.xray.infrastructure.duckdb.ResultWriter;
import com.xray.narrative.NarrativeRenderer;
import com.xray.pipeline.PipelineContext;
import com.xray.pipeline.PipelineStage;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Static recommendations for every entity-month-profile (docs/RECOMMENDATIONS.md), so the entity page only reads
 * them (CLAUDE.md rule 8). Causal: month m reads month m and the count of scored months up to m. Output only.
 */
@Component
@Order(88)
public class S88_Recommendations implements PipelineStage {

    static final String DDL = "entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, profile VARCHAR, "
            + "rank INTEGER, indicator_id VARCHAR, category VARCHAR, kind VARCHAR, variant VARCHAR, severity VARCHAR, "
            + "survival BOOLEAN, worsening BOOLEAN, points DOUBLE, value DOUBLE, target DOUBLE, "
            + "title VARCHAR, why VARCHAR, action VARCHAR, goal VARCHAR";

    static final String SUMMARY_DDL = "entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, profile VARCHAR, "
            + "situation VARCHAR, history INTEGER, limited_history BOOLEAN, missing VARCHAR, n_items INTEGER, text VARCHAR";

    private final ResultWriter writer;
    private final NarrativeRenderer renderer;

    public S88_Recommendations(ResultWriter writer, NarrativeRenderer renderer) {
        this.writer = writer;
        this.renderer = renderer;
    }

    @Override
    public String id() {
        return "S88_RECOMMENDATIONS";
    }

    @Override
    public void execute(PipelineContext ctx) {
        if (ctx.panels().isEmpty()) {
            ctx.report(id(), 88, "skipped: no panels");
            return;
        }
        ScoringConfig config = ctx.config();
        RecommendationEngine.Params params = params(config);
        Map<IndicatorId, Double> weights = CategoryMembers.weights(config);
        // One batch of panels at a time: every row with its texts together does not fit a 512 MB instance.
        // Each table makes its own pass, so the engine runs twice per panel; the heap holds one batch only.
        int n = writer.replaceInBatches("recommendations", DDL, ctx.panels(),
                panel -> rows(panel, config, params, weights)[0]);
        ctx.report(id(), 88, "writing recommendation summaries");
        writer.replaceInBatches("recommendation_summaries", SUMMARY_DDL, ctx.panels(),
                panel -> rows(panel, config, params, weights)[1]);
        ctx.report(id(), 89, n + " recommendations");
    }

    @SuppressWarnings("unchecked")
    private List<Object[]>[] rows(EntityPanel panel, ScoringConfig config, RecommendationEngine.Params params,
                                  Map<IndicatorId, Double> weights) {
        List<Object[]> items = new ArrayList<>();
        List<Object[]> summaries = new ArrayList<>();
        String type = panel.key().type().name();
        String id = panel.key().id();
        for (Profile p : Profile.values()) {
            ProfileScore[] s = panel.profileScores(p);
            DynamicsPoint[] d = panel.dynamics(p);
            if (s == null) continue;
            Set<Category> profileCategories = EnumSet.noneOf(Category.class);
            config.profiles().get(p).weights().forEach((c, w) -> {
                if (w != null && w > 0) profileCategories.add(c);
            });
            double lambda = config.profiles().get(p).lambda();
            int history = 0;
            for (int m = 0; m < panel.size(); m++) {
                if (s[m] != null && s[m].finalScore() != null) history++;
                String month = panel.months().get(m).toString();
                DynamicsPoint dp = d == null ? null : d[m];
                ProfileScore ps = s[m];
                RecommendationEngine.Input in = new RecommendationEngine.Input(
                        ps == null ? null : ps.finalScore(), dp == null ? null : dp.status(),
                        dp != null && dp.seasonal(), ps == null ? 0 : ps.momPersistence(), history, lambda,
                        ps == null || ps.effectiveWeights() == null ? Map.of() : ps.effectiveWeights(),
                        profileCategories, states(panel, m, config, weights));
                RecommendationEngine.Result r = RecommendationEngine.recommend(in, params);
                int rank = 0;
                for (RecommendationEngine.Finding f : r.findings()) {
                    NarrativeRenderer.RecommendationText t = renderer.recommendation(f);
                    items.add(new Object[]{type, id, month, p.name(), ++rank, f.id().name(), f.category().name(),
                            f.kind().name(), f.variant().name(), f.severity().name(), f.survival(), f.worsening(),
                            f.points(), f.value(), f.target(), t.title(), t.why(), t.action(), t.goal()});
                }
                RecommendationEngine.Summary sum = r.summary();
                summaries.add(new Object[]{type, id, month, p.name(), sum.situation().name(), sum.history(),
                        sum.limitedHistory(), sum.missing().stream().map(Enum::name).collect(Collectors.joining(",")),
                        r.findings().size(), renderer.situation(sum, r.findings().size())});
            }
        }
        return new List[]{items, summaries};
    }

    private static List<RecommendationEngine.IndicatorState> states(EntityPanel panel, int m, ScoringConfig config,
                                                                    Map<IndicatorId, Double> weights) {
        List<RecommendationEngine.IndicatorState> out = new ArrayList<>();
        for (IndicatorId id : IndicatorId.values()) {
            SubScore sub = panel.subScores(id)[m];
            RawIndicator raw = panel.raw(id, m);
            boolean available = sub != null && sub.available();
            out.add(new RecommendationEngine.IndicatorState(id, config.indicators().get(id).category(), weights.get(id),
                    raw == null ? null : raw.value(), available ? sub.level() : 0,
                    available ? sub.trajectory() : null, available, raw != null && raw.isStatic(),
                    raw != null && raw.fallback()));
        }
        return out;
    }

    static RecommendationEngine.Params params(ScoringConfig c) {
        ScoringConfig.RecommendationsConfig r = c.recommendations();
        ScoringConfig.AlertsConfig a = c.alerts();
        Map<IndicatorId, List<double[]>> anchors = new EnumMap<>(IndicatorId.class);
        c.indicators().forEach((id, ic) -> anchors.put(id,
                ic.anchors().stream().map(xy -> new double[]{xy.get(0), xy.get(1)}).toList()));
        return new RecommendationEngine.Params(r.topN(), r.minHistoryMonths(), r.fullHistoryMonths(),
                r.limitedMaxLevel(), r.problemMaxLevel(), r.highMaxLevel(), r.criticalMaxLevel(), r.trendMaxTraj(),
                r.trendHighMaxTraj(), r.trendMaxLevel(), r.targetLevel(), r.minPoints(), r.severityFactor().critical(),
                r.severityFactor().high(), r.severityFactor().medium(), r.agingMinOverdueShare(),
                r.growthCollapseBelow(), r.overtradingMinGrowth(), r.opportunity().idleCashMinRunway(),
                r.opportunity().idleCashMinBuffer(), r.opportunity().debtCapacityMinDscr(),
                r.opportunity().debtCapacityMaxDebtToCf(), r.opportunity().minFinal(),
                a.runwayLow().critical(), a.runwayLow().warn(), a.dscrBreach().critical(), a.dscrBreach().warn(),
                a.lineUtilHigh().critical(), anchors);
    }
}
