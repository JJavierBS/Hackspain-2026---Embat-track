package com.xray.pipeline;

import com.xray.config.ConfigFingerprint;
import com.xray.config.ScoringConfig;
import com.xray.infrastructure.duckdb.DuckDbDataSource;
import com.xray.infrastructure.duckdb.PipelineRunRepository;
import com.xray.infrastructure.duckdb.RunDatabase;
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

/**
 * Runs the ordered stages one by one on a single background thread (ARCHITECTURE §4.1, §10).
 * The stages work on a RunDatabase copy. The served tables change only when every stage is done, in one
 * transaction. A failed run leaves them as they were.
 */
@Service
public class PipelineRunner {

    private static final Logger log = LoggerFactory.getLogger(PipelineRunner.class);

    private final List<PipelineStage> stages;
    private final SqlRunner sql;
    private final ScoringConfig config;
    private final PipelineStatus status;
    private final PipelineRunRepository runs;
    private final ConfigFingerprint fingerprint;
    private final DuckDbDataSource dataSource;
    private final RunDatabase runDatabase;
    private final ExecutorService executor =
            Executors.newSingleThreadExecutor(r -> new Thread(r, "pipeline"));

    public PipelineRunner(List<PipelineStage> stages, SqlRunner sql, ScoringConfig config,
                          PipelineStatus status, PipelineRunRepository runs, ConfigFingerprint fingerprint,
                          DuckDbDataSource dataSource, RunDatabase runDatabase) {
        this.stages = stages;
        this.sql = sql;
        this.config = config;
        this.status = status;
        this.runs = runs;
        this.fingerprint = fingerprint;
        this.dataSource = dataSource;
        this.runDatabase = runDatabase;
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
            ctx.report("PREPARE", 0, "copying the served tables");
            timed("PREPARE", timings, runDatabase::prepare);
            dataSource.inDatabase(RunDatabase.NAME, () -> {
                for (int i = 0; i < stages.size(); i++) {
                    PipelineStage stage = stages.get(i);
                    ctx.report(stage.id(), i * 100 / stages.size(), "running");
                    timed(stage.id(), timings, () -> stage.execute(ctx));
                }
            });
            ctx.report("PUBLISH", 99, "replacing the served tables");
            timed("PUBLISH", timings, runDatabase::publish);
            runs.save(runId, config.unit(), startedAt, Instant.now(), timings, fingerprint.of(config));
            status.done(timings);
            log.info("pipeline run {} done", runId);
        } catch (Throwable e) {
            // Throwable, not RuntimeException: an Error would otherwise leave the state RUNNING forever.
            log.error("pipeline run {} failed, the served tables are unchanged", runId, e);
            try {
                runDatabase.discard();
            } catch (RuntimeException discardError) {
                log.error("cannot discard the run database of {}", runId, discardError);
            }
            status.failed(String.valueOf(e.getMessage()), timings);
        }
    }

    private void timed(String id, Map<String, Long> timings, Runnable step) {
        long t0 = System.nanoTime();
        step.run();
        long ms = (System.nanoTime() - t0) / 1_000_000;
        timings.put(id, ms);
        status.timings(timings);
        log.info("{} took {} ms", id, ms);
    }


    @PreDestroy
    void shutdown() {
        executor.shutdownNow();
    }
}
