package com.xray.pipeline;

@FunctionalInterface
public interface ProgressSink {
    void report(String stageId, int percent, String message);
}
