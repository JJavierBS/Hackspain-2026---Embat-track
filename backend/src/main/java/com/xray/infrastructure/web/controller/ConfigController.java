package com.xray.infrastructure.web.controller;

import com.xray.XRayApplication;
import com.xray.application.AlgorithmConfigUseCase;
import com.xray.application.PresetCatalog;
import com.xray.application.SectorCatalog;
import com.xray.infrastructure.web.dto.AlgorithmConfigDto;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * The Algorithm page. A save or a reset restarts the Spring context: every bean binds the new values
 * and PipelineStartupTrigger re-runs the pipeline because the config fingerprint changed.
 */
@RestController
@RequestMapping("/api/config")
public class ConfigController {

    private final AlgorithmConfigUseCase useCase;
    private final PresetCatalog presets;
    private final SectorCatalog sectors;

    public ConfigController(AlgorithmConfigUseCase useCase, PresetCatalog presets, SectorCatalog sectors) {
        this.useCase = useCase;
        this.presets = presets;
        this.sectors = sectors;
    }

    @GetMapping
    public AlgorithmConfigDto get() {
        return useCase.view();
    }

    /** Client presets with their evidence (presets.yml). The page loads one into its draft. */
    @GetMapping("/presets")
    public Map<String, Object> presets() {
        return presets.catalog();
    }

    /** Sector presets for the per-entity tuning, with their evidence (sectors.yml). */
    @GetMapping("/sectors")
    public Map<String, Object> sectors() {
        return sectors.catalog();
    }

    @PutMapping
    public ResponseEntity<Map<String, Object>> save(@RequestBody Map<String, Object> body) {
        List<String> changed = useCase.save(body);
        XRayApplication.restart();
        return ResponseEntity.accepted().body(Map.of("restarting", true, "changedSections", changed));
    }

    @DeleteMapping
    public ResponseEntity<Map<String, Object>> reset() {
        useCase.reset();
        XRayApplication.restart();
        return ResponseEntity.accepted().body(Map.of("restarting", true, "changedSections", List.of()));
    }
}
