package com.xray.infrastructure.web.dto;

import java.util.List;

/** GET /api/analytics/showcase-pairs (SPEC §10.4): ranked pairs of the month, rank 1 first. */
public record ShowcasePairsDto(String profile, String month, List<ShowcasePairDto> pairs) {
}
