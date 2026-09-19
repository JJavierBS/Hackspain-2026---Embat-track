package com.xray.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties(prefix = "helmcode")
public record HelmcodeProperties(
        @DefaultValue("https://api.helmcode.com/v1") String baseUrl,
        @DefaultValue("qwen3.6") String model,
        @DefaultValue("") String apiKey,
        @DefaultValue("false") boolean enabled) {
}
