import { Link, useParams } from "react-router-dom";
import type { CategoryScore, EntityDetail } from "../api/types";
import { useEntity } from "../api/queries";
import { Delta } from "../components/Delta";
import { Film } from "../components/Film";
import { LoadState } from "../components/LoadState";
import { Meter } from "../components/Meter";
import { PageHeader } from "../components/PageHeader";
import { ScoreReadout } from "../components/ScoreReadout";
import { StatusTag, TrendTag } from "../components/StatusTag";
import { TrendChart } from "../components/TrendChart";
import { MONTHS, useGlobalParams } from "../hooks/useGlobalParams";
import { useLinkSearch } from "../hooks/useLinkSearch";
import {
  CATEGORY_LABELS,
  CONFIDENCE_LABELS,
  REGIME_LABELS,
  bandOf,
  formatDelta,
  formatEur,
  formatPct,
  formatScore,
  monthCode,
} from "../lib/format";

export function EntityPage() {
  const { id = "" } = useParams();
  const { profile, month } = useGlobalParams();
  const { data, error, isPending } = useEntity(id, profile, month);
  const linkSearch = useLinkSearch();

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

  return (
    <div className="grid gap-12">
      <PageHeader
        title={data.name}
        lede={`${data.entityType === "GROUP" ? "Grupo" : "Empresa"} ${data.id} · confianza ${CONFIDENCE_LABELS[row.confidence].toLowerCase()}.`}
      />

      <Film title="Radiografía" meta={`Perfil activo · ${monthCode(month)}`}>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="grid content-start gap-7">
            <ScoreReadout score={row.final} delta={row.delta3m} against={`vs ${against}`} />
            <div className="flex flex-wrap items-center gap-2">
              <StatusTag status={row.status} />
              <TrendTag traj={row.traj} />
              {row.regime !== "STABLE" && <span className="border border-rule px-2 py-0.5 text-sm">{REGIME_LABELS[row.regime]}</span>}
              <span className="border border-rule px-2 py-0.5 text-sm text-ink-muted">Confianza {CONFIDENCE_LABELS[row.confidence].toLowerCase()}</span>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Meter label="Nivel" value={row.level} hint="Salud actual" />
              <Meter label="Trayectoria" value={row.traj} hint="50 = estable · más de 50 mejora" direction />
            </div>
          </div>
          <TrendChart
            data={data.timeline.map((p) => ({ month: p.month, final: p.final, level: p.level, trajectory: p.traj }))}
            activeMonth={month}
            height={300}
          />
        </div>
      </Film>

      <div className="grid gap-12 lg:grid-cols-2">
        <Drivers categories={data.categories} final={row.final} />
        <Changes categories={data.categories} against={against} />
      </div>

      <Categories categories={data.categories} />
      <ProductPanel data={data} />
    </div>
  );
}

/** Weighted categories only: a zero weight does not move this profile's score. */
function weighted(categories: CategoryScore[]) {
  return categories.filter((c) => c.weight > 0);
}

function Drivers({ categories, final }: { categories: CategoryScore[]; final: number }) {
  const rows = weighted(categories).sort((a, b) => b.contribution - a.contribution);
  const max = Math.max(...rows.map((c) => Math.abs(c.contribution)), 1);
  const sum = rows.reduce((a, c) => a + c.contribution, 0);
  return (
    <Film title="Por qué esta puntuación" meta="Puntos que aporta cada categoría">
      <ul className="grid gap-2.5">
        {rows.map((c) => {
          const pct = (Math.abs(c.contribution) / max) * 50;
          const up = c.contribution >= 0;
          return (
            <li key={c.category} className="grid grid-cols-[minmax(0,11rem)_1fr_4rem] items-center gap-3 text-[15px]">
              <span className="truncate" title={`${CATEGORY_LABELS[c.category]} · peso ${c.weight}`}>
                {CATEGORY_LABELS[c.category]}
              </span>
              <span className="relative h-5">
                <span aria-hidden className="absolute inset-y-[-3px] left-1/2 w-px bg-ink/50" />
                <span
                  className={`absolute inset-y-0 ${up ? "bg-up/80" : "bg-down/80"}`}
                  style={up ? { left: "50%", width: `${pct}%` } : { right: "50%", width: `${pct}%` }}
                />
              </span>
              <span className={`text-right font-semibold ${up ? "text-up" : "text-down"}`}>{formatDelta(c.contribution)}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-5 border-t border-rule pt-3 text-[15px] text-ink-muted">
        50 + suma de aportaciones ({formatDelta(sum)})
        {Math.abs(final - 50 - sum) >= 0.05 && <> + redondeo ({formatDelta(final - 50 - sum)})</>} ={" "}
        <span className="font-semibold text-ink">{formatScore(final)}</span>
      </p>
    </Film>
  );
}

function Changes({ categories, against }: { categories: CategoryScore[]; against: string }) {
  const movers = weighted(categories)
    .filter((c) => Math.abs(c.contributionDelta3m) >= 0.1)
    .sort((a, b) => Math.abs(b.contributionDelta3m) - Math.abs(a.contributionDelta3m))
    .slice(0, 4);
  return (
    <Film title="Qué cambió" meta={`Frente a ${against}`}>
      {movers.length === 0 ? (
        <p className="text-ink-muted">Ninguna categoría movió la nota más de 0,1 puntos.</p>
      ) : (
        <ul className="grid gap-4">
          {movers.map((c) => (
            <li key={c.category} className="flex items-start justify-between gap-4 border-b border-dashed border-rule pb-3 last:border-b-0">
              <span>
                <span className="block font-semibold">{CATEGORY_LABELS[c.category]}</span>
                <span className="text-[15px] text-ink-muted">
                  {c.contributionDelta3m > 0 ? "Sube" : "Baja"} su aportación: nivel {formatScore(c.level)}, trayectoria {formatScore(c.traj)}.
                </span>
              </span>
              <Delta value={c.contributionDelta3m} className="text-lg" />
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
          const band = bandOf(c.level);
          return (
            <li key={c.category} className={c.weight === 0 ? "opacity-55" : ""}>
              <div className="flex items-baseline justify-between gap-3 text-[15px]">
                <span className="font-medium">{CATEGORY_LABELS[c.category]}</span>
                <span className="flex items-baseline gap-3">
                  <span className="text-sm text-ink-muted">peso {c.weight}</span>
                  <span className="text-lg font-semibold" style={{ color: band.color }}>
                    {formatScore(c.level)}
                  </span>
                </span>
              </div>
              <div className="mt-1.5 h-2 bg-panel-grid">
                <div className="h-full" style={{ width: `${c.level}%`, background: band.color }} />
              </div>
            </li>
          );
        })}
      </ul>
    </Film>
  );
}

const ACTION_LABELS = {
  INCREASE: "Aumentar",
  REDUCE: "Reducir",
  FREEZE: "Congelar",
  MAINTAIN: "Mantener",
  DECLINE: "Denegar",
} as const;

const BINDING_LABELS = { SCORE: "puntuación", DSCR: "cobertura de deuda (DSCR)", RUNWAY: "meses de caja" } as const;

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="bg-film px-4 py-3">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold [font-stretch:88%]">{value}</dd>
      {sub && <dd className="mt-0.5 text-sm text-ink-muted">{sub}</dd>}
    </div>
  );
}

function ProductPanel({ data }: { data: EntityDetail }) {
  const { profile } = useGlobalParams();

  if (profile === "BANK") {
    const { limit } = data;
    const change = limit.limitEur - limit.previousLimitEur;
    const tone =
      limit.action === "INCREASE" ? "text-up" : limit.action === "REDUCE" || limit.action === "FREEZE" || limit.action === "DECLINE" ? "text-down" : "";
    return (
      <Film title="Límite de circulante" meta="Motor de límites · se recalcula cada mes">
        <dl className="grid gap-px border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Límite recomendado" value={formatEur(limit.limitEur)} sub={<>Mes anterior {formatEur(limit.previousLimitEur)}</>} />
          <Stat
            label="Acción"
            value={<span className={tone}>{ACTION_LABELS[limit.action]}</span>}
            sub={
              <span className={limit.action === "MAINTAIN" ? "" : change > 0 ? "text-up" : change < 0 ? "text-down" : ""}>
                {change > 0 ? "+" : change < 0 ? "\u2212" : ""}
                {formatEur(Math.abs(change))}
                {limit.previousLimitEur > 0 && ` (${formatDelta((change / limit.previousLimitEur) * 100)} %)`}
                {limit.action === "MAINTAIN" ? " · dentro de la banda de ±10 %" : " frente al mes anterior"}
              </span>
            }
          />
          <Stat label="Diferencial" value={limit.spreadBps === null ? "—" : `${limit.spreadBps} pb`} sub="Según banda" />
          <Stat label="Restricción activa" value={<span className="text-lg">{BINDING_LABELS[limit.bindingConstraint]}</span>} />
        </dl>
        <p className="mt-3 text-sm text-ink-muted">Cálculo simplificado del motor de límites (SPEC §10.1).</p>
      </Film>
    );
  }

  if (profile === "INSURER") {
    const { premium } = data;
    return (
      <Film title="Prima de seguro de crédito" meta="Prima dinámica · se revisa cada mes">
        <dl className="grid gap-px border border-rule bg-rule sm:grid-cols-3">
          <Stat
            label="Tasa de prima"
            value={premium.premiumRate === null ? "No asegurable" : formatPct(premium.premiumRate)}
            sub={premium.previousPremiumRate === null ? "Mes anterior: no asegurable" : `Mes anterior ${formatPct(premium.previousPremiumRate)}`}
          />
          <Stat label="Límite recomendado por comprador" value={formatEur(premium.recommendedBuyerLimitEur)} sub="Aproximación a la exposición" />
          <Stat label="Banda" value={bandOf(data.row.final).band} sub={`${formatScore(data.row.final)} puntos`} />
        </dl>
      </Film>
    );
  }

  const { momentum } = data;
  return (
    <Film title="Momentum" meta="Ranking del perfil Fondo">
      <dl className="grid gap-px border border-rule bg-rule sm:grid-cols-3">
        <Stat label="Posición" value={`${momentum.rank} de ${momentum.of}`} />
        <Stat label="Percentil de trayectoria" value={`P${momentum.trajPercentile}`} sub="Frente al resto de la cartera" />
        <Stat
          label="Estrella emergente"
          value={momentum.risingStar ? "Sí" : "No"}
          sub="Nivel menor de 60 y trayectoria de 70 o más"
        />
      </dl>
    </Film>
  );
}
