package com.xray.pipeline;

import com.xray.alerting.AlertRule;
import com.xray.alerting.rules.BandDowngradeRule;
import com.xray.alerting.rules.BandUpgradeRule;
import com.xray.alerting.rules.ConcentrationHighRule;
import com.xray.alerting.rules.DscrBreachRule;
import com.xray.alerting.rules.DsoDriftRule;
import com.xray.alerting.rules.FactoringSpikeRule;
import com.xray.alerting.rules.LimitActionRule;
import com.xray.alerting.rules.LineUtilHighRule;
import com.xray.alerting.rules.OverdueReceivablesRule;
import com.xray.alerting.rules.RunwayLowRule;
import com.xray.alerting.rules.ScoreDropRule;
import com.xray.alerting.rules.StructuralDeclineRule;
import com.xray.alerting.rules.StructuralImprovementRule;
import com.xray.alerting.rules.SupplierLatenessUpRule;
import com.xray.alerting.rules.TaxGapRule;
import com.xray.config.ScoringConfig;
import com.xray.domain.model.EntityKey;
import com.xray.domain.model.EntityPanel;
import com.xray.domain.model.EntityType;
import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.Month;
import com.xray.domain.model.RawIndicator;
import com.xray.domain.model.SignalId;
import com.xray.infrastructure.duckdb.DuckDbDataSource;
import com.xray.infrastructure.duckdb.ResultWriter;
import com.xray.narrative.TemplateNarrativeRenderer;
import com.xray.pipeline.stages.S40_Normalize;
import com.xray.pipeline.stages.S50_Trajectory;
import com.xray.pipeline.stages.S60_Score;
import com.xray.pipeline.stages.S65_Explain;
import com.xray.pipeline.stages.S70_Dynamics;
import com.xray.pipeline.stages.S75_Products;
import com.xray.pipeline.stages.S80_Alerts;
import com.xray.pipeline.stages.S85_Forecast;
import com.xray.pipeline.stages.S90_Analytics;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.ConfigurationPropertySources;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.io.ClassPathResource;

import javax.sql.DataSource;
import java.io.IOException;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.TreeMap;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

/**
 * ARCHITECTURE §9: truncate the panel at M12, recompute, and every value for M00..M12 must be identical
 * to the full run. forecast_points is dated by its origin month (phase 7 decision H12). Runs the Java
 * stages S40 → S90 on seeded synthetic panels, each run on its own
 * in-memory DuckDB, and compares the results tables row by row (phase 6 decision G10).
 * The SQL layer is out of scope: balances are reconstructed backwards from the 2026-09-01 snapshot on
 * purpose (SPEC §0.2 static exception, a documented caveat).
 */
class LookAheadTest {

    private static final int MONTHS = 24;
    private static final int CUT = 12;                 // inclusive: months 0..12 must match
    private static final int ENTITIES = 40;
    private static final List<Month> MONTHS_LIST = Month.range(Month.parse("2024-09"), Month.parse("2026-08"));

    /** table -> the column that dates the row. Everything not listed uses "month". */
    private static final Map<String, String> MONTH_COLUMN = Map.of(
            "changepoints", "alarm_month",             // the month an observer was warned, not the estimated break
            "lead_time_events", "event_month",
            "lead_time_signals", "signal_month");

    /** Evaluation columns that look past the signal on purpose (decision G8). */
    private static final Set<String> IGNORED_COLUMNS = Set.of("evaluable", "followed");

    /**
     * profile_weights: config, not data. It has no month column and is identical by construction.
     * lead_time_baseline: an evaluation total per entity over the whole series. It reads the months after each
     * month on purpose (decision G8), like evaluable and followed, and nothing scores from it.
     */
    private static final Set<String> SKIPPED_TABLES = Set.of("profile_weights", "lead_time_baseline");

    @Test
    void pastValuesDoNotChangeWhenTheFutureIsCut() throws Exception {
        ScoringConfig config = shippedConfig();
        List<EntityPanel> full = panels(config, MONTHS);
        List<EntityPanel> cut = panels(config, MONTHS).stream().map(p -> truncate(p, CUT + 1)).toList();

        Map<String, List<String>> a = run(config, full);
        Map<String, List<String>> b = run(config, cut);

        assertEquals(a.keySet(), b.keySet(), "the two runs wrote different tables");
        String lastMonth = MONTHS_LIST.get(CUT).toString();
        for (String table : a.keySet()) {
            assertEquals(a.get(table), b.get(table), table + " differs up to " + lastMonth);
        }
        assertFalse(a.get("profile_scores").isEmpty(), "the synthetic panels produced no scores");
        assertFalse(a.get("lead_time_events").isEmpty(), "the synthetic panels produced no lead-time events");
        assertFalse(a.get("forecast_points").isEmpty(), "the synthetic panels produced no forecast");
    }

    private static Map<String, List<String>> run(ScoringConfig config, List<EntityPanel> panels) throws Exception {
        try (DuckDbDataSource ds = new DuckDbDataSource("jdbc:duckdb:")) {
            ResultWriter writer = new ResultWriter(ds);
            PipelineContext ctx = new PipelineContext(null, config, "test", EntityType.GROUP, (stage, pct, msg) -> {
            });
            ctx.setPanels(panels);
            for (PipelineStage stage : stages(writer, config)) {
                stage.execute(ctx);
            }
            return dump(ds);
        }
    }

    private static List<PipelineStage> stages(ResultWriter writer, ScoringConfig config) {
        return List.of(new S40_Normalize(), new S50_Trajectory(), new S60_Score(writer),
                new S65_Explain(writer, new TemplateNarrativeRenderer()), new S70_Dynamics(writer),
                new S75_Products(writer), new S80_Alerts(writer, rules(config)), new S85_Forecast(writer),
                new S90_Analytics(writer));
    }

    /** The 15 rules of phase 5. Four take no config; the rest take ScoringConfig. */
    private static List<AlertRule> rules(ScoringConfig c) {
        return List.of(new RunwayLowRule(c), new DscrBreachRule(c), new LineUtilHighRule(c), new DsoDriftRule(c),
                new SupplierLatenessUpRule(c), new OverdueReceivablesRule(c), new TaxGapRule(c),
                new ConcentrationHighRule(c), new FactoringSpikeRule(c), new ScoreDropRule(c),
                new StructuralDeclineRule(), new StructuralImprovementRule(), new BandUpgradeRule(),
                new BandDowngradeRule(c), new LimitActionRule());
    }

    /** Every table, every row dated at or before the cut, one sorted string per row. */
    private static Map<String, List<String>> dump(DataSource ds) throws SQLException {
        Map<String, List<String>> out = new TreeMap<>();
        String cut = MONTHS_LIST.get(CUT).toString();
        try (Connection c = ds.getConnection(); Statement st = c.createStatement()) {
            List<String> tables = new ArrayList<>();
            try (ResultSet rs = st.executeQuery("SELECT table_name FROM information_schema.tables ORDER BY 1")) {
                while (rs.next()) {
                    tables.add(rs.getString(1));
                }
            }
            for (String table : tables) {
                if (SKIPPED_TABLES.contains(table)) {
                    continue;
                }
                String monthColumn = MONTH_COLUMN.getOrDefault(table, "month");
                List<String> rows = new ArrayList<>();
                try (ResultSet rs = st.executeQuery("SELECT * FROM " + table)) {
                    ResultSetMetaData meta = rs.getMetaData();
                    int n = meta.getColumnCount();
                    while (rs.next()) {
                        if (rs.getString(monthColumn).compareTo(cut) > 0) {
                            continue;
                        }
                        StringBuilder b = new StringBuilder();
                        for (int k = 1; k <= n; k++) {
                            String column = meta.getColumnName(k);
                            if (IGNORED_COLUMNS.contains(column)) {
                                continue;
                            }
                            b.append(column).append('=').append(rs.getString(k)).append('|');
                        }
                        rows.add(b.toString());
                    }
                }
                rows.sort(Comparator.naturalOrder());
                out.put(table, rows);
            }
        }
        return out;
    }

    /** A random walk inside each indicator's anchor range, with holes, so every stage has something to chew on. */
    private static List<EntityPanel> panels(ScoringConfig config, int months) {
        Random rnd = new Random(42);
        List<EntityPanel> out = new ArrayList<>();
        for (int i = 0; i < ENTITIES; i++) {
            EntityPanel panel = new EntityPanel(new EntityKey(EntityType.GROUP, String.format("G_%03d", i)),
                    MONTHS_LIST.subList(0, months));
            for (IndicatorId id : IndicatorId.values()) {
                List<List<Double>> anchors = config.indicators().get(id).anchors();
                double lo = anchors.getFirst().getFirst();
                double hi = anchors.getLast().getFirst();
                double value = lo + rnd.nextDouble() * (hi - lo);
                for (int m = 0; m < months; m++) {
                    value = Math.max(lo - (hi - lo) * 0.1, Math.min(hi + (hi - lo) * 0.1,
                            value + (rnd.nextDouble() - 0.5) * (hi - lo) * 0.25));
                    boolean available = rnd.nextDouble() > 0.08;                 // 8 % holes
                    panel.setRaw(m, available ? new RawIndicator(id, value, true, false, false)
                            : RawIndicator.missing(id));
                }
            }
            for (SignalId id : SignalId.values()) {
                double value = 10_000 + rnd.nextDouble() * 500_000;
                for (int m = 0; m < months; m++) {
                    Double next = switch (id) {
                        case TAX_GAP_MONTHS -> (double) rnd.nextInt(6);
                        case TAX_CADENCE_MONTHS -> rnd.nextBoolean() ? 1.0 : 3.0;
                        default -> value = Math.max(0, value * (0.9 + rnd.nextDouble() * 0.25));
                    };
                    panel.setSignal(id, m, rnd.nextDouble() > 0.1 ? next : null);
                }
            }
            out.add(panel);
        }
        return out;
    }

    /** The same panel with the future removed: only the stage inputs are copied, the stages recompute the rest. */
    private static EntityPanel truncate(EntityPanel panel, int n) {
        EntityPanel out = new EntityPanel(panel.key(), panel.months().subList(0, n));
        for (IndicatorId id : IndicatorId.values()) {
            for (int m = 0; m < n; m++) {
                out.setRaw(m, panel.raw(id, m));
            }
        }
        for (SignalId id : SignalId.values()) {
            for (int m = 0; m < n; m++) {
                out.setSignal(id, m, panel.signal(id, m));
            }
        }
        return out;
    }

    private static ScoringConfig shippedConfig() throws IOException {
        var sources = new YamlPropertySourceLoader()
                .load("scoring-config", new ClassPathResource("scoring-config.yml"));
        return new Binder(ConfigurationPropertySources.from(sources)).bind("scoring", ScoringConfig.class).get();
    }
}
