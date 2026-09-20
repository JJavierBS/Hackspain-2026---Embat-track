package com.xray.domain.service;

import com.xray.domain.model.MomentumPoint;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * SPEC §10.3 momentum screen (overview contract item 5).
 * Peer ranks and percentiles are display only (SPEC §10.3). No scoring code reads them (docs/RULES.md rule 2).
 */
public final class MomentumScreen {

    private MomentumScreen() {
    }

    public record Params(double risingStarMaxLevel, double risingStarMinTraj) {
    }

    /** One scored entity of the same type and month. level, traj and growth may be null. */
    public record Peer(String entityId, double finalScore, Double level, Double traj, Double growth) {
    }

    public static Map<String, MomentumPoint> screen(List<Peer> peers, Params p) {
        List<Double> trajs = peers.stream().map(Peer::traj).filter(Objects::nonNull).toList();
        List<Double> growths = peers.stream().map(Peer::growth).filter(Objects::nonNull).toList();
        Map<String, MomentumPoint> out = new HashMap<>();
        for (Peer peer : peers) {
            int rank = 1 + (int) peers.stream().filter(o -> o.finalScore() > peer.finalScore()).count();
            boolean risingStar = peer.traj() != null && peer.level() != null && peer.level() < p.risingStarMaxLevel()
                    && peer.traj() >= p.risingStarMinTraj();
            out.put(peer.entityId(), new MomentumPoint(rank, peers.size(), percentile(peer.traj(), trajs),
                    percentile(peer.growth(), growths), risingStar));
        }
        return out;
    }

    /** Mid-rank percentile of x among values (x included); 50 when alone, null when x is null. */
    static Integer percentile(Double x, List<Double> values) {
        if (x == null) {
            return null;
        }
        int n = values.size();
        if (n == 1) {
            return 50;
        }
        long less = values.stream().filter(v -> v < x).count();
        long equal = values.stream().filter(v -> v.doubleValue() == x).count();
        return (int) Math.round(100.0 * (less + 0.5 * (equal - 1)) / (n - 1));
    }
}
