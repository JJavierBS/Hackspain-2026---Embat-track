package com.xray.infrastructure.web.dto;

import java.util.List;

/** One event type of GET /api/analytics/lead-time. Rates are null when their denominator is 0. */
public record LeadTimeBlockDto(String eventType, long events, long detected, long detectedAhead,
                               Double detectionRate, Double aheadRate, Double meanLead, Double medianLead,
                               List<HistogramBucketDto> histogram, List<TriggerCountDto> byTrigger,
                               long signals, long evaluable, long followed, Double falseAlarmRate) {

    /** One bucket of 0..windowMonths. Every bucket is present, count 0 where empty. */
    public record HistogramBucketDto(int leadMonths, long count) {
    }

    public record TriggerCountDto(String trigger, long events, long detectedAhead) {
    }
}
