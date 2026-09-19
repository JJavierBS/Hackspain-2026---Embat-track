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
import com.xray.domain.service.AnchorInterpolator;
import com.xray.domain.service.CategoryAggregator;
import com.xray.domain.service.ProfileScorer;
import com.xray.domain.service.TrajectoryCalculator;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * The scoring steps of S40, S50 and S60 for one panel: level sub-scores, trajectories, categories and profiles.
 * The stages and the per-entity tuning (EntityTuningUseCase) run this same code, so a tuned score can differ
 * from the published one only by the config it gets.
 */
public final class PanelScoring {

    private PanelScoring() {
    }

    /** S40 + S50 + S60 (no result tables) on one panel with one config. */
    public static void scoreAll(EntityPanel panel, ScoringConfig config) {
        normalize(panel, anchors(config), config);
        trajectories(panel, trajectoryParams(config));
        score(panel, CategoryMembers.of(config), CategoryMembers.weights(config), profileParams(config));
    }

    static Map<IndicatorId, List<double[]>> anchors(ScoringConfig config) {
        Map<IndicatorId, List<double[]>> anchors = new EnumMap<>(IndicatorId.class);
        config.indicators().forEach((id, ic) -> anchors.put(id,
                ic.anchors().stream().map(p -> new double[]{p.get(0), p.get(1)}).toList()));
        return anchors;
    }

    /** S40: raw value -> level sub-score through the indicator's anchors (SPEC §7.1). */
    static void normalize(EntityPanel panel, Map<IndicatorId, List<double[]>> anchors, ScoringConfig config) {
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

    static TrajectoryCalculator.Params trajectoryParams(ScoringConfig config) {
        ScoringConfig.TrajectoryConfig t = config.trajectory();
        return new TrajectoryCalculator.Params(t.smoothingWindow(), t.slopeWindow(),
                t.minPoints(), t.slopeToScoreSpan(), t.slopeWeight(), t.deltaWeight());
    }

    /** S50: trajectory sub-score of every indicator from its level series (SPEC §7.2). */
    static void trajectories(EntityPanel panel, TrajectoryCalculator.Params params) {
        boolean[] dataGap = panel.dataGaps();
        for (IndicatorId id : IndicatorId.values()) {
            SubScore[] s = panel.subScores(id);
            Double[] levels = new Double[s.length];
            for (int m = 0; m < s.length; m++) {
                levels[m] = s[m].available() ? s[m].level() : null;
            }
            Double[] traj = TrajectoryCalculator.compute(levels, dataGap, params);
            for (int m = 0; m < s.length; m++) {
                if (s[m].available()) {
                    panel.setSubScore(id, m, s[m].withTrajectory(traj[m]));
                }
            }
        }
    }

    static Map<Profile, ProfileScorer.Params> profileParams(ScoringConfig config) {
        ScoringConfig.BandConfig b = config.bands();
        BandThresholds bands = new BandThresholds(b.s(), b.a(), b.b(), b.c(), b.d());
        Map<Profile, ProfileScorer.Params> params = new EnumMap<>(Profile.class);
        for (Profile p : Profile.values()) {
            ProfileConfig pc = config.profiles().get(p);
            params.put(p, new ProfileScorer.Params(pc.lambda(), pc.weights(),
                    config.momentum().pointsPerMonth(), config.momentum().cap(), bands));
        }
        return params;
    }

    /** S60: categories and the three profiles (SPEC §7.3–§7.4). */
    static void score(EntityPanel panel, Map<Category, List<IndicatorId>> members,
                      Map<IndicatorId, Double> indicatorWeights, Map<Profile, ProfileScorer.Params> params) {
        Map<Category, CategoryScore[]> cats = new EnumMap<>(Category.class);
        members.forEach((c, ids) -> {
            CategoryScore[] s = CategoryAggregator.aggregate(ids.stream().map(panel::subScores).toList(),
                    ids.stream().mapToDouble(indicatorWeights::get).toArray(), panel.size());
            panel.setCategoryScores(c, s);
            cats.put(c, s);
        });
        boolean[] dataGap = panel.dataGaps();
        params.forEach((p, pp) -> panel.setProfileScores(p, ProfileScorer.score(cats, dataGap, pp)));
    }
}
