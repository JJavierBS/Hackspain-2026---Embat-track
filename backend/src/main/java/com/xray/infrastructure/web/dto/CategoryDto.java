package com.xray.infrastructure.web.dto;

/** weight = profile weight (0–100); effectiveWeight = renormalized share (0–1) this month. */
public record CategoryDto(String category, Double level, Double traj, double weight, double effectiveWeight,
                          double contribution, Double contributionDelta3m, int nAvailable) {
}
