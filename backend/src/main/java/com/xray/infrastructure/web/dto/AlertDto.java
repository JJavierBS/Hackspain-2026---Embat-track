package com.xray.infrastructure.web.dto;

/** Phase 5 contract item 8 Alert. id = entityType:entityId:month:code. message is Spanish, from the pipeline. */
public record AlertDto(String id, String entityId, String entityName, String entityType, String month, String code,
                       String severity, String direction, String message, Double value) {
}
