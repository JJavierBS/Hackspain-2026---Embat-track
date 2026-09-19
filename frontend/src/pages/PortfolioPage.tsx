import { type ReactNode, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { PortfolioRow, Status } from "../api/types";
import { useMethodology, usePortfolio } from "../api/queries";
import { BandLadder } from "../components/BandLadder";
import { Delta } from "../components/Delta";
import { Film } from "../components/Film";
import { IconDown, IconStar, IconUp } from "../components/Icons";
import { LoadState } from "../components/LoadState";
import { PageHeader } from "../components/PageHeader";
import { Sparkline } from "../components/Sparkline";
import { StatusTag } from "../components/StatusTag";
import { useGlobalParams } from "../hooks/useGlobalParams";
import { useLinkSearch } from "../hooks/useLinkSearch";
import { BANDS, type Band, bandOf, confidenceLabel, formatScore, monthCode } from "../lib/format";

/** The six questions of the track, as status filters on the ranking (SPEC §8.3). */
const QUESTIONS: { key: string; label: string; statuses: Status[]; dir?: "up" | "down" }[] = [
  { key: "healthy", label: "Sanas y excepcionales", statuses: ["HEALTHY", "EXCEPTIONAL"] },
  { key: "improving", label: "Mejorando", statuses: ["IMPROVING"], dir: "up" },
  { key: "turning", label: "Empiezan a torcerse", statuses: ["TURNING"], dir: "down" },
  { key: "dip", label: "Bache", statuses: ["DIP"], dir: "down" },
  { key: "decline", label: "Deterioro", statuses: ["STRUCTURAL_DECLINE"], dir: "down" },
  { key: "critical", label: "Críticas", statuses: ["CRITICAL"] },
];

type SortKey = "final" | "delta3m" | "level" | "traj" | "activeAlerts";

const COLUMNS: { key: SortKey; label: string; title: string }[] = [
  { key: "final", label: "Final", title: "Puntuación final 0–100 del perfil activo" },
  { key: "delta3m", label: "Δ 3m", title: "Cambio de la puntuación final frente a hace 3 meses" },
  { key: "level", label: "Nivel", title: "Salud actual 0–100" },
  { key: "traj", label: "Trayectoria", title: "Hacia dónde va: 50 = estable, más de 50 mejora" },
  { key: "activeAlerts", label: "Alertas", title: "Alertas negativas activas este mes" },
];

const UNTRACKED_HINT =
  "Sin historial: los datos disponibles cubren muy poco de lo que pesa este perfil. La puntuación se muestra, pero no entra en el ranking, las bandas ni los filtros.";

function isUntracked(r: PortfolioRow): boolean {
  return r.confidence === "INSUFFICIENT";
}

/** A missing value (no trajectory yet, no score 3 months before) always sorts last. */
function sortRows(rows: PortfolioRow[], sort: { key: SortKey; desc: boolean }): PortfolioRow[] {
  const dir = sort.desc ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = a[sort.key];
    const y = b[sort.key];
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return dir * (x - y);
  });
}

export function PortfolioPage() {
  const { profile, month } = useGlobalParams();
  const [params, setParams] = useSearchParams();
  const { data, error, isPending } = usePortfolio(profile, month);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "final", desc: true });
  const linkSearch = useLinkSearch();

  const filter = QUESTIONS.find((q) => q.key === params.get("status")) ?? null;
  // Rising stars are a FUND screen (SPEC §10.3). On other profiles the chip is hidden and ?rising is ignored.
  const isFund = profile === "FUND";
  const rising = isFund && params.get("rising") === "1";
  const { data: methodology } = useMethodology();
  const risingRule = methodology
    ? `Estrella emergente: nivel menor de ${methodology.momentum.risingStarMaxLevel} y trayectoria de ${methodology.momentum.risingStarMinTraj} o más`
    : "Estrella emergente: nivel todavía bajo y trayectoria fuerte";

  function toggleRising() {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (next.get("rising") === "1") next.delete("rising");
      else next.set("rising", "1");
      return next;
    });
  }

  function clearFilters() {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("status");
      next.delete("rising");
      return next;
    });
  }

  function toggleFilter(key: string) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (next.get("status") === key) next.delete("status");
      else next.set("status", key);
      return next;
    });
  }

  // A score on too little data stays visible but out of the ranking, the bands and the filters.
  const trusted = useMemo(() => (data?.rows ?? []).filter((r) => !isUntracked(r)), [data]);
  const untracked = useMemo(() => (data?.rows ?? []).filter(isUntracked), [data]);

  const rows = useMemo(() => {
    const filtered = trusted
      .filter((r) => !filter || (r.status !== null && filter.statuses.includes(r.status)))
      .filter((r) => !rising || r.risingStar === true);
    return sortRows(filtered, sort);
  }, [trusted, filter, rising, sort]);

  // Only without a filter: an untrusted row answers none of the six questions.
  const untrackedRows = useMemo(() => (filter || rising ? [] : sortRows(untracked, sort)), [untracked, filter, rising, sort]);

  /** Rank by final score in the active profile, whatever the sort or filter. */
  const rankOf = useMemo(() => {
    const ranked = [...trusted].sort((a, b) => b.final - a.final);
    return new Map(ranked.map((r, i) => [r.id, i + 1]));
  }, [trusted]);

  const counts = useMemo(() => {
    const byBand: Partial<Record<Band, number>> = {};
    for (const b of BANDS) byBand[b.band] = 0;
    for (const r of trusted) byBand[bandOf(r.final).band] = (byBand[bandOf(r.final).band] ?? 0) + 1;
    return byBand;
  }, [trusted]);

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
            meta={`${trusted.length} entidades · ${monthCode(month)}${untracked.length > 0 ? ` · ${untracked.length} sin historial` : ""}${data.unscored > 0 ? ` · ${data.unscored} sin actividad todavía` : ""}`}
          >
            <BandLadder counts={counts} />
          </Film>

          <Film
            title="Ranking de entidades"
            meta={
              filter || rising
                ? `${rows.length} de ${trusted.length} · ${[filter?.label, rising && "Estrellas emergentes"].filter(Boolean).join(" · ")}`
                : `${rows.length} entidades${untrackedRows.length > 0 ? ` · ${untrackedRows.length} sin historial al final` : ""}`
            }
          >
            <StatusFilters
              rows={trusted}
              active={filter?.key ?? null}
              onToggle={toggleFilter}
              onClear={clearFilters}
              anyFilter={filter !== null || rising}
              pendingNote={untracked.length > 0 ? "Ninguna entidad con historial suficiente este mes." : "Los estados llegan con el bloque 5."}
            >
              {isFund && (
                <>
                  <span aria-hidden className="mx-1 hidden w-px self-stretch bg-rule sm:block" />
                  <RisingChip
                    active={rising}
                    count={trusted.filter((r) => r.risingStar === true).length}
                    title={risingRule}
                    onToggle={toggleRising}
                  />
                </>
              )}
            </StatusFilters>
            <ul className="-mx-5 lg:hidden">
              {rows.map((r) => (
                <CompactRow key={r.id} row={r} rank={rankOf.get(r.id) ?? 0} href={`/entity/${r.id}${linkSearch}`} star={isFund && r.risingStar === true ? risingRule : null} />
              ))}
              {untrackedRows.length > 0 && (
                <li className="border-y border-rule bg-panel px-5 py-3">
                  <UntrackedHeading count={untrackedRows.length} />
                </li>
              )}
              {untrackedRows.map((r) => (
                <CompactRow key={r.id} row={r} rank={null} href={`/entity/${r.id}${linkSearch}`} star={null} />
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
                    <Row key={r.id} row={r} rank={rankOf.get(r.id) ?? 0} href={`/entity/${r.id}${linkSearch}`} star={isFund && r.risingStar === true ? risingRule : null} />
                  ))}
                  {untrackedRows.length > 0 && (
                    <tr className="border-y border-rule bg-panel">
                      <td colSpan={10} className="px-5 py-3">
                        <UntrackedHeading count={untrackedRows.length} />
                      </td>
                    </tr>
                  )}
                  {untrackedRows.map((r) => (
                    <Row key={r.id} row={r} rank={null} href={`/entity/${r.id}${linkSearch}`} star={null} />
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length === 0 && untrackedRows.length === 0 && <p className="pt-4 text-ink-muted">Ninguna entidad cumple este filtro en {monthCode(month)}.</p>}
          </Film>
        </>
      )}
    </div>
  );
}

const CHIP =
  "flex shrink-0 items-center gap-2 border px-3 py-1.5 text-[15px] whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-45";
const CHIP_ON = "border-ink bg-ink text-film";
const CHIP_OFF = "border-ink/25 bg-film text-ink hover:border-ink";

function ChipCount({ n, on }: { n: number; on: boolean }) {
  return <span className={`min-w-6 px-1.5 text-center text-sm font-semibold tabular-nums ${on ? "bg-film text-ink" : "bg-panel"}`}>{n}</span>;
}

/**
 * The filter bar on top of the ranking: "Todas" plus one chip per status question, each with its count.
 * The arrows repeat the ones of the Estado column, so a chip and the rows it keeps read the same.
 */
function StatusFilters({
  rows, active, onToggle, onClear, anyFilter, pendingNote, children,
}: {
  rows: PortfolioRow[];
  active: string | null;
  onToggle: (key: string) => void;
  onClear: () => void;
  anyFilter: boolean;
  pendingNote: string;
  children?: ReactNode;
}) {
  const hasStatus = rows.some((r) => r.status !== null);
  return (
    <div className="-mx-5 flex items-center gap-2 overflow-x-auto border-b border-ink/20 px-5 pb-4 sm:flex-wrap">
      <span id="status-filter-label" className="mr-1 shrink-0 text-sm text-ink-muted">
        Filtrar
      </span>
      <div role="group" aria-labelledby="status-filter-label" className="contents">
        <button type="button" aria-pressed={!anyFilter} onClick={onClear} className={`${CHIP} ${!anyFilter ? CHIP_ON : CHIP_OFF}`}>
          Todas
          <ChipCount n={rows.length} on={!anyFilter} />
        </button>
        {hasStatus ? (
          QUESTIONS.map((q) => {
            const n = rows.filter((r) => r.status !== null && q.statuses.includes(r.status)).length;
            const on = active === q.key;
            const Icon = q.dir === "up" ? IconUp : q.dir === "down" ? IconDown : null;
            return (
              <button
                key={q.key}
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(q.key)}
                disabled={n === 0 && !on}
                className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
              >
                {Icon && <Icon width={14} height={14} className={on ? "" : q.dir === "up" ? "text-up" : "text-down"} />}
                {q.label}
                <ChipCount n={n} on={on} />
              </button>
            );
          })
        ) : (
          <span className="text-sm text-ink-muted">{pendingNote}</span>
        )}
        {children}
      </div>
    </div>
  );
}

/** The rising-star filter of the FUND view, shaped like the status chips. */
function RisingChip({ active, count, title, onToggle }: { active: boolean; count: number; title: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={title}
      onClick={onToggle}
      disabled={count === 0 && !active}
      className={`${CHIP} ${active ? CHIP_ON : CHIP_OFF}`}
    >
      <IconStar width={15} height={15} />
      Estrellas emergentes
      <ChipCount n={count} on={active} />
    </button>
  );
}

/** "Estrella emergente" next to a name on the FUND view. The rule is the tooltip. */
function StarTag({ rule }: { rule: string }) {
  return (
    <span title={rule} className="inline-flex items-center gap-1 border border-rule px-1.5 text-sm font-medium whitespace-nowrap text-ink">
      <IconStar width={13} height={13} />
      Estrella emergente
    </span>
  );
}

/** The badge of a score on too little data. Dashed: a provisional reading, not a verdict. */
function UntrackedTag() {
  return (
    <span title={UNTRACKED_HINT} className="inline-flex items-center border border-dashed border-ink-muted px-1.5 text-sm font-medium whitespace-nowrap text-ink-muted">
      Sin historial
    </span>
  );
}

function UntrackedHeading({ count }: { count: number }) {
  return (
    <p className="text-sm text-ink-muted">
      <span className="font-semibold text-ink">Sin historial · {count}</span>
      <span className="ml-2">Puntuación provisional: los datos cubren muy poco de lo que pesa este perfil. Fuera del ranking, las bandas y los filtros.</span>
    </p>
  );
}

/** The final score with its band. A score without track record shows neutral, with no band letter. */
function ScoreMark({ row, size }: { row: PortfolioRow; size: "text-2xl" | "text-3xl" }) {
  if (isUntracked(row)) {
    return (
      <span className={`${size} font-semibold text-ink-muted [font-stretch:85%]`} title={UNTRACKED_HINT}>
        {formatScore(row.final)}
      </span>
    );
  }
  const band = bandOf(row.final);
  return (
    <span className="flex items-center gap-2">
      <span className={`${size} font-semibold [font-stretch:85%]`} style={{ color: band.color }}>
        {formatScore(row.final)}
      </span>
      <span className="inline-flex h-6 w-6 items-center justify-center text-sm font-bold text-white" style={{ background: band.color }}>
        {band.band}
      </span>
    </span>
  );
}

function Row({ row, rank, href, star }: { row: PortfolioRow; rank: number | null; href: string; star: string | null }) {
  const untracked = isUntracked(row);
  return (
    <tr className="group border-b border-rule last:border-b-0 hover:bg-scan-soft/40">
      <td className="px-5 py-3 text-ink-muted">{rank ?? "—"}</td>
      <td className="px-2 py-3">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link to={href} className="font-semibold text-ink underline-offset-4 group-hover:underline">
            {row.name}
          </Link>
          {star && <StarTag rule={star} />}
          {untracked && <UntrackedTag />}
        </span>
        <span className="block text-sm text-ink-muted">
          {row.name === row.id ? typeLabel(row) : `${row.id} · ${typeLabel(row)}`}
        </span>
      </td>
      <td className="px-2 py-3">
        <ScoreMark row={row} size="text-2xl" />
      </td>
      <td className="px-2 py-3">
        <Delta value={row.delta3m} />
      </td>
      <td className="px-2 py-3">
        <Sparkline values={row.sparkline} neutral={untracked} />
      </td>
      <td className={`px-2 py-3 ${untracked ? "text-ink-muted" : ""}`}>{formatScore(row.level)}</td>
      <td className="px-2 py-3">{row.traj === null ? <span className="text-ink-muted">—</span> : formatScore(row.traj)}</td>
      <td className="px-2 py-3">
        {row.activeAlerts > 0 ? (
          <span className="inline-flex min-w-7 justify-center border border-down/50 px-1.5 font-semibold text-down">{row.activeAlerts}</span>
        ) : (
          <span className="text-ink-muted">0</span>
        )}
      </td>
      <td className="px-2 py-3">
        <StatusTag status={untracked ? null : row.status} />
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
function CompactRow({ row, rank, href, star }: { row: PortfolioRow; rank: number | null; href: string; star: string | null }) {
  const untracked = isUntracked(row);
  return (
    <li className="border-b border-rule px-5 py-4 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <span className="min-w-0">
          <span className="text-sm text-ink-muted">{rank === null ? "" : `#${rank} · `}{row.name === row.id ? typeLabel(row) : row.id}</span>
          <Link to={href} className="block font-semibold text-ink underline-offset-4 hover:underline">
            {row.name}
          </Link>
        </span>
        <span className="shrink-0">
          <ScoreMark row={row} size="text-3xl" />
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Sparkline values={row.sparkline} width={120} neutral={untracked} />
        <span className="flex items-center gap-3">
          <Delta value={row.delta3m} />
          <span className="text-sm text-ink-muted">3 meses</span>
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {untracked ? <UntrackedTag /> : <StatusTag status={row.status} />}
        {star && <StarTag rule={star} />}
        {row.activeAlerts > 0 && (
          <span className="border border-down/50 px-2 py-0.5 text-sm font-medium text-down">
            {row.activeAlerts} {row.activeAlerts === 1 ? "alerta" : "alertas"}
          </span>
        )}
      </div>
    </li>
  );
}
