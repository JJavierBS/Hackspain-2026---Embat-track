package com.xray.domain.model;

/** One raw indicator value for one entity-month, straight from indicator_values_raw (ARCHITECTURE §4.2). */
public record RawIndicator(
        IndicatorId id,
        Double value,        // null = not computable this month
        boolean available,
        boolean isStatic,    // snapshot-derived (SPEC §0.2 exception)
        boolean fallback) {  // e.g. ACT_COLLECTIONS_GROWTH before M14

    public static RawIndicator missing(IndicatorId id) {
        return new RawIndicator(id, null, false, false, false);
    }
}
