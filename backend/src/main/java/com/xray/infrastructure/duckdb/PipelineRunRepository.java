package com.xray.infrastructure.duckdb;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xray.domain.model.EntityType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;

/** pipeline_runs keeps the run history; it is not dropped per run (ARCHITECTURE §7). */
@Repository
public class PipelineRunRepository {

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public PipelineRunRepository(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public boolean isEmpty() {
        ensureTable();
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM pipeline_runs", Long.class);
        return n == null || n == 0;
    }

    public void save(String runId, EntityType unit, Instant startedAt, Instant finishedAt,
                     Map<String, Long> stageTimingsMs, String configHash) {
        ensureTable();
        try {
            jdbc.update("INSERT INTO pipeline_runs VALUES (?, ?, ?, ?, ?, ?)",
                    runId, unit.name(), Timestamp.from(startedAt), Timestamp.from(finishedAt),
                    json.writeValueAsString(stageTimingsMs), configHash);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Cannot serialize stage timings", e);
        }
    }

    private void ensureTable() {
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS pipeline_runs (
                  run_id VARCHAR PRIMARY KEY,
                  unit VARCHAR,
                  started_at TIMESTAMP,
                  finished_at TIMESTAMP,
                  stage_timings_json VARCHAR,
                  config_hash VARCHAR)""");
    }
}
