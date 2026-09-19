package com.xray.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.nio.file.Path;

@ConfigurationProperties(prefix = "xray")
public record XRayProperties(
        @DefaultValue("../data") String dataDir,
        @DefaultValue("false") boolean demoMode,
        /** DuckDB memory_limit, e.g. "128MB". Empty keeps the DuckDB default (80% of the RAM it sees). */
        @DefaultValue("") String duckdbMemoryLimit,
        /** DuckDB threads. 0 keeps the DuckDB default (one per core it detects). */
        @DefaultValue("0") int duckdbThreads) {

    public Path dataPath() {
        return Path.of(dataDir).toAbsolutePath().normalize();
    }

    public Path rawPath() {
        return dataPath().resolve("raw");
    }
}
