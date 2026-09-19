package com.xray.domain.model;

/** One row of lead_time_signals (phase 6 contract item 4): a signal onset and whether an event followed. */
public record LeadTimeSignal(EntityKey key, Profile profile, EventType type, int month,
                             boolean evaluable, boolean followed) {
}
