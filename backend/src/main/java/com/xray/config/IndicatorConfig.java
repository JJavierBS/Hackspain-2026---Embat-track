package com.xray.config;

import com.xray.domain.model.AnchorStatus;
import com.xray.domain.model.Category;

import java.util.List;

/** One indicator of SPEC §6. anchors = sorted [x, score] pairs, score in [0,100]. */
public record IndicatorConfig(
        Category category,
        String method,
        AnchorStatus status,
        String source,
        List<List<Double>> anchors) {
}
