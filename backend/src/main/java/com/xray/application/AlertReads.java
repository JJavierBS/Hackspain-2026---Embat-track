package com.xray.application;

import com.xray.infrastructure.duckdb.DuckDbTables;
import com.xray.infrastructure.duckdb.SqlRunner;
import com.xray.infrastructure.web.dto.AlertDto;
import org.springframework.stereotype.Component;

import java.util.List;

/** Reads rows of alerts as AlertDto. Shared by the entity, timeline and monitor queries. */
@Component
public class AlertReads {

    /** SPEC §8.5 display order inside a month: CRITICAL, WARN, INFO. */
    public static final String SEVERITY_ORDER =
            "CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'WARN' THEN 1 ELSE 2 END";

    private final SqlRunner sql;

    public AlertReads(SqlRunner sql) {
        this.sql = sql;
    }

    /** whereAndOrderSql is a literal of the caller (bind values go in args). Empty when the table is absent. */
    public List<AlertDto> read(String whereAndOrderSql, Object... args) {
        if (!DuckDbTables.exists(sql, "alerts")) {
            return List.of();
        }
        return sql.query("SELECT entity_type, entity_id, month, code, severity, direction, message, value "
                        + "FROM alerts WHERE " + whereAndOrderSql,
                (rs, i) -> {
                    String type = rs.getString(1);
                    String id = rs.getString(2);
                    String month = rs.getString(3);
                    String code = rs.getString(4);
                    return new AlertDto(type + ":" + id + ":" + month + ":" + code, id, id, type, month, code,
                            rs.getString(5), rs.getString(6), rs.getString(7), Scores.dbl(rs, "value"));
                },
                args);
    }
}
