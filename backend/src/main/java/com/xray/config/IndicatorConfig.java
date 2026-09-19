package com.xray.config;

import com.xray.domain.model.AnchorStatus;
import com.xray.domain.model.Category;

import java.util.List;

/**
 * One indicator of SPEC §6. anchors = sorted [x, score] pairs, score in [0,100].
 * weight = the indicator's weight inside its category (phase 4 decision E11). Optional, > 0.
 */
public record IndicatorConfig(
        Category category,
        String method,
        AnchorStatus status,
        String source,
        List<List<Double>> anchors,
        Double weight) {

    /** A missing weight is 1, so equal weights give the plain category mean of SPEC §7.3. */
    public double weightOrDefault() {
        return weight == null ? 1.0 : weight;
    }
}
