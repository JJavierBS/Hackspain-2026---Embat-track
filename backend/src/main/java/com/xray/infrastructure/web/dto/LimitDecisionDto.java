package com.xray.infrastructure.web.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/** GET /api/entities/{id}/limit (phase 5 contract item 8). EUR as integers, rates 4 decimals, DSCR 2. */
public record LimitDecisionDto(String month, String profile, @JsonProperty("final") double finalScore, String band,
                               long limitEur, Long previousLimitEur, String action, String bindingConstraint,
                               Integer spreadBps, Double allInRate, Double projectedDscr, long baseEur, double factor,
                               double trend, boolean runwayGuard, Long dscrCapEur) {
}
