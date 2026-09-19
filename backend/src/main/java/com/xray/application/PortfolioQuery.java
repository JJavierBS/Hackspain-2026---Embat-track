package com.xray.application;

import com.xray.config.ScoringConfig;
import com.xray.domain.model.Profile;
import com.xray.infrastructure.duckdb.DuckDbTables;
import com.xray.infrastructure.duckdb.SqlRunner;
import com.xray.infrastructure.web.dto.PortfolioDto;
import com.xray.infrastructure.web.dto.PortfolioRowDto;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/** GET /api/portfolio (SPEC §12.5). Reads profile_scores, plus alert_states and momentum_screen when present. */
@Service
public class PortfolioQuery {

    private static final int SPARKLINE_MONTHS = 12;

    private final SqlRunner sql;
    private final ApiParams params;
    private final ScoringConfig config;

    public PortfolioQuery(SqlRunner sql, ApiParams params, ScoringConfig config) {
        this.sql = sql;
        this.params = params;
        this.config = config;
    }

    public PortfolioDto portfolio(String profileRaw, String monthRaw, String status, String band, String q, String sort) {
        Profile p = params.profile(profileRaw);
        String month = params.month(monthRaw);
        String unit = params.unit().name();
        List<PortfolioRowDto> rows = rows(unit, null, null, p, month);
        long total = sql.query("SELECT COUNT(*) FROM entities WHERE entity_type = ?", (rs, i) -> rs.getLong(1), unit)
                .getFirst();
        int unscored = (int) (total - rows.size());

        Set<String> statuses = csv(status);
        Set<String> bands = csv(band);
        String needle = q == null ? "" : q.trim().toLowerCase(Locale.ROOT);
        List<PortfolioRowDto> filtered = rows.stream()
                .filter(r -> statuses.isEmpty() || (r.status() != null && statuses.contains(r.status())))
                .filter(r -> bands.isEmpty() || bands.contains(r.band()))
                .filter(r -> needle.isEmpty() || r.id().toLowerCase(Locale.ROOT).contains(needle))
                .sorted(order(sort))
                .toList();
        return new PortfolioDto(p.name(), month, unscored, filtered);
    }

    /**
     * Scored rows at month. groupId != null keeps the companies of that group; entityId != null keeps one entity.
     * Sorted by final score, highest first.
     */
    public List<PortfolioRowDto> rows(String entityType, String groupId, String entityId, Profile p, String month) {
        List<Object> args = new ArrayList<>(List.of(p.name(), params.minus(month, 3), entityType, p.name(), month));
        StringBuilder where = new StringBuilder();
        if (groupId != null) {
            where.append(" AND e.group_id = ?");
            args.add(groupId);
        }
        if (entityId != null) {
            where.append(" AND s.entity_id = ?");
            args.add(entityId);
        }
        record Base(String id, double fin, double level, Double traj, String band, String status, String regime,
                    String confidence, Double final3) {
        }
        List<Base> base = sql.query("""
                SELECT s.entity_id, s.final, s.level, s.traj, s.band, s.status, s.regime, s.confidence,
                       b.final AS final3
                FROM profile_scores s
                JOIN entities e ON e.entity_type = s.entity_type AND e.entity_id = s.entity_id
                LEFT JOIN profile_scores b ON b.entity_type = s.entity_type AND b.entity_id = s.entity_id
                     AND b.profile = ? AND b.month = ?
                WHERE s.entity_type = ? AND s.profile = ? AND s.month = ? AND s.final IS NOT NULL""" + where
                        + " ORDER BY s.final DESC",
                (rs, i) -> new Base(rs.getString("entity_id"), rs.getDouble("final"), rs.getDouble("level"),
                        Scores.dbl(rs, "traj"), rs.getString("band"), rs.getString("status"),
                        rs.getString("regime"), rs.getString("confidence"), Scores.dbl(rs, "final3")),
                args.toArray());
        Set<String> ids = base.stream().map(Base::id).collect(Collectors.toSet());
        Map<String, List<Double>> spark = sparklines(entityType, p, month, ids);
        Map<String, Integer> active = activeAlerts(entityType, p, month, ids);
        Map<String, Boolean> stars = risingStars(entityType, month, ids);
        return base.stream().map(b -> new PortfolioRowDto(b.id(), b.id(), entityType, Scores.round1(b.fin()),
                Scores.round1(b.level()), Scores.round1(b.traj()), b.band(), b.status(), b.regime(),
                b.final3() == null ? null : Scores.round1(b.fin() - b.final3()),
                spark.getOrDefault(b.id(), List.of()), active.getOrDefault(b.id(), 0), b.confidence(),
                stars.get(b.id()))).toList();
    }

    /** Negative active alert states at month (decision F16). Empty when alert_states is absent. */
    private Map<String, Integer> activeAlerts(String entityType, Profile p, String month, Set<String> ids) {
        Map<String, Integer> out = new HashMap<>();
        if (ids.isEmpty() || !DuckDbTables.exists(sql, "alert_states")) return out;
        sql.query("""
                SELECT entity_id, COUNT(*) FROM alert_states
                WHERE entity_type = ? AND profile = ? AND month = ? AND direction = 'NEGATIVE' GROUP BY 1""",
                (rs, i) -> {
                    if (ids.contains(rs.getString(1))) out.put(rs.getString(1), rs.getInt(2));
                    return null;
                },
                entityType, p.name(), month);
        return out;
    }

    /** rising_star of the momentum profile at month, whatever ?profile is. Empty when momentum_screen is absent. */
    private Map<String, Boolean> risingStars(String entityType, String month, Set<String> ids) {
        Map<String, Boolean> out = new HashMap<>();
        if (ids.isEmpty() || !DuckDbTables.exists(sql, "momentum_screen")) return out;
        sql.query("SELECT entity_id, rising_star FROM momentum_screen WHERE entity_type = ? AND profile = ? AND month = ?",
                (rs, i) -> {
                    if (ids.contains(rs.getString(1))) out.put(rs.getString(1), rs.getBoolean(2));
                    return null;
                },
                entityType, config.products().momentumProfile().name(), month);
        return out;
    }

    /** Non-null finals of the 12 months up to month, oldest first. */
    private Map<String, List<Double>> sparklines(String entityType, Profile p, String month, Set<String> ids) {
        Map<String, List<Double>> out = new HashMap<>();
        if (ids.isEmpty()) return out;
        sql.query("""
                SELECT entity_id, final FROM profile_scores
                WHERE entity_type = ? AND profile = ? AND month BETWEEN ? AND ? AND final IS NOT NULL
                ORDER BY entity_id, month""",
                (rs, i) -> {
                    String id = rs.getString(1);
                    if (ids.contains(id)) out.computeIfAbsent(id, k -> new ArrayList<>()).add(Scores.round1(rs.getDouble(2)));
                    return null;
                },
                entityType, p.name(), params.minus(month, SPARKLINE_MONTHS - 1), month);
        return out;
    }

    private static Comparator<PortfolioRowDto> order(String sort) {
        Function<PortfolioRowDto, Double> key = switch (sort == null ? "final" : sort) {
            case "delta3m" -> PortfolioRowDto::delta3m;
            case "level" -> PortfolioRowDto::level;
            case "traj" -> PortfolioRowDto::traj;
            case "final" -> PortfolioRowDto::finalScore;
            default -> throw new BadRequestException("Unknown sort " + sort + ". Use final, delta3m, level or traj.");
        };
        return Comparator.comparing(key, Comparator.nullsLast(Comparator.reverseOrder()));
    }

    private static Set<String> csv(String raw) {
        if (raw == null || raw.isBlank()) return Set.of();
        return Arrays.stream(raw.split(",")).map(s -> s.trim().toUpperCase(Locale.ROOT))
                .filter(s -> !s.isEmpty()).collect(Collectors.toSet());
    }
}
