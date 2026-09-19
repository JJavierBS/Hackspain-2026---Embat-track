import { useEffect } from "react";
import type { Category } from "../../api/types";
import { PROFILES, useGlobalParams } from "../../hooks/useGlobalParams";
import { CATEGORY_LABELS, PROFILE_LABELS, formatWeight } from "../../lib/format";
import { type ProfileEntry, getIn, round } from "../../lib/algorithm";
import { useAlgorithm } from "./AlgorithmContext";
import { DefaultNote, NumberInput } from "./Fields";

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];

/**
 * Category weights of the three buyer profiles (0–100, sum 100) and λ, the level share of the blend.
 * Weights are not health values: the bars are ink, never a band hue.
 */
export function WeightsTable() {
  const { draft, saved, editable, setAt, reportInvalid } = useAlgorithm();
  const { profile: current } = useGlobalParams();
  const profiles = draft.profiles as Record<string, ProfileEntry>;
  const sums = Object.fromEntries(
    PROFILES.map((p) => [p, round(CATEGORIES.reduce((s, c) => s + (profiles[p].weights[c] ?? 0), 0), 2)]),
  ) as Record<string, number>;
  const broken = PROFILES.filter((p) => Math.abs(sums[p] - 100) > 0.01);

  useEffect(() => {
    reportInvalid("profiles.sum", broken.length > 0);
    return () => reportInvalid("profiles.sum", false);
  }, [broken.length, reportInvalid]);

  /** Scales every weight so the column sums to 100, and puts the rounding rest on the largest weight. */
  function normalize(p: string) {
    const w = profiles[p].weights;
    const total = sums[p];
    if (!(total > 0)) return;
    const next = Object.fromEntries(CATEGORIES.map((c) => [c, round(((w[c] ?? 0) * 100) / total, 2)])) as Record<Category, number>;
    const rest = round(100 - CATEGORIES.reduce((s, c) => s + next[c], 0), 2);
    const largest = CATEGORIES.reduce((a, b) => (next[a] >= next[b] ? a : b));
    next[largest] = round(next[largest] + rest, 2);
    setAt(["profiles", p, "weights"], next);
  }

  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[46rem] border-collapse text-[15px]">
        <thead>
          <tr className="border-b border-ink/20 text-left text-sm text-ink-muted">
            <th scope="col" className="py-2 pr-4 font-normal">
              Categoría
            </th>
            {PROFILES.map((p) => (
              <th key={p} scope="col" className="px-3 py-2 font-normal">
                <span className={p === current ? "font-semibold text-ink" : undefined}>{PROFILE_LABELS[p].name}</span>
                {p === current && <span className="ml-2 text-ink-muted">· vista actual</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map((c) => (
            <tr key={c} className="border-b border-rule align-top">
              <th scope="row" className="py-3 pr-4 text-left font-semibold">
                {CATEGORY_LABELS[c]}
              </th>
              {PROFILES.map((p) => {
                const path = ["profiles", p, "weights", c];
                const value = profiles[p].weights[c] ?? 0;
                const dirty = getIn(saved, path) !== value;
                return (
                  <td key={p} className="px-3 py-3">
                    <div className="grid gap-1.5">
                      <NumberInput path={path} meta={{ label: `${CATEGORY_LABELS[c]}, ${PROFILE_LABELS[p].name}`, min: 0, max: 100 }} size="sm" />
                      <span aria-hidden className="h-1.5 w-full max-w-40 bg-panel-grid">
                        <span className={`block h-full ${dirty ? "bg-ink" : "bg-ink/35"}`} style={{ width: `${Math.min(100, value * 4)}%` }} />
                      </span>
                      <DefaultNote path={path} />
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="border-b border-ink/20 align-top">
            <th scope="row" className="py-3 pr-4 text-left font-semibold">
              Suma
            </th>
            {PROFILES.map((p) => {
              const ok = !broken.includes(p);
              return (
                <td key={p} className="px-3 py-3">
                  <div className="grid gap-1.5">
                    <span className="text-lg font-semibold [font-stretch:88%]">{formatWeight(sums[p])}</span>
                    {!ok && (
                      <>
                        <span role="alert" className="text-sm font-semibold">
                          Debe sumar 100
                        </span>
                        {editable && (
                          <button
                            type="button"
                            onClick={() => normalize(p)}
                            className="w-fit border border-ink px-2.5 py-1 text-sm hover:bg-ink hover:text-film"
                          >
                            Repartir hasta 100
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              );
            })}
          </tr>
          <tr className="align-top">
            <th scope="row" className="py-3 pr-4 text-left">
              <span className="font-semibold">λ · peso del nivel</span>
              <p className="max-w-[22ch] text-sm font-normal text-ink-muted">Final = λ × nivel + (1 − λ) × trayectoria.</p>
            </th>
            {PROFILES.map((p) => {
              const lambda = profiles[p].lambda;
              return (
                <td key={p} className="px-3 py-3">
                  <div className="grid gap-1.5">
                    <NumberInput path={["profiles", p, "lambda"]} meta={{ label: `λ, ${PROFILE_LABELS[p].name}`, min: 0, max: 1 }} size="sm" />
                    <span aria-hidden className="flex h-1.5 w-full max-w-40">
                      <span className="h-full bg-series-level" style={{ width: `${lambda * 100}%` }} />
                      <span className="h-full flex-1 bg-series-trajectory" />
                    </span>
                    <span className="text-sm text-ink-muted">
                      Nivel {formatWeight(lambda * 100)} % · trayectoria {formatWeight(100 - lambda * 100)} %
                    </span>
                    <DefaultNote path={["profiles", p, "lambda"]} />
                  </div>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
