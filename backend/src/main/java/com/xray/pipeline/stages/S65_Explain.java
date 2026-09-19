package com.xray.pipeline.stages;

import com.xray.config.ScoringConfig;
import com.xray.domain.model.Category;
import com.xray.domain.model.Contribution;
import com.xray.domain.model.EntityPanel;
import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.Profile;
import com.xray.domain.model.ProfileScore;
import com.xray.domain.service.ExplanationService;
import com.xray.infrastructure.duckdb.ResultWriter;
import com.xray.narrative.NarrativeRenderer;
import com.xray.pipeline.PipelineContext;
import com.xray.pipeline.PipelineStage;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/** Contributions, 1m and 3m deltas and narratives (SPEC §7.5, phase 4 contract item 4). */
@Component
@Order(65)
public class S65_Explain implements PipelineStage {

    static final String DDL = "entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, profile VARCHAR, "
            + "driver_id VARCHAR, category VARCHAR, eff_weight DOUBLE, blended DOUBLE, contrib DOUBLE, "
            + "delta1 DOUBLE, delta3 DOUBLE, narrative_1m VARCHAR, narrative_3m VARCHAR";

    private final ResultWriter writer;
    private final NarrativeRenderer renderer;

    public S65_Explain(ResultWriter writer, NarrativeRenderer renderer) {
        this.writer = writer;
        this.renderer = renderer;
    }

    @Override
    public String id() {
        return "S65_EXPLAIN";
    }

    @Override
    public void execute(PipelineContext ctx) {
        if (ctx.panels().isEmpty()) {
            ctx.report(id(), 65, "skipped: no panels");
            return;
        }
        ScoringConfig config = ctx.config();
        Map<Category, List<IndicatorId>> members = CategoryMembers.of(config);
        Map<IndicatorId, Double> indicatorWeights = CategoryMembers.weights(config);
        Map<Profile, Double> lambdas = new EnumMap<>(Profile.class);
        config.profiles().forEach((p, pc) -> lambdas.put(p, pc.lambda()));
        int topN = config.explanation().narrativeTopN();
        double minDelta = config.explanation().minNarratedDelta();

        ctx.report(id(), 67, "writing contributions");
        // One batch of panels at a time: every contribution row together (~1M) does not fit a 512 MB instance.
        int n = writer.replaceInBatches("contributions", DDL, ctx.panels(),
                panel -> rows(panel, explain(panel, members, indicatorWeights, lambdas), topN, minDelta));
        ctx.report(id(), 69, n + " contribution rows");
    }

    private static Map<Profile, List<List<Contribution>>> explain(EntityPanel panel,
                                                                  Map<Category, List<IndicatorId>> members,
                                                                  Map<IndicatorId, Double> indicatorWeights,
                                                                  Map<Profile, Double> lambdas) {
        Map<Profile, List<List<Contribution>>> out = new EnumMap<>(Profile.class);
        for (Profile p : Profile.values()) {
            ProfileScore[] s = panel.profileScores(p);
            List<List<Contribution>> series = new ArrayList<>(panel.size());
            for (int m = 0; m < panel.size(); m++) {
                int mm = m;
                series.add(ExplanationService.explain(s[m], members, indicatorWeights, id -> panel.subScores(id)[mm],
                        lambdas.get(p)));
            }
            out.put(p, series);
        }
        return out;
    }

    private List<Object[]> rows(EntityPanel panel, Map<Profile, List<List<Contribution>>> contributions,
                                int topN, double minDelta) {
        List<Object[]> rows = new ArrayList<>();
        for (Profile p : Profile.values()) {
            List<List<Contribution>> series = contributions.get(p);
            ProfileScore[] s = panel.profileScores(p);
            for (int m = 0; m < panel.size(); m++) {
                List<Contribution> now = series.get(m);
                if (now.isEmpty()) continue;
                Map<String, Double> d1 = deltas(series, s, m, 1);
                Map<String, Double> d3 = deltas(series, s, m, 3);
                Set<String> n1 = top(d1, topN, minDelta);
                Set<String> n3 = top(d3, topN, minDelta);
                for (Contribution c : now) {
                    Double x1 = d1 == null ? null : d1.get(c.driverId());
                    Double x3 = d3 == null ? null : d3.get(c.driverId());
                    rows.add(new Object[]{panel.key().type().name(), panel.key().id(),
                            panel.months().get(m).toString(), p.name(), c.driverId(), c.category().name(),
                            c.effWeight(), c.blended(), c.contrib(), x1, x3,
                            n1.contains(c.driverId()) ? narrate(panel, c.driverId(), m - 1, m, x1) : null,
                            n3.contains(c.driverId()) ? narrate(panel, c.driverId(), m - 3, m, x3) : null});
                }
            }
        }
        return rows;
    }

    /** driver -> contrib(m) − contrib(m−k); a driver absent at m−k counts as 0. Null when final(m−k) is null. */
    private static Map<String, Double> deltas(List<List<Contribution>> series, ProfileScore[] s, int m, int k) {
        if (m < k || s[m - k].finalScore() == null) {
            return null;
        }
        Map<String, Double> before = series.get(m - k).stream()
                .collect(Collectors.toMap(Contribution::driverId, Contribution::contrib));
        Map<String, Double> out = new HashMap<>();
        for (Contribution c : series.get(m)) {
            out.put(c.driverId(), c.contrib() - before.getOrDefault(c.driverId(), 0.0));
        }
        return out;
    }

    private static Set<String> top(Map<String, Double> deltas, int n, double minDelta) {
        if (deltas == null) {
            return Set.of();
        }
        return deltas.entrySet().stream()
                .filter(e -> Math.abs(e.getValue()) >= minDelta)
                .sorted(Comparator.comparingDouble((Map.Entry<String, Double> e) -> -Math.abs(e.getValue())))
                .limit(n)
                .map(Map.Entry::getKey)
                .collect(Collectors.toSet());
    }

    private String narrate(EntityPanel panel, String driverId, int from, int to, double delta) {
        if (ExplanationService.MOMENTUM.equals(driverId)) {
            return renderer.render(driverId, null, null, delta);
        }
        IndicatorId id = IndicatorId.valueOf(driverId);
        return renderer.render(driverId, panel.raw(id, from), panel.raw(id, to), delta);
    }
}
