package com.xray.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.xray.config.ConfigFingerprint;
import com.xray.config.ScoringConfig;
import com.xray.config.SuggestionsProperties;
import com.xray.infrastructure.web.dto.SuggestionsDto;
import com.xray.narrative.AttentionPlanner;
import com.xray.narrative.HelmcodeSuggestionRenderer;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;

@Service
public class SuggestionStore {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final String activeConfig;
    private final String signature;

    public record Key(String type, String id, String month, String profile) {}
    public record Run(String id, String configHash) {}
    public record Entry(Key key, SuggestionsDto value) {}

    public SuggestionStore(JdbcTemplate jdbc, ObjectMapper json, ScoringConfig config,
                           ConfigFingerprint fingerprint, SuggestionsProperties props) {
        this.jdbc = jdbc;
        this.json = json;
        activeConfig = fingerprint.of(config);
        try (var in = AttentionPlanner.class.getResourceAsStream("/suggestions-catalog.json")) {
            if (in == null) throw new IllegalStateException("Falta el catálogo S7");
            String material = "suggestions.v3|input.v3|engine-8e16160|" + AttentionPlanner.VERSION + "|"
                    + HelmcodeSuggestionRenderer.PROMPT + "|" + props.model() + "|"
                    + new String(in.readAllBytes(), StandardCharsets.UTF_8);
            signature = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(material.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("No se puede versionar S7", e);
        }
    }

    public Run currentRun() {
        if (!tableExists("pipeline_runs")) return null;
        var runs = jdbc.query("SELECT run_id, config_hash FROM pipeline_runs ORDER BY finished_at DESC LIMIT 1",
                (rs, n) -> new Run(rs.getString(1), rs.getString(2)));
        return runs.isEmpty() ? null : runs.getFirst();
    }

    public boolean matches(Run run) {
        return run != null && Objects.equals(activeConfig, run.configHash());
    }

    public SuggestionsDto read(String type, String id, String profile, String month) {
        var run = currentRun();
        if (!matches(run)) return SuggestionsDto.unavailable("CONFIG_MISMATCH");
        return cached(new Key(type, id, month, profile), run);
    }

    public SuggestionsDto cached(Key key, Run run) {
        if (!tableExists("s7_suggestions")) return SuggestionsDto.unavailable("NOT_PREPARED");
        var rows = jdbc.query("""
                SELECT payload FROM s7_suggestions WHERE entity_type=? AND entity_id=? AND month=? AND profile=?
                AND run_id=? AND config_hash=? AND signature=?
                """, (rs, n) -> rs.getString(1), key.type(), key.id(), key.month(), key.profile(),
                run.id(), run.configHash(), signature);
        if (rows.isEmpty()) return SuggestionsDto.unavailable("NOT_PREPARED");
        try {
            var value = json.readValue(rows.getFirst(), SuggestionsDto.class);
            if (!"suggestions.v3".equals(value.v()) || !"atencion".equals(value.mode())) {
                return SuggestionsDto.unavailable("NOT_PREPARED");
            }
            return value;
        } catch (Exception e) {
            return SuggestionsDto.unavailable("NOT_PREPARED");
        }
    }

    public java.util.Map<Key, SuggestionsDto> existing(Run run) {
        java.util.Map<Key, SuggestionsDto> result = new java.util.HashMap<>();
        jdbc.query("SELECT entity_type, entity_id, month, profile, payload FROM s7_suggestions WHERE run_id=? AND config_hash=? AND signature=?",
                (org.springframework.jdbc.core.RowCallbackHandler) rs -> {
                    try {
                        result.put(new Key(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4)),
                                json.readValue(rs.getString(5), SuggestionsDto.class));
                    } catch (Exception ignored) {
                    }
                }, run.id(), run.configHash(), signature);
        return result;
    }

    public void initialize() {
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS s7_suggestions (
                entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, profile VARCHAR,
                run_id VARCHAR, config_hash VARCHAR, signature VARCHAR, payload VARCHAR,
                PRIMARY KEY(entity_type, entity_id, month, profile))
                """);
    }

    public void save(List<Entry> entries, Run run) {
        if (entries.isEmpty()) return;
        var args = new java.util.ArrayList<Object>();
        for (var entry : entries) {
            var k = entry.key();
            args.addAll(List.of(k.type(), k.id(), k.month(), k.profile(), run.id(), run.configHash(), signature));
            try {
                args.add(json.writeValueAsString(entry.value()));
            } catch (Exception e) {
                throw new IllegalStateException("No se pueden guardar las sugerencias", e);
            }
        }
        String values = String.join(",", java.util.Collections.nCopies(entries.size(), "(?,?,?,?,?,?,?,?)"));
        jdbc.update("INSERT OR REPLACE INTO s7_suggestions VALUES " + values, args.toArray());
    }

    private boolean tableExists(String name) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT COUNT(*) > 0 FROM information_schema.tables WHERE table_name=?",
                Boolean.class, name));
    }
}
