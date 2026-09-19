import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { EntityDetail, EntityEvent, PortfolioRow, ShowcasePair } from "../api/types";
import { useEntity, usePortfolio, useShowcasePairs } from "../api/queries";
import { Film } from "../components/Film";
import { HorizonPicker, ReliabilityTag } from "../components/ForecastControls";
import { IconDown, IconUp } from "../components/Icons";
import { LoadState } from "../components/LoadState";
import { Meter } from "../components/Meter";
import { PageHeader } from "../components/PageHeader";
import { ScoreReadout } from "../components/ScoreReadout";
import { StatusTag, TrendTag } from "../components/StatusTag";
import { MONTHS, useGlobalParams } from "../hooks/useGlobalParams";
import { useHorizon } from "../hooks/useHorizon";
import { useLinkSearch } from "../hooks/useLinkSearch";
import { BANDS, EVENT_MARK_LABELS, TRIGGER_LABELS, formatLead, formatScore, leadText, monthCode, monthShort } from "../lib/format";

/** Largest final-score gap that still counts as "the same score today" for the showcase pair. */
const SAME_SCORE_GAP = 3;

/**
 * Fallback when the API has no pair (a backend before phase 6, or a month with none).
 * SPEC §10.4 showcase pair, picked from the data: among entities whose final scores differ by
 * SAME_SCORE_GAP points or less, the pair with the largest trajectory gap. Falls back to the top two rows.
 */
function showcasePair(rows: PortfolioRow[]): { a: string; b: string } | null {
  if (rows.length < 2) return null;
  const sorted = [...rows].sort((x, y) => x.final - y.final);
  let best: { a: string; b: string; gap: number } | null = null;
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && sorted[j].final - sorted[i].final <= SAME_SCORE_GAP; j++) {
      const ti = sorted[i].traj;
      const tj = sorted[j].traj;
      if (ti === null || tj === null) continue;
      const gap = Math.abs(ti - tj);
      if (best === null || gap > best.gap) {
        // A is the one heading up, B the one heading down.
        best = ti >= tj ? { a: sorted[i].id, b: sorted[j].id, gap } : { a: sorted[j].id, b: sorted[i].id, gap };
      }
    }
  }
  return best ?? { a: rows[0].id, b: rows[1].id };
}
const COLORS = { a: "var(--color-ink)", b: "var(--color-series-trajectory)" } as const;

export function ComparePage() {
  const { profile, month } = useGlobalParams();
  const [params, setParams] = useSearchParams();
  const portfolio = usePortfolio(profile, month);
  const showcase = useShowcasePairs(profile, month);
  // An API error (old backend) or an empty list both fall back to the client-side pick.
  const apiPairs = showcase.data?.pairs ?? [];
  const localPair = useMemo(() => showcasePair(portfolio.data?.rows ?? []), [portfolio.data]);
  const fallback = apiPairs[0] ? { a: apiPairs[0].up.id, b: apiPairs[0].down.id } : localPair;
  // Wait for the API pair before opening a default one, so the page does not load two pairs in a row.
  const settled = !showcase.isPending;
  const a = params.get("a") ?? (settled ? (fallback?.a ?? "") : "");
  const b = params.get("b") ?? (settled ? (fallback?.b ?? "") : "");
  const { horizon, setHorizon } = useHorizon();
  const ea = useEntity(a, profile, month, horizon);
  const eb = useEntity(b, profile, month, horizon);
  const activePair = apiPairs.find((p) => p.up.id === a && p.down.id === b) ?? null;

  function pick(key: "a" | "b", id: string) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(key, id);
      return next;
    });
  }

  function pickPair(pair: ShowcasePair) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("a", pair.up.id);
      next.set("b", pair.down.id);
      return next;
    });
  }

  const options = [...(portfolio.data?.rows ?? [])].sort((x, y) => x.name.localeCompare(y.name, "es"));
  const error = ea.error ?? eb.error ?? portfolio.error;
  const ready = ea.data && eb.data;

  return (
    <div className="grid gap-12">
      <PageHeader title="Comparar" lede="Dos entidades con la misma nota hoy pueden ir en direcciones opuestas. La trayectoria marca la diferencia." />

      {apiPairs.length > 0 && <PairPicker pairs={apiPairs.slice(0, 3)} active={activePair} onPick={pickPair} />}

      {error ? (
        <LoadState error={error} />
      ) : !ready ? (
        <LoadState />
      ) : (
        <>
          <div className="grid gap-12 md:grid-cols-2">
            {(["a", "b"] as const).map((key) => {
              const e = key === "a" ? ea.data : eb.data;
              return (
                <Film key={key} title={key === "a" ? "Entidad A" : "Entidad B"}>
                  <label className="mb-6 flex items-center gap-3">
                    <span aria-hidden className="h-1 w-6" style={{ background: COLORS[key] }} />
                    <span className="sr-only">Elegir entidad {key.toUpperCase()}</span>
                    <select
                      value={e.id}
                      onChange={(ev) => pick(key, ev.target.value)}
                      className="min-w-0 flex-1 border border-ink/25 bg-film px-2 py-1.5 text-lg font-semibold"
                    >
                      {options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Side entity={e} month={month} />
                  <Anticipation events={e.events} />
                </Film>
              );
            })}
          </div>
          <Film title="Evolución superpuesta" meta={`Puntuación final hasta ${monthCode(month)} y proyección`}>
            <Overlay a={ea.data} b={eb.data} month={month} />
            <ProjectionControls a={ea.data} b={eb.data} horizon={horizon} onHorizon={setHorizon} />
            <Verdict a={ea.data} b={eb.data} />
          </Film>
        </>
      )}
    </div>
  );
}

/** The top showcase pairs of the API as a joined toggle group, with the reason the active one was picked. */
function PairPicker({ pairs, active, onPick }: { pairs: ShowcasePair[]; active: ShowcasePair | null; onPick: (p: ShowcasePair) => void }) {
  return (
    <div className="grid gap-3">
      <div role="group" aria-label="Parejas destacadas" className="flex flex-wrap gap-2">
        {pairs.map((p) => {
          const on = active?.rank === p.rank;
          return (
            <button
              key={p.rank}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(p)}
              title={`${p.up.name} frente a ${p.down.name}: ${formatScore(p.finalGap)} puntos de diferencia en la nota, ${formatScore(p.trajGap)} en la trayectoria`}
              className={`flex min-w-0 items-baseline gap-3 border px-3 py-2 text-left text-[15px] transition-colors ${
                on ? "border-ink bg-ink text-film" : "border-ink/25 bg-film text-ink hover:border-ink"
              }`}
            >
              <span className="font-semibold whitespace-nowrap">Pareja destacada {p.rank}</span>
              <span className={`truncate text-sm ${on ? "text-film/75" : "text-ink-muted"}`}>
                {p.up.id} · {p.down.id}
              </span>
            </button>
          );
        })}
      </div>
      {active && (
        <p className="max-w-[80ch] text-[15px] text-ink-muted">
          Misma nota hoy ({formatScore(active.up.final)} vs {formatScore(active.down.final)}),{" "}
          {active.meetsSpec ? "trayectorias opuestas" : "trayectorias distintas"} ({formatScore(active.up.traj)} vs{" "}
          {formatScore(active.down.traj)}).
          {!active.meetsSpec && (
            <span className="ml-2 border border-dashed border-ink-muted/60 px-1.5 text-sm whitespace-nowrap">
              sin pareja que cumpla el criterio este mes: la más cercana
            </span>
          )}
        </p>
      )}
    </div>
  );
}

/** One line per lead-time event of the entity (only events up to the selected month reach the page). */
function Anticipation({ events }: { events: EntityEvent[] }) {
  if (events.length === 0) return null;
  return (
    <ul className="mt-6 grid gap-2 border-t border-rule pt-4 text-[15px]">
      {events.map((e) => {
        const down = e.eventType === "DETERIORATION";
        const Icon = down ? IconDown : IconUp;
        return (
          <li key={`${e.eventType}-${e.eventMonth}`} className="flex items-baseline gap-2">
            <Icon width={15} height={15} className={`shrink-0 translate-y-0.5 ${down ? "text-down" : "text-up"}`} />
            <span>
              {EVENT_MARK_LABELS[e.eventType]} <span className="font-semibold">{TRIGGER_LABELS[e.trigger].toLowerCase()}</span> en{" "}
              {monthShort(e.eventMonth)} ·{" "}
              <span className={e.leadMonths !== null && e.leadMonths > 0 ? "font-semibold" : "text-ink-muted"}>
                {down ? leadText(e.leadMonths) : e.leadMonths === null ? "no anticipada" : e.leadMonths === 0 ? "vista el mismo mes" : `vista ${formatLead(e.leadMonths)} antes`}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Side({ entity, month }: { entity: EntityDetail; month: string }) {
  const m = MONTHS.indexOf(month);
  const linkSearch = useLinkSearch();
  const { row } = entity;
  if (row === null) return <p className="text-ink-muted">Sin puntuación en {monthCode(month)}.</p>;
  return (
    <div className="grid gap-6">
      <ScoreReadout score={row.final} delta={row.delta3m} against={`vs ${monthCode(MONTHS[Math.max(0, m - 3)])}`} size="md" />
      <div className="flex flex-wrap items-center gap-2">
        <StatusTag status={row.status} />
        <TrendTag traj={row.traj} />
        <Link to={`/entity/${entity.id}${linkSearch}`} className="ml-auto text-[15px] font-semibold underline underline-offset-4 hover:text-ink-muted">
          Ver radiografía
        </Link>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Meter label="Nivel" value={row.level} />
        <Meter label="Trayectoria" value={row.traj} direction />
      </div>
    </div>
  );
}

/** A row of the overlay: measured finals (a, b) and projections (pa, pb), joined at the selected month. */
interface OverlayRow {
  month: string;
  a: number | null;
  b: number | null;
  pa: number | null;
  pb: number | null;
}

/** Fewest months the overlay shows, so two short histories still read as a trend. */
const MIN_WINDOW = 6;

/**
 * The months worth plotting: from the first month either entity has a score (at least MIN_WINDOW before the
 * selected month) to the selected month, then the projected months of both.
 */
function overlayRows(a: EntityDetail, b: EntityDetail, month: string): OverlayRow[] {
  const at = (e: EntityDetail) => new Map(e.timeline.map((p) => [p.month, p.final]));
  const fa = at(a);
  const fb = at(b);
  const end = MONTHS.indexOf(month);
  const first = MONTHS.findIndex((m, i) => i <= end && (fa.get(m) != null || fb.get(m) != null));
  const start = first < 0 ? 0 : Math.max(0, Math.min(first, end - (MIN_WINDOW - 1)));
  const measured: OverlayRow[] = MONTHS.slice(start, end + 1).map((m) => ({
    month: m, a: fa.get(m) ?? null, b: fb.get(m) ?? null, pa: null, pb: null,
  }));
  const last = measured[measured.length - 1];
  const pointsA = a.forecast?.points ?? [];
  const pointsB = b.forecast?.points ?? [];
  // Each projection leaves from its measured point, so the dotted line continues the solid one.
  if (last && pointsA.length > 0) last.pa = last.a;
  if (last && pointsB.length > 0) last.pb = last.b;
  const future = [...new Set([...pointsA, ...pointsB].map((p) => p.month))].sort();
  const pa = new Map(pointsA.map((p) => [p.month, p.value]));
  const pb = new Map(pointsB.map((p) => [p.month, p.value]));
  return [
    ...measured,
    ...future.map((m) => ({ month: m, a: null, b: null, pa: last?.a == null ? null : (pa.get(m) ?? null), pb: last?.b == null ? null : (pb.get(m) ?? null) })),
  ];
}

const PROJECTION_DASH = "1 6";

function Overlay({ a, b, month }: { a: EntityDetail; b: EntityDetail; month: string }) {
  const data = overlayRows(a, b, month);
  const lastProjected = [...data].reverse().find((r) => r.pa !== null || r.pb !== null);
  const projecting = lastProjected !== undefined && lastProjected.month !== month;
  const visible = new Set(data.map((d) => d.month));
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-[15px] text-ink-muted">
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-[3px] w-6 bg-ink" />
          {a.name}
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-[3px] w-6" style={{ background: COLORS.b }} />
          {b.name}
        </li>
        {projecting && (
          <li className="flex items-center gap-2">
            <svg width="22" height="8" aria-hidden>
              <line x1="1.5" y1="4" x2="21" y2="4" stroke="var(--color-ink)" strokeWidth={2.5} strokeDasharray={PROJECTION_DASH} strokeLinecap="round" />
            </svg>
            Proyección (no es un dato medido)
          </li>
        )}
        {a.events.length + b.events.length > 0 && (
          <li className="flex items-center gap-2">
            <svg width="10" height="14" aria-hidden>
              <line x1="5" y1="0" x2="5" y2="14" stroke="var(--color-ink)" strokeWidth={1.5} strokeDasharray="5 3" />
            </svg>
            Evento (en el color de su entidad)
          </li>
        )}
      </ul>
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
            {BANDS.map((band, i) => (
              <ReferenceArea
                key={band.band}
                y1={Math.max(band.min, 0)}
                y2={i === 0 ? 100 : BANDS[i - 1].min}
                fill={band.color}
                fillOpacity={0.07}
                stroke="none"
                ifOverflow="hidden"
              />
            ))}
            <CartesianGrid vertical={false} stroke="var(--color-rule)" strokeDasharray="2 4" />
            {projecting && (
              <ReferenceArea
                x1={month}
                x2={lastProjected.month}
                fill="var(--color-ink)"
                fillOpacity={0.05}
                stroke="none"
                label={{ value: "Proyección", position: "insideTopRight", fill: "var(--color-ink-muted)", fontSize: 13 }}
              />
            )}
            <ReferenceLine x={month} stroke="var(--color-scan)" strokeOpacity={0.22} strokeWidth={14} />
            <XAxis dataKey="month" tickFormatter={monthShort} tick={{ fill: "var(--color-ink-muted)", fontSize: 14 }} tickLine={false} axisLine={{ stroke: "var(--color-rule)" }} interval="preserveStartEnd" minTickGap={32} />
            <YAxis domain={[0, 100]} ticks={[0, 35, 50, 65, 80, 90, 100]} tick={{ fill: "var(--color-ink-muted)", fontSize: 14 }} tickLine={false} axisLine={false} />
            <Tooltip content={<OverlayTip a={a} b={b} month={month} />} />
            {(["a", "b"] as const).flatMap((key) =>
              (key === "a" ? a : b).events
                .filter((e) => visible.has(e.eventMonth))
                .map((e) => (
                  <ReferenceLine
                    key={`${key}-${e.eventType}-${e.eventMonth}`}
                    x={e.eventMonth}
                    stroke={COLORS[key]}
                    strokeWidth={1.5}
                    strokeDasharray="5 3"
                    label={{
                      value: "evento",
                      // Past the middle of the axis the label sits left of its line, so it never runs off the plot.
                      position: `inside${key === "a" ? "Top" : "Bottom"}${data.findIndex((d) => d.month === e.eventMonth) > data.length / 2 ? "Right" : "Left"}`,
                      fill: COLORS[key],
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  />
                )),
            )}
            <Line dataKey="a" stroke={COLORS.a} strokeWidth={3} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            <Line dataKey="b" stroke={COLORS.b} strokeWidth={3} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            {(["a", "b"] as const).map((key) => (
              <Line
                key={`p${key}`}
                dataKey={`p${key}`}
                stroke={COLORS[key]}
                strokeWidth={2.5}
                strokeDasharray={PROJECTION_DASH}
                strokeLinecap="round"
                dot={{ r: 3.5, fill: "var(--color-film)", stroke: COLORS[key], strokeWidth: 1.5 }}
                activeDot={{ r: 4.5 }}
                isAnimationActive={false}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Measured or projected score of each entity in the hovered month; the join month shows only the measurement. */
function OverlayTip({ a, b, month, active, payload }: { a: EntityDetail; b: EntityDetail; month: string; active?: boolean; payload?: { payload: OverlayRow }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const future = row.month > month;
  const lines = [
    { name: a.name, color: COLORS.a, value: future ? row.pa : row.a },
    { name: b.name, color: COLORS.b, value: future ? row.pb : row.b },
  ];
  return (
    <div className="border border-rule bg-film px-3 py-2 text-sm tabular-nums shadow-[var(--shadow-level-2)]">
      <p className="mb-1 font-semibold">
        {monthShort(row.month)} · {future ? "proyección" : monthCode(row.month)}
      </p>
      {lines.map((l) => (
        <p key={l.name} className="flex items-center gap-2">
          <span aria-hidden className="h-[3px] w-4" style={{ background: l.color }} />
          <span className="text-ink-muted">{l.name}</span>
          <span className="ml-auto pl-3 font-semibold">{l.value == null ? "—" : formatScore(l.value)}</span>
        </p>
      ))}
    </div>
  );
}

/** One horizon for both projections, and how far to trust each. */
function ProjectionControls({ a, b, horizon, onHorizon }: { a: EntityDetail; b: EntityDetail; horizon: number; onHorizon: (h: number) => void }) {
  const forecasts = [{ e: a }, { e: b }].filter((x) => x.e.forecast !== null) as { e: EntityDetail & { forecast: NonNullable<EntityDetail["forecast"]> } }[];
  if (forecasts.length === 0) return null;
  const maxHorizon = Math.max(...forecasts.map((x) => x.e.forecast.maxHorizon));
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <HorizonPicker horizon={horizon} maxHorizon={maxHorizon} onHorizon={onHorizon} />
      {forecasts.map(({ e }) => (
        <ReliabilityTag key={e.id} forecast={e.forecast} who={e.name} />
      ))}
    </div>
  );
}

function Verdict({ a, b }: { a: EntityDetail; b: EntityDetail }) {
  if (a.row === null || b.row === null) return null;
  const gap = Math.abs(a.row.final - b.row.final);
  // No trajectory yet reads as stable (50) in this comparison text.
  const ta = a.row.traj ?? 50;
  const tb = b.row.traj ?? 50;
  const opposite = (ta >= 55 && tb <= 45) || (ta <= 45 && tb >= 55);
  const text =
    gap <= 3 && opposite
      ? `Casi la misma nota hoy (${formatScore(gap)} puntos de diferencia), pero trayectorias opuestas: ${formatScore(ta)} frente a ${formatScore(tb)}.`
      : `Diferencia de ${formatScore(gap)} puntos en la nota final y de ${formatScore(Math.abs(ta - tb))} en la trayectoria.`;
  return <p className="mt-4 border-t border-rule pt-3 text-[15px]">{text}</p>;
}
