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

    /** A nullable DOUBLE column. */
    public static Double dbl(ResultSet rs, String column) throws SQLException {
        double v = rs.getDouble(column);
        return rs.wasNull() ? null : v;
    }
}
