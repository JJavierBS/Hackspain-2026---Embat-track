package com.xray.domain.model;

import java.util.ArrayList;
import java.util.List;

/** A calendar month, printed as YYYY-MM. M00 = 2024-09 … M23 = 2026-08. */
public record Month(int year, int month) implements Comparable<Month> {

    public Month {
        if (month < 1 || month > 12) {
            throw new IllegalArgumentException("month out of range: " + month);
        }
    }

    public static Month parse(String s) {
        String[] p = s.split("-");
        if (p.length != 2) {
            throw new IllegalArgumentException("expected YYYY-MM, got " + s);
        }
        return new Month(Integer.parseInt(p[0]), Integer.parseInt(p[1]));
    }

    /** Inclusive on both ends. */
    public static List<Month> range(Month from, Month to) {
        List<Month> out = new ArrayList<>();
        for (Month m = from; m.compareTo(to) <= 0; m = m.plus(1)) {
            out.add(m);
        }
        return List.copyOf(out);
    }

    public Month plus(int n) {
        int t = year * 12 + (month - 1) + n;
        return new Month(Math.floorDiv(t, 12), Math.floorMod(t, 12) + 1);
    }

    public int monthsSince(Month other) {
        return (year * 12 + month) - (other.year * 12 + other.month);
    }

    @Override
    public int compareTo(Month o) {
        return Integer.compare(monthsSince(o), 0);
    }

    @Override
    public String toString() {
        return String.format("%04d-%02d", year, month);
    }
}
