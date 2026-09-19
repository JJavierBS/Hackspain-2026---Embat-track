import type { Status } from "../api/types";
import { STATUS_LABELS } from "../lib/format";
import { IconDown, IconFlat, IconUp } from "./Icons";

const NEGATIVE: Status[] = ["STRUCTURAL_DECLINE", "TURNING", "DIP"];

/** The health status of SPEC §8.3. "Crítica" uses the same red fill as a critical alert. */
export function StatusTag({ status }: { status: Status | null }) {
  if (status === null) return <span className="text-ink-muted">—</span>;
  const up = status === "IMPROVING";
  const down = NEGATIVE.includes(status);
  const tone =
    status === "CRITICAL"
      ? "border-down bg-down text-white"
      : status === "EXCEPTIONAL"
        ? "border-band-a text-band-a"
        : "border-rule text-ink";
  return (
    <span className={`inline-flex items-center gap-1 border px-2 py-0.5 text-sm font-medium whitespace-nowrap ${tone}`}>
      {up && <IconUp width={14} height={14} className="text-up" />}
      {down && <IconDown width={14} height={14} className="text-down" />}
      {STATUS_LABELS[status]}
    </span>
  );
}

/** Direction read from the trajectory with the same 50 mark as the meter (±5 dead zone). */
export function TrendTag({ traj }: { traj: number | null }) {
  if (traj === null) {
    return (
      <span className="inline-flex items-center gap-1 border border-rule px-2 py-0.5 text-sm font-medium whitespace-nowrap text-ink-muted">
        Sin tendencia todavía
      </span>
    );
  }
  const dir = traj >= 55 ? "up" : traj <= 45 ? "down" : "flat";
  const label = dir === "up" ? "Tendencia al alza" : dir === "down" ? "Tendencia a la baja" : "Tendencia plana";
  const Icon = dir === "up" ? IconUp : dir === "down" ? IconDown : IconFlat;
  const color = dir === "up" ? "text-up" : dir === "down" ? "text-down" : "text-ink-muted";
  return (
    <span className="inline-flex items-center gap-1 border border-rule px-2 py-0.5 text-sm font-medium whitespace-nowrap">
      <Icon width={14} height={14} className={color} />
      {label}
    </span>
  );
}
