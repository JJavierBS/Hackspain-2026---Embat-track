package com.xray.pipeline.stages;

import com.xray.config.ScoringConfig;
import com.xray.domain.model.Category;
import com.xray.domain.model.IndicatorId;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/** Category -> its indicators, from scoring-config.yml. MOMENTUM has no indicators (SPEC §7.3). */
final class CategoryMembers {

    private CategoryMembers() {
    }

    /** Indicator -> its weight inside its category (decision E11), 1 when the config has no weight. */
    static Map<IndicatorId, Double> weights(ScoringConfig config) {
        Map<IndicatorId, Double> out = new EnumMap<>(IndicatorId.class);
        for (IndicatorId id : IndicatorId.values()) {
            out.put(id, config.indicators().get(id).weightOrDefault());
        }
        return out;
    }

    static Map<Category, List<IndicatorId>> of(ScoringConfig config) {
        Map<Category, List<IndicatorId>> members = new EnumMap<>(Category.class);
        for (Category c : Category.values()) {
            if (c != Category.MOMENTUM) {
                members.put(c, new ArrayList<>());
            }
        }
        for (IndicatorId id : IndicatorId.values()) {
            members.get(config.indicators().get(id).category()).add(id);
        }
        return members;
    }
}
