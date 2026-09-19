package com.xray.config;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.springframework.stereotype.Component;
import org.springframework.util.DigestUtils;

import java.nio.charset.StandardCharsets;

/**
 * MD5 of the effective scoring config, with keys sorted. Two configs with the same values give the same
 * hash, whatever file they came from. pipeline_runs stores it, so a boot can tell when the data is stale.
 */
@Component
public class ConfigFingerprint {

    private final ObjectMapper sorted;

    public ConfigFingerprint(ObjectMapper json) {
        this.sorted = json.copy()
                .configure(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY, true)
                .configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true);
    }

    public String of(ScoringConfig config) {
        try {
            return DigestUtils.md5DigestAsHex(sorted.writeValueAsString(config).getBytes(StandardCharsets.UTF_8));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Cannot serialize the scoring config", e);
        }
    }
}
