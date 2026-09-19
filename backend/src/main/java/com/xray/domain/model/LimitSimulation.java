package com.xray.domain.model;

/** SPEC §10.1 simulator answer. decision = APPROVE | PARTIAL | DECLINE. */
public record LimitSimulation(String decision, double requestedEur, double approvedEur, double capacityEur,
                              int termMonths, Integer spreadBps, Double allInRate, Double projectedDscr,
                              BindingConstraint bindingConstraint) {
}
