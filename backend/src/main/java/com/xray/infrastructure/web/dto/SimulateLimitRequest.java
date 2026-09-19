package com.xray.infrastructure.web.dto;

/** POST /api/entities/{id}/limit/simulate body. month and termMonths are optional. */
public record SimulateLimitRequest(String month, Double requestedAmountEur, Integer termMonths) {
}
