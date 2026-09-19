package com.xray.application;

import java.sql.ResultSet;
import java.sql.SQLException;

/** Scores are rounded to 1 decimal at the API boundary only (CLAUDE.md conventions). */
public final class Scores {

    private Scores() {
    }

    public static Double round1(Double v) {
        return v == null ? null : Math.round(v * 10.0) / 10.0;
    }

    public static double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }

    /** Rates, factors and ratios at the API boundary. */
    public static Double round(Double v, int decimals) {
        if (v == null) return null;
        double f = Math.pow(10, decimals);
        return Math.round(v * f) / f;
    }

    /** EUR amounts are integers at the API boundary. */
    public static Long eur(Double v) {
        return v == null ? null : Math.round(v);
    }

    /** A nullable INTEGER column. */
    public static Integer integer(ResultSet rs, String column) throws SQLException {
        int v = rs.getInt(column);
        return rs.wasNull() ? null : v;
    }

    /** A nullable DOUBLE column. */
    public static Double dbl(ResultSet rs, String column) throws SQLException {
        double v = rs.getDouble(column);
        return rs.wasNull() ? null : v;
    }
}
