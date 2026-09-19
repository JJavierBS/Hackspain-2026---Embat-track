package com.xray.domain.service;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AnchorInterpolatorTest {

    private static final List<double[]> RUNWAY = List.of(
            new double[]{0, 0}, new double[]{1, 20}, new double[]{3, 50}, new double[]{6, 75}, new double[]{12, 100});
    private static final List<double[]> DSCR = List.of(
            new double[]{0.8, 0}, new double[]{1.0, 30}, new double[]{1.25, 60}, new double[]{2.0, 85}, new double[]{3.0, 100});
    private static final List<double[]> DSO = List.of(     // lower is better
            new double[]{30, 100}, new double[]{60, 70}, new double[]{90, 40}, new double[]{150, 0});

    @Test
    void interpolatesBetweenAnchors() {
        assertEquals(35.0, AnchorInterpolator.score(2.0, RUNWAY), 1e-9);
        assertEquals(10.0, AnchorInterpolator.score(0.5, RUNWAY), 1e-9);
        assertEquals(85.0, AnchorInterpolator.score(45.0, DSO), 1e-9);
    }

    @Test
    void hitsAnchorsExactly() {
        assertEquals(50.0, AnchorInterpolator.score(3.0, RUNWAY), 1e-9);
        assertEquals(60.0, AnchorInterpolator.score(1.25, DSCR), 1e-9);
    }

    @Test
    void neverExtrapolatesBelowFirstOrAboveLast() {
        assertEquals(0.0, AnchorInterpolator.score(0.3, DSCR), 1e-9);     // ARCHITECTURE §4.3 example
        assertEquals(0.0, AnchorInterpolator.score(-5.0, RUNWAY), 1e-9);
        assertEquals(100.0, AnchorInterpolator.score(30.0, RUNWAY), 1e-9);
        assertEquals(100.0, AnchorInterpolator.score(10.0, DSO), 1e-9);
        assertEquals(0.0, AnchorInterpolator.score(400.0, DSO), 1e-9);
    }

    @Test
    void resultIsAlwaysWithin0And100() {
        for (double x = -10; x <= 200; x += 0.37) {
            double s = AnchorInterpolator.score(x, DSO);
            assertTrue(s >= 0 && s <= 100, "x=" + x + " -> " + s);
        }
    }

    @Test
    void rejectsNaNAndShortAnchorLists() {
        assertThrows(IllegalArgumentException.class, () -> AnchorInterpolator.score(Double.NaN, RUNWAY));
        assertThrows(IllegalArgumentException.class, () -> AnchorInterpolator.score(1, List.of(new double[]{0, 0})));
    }
}
