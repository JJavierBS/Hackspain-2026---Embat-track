package com.xray.application;

import com.xray.domain.model.Profile;
import com.xray.infrastructure.web.dto.ReplayFrameDto;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/**
 * GET /api/monitor/replay (SPEC §8.5, ARCHITECTURE §10): replays the stored causal alerts month by month.
 * Frames are read once, up front; the stream only paces them. Nothing is recomputed.
 */
@Service
public class MonitorReplayUseCase implements DisposableBean {

    private static final int DEFAULT_STEP_MS = 1200;
    private static final int MIN_STEP_MS = 200;
    private static final int MAX_STEP_MS = 5000;
    private static final int DEFAULT_FROM_INDEX = 6;   // M06 (SPEC §8.5 "play M06 → M23")

    private final ApiParams params;
    private final MonitorQuery monitor;
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "monitor-replay");
        t.setDaemon(true);
        return t;
    });

    public MonitorReplayUseCase(ApiParams params, MonitorQuery monitor) {
        this.params = params;
        this.monitor = monitor;
    }

    /** Validates and reads the frames; throws BadRequestException before any stream exists. */
    public List<ReplayFrameDto> frames(String profileRaw, String fromRaw, String toRaw) {
        Profile p = params.profile(profileRaw);
        List<String> months = params.months();
        String from = fromRaw == null || fromRaw.isBlank()
                ? months.get(Math.min(DEFAULT_FROM_INDEX, months.size() - 1)) : params.month(fromRaw);
        String to = params.month(toRaw);
        if (from.compareTo(to) > 0) {
            throw new BadRequestException("from " + from + " is after to " + to);
        }
        return monitor.frames(p, from, to);
    }

    public SseEmitter stream(List<ReplayFrameDto> frames, Integer stepMsRaw) {
        int step = Math.max(MIN_STEP_MS, Math.min(MAX_STEP_MS, stepMsRaw == null ? DEFAULT_STEP_MS : stepMsRaw));
        SseEmitter emitter = new SseEmitter((long) step * (frames.size() + 2) + 10_000L);
        AtomicInteger next = new AtomicInteger();
        AtomicReference<ScheduledFuture<?>> task = new AtomicReference<>();
        Runnable stop = () -> {
            ScheduledFuture<?> f = task.get();
            if (f != null) f.cancel(false);
        };
        task.set(scheduler.scheduleAtFixedRate(() -> {
            try {
                int k = next.getAndIncrement();
                if (k < frames.size()) {
                    emitter.send(SseEmitter.event().name("month").data(frames.get(k), MediaType.APPLICATION_JSON));
                } else {
                    emitter.send(SseEmitter.event().name("done").data(Map.of(), MediaType.APPLICATION_JSON));
                    emitter.complete();
                    stop.run();
                }
            } catch (IOException | IllegalStateException e) {   // client gone
                stop.run();
            }
        }, 100, step, TimeUnit.MILLISECONDS));
        emitter.onCompletion(stop);
        emitter.onTimeout(stop);
        emitter.onError(t -> stop.run());
        return emitter;
    }

    @Override
    public void destroy() {
        scheduler.shutdownNow();
    }
}
