package com.xray.pipeline;

import com.xray.config.ScoringConfig;
import com.xray.domain.model.EntityType;
import com.xray.infrastructure.duckdb.SqlRunner;

/** State shared by the stages of one run. Block 2 adds the in-memory panels (ARCHITECTURE §4.2). */
public class PipelineContext {

    private final SqlRunner sql;
    private final ScoringConfig config;
    private final String runId;
    private final EntityType unit;
    private final ProgressSink progress;

    public PipelineContext(SqlRunner sql, ScoringConfig config, String runId, EntityType unit, ProgressSink progress) {
        this.sql = sql;
        this.config = config;
        this.runId = runId;
        this.unit = unit;
        this.progress = progress;
    }

    public SqlRunner sql() { return sql; }

    public ScoringConfig config() { return config; }

    public String runId() { return runId; }

    public EntityType unit() { return unit; }

    public void report(String stageId, int pct, String message) {
        progress.report(stageId, pct, message);
    }
}
