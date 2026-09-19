package com.xray.infrastructure.web.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/** meetsSpec false = the closest pair the month had, shown anyway so Compare always opens on something. */
public record ShowcasePairDto(int rank, boolean meetsSpec, Side up, Side down, double finalGap, double trajGap) {

    /** name is the id: the API has no other name (see EntityDetailQuery). `final` is a Java keyword. */
    public record Side(String id, String name, @JsonProperty("final") Double finalScore, Double traj) {
    }
}
