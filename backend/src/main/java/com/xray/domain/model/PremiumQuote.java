package com.xray.domain.model;

/** One row of premium_quotes (overview contract item 4). buyerLimitEur is an exposure proxy (SPEC §10.2). */
public record PremiumQuote(double finalScore, Band band, boolean insurable, Double premiumRate, Double prevPremiumRate,
                           Band prevBand, Double buyerLimitEur, ChangeDirection tierChange) {
}
