package com.xray.alerting;

import java.text.NumberFormat;
import java.util.Locale;

/** Spanish number formatting for alert messages and triggers (UI copy, overview F17). */
public final class AlertText {

    private static final Locale ES = Locale.forLanguageTag("es-ES");

    private AlertText() {
    }

    /** NumberFormat is not thread-safe: a new instance per call. */
    public static String num(double v, int decimals) {
        NumberFormat f = NumberFormat.getNumberInstance(ES);
        f.setMinimumFractionDigits(0);
        f.setMaximumFractionDigits(decimals);
        f.setGroupingUsed(true);
        return f.format(v);
    }

    /** "120.000 €". */
    public static String eur(double v) {
        return num(Math.round(v), 0) + " €";
    }

    /** A ratio as a percentage, "23 %". */
    public static String pct(double ratio) {
        return num(ratio * 100, 0) + " %";
    }

    /** Trigger text "< 3 meses / < 1,5 meses" (WARN / CRITICAL). */
    public static String level(Thresholds.Level l, String unit, int decimals, String op) {
        String u = unit == null || unit.isEmpty() ? "" : " " + unit;
        return op + " " + num(l.warn(), decimals) + u + " / " + op + " " + num(l.critical(), decimals) + u;
    }
}
