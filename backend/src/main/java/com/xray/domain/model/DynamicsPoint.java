package com.xray.domain.model;

/** S70 output for one profile at one month. Null for a month with no final score. */
public record DynamicsPoint(HealthStatus status, Regime regime, boolean seasonal, Confidence confidence) {
}
