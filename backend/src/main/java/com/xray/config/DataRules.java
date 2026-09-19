package com.xray.config;

import java.util.List;
import java.util.Map;

/** Data semantics decided by profiling (SPEC §4, docs/DATA_FINDINGS.md). */
public record DataRules(
        FxConvention fxConvention,
        FxTarget fxTarget,
        Map<String, Double> fxToEur,
        InvoiceDirection invoiceDirection,
        int invoiceIssuedSign,
        List<String> invoiceExcludedDocumentTypes,
        List<String> invoiceExcludedStatusValues,
        List<String> invoicePaidStatusValues,
        IntragroupRule intragroupRule,
        int intragroupMaxLagDays) {

    /** How exchange_rate applies to amount. NONE = amounts are already in the target currency. */
    public enum FxConvention { MULTIPLY, DIVIDE, NONE }

    /** EUR: amount (op) exchange_rate is EUR. LOCAL: it is the company or accounting currency; fx-to-eur converts it. */
    public enum FxTarget { EUR, LOCAL }

    /** AMOUNT_SIGN: sign of amount gives the direction. COUNTERPARTY_FLOW: the counterparty's net transaction sign does. */
    public enum InvoiceDirection { AMOUNT_SIGN, COUNTERPARTY_FLOW }

    public enum IntragroupRule { COUNTERPARTY_IS_COMPANY, MIRROR_MATCH, NONE }
}
