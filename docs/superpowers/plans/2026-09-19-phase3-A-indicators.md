# Phase 3 · Plan A — Indicators: liquidity, cash flow, activity, debt, leverage, tax

> **For agentic workers:** Claude Code: use superpowers:executing-plans (or superpowers:subagent-driven-development) to run this plan task by task. Antigravity or other agents: do the checkboxes in order. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write `sql/30`–`34` and `sql/38`. They fill `indicator_values_raw` with 13 of the 22 indicators, for `COMPANY` and `GROUP`, causally, one row per entity-month. Also close the Block 2 open questions in `docs/DATA_FINDINGS.md`.

**Architecture:** `S30_RawIndicators` already runs `sql/29` → `sql/28` (the `entity_months` grid) → every `sql/3[0-8]_*.sql`. `sql/30` builds `ind30_base`, a flow-and-cash base table shared by A's files. Each file then INSERTs long rows. No Java changes, except the config binding and `SqlParams` (Task 1).

**Tech Stack:** DuckDB SQL (window functions), Java 21 / Spring Boot 3.5 config binding, JUnit 5.

**Spec:** `docs/SPEC.md` §0, §5.3, §6, §6.1. `docs/ARCHITECTURE.md` §4.2, §5, §8.4. `docs/DATA_FINDINGS.md` (all of it, especially the "Open questions for Block 3"). Shared contract, decisions D1–D9 and path ownership: `docs/superpowers/plans/2026-09-19-phase3-overview.md`. **Read the overview before Task 1.**

## Global Constraints

- Edit only the paths that the overview gives to plan A.
- Java 21 target. The machine's JDK 21 has no `javac`. The default `java` (JDK 25) compiles with `--release 21`, so run plain `./mvnw ...`.
- No JPA, no Lombok, no new Maven dependency.
- `CLAUDE.md` rules 1 (causality), 3 (missing ≠ zero), 4 (never average ratios), 5 (config over code) and 7 (don't assume `⚠ UNKNOWN`) apply to every line of SQL.
- No numeric threshold, anchor or category name as a SQL literal. It comes from a `${placeholder}` fed by `scoring-config.yml`. Flow-class names (`OPERATING_IN`, `TAX`, …) and entity types are enum values, and they may be literals.
- Every indicator writes **exactly one row per `entity_months` row** (overview contract item 4).
- Only the six tests in `CLAUDE.md` may exist. A scratch test is allowed locally and is deleted before the commit.
- Commits: Conventional Commits, English, lowercase subject. Commit after each task.
- The backend in the IDE may hold `data/xray.duckdb`. Run your checks on another port and another data dir (Task 0).

## File Structure

```
backend/src/main/resources/
  scoring-config.yml                  + windows, tax-regularity, data-rules.{interest-categories, credit-line-debt-types, factoring-debt-types}
  sql/30_ind_liquidity.sql            ind30_base + LIQ_RUNWAY, LIQ_BUFFER, LIQ_MIN_BALANCE
  sql/31_ind_cashflow.sql             CF_NOCF_MARGIN, CF_VOLATILITY, CF_IN_OUT_RATIO
  sql/32_ind_activity.sql             ACT_COLLECTIONS_GROWTH
  sql/33_ind_debt.sql                 DEBT_DSCR, DEBT_LINE_UTIL (monthly credit-line rebuild)
  sql/34_ind_leverage.sql             LEV_DEBT_TO_CF, LEV_FACTORING_RELIANCE, LEV_FUNDING_COST
  sql/38_ind_tax.sql                  TAX_REGULARITY; drops ind30_base
backend/src/main/java/com/xray/
  config/ScoringConfig.java           + WindowConfig, TaxRegularityConfig
  config/DataRules.java               + interestCategories, creditLineDebtTypes, factoringDebtTypes
  pipeline/stages/SqlParams.java      + placeholders for the keys above
backend/src/test/java/com/xray/config/ScoringConfigValidationTest.java   copyWith + asserts
docs/DATA_FINDINGS.md                 Q13–Q15 + "Block 3 run"
scripts/validate_block3_a.sql         checks for A's indicators
```

---

### Task 0: Scratch run environment

**Files:** none committed.

- [ ] **Step 1: Make a scratch data dir that links the raw CSVs.**
  ```bash
  S=/tmp/xray-a && rm -rf $S && mkdir -p $S && ln -s "$(git rev-parse --show-toplevel)/data/raw" $S/raw
  ```
- [ ] **Step 2: Build and run once on port 8081.**
  ```bash
  cd backend && ./mvnw -q -DskipTests package
  SERVER_PORT=8081 XRAY_DATA_DIR=/tmp/xray-a java -jar target/xray-backend-0.0.1-SNAPSHOT.jar > /tmp/xray-a/boot.log 2>&1 &
  until curl -s localhost:8081/api/pipeline/status | grep -qE '"state":"(DONE|FAILED)"'; do sleep 2; done
  curl -s localhost:8081/api/pipeline/status; kill %1
  ```
  Expected: `DONE`, stages `S00`…`S30`, `S95`.
- [ ] **Step 3: Query tool.** Use the DuckDB CLI if it exists (`duckdb /tmp/xray-a/xray.duckdb`). Otherwise use `scripts/DuckQuery.java` from the prep commit. With the backend **stopped**:
  ```bash
  J=$(ls ~/.m2/repository/org/duckdb/duckdb_jdbc/1.5.5.1/*.jar)
  java --enable-native-access=ALL-UNNAMED -cp $J scripts/DuckQuery.java /tmp/xray-a/xray.duckdb "SELECT COUNT(*) FROM entity_months"
  ```
  Expected: `36864` (30,864 company + 6,000 group rows).

From here on, "run the pipeline" means Step 2, and "query" means Step 3.

---

### Task 1: Config keys and SQL placeholders

**Files:** `scoring-config.yml`, `config/ScoringConfig.java`, `config/DataRules.java`, `pipeline/stages/SqlParams.java`, `test/.../ScoringConfigValidationTest.java`.

- [ ] **Step 1: Add the keys to `scoring-config.yml`.** `data-rules` gets three lists, and the scoring root gets two blocks:
  ```yaml
    data-rules:
      # … existing keys …
      interest-categories: [interest_charge]             # LEV_FUNDING_COST numerator (DATA_FINDINGS Q1)
      credit-line-debt-types: [lineofcredit]             # DEBT_LINE_UTIL (DATA_FINDINGS Q6)
      factoring-debt-types: [factoring, confirming]      # LEV_FACTORING_RELIANCE (SPEC §6)

    # Overview contract item 6: 12m windows annualize over active months; fewer than this -> unavailable.
    windows:
      annualize-min-months: 6

    # Decision D2 (phase 3 overview): cadence from the median gap between months with a TAX outflow.
    tax-regularity:
      window-months: 12
      monthly-max-median-gap: 1.5      # median gap <= this -> monthly cadence (1), else quarterly (3)
      monthly-cadence-months: 1
      quarterly-cadence-months: 3
      min-tax-months: 2                # fewer TAX months in the history up to m -> cadence unknown -> unavailable
  ```
- [ ] **Step 2: Bind them.** In `DataRules` append `List<String> interestCategories, List<String> creditLineDebtTypes, List<String> factoringDebtTypes`. In `ScoringConfig` append the components `WindowConfig windows, TaxRegularityConfig taxRegularity` **after `concentration`** (the last component of the prep commit), with nested records:
  ```java
  /** 12m windows annualize over active months (phase 3 contract item 6). */
  public record WindowConfig(int annualizeMinMonths) {
  }

  /** TAX_REGULARITY cadence rule (phase 3 decision D2). */
  public record TaxRegularityConfig(int windowMonths, double monthlyMaxMedianGap, int monthlyCadenceMonths,
                                    int quarterlyCadenceMonths, int minTaxMonths) {
  }
  ```
- [ ] **Step 3: Placeholders.** In `SqlParams.of` add:
  ```java
  m.put("interest_categories", listOrNone(r.interestCategories()));
  m.put("credit_line_types", listOrNone(r.creditLineDebtTypes()));
  m.put("factoring_types", listOrNone(r.factoringDebtTypes()));
  m.put("annualize_min_months", String.valueOf(c.windows().annualizeMinMonths()));
  var t = c.taxRegularity();
  m.put("tax_window_months", String.valueOf(t.windowMonths()));
  m.put("tax_monthly_max_median_gap", String.valueOf(t.monthlyMaxMedianGap()));
  m.put("tax_monthly_cadence", String.valueOf(t.monthlyCadenceMonths()));
  m.put("tax_quarterly_cadence", String.valueOf(t.quarterlyCadenceMonths()));
  m.put("tax_min_months", String.valueOf(t.minTaxMonths()));
  ```
- [ ] **Step 4: Test.** In `ScoringConfigValidationTest.copyWith`, pass `base.windows(), base.taxRegularity()` at the end. Add to `shippedConfigBindsDataRules`:
  ```java
  assertEquals(List.of("interest_charge"), r.interestCategories());
  assertFalse(r.creditLineDebtTypes().isEmpty());
  assertEquals(6, base.windows().annualizeMinMonths());
  assertTrue(base.taxRegularity().monthlyCadenceMonths() < base.taxRegularity().quarterlyCadenceMonths());
  ```
- [ ] **Step 5:** `cd backend && ./mvnw -q test`. Expected: 11 tests pass.
- [ ] **Step 6: Commit** `feat(config): add window, tax cadence and debt type keys for block 3`.

---

### Task 2: Profile the credit lines and the interest flows (DATA_FINDINGS Q13–Q15)

**Files:** `scripts/profiling.sql` (append Q13–Q15), `docs/DATA_FINDINGS.md`.

Facts known at planning time (2026-09-19, scratch run). Re-run the queries and use your own numbers:
- 536 `lineofcredit` products; 312 have transactions (182,127 rows, 181,879 booked). They behave like current accounts: `collection` +46k, `payment` −26k, `utility`, `fee`, `salary`, …
- `granted` and `outstanding` are negative when used (Q11). `outstanding / granted` has a median of 0.149 and p95 of 0.994. It is negative when the line has a credit balance.
- `balances.csv` has a row for 532 lines, dated 2026-08-28 … 2026-09-01. `balance = outstanding` on only **284** of them. On none of them is `balance = −outstanding`.
- `debt_schedule`: 87 rows, `annual_interest_rate_or_spread` is a fraction (p5 0.01, p50 0.03, p95 0.05).

- [ ] **Step 1: Q13 — which snapshot for the line rebuild?** For the 248 lines where `balances.balance ≠ outstanding`, compare both values with `granted` and `liquidity`. Also check whether `balance − Σ booked amount after balance.date` matches `outstanding`, which would mean the two are the same balance at different dates.
  ```sql
  -- Q13a
  SELECT d.product_id, d.granted, d.outstanding, d.liquidity, b.balance, b.date,
         (SELECT SUM(amount) FROM stg_transactions t WHERE t.product_id = d.product_id AND t.is_booked
            AND t.date > CAST(b.date AS DATE)) AS tx_after_balance_date
  FROM raw_debt_products d JOIN raw_balances b USING (product_id)
  WHERE d.type IN (${credit_line_types}) AND ABS(b.balance - d.outstanding) >= 0.01
  ORDER BY random() LIMIT 20;
  ```
  **Decision rule:** if `balances.balance` explains the gap (a different date plus the transactions after it), rebuild from `balances.csv` like cash, with the snapshot at `balances.date`. Otherwise rebuild from `debt_products.outstanding` at the snapshot date `${snapshot_date}`. If neither fits for most of the 248 lines, **stop and ask the human** (CLAUDE.md rule 7).
- [ ] **Step 2: Q14 — validate the rebuild direction.** With the chosen snapshot `S`, the drawn amount at the start of the period is `GREATEST(-(S − Σ booked amount in (2024-09-01, T]), 0)`. The share of lines whose rebuilt `drawn / |granted|` stays within [0, 1.2] at every month end must be high (≥ 90 %). Also report the lines that go far above 1.2. If most lines go below 0 or above 1.2, the sign is wrong: **stop and ask**.
- [ ] **Step 3: Q15 — interest flows.** Booked `interest_charge` rows per entity-month, EUR total. How many companies with debt outstanding have **no** interest flow in 12 months? That share decides how often `LEV_FUNDING_COST` falls back to the static rate.
- [ ] **Step 4:** Write Q13–Q15 in `docs/DATA_FINDINGS.md` in the existing format (Query / Result / Decision / Config change).
- [ ] **Step 5: Commit** `docs(data): profile credit lines and interest flows for block 3`.

---

### Task 3: `sql/30_ind_liquidity.sql` — base table and liquidity

**Files:** create `backend/src/main/resources/sql/30_ind_liquidity.sql`.

`ind30_base` is A's shared base: one row per `entity_months` row, with monthly net components and rolling window sums. `sql/31`–`34` and `38` read it, and `38` drops it.

Component definitions (SPEC §5.3, decision D1). Nets per class, so small reversed rows (for example 277 inflows of `collection_refund`) net out:
- `op_in = Σ(inflow − outflow)` over `OPERATING_IN`
- `op_out = Σ(outflow − inflow)` over `OPERATING_OUT`
- `tax = Σ(outflow − inflow)` over `TAX`
- `debt_service = Σ(outflow − inflow)` over `DEBT_SERVICE`
- `nocf = op_in − op_out − tax`
- `tax_paid = Σ outflow` over `TAX` (for the tax cadence)

- [ ] **Step 1: Write the base table.**
  ```sql
  -- 30_ind_liquidity.sql — ind30_base (shared by sql/30-34, 38) + LIQ_RUNWAY, LIQ_BUFFER, LIQ_MIN_BALANCE (SPEC §6).
  CREATE OR REPLACE TABLE ind30_base AS
  WITH f AS (
    SELECT entity_type, entity_id, month,
           SUM(CASE WHEN flow_class = 'OPERATING_IN'  THEN inflow_eur - outflow_eur ELSE 0 END) AS op_in,
           SUM(CASE WHEN flow_class = 'OPERATING_OUT' THEN outflow_eur - inflow_eur ELSE 0 END) AS op_out,
           SUM(CASE WHEN flow_class = 'TAX'           THEN outflow_eur - inflow_eur ELSE 0 END) AS tax,
           SUM(CASE WHEN flow_class = 'DEBT_SERVICE'  THEN outflow_eur - inflow_eur ELSE 0 END) AS debt_service,
           SUM(CASE WHEN flow_class = 'TAX'           THEN outflow_eur ELSE 0 END)               AS tax_paid
    FROM monthly_flows
    GROUP BY 1, 2, 3),
  g AS (
    SELECT em.entity_type, em.entity_id, em.month, em.month_idx, em.is_active,
           COALESCE(f.op_in, 0) AS op_in, COALESCE(f.op_out, 0) AS op_out, COALESCE(f.tax, 0) AS tax,
           COALESCE(f.debt_service, 0) AS debt_service, COALESCE(f.tax_paid, 0) AS tax_paid,
           c.cash_eom, c.cash_min
    FROM entity_months em
    LEFT JOIN f ON f.entity_type = em.entity_type AND f.entity_id = em.entity_id AND f.month = em.month
    LEFT JOIN monthly_cash c ON c.entity_type = em.entity_type AND c.entity_id = em.entity_id AND c.month = em.month)
  SELECT *,
         op_in - op_out - tax                                   AS nocf,
         SUM(is_active::INTEGER) OVER w3                        AS act_3m,
         SUM(is_active::INTEGER) OVER w6                        AS act_6m,
         SUM(is_active::INTEGER) OVER w12                       AS act_12m,
         SUM(op_in) OVER w3                                     AS op_in_3m,
         SUM(op_out) OVER w3                                    AS op_out_3m,
         SUM(tax) OVER w3                                       AS tax_3m,
         SUM(debt_service) OVER w3                              AS ds_3m,
         SUM(op_in - op_out - tax) OVER w3                      AS nocf_3m,
         SUM(op_in) OVER w6                                     AS op_in_6m,
         STDDEV_SAMP(op_in - op_out - tax) OVER w6              AS nocf_std_6m,
         SUM(op_in - op_out - tax) OVER w12                     AS nocf_12m
  FROM g
  WINDOW w3  AS (PARTITION BY entity_type, entity_id ORDER BY month_idx ROWS BETWEEN 2 PRECEDING AND CURRENT ROW),
         w6  AS (PARTITION BY entity_type, entity_id ORDER BY month_idx ROWS BETWEEN 5 PRECEDING AND CURRENT ROW),
         w12 AS (PARTITION BY entity_type, entity_id ORDER BY month_idx ROWS BETWEEN 11 PRECEDING AND CURRENT ROW);
  ```
  Months before `is_active` have no flows, so the 12m sums already cover only active months. `act_12m` is the number of active months, which is the annualization divisor.
- [ ] **Step 2: `LIQ_RUNWAY`.** `burn = (op_out_3m + tax_3m + ds_3m − op_in_3m) / 3` (D1). Burn ≤ 0 → the cap (SPEC). Otherwise `LEAST(cash_eom / burn, cap)`. Negative cash gives a negative runway, and anchors clamp it to 0. No cash row (a company without cash products) → unavailable.
  ```sql
  INSERT INTO indicator_values_raw
  SELECT entity_type, entity_id, month, 'LIQ_RUNWAY',
         CASE WHEN ok THEN v END, ok, FALSE, FALSE
  FROM (
    SELECT *, (is_active AND act_3m = 3 AND v IS NOT NULL) AS ok
    FROM (
      SELECT *, CASE
                  WHEN cash_eom IS NULL THEN NULL
                  WHEN (op_out_3m + tax_3m + ds_3m - op_in_3m) <= 0 THEN ${runway_cap_months}
                  ELSE LEAST(cash_eom / ((op_out_3m + tax_3m + ds_3m - op_in_3m) / 3.0), ${runway_cap_months})
                END AS v
      FROM ind30_base));
  ```
  Use this outer shape (`v` → `ok` → the row) in every indicator.
- [ ] **Step 3: `LIQ_BUFFER`.** `cash_eom / (RECEIVED due_90d_unpaid_eur at eom + ds_3m)`. SPEC: "DEBT_SERVICE avg 3m × 3" = `ds_3m`. If the entity has **no invoice rows at all**, it is unavailable: payables are unknown, not zero (rule 3; 501 companies, Q8). Zero denominator (D3): `cash_eom > 0` → `${best_x_LIQ_BUFFER}`, otherwise unavailable.
  ```sql
  INSERT INTO indicator_values_raw
  WITH inv_entities AS (SELECT DISTINCT entity_type, entity_id FROM monthly_invoices),
  due AS (
    SELECT entity_type, entity_id, month, SUM(due_90d_unpaid_eur) AS due_90d
    FROM monthly_invoices WHERE direction = 'RECEIVED' GROUP BY 1, 2, 3)
  SELECT entity_type, entity_id, month, 'LIQ_BUFFER', CASE WHEN ok THEN v END, ok, FALSE, FALSE
  FROM (
    SELECT *, (is_active AND act_3m = 3 AND v IS NOT NULL) AS ok
    FROM (
      SELECT b.*, CASE
               WHEN b.cash_eom IS NULL OR ie.entity_id IS NULL THEN NULL
               WHEN COALESCE(d.due_90d, 0) + GREATEST(b.ds_3m, 0) > 0
                 THEN b.cash_eom / (COALESCE(d.due_90d, 0) + GREATEST(b.ds_3m, 0))
               WHEN b.cash_eom > 0 THEN ${best_x_LIQ_BUFFER}
             END AS v
      FROM ind30_base b
      LEFT JOIN inv_entities ie ON ie.entity_type = b.entity_type AND ie.entity_id = b.entity_id
      LEFT JOIN due d ON d.entity_type = b.entity_type AND d.entity_id = b.entity_id AND d.month = b.month));
  ```
- [ ] **Step 4: `LIQ_MIN_BALANCE`.** `cash_min / (op_out_3m / 3)`. Negative values are allowed (an overdraft). Zero denominator: `cash_min > 0` → `${best_x_LIQ_MIN_BALANCE}`, otherwise unavailable. Same shape as Step 2.
- [ ] **Step 5: Run and check.**
  ```sql
  SELECT entity_type, indicator_id, COUNT(*), ROUND(AVG(available::INT), 3) AS avail,
         quantile_cont(value, [0.05, 0.5, 0.95]) AS q
  FROM indicator_values_raw GROUP BY 1, 2 ORDER BY 1, 2;
  ```
  Expected: every `COUNT` is 30,864 (COMPANY) or 6,000 (GROUP). `LIQ_RUNWAY` values are within [negative, 24]. There must be no duplicate `(entity, month, indicator)`:
  `SELECT COUNT(*) FROM (SELECT 1 FROM indicator_values_raw GROUP BY entity_type, entity_id, month, indicator_id HAVING COUNT(*) > 1)` → 0.
- [ ] **Step 6: Commit** `feat(sql): add liquidity indicators and shared flow base`.

---

### Task 4: `sql/31_ind_cashflow.sql`

- [ ] **Step 1: `CF_NOCF_MARGIN`** = `nocf_3m / op_in_3m`, window `act_3m = 3`. Zero denominator: `op_in_3m <= 0 AND nocf_3m > 0` → `${best_x_CF_NOCF_MARGIN}`, otherwise unavailable.
- [ ] **Step 2: `CF_VOLATILITY`** = `nocf_std_6m / (op_in_6m / 6)`, window `act_6m = 6`. Lower is better. Zero denominator: `op_in_6m <= 0 AND nocf_std_6m > 0` → `${worst_x_CF_VOLATILITY}`, both 0 → unavailable.
- [ ] **Step 3: `CF_IN_OUT_RATIO`** = `op_in_3m / (op_out_3m + tax_3m)`, `act_3m = 3`. Zero denominator: `op_in_3m > 0` → `${best_x_CF_IN_OUT_RATIO}`.
- [ ] **Step 4:** Run and check counts, duplicates and quantiles (Task 3 Step 5). Then look at **COMP_1185** (Block 2 open question 3: 48 bn EUR of sweeps without exact mirrors):
  ```sql
  SELECT month, indicator_id, value FROM indicator_values_raw
  WHERE entity_id IN ('COMP_1185', (SELECT group_id FROM stg_companies WHERE company_id = 'COMP_1185'))
    AND indicator_id LIKE 'CF_%' ORDER BY indicator_id, month;
  ```
  Report whether its ratios look plausible. If they are absurd (for example `CF_IN_OUT_RATIO` stuck at exactly 1.0 from sweeps), write it in DATA_FINDINGS and **ask the human** before adding any exclusion rule.
- [ ] **Step 5: Commit** `feat(sql): add operating cash flow indicators`.

---

### Task 5: `sql/32_ind_activity.sql` — `ACT_COLLECTIONS_GROWTH`

SPEC: YoY `op_in_3m / op_in_3m(m−12) − 1`, available from M14. Before that, or when the year-ago window is not fully active, fall back to QoQ `op_in_3m / op_in_3m(m−3) − 1` with `fallback = TRUE`.

- [ ] **Step 1:**
  ```sql
  INSERT INTO indicator_values_raw
  SELECT entity_type, entity_id, month, 'ACT_COLLECTIONS_GROWTH', CASE WHEN ok THEN v END, ok, FALSE, ok AND fb
  FROM (
    SELECT *, (is_active AND act_3m = 3 AND v IS NOT NULL) AS ok
    FROM (
      SELECT *,
             CASE
               WHEN act_3m_l12 = 3 AND op_in_3m_l12 > 0 THEN op_in_3m / op_in_3m_l12 - 1
               WHEN act_3m_l12 = 3 AND op_in_3m > 0     THEN ${best_x_ACT_COLLECTIONS_GROWTH}
               WHEN act_3m_l3 = 3 AND op_in_3m_l3 > 0   THEN op_in_3m / op_in_3m_l3 - 1
               WHEN act_3m_l3 = 3 AND op_in_3m > 0      THEN ${best_x_ACT_COLLECTIONS_GROWTH}
             END AS v,
             NOT (act_3m_l12 = 3 AND (op_in_3m_l12 > 0 OR op_in_3m > 0)) AS fb
      FROM (
        SELECT *,
               LAG(op_in_3m, 12) OVER w AS op_in_3m_l12, LAG(act_3m, 12) OVER w AS act_3m_l12,
               LAG(op_in_3m, 3)  OVER w AS op_in_3m_l3,  LAG(act_3m, 3)  OVER w AS act_3m_l3
        FROM ind30_base
        WINDOW w AS (PARTITION BY entity_type, entity_id ORDER BY month_idx))));
  ```
- [ ] **Step 2: Check** that `fallback` is TRUE for every available row with `month_idx < 14`, and FALSE for most active long-history rows after M14.
- [ ] **Step 3: Commit** `feat(sql): add collections growth with qoq fallback`.

---

### Task 6: `sql/33_ind_debt.sql` — `DEBT_DSCR`, `DEBT_LINE_UTIL`

- [ ] **Step 1: `DEBT_DSCR`** = `nocf_3m / ds_3m`, `act_3m = 3`. When `ds_3m <= 0`: `value NULL, available TRUE` (overview contract item 5; S40 maps it to `debt-dscr.no-debt-level`). This is the only place where A writes `available AND value IS NULL`, together with `LEV_DEBT_TO_CF` in Task 7.
- [ ] **Step 2: Credit-line rebuild (decision D4).** Use the snapshot chosen in Task 2 Q13. The sketch below uses `debt_products.outstanding` at `${snapshot_date}`. If Q13 chose `balances.csv`, swap in `raw_balances` and its date, exactly as in `12_balances.sql`. Native currency first, EUR after (`fx_to_eur` of the product currency, like `24_debt_snapshot.sql`).
  ```sql
  CREATE OR REPLACE TABLE ind33_lines AS
  WITH lines AS (
    SELECT d.product_id, d.company_id, d.currency,
           TRY_CAST(d.outstanding AS DOUBLE) AS snap, ABS(TRY_CAST(d.granted AS DOUBLE)) AS granted
    FROM raw_debt_products d WHERE d.type IN (${credit_line_types})),
  tx AS (
    SELECT product_id, month, SUM(amount) AS amt FROM stg_transactions WHERE is_booked GROUP BY 1, 2),
  rebuilt AS (   -- lines with transactions: drawn at each month end, backwards from the snapshot
    SELECT l.product_id, l.company_id, l.currency, l.granted, m.month,
           l.snap - COALESCE(SUM(tx.amt) FILTER (WHERE tx.month > m.month), 0) AS bal_eom
    FROM lines l
    CROSS JOIN months m
    LEFT JOIN tx ON tx.product_id = l.product_id
    WHERE l.product_id IN (SELECT product_id FROM tx)
    GROUP BY ALL)
  SELECT r.company_id, r.month, TRUE AS is_rebuilt,
         GREATEST(-r.bal_eom, 0) * fx.rate AS drawn_eur, r.granted * fx.rate AS granted_eur
  FROM rebuilt r JOIN fx_to_eur fx ON fx.currency = r.currency
  UNION ALL
  SELECT l.company_id, m.month, FALSE, GREATEST(-l.snap, 0) * fx.rate, l.granted * fx.rate   -- static lines
  FROM lines l CROSS JOIN months m JOIN fx_to_eur fx ON fx.currency = l.currency
  WHERE l.product_id NOT IN (SELECT product_id FROM tx);
  ```
  `tx.month > m.month` gives "transactions dated after the end of month m", because months are whole calendar months. Check Q14 again on this table: the share of rebuilt `drawn / granted` in [0, 1.2] per line-month.
- [ ] **Step 3: `DEBT_LINE_UTIL`.** Sum the components per entity, then take the ratio (rule 4). Groups: sum the companies through `stg_companies`. Lines are never intragroup. `is_static = NOT bool_or(is_rebuilt)`. No line, or `granted_eur = 0` → unavailable. Inactive month → unavailable.
  ```sql
  INSERT INTO indicator_values_raw
  WITH comp AS (
    SELECT 'COMPANY' AS entity_type, company_id AS entity_id, month,
           SUM(drawn_eur) AS drawn, SUM(granted_eur) AS granted, bool_or(is_rebuilt) AS any_rebuilt
    FROM ind33_lines GROUP BY 1, 2, 3),
  grp AS (
    SELECT 'GROUP', c.group_id, l.month, SUM(l.drawn_eur), SUM(l.granted_eur), bool_or(l.is_rebuilt)
    FROM ind33_lines l JOIN stg_companies c ON c.company_id = l.company_id GROUP BY 1, 2, 3),
  u AS (SELECT * FROM comp UNION ALL SELECT * FROM grp)
  SELECT em.entity_type, em.entity_id, em.month, 'DEBT_LINE_UTIL',
         CASE WHEN ok THEN u.drawn / u.granted END, ok, ok AND NOT u.any_rebuilt, FALSE
  FROM (SELECT em.*, u.*, COALESCE(em.is_active AND u.granted > 0, FALSE) AS ok
        FROM entity_months em
        LEFT JOIN u ON u.entity_type = em.entity_type AND u.entity_id = em.entity_id AND u.month = em.month) ...
  ```
  (Tidy the column references. The shape: one row per `entity_months` row, `ok` computed once.)
  Drop `ind33_lines` at the end of the file.
- [ ] **Step 4: Check.** Count the entities with a monthly (`is_static = FALSE`) utilization: expected near the number of companies owning the 312 rebuilt lines. Check that the utilization at M23 of a rebuilt line entity equals `outstanding / granted` from the snapshot (±1 %, only if Q13 chose `outstanding`).
- [ ] **Step 5: Commit** `feat(sql): add dscr and monthly credit line utilization`.

---

### Task 7: `sql/34_ind_leverage.sql`

Total debt comes from `debt_snapshot.outstanding_eur` summed over all debt types (static, already in EUR, already a positive magnitude, group rows already there).

- [ ] **Step 1: `LEV_DEBT_TO_CF`** = `debt / (nocf_12m × 12 / act_12m)`. Available when `is_active AND act_12m >= ${annualize_min_months}`. `fallback = act_12m < 12`. `is_static = TRUE` (snapshot debt). Cases:
  - debt = 0 (no debt row, or 0) → value 0.
  - debt > 0 and annualized NOCF ≤ 0 → `value NULL, available TRUE` (contract item 5, level 0 from config).
  - otherwise the ratio.
- [ ] **Step 2: `LEV_FACTORING_RELIANCE`** = Σ outstanding of `debt_type IN (${factoring_types})` / Σ outstanding of all types. Static (`is_static = TRUE`), the same value in every active month. Total debt 0 → value 0: no debt means no reliance, which is the natural zero of SPEC §6.1. The SPEC also mentions a "growth of factoring-classified inflows" component. That part is **not built**: no category marks a factoring advance (`FINANCING_IN` is empty, Q1). Write this in DATA_FINDINGS.
- [ ] **Step 3: `LEV_FUNDING_COST`** = annualized interest / debt − `${reference_rate}` (the spread over the reference rate, SPEC §6.1):
  - Interest per company-month: booked `stg_transactions` with `category IN (${interest_categories})`, `SUM(-amount_eur)`. Group: sum the companies with `NOT is_intragroup`.
  - 12m window over the grid, annualized by `act_12m` like Step 1. `fallback = act_12m < 12`.
  - Interest 12m = 0 or no rows, **or** debt = 0 → fallback to the static rate `rate_x_outstanding_eur / rated_outstanding_eur − ${reference_rate}` from `debt_snapshot`, with `fallback = TRUE, is_static = TRUE`.
  - No debt at all → unavailable (there is no funding cost to score).
  - Note: `reference_rate` is still a placeholder (0.035). The level moves when a human sets it, and that's expected.
- [ ] **Step 4: Check** the quantiles of the three indicators. `LEV_FUNDING_COST` must be mostly within [−0.035, 0.1]. Values far above that (interest / debt > 20 %) mean the numerator carries non-interest rows: report them.
- [ ] **Step 5: Commit** `feat(sql): add leverage indicators`.

---

### Task 8: `sql/38_ind_tax.sql` — `TAX_REGULARITY` (decision D2)

Algorithm, all causal (history ≤ m):
1. `tax_month` = active months with `tax_paid > 0`.
2. `gap` of each tax month = its `month_idx` minus the previous tax month's `month_idx` (per entity).
3. For month m: `median_gap(m)` = median of the gaps of the tax months ≤ m. `cadence = ${tax_monthly_cadence}` if `median_gap <= ${tax_monthly_max_median_gap}`, otherwise `${tax_quarterly_cadence}`. Fewer than `${tax_min_months}` tax months up to m → unavailable.
4. `n_win` = active months in the last `${tax_window_months}` months. `expected = n_win / cadence`. `ratio = LEAST(1, tax_months_in_window / expected)`.
5. `gap_now = m − last tax month ≤ m`. `value = ratio × (gap_now > cadence ? cadence / gap_now : 1)`.
6. Available when `is_active AND n_win >= ${annualize_min_months}`. `fallback = n_win < ${tax_window_months}`.

- [ ] **Step 1: Write the file.** Build `tm` (entity, month_idx of tax months, gap via `LAG`). Join it to `ind30_base` on `tm.month_idx <= b.month_idx` and aggregate: `quantile_cont(gap, 0.5)`, `COUNT(*)`, `MAX(tm.month_idx)`, and `COUNT(*) FILTER (WHERE tm.month_idx > b.month_idx - ${tax_window_months})`. `n_win` comes from a window sum of `is_active` over `${tax_window_months}` rows. The first tax month has a NULL gap: exclude it from the median.
- [ ] **Step 2:** `DROP TABLE ind30_base;` at the end of the file (the last A file).
- [ ] **Step 3: Check.** Share of entities with a monthly cadence (social security makes most of them monthly, Q1). An entity that stops paying tax for 4 months at the end must show `value` falling month by month. Find one such entity and show its series.
- [ ] **Step 4: Commit** `feat(sql): add tax regularity from the entity's own cadence`.

---

### Task 9: Validation and DATA_FINDINGS "Block 3 run (A)"

**Files:** `scripts/validate_block3_a.sql`, `docs/DATA_FINDINGS.md`.

- [ ] **Step 1: Write `scripts/validate_block3_a.sql`** with:
  - V5: per indicator and entity type, `COUNT(*)` = the `entity_months` count (no missing rows, no duplicates).
  - V6: no `available AND value IS NULL` except `DEBT_DSCR` and `LEV_DEBT_TO_CF`.
  - V7: no `available` row in an inactive month, and no row with `available IS NULL`.
  - V8: availability % per indicator (GROUP and COMPANY), and p5/p50/p95 of `value`.
  - V9: **causality spot check.** Pick 3 groups. Recompute `LIQ_RUNWAY` and `CF_NOCF_MARGIN` at M12 by hand from `monthly_flows` / `monthly_cash` rows with `month <= '2025-09'` only, and compare with the stored values.
- [ ] **Step 2:** Clean run (`rm /tmp/xray-a/xray.duckdb*`, run the pipeline). Record the `S30_RAW_INDICATORS` timing, and run the validation script.
- [ ] **Step 3:** Add "Block 3 run (A)" to `docs/DATA_FINDINGS.md`: timings, V5–V9 results, and the answers to the Block 2 open questions:
  1. Months before the first transaction → `entity_months.is_active` (prep commit); give the counts.
  2. `DEBT_LINE_UTIL` → monthly for N entities, static for M (Q13/Q14).
  3. COMP_1185 → what its indicators look like, and the human decision if you asked for one.
  4. `DEL_AGING_90` → owned by B; say "see B's report".
  5. `FINANCING_IN` empty → no factoring-inflow component in `LEV_FACTORING_RELIANCE`.
- [ ] **Step 4: Commit** `docs(data): record block 3 indicator run for plan a`.
- [ ] **Step 5: Final report** to the human: the tasks done, the availability table, the decisions taken in Task 2 and anything you stopped to ask about.
