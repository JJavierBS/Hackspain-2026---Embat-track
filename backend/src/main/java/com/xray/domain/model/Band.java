package com.xray.domain.model;

/** Score bands (SPEC §8.3). S is the top tier, above A. Ordinal order is best to worst. */
public enum Band {
    S, A, B, C, D, E;

    public static Band of(double score, BandThresholds t) {
        if (score >= t.s()) return S;
        if (score >= t.a()) return A;
        if (score >= t.b()) return B;
        if (score >= t.c()) return C;
        if (score >= t.d()) return D;
        return E;
    }
}
