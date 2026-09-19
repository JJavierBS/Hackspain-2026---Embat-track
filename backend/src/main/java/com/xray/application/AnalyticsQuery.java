package com.xray.application;

import com.xray.config.ScoringConfig;
import com.xray.domain.model.EventTrigger;
import com.xray.domain.model.EventType;
import com.xray.domain.model.Profile;
import com.xray.infrastructure.duckdb.DuckDbTables;
import com.xray.infrastructure.duckdb.SqlRunner;
import com.xray.infrastructure.web.dto.EntityEventDto;
import com.xray.infrastructure.web.dto.LeadTimeBlockDto;
import com.xray.infrastructure.web.dto.LeadTimeDto;
import com.xray.infrastructure.web.dto.LeadTimeExampleDto;
import com.xray.infrastructure.web.dto.ShowcasePairDto;
import com.xray.infrastructure.web.dto.ShowcasePairsDto;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * SPEC §8.4 lead time and SPEC §10.4 showcase pairs from the S90 tables (phase 6 contract item 6).
 * A GROUP BY over a few thousand rows, never a recomputation. The tables are missing before S90 has run:
 * every read then answers with zeros and empty lists, never a 500.
 */
@Service
public class AnalyticsQuery {

    private static final int MAX_EXAMPLES = 5;
    private static final int RATE_DECIMALS = 3;

    private final SqlRunner sql;
    private final ApiParams params;
    private final ScoringConfig config;

    public AnalyticsQuery(SqlRunner sql, ApiParams params, ScoringConfig config) {
        this.sql = sql;
        this.params = params;
        this.config = config;
    }

    public LeadTimeDto leadTime(String profileRaw) {
        Profile p = params.profile(profileRaw);
        ScoringConfig.LeadTimeConfig lt = config.leadTime();
        boolean ready = DuckDbTables.exists(sql, "lead_time_events") && DuckDbTables.exists(sql, "lead_time_signals");
        Map<EventType, Counts> counts = ready ? counts(p) : Map.of();
        Map<EventType, Map<Integer, Long>> histogram = ready ? histogram(p) : Map.of();
        Map<EventType, List<LeadTimeBlockDto.TriggerCountDto>> triggers = ready ? triggers(p) : Map.of();
        Map<EventType, Signals> signals = ready ? signals(p) : Map.of();
        return new LeadTimeDto(p.name(), params.unit().name(), lt.windowMonths(), lt.horizonMonths(),
                lt.minHistoryMonths(),
                block(EventType.DETERIORATION, counts, histogram, triggers, signals, lt.windowMonths()),
                block(EventType.IMPROVEMENT, counts, histogram, triggers, signals, lt.windowMonths()),
                p == config.products().limitProfile() ? limitBlock(p, ready) : null,
                ready ? examples(p) : List.of());
    }

    public ShowcasePairsDto showcasePairs(String profileRaw, String monthRaw) {
        Profile p = params.profile(profileRaw);
        String month = params.month(monthRaw);
        if (!DuckDbTables.exists(sql, "showcase_pairs")) {
            return new ShowcasePairsDto(p.name(), month, List.of());
        }
        List<ShowcasePairDto> pairs = sql.query("""
                SELECT rank, up_id, down_id, up_final, down_final, up_traj, down_traj, final_gap, traj_gap, meets_spec
                FROM showcase_pairs WHERE entity_type = ? AND profile = ? AND month = ? ORDER BY rank""",
                (rs, i) -> new ShowcasePairDto(rs.getInt("rank"), rs.getBoolean("meets_spec"),
                        side(rs.getString("up_id"), Scores.dbl(rs, "up_final"), Scores.dbl(rs, "up_traj")),
                        side(rs.getString("down_id"), Scores.dbl(rs, "down_final"), Scores.dbl(rs, "down_traj")),
                        Scores.round1(rs.getDouble("final_gap")), Scores.round1(rs.getDouble("traj_gap"))),
                params.unit().name(), p.name(), month);
        return new ShowcasePairsDto(p.name(), month, pairs);
    }

    /** The events of one entity, oldest first. upTo null = the whole series (decision G8). */
    public List<EntityEventDto> events(String type, String id, Profile p, String upTo) {
        if (!DuckDbTables.exists(sql, "lead_time_events")) {
            return List.of();
        }
        List<Object> args = new ArrayList<>(List.of(type, id, p.name()));
        String where = "entity_type = ? AND entity_id = ? AND profile = ?";
        if (upTo != null) {
            where += " AND event_month <= ?";
            args.add(upTo);
        }
        return sql.query("SELECT event_type, \"trigger\", event_month, signal_month, lead_months, "
                        + "limit_signal_month, limit_lead_months FROM lead_time_events WHERE " + where
                        + " ORDER BY event_month, event_type",
                (rs, i) -> new EntityEventDto(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4),
                        Scores.integer(rs, "lead_months"), rs.getString(6), Scores.integer(rs, "limit_lead_months")),
                args.toArray());
    }

    private static ShowcasePairDto.Side side(String id, Double finalScore, Double traj) {
        return new ShowcasePairDto.Side(id, id, Scores.round1(finalScore), Scores.round1(traj));
    }

    private record Counts(long events, long detected, long ahead, Double meanLead, Double medianLead) {
    }

    private record Signals(long signals, long evaluable, long followed, long baseEvaluable, long baseFollowed) {
    }

    private LeadTimeBlockDto block(EventType type, Map<EventType, Counts> counts,
                                   Map<EventType, Map<Integer, Long>> histogram,
                                   Map<EventType, List<LeadTimeBlockDto.TriggerCountDto>> triggers,
                                   Map<EventType, Signals> signals, int windowMonths) {
        Counts c = counts.getOrDefault(type, new Counts(0, 0, 0, null, null));
        Signals s = signals.getOrDefault(type, new Signals(0, 0, 0, 0, 0));
        Double hitRate = rate(s.followed(), s.evaluable());
        Double baseRate = rate(s.baseFollowed(), s.baseEvaluable());
        Map<Integer, Long> h = histogram.getOrDefault(type, Map.of());
        List<LeadTimeBlockDto.HistogramBucketDto> buckets = new ArrayList<>();
        for (int lead = 0; lead <= windowMonths; lead++) {
            buckets.add(new LeadTimeBlockDto.HistogramBucketDto(lead, h.getOrDefault(lead, 0L)));
        }
        return new LeadTimeBlockDto(type.name(), c.events(), c.detected(), c.ahead(),
                rate(c.detected(), c.events()), rate(c.ahead(), c.events()),
                Scores.round1(c.meanLead()), Scores.round1(c.medianLead()), buckets,
                triggers.getOrDefault(type, List.of()), s.signals(), s.evaluable(), s.followed(),
                s.evaluable() == 0 ? null : Scores.round(1 - (double) s.followed() / s.evaluable(), RATE_DECIMALS),
                hitRate, s.baseEvaluable(), s.baseFollowed(), baseRate,
                hitRate == null || baseRate == null || baseRate == 0 ? null : Scores.round(hitRate / baseRate, 2));
    }

    private static Double rate(long numerator, long denominator) {
        return denominator == 0 ? null : Scores.round((double) numerator / denominator, RATE_DECIMALS);
    }

    private Map<EventType, Counts> counts(Profile p) {
        Map<EventType, Counts> out = new EnumMap<>(EventType.class);
        sql.query("""
                SELECT event_type, COUNT(*) AS events, COUNT(lead_months) AS detected,
                       COUNT(*) FILTER (lead_months >= 1) AS ahead,
                       AVG(lead_months) AS mean_lead, MEDIAN(lead_months) AS median_lead
                FROM lead_time_events WHERE entity_type = ? AND profile = ? GROUP BY 1""",
                (rs, i) -> out.put(EventType.valueOf(rs.getString(1)),
                        new Counts(rs.getLong("events"), rs.getLong("detected"), rs.getLong("ahead"),
                                Scores.dbl(rs, "mean_lead"), Scores.dbl(rs, "median_lead"))),
                params.unit().name(), p.name());
        return out;
    }

    private Map<EventType, Map<Integer, Long>> histogram(Profile p) {
        Map<EventType, Map<Integer, Long>> out = new EnumMap<>(EventType.class);
        sql.query("SELECT event_type, lead_months, COUNT(*) FROM lead_time_events "
                        + "WHERE entity_type = ? AND profile = ? AND lead_months IS NOT NULL GROUP BY 1, 2",
                (rs, i) -> out.computeIfAbsent(EventType.valueOf(rs.getString(1)), k -> new HashMap<>())
                        .put(rs.getInt(2), rs.getLong(3)),
                params.unit().name(), p.name());
        return out;
    }

    private Map<EventType, List<LeadTimeBlockDto.TriggerCountDto>> triggers(Profile p) {
        Map<EventType, List<LeadTimeBlockDto.TriggerCountDto>> out = new EnumMap<>(EventType.class);
        sql.query("SELECT event_type, \"trigger\", COUNT(*) AS events, "
                        + "COUNT(*) FILTER (lead_months >= 1) AS ahead FROM lead_time_events "
                        + "WHERE entity_type = ? AND profile = ? GROUP BY 1, 2 ORDER BY 3 DESC, 2",
                (rs, i) -> out.computeIfAbsent(EventType.valueOf(rs.getString(1)), k -> new ArrayList<>())
                        .add(new LeadTimeBlockDto.TriggerCountDto(EventTrigger.valueOf(rs.getString(2)).name(),
                                rs.getLong("events"), rs.getLong("ahead"))),
                params.unit().name(), p.name());
        return out;
    }

    private Map<EventType, Signals> signals(Profile p) {
        Map<EventType, Signals> out = new EnumMap<>(EventType.class);
        sql.query("""
                SELECT event_type, COUNT(*) AS signals, COUNT(*) FILTER (evaluable) AS evaluable,
                       COUNT(*) FILTER (followed) AS followed
                FROM lead_time_signals WHERE entity_type = ? AND profile = ? GROUP BY 1""",
                (rs, i) -> out.put(EventType.valueOf(rs.getString(1)),
                        new Signals(rs.getLong("signals"), rs.getLong("evaluable"), rs.getLong("followed"), 0, 0)),
                params.unit().name(), p.name());
        if (DuckDbTables.exists(sql, "lead_time_baseline")) {
            sql.query("""
                    SELECT event_type, SUM(evaluable) AS evaluable, SUM(followed) AS followed
                    FROM lead_time_baseline WHERE entity_type = ? AND profile = ? GROUP BY 1""",
                    (rs, i) -> {
                        EventType type = EventType.valueOf(rs.getString(1));
                        Signals s = out.getOrDefault(type, new Signals(0, 0, 0, 0, 0));
                        return out.put(type, new Signals(s.signals(), s.evaluable(), s.followed(),
                                rs.getLong("evaluable"), rs.getLong("followed")));
                    },
                    params.unit().name(), p.name());
        }
        return out;
    }

    /** SPEC §10.1: on the limit profile, how often the limit engine cut the line before the event (decision G6). */
    private LeadTimeDto.LimitLeadDto limitBlock(Profile p, boolean ready) {
        if (!ready) {
            return new LeadTimeDto.LimitLeadDto(0, 0, null, null);
        }
        List<LeadTimeDto.LimitLeadDto> rows = sql.query("""
                SELECT COUNT(*) AS events, COUNT(*) FILTER (limit_lead_months >= 1) AS cut_ahead,
                       AVG(limit_lead_months) AS mean_lead, MEDIAN(limit_lead_months) AS median_lead
                FROM lead_time_events WHERE entity_type = ? AND profile = ? AND event_type = ?""",
                (rs, i) -> new LeadTimeDto.LimitLeadDto(rs.getLong("events"), rs.getLong("cut_ahead"),
                        Scores.round1(Scores.dbl(rs, "mean_lead")), Scores.round1(Scores.dbl(rs, "median_lead"))),
                params.unit().name(), p.name(), EventType.DETERIORATION.name());
        return rows.isEmpty() ? new LeadTimeDto.LimitLeadDto(0, 0, null, null) : rows.getFirst();
    }

    /** Up to 5 deterioration examples with the largest lead, then up to 5 improvement ones. */
    private List<LeadTimeExampleDto> examples(Profile p) {
        List<LeadTimeExampleDto> out = new ArrayList<>(examples(p, EventType.DETERIORATION));
        out.addAll(examples(p, EventType.IMPROVEMENT));
        return List.copyOf(out);
    }

    private List<LeadTimeExampleDto> examples(Profile p, EventType type) {
        return sql.query("""
                SELECT entity_id, event_type, "trigger", event_month, signal_month, lead_months,
                       limit_signal_month, limit_lead_months
                FROM lead_time_events
                WHERE entity_type = ? AND profile = ? AND event_type = ? AND lead_months IS NOT NULL
                ORDER BY lead_months DESC, entity_id""" + " LIMIT " + MAX_EXAMPLES,
                (rs, i) -> new LeadTimeExampleDto(rs.getString(1), rs.getString(1), rs.getString(2), rs.getString(3),
                        rs.getString(4), rs.getString(5), Scores.integer(rs, "lead_months"), rs.getString(7),
                        Scores.integer(rs, "limit_lead_months")),
                params.unit().name(), p.name(), type.name());
    }
}
