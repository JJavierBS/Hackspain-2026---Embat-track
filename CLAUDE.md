# CLAUDE.md — X-Ray (HackSpain 2026 · Embat challenge)

Financial health scoring engine (0–100, Level + Trajectory) over SME treasury data, with explanations, dip-vs-decline detection, measured anticipation, an alert monitor, and a sellable product on top: a self-recalculating working-capital limit engine (the SME pays first, the lender second — decision P1), plus insurer (dynamic premium) and fund (momentum) views selected by a global `?profile=BANK|FUND|INSURER` parameter.

Hackathon context: two developers, ~20 effective hours, demo on Sunday 11:00. **A working, deployed demo beats elegant code.** Never leave `main` broken.

## Read first
1. `docs/DECISIONS.md` — **every decision, with its reason and its evidence.** Read it before you change anything it covers, and add a row when you close something.
2. `docs/SPEC.md` — **what** to compute: data, indicators, anchors, scoring formulas, regimes, alerts, products. Its status header lists the parts that are superseded.
3. `docs/ARCHITECTURE.md` — **how** to build it: packages, contracts, pipeline stages, SQL files, extension points, tests, build order.
4. `docs/DATA_FINDINGS.md` — answers to data profiling (SPEC §4). Check it before implementing anything marked `⚠ UNKNOWN`.
5. `docs/THRESHOLDS.md` — status of the 10 `⏳ PENDING` anchors (SPEC §6.1).
6. `docs/ALGORITHM_PAGE.md`, `docs/PRESETS.md`, `docs/SECTOR_PRESETS.md`, `docs/CUSTOM_PRESETS.md` — the expert configuration page, the runtime overrides, the client presets, the per-entity sector tuning and the presets a client writes itself.

`README.md` maps every other file.

Precedence: **DECISIONS wins over everything.** Then SPEC on *what*, ARCHITECTURE on *how*.

## Stack
- Backend: Java 21, Spring Boot 3.x, Maven, **DuckDB embedded via JDBC** (single file `data/xray.duckdb`), `JdbcTemplate`, plain SQL in `backend/src/main/resources/sql/`, springdoc-openapi, JUnit 5. No JPA, no MySQL/Postgres, no Smile.
- Frontend: React 19 + TypeScript + Vite, React Router, TanStack Query, Recharts, Tailwind 4.
- Deploy: docker-compose (backend :8080, frontend nginx :80 proxying `/api`), public URL, `xray.demo-mode=true` serving a frozen `xray.duckdb` (render.yaml and docker-compose set it). The pipeline never runs in prod.

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
8. **No recomputation in requests.** API reads results tables. All three profiles are materialized at pipeline time. Target < 1 s per page. Two what-if requests compute and write nothing: the limit simulator and `POST /api/entities/{id}/tuning` (one entity, through `PanelScoring`, the same code as S40–S60).
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

## Decisions and open items
Both live in `docs/DECISIONS.md`. Do not restate a decision here, in SPEC or in a code comment:
add the row there and point at it. Four that catch agents out:

- **Supervised calibration is out of scope** (M10). Only the `ScoreCalibrator` interface exists. Do not add Smile, `/api/labels` or `/api/model/*`.
- **Profile weights are closed** (W1–W3). Only three events reopen one, and they are listed in the register.
- **Products run before alerts**: `S75_Products`, then `S80_Alerts` (P3). `LIMIT_ACTION` reads a limit decision.
- **`limit-engine.reference-rate` is an example value** (W6). Change it when the user's instructions say so, and record the new value and its source in `docs/THRESHOLDS.md`.

Still open: the hidden test unit and submission format, the ten pending anchors, and the reference
rate. `DECISIONS.md` §5 has the owner and the trigger for each one.
