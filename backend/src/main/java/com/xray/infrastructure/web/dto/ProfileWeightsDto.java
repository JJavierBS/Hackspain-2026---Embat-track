package com.xray.infrastructure.web.dto;

import java.util.Map;

public record ProfileWeightsDto(String profile, double lambda, Map<String, Double> weights) {
}
