package com.xray.domain.model;

/** One row of lead_time_events (phase 6 contract item 3). Month ordinals; null = not detected. */
public record LeadTimeEvent(EntityKey key, Profile profile, EventType type, EventTrigger trigger,
                            int eventMonth, Integer signalMonth, Integer limitSignalMonth) {

    public Integer leadMonths() {
        return signalMonth == null ? null : eventMonth - signalMonth;
    }

    public Integer limitLeadMonths() {
        return limitSignalMonth == null ? null : eventMonth - limitSignalMonth;
    }
}
