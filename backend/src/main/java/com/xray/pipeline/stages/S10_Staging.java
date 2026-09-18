package com.xray.pipeline.stages;

import com.xray.pipeline.PipelineContext;
import com.xray.pipeline.PipelineStage;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/** Block 2 replaces the body with sql/10_staging.sql and sql/11_intragroup.sql. */
@Component
@Order(10)
public class S10_Staging implements PipelineStage {

    @Override
    public String id() {
        return "S10_STAGING";
    }

    @Override
    public void execute(PipelineContext ctx) {
        ctx.report(id(), 50, "no-op until block 2");
    }
}
