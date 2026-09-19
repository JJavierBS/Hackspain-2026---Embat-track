package com.xray.application;

import com.xray.domain.model.Profile;
import com.xray.infrastructure.duckdb.DuckDbTables;
import com.xray.infrastructure.duckdb.SqlRunner;
import com.xray.infrastructure.web.dto.AlertDto;
import com.xray.infrastructure.web.dto.MonitorDto;
import com.xray.infrastructure.web.dto.PortfolioRowDto;
import com.xray.infrastructure.web.dto.ReplayFrameDto;
import com.xray.infrastructure.web.dto.WatchlistDto;
import com.xray.infrastructure.web.dto.WatchlistRowDto;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/** GET /api/monitor/* (SPEC §8.5, phase 5 contract item 8). Reads alerts, alert_states and watchlist of the unit. */
@Service
public class MonitorQuery {

    private static final int DEFAULT_WINDOW = 6;
    private static final int MAX_WINDOW = 24;
    private static final Set<String> SEVERITIES = Set.of("WARN", "CRITICAL", "INFO");
    private static final Set<String> DIRECTIONS = Set.of("NEGATIVE", "POSITIVE");

    private final SqlRunner sql;
    private final ApiParams params;
    private final PortfolioQuery portfolio;
    private final AlertReads alerts;

    public MonitorQuery(SqlRunner sql, ApiParams params, PortfolioQuery portfolio, AlertReads alerts) {
        this.sql = sql;
        this.params = params;
        this.portfolio = portfolio;
        this.alerts = alerts;
    }

    public MonitorDto alerts(String profileRaw, String monthRaw, String severityRaw, String directionRaw,
                             Integer windowRaw) {
        Profile p = params.profile(profileRaw);
        String month = params.month(monthRaw);
        int window = windowRaw == null ? DEFAULT_WINDOW : windowRaw;
        if (window < 1 || window > MAX_WINDOW) {
            throw new BadRequestException("window " + window + " is outside [1, " + MAX_WINDOW + "]");
        }
        String severity = choice("severity", severityRaw, SEVERITIES);
        String direction = choice("direction", directionRaw, DIRECTIONS);
        String from = params.minus(month, window - 1);

        StringBuilder where = new StringBuilder("entity_type = ? AND profile = ? AND month BETWEEN ? AND ?");
        List<Object> args = new ArrayList<>(List.of(params.unit().name(), p.name(), from, month));
        if (severity != null) {
            where.append(" AND severity = ?");
            args.add(severity);
        }
        if (direction != null) {
            where.append(" AND direction = ?");
            args.add(direction);
        }
        where.append(" ORDER BY month DESC, ").append(AlertReads.SEVERITY_ORDER).append(", entity_id, code");
        return new MonitorDto(p.name(), month, from, alerts.read(where.toString(), args.toArray()),
                watchlist(p, month));
    }

    public WatchlistDto watchlist(String profileRaw, String monthRaw) {
        Profile p = params.profile(profileRaw);
        String month = params.month(monthRaw);
        return new WatchlistDto(p.name(), month, watchlist(p, month));
    }

    public List<WatchlistRowDto> watchlist(Profile p, String month) {
        String unit = params.unit().name();
        if (!DuckDbTables.exists(sql, "watchlist")) return List.of();
        record W(String id, int critical, int warn, List<String> codes) {
        }
        // codes: the confirmed and new negative alerts that put the entity on the list (S80).
        List<W> listed = sql.query(
                "SELECT entity_id, n_critical, n_warn, codes FROM watchlist "
                        + "WHERE entity_type = ? AND profile = ? AND month = ?",
                (rs, i) -> new W(rs.getString(1), rs.getInt(2), rs.getInt(3), codes(rs.getString(4))),
                unit, p.name(), month);
        if (listed.isEmpty()) return List.of();
        Map<String, PortfolioRowDto> rows = portfolio.rows(unit, null, null, p, month).stream()
                .collect(Collectors.toMap(PortfolioRowDto::id, Function.identity()));
        return listed.stream()
                .filter(w -> rows.containsKey(w.id()))
                .map(w -> new WatchlistRowDto(rows.get(w.id()), w.critical(), w.warn(),
                        w.codes()))
                .sorted(Comparator.comparingInt(WatchlistRowDto::criticalAlerts).reversed()
                        .thenComparing(Comparator.comparingInt(WatchlistRowDto::warnAlerts).reversed())
                        .thenComparingDouble(r -> r.row().finalScore()))
                .toList();
    }

    /** One frame per month in from..to with that month's alerts of the unit and the watchlist size. */
    public List<ReplayFrameDto> frames(Profile p, String from, String to) {
        String unit = params.unit().name();
        Map<String, List<AlertDto>> byMonth = alerts.read("entity_type = ? AND profile = ? AND month BETWEEN ? AND ? "
                        + "ORDER BY month, " + AlertReads.SEVERITY_ORDER + ", entity_id, code", unit, p.name(), from, to)
                .stream().collect(Collectors.groupingBy(AlertDto::month));
        Map<String, Integer> sizes = new HashMap<>();
        if (DuckDbTables.exists(sql, "watchlist")) {
            sql.query("SELECT month, COUNT(*) FROM watchlist WHERE entity_type = ? AND profile = ? "
                            + "AND month BETWEEN ? AND ? GROUP BY 1",
                    (rs, i) -> sizes.put(rs.getString(1), rs.getInt(2)), unit, p.name(), from, to);
        }
        return params.months().stream()
                .filter(m -> m.compareTo(from) >= 0 && m.compareTo(to) <= 0)
                .map(m -> new ReplayFrameDto(m, byMonth.getOrDefault(m, List.of()), sizes.getOrDefault(m, 0)))
                .toList();
    }

    private static List<String> codes(String csv) {
        return csv == null || csv.isBlank() ? List.of() : List.of(csv.split(","));
    }

    private static String choice(String name, String raw, Set<String> allowed) {
        if (raw == null || raw.isBlank()) return null;
        String v = raw.trim().toUpperCase(Locale.ROOT);
        if (!allowed.contains(v)) {
            throw new BadRequestException("Unknown " + name + " " + raw + ". Use "
                    + String.join(", ", allowed.stream().sorted().toList()) + ".");
        }
        return v;
    }
}
