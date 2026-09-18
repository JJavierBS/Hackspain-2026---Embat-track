import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BANDS, formatScore, monthCode, monthShort } from "../lib/format";

export interface TrendPoint {
  month: string;
  final: number;
  level: number;
  trajectory: number;
}

interface TrendChartProps {
  data: TrendPoint[];
  /** The month on the viewer. Drawn as the cyan scan band. */
  activeMonth: string;
  height?: number;
}

const SERIES = [
  { key: "final", name: "Final", color: "var(--color-ink)", width: 3, dash: undefined },
  { key: "level", name: "Nivel", color: "var(--color-band-a)", width: 1.75, dash: undefined },
  { key: "trajectory", name: "Trayectoria", color: "var(--color-scan)", width: 1.75, dash: "5 4" },
] as const;

/** Score over time against the band zones, with the active month marked. */
export function TrendChart({ data, activeMonth, height = 260 }: TrendChartProps) {
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-muted">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <svg width="22" height="8" aria-hidden>
              <line x1="0" y1="4" x2="22" y2="4" stroke={s.color} strokeWidth={s.width} strokeDasharray={s.dash} />
            </svg>
            {s.name}
          </li>
        ))}
      </ul>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            {BANDS.map((b, i) => (
              <ReferenceArea
                key={b.band}
                y1={Math.max(b.min, 0)}
                y2={i === 0 ? 100 : BANDS[i - 1].min}
                fill={b.color}
                fillOpacity={0.07}
                stroke="none"
                ifOverflow="hidden"
              />
            ))}
            <CartesianGrid vertical={false} stroke="var(--color-rule)" strokeDasharray="2 4" />
            <ReferenceLine x={activeMonth} stroke="var(--color-scan)" strokeOpacity={0.22} strokeWidth={14} />
            <XAxis
              dataKey="month"
              tickFormatter={monthShort}
              tick={{ fill: "var(--color-ink-muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-rule)" }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 35, 50, 65, 80, 100]}
              tick={{ fill: "var(--color-ink-muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              labelFormatter={(m) => `${monthShort(String(m))} · ${monthCode(String(m))}`}
              formatter={(v) => formatScore(Number(v))}
              contentStyle={{
                border: "1px solid var(--color-rule)",
                borderRadius: 0,
                background: "var(--color-film)",
                fontVariantNumeric: "tabular-nums",
              }}
            />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={s.width}
                strokeDasharray={s.dash}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
