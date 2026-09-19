package com.xray.narrative;

import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.RawIndicator;
import org.springframework.stereotype.Component;

import java.util.EnumMap;
import java.util.Locale;
import java.util.Map;

/** The only NarrativeRenderer in scope: Spanish templates, no external call (SPEC §14). */
@Component
public class TemplateNarrativeRenderer implements NarrativeRenderer {

    private static final Locale ES = Locale.forLanguageTag("es-ES");
    private static final String MOMENTUM = "MOMENTUM";

    private enum Unit { DAYS, MONTHS, PCT, MULTIPLE, RATIO, HHI }

    private record Meta(String label, Unit unit) {
    }

    private static final Map<IndicatorId, Meta> META = new EnumMap<>(IndicatorId.class);

    static {
        META.put(IndicatorId.LIQ_RUNWAY, new Meta("Meses de caja", Unit.MONTHS));
        META.put(IndicatorId.LIQ_BUFFER, new Meta("Colchón de liquidez", Unit.MULTIPLE));
        META.put(IndicatorId.LIQ_MIN_BALANCE, new Meta("Saldo mínimo", Unit.RATIO));
        META.put(IndicatorId.CF_NOCF_MARGIN, new Meta("Margen de caja operativa", Unit.PCT));
        META.put(IndicatorId.CF_VOLATILITY, new Meta("Volatilidad del flujo", Unit.RATIO));
        META.put(IndicatorId.CF_IN_OUT_RATIO, new Meta("Cobros sobre pagos", Unit.MULTIPLE));
        META.put(IndicatorId.ACT_COLLECTIONS_GROWTH, new Meta("Crecimiento de cobros", Unit.PCT));
        META.put(IndicatorId.DEBT_DSCR, new Meta("Cobertura de deuda (DSCR)", Unit.MULTIPLE));
        META.put(IndicatorId.DEBT_LINE_UTIL, new Meta("Uso de pólizas", Unit.PCT));
        META.put(IndicatorId.LEV_DEBT_TO_CF, new Meta("Deuda sobre caja operativa", Unit.MULTIPLE));
        META.put(IndicatorId.LEV_FACTORING_RELIANCE, new Meta("Peso del factoring", Unit.PCT));
        META.put(IndicatorId.LEV_FUNDING_COST, new Meta("Diferencial de financiación", Unit.PCT));
        META.put(IndicatorId.PAY_DSO, new Meta("Plazo de cobro (DSO)", Unit.DAYS));
        META.put(IndicatorId.PAY_DPO, new Meta("Plazo de pago (DPO)", Unit.DAYS));
        META.put(IndicatorId.PAY_SUPPLIER_LATENESS, new Meta("Retraso a proveedores", Unit.DAYS));
        META.put(IndicatorId.PAY_OVERDUE_PAYABLES, new Meta("Pagos vencidos", Unit.PCT));
        META.put(IndicatorId.DEL_OVERDUE_RECEIVABLES, new Meta("Cobros vencidos", Unit.PCT));
        META.put(IndicatorId.DEL_AGING_90, new Meta("Vencido a más de 90 días", Unit.PCT));
        META.put(IndicatorId.CON_HHI_CUSTOMERS, new Meta("Concentración de clientes (HHI)", Unit.HHI));
        META.put(IndicatorId.CON_HHI_SUPPLIERS, new Meta("Concentración de proveedores (HHI)", Unit.HHI));
        META.put(IndicatorId.CON_CUSTOMER_CHURN, new Meta("Rotación de clientes", Unit.PCT));
        META.put(IndicatorId.TAX_REGULARITY, new Meta("Regularidad fiscal", Unit.PCT));
    }

    @Override
    public String render(String driverId, RawIndicator before, RawIndicator after, double deltaPoints) {
        String pts = signed(String.format(ES, "%.1f", Math.abs(deltaPoints)), deltaPoints) + " pts";
        if (MOMENTUM.equals(driverId)) {
            return "Inercia de la trayectoria (momentum) → " + pts;
        }
        Meta meta = META.get(IndicatorId.valueOf(driverId));
        if (before == null || !before.available()) {
            return String.format(ES, "%s entra en el cálculo con %s → %s", meta.label(), value(after, meta.unit()), pts);
        }
        if (after == null || !after.available()) {
            return String.format(ES, "%s deja de estar disponible → %s", meta.label(), pts);
        }
        if (before.value() == null || after.value() == null) {
            return String.format(ES, "%s pasa de %s a %s → %s",
                    meta.label(), value(before, meta.unit()), value(after, meta.unit()), pts);
        }
        double diff = after.value() - before.value();
        if (diff == 0) {
            return String.format(ES, "%s se mantiene en %s → %s", meta.label(), value(after, meta.unit()), pts);
        }
        return String.format(ES, "%s %s de %s a %s (%s) → %s", meta.label(), diff > 0 ? "sube" : "baja",
                value(before, meta.unit()), value(after, meta.unit()), change(diff, meta.unit()), pts);
    }

    /** A rule-defined level has no value (phase 3 contract item 5): DSCR with no debt service. */
    private static String value(RawIndicator r, Unit unit) {
        if (r == null || r.value() == null) {
            return r != null && r.id() == IndicatorId.DEBT_DSCR ? "sin deuda" : "n/d";
        }
        double v = r.value();
        return switch (unit) {
            case DAYS -> String.format(ES, "%.0f días", v);
            case MONTHS -> String.format(ES, "%.1f meses", v);
            case PCT -> String.format(ES, "%.0f %%", v * 100);
            case MULTIPLE -> String.format(ES, "%.2fx", v);
            case RATIO -> String.format(ES, "%.2f", v);
            case HHI -> String.format(ES, "%.0f", v);
        };
    }

    private static String change(double d, Unit unit) {
        double a = Math.abs(d);
        String body = switch (unit) {
            case DAYS -> String.format(ES, "%.0f días", a);
            case MONTHS -> String.format(ES, "%.1f meses", a);
            case PCT -> String.format(ES, "%.0f pp", a * 100);
            case MULTIPLE -> String.format(ES, "%.2fx", a);
            case RATIO -> String.format(ES, "%.2f", a);
            case HHI -> String.format(ES, "%.0f", a);
        };
        return signed(body, d);
    }

    /** A real minus sign, like the UI (lib/format.ts formatDelta). */
    private static String signed(String abs, double v) {
        return (v > 0 ? "+" : v < 0 ? "−" : "") + abs;
    }
}
