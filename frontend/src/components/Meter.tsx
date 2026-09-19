import { bandOf, directionOf, formatScore } from "../lib/format";
import { IconDown, IconFlat, IconUp } from "./Icons";

interface MeterProps {
  label: string;
  /** null when the reading is not available yet (short history). */
  value: number | null;
  hint?: string;
  /**
   * Direction reading (trajectory): the bar grows from the 50 mark in green or red.
   * Without it the bar is a 0–100 health reading in its band color.
   */
  direction?: boolean;
}

/** A 0–100 reading with the 50 mark. */
export function Meter({ label, value, hint, direction = false }: MeterProps) {
  if (value === null) {
    return (
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] font-semibold">{label}</span>
          <span className="text-2xl font-semibold text-ink-muted">—</span>
        </div>
        <div className="mt-2 h-2.5 bg-panel-grid" />
        {hint && <p className="mt-1.5 text-sm text-ink-muted">{hint}</p>}
      </div>
    );
  }
  const dir = directionOf(value - 50);
  const color = direction
    ? dir === "up"
      ? "var(--color-up)"
      : dir === "down"
        ? "var(--color-down)"
        : "var(--color-ink-muted)"
    : bandOf(value).color;
  const Icon = dir === "up" ? IconUp : dir === "down" ? IconDown : IconFlat;
  const fill = direction
    ? { left: `${Math.min(value, 50)}%`, width: `${Math.abs(value - 50)}%` }
    : { left: "0%", width: `${value}%` };
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-semibold">{label}</span>
        <span className="flex items-center gap-1 text-2xl font-semibold" style={{ color }}>
          {direction && <Icon width={18} height={18} />}
          {formatScore(value)}
        </span>
      </div>
      <div className="relative mt-2 h-2.5 bg-panel-grid" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label={label}>
        <div className="absolute inset-y-0" style={{ ...fill, background: color }} />
        <span aria-hidden className="absolute -top-1 bottom-[-4px] left-1/2 w-px bg-ink/60" />
      </div>
      {hint && <p className="mt-1.5 text-sm text-ink-muted">{hint}</p>}
    </div>
  );
}
