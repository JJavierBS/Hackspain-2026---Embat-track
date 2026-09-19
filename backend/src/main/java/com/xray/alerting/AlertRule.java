package com.xray.alerting;

import com.xray.domain.model.AlertDirection;

import java.util.Optional;

/**
 * One early-warning indicator (SPEC §8.5). A pure predicate: it never deals with transitions,
 * AlertEngine does (overview F12). One class per code in alerting/rules/. Extension point #2 (ARCHITECTURE §8.2).
 */
public interface AlertRule {

    String code();

    /** NEGATIVE, POSITIVE or BOTH. Each signal carries its own NEGATIVE or POSITIVE direction. */
    AlertDirection direction();

    /** Event rules emit every month the predicate holds (band changes, limit actions). */
    default boolean event() {
        return false;
    }

    /** Spanish trigger text for /api/methodology, built from the config, e.g. "< 3 meses / < 1,5 meses". */
    String trigger();

    Optional<AlertSignal> evaluate(EntityMonthView view);
}
