import type { Category } from "../api/types";
import { useMeta, useProfiles } from "../api/queries";
import { BandLadder } from "../components/BandLadder";
import { Film } from "../components/Film";
import { IconDown, IconUp } from "../components/Icons";
import { LoadState } from "../components/LoadState";
import { PageHeader } from "../components/PageHeader";
import { PendingFilm } from "../components/PendingFilm";
import { ScoreReadout } from "../components/ScoreReadout";
import { TrendChart } from "../components/TrendChart";
import { MONTHS, type Profile, useGlobalParams } from "../hooks/useGlobalParams";
import { CATEGORY_LABELS, PROFILE_LABELS, bandOf, formatScore, formatWeight, monthCode } from "../lib/format";

/**
 * Illustrative series for the reading guide. Not Embat data, and not the scoring formula:
 * the final line only has to sit near the level and lean with the trajectory.
 */
const EXAMPLE = MONTHS.map((month, i) => {
  // An entity that climbs from band D to band B, with a short dip around M10.
  const level = 36 + 1.6 * i - 7 * Math.exp(-((i - 10) ** 2) / 6);
  const trajectory = 55 + 15 * Math.cos((i - 14) / 6);
  const round = (v: number) => Math.round(v * 10) / 10;
  return { month, level: round(level), trajectory: round(trajectory), final: round(level + (trajectory - 50) / 4) };
});

export function MethodologyPage() {
  const { month } = useGlobalParams();
  const m = MONTHS.indexOf(month);
  const now = EXAMPLE[m];
  const before = EXAMPLE[Math.max(0, m - 3)];

  return (
    <div className="grid gap-12">
      <PageHeader title="Metodología" lede="Cómo leer cada número de X-Ray: bandas, dirección, pesos por perfil y limitaciones." />

      <Film title="Cómo leer una puntuación" meta="Ejemplo ilustrativo · no son datos reales">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="grid content-start gap-6">
            <ScoreReadout score={now.final} delta={now.final - before.final} against={`vs ${monthCode(before.month)}`} />
            <dl className="grid gap-3 text-[15px]">
              <div>
                <dt className="font-semibold">Número y letra</dt>
                <dd className="text-ink-muted">La puntuación final (0–100) toma el color de su banda, de A a E.</dd>
              </div>
              <div>
                <dt className="font-semibold">Flecha</dt>
                <dd className="flex flex-wrap items-center gap-x-3 text-ink-muted">
                  <span className="inline-flex items-center gap-1 font-semibold text-up">
                    <IconUp /> mejora
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-down">
                    <IconDown /> empeora
                  </span>
                  Verde y rojo solo indican dirección.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Franja cian</dt>
                <dd className="text-ink-muted">Marca el mes seleccionado en todas las gráficas.</dd>
              </div>
            </dl>
          </div>
          <TrendChart data={EXAMPLE} activeMonth={month} />
        </div>
      </Film>

      <Film title="Bandas" meta="Umbrales de la puntuación final">
        <BandLadder active={bandOf(now.final).band} hideCounts />
        <p className="mt-4 text-[15px] text-ink-muted">
          Iluminada: la banda del ejemplo ({formatScore(now.final)} → {bandOf(now.final).band}).
        </p>
      </Film>

      <Weights />
      <Caveats />

      <PendingFilm title="Anticipación" block="bloque 8" items={["Anticipación medida (lead time)", "Tasa de falsas alarmas"]} />
    </div>
  );
}

const LAMBDA_FORMAT = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });

/** The weights of each buyer profile, read from the API (never written in this file, decision E1). */
function Weights() {
  const { profile } = useGlobalParams();
  const { data, error, isPending } = useProfiles();
  if (error || isPending) return <LoadState error={error} title="Pesos por perfil" />;
  const active = data.profiles.find((p) => p.profile === profile);
  // Rows follow the active profile, heaviest first, so the switch in the top bar re-orders the table.
  const categories = ([...new Set(data.profiles.flatMap((p) => Object.keys(p.weights)))] as Category[]).sort(
    (a, b) => (active?.weights[b] ?? 0) - (active?.weights[a] ?? 0),
  );
  return (
    <Film
      title="Pesos por perfil"
      meta={data.source === "run" ? "Pesos con los que se calcularon las notas" : "Pesos de la configuración"}
    >
      <p className="max-w-[62ch] text-[15px] text-ink-muted">
        Cada comprador pondera las mismas categorías de otra forma. Los pesos de un perfil suman 100. Si una categoría no tiene
        datos un mes, su peso se reparte entre las demás.
      </p>
      <div className="-mx-5 mt-5 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left text-[15px]">
          <thead>
            <tr className="border-b border-ink/20 text-sm text-ink-muted">
              <th className="px-5 py-2 font-medium">Categoría</th>
              {data.profiles.map((p) => (
                <th
                  key={p.profile}
                  aria-current={p.profile === profile ? "true" : undefined}
                  className={`px-5 py-2 text-right font-medium ${p.profile === profile ? "font-semibold text-ink" : ""}`}
                >
                  {PROFILE_LABELS[p.profile as Profile]?.name ?? p.profile}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c} className="border-b border-rule">
                <td className="px-5 py-2">{CATEGORY_LABELS[c] ?? c}</td>
                {data.profiles.map((p) => {
                  const w = p.weights[c] ?? 0;
                  return (
                    <td
                      key={p.profile}
                      className={`px-5 py-2 text-right ${p.profile === profile ? "font-semibold" : "text-ink-muted"} ${w === 0 ? "opacity-55" : ""}`}
                    >
                      {w === 0 ? "—" : formatWeight(w)}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t border-ink/20">
              <td className="px-5 py-2 text-ink-muted" title="Parte del nivel en la mezcla nivel y trayectoria de cada categoría">
                λ · peso del nivel frente a la trayectoria
              </td>
              {data.profiles.map((p) => (
                <td key={p.profile} className={`px-5 py-2 text-right ${p.profile === profile ? "font-semibold" : "text-ink-muted"}`}>
                  {LAMBDA_FORMAT.format(p.lambda)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </Film>
  );
}

function Caveats() {
  const { data } = useMeta();
  if (!data) return null;
  return (
    <Film title="Limitaciones de los datos" meta="Lo que este modelo no puede ver">
      <ul className="grid gap-2 text-[15px]">
        {data.caveats.map((c) => (
          <li key={c} className="max-w-[80ch] border-t border-dashed border-rule pt-2 first:border-t-0 first:pt-0">
            {c}
          </li>
        ))}
      </ul>
    </Film>
  );
}
