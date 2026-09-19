import { useEffect } from "react";
import { BANDS, INDICATOR_LABELS, indicatorLabel } from "../../lib/format";
import { type Anchor, type IndicatorEntry, formatValue, getIn, round } from "../../lib/algorithm";
import { IconClose, IconPlus } from "../Icons";
import { useAlgorithm } from "./AlgorithmContext";
import { DefaultNote, NumberInput } from "./Fields";

const W = 320;
const H = 136;
const PAD = { left: 30, right: 10, top: 8, bottom: 22 };

/** Problems that the backend validator would refuse (ScoringConfigValidator), in the page's words. */
function anchorProblems(anchors: Anchor[]): string[] {
  const out: string[] = [];
  if (anchors.length < 2) out.push("Hacen falta al menos 2 puntos.");
  anchors.forEach(([x], i) => {
    if (i > 0 && !(x > anchors[i - 1][0])) out.push(`El valor del punto ${i + 1} debe ser mayor que el del punto ${i}.`);
  });
  return out;
}

/**
 * The level curve of one indicator: a piecewise-linear function of the raw value, clamped outside the anchors
 * (no extrapolation). Band zones sit behind it because the output is a 0–100 health level.
 */
function AnchorChart({ anchors, shipped, percent }: { anchors: Anchor[]; shipped: Anchor[] | null; percent: boolean }) {
  const all = [...anchors, ...(shipped ?? [])].map(([x]) => x);
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (!(hi > lo)) {
    lo -= 1;
    hi += 1;
  }
  const span = hi - lo;
  lo -= span * 0.08;
  hi += span * 0.08;
  const sx = (x: number) => PAD.left + ((x - lo) / (hi - lo)) * (W - PAD.left - PAD.right);
  const sy = (y: number) => PAD.top + (1 - y / 100) * (H - PAD.top - PAD.bottom);
  const line = (pts: Anchor[]) => pts.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(" ");
  const ordered = anchorProblems(anchors).length === 0;
  const label = (x: number) => formatValue(percent ? round(x * 100, 4) : x) + (percent ? " %" : "");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Curva de nivel del indicador">
      {BANDS.map((b, i) => {
        const top = i === 0 ? 100 : BANDS[i - 1].min;
        const bottom = Number.isFinite(b.min) ? b.min : 0;
        return (
          <rect
            key={b.band}
            x={PAD.left}
            width={W - PAD.left - PAD.right}
            y={sy(top)}
            height={sy(bottom) - sy(top)}
            fill={b.color}
            opacity={0.07}
          />
        );
      })}
      {[0, 50, 100].map((y) => (
        <g key={y}>
          <line x1={PAD.left} x2={W - PAD.right} y1={sy(y)} y2={sy(y)} stroke="var(--color-rule)" strokeDasharray={y === 50 ? "3 3" : undefined} />
          <text x={PAD.left - 6} y={sy(y) + 4} textAnchor="end" fontSize={11} fill="var(--color-ink-muted)">
            {y}
          </text>
        </g>
      ))}
      {shipped && (
        <polyline
          points={line([[lo, shipped[0][1]], ...shipped, [hi, shipped[shipped.length - 1][1]]])}
          fill="none"
          stroke="var(--color-ink-muted)"
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />
      )}
      {ordered && (
        <>
          <polyline points={line([[lo, anchors[0][1]], anchors[0]])} fill="none" stroke="var(--color-ink)" strokeWidth={1.5} strokeDasharray="2 3" />
          <polyline
            points={line([anchors[anchors.length - 1], [hi, anchors[anchors.length - 1][1]]])}
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth={1.5}
            strokeDasharray="2 3"
          />
          <polyline points={line(anchors)} fill="none" stroke="var(--color-ink)" strokeWidth={2.5} strokeLinejoin="round" />
        </>
      )}
      {anchors.map(([x, y], i) => (
        <rect key={i} x={sx(x) - 3.5} y={sy(y) - 3.5} width={7} height={7} fill="var(--color-film)" stroke="var(--color-ink)" strokeWidth={2} />
      ))}
      <text x={PAD.left} y={H - 5} fontSize={11} fill="var(--color-ink-muted)">
        {label(Math.min(...anchors.map(([x]) => x)))}
      </text>
      <text x={W - PAD.right} y={H - 5} textAnchor="end" fontSize={11} fill="var(--color-ink-muted)">
        {label(Math.max(...anchors.map(([x]) => x)))}
      </text>
    </svg>
  );
}

/** One indicator: name, status, weight inside its category, anchor points and the curve they draw. */
export function IndicatorRow({ id }: { id: string }) {
  const { draft, saved, defaults, editable, setAt, reportInvalid } = useAlgorithm();
  const entry = getIn(draft, ["indicators", id]) as IndicatorEntry;
  const shippedEntry = getIn(defaults, ["indicators", id]) as IndicatorEntry | undefined;
  const anchors = entry.anchors;
  const percent = INDICATOR_LABELS[id]?.unit === "pct";
  const problems = anchorProblems(anchors);
  const changedFromShipped = JSON.stringify(anchors) !== JSON.stringify(shippedEntry?.anchors);
  const dirty = JSON.stringify(getIn(saved, ["indicators", id])) !== JSON.stringify(entry);
  const higherIsBetter = anchors[anchors.length - 1][1] >= anchors[0][1];
  const key = `indicators.${id}.anchors`;

  useEffect(() => {
    reportInvalid(key, problems.length > 0);
    return () => reportInvalid(key, false);
  }, [key, problems.length, reportInvalid]);

  function add() {
    const last = anchors[anchors.length - 1];
    const prev = anchors[anchors.length - 2];
    const step = prev ? last[0] - prev[0] : 1;
    setAt(["indicators", id, "anchors"], [...anchors, [round(last[0] + (step > 0 ? step : 1), 6), last[1]]]);
  }

  function remove(i: number) {
    setAt(["indicators", id, "anchors"], anchors.filter((_, j) => j !== i));
  }

  return (
    <article className="relative grid gap-6 border-t border-rule py-6 first:border-t-0 lg:grid-cols-[minmax(0,3fr)_minmax(0,9fr)]">
      {dirty && <span aria-hidden className="absolute top-0 left-0 h-0.5 w-24 bg-ink" />}
      <div className="grid content-start gap-3">
        <div>
          <h4 className="text-lg font-semibold tracking-tight">{indicatorLabel(id)}</h4>
          <p className="text-sm text-ink-muted">{id}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span
            className={`border px-2 py-0.5 font-medium ${entry.status === "PENDING" ? "border-dashed border-ink-muted text-ink-muted" : "border-rule text-ink"}`}
            title={entry.status === "PENDING" ? "Ancla provisional: pendiente de cerrar con los expertos (docs/THRESHOLDS.md)" : "Ancla cerrada"}
          >
            {entry.status === "PENDING" ? "Provisional" : "Cerrada"}
          </span>
          <span className="text-ink-muted">{higherIsBetter ? "Más es mejor" : "Menos es mejor"}</span>
        </div>
        <p className="text-sm text-ink-muted">Fuente: {entry.source}</p>
        {entry.weight !== null && (
          <div className="grid gap-1">
            <span className="text-[15px] font-semibold">Peso en su categoría</span>
            <NumberInput path={["indicators", id, "weight"]} meta={{ label: `Peso de ${indicatorLabel(id)} en su categoría`, min: 0.0001 }} size="sm" />
            <DefaultNote path={["indicators", id, "weight"]} />
          </div>
        )}
      </div>

      <div className="grid min-w-0 gap-6 md:grid-cols-[19rem_minmax(0,1fr)]">
        <div className="grid max-w-[19rem] content-start gap-2">
          <table className="border-collapse text-sm">
            <thead>
              <tr className="text-left text-ink-muted">
                <th scope="col" className="pr-2 pb-1 font-normal">
                  <span className="sr-only">Punto</span>
                </th>
                <th scope="col" className="px-1 pb-1 font-normal">
                  Valor{percent ? " (%)" : ""}
                </th>
                <th scope="col" className="px-1 pb-1 font-normal">
                  Nivel
                </th>
                <th scope="col" className="pb-1">
                  <span className="sr-only">Quitar</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {anchors.map((_, i) => (
                <tr key={i} className="align-top">
                  <th scope="row" className="pt-2 pr-2 text-left font-normal text-ink-muted">
                    P{i + 1}
                  </th>
                  <td className="px-1 py-0.5">
                    <NumberInput path={["indicators", id, "anchors", i, 0]} meta={{ label: `Valor del punto ${i + 1}`, percent }} size="sm" />
                  </td>
                  <td className="px-1 py-0.5">
                    <NumberInput path={["indicators", id, "anchors", i, 1]} meta={{ label: `Nivel del punto ${i + 1}`, min: 0, max: 100 }} size="sm" />
                  </td>
                  <td className="pt-1.5 pl-1">
                    {editable && anchors.length > 2 && (
                      <button
                        type="button"
                        onClick={() => remove(i)}
                        aria-label={`Quitar el punto ${i + 1}`}
                        title="Quitar el punto"
                        className="grid h-7 w-7 place-items-center text-ink-muted hover:bg-panel-grid hover:text-ink"
                      >
                        <IconClose width={13} height={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {editable && (
            <button
              type="button"
              onClick={add}
              className="inline-flex w-fit items-center gap-1.5 border border-ink/25 px-2.5 py-1 text-sm hover:border-ink"
            >
              <IconPlus width={13} height={13} />
              Añadir punto
            </button>
          )}
          <DefaultNote path={["indicators", id, "anchors"]} />
          {problems.map((p) => (
            <p key={p} role="alert" className="max-w-[32ch] text-sm font-semibold text-ink">
              {p}
            </p>
          ))}
        </div>
        <figure className="grid max-w-[30rem] content-start gap-1">
          <AnchorChart anchors={anchors} shipped={changedFromShipped && shippedEntry ? shippedEntry.anchors : null} percent={percent} />
          <figcaption className="flex flex-wrap gap-x-4 text-sm text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-[3px] w-4 bg-ink" /> Curva actual
            </span>
            {changedFromShipped && (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="w-4 border-t-[1.5px] border-dashed border-ink-muted" /> Por defecto
              </span>
            )}
            <span>Fuera de los puntos, el nivel se mantiene.</span>
          </figcaption>
        </figure>
      </div>
    </article>
  );
}
