import type { PresetChange } from "../api/useAlgorithmConfig";
import type { Category, Status } from "../api/types";
import { PROFILES } from "../hooks/useGlobalParams";
import { CATEGORY_LABELS, INDICATOR_LABELS, PROFILE_LABELS, STATUS_LABELS } from "./format";

/** The scoring config as GET /api/config sends it: the backend records, camelCase keys. */
export type ConfigTree = Record<string, unknown>;
export type Anchor = [number, number];

export interface IndicatorEntry {
  category: Category;
  method: string;
  status: "CLOSED" | "PENDING";
  source: string;
  anchors: Anchor[];
  weight: number | null;
}

export interface ProfileEntry {
  lambda: number;
  weights: Record<Category, number>;
}

export type Path = (string | number)[];

export function getIn(tree: unknown, path: Path): unknown {
  let node = tree;
  for (const key of path) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string | number, unknown>)[key];
  }
  return node;
}

/** A copy of tree with the value at path replaced. Only the nodes on the path are copied. */
export function setIn<T>(tree: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;
  const node = (tree ?? {}) as Record<string | number, unknown>;
  const copy = (Array.isArray(node) ? [...node] : { ...node }) as Record<string | number, unknown>;
  copy[head] = setIn(node[head], rest, value);
  return copy as T;
}

/**
 * Leaf values keyed by dotted path. An array is one leaf: an anchor list or a status list changes as a whole.
 */
export function flatten(tree: unknown, prefix: Path = [], out = new Map<string, { path: Path; value: unknown }>()) {
  if (tree !== null && typeof tree === "object" && !Array.isArray(tree)) {
    for (const [k, v] of Object.entries(tree)) flatten(v, [...prefix, k], out);
  } else {
    out.set(prefix.join("."), { path: prefix, value: tree });
  }
  return out;
}

export interface Change {
  key: string;
  path: Path;
  before: unknown;
  after: unknown;
}

/** Leaves that differ between two trees, restricted to the editable sections. */
export function diff(before: ConfigTree, after: ConfigTree, sections: string[]): Change[] {
  const changes: Change[] = [];
  for (const section of sections) {
    const a = flatten(before[section], [section]);
    const b = flatten(after[section], [section]);
    for (const [key, { path, value }] of b) {
      const old = a.get(key)?.value;
      if (JSON.stringify(old) !== JSON.stringify(value)) changes.push({ key, path, before: old, after: value });
    }
  }
  return changes;
}

export function countIn(changes: Change[], section: string): number {
  return changes.filter((c) => c.path[0] === section).length;
}

const NUM = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 4 });

/** A number as an expert types it: Spanish decimal comma, true minus sign, up to 4 decimals. */
export function formatValue(value: unknown): string {
  if (typeof value === "number") return NUM.format(value).replace("-", "−");
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) {
    if (value.every((v) => Array.isArray(v))) return (value as Anchor[]).map(([x, y]) => `(${formatValue(x)}; ${formatValue(y)})`).join(" ");
    return value.map((v) => ENUM_LABELS[String(v)] ?? String(v)).join(", ") || "ninguno";
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k} ${formatValue(v)}`)
      .join(" · ");
  }
  return ENUM_LABELS[String(value)] ?? String(value);
}

/** Accepts "0,35", "0.35", "−2" and "1.234,5". Returns null for text that is not a number. */
export function parseNumber(text: string): number | null {
  let t = text.trim().replace("−", "-").replace(/\s/g, "");
  if (t === "" || t === "-") return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export const round = (v: number, digits = 4) => Math.round(v * 10 ** digits) / 10 ** digits;

/** Sections of the page, in reading order. Each owns one or more config keys. */
export const SECTIONS: { id: string; title: string; keys: string[] }[] = [
  { id: "presets", title: "Presets por cliente", keys: [] },
  { id: "vista-previa", title: "Vista previa en una entidad", keys: [] },
  { id: "pesos", title: "Pesos por perfil", keys: ["profiles"] },
  { id: "indicadores", title: "Indicadores y anclas", keys: ["indicators"] },
  { id: "reglas", title: "Reglas de indicadores", keys: ["runwayCapMonths", "debtDscr", "levDebtToCf", "concentration", "windows", "taxRegularity"] },
  { id: "trayectoria", title: "Trayectoria y regímenes", keys: ["trajectory", "regimes", "momentum"] },
  { id: "estados", title: "Estados y confianza", keys: ["statuses", "confidence", "explanation"] },
  { id: "limite", title: "Límite de circulante", keys: ["limitEngine"] },
  { id: "prima", title: "Prima y productos", keys: ["insurer", "products"] },
  { id: "alertas", title: "Alertas", keys: ["alerts"] },
  { id: "anticipacion", title: "Anticipación y escaparate", keys: ["leadTime", "showcase"] },
  { id: "prevision", title: "Previsión", keys: ["forecast"] },
  { id: "solo-lectura", title: "Fuera de este editor", keys: [] },
];

export interface FieldMeta {
  label: string;
  hint?: string;
  unit?: string;
  /** Shown ×100 with a % sign; the config keeps the fraction. */
  percent?: boolean;
  integer?: boolean;
  min?: number;
  max?: number;
  /** Allowed values for a string or a list of strings. */
  options?: readonly string[];
}

const STATUSES = Object.keys(STATUS_LABELS) as Status[];
const INDICATORS = Object.keys(INDICATOR_LABELS).filter((id) => id !== "MOMENTUM");

export const ENUM_LABELS: Record<string, string> = {
  ...STATUS_LABELS,
  ...Object.fromEntries(INDICATORS.map((id) => [id, INDICATOR_LABELS[id].label])),
  ...Object.fromEntries(PROFILES.map((p) => [p, PROFILE_LABELS[p].name])),
  ...CATEGORY_LABELS,
};

const months = { unit: "meses", integer: true, min: 1 } as const;
const points = { unit: "puntos", min: 0, max: 100 } as const;
const share = { percent: true, min: 0, max: 1 } as const;

/** Label, unit and bounds of every editable number, keyed by dotted path. A missing entry falls back to the key. */
export const FIELDS: Record<string, FieldMeta> = {
  // Indicator rules
  runwayCapMonths: { label: "Tope de meses de caja", hint: "Meses de caja por encima de este valor cuentan como este valor.", unit: "meses", min: 1 },
  "debtDscr.noDebtLevel": { label: "DSCR sin deuda: nivel", hint: "Nivel del indicador cuando la entidad no paga deuda.", ...points },
  "levDebtToCf.nonPositiveCfLevel": { label: "Deuda con caja operativa ≤ 0: nivel", hint: "Nivel cuando hay deuda y la caja operativa de 12 meses no es positiva.", ...points },
  "concentration.minCounterpartyCoverage": { label: "Cobertura mínima de contrapartes", hint: "Por debajo, los indicadores de concentración no están disponibles.", ...share },
  "windows.annualizeMinMonths": { label: "Meses activos para anualizar", hint: "Con menos meses activos, una ventana de 12 meses no está disponible.", ...months },
  "taxRegularity.windowMonths": { label: "Ventana fiscal", ...months },
  "taxRegularity.monthlyMaxMedianGap": { label: "Hueco mediano máximo para cadencia mensual", unit: "meses", min: 0 },
  "taxRegularity.monthlyCadenceMonths": { label: "Cadencia mensual", ...months },
  "taxRegularity.quarterlyCadenceMonths": { label: "Cadencia trimestral", ...months },
  "taxRegularity.minTaxMonths": { label: "Meses con impuestos mínimos", hint: "Con menos, la cadencia es desconocida.", ...months },

  // Trajectory and regimes
  "trajectory.smoothingWindow": { label: "Ventana de suavizado", ...months },
  "trajectory.slopeWindow": { label: "Ventana de pendiente", ...months },
  "trajectory.minPoints": { label: "Puntos mínimos", unit: "meses", integer: true, min: 2 },
  "trajectory.slopeToScoreSpan": { label: "Pendiente que lleva a 0 o a 100", hint: "Una pendiente de este tamaño mueve la trayectoria 50 puntos.", unit: "puntos/mes", min: 0 },
  "trajectory.slopeWeight": { label: "Peso de la pendiente", hint: "Pendiente y cambio reciente suman 1.", min: 0, max: 1 },
  "trajectory.deltaWeight": { label: "Peso del cambio reciente", min: 0, max: 1 },
  "regimes.cusumK": { label: "CUSUM k (holgura)", unit: "σ", min: 0 },
  "regimes.cusumH": { label: "CUSUM h (umbral de alarma)", unit: "σ", min: 0 },
  "regimes.cusumZCap": { label: "Tope de z por mes", hint: "Un valor atípico no mantiene la alarma durante meses.", unit: "σ", min: 0 },
  "regimes.persistenceMonths": { label: "Meses de persistencia", ...months },
  "regimes.slopeThreshold": { label: "Pendiente estructural", unit: "puntos/mes", min: 0 },
  "regimes.dipZ": { label: "z de bache", hint: "Una caída por debajo de este z abre un bache.", unit: "σ" },
  "regimes.dipMaxMonths": { label: "Duración máxima de un bache", ...months },
  "regimes.baselineMonths": { label: "Meses de referencia", ...months },
  "regimes.baselineMinPoints": { label: "Puntos mínimos de referencia", ...months },
  "regimes.sigmaFloor": { label: "σ mínima", unit: "puntos", min: 0 },
  "regimes.dipRecoveryMonths": { label: "Meses para superar un bache", ...months },
  "regimes.slopeMonths": { label: "Meses de pendiente", ...months },
  "regimes.slopeMinPoints": { label: "Puntos mínimos de pendiente", ...months },
  "regimes.cusumIndicators": { label: "Indicadores vigilados por CUSUM", options: INDICATORS },
  "momentum.pointsPerMonth": { label: "Puntos por mes de persistencia", unit: "puntos", min: 0 },
  "momentum.cap": { label: "Tope del ajuste", unit: "puntos", min: 0 },

  // Statuses and confidence
  "statuses.criticalBelow": { label: "Crítica por debajo de", ...points },
  "statuses.turningMinLevel": { label: "Empieza a torcerse: nivel mínimo", ...points },
  "statuses.turningMaxTraj": { label: "Empieza a torcerse: trayectoria máxima", ...points },
  "statuses.improvingMinTraj": { label: "Mejorando: trayectoria mínima", ...points },
  "statuses.exceptionalMinFinal": { label: "Excepcional: puntuación mínima", ...points },
  "statuses.exceptionalMinTraj": { label: "Excepcional: trayectoria mínima", ...points },
  "statuses.healthyMinFinal": { label: "Sana: puntuación mínima", ...points },
  "confidence.lowHistoryMonths": { label: "Confianza baja con menos de", ...months },
  "confidence.mediumHistoryMonths": { label: "Confianza media con menos de", ...months },
  "confidence.lowAvailableShare": { label: "Indicadores disponibles mínimos", hint: "Por debajo de esta cuota, la confianza es baja.", ...share },
  "confidence.minTrustedWeightShare": { label: "Peso mínimo para confiar", hint: "Por debajo de esta cuota del peso del perfil en categorías disponibles, la puntuación se marca «Sin historial» y no entra en el ranking.", ...share },
  "explanation.narrativeTopN": { label: "Motivos narrados por entidad", integer: true, min: 1 },
  "explanation.minNarratedDelta": { label: "Cambio mínimo narrado", unit: "puntos", min: 0 },

  // Limit engine
  "limitEngine.base": { label: "Base del límite", hint: "Mediana de los cobros operativos de 3 meses." },
  "limitEngine.scoreFloor": { label: "Puntuación mínima para dar límite", ...points },
  "limitEngine.factorAtFloor": { label: "Factor en la puntuación mínima", unit: "× base", min: 0 },
  "limitEngine.factorAt100": { label: "Factor a 100 puntos", unit: "× base", min: 0 },
  "limitEngine.trendModifierSpan": { label: "Ajuste máximo por tendencia", ...share },
  "limitEngine.runwayGuard.belowMonths": { label: "Freno de caja: por debajo de", unit: "meses", min: 0 },
  "limitEngine.runwayGuard.multiplier": { label: "Freno de caja: multiplicador", unit: "×", min: 0, max: 1 },
  "limitEngine.dscrMin": { label: "DSCR mínimo", unit: "x", min: 0 },
  "limitEngine.defaultTermMonths": { label: "Plazo por defecto", ...months },
  "limitEngine.referenceRate": { label: "Tipo de referencia", hint: "Valor de ejemplo. También alimenta el diferencial de financiación.", percent: true, min: 0, max: 1 },
  "limitEngine.actionThreshold": { label: "Cambio mínimo para actuar", hint: "Un cambio de límite menor no genera acción.", ...share },
  "limitEngine.roundingEur": { label: "Redondeo del límite", unit: "€", min: 1 },

  // Premium and products
  "insurer.basePremiumRate": { label: "Prima base", percent: true, min: 0, max: 1 },
  "products.limitProfile": { label: "Perfil del límite", options: PROFILES },
  "products.premiumProfile": { label: "Perfil de la prima", options: PROFILES },
  "products.momentumProfile": { label: "Perfil del momentum", options: PROFILES },
  "products.momentum.risingStarMaxLevel": { label: "Estrella emergente: nivel máximo", ...points },
  "products.momentum.risingStarMinTraj": { label: "Estrella emergente: trayectoria mínima", ...points },

  // Alerts (the warn / critical pairs have their own table)
  "alerts.scoreDropMonths": { label: "Ventana de caída de puntuación", ...months },
  "alerts.driftBaselineMonths": { label: "Meses de referencia de deriva", ...months },
  "alerts.driftBaselineMinPoints": { label: "Puntos mínimos de deriva", ...months },
  "alerts.bandDowngradeCriticalSteps": { label: "Bajada de banda crítica desde", unit: "bandas", integer: true, min: 1 },
  "alerts.watchlist.minCritical": { label: "Vigilancia: alertas críticas mínimas", integer: true, min: 1 },
  "alerts.watchlist.minWarn": { label: "Vigilancia: avisos mínimos", integer: true, min: 1 },
  "alerts.watchlist.confirmMonths": { label: "Vigilancia: meses para confirmar", ...months },
  "alerts.watchlist.recentMonths": { label: "Vigilancia: meses recientes", ...months },

  // Lead time and showcase
  "leadTime.minHistoryMonths": { label: "Historia mínima", ...months },
  "leadTime.windowMonths": { label: "Ventana de búsqueda", ...months },
  "leadTime.horizonMonths": { label: "Horizonte", ...months },
  "leadTime.events.runwayBelow": { label: "Evento: meses de caja por debajo de", unit: "meses", min: 0 },
  "leadTime.events.runwayMonths": { label: "Evento: meses seguidos sin caja", ...months },
  "leadTime.events.dscrBelow": { label: "Evento: DSCR por debajo de", unit: "x", min: 0 },
  "leadTime.events.dscrMonths": { label: "Evento: meses seguidos con DSCR bajo", ...months },
  "leadTime.events.overdueMaxLevel": { label: "Evento: nivel de vencidos máximo", ...points },
  "leadTime.events.scoreBelow": { label: "Evento: puntuación por debajo de", ...points },
  "leadTime.events.improvementCross": { label: "Mejora: cruza por encima de", ...points },
  "leadTime.events.improvementCrossMonths": { label: "Mejora: meses por encima", ...months },
  "leadTime.events.improvementBelow": { label: "Mejora: venía por debajo de", ...points },
  "leadTime.events.improvementBelowMonths": { label: "Mejora: meses por debajo", ...months },
  "leadTime.signal.deteriorationStatuses": { label: "Señal de deterioro: estados", options: STATUSES },
  "leadTime.signal.deteriorationMaxTraj": { label: "Señal de deterioro: trayectoria máxima", ...points },
  "leadTime.signal.improvementStatuses": { label: "Señal de mejora: estados", options: STATUSES },
  "leadTime.signal.improvementMinTraj": { label: "Señal de mejora: trayectoria mínima", ...points },
  "leadTime.signal.maxGapMonths": { label: "Hueco máximo de la señal", unit: "meses", integer: true, min: 0 },
  "showcase.maxFinalGap": { label: "Diferencia máxima de puntuación", unit: "puntos", min: 0 },
  "showcase.upMinTraj": { label: "Pareja al alza: trayectoria mínima", ...points },
  "showcase.downMaxTraj": { label: "Pareja a la baja: trayectoria máxima", ...points },
  "showcase.topN": { label: "Parejas mostradas", integer: true, min: 1 },

  // Forecast
  "forecast.meanReversion": { label: "Persistencia ρ", hint: "Fracción de la distancia a la mediana que queda cada mes.", min: 0, max: 1 },
  "forecast.maxHorizonMonths": { label: "Horizonte máximo", ...months },
  "forecast.minPoints": { label: "Meses puntuados mínimos", ...months },
  "forecast.minHistoryMonths": { label: "Confianza baja con menos de", ...months },
  "forecast.mediumHistoryMonths": { label: "Confianza media con menos de", ...months },
};

/** SPEC §8.5 alert thresholds. "below" rules fire under the value, the others above it. */
export const ALERT_LEVELS: { key: string; label: string; below?: boolean; unit?: string; percent?: boolean }[] = [
  { key: "runwayLow", label: "Meses de caja bajos", below: true, unit: "meses" },
  { key: "dscrBreach", label: "Cobertura de deuda insuficiente", below: true, unit: "x" },
  { key: "lineUtilHigh", label: "Uso alto de pólizas", percent: true },
  { key: "dsoDrift", label: "Deriva del plazo de cobro", unit: "días" },
  { key: "supplierLatenessUp", label: "Más retraso a proveedores", unit: "días" },
  { key: "overdueReceivables", label: "Cobros vencidos", percent: true },
  { key: "taxGap", label: "Hueco fiscal", unit: "× cadencia" },
  { key: "concentrationHigh", label: "Concentración alta", unit: "HHI" },
  { key: "factoringSpike", label: "Salto del factoring", unit: "×" },
  { key: "scoreDrop", label: "Caída de puntuación", unit: "puntos" },
];

/** Label of a dotted path for the change list: "Banco · Liquidez", "Meses de caja · anclas". */
export function describe(path: Path): string {
  const [section, a, b, c] = path.map(String);
  if (section === "profiles") {
    const profile = ENUM_LABELS[a] ?? a;
    return b === "lambda" ? `${profile} · λ (peso del nivel)` : `${profile} · ${ENUM_LABELS[c] ?? c}`;
  }
  if (section === "indicators") {
    const what = b === "anchors" ? "anclas" : b === "weight" ? "peso en su categoría" : b;
    return `${ENUM_LABELS[a] ?? a} · ${what}`;
  }
  if (section === "alerts") {
    const level = ALERT_LEVELS.find((l) => l.key === a);
    if (level) return `${level.label} · ${b === "warn" ? "aviso" : "crítico"}`;
  }
  if ((section === "limitEngine" && a === "spreadBpsByBand") || (section === "insurer" && a === "multiplierByBand")) {
    return `${a === "spreadBpsByBand" ? "Diferencial" : "Multiplicador"} · banda ${b}`;
  }
  const key = path.join(".");
  return FIELDS[key]?.label ?? key;
}

/** Title of the section that owns a config key. */
export function sectionOf(key: string): string {
  return SECTIONS.find((s) => s.keys.includes(key))?.id ?? key;
}

/** Evidence status of a preset or sector value (presets.yml, sectors.yml). */
export const PRESET_STATUS: Record<PresetChange["status"], { label: string; hint: string }> = {
  sourced: { label: "Con fuente", hint: "Una fuente que leímos da el valor." },
  derived: { label: "Derivado", hint: "Una fuente da los extremos; una regla nuestra da el resto." },
  placeholder: { label: "Sin fuente", hint: "Criterio nuestro, sin fuente para la cifra." },
};
