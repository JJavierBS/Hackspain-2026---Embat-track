package com.xray.infrastructure.web.dto;

import java.util.List;

/** unscored = entities of the unit with no final score this month (not active yet). */
public record PortfolioDto(String profile, String month, int unscored, List<PortfolioRowDto> rows) {
}
