import { bandOf, formatDelta, formatScore } from "../lib/format";
import { IconDown, IconFlat, IconUp } from "./Icons";

interface ScoreReadoutProps {
  score: number;
  /** Change vs the comparison month, in points. */
  delta: number;
  /** Label for the comparison, e.g. "vs M20". */
  against: string;
  size?: "lg" | "md";
}

/** The score in its band color, the band letter, and a caliper for the change. */
export function ScoreReadout({ score, delta, against, size = "lg" }: ScoreReadoutProps) {
  const band = bandOf(score);
  const direction = delta > 0.05 ? "up" : delta < -0.05 ? "down" : "flat";
  const Arrow = direction === "up" ? IconUp : direction === "down" ? IconDown : IconFlat;
  const dirColor =
    direction === "up" ? "var(--color-up)" : direction === "down" ? "var(--color-down)" : "var(--color-ink-muted)";
  const big = size === "lg" ? "text-7xl sm:text-8xl" : "text-5xl";

  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
      <div className="flex items-start gap-2">
        <span className={`${big} leading-[0.85] font-semibold tracking-tight [font-stretch:80%]`} style={{ color: band.color }}>
          {formatScore(score)}
        </span>
        <span
          className="mt-1 inline-flex h-7 w-7 items-center justify-center text-sm font-bold text-white"
          style={{ background: band.color }}
          title={`Banda ${band.band}: ${band.range}`}
        >
          {band.band}
        </span>
      </div>
      <div className="border-l border-rule pl-4 pb-1">
        <span className="flex items-center gap-1 text-2xl font-semibold" style={{ color: dirColor }}>
          <Arrow width={20} height={20} />
          {formatDelta(delta)}
        </span>
        <span className="text-sm text-ink-muted">puntos {against}</span>
      </div>
    </div>
  );
}
