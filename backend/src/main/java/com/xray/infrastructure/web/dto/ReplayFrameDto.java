package com.xray.infrastructure.web.dto;

import java.util.List;

/** One month of GET /api/monitor/replay (event "month"). */
public record ReplayFrameDto(String month, List<AlertDto> newAlerts, int watchlistSize) {
}
