package com.xray.domain.service;

import com.xray.domain.model.HealthStatus;
import com.xray.domain.model.Regime;

/** The eight statuses of SPEC §8.3, in precedence order. traj null never meets a trajectory condition. */
public final class StatusResolver {

    public record Params(double criticalBelow, double turningMinLevel, double turningMaxTraj, double improvingMinTraj,
                         double exceptionalMinFinal, double exceptionalMinTraj, double healthyMinFinal) {
    }

    private StatusResolver() {
    }

    public static HealthStatus resolve(double fin, Double level, Double traj, Regime regime, boolean cusumDown, Params p) {
        if (fin < p.criticalBelow()) return HealthStatus.CRITICAL;
        if (regime == Regime.STRUCTURAL_DECLINE) return HealthStatus.STRUCTURAL_DECLINE;
        if (level != null && level >= p.turningMinLevel()
                && ((traj != null && traj <= p.turningMaxTraj()) || cusumDown)) return HealthStatus.TURNING;
        if (regime == Regime.DIP) return HealthStatus.DIP;
        if (regime == Regime.STRUCTURAL_IMPROVEMENT || (traj != null && traj >= p.improvingMinTraj())) {
            return HealthStatus.IMPROVING;
        }
        if (fin >= p.exceptionalMinFinal() && traj != null && traj >= p.exceptionalMinTraj()) return HealthStatus.EXCEPTIONAL;
        if (fin >= p.healthyMinFinal()) return HealthStatus.HEALTHY;
        return HealthStatus.WATCH;
    }
}
