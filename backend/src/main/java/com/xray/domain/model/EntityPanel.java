package com.xray.domain.model;

import java.util.Arrays;
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

    public EntityPanel(EntityKey key, List<Month> months) {
        this.key = key;
        this.months = List.copyOf(months);
        for (IndicatorId id : IndicatorId.values()) {
            RawIndicator[] series = new RawIndicator[months.size()];
            Arrays.fill(series, RawIndicator.missing(id));
            raw.put(id, series);
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
}
