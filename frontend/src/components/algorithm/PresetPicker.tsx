import { useState } from "react";
import { type Preset, type PresetCatalog, type PresetChange, type PresetSource, usePresets } from "../../api/useAlgorithmConfig";
import { useGlobalParams } from "../../hooks/useGlobalParams";
import { INDICATOR_LABELS, PROFILE_LABELS } from "../../lib/format";
import { type Anchor, FIELDS, PRESET_STATUS as STATUS, type Path, describe, formatValue, getIn, round } from "../../lib/algorithm";
import { IconClose } from "../Icons";
import { useAlgorithm } from "./AlgorithmContext";
import { AnchorChart } from "./AnchorEditor";


const toPath = (dotted: string): Path => dotted.split(".");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A value in the unit an expert reads: a rate as a percentage, a band map as "A 0,4 · B 1". */
function shown(path: string, value: unknown): string {
  if (typeof value === "number" && FIELDS[path]?.percent) return `${formatValue(round(value * 100, 4))} %`;
  return formatValue(value);
}

type PresetState = "saved" | "draft" | "none";

function stateOf(preset: Preset, draft: object, saved: object): PresetState {
  const inTree = (tree: object) => preset.changes.every((c) => same(getIn(tree, toPath(c.path)), c.value));
  if (inTree(saved)) return "saved";
  if (inTree(draft)) return "draft";
  return "none";
}

/**
 * Starting points for the four target clients. A preset only fills the draft: the expert still reviews and
 * applies it in the bottom bar. Each value shows its evidence, so nothing on this film is an unsourced claim.
 */
export function PresetPicker() {
  const { data, error, isLoading } = usePresets();
  const [chosen, setChosen] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="grid gap-3" aria-busy="true">
        {[0, 1].map((i) => (
          <div key={i} className="h-5 animate-pulse bg-panel-grid" style={{ width: `${80 - i * 20}%` }} />
        ))}
      </div>
    );
  }
  if (error || !data) {
    return <p className="text-ink-muted">No se pudieron cargar los presets. El resto de la página funciona igual.</p>;
  }

  const current = data.presets.find((p) => p.id === chosen) ?? null;

  return (
    <div className="grid gap-6">
      <p className="max-w-[70ch] text-ink-muted">
        Cada preset carga en el borrador valores con fuente para un tipo de cliente. Nada cambia hasta que revisas y aplicas
        el borrador abajo. <span className="text-ink">Los pesos no cambian:</span> cada cliente ya tiene su perfil de pesos
        con fuentes (docs/WEIGHTS.md), cerrado con el CTO de Embat. El preset elige esa vista y ajusta solo las reglas que
        una fuente respalda.
      </p>
      <PresetGrid catalog={data} chosen={chosen} onChoose={(id) => setChosen((c) => (c === id ? null : id))} />
      {current && <Dossier preset={current} sources={data.sources} onClose={() => setChosen(null)} />}
    </div>
  );
}

function PresetGrid({ catalog, chosen, onChoose }: { catalog: PresetCatalog; chosen: string | null; onChoose: (id: string) => void }) {
  const { draft, saved } = useAlgorithm();
  return (
    <div role="list" className="grid gap-px border border-rule bg-rule sm:grid-cols-2 xl:grid-cols-4">
      {catalog.presets.map((p) => {
        const open = p.id === chosen;
        const state = stateOf(p, draft, saved);
        return (
          <div role="listitem" key={p.id} className="grid">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={`preset-${p.id}`}
              onClick={() => onChoose(p.id)}
              className={`group grid h-full content-start gap-3 px-4 pt-4 pb-4 text-left transition-colors ${
                open ? "bg-ink text-film" : "bg-film text-ink hover:bg-scan-soft/40"
              }`}
            >
              <span className="text-lg leading-6 font-semibold tracking-tight [font-stretch:88%]">{p.name}</span>
              <span className={`text-sm ${open ? "text-film/80" : "text-ink-muted"}`}>{p.client}</span>
              <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-sm">
                <span className={`border px-2 py-0.5 font-medium ${open ? "border-film/40" : "border-rule"}`}>
                  Vista {PROFILE_LABELS[p.profile].name}
                </span>
                <span className={open ? "text-film/80" : "text-ink-muted"}>
                  {p.changes.length} {p.changes.length === 1 ? "valor" : "valores"}
                </span>
                {state !== "none" && (
                  <span className={`font-semibold ${open ? "text-film" : "text-ink"}`}>
                    {state === "saved" ? "· En uso" : "· En el borrador"}
                  </span>
                )}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Dossier({ preset, sources, onClose }: { preset: Preset; sources: Record<string, PresetSource>; onClose: () => void }) {
  const { draft, saved, editable, setAt } = useAlgorithm();
  const { profile, setProfile } = useGlobalParams();
  const state = stateOf(preset, draft, saved);
  const pending = preset.changes.filter((c) => !same(getIn(draft, toPath(c.path)), c.value));

  function load() {
    for (const c of pending) setAt(toPath(c.path), c.value);
  }

  return (
    <section id={`preset-${preset.id}`} aria-label={`Preset ${preset.name}`} className="grid gap-6 border border-ink px-4 py-5 sm:px-5">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div>
          <h3 className="text-2xl font-semibold tracking-tight [font-stretch:88%]">{preset.name}</h3>
          <p className="mt-1 max-w-[62ch] text-ink-muted">{preset.client}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar el preset"
          className="grid h-8 w-8 place-items-center text-ink-muted hover:bg-panel-grid hover:text-ink"
        >
          <IconClose />
        </button>
      </header>

      <div className="grid gap-1 border-t border-rule pt-4">
        <h4 className="text-[15px] font-semibold">Pesos</h4>
        <p className="max-w-[70ch] text-[15px] text-ink-muted">{preset.weights}</p>
        {preset.weightsSources?.map((id) => <Citation key={id} source={sources[id]} />)}
      </div>

      <ol className="grid gap-px border border-rule bg-rule">
        {preset.changes.map((c) => (
          <ChangeRow key={c.path} change={c} sources={sources} />
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {editable && pending.length > 0 && (
          <button type="button" onClick={load} className="bg-ink px-4 py-2 text-[15px] font-semibold text-film hover:bg-ink/85">
            Cargar {pending.length === 1 ? "el valor" : `los ${pending.length} valores`} en el borrador
          </button>
        )}
        {state === "draft" && <span className="text-[15px] font-semibold">Cargado en el borrador. Revísalo en la barra de abajo o pruébalo en una entidad.</span>}
        {state === "saved" && <span className="text-[15px] font-semibold">Este preset ya está en uso en el servidor.</span>}
        {!editable && state === "none" && <span className="text-[15px] text-ink-muted">Solo lectura: no se puede cargar en esta instancia.</span>}
        {profile !== preset.profile && (
          <button
            type="button"
            onClick={() => setProfile(preset.profile)}
            className="text-[15px] underline decoration-rule underline-offset-4 hover:decoration-ink"
          >
            Ver la página con la vista {PROFILE_LABELS[preset.profile].name}
          </button>
        )}
      </div>
    </section>
  );
}

function ChangeRow({ change, sources }: { change: PresetChange; sources: Record<string, PresetSource> }) {
  // "Ahora" is what the server runs, so the comparison still reads after the preset is in the draft.
  const { saved } = useAlgorithm();
  const path = toPath(change.path);
  const now = getIn(saved, path);
  const isAnchors = path[0] === "indicators" && path[2] === "anchors";
  const unchanged = same(now, change.value);
  const status = STATUS[change.status];

  return (
    <li className="grid gap-4 bg-film px-4 py-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="grid content-start gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="font-semibold">{describe(path)}</span>
          <span
            title={status.hint}
            className={`border px-2 py-0.5 text-sm font-medium ${change.status === "sourced" ? "border-rule" : "border-dashed border-ink-muted text-ink-muted"}`}
          >
            {status.label}
          </span>
        </div>
        {isAnchors ? (
          <figure className="grid max-w-[26rem] gap-1">
            <AnchorChart
              anchors={change.value as Anchor[]}
              shipped={unchanged ? null : (now as Anchor[])}
              percent={INDICATOR_LABELS[String(path[1])]?.unit === "pct"}
            />
            <figcaption className="flex flex-wrap gap-x-4 text-sm text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-[3px] w-4 bg-ink" /> Con el preset
              </span>
              {!unchanged && (
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="w-4 border-t-[1.5px] border-dashed border-ink-muted" /> En uso ahora
                </span>
              )}
            </figcaption>
          </figure>
        ) : (
          <dl className="grid grid-cols-2 gap-px border border-rule bg-rule text-sm">
            <div className="bg-film px-3 py-2">
              <dt className="text-ink-muted">En uso ahora</dt>
              <dd className="text-lg font-semibold [font-stretch:88%]">{shown(change.path, now)}</dd>
            </div>
            <div className="bg-film px-3 py-2">
              <dt className="text-ink-muted">Con el preset</dt>
              <dd className="text-lg font-semibold [font-stretch:88%]">{shown(change.path, change.value)}</dd>
            </div>
          </dl>
        )}
      </div>
      <div className="grid content-start gap-3">
        <p className="max-w-[68ch] text-[15px]">{change.why}</p>
        {change.sources.map((id) => (
          <Citation key={id} source={sources[id]} />
        ))}
      </div>
    </li>
  );
}

/** One source: who, what, the exact words or the figure read, and when we read it. */
export function Citation({ source }: { source: PresetSource | undefined }) {
  if (!source) return null;
  return (
    <figure className="grid gap-1 border-l border-ink/30 pl-3 text-sm">
      {source.quote && <blockquote className="text-ink">“{source.quote}”</blockquote>}
      {source.finding && <p className="text-ink">{source.finding}</p>}
      <figcaption className="text-ink-muted">
        <a href={source.url} target="_blank" rel="noreferrer" className="underline decoration-rule underline-offset-4 hover:text-ink hover:decoration-ink">
          {source.publisher} · {source.title}
        </a>{" "}
        · leído el {source.read.split("-").reverse().join("-")}
      </figcaption>
    </figure>
  );
}
