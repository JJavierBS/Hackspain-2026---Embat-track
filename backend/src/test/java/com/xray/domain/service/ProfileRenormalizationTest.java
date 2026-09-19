package com.xray.domain.service;

import com.xray.domain.model.Band;
import com.xray.domain.model.BandThresholds;
import com.xray.domain.model.Category;
import com.xray.domain.model.CategoryScore;
import com.xray.domain.model.ProfileScore;
import org.junit.jupiter.api.Test;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** ARCHITECTURE §9: with a category missing, the remaining weights still sum to 1 and the score stays in [0,100]. */
class ProfileRenormalizationTest {

    private static final BandThresholds BANDS = new BandThresholds(80, 65, 50, 35);
    private static final Map<Category, Double> BANK_LIKE = Map.of(
            Category.DEBT_SERVICE, 25.0, Category.LIQUIDITY, 20.0, Category.OPERATING_CASH_FLOW, 20.0,
            Category.PAYMENT_BEHAVIOUR, 7.5, Category.DELINQUENCY, 7.5, Category.LEVERAGE, 10.0,
            Category.TAX_REGULARITY, 5.0, Category.CONCENTRATION, 5.0);
    private static final Map<Category, Double> FUND_LIKE = Map.of(
            Category.ACTIVITY_GROWTH, 30.0, Category.MOMENTUM, 25.0, Category.OPERATING_CASH_FLOW, 20.0,
            Category.LIQUIDITY, 10.0, Category.CONCENTRATION, 10.0, Category.LEVERAGE, 5.0);

    @Test
    void missingCategoryRedistributesWeight() {
        var cats = constant(Map.of(Category.LIQUIDITY, 80.0, Category.OPERATING_CASH_FLOW, 40.0), null);
        ProfileScore s = ProfileScorer.score(cats, 1, new ProfileScorer.Params(0.7, BANK_LIKE, 2, 10, BANDS))[0];
        assertEquals(1.0, sum(s.effectiveWeights()), 1e-9);
        assertEquals(60.0, s.finalScore(), 1e-9);          // 20/40·80 + 20/40·40, no trajectory -> level (D5)
        assertEquals(Band.C, s.band());
    }

    @Test
    void nothingAvailableGivesNoScore() {
        ProfileScore s = ProfileScorer.score(Map.of(), 1, new ProfileScorer.Params(0.7, BANK_LIKE, 2, 10, BANDS))[0];
        assertNull(s.finalScore());
        assertTrue(s.effectiveWeights().isEmpty());
    }

    @Test
    void momentumTakesItsWeightOnlyWhenTrajectoryExists() {
        var noTraj = constant(Map.of(Category.ACTIVITY_GROWTH, 70.0), null);
        var s1 = ProfileScorer.score(noTraj, 1, new ProfileScorer.Params(0.5, FUND_LIKE, 2, 10, BANDS))[0];
        assertFalse(s1.effectiveWeights().containsKey(Category.MOMENTUM));
        var withTraj = constant(Map.of(Category.ACTIVITY_GROWTH, 70.0), 60.0);
        var s2 = ProfileScorer.score(withTraj, 1, new ProfileScorer.Params(0.5, FUND_LIKE, 2, 10, BANDS))[0];
        assertEquals(1.0, sum(s2.effectiveWeights()), 1e-9);
        assertEquals(30.0 / 55.0, s2.effectiveWeights().get(Category.ACTIVITY_GROWTH), 1e-9);
    }

    @Test
    void randomAvailabilityAlwaysSumsToOneAndStaysInRange() {
        var rnd = new java.util.Random(42);
        for (int i = 0; i < 2000; i++) {
            Map<Category, CategoryScore[]> cats = new EnumMap<>(Category.class);
            for (Category c : Category.values()) {
                if (c == Category.MOMENTUM || rnd.nextDouble() < 0.4) continue;
                cats.put(c, new CategoryScore[]{new CategoryScore(rnd.nextDouble() * 100,
                        rnd.nextBoolean() ? rnd.nextDouble() * 100 : null, 1)});
            }
            for (var w : List.of(BANK_LIKE, FUND_LIKE)) {
                ProfileScore s = ProfileScorer.score(cats, 1, new ProfileScorer.Params(0.7, w, 2, 10, BANDS))[0];
                if (s.finalScore() == null) {
                    assertTrue(s.effectiveWeights().isEmpty());
                    continue;
                }
                assertEquals(1.0, sum(s.effectiveWeights()), 1e-9);
                assertTrue(s.finalScore() >= 0 && s.finalScore() <= 100);
            }
        }
    }

    private static Map<Category, CategoryScore[]> constant(Map<Category, Double> levels, Double traj) {
        Map<Category, CategoryScore[]> m = new EnumMap<>(Category.class);
        levels.forEach((c, l) -> m.put(c, new CategoryScore[]{new CategoryScore(l, traj, 1)}));
        return m;
    }

    private static double sum(Map<Category, Double> w) {
        return w.values().stream().mapToDouble(Double::doubleValue).sum();
    }
}
