package com.xray.pipeline.stages;

import com.xray.config.ScoringConfig;
import com.xray.domain.model.EntityPanel;
import com.xray.domain.model.EntityType;
import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.LimitDecision;
import com.xray.domain.model.MomentumPoint;
import com.xray.domain.model.PremiumQuote;
import com.xray.domain.model.Profile;
import com.xray.domain.model.ProfileScore;
import com.xray.domain.model.RawIndicator;
import com.xray.domain.model.SignalId;
import com.xray.domain.service.LimitEngine;
import com.xray.domain.service.MomentumScreen;
import com.xray.domain.service.PremiumEngine;
import com.xray.infrastructure.duckdb.ResultWriter;
import com.xray.pipeline.PipelineContext;
import com.xray.pipeline.PipelineStage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

/**
 * SPEC §10.1–§10.3 products: working-capital limit, trade-credit premium and momentum screen
 * (overview contract items 3–5). Runs before S80 because LIMIT_ACTION reads the limits (decision F3).
 */
@Component
@Order(75)
public class S75_Products implements PipelineStage {

    private static final Logger log = LoggerFactory.getLogger(S75_Products.class);

    static final String LIMIT_DDL = "entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, profile VARCHAR, "
            + "final DOUBLE, traj DOUBLE, band VARCHAR, base_eur DOUBLE, factor DOUBLE, trend DOUBLE, "
            + "runway_guard BOOLEAN, raw_limit_eur DOUBLE, nocf_12m DOUBLE, debt_service_12m DOUBLE, "
            + "dscr_cap_eur DOUBLE, limit_eur DOUBLE, prev_limit_eur DOUBLE, spread_bps INTEGER, "
            + "all_in_rate DOUBLE, action VARCHAR, binding_constraint VARCHAR, projected_dscr DOUBLE";
    static final String PREMIUM_DDL = "entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, profile VARCHAR, "
            + "final DOUBLE, band VARCHAR, insurable BOOLEAN, premium_rate DOUBLE, prev_premium_rate DOUBLE, "
            + "prev_band VARCHAR, buyer_limit_eur DOUBLE, tier_change VARCHAR";
    static final String MOMENTUM_DDL = "entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, profile VARCHAR, "
            + "final DOUBLE, rank INTEGER, of_count INTEGER, traj_percentile INTEGER, growth_percentile INTEGER, "
            + "rising_star BOOLEAN";

    private final ResultWriter writer;

    public S75_Products(ResultWriter writer) {
        this.writer = writer;
    }

    @Override
    public String id() {
        return "S75_PRODUCTS";
    }

    @Override
    public void execute(PipelineContext ctx) {
        if (ctx.panels().isEmpty()) {
            ctx.report(id(), 75, "skipped: no panels");
            return;
        }
        ScoringConfig.ProductsConfig products = ctx.config().products();
        LimitEngine.Params lp = ctx.config().limitEngine().toParams();
        PremiumEngine.Params pp = ctx.config().insurer().toParams();
        MomentumScreen.Params mp = products.momentum().toParams();

        List<Object[]> limitRows = ctx.panels().parallelStream()
                .flatMap(panel -> limits(panel, products.limitProfile(), lp).stream()).toList();
        List<Object[]> premiumRows = ctx.panels().parallelStream()
                .flatMap(panel -> premiums(panel, products.premiumProfile(), pp, lp).stream()).toList();
        List<Object[]> momentumRows = momentum(ctx.panels(), products.momentumProfile(), mp);

        writer.replace("limit_decisions", LIMIT_DDL, limitRows);
        writer.replace("premium_quotes", PREMIUM_DDL, premiumRows);
        writer.replace("momentum_screen", MOMENTUM_DDL, momentumRows);
        log.info("{} wrote {} limit, {} premium, {} momentum rows", id(), limitRows.size(), premiumRows.size(),
                momentumRows.size());
        ctx.report(id(), 78, limitRows.size() + " limit decisions");
    }

    private static Double value(EntityPanel panel, IndicatorId id, int m) {
        RawIndicator r = panel.raw(id, m);
        return r.available() ? r.value() : null;
    }

    private static boolean scored(ProfileScore[] s, int m) {
        return s != null && s[m] != null && s[m].finalScore() != null;
    }

    private static List<Object[]> limits(EntityPanel panel, Profile profile, LimitEngine.Params lp) {
        ProfileScore[] s = panel.profileScores(profile);
        List<Object[]> rows = new ArrayList<>();
        if (s == null) {
            return rows;
        }
        LimitDecision[] out = new LimitDecision[panel.size()];
        LimitDecision prev = null;
        for (int m = 0; m < panel.size(); m++) {
            Double base = panel.signal(SignalId.OP_IN_MEDIAN_3M, m);
            if (!scored(s, m) || base == null) {
                prev = null;
                continue;
            }
            ProfileScore x = s[m];
            LimitDecision d = LimitEngine.decide(new LimitEngine.Inputs(x.finalScore(), x.traj(), x.band(), base,
                    value(panel, IndicatorId.LIQ_RUNWAY, m), panel.signal(SignalId.NOCF_12M_ANN, m),
                    panel.signal(SignalId.DEBT_SERVICE_12M_ANN, m), prev == null ? null : prev.limitEur()), lp);
            out[m] = d;
            prev = d;
            rows.add(new Object[]{panel.key().type().name(), panel.key().id(), panel.months().get(m).toString(),
                    profile.name(), d.finalScore(), d.traj(), d.band().name(), d.baseEur(), d.factor(), d.trend(),
                    d.runwayGuard(), d.rawLimitEur(), d.nocf12m(), d.debtService12m(), d.dscrCapEur(), d.limitEur(),
                    d.prevLimitEur(), d.spreadBps(), d.allInRate(), d.action().name(), d.bindingConstraint().name(),
                    d.projectedDscr()});
        }
        panel.setLimits(out);
        return rows;
    }

    private static List<Object[]> premiums(EntityPanel panel, Profile profile, PremiumEngine.Params pp,
                                           LimitEngine.Params lp) {
        ProfileScore[] s = panel.profileScores(profile);
        List<Object[]> rows = new ArrayList<>();
        if (s == null) {
            return rows;
        }
        PremiumQuote prev = null;
        for (int m = 0; m < panel.size(); m++) {
            if (!scored(s, m)) {
                prev = null;
                continue;
            }
            PremiumQuote q = PremiumEngine.quote(s[m].finalScore(), s[m].band(),
                    panel.signal(SignalId.OP_OUT_AVG_3M, m), value(panel, IndicatorId.PAY_DPO, m), prev, pp, lp);
            prev = q;
            rows.add(new Object[]{panel.key().type().name(), panel.key().id(), panel.months().get(m).toString(),
                    profile.name(), q.finalScore(), q.band().name(), q.insurable(), q.premiumRate(),
                    q.prevPremiumRate(), q.prevBand() == null ? null : q.prevBand().name(), q.buyerLimitEur(),
                    q.tierChange() == null ? null : q.tierChange().name()});
        }
        return rows;
    }

    private static List<Object[]> momentum(List<EntityPanel> panels, Profile profile, MomentumScreen.Params mp) {
        Map<EntityType, List<EntityPanel>> byType = panels.stream()
                .collect(Collectors.groupingBy(p -> p.key().type()));
        int months = panels.getFirst().size();
        return byType.values().parallelStream()
                .flatMap(group -> IntStream.range(0, months).boxed().flatMap(m -> {
                    List<MomentumScreen.Peer> peers = new ArrayList<>();
                    Map<String, EntityPanel> byId = new HashMap<>();
                    for (EntityPanel panel : group) {
                        ProfileScore[] s = panel.profileScores(profile);
                        if (!scored(s, m)) continue;
                        peers.add(new MomentumScreen.Peer(panel.key().id(), s[m].finalScore(), s[m].level(),
                                s[m].traj(), value(panel, IndicatorId.ACT_COLLECTIONS_GROWTH, m)));
                        byId.put(panel.key().id(), panel);
                    }
                    Map<String, MomentumPoint> screen = MomentumScreen.screen(peers, mp);
                    return peers.stream().map(peer -> {
                        EntityPanel panel = byId.get(peer.entityId());
                        MomentumPoint x = screen.get(peer.entityId());
                        return new Object[]{panel.key().type().name(), peer.entityId(),
                                panel.months().get(m).toString(), profile.name(), peer.finalScore(), x.rank(), x.of(),
                                x.trajPercentile(), x.growthPercentile(), x.risingStar()};
                    });
                }))
                .toList();
    }
}
