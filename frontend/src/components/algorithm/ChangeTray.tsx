import { useEffect, useState } from "react";
import type { ApplyPhase } from "../../api/useAlgorithmConfig";
import { type Change, SECTIONS, describe, formatValue } from "../../lib/algorithm";
import { IconRestart, IconWarning } from "../Icons";

interface Props {
  changes: Change[];
  invalid: number;
  phase: ApplyPhase;
  onUndo: (change: Change) => void;
  onDiscard: () => void;
  onApply: () => void;
  onClear: () => void;
}

const STAGE_LABELS: Record<string, string> = {
  S00_INGEST: "Lectura de los CSV",
  S10_STAGING: "Limpieza",
  S20_MONTHLY: "Agregados mensuales",
  S25_ROLLUP: "Grupos",
  S30_RAW_INDICATORS: "Indicadores",
  S40_NORMALIZE: "Anclas",
  S50_TRAJECTORY: "Trayectoria",
  S60_SCORE: "Puntuaciones",
  S65_EXPLAIN: "Explicaciones",
  S70_DYNAMICS: "Regímenes",
  S75_PRODUCTS: "Límites y primas",
  S80_ALERTS: "Alertas",
  S85_FORECAST: "Previsión",
  S90_ANALYTICS: "Anticipación",
  S95_QUANTILES: "Cuantiles",
};

/**
 * The control strip for unsaved edits. It is part of the viewer frame (dark material), because the frame
 * carries every control. Review opens in place: the list of changes, a consent box, then Apply.
 */
export function ChangeTray({ changes, invalid, phase, onUndo, onDiscard, onApply, onClear }: Props) {
  const [review, setReview] = useState(false);
  const [consent, setConsent] = useState(false);
  const sections = SECTIONS.filter((s) => changes.some((c) => s.keys.includes(String(c.path[0])))).length;
  const working = phase.kind === "saving" || phase.kind === "restarting" || phase.kind === "recalculating";

  // A new edit asks for consent again; no edit left closes the review.
  const [seen, setSeen] = useState(changes.length);
  if (seen !== changes.length) {
    setSeen(changes.length);
    setConsent(false);
    if (changes.length === 0) setReview(false);
  }

  useEffect(() => {
    if (phase.kind !== "done") return;
    const t = setTimeout(onClear, 6000);
    return () => clearTimeout(t);
  }, [phase.kind, onClear]);

  if (changes.length === 0 && phase.kind === "idle") return null;

  return (
    <div role="region" aria-label="Cambios sin guardar" className="fixed inset-x-0 bottom-0 z-20 border-t border-viewer-rule bg-viewer text-viewer-ink">
      <div className="mx-auto grid max-w-7xl gap-3 px-4 py-3 sm:px-6">
        {review && !working && phase.kind !== "done" && (
          <div className="grid gap-3 border-b border-viewer-rule pb-3">
            <ol className="grid max-h-[38vh] gap-px overflow-y-auto border border-viewer-rule bg-viewer-rule text-sm">
              {changes.map((c) => (
                <li key={c.key} className="grid items-center gap-x-4 gap-y-1 bg-viewer px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <span className="font-medium">{describe(c.path)}</span>
                  <span className="text-viewer-muted tabular-nums">
                    {formatValue(c.before)} <span aria-hidden>→</span>
                    <span className="sr-only">pasa a</span> <span className="font-semibold text-viewer-ink">{formatValue(c.after)}</span>
                  </span>
                  <button type="button" onClick={() => onUndo(c)} className="w-fit text-viewer-muted underline underline-offset-4 hover:text-viewer-ink">
                    Deshacer
                  </button>
                </li>
              ))}
            </ol>
            <label className="flex max-w-[80ch] cursor-pointer items-start gap-3 text-[15px]">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 appearance-none border border-viewer-muted bg-viewer checked:border-viewer-ink checked:bg-viewer-ink checked:shadow-[inset_0_0_0_3px_var(--color-viewer)]"
              />
              <span>
                Entiendo que el backend se reinicia y recalcula todo. Puntuaciones, bandas, estados, límites, primas, alertas y la
                anticipación medida cambian en todas las páginas y para todos los que usan este servidor.
              </span>
            </label>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Status changes={changes.length} sections={sections} invalid={invalid} phase={phase} />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {phase.kind === "error" && (
              <button type="button" onClick={onClear} className="px-3 py-1.5 text-[15px] text-viewer-muted hover:text-viewer-ink">
                Cerrar
              </button>
            )}
            {!working && phase.kind !== "done" && changes.length > 0 && (
              <>
                <button type="button" onClick={onDiscard} className="px-3 py-1.5 text-[15px] text-viewer-muted hover:bg-viewer-raised hover:text-viewer-ink">
                  Descartar
                </button>
                {!review ? (
                  <button
                    type="button"
                    disabled={invalid > 0}
                    onClick={() => setReview(true)}
                    className="border border-viewer-ink px-4 py-1.5 text-[15px] font-semibold hover:bg-viewer-ink hover:text-viewer disabled:cursor-not-allowed disabled:border-viewer-rule disabled:text-viewer-muted disabled:hover:bg-transparent"
                  >
                    Revisar y aplicar
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={() => setReview(false)} className="px-3 py-1.5 text-[15px] text-viewer-muted hover:bg-viewer-raised hover:text-viewer-ink">
                      Ocultar lista
                    </button>
                    <button
                      type="button"
                      disabled={!consent || invalid > 0}
                      onClick={onApply}
                        className="inline-flex items-center gap-2 border border-viewer-ink bg-viewer-ink px-3.5 py-1.5 text-[15px] font-medium text-viewer transition-colors hover:bg-white disabled:cursor-not-allowed disabled:border-viewer-rule disabled:bg-viewer-rule disabled:text-viewer-muted"
                    >
                      <IconRestart width={15} height={15} />
                      Aplicar y recalcular
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Status({ changes, sections, invalid, phase }: { changes: number; sections: number; invalid: number; phase: ApplyPhase }) {
  if (phase.kind === "saving") return <Lamp busy label="Validando y guardando" />;
  if (phase.kind === "restarting") return <Lamp busy label="Reiniciando el backend con la nueva configuración" />;
  if (phase.kind === "recalculating") {
    const stage = phase.stage ? (STAGE_LABELS[phase.stage] ?? phase.stage) : "Preparando";
    return <Lamp busy label={`Recalculando · ${stage} · ${phase.percent} %`} progress={phase.percent} />;
  }
  if (phase.kind === "done") {
    return <Lamp label={phase.sections.length === 0 ? "Datos recalculados con los valores por defecto" : "Datos recalculados con la nueva configuración"} />;
  }
  if (phase.kind === "error") {
    return (
      <p role="alert" className="flex items-start gap-2 text-[15px]">
        <IconWarning className="mt-0.5 shrink-0" />
        <span>
          <span className="font-semibold">No se aplicó.</span> {phase.message}
        </span>
      </p>
    );
  }
  return (
    <p className="text-[15px]">
      <span className="font-semibold">
        {changes} {changes === 1 ? "cambio sin guardar" : "cambios sin guardar"}
      </span>{" "}
      <span className="text-viewer-muted">
        en {sections} {sections === 1 ? "sección" : "secciones"}
      </span>
      {invalid > 0 && (
        <span className="ml-3 inline-flex items-center gap-1.5 font-semibold">
          <IconWarning width={15} height={15} />
          {invalid === 1 ? "Corrige 1 problema para aplicar" : `Corrige ${invalid} problemas para aplicar`}
        </span>
      )}
    </p>
  );
}

/** The pipeline lamp vocabulary: amber pulse while working, cyan when the data is ready. */
function Lamp({ label, busy = false, progress }: { label: string; busy?: boolean; progress?: number }) {
  return (
    <div role="status" className="grid gap-1.5 text-[15px]">
      <span className="inline-flex items-center gap-2.5">
        <span
          aria-hidden
          className={`h-2 w-2 rounded-full ${
            busy ? "animate-pulse bg-amber-400 shadow-[0_0_10px_2px_rgb(251_191_36/0.55)]" : "bg-scan shadow-[0_0_10px_2px_rgb(15_163_194/0.6)]"
          }`}
        />
        <span className="font-medium">{label}</span>
      </span>
      {progress !== undefined && (
        <span aria-hidden className="h-1 w-64 max-w-full bg-viewer-rule">
          <span className="block h-full bg-viewer-ink transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </span>
      )}
    </div>
  );
}
