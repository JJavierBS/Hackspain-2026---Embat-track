package com.xray.infrastructure.web.dto;

import java.util.List;

/** One watchlisted entity (SPEC §8.5, decision F15). codes = its negative active alert codes at the month. */
public record WatchlistRowDto(PortfolioRowDto row, int criticalAlerts, int warnAlerts, List<String> codes) {
}
