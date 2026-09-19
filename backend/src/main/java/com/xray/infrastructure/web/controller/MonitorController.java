package com.xray.infrastructure.web.controller;

import com.xray.application.MonitorQuery;
import com.xray.infrastructure.web.dto.MonitorDto;
import com.xray.infrastructure.web.dto.WatchlistDto;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/monitor")
public class MonitorController {

    private final MonitorQuery monitor;

    public MonitorController(MonitorQuery monitor) {
        this.monitor = monitor;
    }

    @GetMapping("/alerts")
    public MonitorDto alerts(@RequestParam(required = false) String profile, @RequestParam(required = false) String month,
                             @RequestParam(required = false) String severity,
                             @RequestParam(required = false) String direction,
                             @RequestParam(required = false) Integer window) {
        return monitor.alerts(profile, month, severity, direction, window);
    }

    @GetMapping("/watchlist")
    public WatchlistDto watchlist(@RequestParam(required = false) String profile,
                                  @RequestParam(required = false) String month) {
        return monitor.watchlist(profile, month);
    }
}
