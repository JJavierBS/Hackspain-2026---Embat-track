package com.xray.infrastructure.web.dto;

import java.util.List;
import java.util.Map;

/**
 * Body of POST /api/entities/{id}/tuning. Every field is optional.
 * sector = an id of sectors.yml. sectorIndicators = the indicators of that sector whose anchors apply; null applies
 * them all (the default), an empty list applies none. config = editable sections of GET /api/config (the Algorithm
 * page draft).
 */
public record TuningRequest(String profile, String month, String sector, List<String> sectorIndicators,
                            Map<String, Object> config) {
}
