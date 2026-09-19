import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Alert, Direction, Severity, WatchlistRow } from "../api/types";
import { ApiError } from "../api/client";
import { useMethodology, useMonitor } from "../api/queries";
import { REPLAY_FROM, type ReplayState, useReplay } from "../api/useReplay";
import { AlertList } from "../components/AlertList";
import { Film } from "../components/Film";
import { IconDown, IconPause, IconPlay, IconRestart, IconUp } from "../components/Icons";
import { LoadState } from "../components/LoadState";
import { PageHeader } from "../components/PageHeader";
import { PendingFilm } from "../components/PendingFilm";
import { StatusTag } from "../components/StatusTag";
import { MONTHS, useGlobalParams } from "../hooks/useGlobalParams";
import { useLinkSearch } from "../hooks/useLinkSearch";
import { ALERT_LABELS, PROFILE_LABELS, bandOf, formatScore, monthCode, monthLong, monthShort } from "../lib/format";

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

const countAlerts = (n: number) => `${n} ${n === 1 ? "alerta" : "alertas"}`;

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
  const replay = useReplay(profile);
  const replaying = replay.state !== "idle";
  // The replay feed: every frame so far, newest month first, through the same filters as the stored feed.
  const replayAlerts = useMemo(
    () =>
      [...replay.frames]
        .reverse()
        .flatMap((f) => f.newAlerts)
        .filter(
          (a) =>
            (!filters.direction || a.direction === filters.direction) && (!filters.severity || a.severity === filters.severity),
        ),
    [replay.frames, filters.direction, filters.severity],
  );

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
        <>
          <ReplayFilm replay={replay} />
          <div className="grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            {replaying ? (
              <Film
                title="Alertas · replay"
                meta={
                  replay.month
                    ? `${monthCode(REPLAY_FROM)} – ${monthCode(replay.month)} · ${countAlerts(replayAlerts.length)}`
                    : `Desde ${monthCode(REPLAY_FROM)}`
                }
              >
                <FeedFilters {...filters} />
                {replay.frames.length === 0 ? (
                  <p className="text-ink-muted">Esperando el primer mes…</p>
                ) : (
                  <Feed alerts={replayAlerts} animateMonth={replay.month} />
                )}
              </Film>
            ) : (
              <Film title="Alertas" meta={`${monthCode(data.fromMonth)} – ${monthCode(month)} · ${countAlerts(data.alerts.length)}`}>
                <FeedFilters {...filters} />
                <Feed alerts={data.alerts} />
              </Film>
            )}

            <div className="grid content-start gap-12 self-start lg:sticky lg:top-6">
              <WatchlistFilm rows={data.watchlist} month={month} />
              <MonthSummary alerts={data.alerts} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const SPEEDS = [
  { ms: 2000, label: "Lento" },
  { ms: 1200, label: "Normal" },
  { ms: 400, label: "Rápido" },
] as const;

const SECONDS = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

/** The cine loop of the monitor: the stored alerts, played month by month from M06 (SPEC §8.5). */
function ReplayFilm({ replay }: { replay: ReturnType<typeof useReplay> }) {
  const { profile } = useGlobalParams();
  const { state, frames } = replay;
  const negative = frames.reduce((n, f) => n + f.newAlerts.filter((a) => a.direction === "NEGATIVE").length, 0);
  const positive = frames.reduce((n, f) => n + f.newAlerts.filter((a) => a.direction === "POSITIVE").length, 0);
  const idle = state === "idle";
  return (
    <Film
      title="Replay"
      meta={`${PROFILE_LABELS[profile].name} · ${monthCode(REPLAY_FROM)} → ${monthCode(MONTHS[MONTHS.length - 1])} · un mes cada ${SECONDS.format(replay.speedMs / 1000)} s`}
    >
      <div className="grid gap-7">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <ReplayControls replay={replay} />
          <div className="w-full sm:w-72">
            <Segmented
              label="Velocidad"
              options={SPEEDS.map((s) => ({ key: String(s.ms), label: s.label }))}
              value={String(replay.speedMs)}
              onChange={(v) => v !== null && replay.setSpeed(Number(v))}
              disabled={state === "playing"}
            />
          </div>
        </div>

        <ReplayStrip frames={frames} current={replay.month} />

        <dl aria-live="polite" className="grid grid-cols-3 gap-px border border-rule bg-rule lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <Counter label="Mes del replay" hint={replay.month ? monthCode(replay.month) : `Empieza en ${monthCode(REPLAY_FROM)}`} wide>
            {replay.month ? <span className="first-letter:uppercase">{monthLong(replay.month)}</span> : "—"}
          </Counter>
          <Counter label="En vigilancia" hint="Entidades en la lista ese mes">
            {replay.watchlistSize ?? "—"}
          </Counter>
          <Counter label="Alertas negativas" hint="Acumuladas desde el inicio" tone="down">
            {idle ? "—" : negative}
          </Counter>
          <Counter label="Alertas positivas" hint="Acumuladas desde el inicio" tone="up">
            {idle ? "—" : positive}
          </Counter>
        </dl>

        {state === "error" ? (
          <p role="alert" className="flex flex-wrap items-center gap-3 text-[15px]">
            <span className="font-semibold text-down">No se pudo conectar con el monitor.</span>
            <button type="button" onClick={() => void replay.resume()} className={SECONDARY}>
              Reintentar
            </button>
          </p>
        ) : idle ? (
          <p className="max-w-[62ch] text-[15px] text-ink-muted">
            Reproduce el monitor como lo habría visto un analista: cada mes aparecen solo las alertas que saltaron ese mes, con
            datos hasta ese mes.
          </p>
        ) : null}
      </div>
    </Film>
  );
}

const PRIMARY =
  "inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[15px] font-semibold text-film hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-45";
const SECONDARY =
  "inline-flex items-center gap-2 border border-ink/25 bg-film px-4 py-2 text-[15px] text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-45";

function ReplayControls({ replay }: { replay: ReturnType<typeof useReplay> }) {
  const { state } = replay;
  const main: Record<ReplayState, { label: string; icon: typeof IconPlay; run: () => void }> = {
    idle: { label: "Reproducir", icon: IconPlay, run: () => void replay.play() },
    done: { label: "Reproducir de nuevo", icon: IconPlay, run: () => void replay.play() },
    error: { label: "Reproducir", icon: IconPlay, run: () => void replay.play() },
    playing: { label: "Pausa", icon: IconPause, run: replay.pause },
    paused: { label: "Continuar", icon: IconPlay, run: replay.resume },
  };
  const { label, icon: Icon, run } = main[state];
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={run} className={`${PRIMARY} min-w-[11rem] justify-center`}>
        <Icon />
        {label}
      </button>
      <button type="button" onClick={replay.reset} disabled={state === "idle"} className={SECONDARY}>
        <IconRestart />
        Reiniciar
      </button>
    </div>
  );
}

function Counter({
  label,
  hint,
  tone,
  wide = false,
  children,
}: {
  label: string;
  hint: string;
  tone?: "up" | "down";
  wide?: boolean;
  children: React.ReactNode;
}) {
  const color = tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-ink";
  const Icon = tone === "up" ? IconUp : tone === "down" ? IconDown : null;
  return (
    <div className={`min-w-0 bg-film px-3 py-3 sm:px-4 ${wide ? "col-span-3 lg:col-span-1" : ""}`}>
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className={`mt-1 flex items-center gap-2 text-4xl leading-none font-semibold [font-stretch:80%] ${color}`}>
        {Icon && <Icon width={24} height={24} />}
        {children}
      </dd>
      <dd className="mt-1.5 text-sm text-ink-muted">{hint}</dd>
    </div>
  );
}

/**
 * The 24 months as a read-only exposure strip: positive alerts rise above the baseline in green,
 * negative ones hang below it in red, and the replay month is lit in scan cyan.
 */
function ReplayStrip({ frames, current }: { frames: { month: string; newAlerts: Alert[] }[]; current: string | null }) {
  const byMonth = new Map(frames.map((f) => [f.month, f.newAlerts]));
  const max = Math.max(4, ...frames.map((f) => f.newAlerts.length));
  const start = MONTHS.indexOf(REPLAY_FROM);
  const at = current ? MONTHS.indexOf(current) : -1;
  return (
    <div aria-hidden className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px]">
      {MONTHS.map((m, i) => {
        const alerts = byMonth.get(m);
        const pos = alerts?.filter((a) => a.direction === "POSITIVE").length ?? 0;
        const neg = alerts?.filter((a) => a.direction === "NEGATIVE").length ?? 0;
        const lit = i === at;
        const played = alerts !== undefined;
        const yearStart = m.endsWith("-01") || i === 0;
        return (
          <div
            key={m}
            title={`${monthShort(m)} · ${monthCode(m)}${played ? ` · ${neg} negativas, ${pos} positivas` : ""}`}
            className={`relative flex flex-col items-center pt-5 ${lit ? "bg-scan/12" : ""}`}
          >
            {yearStart && <span className="absolute top-0 left-0 text-xs leading-none text-ink-muted">{m.slice(0, 4)}</span>}
            <div className="flex h-12 w-full items-end justify-center">
              <span className="block w-[min(100%,10px)] bg-up/80" style={{ height: `${(pos / max) * 100}%` }} />
            </div>
            <span className={`block h-px w-full ${i < start ? "bg-rule" : "bg-ink/40"}`} />
            <div className="flex h-12 w-full items-start justify-center">
              <span className="block w-[min(100%,10px)] bg-down/80" style={{ height: `${(neg / max) * 100}%` }} />
            </div>
            <span
              className={`mt-1.5 block ${
                lit
                  ? "h-5 w-[5px] bg-scan shadow-[0_0_10px_1px_rgb(15_163_194/0.7)]"
                  : played
                    ? "h-3.5 w-[3px] bg-ink"
                    : i < start
                      ? "h-2.5 w-[3px] bg-panel-grid"
                      : "h-2.5 w-[3px] bg-rule"
              }`}
            />
            {(i === start || i === MONTHS.length - 1) && (
              <span className="mt-1 text-xs leading-none text-ink-muted">{monthCode(m)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  options: { key: T | null; label: string }[];
  value: T | undefined;
  onChange: (v: T | null) => void;
  disabled?: boolean;
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
              disabled={disabled}
              onClick={() => onChange(o.key)}
              className={`min-w-0 flex-1 px-1.5 py-1.5 text-sm whitespace-nowrap disabled:cursor-not-allowed sm:px-3 sm:text-[15px] ${
                checked ? "bg-ink font-semibold text-film disabled:bg-ink/60" : "hover:bg-panel disabled:text-ink-muted disabled:hover:bg-transparent"
              }`}
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
