package com.xray.alerting;

import com.xray.domain.model.Severity;

import java.util.Optional;

/** WARN / CRITICAL comparisons shared by the state rules. Null input → no signal (missing ≠ zero). */
public final class Thresholds {

    private Thresholds() {
    }

    /** One threshold pair, mapped by each rule from its config (alerting/ does not import config). */
    public record Level(double warn, double critical) {
    }

    /** CRITICAL when v < level.critical(), WARN when v < level.warn(), else empty. Null v → empty. */
    public static Optional<Severity> below(Double v, Level level) {
        if (v == null) return Optional.empty();
        if (v < level.critical()) return Optional.of(Severity.CRITICAL);
        if (v < level.warn()) return Optional.of(Severity.WARN);
        return Optional.empty();
    }

    /** CRITICAL when v > level.critical(), WARN when v > level.warn(), else empty. Null v → empty. */
    public static Optional<Severity> above(Double v, Level level) {
        if (v == null) return Optional.empty();
        if (v > level.critical()) return Optional.of(Severity.CRITICAL);
        if (v > level.warn()) return Optional.of(Severity.WARN);
        return Optional.empty();
    }
}
