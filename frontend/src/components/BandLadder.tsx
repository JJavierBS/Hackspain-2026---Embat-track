import { BANDS, type Band } from "../lib/format";

interface BandLadderProps {
  /** The lit band. Without it every band stays at rest. */
  active?: Band;
  /** Entities per band. Absent until the pipeline has results. */
  counts?: Partial<Record<Band, number>>;
}

/** The full A–E scale, always visible. The current band is lit forward. */
export function BandLadder({ active, counts }: BandLadderProps) {
  return (
    <ol className="grid grid-cols-5 gap-px border border-rule bg-rule" aria-label="Bandas de puntuación">
      {BANDS.map(({ band, range, color }) => {
        const lit = active === band;
        const count = counts?.[band];
        return (
          <li
            key={band}
            aria-current={lit ? "true" : undefined}
            className="relative bg-film px-2 pt-4 pb-3 sm:px-3"
            style={lit ? { background: color, color: "#fff" } : undefined}
          >
            <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
            <span
              className="block text-4xl leading-none font-semibold [font-stretch:80%] sm:text-5xl"
              style={lit ? undefined : { color }}
            >
              {band}
            </span>
            <span className={`mt-2 block text-xs sm:text-sm ${lit ? "text-white/85" : "text-ink-muted"}`}>{range}</span>
            <span className={`mt-1 block text-lg font-semibold ${lit ? "" : "text-ink"}`}>
              {count === undefined ? "—" : count}
              <span className={`ml-1 hidden text-xs font-normal sm:inline ${lit ? "text-white/85" : "text-ink-muted"}`}>entidades</span>
              <span className="sr-only sm:hidden"> entidades</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
