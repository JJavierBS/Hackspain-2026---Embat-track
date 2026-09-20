import { useSearchParams } from "react-router-dom";
import type { PresetSource } from "../../api/useAlgorithmConfig";
import { type Sector, type TuningResult, useSectors, useTuning } from "../../api/useTuning";
import { useGlobalParams } from "../../hooks/useGlobalParams";
import { INDICATOR_LABELS, PROFILE_LABELS, bandOf, formatIndicatorValue, formatScore, indicatorLabel, monthCode } from "../../lib/format";
import { type Anchor, PRESET_STATUS as STATUS } from "../../lib/algorithm";
import { AnchorChart } from "../algorithm/AnchorEditor";
import { Citation } from "../algorithm/PresetPicker";
import { Film } from "../Film";
import { ProfileTable, ScorePair, TuningChart } from "./TuningParts";

const NONE = "";

/**
 * The per-entity tuning (docs/PRESETS.md). The data has no sector field, so the reader picks one. The
 * backend scores this one entity again with the sector anchors and writes nothing: every other page keeps the
 * published score. Every sector is open to every entity. Each anchor change applies by default, and the reader can
 * turn one off. The choice lives in ?sector and ?off (the changes turned off), so the view is linkable.
 */
export function SectorTuning({ id, entityType }: { id: string; entityType: "GROUP" | "COMPANY" }) {
  const { profile, month } = useGlobalParams();
  const [params, setParams] = useSearchParams();
  const catalog = useSectors();
  const chosenId = params.get("sector") ?? NONE;
  const sector = catalog.data?.sectors.find((s) => s.id === chosenId) ?? null;
  const all = sector ? sector.changes.map((c) => indicatorOf(c.path)) : [];
  const off = new Set((params.get("off") ?? "").split(",").filter((x) => all.includes(x)));
  const on = all.filter((x) => !off.has(x));
  const tuning = useTuning(
    { id, profile, month, sector: sector?.id ?? null, sectorIndicators: off.size === 0 ? undefined : on },
    sector !== null,
  );

  function update(change: (p: URLSearchParams) => void) {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        change(p);
        return p;
      },
      { replace: true, preventScrollReset: true },
    );
  }

  function choose(next: string) {
    update((p) => {
      p.delete("off");
      if (next === NONE) p.delete("sector");
      else p.set("sector", next);
    });
  }

  function toggle(indicator: string) {
    const next = new Set(off);
    if (next.has(indicator)) next.delete(indicator);
    else next.add(indicator);
    update((p) => {
      if (next.size === 0) p.delete("off");
      else p.set("off", [...next].join(","));
    });
  }

  const what = entityType === "GROUP" ? "este grupo" : "esta empresa";

  return (
    <Film id="sector" title="Ajuste por sector" meta={`Simulación · solo ${what} · ${monthCode(month)}`}>
      <p className="mb-6 max-w-[70ch] text-ink-muted">
        Los datos no dicen a qué sector pertenece cada empresa. Si lo sabes, elige su sector: X-Ray vuelve a puntuar solo {what} con
        las anclas de ese sector, cada una con su fuente. <span className="text-ink">Los pesos de cada perfil no cambian</span>, y el
        resto de páginas sigue mostrando la puntuación publicada.
      </p>

      {catalog.isLoading && <Skeleton />}
      {catalog.error && <p className="text-ink-muted">No se pudieron cargar los sectores. El resto de la página funciona igual.</p>}
      {catalog.data && (
        <div className="grid gap-8">
          <SectorPicker sectors={catalog.data.sectors} chosen={sector?.id ?? NONE} applied={on.length} onChoose={choose} />
          {sector === null ? (
            <p className="text-[15px] text-ink-muted">Sin ajuste: la puntuación es la publicada.</p>
          ) : tuning.error ? (
            <p role="alert" className="text-[15px]">
              <span className="font-semibold">No se pudo simular.</span> {tuning.error.message}
            </p>
          ) : !tuning.data ? (
            <Skeleton />
          ) : (
            <Result
              result={tuning.data}
              sector={sector}
              sources={catalog.data.sources}
              stale={tuning.isPlaceholderData}
              off={off}
              onToggle={toggle}
            />
          )}
        </div>
      )}
    </Film>
  );
}

const indicatorOf = (path: string) => path.split(".")[1];

function SectorPicker({
  sectors,
  chosen,
  applied,
  onChoose,
}: {
  sectors: Sector[];
  chosen: string;
  applied: number;
  onChoose: (id: string) => void;
}) {
  const options = [
    { id: NONE, name: "Sin ajuste", cnae: "Anclas generales", detail: "La puntuación publicada" },
    ...sectors.map((s) => ({
      id: s.id,
      name: s.name,
      cnae: s.cnae,
      detail:
        s.id === chosen && applied < s.changes.length
          ? `${applied} de ${s.changes.length} anclas aplicadas`
          : `${s.changes.length} ${s.changes.length === 1 ? "ancla" : "anclas"} con fuente`,
    })),
  ];
  return (
    <div role="radiogroup" aria-label="Sector de la entidad" className="grid gap-px border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-5">
      {options.map((o) => {
        const on = o.id === chosen;
        return (
          <button
            key={o.id || "none"}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChoose(o.id)}
            className={`grid content-start gap-1 px-4 py-3 text-left transition-colors ${on ? "bg-ink text-film" : "bg-film text-ink hover:bg-scan-soft/40"}`}
          >
            <span className="text-lg leading-6 font-semibold tracking-tight [font-stretch:88%]">{o.name}</span>
            <span className={`text-sm ${on ? "text-film/80" : "text-ink-muted"}`}>{o.cnae}</span>
            <span className={`text-sm ${on ? "text-film" : "text-ink-muted"}`}>{o.detail}</span>
          </button>
        );
      })}
    </div>
  );
}

interface ResultProps {
  result: TuningResult;
  sector: Sector;
  sources: Record<string, PresetSource>;
  stale: boolean;
  /** Indicators whose sector anchors the reader turned off. */
  off: Set<string>;
  onToggle: (indicator: string) => void;
}

function Result({ result, sector, sources, stale, off, onToggle }: ResultProps) {
  const { profile, month } = useGlobalParams();
  const label = `Con ${sector.name.split(" · ")[0].toLowerCase()}`;
  const active = result.profiles.find((p) => p.profile === profile);
  const moved = active && active.base.finalScore !== null && active.tuned.finalScore !== null
    ? Math.abs(active.tuned.finalScore - active.base.finalScore) >= 0.05
    : false;
  const byId = new Map(result.indicators.map((i) => [i.indicator, i]));

  return (
    <div className={`grid gap-10 transition-opacity ${stale ? "opacity-60" : ""}`} aria-busy={stale}>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="grid content-start gap-6">
          <ScorePair result={result} profile={profile} tunedLabel={label} />
          {!moved && (
            <p className="max-w-[60ch] text-[15px] text-ink-muted">
              {off.size === sector.changes.length
                ? "Todos los ajustes del sector están desactivados: la puntuación es la publicada."
                : `En ${monthCode(month)} el sector no mueve la puntuación ${PROFILE_LABELS[profile].name.toLowerCase()}: los valores de la entidad caen donde las dos curvas dan el mismo nivel, o el indicador no tiene datos este mes.`}
            </p>
          )}
          <ProfileTable result={result} active={profile} tunedLabel={label} />
        </div>
        <TuningChart result={result} activeMonth={month} tunedLabel={label} />
      </div>

      <section aria-labelledby="sector-changes" className="grid gap-4">
        <h3 id="sector-changes" className="text-xl font-semibold tracking-tight [font-stretch:88%]">
          Qué cambia con {sector.name}
        </h3>
        <ol className="grid gap-px border border-rule bg-rule">
          {sector.changes.map((c) => {
            const indicator = c.path.split(".")[1];
            const row = byId.get(indicator);
            const status = STATUS[c.status];
            const unit = INDICATOR_LABELS[indicator]?.unit;
            const applied = !off.has(indicator);
            return (
              <li key={c.path} className="grid gap-5 bg-film px-4 py-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                <div className="grid content-start gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <label className="inline-flex cursor-pointer items-center gap-2.5 font-semibold">
                      <input
                        type="checkbox"
                        checked={applied}
                        onChange={() => onToggle(indicator)}
                        className="h-4 w-4 shrink-0 cursor-pointer appearance-none border border-ink bg-film checked:bg-ink checked:shadow-[inset_0_0_0_3px_var(--color-film)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-scan"
                      />
                      {indicatorLabel(indicator)}
                      <span className="sr-only">{applied ? "(ajuste aplicado)" : "(ajuste desactivado)"}</span>
                    </label>
                    <span
                      title={status.hint}
                      className={`border px-2 py-0.5 text-sm font-medium ${c.status === "sourced" ? "border-rule" : "border-dashed border-ink-muted text-ink-muted"}`}
                    >
                      {status.label}
                    </span>
                  </div>
                  <LevelShift row={row} applied={applied} />
                  <figure className={`grid max-w-[26rem] gap-1 transition-opacity ${applied ? "" : "opacity-45"}`}>
                    <AnchorChart
                      anchors={c.value as Anchor[]}
                      shipped={row ? row.baseAnchors : null}
                      percent={unit === "pct"}
                      mark={row?.available ? row.value : null}
                    />
                    <figcaption className="flex flex-wrap gap-x-4 text-sm text-ink-muted">
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden className="h-[3px] w-4 bg-ink" /> Del sector
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden className="w-4 border-t-[1.5px] border-dashed border-ink-muted" /> General
                      </span>
                      {row?.available && (
                        <span className="inline-flex items-center gap-1.5">
                          <span aria-hidden className="h-3 w-[2px] bg-scan" /> Esta entidad
                        </span>
                      )}
                    </figcaption>
                  </figure>
                </div>
                <div className="grid content-start gap-3">
                  <p className="max-w-[68ch] text-[15px]">{c.why}</p>
                  {c.sources.map((s) => (
                    <Citation key={s} source={sources[s]} />
                  ))}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {sector.notes && sector.notes.length > 0 && (
        <section aria-labelledby="sector-notes" className="grid gap-4">
          <h3 id="sector-notes" className="text-xl font-semibold tracking-tight [font-stretch:88%]">
            Contexto que no cambia la puntuación
          </h3>
          <ul className="grid gap-4">
            {sector.notes.map((n) => (
              <li key={n.text} className="grid max-w-[80ch] gap-2 border-t border-dashed border-rule pt-3">
                <p className="text-[15px]">{n.text}</p>
                {n.sources.map((s) => (
                  <Citation key={s} source={sources[s]} />
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** The entity's value this month and the level it gets from each curve. */
function LevelShift({ row, applied }: { row: TuningResult["indicators"][number] | undefined; applied: boolean }) {
  if (!row || !row.available) {
    return <p className="text-[15px] text-ink-muted">Sin datos este mes: este ajuste no cambia nada ahora.</p>;
  }
  if (!applied) {
    return (
      <p className="text-[15px] text-ink-muted">
        Desactivado: usa la curva general. Valor {formatIndicatorValue(row.indicator, row.value)}, nivel{" "}
        <Level value={row.baseLevel} />.
      </p>
    );
  }
  return (
    <dl className="grid grid-cols-3 gap-px border border-rule bg-rule text-sm">
      <div className="bg-film px-3 py-2">
        <dt className="text-ink-muted">Valor</dt>
        <dd className="text-lg font-semibold [font-stretch:88%]">{formatIndicatorValue(row.indicator, row.value)}</dd>
      </div>
      <div className="bg-film px-3 py-2">
        <dt className="text-ink-muted">Nivel general</dt>
        <dd className="text-lg font-semibold [font-stretch:88%]">
          <Level value={row.baseLevel} />
        </dd>
      </div>
      <div className="bg-film px-3 py-2">
        <dt className="text-ink-muted">Nivel sector</dt>
        <dd className="text-lg font-semibold [font-stretch:88%]">
          <Level value={row.tunedLevel} />
        </dd>
      </div>
    </dl>
  );
}

function Level({ value }: { value: number | null }) {
  if (value === null) return <span className="text-ink-muted">—</span>;
  return <span style={{ color: bandOf(value).color }}>{formatScore(value)}</span>;
}

function Skeleton() {
  return (
    <div className="grid gap-3" aria-busy="true">
      {[90, 72, 54].map((w) => (
        <div key={w} className="h-5 bg-panel-grid" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}
