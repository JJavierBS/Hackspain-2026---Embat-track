package com.xray.infrastructure.web.dto;

import java.util.List;
import java.util.Map;

public record DistributionDto(String profile, String month, List<BucketDto> histogram, Map<String, Long> statusCounts,
                              Map<String, Long> bandCounts) {
}
