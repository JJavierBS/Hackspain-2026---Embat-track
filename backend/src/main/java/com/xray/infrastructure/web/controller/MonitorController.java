package com.xray.infrastructure.web.controller;

import com.xray.application.MonitorQuery;
import com.xray.application.MonitorReplayUseCase;
import com.xray.infrastructure.web.dto.ReplayFrameDto;
import com.xray.infrastructure.web.dto.MonitorDto;
import com.xray.infrastructure.web.dto.WatchlistDto;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

@RestController
@RequestMapping("/api/monitor")
public class MonitorController {

    private final MonitorQuery monitor;
    private final MonitorReplayUseCase replay;

    public MonitorController(MonitorQuery monitor, MonitorReplayUseCase replay) {
        this.monitor = monitor;
        this.replay = replay;
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

    /**
     * text/event-stream: one "month" event per month, then "done". Params are validated before the stream starts,
     * so a bad request still answers 400 JSON (ApiExceptionHandler).
     */
    @GetMapping(path = "/replay", produces = {MediaType.TEXT_EVENT_STREAM_VALUE, MediaType.APPLICATION_JSON_VALUE})
    public SseEmitter replay(@RequestParam(required = false) String profile, @RequestParam(required = false) String from,
                             @RequestParam(required = false) String to, @RequestParam(required = false) Integer stepMs,
                             HttpServletResponse response) {
        List<ReplayFrameDto> frames = replay.frames(profile, from, to);
        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("X-Accel-Buffering", "no");   // nginx must not buffer the stream (plan B Task 11)
        return replay.stream(frames, stepMs);
    }
}
