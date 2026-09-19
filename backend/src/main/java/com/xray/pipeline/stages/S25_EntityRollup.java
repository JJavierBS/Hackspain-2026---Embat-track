package com.xray.pipeline.stages;

import com.xray.infrastructure.duckdb.DuckDbTables;
import com.xray.pipeline.PipelineContext;
import com.xray.pipeline.PipelineStage;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/** sql/25_entity_rollup.sql: entities + GROUP rows in the monthly tables. */
@Component
@Order(25)
public class S25_EntityRollup implements PipelineStage {

    private static final List<String> INPUTS = List.of(
            "stg_companies", "daily_cash", "monthly_flows", "monthly_cash",
            "monthly_invoices", "monthly_counterparty", "debt_snapshot");

    @Override
    public String id() {
        return "S25_ROLLUP";
    }

    @Override
    public void execute(PipelineContext ctx) {
        for (String table : INPUTS) {
            if (!DuckDbTables.exists(ctx.sql(), table)) {
                ctx.report(id(), 25, "skipped: missing table " + table);
                return;
            }
        }
        ctx.sql().runScript("sql/25_entity_rollup.sql", Map.of());
        ctx.report(id(), 25, ctx.sql().count("entities") + " entities");
    }
}
