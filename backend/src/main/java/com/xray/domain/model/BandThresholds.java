package com.xray.domain.model;

/** Lower bounds of bands S..D (SPEC §8.3). Below d is E. */
public record BandThresholds(double s, double a, double b, double c, double d) {
}
