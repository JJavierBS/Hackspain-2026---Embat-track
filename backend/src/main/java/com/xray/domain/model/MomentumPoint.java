package com.xray.domain.model;

/** One row of momentum_screen (overview contract item 5). Percentiles are display only (decision F10). */
public record MomentumPoint(int rank, int of, Integer trajPercentile, Integer growthPercentile, boolean risingStar) {
}
