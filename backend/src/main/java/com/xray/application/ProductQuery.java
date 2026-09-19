package com.xray.application;

import com.xray.config.ScoringConfig;
import com.xray.domain.model.Band;
import com.xray.domain.model.BindingConstraint;
import com.xray.domain.model.LimitAction;
import com.xray.domain.model.LimitDecision;
import com.xray.infrastructure.duckdb.DuckDbTables;
import com.xray.infrastructure.duckdb.SqlRunner;
import com.xray.infrastructure.web.dto.LimitDecisionDto;
import com.xray.infrastructure.web.dto.MomentumDto;
import com.xray.infrastructure.web.dto.PremiumQuoteDto;
import org.springframework.stereotype.Service;

import java.util.List;

/** Reads limit_decisions, premium_quotes and momentum_screen (phase 5 contract items 3–5, 8). No recomputation. */
@Service
public class ProductQuery {

    private final SqlRunner sql;
    private final ApiParams params;
    private final EntityLookup lookup;
    private final ScoringConfig config;

    public ProductQuery(SqlRunner sql, ApiParams params, EntityLookup lookup, ScoringConfig config) {
        this.sql = sql;
        this.params = params;
        this.lookup = lookup;
        this.config = config;
    }

    public LimitDecisionDto limit(String id, String monthRaw) {
        String month = params.month(monthRaw);
        EntityLookup.Entity e = lookup.find(id);
        LimitDecisionDto dto = limitOrNull(e.type(), id, month);
        if (dto == null) throw new NotFoundException("No limit decision for " + id + " at " + month);
        return dto;
    }

    public PremiumQuoteDto premium(String id, String monthRaw) {
        String month = params.month(monthRaw);
        EntityLookup.Entity e = lookup.find(id);
        PremiumQuoteDto dto = premiumOrNull(e.type(), id, month);
        if (dto == null) throw new NotFoundException("No premium quote for " + id + " at " + month);
        return dto;
    }

    public LimitDecisionDto limitOrNull(String type, String id, String month) {
        LimitDecision d = decisionOrNull(type, id, month);
        if (d == null) return null;
        return new LimitDecisionDto(month, config.products().limitProfile().name(), Scores.round1(d.finalScore()),
                d.band().name(), Math.round(d.limitEur()), Scores.eur(d.prevLimitEur()), d.action().name(),
                d.bindingConstraint().name(), d.spreadBps(), Scores.round(d.allInRate(), 4),
                Scores.round(d.projectedDscr(), 2), Math.round(d.baseEur()), Scores.round(d.factor(), 3),
                Scores.round(d.trend(), 3), d.runwayGuard(), Scores.eur(d.dscrCapEur()));
    }

    /** The stored limit_decisions row as the domain record, or null (table or row missing). */
    public LimitDecision decisionOrNull(String type, String id, String month) {
        if (!DuckDbTables.exists(sql, "limit_decisions")) return null;
        List<LimitDecision> rows = sql.query("""
                SELECT * FROM limit_decisions WHERE entity_type = ? AND entity_id = ? AND month = ? AND profile = ?""",
                (rs, i) -> new LimitDecision(rs.getDouble("final"), Scores.dbl(rs, "traj"),
                        Band.valueOf(rs.getString("band")), rs.getDouble("base_eur"), rs.getDouble("factor"),
                        rs.getDouble("trend"), rs.getBoolean("runway_guard"), rs.getDouble("raw_limit_eur"),
                        Scores.dbl(rs, "nocf_12m"), Scores.dbl(rs, "debt_service_12m"), Scores.dbl(rs, "dscr_cap_eur"),
                        rs.getDouble("limit_eur"), Scores.dbl(rs, "prev_limit_eur"), Scores.integer(rs, "spread_bps"),
                        Scores.dbl(rs, "all_in_rate"), LimitAction.valueOf(rs.getString("action")),
                        BindingConstraint.valueOf(rs.getString("binding_constraint")),
                        Scores.dbl(rs, "projected_dscr")),
                type, id, month, config.products().limitProfile().name());
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public PremiumQuoteDto premiumOrNull(String type, String id, String month) {
        if (!DuckDbTables.exists(sql, "premium_quotes")) return null;
        List<PremiumQuoteDto> rows = sql.query("""
                SELECT * FROM premium_quotes WHERE entity_type = ? AND entity_id = ? AND month = ? AND profile = ?""",
                (rs, i) -> new PremiumQuoteDto(month, rs.getString("profile"), Scores.round1(rs.getDouble("final")),
                        rs.getString("band"), rs.getBoolean("insurable"),
                        Scores.round(Scores.dbl(rs, "premium_rate"), 4),
                        Scores.round(Scores.dbl(rs, "prev_premium_rate"), 4), rs.getString("prev_band"),
                        rs.getString("tier_change"), Scores.eur(Scores.dbl(rs, "buyer_limit_eur"))),
                type, id, month, config.products().premiumProfile().name());
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public MomentumDto momentum(String type, String id, String month) {
        if (!DuckDbTables.exists(sql, "momentum_screen")) return null;
        List<MomentumDto> rows = sql.query("""
                SELECT * FROM momentum_screen WHERE entity_type = ? AND entity_id = ? AND month = ? AND profile = ?""",
                (rs, i) -> new MomentumDto(month, rs.getString("profile"), rs.getInt("rank"), rs.getInt("of_count"),
                        Scores.integer(rs, "traj_percentile"), Scores.integer(rs, "growth_percentile"),
                        rs.getBoolean("rising_star")),
                type, id, month, config.products().momentumProfile().name());
        return rows.isEmpty() ? null : rows.getFirst();
    }
}
