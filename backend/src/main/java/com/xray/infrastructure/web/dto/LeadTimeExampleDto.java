package com.xray.infrastructure.web.dto;

/** One detected event, biggest lead first. entityName is the id: the API has no other name. */
public record LeadTimeExampleDto(String entityId, String entityName, String eventType, String trigger,
                                 String eventMonth, String signalMonth, Integer leadMonths,
                                 String limitSignalMonth, Integer limitLeadMonths) {
}
