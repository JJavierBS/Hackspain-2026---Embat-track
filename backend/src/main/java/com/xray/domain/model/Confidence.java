package com.xray.domain.model;

/**
 * SPEC §7.6. INSUFFICIENT: the available categories hold less than the configured share of the profile weight.
 * The score exists but rests on too little evidence to rank or trust (DATA_FINDINGS, coverage gate).
 */
public enum Confidence {
    HIGH, MEDIUM, LOW, INSUFFICIENT
}
