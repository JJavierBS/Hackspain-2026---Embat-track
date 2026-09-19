package com.xray.infrastructure.web.dto;

public record ChangeDto(String driverId, String category, double delta, String narrative) {
}
