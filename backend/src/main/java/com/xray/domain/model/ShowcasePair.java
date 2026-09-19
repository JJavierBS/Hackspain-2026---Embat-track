package com.xray.domain.model;

/** One row of showcase_pairs (phase 6 contract item 5): a placed pair, rank 1 first. Month ordinal. */
public record ShowcasePair(EntityType entityType, int month, Profile profile, int rank,
                           String upId, String downId, double upFinal, double downFinal,
                           double upTraj, double downTraj, boolean meetsSpec) {

    public double finalGap() {
        return Math.abs(upFinal - downFinal);
    }

    public double trajGap() {
        return upTraj - downTraj;
    }
}
