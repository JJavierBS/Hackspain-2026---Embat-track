import type { Status } from "../api/types";
import { STATUS_LABELS } from "../lib/format";
import { IconDown, IconUp } from "./Icons";

const NEGATIVE: Status[] = ["STRUCTURAL_DECLINE", "TURNING", "DIP"];

/** The health status of SPEC §8.3. Arrows carry direction, band colors carry the extremes. */
export function StatusTag({ status }: { status: Status }) {
  const up = status === "IMPROVING";
  const down = NEGATIVE.includes(status);
  const tone =
    status === "CRITICAL"
      ? "border-band-e bg-band-e text-white"
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
