package com.xray.domain.service;

import com.xray.domain.model.EventTrigger;
import com.xray.domain.model.EventType;
import com.xray.domain.model.HealthStatus;
import com.xray.domain.model.LimitAction;
import com.xray.domain.model.Regime;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.function.IntPredicate;

/**
 * SPEC §8.4 measured anticipation, per entity and profile (phase 6 decisions G3–G7).
 * Proxy events (no default label exists), the first month the system raised its hand inside the window
 * before the event, and the onsets of that signal that no event followed.
 * These are evaluation numbers: they look at months after the signal on purpose (decision G8) and are
 * never read by scoring, products or alerts.
 */
public final class LeadTimeAnalyzer {

    public record Params(int minHistoryMonths, int windowMonths, int horizonMonths,
                         double runwayBelow, int runwayMonths, double dscrBelow, int dscrMonths,
                         double overdueMaxLevel, double scoreBelow,
                         double improvementCross, int improvementCrossMonths, double improvementBelow,
                         int improvementBelowMonths,
                         Set<HealthStatus> deteriorationStatuses, double deteriorationMaxTraj,
                         Set<HealthStatus> improvementStatuses, double improvementMinTraj,
                         int maxGapMonths) {
    }

    /** One entity and one profile, indexed by month ordinal. null = missing. limitActions null off the limit profile. */
    public record Series(Double[] finalScore, Double[] level, Double[] traj, HealthStatus[] status, Regime[] regime,
                         Double[] runway, Double[] dscr, Double[] overdueReceivablesLevel,
                         Double[] overduePayablesLevel, LimitAction[] limitActions) {
    }

    public record Event(EventType type, EventTrigger trigger, int month, Integer signalMonth, Integer limitSignalMonth) {
    }

    public record Signal(EventType type, int month, boolean evaluable, boolean followed) {
    }

    /**
     * The naive baseline of one event type: over all months outside the condition, how many were followed by
     * the condition within the horizon. A signal is useful only when its followed rate is above this rate.
     */
    public record Baseline(EventType type, int evaluable, int followed) {
    }

    public record Result(List<Event> events, List<Signal> signals, List<Baseline> baselines) {
    }

    private LeadTimeAnalyzer() {
    }

    public static Result analyze(Series s, Params p) {
        int n = s.finalScore().length;
        int first = firstScored(s.finalScore());
        if (first < 0) {
            return new Result(List.of(), List.of(), List.of());
        }
        List<Event> events = new ArrayList<>();
        List<Signal> signals = new ArrayList<>();
        List<Baseline> baselines = new ArrayList<>();
        for (EventType type : EventType.values()) {
            EventTrigger[] cond = new EventTrigger[n];
            for (int m = 0; m < n; m++) {
                cond[m] = type == EventType.DETERIORATION ? deterioration(s, m, p) : improvement(s, m, p);
            }
            firstEvent(s, cond, first, type, p).ifPresent(events::add);
            signals.addAll(signalOnsets(s, cond, first, type, p));
            baselines.add(baseline(cond, first, type, p));
        }
        return new Result(List.copyOf(events), List.copyOf(signals), List.copyOf(baselines));
    }

    /** The first onset of the condition with min-history-months of months before it (G3, G4). */
    private static Optional<Event> firstEvent(Series s, EventTrigger[] cond, int first, EventType type, Params p) {
        for (int e = first + p.minHistoryMonths(); e < cond.length; e++) {
            if (cond[e] == null || cond[e - 1] != null || s.finalScore()[e] == null) {
                continue;
            }
            int from = Math.max(first, e - p.windowMonths());
            Integer signal = runStart(e, from, p.maxGapMonths(), m -> signal(s, type, m, p));
            Integer cut = null;
            if (type == EventType.DETERIORATION && s.limitActions() != null) {
                cut = limitCut(s.limitActions(), e, Math.max(0, e - p.windowMonths()));
            }
            return Optional.of(new Event(type, cond[e], e, signal, cut));
        }
        return Optional.empty();
    }

    /**
     * Start of the run of months that reaches e, walking back from e (decision G5 as revised on 2026-09-19).
     * A run may break for at most maxGap months in a row, and it must be on at e or within maxGap months of it.
     * A signal from an earlier episode that switched off gets no credit. null = no run reaches e.
     */
    private static Integer runStart(int e, int from, int maxGap, IntPredicate on) {
        Integer start = null;
        int gap = 0;
        for (int m = e; m >= from; m--) {
            if (on.test(m)) {
                start = m;
                gap = 0;
            } else if (++gap > maxGap) {
                break;
            }
        }
        return start;
    }

    /**
     * The limit cut credited to an event (decision G6 as revised on 2026-09-19): the first REDUCE or FREEZE
     * after the last INCREASE before e. A cut that the engine undid later gets no credit. null = none.
     */
    private static Integer limitCut(LimitAction[] actions, int e, int from) {
        Integer cut = null;
        for (int m = e; m >= from; m--) {
            LimitAction a = actions[m];
            if (a == LimitAction.INCREASE) {
                break;
            }
            if (a == LimitAction.REDUCE || a == LimitAction.FREEZE) {
                cut = m;
            }
        }
        return cut;
    }

    /** Signal onsets outside the event condition, and whether the condition followed within the horizon (G7). */
    private static List<Signal> signalOnsets(Series s, EventTrigger[] cond, int first, EventType type, Params p) {
        List<Signal> out = new ArrayList<>();
        boolean previous = false;
        for (int m = first; m < cond.length; m++) {
            boolean on = signal(s, type, m, p);
            if (on && !previous && cond[m] == null) {
                boolean followed = followedWithin(cond, m, p.horizonMonths());
                boolean evaluable = followed || m + p.horizonMonths() <= cond.length - 1;
                out.add(new Signal(type, m, evaluable, followed));
            }
            previous = on;
        }
        return out;
    }

    /** Every month outside the condition counts, with the same horizon and evaluability rule as a signal onset. */
    private static Baseline baseline(EventTrigger[] cond, int first, EventType type, Params p) {
        int evaluable = 0;
        int followed = 0;
        for (int m = first; m < cond.length; m++) {
            if (cond[m] != null) {
                continue;
            }
            boolean next = followedWithin(cond, m, p.horizonMonths());
            if (next || m + p.horizonMonths() <= cond.length - 1) {
                evaluable++;
                followed += next ? 1 : 0;
            }
        }
        return new Baseline(type, evaluable, followed);
    }

    private static boolean followedWithin(EventTrigger[] cond, int m, int horizon) {
        int last = Math.min(cond.length - 1, m + horizon);
        for (int k = m + 1; k <= last; k++) {
            if (cond[k] != null) {
                return true;
            }
        }
        return false;
    }

    private static boolean signal(Series s, EventType type, int m, Params p) {
        HealthStatus st = s.status()[m];
        Double traj = s.traj()[m];
        if (type == EventType.DETERIORATION) {
            return (st != null && p.deteriorationStatuses().contains(st))
                    || (traj != null && traj <= p.deteriorationMaxTraj());
        }
        return (st != null && p.improvementStatuses().contains(st))
                || s.regime()[m] == Regime.STRUCTURAL_IMPROVEMENT
                || (traj != null && traj >= p.improvementMinTraj());
    }

    /** Trigger order is fixed: the cash conditions before the score (G3). */
    private static EventTrigger deterioration(Series s, int m, Params p) {
        if (below(s.runway(), m, p.runwayBelow(), p.runwayMonths())) {
            return EventTrigger.RUNWAY;
        }
        if (below(s.dscr(), m, p.dscrBelow(), p.dscrMonths())) {
            return EventTrigger.DSCR;
        }
        Double recv = s.overdueReceivablesLevel()[m];
        Double pay = s.overduePayablesLevel()[m];
        if (recv != null && pay != null && recv <= p.overdueMaxLevel() && pay <= p.overdueMaxLevel()) {
            return EventTrigger.OVERDUE;
        }
        Double f = s.finalScore()[m];
        return f != null && f < p.scoreBelow() ? EventTrigger.SCORE : null;
    }

    /**
     * Level holds at or above the threshold for improvementCrossMonths in a row, ending at m, after a run below
     * the low threshold inside the window (G4). The hold matches runway-months and dscr-months of deterioration:
     * both directions need the same proof, so a one-month rebound is not an improvement.
     */
    private static EventTrigger improvement(Series s, int m, Params p) {
        int start = m - p.improvementCrossMonths() + 1;
        if (start < 1) {
            return null;
        }
        Double before = s.level()[start - 1];
        if (before == null || before >= p.improvementCross()) {
            return null;
        }
        for (int k = start; k <= m; k++) {
            Double lv = s.level()[k];
            if (lv == null || lv < p.improvementCross()) {
                return null;
            }
        }
        int run = 0;
        for (int k = Math.max(0, start - p.windowMonths()); k < start; k++) {
            Double lv = s.level()[k];
            run = lv != null && lv < p.improvementBelow() ? run + 1 : 0;
            if (run >= p.improvementBelowMonths()) {
                return EventTrigger.LEVEL_CROSS;
            }
        }
        return null;
    }

    /** Every month of the window ends at m, has a value and is below the threshold. */
    private static boolean below(Double[] x, int m, double threshold, int months) {
        if (m - months + 1 < 0) {
            return false;
        }
        for (int k = m - months + 1; k <= m; k++) {
            if (x[k] == null || x[k] >= threshold) {
                return false;
            }
        }
        return true;
    }

    private static int firstScored(Double[] finalScore) {
        for (int m = 0; m < finalScore.length; m++) {
            if (finalScore[m] != null) {
                return m;
            }
        }
        return -1;
    }
}
