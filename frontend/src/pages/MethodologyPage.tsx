import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { BandLetter, Category, LeadTime, LeadTimeBlock, Methodology } from "../api/types";
import { ApiError } from "../api/client";
import { useLeadTime, useMeta, useMethodology, useProfiles } from "../api/queries";
import { BandLadder } from "../components/BandLadder";
import { Film } from "../components/Film";
import { IconDown, IconUp } from "../components/Icons";
import { LeadTimeHistogram } from "../components/LeadTimeHistogram";
import { LoadState } from "../components/LoadState";
import { PageHeader } from "../components/PageHeader";
import { PendingFilm } from "../components/PendingFilm";
import { RateLadder } from "../components/RateLadder";
import { ScoreReadout } from "../components/ScoreReadout";
import { TrendChart } from "../components/TrendChart";
import { MONTHS, type Profile, useGlobalParams } from "../hooks/useGlobalParams";
import { useHashScroll } from "../hooks/useHashScroll";
import { useLinkSearch } from "../hooks/useLinkSearch";
import {
  ALERT_LABELS,
  CATEGORY_LABELS,
  EVENT_TYPE_LABELS,
  PROFILE_LABELS,
  TRIGGER_LABELS,
  bandOf,
  formatDscr,
  formatEur,
  formatLead,
  formatNumber,
  formatRate,
  formatScore,
  formatShare,
  formatWeight,
  monthCode,
  monthShort,
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
      <Anticipation />
      <MethodologyFilms />
      <Export />
      <Caveats />
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
      {data.forecast && <ForecastMethod forecast={data.forecast} />}
    </>
  );
}

/** Phase 7 projection (plan B-4). Every number comes from /api/methodology, i.e. scoring.forecast. */
function ForecastMethod({ forecast: f }: { forecast: NonNullable<Methodology["forecast"]> }) {
  return (
    <Film title="Proyección" meta="Parámetros de la configuración actual">
      <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section className="min-w-0">
          <p className="max-w-[62ch] text-[15px] text-ink-muted">
            Cada mes proyectado se acerca a la mediana de la propia entidad: proyección = mediana + ρ × (mes anterior −
            mediana). La mediana usa solo los meses hasta el mes elegido, nunca meses posteriores. Este método ganó al de
            tendencia lineal en la prueba sobre los datos reales: la tendencia lineal es peor que repetir el último valor.
          </p>
          <p className="mt-4 max-w-[62ch] text-[15px] font-semibold">
            La proyección es una señal de orientación, no una medición.
          </p>
        </section>
        <Params
          rows={[
            { label: "Factor de retorno ρ", hint: "1 = sin retorno a la mediana", value: formatNumber(f.meanReversion) },
            { label: "Horizonte máximo", value: `${f.maxHorizonMonths} meses` },
            { label: "Sin proyección", hint: "meses puntuados", value: `menos de ${f.minPoints}` },
            { label: "Fiabilidad baja", hint: "meses puntuados", value: `menos de ${f.minHistoryMonths}` },
            { label: "Fiabilidad limitada", hint: "meses puntuados", value: `menos de ${f.mediumHistoryMonths}` },
            { label: "Histórico suficiente", hint: "meses puntuados", value: `${f.mediumHistoryMonths} o más` },
          ]}
        />
      </div>
    </Film>
  );
}

const PROVISIONAL_TAG = "border border-dashed border-ink-muted/60 px-1.5 text-sm whitespace-nowrap text-ink-muted";

function AlertCatalogue({ data }: { data: Methodology }) {
  const { minCritical, minWarn, confirmMonths, recentMonths } = data.watchlist;
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
          negativos nuevos y confirmados. Una alerta está confirmada cuando sigue activa {confirmMonths} meses seguidos (la misma
          regla que los eventos de deterioro) y es nueva durante {recentMonths} meses. La lista muestra movimientos, no estados:
          una situación que dura más se ve en el estado de la entidad.
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

/** SPEC §8.4 measured anticipation of the active profile, against proxy events. Every number comes from the API. */
function Anticipation() {
  const { profile } = useGlobalParams();
  const { data: meta } = useMeta();
  const { data, error, isPending } = useLeadTime(profile);
  useHashScroll(data !== undefined);
  const pending = (
    <PendingFilm
      title="Anticipación"
      block="bloque 8"
      items={["Anticipación medida (lead time)", "Tasa de falsas alarmas", "Recorte del límite antes del evento", "Casos con más antelación"]}
    />
  );
  if ((meta && !meta.analyticsReady) || (error instanceof ApiError && error.status === 404)) return pending;
  if (error || isPending) return <LoadState error={error} title="Anticipación" />;
  return <AnticipationFilm data={data} />;
}

function AnticipationFilm({ data }: { data: LeadTime }) {
  const { profile } = useGlobalParams();
  const name = PROFILE_LABELS[profile].name;
  return (
    <Film id="anticipacion" title="Anticipación" meta={`Perfil ${name} · eventos proxy · ventana de ${data.windowMonths} meses`}>
      <p className="max-w-[70ch] text-[15px] text-ink-muted">
        Cuántos meses antes de un evento la nota ya avisaba. Medido contra <span className="font-semibold text-ink">eventos proxy</span>:
        los datos no traen etiquetas de impago. La nota detecta bien el deterioro cuando llega: el mismo mes o el anterior.
        Con dos meses de antelación el aviso es útil pero débil. Con tres meses o más, en estos 24 meses de datos, la nota no
        ordena mejor que el azar qué entidades van a entrar en riesgo (docs/DATA_FINDINGS.md, R3). Las cifras son del perfil{" "}
        {name} y cambian con el perfil.
      </p>

      <LeadBlock block={data.deterioration} horizon={data.horizonMonths} className="mt-8" />

      {data.limit && (
        <p className="mt-6 flex flex-wrap items-baseline gap-x-2 border-t border-rule pt-4 text-[15px]">
          <IconDown width={15} height={15} className="shrink-0 translate-y-0.5 text-down" />
          <span>
            <span className="font-semibold">
              El límite se recortó antes del evento en {data.limit.cutAhead} de {data.limit.events} casos
            </span>
            {data.limit.meanLead !== null && <>, {formatLead(data.limit.meanLead)} de media</>}.{" "}
            <span className="text-ink-muted">Recorte = primera reducción o congelación del límite después de su última subida antes del evento.</span>
          </span>
        </p>
      )}

      <LeadBlock block={data.improvement} horizon={data.horizonMonths} className="mt-12 border-t border-ink/20 pt-8" />

      <div className="mt-12 grid gap-x-12 gap-y-10 border-t border-ink/20 pt-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Examples examples={data.examples} />
        <Definitions data={data} />
      </div>
    </Film>
  );
}

/** One direction: headline figures on a hairline grid, the lead histogram and the split by trigger. */
function LeadBlock({ block, horizon, className = "" }: { block: LeadTimeBlock; horizon: number; className?: string }) {
  const down = block.eventType === "DETERIORATION";
  const Icon = down ? IconDown : IconUp;
  const months = (v: number | null) =>
    v === null ? (
      "—"
    ) : (
      <>
        {formatNumber(v)} <span className="text-base font-normal text-ink-muted">{v === 1 ? "mes" : "meses"}</span>
      </>
    );
  return (
    <section className={className}>
      <h3 className="flex items-center gap-2 text-lg font-semibold">
        <Icon width={18} height={18} className={down ? "text-down" : "text-up"} />
        {EVENT_TYPE_LABELS[block.eventType]}
      </h3>
      <dl className="mt-4 grid gap-px border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-3">
        <Figure label="Eventos" title="Entidades con un evento proxy de este tipo" value={block.events} />
        <Figure
          label="Detectados con antelación"
          title="Eventos con una señal al menos un mes antes, sobre el total de eventos"
          value={block.aheadRate === null ? "—" : formatShare(block.aheadRate)}
          sub={`${block.detectedAhead} de ${block.events} · ${block.detected} con señal en la ventana`}
          lead
        />
        <Figure label="Antelación media" title="Media de meses entre la señal y el evento, sobre los detectados" value={months(block.meanLead)} />
        <Figure label="Mediana" title="Mediana de meses entre la señal y el evento, sobre los detectados" value={months(block.medianLead)} />
        <Figure
          label="Tasa de falsas alarmas"
          title={`Señales sin evento en los ${horizon} meses siguientes, sobre las señales evaluables`}
          value={block.falseAlarmRate === null ? "—" : formatShare(block.falseAlarmRate)}
          sub={`${block.evaluable} de ${block.signals} señales evaluables`}
        />
        <Figure
          label="Frente al azar"
          title={`Acierto de la señal dividido por la tasa base: cualquier mes fuera del evento seguido del evento en ${horizon} meses. Por encima de 1, la señal aporta.`}
          value={block.lift === null ? "—" : `×${formatNumber(block.lift)}`}
          sub={`señal ${block.hitRate === null ? "—" : formatShare(block.hitRate)} · base ${block.baseRate === null ? "—" : formatShare(block.baseRate)}`}
        />
      </dl>
      <p className="mt-2 text-sm text-ink-muted">
        Falsa alarma: señal sin evento en los {horizon} meses siguientes; solo se cuentan las evaluables (con {horizon} meses de datos
        después, o ya seguidas de un evento). Frente al azar: el acierto de la señal comparado con la tasa base del mismo evento, así
        la cifra se lee igual con cualquier conjunto de datos.
      </p>

      <div className="mt-8 grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section className="min-w-0">
          <h4 className="mb-3 text-[15px] font-semibold">Meses de antelación</h4>
          <LeadTimeHistogram histogram={block.histogram} median={block.medianLead} />
        </section>
        <section className="min-w-0">
          <h4 className="mb-3 text-[15px] font-semibold">Por disparador</h4>
          <table className="w-full border-collapse text-left text-[15px]">
            <thead>
              <tr className="border-b border-ink/20 text-sm text-ink-muted">
                <th className="py-2 pr-2 font-medium">Disparador</th>
                <th className="px-2 py-2 text-right font-medium">Eventos</th>
                <th className="py-2 pl-2 text-right font-medium" title="Con una señal al menos un mes antes del evento">
                  Con antelación
                </th>
              </tr>
            </thead>
            <tbody>
              {block.byTrigger.map((t) => (
                <tr key={t.trigger} className="border-b border-rule last:border-b-0">
                  <td className="py-2 pr-2">
                    <span className="flex flex-wrap items-baseline gap-2">
                      {TRIGGER_LABELS[t.trigger]}
                      {t.trigger === "OVERDUE" && (
                        <span className={PROVISIONAL_TAG} title="Depende de dos umbrales pendientes de revisión">
                          umbral provisional
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right">{t.events}</td>
                  <td className="py-2 pl-2 text-right font-semibold">
                    {t.detectedAhead}
                    {t.events > 0 && <span className="ml-2 font-normal text-ink-muted">{formatShare(t.detectedAhead / t.events)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </section>
  );
}

/** A headline figure cell. `lead` marks the headline number of the block (detected ahead). */
function Figure({ label, value, sub, title, lead = false }: { label: string; value: ReactNode; sub?: string; title: string; lead?: boolean }) {
  return (
    <div className="bg-film px-4 py-3" title={title}>
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className={`mt-1 font-semibold [font-stretch:85%] ${lead ? "text-5xl leading-none" : "text-3xl leading-9"}`}>{value}</dd>
      {sub && <dd className="mt-1 text-sm text-ink-muted">{sub}</dd>}
    </div>
  );
}

function Examples({ examples }: { examples: LeadTime["examples"] }) {
  const linkSearch = useLinkSearch();
  return (
    <section className="min-w-0">
      <h3 className="text-lg font-semibold">Casos con más antelación</h3>
      {examples.length === 0 ? (
        <p className="mt-3 text-ink-muted">Ningún evento detectado con antelación.</p>
      ) : (
        <ul className="-mx-5 mt-3">
          {examples.map((e) => {
            const down = e.eventType === "DETERIORATION";
            const Icon = down ? IconDown : IconUp;
            return (
              <li key={`${e.entityId}-${e.eventType}`} className="group border-b border-rule last:border-b-0 hover:bg-scan-soft/40">
                <Link to={`/entity/${e.entityId}${linkSearch}#anticipacion`} className="flex items-center justify-between gap-4 px-5 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold underline-offset-4 group-hover:underline">{e.entityName}</span>
                    <span className="flex items-center gap-1.5 text-sm text-ink-muted">
                      <Icon width={13} height={13} className={down ? "text-down" : "text-up"} />
                      {/* The data can name an entity by its id: do not print it twice. */}
                      {e.entityName === e.entityId ? "" : `${e.entityId} · `}
                      {TRIGGER_LABELS[e.trigger]} · evento en {monthShort(e.eventMonth)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-2xl leading-7 font-semibold [font-stretch:85%]">{formatLead(e.leadMonths)}</span>
                    <span className="text-sm text-ink-muted">
                      {e.limitLeadMonths === null ? "antes" : `límite: ${formatLead(e.limitLeadMonths)}`}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Plain-language definitions with the window, horizon and history that the API sent. No threshold is written here. */
function Definitions({ data }: { data: LeadTime }) {
  const items: { term: string; text: ReactNode }[] = [
    {
      term: "Evento proxy",
      text: (
        <>
          No hay etiqueta de impago, así que un evento es la primera vez que una entidad entra en una situación de riesgo que se ve en
          los datos: <span className="text-ink">caja</span> para muy pocos meses de forma sostenida, <span className="text-ink">DSCR</span>{" "}
          insuficiente para cubrir la deuda de forma sostenida, <span className="text-ink">impagos</span> altos a la vez en cobros y
          pagos, o una <span className="text-ink">nota</span> muy baja. Una mejora es un <span className="text-ink">cruce de nivel</span>{" "}
          hacia una zona sana tras un periodo débil, sostenido los mismos meses que se exigen a la caja y al DSCR: la misma prueba en las
          dos direcciones. Los umbrales están en la configuración.
        </>
      ),
    },
    {
      term: "Señal",
      text: "La nota avisa: estado «empieza a torcerse» o «deterioro», o trayectoria muy baja (en mejora: estado «mejorando», mejora estructural o trayectoria muy alta).",
    },
    {
      term: "Antelación",
      text: `Meses entre el inicio de la señal que llega al evento y el evento, dentro de los ${data.windowMonths} meses anteriores. Una señal que se apagó antes del evento no cuenta: era otro episodio. Detectado con antelación = al menos un mes antes.`,
    },
    {
      term: "Historia mínima",
      text: `Solo cuentan eventos con ${data.minHistoryMonths} meses puntuados antes. Una entidad que ya empieza en riesgo no tiene evento.`,
    },
    {
      term: "Impagos",
      text: "Este disparador depende de dos umbrales todavía pendientes de revisión: trátalo como provisional.",
    },
  ];
  return (
    <section className="min-w-0">
      <h3 className="text-lg font-semibold">Cómo se mide</h3>
      <dl className="mt-3 grid gap-3 text-[15px]">
        {items.map((i) => (
          <div key={i.term} className="border-t border-dashed border-rule pt-2 first:border-t-0 first:pt-0">
            <dt className="font-semibold">{i.term}</dt>
            <dd className="max-w-[70ch] text-ink-muted">{i.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** SPEC §12.7 item 5: the submission file, straight from the backend. */
function Export() {
  const { profile, month } = useGlobalParams();
  const { data: meta } = useMeta();
  const last = meta?.months.at(-1) ?? MONTHS[MONTHS.length - 1];
  const files = [
    {
      format: "entity",
      label: "Por entidad",
      text: `Una fila por entidad con la nota de ${monthShort(last)} (${monthCode(last)}).`,
    },
    { format: "entity-month", label: "Por entidad y mes", text: "Una fila por entidad y mes, con toda la serie." },
  ];
  return (
    <Film title="Exportar" meta={`Perfil ${PROFILE_LABELS[profile].name} · CSV`}>
      <ul className="-mx-5">
        {files.map((f) => (
          <li key={f.format} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-rule px-5 py-3 last:border-b-0">
            <span>
              <span className="block font-semibold">{f.label}</span>
              <span className="text-[15px] text-ink-muted">{f.text}</span>
            </span>
            <a
              href={`/api/export/submission?profile=${profile}&format=${f.format}`}
              download
              className="border border-ink px-3 py-2 text-[15px] font-semibold transition-colors hover:bg-ink hover:text-film"
            >
              Descargar CSV
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-ink-muted">
        El formato definitivo del test oculto se confirma el domingo. El mes de la vista ({monthCode(month)}) no cambia el archivo.
      </p>
    </Film>
  );
}
