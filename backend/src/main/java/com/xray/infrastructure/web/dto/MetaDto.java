package com.xray.infrastructure.web.dto;

import java.util.List;
import java.util.Map;

public record MetaDto(String unit, List<String> months, List<String> profiles, Map<String, Long> entityCounts,
                      String runId, String finishedAt, boolean demoMode, boolean explanationsReady,
                      boolean dynamicsReady, List<String> caveats) {
}
