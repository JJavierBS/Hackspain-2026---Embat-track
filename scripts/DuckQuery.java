import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;

/**
 * Minimal DuckDB query tool for machines without the DuckDB CLI. Single-file program, no build needed:
 *   J=$(ls ~/.m2/repository/org/duckdb/duckdb_jdbc/1.5.5.1/*.jar)
 *   java --enable-native-access=ALL-UNNAMED -cp $J scripts/DuckQuery.java data/xray.duckdb "SELECT 1" "SELECT 2"
 * The backend must be stopped: DuckDB allows one process per database file.
 */
public class DuckQuery {
    public static void main(String[] args) throws Exception {
        if (args.length < 2) {
            System.err.println("usage: DuckQuery <file.duckdb> <sql> [<sql> ...]");
            System.exit(2);
        }
        try (Connection c = DriverManager.getConnection("jdbc:duckdb:" + args[0]); Statement s = c.createStatement()) {
            for (int i = 1; i < args.length; i++) {
                System.out.println("> " + args[i]);
                try (ResultSet r = s.executeQuery(args[i])) {
                    int n = r.getMetaData().getColumnCount();
                    StringBuilder h = new StringBuilder();
                    for (int k = 1; k <= n; k++) h.append(r.getMetaData().getColumnName(k)).append(k < n ? " | " : "");
                    System.out.println(h);
                    while (r.next()) {
                        StringBuilder b = new StringBuilder();
                        for (int k = 1; k <= n; k++) b.append(r.getString(k)).append(k < n ? " | " : "");
                        System.out.println(b);
                    }
                }
            }
        }
    }
}
