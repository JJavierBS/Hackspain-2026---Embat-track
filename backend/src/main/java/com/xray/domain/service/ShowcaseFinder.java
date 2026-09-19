package com.xray.domain.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * SPEC §10.4: two entities with the same score today heading in opposite directions — the pitch opener.
 * Ranked pairs, an entity in at most one pair (phase 6 decision G9). Display only: nothing reads this back.
 */
public final class ShowcaseFinder {

    public record Candidate(String id, double finalScore, Double traj) {
    }

    public record Params(double maxFinalGap, double upMinTraj, double downMaxTraj, int topN) {
    }

    public record Pair(String upId, String downId, double upFinal, double downFinal, double upTraj, double downTraj,
                       boolean meetsSpec) {

        public double finalGap() {
            return Math.abs(upFinal - downFinal);
        }

        public double trajGap() {
            return upTraj - downTraj;
        }
    }

    private ShowcaseFinder() {
    }

    public static List<Pair> find(List<Candidate> candidates, Params p) {
        List<Candidate> sorted = candidates.stream().filter(c -> c.traj() != null)
                .sorted(Comparator.comparingDouble(Candidate::finalScore).thenComparing(Candidate::id)).toList();
        List<Pair> pairs = new ArrayList<>();
        for (int i = 0; i < sorted.size(); i++) {
            for (int j = i + 1; j < sorted.size()
                    && sorted.get(j).finalScore() - sorted.get(i).finalScore() <= p.maxFinalGap(); j++) {
                Candidate a = sorted.get(i);
                Candidate b = sorted.get(j);
                Candidate up = a.traj() >= b.traj() ? a : b;
                Candidate down = up == a ? b : a;
                if (up.traj() <= down.traj()) {
                    continue;                                             // no direction, no story
                }
                pairs.add(new Pair(up.id(), down.id(), up.finalScore(), down.finalScore(), up.traj(), down.traj(),
                        up.traj() >= p.upMinTraj() && down.traj() <= p.downMaxTraj()));
            }
        }
        pairs.sort(Comparator.comparing(Pair::meetsSpec).reversed()
                .thenComparing(Comparator.comparingDouble(Pair::trajGap).reversed())
                .thenComparingDouble(Pair::finalGap)
                .thenComparing(Pair::upId).thenComparing(Pair::downId));
        List<Pair> out = new ArrayList<>();
        Set<String> used = new HashSet<>();
        for (Pair pair : pairs) {
            if (out.size() >= p.topN()) {
                break;
            }
            if (!used.contains(pair.upId()) && !used.contains(pair.downId())) {
                used.add(pair.upId());
                used.add(pair.downId());
                out.add(pair);
            }
        }
        return List.copyOf(out);
    }
}
