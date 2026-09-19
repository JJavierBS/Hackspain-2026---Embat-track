package com.xray.domain.model;

/** Level from anchors, trajectory from the level series (SPEC §7.1, §7.2). trajectory null = not computable. */
public record SubScore(double level, Double trajectory, boolean available) {

    public static SubScore missing() {
        return new SubScore(0, null, false);
    }

    public SubScore withTrajectory(Double t) {
        return new SubScore(level, t, available);
    }
}
