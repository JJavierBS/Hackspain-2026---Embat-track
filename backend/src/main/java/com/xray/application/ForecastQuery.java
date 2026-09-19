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
            return new ForecastDto(origin, null, null, null, horizon, max, List.of(), null, null);
        }
        record Row(String month, int horizon, double value, double median, int history, String reliability,
                   Double actual) {
        }
        List<Row> rows = sql.query("""
                SELECT f.target_month, f.horizon, f.value, f.median, f.history, f.reliability, s.final AS actual
                FROM forecast_points f
                LEFT JOIN profile_scores s ON s.entity_type = f.entity_type AND s.entity_id = f.entity_id
                     AND s.profile = f.profile AND s.month = f.target_month
                WHERE f.entity_type = ? AND f.entity_id = ? AND f.profile = ? AND f.month = ? AND f.horizon <= ?
                ORDER BY f.horizon""",
                (rs, i) -> new Row(rs.getString(1), rs.getInt(2), rs.getDouble(3), rs.getDouble(4), rs.getInt(5),
                        rs.getString(6), Scores.dbl(rs, "actual")),
                type, id, p.name(), origin, horizon);
        if (rows.isEmpty()) {
            return new ForecastDto(origin, null, null, null, horizon, max, List.of(), null, null);
        }
        List<ForecastPointDto> points = new ArrayList<>(rows.size());
        double absSum = 0, errSum = 0;
        int n = 0;
        for (Row r : rows) {
            points.add(new ForecastPointDto(r.month(), r.horizon(), Scores.round1(r.value()), Scores.round1(r.actual())));
            if (r.actual() != null) {
                double err = r.value() - r.actual();
                absSum += Math.abs(err);
                errSum += err;
                n++;
            }
        }
        Row first = rows.getFirst();
        return new ForecastDto(origin, first.reliability(), first.history(), Scores.round1(first.median()), horizon,
                max, List.copyOf(points), n == 0 ? null : Scores.round1(absSum / n), n == 0 ? null : Scores.round1(errSum / n));
    }
}
