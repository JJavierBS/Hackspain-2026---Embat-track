import type { Forecast } from "../api/types";
import { formatScore, monthCode, monthShort } from "../lib/format";

/** Below this mean gap, in points, the projection reads as unbiased. Wording only, not a score threshold. */
const UNBIASED_POINTS = 0.5;

/**
 * On a past month: each projected month next to the score measured later. Hidden when no projected month has a
 * score yet (the last month of data). The error is real − projected: below 0 the entity did worse than projected.
 */
export function ForecastCheck({ forecast }: { forecast: Forecast }) {
  const checked = forecast.points.filter((p) => p.actual !== null);
  if (checked.length === 0) return null;
  const bias = forecast.bias ?? 0;
  const errors = checked.map((p) => (p.actual as number) - p.value);
  const sameSide = errors.every((e) => e > 0) || errors.every((e) => e < 0);
  const tone =
    Math.abs(bias) < UNBIASED_POINTS
      ? "sin sesgo claro"
      : `${bias > 0 ? "optimista" : "pesimista"}${sameSide && checked.length > 1 ? " en todos los meses" : " de media"}`;
  return (
    <div className="mt-6 border-t border-rule pt-4">
      <h3 className="font-semibold text-ink">Proyección frente a lo que pasó</h3>
      <p className="mt-1 text-sm text-ink-muted">
        Proyectado en {monthCode(forecast.origin)} con los datos hasta ese mes. Error medio{" "}
        <span className="font-semibold text-ink tabular-nums">{formatScore(forecast.meanAbsError ?? 0)} puntos</span> en{" "}
        {checked.length} {checked.length === 1 ? "mes" : "meses"} · la proyección fue {tone}.
      </p>
      <table className="mt-3 w-full max-w-md border-collapse text-left text-sm tabular-nums">
        <thead>
          <tr className="border-b border-ink/20 text-ink-muted">
            <th className="py-1.5 pr-4 font-medium">Mes</th>
            <th className="py-1.5 pr-4 text-right font-medium">Proyección</th>
            <th className="py-1.5 pr-4 text-right font-medium">Real</th>
            <th className="py-1.5 text-right font-medium" title="Real menos proyección. Negativo: peor de lo proyectado.">
              Error
            </th>
          </tr>
        </thead>
        <tbody>
          {forecast.points.map((p) => {
            const err = p.actual === null ? null : p.actual - p.value;
            return (
              <tr key={p.month} className="border-b border-rule last:border-b-0">
                <td className="py-1.5 pr-4 text-ink">
                  {monthShort(p.month)} <span className="text-ink-muted">· {monthCode(p.month)}</span>
                </td>
                <td className="py-1.5 pr-4 text-right text-ink">{formatScore(p.value)}</td>
                <td className="py-1.5 pr-4 text-right font-semibold text-ink">
                  {p.actual === null ? <span className="font-normal text-ink-muted">—</span> : formatScore(p.actual)}
                </td>
                <td className="py-1.5 text-right text-ink">
                  {err === null ? <span className="text-ink-muted">—</span> : `${err > 0 ? "+" : err < 0 ? "−" : ""}${formatScore(Math.abs(err))}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
