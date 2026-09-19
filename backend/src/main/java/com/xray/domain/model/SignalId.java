package com.xray.domain.model;

/** Monthly amounts from sql/39_signal_inputs.sql that no indicator carries (phase 5 overview contract item 2). */
public enum SignalId {
    OP_IN_MEDIAN_3M, OP_OUT_AVG_3M, NOCF_12M_ANN, DEBT_SERVICE_12M_ANN, FINANCING_IN_3M, FINANCING_IN_PREV_3M,
    TAX_GAP_MONTHS, TAX_CADENCE_MONTHS
}
