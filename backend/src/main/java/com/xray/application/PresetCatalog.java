package com.xray.application;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xray.config.ScoringConfig;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Client presets of the Algorithm page (presets.yml, docs/PRESETS.md). A preset is a list of config values
 * with their evidence. The page loads it into the draft; the normal save validates and applies it.
 * The constructor applies every preset to the shipped config and runs the boot checks, so a bad preset
 * stops the boot like a bad scoring-config.yml.
 */
@Service
public class PresetCatalog {

    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {
    };

    private final Map<String, Object> catalog;

    public PresetCatalog(AlgorithmConfigUseCase configs, ObjectMapper json) {
        this.catalog = load();
        Map<String, Object> shipped = configs.view().defaults();
        Map<?, ?> sources = (Map<?, ?>) catalog.get("sources");
        for (Object p : (List<?>) catalog.get("presets")) {
            Map<?, ?> preset = (Map<?, ?>) p;
            String id = String.valueOf(preset.get("id"));
            Map<String, Object> merged = json.convertValue(shipped, MAP);
            for (Object c : (List<?>) preset.get("changes")) {
                Map<?, ?> change = (Map<?, ?>) c;
                String path = String.valueOf(change.get("path"));
                String section = path.split("\\.")[0];
                if (!AlgorithmConfigUseCase.EDITABLE.contains(section)) {
                    throw fail(id, path + " is not in an editable section");
                }
                setIn(merged, path, change.get("value"), id);
                for (Object s : (List<?>) change.get("sources")) {
                    if (!sources.containsKey(s)) throw fail(id, "unknown source " + s);
                }
            }
            try {
                json.convertValue(merged, ScoringConfig.class);
            } catch (IllegalArgumentException e) {
                throw fail(id, "gives an invalid config: " + e.getMessage());
            }
        }
    }

    public Map<String, Object> catalog() {
        return catalog;
    }

    @SuppressWarnings("unchecked")
    private static void setIn(Map<String, Object> tree, String path, Object value, String id) {
        String[] keys = path.split("\\.");
        Map<String, Object> node = tree;
        for (int i = 0; i < keys.length - 1; i++) {
            if (!(node.get(keys[i]) instanceof Map<?, ?> next)) {
                throw fail(id, path + " does not name a config value");
            }
            node = (Map<String, Object>) next;
        }
        if (!node.containsKey(keys[keys.length - 1])) {
            throw fail(id, path + " does not name a config value");
        }
        node.put(keys[keys.length - 1], value);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> load() {
        try (InputStream in = new ClassPathResource("presets.yml").getInputStream()) {
            Map<String, Object> raw = new Yaml().load(in);
            if (raw == null || !(raw.get("presets") instanceof List<?>) || !(raw.get("sources") instanceof Map<?, ?>)) {
                throw new IllegalStateException("Invalid presets.yml: needs 'sources' and 'presets'");
            }
            Map<String, Object> out = new LinkedHashMap<>(raw);
            out.put("presets", new ArrayList<>((List<Object>) raw.get("presets")));
            return out;
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read presets.yml", e);
        }
    }

    private static IllegalStateException fail(String id, String message) {
        return new IllegalStateException("Invalid presets.yml: preset " + id + " " + message);
    }
}
