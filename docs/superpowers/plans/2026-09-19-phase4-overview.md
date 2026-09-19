# Phase 4 — Parallel Execution Overview

Phase 4 = the rest of **Block 4 (score)** and **Block 5 (explain and dynamics)** of
`docs/ARCHITECTURE.md §11`. Two plans on two branches run at the same time, then
both branches merge into `main`. The weights are not final: Almudena is finishing
the profile weights and the category weighting. Nothing in phase 4 waits for her
(see "Weights landing" below).

| Plan | Branch | Owner (agent) | File |
|---|---|---|---|
| A — Read API, submission export, frontend on real data | `feat/phase4-api-frontend` | Claude Code or Antigravity | `2026-09-19-phase4-A-api-frontend.md` |
| B — Explanation (S65), dynamics (S70), company panels | `feat/phase4-explain-dynamics` | Claude Code or Antigravity | `2026-09-19-phase4-B-explain-dynamics.md` |

Estimate: A about 5–6 h of agent time (the frontend is the slow part). B about
4–5 h. Merge and smoke test: 30 min.

Done when (SPEC §13 M3 without the submission upload, M4, and M5):
- `GET /api/meta`, `/api/profiles`, `/api/portfolio`, `/api/entities/{id}`, `/api/entities/{id}/timeline`, `/api/analytics/distribution` and `/api/export/submission` answer from the results tables in < 1 s.
- The Portfolio and Entity pages show real data. The profile switch re-ranks the portfolio.
- `contributions` sums to `final − 50` within 0.05 for every entity-month-profile (`ExplanationSumTest` plus the SQL check in the run procedure).
- Every row of `profile_scores` with a `final` has a `status`, a `regime` and a `confidence`.
- Group entities show their member companies, scored standalone.
- The five tests pass: `AnchorInterpolatorTest`, `ExplanationSumTest`, `ProfileRenormalizationTest`, `RollupTest`, `ScoringConfigValidationTest`.

## State at the start of phase 4 (checked 2026-09-19)

- Phase 3 is merged (`main` = `5943beb`, PRs #4 and #5). The post-merge smoke test passed: 9 stages `DONE` in 9.5 s, 22 indicators × 2 entity types, `profile_scores` 6,000 rows per profile, 4,280 with a `final`, every `final` in [0, 100]. See `docs/DATA_FINDINGS.md` "Block 3 run (merged)".
- M23 histogram: BANK p5–p95 = 39.8–86.2, FUND 19.6–85.0, INSURER 38.5–86.0. No cluster. INSURER has a narrow middle (p25–p75 = 15 points).
- `docs/THRESHOLDS.md` has a proposal for the 10 pending anchors. The config keeps the provisional anchors until a human review.
- `profile_scores.status`, `regime` and `confidence` are NULL. S70 (plan B) fills them.
- The frontend (`frontend/src`) already has the Portfolio, Entity, Monitor, Compare and Methodology pages on a mock generator (`npm run dev:mock`). Plan A connects Portfolio, Entity and Methodology to the real API.
- The data has no entity names. `name` = the entity ID everywhere.

## Decisions taken before writing the plans (2026-09-19, Fran)

| # | Question | Decision |
|---|---|---|
| E1 | Weights are pending (Almudena) | Phase 4 does not wait. No code, test or UI text holds a weight value. The weights reach the UI through the `profile_weights` table, which S60 writes from the config of each run. |
| E2 | Company panels | When `scoring.unit = GROUP`, S30 also loads the `COMPANY` panels. Every Java stage scores both types. Readers filter on `entity_type`. |
| E3 | CUSUM series | CUSUM runs on `final` (per profile) and on the **level scores** (0–100) of `CF_NOCF_MARGIN`, `PAY_DSO` and `LIQ_RUNWAY`. Level scores share one scale, so one `sigma-floor` in points works for all four series. SPEC §8.1 says "NOCF (standardized)". The level score is that standardization. |
| E4 | CUSUM alarm state | No reset after an alarm. The alarm is active while the cumulative sum stays above `h`. Each z adds at most `cusum-z-cap` to a sum (Huber CUSUM). Without the cap, one large outlier holds the alarm for about 15 months, and TURNING fires long after a one-month dip. The baseline is the median and MAD × 1.4826 of the previous `baseline-months` non-null values (causal, month m excluded), with σ ≥ `sigma-floor` (2 points, provisional). |
| E5 | Persistence for regimes | The regime persistence counts consecutive months with the same sign of change of `final`. It is not `mom_persistence` (that one counts level changes, SPEC §7.3). |
| E6 | Narratives | Rendered at pipeline time by `TemplateNarrativeRenderer` in Spanish (UI copy), for the top `explanation.narrative-top-n` movers of each entity-month-profile. The API never renders text. |
| E7 | `NarrativeRenderer` signature | `String render(String driverId, RawIndicator before, RawIndicator after, double deltaPoints)`. ARCHITECTURE §8.3 has `render(Contribution, RawIndicator, RawIndicator)`, which cannot tell a 1-month delta from a 3-month delta. `summarize` is not built (no caller). |
| E8 | Products | `limit`, `premium` and `momentum` stay `null` in the entity DTO. Block 7 fills them. The UI shows the product panel as pending. |
| E9 | Alerts | `activeAlerts` = 0 in phase 4. Block 6 fills it. |
| E10 | Submission | `SubmissionExporter` has two formats: `entity` (`entity_id,score` at the last month) and `entity-month` (`entity_id,month,score`). Default profile BANK. Adapt on Sunday when the hidden test shows its IDs. |

## Weights landing (Almudena)

Her delivery can come in at any time during or after phase 4. It changes the
config, not the code.

1. **Category weights and λ.** Edit only the `scoring.profiles` block of `backend/src/main/resources/scoring-config.yml` on `main`. The weights of each profile must sum to 100.
2. Run `cd backend && ./mvnw test`. `ScoringConfigValidationTest` rejects a table that does not sum to 100.
3. Run the pipeline (`POST /api/pipeline/run`). S60 writes the new `profile_weights`, and every score, contribution and status is rebuilt.
4. Record the M23 histogram in `docs/DATA_FINDINGS.md`. If it clusters in a ~15-point band, widen anchors. Never change weights for this reason.
5. **Weights inside a category** (an indicator weighs more than another of the same category). This is a code change, not a config change. Today `C_level` and `C_traj` are plain means (SPEC §7.3). Stop and plan it as a separate task: `CategoryAggregator`, `ExplanationService`, a new key in `IndicatorConfig`, and `ExplanationSumTest`.

The plans never read or edit the `scoring.profiles` block. Plan B adds its new
keys at the end of `scoring-config.yml`, so a merge with her edit has no conflict.

## Why these two plans do not conflict

Paths are relative to `backend/src/main/` unless they start with `backend/`,
`frontend/`, `docs/` or `scripts/`.

| Path | Owner |
|---|---|
| `java/com/xray/application/**` | A |
| `java/com/xray/infrastructure/web/**` | A |
| `frontend/**` | A |
| `java/com/xray/domain/**` | B |
| `java/com/xray/narrative/**` | B |
| `java/com/xray/pipeline/stages/S30_*`, `S60_*`, `S65_*`, `S70_*`, `CategoryMembers.java`, `ProfileScoreTable.java` | B |
| `java/com/xray/config/**`, `resources/scoring-config.yml` (except `scoring.profiles`), `backend/src/test/**` | B |
| `scoring.profiles` in `resources/scoring-config.yml` | Almudena, on `main` only |
| `resources/sql/**`, `PanelLoader.java`, `ResultWriter.java`, `PipelineRunner.java`, `docs/**`, `CLAUDE.md` | nobody in phase 4 |

B never edits `docs/DATA_FINDINGS.md`. B puts its findings in its final report,
and the person who merges copies them in (run procedure step 7).

## Shared contract (both plans copy this verbatim)

1. **Stage order** (`@Order`): `S00_INGEST` 0 → `S10_STAGING` 10 → `S20_MONTHLY` 20 → `S25_ROLLUP` 25 → `S30_RAW_INDICATORS` 30 → `S40_NORMALIZE` 40 → `S50_TRAJECTORY` 50 → `S60_SCORE` 60 → `S65_EXPLAIN` 65 → `S70_DYNAMICS` 70 → `S95_QUANTILES` 95.
2. **Entity types** (decision E2). With `scoring.unit = GROUP`, every results table below has rows for `GROUP` and for `COMPANY`. The portfolio, the distribution and the export read `entity_type = unit` only. The group drilldown reads `COMPANY` rows with `entities.group_id = <group>`.
3. **`profile_scores`** (S60 writes it with the last four columns NULL, S70 rewrites it with them filled):
   ```sql
   profile_scores (entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, profile VARCHAR,
                   final DOUBLE, level DOUBLE, traj DOUBLE, band VARCHAR, momentum DOUBLE,
                   mom_persistence INTEGER, status VARCHAR, regime VARCHAR, confidence VARCHAR,
                   seasonal BOOLEAN)
   ```
   - `status` ∈ `CRITICAL, STRUCTURAL_DECLINE, TURNING, DIP, IMPROVING, EXCEPTIONAL, HEALTHY, WATCH`.
   - `regime` ∈ `STABLE, DIP, DIP_RECOVERED, STRUCTURAL_DECLINE, STRUCTURAL_IMPROVEMENT`.
   - `confidence` ∈ `HIGH, MEDIUM, LOW`.
   - When `final` is NULL, `status`, `regime`, `confidence` and `seasonal` are NULL. When `final` is not NULL, all four are not NULL after S70.
   - `traj` can be NULL when `final` is not NULL (phase 3 decision D5). `level` is never NULL when `final` is not NULL.
4. **`contributions`** (S65). One row per available indicator of a weighted category, plus one `MOMENTUM` row when MOMENTUM has an effective weight, per entity-month-profile with a non-NULL `final`:
   ```sql
   contributions (entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, profile VARCHAR,
                  driver_id VARCHAR, category VARCHAR, eff_weight DOUBLE, blended DOUBLE,
                  contrib DOUBLE, delta1 DOUBLE, delta3 DOUBLE,
                  narrative_1m VARCHAR, narrative_3m VARCHAR)
   ```
   - `driver_id` = an `IndicatorId` name, or `MOMENTUM`.
   - `SUM(contrib) = final − 50` for each entity-month-profile (± 0.05).
   - `SUM(eff_weight)` over the rows of one category = the effective weight `w'_c` of that category.
   - `deltaK = contrib(m) − contrib(m−K)`. A driver with no row at m−K counts as 0 there. `deltaK` is NULL when `final(m−K)` is NULL or m < K.
   - `narrative_1m` is not NULL for the top `narrative-top-n` rows by `|delta1|` (only rows with `|delta1| ≥ 0.05`). `narrative_3m` is the same for `delta3`. Other rows have NULL.
5. **`changepoints`** (S70):
   ```sql
   changepoints (entity_type VARCHAR, entity_id VARCHAR, profile VARCHAR, series VARCHAR,
                 month VARCHAR, alarm_month VARCHAR, direction VARCHAR)
   ```
   - `series` ∈ `FINAL, CF_NOCF_MARGIN, PAY_DSO, LIQ_RUNWAY`. `profile` is NULL for the three indicator series (they do not depend on the profile).
   - `month` = the changepoint (the last month the cumulative sum was 0). `alarm_month` = the month the alarm fired. `direction` ∈ `UP, DOWN`.
6. **`profile_weights`** (S60, from the config of the run):
   ```sql
   profile_weights (profile VARCHAR, category VARCHAR, weight DOUBLE, lambda DOUBLE)
   ```
   One row per `(profile, category)` entry of `scoring.profiles`, including weight 0 entries if the config has them.
7. **Types.** Months are `YYYY-MM` strings. Every score column is stored unrounded. The API rounds scores, deltas and contributions to 1 decimal at the boundary.
8. **Before the merge**, A's endpoints must work on a database where `contributions`, `changepoints` and `profile_weights` do not exist and `status`, `regime`, `confidence` and `seasonal` are NULL (or the column is missing). Use `DuckDbTables.exists`. Missing data gives empty lists and `null` fields, never an HTTP 500.
9. **Weights** (decision E1). No Java, TypeScript or test file writes a profile weight or a λ value from `scoring-config.yml`. Tests build their own weight tables.
10. **Tests.** Only the six tests in `CLAUDE.md`. Phase 4 adds `ExplanationSumTest` (B, package `com.xray.domain.service`). A adds no test. A scratch test may be used locally and **must be deleted before the commit**.

## Run procedure

1. Commit the three plan files and the phase 3 close-out (`docs/THRESHOLDS.md`, `docs/DATA_FINDINGS.md`) on `main` and push. Worktrees see only committed files.
2. Create one worktree for each branch:
   ```bash
   git worktree add -b feat/phase4-api-frontend      ../xray-phase4-a main
   git worktree add -b feat/phase4-explain-dynamics  ../xray-phase4-b main
   ```
3. Link the data into each worktree (`data/raw/` is gitignored):
   ```bash
   mkdir -p ../xray-phase4-a/data ../xray-phase4-b/data
   ln -s "$PWD/data/raw" ../xray-phase4-a/data/raw
   ln -s "$PWD/data/raw" ../xray-phase4-b/data/raw
   ```
   Each worktree has its own `data/xray.duckdb`. Run A's backend with `SERVER_PORT=8081` and B's with `SERVER_PORT=8082`. A's Vite dev server uses port 5174 and proxies to 8081 (plan A Task 0).
4. Start one agent in each worktree with this prompt (change the plan file):
   > Read `CLAUDE.md`, then execute `docs/superpowers/plans/2026-09-19-phase4-A-api-frontend.md`
   > task by task. Only edit the paths this plan owns (see the overview file).
   > Commit after each task. Do not merge. Stop and report when all tasks are done.
5. When both agents report done, merge B first, then A:
   ```bash
   git checkout main && git pull
   git merge --no-ff feat/phase4-explain-dynamics -m "merge: phase 4 explanation and dynamics"
   git merge --no-ff feat/phase4-api-frontend     -m "merge: phase 4 api and frontend"
   ```
   Expected result: no conflicts. If there is a conflict, one agent edited a path it does not own. Keep the owner's version. If Almudena's weights landed on `main` meanwhile, `scoring.profiles` merges without a conflict (B does not touch it).
6. Post-merge smoke test (repository root):
   ```bash
   (cd backend && ./mvnw -q test)               # 5 tests
   rm -f data/xray.duckdb data/xray.duckdb.wal
   (cd backend && ./mvnw spring-boot:run) &     # wait for "pipeline run ... done"
   curl -s localhost:8080/api/pipeline/status   # DONE, 11 stages in stageTimingsMs
   curl -s 'localhost:8080/api/portfolio?profile=BANK&month=2026-08' | jq '.rows | length'          # 248
   curl -s 'localhost:8080/api/entities/GROUP_0016?profile=BANK&month=2026-08' | jq '.drivers | length'   # > 0
   curl -s 'localhost:8080/api/export/submission?profile=BANK&format=entity' | head -3
   ```
   Stop the backend, then check on a copy of the database (`cp data/xray.duckdb /tmp/x.duckdb`):
   ```sql
   -- ExplanationSum on real data: expect 0
   SELECT COUNT(*) FROM (
     SELECT c.entity_type, c.entity_id, c.month, c.profile, SUM(c.contrib) AS s, ANY_VALUE(p.final) AS f
     FROM contributions c JOIN profile_scores p USING (entity_type, entity_id, month, profile)
     GROUP BY ALL) WHERE ABS(s - (f - 50)) > 0.05;
   -- every scored row has a status: expect 0
   SELECT COUNT(*) FROM profile_scores WHERE final IS NOT NULL AND (status IS NULL OR regime IS NULL OR confidence IS NULL);
   -- status mix at M23 for the unit
   SELECT profile, status, COUNT(*) FROM profile_scores WHERE entity_type = 'GROUP' AND month = '2026-08' GROUP BY 1, 2 ORDER BY 1, 3 DESC;
   SELECT entity_type, COUNT(DISTINCT entity_id) FROM profile_scores GROUP BY 1;   -- GROUP 250, COMPANY 1286
   ```
   Then open the frontend (`cd frontend && npm run dev`), switch the profile on `/` and open one group on `/entity/:id`.
7. Copy B's findings (from B's final report) into `docs/DATA_FINDINGS.md` under "Block 5 run": stage timings, the status mix at M23, the regime counts, the number of changepoints. If one status holds more than 60 % of the groups at M23, flag it for review of `statuses` in the config.
8. Build and deploy (`docker compose up --build`, then the public URL). Push `main`. Remove the worktrees: `git worktree remove ../xray-phase4-a ../xray-phase4-b`.

## What comes after phase 4

- Block 6: `S80_Alerts` and the 14 `AlertRule` classes, the watchlist, the SSE replay, the Monitor page on real data. `activeAlerts` in the portfolio.
- Block 7: `S75_Products` (CLAUDE.md resolved conflict 3): limit engine and simulator, premium, momentum. The product panel on the Entity page. Methodology page complete.
- Block 8: `S90` lead time and showcase pairs, `LookAheadTest`, Compare page, freeze `xray.duckdb`, rehearse.
- Human review of the 10 anchor proposals (`docs/THRESHOLDS.md`). Almudena's weights (see "Weights landing").
- Sunday: run the pipeline on the hidden-test CSVs, check the scoring unit from the test IDs, adapt `SubmissionExporter`, submit.
