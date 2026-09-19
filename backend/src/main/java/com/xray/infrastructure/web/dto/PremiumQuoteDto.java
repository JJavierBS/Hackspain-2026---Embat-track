package com.xray.infrastructure.web.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/** GET /api/entities/{id}/premium (phase 5 contract item 8). */
public record PremiumQuoteDto(String month, String profile, @JsonProperty("final") double finalScore, String band,
                              boolean insurable, Double premiumRate, Double previousPremiumRate, String previousBand,
                              String tierChange, Long recommendedBuyerLimitEur) {
}
