# Phase 6 — Parallel Execution Overview

Phase 6 = **Block 8 (close)** of `docs/ARCHITECTURE.md §11` (SPEC §13 M8, plus the parts of
M10 that are code). It is the last phase before the demo (Sunday 11:00). After it only human
steps remain: freeze `xray.duckdb`, deploy, rehearse, and on Sunday run the hidden test.

The split is **by layer**, like phase 5: plan A builds the backend (lead time, showcase pairs,
`LookAheadTest`, analytics API, the hidden-test rehearsal), plan B builds the frontend (Compare
on real data, lead-time section of Methodology, "detected N months before" on the Entity page,
the static JSON fallback). They meet at the JSON contract below. B works on mocks first, then
against A's running backend.

| Plan | Branch | Owner (agent) | File |
|---|---|---|---|
| A — Backend: S90 analytics (lead time, false alarms, showcase pairs), `LookAheadTest`, analytics API, hidden-test rehearsal | `feat/phase6-backend` | Claude Code or Antigravity | `2026-09-19-phase6-A-backend.md` |
| B — Frontend: Compare on showcase pairs, Methodology lead time and export, Entity lead-time annotations, static fallback | `feat/phase6-frontend` | Claude Code or Antigravity | `2026-09-19-phase6-B-frontend.md` |

Estimate: A about 5 h of agent time (two pure services, one stage, the look-ahead test, three
endpoints, the rehearsal). B about 4 h. B finishes first; its spare time goes to its Task 9
(integration) and to the polish list at the end of plan B, never to backend files.

Done when (SPEC §13 M8, §14):
- The pipeline runs 14 stages. `lead_time_events`, `lead_time_signals` and `showcase_pairs` exist for the three profiles.
- `GET /api/analytics/lead-time?profile` returns events, detection rate, mean and median lead, a histogram and the false alarm rate. `GET /api/analytics/showcase-pairs?profile&month` returns ranked pairs. Both < 1 s.
- The Methodology page shows mean lead time and false alarm rate **per profile** (M8 acceptance). The Compare page opens on the top showcase pair from the API.
- The Entity page marks the deterioration or improvement event of the entity and says "detectado N meses antes" (and, on BANK, "límite recortado N meses antes" when the limit engine cut first).
- `LookAheadTest` passes. `./mvnw test` runs the **six** required tests.
- The frontend serves Portfolio, Compare and the showcase entities from `frontend/public/fallback/` when the backend is down (SPEC §14), with a visible banner.
- The pipeline ran unchanged on a 60-group subset of the CSVs (`data/holdout/raw`) and exported a submission from it (plan A Task 10).

## State at the start of phase 6 (checked 2026-09-19)

- Phase 5 is **merged** (`main` = the plans commit on top of PRs #8 and #9). The branches `feat/phase6-backend` and `feat/phase6-frontend` already exist locally and on the remote, cut from that commit.
- Pipeline after phase 5: 13 stages up to `S80_ALERTS` and `S95_QUANTILES`. Panels carry scores, dynamics (`DynamicsPoint`), signals and limits in memory.
- `S20`..`S30` and `S95` are the only stages that call `ctx.sql()`. `S40`..`S80` read and write panels and use `ResultWriter` only. This is what lets `LookAheadTest` run the Java stages on an in-memory DuckDB with no CSVs.
- `ComparePage.tsx` already overlays two entities and picks a pair **client-side** from the portfolio (`showcasePair`, gap ≤ 3). Phase 6 moves the pick to the backend (SPEC §10.4) and keeps the client pick only as a fallback when the API has no pair.
- `MethodologyPage.tsx` has a `PendingFilm` "Anticipación" ("bloque 8"). There is no submission export button yet (SPEC §12.7 item 5).
- `/api/export/submission?profile&format=entity|entity-month` exists. `XRAY_DATA_DIR` already points the backend at another data directory (`raw/` inside it, `xray.duckdb` next to it).
- `data/` is gitignored. `transactions.csv` (451 MB), `invoices.csv` (165 MB) and `xray.duckdb` (246 MB) are above GitHub's 100 MB per-file limit: a push with them fails. See decision G13.

## Decisions taken before writing the plans (2026-09-19, José Javier)

| # | Question | Decision |
|---|---|---|
| G1 | Scope | Block 8: S90 analytics, `LookAheadTest`, analytics API, Compare, Methodology lead time and export button, Entity lead-time marks, static fallback, hidden-test rehearsal. Freeze, deploy and rehearsal of the pitch are human steps (run procedure 6–9). Supervised calibration stays out (CLAUDE.md resolved conflict 1). |
| G2 | Split | By layer. A owns `backend/**` and `scripts/MakeHoldout.java`. B owns `frontend/**` and `scripts/snapshot-fallback.mjs`. |
| G3 | Deterioration event (SPEC §8.4) | Per entity and profile, **the first onset** (condition false at e−1, true at e) with at least `lead-time.min-history-months` (6) scored months before e. Triggers, first match wins at e: `RUNWAY` = `LIQ_RUNWAY` raw < 1.5 for the last 2 months (m−1 and m); `DSCR` = `DEBT_DSCR` raw < 1.0 for the last 2 months (a NULL DSCR, no debt, never triggers); `OVERDUE` = level of `DEL_OVERDUE_RECEIVABLES` ≤ 20 **and** level of `PAY_OVERDUE_PAYABLES` ≤ 20 (both anchors pending → provisional trigger, say so in the UI); `SCORE` = `final` < 35. The event month is the month the condition is **confirmed** (the second month for the 2-month rules), so the event itself is causal. An entity already in the condition during its first 6 months has no event (censored); the report counts them. |
| G4 | Improvement event | `level` crosses up through 65 at e (`level(e) ≥ 65`, `level(e−1) < 65`) and the 12 months before e contain ≥ 3 consecutive months with `level` < 50. Trigger `LEVEL_CROSS`. Same history rule as G3. First onset only. |
| G5 | Signal and lead | Deterioration signal at s: status ∈ `lead-time.signal.deterioration-statuses` (TURNING, STRUCTURAL_DECLINE) or `traj` ≤ 35. Improvement signal: status ∈ (IMPROVING) or regime `STRUCTURAL_IMPROVEMENT` or `traj` ≥ 65. `signal_month` = the **first** month in `[e − window-months, e]` (window 12) where the signal holds (SPEC wording). `lead_months = e − s`. **Detected** = a signal in the window (lead ≥ 0). **Detected ahead** = lead ≥ 1. Both are reported; the headline number is "detected ahead". If the histogram piles up at 12 (a signal that was on for a year), the final report flags it. |
| G6 | Limit lead (BANK) | For the limit profile and deterioration events: `limit_signal_month` = first month in `[e − 12, e]` with a limit action `REDUCE` or `FREEZE`. `limit_lead_months = e − limit_signal_month`. This is the "limit reduced N months before" number of SPEC §10.1. |
| G7 | False alarm rate | A **signal onset** at s = the signal holds at s and not at s−1 (the first scored month counts as an onset), and the event condition of G3/G4 (any trigger, not only the first onset) does **not** already hold at s. It is **followed** when the condition holds in some month of `[s+1, s + horizon-months]` (horizon 6). It is **evaluable** when followed, or when `s + 6` is inside the data. False alarm rate = 1 − followed / evaluable. |
| G8 | Look-ahead of the analytics | `lead_time_*` are **evaluation** tables: by definition they look at a known event and at the 6 months after a signal. Nothing in the scoring, products or alerts reads them (CLAUDE.md rule 1 holds). The UI shows an event only when `eventMonth ≤ ?month`, so a page at month m never reveals a later event. `LookAheadTest` checks the causal part of them (event rows with `event_month ≤ M12`, signal onsets with `signal_month ≤ M12`) and skips `followed` / `evaluable`. |
| G9 | Showcase pairs (SPEC §10.4) | Materialized **for every month** and profile, per `entity_type`: candidate pairs have |Δfinal| ≤ 3 and both `traj` not NULL. `up` = the one with the higher `traj`. `meets_spec` = `up.traj ≥ 65` and `down.traj ≤ 35`. Ranking: `meets_spec` first, then trajectory gap desc, then final gap asc, then ids. Greedy: an entity appears in at most one pair per (month, profile). Top `showcase.top-n` (10). A month with no spec pair still has the closest ones (flag false), so Compare always has something to open. |
| G10 | `LookAheadTest` scope | ARCHITECTURE §9: synthetic panels (seeded random raw indicators and signals, 24 months, 40 entities), the Java stages S40 → S90 run once on the full panels and once on panels cut at M12, each on its own in-memory DuckDB. Every row of every results table with month ≤ M12 must be identical (string-compared). The SQL layer is not in this test: balances are reconstructed backwards from the 2026-09-01 snapshot on purpose (SPEC §0.2 static exception, already a caveat). |
| G11 | API | Contract item 6. Lead-time aggregation is a `GROUP BY` over `lead_time_events` / `lead_time_signals` of the unit at request time (a read of a small results table, same as the phase 5 monitor counts). No recomputation of scores. |
| G12 | Static fallback | `scripts/snapshot-fallback.mjs` (Node 24, no dependency) fetches a fixed list of GET endpoints from a running backend and writes `frontend/public/fallback/<key>.json` + `index.json`. `apiGet` falls back to that file on a network error or a 5xx; a banner says "Sin conexión con el servidor: datos congelados de {month}". POSTs (simulator) and the SSE replay have no fallback: they show a clear message. The files are **committed** (G13). |
| G13 | Data in git (José Javier: "saca data del gitignore") | `data/` stops being ignored as a whole. The files above 100 MB stay ignored because GitHub rejects them: `data/raw/transactions.csv`, `data/raw/invoices.csv`, `data/*.duckdb`, `data/*.duckdb.wal`, and the generated `data/holdout/`. The six small CSVs are committed. The frozen `xray.duckdb` keeps going to the host with `scp` (DEPLOY.md). Done on `main` in run procedure step 1, not by the agents. |
| G14 | Hidden-test rehearsal | `scripts/MakeHoldout.java` (single-file, DuckDB JDBC) writes `data/holdout/raw/*.csv` with the same header and format as `data/raw`, keeping 60 groups picked with a fixed seed and every row of their companies. The backend runs unchanged with `XRAY_DATA_DIR=../data/holdout` and both export formats are downloaded. Nothing in `backend/src` may special-case the holdout. |
| G15 | Tests | The six tests of CLAUDE.md. Phase 6 adds `LookAheadTest` (the last one). A may extend `ScoringConfigValidationTest` so the new keys bind. Scratch tests are deleted before the commit. |
| G16 | Config | New blocks `lead-time` and `showcase` at the end of `scoring-config.yml`. Every number of G3–G9 is a key there. |

## Weights landing (Almudena)

Unchanged: weights are a config edit on `main` (`scoring.profiles` and the `weight` keys of
`scoring.indicators`). Neither plan edits them. The analytics read `final`, `level`, `traj`,
statuses and limit actions from the panels, so a weight change flows into lead time and
showcase pairs on the next run with no code change. **Rerun the pipeline and re-snapshot the
fallback after any weight change** (run procedure step 6).

## Why these two plans do not conflict

Paths are relative to the repository root.

| Path | Owner |
|---|---|
| `backend/**` (except the two lines below) | A |
| `scripts/MakeHoldout.java` | A |
| `scoring.profiles` and the `weight` keys of `scoring.indicators` in `backend/src/main/resources/scoring-config.yml` | Almudena, on `main` only |
| `frontend/**` (including `frontend/public/fallback/**`) | B |
| `scripts/snapshot-fallback.mjs` | B |
| `docs/**`, `CLAUDE.md`, `docker-compose.yml`, `.gitignore`, `data/**` | nobody in phase 6 (the person who merges) |

Neither plan edits `docs/`. Both put their findings in their final report. The person who
merges copies them into `docs/DATA_FINDINGS.md` (run procedure step 5).

## Shared contract (both plans copy this verbatim)

1. **Stage order** (`@Order`): `S00_INGEST` 0 → `S10_STAGING` 10 → `S20_MONTHLY` 20 → `S25_ROLLUP` 25 → `S30_RAW_INDICATORS` 30 → `S40_NORMALIZE` 40 → `S50_TRAJECTORY` 50 → `S60_SCORE` 60 → `S65_EXPLAIN` 65 → `S70_DYNAMICS` 70 → `S75_PRODUCTS` 75 → `S80_ALERTS` 80 → **`S90_ANALYTICS` 90** → `S95_QUANTILES` 95. S90 reads the panels only (no `ctx.sql()`).

2. **Config** (end of `scoring-config.yml`):
   ```yaml
   # SPEC §8.4 lead time. Phase 6 decisions G3–G7. PROVISIONAL: review with the first run.
   lead-time:
     min-history-months: 6
     window-months: 12
     horizon-months: 6
     events:
       runway-below: 1.5
       runway-months: 2
       dscr-below: 1.0
       dscr-months: 2
       overdue-max-level: 20        # both DEL_OVERDUE_RECEIVABLES and PAY_OVERDUE_PAYABLES, pending anchors
       score-below: 35
       improvement-cross: 65
       improvement-below: 50
       improvement-below-months: 3
     signal:
       deterioration-statuses: [TURNING, STRUCTURAL_DECLINE]
       deterioration-max-traj: 35
       improvement-statuses: [IMPROVING]
       improvement-min-traj: 65
   # SPEC §10.4 showcase pairs. Phase 6 decision G9.
   showcase:
     max-final-gap: 3
     up-min-traj: 65
     down-max-traj: 35
     top-n: 10
   ```

3. **`lead_time_events`** (S90). One row per entity-profile-event_type that has an event (at most one of each type):
   ```sql
   lead_time_events (entity_type VARCHAR, entity_id VARCHAR, profile VARCHAR, event_type VARCHAR, trigger VARCHAR,
                     event_month VARCHAR, signal_month VARCHAR, lead_months INTEGER,
                     limit_signal_month VARCHAR, limit_lead_months INTEGER)
   ```
   - `event_type` ∈ `DETERIORATION, IMPROVEMENT`. `trigger` ∈ `RUNWAY, DSCR, OVERDUE, SCORE` (deterioration), `LEVEL_CROSS` (improvement).
   - `signal_month`, `lead_months` NULL when not detected. `limit_*` only for the limit profile and `DETERIORATION`, else NULL.

4. **`lead_time_signals`** (S90). One row per signal onset (G7):
   ```sql
   lead_time_signals (entity_type VARCHAR, entity_id VARCHAR, profile VARCHAR, event_type VARCHAR,
                      signal_month VARCHAR, evaluable BOOLEAN, followed BOOLEAN)
   ```

5. **`showcase_pairs`** (S90). Top `showcase.top-n` per (entity_type, month, profile), `rank` from 1:
   ```sql
   showcase_pairs (entity_type VARCHAR, month VARCHAR, profile VARCHAR, rank INTEGER,
                   up_id VARCHAR, down_id VARCHAR, up_final DOUBLE, down_final DOUBLE,
                   up_traj DOUBLE, down_traj DOUBLE, final_gap DOUBLE, traj_gap DOUBLE, meets_spec BOOLEAN)
   ```

6. **API (JSON).** Scores rounded to 1 decimal, rates (0..1) to 3 decimals, leads (means) to 1 decimal. `profile` and `month` optional with the phase 4 defaults (`ApiParams`). A phase 6 table that does not exist → empty lists, zero counts and `null` fields, never HTTP 500.

   ```ts
   type EventType = "DETERIORATION" | "IMPROVEMENT";
   type EventTrigger = "RUNWAY" | "DSCR" | "OVERDUE" | "SCORE" | "LEVEL_CROSS";

   // GET /api/analytics/lead-time?profile
   interface LeadTimeBlock {
     eventType: EventType;
     events: number;                 // entities of the unit with an event of this type
     detected: number;               // signal in [e−window, e] (lead ≥ 0)
     detectedAhead: number;          // lead ≥ 1
     detectionRate: number | null;   // detected / events, null when events = 0
     aheadRate: number | null;       // detectedAhead / events
     meanLead: number | null;        // over detected
     medianLead: number | null;
     histogram: { leadMonths: number; count: number }[];   // 0..windowMonths, every bucket present
     byTrigger: { trigger: EventTrigger; events: number; detectedAhead: number }[];
     signals: number; evaluable: number; followed: number;
     falseAlarmRate: number | null;  // 1 − followed / evaluable, null when evaluable = 0
   }
   interface LeadTimeExample {
     entityId: string; entityName: string; eventType: EventType; trigger: EventTrigger;
     eventMonth: string; signalMonth: string; leadMonths: number;
     limitSignalMonth: string | null; limitLeadMonths: number | null;
   }
   interface LeadTime {
     profile: string; unit: EntityType;
     windowMonths: number; horizonMonths: number; minHistoryMonths: number;   // from config
     deterioration: LeadTimeBlock; improvement: LeadTimeBlock;
     limit: { events: number; cutAhead: number; meanLead: number | null; medianLead: number | null } | null;  // limit profile only
     examples: LeadTimeExample[];    // up to 5 deterioration events with the largest lead, then improvement, ids asc on ties
   }

   // GET /api/analytics/showcase-pairs?profile&month   (month default = last month)
   interface ShowcasePair {
     rank: number; meetsSpec: boolean;
     up: { id: string; name: string; final: number; traj: number };
     down: { id: string; name: string; final: number; traj: number };
     finalGap: number; trajGap: number;
   }
   interface ShowcasePairs { profile: string; month: string; pairs: ShowcasePair[]; }

   // Lead-time event of one entity (Entity page, Timeline)
   interface EntityEvent {
     eventType: EventType; trigger: EventTrigger; eventMonth: string;
     signalMonth: string | null; leadMonths: number | null;
     limitSignalMonth: string | null; limitLeadMonths: number | null;   // limit profile only
   }

   // Changes to existing DTOs (fields added, none removed or renamed)
   interface EntityDetail { /* … */ events: EntityEvent[]; }   // ?profile, eventMonth <= ?month, oldest first
   interface Timeline     { /* … */ events: EntityEvent[]; }   // ?profile, all months, oldest first
   interface Meta         { /* … */ analyticsReady: boolean; } // lead_time_events and showcase_pairs exist
   ```

7. **Fallback files** (B's script, B's client). Key of a GET = the path after `/api`, query params sorted by name, then `/`, `?`, `&`, `=` replaced by `_`, prefix removed: `/portfolio?profile=BANK&month=2026-08` → `portfolio_month_2026-08_profile_BANK.json`. The script always sends `profile` and `month` explicitly, so the client must too (it already does for portfolio and entity). `index.json` = `{ "month": "2026-08", "createdAt": ISO, "keys": [...] }`.

8. **Weights** (decision E1 still holds). No Java, TypeScript or test file writes a profile weight or λ.

9. **Tests.** The six tests of CLAUDE.md, `LookAheadTest` new. Nothing else.

## Run procedure

0. On `main`, check the phase 5 merge is healthy: `cd backend && ./mvnw -q test` (5 tests) and a clean pipeline run (13 stages). Phase 5's run procedure steps 6–8 (smoke test, findings, deploy) still apply if nobody did them.
1. On `main`: narrow `.gitignore` (G13). Replace the line `data/` with:
   ```gitignore
   # Data: small CSVs are versioned; files over GitHub's 100 MB limit and generated data are not.
   data/raw/transactions.csv
   data/raw/invoices.csv
   data/*.duckdb
   data/*.duckdb.wal
   data/holdout/
   ```
   `git add .gitignore data/raw/*.csv` (only the six small files get staged; check with `git status`). Commit the three phase 6 plan files with it and push. Worktrees see only committed files.
2. Create one worktree for each branch (the branches already exist; if `.gitignore` changed in step 1, rebase them on `main` first with `git branch -f <branch> main`):
   ```bash
   git worktree add ../xray-phase6-a feat/phase6-backend
   git worktree add ../xray-phase6-b feat/phase6-frontend
   ```
3. Link the two big CSVs into A's worktree (the small ones are already there from git). B needs no data.
   ```bash
   ln -s "$PWD/data/raw/transactions.csv" ../xray-phase6-a/data/raw/transactions.csv
   ln -s "$PWD/data/raw/invoices.csv"     ../xray-phase6-a/data/raw/invoices.csv
   ```
   A's backend runs with `SERVER_PORT=8081`. B's Vite runs on 5174: `npm run dev:mock -- --port 5174` on mocks, `VITE_API_TARGET=http://localhost:8081 npm run dev -- --port 5174` against A (plan B Task 9).
4. Start one agent in each worktree with this prompt (change the plan file):
   > Read `CLAUDE.md`, then execute `docs/superpowers/plans/2026-09-19-phase6-A-backend.md`
   > task by task. Only edit the paths this plan owns (see the overview file).
   > Commit after each task. Do not merge. Stop and report when all tasks are done.
5. When both report done, merge A first, then B:
   ```bash
   git checkout main && git pull
   git merge --no-ff feat/phase6-backend  -m "merge: phase 6 backend (lead time, showcase pairs, look-ahead test)"
   git merge --no-ff feat/phase6-frontend -m "merge: phase 6 frontend (compare, lead time, fallback)"
   ```
   Copy A's findings into `docs/DATA_FINDINGS.md` under "Block 8 run": stage timings, events per profile and trigger, detection and ahead rates, mean/median lead, false alarm rate, the limit lead, the top examples, the showcase pairs at M23, the holdout rehearsal result. If the mean lead is < 1 month, or the false alarm rate is > 70 %, flag the `lead-time` keys for review (SPEC §8.4 research rule). Do not tune them in this step.
6. Post-merge smoke test and **freeze** (repository root):
   ```bash
   (cd backend && ./mvnw -q test)               # 6 tests
   rm -f data/xray.duckdb data/xray.duckdb.wal
   (cd backend && ./mvnw spring-boot:run) &     # wait for "pipeline run ... done"
   curl -s localhost:8080/api/pipeline/status | jq '.stageTimingsMs | keys | length'                 # 14
   curl -s 'localhost:8080/api/analytics/lead-time?profile=BANK' | jq '.deterioration | {events, aheadRate, meanLead, falseAlarmRate}'
   curl -s 'localhost:8080/api/analytics/showcase-pairs?profile=BANK' | jq '.pairs[0]'
   node scripts/snapshot-fallback.mjs --api http://localhost:8080 --out frontend/public/fallback
   git add frontend/public/fallback && git commit -m "chore(frontend): snapshot the fallback data"
   ```
   Stop the backend. `cp data/xray.duckdb data/xray.frozen.duckdb` (keep it; this is the demo database).
7. Build and deploy (`docs/DEPLOY.md`): `scp data/xray.duckdb <host>:<repo>/data/`, then on the host `git pull && XRAY_DEMO_MODE=true docker compose up --build -d`. From another device (phone on mobile data): `/`, `/compare`, `/methodology`, `/monitor` (play the replay), `/entity/<top showcase id>?profile=BANK`. Then stop the backend container on the host for one minute and reload `/` and `/compare`: the fallback banner shows and the pages render. Start it again.
8. Push `main`. Remove the worktrees: `git worktree remove ../xray-phase6-a ../xray-phase6-b`.
9. Human, before Sunday: review the 10 pending anchors and `reference-rate` (`docs/THRESHOLDS.md`), land Almudena's weights if they changed (then repeat steps 6–7), rehearse the demo script: Portfolio (profile switch re-ranks) → Compare (showcase pair) → Entity of the "down" entity on BANK (limit history cut before the event, "detectado N meses antes", drivers) → Monitor replay → Methodology (lead time per profile, false alarms, caveats).

## Sunday (hidden test)

1. Put the hidden-test CSVs in a new directory `data/hidden/raw/` (same format as `data/raw`, CLAUDE.md resolved conflict 2).
2. `cd backend && SERVER_PORT=8082 XRAY_DATA_DIR=../data/hidden ./mvnw spring-boot:run` — the same path the holdout rehearsal took (plan A Task 10).
3. Read the test IDs: `GROUP_…` → unit GROUP (default), `COMP_…` → set `scoring.unit: COMPANY` and rerun. Pick `format=entity` or `entity-month` from the scoring script. If neither fits, add one `SubmissionExporter` class (the only code change allowed Sunday).
4. `curl -o submission.csv 'localhost:8082/api/export/submission?profile=BANK&format=entity'`, check the row count against the test IDs, submit once.
5. The demo keeps running on the frozen `xray.duckdb` of the training data; the hidden run never touches it.
