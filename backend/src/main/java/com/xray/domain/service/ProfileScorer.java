package com.xray.domain.service;

import com.xray.domain.model.Band;
import com.xray.domain.model.BandThresholds;
import com.xray.domain.model.Category;
import com.xray.domain.model.CategoryScore;
import com.xray.domain.model.ProfileScore;

import java.util.EnumMap;
import java.util.Map;

/**
 * Level_p, Traj_p, MOMENTUM and Final_p for one profile (SPEC §7.3–§7.4). Causal: month m reads 0..m.
 * Weights are renormalized over the available categories. A category with a level but no trajectory
 * blends as its level alone (phase 3 decision D5).
 */
public final class ProfileScorer {

    private static final double EPS = 1e-9;

    /**
     * minTrustedWeightShare is the coverage gate (decision M8): the share of the profile's non-MOMENTUM
     * weight that the available categories must carry before this month gets a score at all.
     */
    public record Params(double lambda, Map<Category, Double> weights, double momPointsPerMonth,
                         double momCap, double minTrustedWeightShare, BandThresholds bands) {
    }

    private ProfileScorer() {
    }

    public static ProfileScore[] score(Map<Category, CategoryScore[]> cats, int months, Params p) {
        return score(cats, new boolean[months], p);
    }

    /**
     * dataGap[m] (EntityPanel.dataGap): the level reads missing flows as zero. Inside a gap MOM_PERSISTENCE counts
     * as usual, so a decline into it still shows. The first month with full data after it restarts the count at 0:
     * a move out of zero-based levels is not a real move (rule 3).
     */
    public static ProfileScore[] score(Map<Category, CategoryScore[]> cats, boolean[] dataGap, Params p) {
        int months = dataGap.length;
        ProfileScore[] out = new ProfileScore[months];
        Double prevLevel = null;
        int persistence = 0;
        double wTotal = 0;
        for (var e : p.weights().entrySet()) {
            if (e.getKey() != Category.MOMENTUM && e.getValue() > 0) wTotal += e.getValue();
        }
        for (int m = 0; m < months; m++) {
            double ln = 0, ld = 0, tn = 0, td = 0;
            for (var e : p.weights().entrySet()) {
                Category c = e.getKey();
                double w = e.getValue();
                if (c == Category.MOMENTUM || w <= 0) continue;
                CategoryScore cs = at(cats, c, m);
                if (!cs.available()) continue;
                ln += w * cs.level();
                ld += w;
                if (cs.traj() != null) {
                    tn += w * cs.traj();
                    td += w;
                }
            }
            // Coverage gate (decision M8). One available category out of ten renormalizes to 100 % of the
            // weight, so a single indicator at its best anchor used to publish a final of 100. That month
            // has no score: it is not a healthy entity, it is an entity we cannot read yet.
            if (wTotal > 0 && ld / wTotal < p.minTrustedWeightShare()) {
                out[m] = ProfileScore.unscored();
                prevLevel = null;
                persistence = 0;
                continue;
            }
            Double level = ld > 0 ? ln / ld : null;
            Double traj = td > 0 ? tn / td : null;      // = TrajOverall (SPEC §7.3)

            boolean back = m > 0 && dataGap[m - 1] && !dataGap[m];
            if (level != null && prevLevel != null && !back) {
                double d = level - prevLevel;
                int sign = d > EPS ? 1 : d < -EPS ? -1 : 0;
                persistence = sign == 0 ? 0 : Integer.signum(persistence) == sign ? persistence + sign : sign;
            } else {
                persistence = 0;
            }
            prevLevel = level;

            Double momentum = traj == null ? null
                    : clamp(traj + Math.max(-p.momCap(), Math.min(p.momCap(), p.momPointsPerMonth() * persistence)));

            Map<Category, Double> eff = new EnumMap<>(Category.class);
            double wsum = 0;
            for (var e : p.weights().entrySet()) {
                Category c = e.getKey();
                double w = e.getValue();
                if (w <= 0) continue;
                boolean avail = c == Category.MOMENTUM ? momentum != null : at(cats, c, m).available();
                if (avail) {
                    eff.put(c, w);
                    wsum += w;
                }
            }
            Double fin = null;
            if (wsum > 0) {
                double f = 0;
                for (var e : eff.entrySet()) {
                    double w = e.getValue() / wsum;
                    e.setValue(w);
                    f += w * (e.getKey() == Category.MOMENTUM ? momentum : blended(at(cats, e.getKey(), m), p.lambda()));
                }
                fin = clamp(f);
            }
            out[m] = new ProfileScore(fin, level, traj, fin == null ? null : Band.of(fin, p.bands()),
                    momentum, persistence, Map.copyOf(eff));
        }
        return out;
    }

    /** λ·level + (1−λ)·traj, or level alone when the category has no trajectory (D5). */
    public static double blended(CategoryScore cs, double lambda) {
        return cs.traj() == null ? cs.level() : lambda * cs.level() + (1 - lambda) * cs.traj();
    }

    private static CategoryScore at(Map<Category, CategoryScore[]> cats, Category c, int m) {
        CategoryScore[] s = cats.get(c);
        return s == null ? CategoryScore.missing() : s[m];
    }

    private static double clamp(double s) {
        return Math.max(0, Math.min(100, s));
    }
}
