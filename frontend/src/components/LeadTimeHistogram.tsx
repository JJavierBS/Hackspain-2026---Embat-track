import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatLead, formatNumber } from "../lib/format";

interface LeadTimeHistogramProps {
  /** Every bucket 0..windowMonths, as the API sends it. */
  histogram: { leadMonths: number; count: number }[];
  /** Median lead, drawn as a dashed ink mark on the nearest bucket and labelled with its exact value. null when nothing was detected. */
  median?: number | null;
  height?: number;
}

function HistogramTooltip({ active, payload }: { active?: boolean; payload?: { payload: { leadMonths: number; count: number } }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="border border-rule bg-film px-3 py-2 text-sm">
      <p className="font-semibold">{row.leadMonths === 0 ? "Detectado el mismo mes" : `Detectado ${formatLead(row.leadMonths)} antes`}</p>
      <p className="text-ink-muted">
        {row.count} {row.count === 1 ? "evento" : "eventos"}
      </p>
    </div>
  );
}

/**
 * How many events the score saw N months before they happened. One series, one color (Trajectory Slate);
 * the bar at 0 (seen the same month, not ahead) stays in the muted tone.
 */
export function LeadTimeHistogram({ histogram, median = null, height = 220 }: LeadTimeHistogramProps) {
  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={histogram} margin={{ top: 18, right: 4, bottom: 0, left: -16 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke="var(--color-rule)" strokeDasharray="2 4" />
            <XAxis
              dataKey="leadMonths"
              tick={{ fill: "var(--color-ink-muted)", fontSize: 14 }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-ink)", strokeOpacity: 0.3 }}
              interval={0}
            />
            <YAxis allowDecimals={false} tick={{ fill: "var(--color-ink-muted)", fontSize: 14 }} tickLine={false} axisLine={false} />
            <Tooltip content={<HistogramTooltip />} cursor={{ fill: "var(--color-scan-soft)", fillOpacity: 0.5 }} />
            <Bar dataKey="count" isAnimationActive={false} radius={0}>
              {histogram.map((h) => (
                <Cell key={h.leadMonths} fill={h.leadMonths === 0 ? "var(--color-panel-grid)" : "var(--color-series-trajectory)"} />
              ))}
            </Bar>
            {median !== null && (
              <ReferenceLine
                x={Math.round(median)}
                stroke="var(--color-ink)"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                label={{ value: `mediana ${formatNumber(median)}`, position: "top", fill: "var(--color-ink)", fontSize: 13, fontWeight: 600 }}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-center text-sm text-ink-muted">Meses entre el inicio de la señal y el evento · eventos por barra</p>
    </div>
  );
}
