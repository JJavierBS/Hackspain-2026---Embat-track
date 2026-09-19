package com.xray.infrastructure.duckdb;

import com.xray.config.XRayProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

/**
 * A pipeline run works on a copy of every table, in a second DuckDB file attached as "run". The API keeps
 * reading the main file, so it never sees a half-written run. publish() copies the run back in one
 * transaction; discard() drops the copy and leaves the main file as it was (a failed run changes nothing).
 * A schema in the main file is not enough: DuckDB always falls back to main.main for an unqualified name,
 * so a DROP or INSERT in a stage could still reach a served table.
 */
@Component
public class RunDatabase {

    public static final String NAME = "run";
    private static final String FILE = "xray.run.duckdb";
    private static final Logger log = LoggerFactory.getLogger(RunDatabase.class);

    private final DuckDbDataSource dataSource;
    private final XRayProperties props;

    public RunDatabase(DuckDbDataSource dataSource, XRayProperties props) {
        this.dataSource = dataSource;
        this.props = props;
    }

    /** Attaches an empty run file and copies every table of the main file into it. */
    public void prepare() {
        discard();
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            String main = currentDatabase(st);
            st.execute("ATTACH '" + file() + "' AS " + NAME);
            for (String t : tables(st, main)) {
                st.execute("CREATE TABLE " + NAME + ".main." + t + " AS SELECT * FROM " + main + ".main." + t);
            }
        } catch (SQLException e) {
            throw new IllegalStateException("Cannot prepare the run database", e);
        }
    }

    /** Makes the main file equal to the run copy, in one transaction, then drops the copy. */
    public void publish() {
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            String main = currentDatabase(st);
            List<String> runTables = tables(st, NAME);
            List<String> mainTables = tables(st, main);
            c.setAutoCommit(false);
            try {
                for (String t : runTables) {
                    st.execute("CREATE OR REPLACE TABLE " + main + ".main." + t
                            + " AS SELECT * FROM " + NAME + ".main." + t);
                }
                for (String t : mainTables) {
                    if (!runTables.contains(t)) {
                        st.execute("DROP TABLE " + main + ".main." + t);
                    }
                }
                c.commit();
            } catch (SQLException e) {
                c.rollback();
                throw e;
            } finally {
                c.setAutoCommit(true);
            }
            st.execute("CHECKPOINT " + main);
        } catch (SQLException e) {
            throw new IllegalStateException("Cannot publish the run database", e);
        }
        discard();
    }

    /** Detaches and deletes the run copy. Safe to call when there is none. */
    public void discard() {
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            st.execute("DETACH DATABASE IF EXISTS " + NAME);
        } catch (SQLException e) {
            throw new IllegalStateException("Cannot detach the run database", e);
        }
        try {
            Files.deleteIfExists(file());
            Files.deleteIfExists(Path.of(file() + ".wal"));
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot delete " + file(), e);
        }
    }

    private Path file() {
        return props.dataPath().resolve(FILE);
    }

    private static String currentDatabase(Statement st) throws SQLException {
        try (ResultSet rs = st.executeQuery("SELECT current_database()")) {
            rs.next();
            return rs.getString(1);
        }
    }

    private static List<String> tables(Statement st, String db) throws SQLException {
        List<String> out = new ArrayList<>();
        try (ResultSet rs = st.executeQuery("SELECT table_name FROM information_schema.tables WHERE table_catalog = '"
                + db + "' AND table_schema = 'main' AND table_type = 'BASE TABLE' ORDER BY table_name")) {
            while (rs.next()) {
                out.add(rs.getString(1));
            }
        }
        log.debug("{} tables in {}", out.size(), db);
        return out;
    }
}
