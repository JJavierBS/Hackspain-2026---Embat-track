import { bandOf } from "../lib/format";

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
}

/** 12 months of the final score. The line takes the band color of its last value. */
export function Sparkline({ values, width = 112, height = 32 }: SparklineProps) {
  if (values.length < 2) return <span className="text-ink-muted">—</span>;
  const min = Math.min(...values, 50) - 2;
  const max = Math.max(...values, 50) + 2;
  const x = (i: number) => (i / (values.length - 1)) * (width - 4) + 2;
  const y = (v: number) => height - 2 - ((v - min) / (max - min)) * (height - 4);
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const last = values[values.length - 1];
  const color = bandOf(last).color;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Evolución 12 meses, de ${values[0]} a ${last}`}>
      <line x1="0" x2={width} y1={y(50)} y2={y(50)} stroke="var(--color-rule)" strokeDasharray="2 3" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(last)} r="2.75" fill={color} />
    </svg>
  );
}
