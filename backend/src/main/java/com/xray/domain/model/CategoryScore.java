package com.xray.domain.model;

/** Mean of the available indicator sub-scores of one category (SPEC §7.3). level null = no indicator available. */
public record CategoryScore(Double level, Double traj, int nAvailable) {

    public static CategoryScore missing() {
        return new CategoryScore(null, null, 0);
    }

    public boolean available() {
        return level != null;
    }
}
