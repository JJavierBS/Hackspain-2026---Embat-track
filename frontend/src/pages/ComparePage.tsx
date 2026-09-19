import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { EntityDetail, PortfolioRow } from "../api/types";
import { useEntity, usePortfolio } from "../api/queries";
import { Film } from "../components/Film";
import { LoadState } from "../components/LoadState";
import { Meter } from "../components/Meter";
import { PageHeader } from "../components/PageHeader";
import { ScoreReadout } from "../components/ScoreReadout";
import { StatusTag, TrendTag } from "../components/StatusTag";
import { MONTHS, useGlobalParams } from "../hooks/useGlobalParams";
import { BANDS, formatScore, monthCode, monthShort } from "../lib/format";

/** Largest final-score gap that still counts as "the same score today" for the showcase pair. */
const SAME_SCORE_GAP = 3;

/**
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
  const pair = useMemo(() => showcasePair(portfolio.data?.rows ?? []), [portfolio.data]);
  const a = params.get("a") ?? pair?.a ?? "";
  const b = params.get("b") ?? pair?.b ?? "";
  const ea = useEntity(a, profile, month);
  const eb = useEntity(b, profile, month);

  function pick(key: "a" | "b", id: string) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(key, id);
      return next;
    });
  }

  const options = [...(portfolio.data?.rows ?? [])].sort((x, y) => x.name.localeCompare(y.name, "es"));
  const error = ea.error ?? eb.error ?? portfolio.error;
  const ready = ea.data && eb.data;

  return (
    <div className="grid gap-12">
      <PageHeader title="Comparar" lede="Dos entidades con la misma nota hoy pueden ir en direcciones opuestas. La trayectoria marca la diferencia." />

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
                </Film>
              );
            })}
          </div>
          <Film title="Evolución superpuesta" meta={`Puntuación final hasta ${monthCode(month)}`}>
            <Overlay a={ea.data} b={eb.data} month={month} />
            <Verdict a={ea.data} b={eb.data} />
          </Film>
        </>
      )}
    </div>
  );
}

function Side({ entity, month }: { entity: EntityDetail; month: string }) {
  const m = MONTHS.indexOf(month);
  const { row } = entity;
  if (row === null) return <p className="text-ink-muted">Sin puntuación en {monthCode(month)}.</p>;
  return (
    <div className="grid gap-6">
      <ScoreReadout score={row.final} delta={row.delta3m} against={`vs ${monthCode(MONTHS[Math.max(0, m - 3)])}`} size="md" />
      <div className="flex flex-wrap gap-2">
        <StatusTag status={row.status} />
        <TrendTag traj={row.traj} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Meter label="Nivel" value={row.level} />
        <Meter label="Trayectoria" value={row.traj} direction />
      </div>
    </div>
  );
}

function Overlay({ a, b, month }: { a: EntityDetail; b: EntityDetail; month: string }) {
  // Joined by month: a month with no score is null and draws as a gap.
  const bByMonth = new Map(b.timeline.map((p) => [p.month, p.final]));
  const data = a.timeline.map((p) => ({ month: p.month, a: p.final, b: bByMonth.get(p.month) ?? null }));
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
      </ul>
      <div className="h-[300px]">
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
            <ReferenceLine x={month} stroke="var(--color-scan)" strokeOpacity={0.22} strokeWidth={14} />
            <XAxis dataKey="month" tickFormatter={monthShort} tick={{ fill: "var(--color-ink-muted)", fontSize: 14 }} tickLine={false} axisLine={{ stroke: "var(--color-rule)" }} minTickGap={32} />
            <YAxis domain={[0, 100]} ticks={[0, 35, 50, 65, 80, 100]} tick={{ fill: "var(--color-ink-muted)", fontSize: 14 }} tickLine={false} axisLine={false} />
            <Tooltip
              labelFormatter={(m) => `${monthShort(String(m))} · ${monthCode(String(m))}`}
              formatter={(v, key) => [formatScore(Number(v)), key === "a" ? a.name : b.name]}
              contentStyle={{ border: "1px solid var(--color-rule)", borderRadius: 0, background: "var(--color-film)" }}
            />
            <Line dataKey="a" stroke={COLORS.a} strokeWidth={3} dot={false} isAnimationActive={false} />
            <Line dataKey="b" stroke={COLORS.b} strokeWidth={3} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
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
