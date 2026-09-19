package com.xray.pipeline;

/** Extension point #1 (ARCHITECTURE §8.1). Add a @Component @Order(n) class under stages/. */
public interface PipelineStage {
    String id();

    void execute(PipelineContext ctx);
}
