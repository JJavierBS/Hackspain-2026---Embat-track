package com.xray.application;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xray.config.ConfigFingerprint;
import com.xray.config.ScoringConfig;
import com.xray.config.XRayProperties;
import com.xray.infrastructure.duckdb.PipelineRunRepository;
import com.xray.infrastructure.web.dto.AlgorithmConfigDto;
import com.xray.pipeline.PipelineStatus;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.ConfigurationPropertySources;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.DumperOptions;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Reads and writes the expert overrides of scoring-config.yml (the Algorithm page).
 * The overrides live in data/scoring-overrides.yml, which application.yml imports after the shipped file.
 * A save validates the merged config with the same checks as the boot, writes only the sections that differ
 * from the shipped defaults, and asks for a restart: the new context binds the file and re-runs the pipeline.
 */
@Service
public class AlgorithmConfigUseCase {

    public static final String OVERRIDES_FILE = "scoring-overrides.yml";

    /**
     * Sections the expert may change. Data semantics (flow classes, FX, CSV rules), the unit, the month range
     * and the band cut-offs stay read-only: the UI draws the band ladder with fixed cut-offs.
     */
    static final List<String> EDITABLE = List.of(
            "profiles", "indicators", "trajectory", "regimes", "statuses", "confidence", "momentum",
            "debtDscr", "levDebtToCf", "concentration", "windows", "taxRegularity", "runwayCapMonths",
            "limitEngine", "insurer", "products", "alerts", "leadTime", "showcase", "forecast", "explanation");

    /** Sections whose entries merge key by key across property sources, so only changed entries are written. */
    private static final List<String> ENTRY_MAPS = List.of("profiles", "indicators");

    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {
    };

    private final String bootId = UUID.randomUUID().toString();
    private final ScoringConfig config;
    private final XRayProperties props;
    private final PipelineRunRepository runs;
    private final PipelineStatus status;
    private final ConfigFingerprint fingerprint;
    private final ObjectMapper json;
    private final Map<String, Object> defaults;

    public AlgorithmConfigUseCase(ScoringConfig config, XRayProperties props, PipelineRunRepository runs,
                                  PipelineStatus status, ConfigFingerprint fingerprint, ObjectMapper json) {
        this.config = config;
        this.props = props;
        this.runs = runs;
        this.status = status;
        this.fingerprint = fingerprint;
        this.json = json;
        this.defaults = json.convertValue(shippedDefaults(), MAP);
    }

    public AlgorithmConfigDto view() {
        boolean applied = fingerprint.of(config).equals(runs.lastConfigHash());
        // The draft is always editable. Only a save (and so a pipeline run) needs a server that may recalculate.
        return new AlgorithmConfigDto(bootId, true, !props.demoMode(), Files.exists(overridesPath()), applied,
                EDITABLE, json.convertValue(config, MAP), defaults);
    }

    /** The active config as a tree, with the editable sections of a draft on top. Nothing is saved. */
    public Map<String, Object> mergedTree(Map<String, Object> incoming) {
        Map<String, Object> merged = json.convertValue(config, MAP);
        if (incoming != null) {
            for (String key : EDITABLE) {
                if (incoming.containsKey(key)) {
                    merged.put(key, incoming.get(key));
                }
            }
        }
        return merged;
    }

    /** A config tree to a validated ScoringConfig, or BadRequestException with the validator message. */
    public ScoringConfig toConfig(Map<String, Object> tree) {
        try {
            return json.convertValue(tree, ScoringConfig.class);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException(rootMessage(e));
        }
    }

    /**
     * Validates and writes the overrides. Returns the sections that now differ from the shipped defaults.
     * The caller restarts the context afterwards.
     */
    public List<String> save(Map<String, Object> incoming) {
        refuseWhenLocked();
        ScoringConfig candidate = toConfig(mergedTree(incoming));
        Map<String, Object> diff = diffFromDefaults(json.convertValue(candidate, MAP));
        try {
            if (diff.isEmpty()) {
                Files.deleteIfExists(overridesPath());
            } else {
                Files.createDirectories(overridesPath().getParent());
                Files.writeString(overridesPath(), header() + yaml().dump(Map.of("scoring", diff)));
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot write " + overridesPath(), e);
        }
        return List.copyOf(diff.keySet());
    }

    /** Deletes the overrides, so the next context runs on the shipped scoring-config.yml. */
    public void reset() {
        refuseWhenLocked();
        try {
            Files.deleteIfExists(overridesPath());
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot delete " + overridesPath(), e);
        }
    }

    private void refuseWhenLocked() {
        if (props.demoMode()) {
            throw new ConflictException("Demo mode serves precomputed data: a draft can be previewed on one entity, but not applied.");
        }
        if (status.snapshot().state() == PipelineStatus.State.RUNNING) {
            throw new ConflictException("The pipeline is running. Wait for it to finish, then save again.");
        }
    }

    private Map<String, Object> diffFromDefaults(Map<String, Object> candidate) {
        Map<String, Object> diff = new LinkedHashMap<>();
        for (String key : EDITABLE) {
            Object value = candidate.get(key);
            Object shipped = defaults.get(key);
            if (Objects.equals(value, shipped)) {
                continue;
            }
            if (ENTRY_MAPS.contains(key) && value instanceof Map<?, ?> entries && shipped instanceof Map<?, ?> base) {
                Map<Object, Object> changed = new LinkedHashMap<>();
                entries.forEach((k, v) -> {
                    if (!Objects.equals(v, base.get(k))) changed.put(k, v);
                });
                diff.put(key, changed);
            } else {
                diff.put(key, value);
            }
        }
        dropNulls(diff);
        return diff;
    }

    /** A null in the YAML would bind as an empty value, not as "absent": leave the key out instead. */
    @SuppressWarnings("unchecked")
    private static void dropNulls(Map<?, ?> map) {
        Iterator<? extends Map.Entry<?, ?>> it = map.entrySet().iterator();
        while (it.hasNext()) {
            Object v = it.next().getValue();
            if (v == null) {
                it.remove();
            } else if (v instanceof Map<?, ?> m) {
                dropNulls(m);
            } else if (v instanceof List<?> l) {
                l.forEach(item -> {
                    if (item instanceof Map<?, ?> m) dropNulls(m);
                });
            }
        }
    }

    private ScoringConfig shippedDefaults() {
        try {
            var sources = new YamlPropertySourceLoader().load("shipped", new ClassPathResource("scoring-config.yml"));
            return new Binder(ConfigurationPropertySources.from(sources))
                    .bind("scoring", Bindable.of(ScoringConfig.class))
                    .orElseThrow(() -> new IllegalStateException("scoring-config.yml has no scoring key"));
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read scoring-config.yml", e);
        }
    }

    private Path overridesPath() {
        return props.dataPath().resolve(OVERRIDES_FILE);
    }

    private static Yaml yaml() {
        DumperOptions options = new DumperOptions();
        options.setDefaultFlowStyle(DumperOptions.FlowStyle.BLOCK);
        options.setIndent(2);
        return new Yaml(options);
    }

    private static String header() {
        return """
                # Written by the Algorithm page (PUT /api/config). Overrides backend scoring-config.yml.
                # Only the sections that differ from the shipped defaults are here. Delete this file to go back.
                """;
    }

    private static String rootMessage(Throwable e) {
        Throwable t = e;
        while (t.getCause() != null && t.getCause() != t) {
            t = t.getCause();
        }
        return String.valueOf(t.getMessage());
    }
}
