package com.xray.pipeline.stages;

import com.xray.config.DataRules;
import com.xray.config.ScoringConfig;
import com.xray.config.XRayProperties;

import java.time.YearMonth;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** Turns scoring-config.yml into ${placeholder} values, so the SQL files hold no constants. */
final class SqlParams {

    private SqlParams() {
    }

    static Map<String, String> of(ScoringConfig c, XRayProperties props) {
        DataRules r = c.dataRules();
        Map<String, String> m = new HashMap<>();
        m.put("raw_dir", quoteless(props.rawPath().toString()));
        m.put("period_start", YearMonth.parse(c.months().start()).atDay(1).toString());
        m.put("snapshot_date", YearMonth.parse(c.months().end()).plusMonths(1).atDay(1).toString());
        m.put("booked_status", list(c.bookedStatusValues()));
        m.put("cash_types", list(c.cashProductTypes()));
        m.put("semi_liquid_types", list(c.semiLiquidTypes()));
        m.put("flow_class_values", c.flowClasses().entrySet().stream()
                .map(e -> "(" + lit(e.getKey()) + ", " + lit(e.getValue().name()) + ")")
                .collect(Collectors.joining(", ")));
        m.put("default_flow_class", c.defaultFlowClass().name());
        m.put("other_sign_fallback", String.valueOf(c.otherSignFallback()));
        m.put("fx_values", r.fxToEur().entrySet().stream()
                .map(e -> "(" + lit(e.getKey()) + ", " + e.getValue() + ")")
                .collect(Collectors.joining(", ")));
        // Same currency on both sides: the rate is noise (DATA_FINDINGS Q4c), use 1.
        m.put("tx_amount_eur", amountEur("t.amount",
                "CASE WHEN pc.currency = c.currency THEN 1 ELSE t.exchange_rate END", r));
        m.put("inv_amount_eur", amountEur("ABS(i.amount)",
                "CASE WHEN i.currency = i.accounting_currency THEN 1 ELSE i.exchange_rate END", r));
        m.put("invoice_direction", r.invoiceDirection().name());
        m.put("invoice_issued_sign", String.valueOf(r.invoiceIssuedSign()));
        m.put("invoice_excluded_types", listOrNone(r.invoiceExcludedDocumentTypes()));
        m.put("invoice_excluded_status", listOrNone(r.invoiceExcludedStatusValues()));
        m.put("invoice_paid_status", listOrNone(r.invoicePaidStatusValues()));
        m.put("intragroup_rule", r.intragroupRule().name());
        m.put("intragroup_max_lag_days", String.valueOf(r.intragroupMaxLagDays()));
        return m;
    }

    /** SQL expression for the EUR amount. "fx.rate" is the fx_to_eur row joined on the local currency. */
    static String amountEur(String amount, String rate, DataRules r) {
        String converted = switch (r.fxConvention()) {
            case MULTIPLY -> amount + " * " + rate;
            case DIVIDE -> amount + " / NULLIF(" + rate + ", 0)";
            case NONE -> amount;
        };
        return r.fxTarget() == DataRules.FxTarget.EUR ? "(" + converted + ")" : "(" + converted + ") * fx.rate";
    }

    private static String list(List<String> xs) {
        return xs.stream().map(SqlParams::lit).collect(Collectors.joining(", "));
    }

    /** An empty IN () list is a syntax error; a sentinel that matches nothing is not. */
    private static String listOrNone(List<String> xs) {
        return xs == null || xs.isEmpty() ? "'__none__'" : list(xs);
    }

    private static String lit(String s) {
        return "'" + s.replace("'", "''") + "'";
    }

    private static String quoteless(String s) {
        return s.replace("'", "''");
    }
}
