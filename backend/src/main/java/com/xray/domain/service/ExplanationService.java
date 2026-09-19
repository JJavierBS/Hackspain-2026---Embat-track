package com.xray.domain.service;

import com.xray.domain.model.Category;
import com.xray.domain.model.Contribution;
import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.ProfileScore;
import com.xray.domain.model.SubScore;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * Exact additive decomposition of Final − 50 (SPEC §7.5). It reads the effective weights that ProfileScorer
 * kept, and the indicator weights inside each category (decision E11) that CategoryAggregator used.
 * Σ contrib = final − 50 up to floating point.
 */
public final class ExplanationService {

    public static final String MOMENTUM = "MOMENTUM";

    private ExplanationService() {
    }

    public static List<Contribution> explain(ProfileScore ps, Map<Category, List<IndicatorId>> members,
                                             Map<IndicatorId, Double> indicatorWeights,
                                             Function<IndicatorId, SubScore> subScoreAt, double lambda) {
        if (ps.finalScore() == null) {
            return List.of();
        }
        List<Contribution> out = new ArrayList<>();
        for (var e : ps.effectiveWeights().entrySet()) {
            Category c = e.getKey();
            double wc = e.getValue();
            if (c == Category.MOMENTUM) {
                out.add(new Contribution(MOMENTUM, c, wc, ps.momentum(), wc * (ps.momentum() - 50)));
                continue;
            }
            List<IndicatorId> avail = members.get(c).stream().filter(id -> subScoreAt.apply(id).available()).toList();
            double wa = avail.stream().mapToDouble(indicatorWeights::get).sum();
            double wt = avail.stream().filter(id -> subScoreAt.apply(id).trajectory() != null)
                    .mapToDouble(indicatorWeights::get).sum();
            for (IndicatorId id : avail) {
                SubScore s = subScoreAt.apply(id);
                double wi = indicatorWeights.get(id);
                double part;
                double blended;
                if (wt == 0) {
                    part = wi * (s.level() - 50) / wa;
                    blended = s.level();
                } else {
                    part = lambda * wi * (s.level() - 50) / wa
                            + (s.trajectory() == null ? 0 : (1 - lambda) * wi * (s.trajectory() - 50) / wt);
                    blended = s.trajectory() == null ? s.level() : lambda * s.level() + (1 - lambda) * s.trajectory();
                }
                out.add(new Contribution(id.name(), c, wc * wi / wa, blended, wc * part));
            }
        }
        return out;
    }
}
