package com.xray.application;

import com.xray.alerting.AlertRule;
import com.xray.config.LimitEngineConfig;
import com.xray.config.ScoringConfig;
import com.xray.infrastructure.duckdb.DuckDbTables;
import com.xray.infrastructure.duckdb.SqlRunner;
import com.xray.infrastructure.web.dto.MethodologyDto;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** GET /api/methodology (decision F20): the alert catalogue and the product parameters. No weights (item 9). */
@Service
public class MethodologyQuery {

    /** SPEC §8.5 order (overview contract item 6). */
    static final List<String> CODE_ORDER = List.of("RUNWAY_LOW", "DSCR_BREACH", "LINE_UTIL_HIGH", "DSO_DRIFT",
            "SUPPLIER_LATENESS_UP", "OVERDUE_RECEIVABLES", "TAX_GAP", "CONCENTRATION_HIGH", "FACTORING_SPIKE",
            "SCORE_DROP", "STRUCTURAL_DECLINE", "STRUCTURAL_IMPROVEMENT", "BAND_UPGRADE", "BAND_DOWNGRADE",
            "LIMIT_ACTION");

    /** CLAUDE.md open items: reference-rate is an example value, not agreed with the experts. A disclosure. */
    private static final boolean REFERENCE_RATE_IS_EXAMPLE = true;

    private final SqlRunner sql;
    private final ApiParams params;
    private final ScoringConfig config;
    private final List<AlertRule> rules;

    public MethodologyQuery(SqlRunner sql, ApiParams params, ScoringConfig config, List<AlertRule> rules) {
        this.sql = sql;
        this.params = params;
        this.config = config;
        this.rules = rules;
    }

    public MethodologyDto methodology() {
        Map<String, Long> fired = new HashMap<>();
        if (DuckDbTables.exists(sql, "alerts")) {
            sql.query("SELECT code, COUNT(*) FROM alerts WHERE entity_type = ? GROUP BY 1",
                    (rs, i) -> fired.put(rs.getString(1), rs.getLong(2)), params.unit().name());
        }
        List<MethodologyDto.AlertRuleDto> alertRules = rules.stream()
                .sorted(Comparator.comparingInt(r -> {
                    int k = CODE_ORDER.indexOf(r.code());
                    return k < 0 ? CODE_ORDER.size() : k;
                }))
                .map(r -> new MethodologyDto.AlertRuleDto(r.code(), r.direction().name(), r.event(), r.trigger(),
                        fired.getOrDefault(r.code(), 0L)))
                .toList();
        ScoringConfig.ProductsConfig p = config.products();
        LimitEngineConfig l = config.limitEngine();
        ScoringConfig.WatchlistConfig w = config.alerts().watchlist();
        ScoringConfig.ForecastConfig f = config.forecast();
        return new MethodologyDto(alertRules,
                new MethodologyDto.Products(p.limitProfile().name(), p.premiumProfile().name(),
                        p.momentumProfile().name()),
                new MethodologyDto.LimitEngine(l.scoreFloor(), l.factorAtFloor(), l.factorAt100(),
                        l.trendModifierSpan(), l.runwayGuard().belowMonths(), l.runwayGuard().multiplier(),
                        l.dscrMin(), l.defaultTermMonths(), l.referenceRate(), REFERENCE_RATE_IS_EXAMPLE,
                        l.spreadBpsByBand(), l.actionThreshold(), l.roundingEur()),
                new MethodologyDto.Insurer(config.insurer().basePremiumRate(), config.insurer().multiplierByBand()),
                new MethodologyDto.Momentum(p.momentum().risingStarMaxLevel(), p.momentum().risingStarMinTraj()),
                new MethodologyDto.Watchlist(w.minCritical(), w.minWarn(), w.confirmMonths(), w.recentMonths()),
                new MethodologyDto.Forecast("MEAN_REVERSION_AR1", f.meanReversion(), f.maxHorizonMonths(),
                        f.minPoints(), f.minHistoryMonths(), f.mediumHistoryMonths()));
    }
}
