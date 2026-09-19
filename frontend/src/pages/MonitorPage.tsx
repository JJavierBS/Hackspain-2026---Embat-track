import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Alert } from "../api/types";
import { ApiError } from "../api/client";
import { useMonitor } from "../api/queries";
import { Film } from "../components/Film";
import { IconDown, IconUp } from "../components/Icons";
import { LoadState } from "../components/LoadState";
import { PageHeader } from "../components/PageHeader";
import { PendingFilm } from "../components/PendingFilm";
import { StatusTag } from "../components/StatusTag";
import { useGlobalParams } from "../hooks/useGlobalParams";
import { useLinkSearch } from "../hooks/useLinkSearch";
import { bandOf, formatScore, monthCode, monthShort } from "../lib/format";

type DirFilter = "ALL" | "NEGATIVE" | "POSITIVE";

const FILTERS: { key: DirFilter; label: string }[] = [
  { key: "ALL", label: "Todas" },
  { key: "NEGATIVE", label: "Negativas" },
  { key: "POSITIVE", label: "Positivas" },
];

const SEVERITY_LABELS: Record<Alert["severity"], string> = { CRITICAL: "Crítica", WARN: "Aviso", INFO: "Info" };

export function MonitorPage() {
  const { profile, month } = useGlobalParams();
  const { data, error, isPending } = useMonitor(profile, month);
  const [dir, setDir] = useState<DirFilter>("ALL");
  const linkSearch = useLinkSearch();

  const alerts = useMemo(
    () => (data?.alerts ?? []).filter((a) => dir === "ALL" || a.direction === dir),
    [data, dir],
  );
  const byMonth = useMemo(() => {
    const groups = new Map<string, Alert[]>();
    for (const a of alerts) groups.set(a.month, [...(groups.get(a.month) ?? []), a]);
    return [...groups.entries()];
  }, [alerts]);

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
          <Film title="Alertas" meta={`Últimos 6 meses hasta ${monthCode(month)}`}>
            <div role="radiogroup" aria-label="Dirección" className="mb-5 flex border border-ink/25">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="radio"
                  aria-checked={dir === f.key}
                  onClick={() => setDir(f.key)}
                  className={`flex-1 px-3 py-1.5 text-[15px] ${dir === f.key ? "bg-ink font-semibold text-film" : "hover:bg-panel"}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {byMonth.length === 0 && <p className="text-ink-muted">No hay alertas en este periodo.</p>}
            <div className="grid gap-6">
              {byMonth.map(([m, list]) => (
                <section key={m}>
                  <h3 className="mb-2 flex items-baseline gap-2 border-b border-ink/20 pb-1 text-sm font-semibold">
                    {monthShort(m)} <span className="font-normal text-ink-muted">{monthCode(m)}</span>
                  </h3>
                  <ul className="grid">
                    {list.map((a) => (
                      <li key={a.id} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-3 border-b border-dashed border-rule py-2.5 last:border-b-0">
                        {a.direction === "POSITIVE" ? (
                          <IconUp className="mt-0.5 text-up" aria-label="Positiva" />
                        ) : (
                          <IconDown className="mt-0.5 text-down" aria-label="Negativa" />
                        )}
                        <span>
                          <Link to={`/entity/${a.entityId}${linkSearch}`} className="font-semibold underline-offset-4 hover:underline">
                            {a.entityName}
                          </Link>
                          <span className="block text-[15px] text-ink-muted">{a.message}</span>
                        </span>
                        <span
                          className={`border px-2 py-0.5 text-sm font-medium ${
                            a.severity === "CRITICAL"
                              ? "border-down bg-down text-white"
                              : a.severity === "WARN"
                                ? "border-down/60 text-down"
                                : a.direction === "POSITIVE"
                                  ? "border-up/60 text-up"
                                  : "border-rule text-ink-muted"
                          }`}
                        >
                          {SEVERITY_LABELS[a.severity]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </Film>

          <div className="grid content-start gap-12 self-start lg:sticky lg:top-6">
          <Film title="Watchlist" meta={`${data.watchlist.length} entidades`}>
            <p className="mb-4 text-[15px] text-ink-muted">Una alerta crítica o dos avisos negativos en los últimos 3 meses.</p>
            {data.watchlist.length === 0 ? (
              <p className="text-ink-muted">Ninguna entidad en vigilancia en {monthCode(month)}.</p>
            ) : (
              <ul className="grid">
                {data.watchlist.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 border-b border-rule py-3 last:border-b-0">
                    <span className="min-w-0">
                      <Link to={`/entity/${r.id}${linkSearch}`} className="block truncate font-semibold underline-offset-4 hover:underline">
                        {r.name}
                      </Link>
                      <StatusTag status={r.status} />
                    </span>
                    <span className="text-3xl font-semibold [font-stretch:85%]" style={{ color: bandOf(r.final).color }}>
                      {formatScore(r.final)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Film>
          <MonthSummary alerts={data.alerts} />
          </div>
        </div>
      )}
    </div>
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
