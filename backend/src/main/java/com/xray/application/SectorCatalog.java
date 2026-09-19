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
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Sector presets of the per-entity tuning (sectors.yml, docs/SECTOR_PRESETS.md). A sector is a list of anchor
 * changes with their evidence. It never changes a weight: the constructor refuses any path other than
 * indicators.&lt;ID&gt;.anchors, applies each sector to the shipped config and runs the boot checks, so a bad sector
 * stops the boot like a bad scoring-config.yml.
 */
@Service
public class SectorCatalog {

    private static final Pattern ANCHORS_ONLY = Pattern.compile("indicators\\.[A-Z0-9_]+\\.anchors");
    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {
    };

    private final Map<String, Object> catalog;
    private final Map<String, Map<?, ?>> byId = new LinkedHashMap<>();

    public SectorCatalog(AlgorithmConfigUseCase configs, ObjectMapper json) {
        this.catalog = load();
        Map<String, Object> shipped = configs.view().defaults();
        Map<?, ?> sources = (Map<?, ?>) catalog.get("sources");
        for (Object s : (List<?>) catalog.get("sectors")) {
            Map<?, ?> sector = (Map<?, ?>) s;
            String id = String.valueOf(sector.get("id"));
            if (byId.put(id, sector) != null) throw fail(id, "is defined twice");
            Map<String, Object> tree = json.convertValue(shipped, MAP);
            for (Object c : (List<?>) sector.get("changes")) {
                Map<?, ?> change = (Map<?, ?>) c;
                String path = String.valueOf(change.get("path"));
                if (!ANCHORS_ONLY.matcher(path).matches()) {
                    throw fail(id, path + " is not an indicator anchor list: a sector changes anchors only");
                }
                if (!ConfigPaths.set(tree, path, change.get("value"))) {
                    throw fail(id, path + " does not name a config value");
                }
                checkSources(id, change.get("sources"), sources);
            }
            Object notes = sector.get("notes");
            if (notes instanceof List<?> list) {
                for (Object n : list) checkSources(id, ((Map<?, ?>) n).get("sources"), sources);
            }
            try {
                json.convertValue(tree, ScoringConfig.class);
            } catch (IllegalArgumentException e) {
                throw fail(id, "gives an invalid config: " + e.getMessage());
            }
        }
    }

    public Map<String, Object> catalog() {
        return catalog;
    }

    /** The sector with this id, or BadRequestException. */
    public Map<?, ?> find(String id) {
        Map<?, ?> sector = byId.get(id);
        if (sector == null) throw new BadRequestException("Unknown sector " + id + ". Known: " + byId.keySet());
        return sector;
    }

    /** The indicator ids whose anchors the sector changes. */
    public List<String> indicators(String id) {
        List<String> out = new ArrayList<>();
        for (Object c : (List<?>) find(id).get("changes")) {
            out.add(String.valueOf(((Map<?, ?>) c).get("path")).split("\\.")[1]);
        }
        return out;
    }

    /**
     * Applies the sector's anchor changes to a config tree (the shape of GET /api/config). only = the indicator ids
     * to apply, null for all. Returns the indicator ids applied. An id that the sector does not change is refused.
     */
    public List<String> applyTo(Map<String, Object> tree, String id, Collection<String> only) {
        List<String> known = new ArrayList<>();
        List<String> applied = new ArrayList<>();
        for (Object c : (List<?>) find(id).get("changes")) {
            Map<?, ?> change = (Map<?, ?>) c;
            String path = String.valueOf(change.get("path"));
            String indicator = path.split("\\.")[1];
            known.add(indicator);
            if (only != null && !only.contains(indicator)) continue;
            ConfigPaths.set(tree, path, change.get("value"));
            applied.add(indicator);
        }
        if (only != null) {
            for (String o : only) {
                if (!known.contains(o)) throw new BadRequestException("Sector " + id + " does not change " + o + ". It changes " + known);
            }
        }
        return applied;
    }

    private static void checkSources(String id, Object ids, Map<?, ?> sources) {
        if (!(ids instanceof List<?> list) || list.isEmpty()) throw fail(id, "has a value or a note with no source");
        for (Object s : list) {
            if (!sources.containsKey(s)) throw fail(id, "names unknown source " + s);
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> load() {
        try (InputStream in = new ClassPathResource("sectors.yml").getInputStream()) {
            Map<String, Object> raw = new Yaml().load(in);
            if (raw == null || !(raw.get("sectors") instanceof List<?>) || !(raw.get("sources") instanceof Map<?, ?>)) {
                throw new IllegalStateException("Invalid sectors.yml: needs 'sources' and 'sectors'");
            }
            return new LinkedHashMap<>(raw);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read sectors.yml", e);
        }
    }

    private static IllegalStateException fail(String id, String message) {
        return new IllegalStateException("Invalid sectors.yml: sector " + id + " " + message);
    }
}
