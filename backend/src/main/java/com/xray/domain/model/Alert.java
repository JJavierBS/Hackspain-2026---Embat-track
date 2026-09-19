package com.xray.domain.model;

/** One row of alerts: a transition (overview contract item 6, decision F12). month is the ordinal. */
public record Alert(EntityKey key, int month, Profile profile, String code, Severity severity,
                    AlertDirection direction, String message, Double value) {
}
