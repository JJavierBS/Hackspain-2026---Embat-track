import { ALERT_LEVELS, FIELDS, type FieldMeta, SECTIONS, describe } from "./algorithm";
import { INDICATOR_LABELS, indicatorLabel } from "./format";

export interface ValueOption {
  path: string;
  label: string;
  group: string;
}

/** The two maps of a number per band. Their editor is the band grid, not a single field. */
export const BAND_MAPS: Record<string, { label: string; unit: string; note: string }> = {
  "limitEngine.spreadBpsByBand": {
    label: "Diferencial por banda",
    unit: "pb",
    note: "Puntos básicos sobre el tipo de referencia, por banda de puntuación.",
  },
  "insurer.multiplierByBand": {
    label: "Multiplicador de prima por banda",
    unit: "×",
    note: "Multiplica la prima base según la banda de la empresa asegurada.",
  },
};

/** Meta of an alert threshold, built from the alert table: the FIELDS map does not carry these pairs. */
export function alertMeta(path: string): FieldMeta | null {
  const [section, key, level] = path.split(".");
  if (section !== "alerts") return null;
  const alert = ALERT_LEVELS.find((a) => a.key === key);
  if (!alert || (level !== "warn" && level !== "critical")) return null;
  return {
    label: `${alert.label} · ${level === "warn" ? "aviso" : "crítico"}`,
    hint: alert.below ? "La alerta salta por debajo de este valor." : "La alerta salta por encima de este valor.",
    unit: alert.unit,
    percent: alert.percent,
    ...(alert.percent ? { min: 0, max: 1 } : {}),
  };
}

/** Every value a custom preset may carry, grouped as the Algorithm page groups them. Weights are out. */
function valueOptions(): ValueOption[] {
  const sectionTitle = new Map<string, string>();
  for (const section of SECTIONS) for (const key of section.keys) sectionTitle.set(key, section.title);

  const options: ValueOption[] = Object.keys(INDICATOR_LABELS)
    .filter((id) => id !== "MOMENTUM")
    .map((id) => ({ path: `indicators.${id}`, label: indicatorLabel(id), group: "Indicadores · anclas y peso" }));

  for (const [path, meta] of Object.entries(FIELDS)) {
    options.push({ path, label: meta.label, group: sectionTitle.get(path.split(".")[0]) ?? "Otros parámetros" });
  }
  for (const [path, map] of Object.entries(BAND_MAPS)) {
    options.push({ path, label: map.label, group: "Mapas por banda" });
  }
  for (const alert of ALERT_LEVELS) {
    options.push({ path: `alerts.${alert.key}.warn`, label: `${alert.label} · aviso`, group: "Umbrales de alerta" });
    options.push({ path: `alerts.${alert.key}.critical`, label: `${alert.label} · crítico`, group: "Umbrales de alerta" });
  }
  return options;
}

export const VALUE_OPTIONS = valueOptions();

/** The name of a preset value, as the reader of the entity page reads it. */
export function labelOf(path: string): string {
  const parts = path.split(".");
  if (parts[0] === "indicators" && parts.length === 2) return indicatorLabel(parts[1]);
  return BAND_MAPS[path]?.label ?? alertMeta(path)?.label ?? describe(parts);
}
