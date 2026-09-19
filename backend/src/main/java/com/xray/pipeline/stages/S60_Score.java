package com.xray.pipeline.stages;

import com.xray.config.ProfileConfig;
import com.xray.config.ScoringConfig;
import com.xray.domain.model.BandThresholds;
import com.xray.domain.model.Category;
import com.xray.domain.model.CategoryScore;
import com.xray.domain.model.EntityPanel;
import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.Profile;
import com.xray.domain.model.RawIndicator;
import com.xray.domain.model.SubScore;
import com.xray.domain.service.CategoryAggregator;
import com.xray.domain.service.ProfileScorer;
import com.xray.infrastructure.duckdb.ResultWriter;
import com.xray.pipeline.PipelineContext;
import com.xray.pipeline.PipelineStage;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * Categories and the three profiles (SPEC §7.3–§7.4), then indicator_values, category_scores and profile_scores
 * (phase 3 contract item 10), plus profile_weights.
 * status, regime, confidence and seasonal stay NULL until S70 rewrites profile_scores.
 */
@Component
@Order(60)
public class S60_Score implements PipelineStage {

    private static final String INDICATOR_VALUES_DDL = "entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, "
            + "indicator_id VARCHAR, category VARCHAR, value DOUBLE, level_score DOUBLE, traj_score DOUBLE, "
            + "available BOOLEAN, is_static BOOLEAN, fallback BOOLEAN, anchor_status VARCHAR";
    private static final String CATEGORY_SCORES_DDL = "entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, "
            + "category VARCHAR, level DOUBLE, traj DOUBLE, n_available INTEGER";
    /** lambda is a DuckDB keyword: readers must quote the column too ("lambda"). */
    private static final String PROFILE_WEIGHTS_DDL = "profile VARCHAR, category VARCHAR, weight DOUBLE, \"lambda\" DOUBLE";

    private final ResultWriter writer;

    public S60_Score(ResultWriter writer) {
        this.writer = writer;
    }

    @Override
    public String id() {
        return "S60_SCORE";
    }

    @Override
    public void execute(PipelineContext ctx) {
        if (ctx.panels().isEmpty()) {
            ctx.report(id(), 60, "skipped: no panels");
            return;
        }
        ScoringConfig config = ctx.config();
        Map<Category, List<IndicatorId>> members = CategoryMembers.of(config);
        Map<IndicatorId, Double> indicatorWeights = CategoryMembers.weights(config);

        ScoringConfig.BandConfig b = config.bands();
        BandThresholds bands = new BandThresholds(b.a(), b.b(), b.c(), b.d());
        Map<Profile, ProfileScorer.Params> params = new EnumMap<>(Profile.class);
        for (Profile p : Profile.values()) {
            ProfileConfig pc = config.profiles().get(p);
            params.put(p, new ProfileScorer.Params(pc.lambda(), pc.weights(),
                    config.momentum().pointsPerMonth(), config.momentum().cap(), bands));
        }

        ctx.panels().parallelStream().forEach(panel -> score(panel, members, indicatorWeights, params));
        ctx.report(id(), 70, "writing results");

        List<Object[]> indicatorRows = ctx.panels().parallelStream()
                .flatMap(panel -> indicatorRows(panel, config).stream()).toList();
        List<Object[]> categoryRows = ctx.panels().parallelStream()
                .flatMap(panel -> categoryRows(panel, members).stream()).toList();
        List<Object[]> profileRows = ctx.panels().parallelStream()
                .flatMap(panel -> ProfileScoreTable.rows(panel).stream()).toList();
        writer.replace("indicator_values", INDICATOR_VALUES_DDL, indicatorRows);
        writer.replace("category_scores", CATEGORY_SCORES_DDL, categoryRows);
        writer.replace("profile_weights", PROFILE_WEIGHTS_DDL, weightRows(config));
        int rows = writer.replace(ProfileScoreTable.NAME, ProfileScoreTable.DDL, profileRows);
        ctx.report(id(), 80, rows + " profile rows");
    }

    private static void score(EntityPanel panel, Map<Category, List<IndicatorId>> members,
                              Map<IndicatorId, Double> indicatorWeights, Map<Profile, ProfileScorer.Params> params) {
        Map<Category, CategoryScore[]> cats = new EnumMap<>(Category.class);
        members.forEach((c, ids) -> {
            CategoryScore[] s = CategoryAggregator.aggregate(ids.stream().map(panel::subScores).toList(),
                    ids.stream().mapToDouble(indicatorWeights::get).toArray(), panel.size());
            panel.setCategoryScores(c, s);
            cats.put(c, s);
        });
        params.forEach((p, pp) -> panel.setProfileScores(p, ProfileScorer.score(cats, panel.size(), pp)));
    }

    private static List<Object[]> indicatorRows(EntityPanel panel, ScoringConfig config) {
        List<Object[]> rows = new ArrayList<>(IndicatorId.values().length * panel.size());
        for (IndicatorId id : IndicatorId.values()) {
            var ic = config.indicators().get(id);
            for (int m = 0; m < panel.size(); m++) {
                RawIndicator r = panel.raw(id, m);
                SubScore s = panel.subScores(id)[m];
                rows.add(new Object[]{panel.key().type().name(), panel.key().id(), panel.months().get(m).toString(),
                        id.name(), ic.category().name(), r.value(),
                        s.available() ? s.level() : null, s.available() ? s.trajectory() : null,
                        s.available(), r.isStatic(), r.fallback(), ic.status().name()});
            }
        }
        return rows;
    }

    private static List<Object[]> categoryRows(EntityPanel panel, Map<Category, List<IndicatorId>> members) {
        List<Object[]> rows = new ArrayList<>(members.size() * panel.size());
        for (Category c : members.keySet()) {
            CategoryScore[] s = panel.categoryScores(c);
            for (int m = 0; m < panel.size(); m++) {
                rows.add(new Object[]{panel.key().type().name(), panel.key().id(), panel.months().get(m).toString(),
                        c.name(), s[m].level(), s[m].traj(), s[m].nAvailable()});
            }
        }
        return rows;
    }

    /** The weights that produced this run's scores, so the UI never shows other weights (decision E1). */
    private static List<Object[]> weightRows(ScoringConfig config) {
        List<Object[]> rows = new ArrayList<>();
        config.profiles().forEach((p, pc) -> pc.weights().forEach((c, w) ->
                rows.add(new Object[]{p.name(), c.name(), w, pc.lambda()})));
        return rows;
    }
}
