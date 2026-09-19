package com.xray.domain.model;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * The in-memory unit of work: one entity, every month, every indicator (ARCHITECTURE §4.2).
 * Loaded once by S30, enriched in place by later stages. A stage that works on month m reads only 0..m.
 */
public final class EntityPanel {

    private final EntityKey key;
    private final List<Month> months;
    private final Map<IndicatorId, RawIndicator[]> raw = new EnumMap<>(IndicatorId.class);
    private final Map<IndicatorId, SubScore[]> subScores = new EnumMap<>(IndicatorId.class);   // S40, S50
    private final Map<Category, CategoryScore[]> categories = new EnumMap<>(Category.class);  // S60
    private final Map<Profile, ProfileScore[]> profileScores = new EnumMap<>(Profile.class);  // S60
    private final Map<Profile, List<List<Contribution>>> contributions = new EnumMap<>(Profile.class); // S65
    private final Map<Profile, DynamicsPoint[]> dynamics = new EnumMap<>(Profile.class);                // S70
    private final List<Changepoint> changepoints = new ArrayList<>();                                  // S70

    public EntityPanel(EntityKey key, List<Month> months) {
        this.key = key;
        this.months = List.copyOf(months);
        for (IndicatorId id : IndicatorId.values()) {
            RawIndicator[] series = new RawIndicator[months.size()];
            Arrays.fill(series, RawIndicator.missing(id));
            raw.put(id, series);
            SubScore[] scores = new SubScore[months.size()];
            Arrays.fill(scores, SubScore.missing());
            subScores.put(id, scores);
        }
    }

    public EntityKey key() {
        return key;
    }

    public List<Month> months() {
        return months;
    }

    public int size() {
        return months.size();
    }

    public RawIndicator raw(IndicatorId id, int m) {
        return raw.get(id)[m];
    }

    /** The live array, indexed by month ordinal. Callers must respect causality. */
    public RawIndicator[] rawSeries(IndicatorId id) {
        return raw.get(id);
    }

    public void setRaw(int m, RawIndicator value) {
        raw.get(value.id())[m] = value;
    }

    /** The live array, indexed by month ordinal. Missing until S40 fills it. */
    public SubScore[] subScores(IndicatorId id) {
        return subScores.get(id);
    }

    public void setSubScore(IndicatorId id, int m, SubScore value) {
        subScores.get(id)[m] = value;
    }

    /** Null until S60 runs. MOMENTUM has no category series (it lives on ProfileScore). */
    public CategoryScore[] categoryScores(Category c) {
        return categories.get(c);
    }

    public void setCategoryScores(Category c, CategoryScore[] series) {
        categories.put(c, series);
    }

    /** Null until S60 runs. */
    public ProfileScore[] profileScores(Profile p) {
        return profileScores.get(p);
    }

    public void setProfileScores(Profile p, ProfileScore[] series) {
        profileScores.put(p, series);
    }

    /** One list per month ordinal, empty when final is null. Null until S65 runs. */
    public List<List<Contribution>> contributions(Profile p) {
        return contributions.get(p);
    }

    public void setContributions(Profile p, List<List<Contribution>> series) {
        contributions.put(p, series);
    }

    /** Null until S70 runs. An element is null for a month with no final score. */
    public DynamicsPoint[] dynamics(Profile p) {
        return dynamics.get(p);
    }

    public void setDynamics(Profile p, DynamicsPoint[] series) {
        dynamics.put(p, series);
    }

    public List<Changepoint> changepoints() {
        return Collections.unmodifiableList(changepoints);
    }

    public void addChangepoint(Changepoint c) {
        changepoints.add(c);
    }
}
