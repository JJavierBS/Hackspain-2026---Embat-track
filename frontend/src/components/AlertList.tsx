import { Link } from "react-router-dom";
import type { Alert } from "../api/types";
import { useLinkSearch } from "../hooks/useLinkSearch";
import { ALERT_LABELS, SEVERITY_LABELS, monthCode, monthShort } from "../lib/format";
import { IconDown, IconUp } from "./Icons";

interface AlertListProps {
  alerts: Alert[];
  /** Monitor: name and link of the entity on each row. */
  showEntity?: boolean;
  /** Entity page: the month of each alert, since the list spans many months. */
  showMonth?: boolean;
  /** New rows slide in under the scan wash (replay). Off under reduced motion. */
  animate?: boolean;
}

/** Feed rows: direction arrow, what fired and why, severity. Green and red name direction only. */
export function AlertList({ alerts, showEntity = false, showMonth = false, animate = false }: AlertListProps) {
  const linkSearch = useLinkSearch();
  return (
    <ul className="grid">
      {alerts.map((a) => (
        <li
          key={a.id}
          className={`grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-3 border-b border-dashed border-rule py-2.5 last:border-b-0 ${
            animate ? "alert-in" : ""
          }`}
        >
          {a.direction === "POSITIVE" ? (
            <IconUp className="mt-1 text-up" />
          ) : (
            <IconDown className="mt-1 text-down" />
          )}
          <span className="min-w-0">
            <span className="sr-only">{a.direction === "POSITIVE" ? "Positiva: " : "Negativa: "}</span>
            {showEntity ? (
              <Link to={`/entity/${a.entityId}${linkSearch}`} className="font-semibold underline-offset-4 hover:underline">
                {a.entityName}
              </Link>
            ) : (
              <span className="font-semibold">{ALERT_LABELS[a.code]}</span>
            )}
            {showMonth && (
              <span className="ml-2 text-sm text-ink-muted">
                {monthShort(a.month)} · {monthCode(a.month)}
              </span>
            )}
            <span className="block text-[15px] text-ink-muted">
              {showEntity && <span className="font-medium text-ink">{ALERT_LABELS[a.code]} · </span>}
              {a.message}
            </span>
          </span>
          <SeverityTag alert={a} />
        </li>
      ))}
    </ul>
  );
}

/** Critical is the one filled red; a warning is outlined red; positive info outlined green; neutral info in hairline. */
export function SeverityTag({ alert: a }: { alert: Pick<Alert, "severity" | "direction"> }) {
  const tone =
    a.severity === "CRITICAL"
      ? "border-down bg-down text-white"
      : a.severity === "WARN"
        ? "border-down/60 text-down"
        : a.direction === "POSITIVE"
          ? "border-up/60 text-up"
          : "border-rule text-ink-muted";
  return <span className={`border px-2 py-0.5 text-sm font-medium whitespace-nowrap ${tone}`}>{SEVERITY_LABELS[a.severity]}</span>;
}
