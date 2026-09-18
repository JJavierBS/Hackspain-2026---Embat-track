package com.xray.pipeline;

import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/** In-memory run state. The status endpoint reads this, never the database. */
@Component
public class PipelineStatus {

    public enum State { IDLE, RUNNING, DONE, FAILED }

    public record Snapshot(State state, String runId, String currentStage, int percent,
                           String message, Map<String, Long> stageTimingsMs) {
    }

    private volatile Snapshot snapshot = new Snapshot(State.IDLE, null, null, 0, null, Map.of());

    public Snapshot snapshot() {
        return snapshot;
    }

    synchronized void start(String runId) {
        snapshot = new Snapshot(State.RUNNING, runId, null, 0, "starting", Map.of());
    }

    synchronized void progress(String stageId, int percent, String message) {
        var s = snapshot;
        snapshot = new Snapshot(State.RUNNING, s.runId(), stageId, percent, message, s.stageTimingsMs());
    }

    synchronized void timings(Map<String, Long> timings) {
        var s = snapshot;
        snapshot = new Snapshot(s.state(), s.runId(), s.currentStage(), s.percent(), s.message(),
                new LinkedHashMap<>(timings));
    }

    synchronized void done(Map<String, Long> timings) {
        snapshot = new Snapshot(State.DONE, snapshot.runId(), null, 100, "done", new LinkedHashMap<>(timings));
    }

    synchronized void failed(String message, Map<String, Long> timings) {
        var s = snapshot;
        snapshot = new Snapshot(State.FAILED, s.runId(), s.currentStage(), s.percent(), message,
                new LinkedHashMap<>(timings));
    }
}
