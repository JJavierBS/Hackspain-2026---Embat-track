package com.xray.infrastructure.duckdb;

import org.duckdb.DuckDBConnection;
import org.springframework.jdbc.datasource.AbstractDataSource;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

public class DuckDbDataSource extends AbstractDataSource implements AutoCloseable {

    private final DuckDBConnection root;

    public DuckDbDataSource(String jdbcUrl) throws SQLException {
        try {
            Class.forName("org.duckdb.DuckDBDriver");
        } catch (ClassNotFoundException e) {
            throw new SQLException("DuckDB JDBC driver not on classpath", e);
        }
        this.root = (DuckDBConnection) DriverManager.getConnection(jdbcUrl);
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
