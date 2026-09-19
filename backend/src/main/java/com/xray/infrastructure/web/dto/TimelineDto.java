package com.xray.infrastructure.web.dto;

import java.util.List;

/** alerts: this entity, ?profile, oldest first (phase 5 contract item 8). */
public record TimelineDto(String id, String profile, List<TimelinePointDto> points, List<ChangepointDto> changepoints,
                          List<AlertDto> alerts) {
}
