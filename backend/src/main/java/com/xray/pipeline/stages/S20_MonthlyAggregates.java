package com.xray.pipeline.stages;

import com.xray.config.XRayProperties;
import com.xray.pipeline.PipelineContext;
import com.xray.pipeline.PipelineStage;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/** sql/20_* … sql/24_*: company-level monthly contract tables. */
@Component
@Order(20)
public class S20_MonthlyAggregates implements PipelineStage {

    private static final List<String> SCRIPTS = List.of(
            "sql/20_monthly_flows.sql", "sql/21_monthly_cash.sql", "sql/22_monthly_invoices.sql",
            "sql/23_monthly_counterparty.sql", "sql/24_debt_snapshot.sql");

    private final XRayProperties props;

    public S20_MonthlyAggregates(XRayProperties props) {
        this.props = props;
    }

    @Override
    public String id() {
        return "S20_MONTHLY";
    }

    @Override
    public void execute(PipelineContext ctx) {
        if (!RawData.present(props)) {
            ctx.report(id(), 20, "skipped: no CSVs");
            return;
        }
        Map<String, String> params = SqlParams.of(ctx.config(), props);
        for (String script : SCRIPTS) {
            ctx.report(id(), 20, script);
            ctx.sql().runScript(script, params);
        }
    }
}
