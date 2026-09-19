package com.xray.infrastructure.duckdb;

/** Lets a stage skip cleanly when its input tables are absent (overview contract item 7). */
public final class DuckDbTables {

    private DuckDbTables() {
    }

    public static boolean exists(SqlRunner sql, String table) {
        return !sql.query(
                "SELECT 1 FROM information_schema.tables WHERE table_schema = 'main' AND table_name = ?",
                (rs, i) -> 1, table).isEmpty();
    }
}
