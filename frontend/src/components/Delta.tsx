import { directionOf, formatDelta } from "../lib/format";
import { IconDown, IconFlat, IconUp } from "./Icons";

const COLORS = { up: "text-up", down: "text-down", flat: "text-ink-muted" } as const;
const ICONS = { up: IconUp, down: IconDown, flat: IconFlat } as const;

/** A signed change with its direction arrow. Green and red mean direction only. */
export function Delta({ value, className = "" }: { value: number | null; className?: string }) {
  if (value === null) return <span className={`text-ink-muted ${className}`}>—</span>;
  const dir = directionOf(value);
  const Icon = ICONS[dir];
  return (
    <span className={`inline-flex items-center gap-1 font-semibold whitespace-nowrap ${COLORS[dir]} ${className}`}>
      <Icon width={15} height={15} />
      {formatDelta(value)}
    </span>
  );
}
