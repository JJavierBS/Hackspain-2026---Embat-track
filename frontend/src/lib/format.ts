import type { Category, Confidence, Regime, Status } from "../api/types";
import { MONTHS, type Profile } from "../hooks/useGlobalParams";

const MONTH_FORMAT = new Intl.DateTimeFormat("es-ES", { month: "short", year: "numeric", timeZone: "UTC" });
const MONTH_LONG = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });

function toDate(month: string): Date {
  return new Date(`${month}-01T00:00:00Z`);
}

/** "2026-08" → "M23". */
export function monthCode(month: string): string {
  return `M${String(MONTHS.indexOf(month)).padStart(2, "0")}`;
}

/** "2026-08" → "ago 2026". */
export function monthShort(month: string): string {
  return MONTH_FORMAT.format(toDate(month)).replace(".", "");
}

/** "2026-08" → "agosto de 2026". */
export function monthLong(month: string): string {
  return MONTH_LONG.format(toDate(month));
}

export const PROFILE_LABELS: Record<Profile, { name: string; product: string }> = {
  BANK: { name: "Banco", product: "límite de circulante" },
  FUND: { name: "Fondo", product: "momentum" },
  INSURER: { name: "Aseguradora", product: "prima de crédito" },
};

/** Score bands (SPEC §8.3). One accent color per band. */
export const BANDS = [
  { band: "A", min: 80, range: "≥ 80", color: "var(--color-band-a)" },
  { band: "B", min: 65, range: "65–79,9", color: "var(--color-band-b)" },
  { band: "C", min: 50, range: "50–64,9", color: "var(--color-band-c)" },
  { band: "D", min: 35, range: "35–49,9", color: "var(--color-band-d)" },
  { band: "E", min: -Infinity, range: "< 35", color: "var(--color-band-e)" },
] as const;

export type Band = (typeof BANDS)[number]["band"];

export function bandOf(score: number): (typeof BANDS)[number] {
  return BANDS.find((b) => score >= b.min) ?? BANDS[BANDS.length - 1];
}

const SCORE_FORMAT = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatScore(value: number): string {
  return SCORE_FORMAT.format(value);
}

const WEIGHT_FORMAT = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

/** A profile weight (0–100) as the config gives it: "25", "7,5". */
export function formatWeight(value: number): string {
  return WEIGHT_FORMAT.format(value);
}

/** Signed delta with a real minus sign: "+5,1", "−2,3". */
export function formatDelta(value: number): string {
  const abs = SCORE_FORMAT.format(Math.abs(value));
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return abs;
}


export const STATUS_LABELS: Record<Status, string> = {
  EXCEPTIONAL: "Excepcional",
  HEALTHY: "Sana",
  IMPROVING: "Mejorando",
  TURNING: "Empieza a torcerse",
  DIP: "Bache",
  STRUCTURAL_DECLINE: "Deterioro",
  CRITICAL: "Crítica",
  WATCH: "Vigilar",
};

export const REGIME_LABELS: Record<Regime, string> = {
  STABLE: "Estable",
  DIP: "Bache",
  DIP_RECOVERED: "Bache superado",
  STRUCTURAL_DECLINE: "Caída estructural",
  STRUCTURAL_IMPROVEMENT: "Mejora estructural",
};

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  HIGH: "Alta",
  MEDIUM: "Media",
  LOW: "Baja",
};

export const CATEGORY_LABELS: Record<Category, string> = {
  LIQUIDITY: "Liquidez",
  OPERATING_CASH_FLOW: "Flujo de caja operativo",
  ACTIVITY_GROWTH: "Crecimiento de actividad",
  DEBT_SERVICE: "Servicio de la deuda",
  LEVERAGE: "Apalancamiento",
  PAYMENT_BEHAVIOUR: "Comportamiento de pago",
  DELINQUENCY: "Morosidad",
  CONCENTRATION: "Concentración",
  TAX_REGULARITY: "Regularidad fiscal",
  MOMENTUM: "Momentum",
};

const EUR = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" });
const EUR_COMPACT = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  notation: "compact",
  maximumFractionDigits: 2,
});
const PCT = new Intl.NumberFormat("es-ES", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatEur(value: number): string {
  return EUR.format(value);
}

export function formatEurCompact(value: number): string {
  return EUR_COMPACT.format(value);
}

export function formatPct(value: number): string {
  return PCT.format(value);
}

/** Direction of a signed change, with a dead zone for rounding noise. */
export function directionOf(delta: number): "up" | "down" | "flat" {
  return delta > 0.05 ? "up" : delta < -0.05 ? "down" : "flat";
}

export function confidenceLabel(c: Confidence | null): string {
  return c === null ? "—" : CONFIDENCE_LABELS[c];
}

/** Spanish label and display unit of each indicator (SPEC §6). */
export const INDICATOR_LABELS: Record<string, { label: string; unit: "days" | "months" | "pct" | "x" | "ratio" | "hhi" }> = {
  LIQ_RUNWAY: { label: "Meses de caja", unit: "months" },
  LIQ_BUFFER: { label: "Colchón de liquidez", unit: "x" },
  LIQ_MIN_BALANCE: { label: "Saldo mínimo", unit: "ratio" },
  CF_NOCF_MARGIN: { label: "Margen de caja operativa", unit: "pct" },
  CF_VOLATILITY: { label: "Volatilidad del flujo", unit: "ratio" },
  CF_IN_OUT_RATIO: { label: "Cobros sobre pagos", unit: "x" },
  ACT_COLLECTIONS_GROWTH: { label: "Crecimiento de cobros", unit: "pct" },
  DEBT_DSCR: { label: "Cobertura de deuda (DSCR)", unit: "x" },
  DEBT_LINE_UTIL: { label: "Uso de pólizas", unit: "pct" },
  LEV_DEBT_TO_CF: { label: "Deuda sobre caja operativa", unit: "x" },
  LEV_FACTORING_RELIANCE: { label: "Peso del factoring", unit: "pct" },
  LEV_FUNDING_COST: { label: "Diferencial de financiación", unit: "pct" },
  PAY_DSO: { label: "Plazo de cobro (DSO)", unit: "days" },
  PAY_DPO: { label: "Plazo de pago (DPO)", unit: "days" },
  PAY_SUPPLIER_LATENESS: { label: "Retraso a proveedores", unit: "days" },
  PAY_OVERDUE_PAYABLES: { label: "Pagos vencidos", unit: "pct" },
  DEL_OVERDUE_RECEIVABLES: { label: "Cobros vencidos", unit: "pct" },
  DEL_AGING_90: { label: "Vencido a más de 90 días", unit: "pct" },
  CON_HHI_CUSTOMERS: { label: "Concentración de clientes (HHI)", unit: "hhi" },
  CON_HHI_SUPPLIERS: { label: "Concentración de proveedores (HHI)", unit: "hhi" },
  CON_CUSTOMER_CHURN: { label: "Rotación de clientes", unit: "pct" },
  TAX_REGULARITY: { label: "Regularidad fiscal", unit: "pct" },
  MOMENTUM: { label: "Momentum", unit: "ratio" },
};

const NUM0 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const NUM1 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const NUM2 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function indicatorLabel(id: string): string {
  return INDICATOR_LABELS[id]?.label ?? id;
}

/** A raw indicator value in its own unit, with a true minus sign (The Measured Figure Rule). */
export function formatIndicatorValue(id: string, value: number | null): string {
  if (value === null) return "—";
  return indicatorValueText(id, value).replace("-", "−");
}

function indicatorValueText(id: string, value: number): string {
  switch (INDICATOR_LABELS[id]?.unit) {
    case "days":
      return `${NUM0.format(value)} días`;
    case "months":
      return `${NUM1.format(value)} meses`;
    case "pct":
      return `${NUM0.format(value * 100)} %`;
    case "x":
      return `${NUM2.format(value)}x`;
    case "hhi":
      return NUM0.format(value);
    default:
      return NUM2.format(value);
  }
}

/** Anchors not yet reviewed (THRESHOLDS.md). The API sends the enum name, PENDING. */
export function isPendingAnchor(anchorStatus: string): boolean {
  return anchorStatus.toUpperCase() === "PENDING";
}
