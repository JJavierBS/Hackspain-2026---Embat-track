# Phase 5 — Parallel Execution Overview

Phase 5 = **Block 6 (monitor)** and **Block 7 (product)** of `docs/ARCHITECTURE.md §11`
(SPEC §13 M6 and M7). Block 8 (lead time, showcase pairs, `LookAheadTest`, Compare,
freeze `xray.duckdb`) is phase 6.

This time the split is **by layer**: plan A builds the whole backend (SQL → domain →
stages → API), plan B builds the whole frontend. They meet at the JSON contract below.
B works on the mock generator first, then against A's running backend.

| Plan | Branch | Owner (agent) | File |
|---|---|---|---|
| A — Backend: signals, products (S75), alerts (S80), monitor and product API, SSE replay | `feat/phase5-backend` | Claude Code or Antigravity | `2026-09-19-phase5-A-backend.md` |
| B — Frontend: Monitor with replay, product panels with history and simulator, Methodology | `feat/phase5-frontend` | Claude Code or Antigravity | `2026-09-19-phase5-B-frontend.md` |

Estimate: A about 7–8 h of agent time (15 alert rules, three engines, seven endpoints and
the SSE stream). B about 5 h. B finishes first. B's spare time goes to its Task 11
(integration against A's backend) and to the polish list at the end of plan B, never to
backend files.

Done when (SPEC §13 M6 and M7):
- The pipeline runs 13 stages. `limit_decisions`, `premium_quotes`, `momentum_screen`, `alerts`, `alert_states` and `watchlist` exist, for the three profiles where the contract says so.
- `GET /api/monitor/alerts`, `/api/monitor/watchlist`, `/api/entities/{id}/limit`, `/api/entities/{id}/premium`, `/api/methodology` answer in < 1 s. `POST /api/entities/{id}/limit/simulate` answers APPROVE / PARTIAL / DECLINE.
- `GET /api/monitor/replay` streams M06→M23 month by month, and the Monitor page plays it. Positive alerts show in green.
- The Entity page shows, by profile: BANK → limit card, limit history chart and simulator. INSURER → premium quote and premium history. FUND → momentum rank, percentiles and rising star.
- For at least one showcase entity the limit history shows a `REDUCE` or `FREEZE` before its status turns `CRITICAL` or `STRUCTURAL_DECLINE` (A's Task 13 lists them).
- The five existing tests pass. No new required test (`LookAheadTest` is phase 6).

## State at the start of phase 5 (checked 2026-09-19)

- Phase 4 is merged (`main` = `0dab688`, PRs #6 and #7), plus the AHP weights commit `dae65c9`.
- Pipeline: 11 stages. `profile_scores` has `status`, `regime`, `confidence`, `seasonal`. `contributions`, `changepoints` and `profile_weights` exist. GROUP and COMPANY panels are scored (decision E2).
- `EntityDetailDto.limit`, `premium` and `momentum` are `null` (decision E8). `PortfolioRowDto.activeAlerts` is 0 (decision E9).
- The frontend already has the product panels (`EntityPage.tsx` `ProductPanel`) and the Monitor page (`MonitorPage.tsx`), written against the mock generator. On the real API they show `PendingFilm` (404 or `null`).
- `scoring-config.yml` already has `limit-engine` and `insurer` blocks (SPEC §9). `LimitEngineConfig` binds them. Nothing reads them yet.
- `limit-engine.reference-rate` = 0.035 is an **example value** (CLAUDE.md open items). Any agent may change it if the user says so.
- There is no factoring inflow category in the data (`docs/DATA_FINDINGS.md` "Block 3 run (merged)" item 5). `FINANCING_IN` is empty.
- `docs/DATA_FINDINGS.md` has no "Block 5 run" section yet. Copy it from the phase 4 B report if you have it; otherwise skip it.

## Decisions taken before writing the plans (2026-09-19, José Javier)

| # | Question | Decision |
|---|---|---|
| F1 | Scope | Blocks 6 and 7. Block 8 is phase 6. |
| F2 | Split | By layer. A owns `backend/**`, B owns `frontend/**`. B builds on mocks shaped exactly like the contract below, then checks against A's backend (plan B Task 11). |
| F3 | Stage order | `S75_PRODUCTS` (75) runs before `S80_ALERTS` (80), because `LIMIT_ACTION` reads the limit decisions (CLAUDE.md resolved conflict 3). Products never read alerts. |
| F4 | Inputs the indicators do not carry | Products and some alerts need monthly amounts that are not indicators (median collections, annualized NOCF and debt service, …). New file `sql/39_signal_inputs.sql`, run by S30 after the indicator files, writes the long table `signal_values`. `PanelLoader` loads it into `EntityPanel`. `ind30_base` is dropped by `39`, not by `38`, so `39` can read it. |
| F5 | Which profile owns each product | Config, not code: `products.limit-profile: BANK`, `products.premium-profile: INSURER`, `products.momentum-profile: FUND`. Each product table has a `profile` column holding that value. The entity page shows every product that has data. The UI shows the product of the active profile. |
| F6 | Limit engine with missing inputs | `OP_IN_MEDIAN_3M` missing → no limit row that month. `traj` NULL → trend 1. `NOCF_12M_ANN` missing → no DSCR cap (`dscr_cap_eur` NULL). `DEBT_SERVICE_12M_ANN` missing → 0. `LIQ_RUNWAY` unavailable → no runway guard. Missing is never zero for the base (CLAUDE.md rule 3). |
| F7 | Limit action | See contract item 3. The first month with a decision is `MAINTAIN` with `prev_limit_eur` NULL. A band with no spread (E) gives `DECLINE`, or `FREEZE` when the previous limit was above 0. |
| F8 | Simulator | `POST .../limit/simulate` reads the stored `limit_decisions` row and calls the pure `LimitEngine.simulate`. It is O(1) arithmetic on stored numbers with user input, so it is the one request that computes. It writes nothing. |
| F9 | Premium tier alert | The premium tier is the band of the premium profile. A tier change is a band change, so the INSURER `BAND_UPGRADE` / `BAND_DOWNGRADE` alerts are the "the policy learns before the claim" alert (SPEC §10.2). No extra alert code. `premium_quotes.tier_change` marks the month. |
| F10 | Momentum percentiles | Display only (SPEC §10.3). Mid-rank percentile among the entities of the same `entity_type` scored that month in the momentum profile. Never read by scoring code, so CLAUDE.md rule 2 holds. |
| F11 | Alerts per profile | Yes. Every alert table has a `profile` column. Indicator rules give the same result in every profile. `LIMIT_ACTION` exists only in the limit profile. |
| F12 | Transitions | `AlertRule` is a pure predicate (`Optional<AlertSignal>`). `AlertEngine` keeps the state per (entity, profile, code). A **state rule** emits an alert when its signal appears or its severity or direction changes. An **event rule** (`BAND_UPGRADE`, `BAND_DOWNGRADE`, `LIMIT_ACTION`, `event() == true`) emits every month its predicate holds. The first scored month of an entity seeds the state and emits nothing, so the replay has no burst at the start. |
| F13 | Severity | Negative alerts are `WARN` or `CRITICAL`. Positive alerts are `INFO`. `LIMIT_ACTION`: `INCREASE` → INFO positive, `REDUCE` → WARN negative, `FREEZE` → CRITICAL negative, `DECLINE` → no alert (no limit to act on). |
| F14 | 15 codes, 15 classes | SPEC §8.5 has 14 lines. `BAND_UPGRADE` and `BAND_DOWNGRADE` share a line and get one class each, so the transition key is the code. |
| F15 | Watchlist | At month m: ≥ `alerts.watchlist.min-critical` CRITICAL or ≥ `alerts.watchlist.min-warn` WARN **negative active states** (SPEC §8.5). S80 writes it to `watchlist`, so the replay reads a count per month. |
| F16 | `activeAlerts` | Number of negative active states at m (not transitions). The portfolio column title changes to "Alertas negativas activas este mes". |
| F17 | Alert text | Spanish (UI copy), written by the rule at pipeline time from config thresholds and the raw value. The API never builds text. |
| F18 | `FACTORING_SPIKE` | Built on the `FINANCING_IN` flows (`FINANCING_IN_3M` vs `FINANCING_IN_PREV_3M`). No category maps to `FINANCING_IN` in this dataset, so it never fires. `/api/methodology` reports `fired: 0` for it and the Methodology page says "sin datos en este conjunto". Mapping a category later is a config edit. |
| F19 | Replay | SSE with `SseEmitter`. It reads `alerts` and `watchlist` of the unit, M06 → M23 by default. It works in demo mode (read only). |
| F20 | Methodology data | `GET /api/methodology` returns the alert catalogue (from the `AlertRule` beans) and the product parameters (from the current config). No weight values: weights keep coming from `/api/profiles`. |
| F21 | Company rows | Products and alerts are computed for GROUP and COMPANY (decision E2). The monitor, the watchlist and the replay read `entity_type = unit` only. |

## Weights landing (Almudena)

Unchanged from phase 4: weights are a config edit on `main` (`scoring.profiles` and the
`weight` keys of `scoring.indicators`). Neither plan edits them. A's new config keys go at
the end of `scoring-config.yml` or inside the existing `limit-engine` and `insurer` blocks.
The limit engine, the premium and the alerts read `final`, `traj` and `band` from
`profile_scores`, so a weight change flows into them on the next pipeline run with no code
change.

## Why these two plans do not conflict

Paths are relative to the repository root.

| Path | Owner |
|---|---|
| `backend/**` (except the two lines below) | A |
| `scoring.profiles` and the `weight` keys of `scoring.indicators` in `backend/src/main/resources/scoring-config.yml` | Almudena, on `main` only |
| `frontend/**` | B |
| `docs/**`, `CLAUDE.md`, `docker-compose.yml`, `scripts/**` | nobody in phase 5 |

Neither plan edits `docs/DATA_FINDINGS.md`. A puts its findings in its final report. The
person who merges copies them in (run procedure step 7).

## Shared contract (both plans copy this verbatim)

1. **Stage order** (`@Order`): `S00_INGEST` 0 → `S10_STAGING` 10 → `S20_MONTHLY` 20 → `S25_ROLLUP` 25 → `S30_RAW_INDICATORS` 30 → `S40_NORMALIZE` 40 → `S50_TRAJECTORY` 50 → `S60_SCORE` 60 → `S65_EXPLAIN` 65 → `S70_DYNAMICS` 70 → `S75_PRODUCTS` 75 → `S80_ALERTS` 80 → `S95_QUANTILES` 95.

2. **`signal_values`** (`sql/39_signal_inputs.sql`, run by S30). One row per entity-month-signal. `value` NULL = not computable (missing ≠ zero). All windows end at m (causal). 12m amounts are annualized over the active months of the window and need `windows.annualize-min-months` of them (phase 3 contract item 6).
   ```sql
   signal_values (entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, signal_id VARCHAR, value DOUBLE)
   ```
   | `signal_id` | Definition at month m | Used by |
   |---|---|---|
   | `OP_IN_MEDIAN_3M` | median of the monthly net `OPERATING_IN` of m−2..m (EUR). Needs 3 active months. | limit base |
   | `OP_OUT_AVG_3M` | mean of the monthly net `OPERATING_OUT` of m−2..m (EUR). Needs 3 active months. | buyer limit |
   | `NOCF_12M_ANN` | `nocf_12m · 12 / act_12m` (EUR per year) | DSCR cap, projected DSCR |
   | `DEBT_SERVICE_12M_ANN` | `debt_service_12m · 12 / act_12m` (EUR per year) | DSCR cap, projected DSCR |
   | `FINANCING_IN_3M` | net `FINANCING_IN` inflow of m−2..m (EUR). Needs 3 active months. | `FACTORING_SPIKE` |
   | `FINANCING_IN_PREV_3M` | the same for m−5..m−3. Needs 6 active months. | `FACTORING_SPIKE` |
   | `TAX_GAP_MONTHS` | `m − last month with a TAX outflow` (same rule as `TAX_REGULARITY`) | `TAX_GAP` |
   | `TAX_CADENCE_MONTHS` | the entity's own cadence, 1 or 3 (same rule as `TAX_REGULARITY`) | `TAX_GAP` |

3. **`limit_decisions`** (S75). One row per entity-month where `final` of the limit profile is not NULL and `OP_IN_MEDIAN_3M` is not NULL.
   ```sql
   limit_decisions (entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, profile VARCHAR,
                    final DOUBLE, traj DOUBLE, band VARCHAR,
                    base_eur DOUBLE, factor DOUBLE, trend DOUBLE, runway_guard BOOLEAN, raw_limit_eur DOUBLE,
                    nocf_12m DOUBLE, debt_service_12m DOUBLE, dscr_cap_eur DOUBLE,
                    limit_eur DOUBLE, prev_limit_eur DOUBLE, spread_bps INTEGER, all_in_rate DOUBLE,
                    action VARCHAR, binding_constraint VARCHAR, projected_dscr DOUBLE)
   ```
   SPEC §10.1 with `L = limit-engine`:
   - `factor` = 0 if `final < L.score-floor`, else `L.factor-at-floor + (final − L.score-floor) / (100 − L.score-floor) · (L.factor-at100 − L.factor-at-floor)`.
   - `trend` = `clamp(1 + L.trend-modifier-span · (traj − 50) / 50, 1 − L.trend-modifier-span, 1 + L.trend-modifier-span)`; 1 when `traj` is NULL.
   - `raw_limit_eur` = `base_eur · factor · trend`, times `L.runway-guard.multiplier` when `LIQ_RUNWAY` is available and `< L.runway-guard.below-months` (`runway_guard` TRUE).
   - `annual_cost_factor(term)` = `12 / term + L.reference-rate + spread_bps / 10000`. The row uses `L.default-term-months`.
   - `dscr_cap_eur` = `max(0, nocf_12m / L.dscr-min − debt_service_12m) / annual_cost_factor`; NULL when `nocf_12m` is NULL or the band has no spread.
   - `limit_eur` = `min(raw_limit_eur, dscr_cap_eur)` (ignore a NULL cap), rounded **down** to `L.rounding-eur`; 0 when the band has no spread.
   - `binding_constraint` = `DSCR` when the cap is below `raw_limit_eur`, else `RUNWAY` when the guard applied, else `SCORE`.
   - `spread_bps` = `L.spread-bps-by-band[band]`; NULL for a band missing from the map (E). `all_in_rate` = `L.reference-rate + spread_bps / 10000`, NULL with the spread.
   - `projected_dscr` = `nocf_12m / (debt_service_12m + limit_eur · annual_cost_factor)`; NULL when `nocf_12m` is NULL or the denominator is 0.
   - `action`, with `prev` = `limit_eur` of the row at m−1 (NULL when that row does not exist) and `t = L.action-threshold`, first match wins: `FREEZE` if `limit_eur = 0` and `prev > 0`; `DECLINE` if the band has no spread; `MAINTAIN` if `prev` is NULL; `INCREASE` if `limit_eur > prev` and `limit_eur ≥ prev · (1 + t)`; `REDUCE` if `limit_eur < prev` and `limit_eur ≤ prev · (1 − t)`; else `MAINTAIN`.

4. **`premium_quotes`** (S75). One row per entity-month where `final` of the premium profile is not NULL.
   ```sql
   premium_quotes (entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, profile VARCHAR,
                   final DOUBLE, band VARCHAR, insurable BOOLEAN, premium_rate DOUBLE, prev_premium_rate DOUBLE,
                   prev_band VARCHAR, buyer_limit_eur DOUBLE, tier_change VARCHAR)
   ```
   - `insurable` = the band is in `insurer.multiplier-by-band`. `premium_rate` = `insurer.base-premium-rate · multiplier`; NULL when not insurable.
   - `buyer_limit_eur` = `OP_OUT_AVG_3M · (PAY_DPO / 30) · factor(final)` (same `factor` as the limit engine), rounded down to `L.rounding-eur`. NULL when `OP_OUT_AVG_3M` or the raw `PAY_DPO` is missing. 0 when not insurable. It is an exposure **proxy** (SPEC §10.2).
   - `prev_*` come from the row at m−1 (NULL when it does not exist). `tier_change` = `UP` when the band got better, `DOWN` when it got worse, NULL otherwise or when `prev_band` is NULL.

5. **`momentum_screen`** (S75). One row per entity-month where `final` of the momentum profile is not NULL.
   ```sql
   momentum_screen (entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, profile VARCHAR, final DOUBLE,
                    rank INTEGER, of_count INTEGER, traj_percentile INTEGER, growth_percentile INTEGER,
                    rising_star BOOLEAN)
   ```
   - Peers = the rows of the same `entity_type` and month. `rank` = 1 for the highest `final` (ties share the lowest rank). `of_count` = number of peers.
   - `traj_percentile` = mid-rank percentile of `traj` among peers with a `traj`: `round(100 · (less + 0.5 · (equal − 1)) / (n − 1))`, 50 when `n = 1`. NULL when `traj` is NULL. `growth_percentile`: the same on the raw `ACT_COLLECTIONS_GROWTH` value.
   - `rising_star` = `level < products.momentum.rising-star-max-level` and `traj ≥ products.momentum.rising-star-min-traj` (SPEC §10.3: 60 and 70). FALSE when `traj` is NULL.

6. **`alerts`** (S80, transitions only) and **`alert_states`** (S80, every active signal):
   ```sql
   alerts       (entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, profile VARCHAR, code VARCHAR,
                 severity VARCHAR, direction VARCHAR, message VARCHAR, value DOUBLE)
   alert_states (entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, profile VARCHAR, code VARCHAR,
                 severity VARCHAR, direction VARCHAR, value DOUBLE)
   ```
   - `severity` ∈ `WARN, CRITICAL, INFO`. `direction` ∈ `NEGATIVE, POSITIVE`. At most one row per (entity_type, entity_id, month, profile, code) in each table.
   - `code` ∈ `RUNWAY_LOW, DSCR_BREACH, LINE_UTIL_HIGH, DSO_DRIFT, SUPPLIER_LATENESS_UP, OVERDUE_RECEIVABLES, TAX_GAP, CONCENTRATION_HIGH, FACTORING_SPIKE, SCORE_DROP, STRUCTURAL_DECLINE, STRUCTURAL_IMPROVEMENT, BAND_UPGRADE, BAND_DOWNGRADE, LIMIT_ACTION`.
   - Only months with a non-NULL `final` in that profile have rows.
   - Every row of `alerts` has a matching row in `alert_states` (same key, same severity).

7. **`watchlist`** (S80). One row per entity-month-profile on the watchlist:
   ```sql
   watchlist (entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, profile VARCHAR,
              n_critical INTEGER, n_warn INTEGER)
   ```

8. **API (JSON).** Scores rounded to 1 decimal, EUR amounts as integers, rates to 4 decimals, DSCR to 2 decimals. `profile` and `month` are optional query params with the same defaults as phase 4 (`ApiParams`). Unknown entity → 404. A phase 5 table that does not exist → empty lists and `null` fields, never HTTP 500.

   ```ts
   // Alerts
   type Severity = "WARN" | "CRITICAL" | "INFO";
   type Direction = "NEGATIVE" | "POSITIVE";
   type AlertCode = "RUNWAY_LOW" | "DSCR_BREACH" | "LINE_UTIL_HIGH" | "DSO_DRIFT" | "SUPPLIER_LATENESS_UP"
     | "OVERDUE_RECEIVABLES" | "TAX_GAP" | "CONCENTRATION_HIGH" | "FACTORING_SPIKE" | "SCORE_DROP"
     | "STRUCTURAL_DECLINE" | "STRUCTURAL_IMPROVEMENT" | "BAND_UPGRADE" | "BAND_DOWNGRADE" | "LIMIT_ACTION";
   interface Alert {
     id: string;            // `${entityType}:${entityId}:${month}:${code}`
     entityId: string; entityName: string; entityType: EntityType;
     month: string; code: AlertCode; severity: Severity; direction: Direction;
     message: string;       // Spanish, rendered by the pipeline
     value: number | null;
   }
   interface WatchlistRow { row: PortfolioRow; criticalAlerts: number; warnAlerts: number; codes: AlertCode[]; }

   // GET /api/monitor/alerts?profile&month&severity&direction&window=6
   //   alerts of the unit fired in months (month − window + 1)..month, newest month first,
   //   then CRITICAL > WARN > INFO, then entityId. severity/direction filter when given.
   interface MonitorData { profile: string; month: string; fromMonth: string; alerts: Alert[]; watchlist: WatchlistRow[]; }
   // GET /api/monitor/watchlist?profile&month   (rows sorted by criticalAlerts desc, warnAlerts desc, final asc)
   interface Watchlist { profile: string; month: string; rows: WatchlistRow[]; }
   // GET /api/monitor/replay?profile&from&to&stepMs   (text/event-stream)
   //   from default = the 7th month (M06), to default = the last month, stepMs default 1200, clamped to [200, 5000].
   //   one event per month:  event: "month"  data: ReplayFrame
   //   then:                 event: "done"   data: {}   and the stream completes.
   interface ReplayFrame { month: string; newAlerts: Alert[]; watchlistSize: number; }

   // Products
   type LimitAction = "INCREASE" | "REDUCE" | "FREEZE" | "MAINTAIN" | "DECLINE";
   type BindingConstraint = "SCORE" | "DSCR" | "RUNWAY";
   interface LimitDecision {             // GET /api/entities/{id}/limit?month   (404 when no row)
     month: string; profile: string; final: number; band: BandLetter;
     limitEur: number; previousLimitEur: number | null; action: LimitAction; bindingConstraint: BindingConstraint;
     spreadBps: number | null; allInRate: number | null; projectedDscr: number | null;
     baseEur: number; factor: number; trend: number; runwayGuard: boolean; dscrCapEur: number | null;
   }
   // POST /api/entities/{id}/limit/simulate   body: { month?: string; requestedAmountEur: number; termMonths?: number }
   //   400 when requestedAmountEur <= 0 or termMonths outside [1, 120]. 404 when no limit row that month.
   interface LimitSimulation {
     month: string; decision: "APPROVE" | "PARTIAL" | "DECLINE";
     requestedAmountEur: number; approvedAmountEur: number; capacityEur: number; termMonths: number;
     spreadBps: number | null; allInRate: number | null; projectedDscr: number | null;
     bindingConstraint: BindingConstraint | "BAND";
   }
   interface PremiumQuote {              // GET /api/entities/{id}/premium?month   (404 when no row)
     month: string; profile: string; final: number; band: BandLetter; insurable: boolean;
     premiumRate: number | null; previousPremiumRate: number | null; previousBand: BandLetter | null;
     tierChange: "UP" | "DOWN" | null; recommendedBuyerLimitEur: number | null;
   }
   interface MomentumView {
     month: string; profile: string; rank: number; of: number;
     trajPercentile: number | null; growthPercentile: number | null; risingStar: boolean;
   }

   // Changes to phase 4 DTOs (fields added, none removed or renamed)
   interface PortfolioRow { /* … */ activeAlerts: number /* F16 */; risingStar: boolean | null /* null: no momentum row */; }
   interface TimelinePoint { /* … */
     limitEur: number | null; limitAction: LimitAction | null;       // from the limit profile, whatever ?profile is
     premiumRate: number | null; buyerLimitEur: number | null;       // from the premium profile
     newAlerts: number;                                              // alerts fired that month in ?profile
   }
   interface Timeline { /* … */ alerts: Alert[] /* this entity, ?profile, oldest first */; }
   interface EntityDetail { /* … */
     limit: LimitDecision | null; premium: PremiumQuote | null; momentum: MomentumView | null;   // at ?month
     alerts: Alert[];      // this entity, ?profile, months <= ?month, newest first, at most 20
   }
   interface Meta { /* … */ alertsReady: boolean; productsReady: boolean; }

   // GET /api/methodology
   interface Methodology {
     alertRules: { code: AlertCode; direction: "NEGATIVE" | "POSITIVE" | "BOTH"; event: boolean;
                   trigger: string;      // Spanish, from the config thresholds, e.g. "< 3 meses / < 1,5 meses"
                   fired: number }[];    // alerts of the unit in the last run, all profiles (0 = never fired, see F18)
     products: { limitProfile: string; premiumProfile: string; momentumProfile: string };
     limitEngine: { scoreFloor: number; factorAtFloor: number; factorAt100: number; trendModifierSpan: number;
                    runwayGuardBelowMonths: number; runwayGuardMultiplier: number; dscrMin: number;
                    defaultTermMonths: number; referenceRate: number; referenceRateIsExample: boolean;
                    spreadBpsByBand: Partial<Record<BandLetter, number>>; actionThreshold: number; roundingEur: number };
     insurer: { basePremiumRate: number; multiplierByBand: Partial<Record<BandLetter, number>> };
     momentum: { risingStarMaxLevel: number; risingStarMinTraj: number };
     watchlist: { minCritical: number; minWarn: number };
   }
   ```

9. **Weights** (decision E1 still holds). No Java, TypeScript or test file writes a profile weight or λ. `/api/methodology` does not return weights.

10. **Tests.** Only the six tests in `CLAUDE.md`. Phase 5 adds none. A may extend `ScoringConfigValidationTest` so the new keys bind. A scratch test may be used locally and **must be deleted before the commit**.

## Run procedure

1. Commit the three plan files, the `CLAUDE.md` note on `reference-rate` and the config comment on `main`, and push. Worktrees see only committed files.
2. Create one worktree for each branch:
   ```bash
   git worktree add -b feat/phase5-backend  ../xray-phase5-a main
   git worktree add -b feat/phase5-frontend ../xray-phase5-b main
   ```
3. Link the data into A's worktree (`data/raw/` is gitignored). B needs no data.
   ```bash
   mkdir -p ../xray-phase5-a/data
   ln -s "$PWD/data/raw" ../xray-phase5-a/data/raw
   ```
   A's backend runs with `SERVER_PORT=8081`. B's Vite dev server runs on port 5174: `npm run dev:mock -- --port 5174` on mocks, and `VITE_API_TARGET=http://localhost:8081 npm run dev -- --port 5174` against A's backend (plan B Task 11).
4. Start one agent in each worktree with this prompt (change the plan file):
   > Read `CLAUDE.md`, then execute `docs/superpowers/plans/2026-09-19-phase5-A-backend.md`
   > task by task. Only edit the paths this plan owns (see the overview file).
   > Commit after each task. Do not merge. Stop and report when all tasks are done.
5. When both agents report done, merge A first, then B:
   ```bash
   git checkout main && git pull
   git merge --no-ff feat/phase5-backend  -m "merge: phase 5 backend (products and alerts)"
   git merge --no-ff feat/phase5-frontend -m "merge: phase 5 frontend (monitor and product panels)"
   ```
   Expected result: no conflicts. If there is a conflict, one agent edited a path it does not own. Keep the owner's version.
6. Post-merge smoke test (repository root):
   ```bash
   (cd backend && ./mvnw -q test)               # 5 tests
   rm -f data/xray.duckdb data/xray.duckdb.wal
   (cd backend && ./mvnw spring-boot:run) &     # wait for "pipeline run ... done"
   curl -s localhost:8080/api/pipeline/status | jq '.stageTimingsMs | keys | length'                       # 13
   curl -s 'localhost:8080/api/monitor/alerts?profile=BANK&month=2026-08' | jq '.alerts | length, (.watchlist | length)'
   curl -s 'localhost:8080/api/entities/GROUP_0016/limit?month=2026-08' | jq '.limitEur, .action'
   curl -s -X POST localhost:8080/api/entities/GROUP_0016/limit/simulate \
        -H 'Content-Type: application/json' -d '{"requestedAmountEur": 100000, "termMonths": 24}' | jq
   curl -sN 'localhost:8080/api/monitor/replay?profile=BANK&stepMs=200' | head -20
   curl -s localhost:8080/api/methodology | jq '.alertRules | length'                                      # 15
   ```
   Stop the backend, then check on a copy of the database (`cp data/xray.duckdb /tmp/x.duckdb`):
   ```sql
   -- every alert has its state: expect 0
   SELECT COUNT(*) FROM alerts a ANTI JOIN alert_states s USING (entity_type, entity_id, month, profile, code, severity);
   -- one alert per key: expect 0
   SELECT COUNT(*) FROM (SELECT 1 FROM alerts GROUP BY entity_type, entity_id, month, profile, code HAVING COUNT(*) > 1);
   -- alert mix of the unit
   SELECT profile, code, severity, COUNT(*) FROM alerts WHERE entity_type = 'GROUP' GROUP BY ALL ORDER BY 1, 4 DESC;
   -- watchlist size per month, BANK
   SELECT month, COUNT(*) FROM watchlist WHERE entity_type = 'GROUP' AND profile = 'BANK' GROUP BY 1 ORDER BY 1;
   -- limit actions of the unit
   SELECT action, binding_constraint, COUNT(*) FROM limit_decisions WHERE entity_type = 'GROUP' GROUP BY ALL ORDER BY 3 DESC;
   ```
   Then open the frontend (`cd frontend && npm run dev`): `/monitor` (play the replay), `/entity/GROUP_0016?profile=BANK` (limit history, simulator), `?profile=INSURER` (premium), `?profile=FUND` (momentum), `/methodology`.
7. Copy A's findings (from A's final report) into `docs/DATA_FINDINGS.md` under "Block 6–7 run": stage timings, the alert mix at M23, the watchlist size per month, the limit action mix, the showcase entities with a reduction before the event. If the BANK watchlist holds more than 30 % of the groups at M23, or fewer than 3 %, flag the `alerts` thresholds for review.
8. Build and deploy (`docker compose up --build`, then the public URL, `docs/DEPLOY.md`). Check the replay through nginx (SSE must not be buffered: see plan B Task 11 step 4). Push `main`. Remove the worktrees: `git worktree remove ../xray-phase5-a ../xray-phase5-b`.

## What comes after phase 5 (phase 6 = Block 8)

- `S90_Analytics`: lead-time events and stats per profile, false alarm rate, showcase pairs. `LookAheadTest`.
- Compare page on real data (preloaded with the top showcase pair). Methodology lead-time section.
- Static JSON fallback for Portfolio and the showcase entities (SPEC §14). Freeze `xray.duckdb`, deploy, rehearse.
- Human review of the 10 pending anchors and of `reference-rate`. Almudena's weights.
- Sunday: run the pipeline on the hidden-test CSVs, check the scoring unit from the test IDs, adapt `SubmissionExporter`, submit.
