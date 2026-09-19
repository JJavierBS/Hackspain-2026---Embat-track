package com.xray.infrastructure.duckdb;

import org.duckdb.DuckDBAppender;
import org.duckdb.DuckDBConnection;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDate;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Writes a results table in bulk with the DuckDB Appender (ARCHITECTURE §7).
 * Row-by-row INSERT on 132k rows takes minutes; the Appender takes seconds.
 * Every call drops and recreates the table: no migrations, no incremental updates.
 */
@Component
public class ResultWriter {

    private static final Pattern TABLE_NAME = Pattern.compile("[A-Za-z_][A-Za-z0-9_]*");

    private final DataSource dataSource;

    public ResultWriter(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    public int replace(String table, String columnsDdl, List<Object[]> rows) {
        if (!TABLE_NAME.matcher(table).matches()) {
            throw new IllegalArgumentException("Bad table name: " + table);
        }
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            st.execute("DROP TABLE IF EXISTS " + table);
            st.execute("CREATE TABLE " + table + " (" + columnsDdl + ")");
            try (DuckDBAppender a = c.unwrap(DuckDBConnection.class)
                    .createAppender(DuckDBConnection.DEFAULT_SCHEMA, table)) {
                for (Object[] row : rows) {
                    a.beginRow();
                    for (Object v : row) {
                        append(a, v);
                    }
                    a.endRow();
                }
            }
            return rows.size();
        } catch (SQLException e) {
            throw new IllegalStateException("Cannot write " + table, e);
        }
    }

    private static void append(DuckDBAppender a, Object v) throws SQLException {
        switch (v) {
            case null -> a.appendNull();
            case String s -> a.append(s);
            case Double d -> a.append(d.doubleValue());
            case Integer i -> a.append(i.intValue());
            case Long l -> a.append(l.longValue());
            case Boolean b -> a.append(b.booleanValue());
            case LocalDate d -> a.append(d);
            default -> throw new IllegalArgumentException("Unsupported cell type: " + v.getClass());
        }
    }
}
