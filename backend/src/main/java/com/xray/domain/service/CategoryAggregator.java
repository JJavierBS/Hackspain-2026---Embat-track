package com.xray.domain.service;

import com.xray.domain.model.CategoryScore;
import com.xray.domain.model.SubScore;

import java.util.Arrays;
import java.util.List;

/**
 * C_level / C_traj = weighted means of the available indicators of one category (SPEC §7.3, phase 4 decision E11).
 * With equal weights this is the plain mean of the SPEC.
 */
public final class CategoryAggregator {

    private CategoryAggregator() {
    }

    /** Equal weights: the plain mean. */
    public static CategoryScore[] aggregate(List<SubScore[]> members, int months) {
        double[] w = new double[members.size()];
        Arrays.fill(w, 1.0);
        return aggregate(members, w, months);
    }

    /** weights[i] > 0 belongs to members.get(i). A trajectory mean uses only the members with a trajectory. */
    public static CategoryScore[] aggregate(List<SubScore[]> members, double[] weights, int months) {
        CategoryScore[] out = new CategoryScore[months];
        for (int m = 0; m < months; m++) {
            double ls = 0, lw = 0, ts = 0, tw = 0;
            int n = 0;
            for (int i = 0; i < members.size(); i++) {
                SubScore x = members.get(i)[m];
                if (!x.available()) continue;
                double w = weights[i];
                ls += w * x.level();
                lw += w;
                n++;
                if (x.trajectory() != null) {
                    ts += w * x.trajectory();
                    tw += w;
                }
            }
            out[m] = n == 0 ? CategoryScore.missing() : new CategoryScore(ls / lw, tw == 0 ? null : ts / tw, n);
        }
        return out;
    }
}
