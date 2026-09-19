package com.xray.infrastructure.web.dto;

import java.util.List;

public record TimelineDto(String id, String profile, List<TimelinePointDto> points, List<ChangepointDto> changepoints) {
}
