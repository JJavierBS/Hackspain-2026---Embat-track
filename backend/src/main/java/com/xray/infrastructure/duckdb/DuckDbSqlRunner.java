package com.xray.infrastructure.duckdb;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

@Component
public class DuckDbSqlRunner implements SqlRunner {

    private static final Logger log = LoggerFactory.getLogger(DuckDbSqlRunner.class);
    private static final Pattern STATEMENT_END = Pattern.compile(";\\s*(\\r?\\n|$)");
    private static final Pattern TABLE_NAME = Pattern.compile("[A-Za-z_][A-Za-z0-9_]*");

    private final JdbcTemplate jdbc;

    public DuckDbSqlRunner(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void runScript(String classpathPath, Map<String, String> params) {
        String sql = load(classpathPath);
        for (var e : params.entrySet()) {
            sql = sql.replace("${" + e.getKey() + "}", e.getValue());
        }
        if (sql.contains("${")) {
            throw new IllegalArgumentException("Unresolved placeholder in " + classpathPath);
        }
        for (String statement : STATEMENT_END.split(sql)) {
            if (!statement.isBlank()) {
                jdbc.execute(statement);
            }
        }
        log.debug("ran {}", classpathPath);
    }

    @Override
    public <T> List<T> query(String sql, RowMapper<T> mapper, Object... args) {
        return jdbc.query(sql, mapper, args);
    }

    @Override
    public long count(String table) {
        if (!TABLE_NAME.matcher(table).matches()) {
            throw new IllegalArgumentException("Bad table name: " + table);
        }
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Long.class);
        return n == null ? 0 : n;
    }

    private static String load(String classpathPath) {
        try (var in = new ClassPathResource(classpathPath).getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read " + classpathPath, e);
        }
    }
}
