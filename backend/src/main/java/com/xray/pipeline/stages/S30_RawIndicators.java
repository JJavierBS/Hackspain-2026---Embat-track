package com.xray.pipeline.stages;

import com.xray.config.XRayProperties;
import com.xray.domain.model.EntityPanel;
import com.xray.domain.model.EntityType;
import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.Month;
import com.xray.domain.model.RawIndicator;
import com.xray.infrastructure.duckdb.DuckDbTables;
import com.xray.infrastructure.duckdb.PanelLoader;
import com.xray.pipeline.PipelineContext;
import com.xray.pipeline.PipelineStage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;

/**
 * sql/29 creates indicator_values_raw, sql/28 builds the entity_months grid, sql/30..38 fill it,
 * sql/39 writes signal_values, then the panels load into memory. Indicator SQL sees every SqlParams
 * placeholder plus unit, runway_cap_months and reference_rate.
 */
@Component
@Order(30)
public class S30_RawIndicators implements PipelineStage {

    private static final Logger log = LoggerFactory.getLogger(S30_RawIndicators.class);
    private static final Pattern INDICATOR_SQL = Pattern.compile("3[0-9]_.*\\.sql");

    private final PanelLoader loader;
    private final XRayProperties props;

    public S30_RawIndicators(PanelLoader loader, XRayProperties props) {
        this.loader = loader;
        this.props = props;
    }

    @Override
    public String id() {
        return "S30_RAW_INDICATORS";
    }

    @Override
    public void execute(PipelineContext ctx) {
        Map<String, String> params = new HashMap<>(SqlParams.of(ctx.config(), props));
        params.put("unit", ctx.unit().name());
        params.put("runway_cap_months", String.valueOf(ctx.config().runwayCapMonths()));
        params.put("reference_rate", String.valueOf(ctx.config().limitEngine().referenceRate()));
        ctx.sql().runScript("sql/29_indicator_values_raw.sql", params);
        if (!DuckDbTables.exists(ctx.sql(), "entities")) {
            ctx.report(id(), 30, "skipped: no entities table");
            return;
        }
        ctx.sql().runScript("sql/28_entity_months.sql", params);
        for (String file : indicatorScripts()) {
            ctx.report(id(), 30, file);
            ctx.sql().runScript("sql/" + file, params);
        }
        List<Month> months = Month.range(
                Month.parse(ctx.config().months().start()), Month.parse(ctx.config().months().end()));
        List<EntityPanel> panels = loader.load(ctx.unit(), months);
        for (IndicatorId id : IndicatorId.values()) {
            long avail = panels.stream().flatMap(p -> Arrays.stream(p.rawSeries(id))).filter(RawIndicator::available).count();
            long total = (long) panels.size() * months.size();
            log.info("{} availability {} {}/{} ({}%)", id(), id, avail, total, total == 0 ? 0 : avail * 100 / total);
        }
        List<EntityPanel> all = new ArrayList<>(panels);
        if (ctx.unit() == EntityType.GROUP) {
            all.addAll(loader.load(EntityType.COMPANY, months));   // standalone company scores for the drilldown (E2)
        }
        ctx.setPanels(all);
        log.info("{} loaded {} {} panels, {} in total", id(), panels.size(), ctx.unit(), all.size());
        ctx.report(id(), 40, all.size() + " panels");
    }

    private static List<String> indicatorScripts() {
        try {
            Resource[] found = new PathMatchingResourcePatternResolver().getResources("classpath:sql/3*.sql");
            return Arrays.stream(found)
                    .map(Resource::getFilename)
                    .filter(Objects::nonNull)
                    .filter(n -> INDICATOR_SQL.matcher(n).matches())
                    .sorted()
                    .toList();
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot list sql/3*.sql", e);
        }
    }
}
