package com.xray.infrastructure.web.dto;

/** SPEC §10.1 simulator answer (phase 5 contract item 8). decision = APPROVE | PARTIAL | DECLINE. */
public record LimitSimulationDto(String month, String decision, long requestedAmountEur, long approvedAmountEur,
                                 long capacityEur, int termMonths, Integer spreadBps, Double allInRate,
                                 Double projectedDscr, String bindingConstraint) {
}
