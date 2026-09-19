package com.xray.infrastructure.web.dto;

import java.util.List;

/**
 * GET /api/analytics/lead-time (phase 6 contract item 6). limit is null off the limit profile.
 * Evaluation numbers: they are measured against the proxy events of SPEC §8.4, not a real default label.
 */
public record LeadTimeDto(String profile, String unit, int windowMonths, int horizonMonths, int minHistoryMonths,
                          LeadTimeBlockDto deterioration, LeadTimeBlockDto improvement, LimitLeadDto limit,
                          List<LeadTimeExampleDto> examples) {

    /** The limit engine cut the line this many months before the event (SPEC §10.1, decision G6). */
    public record LimitLeadDto(long events, long cutAhead, Double meanLead, Double medianLead) {
    }
}
