package com.xray.domain.model;

/**
 * One driver's share of final − 50 (SPEC §7.5). driverId = an IndicatorId name or MOMENTUM.
 * effWeight = w'_c / n_available (the category's effective weight for MOMENTUM).
 * blended = λ·level + (1−λ)·traj of the driver (the momentum value for MOMENTUM).
 */
public record Contribution(String driverId, Category category, double effWeight, double blended, double contrib) {
}
