import { useId, useState } from "react";
import type { PresetChange } from "../../api/useAlgorithmConfig";
import { FIELDS, PRESET_STATUS as STATUS } from "../../lib/algorithm";
import {
  type CustomMeta,
  type CustomPreset,
  type CustomSource,
  emptyMeta,
  emptySource,
  updatePreset,
} from "../../lib/customPresets";
import { BAND_MAPS, VALUE_OPTIONS, alertMeta, labelOf } from "../../lib/presetValues";
import { IndicatorRow } from "../algorithm/AnchorEditor";
import { BandMapField, FieldCell } from "../algorithm/Fields";
import { IconClose, IconPlus } from "../Icons";

/** The select that adds a value to the preset. A value already in the preset is not offered twice. */
export function ValuePicker({ entityId, preset }: { entityId: string; preset: CustomPreset }) {
  const [path, setPath] = useState("");
  const id = useId();
  const free = VALUE_OPTIONS.filter((o) => !preset.paths.includes(o.path));
  const groups = [...new Set(free.map((o) => o.group))];

  function add() {
    if (path === "") return;
    updatePreset(entityId, preset.id, (p) => ({
      ...p,
      paths: [...p.paths, path],
      meta: { ...p.meta, [path]: p.meta[path] ?? emptyMeta() },
    }));
    setPath("");
  }

  if (free.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-wrap items-end gap-x-3 gap-y-2">
      <label htmlFor={id} className="sr-only">
        Valor que quieres cambiar
      </label>
      <select
        id={id}
        value={path}
        onChange={(e) => setPath(e.target.value)}
        className="w-full max-w-full border border-rule bg-film px-3 py-2 text-[15px] focus:border-ink sm:w-72"
      >
        <option value="">Elige un valor…</option>
        {groups.map((group) => (
          <optgroup key={group} label={group}>
            {free
              .filter((o) => o.group === group)
              .map((o) => (
                <option key={o.path} value={o.path}>
                  {o.label}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      <button
        type="button"
        onClick={add}
        disabled={path === ""}
        className="inline-flex items-center gap-1.5 border border-ink px-3 py-2 text-[15px] font-semibold hover:bg-ink hover:text-film disabled:cursor-not-allowed disabled:border-rule disabled:text-ink-muted disabled:hover:bg-transparent disabled:hover:text-ink-muted"
      >
        <IconPlus width={13} height={13} />
        Añadir valor
      </button>
    </div>
  );
}

/** One value of the preset: the editor the Algorithm page already uses, plus its evidence. */
export function ValueRow({ entityId, preset, path }: { entityId: string; preset: CustomPreset; path: string }) {
  const meta = preset.meta[path] ?? emptyMeta();
  const parts = path.split(".");
  const isIndicator = parts[0] === "indicators" && parts.length === 2;
  const bandMap = BAND_MAPS[path];
  const field = FIELDS[path] ?? alertMeta(path);

  function remove() {
    updatePreset(entityId, preset.id, (p) => ({ ...p, paths: p.paths.filter((x) => x !== path) }));
  }

  function setMeta(change: (m: CustomMeta) => CustomMeta) {
    updatePreset(entityId, preset.id, (p) => ({ ...p, meta: { ...p.meta, [path]: change(p.meta[path] ?? emptyMeta()) } }));
  }

  return (
    <li className="grid min-w-0 gap-5 bg-film px-4 py-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="grid min-w-0 content-start gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          {/* The indicator editor and the field cell print the name themselves, so the row does not repeat it. */}
          <h5 className={`text-[15px] font-semibold ${isIndicator || field ? "sr-only" : ""}`}>{labelOf(path)}</h5>
          <button
            type="button"
            onClick={remove}
            className="ml-auto inline-flex items-center gap-1 text-sm text-ink-muted underline decoration-rule underline-offset-4 hover:text-ink hover:decoration-ink"
          >
            <IconClose width={12} height={12} />
            Quitar del preset
          </button>
        </div>
        {isIndicator ? (
          <IndicatorRow id={parts[1]} />
        ) : bandMap ? (
          <BandMapField path={parts} unit={bandMap.unit} note={bandMap.note} />
        ) : field ? (
          <div className="grid gap-px border border-rule bg-rule sm:max-w-[26rem]">
            <FieldCell path={parts} meta={field} />
          </div>
        ) : (
          <p className="text-[15px] text-ink-muted">Este valor no tiene editor todavía.</p>
        )}
      </div>
      <Evidence meta={meta} onChange={setMeta} />
    </li>
  );
}

/** Why this value, with the same three states as the catalogue: sourced, derived, our judgment. */
function Evidence({ meta, onChange }: { meta: CustomMeta; onChange: (change: (m: CustomMeta) => CustomMeta) => void }) {
  return (
    <div className="grid content-start gap-3 border-t border-dashed border-rule pt-4 lg:border-t-0 lg:border-l lg:border-solid lg:pt-0 lg:pl-5">
      <div role="radiogroup" aria-label="Estado de la evidencia" className="flex flex-wrap gap-2">
        {(Object.keys(STATUS) as PresetChange["status"][]).map((status) => {
          const on = meta.status === status;
          return (
            <button
              key={status}
              type="button"
              role="radio"
              aria-checked={on}
              title={STATUS[status].hint}
              onClick={() => onChange((m) => ({ ...m, status }))}
              className={`border px-2 py-0.5 text-sm font-medium transition-colors ${
                on
                  ? "border-ink bg-ink text-film"
                  : status === "sourced"
                    ? "border-rule text-ink hover:border-ink"
                    : "border-dashed border-ink-muted text-ink-muted hover:border-ink hover:text-ink"
              }`}
            >
              {STATUS[status].label}
            </button>
          );
        })}
      </div>
      <label className="grid gap-1 text-sm text-ink-muted">
        Por qué este valor
        <textarea
          rows={3}
          value={meta.why}
          onChange={(e) => onChange((m) => ({ ...m, why: e.target.value }))}
          placeholder="Qué dice la fuente, o qué regla tuya da la cifra."
          className="w-full resize-y border border-rule bg-film px-2 py-1.5 text-[15px] text-ink caret-scan placeholder:text-ink-muted focus:border-ink"
        />
      </label>
      {meta.sources.map((source, i) => (
        <SourceFields
          key={i}
          source={source}
          onChange={(next) => onChange((m) => ({ ...m, sources: m.sources.map((s, j) => (j === i ? next : s)) }))}
          onRemove={() => onChange((m) => ({ ...m, sources: m.sources.filter((_, j) => j !== i) }))}
        />
      ))}
      <button
        type="button"
        onClick={() => onChange((m) => ({ ...m, sources: [...m.sources, emptySource()] }))}
        className="inline-flex w-fit items-center gap-1.5 border border-ink/25 px-2.5 py-1 text-sm hover:border-ink"
      >
        <IconPlus width={13} height={13} />
        Añadir fuente
      </button>
    </div>
  );
}

function SourceFields({
  source,
  onChange,
  onRemove,
}: {
  source: CustomSource;
  onChange: (next: CustomSource) => void;
  onRemove: () => void;
}) {
  const input =
    "w-full border border-rule bg-film px-2 py-1 text-sm text-ink caret-scan placeholder:text-ink-muted focus:border-ink";
  return (
    <fieldset className="grid gap-2 border-l border-ink/30 pl-3">
      <legend className="sr-only">Fuente</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          type="text"
          value={source.publisher}
          onChange={(e) => onChange({ ...source, publisher: e.target.value })}
          placeholder="Quién lo publica"
          aria-label="Quién publica la fuente"
          className={input}
        />
        <input
          type="text"
          value={source.title}
          onChange={(e) => onChange({ ...source, title: e.target.value })}
          placeholder="Título del documento"
          aria-label="Título de la fuente"
          className={input}
        />
      </div>
      <input
        type="url"
        value={source.url}
        onChange={(e) => onChange({ ...source, url: e.target.value })}
        placeholder="https://…"
        aria-label="Enlace de la fuente"
        className={input}
      />
      <input
        type="text"
        value={source.quote}
        onChange={(e) => onChange({ ...source, quote: e.target.value })}
        placeholder="Las palabras exactas, o la cifra leída"
        aria-label="Cita de la fuente"
        className={input}
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="inline-flex items-center gap-2 text-sm text-ink-muted">
          Leído el
          <input
            type="date"
            value={source.read}
            onChange={(e) => onChange({ ...source, read: e.target.value })}
            className="border border-rule bg-film px-2 py-1 text-sm text-ink tabular-nums focus:border-ink"
          />
        </label>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center gap-1 text-sm text-ink-muted underline decoration-rule underline-offset-4 hover:text-ink hover:decoration-ink"
        >
          <IconClose width={12} height={12} />
          Quitar la fuente
        </button>
      </div>
    </fieldset>
  );
}
