package com.xray.alerting;

import com.xray.domain.model.AlertDirection;
import com.xray.domain.model.Severity;

/** direction is NEGATIVE (WARN or CRITICAL) or POSITIVE (INFO) — overview F13. message is Spanish UI copy. */
public record AlertSignal(Severity severity, AlertDirection direction, String message, Double value) {

    public AlertSignal {
        boolean ok = direction == AlertDirection.POSITIVE ? severity == Severity.INFO
                : direction == AlertDirection.NEGATIVE && severity != Severity.INFO;
        if (!ok) {
            throw new IllegalArgumentException("bad alert signal " + severity + " " + direction);
        }
    }

    public static AlertSignal negative(Severity severity, String message, Double value) {
        return new AlertSignal(severity, AlertDirection.NEGATIVE, message, value);
    }

    public static AlertSignal positive(String message, Double value) {
        return new AlertSignal(Severity.INFO, AlertDirection.POSITIVE, message, value);
    }
}
