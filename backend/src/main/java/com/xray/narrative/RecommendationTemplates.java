package com.xray.narrative;

import com.xray.domain.model.Category;
import com.xray.domain.model.IndicatorId;
import com.xray.domain.service.RecommendationEngine.Finding;
import com.xray.domain.service.RecommendationEngine.Situation;
import com.xray.domain.service.RecommendationEngine.Summary;
import com.xray.domain.service.RecommendationEngine.Variant;

import java.util.EnumSet;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Spanish text of every recommendation (docs/RECOMMENDATIONS.md holds the catalogue and its sources).
 * Impersonal style: the same page is read by the company and by its bank, insurer or fund.
 * Every number comes from the finding; no text states a fact the data does not carry.
 */
final class RecommendationTemplates {

    private static final Locale ES = Locale.forLanguageTag("es-ES");

    /** SPEC §6 "Better" column: the rest are higher-is-better. */
    private static final Set<IndicatorId> LOWER_IS_BETTER = EnumSet.of(IndicatorId.CF_VOLATILITY,
            IndicatorId.DEBT_LINE_UTIL, IndicatorId.LEV_DEBT_TO_CF, IndicatorId.LEV_FACTORING_RELIANCE,
            IndicatorId.LEV_FUNDING_COST, IndicatorId.PAY_DSO, IndicatorId.PAY_DPO, IndicatorId.PAY_SUPPLIER_LATENESS,
            IndicatorId.PAY_OVERDUE_PAYABLES, IndicatorId.DEL_OVERDUE_RECEIVABLES, IndicatorId.DEL_AGING_90,
            IndicatorId.CON_HHI_CUSTOMERS, IndicatorId.CON_HHI_SUPPLIERS, IndicatorId.CON_CUSTOMER_CHURN);

    private RecommendationTemplates() {
    }

    static NarrativeRenderer.RecommendationText render(Finding f) {
        String[] t = text(f);
        String why = t[1];
        if (f.worsening() && f.variant() != Variant.TREND) {
            why += " Además, sigue empeorando.";
        }
        if (f.isStatic()) {
            why += " Dato calculado sobre la foto de deuda más reciente.";
        }
        return new NarrativeRenderer.RecommendationText(t[0], why, t[2], goal(f));
    }

    /** {title, why, action}. */
    private static String[] text(Finding f) {
        Double v = f.value();
        return switch (f.variant()) {
            // ---- LIQUIDITY
            case RUNWAY_CRITICAL -> t("Asegurar la caja de las próximas semanas",
                    v != null && v <= 0 ? "La caja disponible a fin de mes es nula o negativa."
                            : "Al ritmo de salida de caja de los últimos 3 meses, la caja disponible cubre " + months(v) + ".",
                    "Preparar ya una previsión de tesorería semana a semana a 13 semanas, aplazar los pagos que no "
                            + "sean críticos y activar la financiación disponible (póliza, anticipo de facturas) "
                            + "antes de quedarse sin margen para negociar.");
            case RUNWAY_LOW -> t("Ampliar el margen de caja",
                    "La caja cubre " + months(v) + " de salidas netas. Por debajo de " + months(f.related())
                            + ", cualquier imprevisto obliga a buscar financiación con prisa y en peores condiciones.",
                    "Fijar un colchón mínimo de " + months(f.related()) + ", revisar qué gastos pueden recortarse o aplazarse y "
                            + "negociar la financiación de circulante ahora, mientras todavía hay margen.");
            case BUFFER_SHORT -> t("Cubrir los pagos comprometidos a 90 días",
                    "La caja cubre " + mult(v) + " los pagos ya comprometidos para los próximos 90 días "
                            + "(facturas de proveedores y cuotas de deuda): no llega para todos.",
                    "Ordenar los vencimientos de los próximos 90 días por importe y por criticidad, y negociar "
                            + "nuevas fechas con los proveedores no críticos antes del vencimiento, no después.");
            case OVERDRAFT -> t("Evitar los descubiertos",
                    "El saldo llegó a estar en negativo durante el mes.",
                    "Alinear las fechas de los pagos grandes con las de los cobros principales o sustituir el "
                            + "descubierto por una póliza de crédito: el descubierto es la financiación más cara y "
                            + "el banco lo lee como señal de tensión.");
            // ---- OPERATING CASH FLOW
            case NOCF_NEGATIVE -> t("Volver a generar caja con la operativa",
                    "En los últimos 3 meses la operativa consume caja: por cada 100 € cobrados se pagaron "
                            + per100(1 - v) + " € en pagos operativos e impuestos.",
                    "Separar gastos fijos y variables y revisar el margen por cliente o por línea de negocio. "
                            + "La prioridad es volver al menos al equilibrio de caja antes de crecer o endeudarse más.");
            case OVERTRADING -> t("Crecer sin quemar caja",
                    "Los cobros crecen un " + pct(f.related()) + ", pero la operativa consume caja: por cada 100 € "
                            + "cobrados se pagaron " + per100(1 - v) + " € en pagos operativos e impuestos. El "
                            + "crecimiento se está financiando con la caja.",
                    "Revisar precios y plazos de cobro de los clientes nuevos y financiar el circulante del "
                            + "crecimiento (póliza o anticipo de facturas) antes de acelerar más.");
            case IN_OUT_BELOW_ONE -> t("Cobrar al menos lo que se paga",
                    "En los últimos 3 meses entraron " + per100(v) + " € por cada 100 € que salieron en pagos "
                            + "operativos e impuestos.",
                    "Revisar las partidas de pago que más han crecido y acelerar el cobro de las facturas "
                            + "pendientes. El objetivo es que los cobros vuelvan a cubrir los pagos.");
            // ---- ACTIVITY
            case GROWTH_COLLAPSE -> t("Comprobar la caída de los cobros",
                    "Los cobros operativos de los últimos 3 meses han caído un " + pct(-v) + " frente "
                            + base(f) + ".",
                    "Confirmar si la actividad se ha detenido o si los cobros entran por una cuenta no conectada. "
                            + "Si es lo primero, es la prioridad número uno. Si es lo segundo, conectar esa cuenta "
                            + "para que el análisis sea completo.");
            case GROWTH_DECLINE -> t("Recuperar el volumen de cobros",
                    "Los cobros operativos de los últimos 3 meses caen un " + pct(-v) + " frente " + base(f) + ".",
                    "Identificar qué clientes han reducido su actividad y actuar comercialmente sobre ellos. Si la "
                            + "caída se confirma, ajustar los gastos al nuevo volumen.");
            // ---- DEBT SERVICE
            case DSCR_NEGATIVE -> t("Dejar de pagar la deuda con reservas",
                    "La operativa no genera caja: las cuotas de deuda de los últimos 3 meses se han pagado con caja "
                            + "acumulada o con financiación nueva.",
                    "Hablar ya con los bancos para pedir carencia o alargar plazos: negociarlo antes del primer "
                            + "impago es mucho más fácil. En paralelo, recuperar la caja operativa.");
            case DSCR_BELOW_ONE -> t("Recuperar la capacidad de pagar la deuda",
                    "La caja operativa cubre " + mult(v) + " las cuotas de deuda: no alcanza para pagarlas.",
                    "Hablar con los bancos para alargar plazos o pedir carencia antes del primer impago y no "
                            + "asumir deuda nueva hasta cubrir las cuotas con la operativa.");
            case DSCR_BELOW_COVENANT -> t("Ganar margen sobre las cuotas de deuda",
                    "La caja operativa cubre " + mult(v) + " las cuotas de deuda. Los bancos suelen exigir al menos "
                            + mult(f.related()) + ".",
                    "Evitar deuda nueva hasta superar " + mult(f.related()) + " y valorar refinanciar a más plazo para bajar la cuota.");
            case LINE_EXHAUSTED -> t("Recuperar margen en las pólizas de crédito",
                    "Las pólizas de crédito están dispuestas al " + pct(v) + ": prácticamente no queda margen.",
                    "Pedir la ampliación o renovación ahora, antes de necesitarla. Si parte del saldo es "
                            + "permanente, pasarla a un préstamo a plazo para liberar la póliza.");
            // ---- LEVERAGE
            case DEBT_NO_CF -> t("Ajustar la deuda a la caja que se genera",
                    "Con la caja operativa de los últimos 12 meses (nula o negativa), la deuda actual no se podría "
                            + "devolver con la actividad" + fallback12(f) + ".",
                    "No asumir deuda nueva, priorizar volver a una caja operativa positiva y negociar el calendario "
                            + "con los bancos si las cuotas aprietan.");
            // ---- NO BASE: the SQL wrote the worst anchor x, the value is not a ratio
            case NO_COLLECTIONS -> t("Recuperar los cobros operativos",
                    "No ha habido cobros operativos en " + (f.id() == IndicatorId.CF_VOLATILITY ? "6" : "3")
                            + " meses, pero sí pagos.",
                    "Confirmar si la actividad se ha detenido o si los cobros entran por una cuenta no conectada. "
                            + "Si es lo primero, ajustar los gastos de inmediato y asegurar la caja.");
            case OVERDUE_NO_BASE -> f.id() == IndicatorId.DEL_OVERDUE_RECEIVABLES
                    ? t("Reclamar las facturas vencidas",
                            "Hay facturas emitidas vencidas y sin cobrar, y no se ha emitido ninguna factura nueva en 3 meses.",
                            action(f))
                    : t("Ponerse al día con los proveedores",
                            "Hay facturas de proveedores vencidas y sin pagar, y no se ha recibido ninguna factura nueva "
                                    + "en 3 meses.", action(f));
            // ---- OPPORTUNITIES
            case IDLE_CASH -> t("Rentabilizar la caja sobrante",
                    "La caja cubre " + mult(v) + " los pagos comprometidos a 90 días y la operativa no consume caja.",
                    f.flag()
                            ? "Valorar amortizar anticipadamente la deuda más cara: la financiación cuesta más de lo "
                                    + "que suele rendir la caja en cuenta."
                            : "Mantener un colchón de seguridad y colocar el excedente en productos de bajo riesgo y "
                                    + "liquidez alta (depósitos, letras) o destinarlo a inversión productiva.");
            case DEBT_CAPACITY -> t("Negociar mejores condiciones de financiación",
                    "La caja operativa cubre " + mult(v) + " las cuotas de deuda y "
                            + (f.related() < 0.1 ? "la deuda es muy pequeña frente a la caja que genera la actividad."
                            : "la deuda equivale a " + years(f.related()) + " de caja operativa."),
                    "Con estos indicadores hay argumentos para pedir a los bancos mejores precios o más límite, "
                            + "y para financiar crecimiento si hay proyectos rentables.");
            case NO_DEBT_CAPACITY -> t("Asegurar financiación antes de necesitarla",
                    "No hay deuda y la operativa genera caja (margen de caja operativa del " + pct(f.related()) + ").",
                    "Negociar ahora una póliza de respaldo, cuando las condiciones son mejores, para no tener que "
                            + "buscarla en un momento de tensión.");
            case TREND -> t("Frenar el deterioro: " + TemplateNarrativeRenderer.label(f.id()),
                    "El indicador «" + TemplateNarrativeRenderer.label(f.id()) + "» empeora desde hace meses (hoy "
                            + value(f.id(), v) + "). Aún no es grave, pero corregirlo ahora es más barato.",
                    action(f));
            case LEVEL -> level(f);
        };
    }

    /** The generic level problem of each indicator. */
    private static String[] level(Finding f) {
        Double v = f.value();
        return switch (f.id()) {
            case LIQ_RUNWAY -> t("Reforzar el colchón de caja",
                    "La caja cubre " + months(v) + " de salidas netas.", action(f));
            case LIQ_BUFFER -> t("Reforzar la cobertura de pagos a 90 días",
                    "La caja cubre " + mult(v) + " los pagos comprometidos para los próximos 90 días: margen "
                            + "estrecho.", action(f));
            case LIQ_MIN_BALANCE -> t("No tocar suelo dentro del mes",
                    "En el peor día del mes, el saldo solo cubría el " + pct(v) + " de un mes de pagos operativos.",
                    action(f));
            case CF_NOCF_MARGIN -> t("Mejorar el margen de caja operativa",
                    "La operativa apenas genera caja: margen de caja operativa del " + pct(v) + " de los cobros.",
                    action(f));
            case CF_IN_OUT_RATIO -> t("Ampliar la diferencia entre cobros y pagos",
                    "En los últimos 3 meses entraron " + per100(v) + " € por cada 100 € de pagos operativos e "
                            + "impuestos: poco margen.", action(f));
            case CF_VOLATILITY -> t("Prepararse para un flujo de caja irregular",
                    "El flujo de caja varía mucho de un mes a otro: la variación equivale al " + pct(v)
                            + " de los cobros medios.", action(f));
            case ACT_COLLECTIONS_GROWTH -> t("Reactivar el crecimiento de los cobros",
                    "Los cobros operativos apenas varían frente " + base(f) + " (" + signedPct(v) + ").",
                    action(f));
            case DEBT_DSCR -> t("Ganar margen sobre las cuotas de deuda",
                    "La caja operativa cubre " + mult(v) + " las cuotas de deuda: margen justo.", action(f));
            case DEBT_LINE_UTIL -> t("Liberar margen en las pólizas de crédito",
                    "Las pólizas de crédito están dispuestas al " + pct(v) + ".", action(f));
            case LEV_DEBT_TO_CF -> t("Reducir la deuda respecto a la caja generada",
                    "La deuda equivale a " + years(v) + " de la caja operativa generada" + fallback12(f) + ".",
                    action(f));
            case LEV_FACTORING_RELIANCE -> t("Depender menos del anticipo de facturas",
                    "El " + pct(v) + " de la deuda es factoring o confirming.", action(f));
            case LEV_FUNDING_COST -> t("Abaratar la financiación",
                    "La deuda cuesta " + points(v) + " por encima del tipo de referencia"
                            + (f.fallback() ? " (según el tipo de interés pactado en los préstamos)" : "") + ".",
                    action(f));
            case PAY_DSO -> t("Cobrar antes",
                    "Las facturas emitidas tardan de media " + days(v) + " en cobrarse."
                            + (v != null && v > 60 ? " En España, el plazo máximo legal de pago entre empresas es "
                            + "de 60 días." : ""), action(f));
            case PAY_DPO -> t("Pagar a los proveedores en plazo",
                    "Los proveedores cobran de media a " + days(v) + ". En España, el máximo legal entre empresas "
                            + "es de 60 días y no se puede ampliar por contrato.", action(f));
            case PAY_SUPPLIER_LATENESS -> t("Dejar de pagar tarde a los proveedores",
                    "Los pagos a proveedores llegan de media " + days(v) + " después del vencimiento.", action(f));
            case PAY_OVERDUE_PAYABLES -> t("Ponerse al día con los proveedores",
                    "Hay facturas de proveedores vencidas y sin pagar por el " + pct(v) + " de lo recibido en 3 meses.",
                    action(f));
            case DEL_OVERDUE_RECEIVABLES -> t("Reclamar las facturas vencidas",
                    "Los clientes deben facturas vencidas por el " + pct(v) + " de lo facturado en 3 meses.",
                    action(f));
            case DEL_AGING_90 -> t("Resolver la deuda de clientes antigua",
                    "El " + pct(v) + " de lo que deben los clientes lleva más de 90 días vencido.", action(f));
            case CON_HHI_CUSTOMERS -> t("Depender de menos clientes",
                    "Los cobros se concentran tanto como si hubiera solo " + equivalent(v, "cliente")
                            + " del mismo tamaño (sobre los cobros con cliente identificado).", action(f));
            case CON_HHI_SUPPLIERS -> t("Tener alternativas a los proveedores principales",
                    "Los pagos se concentran tanto como si hubiera solo " + equivalent(v, "proveedor")
                            + " del mismo tamaño (sobre los pagos con proveedor identificado).", action(f));
            case CON_CUSTOMER_CHURN -> t("Recuperar a los clientes habituales",
                    "El " + pct(v) + " de los clientes habituales no ha pagado nada en los últimos 2 meses.", action(f));
            case TAX_REGULARITY -> t("Regularizar los pagos a Hacienda y Seguridad Social",
                    "Los pagos de impuestos y cotizaciones no siguen su calendario habitual (regularidad del "
                            + pct(v) + (f.fallback() ? ", con menos de 12 meses de historia" : "") + ").", action(f));
        };
    }

    /** What to do about each indicator, shared by its level and trend texts. */
    private static String action(Finding f) {
        return switch (f.id()) {
            case LIQ_RUNWAY -> "Reservar parte del flujo de los próximos meses para reconstruir el colchón y "
                    + "revisar qué salidas han crecido más.";
            case LIQ_BUFFER -> "Evitar comprometer pagos grandes nuevos hasta que la caja cubra con holgura lo que "
                    + "vence en 90 días, y escalonar los vencimientos.";
            case LIQ_MIN_BALANCE -> "Programar los pagos grandes después de los cobros principales del mes para no "
                    + "quedarse sin saldo a mitad de mes.";
            case CF_NOCF_MARGIN -> "Revisar precios, condiciones de cobro y gastos recurrentes: un margen de caja "
                    + "holgado da aire para la deuda y los imprevistos.";
            case CF_IN_OUT_RATIO -> "Revisar los pagos que más han crecido y acelerar el cobro de lo pendiente.";
            case CF_VOLATILITY -> "Con un flujo irregular el colchón tiene que ser mayor: hacer una previsión mensual "
                    + "con escenario pesimista y repartir los pagos grandes (impuestos, pagas extra) en el calendario.";
            case ACT_COLLECTIONS_GROWTH -> "Revisar la evolución de los clientes principales y el ritmo de nuevas "
                    + "ventas antes de que el estancamiento afecte a la caja.";
            case DEBT_DSCR -> "Evitar deuda nueva hasta tener más margen y valorar refinanciar a más plazo para "
                    + "bajar la cuota.";
            case DEBT_LINE_UTIL -> "Reducir el saldo dispuesto con los cobros del mes y negociar la renovación "
                    + "con antelación. Si el saldo es permanente, pasarlo a un préstamo a plazo.";
            case LEV_DEBT_TO_CF -> "Destinar el flujo libre a amortizar deuda y evitar deuda nueva hasta alcanzar "
                    + "el objetivo.";
            case LEV_FACTORING_RELIANCE -> "Combinar el anticipo de facturas con financiación a plazo y mejorar el "
                    + "cobro directo: depender del factoring encarece la financiación y deja la caja expuesta a que "
                    + "se retire la línea.";
            case LEV_FUNDING_COST -> "Pedir ofertas a otros bancos y renegociar o refinanciar primero los préstamos "
                    + "más caros.";
            case PAY_DSO -> "Facturar en el momento de la entrega, revisar las condiciones de pago de los clientes "
                    + "principales y reclamar de forma sistemática al día siguiente del vencimiento."
                    + (f.flag() ? " Si hace falta liquidez, anticipar facturas de clientes solventes (factoring) es "
                    + "una opción." : "");
            case PAY_DPO -> "Estirar los pagos es financiarse con los proveedores y acaba en peores precios, pagos por "
                    + "adelantado y avisos a las aseguradoras de crédito. Acordar calendarios realistas empezando por "
                    + "los proveedores críticos.";
            case PAY_SUPPLIER_LATENESS -> "Priorizar a los proveedores críticos y comunicarles un calendario antes "
                    + "del vencimiento: los retrasos habituales llegan a las aseguradoras de crédito y encarecen "
                    + "las compras.";
            case PAY_OVERDUE_PAYABLES -> "Hacer un calendario de pago de lo vencido, empezando por los proveedores "
                    + "críticos, y acordarlo con ellos.";
            case DEL_OVERDUE_RECEIVABLES -> "Reclamar lo vencido empezando por los importes mayores, fijar un "
                    + "responsable de cobro y dejar de vender a crédito a quien acumule impagos.";
            case DEL_AGING_90 -> "Negociar planes de pago o reclamar formalmente la deuda antigua, dejar de vender a "
                    + "crédito a esos clientes y valorar provisionarla.";
            case CON_HHI_CUSTOMERS -> "Perder a uno de los clientes principales pondría en riesgo la caja: "
                    + "diversificar la cartera comercial y, mientras tanto, vigilar la solvencia de los principales "
                    + "(un seguro de crédito cubre ese riesgo).";
            case CON_HHI_SUPPLIERS -> "Homologar un proveedor alternativo para los suministros críticos.";
            case CON_CUSTOMER_CHURN -> "Contactar con esos clientes para saber si se han ido o solo se han retrasado: "
                    + "recuperar un cliente cuesta menos que captar uno nuevo.";
            case TAX_REGULARITY -> "No dejar de pagar impuestos o cotizaciones para cuadrar la caja: genera recargos "
                    + "e intereses e impide obtener subvenciones o contratar con la Administración. Si no se llega, "
                    + "pedir un aplazamiento (en España, Hacienda no exige garantía por debajo de 50.000 € de deuda). "
                    + "Si los pagos salen de una cuenta no conectada, conectarla.";
        };
    }

    /** "Meses de caja ≥ 6,0 meses". Null when there is no target. */
    private static String goal(Finding f) {
        if (f.target() == null) return null;
        String sign = LOWER_IS_BETTER.contains(f.id()) ? "≤ " : "≥ ";
        String target = switch (f.id()) {
            case CON_HHI_CUSTOMERS, CON_HHI_SUPPLIERS -> String.format(ES, "%.0f", f.target());
            case LIQ_MIN_BALANCE -> pct(f.target()) + " de un mes de pagos";
            default -> value(f.id(), f.target());
        };
        return TemplateNarrativeRenderer.label(f.id()) + " " + sign + target;
    }

    static String situation(Summary s, int findings) {
        StringBuilder b = new StringBuilder(switch (s.situation()) {
            case NO_SCORE -> "No hay datos de esta entidad en este mes, así que no hay recomendaciones.";
            case INSUFFICIENT_HISTORY -> "Historial insuficiente: solo hay " + s.history() + " "
                    + (s.history() == 1 ? "mes" : "meses") + " con datos. Hacen falta al menos 3 para recomendar "
                    + "algo con fundamento.";
            case CRITICAL -> "Situación crítica: el score está en la banda más baja. Las acciones van por orden de urgencia.";
            case STRUCTURAL_DECLINE -> "Deterioro sostenido"
                    + (s.declineMonths() > 0 ? ": el score lleva " + s.declineMonths() + " meses seguidos bajando" : "")
                    + ". No es un mes malo, conviene actuar sobre las causas.";
            case TURNING -> "El nivel todavía es bueno, pero la tendencia ha empezado a torcerse. Es el momento más "
                    + "barato para corregir.";
            case DIP -> s.seasonal()
                    ? "Bache puntual y probablemente estacional: el mismo mes del año pasado pasó algo parecido. "
                            + "No conviene tomar medidas estructurales por un mes."
                    : "Bache puntual: este mes se separa de lo habitual, pero no hay deterioro sostenido. Vigilar "
                            + "antes de tomar medidas estructurales.";
            case IMPROVING -> "Mejora en marcha: mantener lo que está funcionando.";
            case EXCEPTIONAL -> "Salud financiera excepcional.";
            case HEALTHY -> "Situación sana y estable.";
            case WATCH -> "Situación intermedia: sin alarmas, pero con margen de mejora.";
        });
        if (s.situation() == Situation.NO_SCORE || s.situation() == Situation.INSUFFICIENT_HISTORY) {
            return b.toString();
        }
        if (s.limitedHistory()) {
            b.append(" Datos limitados (").append(s.history()).append(" meses): solo se señalan los problemas "
                    + "graves, sin tendencias ni oportunidades.");
        }
        if (!s.missing().isEmpty()) {
            b.append(" Sin datos de ").append(s.missing().stream().map(RecommendationTemplates::category)
                    .collect(Collectors.joining(", "))).append(": no se puede recomendar nada sobre ")
                    .append(s.missing().size() == 1 ? "esa área." : "esas áreas.");
        }
        if (findings == 0) {
            b.append(s.limitedHistory() ? " Con los datos disponibles no se detecta ningún problema grave."
                    : " No hay acciones prioritarias este mes.");
        }
        return b.toString();
    }

    private static String category(Category c) {
        return switch (c) {
            case LIQUIDITY -> "liquidez";
            case OPERATING_CASH_FLOW -> "flujo de caja operativo";
            case ACTIVITY_GROWTH -> "crecimiento de actividad";
            case DEBT_SERVICE -> "servicio de la deuda";
            case LEVERAGE -> "apalancamiento";
            case PAYMENT_BEHAVIOUR -> "pagos a proveedores";
            case DELINQUENCY -> "cobros vencidos";
            case CONCENTRATION -> "concentración de clientes y proveedores";
            case TAX_REGULARITY -> "pagos fiscales";
            case MOMENTUM -> "momentum";
        };
    }

    // ---- formatting

    private static String[] t(String title, String why, String action) {
        return new String[]{title, why, action};
    }

    private static String base(Finding f) {
        return f.fallback() ? "al trimestre anterior" : "al mismo trimestre del año anterior";
    }

    private static String fallback12(Finding f) {
        return f.fallback() ? " (estimado con menos de 12 meses de datos)" : "";
    }

    private static String value(IndicatorId id, Double v) {
        if (v == null) return "n/d";
        return switch (id) {
            case LIQ_RUNWAY -> months(v);
            case LIQ_BUFFER, CF_IN_OUT_RATIO, DEBT_DSCR -> mult(v);
            case LEV_DEBT_TO_CF -> years(v);
            case LEV_FUNDING_COST -> points(v);
            case PAY_DSO, PAY_DPO, PAY_SUPPLIER_LATENESS -> days(v);
            case CON_HHI_CUSTOMERS, CON_HHI_SUPPLIERS -> String.format(ES, "HHI %.0f", v);
            case ACT_COLLECTIONS_GROWTH -> signedPct(v);
            default -> pct(v);
        };
    }

    private static String months(Double v) {
        if (v >= 24) return "más de 24 meses";
        if (v < 0.25) return "menos de una semana";
        return String.format(ES, "%.1f meses", v);
    }

    private static String days(Double v) {
        return String.format(ES, "%.0f días", v);
    }

    private static String years(Double v) {
        return String.format(ES, "%.1f años", v);
    }

    /** Above 10x the exact multiple means "the base is tiny", not a precision worth showing. */
    private static String mult(Double v) {
        if (v > 10) return "más de 10x";
        return String.format(ES, "%.2fx", v);
    }

    private static String pct(Double v) {
        return String.format(ES, "%.0f %%", v * 100);
    }

    private static String signedPct(Double v) {
        return (v > 0 ? "+" : v < 0 ? "−" : "") + String.format(ES, "%.0f %%", Math.abs(v) * 100);
    }

    /** A spread in percentage points. */
    private static String points(Double v) {
        return String.format(ES, "%.1f puntos porcentuales", v * 100);
    }

    private static String per100(Double ratio) {
        return String.format(ES, "%.0f", ratio * 100);
    }

    /** 10,000 / HHI = the number of equal-size counterparties with the same concentration. */
    private static String equivalent(Double hhi, String noun) {
        double n = 10_000 / hhi;
        if (n < 1.5) return "un " + noun;
        String plural = noun.endsWith("r") ? noun + "es" : noun + "s";
        return String.format(ES, "%.0f %s", n, plural);
    }
}
