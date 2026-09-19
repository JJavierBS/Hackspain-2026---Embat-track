package com.xray.pipeline.stages;

import com.xray.domain.model.EntityPanel;
import com.xray.domain.model.Month;
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
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;

/** sql/29 creates indicator_values_raw, sql/30..38 fill it, then the panels load into memory. */
@Component
@Order(30)
public class S30_RawIndicators implements PipelineStage {

    private static final Logger log = LoggerFactory.getLogger(S30_RawIndicators.class);
    private static final Pattern INDICATOR_SQL = Pattern.compile("3[0-8]_.*\\.sql");

    private final PanelLoader loader;

    public S30_RawIndicators(PanelLoader loader) {
        this.loader = loader;
    }

    @Override
    public String id() {
        return "S30_RAW_INDICATORS";
    }

    @Override
    public void execute(PipelineContext ctx) {
        Map<String, String> params = Map.of("unit", ctx.unit().name());
        ctx.sql().runScript("sql/29_indicator_values_raw.sql", params);
        if (!DuckDbTables.exists(ctx.sql(), "entities")) {
            ctx.report(id(), 30, "skipped: no entities table");
            return;
        }
        for (String file : indicatorScripts()) {
            ctx.report(id(), 30, file);
            ctx.sql().runScript("sql/" + file, params);
        }
        List<Month> months = Month.range(
                Month.parse(ctx.config().months().start()), Month.parse(ctx.config().months().end()));
        List<EntityPanel> panels = loader.load(ctx.unit(), months);
        ctx.setPanels(panels);
        log.info("{} loaded {} panels", id(), panels.size());
        ctx.report(id(), 40, panels.size() + " panels");
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
