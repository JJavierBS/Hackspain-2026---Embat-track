package com.xray.pipeline;

import com.xray.config.ScoringConfig;
import com.xray.domain.model.EntityPanel;
import com.xray.domain.model.EntityType;
import com.xray.infrastructure.duckdb.SqlRunner;

import java.util.List;

/** State shared by the stages of one run. */
public class PipelineContext {

    private final SqlRunner sql;
    private final ScoringConfig config;
    private final String runId;
    private final EntityType unit;
    private final ProgressSink progress;
    private List<EntityPanel> panels = List.of();

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

    /** Populated by S30, enriched in place by S40..S90 (ARCHITECTURE §4.2). */
    public List<EntityPanel> panels() { return panels; }

    public void setPanels(List<EntityPanel> panels) { this.panels = List.copyOf(panels); }

    public void report(String stageId, int pct, String message) {
        progress.report(stageId, pct, message);
    }
}
