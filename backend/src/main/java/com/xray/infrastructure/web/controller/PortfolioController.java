package com.xray.infrastructure.web.controller;

import com.xray.application.PortfolioQuery;
import com.xray.infrastructure.web.dto.PortfolioDto;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PortfolioController {

    private final PortfolioQuery query;

    public PortfolioController(PortfolioQuery query) {
        this.query = query;
    }

    @GetMapping("/api/portfolio")
    public PortfolioDto portfolio(@RequestParam(required = false) String profile,
                                  @RequestParam(required = false) String month,
                                  @RequestParam(required = false) String status,
                                  @RequestParam(required = false) String band,
                                  @RequestParam(required = false) String q,
                                  @RequestParam(required = false) String sort) {
        return query.portfolio(profile, month, status, band, q, sort);
    }
}
