import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePortfolio } from "../../api/queries";
import { useTuning } from "../../api/useTuning";
import { useGlobalParams } from "../../hooks/useGlobalParams";
import { useLinkSearch } from "../../hooks/useLinkSearch";
import { useSettled } from "../../hooks/useSettled";
import type { Change, ConfigTree } from "../../lib/algorithm";
import { bandOf, formatIndicatorValue, formatScore, indicatorLabel, monthCode } from "../../lib/format";
import { ProfileTable, ScorePair, TuningChart } from "../tuning/TuningParts";

const LABEL = "Con el borrador";

/**
 * The draft on one entity, before (or instead of) a full recalculation. The backend scores that entity with the
 * pipeline's own code and writes nothing. It is the only way to see a draft on a server that serves precomputed data.
 */
export function DraftPreview({ draft, changes, invalid }: { draft: ConfigTree; changes: Change[]; invalid: number }) {
  const { profile, month } = useGlobalParams();
  const linkSearch = useLinkSearch();
  const portfolio = usePortfolio(profile, month);
  const [picked, setPicked] = useState<string | null>(null);
  const rows = portfolio.data?.rows ?? [];
  const id = picked ?? rows[0]?.id ?? "";

  // Only the changed sections travel: the server merges them over the config in use.
  const config = useMemo(() => {
    const keys = [...new Set(changes.map((c) => String(c.path[0])))];
    return keys.length === 0 ? null : (Object.fromEntries(keys.map((k) => [k, draft[k]])) as ConfigTree);
  }, [changes, draft]);

  // One keystroke is not one question to the server: wait until the expert stops typing.
  const settled = useSettled(config, 400);

  const tuning = useTuning({ id, profile, month, config: settled }, settled !== null && invalid === 0);

  return (
    <div className="grid gap-6">
      <p className="max-w-[70ch] text-ink-muted">
        Elige una entidad y mira cómo quedaría con tu borrador. Solo se calcula esa entidad y nada se guarda: sirve para probar
        un cambio antes de aplicarlo, y también en esta demo, que sirve datos precalculados.
      </p>

      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <label className="grid gap-1 text-[15px] font-semibold">
          Entidad
          <select
            value={id}
            onChange={(e) => setPicked(e.target.value)}
            className="min-w-[16rem] border border-rule bg-film px-3 py-2 font-normal focus:border-ink"
          >
            {rows.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {formatScore(r.final)} {bandOf(r.final).band}
              </option>
            ))}
          </select>
        </label>
        {id && (
          <Link to={`/entity/${id}${linkSearch}`} className="pb-2 text-[15px] underline decoration-rule underline-offset-4 hover:decoration-ink">
            Abrir la ficha de la entidad
          </Link>
        )}
      </div>

      {config === null ? (
        <p className="text-[15px] text-ink-muted">El borrador es igual a la configuración en uso. Cambia un valor o carga un preset para ver su efecto.</p>
      ) : invalid > 0 ? (
        <p className="text-[15px] font-semibold">Corrige los valores marcados para ver la vista previa.</p>
      ) : tuning.error ? (
        <p role="alert" className="text-[15px]">
          <span className="font-semibold">No se pudo calcular la vista previa.</span> {tuning.error.message}
        </p>
      ) : !tuning.data ? (
        <div className="grid gap-3" aria-busy="true">
          {[90, 72, 54].map((w) => (
            <div key={w} className="h-5 bg-panel-grid" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : (
        <div className={`grid gap-8 transition-opacity ${tuning.isPlaceholderData ? "opacity-60" : ""}`} aria-busy={tuning.isPlaceholderData}>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div className="grid content-start gap-6">
              <ScorePair result={tuning.data} profile={profile} tunedLabel={LABEL} />
              <ProfileTable result={tuning.data} active={profile} tunedLabel={LABEL} />
            </div>
            <TuningChart result={tuning.data} activeMonth={month} tunedLabel={LABEL} height={240} />
          </div>
          {tuning.data.indicators.length > 0 && (
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left text-[15px]">
                <caption className="px-5 pb-2 text-left text-sm text-ink-muted">Indicadores con anclas o peso cambiados · {monthCode(month)}</caption>
                <thead>
                  <tr className="border-b border-ink/20 text-sm text-ink-muted">
                    <th className="px-5 py-2 font-medium">Indicador</th>
                    <th className="px-2 py-2 text-right font-medium">Valor</th>
                    <th className="px-2 py-2 text-right font-medium">Nivel en uso</th>
                    <th className="px-5 py-2 text-right font-medium">{LABEL}</th>
                  </tr>
                </thead>
                <tbody>
                  {tuning.data.indicators.map((i) => (
                    <tr key={i.indicator} className={`border-t border-rule ${i.available ? "" : "text-ink-muted"}`}>
                      <td className="px-5 py-2 font-medium">{indicatorLabel(i.indicator)}</td>
                      <td className="px-2 py-2 text-right">{i.available ? formatIndicatorValue(i.indicator, i.value) : "sin datos"}</td>
                      <td className="px-2 py-2 text-right">
                        <Level value={i.available ? i.baseLevel : null} />
                      </td>
                      <td className="px-5 py-2 text-right">
                        <Level value={i.available ? i.tunedLevel : null} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Level({ value }: { value: number | null }) {
  if (value === null) return <span className="text-ink-muted">—</span>;
  return (
    <span className="font-semibold" style={{ color: bandOf(value).color }}>
      {formatScore(value)}
    </span>
  );
}
