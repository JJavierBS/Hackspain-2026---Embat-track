package com.xray.domain.service;

/** Window indices for month ordinal m. Every Java stage that walks months uses this (ARCHITECTURE §4.4). */
public interface CausalWindow {

    /** Returns indices [start, m] for a window of `size` months ending at m. */
    static int[] window(int m, int size) {
        return new int[]{Math.max(0, m - size + 1), m};
    }
}
