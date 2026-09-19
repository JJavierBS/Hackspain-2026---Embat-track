package com.xray.infrastructure.duckdb;

import org.duckdb.DuckDBConnection;
import org.springframework.jdbc.datasource.AbstractDataSource;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Properties;
import java.util.regex.Pattern;

public class DuckDbDataSource extends AbstractDataSource implements AutoCloseable {

    private static final Pattern NAME = Pattern.compile("[A-Za-z_][A-Za-z0-9_]*");

    private final DuckDBConnection root;
    /** Database that new connections of this thread USE (RunDatabase). Null: the file this source opened. */
    private final ThreadLocal<String> useDatabase = new ThreadLocal<>();

    public DuckDbDataSource(String jdbcUrl) throws SQLException {
        this(jdbcUrl, null, 0);
    }

    /**
     * memoryLimit: DuckDB memory_limit ("128MB"), or blank for the DuckDB default. threads: DuckDB threads, or 0
     * for the default. Memory grows with threads, and the default counts the host cores, not the container quota.
     */
    public DuckDbDataSource(String jdbcUrl, String memoryLimit, int threads) throws SQLException {
        try {
            Class.forName("org.duckdb.DuckDBDriver");
        } catch (ClassNotFoundException e) {
            throw new SQLException("DuckDB JDBC driver not on classpath", e);
        }
        Properties settings = new Properties();
        if (memoryLimit != null && !memoryLimit.isBlank()) {
            settings.setProperty("memory_limit", memoryLimit);
        }
        if (threads > 0) {
            settings.setProperty("threads", String.valueOf(threads));
        }
        this.root = (DuckDBConnection) DriverManager.getConnection(jdbcUrl, settings);
    }

    @Override
    public Connection getConnection() throws SQLException {
        Connection c = root.duplicate();
        String db = useDatabase.get();
        if (db != null) {
            try (Statement st = c.createStatement()) {
                st.execute("USE " + db);
            } catch (SQLException e) {
                c.close();
                throw e;
            }
        }
        return c;
    }

    /**
     * Runs work with every connection this thread opens bound to the attached database db: unqualified names
     * resolve there, never in the main file. Other threads (the API) keep reading the main file.
     */
    public void inDatabase(String db, Runnable work) {
        if (!NAME.matcher(db).matches()) {
            throw new IllegalArgumentException("Bad database name: " + db);
        }
        useDatabase.set(db);
        try {
            work.run();
        } finally {
            useDatabase.remove();
        }
    }

    @Override
    public Connection getConnection(String username, String password) throws SQLException {
        return getConnection();
    }

    @Override
    public void close() throws SQLException {
        root.close();
    }
}
