import type { BandLetter } from "../api/types";
import { BANDS } from "../lib/format";

interface RateLadderProps {
  label: string;
  /** The figure of each band, already formatted. A band missing from the map has no product. */
  values: Partial<Record<BandLetter, string>>;
  /** Text for a band with no value (e.g. "sin crédito", "no asegurable"). */
  missing: string;
  /** The entity's band this month, lit. */
  active?: BandLetter;
}

/** A product tariff on the full S–E ladder (The Full Ladder Rule): one figure per band, the current band lit. */
export function RateLadder({ label, values, missing, active }: RateLadderProps) {
  return (
    <ol className="grid grid-cols-3 gap-px sm:grid-cols-6 border border-rule bg-rule" aria-label={label}>
      {BANDS.map(({ band, color }) => {
        const lit = active === band;
        const value = values[band];
        return (
          <li
            key={band}
            aria-current={lit ? "true" : undefined}
            className="relative bg-film px-2 pt-3 pb-2.5 sm:px-3"
            style={lit ? { background: color, color: "#fff" } : undefined}
          >
            <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
            <span className="block text-2xl leading-none font-semibold [font-stretch:80%]" style={lit ? undefined : { color }}>
              {band}
            </span>
            <span
              className={`mt-1.5 block text-sm sm:text-[15px] ${value === undefined ? (lit ? "text-white/85" : "text-ink-muted") : "font-semibold"}`}
            >
              {value ?? missing}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
