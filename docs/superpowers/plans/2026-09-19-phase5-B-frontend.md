# Phase 5 · Plan B — Frontend: Monitor with replay, product panels, Methodology

> **For agentic workers:** Claude Code: use superpowers:executing-plans (or superpowers:subagent-driven-development) to run this plan task by task. Antigravity or other agents: do the checkboxes in order. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put blocks 6 and 7 on screen: the Monitor page with real alerts, the watchlist and a replay that plays M06→M23 over SSE; the product panel of each profile on the Entity page (BANK limit card, limit history chart and simulator; INSURER premium quote and history; FUND momentum); alert markers on the entity timeline; the rising-star filter on the Portfolio; and a complete Methodology page (alert catalogue and product parameters).

**Architecture:** Nothing changes in the stack. `src/api/types.ts` mirrors the JSON contract of the overview. The mock generator (`npm run dev:mock`) produces exactly that JSON, so every screen is built and checked before plan A's backend exists. `src/api/queries.ts` gains a simulator mutation, a methodology query and a `useReplay` hook over `EventSource`. Pages keep their current look (Film, PendingFilm, Meter, StatusTag, Tailwind tokens). A 404 or a `null` product still shows `PendingFilm`, so the app works on `main`'s backend before the merge.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, React Router 7, TanStack Query 5, Recharts 3, Tailwind 4, oxlint. npm (`package-lock.json`).

**Spec:** `docs/SPEC.md` §8.5, §10.1–§10.3, §12.5–§12.7. Shared contract, decisions F1–F21 and path ownership: `docs/superpowers/plans/2026-09-19-phase5-overview.md`. **Read the overview before Task 1** — especially contract item 8 (the JSON).

## Global Constraints

- Edit only `frontend/**`. Never edit `backend/**`, `docs/**`, `CLAUDE.md`, `docker-compose.yml`.
- UI copy in Spanish, identifiers and comments in English (CLAUDE.md conventions).
- `profile` and `month` stay in the URL (`useGlobalParams`); every new view state that should be linkable (the rising-star filter, the Monitor filters) goes in the URL too. Transient state (replay playing, simulator inputs) stays in React state.
- No weight, λ, threshold, spread, multiplier or reference rate is written in a page or component (decision E1 and CLAUDE.md rule 5). They come from `/api/profiles` and `/api/methodology`. The mock generator may hold synthetic numbers: it is test data, labelled as such.
- No new npm dependency. Recharts covers every chart. `EventSource` is native.
- Colors: green/red only for direction (`text-up`, `text-down`), one color per band (`BANDS` in `lib/format.ts`). Every number has a tooltip or caption with its definition (SPEC §12.7).
- Respect `prefers-reduced-motion`: the replay animation is off under it (see the existing `@media (prefers-reduced-motion: reduce)` block in `src/index.css`).
- No `pnpm-lock.yaml` in commits (the repository uses npm).
- Checks after every task: `npm run typecheck && npm run lint` (exit 0). `npm run build` at Tasks 6, 10 and 12.
- Commits: Conventional Commits, English, lowercase subject. Commit after each task. No AI attribution line.

## File Structure

```
frontend/src/
  api/types.ts                    contract item 8 (Alert, WatchlistRow, MonitorData, ReplayFrame, LimitDecision,
                                  LimitSimulation, PremiumQuote, MomentumView, Methodology, new fields)
  api/queries.ts                  + useSimulateLimit, useMethodology, useWatchlist; useMonitor(filters)
  api/useReplay.ts                NEW: EventSource hook (mock fallback)
  mocks/generate.ts               JSON shaped like the contract, + mockSimulate, mockReplayFrames, mockMethodology
  lib/format.ts                   + ALERT_LABELS, LIMIT_ACTION_LABELS, BINDING_LABELS, formatRate, formatDscr
  components/TrendChart.tsx       + optional alert markers
  components/LimitHistoryChart.tsx   NEW
  components/PremiumHistoryChart.tsx NEW
  components/AlertList.tsx        NEW: one alert row (shared by Monitor and Entity)
  index.css                       + alert-in keyframes (off under reduced motion)
  pages/MonitorPage.tsx           filters, watchlist rows, replay control
  pages/EntityPage.tsx            product panels, simulator, entity alerts, timeline markers
  pages/PortfolioPage.tsx         rising-star filter and tag, alert column title
  pages/MethodologyPage.tsx       alert catalogue, product parameters
```

## Shared contract

Copy of the overview's "Shared contract", items 1–10. **Read it there**. For this plan
the binding part is item 8 (JSON of every endpoint), item 9 (no weights in the UI) and
the decisions F9 (premium tier = band), F12–F16 (alerts, watchlist, `activeAlerts`),
F18 (`FACTORING_SPIKE` never fires on this data). When this plan and the overview
disagree, the overview wins; tell the person who merges.

---

### Task 0: Check the worktree

**Files:** none.

- [ ] **Step 1: Branch and install**

Run (worktree root):
```bash
git branch --show-current          # feat/phase5-frontend
cd frontend && npm ci
```

- [ ] **Step 2: Baseline checks**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: exit code 0 for all three. Write down any existing lint warning so you do not chase it later.

- [ ] **Step 3: Dev server on mocks**

Run: `npm run dev:mock -- --port 5174` (background). Open `http://localhost:5174/monitor`, `/entity/G-002?profile=BANK`, `/methodology`. They render with the phase 4 mocks. This is your loop for Tasks 1–10.

---

### Task 1: Types from the contract

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: any page that stops compiling (minimal edits only; the real UI work is in later tasks)

- [ ] **Step 1: Replace the alert, monitor and product types**

Copy the TypeScript of overview contract item 8 into `types.ts`, adapted to the file's style (named `export interface` / `export type`, doc comments on nullable fields). Concretely:
- New: `AlertCode`, `WatchlistRow`, `Watchlist`, `ReplayFrame`, `LimitAction`, `BindingConstraint`, `LimitSimulation`, `SimulateLimitRequest` (`{ month?: string; requestedAmountEur: number; termMonths?: number }`), `Timeline` (`{ id; profile; points: TimelinePoint[]; changepoints: Changepoint[]; alerts: Alert[] }`), `AlertRuleInfo`, `Methodology`.
- Changed: `Alert` (+ `entityType`, `value`, `code: AlertCode`), `MonitorData` (+ `profile`, `month`, `fromMonth`, `watchlist: WatchlistRow[]`), `LimitDecision`, `PremiumQuote`, `MomentumView` (full contract shapes), `PortfolioRow` (+ `risingStar: boolean | null`), `TimelinePoint` (+ `limitEur`, `limitAction`, `premiumRate`, `buyerLimitEur`, `newAlerts`), `EntityDetail` (+ `alerts: Alert[]`), `Meta` (+ `alertsReady`, `productsReady`).
- `Severity` keeps `"WARN" | "CRITICAL" | "INFO"`; `Direction` keeps `"NEGATIVE" | "POSITIVE"`.

Update the header comment: "Mirrors the backend DTOs (phase 5 overview, contract item 8)."

- [ ] **Step 2: Make it compile**

Run: `npm run typecheck`. Fix only what breaks, the smallest way:
- `MonitorPage` watchlist: `r.id` → `r.row.id`, `r.status` → `r.row.status`, `r.final` → `r.row.final`.
- `EntityPage` `ProductPanel`: `limit.previousLimitEur` is now nullable (`?? 0` for now; Task 6 redoes the card).
- `mocks/generate.ts`: make it return the new shapes with placeholder values where needed (Task 2 does it properly).

- [ ] **Step 3: Check and commit**

Run: `npm run typecheck && npm run lint` → exit 0.
```bash
git add frontend/src
git commit -m "feat(frontend): align api types with the phase 5 contract"
```

---

### Task 2: Mocks shaped like the contract

**Files:**
- Modify: `frontend/src/mocks/generate.ts`

The mock generator must produce JSON a backend could have sent, so the pages built on it
work unchanged on the real API. It stays deterministic (seeded), synthetic and labelled
("Nothing here is Embat data", as today).

- [ ] **Step 1: Alerts**

- Codes: only the 15 of `AlertCode`. Remove the mock `"DIP"` alert code (not in the contract; the dip is a status, not an alert).
- `id` = `` `${entityType}:${entityId}:${month}:${code}` ``, plus `entityType` and `value` (the raw number the alert is about; `null` for regime alerts).
- Keep transitions only (the current flags do that). Add `LIMIT_ACTION` from the mock limit history (Step 3): `INCREASE` → INFO POSITIVE, `REDUCE` → WARN NEGATIVE, `FREEZE` → CRITICAL NEGATIVE, only for profile `BANK`.
- A small `activeStatesAt(series, m)` = negative alerts fired in months m−2..m (a mock approximation of "active"; say so in a comment). `activeAlerts` = its length. Watchlist = rows with ≥ 1 CRITICAL or ≥ 2 WARN in it; `WatchlistRow` = `{ row, criticalAlerts, warnAlerts, codes }`.

- [ ] **Step 2: Monitor and watchlist**

- `mockMonitor(profile, month, filters?)` → `MonitorData` with `fromMonth` = month − 5, alerts of those 6 months, newest month first, then CRITICAL > WARN > INFO. Apply `severity` / `direction` filters when given.
- `mockWatchlist(profile, month)` → `Watchlist`.
- `mockReplayFrames(profile, from, to)` → `ReplayFrame[]` (one per month, `newAlerts` = the alerts of that month, `watchlistSize` from Step 1).

- [ ] **Step 3: Products and timeline**

- Keep `limitAt` but return the full `LimitDecision` (baseEur, factor, trend, runwayGuard, dscrCapEur, spreadBps, allInRate, projectedDscr, action with the contract rules: first month `MAINTAIN` with `previousLimitEur: null`, band E → `DECLINE` or `FREEZE`).
- `PremiumQuote` with `insurable`, `previousBand`, `tierChange`; `MomentumView` with `month`, `profile`, `growthPercentile`.
- Fill the new `TimelinePoint` fields for every month (`limitEur`, `limitAction`, `premiumRate`, `buyerLimitEur`, `newAlerts`) and `EntityDetail.alerts` (≤ month, newest first, max 20). Limit fields come from the BANK series and premium fields from the INSURER series, whatever the active profile (F5).
- `PortfolioRow.risingStar` = level < 60 and traj ≥ 70 in the FUND series (mock values).

- [ ] **Step 4: Simulator and methodology**

- `mockSimulate(id, body)` → `LimitSimulation` from the stored mock decision, kept simple (the term does not change the mock capacity): `capacity = decision.limitEur`; `APPROVE` if requested ≤ capacity, `PARTIAL` (approved = capacity) if capacity > 0, else `DECLINE`; `bindingConstraint: "BAND"` when `spreadBps` is null, else the decision's constraint. Throw an `ApiError(400, ...)` for an amount ≤ 0 so the form's error path can be tested on mocks.
- `mockMethodology()` → `Methodology` with the 15 rules (Spanish triggers like the contract example), `fired` counts from the mock alerts (0 for `FACTORING_SPIKE`), and synthetic product parameters. Label the object with a comment: synthetic, not the config.

- [ ] **Step 5: Check and commit**

Run: `npm run typecheck && npm run lint` → exit 0. Open `/monitor` and an entity on the mock server: nothing crashes.
```bash
git add frontend/src/mocks
git commit -m "feat(frontend): shape mock alerts, products and replay like the phase 5 contract"
```

---

### Task 3: Queries, simulator mutation and the replay hook

**Files:**
- Modify: `frontend/src/api/queries.ts`
- Create: `frontend/src/api/useReplay.ts`

**Interfaces:**
- `useMonitor(profile, month, filters: { severity?: Severity; direction?: Direction })`
- `useWatchlist(profile, month)`, `useMethodology()`
- `useSimulateLimit(id)` → TanStack `useMutation` over `POST /entities/{id}/limit/simulate`
- `useReplay(profile)` → `{ state, month, frames, watchlistSize, speedMs, setSpeed(ms), play(from?: string), pause(), resume(), reset() }`

- [ ] **Step 1: Queries**

Follow the existing pattern (`USE_MOCKS ? (await mocks()).mockX(...) : apiGet(...)`, `retry: retryUnless404`, `placeholderData: previous`). The monitor query key includes the filters. The query string only carries the filters that are set. `useMethodology` has `staleTime: 60_000` like `useProfiles`.

`useSimulateLimit(id)`:
```ts
export function useSimulateLimit(id: string) {
  return useMutation({
    mutationFn: async (body: SimulateLimitRequest) =>
      USE_MOCKS
        ? (await mocks()).mockSimulate(id, body)
        : apiPost<LimitSimulation>(`/entities/${id}/limit/simulate`, body),
  });
}
```

- [ ] **Step 2: `useReplay`**

```ts
// useReplay.ts — plays the stored monitor alerts month by month (SPEC §8.5, GET /api/monitor/replay, SSE).
import { useCallback, useEffect, useRef, useState } from "react";
import type { Profile } from "../hooks/useGlobalParams";
import { MONTHS } from "../hooks/useGlobalParams";
import { USE_MOCKS } from "./queries";
import type { ReplayFrame } from "./types";

export type ReplayState = "idle" | "playing" | "paused" | "done" | "error";

/** SPEC §8.5: the replay starts at M06. */
const DEFAULT_FROM = MONTHS[6];

export function useReplay(profile: Profile) {
  const [state, setState] = useState<ReplayState>("idle");
  const [frames, setFrames] = useState<ReplayFrame[]>([]);
  const [speedMs, setSpeedMs] = useState(1200);
  const source = useRef<EventSource | null>(null);
  const timer = useRef<number | null>(null);

  const stop = useCallback(() => {
    source.current?.close();
    source.current = null;
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  }, []);

  const onFrame = useCallback((f: ReplayFrame) => setFrames((prev) => [...prev, f]), []);

  const play = useCallback(
    async (from?: string) => {
      stop();
      const start = from ?? DEFAULT_FROM;
      if (!from) setFrames([]);
      setState("playing");
      if (USE_MOCKS) {
        const all = (await import("../mocks/generate")).mockReplayFrames(profile, start, MONTHS[MONTHS.length - 1]);
        let i = 0;
        timer.current = window.setInterval(() => {
          if (i < all.length) onFrame(all[i++]);
          else {
            stop();
            setState("done");
          }
        }, speedMs);
        return;
      }
      const es = new EventSource(`/api/monitor/replay?profile=${profile}&from=${start}&stepMs=${speedMs}`);
      source.current = es;
      es.addEventListener("month", (e) => onFrame(JSON.parse((e as MessageEvent).data) as ReplayFrame));
      es.addEventListener("done", () => {
        stop();
        setState("done");
      });
      es.onerror = () => {
        // EventSource reconnects by itself; for a replay that would restart the stream. Close instead.
        stop();
        setState((s) => (s === "playing" ? "error" : s));
      };
    },
    [profile, speedMs, stop, onFrame],
  );

  /** Pause closes the stream. Resume re-opens it from the month after the last frame. */
  const pause = useCallback(() => {
    stop();
    setState("paused");
  }, [stop]);

  const resume = useCallback(() => {
    const last = frames.at(-1)?.month;
    const next = last ? MONTHS[MONTHS.indexOf(last) + 1] : undefined;
    if (last && !next) setState("done");
    else void play(next);
  }, [frames, play]);

  const reset = useCallback(() => {
    stop();
    setFrames([]);
    setState("idle");
  }, [stop]);

  useEffect(() => reset, [profile, reset]);   // a profile switch ends the replay

  const last = frames.at(-1);
  return { state, frames, month: last?.month ?? null, watchlistSize: last?.watchlistSize ?? null,
           speedMs, setSpeed: setSpeedMs, play, pause, resume, reset };
}
```
`USE_MOCKS` must be exported from `queries.ts` (it already is). If oxlint flags the `useEffect` cleanup pattern, write it as `useEffect(() => () => reset(), [profile, reset])`.

- [ ] **Step 3: Check and commit**

Run: `npm run typecheck && npm run lint` → exit 0.
```bash
git add frontend/src/api
git commit -m "feat(frontend): add watchlist, methodology, simulator and replay hooks"
```

---

### Task 4: Monitor page on the contract

**Files:**
- Create: `frontend/src/components/AlertList.tsx`
- Modify: `frontend/src/pages/MonitorPage.tsx`, `frontend/src/lib/format.ts`

- [ ] **Step 1: Labels**

In `lib/format.ts` add `ALERT_LABELS: Record<AlertCode, string>` (Spanish, short): `RUNWAY_LOW` "Caja baja", `DSCR_BREACH` "Cobertura de deuda", `LINE_UTIL_HIGH` "Póliza al límite", `DSO_DRIFT` "Cobro más lento", `SUPPLIER_LATENESS_UP` "Retraso a proveedores", `OVERDUE_RECEIVABLES` "Impagos de clientes", `TAX_GAP` "Hueco fiscal", `CONCENTRATION_HIGH` "Concentración de clientes", `FACTORING_SPIKE` "Pico de financiación", `SCORE_DROP` "Caída de la nota", `STRUCTURAL_DECLINE` "Deterioro estructural", `STRUCTURAL_IMPROVEMENT` "Mejora estructural", `BAND_UPGRADE` "Sube de banda", `BAND_DOWNGRADE` "Baja de banda", `LIMIT_ACTION` "Acción sobre el límite". Also move `ACTION_LABELS` and `BINDING_LABELS` from `EntityPage.tsx` here as `LIMIT_ACTION_LABELS` and `BINDING_LABELS` (add `BAND: "banda sin crédito"`), plus `formatRate(r)` (`"2,85 %"`, 2 decimals) and `formatDscr(x)` (`"1,27x"`).

- [ ] **Step 2: `AlertList`**

Extract the current `<li>` of the Monitor feed into `AlertList({ alerts, showEntity, animate })`: direction icon, entity link (when `showEntity`), `ALERT_LABELS[code]` as a small label before the message, severity tag (same classes as today). `animate` adds `animate-[alert-in_400ms_ease-out]` to new rows. In `index.css` add:
```css
@keyframes alert-in {
  from { opacity: 0; transform: translateY(-6px); background-color: var(--color-scan, transparent); }
  to   { opacity: 1; transform: none; }
}
```
and, inside the existing reduced-motion block, `[class*="animate-[alert-in"] { animation: none; }` (or the equivalent your Tailwind setup needs; check it disables the animation).

- [ ] **Step 3: Filters and watchlist**

- Filters in the URL: `?dir=NEGATIVE|POSITIVE` and `?sev=CRITICAL|WARN|INFO` (keep the existing direction radiogroup; add a severity radiogroup with "Todas / Críticas / Avisos / Informativas"). Pass them to `useMonitor`.
- Feed header meta: `` `${monthCode(data.fromMonth)} – ${monthCode(month)}` ``.
- Watchlist: rows from `WatchlistRow`: name link, `StatusTag`, score in band color, and a line with `criticalAlerts` / `warnAlerts` counts and the `codes` as `ALERT_LABELS`. The blurb under the title comes from `/api/methodology` `watchlist` (`useMethodology`): "Al menos {minCritical} alerta crítica o {minWarn} avisos negativos activos este mes." — no number written in the page.
- `MonthSummary` stays.

- [ ] **Step 4: Check and commit**

Mock server: filters change the list and the URL; reloading keeps them; watchlist shows counts. `npm run typecheck && npm run lint` → exit 0.
```bash
git add frontend/src
git commit -m "feat(frontend): show monitor alerts with severity filters and watchlist counts"
```

---

### Task 5: Replay control on the Monitor

**Files:**
- Modify: `frontend/src/pages/MonitorPage.tsx`

- [ ] **Step 1: The control**

A `Film` titled "Replay" at the top of the Monitor, above the two columns:
- Buttons: "Reproducir" (state `idle`/`done`/`error` → `play()`), "Pausa" (`playing` → `pause()`), "Continuar" (`paused` → `resume()`), "Reiniciar" (`reset()`).
- Speed radiogroup: "Lento" 2000 ms, "Normal" 1200 ms, "Rápido" 400 ms (disabled while playing).
- A read-only progress strip: the 24 months as ticks (reuse the look of `MonthStrip`, but not its `onChange`: the replay drives it), months before M06 dimmed, played months filled, the current replay month lit.
- Big counters: current replay month (`monthLong`), `watchlistSize` ("en vigilancia"), negative and positive alerts so far.
- `state === "error"`: "No se pudo conectar con el monitor." with a retry button.
- `aria-live="polite"` on the counters.

- [ ] **Step 2: The feed while replaying**

While `state !== "idle"`, the left column shows the replay feed instead of the query feed: frames newest first, one section per month (same layout as today), rows rendered with `AlertList animate` for the latest frame only. The watchlist column keeps showing the selected month (the replay does not change the URL month). "Reiniciar" returns to the normal feed.

- [ ] **Step 3: Check and commit**

Mock server: play → months advance at the chosen speed, new alerts slide in, positive ones green; pause/continue resumes from the next month; switching profile in the top bar stops the replay. With reduced motion on (DevTools → Rendering → emulate), rows appear without animation.
`npm run typecheck && npm run lint` → exit 0.
```bash
git add frontend/src
git commit -m "feat(frontend): replay the monitor month by month over sse"
```

---

### Task 6: BANK product panel — limit card, limit history, simulator

**Files:**
- Create: `frontend/src/components/LimitHistoryChart.tsx`
- Modify: `frontend/src/pages/EntityPage.tsx`

- [ ] **Step 1: Limit card**

Redo the BANK branch of `ProductPanel` with the contract fields:
- "Límite recomendado" (`limitEur`), sub: previous limit, or "Primera decisión" when `previousLimitEur` is null.
- "Acción" (`LIMIT_ACTION_LABELS`, tone: INCREASE green; REDUCE/FREEZE/DECLINE red), sub: change in EUR and % vs previous.
- "Precio" `allInRate` (`formatRate`) with sub `spreadBps` pb over reference; "—" and "Banda sin crédito" when null.
- "Restricción activa" (`BINDING_LABELS`), sub `projectedDscr` ("DSCR proyectado 1,27x").
- A `<details>` "Cómo se calcula" with the breakdown: base (`baseEur`, "mediana de cobros de 3 meses"), × factor (`factor`), × tendencia (`trend`), × guarda de caja (when `runwayGuard`), tope DSCR (`dscrCapEur` or "sin tope: falta el flujo de 12 meses"). Numbers only from the DTO.

- [ ] **Step 2: `LimitHistoryChart`**

Props: `{ points: TimelinePoint[]; activeMonth: string }`. Recharts `ComposedChart`, height 260:
- `Area` step (`type="stepAfter"`) of `limitEur` on the left axis (`formatEurCompact` ticks), neutral ink fill.
- `Line` of `final` on a right axis 0–100, thin, band-neutral color (`--color-series-level`).
- `Scatter` (or `ReferenceDot`s) on months with `limitAction` REDUCE/FREEZE (red, down triangle) and INCREASE (green, up triangle).
- `ReferenceLine` at `activeMonth`. Tooltip: month, limit, action, final.
- Months with `limitEur === null` are gaps, not zeros (`connectNulls={false}`).
- Caption under the chart: "El límite se recalcula cada mes con datos hasta ese mes." (No lead-time claim here: that is phase 6.)

Uses `data.timeline` (it already stops at the selected month, so the chart is causal).

- [ ] **Step 3: Simulator form**

Inside the BANK panel, a `<form>` "Simular una solicitud":
- Inputs: amount in EUR (number, required, > 0), term in months (number, default = the `/api/methodology` `limitEngine.defaultTermMonths`, 1–120).
- Submit → `useSimulateLimit(id).mutate({ month, requestedAmountEur, termMonths })`.
- Result: a decision badge (APPROVE "Aprobada" green, PARTIAL "Parcial" amber/ink, DECLINE "Denegada" red), approved amount, capacity, rate, projected DSCR, binding constraint. A 400 shows the backend message under the form. Pending state disables the button.
- Keyboard and label accessible (`<label htmlFor>`), Enter submits.

- [ ] **Step 4: Check and commit**

Mock server `/entity/G-002?profile=BANK`: card, chart with markers, simulator (APPROVE for a small amount, PARTIAL for a big one). Change the month in the top bar: the chart stops at that month.
Run: `npm run typecheck && npm run lint && npm run build` → exit 0.
```bash
git add frontend/src
git commit -m "feat(frontend): add limit history chart and limit simulator to the bank panel"
```

---

### Task 7: INSURER and FUND panels

**Files:**
- Create: `frontend/src/components/PremiumHistoryChart.tsx`
- Modify: `frontend/src/pages/EntityPage.tsx`

- [ ] **Step 1: INSURER**

- Card: "Tasa de prima" (`premiumRate` as `formatRate`, or "No asegurable"), sub previous rate / band; "Límite por comprador" (`recommendedBuyerLimitEur`, "—" when null) with the caption "Aproximación a la exposición (compras medias × DPO)"; "Banda" with a tier-change arrow when `tierChange` is set ("Mejora de tramo" / "Empeora de tramo").
- `PremiumHistoryChart({ points, activeMonth })`: step line of `premiumRate` (percent axis), bars of `buyerLimitEur` on a second axis, gaps for null, markers on months where the rate changed. Caption: "La prima se mueve con la nota cada mes, no en la renovación anual."

- [ ] **Step 2: FUND**

- Card: "Posición" (`rank` de `of`), "Percentil de trayectoria" (`trajPercentile`, "—" when null), "Percentil de crecimiento de cobros" (`growthPercentile`), "Estrella emergente" (Sí/No) with the rule text from `/api/methodology` `momentum` ("Nivel menor de {risingStarMaxLevel} y trayectoria de {risingStarMinTraj} o más").
- Caption: "Percentiles frente a la cartera, solo para contexto: no cambian la nota."

- [ ] **Step 3: Pending states**

Keep `PendingFilm` for each panel when its DTO is `null` (backend without phase 5, or an entity with no row that month). The text changes from "bloque 7" to a data reason when `meta.productsReady` is true: "Sin datos suficientes este mes" (the entity has no row), otherwise the current "bloque 7" film.

- [ ] **Step 4: Check and commit**

Mock server: `?profile=INSURER` and `?profile=FUND` on an entity. `npm run typecheck && npm run lint` → exit 0.
```bash
git add frontend/src
git commit -m "feat(frontend): add premium history and momentum percentiles to the product panel"
```

---

### Task 8: Entity alerts and timeline markers

**Files:**
- Modify: `frontend/src/components/TrendChart.tsx`, `frontend/src/pages/EntityPage.tsx`

- [ ] **Step 1: Markers on `TrendChart`**

Add an optional prop `markers?: { month: string; direction: "NEGATIVE" | "POSITIVE"; label: string }[]`. Draw each as a small `ReferenceDot` at the top of the plot (y = 100) in `text-down` / `text-up` color, with the label in the tooltip. Several alerts in one month → one dot, label joined with " · ". The Methodology example and any other caller keep working without the prop.

- [ ] **Step 2: Entity alerts**

- Pass `markers` from `data.alerts` (month, direction, `ALERT_LABELS[code]`).
- A new `Film` "Alertas" after the timeline: `AlertList` of `data.alerts` (no entity column), newest first; empty state "Sin alertas hasta {monthCode(month)}." When the backend has no alerts yet (`meta.alertsReady === false`), show the `PendingFilm` "bloque 6" instead.

- [ ] **Step 3: Check and commit**

`npm run typecheck && npm run lint` → exit 0.
```bash
git add frontend/src
git commit -m "feat(frontend): show entity alerts and mark them on the timeline"
```

---

### Task 9: Portfolio — rising stars and alert column

**Files:**
- Modify: `frontend/src/pages/PortfolioPage.tsx`

- [ ] **Step 1: Alert column**

Column title of `activeAlerts`: "Alertas negativas activas este mes" (F16).

- [ ] **Step 2: Rising stars**

- When `profile === "FUND"`, add a chip "Estrellas emergentes" next to the six question chips, stored as `?rising=1`. It filters `risingStar === true` (it can combine with a status chip). On other profiles the chip is hidden and the param is ignored.
- A small tag "★ Estrella emergente" next to the name of rows with `risingStar === true` on FUND (tooltip with the rule from `/api/methodology`).

- [ ] **Step 3: Check and commit**

`npm run typecheck && npm run lint` → exit 0.
```bash
git add frontend/src
git commit -m "feat(frontend): filter rising stars on the fund portfolio"
```

---

### Task 10: Methodology — alert catalogue and product parameters

**Files:**
- Modify: `frontend/src/pages/MethodologyPage.tsx`

- [ ] **Step 1: Alert catalogue**

`Film` "Alertas tempranas" (SPEC §8.5, EBA/GL/2020/06 as framework): table with `ALERT_LABELS[code]`, direction (icon), trigger (`trigger` text as sent), "Evento" / "Estado" (`event`), and `fired` ("{n} en el último cálculo"). When `fired === 0`: "sin datos en este conjunto" for `FACTORING_SPIKE`, "no se activa con estos datos" for any other code. One line under the table: the watchlist rule from `watchlist`.

- [ ] **Step 2: Product parameters**

`Film` "Producto": three short blocks, all values from `/api/methodology`:
- Límite de circulante: the SPEC §10.1 formula in words (base × factor × tendencia, guarda de caja, tope DSCR), `scoreFloor`, `factorAtFloor`→`factorAt100`, `trendModifierSpan`, `dscrMin`, `defaultTermMonths`, `actionThreshold`, and a small table of `spreadBpsByBand` (band color chips; "—" = no credit). `referenceRate` with the marker "valor de ejemplo" when `referenceRateIsExample` is true (same dashed-border style as the "umbral provisional" tag on the Entity page).
- Prima de seguro de crédito: `basePremiumRate` and the `multiplierByBand` table ("—" = no asegurable).
- Momentum: the rising-star rule.

The lead-time `PendingFilm` ("bloque 8") stays. Loading and error states through `LoadState` like `Weights`.

- [ ] **Step 3: Check and commit**

Run: `npm run typecheck && npm run lint && npm run build` → exit 0.
```bash
git add frontend/src
git commit -m "feat(frontend): complete methodology with alert catalogue and product parameters"
```

---

### Task 11: Integration against plan A's backend

**Files:** any file of this plan (fixes only).

Plan A's backend runs in `../xray-phase5-a` on port 8081. If it is not up yet, ask the person running the plans to start it (plan A Task 0 Step 3), or wait and do the polish list below first. Never edit backend files: report a backend mismatch instead.

- [ ] **Step 1: Point the dev server at A**

Run: `VITE_API_TARGET=http://localhost:8081 npm run dev -- --port 5174` (no mocks).

- [ ] **Step 2: Walk every screen**

- `/` BANK and FUND: `activeAlerts` numbers, rising-star chip on FUND.
- `/monitor`: feed, filters, watchlist, Replay (Normal and Rápido) end to end until "done"; Network tab shows one `replay` request of type `eventsource` with `month` events.
- `/entity/<an id from the watchlist>` with `?profile=BANK|INSURER|FUND`: product panels, charts, simulator (APPROVE, PARTIAL, a 400 with a negative amount), alerts film and markers.
- `/methodology`: 15 rules, parameters, "valor de ejemplo".
- Every page < 1 s after the first load (Network tab).

- [ ] **Step 3: Contract mismatches**

For every difference between the JSON A sends and `types.ts`, check the overview contract item 8. If the frontend is wrong, fix it. If the backend is wrong, do not work around it: list it in the final report with the endpoint, field, expected and actual value.

- [ ] **Step 4: SSE through nginx**

`frontend/nginx.conf` already has `proxy_buffering off` and `proxy_read_timeout 1h` on `/api/`. Check it still does; do not change it unless it does not. (Plan A also sends `X-Accel-Buffering: no`.)

- [ ] **Step 5: Commit** (only if something changed)

```bash
git add frontend/src
git commit -m "fix(frontend): match the phase 5 api"
```

**Polish list (only after Steps 1–4, only if time is left, one commit each):**
1. Monitor: clicking a month in `MonthSummary` sets the URL month.
2. Entity BANK: "Simular" pre-filled with the current limit.
3. Portfolio: sort by `activeAlerts` puts the watchlist on top when the profile is BANK.

---

### Task 12: Final check and report

**Files:** none.

- [ ] **Step 1: Checks**

Run: `npm run typecheck && npm run lint && npm run build` → exit 0.
`git status --short` → clean (no `pnpm-lock.yaml`, no stray files).
Mock mode still works: `npm run dev:mock -- --port 5174`, open `/monitor` and one entity.

- [ ] **Step 2: Report**

Reply with:
1. Commits (one line each).
2. Screens checked on mocks and on A's backend (Task 11), with anything that did not work.
3. Contract mismatches found (endpoint, field, expected, actual) and which side you fixed.
4. Anything in this plan you had to change, and why.
