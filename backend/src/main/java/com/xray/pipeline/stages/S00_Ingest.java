package com.xray.pipeline.stages;

import com.xray.pipeline.PipelineContext;
import com.xray.pipeline.PipelineStage;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/** Block 2 replaces the body with sql/00_ingest.sql. */
@Component
@Order(0)
public class S00_Ingest implements PipelineStage {

    @Override
    public String id() {
        return "S00_INGEST";
    }

    @Override
    public void execute(PipelineContext ctx) {
        ctx.report(id(), 0, "no-op until block 2");
    }
}
