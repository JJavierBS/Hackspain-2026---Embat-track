package com.xray.application;

import com.xray.domain.model.Category;
import com.xray.domain.model.Profile;
import com.xray.infrastructure.duckdb.DuckDbTables;
import com.xray.infrastructure.duckdb.SqlRunner;
import com.xray.infrastructure.web.dto.CategoryDto;
import com.xray.infrastructure.web.dto.ChangeDto;
import com.xray.infrastructure.web.dto.DriverDto;
import com.xray.infrastructure.web.dto.EntityDetailDto;
import com.xray.infrastructure.web.dto.IndicatorRowDto;
import com.xray.infrastructure.web.dto.PortfolioRowDto;
import com.xray.infrastructure.web.dto.RecommendationsDto;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/** GET /api/entities/{id} (SPEC §12.5, §12.7): one read per section, no recomputation. */
@Service
public class EntityDetailQuery {

    private static final int TOP_DRIVERS = 5;
    private static final int MAX_ALERTS = 20;

    private final SqlRunner sql;
    private final ApiParams params;
    private final EntityLookup lookup;
    private final PortfolioQuery portfolio;
    private final ProfilesQuery profiles;
    private final TimelineQuery timeline;
    private final ProductQuery products;
    private final AlertReads alerts;
    private final AnalyticsQuery analytics;
    private final ForecastQuery forecast;

    public EntityDetailQuery(SqlRunner sql, ApiParams params, EntityLookup lookup, PortfolioQuery portfolio,
                             ProfilesQuery profiles, TimelineQuery timeline, ProductQuery products,
                             AlertReads alerts, AnalyticsQuery analytics, ForecastQuery forecast) {
        this.sql = sql;
        this.params = params;
        this.lookup = lookup;
        this.portfolio = portfolio;
        this.profiles = profiles;
        this.timeline = timeline;
        this.products = products;
        this.alerts = alerts;
        this.analytics = analytics;
        this.forecast = forecast;
    }

    public EntityDetailDto detail(String id, String profileRaw, String monthRaw, Integer horizon) {
        Profile p = params.profile(profileRaw);
        String month = params.month(monthRaw);
        EntityLookup.Entity e = lookup.find(id);
        List<PortfolioRowDto> row = portfolio.rows(e.type(), null, id, p, month);
        boolean explained = DuckDbTables.exists(sql, "contributions");
        List<PortfolioRowDto> companies = "GROUP".equals(e.type())
                ? portfolio.rows("COMPANY", id, null, p, month) : List.of();
        return new EntityDetailDto(id, id, e.type(), "GROUP".equals(e.type()) ? null : e.groupId(), p.name(), month,
                row.isEmpty() ? null : row.getFirst(),
                categories(e.type(), id, p, month, explained),
                explained ? drivers(e.type(), id, p, month) : List.of(),
                explained ? changes(e.type(), id, p, month, "delta1", "narrative_1m") : List.of(),
                explained ? changes(e.type(), id, p, month, "delta3", "narrative_3m") : List.of(),
                indicators(e.type(), id, month),
                timeline.points(e.type(), id, p, month),
                timeline.changepoints(e.type(), id, p, month),
                companies, products.limitOrNull(e.type(), id, month), products.premiumOrNull(e.type(), id, month),
                products.momentum(e.type(), id, month),
                alerts.read("entity_type = ? AND entity_id = ? AND profile = ? AND month <= ? ORDER BY month DESC, "
                        + AlertReads.SEVERITY_ORDER + ", code LIMIT " + MAX_ALERTS, e.type(), id, p.name(), month),
                analytics.events(e.type(), id, p, month), forecast.forecast(e.type(), id, p, month, horizon),
                recommendations(e.type(), id, p, month));
    }

    /** Written by S88. Empty (situation null) when the database predates that stage. */
    private RecommendationsDto recommendations(String type, String id, Profile p, String month) {
        if (!DuckDbTables.exists(sql, "recommendation_summaries")) {
            return RecommendationsDto.empty();
        }
        List<RecommendationsDto> summary = sql.query("""
                SELECT situation, text, history, limited_history, missing FROM recommendation_summaries
                WHERE entity_type = ? AND entity_id = ? AND profile = ? AND month = ?""",
                (rs, i) -> new RecommendationsDto(rs.getString(1), rs.getString(2), rs.getInt(3), rs.getBoolean(4),
                        rs.getString(5) == null || rs.getString(5).isEmpty() ? List.of()
                                : List.of(rs.getString(5).split(",")), List.of()),
                type, id, p.name(), month);
        if (summary.isEmpty()) {
            return RecommendationsDto.empty();
        }
        List<RecommendationsDto.Item> items = sql.query("""
                SELECT rank, indicator_id, category, kind, variant, severity, survival, worsening, points, value,
                       target, title, why, action, goal
                FROM recommendations WHERE entity_type = ? AND entity_id = ? AND profile = ? AND month = ?
                ORDER BY rank""",
                (rs, i) -> new RecommendationsDto.Item(rs.getInt(1), rs.getString(2), rs.getString(3), rs.getString(4),
                        rs.getString(5), rs.getString(6), rs.getBoolean(7), rs.getBoolean(8),
                        Scores.round1(Scores.dbl(rs, "points")), Scores.dbl(rs, "value"), Scores.dbl(rs, "target"),
                        rs.getString(12), rs.getString(13), rs.getString(14), rs.getString(15)),
                type, id, p.name(), month);
        RecommendationsDto s = summary.getFirst();
        return new RecommendationsDto(s.situation(), s.summary(), s.history(), s.limitedHistory(), s.missing(), items);
    }

    private List<CategoryDto> categories(String type, String id, Profile p, String month, boolean explained) {
        record Cat(Double level, Double traj, int n) {
        }
        Map<Category, Cat> cats = new EnumMap<>(Category.class);
        sql.query("SELECT category, level, traj, n_available FROM category_scores "
                        + "WHERE entity_type = ? AND entity_id = ? AND month = ?",
                (rs, i) -> cats.put(Category.valueOf(rs.getString(1)),
                        new Cat(Scores.dbl(rs, "level"), Scores.dbl(rs, "traj"), rs.getInt("n_available"))),
                type, id, month);
        List<Double> momentum = sql.query("SELECT momentum FROM profile_scores "
                        + "WHERE entity_type = ? AND entity_id = ? AND profile = ? AND month = ?",
                (rs, i) -> Scores.dbl(rs, "momentum"), type, id, p.name(), month);
        cats.put(Category.MOMENTUM, new Cat(momentum.isEmpty() ? null : momentum.getFirst(), null, 0));

        Map<Category, double[]> now = explained ? sums(type, id, p, month) : Map.of();
        Map<Category, double[]> before = explained ? sums(type, id, p, params.minus(month, 3)) : Map.of();
        boolean hasBefore = !before.isEmpty();
        Map<Category, Double> weights = profiles.weights(p);
        List<CategoryDto> out = new ArrayList<>();
        for (Category c : Category.values()) {
            Cat x = cats.getOrDefault(c, new Cat(null, null, 0));
            double[] s = now.getOrDefault(c, new double[]{0, 0});
            Double d3 = hasBefore ? Scores.round1(s[0] - before.getOrDefault(c, new double[]{0, 0})[0]) : null;
            out.add(new CategoryDto(c.name(), Scores.round1(x.level()), Scores.round1(x.traj()),
                    weights.getOrDefault(c, 0.0), Math.round(s[1] * 1000) / 1000.0, Scores.round1(s[0]), d3, x.n()));
        }
        return out;
    }

    /** category -> {Σ contrib, Σ eff_weight} at one month. Empty when the month has no final score. */
    private Map<Category, double[]> sums(String type, String id, Profile p, String month) {
        Map<Category, double[]> out = new EnumMap<>(Category.class);
        sql.query("SELECT category, SUM(contrib), SUM(eff_weight) FROM contributions "
                        + "WHERE entity_type = ? AND entity_id = ? AND profile = ? AND month = ? GROUP BY 1",
                (rs, i) -> out.put(Category.valueOf(rs.getString(1)), new double[]{rs.getDouble(2), rs.getDouble(3)}),
                type, id, p.name(), month);
        return out;
    }

    /** Top 5 positive and top 5 negative contributions, highest first (SPEC §7.5 "why this number"). */
    private List<DriverDto> drivers(String type, String id, Profile p, String month) {
        List<DriverDto> all = sql.query("""
                SELECT driver_id, category, contrib, blended, eff_weight FROM contributions
                WHERE entity_type = ? AND entity_id = ? AND profile = ? AND month = ? ORDER BY contrib DESC""",
                (rs, i) -> new DriverDto(rs.getString(1), rs.getString(2), Scores.round1(rs.getDouble(3)),
                        Scores.round1(rs.getDouble(4)), Math.round(rs.getDouble(5) * 1000) / 1000.0),
                type, id, p.name(), month);
        List<DriverDto> pos = all.stream().filter(d -> d.contrib() > 0).limit(TOP_DRIVERS).toList();
        List<DriverDto> neg = all.reversed().stream().filter(d -> d.contrib() < 0).limit(TOP_DRIVERS).toList();
        List<DriverDto> out = new ArrayList<>(pos);
        out.addAll(neg.reversed());
        return out;
    }

    /** Rows with a narrative, biggest |delta| first. deltaColumn and narrativeColumn are literals of this class. */
    private List<ChangeDto> changes(String type, String id, Profile p, String month, String deltaColumn,
                                    String narrativeColumn) {
        return sql.query("SELECT driver_id, category, " + deltaColumn + ", " + narrativeColumn + " FROM contributions "
                        + "WHERE entity_type = ? AND entity_id = ? AND profile = ? AND month = ? AND "
                        + narrativeColumn + " IS NOT NULL ORDER BY ABS(" + deltaColumn + ") DESC",
                (rs, i) -> new ChangeDto(rs.getString(1), rs.getString(2), Scores.round1(rs.getDouble(3)),
                        rs.getString(4)),
                type, id, p.name(), month);
    }

    private List<IndicatorRowDto> indicators(String type, String id, String month) {
        return sql.query("""
                SELECT indicator_id, category, value, level_score, traj_score, available, is_static, fallback,
                       anchor_status
                FROM indicator_values WHERE entity_type = ? AND entity_id = ? AND month = ?
                ORDER BY category, indicator_id""",
                (rs, i) -> new IndicatorRowDto(rs.getString(1), rs.getString(2), Scores.dbl(rs, "value"),
                        Scores.round1(Scores.dbl(rs, "level_score")), Scores.round1(Scores.dbl(rs, "traj_score")),
                        rs.getBoolean("available"), rs.getBoolean("is_static"), rs.getBoolean("fallback"),
                        rs.getString("anchor_status")),
                type, id, month);
    }
}
