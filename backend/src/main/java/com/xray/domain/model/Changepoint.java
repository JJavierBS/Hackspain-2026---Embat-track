package com.xray.domain.model;

/**
 * One CUSUM alarm (SPEC §8.1). series = FINAL or an IndicatorId name; profile null for indicator series.
 * month = last month the cumulative sum was 0 before the alarm, alarmMonth = the month it fired (ordinals).
 */
public record Changepoint(String series, Profile profile, int month, int alarmMonth, ChangeDirection direction) {
}
