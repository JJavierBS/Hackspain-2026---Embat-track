package com.xray.pipeline.stages;

import com.xray.config.XRayProperties;
import com.xray.pipeline.PipelineContext;
import com.xray.pipeline.PipelineStage;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/** sql/10_staging.sql, sql/11_intragroup.sql, sql/12_balances.sql. */
@Component
@Order(10)
public class S10_Staging implements PipelineStage {

    private static final List<String> SCRIPTS =
            List.of("sql/10_staging.sql", "sql/11_intragroup.sql", "sql/12_balances.sql");

    private final XRayProperties props;

    public S10_Staging(XRayProperties props) {
        this.props = props;
    }

    @Override
    public String id() {
        return "S10_STAGING";
    }

    @Override
    public void execute(PipelineContext ctx) {
        if (!RawData.present(props)) {
            ctx.report(id(), 10, "skipped: no CSVs");
            return;
        }
        Map<String, String> params = SqlParams.of(ctx.config(), props);
        for (String script : SCRIPTS) {
            ctx.report(id(), 10, script);
            ctx.sql().runScript(script, params);
        }
    }
}
