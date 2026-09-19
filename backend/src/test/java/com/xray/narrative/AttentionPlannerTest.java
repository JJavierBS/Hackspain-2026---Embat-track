package com.xray.narrative;

import com.xray.infrastructure.web.dto.SuggestionsDto.Evidence;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class AttentionPlannerTest {
    private final AttentionPlanner planner = new AttentionPlanner();

    private Evidence evidence(String id, double value, double level, double weight) {
        return new Evidence("2026-07:" + id, id, "2026-07", value, level, 40.0, weight,
                false, false, "CLOSED", "");
    }

    @Test
    void recommendationsDifferWithObservedProblems() {
        var cash = planner.plan(List.of(evidence("CF_IN_OUT_RATIO", .43, 10, .2)), "2026-07");
        var payments = planner.plan(List.of(evidence("PAY_SUPPLIER_LATENESS", 29, 47, .2)), "2026-07");
        assertEquals("review_operating_costs", cash.getFirst().id());
        assertEquals("review_supplier_payments", payments.getFirst().id());
        assertNull(cash.getFirst().impactoCalculado());
    }

    @Test
    void missingSaturatedZeroWeightAndFutureEvidenceDoNotBecomeProblems() {
        assertTrue(planner.plan(List.of(), "2026-07").isEmpty());
        assertTrue(planner.plan(List.of(evidence("CF_IN_OUT_RATIO", 1.5, 100, .2)), "2026-07").isEmpty());
        assertTrue(planner.plan(List.of(evidence("PAY_SUPPLIER_LATENESS", 30, 45, 0)), "2026-07").isEmpty());
        assertTrue(planner.plan(List.of(evidence("PAY_SUPPLIER_LATENESS", 30, 100, .2)), "2026-07").isEmpty());
        assertTrue(planner.plan(List.of(evidence("PAY_SUPPLIER_LATENESS", 30, 45, .2)), "2026-06").isEmpty());
    }

    @Test
    void effectiveWeightDeterminesAttentionNotClaimedImpact() {
        var items = planner.plan(List.of(evidence("CF_IN_OUT_RATIO", .4, 10, .1),
                evidence("PAY_SUPPLIER_LATENESS", 20, 60, .3)), "2026-07");
        assertEquals("review_supplier_payments", items.getFirst().id());
        assertTrue(items.stream().allMatch(i -> i.impactoCalculado() == null));
        assertTrue(items.stream().allMatch(i -> i.text().split("\\s+").length <= 25));
    }

    @Test
    void overlappingActionsAreNotRepeatedAndNoMoreThanThreeSurvive() {
        var items = planner.plan(List.of(evidence("PAY_SUPPLIER_LATENESS", 20, 60, .3),
                evidence("PAY_OVERDUE_PAYABLES", .2, 55, .2),
                evidence("CF_IN_OUT_RATIO", .4, 10, .1),
                evidence("DEL_OVERDUE_RECEIVABLES", .2, 55, .1),
                evidence("ACT_COLLECTIONS_GROWTH", -.2, 20, .1)), "2026-07");
        assertEquals(3, items.size());
        assertEquals(1, items.stream().filter(i -> i.id().equals("review_supplier_payments")).count());
    }

    @Test
    void improvingTrajectoryDoesNotEraseAnObservedProblem() {
        var e = new Evidence("2026-07:CF_IN_OUT_RATIO", "CF_IN_OUT_RATIO", "2026-07", .8, 10.0,
                90.0, .2, false, false, "PENDING", "ratio");
        assertEquals(1, planner.plan(List.of(e), "2026-07").size());
    }
}
