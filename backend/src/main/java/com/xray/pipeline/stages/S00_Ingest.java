package com.xray.pipeline.stages;

import com.xray.config.XRayProperties;
import com.xray.pipeline.PipelineContext;
import com.xray.pipeline.PipelineStage;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/** sql/00_ingest.sql: raw_* views over the CSVs. */
@Component
@Order(0)
public class S00_Ingest implements PipelineStage {

    private final XRayProperties props;

    public S00_Ingest(XRayProperties props) {
        this.props = props;
    }

    @Override
    public String id() {
        return "S00_INGEST";
    }

    @Override
    public void execute(PipelineContext ctx) {
        if (!RawData.present(props)) {
            ctx.report(id(), 0, "skipped: no CSVs in " + props.rawPath());
            return;
        }
        ctx.sql().runScript("sql/00_ingest.sql", SqlParams.of(ctx.config(), props));
        ctx.report(id(), 5, "raw views ready");
    }
}
