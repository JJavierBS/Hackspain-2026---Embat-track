import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.zip.GZIPOutputStream;

/**
 * Writes the deployable slice of xray.duckdb: the tables the API reads, nothing else.
 * The full database carries the staging tables (daily_product_balance, stg_transactions, daily_cash,
 * stg_invoices) that no query in application/ or infrastructure/duckdb/ ever touches, and they are
 * ~70% of its bytes. Demo mode (SPEC §14) never ingests, so they do not need to reach the image.
 * Single-file program, no build needed:
 *   J=$(ls ~/.m2/repository/org/duckdb/duckdb_jdbc/1.5.5.1/duckdb_jdbc-1.5.5.1.jar)
 *   java --enable-native-access=ALL-UNNAMED -cp $J scripts/ExportDemoDb.java data/xray.duckdb backend/demo/xray-demo.duckdb
 * The backend must be stopped: DuckDB allows one process per database file.
 */
public class ExportDemoDb {

    /**
     * Every table named in a FROM or JOIN under application/ and infrastructure/duckdb/, plus two
     * reference tables that cost no bytes. Adding a query over a new table means adding it here.
     */
    private static final List<String> KEEP = List.of(
            "entities", "pipeline_runs", "profile_weights",
            "indicator_values", "indicator_values_raw", "signal_values",
            "category_scores", "profile_scores", "contributions",
            "alerts", "alert_states", "watchlist", "changepoints",
            "limit_decisions", "premium_quotes", "momentum_screen",
            "lead_time_events", "lead_time_signals", "lead_time_baseline", "showcase_pairs",
            "forecast_points", "months", "threshold_quantiles");

    public static void main(String[] args) throws Exception {
        if (args.length < 2) {
            System.err.println("usage: ExportDemoDb <source.duckdb> <out.duckdb>");
            System.exit(2);
        }
        Path src = Path.of(args[0]).toAbsolutePath().normalize();
        Path out = Path.of(args[1]).toAbsolutePath().normalize();
        Path gz = Path.of(out + ".gz");
        Files.deleteIfExists(out);
        Files.deleteIfExists(Path.of(out + ".wal"));

        List<String> missing = new ArrayList<>();
        // The new file is the main database so it is writable; the source rides along read-only,
        // which leaves it untouched and lets a reader open it while nothing holds the write lock.
        try (Connection c = DriverManager.getConnection("jdbc:duckdb:" + out);
             Statement s = c.createStatement()) {
            s.execute("ATTACH '" + src + "' AS src (READ_ONLY)");
            Set<String> present = new HashSet<>();
            try (ResultSet r = s.executeQuery(
                    "SELECT table_name FROM information_schema.tables"
                            + " WHERE table_catalog = 'src' AND table_schema = 'main'")) {
                while (r.next()) present.add(r.getString(1));
            }
            for (String t : KEEP) {
                if (!present.contains(t)) {
                    missing.add(t);
                    continue;
                }
                s.execute("CREATE TABLE main." + t + " AS SELECT * FROM src." + t);
            }
            s.execute("DETACH src");
            s.execute("CHECKPOINT");
        }
        if (!missing.isEmpty()) {
            System.err.println("absent in source, skipped: " + missing);
        }

        try (OutputStream o = new GZIPOutputStream(Files.newOutputStream(gz), 1 << 16)) {
            Files.copy(out, o);
        }
        System.out.printf("%s  %.1f MB%n%s  %.1f MB%n",
                out, Files.size(out) / 1048576.0, gz, Files.size(gz) / 1048576.0);
    }
}
