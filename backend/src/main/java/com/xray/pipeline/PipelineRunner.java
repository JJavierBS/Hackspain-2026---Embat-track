package com.xray.pipeline;

import com.xray.config.ConfigFingerprint;
import com.xray.config.ScoringConfig;
import com.xray.infrastructure.duckdb.PipelineRunRepository;
import com.xray.infrastructure.duckdb.SqlRunner;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Runs the ordered stages one by one on a single background thread (ARCHITECTURE §4.1, §10). */
@Service
public class PipelineRunner {

    private static final Logger log = LoggerFactory.getLogger(PipelineRunner.class);

    private final List<PipelineStage> stages;
    private final SqlRunner sql;
    private final ScoringConfig config;
    private final PipelineStatus status;
    private final PipelineRunRepository runs;
    private final ConfigFingerprint fingerprint;
    private final ExecutorService executor =
            Executors.newSingleThreadExecutor(r -> new Thread(r, "pipeline"));

    public PipelineRunner(List<PipelineStage> stages, SqlRunner sql, ScoringConfig config,
                          PipelineStatus status, PipelineRunRepository runs, ConfigFingerprint fingerprint) {
        this.stages = stages;
        this.sql = sql;
        this.config = config;
        this.status = status;
        this.runs = runs;
        this.fingerprint = fingerprint;
    }

    public synchronized String startAsync() {
        if (status.snapshot().state() == PipelineStatus.State.RUNNING) {
            throw new IllegalStateException("Pipeline already running: " + status.snapshot().runId());
        }
        String runId = UUID.randomUUID().toString();
        status.start(runId);
        executor.submit(() -> run(runId));
        return runId;
    }

    private void run(String runId) {
        Instant startedAt = Instant.now();
        Map<String, Long> timings = new LinkedHashMap<>();
        var ctx = new PipelineContext(sql, config, runId, config.unit(), status::progress);
        try {
            for (int i = 0; i < stages.size(); i++) {
                PipelineStage stage = stages.get(i);
                ctx.report(stage.id(), i * 100 / stages.size(), "running");
                long t0 = System.nanoTime();
                stage.execute(ctx);
                long ms = (System.nanoTime() - t0) / 1_000_000;
                timings.put(stage.id(), ms);
                status.timings(timings);
                log.info("{} took {} ms", stage.id(), ms);
            }
            runs.save(runId, config.unit(), startedAt, Instant.now(), timings, fingerprint.of(config));
            status.done(timings);
            log.info("pipeline run {} done", runId);
        } catch (Throwable e) {
            // Throwable, not RuntimeException: an Error would otherwise leave the state RUNNING forever.
            log.error("pipeline run {} failed", runId, e);
            status.failed(String.valueOf(e.getMessage()), timings);
        }
    }


    @PreDestroy
    void shutdown() {
        executor.shutdownNow();
    }
}
