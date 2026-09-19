package com.xray.application;

import com.xray.domain.model.Profile;
import com.xray.infrastructure.duckdb.DuckDbTables;
import com.xray.infrastructure.duckdb.SqlRunner;
import com.xray.infrastructure.web.dto.ChangepointDto;
import com.xray.infrastructure.web.dto.TimelineDto;
import com.xray.infrastructure.web.dto.TimelinePointDto;
import org.springframework.stereotype.Service;

import java.util.List;

/** Per-month scores and the changepoints an observer knew at each month (alarm_month <= upTo, causal). */
@Service
public class TimelineQuery {

    private final SqlRunner sql;
    private final ApiParams params;
    private final EntityLookup lookup;

    public TimelineQuery(SqlRunner sql, ApiParams params, EntityLookup lookup) {
        this.sql = sql;
        this.params = params;
        this.lookup = lookup;
    }

    public TimelineDto timeline(String id, String profileRaw) {
        Profile p = params.profile(profileRaw);
        EntityLookup.Entity e = lookup.find(id);
        return new TimelineDto(id, p.name(), points(e.type(), id, p, params.lastMonth()),
                changepoints(e.type(), id, p, params.lastMonth()));
    }

    public List<TimelinePointDto> points(String type, String id, Profile p, String upTo) {
        return sql.query("""
                SELECT month, final, level, traj, band, status, regime FROM profile_scores
                WHERE entity_type = ? AND entity_id = ? AND profile = ? AND month <= ? ORDER BY month""",
                (rs, i) -> new TimelinePointDto(rs.getString("month"), Scores.round1(Scores.dbl(rs, "final")),
                        Scores.round1(Scores.dbl(rs, "level")), Scores.round1(Scores.dbl(rs, "traj")),
                        rs.getString("band"), rs.getString("status"), rs.getString("regime")),
                type, id, p.name(), upTo);
    }

    public List<ChangepointDto> changepoints(String type, String id, Profile p, String upTo) {
        if (!DuckDbTables.exists(sql, "changepoints")) return List.of();
        return sql.query("""
                SELECT series, month, alarm_month, direction FROM changepoints
                WHERE entity_type = ? AND entity_id = ? AND (profile = ? OR profile IS NULL) AND alarm_month <= ?
                ORDER BY alarm_month, series""",
                (rs, i) -> new ChangepointDto(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4)),
                type, id, p.name(), upTo);
    }
}
