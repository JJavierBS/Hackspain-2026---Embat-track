package com.xray.application;

import com.xray.config.ScoringConfig;
import com.xray.domain.model.Profile;
import com.xray.infrastructure.duckdb.DuckDbTables;
import com.xray.infrastructure.duckdb.SqlRunner;
import com.xray.infrastructure.web.dto.ForecastDto;
import com.xray.infrastructure.web.dto.ForecastPointDto;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/** A plain read of forecast_points at one origin month (rule 8: no recomputation in requests). */
@Service
public class ForecastQuery {

    private final SqlRunner sql;
    private final ScoringConfig config;

    public ForecastQuery(SqlRunner sql, ScoringConfig config) {
        this.sql = sql;
        this.config = config;
    }

    /** horizon null = max-horizon-months; any other value is clamped to 1..max-horizon-months. */
    public int horizon(Integer raw) {
        int max = config.forecast().maxHorizonMonths();
        return raw == null ? max : Math.max(1, Math.min(max, raw));
    }

    public ForecastDto forecast(String type, String id, Profile p, String origin, Integer horizonRaw) {
        int horizon = horizon(horizonRaw);
        int max = config.forecast().maxHorizonMonths();
        if (!DuckDbTables.exists(sql, "forecast_points")) {
            return new ForecastDto(origin, null, null, null, horizon, max, List.of());
        }
        record Row(String month, int horizon, double value, double median, int history, String reliability) {
        }
        List<Row> rows = sql.query("""
                SELECT target_month, horizon, value, median, history, reliability FROM forecast_points
                WHERE entity_type = ? AND entity_id = ? AND profile = ? AND month = ? AND horizon <= ?
                ORDER BY horizon""",
                (rs, i) -> new Row(rs.getString(1), rs.getInt(2), rs.getDouble(3), rs.getDouble(4), rs.getInt(5),
                        rs.getString(6)),
                type, id, p.name(), origin, horizon);
        if (rows.isEmpty()) {
            return new ForecastDto(origin, null, null, null, horizon, max, List.of());
        }
        List<ForecastPointDto> points = new ArrayList<>(rows.size());
        for (Row r : rows) {
            points.add(new ForecastPointDto(r.month(), r.horizon(), Scores.round1(r.value())));
        }
        Row first = rows.getFirst();
        return new ForecastDto(origin, first.reliability(), first.history(), Scores.round1(first.median()), horizon,
                max, List.copyOf(points));
    }
}
