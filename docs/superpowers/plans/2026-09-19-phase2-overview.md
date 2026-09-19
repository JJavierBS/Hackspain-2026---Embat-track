# Phase 2 — Parallel Execution Overview

Phase 2 = **Block 2 (data)** of `docs/ARCHITECTURE.md §11`, plus the
data-independent preparation for Block 3 (the `indicator_values_raw` table,
the S30 stage shell, the panel loader and the reference quantiles). It runs as
two plans on two branches at the same time, then the two branches merge into
`main`.

| Plan | Branch | Owner (agent) | File |
|---|---|---|---|
| A — Data SQL (profiling, staging, balances, monthly tables) | `feat/phase2-data-sql` | Claude Code or Antigravity | `2026-09-19-phase2-A-data-sql.md` |
| B — Rollup, panel, result writer, quantiles | `feat/phase2-rollup-panel` | Claude Code or Antigravity | `2026-09-19-phase2-B-rollup-panel.md` |

Estimate: A about 4–5 h of agent time (profiling is the slow part), B about
3 h. Merge and smoke test: 30 min.

Done when (SPEC §13 M0 + M1):
- `docs/DATA_FINDINGS.md` answers SPEC §4 questions 1–9 and the flow-class map in `scoring-config.yml` is filled from the data.
- A full pipeline run on the real CSVs fills every contract table below for `COMPANY` and `GROUP`.
- The reconstructed balance at the snapshot date equals `balances.csv` for every product. Three entities are spot-checked.
- `RollupTest` and `ScoringConfigValidationTest` pass.
- `S30_RAW_INDICATORS` loads 250 panels (unit `GROUP`), all indicators unavailable until Block 3 adds `sql/30`–`38`.

## Why these two plans do not conflict

Each plan owns a disjoint set of paths. An agent must not edit a path that the
other plan owns. Paths are relative to `backend/src/main/` unless they start
with `backend/`, `docs/` or `scripts/`.

| Path | Owner |
|---|---|
| `resources/sql/00_*` … `resources/sql/24_*` | A |
| `java/com/xray/pipeline/stages/S00_Ingest.java`, `S10_Staging.java`, `S20_MonthlyAggregates.java`, `SqlParams.java`, `RawData.java` | A |
| `java/com/xray/config/**`, `resources/scoring-config.yml`, `backend/src/test/java/com/xray/config/**` | A |
| `docs/DATA_FINDINGS.md`, `scripts/**` | A |
| `resources/sql/25_*`, `resources/sql/29_*`, `resources/sql/90_*` | B |
| `java/com/xray/pipeline/stages/S25_EntityRollup.java`, `S30_RawIndicators.java`, `S95_Quantiles.java` | B |
| `java/com/xray/pipeline/PipelineContext.java` | B (add fields only, keep the constructor) |
| `java/com/xray/domain/**` except the six existing enums | B |
| `java/com/xray/infrastructure/duckdb/ResultWriter.java`, `PanelLoader.java`, `DuckDbTables.java` | B |
| `backend/src/test/java/com/xray/pipeline/**` | B |
| `SqlRunner.java`, `DuckDbSqlRunner.java`, `PipelineRunner.java`, `frontend/**`, `CLAUDE.md`, `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/THRESHOLDS.md` | nobody in phase 2 |

## Shared contract (both plans copy this verbatim)

1. Stage order (`@Order`): `S00_INGEST` 0 → `S10_STAGING` 10 → `S20_MONTHLY` 20 → `S25_ROLLUP` 25 → `S30_RAW_INDICATORS` 30 → `S95_QUANTILES` 95.
2. SQL files run in filename order inside each stage. Placeholders use `${name}`. `DuckDbSqlRunner` fails on an unresolved placeholder.
3. Months are `YYYY-MM` strings. `M00 = 2024-09`, `M23 = 2026-08`. The snapshot date is `2026-09-01`. A daily or monthly row never has a date on or after the snapshot date.
4. Plan A writes **company rows only** (`entity_type = 'COMPANY'`). Plan B's `25_entity_rollup.sql` deletes and appends the `GROUP` rows. Group rows always have `is_intragroup = FALSE`, because they sum only the company rows with `is_intragroup = FALSE`.
5. Monthly tables hold **summable components only**, never a ratio or an average. A weighted average is stored as a numerator (`*_x_eur`) and a denominator (`*_eur`).
6. All `*_eur` amounts are in EUR. Invoice amounts and counterparty amounts are positive magnitudes. `monthly_flows.outflow_eur` is a positive magnitude.
7. Stages skip cleanly when their input is missing. The backend still boots and the run ends `DONE` with an empty `data/raw/`.
   - A's stages check `RawData.present(props)` (the file `data/raw/transactions.csv` exists).
   - B's stages check `DuckDbTables.exists(sql, "<table>")`.
8. Contract tables. Plan A creates them with **exactly** this DDL (then `INSERT INTO … SELECT`). Plan B's `RollupTest` creates the same DDL in an in-memory database.

```sql
CREATE OR REPLACE TABLE stg_companies (company_id VARCHAR, group_id VARCHAR, currency VARCHAR);

CREATE OR REPLACE TABLE months (month_idx INTEGER, month VARCHAR, month_start DATE, month_end DATE);

-- One row per company per day, dense, 2024-09-01 .. 2026-08-31, for every company that has
-- at least one cash or semi-liquid product with a snapshot balance. End-of-day balances.
CREATE OR REPLACE TABLE daily_cash (company_id VARCHAR, date DATE, cash_eur DOUBLE, investment_eur DOUBLE);

CREATE OR REPLACE TABLE monthly_flows (
  entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, flow_class VARCHAR, is_intragroup BOOLEAN,
  inflow_eur DOUBLE, outflow_eur DOUBLE, n_txn BIGINT);

CREATE OR REPLACE TABLE monthly_cash (
  entity_type VARCHAR, entity_id VARCHAR, month VARCHAR,
  cash_eom DOUBLE, cash_min DOUBLE, neg_days INTEGER, investment_eom DOUBLE);

-- direction: 'ISSUED' (sales, receivables) | 'RECEIVED' (purchases, payables)
-- new_*      : invoices with issuance_date in the month
-- paid_*     : invoices with payment_date in the month
-- open_eur   : issued on or before month_end, and payment_date IS NULL or > month_end
-- due_90d_unpaid_eur : open, and due_date <= month_end + 90 days
-- overdue_*  : open, and due_date < month_end; buckets by days from due_date to month_end
CREATE OR REPLACE TABLE monthly_invoices (
  entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, direction VARCHAR, is_intragroup BOOLEAN,
  new_eur DOUBLE, n_new BIGINT,
  paid_eur DOUBLE, n_paid BIGINT, paid_days_x_eur DOUBLE, paid_late_days_x_eur DOUBLE,
  open_eur DOUBLE, due_90d_unpaid_eur DOUBLE,
  overdue_eur DOUBLE, overdue_0_30_eur DOUBLE, overdue_31_60_eur DOUBLE,
  overdue_61_90_eur DOUBLE, overdue_90p_eur DOUBLE);

-- direction: 'IN' (OPERATING_IN flows) | 'OUT' (OPERATING_OUT flows). Booked, counterparty not null.
CREATE OR REPLACE TABLE monthly_counterparty (
  entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, counterparty_id VARCHAR,
  direction VARCHAR, is_intragroup BOOLEAN, amount_eur DOUBLE, n_txn BIGINT);

-- Static, as of the snapshot. rate_x_outstanding_eur / rated_outstanding_eur = weighted rate.
CREATE OR REPLACE TABLE debt_snapshot (
  entity_type VARCHAR, entity_id VARCHAR, debt_type VARCHAR, n_products BIGINT,
  granted_eur DOUBLE, outstanding_eur DOUBLE, liquidity_eur DOUBLE,
  rated_outstanding_eur DOUBLE, rate_x_outstanding_eur DOUBLE);
```

9. Plan A also creates `stg_transactions` and `stg_invoices` (internal to A, read by Block 3):
   - `stg_transactions(transaction_id, company_id, product_id, date DATE, month VARCHAR, amount DOUBLE, amount_eur DOUBLE, category VARCHAR, flow_class VARCHAR, counterparty_id VARCHAR, is_booked BOOLEAN, is_intragroup BOOLEAN)`
   - `stg_invoices(operation_id, company_id, direction VARCHAR, document_type VARCHAR, issuance_date DATE, due_date DATE, payment_date DATE, amount_eur DOUBLE, counterparty_id VARCHAR, is_intragroup BOOLEAN)`
10. Plan B creates these tables:
```sql
CREATE OR REPLACE TABLE entities (entity_type VARCHAR, entity_id VARCHAR, group_id VARCHAR);

CREATE OR REPLACE TABLE indicator_values_raw (
  entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, indicator_id VARCHAR,
  value DOUBLE, available BOOLEAN, is_static BOOLEAN, fallback BOOLEAN);

CREATE OR REPLACE TABLE threshold_quantiles (
  entity_type VARCHAR, indicator_id VARCHAR, n BIGINT, quantiles_json VARCHAR);
```
11. Rule for Block 3 indicator SQL: at `GROUP` level read every row (all rows have `is_intragroup = FALSE`). At `COMPANY` level read every row too (standalone view, intragroup kept).

## Run procedure

1. Commit the three plan files on `main` and push. Worktrees see only committed files.
2. Create one worktree for each branch.
   ```bash
   git worktree add ../xray-phase2-data   feat/phase2-data-sql
   git worktree add ../xray-phase2-rollup feat/phase2-rollup-panel
   ```
3. Link the data into each worktree. `data/raw/` is gitignored, so a worktree has no CSVs.
   ```bash
   mkdir -p ../xray-phase2-data/data ../xray-phase2-rollup/data
   ln -s "$PWD/data/raw" ../xray-phase2-data/data/raw
   ln -s "$PWD/data/raw" ../xray-phase2-rollup/data/raw
   ```
4. Start one agent in each worktree with this prompt (change the plan file):
   > Read `CLAUDE.md`, then execute `docs/superpowers/plans/2026-09-19-phase2-A-data-sql.md`
   > task by task. Only edit the paths this plan owns (see the overview file).
   > Commit after each task. Do not merge. Stop and report when all tasks are done.
5. When both agents report done, merge A first, then B:
   ```bash
   git checkout main && git pull
   git merge --no-ff feat/phase2-data-sql      -m "merge: phase 2 data sql"
   git merge --no-ff feat/phase2-rollup-panel  -m "merge: phase 2 rollup and panel"
   ```
   Expected result: no conflicts. If a conflict occurs, one agent edited a path it does not own. Keep the owner's version.
6. Run the post-merge smoke test from the repository root:
   ```bash
   (cd backend && ./mvnw -q test)                       # RollupTest + ScoringConfigValidationTest
   rm -f data/xray.duckdb data/xray.duckdb.wal          # force a fresh run on boot
   (cd backend && ./mvnw spring-boot:run) &             # wait for "pipeline run ... done"
   curl -s localhost:8080/api/pipeline/status           # state DONE, stageTimingsMs has 6 stages
   ```
   Stop the backend, then check the tables with the DuckDB CLI on a copy of the file:
   ```bash
   cp data/xray.duckdb /tmp/xray-check.duckdb
   duckdb /tmp/xray-check.duckdb "SELECT entity_type, COUNT(DISTINCT entity_id) FROM entities GROUP BY 1"   # COMPANY 1286, GROUP 250
   duckdb /tmp/xray-check.duckdb "SELECT entity_type, COUNT(*) FROM monthly_flows GROUP BY 1"
   duckdb /tmp/xray-check.duckdb "DESCRIBE monthly_invoices"                                             # matches contract item 8
   ```
   The backend log must show `S30_RAW_INDICATORS loaded 250 panels`.
7. Record the stage timings in `docs/DATA_FINDINGS.md` (target: full run < 5 min). Push `main`.
8. Remove the worktrees: `git worktree remove ../xray-phase2-data ../xray-phase2-rollup`.

## What comes after phase 2

Block 3 (indicators): Dev A writes `sql/30`–`34`, Dev B writes `sql/35`–`38`.
Each file INSERTs long rows into `indicator_values_raw`. `S30_RawIndicators`
picks up every `sql/3[0-8]_*.sql` file on the classpath, so Block 3 adds files
and changes no Java. `S95_Quantiles` then fills `threshold_quantiles` for
`docs/THRESHOLDS.md`.
