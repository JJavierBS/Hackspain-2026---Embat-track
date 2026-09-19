package com.xray.pipeline.stages;

import com.xray.config.DataRules;
import com.xray.config.IndicatorConfig;
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
        boolean nativeCcy = r.fxConvention() == DataRules.FxConvention.NONE;
        // A product missing from both product files falls back to the company currency (DATA_FINDINGS Q4).
        m.put("tx_local_ccy", nativeCcy ? "COALESCE(pc.currency, c.currency)" : "c.currency");
        m.put("inv_local_ccy", nativeCcy ? "i.currency" : "i.accounting_currency");
        m.put("invoice_direction", r.invoiceDirection().name());
        m.put("invoice_issued_sign", String.valueOf(r.invoiceIssuedSign()));
        m.put("invoice_excluded_types", listOrNone(r.invoiceExcludedDocumentTypes()));
        m.put("invoice_excluded_status", listOrNone(r.invoiceExcludedStatusValues()));
        m.put("invoice_paid_status", listOrNone(r.invoicePaidStatusValues()));
        m.put("intragroup_rule", r.intragroupRule().name());
        m.put("intragroup_max_lag_days", String.valueOf(r.intragroupMaxLagDays()));
        m.put("own_account_max_lag_days", String.valueOf(r.ownAccountMaxLagDays()));
        m.put("tx_excluded_abs_amounts", r.txExcludedAbsAmounts() == null || r.txExcludedAbsAmounts().isEmpty()
                ? "-1" : r.txExcludedAbsAmounts().stream().map(String::valueOf).collect(Collectors.joining(", ")));
        m.put("con_min_coverage", String.valueOf(c.concentration().minCounterpartyCoverage()));
        m.put("interest_categories", listOrNone(r.interestCategories()));
        m.put("credit_line_types", listOrNone(r.creditLineDebtTypes()));
        m.put("factoring_types", listOrNone(r.factoringDebtTypes()));
        m.put("annualize_min_months", String.valueOf(c.windows().annualizeMinMonths()));
        var t = c.taxRegularity();
        m.put("tax_window_months", String.valueOf(t.windowMonths()));
        m.put("tax_monthly_max_median_gap", String.valueOf(t.monthlyMaxMedianGap()));
        m.put("tax_monthly_cadence", String.valueOf(t.monthlyCadenceMonths()));
        m.put("tax_quarterly_cadence", String.valueOf(t.quarterlyCadenceMonths()));
        m.put("tax_min_months", String.valueOf(t.minTaxMonths()));
        c.indicators().forEach((id, ic) -> {
            m.put("best_x_" + id.name(), String.valueOf(xAtScore(ic, true)));
            m.put("worst_x_" + id.name(), String.valueOf(xAtScore(ic, false)));
        });
        return m;
    }

    /**
     * x of the anchor with the highest (best) or lowest (worst) score: the limit value of a ratio whose
     * denominator is 0 (phase 3 overview, decision D3). Ties keep the first anchor for best, the last for worst.
     */
    static double xAtScore(IndicatorConfig ic, boolean best) {
        List<List<Double>> a = ic.anchors();
        List<Double> pick = a.get(0);
        for (List<Double> p : a) {
            if (best ? p.get(1) > pick.get(1) : p.get(1) <= pick.get(1)) {
                pick = p;
            }
        }
        return pick.get(0);
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
