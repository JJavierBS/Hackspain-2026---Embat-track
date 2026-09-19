package com.xray.infrastructure.duckdb;

import org.duckdb.DuckDBAppender;
import org.duckdb.DuckDBConnection;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDate;
import java.util.Iterator;
import java.util.List;
import java.util.function.Function;
import java.util.regex.Pattern;

/**
 * Writes a results table in bulk with the DuckDB Appender (ARCHITECTURE §7).
 * Row-by-row INSERT on 132k rows takes minutes; the Appender takes seconds.
 * Every call drops and recreates the table: no migrations, no incremental updates.
 * replaceInBatches keeps only one batch of rows in memory: the deployed instance has 512 MB in total.
 */
@Component
public class ResultWriter {

    private static final Pattern TABLE_NAME = Pattern.compile("[A-Za-z_][A-Za-z0-9_]*");
    /** Items (panels) whose rows are built together, in parallel, before the Appender writes them. */
    private static final int BATCH = 64;

    private final DataSource dataSource;

    public ResultWriter(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    public int replace(String table, String columnsDdl, List<Object[]> rows) {
        return write(table, columnsDdl, List.of(rows).iterator());
    }

    /**
     * Builds the rows of BATCH items at a time (in parallel), writes them, then drops them. Use it when the
     * rows of every item together do not fit in the heap. The row order follows the item order.
     */
    public <T> int replaceInBatches(String table, String columnsDdl, List<T> items,
                                    Function<T, List<Object[]>> toRows) {
        Iterator<List<Object[]>> batches = new Iterator<>() {
            private int next = 0;

            @Override
            public boolean hasNext() {
                return next < items.size();
            }

            @Override
            public List<Object[]> next() {
                List<T> batch = items.subList(next, Math.min(next + BATCH, items.size()));
                next += batch.size();
                return batch.parallelStream().flatMap(item -> toRows.apply(item).stream()).toList();
            }
        };
        return write(table, columnsDdl, batches);
    }

    private int write(String table, String columnsDdl, Iterator<List<Object[]>> batches) {
        if (!TABLE_NAME.matcher(table).matches()) {
            throw new IllegalArgumentException("Bad table name: " + table);
        }
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            st.execute("DROP TABLE IF EXISTS " + table);
            st.execute("CREATE TABLE " + table + " (" + columnsDdl + ")");
            try (DuckDBAppender a = c.unwrap(DuckDBConnection.class)
                    .createAppender(DuckDBConnection.DEFAULT_SCHEMA, table)) {
                int n = 0;
                while (batches.hasNext()) {
                    for (Object[] row : batches.next()) {
                        a.beginRow();
                        for (Object v : row) {
                            append(a, v);
                        }
                        a.endRow();
                        n++;
                    }
                }
                return n;
            }
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
