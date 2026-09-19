package com.xray.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.xray.config.ConfigFingerprint;
import com.xray.config.ScoringConfig;
import com.xray.config.SuggestionsProperties;
import com.xray.infrastructure.duckdb.DuckDbDataSource;
import com.xray.infrastructure.web.dto.SuggestionsDto;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.ConfigurationPropertySources;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class SuggestionStoreTest {
    @Test
    void cacheIsScopedAndInvalidatesOnRunConfigModelAndMonth() throws Exception {
        var sources = new YamlPropertySourceLoader().load("scoring", new ClassPathResource("scoring-config.yml"));
        var config = new Binder(ConfigurationPropertySources.from(sources)).bind("scoring", ScoringConfig.class).get();
        var json = new ObjectMapper();
        var fingerprint = new ConfigFingerprint(json);
        try (var ds = new DuckDbDataSource("jdbc:duckdb:")) {
            var jdbc = new JdbcTemplate(ds);
            jdbc.execute("CREATE TABLE pipeline_runs(run_id VARCHAR, config_hash VARCHAR, finished_at TIMESTAMP)");
            jdbc.update("INSERT INTO pipeline_runs VALUES ('run1', ?, current_timestamp)", fingerprint.of(config));
            var props = new SuggestionsProperties("glm5.3", List.of("GROUP_0039"), "2026-07");
            var store = new SuggestionStore(jdbc, json, config, fingerprint, props);
            assertEquals("NOT_PREPARED", store.read("GROUP", "GROUP_0039", "BANK", "2026-07").state());
            store.initialize();
            var value = new SuggestionsDto("suggestions.v3", "atencion", "READY", "template", "run1", null, "now", "limit", List.of());
            store.save(List.of(new SuggestionStore.Entry(new SuggestionStore.Key("GROUP", "GROUP_0039", "2026-07", "BANK"), value)), store.currentRun());
            assertEquals("READY", store.read("GROUP", "GROUP_0039", "BANK", "2026-07").state());
            assertEquals("NOT_PREPARED", store.read("GROUP", "GROUP_0039", "FUND", "2026-07").state());
            assertEquals("NOT_PREPARED", store.read("GROUP", "GROUP_0039", "BANK", "2026-06").state());
            assertEquals("NOT_PREPARED", store.read("COMPANY", "GROUP_0039", "BANK", "2026-07").state());
            var changedModel = new SuggestionStore(jdbc, json, config, fingerprint,
                    new SuggestionsProperties("deepseek-v4-flash", List.of(), "2026-07"));
            assertEquals("NOT_PREPARED", changedModel.read("GROUP", "GROUP_0039", "BANK", "2026-07").state());
            jdbc.update("UPDATE pipeline_runs SET run_id='run2'");
            assertEquals("NOT_PREPARED", store.read("GROUP", "GROUP_0039", "BANK", "2026-07").state());
            jdbc.update("UPDATE pipeline_runs SET config_hash='unapplied'");
            assertEquals("CONFIG_MISMATCH", store.read("GROUP", "GROUP_0039", "BANK", "2026-07").state());
        }
    }
}
