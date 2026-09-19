import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import type { LimitAction, TimelinePoint } from "../api/types";
import { LIMIT_ACTION_LABELS, formatEur, formatEurCompact, formatScore, monthCode, monthShort } from "../lib/format";

interface LimitHistoryChartProps {
  /** Up to the selected month (causal). */
  points: TimelinePoint[];
  activeMonth: string;
  height?: number;
  /** Month of the deterioration event (lead time), drawn as a dashed "evento" line so the cut and the event read together. */
  eventMonth?: string | null;
}

const CUTS: LimitAction[] = ["REDUCE", "FREEZE"];

interface Row {
  month: string;
  limit: number | null;
  final: number | null;
  action: LimitAction | null;
  up: number | null;
  down: number | null;
}

interface MarkerProps {
  cx?: number;
  cy?: number;
  payload?: Row;
}

/** A small drawn triangle for an action marker: up in green, down in red. */
function Triangle({ cx, cy, dir, payload }: MarkerProps & { dir: "up" | "down" }) {
  // Recharts still calls the shape for rows whose value is null: draw nothing there.
  if (cx === undefined || cy === undefined || payload?.[dir] == null) return <g />;
  const s = 6;
  const d = dir === "up" ? `M${cx} ${cy - s - 4}l${s} ${s * 1.6}h${-2 * s}z` : `M${cx} ${cy + s + 4}l${s} ${-s * 1.6}h${-2 * s}z`;
  return <path d={d} fill={dir === "up" ? "var(--color-up)" : "var(--color-down)"} stroke="var(--color-film)" strokeWidth={1} />;
}

function LimitTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="border border-rule bg-film px-3 py-2 text-sm">
      <p className="font-semibold">
        {monthShort(row.month)} · {monthCode(row.month)}
      </p>
      <p>Límite {row.limit === null ? "sin decisión" : formatEur(row.limit)}</p>
      {row.action && (
        <p className={row.action === "INCREASE" ? "text-up" : CUTS.includes(row.action) || row.action === "DECLINE" ? "text-down" : "text-ink-muted"}>
          {LIMIT_ACTION_LABELS[row.action]}
        </p>
      )}
      <p className="text-ink-muted">Nota final {row.final === null ? "—" : formatScore(row.final)}</p>
    </div>
  );
}

/** The recommended limit month by month (step area), the final score behind it, and the months the engine acted. */
export function LimitHistoryChart({ points, activeMonth, height = 260, eventMonth = null }: LimitHistoryChartProps) {
  const data: Row[] = points.map((p) => ({
    month: p.month,
    limit: p.limitEur,
    final: p.final,
    action: p.limitAction,
    up: p.limitAction === "INCREASE" ? p.limitEur : null,
    down: p.limitAction !== null && CUTS.includes(p.limitAction) ? p.limitEur : null,
  }));
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[15px] text-ink-muted">
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-3 w-5 border-t-2 border-ink bg-ink/10" />
          Límite recomendado
        </li>
        <li className="flex items-center gap-2">
          <svg width="22" height="8" aria-hidden>
            <line x1="0" y1="4" x2="22" y2="4" stroke="var(--color-ink-muted)" strokeWidth={1.5} />
          </svg>
          Nota final (eje derecho)
        </li>
        <li className="flex items-center gap-2">
          <svg width="12" height="12" aria-hidden>
            <path d="M6 1l5 9H1z" fill="var(--color-up)" />
          </svg>
          Aumento
        </li>
        <li className="flex items-center gap-2">
          <svg width="12" height="12" aria-hidden>
            <path d="M6 11l5-9H1z" fill="var(--color-down)" />
          </svg>
          Reducción o congelación
        </li>
        {eventMonth && (
          <li className="flex items-center gap-2">
            <svg width="10" height="14" aria-hidden>
              <line x1="5" y1="0" x2="5" y2="14" stroke="var(--color-down)" strokeWidth={1.5} strokeDasharray="4 2" />
            </svg>
            Evento de deterioro
          </li>
        )}
      </ul>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 16, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--color-rule)" strokeDasharray="2 4" />
            <ReferenceLine yAxisId="eur" x={activeMonth} stroke="var(--color-scan)" strokeOpacity={0.22} strokeWidth={14} />
            <XAxis
              dataKey="month"
              tickFormatter={monthShort}
              tick={{ fill: "var(--color-ink-muted)", fontSize: 14 }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-rule)" }}
              interval="preserveStartEnd"
              minTickGap={32}
            />
            <YAxis
              yAxisId="eur"
              tickFormatter={(v: number) => formatEurCompact(v)}
              tick={{ fill: "var(--color-ink-muted)", fontSize: 14 }}
              tickLine={false}
              axisLine={false}
              width={72}
            />
            <YAxis
              yAxisId="score"
              orientation="right"
              domain={[0, 100]}
              ticks={[0, 50, 100]}
              tick={{ fill: "var(--color-ink-muted)", fontSize: 14 }}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            {eventMonth && (
              <ReferenceLine
                yAxisId="eur"
                x={eventMonth}
                stroke="var(--color-down)"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                label={{ value: "evento", position: "insideTopRight", fill: "var(--color-down)", fontSize: 13, fontWeight: 600 }}
              />
            )}
            <Tooltip content={<LimitTooltip />} cursor={{ stroke: "var(--color-rule)" }} />
            <Area
              yAxisId="eur"
              type="stepAfter"
              dataKey="limit"
              stroke="var(--color-ink)"
              strokeWidth={2}
              fill="var(--color-ink)"
              fillOpacity={0.08}
              connectNulls={false}
              isAnimationActive={false}
              activeDot={{ r: 3.5, fill: "var(--color-ink)" }}
            />
            <Line
              yAxisId="score"
              dataKey="final"
              stroke="var(--color-ink-muted)"
              strokeWidth={1.5}
              dot={false}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Scatter yAxisId="eur" dataKey="up" isAnimationActive={false} shape={(p: MarkerProps) => <Triangle {...p} dir="up" />} />
            <Scatter
              yAxisId="eur"
              dataKey="down"
              isAnimationActive={false}
              shape={(p: MarkerProps) => <Triangle {...p} dir="down" />}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
