import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import type { TimelinePoint } from "../api/types";
import { formatEur, formatEurCompact, formatRate, monthCode, monthShort } from "../lib/format";

interface PremiumHistoryChartProps {
  /** Up to the selected month (causal). */
  points: TimelinePoint[];
  activeMonth: string;
  height?: number;
}

interface Row {
  month: string;
  rate: number | null;
  buyer: number | null;
  /** Rate on the months it went up (worse) or down (better). */
  worse: number | null;
  better: number | null;
}

interface MarkerProps {
  cx?: number;
  cy?: number;
  payload?: Row;
}

/** A square mark on the rate line where the premium moved: red when it rises, green when it falls. */
function Mark({ cx, cy, payload, kind }: MarkerProps & { kind: "worse" | "better" }) {
  if (cx === undefined || cy === undefined || payload?.[kind] == null) return <g />;
  return (
    <rect
      x={cx - 5}
      y={cy - 5}
      width={10}
      height={10}
      fill={kind === "worse" ? "var(--color-down)" : "var(--color-up)"}
      stroke="var(--color-film)"
      strokeWidth={1.5}
    />
  );
}

function PremiumTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="border border-rule bg-film px-3 py-2 text-sm">
      <p className="font-semibold">
        {monthShort(row.month)} · {monthCode(row.month)}
      </p>
      <p>Prima {row.rate === null ? "no asegurable" : formatRate(row.rate)}</p>
      {row.worse !== null && <p className="text-down">Sube la prima</p>}
      {row.better !== null && <p className="text-up">Baja la prima</p>}
      <p className="text-ink-muted">Límite por comprador {row.buyer === null ? "—" : formatEur(row.buyer)}</p>
    </div>
  );
}

/** The premium rate month by month (step line) over the buyer limit (bars). */
export function PremiumHistoryChart({ points, activeMonth, height = 260 }: PremiumHistoryChartProps) {
  const data: Row[] = points.map((p, i) => {
    const before = i > 0 ? points[i - 1].premiumRate : null;
    const moved = p.premiumRate !== null && before !== null && p.premiumRate !== before;
    return {
      month: p.month,
      rate: p.premiumRate,
      buyer: p.buyerLimitEur,
      worse: moved && p.premiumRate! > before ? p.premiumRate : null,
      better: moved && p.premiumRate! < before ? p.premiumRate : null,
    };
  });
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[15px] text-ink-muted">
        <li className="flex items-center gap-2">
          <svg width="22" height="8" aria-hidden>
            <line x1="0" y1="4" x2="22" y2="4" stroke="var(--color-ink)" strokeWidth={2.5} />
          </svg>
          Tasa de prima
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-3 w-2.5 bg-ink/15" />
          Límite por comprador (eje derecho)
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-2.5 w-2.5 bg-down" />
          Sube
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-2.5 w-2.5 bg-up" />
          Baja
        </li>
      </ul>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 16, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--color-rule)" strokeDasharray="2 4" />
            <ReferenceLine yAxisId="rate" x={activeMonth} stroke="var(--color-scan)" strokeOpacity={0.22} strokeWidth={14} />
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
              yAxisId="rate"
              domain={[0, "auto"]}
              tickFormatter={(v: number) => formatRate(v)}
              tick={{ fill: "var(--color-ink-muted)", fontSize: 14 }}
              tickLine={false}
              axisLine={false}
              width={64}
            />
            <YAxis
              yAxisId="eur"
              orientation="right"
              tickFormatter={(v: number) => formatEurCompact(v)}
              tick={{ fill: "var(--color-ink-muted)", fontSize: 14 }}
              tickLine={false}
              axisLine={false}
              width={72}
            />
            <Tooltip content={<PremiumTooltip />} cursor={{ fill: "var(--color-scan-soft)", fillOpacity: 0.4 }} />
            <Bar yAxisId="eur" dataKey="buyer" fill="var(--color-ink)" fillOpacity={0.12} isAnimationActive={false} />
            <Line
              yAxisId="rate"
              type="stepAfter"
              dataKey="rate"
              stroke="var(--color-ink)"
              strokeWidth={2.5}
              // A month with a rate between two gaps has no segment to draw: mark it with a short tick instead.
              dot={(p: { cx?: number; cy?: number; index?: number }) => {
                const i = p.index ?? -1;
                const isolated = data[i]?.rate != null && data[i - 1]?.rate == null && data[i + 1]?.rate == null;
                return isolated && p.cx !== undefined && p.cy !== undefined ? (
                  <rect key={i} x={p.cx - 6} y={p.cy - 1.25} width={12} height={2.5} fill="var(--color-ink)" />
                ) : (
                  <g key={i} />
                );
              }}
              activeDot={{ r: 3.5, fill: "var(--color-ink)" }}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Scatter yAxisId="rate" dataKey="worse" isAnimationActive={false} shape={(p: MarkerProps) => <Mark {...p} kind="worse" />} />
            <Scatter yAxisId="rate" dataKey="better" isAnimationActive={false} shape={(p: MarkerProps) => <Mark {...p} kind="better" />} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
