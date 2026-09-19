package com.xray.infrastructure.web.controller;

import com.xray.config.XRayProperties;
import com.xray.pipeline.PipelineRunner;
import com.xray.pipeline.PipelineStatus;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/pipeline")
public class PipelineController {

    private final PipelineRunner runner;
    private final PipelineStatus status;
    private final XRayProperties props;

    public PipelineController(PipelineRunner runner, PipelineStatus status, XRayProperties props) {
        this.runner = runner;
        this.status = status;
        this.props = props;
    }

    @GetMapping("/status")
    public PipelineStatus.Snapshot status() {
        return status.snapshot();
    }

    @PostMapping("/run")
    public ResponseEntity<Map<String, String>> run() {
        if (props.demoMode()) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "Pipeline disabled in demo mode"));
        }
        try {
            return ResponseEntity.accepted().body(Map.of("runId", runner.startAsync()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        }
    }
}
