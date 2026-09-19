package com.xray.infrastructure.web.dto;

import java.util.List;

/**
 * row is null when the entity has no score. limit, premium and momentum are null when their product has no row
 * at the month (phase 5 contract item 8). alerts: this entity, ?profile, months <= ?month, newest first, at most 20.
 * forecast: the projection made at ?month, ?horizon months ahead, with its reliability (phase 7).
 */
public record EntityDetailDto(String id, String name, String entityType, String groupId, String profile, String month,
                              PortfolioRowDto row, List<CategoryDto> categories, List<DriverDto> drivers,
                              List<ChangeDto> changes1m, List<ChangeDto> changes3m, List<IndicatorRowDto> indicators,
                              List<TimelinePointDto> timeline, List<ChangepointDto> changepoints,
                              List<PortfolioRowDto> companies, LimitDecisionDto limit, PremiumQuoteDto premium,
                              MomentumDto momentum, List<AlertDto> alerts, List<EntityEventDto> events,
                              ForecastDto forecast) {
}
