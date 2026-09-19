package com.xray.infrastructure.web.dto;

import java.util.List;

/**
 * A what-if score of one entity: base = the active config, tuned = with the sector and/or the draft.
 * profiles, categories and indicators are at `month`; series is the final score of `profile` over all months.
 * indicators lists the indicators whose anchors or weight differ, plus every indicator of the chosen sector
 * (a change the reader turned off still shows the entity's value).
 */
public record TuningDto(
        String entityId,
        String entityType,
        String month,
        String profile,
        SectorRef sector,
        boolean draftApplied,
        List<ProfileRow> profiles,
        List<SeriesPoint> series,
        List<CategoryRow> categories,
        List<IndicatorRow> indicators) {

    /** applied = the indicators of the sector whose anchors this result uses. */
    public record SectorRef(String id, String name, List<String> applied) {
    }

    public record Point(Double finalScore, Double level, Double traj, String band) {
    }

    public record ProfileRow(String profile, Point base, Point tuned) {
    }

    public record SeriesPoint(String month, Double base, Double tuned) {
    }

    public record CategoryRow(String category, double baseWeight, double tunedWeight, Double baseLevel,
                              Double tunedLevel) {
    }

    public record IndicatorRow(String indicator, String category, boolean available, Double value,
                               Double baseLevel, Double tunedLevel, List<List<Double>> baseAnchors,
                               List<List<Double>> tunedAnchors) {
    }
}
