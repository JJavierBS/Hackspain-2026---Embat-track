package com.xray.infrastructure.web.controller;

import com.xray.application.EntityDetailQuery;
import com.xray.application.ProductQuery;
import com.xray.application.SimulateLimitUseCase;
import com.xray.application.TimelineQuery;
import com.xray.infrastructure.web.dto.EntityDetailDto;
import com.xray.infrastructure.web.dto.LimitDecisionDto;
import com.xray.infrastructure.web.dto.LimitSimulationDto;
import com.xray.infrastructure.web.dto.PremiumQuoteDto;
import com.xray.infrastructure.web.dto.SimulateLimitRequest;
import com.xray.infrastructure.web.dto.TimelineDto;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/entities")
public class EntityController {

    private final EntityDetailQuery detail;
    private final TimelineQuery timeline;
    private final ProductQuery products;
    private final SimulateLimitUseCase simulator;

    public EntityController(EntityDetailQuery detail, TimelineQuery timeline, ProductQuery products,
                            SimulateLimitUseCase simulator) {
        this.detail = detail;
        this.timeline = timeline;
        this.products = products;
        this.simulator = simulator;
    }

    @GetMapping("/{id}")
    public EntityDetailDto detail(@PathVariable String id, @RequestParam(required = false) String profile,
                                  @RequestParam(required = false) String month) {
        return detail.detail(id, profile, month);
    }

    @GetMapping("/{id}/timeline")
    public TimelineDto timeline(@PathVariable String id, @RequestParam(required = false) String profile) {
        return timeline.timeline(id, profile);
    }

    @GetMapping("/{id}/limit")
    public LimitDecisionDto limit(@PathVariable String id, @RequestParam(required = false) String month) {
        return products.limit(id, month);
    }

    @PostMapping("/{id}/limit/simulate")
    public LimitSimulationDto simulate(@PathVariable String id, @RequestBody(required = false) SimulateLimitRequest body) {
        return simulator.simulate(id, body);
    }

    @GetMapping("/{id}/premium")
    public PremiumQuoteDto premium(@PathVariable String id, @RequestParam(required = false) String month) {
        return products.premium(id, month);
    }
}
