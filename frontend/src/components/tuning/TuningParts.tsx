import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TuningResult } from "../../api/useTuning";
import type { Profile } from "../../hooks/useGlobalParams";
import { BANDS, PROFILE_LABELS, bandOf, formatScore, monthShort } from "../../lib/format";
import { Delta } from "../Delta";

/** Published = ink, tuned = Trajectory Slate: the two-series overlay of the Compare page. */
const TUNING_COLORS = { base: "var(--color-ink)", tuned: "var(--color-series-trajectory)" } as const;

const change = (base: number | null, tuned: number | null) => (base === null || tuned === null ? null : Math.round((tuned - base) * 10) / 10);

/** A score seated in band color with its square band chip, or an em dash. */
export function BandFigure({ score, size = "lg" }: { score: number | null; size?: "lg" | "md" }) {
  if (score === null) return <span className="text-ink-muted">—</span>;
  const band = bandOf(score);
  const big = size === "lg";
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`font-semibold tabular-nums [font-stretch:80%] ${big ? "text-4xl leading-none sm:text-5xl" : "text-2xl leading-8"}`}
        style={{ color: band.color }}
      >
        {formatScore(score)}
      </span>
      <span
        aria-label={`Banda ${band.band}`}
        className={`inline-flex items-center justify-center font-bold text-white ${big ? "h-8 w-8 text-base" : "h-6 w-6 text-sm"}`}
        style={{ background: band.color }}
      >
        {band.band}
      </span>
    </span>
  );
}

/** Published score against the tuned one for the active profile, with the change and what it does to the band. */
export function ScorePair({ result, profile, tunedLabel }: { result: TuningResult; profile: Profile; tunedLabel: string }) {
  const row = result.profiles.find((p) => p.profile === profile);
  if (!row) return null;
  const base = row.base.finalScore;
  const tuned = row.tuned.finalScore;
  const delta = change(base, tuned);
  const from = base === null ? null : bandOf(base).band;
  const to = tuned === null ? null : bandOf(tuned).band;
  return (
    <div className="grid gap-3">
      <dl className="grid grid-cols-1 gap-px border border-rule bg-rule min-[26rem]:grid-cols-2">
        <div className="grid content-start gap-2 bg-film px-4 py-3">
          <dt className="text-sm text-ink-muted">Publicada</dt>
          <dd>
            <BandFigure score={base} />
          </dd>
        </div>
        <div className="grid content-start gap-2 bg-film px-4 py-3">
          <dt className="text-sm text-ink-muted">{tunedLabel}</dt>
          <dd>
            <BandFigure score={tuned} />
          </dd>
        </div>
      </dl>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px]">
        <Delta value={delta} className="text-xl" />
        <span className="text-ink-muted">
          {from === null || to === null
            ? "Sin puntuación este mes."
            : from === to
              ? `La banda no cambia: sigue en ${from}.`
              : `La banda pasa de ${from} a ${to}.`}
        </span>
      </p>
    </div>
  );
}

/** The three buyer views at the month: published, tuned, change. The active profile is marked, not recoloured. */
export function ProfileTable({ result, active, tunedLabel }: { result: TuningResult; active: Profile; tunedLabel: string }) {
  return (
    <div className="min-w-0 overflow-x-auto">
    <table className="w-full border-collapse text-left text-[15px]">
      <caption className="sr-only">Puntuación final por perfil: publicada y {tunedLabel.toLowerCase()}</caption>
      <thead>
        <tr className="border-b border-ink/20 text-sm text-ink-muted">
          <th className="py-2 pr-2 font-medium">Perfil</th>
          <th className="px-2 py-2 text-right font-medium">Publicada</th>
          <th className="px-2 py-2 text-right font-medium">{tunedLabel}</th>
          <th className="py-2 pl-2 text-right font-medium">Cambio</th>
        </tr>
      </thead>
      <tbody>
        {result.profiles.map((p) => {
          const on = p.profile === active;
          return (
            <tr key={p.profile} className={`border-t border-rule ${on ? "font-semibold" : ""}`}>
              <th scope="row" className="py-2 pr-2 font-[inherit]">
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden className={`h-3 w-[3px] ${on ? "bg-ink" : "bg-transparent"}`} />
                  {PROFILE_LABELS[p.profile].name}
                  {on && <span className="sr-only">(perfil activo)</span>}
                </span>
              </th>
              <td className="px-2 py-2 text-right">
                <ScoreCell score={p.base.finalScore} />
              </td>
              <td className="px-2 py-2 text-right">
                <ScoreCell score={p.tuned.finalScore} />
              </td>
              <td className="py-2 pl-2 text-right">
                <Delta value={change(p.base.finalScore, p.tuned.finalScore)} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </div>
  );
}

function ScoreCell({ score }: { score: number | null }) {
  if (score === null) return <span className="text-ink-muted">—</span>;
  const band = bandOf(score);
  return (
    <span className="tabular-nums" style={{ color: band.color }}>
      {formatScore(score)} <span className="text-sm">{band.band}</span>
    </span>
  );
}

interface Row {
  month: string;
  base: number | null;
  tuned: number | null;
}

/** Final score over time, published against tuned, over the band zones, with the active month as the scan band. */
export function TuningChart({ result, activeMonth, tunedLabel, height = 260 }: { result: TuningResult; activeMonth: string; tunedLabel: string; height?: number }) {
  const data: Row[] = result.series.filter((p) => p.base !== null || p.tuned !== null);
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[15px] text-ink-muted">
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-[3px] w-6" style={{ background: TUNING_COLORS.base }} />
          Publicada
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-[3px] w-6" style={{ background: TUNING_COLORS.tuned }} />
          {tunedLabel}
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-3 w-2.5 bg-scan/40" />
          Mes activo
        </li>
      </ul>
      <div style={{ height }}>
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
            <ReferenceLine x={activeMonth} stroke="var(--color-scan)" strokeOpacity={0.22} strokeWidth={14} />
            <XAxis dataKey="month" tickFormatter={monthShort} tick={{ fill: "var(--color-ink-muted)", fontSize: 14 }} tickLine={false} axisLine={{ stroke: "var(--color-rule)" }} interval="preserveStartEnd" minTickGap={32} />
            <YAxis domain={[0, 100]} ticks={[0, 35, 50, 65, 80, 90, 100]} tick={{ fill: "var(--color-ink-muted)", fontSize: 14 }} tickLine={false} axisLine={false} />
            <Tooltip content={<Tip tunedLabel={tunedLabel} />} />
            <Line dataKey="base" stroke={TUNING_COLORS.base} strokeWidth={3} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            <Line dataKey="tuned" stroke={TUNING_COLORS.tuned} strokeWidth={3} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Tip({ tunedLabel, active, payload }: { tunedLabel: string; active?: boolean; payload?: { payload: Row }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="grid gap-1 border border-rule bg-film px-3 py-2 text-sm">
      <span className="font-semibold">{monthShort(row.month)}</span>
      <span>Publicada: {row.base === null ? "—" : formatScore(row.base)}</span>
      <span>
        {tunedLabel}: {row.tuned === null ? "—" : formatScore(row.tuned)}
      </span>
    </div>
  );
}
