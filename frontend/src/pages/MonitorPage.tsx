import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Alert, Direction, Severity, WatchlistRow } from "../api/types";
import { ApiError } from "../api/client";
import { useMethodology, useMonitor } from "../api/queries";
import { AlertList } from "../components/AlertList";
import { Film } from "../components/Film";
import { LoadState } from "../components/LoadState";
import { PageHeader } from "../components/PageHeader";
import { PendingFilm } from "../components/PendingFilm";
import { StatusTag } from "../components/StatusTag";
import { useGlobalParams } from "../hooks/useGlobalParams";
import { useLinkSearch } from "../hooks/useLinkSearch";
import { ALERT_LABELS, bandOf, formatScore, monthCode, monthShort } from "../lib/format";

const DIRECTIONS: { key: Direction | null; label: string }[] = [
  { key: null, label: "Todas" },
  { key: "NEGATIVE", label: "Negativas" },
  { key: "POSITIVE", label: "Positivas" },
];

const SEVERITIES: { key: Severity | null; label: string }[] = [
  { key: null, label: "Todas" },
  { key: "CRITICAL", label: "Críticas" },
  { key: "WARN", label: "Avisos" },
  { key: "INFO", label: "Informativas" },
];

function isDirection(v: string | null): v is Direction {
  return v === "NEGATIVE" || v === "POSITIVE";
}

function isSeverity(v: string | null): v is Severity {
  return v === "CRITICAL" || v === "WARN" || v === "INFO";
}

/** The feed filters live in the URL (?dir, ?sev) so a filtered monitor is linkable. */
function useMonitorFilters() {
  const [params, setParams] = useSearchParams();
  const dir = params.get("dir");
  const sev = params.get("sev");
  function set(key: "dir" | "sev", value: string | null) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === null) next.delete(key);
      else next.set(key, value);
      return next;
    });
  }
  return {
    direction: isDirection(dir) ? dir : undefined,
    severity: isSeverity(sev) ? sev : undefined,
    setDirection: (d: Direction | null) => set("dir", d),
    setSeverity: (s: Severity | null) => set("sev", s),
  };
}

export function MonitorPage() {
  const { profile, month } = useGlobalParams();
  const filters = useMonitorFilters();
  const { data, error, isPending } = useMonitor(profile, month, { direction: filters.direction, severity: filters.severity });

  return (
    <div className="grid gap-12">
      <PageHeader title="Monitor" lede="Alertas tempranas que saltan solas, mes a mes. Las buenas noticias también avisan." />

      {error instanceof ApiError && error.status === 404 ? (
        // The alert engine is Block 6. Until its endpoint exists, the view is unexposed, not broken.
        <PendingFilm
          title="Alertas"
          block="bloque 6"
          items={["Alertas del mes, negativas y positivas", "Lista de vigilancia", "Resumen mensual de alertas", "Enlace a cada entidad"]}
        />
      ) : error ? (
        <LoadState error={error} />
      ) : isPending ? (
        <LoadState />
      ) : (
        <div className="grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <Film title="Alertas" meta={`${monthCode(data.fromMonth)} – ${monthCode(month)} · ${data.alerts.length} alertas`}>
            <FeedFilters {...filters} />
            <Feed alerts={data.alerts} />
          </Film>

          <div className="grid content-start gap-12 self-start lg:sticky lg:top-6">
            <WatchlistFilm rows={data.watchlist} month={month} />
            <MonthSummary alerts={data.alerts} />
          </div>
        </div>
      )}
    </div>
  );
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: T | null; label: string }[];
  value: T | undefined;
  onChange: (v: T | null) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="text-sm text-ink-muted">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex border border-ink/25">
        {options.map((o) => {
          const checked = (value ?? null) === o.key;
          return (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => onChange(o.key)}
              className={`flex-1 px-3 py-1.5 text-[15px] whitespace-nowrap ${checked ? "bg-ink font-semibold text-film" : "hover:bg-panel"}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FeedFilters(f: ReturnType<typeof useMonitorFilters>) {
  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-[minmax(0,3fr)_minmax(0,4fr)]">
      <Segmented label="Dirección" options={DIRECTIONS} value={f.direction} onChange={f.setDirection} />
      <Segmented label="Gravedad" options={SEVERITIES} value={f.severity} onChange={f.setSeverity} />
    </div>
  );
}

/** Alerts grouped by month, newest first (the API already sends them in that order). */
function Feed({ alerts, animateMonth }: { alerts: Alert[]; animateMonth?: string | null }) {
  const byMonth = useMemo(() => {
    const groups = new Map<string, Alert[]>();
    for (const a of alerts) groups.set(a.month, [...(groups.get(a.month) ?? []), a]);
    return [...groups.entries()];
  }, [alerts]);
  if (byMonth.length === 0) return <p className="text-ink-muted">No hay alertas en este periodo con estos filtros.</p>;
  return (
    <div className="grid gap-6">
      {byMonth.map(([m, list]) => (
        <section key={m}>
          <h3 className="mb-2 flex items-baseline gap-2 border-b border-ink/20 pb-1 text-sm font-semibold">
            {monthShort(m)} <span className="font-normal text-ink-muted">{monthCode(m)}</span>
            <span className="ml-auto font-normal text-ink-muted">{list.length}</span>
          </h3>
          <AlertList alerts={list} showEntity animate={m === animateMonth} />
        </section>
      ))}
    </div>
  );
}

function WatchlistFilm({ rows, month }: { rows: WatchlistRow[]; month: string }) {
  const linkSearch = useLinkSearch();
  const { data: methodology } = useMethodology();
  const rule = methodology?.watchlist;
  return (
    <Film title="Vigilancia" meta={`${rows.length} entidades · ${monthCode(month)}`}>
      <p className="mb-4 text-[15px] text-ink-muted">
        {rule
          ? `Al menos ${rule.minCritical} ${rule.minCritical === 1 ? "alerta crítica" : "alertas críticas"} o ${rule.minWarn} avisos negativos activos este mes.`
          : "Entidades con alertas negativas activas este mes."}
      </p>
      {rows.length === 0 ? (
        <p className="text-ink-muted">Ninguna entidad en vigilancia en {monthCode(month)}.</p>
      ) : (
        <ul className="grid">
          {rows.map(({ row: r, criticalAlerts, warnAlerts, codes }) => {
            const band = bandOf(r.final);
            return (
              <li key={r.id} className="grid gap-2 border-b border-rule py-3 last:border-b-0">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <Link to={`/entity/${r.id}${linkSearch}`} className="block truncate font-semibold underline-offset-4 hover:underline">
                      {r.name}
                    </Link>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <StatusTag status={r.status} />
                      <span className="text-sm" title="Estados negativos activos este mes, por gravedad">
                        {criticalAlerts > 0 && (
                          <span className="font-semibold text-down">
                            {criticalAlerts} {criticalAlerts === 1 ? "crítica" : "críticas"}
                          </span>
                        )}
                        {criticalAlerts > 0 && warnAlerts > 0 && <span className="text-ink-muted"> · </span>}
                        {warnAlerts > 0 && (
                          <span className="text-down">
                            {warnAlerts} {warnAlerts === 1 ? "aviso" : "avisos"}
                          </span>
                        )}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2" title="Puntuación final del perfil activo">
                    <span className="text-3xl font-semibold [font-stretch:85%]" style={{ color: band.color }}>
                      {formatScore(r.final)}
                    </span>
                    <span className="inline-flex h-6 w-6 items-center justify-center text-sm font-bold text-white" style={{ background: band.color }}>
                      {band.band}
                    </span>
                  </span>
                </div>
                {codes.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5" aria-label="Alertas activas">
                    {codes.map((c) => (
                      <li key={c} className="border border-rule px-1.5 text-sm text-ink-muted">
                        {ALERT_LABELS[c]}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Film>
  );
}

/** Negative and positive alerts per month, as paired bars. */
function MonthSummary({ alerts }: { alerts: Alert[] }) {
  const months = [...new Set(alerts.map((a) => a.month))].sort();
  const counts = months.map((m) => ({
    month: m,
    negative: alerts.filter((a) => a.month === m && a.direction === "NEGATIVE").length,
    positive: alerts.filter((a) => a.month === m && a.direction === "POSITIVE").length,
  }));
  const max = Math.max(1, ...counts.map((c) => Math.max(c.negative, c.positive)));
  return (
    <Film title="Resumen por mes" meta="Alertas negativas y positivas">
      {counts.length === 0 ? (
        <p className="text-ink-muted">Sin alertas en este periodo.</p>
      ) : (
        <ul className="grid gap-3">
          {counts.map((c) => (
            <li key={c.month} className="grid grid-cols-[4.5rem_1fr] items-center gap-3 text-[15px]">
              <span>
                {monthShort(c.month)}
                <span className="block text-sm text-ink-muted">{monthCode(c.month)}</span>
              </span>
              <span className="grid gap-1">
                {(["negative", "positive"] as const).map((k) => (
                  <span key={k} className="flex items-center gap-2">
                    <span
                      className={`h-3 ${k === "negative" ? "bg-down/80" : "bg-up/80"}`}
                      style={{ width: `${(c[k] / max) * 62}%`, minWidth: c[k] ? 6 : 0 }}
                    />
                    <span className={`text-sm font-semibold whitespace-nowrap ${k === "negative" ? "text-down" : "text-up"}`}>
                      {c[k]} {k === "negative" ? (c[k] === 1 ? "negativa" : "negativas") : c[k] === 1 ? "positiva" : "positivas"}
                    </span>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Film>
  );
}
