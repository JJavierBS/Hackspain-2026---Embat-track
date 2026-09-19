package com.xray.domain.service;

import com.xray.domain.model.CategoryScore;
import com.xray.domain.model.SubScore;

import java.util.List;

/** C_level / C_traj = means of the available indicators of one category (SPEC §7.3). */
public final class CategoryAggregator {

    private CategoryAggregator() {
    }

    public static CategoryScore[] aggregate(List<SubScore[]> members, int months) {
        CategoryScore[] out = new CategoryScore[months];
        for (int m = 0; m < months; m++) {
            double ls = 0, ts = 0;
            int n = 0, nt = 0;
            for (SubScore[] s : members) {
                SubScore x = s[m];
                if (!x.available()) continue;
                ls += x.level();
                n++;
                if (x.trajectory() != null) {
                    ts += x.trajectory();
                    nt++;
                }
            }
            out[m] = n == 0 ? CategoryScore.missing() : new CategoryScore(ls / n, nt == 0 ? null : ts / nt, n);
        }
        return out;
    }
}
