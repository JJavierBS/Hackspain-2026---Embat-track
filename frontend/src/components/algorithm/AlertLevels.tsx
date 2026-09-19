import { useEffect } from "react";
import { ALERT_LEVELS, getIn } from "../../lib/algorithm";
import { useAlgorithm } from "./AlgorithmContext";
import { DefaultNote, NumberInput } from "./Fields";

interface Level {
  warn: number;
  critical: number;
}

/**
 * The warn / critical pair of each early-warning alert (SPEC §8.5). A "below" rule fires under the value,
 * so its critical level sits under the warn level; the others the other way round.
 */
export function AlertLevels() {
  const { draft, saved, reportInvalid } = useAlgorithm();
  const wrong = ALERT_LEVELS.filter(({ key, below }) => {
    const l = getIn(draft, ["alerts", key]) as Level;
    return below ? !(l.critical < l.warn) : !(l.critical > l.warn);
  }).map((l) => l.key);

  useEffect(() => {
    reportInvalid("alerts.levels", wrong.length > 0);
    return () => reportInvalid("alerts.levels", false);
  }, [wrong.length, reportInvalid]);

  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[40rem] border-collapse text-[15px]">
        <thead>
          <tr className="border-b border-ink/20 text-left text-sm text-ink-muted">
            <th scope="col" className="py-2 pr-4 font-normal">
              Alerta
            </th>
            <th scope="col" className="px-3 py-2 font-normal">
              Salta
            </th>
            <th scope="col" className="px-3 py-2 font-normal">
              Aviso
            </th>
            <th scope="col" className="px-3 py-2 font-normal">
              Crítica
            </th>
          </tr>
        </thead>
        <tbody>
          {ALERT_LEVELS.map(({ key, label, below, unit, percent }) => {
            const dirty = JSON.stringify(getIn(saved, ["alerts", key])) !== JSON.stringify(getIn(draft, ["alerts", key]));
            return (
              <tr key={key} className="border-b border-rule align-top">
                <th scope="row" className="relative py-3 pr-4 text-left font-semibold">
                  {dirty && <span aria-hidden className="absolute top-0 left-0 h-0.5 w-12 bg-ink" />}
                  {label}
                  {wrong.includes(key) && (
                    <p role="alert" className="mt-1 text-sm font-semibold">
                      La crítica debe estar {below ? "por debajo" : "por encima"} del aviso.
                    </p>
                  )}
                </th>
                <td className="px-3 py-3 whitespace-nowrap text-ink-muted">{below ? "por debajo de" : "por encima de"}</td>
                {(["warn", "critical"] as const).map((level) => (
                  <td key={level} className="px-3 py-3">
                    <div className="grid gap-1">
                      <NumberInput
                        path={["alerts", key, level]}
                        meta={{ label: `${label}, ${level === "warn" ? "aviso" : "crítica"}`, unit, percent, min: 0 }}
                        size="sm"
                      />
                      <DefaultNote path={["alerts", key, level]} percent={percent} />
                    </div>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
