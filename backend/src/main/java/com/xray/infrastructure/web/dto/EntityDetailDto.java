package com.xray.infrastructure.web.dto;

import java.util.List;

/** limit, premium and momentum stay null until Block 7 (decision E8). row is null when the entity has no score. */
public record EntityDetailDto(String id, String name, String entityType, String groupId, String profile, String month,
                              PortfolioRowDto row, List<CategoryDto> categories, List<DriverDto> drivers,
                              List<ChangeDto> changes1m, List<ChangeDto> changes3m, List<IndicatorRowDto> indicators,
                              List<TimelinePointDto> timeline, List<ChangepointDto> changepoints,
                              List<PortfolioRowDto> companies, Object limit, Object premium, Object momentum) {
}
