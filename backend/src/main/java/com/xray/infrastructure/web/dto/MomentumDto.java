package com.xray.infrastructure.web.dto;

/** Momentum screen at one month (phase 5 contract item 8). Percentiles are display only (decision F10). */
public record MomentumDto(String month, String profile, int rank, int of, Integer trajPercentile,
                          Integer growthPercentile, boolean risingStar) {
}
