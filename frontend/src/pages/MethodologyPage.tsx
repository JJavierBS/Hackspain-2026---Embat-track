import type { ReactNode } from "react";
import type { BandLetter, Category, Methodology } from "../api/types";
import { ApiError } from "../api/client";
import { useMeta, useMethodology, useProfiles } from "../api/queries";
import { BandLadder } from "../components/BandLadder";
import { Film } from "../components/Film";
import { IconDown, IconUp } from "../components/Icons";
import { LoadState } from "../components/LoadState";
import { PageHeader } from "../components/PageHeader";
import { PendingFilm } from "../components/PendingFilm";
import { RateLadder } from "../components/RateLadder";
import { ScoreReadout } from "../components/ScoreReadout";
import { TrendChart } from "../components/TrendChart";
import { MONTHS, type Profile, useGlobalParams } from "../hooks/useGlobalParams";
import {
  ALERT_LABELS,
  CATEGORY_LABELS,
  PROFILE_LABELS,
  bandOf,
  formatDscr,
  formatEur,
  formatNumber,
  formatRate,
  formatScore,
  formatWeight,
  monthCode,
} from "../lib/format";

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
      <MethodologyFilms />
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

/** Alert catalogue and product parameters, read from GET /api/methodology (never written here, decision E1). */
function MethodologyFilms() {
  const { data, error, isPending } = useMethodology();
  if (error instanceof ApiError && error.status === 404) {
    return (
      <>
        <PendingFilm title="Alertas tempranas" block="bloque 6" items={["Catálogo de alertas y disparadores", "Regla de la lista de vigilancia"]} />
        <PendingFilm title="Producto" block="bloque 7" items={["Límite de circulante", "Prima de seguro de crédito", "Momentum"]} />
      </>
    );
  }
  if (error || isPending) return <LoadState error={error} title="Alertas tempranas" />;
  return (
    <>
      <AlertCatalogue data={data} />
      <ProductParameters data={data} />
    </>
  );
}

const PROVISIONAL_TAG = "border border-dashed border-ink-muted/60 px-1.5 text-sm whitespace-nowrap text-ink-muted";

function AlertCatalogue({ data }: { data: Methodology }) {
  const { minCritical, minWarn } = data.watchlist;
  return (
    <Film title="Alertas tempranas" meta={`${data.alertRules.length} reglas · marco EBA/GL/2020/06`}>
      <p className="max-w-[62ch] text-[15px] text-ink-muted">
        Cada regla mira un dato del mes y salta sola. Una regla de estado avisa cuando aparece o cambia de gravedad; una regla de
        evento avisa cada mes que ocurre. Los umbrales vienen de la configuración.
      </p>
      <div className="-mx-5 mt-5 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-[15px]">
          <thead>
            <tr className="border-b border-ink/20 text-sm text-ink-muted">
              <th className="px-5 py-2 font-medium">Alerta</th>
              <th className="px-2 py-2 font-medium">Dirección</th>
              <th className="px-2 py-2 font-medium">Disparador</th>
              <th className="px-2 py-2 font-medium" title="Estado: avisa al aparecer o cambiar. Evento: avisa cada mes que ocurre.">
                Tipo
              </th>
              <th className="px-5 py-2 text-right font-medium" title="Alertas de la unidad en el último cálculo, todos los perfiles">
                Activaciones
              </th>
            </tr>
          </thead>
          <tbody>
            {data.alertRules.map((r) => (
              <tr key={r.code} className="border-b border-rule last:border-b-0">
                <td className="px-5 py-2.5 font-medium whitespace-nowrap">{ALERT_LABELS[r.code]}</td>
                <td className="px-2 py-2.5">
                  <span className="inline-flex items-center gap-1">
                    {r.direction !== "POSITIVE" && <IconDown className="text-down" />}
                    {r.direction !== "NEGATIVE" && <IconUp className="text-up" />}
                    <span className="sr-only">
                      {r.direction === "BOTH" ? "Negativa o positiva" : r.direction === "POSITIVE" ? "Positiva" : "Negativa"}
                    </span>
                  </span>
                </td>
                <td className="px-2 py-2.5">{r.trigger}</td>
                <td className="px-2 py-2.5 text-ink-muted">{r.event ? "Evento" : "Estado"}</td>
                <td className="px-5 py-2.5 text-right whitespace-nowrap">
                  {r.fired > 0 ? (
                    <>
                      <span className="font-semibold">{r.fired}</span> <span className="text-ink-muted">en el último cálculo</span>
                    </>
                  ) : (
                    <span className={PROVISIONAL_TAG}>
                      {r.code === "FACTORING_SPIKE" ? "sin datos en este conjunto" : "no se activa con estos datos"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 border-t border-rule pt-3 text-[15px]">
        <span className="font-semibold">Lista de vigilancia:</span>{" "}
        <span className="text-ink-muted">
          entra una entidad con al menos {minCritical} {minCritical === 1 ? "alerta crítica" : "alertas críticas"} o {minWarn} avisos
          negativos activos ese mes.
        </span>
      </p>
    </Film>
  );
}

/** One parameter per row, as a ledger: the name on the left, the value on the right. */
function Params({ rows }: { rows: { label: string; value: ReactNode; hint?: string }[] }) {
  return (
    <dl className="grid">
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-6 border-b border-dashed border-rule py-1.5 text-[15px]">
          <dt>
            {r.label}
            {r.hint && <span className="ml-2 text-sm text-ink-muted">{r.hint}</span>}
          </dt>
          <dd className="shrink-0 text-right font-semibold whitespace-nowrap">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ProductParameters({ data }: { data: Methodology }) {
  const L = data.limitEngine;
  const pct = (x: number) => `${formatNumber(x * 100)} %`;
  const spreads: Partial<Record<BandLetter, string>> = {};
  for (const [band, bps] of Object.entries(L.spreadBpsByBand) as [BandLetter, number][]) spreads[band] = `${bps} pb`;
  const multipliers: Partial<Record<BandLetter, string>> = {};
  for (const [band, m] of Object.entries(data.insurer.multiplierByBand) as [BandLetter, number][])
    multipliers[band] = `× ${formatNumber(m)}`;
  const profileName = (p: string) => PROFILE_LABELS[p as Profile]?.name ?? p;
  return (
    <Film title="Producto" meta="Parámetros de la configuración actual">
      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section className="min-w-0">
          <h3 className="text-lg font-semibold">Límite de circulante</h3>
          <p className="mt-1 mb-4 max-w-[62ch] text-[15px] text-ink-muted">
            Límite = base (mediana de cobros de 3 meses) × factor de puntuación × tendencia, con una guarda si queda poca caja. Un
            tope de cobertura de deuda (DSCR) lo limita, y se redondea a la baja. Perfil {profileName(data.products.limitProfile)}.
          </p>
          <Params
            rows={[
              { label: "Nota mínima para tener límite", value: formatNumber(L.scoreFloor) },
              { label: "Factor de puntuación", hint: "de la nota mínima a 100", value: `${formatNumber(L.factorAtFloor)} → ${formatNumber(L.factorAt100)}` },
              { label: "Tendencia", hint: "según la trayectoria", value: `± ${pct(L.trendModifierSpan)}` },
              {
                label: "Guarda de caja",
                hint: `menos de ${formatNumber(L.runwayGuardBelowMonths)} meses de caja`,
                value: `× ${formatNumber(L.runwayGuardMultiplier)}`,
              },
              { label: "DSCR mínimo", hint: "para el tope", value: formatDscr(L.dscrMin) },
              { label: "Plazo por defecto", value: `${L.defaultTermMonths} meses` },
              { label: "Umbral de acción", hint: "cambio mínimo para subir o reducir", value: `± ${pct(L.actionThreshold)}` },
              { label: "Redondeo", hint: "a la baja", value: formatEur(L.roundingEur) },
              {
                label: "Tipo de referencia",
                value: (
                  <span className="inline-flex items-baseline gap-2">
                    {L.referenceRateIsExample && <span className={`${PROVISIONAL_TAG} font-normal`}>valor de ejemplo</span>}
                    {formatRate(L.referenceRate)}
                  </span>
                ),
              },
            ]}
          />
          <h4 className="mt-6 mb-2 text-[15px] font-semibold">Diferencial por banda</h4>
          <RateLadder label="Diferencial por banda" values={spreads} missing="sin crédito" />
        </section>

        <div className="grid content-start gap-10">
          <section>
            <h3 className="text-lg font-semibold">Prima de seguro de crédito</h3>
            <p className="mt-1 mb-4 text-[15px] text-ink-muted">
              Prima = prima base × multiplicador de la banda, revisada cada mes. Perfil {profileName(data.products.premiumProfile)}.
            </p>
            <Params rows={[{ label: "Prima base", value: formatRate(data.insurer.basePremiumRate) }]} />
            <h4 className="mt-5 mb-2 text-[15px] font-semibold">Multiplicador por banda</h4>
            <RateLadder label="Multiplicador de prima por banda" values={multipliers} missing="no asegurable" />
          </section>
          <section>
            <h3 className="text-lg font-semibold">Momentum</h3>
            <p className="mt-1 mb-4 text-[15px] text-ink-muted">
              Ranking y percentiles frente a la cartera, solo para contexto. Perfil {profileName(data.products.momentumProfile)}.
            </p>
            <Params
              rows={[
                { label: "Estrella emergente", hint: "nivel menor de", value: formatNumber(data.momentum.risingStarMaxLevel) },
                { label: "y trayectoria", hint: "de al menos", value: formatNumber(data.momentum.risingStarMinTraj) },
              ]}
            />
          </section>
        </div>
      </div>
    </Film>
  );
}
