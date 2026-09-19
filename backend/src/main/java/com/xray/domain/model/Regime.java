package com.xray.domain.model;

/** SPEC §8.2: dip ("bache") vs structural change ("caída"). */
public enum Regime {
    STABLE, DIP, DIP_RECOVERED, STRUCTURAL_DECLINE, STRUCTURAL_IMPROVEMENT
}
