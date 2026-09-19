import { bandOf, formatDelta, formatScore } from "../lib/format";
import { IconDown, IconFlat, IconUp } from "./Icons";

interface ScoreReadoutProps {
  score: number;
  /** Change vs the comparison month, in points. null when there was no score then. */
  delta: number | null;
  /** Label for the comparison, e.g. "vs M20". */
  against: string;
  size?: "lg" | "md";
}

/** Slots sized for "100,0": three integer cells, the comma, one decimal cell. */
const SLOTS = 5;

/** The score in fixed numeral slots and its band color, the band letter, and a caliper for the change. */
export function ScoreReadout({ score, delta, against, size = "lg" }: ScoreReadoutProps) {
  const band = bandOf(score);
  const direction = delta === null ? "flat" : delta > 0.05 ? "up" : delta < -0.05 ? "down" : "flat";
  const Arrow = direction === "up" ? IconUp : direction === "down" ? IconDown : IconFlat;
  const dirColor =
    direction === "up" ? "var(--color-up)" : direction === "down" ? "var(--color-down)" : "var(--color-ink-muted)";
  const big = size === "lg" ? "text-7xl sm:text-8xl" : "text-5xl";
  const cells = formatScore(score).padStart(SLOTS, " ").split("");

  return (
    <div className="flex flex-wrap items-stretch gap-x-5 gap-y-3">
      <div className="flex items-start gap-2">
        <span
          aria-label={`${formatScore(score)} puntos, banda ${band.band}`}
          className={`${big} flex leading-none font-semibold [font-stretch:80%]`}
          style={{ color: band.color }}
        >
          {cells.map((c, i) =>
            c === "," ? (
              <span key={i} aria-hidden className="w-[0.22em] text-center">
                ,
              </span>
            ) : (
              <span
                key={i}
                aria-hidden
                className="w-[0.52em] border-b-2 pb-1 text-center"
                style={{ borderColor: c === " " ? "var(--color-rule)" : band.color }}
              >
                {c === " " ? " " : c}
              </span>
            ),
          )}
        </span>
        <span
          className="mt-1 inline-flex h-8 w-8 items-center justify-center text-base font-bold text-white"
          style={{ background: band.color }}
          title={`Banda ${band.band}: ${band.range}`}
        >
          {band.band}
        </span>
      </div>
      {/* Caliper: a dimension bracket that measures the change. */}
      <div className="relative flex flex-col justify-center border-l-2 border-ink/70 py-2 pl-4 before:absolute before:top-0 before:-left-[2px] before:w-3 before:border-t-2 before:border-ink/70 after:absolute after:bottom-0 after:-left-[2px] after:w-3 after:border-b-2 after:border-ink/70">
        <span className="flex items-center gap-1 text-3xl font-semibold" style={{ color: dirColor }}>
          {delta === null ? (
            "—"
          ) : (
            <>
              <Arrow width={22} height={22} />
              {formatDelta(delta)}
            </>
          )}
        </span>
        <span className="text-[15px] text-ink-muted">{delta === null ? `${against}: sin nota entonces` : `puntos ${against}`}</span>
      </div>
    </div>
  );
}
