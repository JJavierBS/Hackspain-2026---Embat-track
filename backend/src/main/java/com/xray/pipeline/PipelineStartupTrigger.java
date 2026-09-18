package com.xray.pipeline;

import com.xray.config.XRayProperties;
import com.xray.infrastructure.duckdb.PipelineRunRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/** Runs the pipeline at boot when pipeline_runs is empty. Never in demo mode (ARCHITECTURE §10). */
@Component
class PipelineStartupTrigger implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(PipelineStartupTrigger.class);

    private final XRayProperties props;
    private final PipelineRunRepository runs;
    private final PipelineRunner runner;

    PipelineStartupTrigger(XRayProperties props, PipelineRunRepository runs, PipelineRunner runner) {
        this.props = props;
        this.runs = runs;
        this.runner = runner;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (props.demoMode()) {
            log.info("demo mode: pipeline disabled, serving {}", props.dataPath().resolve("xray.duckdb"));
            return;
        }
        if (runs.isEmpty()) {
            log.info("pipeline_runs is empty: starting run {}", runner.startAsync());
        }
    }
}
