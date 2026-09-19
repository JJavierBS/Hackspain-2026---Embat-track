package com.xray.domain.model;

/** One row of limit_decisions (overview contract item 3). EUR amounts; NULL fields as the contract says. */
public record LimitDecision(double finalScore, Double traj, Band band, double baseEur, double factor, double trend,
                            boolean runwayGuard, double rawLimitEur, Double nocf12m, Double debtService12m,
                            Double dscrCapEur, double limitEur, Double prevLimitEur, Integer spreadBps,
                            Double allInRate, LimitAction action, BindingConstraint bindingConstraint,
                            Double projectedDscr) {
}
