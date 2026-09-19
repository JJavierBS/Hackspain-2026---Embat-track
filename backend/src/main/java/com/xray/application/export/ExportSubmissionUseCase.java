package com.xray.application.export;

import com.xray.application.ApiParams;
import com.xray.application.BadRequestException;
import com.xray.domain.model.Profile;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class ExportSubmissionUseCase {

    public record Csv(String filename, String body) {
    }

    private final List<SubmissionExporter> exporters;
    private final ApiParams params;

    public ExportSubmissionUseCase(List<SubmissionExporter> exporters, ApiParams params) {
        this.exporters = exporters;
        this.params = params;
    }

    public Csv export(String profileRaw, String formatRaw) {
        Profile p = params.profile(profileRaw);
        String format = formatRaw == null || formatRaw.isBlank() ? "entity" : formatRaw.trim();
        SubmissionExporter ex = exporters.stream().filter(e -> e.format().equals(format)).findFirst()
                .orElseThrow(() -> new BadRequestException("Unknown format " + format + ". Use "
                        + exporters.stream().map(SubmissionExporter::format).sorted().toList() + "."));
        return new Csv("submission_" + p.name().toLowerCase() + "_" + format + ".csv", ex.csv(p));
    }
}
