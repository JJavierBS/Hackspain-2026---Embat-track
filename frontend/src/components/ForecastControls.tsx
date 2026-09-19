import type { Forecast, ForecastReliability } from "../api/types";
import { monthCode } from "../lib/format";

/** Honest wording of the reliability rule (phase 7 decision H14). A LOW forecast is labelled, never hidden. */
const RELIABILITY: Record<ForecastReliability, { label: string; className: string }> = {
  LOW: {
    label: "Menos de 6 meses de histórico: previsión poco fiable",
    className: "border-down text-down font-semibold",
  },
  MEDIUM: { label: "Fiabilidad limitada", className: "border-band-c text-ink" },
  HIGH: {
    label: "Histórico suficiente",
    className: "border-rule text-ink-muted",
  },
};

interface ForecastControlsProps {
  forecast: Forecast;
  horizon: number;
  onHorizon: (h: number) => void;
}

/** How many months to project (1..maxHorizon, written to the URL) and how far to trust it. */
export function ForecastControls({ forecast, horizon, onHorizon }: ForecastControlsProps) {
  const shown = Math.min(horizon, forecast.maxHorizon);
  const options = Array.from({ length: forecast.maxHorizon }, (_, i) => i + 1);
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <div className="flex items-center gap-2" role="group" aria-label="Meses de proyección">
        <span className="text-ink-muted">Proyectar</span>
        <div className="flex border border-rule">
          {options.map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={h === shown}
              onClick={() => onHorizon(h)}
              className={`min-w-8 px-2 py-1 tabular-nums ${h === shown ? "bg-ink text-film" : "text-ink hover:bg-panel"}`}
            >
              {h}
            </button>
          ))}
        </div>
        <span className="text-ink-muted">{shown === 1 ? "mes" : "meses"}</span>
      </div>
      {forecast.reliability === null ? (
        <span className="text-ink-muted">Sin proyección en {monthCode(forecast.origin)}: hace falta más historia.</span>
      ) : (
        <span className={`border px-2 py-0.5 ${RELIABILITY[forecast.reliability].className}`}>
          {RELIABILITY[forecast.reliability].label}
          {forecast.history !== null && ` · ${forecast.history} meses`}
        </span>
      )}
    </div>
  );
}
