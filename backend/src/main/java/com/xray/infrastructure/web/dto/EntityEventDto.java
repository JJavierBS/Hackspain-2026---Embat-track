package com.xray.infrastructure.web.dto;

/** The lead-time event of one entity (Entity page, Timeline). limit* only on the limit profile. */
public record EntityEventDto(String eventType, String trigger, String eventMonth, String signalMonth,
                             Integer leadMonths, String limitSignalMonth, Integer limitLeadMonths) {
}
