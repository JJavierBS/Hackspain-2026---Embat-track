package com.xray.config;

import com.xray.domain.model.Category;

import java.util.Map;

/** lambda = level share of the blend; weights sum to 100 (validated at boot). */
public record ProfileConfig(double lambda, Map<Category, Double> weights) {
}
