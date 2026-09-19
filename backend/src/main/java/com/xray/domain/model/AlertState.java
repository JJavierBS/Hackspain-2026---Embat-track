package com.xray.domain.model;

/** One row of alert_states: a signal active at that month (overview contract item 6). month is the ordinal. */
public record AlertState(EntityKey key, int month, Profile profile, String code, Severity severity,
                         AlertDirection direction, Double value) {
}
