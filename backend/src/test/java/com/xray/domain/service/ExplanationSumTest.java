package com.xray.domain.service;

import com.xray.domain.model.BandThresholds;
import com.xray.domain.model.Category;
import com.xray.domain.model.CategoryScore;
import com.xray.domain.model.Contribution;
import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.ProfileScore;
import com.xray.domain.model.SubScore;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** ARCHITECTURE §9: Σ contrib_i = Final − 50 for every entity-month-profile. The weights are this test's own (E1). */
class ExplanationSumTest {

    private static final BandThresholds BANDS = new BandThresholds(90, 80, 65, 50, 35);
    private static final int MONTHS = 24;

    @Test
    void contributionsSumToFinalMinus50() {
        Random rnd = new Random(7);
        Map<Category, List<IndicatorId>> members = members();
        int checked = 0;
        for (int trial = 0; trial < 300; trial++) {
            Map<IndicatorId, SubScore[]> subs = randomSubScores(rnd);
            Map<IndicatorId, Double> iw = randomIndicatorWeights(rnd);
            double lambda = rnd.nextDouble();
            ProfileScore[] scores = score(members, iw, subs, lambda, randomWeights(rnd));
            for (int m = 0; m < MONTHS; m++) {
                int mm = m;
                List<Contribution> cs = ExplanationService.explain(scores[m], members, iw, id -> subs.get(id)[mm], lambda);
                if (scores[m].finalScore() == null) {
                    assertTrue(cs.isEmpty(), "trial " + trial + " month " + m);
                    continue;
                }
                double sum = cs.stream().mapToDouble(Contribution::contrib).sum();
                assertEquals(scores[m].finalScore() - 50, sum, 1e-6, "trial " + trial + " month " + m);
                checked++;
            }
        }
        assertTrue(checked > 3000, "too few scored months: " + checked);
    }

    @Test
    void effectiveWeightsOfACategorySumToItsWeight() {
        Random rnd = new Random(11);
        Map<Category, List<IndicatorId>> members = members();
        for (int trial = 0; trial < 50; trial++) {
            Map<IndicatorId, SubScore[]> subs = randomSubScores(rnd);
            Map<IndicatorId, Double> iw = randomIndicatorWeights(rnd);
            ProfileScore[] scores = score(members, iw, subs, 0.6, randomWeights(rnd));
            for (int m = 0; m < MONTHS; m++) {
                int mm = m;
                Map<Category, Double> byCat = ExplanationService.explain(scores[m], members, iw, id -> subs.get(id)[mm], 0.6)
                        .stream().collect(Collectors.groupingBy(Contribution::category,
                                Collectors.summingDouble(Contribution::effWeight)));
                ProfileScore ps = scores[m];
                assertEquals(ps.effectiveWeights().keySet(), byCat.keySet());
                byCat.forEach((c, w) -> assertEquals(ps.effectiveWeights().get(c), w, 1e-9));
            }
        }
    }

    private static ProfileScore[] score(Map<Category, List<IndicatorId>> members, Map<IndicatorId, Double> iw,
                                        Map<IndicatorId, SubScore[]> subs, double lambda, Map<Category, Double> weights) {
        Map<Category, CategoryScore[]> cats = new EnumMap<>(Category.class);
        members.forEach((c, ids) -> cats.put(c, CategoryAggregator.aggregate(ids.stream().map(subs::get).toList(),
                ids.stream().mapToDouble(iw::get).toArray(), MONTHS)));
        return ProfileScorer.score(cats, MONTHS, new ProfileScorer.Params(lambda, weights, 2, 10, 0, BANDS));
    }

    /** Weights inside a category (E11): half of the trials use equal weights, the other half random ones. */
    private static Map<IndicatorId, Double> randomIndicatorWeights(Random rnd) {
        boolean equal = rnd.nextBoolean();
        Map<IndicatorId, Double> out = new EnumMap<>(IndicatorId.class);
        for (IndicatorId id : IndicatorId.values()) {
            out.put(id, equal ? 1.0 : 0.5 + 3 * rnd.nextDouble());
        }
        return out;
    }

    /** Some months have nothing available, most have a random subset; 30 % of the available ones have no trajectory. */
    private static Map<IndicatorId, SubScore[]> randomSubScores(Random rnd) {
        boolean[] dead = new boolean[MONTHS];
        for (int m = 0; m < MONTHS; m++) {
            dead[m] = rnd.nextDouble() < 0.1;
        }
        Map<IndicatorId, SubScore[]> out = new EnumMap<>(IndicatorId.class);
        for (IndicatorId id : IndicatorId.values()) {
            SubScore[] s = new SubScore[MONTHS];
            for (int m = 0; m < MONTHS; m++) {
                if (dead[m] || rnd.nextDouble() < 0.3) {
                    s[m] = SubScore.missing();
                } else {
                    Double traj = rnd.nextDouble() < 0.3 ? null : rnd.nextDouble() * 100;
                    s[m] = new SubScore(rnd.nextDouble() * 100, traj, true);
                }
            }
            out.put(id, s);
        }
        return out;
    }

    /** A random subset of the categories (MOMENTUM included sometimes), scaled to sum to 100. */
    private static Map<Category, Double> randomWeights(Random rnd) {
        List<Category> picked = new ArrayList<>();
        for (Category c : Category.values()) {
            if (rnd.nextDouble() < 0.6) {
                picked.add(c);
            }
        }
        if (picked.stream().allMatch(c -> c == Category.MOMENTUM)) {
            picked.add(Category.LIQUIDITY);
        }
        Map<Category, Double> raw = new EnumMap<>(Category.class);
        picked.forEach(c -> raw.put(c, 1.0 + rnd.nextInt(30)));
        double sum = raw.values().stream().mapToDouble(Double::doubleValue).sum();
        raw.replaceAll((c, w) -> w * 100 / sum);
        return raw;
    }

    /** This test's own category map, by indicator prefix. */
    private static Map<Category, List<IndicatorId>> members() {
        Map<Category, List<IndicatorId>> members = new EnumMap<>(Category.class);
        for (IndicatorId id : IndicatorId.values()) {
            members.computeIfAbsent(categoryOf(id), c -> new ArrayList<>()).add(id);
        }
        return members;
    }

    private static Category categoryOf(IndicatorId id) {
        String n = id.name();
        if (n.startsWith("LIQ_")) return Category.LIQUIDITY;
        if (n.startsWith("CF_")) return Category.OPERATING_CASH_FLOW;
        if (n.startsWith("ACT_")) return Category.ACTIVITY_GROWTH;
        if (n.startsWith("DEBT_")) return Category.DEBT_SERVICE;
        if (n.startsWith("LEV_")) return Category.LEVERAGE;
        if (n.startsWith("PAY_")) return Category.PAYMENT_BEHAVIOUR;
        if (n.startsWith("DEL_")) return Category.DELINQUENCY;
        if (n.startsWith("CON_")) return Category.CONCENTRATION;
        return Category.TAX_REGULARITY;
    }
}
