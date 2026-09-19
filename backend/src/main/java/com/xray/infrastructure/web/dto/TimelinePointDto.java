package com.xray.infrastructure.web.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * limitEur / limitAction come from the limit profile and premiumRate / buyerLimitEur from the premium profile,
 * whatever ?profile is. newAlerts = alerts fired that month in ?profile (phase 5 contract item 8).
 */
public record TimelinePointDto(String month, @JsonProperty("final") Double finalScore, Double level, Double traj,
                               String band, String status, String regime, Long limitEur, String limitAction,
                               Double premiumRate, Long buyerLimitEur, int newAlerts) {
}
