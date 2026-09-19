package com.xray.infrastructure.web.controller;

import com.xray.application.AnalyticsQuery;
import com.xray.application.DistributionQuery;
import com.xray.infrastructure.web.dto.DistributionDto;
import com.xray.infrastructure.web.dto.LeadTimeDto;
import com.xray.infrastructure.web.dto.ShowcasePairsDto;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {

    private final DistributionQuery distribution;
    private final AnalyticsQuery analytics;

    public AnalyticsController(DistributionQuery distribution, AnalyticsQuery analytics) {
        this.distribution = distribution;
        this.analytics = analytics;
    }

    @GetMapping("/distribution")
    public DistributionDto distribution(@RequestParam(required = false) String profile,
                                        @RequestParam(required = false) String month) {
        return distribution.distribution(profile, month);
    }

    @GetMapping("/lead-time")
    public LeadTimeDto leadTime(@RequestParam(required = false) String profile) {
        return analytics.leadTime(profile);
    }

    @GetMapping("/showcase-pairs")
    public ShowcasePairsDto showcasePairs(@RequestParam(required = false) String profile,
                                          @RequestParam(required = false) String month) {
        return analytics.showcasePairs(profile, month);
    }
}
