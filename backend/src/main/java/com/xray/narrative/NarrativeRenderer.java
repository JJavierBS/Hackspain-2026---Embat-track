package com.xray.narrative;

import com.xray.domain.model.RawIndicator;

/**
 * Extension point #3 (ARCHITECTURE §8.3). One line for a driver whose contribution moved by deltaPoints
 * between two months. before or after is null for MOMENTUM. Called at pipeline time only, never in a request.
 * The signature differs from ARCHITECTURE §8.3 so a 1-month and a 3-month delta can share it (phase 4 decision E7).
 */
public interface NarrativeRenderer {
    String render(String driverId, RawIndicator before, RawIndicator after, double deltaPoints);
}
