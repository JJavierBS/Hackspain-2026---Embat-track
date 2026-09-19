package com.xray.infrastructure.web.dto;

import java.util.List;

/** GET /api/monitor/watchlist. Rows sorted by criticalAlerts desc, warnAlerts desc, final asc. */
public record WatchlistDto(String profile, String month, List<WatchlistRowDto> rows) {
}
