package com.xray.application;

import com.xray.config.ScoringConfig;
import com.xray.domain.model.LimitDecision;
import com.xray.domain.model.LimitSimulation;
import com.xray.domain.service.LimitEngine;
import com.xray.infrastructure.web.dto.LimitSimulationDto;
import com.xray.infrastructure.web.dto.SimulateLimitRequest;
import org.springframework.stereotype.Service;

/**
 * POST /api/entities/{id}/limit/simulate (SPEC §10.1, overview F8): O(1) arithmetic on the stored
 * limit_decisions row with the user's amount and term. The one request that computes. Writes nothing.
 */
@Service
public class SimulateLimitUseCase {

    private static final int MIN_TERM_MONTHS = 1;
    private static final int MAX_TERM_MONTHS = 120;

    private final ApiParams params;
    private final EntityLookup lookup;
    private final ProductQuery products;
    private final ScoringConfig config;

    public SimulateLimitUseCase(ApiParams params, EntityLookup lookup, ProductQuery products, ScoringConfig config) {
        this.params = params;
        this.lookup = lookup;
        this.products = products;
        this.config = config;
    }

    public LimitSimulationDto simulate(String id, SimulateLimitRequest body) {
        if (body == null || body.requestedAmountEur() == null || !(body.requestedAmountEur() > 0)) {
            throw new BadRequestException("requestedAmountEur must be > 0");
        }
        int term = body.termMonths() == null ? config.limitEngine().defaultTermMonths() : body.termMonths();
        if (term < MIN_TERM_MONTHS || term > MAX_TERM_MONTHS) {
            throw new BadRequestException("termMonths " + term + " is outside [" + MIN_TERM_MONTHS + ", "
                    + MAX_TERM_MONTHS + "]");
        }
        String month = params.month(body.month());
        EntityLookup.Entity e = lookup.find(id);
        LimitDecision d = products.decisionOrNull(e.type(), id, month);
        if (d == null) throw new NotFoundException("No limit decision for " + id + " at " + month);
        LimitSimulation s = LimitEngine.simulate(d, body.requestedAmountEur(), term, config.limitEngine().toParams());
        return new LimitSimulationDto(month, s.decision(), Math.round(s.requestedEur()), Math.round(s.approvedEur()),
                Math.round(s.capacityEur()), s.termMonths(), s.spreadBps(), Scores.round(s.allInRate(), 4),
                Scores.round(s.projectedDscr(), 2), s.bindingConstraint().name());
    }
}
