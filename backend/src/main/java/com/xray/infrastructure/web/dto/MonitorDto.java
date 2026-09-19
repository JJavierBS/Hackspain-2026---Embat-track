package com.xray.infrastructure.web.dto;

import java.util.List;

/** GET /api/monitor/alerts: alerts of the unit fired in fromMonth..month, plus the watchlist at month. */
public record MonitorDto(String profile, String month, String fromMonth, List<AlertDto> alerts,
                         List<WatchlistRowDto> watchlist) {
}
