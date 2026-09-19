# Phase 3 — Parallel Execution Overview

Phase 3 = **Block 3 (indicators)** of `docs/ARCHITECTURE.md §11`, plus the
data-independent core of **Block 4 (score)**: anchors, trajectory, categories
and profiles in Java (`S40`–`S60`). The same approach as phase 2, which prepared
Block 3. Two plans on two branches run at the same time, then both branches
merge into `main`.

| Plan | Branch | Owner (agent) | File |
|---|---|---|---|
| A — Indicators: liquidity, cash flow, activity, debt, leverage, tax | `feat/phase3-indicators-a` | Claude Code or Antigravity | `2026-09-19-phase3-A-indicators.md` |
| B — Indicators: payment, delinquency, concentration + scoring core S40–S60 | `feat/phase3-scoring-b` | Claude Code or Antigravity | `2026-09-19-phase3-B-scoring.md` |

Estimate: A about 4–5 h of agent time (the credit-line rebuild and the tax
cadence are the slow parts). B about 4–5 h. Merge, smoke test and the
threshold proposals: 45 min.

Done when (SPEC §13 M2, and M3 without the API and the submission):
- `indicator_values_raw` holds the 22 indicators for `COMPANY` and `GROUP`, one row per entity-month-indicator (the dense grid of `entity_months`).
- The backend log shows the availability % of every indicator for the active unit.
- `threshold_quantiles` is filled, and `docs/THRESHOLDS.md` has quantiles and a **proposal** for the 10 pending anchors. The config keeps the provisional anchors until a human review (decision 2026-09-19).
- `S40`–`S60` write `indicator_values`, `category_scores` and `profile_scores` (250 groups × 24 months × 3 profiles). Every `final` is null or in [0, 100].
- `AnchorInterpolatorTest`, `ProfileRenormalizationTest`, `RollupTest` and `ScoringConfigValidationTest` pass.
- The histogram of `final` at M23 is recorded (CLAUDE.md: if it clusters in a ~15-point band, widen anchors, never weights).

## State at the start of phase 3 (checked 2026-09-19)

- Phase 2 is merged (`origin/main` = `7ba1c10`, PRs #2 and #3). The post-merge smoke test passed: 6 stages `DONE` in about 10 s, `COMPANY 1286 / GROUP 250` in `entities`, company and group rows in every monthly contract table, `S30_RAW_INDICATORS loaded 250 panels`, `indicator_values_raw` empty.
- `entity_months` (prep commit, see below): 6,000 group-months, 4,280 active. **Only 95 of 250 groups are active from M00**, so short histories are the norm, not an edge case.
- The hidden test arrives on Sunday. It uses the same CSV format as `data/raw/` (CLAUDE.md resolved conflict 2). The pipeline must run unchanged on another raw directory. Every SQL file reads `${raw_dir}` and the config, and never a constant tied to the training entities.

## Decisions taken before writing the plans (2026-09-19, José Javier)

| # | Question | Decision |
|---|---|---|
| D1 | `LIQ_RUNWAY` "monthly net outflow" | Burn = `OPERATING_OUT + TAX + DEBT_SERVICE − OPERATING_IN` = −(NOCF − DEBT_SERVICE). `INTERNAL`, `FINANCING_IN` and `OTHER` excluded. |
| D2 | `TAX_REGULARITY` cadence | Cadence = median gap between the months with a TAX outflow in the history up to m. A median gap ≤ 1.5 means monthly (1), otherwise quarterly (3). `value = min(1, tax_months_in_window / expected) × (gap_now > cadence ? cadence / gap_now : 1)`. Thresholds live in config. |
| D3 | Zero denominator | Denominator 0 and numerator > 0 → the **limit value**: the x of the best anchor (score 100) for a higher-is-better ratio, the x of the worst anchor (score 0) for a lower-is-better ratio. Numerator and denominator both 0 → `available = false`. The best and worst x come from `scoring-config.yml` through `SqlParams`, never literals. |
| D4 | `DEBT_LINE_UTIL` | Monthly for credit lines with transactions (drawn balance rebuilt backwards from the snapshot, like cash). Static `outstanding / granted` for the others, `is_static = true` if the entity has no rebuilt line. |
| D5 | Missing trajectory | When a category has a level but no trajectory, `blended = level`. The profile's `traj` is null that month. |
| D6 | Pending anchors | Quantiles and proposals go to `docs/THRESHOLDS.md` only. `scoring-config.yml` keeps the provisional anchors. |
| D7 | Split | `sql/38_ind_tax.sql` moves from B to A (A: 13 indicators, B: 9 indicators and the Java scoring core). |
| D9 | Concentration source | Only 4.9 % of the operating-inflow amount has a `counterparty_id` (2.0 % of outflows; median 26 % per company; 657 companies have none). `CON_*` stay on transactions (`monthly_counterparty`, as in SPEC), but they are available only when the identified flow covers at least `concentration.min-counterparty-coverage` (0.5, provisional) of the window's operating flow. |
| D8 | Scope | Block 3 and the Block 4 core. The Block 4 API, Portfolio page and `SubmissionExporter` are **not** in phase 3. |

## Prep commit on `main` (done before branching)

These changes are shared by both plans. They are committed on `main` together
with the three plan files, so neither agent edits a file the other owns:

1. `sql/28_entity_months.sql` builds `entity_months`, the dense entity × month grid (contract item 3).
2. `S30_RawIndicators` passes **every** `SqlParams` placeholder to the indicator SQL, plus `unit`, `runway_cap_months` and `reference_rate`, and runs `sql/28` after the `entities` check.
3. `SqlParams` exposes `best_x_<ID>` and `worst_x_<ID>` for every indicator, read from its anchors (decision D3, contract item 8).
4. `scoring-config.yml` + `ScoringConfig`: `lev-debt-to-cf.non-positive-cf-level: 0`, `momentum: { points-per-month: 2, cap: 10 }` (read by B's S40 and S60) and `concentration.min-counterparty-coverage: 0.5` (placeholder `${con_min_coverage}`, read by B's `sql/37`). `ScoringConfigValidationTest.copyWith` updated.
5. `scripts/DuckQuery.java`: a one-file JDBC query tool for machines without the DuckDB CLI.

## Why these two plans do not conflict

Paths are relative to `backend/src/main/` unless they start with `backend/`,
`docs/` or `scripts/`.

| Path | Owner |
|---|---|
| `resources/sql/30_*` … `resources/sql/34_*`, `resources/sql/38_*` | A |
| `java/com/xray/config/**`, `resources/scoring-config.yml`, `backend/src/test/java/com/xray/config/**` | A |
| `java/com/xray/pipeline/stages/SqlParams.java` | A |
| `docs/DATA_FINDINGS.md`, `scripts/**` | A |
| `resources/sql/35_*` … `resources/sql/37_*` | B |
| `java/com/xray/domain/**` except the six existing enums and `CausalWindow` | B |
| `java/com/xray/pipeline/stages/S30_RawIndicators.java`, `S40_*`, `S50_*`, `S60_*` | B |
| `java/com/xray/pipeline/PipelineContext.java` | B (add fields only, keep the constructor) |
| `backend/src/test/java/com/xray/domain/**` | B |
| `resources/sql/25_*`, `28_*`, `29_*`, `90_*`, `PanelLoader.java`, `ResultWriter.java`, `PipelineRunner.java`, `frontend/**`, `docs/THRESHOLDS.md`, `CLAUDE.md`, `docs/SPEC.md`, `docs/ARCHITECTURE.md` | nobody in phase 3 |

`docs/THRESHOLDS.md` belongs to nobody so that the two branches never touch
it. It is filled after the merge (run procedure step 7).
B never edits `DATA_FINDINGS.md`. B puts its data findings in its final
report, and the person who merges copies them in (run procedure step 8).

## Shared contract (both plans copy this verbatim)

1. Stage order (`@Order`): `S00_INGEST` 0 → `S10_STAGING` 10 → `S20_MONTHLY` 20 → `S25_ROLLUP` 25 → `S30_RAW_INDICATORS` 30 → `S40_NORMALIZE` 40 → `S50_TRAJECTORY` 50 → `S60_SCORE` 60 → `S95_QUANTILES` 95.
2. Inside S30: `sql/29` → (entities check) → `sql/28` → every `sql/3[0-8]_*.sql` in filename order. A file may read tables that an earlier-numbered file created. **No file of B reads a table created by a file of A, and the reverse is also true.** Helper tables are prefixed with the owner's file number (`ind30_base`, `ind35_inv`, …) and dropped at the end of the file that created them, or kept only while the same plan's later files still need them.
3. The grid:
   ```sql
   CREATE OR REPLACE TABLE entity_months AS  -- sql/28, one row per entity x month, both entity types
     (entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, month_idx INTEGER, month_end DATE, is_active BOOLEAN)
   ```
   `is_active` = the month is on or after the entity's first month with a booked flow (`monthly_flows.n_txn > 0`).
4. **Output rows.** Every indicator writes **exactly one row per `entity_months` row** (both entity types, all 24 months), into:
   ```sql
   indicator_values_raw (entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, indicator_id VARCHAR,
                         value DOUBLE, available BOOLEAN, is_static BOOLEAN, fallback BOOLEAN)
   ```
   If the value can't be computed, write `value NULL, available FALSE`. A month with `is_active = FALSE` is always `available = FALSE`. `available` is **never NULL**: after a `LEFT JOIN`, wrap the condition in `COALESCE(…, FALSE)`.
5. **Rule-defined levels.** `value NULL, available TRUE` is allowed for exactly two cases, and S40 maps them from config:
   - `DEBT_DSCR` with no debt service in the 3m window → `debt-dscr.no-debt-level` (100).
   - `LEV_DEBT_TO_CF` with debt > 0 and NOCF_12m ≤ 0 → `lev-debt-to-cf.non-positive-cf-level` (0).
   S40 throws `IllegalStateException` on any other indicator with `available AND value IS NULL`.
6. **Windows.** Month ordinals come from `entity_months.month_idx`. A `k`-month window at m covers `m−k+1 … m`. A 3m or 6m window requires **all** k months active. 12m windows annualize or scale over the active months in the window. They need at least `windows.annualize-min-months` active months (A adds the key, default 6) and set `fallback = TRUE` when there are fewer than 12. Window functions use `ROWS BETWEEN k-1 PRECEDING AND CURRENT ROW` over the dense grid, ordered by `month_idx`, partitioned by `entity_type, entity_id`.
7. **Levels.** `COMPANY` rows read company rows of the monthly tables, intragroup included (standalone view). `GROUP` rows read group rows (intragroup already removed). Group values are ratios of **summed components**, never an average of company ratios (CLAUDE.md rule 4). A file that reads `stg_*` directly (debt lines, interest) builds company components first, then sums them per group through `stg_companies`, excluding `is_intragroup` rows.
8. **Zero denominator** (decision D3). The limit values are `SqlParams` placeholders `${best_x_<INDICATOR_ID>}` (x of the highest-score anchor) and `${worst_x_<INDICATOR_ID>}` (x of the lowest-score anchor), for all 22 indicators (prep commit). SQL never writes an anchor value as a literal.
9. **Causality.** A value for month m reads only data with a date ≤ `month_end` of m, except snapshot-derived values, which set `is_static = TRUE` (SPEC §0.2).
10. **Results tables written by B (S60),** with `ResultWriter.replace`, for the active unit:
    ```sql
    indicator_values (entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, indicator_id VARCHAR, category VARCHAR,
                      value DOUBLE, level_score DOUBLE, traj_score DOUBLE, available BOOLEAN,
                      is_static BOOLEAN, fallback BOOLEAN, anchor_status VARCHAR)
    category_scores  (entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, category VARCHAR,
                      level DOUBLE, traj DOUBLE, n_available INTEGER)
    profile_scores   (entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, profile VARCHAR,
                      final DOUBLE, level DOUBLE, traj DOUBLE, band VARCHAR, momentum DOUBLE,
                      mom_persistence INTEGER, status VARCHAR, regime VARCHAR, confidence VARCHAR)
    ```
    `status`, `regime` and `confidence` are written as NULL. Block 5 (`S70`) fills them. Scores are stored unrounded (rounding happens at the API boundary).
11. The domain layer never imports `com.xray.config` (it would pull Spring in). Stages map config records to plain domain parameters.
12. Tests: only the six in CLAUDE.md. Phase 3 adds `AnchorInterpolatorTest` and `ProfileRenormalizationTest` (B). A scratch test may be used locally and **must be deleted before the commit**.

## Run procedure

1. Commit the prep changes and the three plan files on `main` and push. Worktrees see only committed files.
2. Create one worktree for each branch:
   ```bash
   git worktree add -b feat/phase3-indicators-a ../xray-phase3-a main
   git worktree add -b feat/phase3-scoring-b    ../xray-phase3-b main
   ```
3. Link the data into each worktree (`data/raw/` is gitignored):
   ```bash
   mkdir -p ../xray-phase3-a/data ../xray-phase3-b/data
   ln -s "$PWD/data/raw" ../xray-phase3-a/data/raw
   ln -s "$PWD/data/raw" ../xray-phase3-b/data/raw
   ```
   Each worktree has its own `data/xray.duckdb`. Two backends can run at the same time only on different ports: `SERVER_PORT=8081` for A and `8082` for B.
4. Start one agent in each worktree with this prompt (change the plan file):
   > Read `CLAUDE.md`, then execute `docs/superpowers/plans/2026-09-19-phase3-A-indicators.md`
   > task by task. Only edit the paths this plan owns (see the overview file).
   > Commit after each task. Do not merge. Stop and report when all tasks are done.
5. When both agents report done, merge A first, then B:
   ```bash
   git checkout main && git pull
   git merge --no-ff feat/phase3-indicators-a -m "merge: phase 3 indicators a"
   git merge --no-ff feat/phase3-scoring-b    -m "merge: phase 3 indicators b and scoring core"
   ```
   Expected result: no conflicts. If there is a conflict, one agent edited a path it does not own. Keep the owner's version.
6. Post-merge smoke test (repository root):
   ```bash
   (cd backend && ./mvnw -q test)            # 4 tests: Anchor, ProfileRenormalization, Rollup, ScoringConfigValidation
   rm -f data/xray.duckdb data/xray.duckdb.wal
   (cd backend && ./mvnw spring-boot:run) &  # wait for "pipeline run ... done"
   curl -s localhost:8080/api/pipeline/status   # DONE, 9 stages in stageTimingsMs
   ```
   Stop the backend, then check (DuckDB CLI, or the JDBC one-file query tool in plan A Task 0):
   ```sql
   SELECT entity_type, indicator_id, COUNT(*), AVG(available::INT) FROM indicator_values_raw GROUP BY 1, 2 ORDER BY 1, 2;
   -- 44 rows (22 x 2 entity types); COUNT = 6000 for GROUP and 30864 for COMPANY on every row
   SELECT profile, COUNT(*), MIN(final), MAX(final) FROM profile_scores GROUP BY 1;   -- 6000 each, within [0, 100]
   SELECT profile, FLOOR(final / 5) * 5 AS bucket, COUNT(*) FROM profile_scores
     WHERE month = '2026-08' GROUP BY 1, 2 ORDER BY 1, 2;                              -- histogram at M23
   ```
7. Fill `docs/THRESHOLDS.md` from `threshold_quantiles`. For each of the 10 pending indicators: the p5/p25/p50/p75/p95 column, then a proposal that respects the fixed part and uses rounded values, with a one-line justification (SPEC §6.1 steps 1–3). **Do not change `scoring-config.yml`** (D6). A human review closes them.
8. Copy B's data findings (from B's final report) into `docs/DATA_FINDINGS.md` under "Block 3 run". Add the stage timings (target: full run < 5 min) and the M23 histogram. If the histogram clusters in a ~15-point band, flag it: widen anchors after the review, never weights.
9. Push `main`. Remove the worktrees: `git worktree remove ../xray-phase3-a ../xray-phase3-b`.

## What comes after phase 3

The rest of Block 4, then Blocks 5–8 (ARCHITECTURE §11):
- API: `/api/meta`, `/api/profiles`, `/api/portfolio`, `/api/entities/{id}` reading `profile_scores`, `category_scores`, `indicator_values`. Portfolio page on real data.
- `SubmissionExporter` (`entity_id,score` at M23, BANK profile by default). On Sunday: run the pipeline on the hidden-test CSVs (same format), check the scoring unit from the test IDs, submit.
- Company panels for the group drilldown (S30 loads only the active unit today).
- Block 5: `S65` contributions + `ExplanationSumTest` (uses the effective weights that S60 keeps in memory), `S70` CUSUM, regimes, statuses, confidence.
- Human review of the 10 pending anchors (THRESHOLDS.md), then `status: closed`.
