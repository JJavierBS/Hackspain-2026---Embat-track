package com.xray.narrative;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.xray.infrastructure.web.dto.SuggestionsDto.Evidence;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;

public final class AttentionPlanner {
    public static final String VERSION = "attention-1";
    private final List<Rule> rules;

    public record Rule(String id, String indicator, Double below, Double above, String unit, List<String> texts) {}
    public record Candidate(String id, String text, List<String> allowedTexts, Evidence evidence, Double impactoCalculado) {}

    public AttentionPlanner() {
        try (var in = AttentionPlanner.class.getResourceAsStream("/suggestions-catalog.json")) {
            if (in == null) throw new IllegalStateException("Falta el catálogo de sugerencias");
            rules = List.of(new ObjectMapper().readValue(in, Rule[].class));
        } catch (IOException e) {
            throw new IllegalStateException("Catálogo de sugerencias inválido", e);
        }
    }

    public List<Candidate> plan(List<Evidence> evidence, String month) {
        List<Candidate> candidates = new ArrayList<>();
        for (Evidence e : evidence) {
            if (!month.equals(e.month()) || e.value() == null || !Double.isFinite(e.value()) || e.level() == null
                    || !Double.isFinite(e.level()) || e.level() >= 100 || e.isStatic()
                    || !Double.isFinite(e.effectiveWeight()) || e.effectiveWeight() <= 0) continue;
            for (Rule r : rules) {
                if (!r.indicator().equals(e.indicatorId())) continue;
                if (r.below() != null && e.value() >= r.below()) continue;
                if (r.above() != null && e.value() <= r.above()) continue;
                var measured = new Evidence(e.ref(), e.indicatorId(), e.month(), e.value(), e.level(), e.trajectory(),
                        e.effectiveWeight(), e.isStatic(), e.fallback(), e.anchorStatus(), r.unit());
                candidates.add(new Candidate(r.id(), r.texts().getFirst(), r.texts(), measured, null));
            }
        }
        candidates.sort(Comparator.<Candidate>comparingDouble(c -> c.evidence().effectiveWeight()).reversed()
                .thenComparingDouble(c -> c.evidence().level()).thenComparing(Candidate::id)
                .thenComparing(c -> c.evidence().indicatorId()));
        var seen = new HashSet<String>();
        return candidates.stream().filter(c -> seen.add(c.id())).limit(3).toList();
    }
}
