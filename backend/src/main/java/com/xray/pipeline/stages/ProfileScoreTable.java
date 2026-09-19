package com.xray.pipeline.stages;

import com.xray.domain.model.DynamicsPoint;
import com.xray.domain.model.EntityPanel;
import com.xray.domain.model.Profile;
import com.xray.domain.model.ProfileScore;

import java.util.ArrayList;
import java.util.List;

/** profile_scores (phase 4 contract item 3). S60 writes it without dynamics, S70 rewrites it with them. */
final class ProfileScoreTable {

    static final String NAME = "profile_scores";
    static final String DDL = "entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, profile VARCHAR, "
            + "final DOUBLE, level DOUBLE, traj DOUBLE, band VARCHAR, momentum DOUBLE, mom_persistence INTEGER, "
            + "status VARCHAR, regime VARCHAR, confidence VARCHAR, seasonal BOOLEAN";

    private ProfileScoreTable() {
    }

    static List<Object[]> rows(EntityPanel panel) {
        List<Object[]> rows = new ArrayList<>(Profile.values().length * panel.size());
        for (Profile p : Profile.values()) {
            ProfileScore[] s = panel.profileScores(p);
            DynamicsPoint[] d = panel.dynamics(p);
            for (int m = 0; m < panel.size(); m++) {
                ProfileScore x = s[m];
                DynamicsPoint y = d == null ? null : d[m];
                rows.add(new Object[]{panel.key().type().name(), panel.key().id(), panel.months().get(m).toString(),
                        p.name(), x.finalScore(), x.level(), x.traj(), x.band() == null ? null : x.band().name(),
                        x.momentum(), x.momPersistence(),
                        y == null ? null : y.status().name(),
                        y == null ? null : y.regime().name(),
                        y == null ? null : y.confidence().name(),
                        y == null ? null : y.seasonal()});
            }
        }
        return rows;
    }
}
