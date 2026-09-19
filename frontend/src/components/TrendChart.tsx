import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BANDS, formatScore, monthCode, monthShort } from "../lib/format";

export interface TrendPoint {
  month: string;
  final: number | null;
  level: number | null;
  trajectory: number | null;
}

interface TrendChartProps {
  data: TrendPoint[];
  /** The month on the viewer. Drawn as the cyan scan band. */
  activeMonth: string;
  height?: number;
  /** Alerts to mark along the top edge. Several in one month share one mark. */
  markers?: TrendMarker[];
}

export interface TrendMarker {
  month: string;
  direction: "NEGATIVE" | "POSITIVE";
  label: string;
}

interface MonthMark {
  month: string;
  /** Negative wins a mixed month: the mark is there to catch the eye on risk. */
  negative: boolean;
  label: string;
}

function groupMarkers(markers: TrendMarker[]): MonthMark[] {
  const byMonth = new Map<string, TrendMarker[]>();
  for (const m of markers) byMonth.set(m.month, [...(byMonth.get(m.month) ?? []), m]);
  return [...byMonth.entries()].map(([month, list]) => ({
    month,
    negative: list.some((m) => m.direction === "NEGATIVE"),
    label: [...new Set(list.map((m) => m.label))].join(" · "),
  }));
}

/** A small drawn triangle on the top rule: down in red for a negative month, up in green for a positive one. */
function AlertMark({ cx, cy, mark }: { cx?: number; cy?: number; mark: MonthMark }) {
  if (cx === undefined || cy === undefined) return <g />;
  const s = 5.5;
  const d = mark.negative ? `M${cx - s} ${cy - 1}h${2 * s}l${-s} ${s * 1.6}z` : `M${cx - s} ${cy + s * 1.6 - 1}h${2 * s}l${-s} ${-s * 1.6}z`;
  return (
    <path d={d} fill={mark.negative ? "var(--color-down)" : "var(--color-up)"}>
      <title>{`${monthShort(mark.month)} · ${mark.label}`}</title>
    </path>
  );
}

const SERIES = [
  { key: "final", name: "Final", color: "var(--color-ink)", width: 3, dash: undefined },
  { key: "level", name: "Nivel", color: "var(--color-series-level)", width: 2.25, dash: undefined },
  { key: "trajectory", name: "Trayectoria", color: "var(--color-series-trajectory)", width: 2.25, dash: "7 4" },
] as const;

/** Minimum vertical gap, in px, between two line-end labels. */
const LABEL_GAP = 16;

/**
 * Pixel offsets that keep the line-end labels apart when the last values are close.
 * The plot spans about (height - 32) px for 100 points.
 */
function labelOffsets(last: TrendPoint | undefined, height: number): Record<string, number> {
  const offsets: Record<string, number> = {};
  if (!last) return offsets;
  const pxPerPoint = (height - 32) / 100;
  const sorted = SERIES.map((s) => ({ key: s.key, y: -(last[s.key] ?? 50) * pxPerPoint })).sort((a, b) => a.y - b.y);
  let previous = -Infinity;
  for (const item of sorted) {
    const placed = Math.max(item.y, previous + LABEL_GAP);
    offsets[item.key] = placed - item.y;
    previous = placed;
  }
  return offsets;
}

/** Score over time against the band zones, with the active month marked. */
export function TrendChart({ data, activeMonth, height = 260, markers = [] }: TrendChartProps) {
  const offsets = labelOffsets(data[data.length - 1], height);
  const marks = groupMarkers(markers);
  const markLabel = new Map(marks.map((m) => [m.month, m.label]));
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[15px] text-ink-muted">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <svg width="22" height="8" aria-hidden>
              <line x1="0" y1="4" x2="22" y2="4" stroke={s.color} strokeWidth={s.width} strokeDasharray={s.dash} />
            </svg>
            {s.name}
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-3 w-2.5 bg-scan/40" />
          Mes seleccionado
        </li>
        {marks.length > 0 && (
          <li className="flex items-center gap-2">
            <svg width="12" height="10" aria-hidden>
              <path d="M1 1h10L6 9.5z" fill="var(--color-down)" />
            </svg>
            <svg width="12" height="10" aria-hidden>
              <path d="M1 9.5h10L6 1z" fill="var(--color-up)" />
            </svg>
            Alertas
          </li>
        )}
      </ul>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: marks.length > 0 ? 14 : 8, right: 92, bottom: 0, left: -8 }}>
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
              tick={{ fill: "var(--color-ink-muted)", fontSize: 14 }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-rule)" }}
              interval="preserveStartEnd"
              minTickGap={32}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 35, 50, 65, 80, 100]}
              tick={{ fill: "var(--color-ink-muted)", fontSize: 14 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              labelFormatter={(m) => {
                const alerts = markLabel.get(String(m));
                return `${monthShort(String(m))} · ${monthCode(String(m))}${alerts ? ` — ${alerts}` : ""}`;
              }}
              formatter={(v) => formatScore(Number(v))}
              contentStyle={{
                border: "1px solid var(--color-rule)",
                borderRadius: 0,
                background: "var(--color-film)",
                fontVariantNumeric: "tabular-nums",
              }}
            />
            {marks.map((mark) => (
              <ReferenceDot
                key={mark.month}
                x={mark.month}
                y={100}
                ifOverflow="visible"
                shape={(p: { cx?: number; cy?: number }) => <AlertMark cx={p.cx} cy={p.cy} mark={mark} />}
              />
            ))}
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
                label={(props: { index?: number; x?: number | string; y?: number | string }) =>
                  props.index === data.length - 1 && data[props.index][s.key] !== null ? (
                    <text
                      key={s.key}
                      x={Number(props.x) + 8}
                      y={Number(props.y) + 4 + (offsets[s.key] ?? 0)}
                      fill={s.color}
                      fontSize={14}
                      fontWeight={600}
                    >
                      {s.name}
                    </text>
                  ) : (
                    <g key={`${s.key}-${props.index}`} />
                  )
                }
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
