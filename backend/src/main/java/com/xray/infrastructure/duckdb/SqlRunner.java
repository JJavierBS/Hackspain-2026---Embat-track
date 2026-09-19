package com.xray.infrastructure.duckdb;

import org.springframework.jdbc.core.RowMapper;

import java.util.List;
import java.util.Map;

/** Runs classpath SQL files with ${placeholder} substitution (ARCHITECTURE §5). */
public interface SqlRunner {
    void runScript(String classpathPath, Map<String, String> params);

    <T> List<T> query(String sql, RowMapper<T> mapper, Object... args);

    long count(String table);
}
