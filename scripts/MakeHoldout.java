import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.List;

/**
 * Builds a subset of data/raw in data/holdout/raw, same files, same headers (phase 6 decision G14).
 * Rehearsal for Sunday's hidden test, which arrives in exactly this format, so the pipeline must run on it
 * with no code change. Single-file program, no build needed:
 *   J=$(ls ~/.m2/repository/org/duckdb/duckdb_jdbc/1.5.5.1/duckdb_jdbc-1.5.5.1.jar)
 *   java --enable-native-access=ALL-UNNAMED -cp $J scripts/MakeHoldout.java data/raw data/holdout/raw 60
 */
public class MakeHoldout {

    /** Every file but groups.csv and companies.csv is filtered by company_id. */
    private static final List<String> BY_COMPANY = List.of("banking_products", "debt_products",
            "debt_schedule_config", "transactions", "invoices", "balances");

    public static void main(String[] args) throws Exception {
        if (args.length < 2) {
            System.err.println("usage: MakeHoldout <raw-dir> <out-dir> [n-groups]");
            System.exit(2);
        }
        Path in = Path.of(args[0]).toAbsolutePath().normalize();
        Path out = Path.of(args[1]).toAbsolutePath().normalize();
        int n = args.length > 2 ? Integer.parseInt(args[2]) : 60;
        Files.createDirectories(out);

        try (Connection c = DriverManager.getConnection("jdbc:duckdb:"); Statement s = c.createStatement()) {
            // Deterministic sample: the same n groups every run, no ORDER BY RANDOM().
            s.execute("CREATE TABLE picked AS SELECT group_id FROM read_csv_auto('" + csv(in, "groups")
                    + "') ORDER BY hash(group_id || 'holdout') LIMIT " + n);
            s.execute("CREATE TABLE picked_companies AS SELECT company_id FROM read_csv_auto('"
                    + csv(in, "companies") + "') WHERE group_id IN (SELECT group_id FROM picked)");

            copy(s, in, out, "groups", "group_id IN (SELECT group_id FROM picked)");
            copy(s, in, out, "companies", "group_id IN (SELECT group_id FROM picked)");
            for (String table : BY_COMPANY) {
                copy(s, in, out, table, "company_id IN (SELECT company_id FROM picked_companies)");
            }
        }
    }

    private static void copy(Statement s, Path in, Path out, String table, String where) throws Exception {
        Path target = out.resolve(table + ".csv");
        s.execute("COPY (SELECT * FROM read_csv_auto('" + csv(in, table) + "') WHERE " + where + ") TO '"
                + target + "' (HEADER, DELIMITER ',')");
        try (ResultSet r = s.executeQuery("SELECT COUNT(*) FROM read_csv_auto('" + target + "')")) {
            r.next();
            System.out.printf("%-22s %,12d rows%n", table + ".csv", r.getLong(1));
        }
    }

    private static String csv(Path dir, String table) {
        return dir.resolve(table + ".csv").toString();
    }
}
