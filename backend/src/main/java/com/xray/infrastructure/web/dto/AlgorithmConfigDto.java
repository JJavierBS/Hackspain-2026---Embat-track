package com.xray.infrastructure.web.dto;

import java.util.List;
import java.util.Map;

/**
 * The scoring config as the Algorithm page edits it.
 * bootId changes on every context start, so the page can tell that a restart happened.
 * appliedToData: the latest pipeline run used exactly this config.
 */
public record AlgorithmConfigDto(
        String bootId,
        boolean editable,
        boolean overridden,
        boolean appliedToData,
        List<String> editableSections,
        Map<String, Object> config,
        Map<String, Object> defaults) {
}
