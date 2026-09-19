package com.xray.infrastructure.duckdb;

import org.duckdb.DuckDBConnection;
import org.springframework.jdbc.datasource.AbstractDataSource;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.Properties;

public class DuckDbDataSource extends AbstractDataSource implements AutoCloseable {

    private final DuckDBConnection root;

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
        return root.duplicate();
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
