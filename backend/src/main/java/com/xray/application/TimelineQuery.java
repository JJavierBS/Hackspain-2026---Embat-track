package com.xray.application;

import com.xray.config.ScoringConfig;
import com.xray.domain.model.Profile;
import com.xray.infrastructure.duckdb.DuckDbTables;
import com.xray.infrastructure.duckdb.SqlRunner;
import com.xray.infrastructure.web.dto.AlertDto;
import com.xray.infrastructure.web.dto.ChangepointDto;
import com.xray.infrastructure.web.dto.TimelineDto;
import com.xray.infrastructure.web.dto.TimelinePointDto;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/** Per-month scores and the changepoints an observer knew at each month (alarm_month <= upTo, causal). */
@Service
public class TimelineQuery {

    private final SqlRunner sql;
    private final ApiParams params;
    private final EntityLookup lookup;
    private final AlertReads alerts;
    private final ScoringConfig config;
    private final AnalyticsQuery analytics;

    public TimelineQuery(SqlRunner sql, ApiParams params, EntityLookup lookup, AlertReads alerts,
                         ScoringConfig config, AnalyticsQuery analytics) {
        this.sql = sql;
        this.params = params;
        this.lookup = lookup;
        this.alerts = alerts;
        this.config = config;
        this.analytics = analytics;
    }

    public TimelineDto timeline(String id, String profileRaw) {
        Profile p = params.profile(profileRaw);
        EntityLookup.Entity e = lookup.find(id);
        return new TimelineDto(id, p.name(), points(e.type(), id, p, params.lastMonth()),
                changepoints(e.type(), id, p, params.lastMonth()), alerts(e.type(), id, p),
                analytics.events(e.type(), id, p, null));
    }

    /** Oldest first. */
    public List<AlertDto> alerts(String type, String id, Profile p) {
        return alerts.read("entity_type = ? AND entity_id = ? AND profile = ? ORDER BY month, "
                + AlertReads.SEVERITY_ORDER + ", code", type, id, p.name());
    }

    /** Product and alert columns come from LEFT JOINs on the phase 5 tables that exist (null / 0 otherwise). */
    public List<TimelinePointDto> points(String type, String id, Profile p, String upTo) {
        boolean limits = DuckDbTables.exists(sql, "limit_decisions");
        boolean premiums = DuckDbTables.exists(sql, "premium_quotes");
        boolean fired = DuckDbTables.exists(sql, "alerts");
        List<Object> args = new ArrayList<>();
        StringBuilder q = new StringBuilder("SELECT s.month, s.final, s.level, s.traj, s.band, s.status, s.regime, ")
                .append(limits ? "l.limit_eur, l.action" : "NULL AS limit_eur, NULL AS action").append(", ")
                .append(premiums ? "q.premium_rate, q.buyer_limit_eur" : "NULL AS premium_rate, NULL AS buyer_limit_eur")
                .append(", ").append(fired ? "COALESCE(a.n, 0) AS n_alerts" : "0 AS n_alerts")
                .append(" FROM profile_scores s");
        if (limits) {
            q.append(" LEFT JOIN limit_decisions l ON l.entity_type = s.entity_type AND l.entity_id = s.entity_id"
                    + " AND l.month = s.month AND l.profile = ?");
            args.add(config.products().limitProfile().name());
        }
        if (premiums) {
            q.append(" LEFT JOIN premium_quotes q ON q.entity_type = s.entity_type AND q.entity_id = s.entity_id"
                    + " AND q.month = s.month AND q.profile = ?");
            args.add(config.products().premiumProfile().name());
        }
        if (fired) {
            q.append(" LEFT JOIN (SELECT month, COUNT(*) AS n FROM alerts WHERE entity_type = ? AND entity_id = ?"
                    + " AND profile = ? GROUP BY 1) a ON a.month = s.month");
            args.add(type);
            args.add(id);
            args.add(p.name());
        }
        q.append(" WHERE s.entity_type = ? AND s.entity_id = ? AND s.profile = ? AND s.month <= ? ORDER BY s.month");
        args.add(type);
        args.add(id);
        args.add(p.name());
        args.add(upTo);
        return sql.query(q.toString(),
                (rs, i) -> new TimelinePointDto(rs.getString("month"), Scores.round1(Scores.dbl(rs, "final")),
                        Scores.round1(Scores.dbl(rs, "level")), Scores.round1(Scores.dbl(rs, "traj")),
                        rs.getString("band"), rs.getString("status"), rs.getString("regime"),
                        Scores.eur(Scores.dbl(rs, "limit_eur")), rs.getString("action"),
                        Scores.round(Scores.dbl(rs, "premium_rate"), 4),
                        Scores.eur(Scores.dbl(rs, "buyer_limit_eur")), rs.getInt("n_alerts")),
                args.toArray());
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
