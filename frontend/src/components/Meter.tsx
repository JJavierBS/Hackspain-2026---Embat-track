import { bandOf, formatScore } from "../lib/format";

interface MeterProps {
  label: string;
  value: number;
  hint?: string;
}

/** A 0–100 reading on a band-colored bar, with the 50 mark (flat for trajectory). */
export function Meter({ label, value, hint }: MeterProps) {
  const band = bandOf(value);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-semibold">{label}</span>
        <span className="text-2xl font-semibold" style={{ color: band.color }}>
          {formatScore(value)}
        </span>
      </div>
      <div className="relative mt-2 h-2.5 bg-panel-grid" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label={label}>
        <div className="h-full" style={{ width: `${value}%`, background: band.color }} />
        <span aria-hidden className="absolute -top-1 bottom-[-4px] left-1/2 w-px bg-ink/60" />
      </div>
      {hint && <p className="mt-1.5 text-sm text-ink-muted">{hint}</p>}
    </div>
  );
}
