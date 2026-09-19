package com.xray.infrastructure.web.controller;

import com.xray.application.export.ExportSubmissionUseCase;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ExportController {

    private final ExportSubmissionUseCase export;

    public ExportController(ExportSubmissionUseCase export) {
        this.export = export;
    }

    @GetMapping("/api/export/submission")
    public ResponseEntity<String> submission(@RequestParam(required = false) String profile,
                                             @RequestParam(required = false) String format) {
        ExportSubmissionUseCase.Csv csv = export.export(profile, format);
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "csv"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + csv.filename() + "\"")
                .body(csv.body());
    }
}
