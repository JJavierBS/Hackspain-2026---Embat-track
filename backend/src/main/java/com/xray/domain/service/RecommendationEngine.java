package com.xray.domain.service;

import com.xray.domain.model.Category;
import com.xray.domain.model.HealthStatus;
import com.xray.domain.model.IndicatorId;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Static recommendations for one entity-month-profile (docs/RECOMMENDATIONS.md). Pure: it reads the month's
 * indicator states, the profile's effective category weights and the entity's scored history up to that month,
 * and returns at most topN findings plus a summary. It decides what to say; the renderer decides the wording.
 *
 * Ranking: survival findings first (runway, DSCR or credit line past the CRITICAL alert level), then
 * points × severity factor. points = what the final score would gain if the indicator reached targetLevel and
 * stopped deteriorating, from the exact additive decomposition (SPEC §7.5). One finding per category.
 */
public final class RecommendationEngine {

    public enum Kind { PROBLEM, OPPORTUNITY }

    public enum Severity { CRITICAL, HIGH, MEDIUM, INFO }

    /** The situation a finding describes. The renderer has one text per (indicator, variant). */
    public enum Variant {
        LEVEL, TREND,
        RUNWAY_CRITICAL, RUNWAY_LOW, BUFFER_SHORT, OVERDRAFT,
        NOCF_NEGATIVE, OVERTRADING, IN_OUT_BELOW_ONE,
        GROWTH_COLLAPSE, GROWTH_DECLINE,
        DSCR_NEGATIVE, DSCR_BELOW_ONE, DSCR_BELOW_COVENANT, LINE_EXHAUSTED, DEBT_NO_CF,
        NO_COLLECTIONS, OVERDUE_NO_BASE,
        IDLE_CASH, DEBT_CAPACITY, NO_DEBT_CAPACITY
    }

    /**
     * Indicators whose SQL writes the worst anchor x when the ratio has no base (sql/30, 31, 35, 36): no
     * collections at all, or overdue invoices with no invoice in 3 months. The text must not read it as a ratio.
     */
    private static final Set<IndicatorId> SENTINEL_WORST = EnumSet.of(IndicatorId.CF_NOCF_MARGIN,
            IndicatorId.CF_VOLATILITY, IndicatorId.PAY_OVERDUE_PAYABLES, IndicatorId.DEL_OVERDUE_RECEIVABLES);

    /** Why a summary has no findings, or the entity status that frames them. */
    public enum Situation {
        NO_SCORE, INSUFFICIENT_HISTORY,
        CRITICAL, STRUCTURAL_DECLINE, TURNING, DIP, IMPROVING, EXCEPTIONAL, HEALTHY, WATCH
    }

    /** One indicator at month m. weight = its weight inside the category. value null = rule-defined level. */
    public record IndicatorState(IndicatorId id, Category category, double weight, Double value, double level,
                                 Double traj, boolean available, boolean isStatic, boolean fallback) {
    }

    /**
     * categoryWeights = the profile's effective weights at m (ProfileScore.effectiveWeights). profileCategories =
     * categories with a weight above 0 in the profile. history = scored months up to and including m.
     */
    public record Input(Double finalScore, HealthStatus status, boolean seasonal, int momPersistence, int history,
                        double lambda, Map<Category, Double> categoryWeights, Set<Category> profileCategories,
                        List<IndicatorState> indicators) {
    }

    public record Params(int topN, int minHistoryMonths, int fullHistoryMonths, double limitedMaxLevel,
                         double problemMaxLevel, double highMaxLevel, double criticalMaxLevel,
                         double trendMaxTraj, double trendHighMaxTraj, double trendMaxLevel, double targetLevel, double minPoints,
                         double criticalFactor, double highFactor, double mediumFactor,
                         double agingMinOverdueShare, double growthCollapseBelow, double overtradingMinGrowth,
                         double idleCashMinRunway, double idleCashMinBuffer, double debtCapacityMinDscr,
                         double debtCapacityMaxDebtToCf, double opportunityMinFinal,
                         double runwayCritical, double runwayWarn, double dscrCritical, double dscrWarn,
                         double lineUtilCritical, Map<IndicatorId, List<double[]>> anchors) {
    }

    /**
     * points null for an opportunity. target = the indicator value that scores targetLevel, null when the level
     * is already there or the anchors never reach it. related = a second value the text needs: the growth for
     * OVERTRADING, the WARN alert level for RUNWAY_LOW and DSCR_BELOW_COVENANT, the debt-to-cash years for
     * DEBT_CAPACITY, the cash margin for NO_DEBT_CAPACITY, the runway for IDLE_CASH.
     * flag = room for factoring (PAY_DSO), expensive debt to prepay (IDLE_CASH).
     */
    public record Finding(IndicatorId id, Category category, Kind kind, Variant variant, Severity severity,
                          boolean survival, boolean worsening, Double points, Double value, Double target,
                          Double related, boolean flag, boolean isStatic, boolean fallback) {
    }

    /** missing = categories of the profile with no available indicator at m, in Category order. */
    public record Summary(Situation situation, boolean limitedHistory, boolean seasonal, int declineMonths,
                          int history, List<Category> missing) {
    }

    public record Result(Summary summary, List<Finding> findings) {
    }

    private RecommendationEngine() {
    }

    public static Result recommend(Input in, Params p) {
        if (in.finalScore() == null) {
            return new Result(new Summary(Situation.NO_SCORE, false, false, 0, in.history(), List.of()), List.of());
        }
        List<Category> missing = missing(in);
        if (in.history() < p.minHistoryMonths()) {
            return new Result(new Summary(Situation.INSUFFICIENT_HISTORY, true, false, 0, in.history(), missing),
                    List.of());
        }
        boolean limited = in.history() < p.fullHistoryMonths();
        Map<IndicatorId, IndicatorState> by = new EnumMap<>(IndicatorId.class);
        in.indicators().forEach(s -> by.put(s.id(), s));

        List<Finding> problems = new ArrayList<>();
        for (IndicatorState s : in.indicators()) {
            Finding f = problem(s, by, in, p, limited);
            if (f != null) problems.add(f);
        }
        // Survival first, most immediate first (no cash, then debt not covered, then no credit left).
        problems.sort(Comparator.comparing((Finding f) -> !f.survival())
                .thenComparing(f -> f.survival() ? SURVIVAL_ORDER.indexOf(f.id()) : 0)
                .thenComparing(f -> -f.points() * factor(f.severity(), p))
                .thenComparing(f -> f.id().ordinal()));

        List<Finding> chosen = new ArrayList<>();
        Set<Category> used = EnumSet.noneOf(Category.class);
        for (Finding f : problems) {
            if (chosen.size() == p.topN()) break;
            if (redundant(f, chosen)) continue;
            if (used.add(f.category())) chosen.add(f);
        }
        boolean severe = chosen.stream().anyMatch(f -> f.survival() || f.severity() == Severity.CRITICAL);
        if (!limited && !severe && in.finalScore() >= p.opportunityMinFinal()) {
            for (Finding f : opportunities(by, p)) {
                if (chosen.size() == p.topN()) break;
                if (used.add(f.category())) chosen.add(f);
            }
        }
        int decline = in.momPersistence() < 0 ? -in.momPersistence() : 0;
        Situation situation = in.status() == null ? Situation.WATCH : Situation.valueOf(in.status().name());
        return new Result(new Summary(situation, limited, in.seasonal(), decline, in.history(), missing),
                List.copyOf(chosen));
    }

    private static Finding problem(IndicatorState s, Map<IndicatorId, IndicatorState> by, Input in, Params p,
                                   boolean limited) {
        if (!s.available()) return null;
        Double v = s.value();
        IndicatorId id = s.id();
        // Materiality: aging of a tiny overdue balance says nothing (6 of 14 low-aging groups at M23).
        if (id == IndicatorId.DEL_AGING_90) {
            IndicatorState od = by.get(IndicatorId.DEL_OVERDUE_RECEIVABLES);
            if (od == null || !od.available() || od.value() == null || od.value() < p.agingMinOverdueShare()) {
                return null;
            }
        }
        // DSCR with no debt service scores by rule (level noDebtLevel): nothing to fix.
        if (id == IndicatorId.DEBT_DSCR && v == null) return null;

        boolean survival = survival(id, v, p);
        boolean levelProblem = s.level() < (limited ? p.limitedMaxLevel() : p.problemMaxLevel());
        boolean trendUsable = !limited && s.traj() != null && !s.isStatic() && !s.fallback();
        // A falling trajectory at the top of the anchors is smoothing noise, not a warning (runway capped at 24
        // months, DSCR in the thousands): only indicators below trendMaxLevel can be "worsening".
        boolean worsening = trendUsable && s.traj() <= p.trendMaxTraj() && s.level() < p.trendMaxLevel();
        if (!survival && !levelProblem && !worsening) return null;

        double points = points(s, in, p, trendUsable);
        if (!survival && points < p.minPoints()) return null;

        Severity severity;
        if (survival || s.level() < p.criticalMaxLevel()) severity = Severity.CRITICAL;
        else if (s.level() < p.highMaxLevel() || (worsening && s.traj() <= p.trendHighMaxTraj())) severity = Severity.HIGH;
        else severity = Severity.MEDIUM;

        Variant variant = sentinel(s, p) ? (s.category() == Category.OPERATING_CASH_FLOW ? Variant.NO_COLLECTIONS
                : Variant.OVERDUE_NO_BASE) : levelProblem || survival ? variant(s, by, p) : Variant.TREND;
        Double target = s.level() < p.targetLevel() ? inverse(p.anchors().get(id), p.targetLevel()) : null;
        Double related = null;
        boolean flag = false;
        switch (variant) {
            case OVERTRADING -> related = by.get(IndicatorId.ACT_COLLECTIONS_GROWTH).value();
            case RUNWAY_LOW -> related = p.runwayWarn();
            case DSCR_BELOW_COVENANT -> related = p.dscrWarn();
            default -> { }
        }
        if (id == IndicatorId.PAY_DSO) {
            IndicatorState fr = by.get(IndicatorId.LEV_FACTORING_RELIANCE);
            flag = fr == null || !fr.available() || fr.level() >= p.problemMaxLevel();
        }
        return new Finding(id, s.category(), Kind.PROBLEM, variant, severity, survival, worsening, points, v,
                target, related, flag, s.isStatic(), s.fallback());
    }

    private static final List<IndicatorId> SURVIVAL_ORDER =
            List.of(IndicatorId.LIQ_RUNWAY, IndicatorId.DEBT_DSCR, IndicatorId.DEBT_LINE_UTIL);

    /**
     * Two findings that tell the entity the same thing waste a slot (M23 run: "DSCR below 1" and "debt not covered
     * by cash" in 20 % of the top 3). The first one ranked stays.
     */
    private static boolean redundant(Finding f, List<Finding> chosen) {
        for (Finding c : chosen) {
            if (f.id() == IndicatorId.LEV_DEBT_TO_CF && c.id() == IndicatorId.DEBT_DSCR && c.survival()) return true;
            boolean noCollections = f.variant() == Variant.NO_COLLECTIONS || f.variant() == Variant.GROWTH_COLLAPSE;
            boolean chosenNoCollections = c.variant() == Variant.NO_COLLECTIONS || c.variant() == Variant.GROWTH_COLLAPSE;
            if (noCollections && chosenNoCollections) return true;
        }
        return false;
    }

    /** The value sits on the worst anchor x of an indicator whose SQL uses it for "no base". */
    private static boolean sentinel(IndicatorState s, Params p) {
        if (!SENTINEL_WORST.contains(s.id()) || s.value() == null) return false;
        List<double[]> a = p.anchors().get(s.id());
        double[] worst = a.getFirst()[1] <= a.getLast()[1] ? a.getFirst() : a.getLast();
        return s.value() == worst[0];
    }

    /** Past the CRITICAL level of the matching early-warning alert (SPEC §8.5): always ranked first. */
    private static boolean survival(IndicatorId id, Double v, Params p) {
        if (v == null) return false;
        return switch (id) {
            case LIQ_RUNWAY -> v < p.runwayCritical();
            case DEBT_DSCR -> v < p.dscrCritical();
            case DEBT_LINE_UTIL -> v > p.lineUtilCritical();
            default -> false;
        };
    }

    private static Variant variant(IndicatorState s, Map<IndicatorId, IndicatorState> by, Params p) {
        Double v = s.value();
        return switch (s.id()) {
            case LIQ_RUNWAY -> v != null && v < p.runwayCritical() ? Variant.RUNWAY_CRITICAL
                    : v != null && v < p.runwayWarn() ? Variant.RUNWAY_LOW : Variant.LEVEL;
            case LIQ_BUFFER -> v != null && v < 1 ? Variant.BUFFER_SHORT : Variant.LEVEL;
            case LIQ_MIN_BALANCE -> v != null && v < 0 ? Variant.OVERDRAFT : Variant.LEVEL;
            case CF_NOCF_MARGIN -> {
                if (v == null || v >= 0) yield Variant.LEVEL;
                IndicatorState g = by.get(IndicatorId.ACT_COLLECTIONS_GROWTH);
                boolean growing = g != null && g.available() && g.value() != null && g.value() >= p.overtradingMinGrowth();
                yield growing ? Variant.OVERTRADING : Variant.NOCF_NEGATIVE;
            }
            case CF_IN_OUT_RATIO -> v != null && v < 1 ? Variant.IN_OUT_BELOW_ONE : Variant.LEVEL;
            case ACT_COLLECTIONS_GROWTH -> v != null && v <= p.growthCollapseBelow() ? Variant.GROWTH_COLLAPSE
                    : v != null && v < 0 ? Variant.GROWTH_DECLINE : Variant.LEVEL;
            case DEBT_DSCR -> v < 0 ? Variant.DSCR_NEGATIVE : v < p.dscrCritical() ? Variant.DSCR_BELOW_ONE
                    : v < p.dscrWarn() ? Variant.DSCR_BELOW_COVENANT : Variant.LEVEL;
            case DEBT_LINE_UTIL -> v != null && v > p.lineUtilCritical() ? Variant.LINE_EXHAUSTED : Variant.LEVEL;
            case LEV_DEBT_TO_CF -> v == null ? Variant.DEBT_NO_CF : Variant.LEVEL;
            default -> Variant.LEVEL;
        };
    }

    /**
     * Final-score points recovered if the level reached targetLevel and the trajectory came back to flat (50).
     * Mirrors ExplanationService: part = λ·w_i·(L−50)/w_avail + (1−λ)·w_i·(T−50)/w_traj, times w'_c;
     * with no trajectory in the category the level carries the whole weight.
     */
    static double points(IndicatorState s, Input in, Params p, boolean trendUsable) {
        double wc = in.categoryWeights().getOrDefault(s.category(), 0.0);
        if (wc <= 0) return 0;
        double wa = 0, wt = 0;
        for (IndicatorState o : in.indicators()) {
            if (o.category() != s.category() || !o.available()) continue;
            wa += o.weight();
            if (o.traj() != null) wt += o.weight();
        }
        if (wa <= 0) return 0;
        double gap = Math.max(0, p.targetLevel() - s.level());
        if (wt == 0) {
            return wc * s.weight() * gap / wa;
        }
        double level = in.lambda() * s.weight() * gap / wa;
        double traj = trendUsable ? (1 - in.lambda()) * s.weight() * Math.max(0, 50 - s.traj()) / wt : 0;
        return wc * (level + traj);
    }

    private static List<Finding> opportunities(Map<IndicatorId, IndicatorState> by, Params p) {
        List<Finding> out = new ArrayList<>();
        Double runway = value(by, IndicatorId.LIQ_RUNWAY);
        Double buffer = value(by, IndicatorId.LIQ_BUFFER);
        Double margin = value(by, IndicatorId.CF_NOCF_MARGIN);
        if (runway != null && buffer != null && margin != null && runway >= p.idleCashMinRunway()
                && buffer >= p.idleCashMinBuffer() && margin >= 0) {
            IndicatorState cost = by.get(IndicatorId.LEV_FUNDING_COST);
            boolean expensive = cost != null && cost.available() && cost.level() < p.problemMaxLevel();
            out.add(opportunity(IndicatorId.LIQ_BUFFER, Category.LIQUIDITY, Variant.IDLE_CASH, buffer, runway, expensive));
        }
        IndicatorState dscr = by.get(IndicatorId.DEBT_DSCR);
        Double debtToCf = value(by, IndicatorId.LEV_DEBT_TO_CF);
        if (dscr != null && dscr.available() && margin != null && margin > 0) {
            if (dscr.value() == null) {
                // No debt service in 3 months is not "no debt" (a bullet loan, an undrawn line): need zero outstanding.
                if (debtToCf != null && debtToCf == 0) out.add(opportunity(IndicatorId.DEBT_DSCR, Category.DEBT_SERVICE, Variant.NO_DEBT_CAPACITY, null, margin, false));
            } else if (dscr.value() >= p.debtCapacityMinDscr() && debtToCf != null
                    && debtToCf <= p.debtCapacityMaxDebtToCf()) {
                out.add(opportunity(IndicatorId.DEBT_DSCR, Category.DEBT_SERVICE, Variant.DEBT_CAPACITY, dscr.value(), debtToCf, false));
            }
        }
        return out;
    }

    private static Finding opportunity(IndicatorId id, Category c, Variant v, Double value, Double related, boolean flag) {
        return new Finding(id, c, Kind.OPPORTUNITY, v, Severity.INFO, false, false, null, value, null, related, flag,
                false, false);
    }

    private static Double value(Map<IndicatorId, IndicatorState> by, IndicatorId id) {
        IndicatorState s = by.get(id);
        return s == null || !s.available() ? null : s.value();
    }

    private static List<Category> missing(Input in) {
        Set<Category> available = EnumSet.noneOf(Category.class);
        in.indicators().stream().filter(IndicatorState::available).forEach(s -> available.add(s.category()));
        List<Category> out = new ArrayList<>();
        for (Category c : Category.values()) {
            if (c != Category.MOMENTUM && in.profileCategories().contains(c) && !available.contains(c)) out.add(c);
        }
        return out;
    }

    private static double factor(Severity s, Params p) {
        return switch (s) {
            case CRITICAL -> p.criticalFactor();
            case HIGH -> p.highFactor();
            default -> p.mediumFactor();
        };
    }

    /** The x whose anchor score is target, on the first segment that reaches it. null if no segment does. */
    static Double inverse(List<double[]> anchors, double target) {
        if (anchors == null) return null;
        for (int i = 1; i < anchors.size(); i++) {
            double[] a = anchors.get(i - 1), b = anchors.get(i);
            double lo = Math.min(a[1], b[1]), hi = Math.max(a[1], b[1]);
            if (target < lo || target > hi) continue;
            if (a[1] == b[1]) return a[0];
            return a[0] + (target - a[1]) / (b[1] - a[1]) * (b[0] - a[0]);
        }
        return null;
    }
}
