import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { PortfolioRow, Status } from "../api/types";
import { usePortfolio } from "../api/queries";
import { BandLadder } from "../components/BandLadder";
import { Delta } from "../components/Delta";
import { Film } from "../components/Film";
import { IconDown, IconUp } from "../components/Icons";
import { LoadState } from "../components/LoadState";
import { PageHeader } from "../components/PageHeader";
import { Sparkline } from "../components/Sparkline";
import { StatusTag } from "../components/StatusTag";
import { useGlobalParams } from "../hooks/useGlobalParams";
import { useLinkSearch } from "../hooks/useLinkSearch";
import { BANDS, type Band, bandOf, confidenceLabel, formatScore, monthCode } from "../lib/format";

/** The six questions of the track, as status filters (SPEC §8.3). */
const QUESTIONS: { key: string; label: string; statuses: Status[] }[] = [
  { key: "healthy", label: "Sanas y excepcionales", statuses: ["HEALTHY", "EXCEPTIONAL"] },
  { key: "improving", label: "Mejorando", statuses: ["IMPROVING"] },
  { key: "turning", label: "Empiezan a torcerse", statuses: ["TURNING"] },
  { key: "dip", label: "Bache", statuses: ["DIP"] },
  { key: "decline", label: "Deterioro", statuses: ["STRUCTURAL_DECLINE"] },
  { key: "critical", label: "Críticas", statuses: ["CRITICAL"] },
];

type SortKey = "final" | "delta3m" | "level" | "traj" | "activeAlerts";

const COLUMNS: { key: SortKey; label: string; title: string }[] = [
  { key: "final", label: "Final", title: "Puntuación final 0–100 del perfil activo" },
  { key: "delta3m", label: "Δ 3m", title: "Cambio de la puntuación final frente a hace 3 meses" },
  { key: "level", label: "Nivel", title: "Salud actual 0–100" },
  { key: "traj", label: "Trayectoria", title: "Hacia dónde va: 50 = estable, más de 50 mejora" },
  { key: "activeAlerts", label: "Alertas", title: "Alertas negativas de los últimos 3 meses" },
];

export function PortfolioPage() {
  const { profile, month } = useGlobalParams();
  const [params, setParams] = useSearchParams();
  const { data, error, isPending } = usePortfolio(profile, month);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "final", desc: true });
  const linkSearch = useLinkSearch();

  const filter = QUESTIONS.find((q) => q.key === params.get("status")) ?? null;

  function toggleFilter(key: string) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (next.get("status") === key) next.delete("status");
      else next.set("status", key);
      return next;
    });
  }

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    const filtered = filter ? all.filter((r) => r.status !== null && filter.statuses.includes(r.status)) : all;
    const dir = sort.desc ? -1 : 1;
    // A missing value (no trajectory yet, no score 3 months before) always sorts last.
    return [...filtered].sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return dir * (x - y);
    });
  }, [data, filter, sort]);

  /** Rank by final score in the active profile, whatever the sort or filter. */
  const rankOf = useMemo(() => {
    const ranked = [...(data?.rows ?? [])].sort((a, b) => b.final - a.final);
    return new Map(ranked.map((r, i) => [r.id, i + 1]));
  }, [data]);

  const counts = useMemo(() => {
    const byBand: Partial<Record<Band, number>> = {};
    for (const b of BANDS) byBand[b.band] = 0;
    for (const r of data?.rows ?? []) byBand[bandOf(r.final).band] = (byBand[bandOf(r.final).band] ?? 0) + 1;
    return byBand;
  }, [data]);

  return (
    <div className="grid gap-12">
      <PageHeader
        title="Cartera"
        lede="Quién está sana, quién mejora y quién empieza a torcerse. Cambia de perfil y el ranking se recalcula con los pesos de ese comprador."
      />

      {error ? (
        <LoadState error={error} />
      ) : isPending ? (
        <LoadState />
      ) : (
        <>
          <Film
            title="Distribución por banda"
            meta={`${data.rows.length} entidades · ${monthCode(month)}${data.unscored > 0 ? ` · ${data.unscored} sin actividad todavía` : ""}`}
          >
            <BandLadder counts={counts} />
          </Film>

          <Film
            title="Las seis preguntas"
            meta={data.rows.some((r) => r.status !== null) ? "Pulsa para filtrar el ranking" : "Los estados llegan con el bloque 5"}
          >
            <div className="flex flex-wrap gap-2">
              {QUESTIONS.map((q) => {
                const n = data.rows.filter((r) => r.status !== null && q.statuses.includes(r.status)).length;
                const active = filter?.key === q.key;
                return (
                  <button
                    key={q.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleFilter(q.key)}
                    disabled={n === 0 && !active}
                    className={`flex items-center gap-2 border px-3 py-2 text-[15px] transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                      active ? "border-ink bg-ink text-film" : "border-ink/25 bg-film text-ink hover:border-ink"
                    }`}
                  >
                    {q.label}
                    <span className={`min-w-6 px-1.5 text-center text-sm font-semibold ${active ? "bg-film text-ink" : "bg-panel"}`}>{n}</span>
                  </button>
                );
              })}
            </div>
          </Film>

          <Film
            title="Ranking de entidades"
            meta={filter ? `${rows.length} de ${data.rows.length} · ${filter.label}` : `${rows.length} entidades`}
          >
            <ul className="-mx-5 lg:hidden">
              {rows.map((r) => (
                <CompactRow key={r.id} row={r} rank={rankOf.get(r.id) ?? 0} href={`/entity/${r.id}${linkSearch}`} />
              ))}
            </ul>
            <div className="-mx-5 hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[960px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-ink/20 text-sm text-ink-muted">
                    <th className="w-12 px-5 py-2 font-medium">#</th>
                    <th className="px-2 py-2 font-medium">Entidad</th>
                    {COLUMNS.map((c, i) => [
                      i === 2 && (
                        <th key="spark" className="px-2 py-2 font-medium">
                          12 meses
                        </th>
                      ),
                      <th
                        key={c.key}
                        className="px-2 py-2 font-medium"
                        aria-sort={sort.key === c.key ? (sort.desc ? "descending" : "ascending") : "none"}
                      >
                        <button
                          type="button"
                          title={c.title}
                          onClick={() => setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : true }))}
                          className={`inline-flex items-center gap-1 hover:text-ink ${sort.key === c.key ? "font-semibold text-ink" : ""}`}
                        >
                          {c.label}
                          <span aria-hidden className="inline-flex w-3.5">
                            {sort.key === c.key && (sort.desc ? <IconDown width={13} height={13} /> : <IconUp width={13} height={13} />)}
                          </span>
                        </button>
                      </th>,
                    ])}
                    <th className="px-2 py-2 font-medium">Estado</th>
                    <th className="px-5 py-2 font-medium" title="Confianza: historia y datos disponibles">
                      Confianza
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <Row key={r.id} row={r} rank={rankOf.get(r.id) ?? 0} href={`/entity/${r.id}${linkSearch}`} />
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length === 0 && <p className="pt-4 text-ink-muted">Ninguna entidad cumple este filtro en {monthCode(month)}.</p>}
          </Film>
        </>
      )}
    </div>
  );
}

function Row({ row, rank, href }: { row: PortfolioRow; rank: number; href: string }) {
  const band = bandOf(row.final);
  return (
    <tr className="group border-b border-rule last:border-b-0 hover:bg-scan-soft/40">
      <td className="px-5 py-3 text-ink-muted">{rank}</td>
      <td className="px-2 py-3">
        <Link to={href} className="font-semibold text-ink underline-offset-4 group-hover:underline">
          {row.name}
        </Link>
        <span className="block text-sm text-ink-muted">
          {row.name === row.id ? typeLabel(row) : `${row.id} · ${typeLabel(row)}`}
        </span>
      </td>
      <td className="px-2 py-3">
        <span className="flex items-center gap-2">
          <span className="text-2xl font-semibold [font-stretch:85%]" style={{ color: band.color }}>
            {formatScore(row.final)}
          </span>
          <span className="inline-flex h-6 w-6 items-center justify-center text-sm font-bold text-white" style={{ background: band.color }}>
            {band.band}
          </span>
        </span>
      </td>
      <td className="px-2 py-3">
        <Delta value={row.delta3m} />
      </td>
      <td className="px-2 py-3">
        <Sparkline values={row.sparkline} />
      </td>
      <td className="px-2 py-3">{formatScore(row.level)}</td>
      <td className="px-2 py-3">{row.traj === null ? <span className="text-ink-muted">—</span> : formatScore(row.traj)}</td>
      <td className="px-2 py-3">
        {row.activeAlerts > 0 ? (
          <span className="inline-flex min-w-7 justify-center border border-down/50 px-1.5 font-semibold text-down">{row.activeAlerts}</span>
        ) : (
          <span className="text-ink-muted">0</span>
        )}
      </td>
      <td className="px-2 py-3">
        <StatusTag status={row.status} />
      </td>
      <td className="px-5 py-3 text-ink-muted">{confidenceLabel(row.confidence)}</td>
    </tr>
  );
}

/** The data has no entity names yet: name = id, so the second line only states the type. */
function typeLabel(row: PortfolioRow): string {
  return row.entityType === "GROUP" ? "Grupo" : "Empresa";
}

/** The ranking row below lg: every number whole, nothing scrolls. */
function CompactRow({ row, rank, href }: { row: PortfolioRow; rank: number; href: string }) {
  const band = bandOf(row.final);
  return (
    <li className="border-b border-rule px-5 py-4 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <span className="min-w-0">
          <span className="text-sm text-ink-muted">#{rank} · {row.name === row.id ? typeLabel(row) : row.id}</span>
          <Link to={href} className="block font-semibold text-ink underline-offset-4 hover:underline">
            {row.name}
          </Link>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-3xl font-semibold [font-stretch:85%]" style={{ color: band.color }}>
            {formatScore(row.final)}
          </span>
          <span className="inline-flex h-6 w-6 items-center justify-center text-sm font-bold text-white" style={{ background: band.color }}>
            {band.band}
          </span>
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Sparkline values={row.sparkline} width={120} />
        <span className="flex items-center gap-3">
          <Delta value={row.delta3m} />
          <span className="text-sm text-ink-muted">3 meses</span>
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusTag status={row.status} />
        {row.activeAlerts > 0 && (
          <span className="border border-down/50 px-2 py-0.5 text-sm font-medium text-down">
            {row.activeAlerts} {row.activeAlerts === 1 ? "alerta" : "alertas"}
          </span>
        )}
      </div>
    </li>
  );
}
