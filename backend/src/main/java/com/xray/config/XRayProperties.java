package com.xray.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.nio.file.Path;

@ConfigurationProperties(prefix = "xray")
public record XRayProperties(
        @DefaultValue("../data") String dataDir,
        @DefaultValue("false") boolean demoMode) {

    public Path dataPath() {
        return Path.of(dataDir).toAbsolutePath().normalize();
    }

    public Path rawPath() {
        return dataPath().resolve("raw");
    }
}
