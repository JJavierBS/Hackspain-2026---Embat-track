import { type FormEvent, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import type {
  Alert,
  BandLetter,
  Category,
  CategoryScore,
  Change,
  Driver,
  EntityDetail,
  EntityEvent,
  IndicatorRow,
  LimitAction,
  LimitDecision,
  LimitSimulation,
  MomentumView,
  PortfolioRow,
  PremiumQuote,
} from "../api/types";
import { ApiError, isServerDown } from "../api/client";
import { useEntity, useMeta, useMethodology, useSimulateLimit } from "../api/queries";
import { AlertList } from "../components/AlertList";
import { LimitHistoryChart } from "../components/LimitHistoryChart";
import { PremiumHistoryChart } from "../components/PremiumHistoryChart";
import { RateLadder } from "../components/RateLadder";
import { Delta } from "../components/Delta";
import { Film } from "../components/Film";
import { IconDown, IconFlat, IconStar, IconUp } from "../components/Icons";
import { LoadState } from "../components/LoadState";
import { Meter } from "../components/Meter";
import { PageHeader } from "../components/PageHeader";
import { PendingFilm } from "../components/PendingFilm";
import { ScoreReadout } from "../components/ScoreReadout";
import { StatusTag, TrendTag } from "../components/StatusTag";
import { ForecastControls } from "../components/ForecastControls";
import { TrendChart } from "../components/TrendChart";
import { MONTHS, useGlobalParams } from "../hooks/useGlobalParams";
import { useHashScroll } from "../hooks/useHashScroll";
import { useHorizon } from "../hooks/useHorizon";
import { useLinkSearch } from "../hooks/useLinkSearch";
import {
  ALERT_LABELS,
  BINDING_LABELS,
  CATEGORY_LABELS,
  EVENT_MARK_LABELS,
  EVENT_TYPE_LABELS,
  LIMIT_ACTION_LABELS,
  PROFILE_LABELS,
  REGIME_LABELS,
  TRIGGER_LABELS,
  bandOf,
  confidenceLabel,
  formatDelta,
  formatDscr,
  formatEur,
  formatIndicatorValue,
  formatLead,
  formatNumber,
  formatRate,
  formatScore,
  formatWeight,
  indicatorLabel,
  isPendingAnchor,
  monthCode,
  monthShort,
} from "../lib/format";

export function EntityPage() {
  const { id = "" } = useParams();
  const { profile, month } = useGlobalParams();
  const { horizon, setHorizon } = useHorizon();
  const { data, error, isPending } = useEntity(id, profile, month, horizon);
  const linkSearch = useLinkSearch();
  useHashScroll(data !== undefined);

  if (error || isPending) {
    return (
      <div className="grid gap-12">
        <PageHeader title={<>Entidad {id}</>} lede="La radiografía de una entidad: su nivel, hacia dónde va y qué movió el número." />
        <LoadState error={error} />
        <Link to={`/${linkSearch}`} className="font-semibold text-band-a underline underline-offset-4">
          Volver a la cartera
        </Link>
      </div>
    );
  }

  const { row } = data;
  const m = MONTHS.indexOf(month);
  const against = monthCode(MONTHS[Math.max(0, m - 3)]);
  const typeLabel = data.entityType === "GROUP" ? "Grupo" : "Empresa";
  const groupLink = data.groupId ? (
    <>
      {" · "}
      <Link to={`/entity/${data.groupId}${linkSearch}`} className="underline underline-offset-4 hover:text-ink">
        grupo {data.groupId}
      </Link>
    </>
  ) : null;

  if (row === null) {
    return (
      <div className="grid gap-12">
        <PageHeader
          title={data.name}
          lede={
            <>
              {typeLabel} {data.id}
              {groupLink}.
            </>
          }
        />
        <Film title="Sin puntuación" meta={monthCode(month)}>
          <p className="max-w-[62ch] text-ink-muted">
            Esta entidad no tiene actividad suficiente en {monthCode(month)} para puntuarla. Elige un mes posterior en la tira de
            meses.
          </p>
        </Film>
        <Indicators indicators={data.indicators} />
      </div>
    );
  }

  const finalChanges = data.changepoints.filter((c) => c.series === "FINAL");
  const lastChange = finalChanges.at(-1);

  return (
    <div className="grid gap-12">
      <PageHeader
        title={data.name}
        lede={
          <>
            {typeLabel} {data.id}
            {groupLink}
            {row.confidence !== null && ` · confianza ${confidenceLabel(row.confidence).toLowerCase()}`}.
          </>
        }
      />

      <Film
        title="Radiografía"
        meta={`Perfil activo · ${monthCode(month)}${lastChange ? ` · cambio detectado en ${monthCode(lastChange.month)}` : ""}`}
      >
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="grid content-start gap-7">
            <ScoreReadout score={row.final} delta={row.delta3m} against={`vs ${against}`} />
            <div className="flex flex-wrap items-center gap-2">
              <StatusTag status={row.status} />
              <TrendTag traj={row.traj} />
              {row.regime !== null && row.regime !== "STABLE" && (
                <span className="border border-rule px-2 py-0.5 text-sm">{REGIME_LABELS[row.regime]}</span>
              )}
              {row.confidence !== null && (
                <span className="border border-rule px-2 py-0.5 text-sm text-ink-muted">
                  Confianza {confidenceLabel(row.confidence).toLowerCase()}
                </span>
              )}
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Meter label="Nivel" value={row.level} hint="Salud actual" />
              <Meter
                label="Trayectoria"
                value={row.traj}
                hint={row.traj === null ? "Hace falta más historia" : "50 = estable · más de 50 mejora"}
                direction
              />
            </div>
          </div>
          <div>
            <TrendChart
              data={data.timeline
                .filter((p) => p.final !== null)
                .map((p) => ({ month: p.month, final: p.final, level: p.level, trajectory: p.traj }))}
              activeMonth={month}
              height={300}
              markers={data.alerts.map((a) => ({ month: a.month, direction: a.direction, label: ALERT_LABELS[a.code] }))}
              events={data.events.map((e) => ({
                month: e.eventMonth,
                direction: e.eventType === "DETERIORATION" ? "NEGATIVE" : "POSITIVE",
                label: `${EVENT_MARK_LABELS[e.eventType]}: ${TRIGGER_LABELS[e.trigger].toLowerCase()}`,
              }))}
              projection={data.forecast?.points ?? []}
            />
            {data.forecast && <ForecastControls forecast={data.forecast} horizon={horizon} onHorizon={setHorizon} />}
          </div>
        </div>
      </Film>

      <Anticipation events={data.events} />

      <EntityAlerts alerts={data.alerts} />

      <div className="grid gap-12 lg:grid-cols-2">
        <Drivers categories={data.categories} drivers={data.drivers} final={row.final} />
        <Changes changes={data.changes3m} against={against} />
      </div>

      <Categories categories={data.categories} />
      <Indicators indicators={data.indicators} />
      {data.companies.length > 0 && <Companies companies={data.companies} />}
      <ProductPanel data={data} />
    </div>
  );
}

/**
 * How early the score saw each lead-time event of this entity (SPEC §8.4), up to the selected month (decision G8).
 * The events are proxies: the data has no default label.
 */
function Anticipation({ events }: { events: EntityEvent[] }) {
  const { profile, month } = useGlobalParams();
  const { data: meta } = useMeta();
  const linkSearch = useLinkSearch();
  if (meta && !meta.analyticsReady) {
    return (
      <PendingFilm
        title="Anticipación"
        block="bloque 8"
        items={["Eventos de deterioro y de mejora", "Meses de antelación de la señal", "Recorte del límite antes del evento", "Marca del evento en la línea temporal"]}
      />
    );
  }
  if (events.length === 0) return null;
  const provisional = events.some((e) => e.trigger === "OVERDUE");
  return (
    <Film id="anticipacion" title="Anticipación" meta={`Perfil ${PROFILE_LABELS[profile].name} · eventos hasta ${monthCode(month)}`}>
      <ul className="-mx-5 -mt-2">
        {events.map((e) => (
          <EventRow key={`${e.eventType}-${e.eventMonth}`} event={e} />
        ))}
      </ul>
      <p className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-ink-muted">
        <span>
          Eventos indirectos (proxy): no hay etiqueta de impago en los datos.{" "}
          <Link to={`/methodology${linkSearch}#anticipacion`} className="underline underline-offset-4 hover:text-ink">
            Definición en Metodología
          </Link>
          .
        </span>
        {provisional && (
          <span title="El disparador de impagos usa dos umbrales pendientes de revisión" className="border border-dashed border-ink-muted/60 px-1.5 whitespace-nowrap">
            impagos: umbral provisional
          </span>
        )}
      </p>
    </Film>
  );
}

/** One event: what happened and when, a caliper strip from the first signal to the event, and the lead, big. */
function EventRow({ event: e }: { event: EntityEvent }) {
  const down = e.eventType === "DETERIORATION";
  const Icon = down ? IconDown : IconUp;
  const lead = e.leadMonths;
  return (
    <li className="grid items-center gap-x-10 gap-y-5 border-b border-rule px-5 py-6 last:border-b-0 md:grid-cols-[minmax(0,4fr)_minmax(0,5fr)_minmax(0,3fr)]">
      <div className="grid gap-2">
        <p className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 border border-rule px-2 py-0.5 text-sm font-medium">
            <Icon width={14} height={14} className={down ? "text-down" : "text-up"} />
            {EVENT_TYPE_LABELS[e.eventType]}
          </span>
          <span className="text-lg font-semibold">{TRIGGER_LABELS[e.trigger]}</span>
          {e.trigger === "OVERDUE" && (
            <span title="Umbrales pendientes de revisión" className="border border-dashed border-ink-muted/60 px-1.5 text-sm whitespace-nowrap text-ink-muted">
              umbral provisional
            </span>
          )}
        </p>
        <p className="text-[15px] text-ink-muted">
          Evento en <span className="font-semibold text-ink">{monthShort(e.eventMonth)}</span> · {monthCode(e.eventMonth)}
          <br />
          {e.signalMonth === null ? (
            "La nota no avisaba al llegar el evento"
          ) : (
            <>
              Señal desde <span className="font-semibold text-ink">{monthShort(e.signalMonth)}</span> · {monthCode(e.signalMonth)}
            </>
          )}
        </p>
      </div>
      <Caliper event={e} />
      <div className="grid gap-1 md:justify-items-end md:text-right">
        {lead === null ? (
          <p className="text-lg font-semibold text-ink-muted">no detectado antes del evento</p>
        ) : lead === 0 ? (
          <p className="text-2xl font-semibold [font-stretch:88%]">detectado el mismo mes</p>
        ) : (
          <p className="flex items-baseline gap-2 md:justify-end" title="Meses entre el inicio de la señal que llega al evento y el evento">
            <span className="text-[15px]">detectado</span>
            <span className="text-6xl leading-none font-semibold [font-stretch:80%]">{lead}</span>
            <span className="text-[15px]">{lead === 1 ? "mes antes" : "meses antes"}</span>
          </p>
        )}
        {e.limitLeadMonths !== null && (
          <a href="#limite" className="text-[15px] font-semibold text-down underline decoration-down/50 underline-offset-4 hover:decoration-down">
            {e.limitLeadMonths === 0 ? "el límite se recortó el mismo mes" : `el límite se recortó ${formatLead(e.limitLeadMonths)} antes`}
          </a>
        )}
      </div>
    </li>
  );
}

/** Months shown at least on a caliper strip, so a short lead still reads as a span. */
const CALIPER_MIN_MONTHS = 7;

/**
 * A strip of months with the limit cut (red triangle), the first signal (ink square) and the event (dashed line).
 * An ink caliper spans signal → event: its length is the lead.
 */
function Caliper({ event: e }: { event: EntityEvent }) {
  const at = (m: string | null) => (m === null ? null : MONTHS.indexOf(m));
  const ev = at(e.eventMonth)!;
  const sig = at(e.signalMonth);
  const cut = at(e.limitSignalMonth);
  const earliest = Math.min(ev, sig ?? ev, cut ?? ev);
  let first = Math.max(0, earliest - 1);
  const last = Math.min(MONTHS.length - 1, ev + 1);
  first = Math.max(0, Math.min(first, last - CALIPER_MIN_MONTHS + 1));
  const span = last - first + 1;
  const x = (i: number) => `${((i - first + 0.5) / span) * 100}%`;
  const color = e.eventType === "DETERIORATION" ? "var(--color-down)" : "var(--color-up)";
  const months = Array.from({ length: span }, (_, k) => first + k);
  const described = [
    cut !== null && `recorte del límite en ${monthCode(MONTHS[cut])}`,
    sig !== null && `señal en ${monthCode(MONTHS[sig])}`,
    `evento en ${monthCode(e.eventMonth)}`,
  ].filter(Boolean);
  return (
    <div role="img" aria-label={described.join(", ")} className="min-w-0">
      <div className="relative h-14">
        {/* Month ticks on the track. */}
        <span aria-hidden className="absolute inset-x-0 top-9 h-px bg-ink/30" />
        {months.map((i) => (
          <span key={i} aria-hidden className="absolute top-[33px] h-2 w-px -translate-x-1/2 bg-ink/30" style={{ left: x(i) }} />
        ))}
        {sig !== null && sig < ev && (
          <span
            aria-hidden
            className="absolute top-2 h-3 border-x-2 border-t-2 border-ink"
            style={{ left: x(sig), width: `${((ev - sig) / span) * 100}%` }}
          />
        )}
        <span aria-hidden className="absolute top-0 bottom-0 w-0 -translate-x-1/2 border-l-[1.5px] border-dashed" style={{ left: x(ev), borderColor: color }} />
        {cut !== null && (
          <svg aria-hidden width="12" height="10" className="absolute top-[21px] -translate-x-1/2" style={{ left: x(cut) }}>
            <path d="M0 0h12L6 9.6z" fill="var(--color-down)" />
          </svg>
        )}
        {sig !== null && <span aria-hidden className="absolute top-[32px] h-2.5 w-2.5 -translate-x-1/2 bg-ink" style={{ left: x(sig) }} />}
      </div>
      <div className="mt-1 flex justify-between text-sm text-ink-muted">
        <span>{monthShort(MONTHS[first])}</span>
        <span>{monthShort(MONTHS[last])}</span>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
        {cut !== null && (
          <li className="flex items-center gap-1.5">
            <svg aria-hidden width="10" height="9">
              <path d="M0 0h10L5 8z" fill="var(--color-down)" />
            </svg>
            Recorte {monthCode(MONTHS[cut])}
          </li>
        )}
        {sig !== null && (
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 bg-ink" />
            Señal {monthCode(MONTHS[sig])}
          </li>
        )}
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-0 border-l-[1.5px] border-dashed" style={{ borderColor: color }} />
          Evento {monthCode(e.eventMonth)}
        </li>
      </ul>
    </div>
  );
}

/** This entity's alerts in the active profile, newest first (at most 20, up to the selected month). */
function EntityAlerts({ alerts }: { alerts: Alert[] }) {
  const { profile, month } = useGlobalParams();
  const { data: meta } = useMeta();
  if (meta && !meta.alertsReady) {
    return (
      <PendingFilm
        title="Alertas"
        block="bloque 6"
        items={["Alertas de la entidad, negativas y positivas", "Marcas en la línea temporal", "Acciones sobre el límite"]}
      />
    );
  }
  return (
    <Film title="Alertas" meta={`Perfil ${PROFILE_LABELS[profile].name} · hasta ${monthCode(month)}`}>
      {alerts.length === 0 ? (
        <p className="text-ink-muted">Sin alertas hasta {monthCode(month)}.</p>
      ) : (
        <AlertList alerts={alerts} showMonth />
      )}
    </Film>
  );
}

/** Categories that move this profile's score this month (renormalized weight above 0). */
function weighted(categories: CategoryScore[]) {
  return categories.filter((c) => c.effectiveWeight > 0);
}

function Drivers({ categories, drivers, final }: { categories: CategoryScore[]; drivers: Driver[]; final: number }) {
  const rows = weighted(categories).sort((a, b) => b.contribution - a.contribution);
  if (rows.length === 0) {
    return (
      <PendingFilm
        title="Por qué esta puntuación"
        block="bloque 5"
        items={["Puntos que aporta cada categoría", "Indicadores que más suben la nota", "Indicadores que más la bajan"]}
      />
    );
  }
  const max = Math.max(...rows.map((c) => Math.abs(c.contribution)), 1);
  const sum = rows.reduce((a, c) => a + c.contribution, 0);
  const up = drivers.filter((d) => d.contrib > 0);
  const down = drivers.filter((d) => d.contrib < 0).reverse();
  return (
    <Film title="Por qué esta puntuación" meta="Puntos que aporta cada categoría">
      <ul className="grid gap-2.5">
        {rows.map((c) => {
          const pct = (Math.abs(c.contribution) / max) * 50;
          const positive = c.contribution >= 0;
          return (
            <li key={c.category} className="grid grid-cols-[minmax(0,11rem)_1fr_4rem] items-center gap-3 text-[15px]">
              <span className="truncate" title={`${CATEGORY_LABELS[c.category]} · peso ${formatWeight(c.weight)}`}>
                {CATEGORY_LABELS[c.category]}
              </span>
              <span className="relative h-5">
                <span aria-hidden className="absolute inset-y-[-3px] left-1/2 w-px bg-ink/50" />
                <span
                  className={`absolute inset-y-0 ${positive ? "bg-up/80" : "bg-down/80"}`}
                  style={positive ? { left: "50%", width: `${pct}%` } : { right: "50%", width: `${pct}%` }}
                />
              </span>
              <span className={`text-right font-semibold ${positive ? "text-up" : "text-down"}`}>{formatDelta(c.contribution)}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-5 border-t border-rule pt-3 text-[15px] text-ink-muted">
        50 + suma de aportaciones ({formatDelta(sum)})
        {Math.abs(final - 50 - sum) >= 0.05 && <> + redondeo ({formatDelta(final - 50 - sum)})</>} ={" "}
        <span className="font-semibold text-ink">{formatScore(final)}</span>
      </p>
      {drivers.length > 0 && (
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <DriverList title="Suben la nota" drivers={up} />
          <DriverList title="Bajan la nota" drivers={down} />
        </div>
      )}
    </Film>
  );
}

/** The indicators with the largest contribution of one sign (SPEC §7.5, top 5 each way). */
function DriverList({ title, drivers }: { title: string; drivers: Driver[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {drivers.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">Ninguno este mes.</p>
      ) : (
        <ul className="mt-2 grid gap-1.5">
          {drivers.map((d) => (
            <li key={d.driverId} className="flex items-baseline justify-between gap-3 border-t border-rule pt-1.5 text-[15px]">
              <span className="min-w-0 truncate" title={CATEGORY_LABELS[d.category]}>
                {indicatorLabel(d.driverId)}
              </span>
              <span className={`shrink-0 font-semibold ${d.contrib > 0 ? "text-up" : "text-down"}`}>{formatDelta(d.contrib)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Changes({ changes, against }: { changes: Change[]; against: string }) {
  return (
    <Film title="Qué cambió" meta={`Frente a ${against}`}>
      {changes.length === 0 ? (
        <p className="text-ink-muted">
          Ningún indicador movió la nota más de 0,1 puntos, o las explicaciones no están calculadas todavía.
        </p>
      ) : (
        <ul className="grid gap-4">
          {changes.map((c) => (
            <li key={c.driverId} className="flex items-start justify-between gap-4 border-b border-dashed border-rule pb-3 last:border-b-0">
              <span className="min-w-0">
                <span className="block font-semibold">{indicatorLabel(c.driverId)}</span>
                <span className="text-[15px] text-ink-muted">{c.narrative}</span>
              </span>
              <Delta value={c.delta} className="text-lg" />
            </li>
          ))}
        </ul>
      )}
    </Film>
  );
}

function Categories({ categories }: { categories: CategoryScore[] }) {
  return (
    <Film title="Categorías" meta="Nivel 0–100 · peso en el perfil activo">
      <ul className="grid gap-x-10 gap-y-4 md:grid-cols-2">
        {categories.map((c) => {
          const band = bandOf(c.level ?? 0);
          // A category that does not move the score this month: zero weight in this profile, or no data yet.
          const idle = c.weight === 0 || c.level === null;
          return (
            <li key={c.category} className={idle ? "opacity-55" : ""}>
              <div className="flex items-baseline justify-between gap-3 text-[15px]">
                <span className="font-medium">{CATEGORY_LABELS[c.category]}</span>
                <span className="flex items-baseline gap-3">
                  <span className="text-sm text-ink-muted">peso {formatWeight(c.weight)}</span>
                  <span
                    className="min-w-[3ch] text-right text-lg font-semibold"
                    style={{ color: c.level === null ? "var(--color-ink-muted)" : band.color }}
                  >
                    {c.level === null ? "—" : formatScore(c.level)}
                  </span>
                </span>
              </div>
              <div className="mt-1.5 h-2 bg-panel-grid">
                <div className="h-full" style={{ width: `${c.level ?? 0}%`, background: band.color }} />
              </div>
            </li>
          );
        })}
      </ul>
    </Film>
  );
}

/** Category order of the labels table, so the indicator groups read like the category film. */
const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as Category[];

function Indicators({ indicators }: { indicators: IndicatorRow[] }) {
  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    rows: indicators.filter((i) => i.category === category),
  })).filter((g) => g.rows.length > 0);
  const available = indicators.filter((i) => i.available).length;
  return (
    <Film title="Indicadores" meta={`${available} de ${indicators.length} con datos · nivel 0–100 · trayectoria, 50 = estable`}>
      {indicators.length === 0 ? (
        <p className="text-ink-muted">Sin indicadores para este mes.</p>
      ) : (
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-[15px]">
            <thead>
              <tr className="border-b border-ink/20 text-sm text-ink-muted">
                <th className="px-5 py-2 font-medium">Indicador</th>
                <th className="px-2 py-2 text-right font-medium" title="Valor medido, en su propia unidad">
                  Valor
                </th>
                <th className="px-2 py-2 text-right font-medium" title="Salud 0–100 según los umbrales del indicador">
                  Nivel
                </th>
                <th className="px-2 py-2 text-right font-medium" title="Hacia dónde va: 50 = estable, más de 50 mejora">
                  Trayectoria
                </th>
                <th className="px-5 py-2 font-medium">Notas</th>
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.category}>
                <tr>
                  <th colSpan={5} scope="colgroup" className="px-5 pt-5 pb-1.5 text-sm font-semibold">
                    {CATEGORY_LABELS[g.category]}
                  </th>
                </tr>
                {g.rows.map((i) => (
                  <IndicatorLine key={i.indicatorId} row={i} />
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </Film>
  );
}

function IndicatorLine({ row: i }: { row: IndicatorRow }) {
  const notes: { text: string; title: string; pending: boolean }[] = [];
  if (i.isStatic) notes.push({ text: "foto 2026-09-01", title: "Deuda dispuesta y concedida: una sola foto, no una serie mensual", pending: false });
  if (i.fallback) notes.push({ text: "cálculo alternativo", title: "Faltan datos para el cálculo principal", pending: false });
  if (isPendingAnchor(i.anchorStatus)) notes.push({ text: "umbral provisional", title: "Umbrales pendientes de revisión", pending: true });
  return (
    <tr className={`border-t border-rule ${i.available ? "" : "text-ink-muted"}`}>
      <td className="px-5 py-2 font-medium">{indicatorLabel(i.indicatorId)}</td>
      <td className="px-2 py-2 text-right whitespace-nowrap">{i.available ? formatIndicatorValue(i.indicatorId, i.value) : "sin datos"}</td>
      <td className="px-2 py-2 text-right">
        {i.level === null || !i.available ? (
          "—"
        ) : (
          <span className="font-semibold" style={{ color: bandOf(i.level).color }}>
            {formatScore(i.level)}
          </span>
        )}
      </td>
      <td className="px-2 py-2 text-right">{i.traj === null || !i.available ? "—" : <TrajFigure traj={i.traj} />}</td>
      <td className="px-5 py-2">
        <span className="flex flex-wrap gap-1.5">
          {notes.map((n) => (
            <span
              key={n.text}
              title={n.title}
              className={`border px-1.5 text-sm whitespace-nowrap text-ink-muted ${n.pending ? "border-dashed border-ink-muted/60" : "border-rule"}`}
            >
              {n.text}
            </span>
          ))}
        </span>
      </td>
    </tr>
  );
}

/** A trajectory figure read as direction: green or red with its arrow, outside the ±5 dead zone around 50. */
function TrajFigure({ traj }: { traj: number }) {
  const dir = traj >= 55 ? "up" : traj <= 45 ? "down" : "flat";
  const Icon = dir === "up" ? IconUp : dir === "down" ? IconDown : IconFlat;
  const color = dir === "up" ? "text-up" : dir === "down" ? "text-down" : "text-ink-muted";
  return (
    <span className={`inline-flex items-center justify-end gap-1 font-semibold ${color}`}>
      <Icon width={14} height={14} />
      {formatScore(traj)}
    </span>
  );
}

function Companies({ companies }: { companies: PortfolioRow[] }) {
  const linkSearch = useLinkSearch();
  return (
    <Film title="Empresas del grupo" meta={`${companies.length} empresas · cada una puntuada por separado`}>
      <ul className="-mx-5">
        {companies.map((c) => {
          const band = bandOf(c.final);
          return (
            <li key={c.id} className="group flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-rule px-5 py-3 last:border-b-0 hover:bg-scan-soft/40">
              <Link to={`/entity/${c.id}${linkSearch}`} className="font-semibold underline-offset-4 group-hover:underline">
                {c.id}
              </Link>
              <span className="flex items-center gap-4">
                <StatusTag status={c.status} />
                <Delta value={c.delta3m} />
                <span className="flex items-center gap-2">
                  <span className="text-2xl font-semibold [font-stretch:85%]" style={{ color: band.color }}>
                    {formatScore(c.final)}
                  </span>
                  <span className="inline-flex h-6 w-6 items-center justify-center text-sm font-bold text-white" style={{ background: band.color }}>
                    {band.band}
                  </span>
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </Film>
  );
}

function Stat({
  label,
  value,
  sub,
  title,
  big = false,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /** The definition of the figure (SPEC §12.7: every number explains itself). */
  title?: string;
  big?: boolean;
}) {
  return (
    <div className="bg-film px-4 py-3" title={title}>
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className={`mt-1 font-semibold ${big ? "text-3xl leading-9 [font-stretch:85%]" : "text-2xl [font-stretch:88%]"}`}>{value}</dd>
      {sub && <dd className="mt-0.5 text-sm text-ink-muted">{sub}</dd>}
    </div>
  );
}

const CUT_ACTIONS: LimitAction[] = ["REDUCE", "FREEZE", "DECLINE"];

function actionTone(action: LimitAction): string {
  return action === "INCREASE" ? "text-up" : CUT_ACTIONS.includes(action) ? "text-down" : "text-ink";
}

function ProductPanel({ data }: { data: EntityDetail }) {
  const { profile } = useGlobalParams();

  if (profile === "BANK") {
    if (data.limit === null) {
      return (
        <PendingFilm
          title="Límite de circulante"
          block="bloque 7"
          items={["Límite recomendado", "Acción del mes", "Precio por banda", "Historia del límite", "Simulador de solicitudes"]}
        />
      );
    }
    return <BankPanel data={data} limit={data.limit} />;
  }

  if (profile === "INSURER") {
    if (data.premium === null)
      return <ProductPending title="Prima de seguro de crédito" items={["Tasa de prima", "Límite por comprador", "Tarifa por banda", "Historia de la prima"]} />;
    return <InsurerPanel data={data} premium={data.premium} />;
  }

  if (data.momentum === null)
    return <ProductPending title="Momentum" items={["Posición en el ranking", "Percentil de trayectoria", "Percentil de crecimiento", "Estrella emergente"]} />;
  return <FundPanel momentum={data.momentum} />;
}

/**
 * A product with no row this month. When the backend has products (meta.productsReady), the reason is the data;
 * otherwise the backend predates block 7 and the film is still unexposed.
 */
function ProductPending({ title, items }: { title: string; items: string[] }) {
  const { month } = useGlobalParams();
  const { data: meta } = useMeta();
  if (meta?.productsReady) {
    return (
      <Film title={title} meta={monthCode(month)}>
        <p className="max-w-[62ch] text-ink-muted">
          Sin datos suficientes este mes. El producto necesita una nota y tres meses de cobros en {monthCode(month)}; prueba un mes
          posterior en la tira de meses.
        </p>
      </Film>
    );
  }
  return <PendingFilm title={title} block="bloque 7" items={items} />;
}

/** INSURER: a premium that moves with the score every month (SPEC §10.2), priced on the band ladder. */
function InsurerPanel({ data, premium }: { data: EntityDetail; premium: PremiumQuote }) {
  const { month } = useGlobalParams();
  const { data: methodology } = useMethodology();
  const insurer = methodology?.insurer;
  const tariff: Partial<Record<BandLetter, string>> = {};
  if (insurer)
    for (const [band, mult] of Object.entries(insurer.multiplierByBand) as [BandLetter, number][])
      tariff[band] = formatRate(insurer.basePremiumRate * mult);
  const bandColor = bandOf(premium.final).color;
  const TierIcon = premium.tierChange === "UP" ? IconUp : premium.tierChange === "DOWN" ? IconDown : null;
  return (
    <Film title="Prima de seguro de crédito" meta={`Perfil Aseguradora · prima revisada cada mes · ${monthCode(premium.month)}`}>
      <dl className="grid gap-px border border-rule bg-rule sm:grid-cols-3">
        <Stat
          big
          label="Tasa de prima"
          title="Prima anual sobre el importe asegurado: prima base × multiplicador de la banda"
          value={premium.premiumRate === null ? "No asegurable" : formatRate(premium.premiumRate)}
          sub={
            premium.previousBand === null
              ? "Primera cotización"
              : premium.previousPremiumRate === null
                ? "Mes anterior: no asegurable"
                : `Mes anterior ${formatRate(premium.previousPremiumRate)}`
          }
        />
        <Stat
          label="Límite por comprador"
          title="Exposición recomendada frente a esta entidad como compradora"
          value={premium.recommendedBuyerLimitEur === null ? "—" : formatEur(premium.recommendedBuyerLimitEur)}
          sub="Aproximación a la exposición (compras medias × DPO)"
        />
        <Stat
          label="Tramo"
          title="El tramo de prima es la banda de la nota en el perfil Aseguradora"
          value={
            <span className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center text-lg font-bold text-white" style={{ background: bandColor }}>
                {premium.band}
              </span>
              <span className="text-2xl" style={{ color: bandColor }}>
                {formatScore(premium.final)}
              </span>
            </span>
          }
          sub={
            premium.tierChange === null ? (
              premium.previousBand === null ? (
                "Sin mes anterior"
              ) : (
                "Sin cambio de tramo"
              )
            ) : (
              <span className={`inline-flex items-center gap-1 font-medium ${premium.tierChange === "UP" ? "text-up" : "text-down"}`}>
                {TierIcon && <TierIcon width={14} height={14} />}
                {premium.tierChange === "UP" ? "Mejora de tramo" : "Empeora de tramo"} (desde {premium.previousBand})
              </span>
            )
          }
        />
      </dl>

      <section className="mt-8">
        <h3 className="mb-3 text-[15px] font-semibold">Tarifa por banda</h3>
        {insurer ? (
          <RateLadder label="Tasa de prima por banda" values={tariff} missing="no asegurable" active={premium.band} />
        ) : (
          <p className="text-ink-muted">Cargando la tarifa…</p>
        )}
      </section>

      <section className="mt-10">
        <h3 className="mb-3 text-[15px] font-semibold">Historia de la prima</h3>
        <PremiumHistoryChart points={data.timeline} activeMonth={month} />
        <p className="mt-2 text-sm text-ink-muted">La prima se mueve con la nota cada mes, no en la renovación anual.</p>
      </section>
    </Film>
  );
}

/** A 0–100 percentile against the portfolio: a neutral ink mark on a track with the 50 line. */
function Percentile({ value }: { value: number | null }) {
  if (value === null) return <span className="text-ink-muted">—</span>;
  return (
    <span className="grid gap-2">
      <span>P{value}</span>
      <span className="relative block h-2 bg-panel-grid" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
        <span className="absolute inset-y-0 left-0 bg-ink/25" style={{ width: `${value}%` }} />
        <span aria-hidden className="absolute -top-1 bottom-[-4px] left-1/2 w-px bg-ink/60" />
        <span aria-hidden className="absolute -top-1.5 bottom-[-6px] w-[3px] -translate-x-1/2 bg-ink" style={{ left: `${value}%` }} />
      </span>
    </span>
  );
}

/** FUND: where the entity ranks and how fast it moves against the portfolio (SPEC §10.3). Display only. */
function FundPanel({ momentum }: { momentum: MomentumView }) {
  const { data: methodology } = useMethodology();
  const rule = methodology?.momentum;
  return (
    <Film title="Momentum" meta={`Perfil Fondo · frente a la cartera · ${monthCode(momentum.month)}`}>
      <dl className="grid gap-px border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          big
          label="Posición"
          title="Puesto por nota final en el perfil Fondo, entre las entidades puntuadas este mes"
          value={momentum.rank}
          sub={`de ${momentum.of} entidades`}
        />
        <Stat
          label="Percentil de trayectoria"
          title="Parte de la cartera con una trayectoria menor"
          value={<Percentile value={momentum.trajPercentile} />}
        />
        <Stat
          label="Percentil de crecimiento de cobros"
          title="Parte de la cartera con un crecimiento de cobros menor"
          value={<Percentile value={momentum.growthPercentile} />}
        />
        <Stat
          label="Estrella emergente"
          title="Nivel todavía bajo pero trayectoria fuerte: una candidata antes de que la nota lo refleje"
          value={
            momentum.risingStar ? (
              <span className="inline-flex items-center gap-2">
                <IconStar width={22} height={22} />
                Sí
              </span>
            ) : (
              "No"
            )
          }
          sub={rule ? `Nivel menor de ${rule.risingStarMaxLevel} y trayectoria de ${rule.risingStarMinTraj} o más` : undefined}
        />
      </dl>
      <p className="mt-3 text-sm text-ink-muted">Percentiles frente a la cartera, solo para contexto: no cambian la nota.</p>
    </Film>
  );
}

/** BANK: the working-capital limit of SPEC §10.1, how it was built, its history, and a what-if on a request. */
function BankPanel({ data, limit }: { data: EntityDetail; limit: LimitDecision }) {
  const { month } = useGlobalParams();
  const { data: methodology } = useMethodology();
  const prev = limit.previousLimitEur;
  const change = prev === null ? null : limit.limitEur - prev;
  const ActionIcon = limit.action === "INCREASE" ? IconUp : CUT_ACTIONS.includes(limit.action) ? IconDown : null;
  const reference = methodology?.limitEngine;
  return (
    <Film id="limite" title="Límite de circulante" meta={`Perfil ${limit.profile === "BANK" ? "Banco" : limit.profile} · recalculado cada mes · ${monthCode(limit.month)}`}>
      <dl className="grid gap-px border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          big
          label="Límite recomendado"
          title="Límite de circulante que el motor recomienda este mes, redondeado a la baja"
          value={formatEur(limit.limitEur)}
          sub={prev === null ? "Primera decisión" : <>Mes anterior {formatEur(prev)}</>}
        />
        <Stat
          label="Acción"
          title="Qué hace el motor con el límite frente al mes anterior"
          value={
            <span className={`inline-flex items-center gap-1.5 ${actionTone(limit.action)}`}>
              {ActionIcon && <ActionIcon width={20} height={20} />}
              {LIMIT_ACTION_LABELS[limit.action]}
            </span>
          }
          sub={
            change === null ? (
              "Sin mes anterior con el que comparar"
            ) : (
              <span className={change > 0 ? "text-up" : change < 0 ? "text-down" : ""}>
                {change > 0 ? "+" : change < 0 ? "−" : ""}
                {formatEur(Math.abs(change))}
                {prev !== null && prev > 0 && ` (${formatDelta((change / prev) * 100)} %)`} frente al mes anterior
              </span>
            )
          }
        />
        <Stat
          label="Precio"
          title="Tipo total: tipo de referencia más el diferencial de la banda"
          value={limit.allInRate === null ? "—" : formatRate(limit.allInRate)}
          sub={
            limit.spreadBps === null ? (
              "Banda sin crédito"
            ) : (
              <>
                {limit.spreadBps} pb sobre la referencia
                {reference && (
                  <>
                    {" "}
                    ({formatRate(reference.referenceRate)}
                    {reference.referenceRateIsExample && ", valor de ejemplo"})
                  </>
                )}
              </>
            )
          }
        />
        <Stat
          label="Restricción activa"
          title="La regla que fija el límite: la puntuación, el tope de cobertura de deuda o la guarda de caja"
          value={<span className="text-lg first-letter:uppercase">{BINDING_LABELS[limit.bindingConstraint]}</span>}
          sub={limit.projectedDscr === null ? "DSCR proyectado: sin flujo de 12 meses" : `DSCR proyectado ${formatDscr(limit.projectedDscr)}`}
        />
      </dl>

      <LimitLedger limit={limit} />

      <div className="mt-10 grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section className="min-w-0">
          <h3 className="mb-3 text-[15px] font-semibold">Historia del límite</h3>
          <LimitHistoryChart
            points={data.timeline}
            activeMonth={month}
            eventMonth={data.events.filter((e) => e.eventType === "DETERIORATION").at(-1)?.eventMonth ?? null}
          />
          <p className="mt-2 text-sm text-ink-muted">El límite se recalcula cada mes con datos hasta ese mes.</p>
        </section>
        <LimitSimulator id={data.id} limit={limit} />
      </div>
    </Film>
  );
}

/** "Cómo se calcula": the limit built step by step from the numbers of the decision (contract item 3). */
function LimitLedger({ limit }: { limit: LimitDecision }) {
  const { data: methodology } = useMethodology();
  const guard = methodology?.limitEngine;
  const byScore = limit.baseEur * limit.factor * limit.trend * (limit.runwayGuard && guard ? guard.runwayGuardMultiplier : 1);
  const lines: { label: React.ReactNode; hint: string; value: string; strong?: boolean }[] = [
    { label: "Base", hint: "mediana de cobros de 3 meses", value: formatEur(limit.baseEur) },
    { label: "× factor de puntuación", hint: `nota ${formatScore(limit.final)}, banda ${limit.band}`, value: `× ${formatNumber(limit.factor)}` },
    { label: "× tendencia", hint: "según la trayectoria", value: `× ${formatNumber(limit.trend)}` },
  ];
  if (limit.runwayGuard)
    lines.push({
      label: "× guarda de caja",
      hint: guard ? `menos de ${formatNumber(guard.runwayGuardBelowMonths)} meses de caja` : "pocos meses de caja",
      value: guard ? `× ${formatNumber(guard.runwayGuardMultiplier)}` : "aplicada",
    });
  if (guard || !limit.runwayGuard) lines.push({ label: "= límite por puntuación", hint: "", value: formatEur(byScore) });
  lines.push({
    label: "Tope de cobertura de deuda",
    hint: limit.dscrCapEur === null ? "" : "lo que el flujo puede pagar con el DSCR mínimo",
    value: limit.dscrCapEur === null ? (limit.spreadBps === null ? "sin tope: banda sin crédito" : "sin tope: falta el flujo de 12 meses") : formatEur(limit.dscrCapEur),
  });
  lines.push({ label: "Límite recomendado", hint: "el menor de los dos, redondeado a la baja", value: formatEur(limit.limitEur), strong: true });
  return (
    <details className="group mt-5 border-t border-rule pt-4">
      <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-[15px] font-semibold select-none [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="inline-block transition-transform group-open:rotate-90">
          <IconFlat width={14} height={14} />
        </span>
        Cómo se calcula
      </summary>
      <dl className="mt-3 grid max-w-[44rem]">
        {lines.map((l, i) => (
          <div
            key={i}
            className={`flex items-baseline justify-between gap-6 py-1.5 text-[15px] ${l.strong ? "mt-1 border-t border-ink/40 pt-2" : "border-b border-dashed border-rule"}`}
          >
            <dt className={l.strong ? "font-semibold" : ""}>
              {l.label}
              {l.hint && <span className="ml-2 text-sm text-ink-muted">{l.hint}</span>}
            </dt>
            <dd className={`shrink-0 text-right whitespace-nowrap ${l.strong ? "text-lg font-semibold" : ""}`}>{l.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

const SIM_LABELS: Record<LimitSimulation["decision"], { text: string; tone: string }> = {
  APPROVE: { text: "Aprobada", tone: "border-up text-up" },
  PARTIAL: { text: "Parcial", tone: "border-ink text-ink" },
  DECLINE: { text: "Denegada", tone: "border-down text-down" },
};

/** The backend sends Spring's JSON error body; show its message, not the raw JSON. */
function errorText(error: Error): string {
  if (isServerDown(error)) return "Esta función necesita el servidor.";
  if (!(error instanceof ApiError)) return error.message;
  try {
    const body = JSON.parse(error.message) as { detail?: string; message?: string };
    return body.detail ?? body.message ?? error.message;
  } catch {
    return error.message || `Error ${error.status}`;
  }
}

/** What-if on a credit request against this month's stored decision (F8). It writes nothing. */
function LimitSimulator({ id, limit }: { id: string; limit: LimitDecision }) {
  const { month, profile } = useGlobalParams();
  const { data: methodology } = useMethodology();
  const sim = useSimulateLimit(id);
  const { reset } = sim;
  // A new month or entity is a new decision: drop the previous answer.
  useEffect(() => reset(), [id, month, profile, reset]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const term = String(form.get("term") ?? "").trim();
    sim.mutate({ month, requestedAmountEur: Number(form.get("amount")), termMonths: term === "" ? undefined : Number(term) });
  }

  const result = sim.data;
  const label = result ? SIM_LABELS[result.decision] : null;
  return (
    <section className="min-w-0">
      <h3 className="mb-3 text-[15px] font-semibold">Simular una solicitud</h3>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" noValidate>
        <label className="grid gap-1.5 text-sm text-ink-muted" htmlFor={`sim-amount-${id}`}>
          Importe solicitado (EUR)
          <input
            id={`sim-amount-${id}`}
            name="amount"
            type="number"
            inputMode="numeric"
            required
            min={1}
            step="any"
            key={`${id}-${limit.month}`}
            defaultValue={limit.limitEur > 0 ? limit.limitEur : undefined}
            className={FIELD}
          />
        </label>
        <label className="grid gap-1.5 text-sm text-ink-muted" htmlFor={`sim-term-${id}`}>
          Plazo (meses)
          <input
            id={`sim-term-${id}`}
            name="term"
            type="number"
            inputMode="numeric"
            min={1}
            max={120}
            step={1}
            key={methodology ? "ready" : "loading"}
            defaultValue={methodology?.limitEngine.defaultTermMonths}
            className={FIELD}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={sim.isPending}
            className="border border-ink bg-ink px-4 py-2 text-[15px] font-semibold text-film hover:bg-ink/85 disabled:cursor-wait disabled:opacity-60"
          >
            {sim.isPending ? "Simulando…" : "Simular"}
          </button>
          <span className="text-sm text-ink-muted">Sobre la decisión de {monthCode(limit.month)}. No guarda nada.</span>
        </div>
      </form>

      <div aria-live="polite" className="mt-5">
        {sim.error && (
          <p role="alert" className="border border-down/60 px-3 py-2 text-[15px] text-down">
            {errorText(sim.error)}
          </p>
        )}
        {result && label && (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className={`border px-2 py-0.5 text-sm font-semibold ${label.tone}`}>{label.text}</span>
              <span className="text-3xl font-semibold [font-stretch:85%]" title="Importe que el motor concede de lo solicitado">
                {formatEur(result.approvedAmountEur)}
              </span>
              <span className="text-sm text-ink-muted">de {formatEur(result.requestedAmountEur)} solicitados</span>
            </div>
            <dl className="grid grid-cols-2 gap-px border border-rule bg-rule">
              <Stat label="Capacidad" title="Límite disponible este mes para esta entidad" value={<span className="text-xl">{formatEur(result.capacityEur)}</span>} />
              <Stat
                label="Tipo total"
                title="Tipo de referencia más el diferencial de la banda"
                value={<span className="text-xl">{result.allInRate === null ? "—" : formatRate(result.allInRate)}</span>}
                sub={result.spreadBps === null ? "Sin diferencial" : `${result.spreadBps} pb · ${result.termMonths} meses`}
              />
              <Stat
                label="DSCR proyectado"
                title="Flujo operativo anual entre el servicio de la deuda, con el importe concedido"
                value={<span className="text-xl">{result.projectedDscr === null ? "—" : formatDscr(result.projectedDscr)}</span>}
              />
              <Stat
                label="Restricción"
                title="La regla que limita el importe concedido"
                value={<span className="text-base first-letter:uppercase">{BINDING_LABELS[result.bindingConstraint]}</span>}
              />
            </dl>
          </div>
        )}
      </div>
    </section>
  );
}

const FIELD =
  "border border-ink/25 bg-film px-3 py-2 text-base text-ink tabular-nums outline-none hover:border-ink focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-scan";
