package com.xray.infrastructure.web.dto;

import java.util.List;

/**
 * alerts and events: this entity, ?profile, oldest first. The timeline is the whole series, so no month filter.
 * forecast: the projection made at ?month (default the last month), ?horizon months ahead (phase 7).
 */
public record TimelineDto(String id, String profile, List<TimelinePointDto> points, List<ChangepointDto> changepoints,
                          List<AlertDto> alerts, List<EntityEventDto> events, ForecastDto forecast) {
}
