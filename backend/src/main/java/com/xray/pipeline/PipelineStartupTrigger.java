package com.xray.pipeline;

import com.xray.config.ConfigFingerprint;
import com.xray.config.ScoringConfig;
import com.xray.config.XRayProperties;
import com.xray.infrastructure.duckdb.PipelineRunRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Runs the pipeline at boot when pipeline_runs is empty, or when the latest run used another scoring config
 * (an expert saved new values on the Algorithm page). Never in demo mode (ARCHITECTURE §10).
 */
@Component
class PipelineStartupTrigger implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(PipelineStartupTrigger.class);

    private final XRayProperties props;
    private final PipelineRunRepository runs;
    private final PipelineRunner runner;
    private final ScoringConfig config;
    private final ConfigFingerprint fingerprint;

    PipelineStartupTrigger(XRayProperties props, PipelineRunRepository runs, PipelineRunner runner,
                           ScoringConfig config, ConfigFingerprint fingerprint) {
        this.props = props;
        this.runs = runs;
        this.runner = runner;
        this.config = config;
        this.fingerprint = fingerprint;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (props.demoMode()) {
            log.info("demo mode: pipeline disabled, serving {}", props.dataPath().resolve("xray.duckdb"));
            return;
        }
        if (runs.isEmpty()) {
            log.info("pipeline_runs is empty: starting run {}", runner.startAsync());
        } else if (!fingerprint.of(config).equals(runs.lastConfigHash())) {
            log.info("scoring config changed since the latest run: starting run {}", runner.startAsync());
        }
    }
}
