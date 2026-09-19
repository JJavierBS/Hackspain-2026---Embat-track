package com.xray.domain.model;

import java.util.Map;

/**
 * One profile at one month (SPEC §7.3–§7.4). finalScore null = no category available.
 * effectiveWeights = w' renormalized over the available categories (MOMENTUM included when available),
 * summing to 1. S65 uses them for the exact additive explanation (SPEC §7.5).
 */
public record ProfileScore(Double finalScore, Double level, Double traj, Band band,
                           Double momentum, int momPersistence, Map<Category, Double> effectiveWeights) {
}
