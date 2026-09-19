import { useEffect, useId, useState } from "react";
import { BANDS } from "../../lib/format";
import {
  ENUM_LABELS,
  FIELDS,
  type FieldMeta,
  type Path,
  formatValue,
  getIn,
  parseNumber,
  round,
} from "../../lib/algorithm";
import { IconRestart } from "../Icons";
import { useAlgorithm } from "./AlgorithmContext";

function toText(value: number, percent?: boolean): string {
  return formatValue(percent ? round(value * 100, 6) : value);
}

function boundsText(meta: FieldMeta): string | null {
  const scale = (v: number) => toText(v, meta.percent) + (meta.percent ? " %" : "");
  if (meta.min !== undefined && meta.max !== undefined) return `entre ${scale(meta.min)} y ${scale(meta.max)}`;
  if (meta.min !== undefined) return `desde ${scale(meta.min)}`;
  if (meta.max !== undefined) return `hasta ${scale(meta.max)}`;
  return null;
}

interface NumberInputProps {
  path: Path;
  meta?: FieldMeta;
  /** Accessible name when the visible label sits elsewhere (a table header). */
  ariaLabel?: string;
  size?: "md" | "sm";
  /** Extra check on top of the bounds; returns the problem, or null. */
  check?: (value: number) => string | null;
}

/**
 * A number the expert types in Spanish format. The config value changes only when the text is a valid
 * number inside the bounds; otherwise the field says why and Apply stays locked.
 */
export function NumberInput({ path, meta = { label: "" }, ariaLabel, size = "md", check }: NumberInputProps) {
  const { draft, saved, editable, setAt, reportInvalid } = useAlgorithm();
  const key = path.join(".");
  const value = getIn(draft, path) as number;
  const dirty = getIn(saved, path) !== value;
  const [text, setText] = useState(() => toText(value, meta.percent));
  const [problem, setProblem] = useState<string | null>(null);
  const errorId = useId();

  // An outside change (discard, undo, "back to default") rewrites the text, unless the text already says it.
  const [shownValue, setShownValue] = useState(value);
  if (shownValue !== value) {
    setShownValue(value);
    const parsed = parseNumber(text);
    const typed = parsed === null ? null : meta.percent ? parsed / 100 : parsed;
    if (typed === null || round(typed, 6) !== round(value, 6)) setText(toText(value, meta.percent));
    setProblem(null);
  }

  useEffect(() => {
    reportInvalid(key, problem !== null);
    return () => reportInvalid(key, false);
  }, [key, problem, reportInvalid]);

  function commit(next: string) {
    setText(next);
    const parsed = parseNumber(next);
    if (parsed === null) {
      setProblem("Escribe un número.");
      return;
    }
    const n = meta.percent ? round(parsed / 100, 8) : parsed;
    const outside = (meta.min !== undefined && n < meta.min) || (meta.max !== undefined && n > meta.max);
    if (outside) {
      setProblem(`Debe estar ${boundsText(meta)}.`);
      return;
    }
    if (meta.integer && !Number.isInteger(n)) {
      setProblem("Debe ser un número entero.");
      return;
    }
    const extra = check?.(n) ?? null;
    setProblem(extra);
    if (extra === null) setAt(path, n);
  }

  const width = size === "sm" ? "w-20 text-base" : "w-28 text-lg";
  return (
    <span className="inline-grid gap-1">
      <span className="inline-flex items-baseline gap-1.5">
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          disabled={!editable}
          aria-label={ariaLabel ?? meta.label}
          aria-invalid={problem !== null}
          aria-describedby={problem ? errorId : undefined}
          value={text}
          onChange={(e) => commit(e.target.value)}
          className={`${width} border bg-film px-2 py-1 font-semibold tabular-nums [font-stretch:88%] caret-scan transition-colors outline-none focus:border-ink disabled:cursor-not-allowed disabled:border-transparent disabled:bg-transparent ${
            problem ? "border-2 border-ink" : dirty ? "border-ink" : "border-rule hover:border-ink/50"
          }`}
        />
        {meta.percent && <span className="text-sm text-ink-muted">%</span>}
        {meta.unit && !meta.percent && <span className="text-sm text-ink-muted">{meta.unit}</span>}
      </span>
      {problem && (
        <span id={errorId} role="alert" className="text-sm font-semibold text-ink">
          {problem}
        </span>
      )}
    </span>
  );
}

/** "Por defecto: 0,7" plus a button to go back to it, shown only when the value differs from the shipped file. */
export function DefaultNote({ path, percent }: { path: Path; percent?: boolean }) {
  const { draft, defaults, editable, setAt } = useAlgorithm();
  const value = getIn(draft, path);
  const shipped = getIn(defaults, path);
  if (JSON.stringify(value) === JSON.stringify(shipped) || shipped === undefined) return null;
  const shown = typeof shipped === "number" ? toText(shipped, percent) + (percent ? " %" : "") : formatValue(shipped);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
      Por defecto: {shown}
      {editable && (
        <button
          type="button"
          onClick={() => setAt(path, shipped)}
          className="inline-flex items-center gap-1 underline decoration-rule underline-offset-4 hover:text-ink hover:decoration-ink"
        >
          <IconRestart width={13} height={13} />
          Restaurar
        </button>
      )}
    </span>
  );
}

/** One labeled parameter on the hairline cell grid. */
export function FieldCell({ path, meta }: { path: Path; meta: FieldMeta }) {
  const { draft, saved } = useAlgorithm();
  const dirty = JSON.stringify(getIn(saved, path)) !== JSON.stringify(getIn(draft, path));
  const value = getIn(draft, path);
  return (
    <div className="relative grid content-start gap-2 bg-film px-3 py-3">
      {dirty && <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-ink" />}
      <div>
        <div className="text-[15px] font-semibold">{meta.label}</div>
        {meta.hint && <p className="mt-0.5 text-sm text-ink-muted">{meta.hint}</p>}
      </div>
      {typeof value === "number" ? (
        <NumberInput path={path} meta={meta} />
      ) : Array.isArray(value) && meta.options ? (
        <ChoiceChips path={path} options={meta.options} />
      ) : typeof value === "string" && meta.options ? (
        <ChoiceSelect path={path} meta={meta} />
      ) : (
        <span className="font-semibold">{formatValue(value)}</span>
      )}
      <DefaultNote path={path} percent={meta.percent} />
    </div>
  );
}

function ChoiceSelect({ path, meta }: { path: Path; meta: FieldMeta }) {
  const { draft, editable, setAt } = useAlgorithm();
  const value = getIn(draft, path) as string;
  return (
    <select
      aria-label={meta.label}
      disabled={!editable}
      value={value}
      onChange={(e) => setAt(path, e.target.value)}
      className="w-fit border border-rule bg-film px-2 py-1.5 text-[15px] font-semibold outline-none hover:border-ink/50 focus:border-ink disabled:cursor-not-allowed disabled:border-transparent"
    >
      {meta.options?.map((o) => (
        <option key={o} value={o}>
          {ENUM_LABELS[o] ?? o}
        </option>
      ))}
    </select>
  );
}

/** A set of values (statuses, indicators) as square toggles. At least one stays on. */
export function ChoiceChips({ path, options }: { path: Path; options: readonly string[] }) {
  const { draft, editable, setAt } = useAlgorithm();
  const chosen = (getIn(draft, path) as string[]) ?? [];
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = chosen.includes(o);
        const last = on && chosen.length === 1;
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            disabled={!editable || last}
            title={last ? "Debe quedar al menos uno" : undefined}
            onClick={() => setAt(path, on ? chosen.filter((c) => c !== o) : options.filter((x) => x === o || chosen.includes(x)))}
            className={`border px-2.5 py-1 text-sm transition-colors disabled:cursor-not-allowed ${
              on ? "border-ink bg-ink text-film" : "border-ink/25 bg-film text-ink hover:border-ink"
            } ${!editable && !on ? "opacity-45" : ""}`}
          >
            {ENUM_LABELS[o] ?? o}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Every number, string and list under path as a grid of cells, sub-objects under their own heading.
 * Keys in skip are drawn by a dedicated editor.
 */
export function FieldGrid({ path, skip = [], title }: { path: Path; skip?: string[]; title?: string }) {
  const { draft } = useAlgorithm();
  const node = getIn(draft, path);
  if (node === null || typeof node !== "object" || Array.isArray(node)) {
    const key = path.join(".");
    return (
      <div className="grid gap-px border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-3">
        <FieldCell path={path} meta={FIELDS[key] ?? { label: key }} />
      </div>
    );
  }
  const entries = Object.entries(node).filter(([k]) => !skip.includes(k));
  const leaves = entries.filter(([, v]) => v === null || typeof v !== "object" || Array.isArray(v));
  const groups = entries.filter(([, v]) => v !== null && typeof v === "object" && !Array.isArray(v));
  return (
    <div className="grid gap-5">
      {title && <h3 className="text-lg font-semibold tracking-tight">{title}</h3>}
      {leaves.length > 0 && (
        <div className="grid gap-px border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-3">
          {leaves.map(([k]) => {
            const key = [...path, k].join(".");
            return <FieldCell key={k} path={[...path, k]} meta={FIELDS[key] ?? { label: k }} />;
          })}
        </div>
      )}
      {groups.map(([k]) => (
        <FieldGrid key={k} path={[...path, k]} title={GROUP_TITLES[[...path, k].join(".")] ?? k} />
      ))}
    </div>
  );
}

const GROUP_TITLES: Record<string, string> = {
  "limitEngine.runwayGuard": "Freno de caja",
  "products.momentum": "Estrellas emergentes (Fondo)",
  "alerts.watchlist": "Lista de vigilancia",
  "leadTime.events": "Eventos proxy",
  "leadTime.signal": "Cuándo levanta la mano X-Ray",
};

/**
 * A number per band A–D (spread, premium multiplier). Band E is absent by design: decline, not insurable.
 * The band chip is a health marker, so it keeps its band hue.
 */
export function BandMapField({ path, unit, note }: { path: Path; unit: string; note: string }) {
  const { draft, saved } = useAlgorithm();
  const map = (getIn(draft, path) ?? {}) as Record<string, number>;
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-px border border-rule bg-rule sm:grid-cols-4">
        {BANDS.filter((b) => b.band in map).map((b) => {
          const p = [...path, b.band];
          const dirty = getIn(saved, p) !== map[b.band];
          return (
            <div key={b.band} className="relative grid content-start gap-2 bg-film px-3 py-3">
              {dirty && <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-ink" />}
              <span className="inline-flex items-center gap-2 text-[15px] font-semibold">
                <span aria-hidden className="grid h-6 w-6 place-items-center text-sm text-film [font-stretch:80%]" style={{ background: b.color }}>
                  {b.band}
                </span>
                Banda {b.band}
              </span>
              <NumberInput path={p} meta={{ label: `Banda ${b.band}`, unit, min: 0 }} size="sm" />
              <DefaultNote path={p} />
            </div>
          );
        })}
      </div>
      <p className="text-sm text-ink-muted">{note}</p>
    </div>
  );
}
