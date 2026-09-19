package com.xray.pipeline.stages;

import com.xray.infrastructure.duckdb.DuckDbTables;
import com.xray.pipeline.PipelineContext;
import com.xray.pipeline.PipelineStage;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.Map;

/** threshold_quantiles — reference only for docs/THRESHOLDS.md, never read by scoring. */
@Component
@Order(95)
public class S95_Quantiles implements PipelineStage {

    @Override
    public String id() {
        return "S95_QUANTILES";
    }

    @Override
    public void execute(PipelineContext ctx) {
        if (!DuckDbTables.exists(ctx.sql(), "indicator_values_raw")) {
            ctx.report(id(), 95, "skipped: no indicator_values_raw");
            return;
        }
        ctx.sql().runScript("sql/90_threshold_quantiles.sql", Map.of("unit", ctx.unit().name()));
        ctx.report(id(), 99, ctx.sql().count("threshold_quantiles") + " indicators with quantiles");
    }
}
