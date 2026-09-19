# CLAUDE.md — X-Ray (HackSpain 2026 · Embat challenge)

Financial health scoring engine (0–100, Level + Trajectory) over SME treasury data, with explanations, dip-vs-decline detection, measured anticipation, an alert monitor, and a sellable product on top: a self-recalculating working-capital limit engine for banks, plus insurer (dynamic premium) and fund (momentum) views selected by a global `?profile=BANK|FUND|INSURER` parameter.

Hackathon context: two developers, ~20 effective hours, demo on Sunday 11:00. **A working, deployed demo beats elegant code.** Never leave `main` broken.

## Read first
1. `docs/SPEC.md` — **what** to compute: data, indicators, anchors, weights, scoring formulas, regimes, alerts, products, API, UI.
2. `docs/ARCHITECTURE.md` — **how** to build it: packages, contracts, pipeline stages, SQL files, extension points, tests, build order.
3. `docs/DATA_FINDINGS.md` — answers to data profiling (SPEC §4). Check it before implementing anything marked `⚠ UNKNOWN`.
4. `docs/THRESHOLDS.md` — status of the 10 `⏳ PENDING` anchors (SPEC §6.1).
5. `docs/ALGORITHM_PAGE.md` and `docs/PRESETS.md` — the expert configuration page, the runtime overrides and the sourced client presets.

Precedence: SPEC wins on *what*, ARCHITECTURE wins on *how*. `ARCHITECTURE.md §0 Locked decisions` overrides older SPEC text. Resolved conflicts between the two are listed at the end of this file — apply them.

## Stack
- Backend: Java 21, Spring Boot 3.x, Maven, **DuckDB embedded via JDBC** (single file `data/xray.duckdb`), `JdbcTemplate`, plain SQL in `backend/src/main/resources/sql/`, springdoc-openapi, JUnit 5. No JPA, no MySQL/Postgres, no Smile.
- Frontend: React 18 + TypeScript + Vite, React Router, TanStack Query, Recharts, Tailwind.
- Deploy: docker-compose (backend :8080, frontend nginx :80 proxying `/api`), public URL, `xray.demo-mode=true` serving a frozen `xray.duckdb`.

## Commands
```bash
# data: put the Embat CSVs in data/raw/ (gitignored)
cd backend && ./mvnw spring-boot:run          # boots API; runs pipeline on startup if pipeline_runs is empty
cd backend && ./mvnw test                     # the 6 required tests (ARCHITECTURE §9)
curl -X POST localhost:8080/api/pipeline/run  # rerun pipeline; GET /api/pipeline/status for progress
curl localhost:8080/api/config                # active config + shipped defaults; PUT saves overrides, DELETE resets
cd frontend && npm install && npm run dev     # Vite dev server, proxies /api to :8080
docker compose up --build                     # full stack as deployed
```
Swagger UI: `http://localhost:8080/swagger-ui.html`.

## Non-negotiable rules
1. **Causality.** A value for month `m` uses only data dated ≤ end of month `m`. Use `CausalWindow`. `LookAheadTest` must pass; it is what makes the lead-time numbers defensible.
2. **Anchors only.** Level scores are absolute piecewise-linear functions of the entity's own value, clamped, **no extrapolation**. No runtime percentile anywhere in the scoring path. Quantiles are reference-only (`threshold_quantiles`) and never read by scoring code.
3. **Missing ≠ zero.** Unavailable indicators are excluded and weights renormalized over available categories.
4. **Never average ratios across companies.** Groups sum components (intragroup removed) and recompute ratios (`25_entity_rollup.sql`).
5. **Config over code.** Every threshold, anchor, weight, flow-class mapping and λ lives in `scoring-config.yml`, bound to typed records. Never hardcode or special-case a weight value — weights are provisional.
6. **`domain/` is pure.** No `org.springframework`, no `java.sql` imports.
7. **Don't assume `⚠ UNKNOWN` data semantics** (invoice direction, category names, `exchange_rate` convention, intragroup IDs, scoring unit, submission format). Profile the data, record it in `DATA_FINDINGS.md`, then change config.
8. **No recomputation in requests.** API reads results tables. All three profiles are materialized at pipeline time. Target < 1 s per page.
9. **No external API calls at runtime.** Narratives come from `TemplateNarrativeRenderer`.
10. **Use the four extension points only** (`PipelineStage`, `AlertRule`, `NarrativeRenderer`, `ScoreCalibrator`). Do not invent new plugin mechanisms.

## How to work
- Follow the block plan in ARCHITECTURE §11 (maps to SPEC §13 milestones). Finish a block end-to-end (SQL → Java → API → UI where applicable) before starting the next.
- **Build every feature in the spec.** The cut list in ARCHITECTURE §11 is a contingency that only a human triggers; never cut on your own initiative.
- Small commits that keep the app booting and the deployed URL working. Deploy after every block.
- Adding an indicator: enum constant + `scoring-config.yml` entry + INSERT in the right `3x_ind_*.sql` (ARCHITECTURE §8.4).
- Adding an alert: one class in `alerting/rules/`, a pure predicate; transitions are handled by `AlertEngine`.
- Results tables are written with the DuckDB Appender (`ResultWriter`), dropped and recreated per run.
- When a spec value turns out wrong against the data, change the config and write down why in `DATA_FINDINGS.md` or `THRESHOLDS.md`. Do not silently diverge from SPEC.
- Expert edits from `/algorithm` live in `data/scoring-overrides.yml`, never in `scoring-config.yml`. A preset in `presets.yml` needs a source that we read for each value, and never changes a weight (`docs/PRESETS.md`).
- After block 4, check the histogram of `final` at M23. If it clusters in a ~15-point band, widen anchors. Do not touch weights.

## Conventions
- English for code, identifiers, commits, API and docs. UI copy may be Spanish.
- No `Co-Authored-By: Claude` trailer (or any AI attribution line) in commit messages or PR descriptions.
- Months as `Month` value object / `YYYY-MM` strings, `M00 = 2024-09` … `M23 = 2026-08`.
- DTOs are Java `record`s. Scores rounded to 1 decimal at the API boundary only.
- SQL files are numbered and run in filename order with `${placeholder}` substitution.
- Frontend: `profile` and `month` live in URL search params; every view is linkable.

## Required tests (only these)
`AnchorInterpolatorTest`, `ExplanationSumTest`, `LookAheadTest`, `ProfileRenormalizationTest`, `RollupTest`, `ScoringConfigValidationTest` — see ARCHITECTURE §9.

## Resolved conflicts between SPEC and ARCHITECTURE (apply these)
1. **Supervised calibration** (SPEC §7.7, M9, `/api/labels`, `/api/model/*`, `CALIBRATED` export profile): **out of scope** per ARCHITECTURE §0. Only the `ScoreCalibrator` interface exists. Do not add Smile or those endpoints.
2. **Hidden test timing and format:** the hidden test, scoring script and leaderboard are **not available before Sunday** (confirmed 2026-09-19, despite the track text saying Friday). The one thing known: the hidden test comes in **exactly the same format as the CSVs we already have** (`data/raw/*.csv`). So the pipeline must be able to run unchanged on a second set of raw CSVs. Until Sunday, `SubmissionExporter` defaults to `entity_id,score` at M23. On Sunday, check the scoring unit from the test IDs, adapt the exporter and submit once.
3. **Stage order:** the `LIMIT_ACTION` alert needs limit decisions, but ARCHITECTURE runs `S80_Alerts` before `S85_Products`. Run products first: rename to `S75_Products` (limit engine and premium depend only on scores, regimes and indicators, never on alerts), keep `S80_Alerts` after it.
4. **Provisional anchors:** SPEC §9 shows `CF_VOLATILITY` with `anchors: []`, which fails boot validation (ARCHITECTURE §4.3). Ship these provisional placeholders (`status: pending`) until THRESHOLDS.md closes them:
   - `CF_VOLATILITY` (lower is better): `[[0.1,100],[0.3,70],[0.6,40],[1.0,15],[2.0,0]]`
   - `CON_CUSTOMER_CHURN` (lower is better): `[[0.0,100],[0.1,75],[0.25,45],[0.5,15],[0.8,0]]`
   - Any other pending indicator without a full anchor list gets a placeholder of the same shape, respecting the fixed part in SPEC §6.1.
5. **Package structure and API:** ARCHITECTURE §3 supersedes SPEC §12.3. SPEC §12.5 endpoints apply except the supervised ones (item 1).
6. **Threshold quantiles:** computed per `entity_type` for the active unit (ARCHITECTURE §5), via `sql/90_threshold_quantiles.sql` (SPEC §6.1's filename is outdated).
7. **`DEBT_DSCR` with no debt:** level 100 by default, exposed as `debtDscr.noDebtLevel` in config (add the key to `scoring-config.yml`).

## Open items (don't guess — check or ask)
- Scoring unit, labels and submission format → Embat (hidden test, Sunday). Input format = same CSVs as `data/raw/`.
- 10 `⏳ PENDING` anchors → Fran / José Javier after block 3 quantiles.
- Profile weights → **closed 2026-09-19** (Embat CTO). Keep them. `docs/WEIGHTS_JUSTIFICATION.md` gives the reasons and the only cases that justify a change.
- `limit-engine.reference-rate` in `scoring-config.yml` (0.035) is an **example value**, not agreed with the experts yet. It feeds the limit engine, the simulator and `LEV_FUNDING_COST`. Any agent may change it when the user's instructions say otherwise; record the new value and its source in `docs/THRESHOLDS.md`.
