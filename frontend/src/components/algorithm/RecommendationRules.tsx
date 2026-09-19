import type { Category } from "../../api/types";
import { CATEGORY_LABELS } from "../../lib/format";
import { getIn, type Path } from "../../lib/algorithm";
import { useAlgorithm } from "./AlgorithmContext";

const CATEGORIES: Category[] = [
  "LIQUIDITY",
  "OPERATING_CASH_FLOW",
  "DEBT_SERVICE",
  "DELINQUENCY",
  "PAYMENT_BEHAVIOUR",
  "LEVERAGE",
  "TAX_REGULARITY",
  "CONCENTRATION",
  "ACTIVITY_GROWTH",
];
const PROFILES = ["BANK", "FUND", "INSURER"] as const;

export function RecommendationRules() {
  const { draft, saved, editable, setAt } = useAlgorithm();
  return (
    <div className="grid gap-4">
      <div>
        <h3 className="text-lg font-semibold tracking-tight">Reglas de cada recomendación</h3>
        <p className="mt-1 max-w-[70ch] text-sm text-ink-muted">
          El experto decide cuándo aparece, para qué perfil aplica y qué acción se muestra, sin modificar el cálculo de la puntuación.
        </p>
      </div>
      <div className="grid gap-px border border-rule bg-rule">
        {CATEGORIES.map((category) => {
          const base = ["recommendations", "rules", category] as Path;
          const titlePath = [...base, "title"] as Path;
          const actionPath = [...base, "action"] as Path;
          const priorityPath = [...base, "priority"] as Path;
          const enabledPath = [...base, "enabled"] as Path;
          const maxLevelPath = [...base, "maxLevel"] as Path;
          const maxTrajectoryPath = [...base, "maxTrajectory"] as Path;
          const profilesPath = [...base, "profiles"] as Path;
          const title = String(getIn(draft, titlePath) ?? "");
          const action = String(getIn(draft, actionPath) ?? "");
          const priority = Number(getIn(draft, priorityPath) ?? 99);
          const enabled = Boolean(getIn(draft, enabledPath) ?? true);
          const maxLevel = Number(getIn(draft, maxLevelPath) ?? 100);
          const maxTrajectory = Number(getIn(draft, maxTrajectoryPath) ?? 100);
          const profiles = (getIn(draft, profilesPath) as string[] | undefined) ?? [...PROFILES];
          const dirty = JSON.stringify(getIn(saved, base)) !== JSON.stringify(getIn(draft, base));
          return (
            <div key={category} className="relative grid gap-4 bg-film p-4 lg:grid-cols-[13rem_6rem_8rem_8rem_minmax(0,1fr)]">
              {dirty && <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-ink" />}
              <div>
                <p className="font-semibold">{CATEGORY_LABELS[category]}</p>
                <label className="mt-2 flex items-center gap-2 text-sm text-ink-muted">
                  <input type="checkbox" checked={enabled} disabled={!editable} onChange={(event) => setAt(enabledPath, event.target.checked)} />
                  Activa
                </label>
              </div>
              <label className="grid gap-1 text-xs font-semibold text-ink-muted">
                Orden
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={priority}
                  disabled={!editable}
                  onChange={(event) => setAt(priorityPath, Number(event.target.value))}
                  className="w-20 border border-rule bg-film px-2 py-1.5 text-sm text-ink outline-none focus:border-ink disabled:opacity-50"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-ink-muted">
                Nivel máximo
                <input type="number" min={0} max={100} value={maxLevel} disabled={!editable} onChange={(event) => setAt(maxLevelPath, Number(event.target.value))} className="w-20 border border-rule bg-film px-2 py-1.5 text-sm text-ink outline-none focus:border-ink disabled:opacity-50" />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-ink-muted">
                Trayectoria máxima
                <input type="number" min={0} max={100} value={maxTrajectory} disabled={!editable} onChange={(event) => setAt(maxTrajectoryPath, Number(event.target.value))} className="w-20 border border-rule bg-film px-2 py-1.5 text-sm text-ink outline-none focus:border-ink disabled:opacity-50" />
              </label>
              <div className="grid gap-2">
                <label className="grid gap-1 text-xs font-semibold text-ink-muted">
                  Título
                  <input
                    value={title}
                    disabled={!editable}
                    onChange={(event) => setAt(titlePath, event.target.value)}
                    className="border border-rule bg-film px-2 py-1.5 text-sm text-ink outline-none focus:border-ink disabled:opacity-50"
                  />
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {PROFILES.map((profile) => {
                    const selected = profiles.includes(profile);
                    return (
                      <button
                        key={profile}
                        type="button"
                        aria-pressed={selected}
                        disabled={!editable}
                        onClick={() => setAt(profilesPath, selected ? profiles.filter((value) => value !== profile) : [...profiles, profile])}
                        className={`border px-2 py-1 text-xs font-semibold ${selected ? "border-ink bg-ink text-film" : "border-rule text-ink-muted"} disabled:opacity-50`}
                      >
                        {profile}
                      </button>
                    );
                  })}
                </div>
                <label className="grid gap-1 text-xs font-semibold text-ink-muted">
                  Acción
                  <textarea
                    value={action}
                    disabled={!editable}
                    rows={2}
                    onChange={(event) => setAt(actionPath, event.target.value)}
                    className="resize-y border border-rule bg-film px-2 py-1.5 text-sm font-normal text-ink outline-none focus:border-ink disabled:opacity-50"
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
