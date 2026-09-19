package com.xray.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

@ConfigurationProperties("xray.suggestions")
public record SuggestionsProperties(String model, List<String> entityIds, String month) {}
