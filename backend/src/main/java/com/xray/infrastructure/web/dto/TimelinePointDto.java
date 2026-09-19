package com.xray.infrastructure.web.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record TimelinePointDto(String month, @JsonProperty("final") Double finalScore, Double level, Double traj,
                               String band, String status, String regime) {
}
