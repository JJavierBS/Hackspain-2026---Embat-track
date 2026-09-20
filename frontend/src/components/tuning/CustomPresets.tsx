import { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAlgorithmConfig } from "../../api/useAlgorithmConfig";
import { type TuningResult, useSectors, useTuning } from "../../api/useTuning";
import { useGlobalParams } from "../../hooks/useGlobalParams";
import { useLinkSearch } from "../../hooks/useLinkSearch";
import { useSettled } from "../../hooks/useSettled";
import {
  type Anchor,
  type ConfigTree,
  FIELDS,
  PRESET_STATUS as STATUS,
  type Path,
  diff,
  formatValue,
  getIn,
  round,
  setIn,
} from "../../lib/algorithm";
import {
  type CustomPreset,
  type CustomSource,
  addPreset,
  duplicatePreset,
  editableTree,
  emptyMeta,
  removePreset,
  seedFromChanges,
  updatePreset,
  useCustomPresets,
} from "../../lib/customPresets";
import { INDICATOR_LABELS, bandOf, formatIndicatorValue, formatScore, monthCode } from "../../lib/format";
import { AlgorithmContext, type AlgorithmState } from "../algorithm/AlgorithmContext";
import { AnchorChart } from "../algorithm/AnchorEditor";
import { Film } from "../Film";
import { IconClose, IconPlus } from "../Icons";
import { labelOf } from "../../lib/presetValues";
import { ValuePicker, ValueRow } from "./CustomPresetEditor";
import { ProfileTable, ScorePair, TuningChart } from "./TuningParts";

const LABEL = "Con el preset";

/**
 * Custom presets of one entity (docs/PRESETS.md). The catalogue presets carry a source we read and never
 * change here; these are the client's own, written on this page. A preset is a set of config values over the
 * config in use, each with its evidence. Opening one applies it to this entity: the backend scores that entity
 * again with the pipeline's own code (POST /api/entities/{id}/tuning) and writes nothing, so every other page
 * keeps the published score. The presets live in memory: a reload empties the list, and the film says so.
 */
export function CustomPresets({ id, entityType }: { id: string; entityType: "GROUP" | "COMPANY" }) {
  const { profile, month } = useGlobalParams();
  const linkSearch = useLinkSearch();
  const config = useAlgorithmConfig();
  const presets = useCustomPresets(id);
  const [params, setParams] = useSearchParams();
  const [invalid, setInvalid] = useState<Set<string>>(() => new Set());

  const openId = params.get("preset") ?? "";
  const open = presets.find((p) => p.id === openId) ?? null;

  const choose = useCallback(
    (next: string | null) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === null) p.delete("preset");
          else p.set("preset", next);
          return p;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [setParams],
  );

  const reportInvalid = useCallback((key: string, bad: boolean) => {
    setInvalid((prev) => {
      if (prev.has(key) === bad) return prev;
      const next = new Set(prev);
      if (bad) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const setAt = useCallback(
    (path: Path, value: unknown) => {
      if (!open) return;
      updatePreset(id, open.id, (p) => ({
        ...p,
        tree: setIn(p.tree, path, value),
      }));
    },
    [id, open],
  );

  const state = useMemo<AlgorithmState | null>(
    () =>
      config.data && open
        ? {
            draft: open.tree,
            saved: config.data.config,
            defaults: config.data.defaults,
            editable: true,
            setAt,
            reportInvalid,
          }
        : null,
    [config.data, open, setAt, reportInvalid],
  );

  const what = entityType === "GROUP" ? "este grupo" : "esta empresa";
  const meta = `${presets.length === 0 ? "Sin presets" : `${presets.length} ${presets.length === 1 ? "preset" : "presets"}`} · en memoria · solo ${what}`;

  return (
    <Film id="presets-propios" title="Presets propios" meta={meta}>
      <p className="mb-6 max-w-[70ch] text-ink-muted">
        Un preset propio es tu conjunto de valores sobre la configuración en uso, cada uno con su evidencia. Ábrelo y X-Ray vuelve a puntuar
        solo {what} con él: <span className="text-ink">no se guarda nada</span> y el resto de páginas sigue mostrando la puntuación
        publicada. Los pesos de cada perfil no se tocan aquí; se cerraron con el CTO de Embat y viven en{" "}
        <Link to={`/algorithm${linkSearch}#pesos`} className="underline decoration-rule underline-offset-4 hover:decoration-ink">
          la página del algoritmo
        </Link>
        . Los presets propios viven en esta pestaña: si recargas la página, empiezas de cero.
      </p>

      {config.isLoading && <Skeleton />}
      {config.error && (
        <p className="text-[15px] text-ink-muted">
          No se pudo cargar la configuración en uso, así que no hay con qué construir un preset. El resto de la página funciona igual.
        </p>
      )}

      {config.data && (
        <div className="grid min-w-0 gap-8">
          <NewPresetBar entityId={id} base={config.data.config} onOpen={choose} />
          {presets.length === 0 ? (
            <p className="max-w-[70ch] border-t border-dashed border-rule pt-4 text-[15px] text-ink-muted">
              Todavía no hay presets propios de {what}. Crea uno en blanco y añade los valores que quieras probar, o duplica uno del
              catálogo y edítalo: llega con sus fuentes puestas.
            </p>
          ) : (
            <PresetGrid presets={presets} openId={openId} onChoose={(next) => choose(next === openId ? null : next)} />
          )}

          {open && state && (
            <AlgorithmContext.Provider value={state}>
              <PresetPanel
                key={open.id}
                entityId={id}
                preset={open}
                saved={config.data.config}
                sections={config.data.editableSections}
                invalid={invalid.size}
                profile={profile}
                month={month}
                what={what}
                onClose={() => choose(null)}
                onOpen={choose}
              />
            </AlgorithmContext.Provider>
          )}
        </div>
      )}
    </Film>
  );
}

/** Create a preset from nothing, or from a sector preset, which brings its sources with it. */
function NewPresetBar({ entityId, base, onOpen }: { entityId: string; base: ConfigTree; onOpen: (id: string) => void }) {
  const catalogue = useSectors();
  const [source, setSource] = useState("");

  function blank() {
    onOpen(addPreset(entityId, base));
  }

  function fromSector() {
    const sector = catalogue.data?.sectors.find((s) => s.id === source);
    if (!sector) return;
    const seed = seedFromChanges(base, sector.changes, catalogue.data?.sources ?? {});
    onOpen(
      addPreset(entityId, base, {
        name: `${sector.name} (propio)`,
        note: sector.client,
        ...seed,
      }),
    );
    setSource("");
  }

  const sectors = catalogue.data?.sectors ?? [];

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <button
        type="button"
        onClick={blank}
        className="inline-flex items-center gap-1.5 bg-ink px-4 py-2 text-[15px] font-semibold text-film hover:bg-ink/85"
      >
        <IconPlus width={14} height={14} />
        Crear un preset
      </button>
      {sectors.length > 0 && (
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <label className="grid gap-1 text-sm text-ink-muted">
            Duplicar un preset de sector
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="min-w-[16rem] border border-rule bg-film px-3 py-2 text-[15px] text-ink focus:border-ink"
            >
              <option value="">Elige un sector…</option>
              {sectors.map((sector) => (
                <option key={sector.id} value={sector.id}>
                  {sector.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={fromSector}
            disabled={source === ""}
            className="border border-ink px-3 py-2 text-[15px] font-semibold hover:bg-ink hover:text-film disabled:cursor-not-allowed disabled:border-rule disabled:text-ink-muted disabled:hover:bg-transparent disabled:hover:text-ink-muted"
          >
            Duplicar y editar
          </button>
        </div>
      )}
    </div>
  );
}

function PresetGrid({ presets, openId, onChoose }: { presets: CustomPreset[]; openId: string; onChoose: (id: string) => void }) {
  return (
    <div
      role="list"
      aria-label="Presets propios de esta entidad"
      className="flex flex-wrap gap-px border border-rule bg-rule"
    >
      {presets.map((preset) => {
        const on = preset.id === openId;
        const sourced = preset.paths.filter((p) => (preset.meta[p] ?? emptyMeta()).status === "sourced").length;
        return (
          <div role="listitem" key={preset.id} className="grid min-w-[16rem] flex-1 basis-64">
            <button
              type="button"
              aria-expanded={on}
              aria-controls={`custom-preset-${preset.id}`}
              onClick={() => onChoose(preset.id)}
              className={`grid h-full content-start gap-2 px-4 py-4 text-left transition-colors ${
                on ? "bg-ink text-film" : "bg-film text-ink hover:bg-scan-soft/40"
              }`}
            >
              <span className="text-lg leading-6 font-semibold tracking-tight [font-stretch:88%]">{preset.name}</span>
              <span className={`text-sm ${on ? "text-film/80" : "text-ink-muted"}`}>{preset.note || "Sin descripción"}</span>
              <span className={`mt-auto pt-1 text-sm ${on ? "text-film" : "text-ink-muted"}`}>
                {preset.paths.length} {preset.paths.length === 1 ? "valor" : "valores"}
                {preset.paths.length > 0 && ` · ${sourced} con fuente`}
                {on && " · aplicado"}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

interface PanelProps {
  entityId: string;
  preset: CustomPreset;
  saved: ConfigTree;
  sections: string[];
  invalid: number;
  profile: ReturnType<typeof useGlobalParams>["profile"];
  month: string;
  what: string;
  onClose: () => void;
  onOpen: (id: string) => void;
}

function PresetPanel({ entityId, preset, saved, sections, invalid, profile, month, what, onClose, onOpen }: PanelProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const changes = useMemo(() => diff(saved, preset.tree, sections), [saved, preset.tree, sections]);
  // Only the changed sections travel: the server merges them over the config in use.
  const body = useMemo(() => {
    const keys = [...new Set(changes.map((c) => String(c.path[0])))];
    return keys.length === 0 ? null : editableTree(preset.tree, keys);
  }, [changes, preset.tree]);
  const settled = useSettled(body, 400);
  const tuning = useTuning({ id: entityId, profile, month, config: settled }, settled !== null && invalid === 0);

  function duplicate() {
    const copy = duplicatePreset(entityId, preset.id);
    if (copy) onOpen(copy);
  }

  function remove() {
    removePreset(entityId, preset.id);
    onClose();
  }

  return (
    <section
      id={`custom-preset-${preset.id}`}
      aria-label={`Preset ${preset.name}`}
      className="grid min-w-0 gap-8 border border-ink px-4 py-5 sm:px-5"
    >
      <header className="grid gap-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm text-ink-muted">
              Nombre del preset
              <input
                type="text"
                value={preset.name}
                onChange={(e) =>
                  updatePreset(entityId, preset.id, (p) => ({
                    ...p,
                    name: e.target.value,
                  }))
                }
                className="w-full max-w-[28rem] border border-rule bg-film px-2 py-1.5 text-2xl font-semibold tracking-tight text-ink [font-stretch:88%] caret-scan focus:border-ink"
              />
            </label>
            <label className="grid gap-1 text-sm text-ink-muted">
              Para qué lo usas
              <input
                type="text"
                value={preset.note}
                onChange={(e) =>
                  updatePreset(entityId, preset.id, (p) => ({
                    ...p,
                    note: e.target.value,
                  }))
                }
                placeholder="Por ejemplo: el banco que revisa la línea cada trimestre."
                className="w-full max-w-[52rem] border border-rule bg-film px-2 py-1.5 text-[15px] text-ink caret-scan placeholder:text-ink-muted focus:border-ink"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar el preset y volver a la puntuación publicada"
            className="grid h-8 w-8 place-items-center text-ink-muted hover:bg-panel-grid hover:text-ink"
          >
            <IconClose />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[15px]">
          <button type="button" onClick={duplicate} className="border border-ink/25 px-3 py-1.5 font-semibold hover:border-ink">
            Duplicar
          </button>
          {confirmDelete ? (
            <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold">¿Borrar «{preset.name}»?</span>
              <button type="button" onClick={remove} className="bg-ink px-3 py-1.5 font-semibold text-film hover:bg-ink/85">
                Sí, borrar
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-ink-muted underline decoration-rule underline-offset-4 hover:text-ink hover:decoration-ink"
              >
                No
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-ink-muted underline decoration-rule underline-offset-4 hover:text-ink hover:decoration-ink"
            >
              Borrar el preset
            </button>
          )}
          <span className="ml-auto text-ink-muted">
            {changes.length === 0
              ? "Todavía no cambia nada"
              : `${changes.length} ${changes.length === 1 ? "valor cambiado" : "valores cambiados"}`}
          </span>
        </div>
      </header>

      <section aria-labelledby={`values-${preset.id}`} className="grid min-w-0 gap-4">
        <h4 id={`values-${preset.id}`} className="text-xl font-semibold tracking-tight [font-stretch:88%]">
          Valores del preset
        </h4>
        {preset.paths.length === 0 ? (
          <p className="max-w-[70ch] text-[15px] text-ink-muted">
            El preset está vacío. Añade el primer valor: un indicador con sus anclas, un umbral de alerta o un parámetro del límite de
            circulante.
          </p>
        ) : (
          <ol className="grid min-w-0 gap-px border border-rule bg-rule">
            {preset.paths.map((path) => (
              <ValueRow key={path} entityId={entityId} preset={preset} path={path} />
            ))}
          </ol>
        )}
        <ValuePicker entityId={entityId} preset={preset} />
      </section>

      <section aria-labelledby={`effect-${preset.id}`} className="grid min-w-0 gap-5 border-t border-ink/20 pt-6">
        <h4 id={`effect-${preset.id}`} className="text-xl font-semibold tracking-tight [font-stretch:88%]">
          Efecto en {what}
        </h4>
        {body === null ? (
          <p className="text-[15px] text-ink-muted">
            El preset es igual a la configuración en uso: la puntuación es la publicada. Cambia un valor para ver su efecto.
          </p>
        ) : invalid > 0 ? (
          <p className="text-[15px] font-semibold">Corrige los valores marcados para ver el efecto.</p>
        ) : tuning.error ? (
          <p role="alert" className="text-[15px]">
            <span className="font-semibold">No se pudo calcular.</span> {tuning.error.message}
          </p>
        ) : !tuning.data ? (
          <Skeleton />
        ) : (
          <Result result={tuning.data} preset={preset} saved={saved} month={month} profile={profile} stale={tuning.isPlaceholderData} />
        )}
      </section>
    </section>
  );
}

function Result({
  result,
  preset,
  saved,
  month,
  profile,
  stale,
}: {
  result: TuningResult;
  preset: CustomPreset;
  saved: ConfigTree;
  month: string;
  profile: ReturnType<typeof useGlobalParams>["profile"];
  stale: boolean;
}) {
  const byIndicator = new Map(result.indicators.map((i) => [i.indicator, i]));
  return (
    <div className={`grid gap-10 transition-opacity ${stale ? "opacity-60" : ""}`} aria-busy={stale}>
      <div className="grid min-w-0 gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="grid content-start gap-6">
          <ScorePair result={result} profile={profile} tunedLabel={LABEL} />
          <ProfileTable result={result} active={profile} tunedLabel={LABEL} />
        </div>
        <TuningChart result={result} activeMonth={month} tunedLabel={LABEL} height={240} />
      </div>

      <ol className="grid min-w-0 gap-px border border-rule bg-rule">
        {preset.paths.map((path) => (
          <ChangeRow key={path} preset={preset} saved={saved} path={path} row={byIndicator.get(path.split(".")[1]) ?? null} month={month} />
        ))}
      </ol>
    </div>
  );
}

/** One value of the preset as the reader checks it: what it changes, what it does here, and why. */
function ChangeRow({
  preset,
  saved,
  path,
  row,
  month,
}: {
  preset: CustomPreset;
  saved: ConfigTree;
  path: string;
  row: TuningResult["indicators"][number] | null;
  month: string;
}) {
  const meta = preset.meta[path] ?? emptyMeta();
  const status = STATUS[meta.status];
  const parts = path.split(".");
  const isIndicator = parts[0] === "indicators" && parts.length === 2;
  const anchors = isIndicator ? (getIn(preset.tree, [...parts, "anchors"]) as Anchor[]) : null;
  const now = isIndicator ? null : getIn(saved, parts);

  return (
    <li className="grid gap-5 bg-film px-4 py-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="grid content-start gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="font-semibold">{labelOf(path)}</span>
          <span
            title={status.hint}
            className={`border px-2 py-0.5 text-sm font-medium ${
              meta.status === "sourced" ? "border-rule" : "border-dashed border-ink-muted text-ink-muted"
            }`}
          >
            {status.label}
          </span>
        </div>
        {isIndicator && anchors ? (
          <>
            <LevelShift row={row} />
            <figure className="grid max-w-[26rem] gap-1">
              <AnchorChart
                anchors={anchors}
                shipped={row ? row.baseAnchors : null}
                percent={INDICATOR_LABELS[parts[1]]?.unit === "pct"}
                mark={row?.available ? row.value : null}
              />
              <figcaption className="flex flex-wrap gap-x-4 text-sm text-ink-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="h-[3px] w-4 bg-ink" /> Del preset
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="w-4 border-t-[1.5px] border-dashed border-ink-muted" /> En uso ahora
                </span>
                {row?.available && (
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="h-3 w-[2px] bg-scan" /> Esta entidad en {monthCode(month)}
                  </span>
                )}
              </figcaption>
            </figure>
          </>
        ) : (
          <dl className="grid grid-cols-2 gap-px border border-rule bg-rule text-sm">
            <div className="bg-film px-3 py-2">
              <dt className="text-ink-muted">En uso ahora</dt>
              <dd className="text-lg font-semibold [font-stretch:88%]">{shown(path, now)}</dd>
            </div>
            <div className="bg-film px-3 py-2">
              <dt className="text-ink-muted">{LABEL}</dt>
              <dd className="text-lg font-semibold [font-stretch:88%]">{shown(path, getIn(preset.tree, parts))}</dd>
            </div>
          </dl>
        )}
      </div>
      <div className="grid content-start gap-3">
        {meta.why ? (
          <p className="max-w-[68ch] text-[15px]">{meta.why}</p>
        ) : (
          <p className="max-w-[68ch] text-[15px] text-ink-muted">Sin motivo escrito todavía.</p>
        )}
        {meta.sources.map((source, i) => (
          <CustomCitation key={i} source={source} />
        ))}
      </div>
    </li>
  );
}

/** The entity's value this month and the level each curve gives it. */
function LevelShift({ row }: { row: TuningResult["indicators"][number] | null }) {
  if (!row || !row.available) {
    return <p className="text-[15px] text-ink-muted">Sin datos este mes: este valor no cambia nada ahora.</p>;
  }
  return (
    <dl className="grid grid-cols-3 gap-px border border-rule bg-rule text-sm">
      <div className="bg-film px-3 py-2">
        <dt className="text-ink-muted">Valor</dt>
        <dd className="text-lg font-semibold [font-stretch:88%]">{formatIndicatorValue(row.indicator, row.value)}</dd>
      </div>
      <div className="bg-film px-3 py-2">
        <dt className="text-ink-muted">Nivel en uso</dt>
        <dd className="text-lg font-semibold [font-stretch:88%]">
          <Level value={row.baseLevel} />
        </dd>
      </div>
      <div className="bg-film px-3 py-2">
        <dt className="text-ink-muted">Nivel del preset</dt>
        <dd className="text-lg font-semibold [font-stretch:88%]">
          <Level value={row.tunedLevel} />
        </dd>
      </div>
    </dl>
  );
}

/** A source the expert wrote: it prints what it has, and nothing it does not. */
function CustomCitation({ source }: { source: CustomSource }) {
  const named = [source.publisher, source.title].filter(Boolean).join(" · ");
  if (!named && !source.url && !source.quote) return null;
  return (
    <figure className="grid gap-1 border-l border-ink/30 pl-3 text-sm">
      {source.quote && <blockquote className="text-ink">“{source.quote}”</blockquote>}
      <figcaption className="text-ink-muted">
        {source.url ? (
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-rule underline-offset-4 hover:text-ink hover:decoration-ink"
          >
            {named || source.url}
          </a>
        ) : (
          named
        )}
        {source.read && ` · leído el ${source.read.split("-").reverse().join("-")}`}
      </figcaption>
    </figure>
  );
}

function Level({ value }: { value: number | null }) {
  if (value === null) return <span className="text-ink-muted">—</span>;
  return <span style={{ color: bandOf(value).color }}>{formatScore(value)}</span>;
}

/** A value in the unit an expert reads: a rate as a percentage, a band map as "A 0,4 · B 1". */
function shown(path: string, value: unknown): string {
  if (typeof value === "number" && FIELDS[path]?.percent) return `${formatValue(round(value * 100, 4))} %`;
  return formatValue(value);
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
