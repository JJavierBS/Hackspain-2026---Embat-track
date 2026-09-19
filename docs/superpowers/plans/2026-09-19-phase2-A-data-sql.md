# Phase 2 · Plan A — Data SQL Implementation Plan

> **For agentic workers:** Claude Code: use superpowers:executing-plans (or superpowers:subagent-driven-development) to run this plan task by task. Antigravity or other agents: do the checkboxes in order. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Profile the Embat CSVs, record the data rules, and build the company-level SQL layer: raw views, staging, intragroup tagging, balance reconstruction and the five monthly contract tables.

**Architecture:** Three pipeline stages run numbered SQL files with `${placeholder}` substitution. `S00_Ingest` creates `raw_*` views over the CSVs. `S10_Staging` builds typed `stg_*` tables, tags intragroup rows and reconstructs daily balances backwards from the snapshot. `S20_MonthlyAggregates` writes the monthly contract tables at company level. Every data rule that profiling decides lives in `scoring-config.yml` under `scoring.data-rules`. `SqlParams` turns the config into SQL fragments, so the SQL files hold no business constants.

**Tech Stack:** Java 21, Spring Boot 3.5, DuckDB JDBC 1.5.5.1, DuckDB CLI (stable, Homebrew) for profiling only.

**Spec:** `docs/SPEC.md` §3, §4, §5. `docs/ARCHITECTURE.md` §5, §6. Shared contract and path ownership: `docs/superpowers/plans/2026-09-19-phase2-overview.md`. Read the overview before Task 1.

## Global Constraints

- Edit only the paths that the overview gives to plan A.
- Java 21. If `java -version` is not 21, run Maven as `mise exec java@temurin-21 -- ./mvnw ...`.
- No JPA, no Lombok, no new Maven dependency.
- Rule 7 of `CLAUDE.md`: do not assume `⚠ UNKNOWN` semantics. Profile first, write the finding in `docs/DATA_FINDINGS.md`, then set the config.
- Every constant that profiling decides lives in `scoring-config.yml`. SQL files use placeholders.
- Contract tables use the DDL of overview item 8 **exactly**. Write `CREATE OR REPLACE TABLE … (columns)` then `INSERT INTO … SELECT`.
- Company rows only. Never write `entity_type = 'GROUP'` rows (plan B does that).
- No new test class. Only the six tests in `CLAUDE.md` may exist. You may extend `ScoringConfigValidationTest`.
- Commits: Conventional Commits, English, lowercase subject. Commit after each task.
- Never open `data/xray.duckdb` with the CLI while the backend runs (file lock). Use a copy.

## File Structure

```
scripts/
  profiling.sql                       extended with Q2c, Q4b, Q5b, Q10, Q11
  validate_block2.sql                 M1 checks (new)
docs/DATA_FINDINGS.md                 every question answered
backend/src/main/resources/
  scoring-config.yml                  flow-classes, booked-status-values, data-rules
  sql/00_ingest.sql                   raw_* views
  sql/10_staging.sql                  fx, flow-class map, months, stg_* tables
  sql/11_intragroup.sql               is_intragroup tagging
  sql/12_balances.sql                 daily_cash
  sql/20_monthly_flows.sql
  sql/21_monthly_cash.sql
  sql/22_monthly_invoices.sql
  sql/23_monthly_counterparty.sql
  sql/24_debt_snapshot.sql
backend/src/main/java/com/xray/
  config/DataRules.java               new record
  config/ScoringConfig.java           adds DataRules dataRules
  pipeline/stages/RawData.java        CSV presence guard
  pipeline/stages/SqlParams.java      config → placeholder map
  pipeline/stages/S00_Ingest.java     runs 00
  pipeline/stages/S10_Staging.java    runs 10, 11, 12
  pipeline/stages/S20_MonthlyAggregates.java   runs 20–24
backend/src/test/java/com/xray/config/ScoringConfigValidationTest.java   binds data-rules
```

---

### Task 1: Profile the data and record the findings

**Files:**
- Modify: `scripts/profiling.sql`
- Modify: `docs/DATA_FINDINGS.md`

**Interfaces:**
- Produces: the decisions that Task 2 writes into `scoring.data-rules`, `scoring.flow-classes` and `scoring.booked-status-values`.

- [ ] **Step 1: Install the DuckDB CLI (stable)**

```bash
brew install duckdb
duckdb --version
```
Write the version in `docs/DATA_FINDINGS.md` (header line "Profiled with DuckDB CLI vX.Y.Z (Homebrew stable)").

- [ ] **Step 2: Add the extra questions to `scripts/profiling.sql`**

Add these views after the existing views:

```sql
CREATE OR REPLACE VIEW sched AS SELECT * FROM read_csv_auto('data/raw/debt_schedule_config.csv');
```

Append these queries at the end of the file:

```sql
.print '## Q2c invoice amount sign vs counterparty flow direction (per sign)'
WITH cp AS (
  SELECT company_id, counterparty_id,
         SUM(CASE WHEN amount > 0 THEN 1 ELSE 0 END) AS n_in,
         SUM(CASE WHEN amount < 0 THEN 1 ELSE 0 END) AS n_out
  FROM tx WHERE counterparty_id IS NOT NULL GROUP BY 1, 2)
SELECT i.document_type, SIGN(i.amount) AS inv_sign, COUNT(*) AS n_inv,
       SUM(cp.n_in) AS tx_in, SUM(cp.n_out) AS tx_out
FROM inv i JOIN cp USING (company_id, counterparty_id)
GROUP BY 1, 2 ORDER BY 1, 2;

.print '## Q4b invoice currency vs accounting currency vs exchange_rate'
SELECT currency, accounting_currency, COUNT(*) AS n,
       MEDIAN(exchange_rate) AS median_rate, MIN(exchange_rate) AS min_rate, MAX(exchange_rate) AS max_rate
FROM inv GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 30;
SELECT bp.currency AS product_currency, c.currency AS company_currency, COUNT(*) AS n_tx,
       MEDIAN(t.exchange_rate) AS median_rate
FROM tx t JOIN bp USING (product_id) JOIN co c ON c.company_id = t.company_id
GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 30;

.print '## Q5b intragroup mirror pairs (opposite amount, same group, other company, within 2 days)'
WITH t AS (
  SELECT tx.transaction_id, tx.company_id, co.group_id, CAST(tx.date AS DATE) AS d, tx.amount
  FROM tx JOIN co USING (company_id) WHERE tx.status = 'booked')
SELECT COUNT(*) AS n_pairs, COUNT(DISTINCT a.transaction_id) AS n_out_tx,
       COUNT(DISTINCT a.group_id) AS n_groups
FROM t a JOIN t b
  ON b.group_id = a.group_id AND b.company_id <> a.company_id
 AND b.amount = -a.amount AND ABS(date_diff('day', a.d, b.d)) <= 2
WHERE a.amount < 0;
SELECT category, COUNT(*) AS n FROM tx
WHERE lower(category) LIKE '%transfer%' OR lower(category) LIKE '%internal%' OR lower(category) LIKE '%intra%'
GROUP BY 1 ORDER BY 2 DESC;

.print '## Q10 invoice dates: payment_date vs status, dates after snapshot'
SELECT status, COUNT(*) AS n,
       SUM(CASE WHEN payment_date IS NULL THEN 1 ELSE 0 END) AS n_no_payment_date,
       SUM(CASE WHEN pending_amount > 0 THEN 1 ELSE 0 END) AS n_pending_gt0,
       SUM(CASE WHEN CAST(payment_date AS DATE) >= DATE '2026-09-01' THEN 1 ELSE 0 END) AS n_paid_after_snapshot,
       MIN(CAST(issuance_date AS DATE)) AS min_issue, MAX(CAST(issuance_date AS DATE)) AS max_issue
FROM inv GROUP BY 1 ORDER BY 2 DESC;

.print '## Q11 debt sign and schedule coverage'
SELECT type, COUNT(*) AS n,
       SUM(CASE WHEN outstanding < 0 THEN 1 ELSE 0 END) AS n_out_neg,
       SUM(CASE WHEN outstanding > 0 THEN 1 ELSE 0 END) AS n_out_pos,
       SUM(CASE WHEN granted IS NULL THEN 1 ELSE 0 END) AS n_granted_null,
       SUM(CASE WHEN product_id IN (SELECT product_id FROM sched) THEN 1 ELSE 0 END) AS n_with_schedule,
       COUNT(DISTINCT currency) AS n_currencies
FROM debt GROUP BY 1 ORDER BY 2 DESC;
SELECT MIN(CAST(date AS DATE)) AS min_snapshot, MAX(CAST(date AS DATE)) AS max_snapshot,
       SUM(CASE WHEN product_id NOT IN (SELECT product_id FROM bp) THEN 1 ELSE 0 END) AS n_not_banking
FROM bal;
```

- [ ] **Step 3: Run the profiling script**

Run from the repository root (about 1–3 min on the 472 MB file):
```bash
duckdb < scripts/profiling.sql > /tmp/profiling-out.md
```
Expected: markdown tables for Q1–Q11, no error.

- [ ] **Step 4: Answer every question in `docs/DATA_FINDINGS.md`**

For each `## Qn` section, replace "Not run yet" with the key numbers (a short table or 2–5 lines), then fill **Decision** and **Config change**. Add sections Q2c, Q4b, Q5b, Q10 and Q11 in the same format. Use this decision table:

| Question | Decision to write | Config key (Task 2) |
|---|---|---|
| Q1 | Map every category with ≥ 0.1 % of rows to a flow class. Put interest, commissions and loan payments in `DEBT_SERVICE`. Put own-account transfers in `INTERNAL`. Put disbursements and factoring advances in `FINANCING_IN`. Leave rare categories to `OTHER` (sign fallback) | `flow-classes` |
| Q2, Q2a–c | `AMOUNT_SIGN` if one sign matches inflow counterparties (sales) and the other sign matches outflow counterparties (purchases). Write which sign is ISSUED. Otherwise `COUNTERPARTY_FLOW`. Say how to treat `credit_note`, `invoiceGroup` and other types (keep, flip or exclude) | `data-rules.invoice-direction`, `invoice-issued-sign`, `invoice-excluded-document-types` |
| Q3, Q10 | Booked status values for flows. Invoice status values that mean "cancelled" or "void" (exclude). Whether `payment_date` is reliable for paid invoices | `booked-status-values`, `data-rules.invoice-excluded-status-values` |
| Q4, Q4b | Does `amount × exchange_rate` or `amount / exchange_rate` give plausible magnitudes? Does the rate convert to EUR or to the local (company / accounting) currency? | `data-rules.fx-convention`, `fx-target`, `fx-to-eur` |
| Q5, Q5b | `COUNTERPARTY_IS_COMPANY` if Q5 finds matches. Else `MIRROR_MATCH` if Q5b finds a material number of pairs. Else `NONE` | `data-rules.intragroup-rule`, `intragroup-max-lag-days` |
| Q6 | Monthly `DEBT_LINE_UTIL` possible or static only | note for Block 3, no config yet |
| Q7, Q8 | Counts only. Note entities with < 6 and < 12 months | note for Block 3 confidence |
| Q9, Q11 | Which product types have balances. Card sign. Debt `outstanding` sign (expected negative → use ABS). Snapshot date range per product | `cash-product-types` if it changes |

`fx-to-eur` holds one static rate per currency seen in Q4 / Q4b (source: ECB reference rate of 2026-09-01, write the source line in the findings). EUR is always `1.0`.

- [ ] **Step 5: Commit**

```bash
git add scripts/profiling.sql docs/DATA_FINDINGS.md
git commit -m "docs(data): record profiling findings for block 2"
```

---

### Task 2: Bind the data rules in the config

**Files:**
- Create: `backend/src/main/java/com/xray/config/DataRules.java`
- Modify: `backend/src/main/java/com/xray/config/ScoringConfig.java`
- Modify: `backend/src/main/resources/scoring-config.yml`
- Test: `backend/src/test/java/com/xray/config/ScoringConfigValidationTest.java`

**Interfaces:**
- Produces: `ScoringConfig.dataRules()` → `DataRules` with the accessors used by `SqlParams` in Task 3.

- [ ] **Step 1: Write the failing test**

Add to `ScoringConfigValidationTest`:

```java
    @Test
    void shippedConfigBindsDataRules() {
        DataRules r = base.dataRules();
        assertNotNull(r);
        assertNotNull(r.fxConvention());
        assertNotNull(r.fxTarget());
        assertEquals(1.0, r.fxToEur().get("EUR"));
        assertNotNull(r.invoiceDirection());
        assertTrue(r.invoiceIssuedSign() == 1 || r.invoiceIssuedSign() == -1);
        assertNotNull(r.intragroupRule());
        assertTrue(r.intragroupMaxLagDays() >= 0);
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && ./mvnw -q test -Dtest=ScoringConfigValidationTest`
Expected: compile error, `cannot find symbol: class DataRules`.

- [ ] **Step 3: Create `DataRules.java`**

```java
package com.xray.config;

import java.util.List;
import java.util.Map;

/** Data semantics decided by profiling (SPEC §4, docs/DATA_FINDINGS.md). */
public record DataRules(
        FxConvention fxConvention,
        FxTarget fxTarget,
        Map<String, Double> fxToEur,
        InvoiceDirection invoiceDirection,
        int invoiceIssuedSign,
        List<String> invoiceExcludedDocumentTypes,
        List<String> invoiceExcludedStatusValues,
        IntragroupRule intragroupRule,
        int intragroupMaxLagDays) {

    /** How exchange_rate applies to amount. NONE = amounts are already in the target currency. */
    public enum FxConvention { MULTIPLY, DIVIDE, NONE }

    /** EUR: amount (op) exchange_rate is EUR. LOCAL: it is the company or accounting currency; fx-to-eur converts it. */
    public enum FxTarget { EUR, LOCAL }

    /** AMOUNT_SIGN: sign of amount gives the direction. COUNTERPARTY_FLOW: the counterparty's net transaction sign does. */
    public enum InvoiceDirection { AMOUNT_SIGN, COUNTERPARTY_FLOW }

    public enum IntragroupRule { COUNTERPARTY_IS_COMPANY, MIRROR_MATCH, NONE }
}
```

- [ ] **Step 4: Add the field to `ScoringConfig`**

Add `DataRules dataRules` as the last record component, after `DebtDscrConfig debtDscr`:

```java
        DebtDscrConfig debtDscr,
        DataRules dataRules) {
```

- [ ] **Step 5: Write the Task 1 decisions into `scoring-config.yml`**

Replace the `flow-classes:` block with the map from Q1 (keep `default-flow-class: OTHER` and `other-sign-fallback: true` unless Q1 says otherwise). Set `booked-status-values` from Q3. Remove the comment "Category names are GUESSES". Add this block after `other-sign-fallback`, with the values from Task 1 (the values below are the shape, not the answer):

```yaml
  # Data semantics from profiling — see docs/DATA_FINDINGS.md (Q2, Q4, Q5, Q10).
  data-rules:
    fx-convention: MULTIPLY          # Q4: MULTIPLY | DIVIDE | NONE
    fx-target: EUR                   # Q4b: EUR | LOCAL
    fx-to-eur: { EUR: 1.0 }          # Q4b: one static rate per currency, ECB 2026-09-01
    invoice-direction: AMOUNT_SIGN   # Q2: AMOUNT_SIGN | COUNTERPARTY_FLOW
    invoice-issued-sign: 1           # Q2c: sign of amount for ISSUED (sales) invoices
    invoice-excluded-document-types: []   # Q2a
    invoice-excluded-status-values: []    # Q3, Q10
    intragroup-rule: MIRROR_MATCH    # Q5: COUNTERPARTY_IS_COMPANY | MIRROR_MATCH | NONE
    intragroup-max-lag-days: 2       # Q5b
```

- [ ] **Step 6: Run the tests**

Run: `cd backend && ./mvnw -q test`
Expected: PASS, all tests in `ScoringConfigValidationTest`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/xray/config backend/src/main/resources/scoring-config.yml backend/src/test/java/com/xray/config
git commit -m "feat(config): bind data rules and flow classes from profiling"
```

---

### Task 3: Ingest stage with the placeholder builder

**Files:**
- Create: `backend/src/main/java/com/xray/pipeline/stages/RawData.java`
- Create: `backend/src/main/java/com/xray/pipeline/stages/SqlParams.java`
- Create: `backend/src/main/resources/sql/00_ingest.sql`
- Modify: `backend/src/main/java/com/xray/pipeline/stages/S00_Ingest.java`

**Interfaces:**
- Consumes: `ScoringConfig.dataRules()` (Task 2), `XRayProperties.rawPath()`.
- Produces:
  - `RawData.present(XRayProperties props)` → `boolean`
  - `SqlParams.of(ScoringConfig config, XRayProperties props)` → `Map<String, String>` with keys `raw_dir`, `period_start`, `snapshot_date`, `booked_status`, `cash_types`, `semi_liquid_types`, `flow_class_values`, `default_flow_class`, `other_sign_fallback`, `fx_values`, `tx_amount_eur`, `inv_amount_eur`, `invoice_direction`, `invoice_issued_sign`, `invoice_excluded_types`, `invoice_excluded_status`, `intragroup_rule`, `intragroup_max_lag_days`.
  - Views `raw_groups`, `raw_companies`, `raw_banking_products`, `raw_debt_products`, `raw_debt_schedule`, `raw_transactions`, `raw_invoices`, `raw_balances`.

- [ ] **Step 1: Create `RawData.java`**

```java
package com.xray.pipeline.stages;

import com.xray.config.XRayProperties;

import java.nio.file.Files;

/** The data stages skip when the Embat CSVs are absent, so the app still boots (overview contract item 7). */
final class RawData {

    private RawData() {
    }

    static boolean present(XRayProperties props) {
        return Files.isRegularFile(props.rawPath().resolve("transactions.csv"));
    }
}
```

- [ ] **Step 2: Create `SqlParams.java`**

```java
package com.xray.pipeline.stages;

import com.xray.config.DataRules;
import com.xray.config.ScoringConfig;
import com.xray.config.XRayProperties;

import java.time.YearMonth;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** Turns scoring-config.yml into ${placeholder} values, so the SQL files hold no constants. */
final class SqlParams {

    private SqlParams() {
    }

    static Map<String, String> of(ScoringConfig c, XRayProperties props) {
        DataRules r = c.dataRules();
        Map<String, String> m = new HashMap<>();
        m.put("raw_dir", quoteless(props.rawPath().toString()));
        m.put("period_start", YearMonth.parse(c.months().start()).atDay(1).toString());
        m.put("snapshot_date", YearMonth.parse(c.months().end()).plusMonths(1).atDay(1).toString());
        m.put("booked_status", list(c.bookedStatusValues()));
        m.put("cash_types", list(c.cashProductTypes()));
        m.put("semi_liquid_types", list(c.semiLiquidTypes()));
        m.put("flow_class_values", c.flowClasses().entrySet().stream()
                .map(e -> "(" + lit(e.getKey()) + ", " + lit(e.getValue().name()) + ")")
                .collect(Collectors.joining(", ")));
        m.put("default_flow_class", c.defaultFlowClass().name());
        m.put("other_sign_fallback", String.valueOf(c.otherSignFallback()));
        m.put("fx_values", r.fxToEur().entrySet().stream()
                .map(e -> "(" + lit(e.getKey()) + ", " + e.getValue() + ")")
                .collect(Collectors.joining(", ")));
        m.put("tx_amount_eur", amountEur("t.amount", "t.exchange_rate", r));
        m.put("inv_amount_eur", amountEur("ABS(i.amount)", "i.exchange_rate", r));
        m.put("invoice_direction", r.invoiceDirection().name());
        m.put("invoice_issued_sign", String.valueOf(r.invoiceIssuedSign()));
        m.put("invoice_excluded_types", listOrNone(r.invoiceExcludedDocumentTypes()));
        m.put("invoice_excluded_status", listOrNone(r.invoiceExcludedStatusValues()));
        m.put("intragroup_rule", r.intragroupRule().name());
        m.put("intragroup_max_lag_days", String.valueOf(r.intragroupMaxLagDays()));
        return m;
    }

    /** SQL expression for the EUR amount. "fx.rate" is the fx_to_eur row joined on the local currency. */
    static String amountEur(String amount, String rate, DataRules r) {
        String converted = switch (r.fxConvention()) {
            case MULTIPLY -> amount + " * " + rate;
            case DIVIDE -> amount + " / NULLIF(" + rate + ", 0)";
            case NONE -> amount;
        };
        return r.fxTarget() == DataRules.FxTarget.EUR ? "(" + converted + ")" : "(" + converted + ") * fx.rate";
    }

    private static String list(List<String> xs) {
        return xs.stream().map(SqlParams::lit).collect(Collectors.joining(", "));
    }

    /** An empty IN () list is a syntax error; a sentinel that matches nothing is not. */
    private static String listOrNone(List<String> xs) {
        return xs == null || xs.isEmpty() ? "'__none__'" : list(xs);
    }

    private static String lit(String s) {
        return "'" + s.replace("'", "''") + "'";
    }

    private static String quoteless(String s) {
        return s.replace("'", "''");
    }
}
```

- [ ] **Step 3: Create `sql/00_ingest.sql`**

```sql
-- 00_ingest.sql — raw_* views over data/raw/*.csv (SPEC §5.1). Views, not tables: 10_staging reads each CSV once.
CREATE OR REPLACE VIEW raw_groups           AS SELECT * FROM read_csv_auto('${raw_dir}/groups.csv', header = true);
CREATE OR REPLACE VIEW raw_companies        AS SELECT * FROM read_csv_auto('${raw_dir}/companies.csv', header = true);
CREATE OR REPLACE VIEW raw_banking_products AS SELECT * FROM read_csv_auto('${raw_dir}/banking_products.csv', header = true);
CREATE OR REPLACE VIEW raw_debt_products    AS SELECT * FROM read_csv_auto('${raw_dir}/debt_products.csv', header = true);
CREATE OR REPLACE VIEW raw_debt_schedule    AS SELECT * FROM read_csv_auto('${raw_dir}/debt_schedule_config.csv', header = true);
CREATE OR REPLACE VIEW raw_balances         AS SELECT * FROM read_csv_auto('${raw_dir}/balances.csv', header = true);
CREATE OR REPLACE VIEW raw_transactions     AS SELECT * FROM read_csv_auto('${raw_dir}/transactions.csv', header = true);
CREATE OR REPLACE VIEW raw_invoices         AS SELECT * FROM read_csv_auto('${raw_dir}/invoices.csv', header = true);
```

- [ ] **Step 4: Replace the body of `S00_Ingest.java`**

```java
package com.xray.pipeline.stages;

import com.xray.config.XRayProperties;
import com.xray.pipeline.PipelineContext;
import com.xray.pipeline.PipelineStage;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/** sql/00_ingest.sql: raw_* views over the CSVs. */
@Component
@Order(0)
public class S00_Ingest implements PipelineStage {

    private final XRayProperties props;

    public S00_Ingest(XRayProperties props) {
        this.props = props;
    }

    @Override
    public String id() {
        return "S00_INGEST";
    }

    @Override
    public void execute(PipelineContext ctx) {
        if (!RawData.present(props)) {
            ctx.report(id(), 0, "skipped: no CSVs in " + props.rawPath());
            return;
        }
        ctx.sql().runScript("sql/00_ingest.sql", SqlParams.of(ctx.config(), props));
        ctx.report(id(), 5, "raw views ready");
    }
}
```

- [ ] **Step 5: Boot and check**

Run: `cd backend && rm -f ../data/xray.duckdb* && ./mvnw -q spring-boot:run` (stop it with Ctrl+C after the run log).
Expected: log line `S00_INGEST took N ms`, then the run ends `done`. Then:
```bash
cp data/xray.duckdb /tmp/a.duckdb && duckdb /tmp/a.duckdb "SELECT COUNT(*) FROM raw_companies"
```
Expected: `1286`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/xray/pipeline/stages backend/src/main/resources/sql/00_ingest.sql
git commit -m "feat(pipeline): ingest raw csv views with config-driven sql params"
```

---

### Task 4: Staging tables and intragroup tagging

**Files:**
- Create: `backend/src/main/resources/sql/10_staging.sql`
- Create: `backend/src/main/resources/sql/11_intragroup.sql`
- Modify: `backend/src/main/java/com/xray/pipeline/stages/S10_Staging.java`

**Interfaces:**
- Consumes: `raw_*` views, `SqlParams.of`.
- Produces: `fx_to_eur(currency, rate)`, `flow_class_map(category, flow_class)`, `months`, `stg_companies`, `stg_banking_products`, `stg_balances`, `stg_transactions`, `stg_invoices` (overview items 8 and 9), `intragroup_counterparties(company_id, counterparty_id)`.

- [ ] **Step 1: Create `sql/10_staging.sql`**

```sql
-- 10_staging.sql — typed stg_* tables, EUR amounts, flow classes (SPEC §5.1–5.3).
CREATE OR REPLACE TABLE fx_to_eur AS SELECT * FROM (VALUES ${fx_values}) t(currency, rate);
CREATE OR REPLACE TABLE flow_class_map AS SELECT * FROM (VALUES ${flow_class_values}) t(category, flow_class);

CREATE OR REPLACE TABLE months (month_idx INTEGER, month VARCHAR, month_start DATE, month_end DATE);
INSERT INTO months
SELECT CAST(row_number() OVER (ORDER BY d) - 1 AS INTEGER), strftime(d, '%Y-%m'),
       CAST(d AS DATE), CAST(last_day(d) AS DATE)
FROM (SELECT range AS d FROM range(TIMESTAMP '${period_start}', TIMESTAMP '${snapshot_date}', INTERVAL 1 MONTH));

CREATE OR REPLACE TABLE stg_companies (company_id VARCHAR, group_id VARCHAR, currency VARCHAR);
INSERT INTO stg_companies SELECT company_id, group_id, currency FROM raw_companies;

CREATE OR REPLACE TABLE stg_banking_products AS
SELECT product_id, company_id, type, currency FROM raw_banking_products;

CREATE OR REPLACE TABLE stg_balances AS
SELECT b.product_id, b.company_id, CAST(b.date AS DATE) AS snapshot_date,
       TRY_CAST(b.balance AS DOUBLE) AS balance
FROM raw_balances b;

CREATE OR REPLACE TABLE stg_transactions AS
SELECT t.transaction_id, t.company_id, t.product_id,
       CAST(t.date AS DATE) AS date,
       strftime(CAST(t.date AS DATE), '%Y-%m') AS month,
       CAST(t.amount AS DOUBLE) AS amount,
       ${tx_amount_eur} AS amount_eur,
       t.category,
       CASE
         WHEN COALESCE(m.flow_class, '${default_flow_class}') <> 'OTHER' THEN COALESCE(m.flow_class, '${default_flow_class}')
         WHEN ${other_sign_fallback} AND t.amount > 0 THEN 'OPERATING_IN'
         WHEN ${other_sign_fallback} AND t.amount < 0 THEN 'OPERATING_OUT'
         ELSE 'OTHER'
       END AS flow_class,
       t.counterparty_id,
       t.status IN (${booked_status}) AS is_booked,
       FALSE AS is_intragroup
FROM raw_transactions t
JOIN stg_companies c ON c.company_id = t.company_id
LEFT JOIN fx_to_eur fx ON fx.currency = c.currency
LEFT JOIN flow_class_map m ON m.category = t.category
WHERE CAST(t.date AS DATE) >= DATE '${period_start}' AND CAST(t.date AS DATE) <= DATE '${snapshot_date}';

-- Net sign of the counterparty on this company's transactions, for invoice-direction COUNTERPARTY_FLOW.
CREATE OR REPLACE TEMP TABLE cp_sign AS
SELECT company_id, counterparty_id, SIGN(SUM(amount)) AS net_sign
FROM stg_transactions WHERE counterparty_id IS NOT NULL GROUP BY 1, 2;

CREATE OR REPLACE TABLE stg_invoices AS
SELECT i.operation_id, i.company_id,
       CASE
         WHEN '${invoice_direction}' = 'AMOUNT_SIGN'
           THEN CASE WHEN SIGN(i.amount) = ${invoice_issued_sign} THEN 'ISSUED' ELSE 'RECEIVED' END
         ELSE CASE WHEN cp.net_sign > 0 THEN 'ISSUED' WHEN cp.net_sign < 0 THEN 'RECEIVED' END
       END AS direction,
       i.document_type,
       CAST(i.issuance_date AS DATE) AS issuance_date,
       CAST(i.due_date AS DATE) AS due_date,
       CAST(i.payment_date AS DATE) AS payment_date,
       ${inv_amount_eur} AS amount_eur,
       i.counterparty_id,
       FALSE AS is_intragroup
FROM raw_invoices i
LEFT JOIN fx_to_eur fx ON fx.currency = i.accounting_currency
LEFT JOIN cp_sign cp ON cp.company_id = i.company_id AND cp.counterparty_id = i.counterparty_id
WHERE i.document_type NOT IN (${invoice_excluded_types})
  AND i.status NOT IN (${invoice_excluded_status})
  AND i.amount <> 0;

DELETE FROM stg_invoices WHERE direction IS NULL OR amount_eur IS NULL;
```

If Task 1 decided that `fx-target: LOCAL` uses the **product** currency for transactions (not the company currency), change the join `fx.currency = c.currency` to a join on `raw_banking_products.currency` and write that in `DATA_FINDINGS.md` Q4b.

- [ ] **Step 2: Create `sql/11_intragroup.sql`**

```sql
-- 11_intragroup.sql — tag intragroup rows (SPEC §5.4). Rule: scoring.data-rules.intragroup-rule.
-- Company rows keep them (tagged). 25_entity_rollup.sql drops them at group level.

-- Rule COUNTERPARTY_IS_COMPANY: the counterparty is a company of the same group.
UPDATE stg_transactions t SET is_intragroup = TRUE
FROM stg_companies a, stg_companies b
WHERE '${intragroup_rule}' = 'COUNTERPARTY_IS_COMPANY'
  AND a.company_id = t.company_id AND b.company_id = t.counterparty_id AND a.group_id = b.group_id;

-- Rule MIRROR_MATCH: an outflow in one company and the opposite inflow in another company of
-- the same group, within intragroup-max-lag-days. Both sides are tagged.
CREATE OR REPLACE TEMP TABLE mirror_pairs AS
SELECT a.transaction_id AS tx_out, b.transaction_id AS tx_in
FROM stg_transactions a
JOIN stg_companies ca ON ca.company_id = a.company_id
JOIN stg_companies cb ON cb.group_id = ca.group_id AND cb.company_id <> ca.company_id
JOIN stg_transactions b ON b.company_id = cb.company_id
 AND b.amount_eur = -a.amount_eur
 AND ABS(date_diff('day', a.date, b.date)) <= ${intragroup_max_lag_days}
WHERE '${intragroup_rule}' = 'MIRROR_MATCH'
  AND a.amount_eur < 0 AND a.is_booked AND b.is_booked;

UPDATE stg_transactions SET is_intragroup = TRUE
WHERE transaction_id IN (SELECT tx_out FROM mirror_pairs UNION SELECT tx_in FROM mirror_pairs);

-- Counterparties seen on intragroup transactions are intragroup for invoices too.
CREATE OR REPLACE TABLE intragroup_counterparties AS
SELECT DISTINCT company_id, counterparty_id FROM stg_transactions
WHERE is_intragroup AND counterparty_id IS NOT NULL;

UPDATE stg_invoices i SET is_intragroup = TRUE
FROM intragroup_counterparties g
WHERE g.company_id = i.company_id AND g.counterparty_id = i.counterparty_id;
```

- [ ] **Step 3: Replace the body of `S10_Staging.java`**

```java
package com.xray.pipeline.stages;

import com.xray.config.XRayProperties;
import com.xray.pipeline.PipelineContext;
import com.xray.pipeline.PipelineStage;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/** sql/10_staging.sql, sql/11_intragroup.sql, sql/12_balances.sql. */
@Component
@Order(10)
public class S10_Staging implements PipelineStage {

    private static final List<String> SCRIPTS =
            List.of("sql/10_staging.sql", "sql/11_intragroup.sql", "sql/12_balances.sql");

    private final XRayProperties props;

    public S10_Staging(XRayProperties props) {
        this.props = props;
    }

    @Override
    public String id() {
        return "S10_STAGING";
    }

    @Override
    public void execute(PipelineContext ctx) {
        if (!RawData.present(props)) {
            ctx.report(id(), 10, "skipped: no CSVs");
            return;
        }
        Map<String, String> params = SqlParams.of(ctx.config(), props);
        for (String script : SCRIPTS) {
            ctx.report(id(), 10, script);
            ctx.sql().runScript(script, params);
        }
    }
}
```

`12_balances.sql` is created in Task 5. Until then, create it with the two lines `-- 12_balances.sql — Task 5.` and `SELECT 1;` so this task boots. A file with only a comment fails in `jdbc.execute`.

- [ ] **Step 4: Boot and check**

Run the backend as in Task 3 Step 5. Then:
```bash
cp data/xray.duckdb /tmp/a.duckdb
duckdb /tmp/a.duckdb "SELECT COUNT(*), SUM(is_booked::INT), SUM(is_intragroup::INT), SUM((amount_eur IS NULL)::INT) FROM stg_transactions"
duckdb /tmp/a.duckdb "SELECT flow_class, COUNT(*) FROM stg_transactions GROUP BY 1 ORDER BY 2 DESC"
duckdb /tmp/a.duckdb "SELECT direction, is_intragroup, COUNT(*), SUM(amount_eur) FROM stg_invoices GROUP BY ALL"
duckdb /tmp/a.duckdb "SELECT COUNT(*), MIN(month), MAX(month) FROM months"
```
Expected: about 2.55 M transactions, 0 null `amount_eur` (or a count explained in `DATA_FINDINGS.md`), no flow class with a surprising share, both invoice directions present, `24 | 2024-09 | 2026-08`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/sql/10_staging.sql backend/src/main/resources/sql/11_intragroup.sql \
        backend/src/main/resources/sql/12_balances.sql backend/src/main/java/com/xray/pipeline/stages/S10_Staging.java
git commit -m "feat(sql): add staging tables, eur amounts, flow classes and intragroup tags"
```

---

### Task 5: Balance reconstruction

**Files:**
- Modify: `backend/src/main/resources/sql/12_balances.sql`
- Create: `scripts/validate_block2.sql`

**Interfaces:**
- Consumes: `stg_balances`, `stg_banking_products`, `stg_transactions.amount` (native currency), `fx_to_eur`.
- Produces: `daily_product_balance(product_id, company_id, type, date, balance_native, balance_eur)` and the contract table `daily_cash`.

- [ ] **Step 1: Write `sql/12_balances.sql`**

```sql
-- 12_balances.sql — daily balances backwards from the snapshot (SPEC §5.5):
--   balance(d) = B(T) − Σ amount of booked txns on the product with date in (d, T]
-- Native currency first, EUR after, with the static rate of the product currency.
CREATE OR REPLACE TABLE daily_product_balance AS
WITH prod AS (
  SELECT p.product_id, p.company_id, p.type, p.currency, b.snapshot_date, b.balance AS snap
  FROM stg_banking_products p
  JOIN stg_balances b USING (product_id)
  WHERE b.balance IS NOT NULL
    AND (p.type IN (${cash_types}) OR p.type IN (${semi_liquid_types}))),
cal AS (
  SELECT CAST(range AS DATE) AS date
  FROM range(TIMESTAMP '${period_start}', TIMESTAMP '${snapshot_date}' + INTERVAL 1 DAY, INTERVAL 1 DAY)),
tx AS (
  SELECT product_id, date, SUM(amount) AS amt
  FROM stg_transactions WHERE is_booked GROUP BY 1, 2),
grid AS (
  SELECT prod.*, cal.date, COALESCE(tx.amt, 0) AS amt_on_day
  FROM prod CROSS JOIN cal
  LEFT JOIN tx ON tx.product_id = prod.product_id AND tx.date = cal.date AND tx.date <= prod.snapshot_date)
SELECT product_id, company_id, type, date,
       snap - COALESCE(SUM(amt_on_day) OVER (
         PARTITION BY product_id ORDER BY date DESC
         ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS balance_native,
       currency
FROM grid;

ALTER TABLE daily_product_balance ADD COLUMN balance_eur DOUBLE;
UPDATE daily_product_balance d SET balance_eur = d.balance_native * fx.rate
FROM fx_to_eur fx WHERE fx.currency = d.currency;

CREATE OR REPLACE TABLE daily_cash (company_id VARCHAR, date DATE, cash_eur DOUBLE, investment_eur DOUBLE);
INSERT INTO daily_cash
SELECT company_id, date,
       COALESCE(SUM(balance_eur) FILTER (WHERE type IN (${cash_types})), 0),
       COALESCE(SUM(balance_eur) FILTER (WHERE type IN (${semi_liquid_types})), 0)
FROM daily_product_balance
WHERE date < DATE '${snapshot_date}'
GROUP BY 1, 2;
```

- [ ] **Step 2: Create `scripts/validate_block2.sql`**

```sql
-- M1 checks for block 2. Run on a COPY of data/xray.duckdb:
--   cp data/xray.duckdb /tmp/v.duckdb && duckdb /tmp/v.duckdb < scripts/validate_block2.sql
.mode markdown

.print '## V1 reconstructed balance at T equals balances.csv (expect n_mismatch = 0)'
SELECT COUNT(*) AS n_products,
       SUM(CASE WHEN ABS(d.balance_native - b.balance) > 0.01 THEN 1 ELSE 0 END) AS n_mismatch
FROM stg_balances b
JOIN daily_product_balance d ON d.product_id = b.product_id AND d.date = b.snapshot_date;

.print '## V2 products with a snapshot but no reconstruction (expect only non-cash types)'
SELECT p.type, COUNT(*) AS n FROM stg_balances b JOIN stg_banking_products p USING (product_id)
WHERE b.product_id NOT IN (SELECT DISTINCT product_id FROM daily_product_balance)
GROUP BY 1 ORDER BY 2 DESC;

.print '## V3 row counts'
SELECT 'daily_cash' AS t, COUNT(*) AS n FROM daily_cash
UNION ALL SELECT 'monthly_flows', COUNT(*) FROM monthly_flows
UNION ALL SELECT 'monthly_cash', COUNT(*) FROM monthly_cash
UNION ALL SELECT 'monthly_invoices', COUNT(*) FROM monthly_invoices
UNION ALL SELECT 'monthly_counterparty', COUNT(*) FROM monthly_counterparty
UNION ALL SELECT 'debt_snapshot', COUNT(*) FROM debt_snapshot;

.print '## V4 spot check: 3 companies, monthly cash and net operating flow'
WITH pick AS (SELECT company_id FROM stg_companies ORDER BY hash(company_id) LIMIT 3)
SELECT c.entity_id, c.month, ROUND(c.cash_eom) AS cash_eom, ROUND(c.cash_min) AS cash_min, c.neg_days,
       ROUND(SUM(f.inflow_eur - f.outflow_eur) FILTER (WHERE f.flow_class IN ('OPERATING_IN','OPERATING_OUT','TAX'))) AS nocf
FROM monthly_cash c
LEFT JOIN monthly_flows f ON f.entity_type = c.entity_type AND f.entity_id = c.entity_id AND f.month = c.month
WHERE c.entity_type = 'COMPANY' AND c.entity_id IN (SELECT company_id FROM pick)
GROUP BY ALL ORDER BY 1, 2;
```

- [ ] **Step 3: Boot, then run V1 and V2**

Run the backend as in Task 3 Step 5. Then:
```bash
cp data/xray.duckdb /tmp/v.duckdb && duckdb /tmp/v.duckdb < scripts/validate_block2.sql 2>&1 | head -30
```
Expected: V1 `n_mismatch = 0`. V2 lists only types outside `cash-product-types` and `semi-liquid-types` (for example `card`). V3 fails on the monthly tables until Task 7: this is expected now.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/resources/sql/12_balances.sql scripts/validate_block2.sql
git commit -m "feat(sql): reconstruct daily balances backwards from the snapshot"
```

---

### Task 6: Monthly flows and monthly cash

**Files:**
- Create: `backend/src/main/resources/sql/20_monthly_flows.sql`
- Create: `backend/src/main/resources/sql/21_monthly_cash.sql`
- Create: `backend/src/main/java/com/xray/pipeline/stages/S20_MonthlyAggregates.java`

**Interfaces:**
- Consumes: `stg_transactions`, `daily_cash`, `months`.
- Produces: contract tables `monthly_flows`, `monthly_cash` (company rows). Stage id `S20_MONTHLY`, `@Order(20)`.

- [ ] **Step 1: Create `sql/20_monthly_flows.sql`**

```sql
-- 20_monthly_flows.sql — company rows only; 25_entity_rollup.sql adds groups.
CREATE OR REPLACE TABLE monthly_flows (
  entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, flow_class VARCHAR, is_intragroup BOOLEAN,
  inflow_eur DOUBLE, outflow_eur DOUBLE, n_txn BIGINT);

INSERT INTO monthly_flows
SELECT 'COMPANY', t.company_id, t.month, t.flow_class, t.is_intragroup,
       SUM(CASE WHEN t.amount_eur > 0 THEN t.amount_eur ELSE 0 END),
       SUM(CASE WHEN t.amount_eur < 0 THEN -t.amount_eur ELSE 0 END),
       COUNT(*)
FROM stg_transactions t
WHERE t.is_booked AND t.amount_eur IS NOT NULL AND t.month IN (SELECT month FROM months)
GROUP BY ALL;
```

- [ ] **Step 2: Create `sql/21_monthly_cash.sql`**

```sql
-- 21_monthly_cash.sql — end-of-month, minimum intra-month and negative days from daily_cash.
CREATE OR REPLACE TABLE monthly_cash (
  entity_type VARCHAR, entity_id VARCHAR, month VARCHAR,
  cash_eom DOUBLE, cash_min DOUBLE, neg_days INTEGER, investment_eom DOUBLE);

INSERT INTO monthly_cash
SELECT 'COMPANY', company_id, strftime(date, '%Y-%m'),
       arg_max(cash_eur, date), MIN(cash_eur),
       CAST(COUNT(*) FILTER (WHERE cash_eur < 0) AS INTEGER),
       arg_max(investment_eur, date)
FROM daily_cash
GROUP BY 1, 2, 3;
```

- [ ] **Step 3: Create `S20_MonthlyAggregates.java`**

```java
package com.xray.pipeline.stages;

import com.xray.config.XRayProperties;
import com.xray.pipeline.PipelineContext;
import com.xray.pipeline.PipelineStage;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/** sql/20_* … sql/24_*: company-level monthly contract tables. */
@Component
@Order(20)
public class S20_MonthlyAggregates implements PipelineStage {

    private static final List<String> SCRIPTS = List.of(
            "sql/20_monthly_flows.sql", "sql/21_monthly_cash.sql", "sql/22_monthly_invoices.sql",
            "sql/23_monthly_counterparty.sql", "sql/24_debt_snapshot.sql");

    private final XRayProperties props;

    public S20_MonthlyAggregates(XRayProperties props) {
        this.props = props;
    }

    @Override
    public String id() {
        return "S20_MONTHLY";
    }

    @Override
    public void execute(PipelineContext ctx) {
        if (!RawData.present(props)) {
            ctx.report(id(), 20, "skipped: no CSVs");
            return;
        }
        Map<String, String> params = SqlParams.of(ctx.config(), props);
        for (String script : SCRIPTS) {
            ctx.report(id(), 20, script);
            ctx.sql().runScript(script, params);
        }
    }
}
```

Create `22_monthly_invoices.sql`, `23_monthly_counterparty.sql` and `24_debt_snapshot.sql` now with the two lines `-- Task 7.` and `SELECT 1;` so this task boots. Task 7 replaces them.

- [ ] **Step 4: Boot and check**

Run the backend as in Task 3 Step 5. Then:
```bash
cp data/xray.duckdb /tmp/a.duckdb
duckdb /tmp/a.duckdb "SELECT COUNT(DISTINCT entity_id), COUNT(DISTINCT month) FROM monthly_flows"
duckdb /tmp/a.duckdb "SELECT COUNT(DISTINCT entity_id), MIN(month), MAX(month), SUM(neg_days) FROM monthly_cash"
```
Expected: about 1,286 companies and 24 months in `monthly_flows`. `monthly_cash` months `2024-09 … 2026-08`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/sql/2*.sql backend/src/main/java/com/xray/pipeline/stages/S20_MonthlyAggregates.java
git commit -m "feat(sql): add monthly flows and monthly cash at company level"
```

---

### Task 7: Monthly invoices, counterparties and debt snapshot

**Files:**
- Modify: `backend/src/main/resources/sql/22_monthly_invoices.sql`
- Modify: `backend/src/main/resources/sql/23_monthly_counterparty.sql`
- Modify: `backend/src/main/resources/sql/24_debt_snapshot.sql`

**Interfaces:**
- Consumes: `stg_invoices`, `stg_transactions`, `raw_debt_products`, `raw_debt_schedule`, `fx_to_eur`, `months`.
- Produces: contract tables `monthly_invoices`, `monthly_counterparty`, `debt_snapshot` (company rows).

- [ ] **Step 1: Write `sql/22_monthly_invoices.sql`**

Overdue at end of month uses `payment_date`, never `pending_amount` (SPEC §5.6: pending is as of extraction).

```sql
-- 22_monthly_invoices.sql — summable invoice components per company, month, direction.
CREATE OR REPLACE TABLE monthly_invoices (
  entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, direction VARCHAR, is_intragroup BOOLEAN,
  new_eur DOUBLE, n_new BIGINT,
  paid_eur DOUBLE, n_paid BIGINT, paid_days_x_eur DOUBLE, paid_late_days_x_eur DOUBLE,
  open_eur DOUBLE, due_90d_unpaid_eur DOUBLE,
  overdue_eur DOUBLE, overdue_0_30_eur DOUBLE, overdue_31_60_eur DOUBLE,
  overdue_61_90_eur DOUBLE, overdue_90p_eur DOUBLE);

INSERT INTO monthly_invoices
WITH x AS (
  SELECT i.company_id, i.direction, i.is_intragroup, i.amount_eur,
         i.issuance_date, i.due_date, i.payment_date, m.month, m.month_start, m.month_end,
         i.issuance_date >= m.month_start AS is_new,
         i.payment_date BETWEEN m.month_start AND m.month_end AS is_paid,
         (i.payment_date IS NULL OR i.payment_date > m.month_end) AS is_open,
         date_diff('day', i.due_date, m.month_end) AS days_overdue
  FROM stg_invoices i
  JOIN months m
    ON i.issuance_date <= m.month_end
   AND (i.payment_date IS NULL OR i.payment_date >= m.month_start))
SELECT 'COMPANY', company_id, month, direction, is_intragroup,
       COALESCE(SUM(amount_eur) FILTER (WHERE is_new), 0),
       COUNT(*) FILTER (WHERE is_new),
       COALESCE(SUM(amount_eur) FILTER (WHERE is_paid), 0),
       COUNT(*) FILTER (WHERE is_paid),
       COALESCE(SUM(amount_eur * date_diff('day', issuance_date, payment_date)) FILTER (WHERE is_paid), 0),
       COALESCE(SUM(amount_eur * GREATEST(0, date_diff('day', due_date, payment_date))) FILTER (WHERE is_paid), 0),
       COALESCE(SUM(amount_eur) FILTER (WHERE is_open), 0),
       COALESCE(SUM(amount_eur) FILTER (WHERE is_open AND due_date <= month_end + INTERVAL 90 DAY), 0),
       COALESCE(SUM(amount_eur) FILTER (WHERE is_open AND days_overdue > 0), 0),
       COALESCE(SUM(amount_eur) FILTER (WHERE is_open AND days_overdue BETWEEN 1 AND 30), 0),
       COALESCE(SUM(amount_eur) FILTER (WHERE is_open AND days_overdue BETWEEN 31 AND 60), 0),
       COALESCE(SUM(amount_eur) FILTER (WHERE is_open AND days_overdue BETWEEN 61 AND 90), 0),
       COALESCE(SUM(amount_eur) FILTER (WHERE is_open AND days_overdue > 90), 0)
FROM x
GROUP BY 1, 2, 3, 4, 5;
```

- [ ] **Step 2: Write `sql/23_monthly_counterparty.sql`**

```sql
-- 23_monthly_counterparty.sql — operating flows by counterparty, for HHI and churn (Block 3).
CREATE OR REPLACE TABLE monthly_counterparty (
  entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, counterparty_id VARCHAR,
  direction VARCHAR, is_intragroup BOOLEAN, amount_eur DOUBLE, n_txn BIGINT);

INSERT INTO monthly_counterparty
SELECT 'COMPANY', company_id, month, counterparty_id,
       CASE WHEN flow_class = 'OPERATING_IN' THEN 'IN' ELSE 'OUT' END,
       is_intragroup, SUM(ABS(amount_eur)), COUNT(*)
FROM stg_transactions
WHERE is_booked AND counterparty_id IS NOT NULL AND amount_eur IS NOT NULL
  AND flow_class IN ('OPERATING_IN', 'OPERATING_OUT')
  AND month IN (SELECT month FROM months)
GROUP BY 1, 2, 3, 4, 5, 6;
```

- [ ] **Step 3: Write `sql/24_debt_snapshot.sql`**

Q11 decides the sign. The raw file stores `outstanding` as negative numbers, so this file uses `ABS`. If Q11 shows mixed signs with a meaning, write it in `DATA_FINDINGS.md` and change the expression.

```sql
-- 24_debt_snapshot.sql — static debt as of the snapshot, positive magnitudes in EUR.
CREATE OR REPLACE TABLE debt_snapshot (
  entity_type VARCHAR, entity_id VARCHAR, debt_type VARCHAR, n_products BIGINT,
  granted_eur DOUBLE, outstanding_eur DOUBLE, liquidity_eur DOUBLE,
  rated_outstanding_eur DOUBLE, rate_x_outstanding_eur DOUBLE);

INSERT INTO debt_snapshot
WITH d AS (
  SELECT p.company_id, p.type,
         ABS(TRY_CAST(p.granted AS DOUBLE)) * fx.rate AS granted_eur,
         ABS(TRY_CAST(p.outstanding AS DOUBLE)) * fx.rate AS outstanding_eur,
         ABS(TRY_CAST(p.liquidity AS DOUBLE)) * fx.rate AS liquidity_eur,
         TRY_CAST(s.annual_interest_rate_or_spread AS DOUBLE) AS rate
  FROM raw_debt_products p
  LEFT JOIN raw_debt_schedule s USING (product_id)
  LEFT JOIN fx_to_eur fx ON fx.currency = p.currency)
SELECT 'COMPANY', company_id, type, COUNT(*),
       SUM(granted_eur), SUM(outstanding_eur), SUM(liquidity_eur),
       SUM(outstanding_eur) FILTER (WHERE rate IS NOT NULL),
       SUM(outstanding_eur * rate) FILTER (WHERE rate IS NOT NULL)
FROM d
GROUP BY 1, 2, 3;
```

- [ ] **Step 4: Boot and run the full validation**

Run the backend as in Task 3 Step 5. Then:
```bash
cp data/xray.duckdb /tmp/v.duckdb && duckdb /tmp/v.duckdb < scripts/validate_block2.sql
duckdb /tmp/v.duckdb "SELECT direction, SUM(paid_days_x_eur)/SUM(paid_eur) AS avg_days, SUM(overdue_90p_eur)/NULLIF(SUM(overdue_eur),0) AS share_90p FROM monthly_invoices GROUP BY 1"
```
Expected: V1 `n_mismatch = 0`, every V3 table has rows, V4 prints 3 companies × 24 months with plausible numbers. Average paid days between 10 and 150 for each direction.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/sql/22_monthly_invoices.sql backend/src/main/resources/sql/23_monthly_counterparty.sql backend/src/main/resources/sql/24_debt_snapshot.sql
git commit -m "feat(sql): add monthly invoices, counterparty flows and debt snapshot"
```

---

### Task 8: Record timings and close the findings

**Files:**
- Modify: `docs/DATA_FINDINGS.md`

- [ ] **Step 1: Measure a clean run**

```bash
rm -f data/xray.duckdb data/xray.duckdb.wal
cd backend && ./mvnw -q spring-boot:run   # in a second shell: curl -s localhost:8080/api/pipeline/status
```
Expected: state `DONE`. Copy `stageTimingsMs`.

- [ ] **Step 2: Add a "Block 2 run" section to `docs/DATA_FINDINGS.md`**

Write: stage timings, row counts from V3, the V1 result, the V4 spot-check summary (one line per company), and every open question for Block 3 (for example Q6 monthly line utilization, entities with < 12 months of history).

- [ ] **Step 3: Run the tests**

Run: `cd backend && ./mvnw -q test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/DATA_FINDINGS.md
git commit -m "docs(data): record block 2 run timings and validation"
```
