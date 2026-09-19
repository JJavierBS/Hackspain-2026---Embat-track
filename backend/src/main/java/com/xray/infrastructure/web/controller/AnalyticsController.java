package com.xray.infrastructure.web.controller;

import com.xray.application.DistributionQuery;
import com.xray.infrastructure.web.dto.DistributionDto;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {

    private final DistributionQuery distribution;

    public AnalyticsController(DistributionQuery distribution) {
        this.distribution = distribution;
    }

    @GetMapping("/distribution")
    public DistributionDto distribution(@RequestParam(required = false) String profile,
                                        @RequestParam(required = false) String month) {
        return distribution.distribution(profile, month);
    }
}
