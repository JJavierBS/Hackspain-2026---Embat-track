# Phase 2 · Plan B — Rollup, Panel, Result Writer, Quantiles Implementation Plan

> **For agentic workers:** Claude Code: use superpowers:executing-plans (or superpowers:subagent-driven-development) to run this plan task by task. Antigravity or other agents: do the checkboxes in order. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the company → group rollup, the in-memory panel and its loader, the DuckDB Appender result writer and the reference quantiles, so that Block 3 only adds indicator SQL files.

**Architecture:** `25_entity_rollup.sql` builds `entities` and appends `GROUP` rows to the monthly contract tables by summing company components with intragroup rows removed, then recomputing nothing (ratios are computed later from the sums). `S30_RawIndicators` creates `indicator_values_raw`, runs every `sql/3[0-8]_*.sql` file it finds, and loads one `EntityPanel` for each entity of the active unit. `ResultWriter` drops, recreates and bulk-loads a results table with the DuckDB Appender. `S95_Quantiles` writes `threshold_quantiles` for the active unit (reference only, never read by scoring).

**Tech Stack:** Java 21, Spring Boot 3.5, DuckDB JDBC 1.5.5.1 (`org.duckdb.DuckDBAppender`), JUnit 5.

**Spec:** `docs/SPEC.md` §3.1, §5.4, §6.1, §12.4. `docs/ARCHITECTURE.md` §4.1, §4.2, §4.4, §5, §7, §9. Shared contract and path ownership: `docs/superpowers/plans/2026-09-19-phase2-overview.md`. Read the overview before Task 1.

## Global Constraints

- Edit only the paths that the overview gives to plan B.
- Java 21. If `java -version` is not 21, run Maven as `mise exec java@temurin-21 -- ./mvnw ...`.
- No JPA, no Lombok, no new Maven dependency.
- `domain/` imports nothing from `org.springframework` or `java.sql`.
- Never average a ratio across companies. Group rows sum components (`CLAUDE.md` rule 4).
- Contract tables use the DDL of overview items 8 and 10 **exactly**.
- Only the six tests in `CLAUDE.md` may exist in the repository. This plan adds `RollupTest`. Task 5 uses a scratch test that you **delete before the commit**.
- Do not change `PipelineContext`'s constructor. `PipelineRunner` belongs to nobody in this phase.
- Commits: Conventional Commits, English, lowercase subject. Commit after each task.
- This branch has no plan A SQL. On this branch `S25` and `S30` skip because the monthly tables do not exist. The full run is checked after the merge (overview step 6).

## File Structure

```
backend/src/main/java/com/xray/
  domain/model/Month.java             YYYY-MM value object
  domain/model/EntityKey.java         (EntityType, id)
  domain/model/RawIndicator.java      value + flags
  domain/model/EntityPanel.java       in-memory unit of work (raw only in phase 2)
  domain/service/CausalWindow.java    window indices (ARCHITECTURE §4.4)
  infrastructure/duckdb/DuckDbTables.java   table existence check
  infrastructure/duckdb/ResultWriter.java   Appender bulk writer
  infrastructure/duckdb/PanelLoader.java    indicator_values_raw → List<EntityPanel>
  pipeline/PipelineContext.java       + panels
  pipeline/stages/S25_EntityRollup.java
  pipeline/stages/S30_RawIndicators.java
  pipeline/stages/S95_Quantiles.java
backend/src/main/resources/sql/
  25_entity_rollup.sql
  29_indicator_values_raw.sql
  90_threshold_quantiles.sql
backend/src/test/java/com/xray/pipeline/RollupTest.java
```

---

### Task 1: Domain model for the panel

**Files:**
- Create: `backend/src/main/java/com/xray/domain/model/Month.java`
- Create: `backend/src/main/java/com/xray/domain/model/EntityKey.java`
- Create: `backend/src/main/java/com/xray/domain/model/RawIndicator.java`
- Create: `backend/src/main/java/com/xray/domain/model/EntityPanel.java`
- Create: `backend/src/main/java/com/xray/domain/service/CausalWindow.java`

**Interfaces:**
- Produces:
  - `Month.parse(String)`, `Month.range(Month from, Month to)` → `List<Month>`, `Month.plus(int)`, `Month.monthsSince(Month)`, `toString()` → `"YYYY-MM"`
  - `EntityKey(EntityType type, String id)`
  - `RawIndicator(IndicatorId id, Double value, boolean available, boolean isStatic, boolean fallback)`, `RawIndicator.missing(IndicatorId)`
  - `new EntityPanel(EntityKey, List<Month>)`, `key()`, `months()`, `size()`, `raw(IndicatorId, int m)`, `rawSeries(IndicatorId)`, `setRaw(int m, RawIndicator)`
  - `CausalWindow.window(int m, int size)` → `int[]{start, m}`

- [ ] **Step 1: Create `Month.java`**

```java
package com.xray.domain.model;

import java.util.ArrayList;
import java.util.List;

/** A calendar month, printed as YYYY-MM. M00 = 2024-09 … M23 = 2026-08. */
public record Month(int year, int month) implements Comparable<Month> {

    public Month {
        if (month < 1 || month > 12) {
            throw new IllegalArgumentException("month out of range: " + month);
        }
    }

    public static Month parse(String s) {
        String[] p = s.split("-");
        if (p.length != 2) {
            throw new IllegalArgumentException("expected YYYY-MM, got " + s);
        }
        return new Month(Integer.parseInt(p[0]), Integer.parseInt(p[1]));
    }

    /** Inclusive on both ends. */
    public static List<Month> range(Month from, Month to) {
        List<Month> out = new ArrayList<>();
        for (Month m = from; m.compareTo(to) <= 0; m = m.plus(1)) {
            out.add(m);
        }
        return List.copyOf(out);
    }

    public Month plus(int n) {
        int t = year * 12 + (month - 1) + n;
        return new Month(Math.floorDiv(t, 12), Math.floorMod(t, 12) + 1);
    }

    public int monthsSince(Month other) {
        return (year * 12 + month) - (other.year * 12 + other.month);
    }

    @Override
    public int compareTo(Month o) {
        return Integer.compare(monthsSince(o), 0);
    }

    @Override
    public String toString() {
        return String.format("%04d-%02d", year, month);
    }
}
```

- [ ] **Step 2: Create `EntityKey.java` and `RawIndicator.java`**

```java
package com.xray.domain.model;

public record EntityKey(EntityType type, String id) {
}
```

```java
package com.xray.domain.model;

/** One raw indicator value for one entity-month, straight from indicator_values_raw (ARCHITECTURE §4.2). */
public record RawIndicator(
        IndicatorId id,
        Double value,        // null = not computable this month
        boolean available,
        boolean isStatic,    // snapshot-derived (SPEC §0.2 exception)
        boolean fallback) {  // e.g. ACT_COLLECTIONS_GROWTH before M14

    public static RawIndicator missing(IndicatorId id) {
        return new RawIndicator(id, null, false, false, false);
    }
}
```

- [ ] **Step 3: Create `EntityPanel.java`**

Later blocks add sub-scores, categories, profile scores, contributions and alerts (ARCHITECTURE §4.2). Phase 2 holds the raw values only.

```java
package com.xray.domain.model;

import java.util.Arrays;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * The in-memory unit of work: one entity, every month, every indicator (ARCHITECTURE §4.2).
 * Loaded once by S30, enriched in place by later stages. A stage that works on month m reads only 0..m.
 */
public final class EntityPanel {

    private final EntityKey key;
    private final List<Month> months;
    private final Map<IndicatorId, RawIndicator[]> raw = new EnumMap<>(IndicatorId.class);

    public EntityPanel(EntityKey key, List<Month> months) {
        this.key = key;
        this.months = List.copyOf(months);
        for (IndicatorId id : IndicatorId.values()) {
            RawIndicator[] series = new RawIndicator[months.size()];
            Arrays.fill(series, RawIndicator.missing(id));
            raw.put(id, series);
        }
    }

    public EntityKey key() {
        return key;
    }

    public List<Month> months() {
        return months;
    }

    public int size() {
        return months.size();
    }

    public RawIndicator raw(IndicatorId id, int m) {
        return raw.get(id)[m];
    }

    /** The live array, indexed by month ordinal. Callers must respect causality. */
    public RawIndicator[] rawSeries(IndicatorId id) {
        return raw.get(id);
    }

    public void setRaw(int m, RawIndicator value) {
        raw.get(value.id())[m] = value;
    }
}
```

- [ ] **Step 4: Create `CausalWindow.java`**

```java
package com.xray.domain.service;

/** Window indices for month ordinal m. Every Java stage that walks months uses this (ARCHITECTURE §4.4). */
public interface CausalWindow {

    /** Returns indices [start, m] for a window of `size` months ending at m. */
    static int[] window(int m, int size) {
        return new int[]{Math.max(0, m - size + 1), m};
    }
}
```

- [ ] **Step 5: Compile**

Run: `cd backend && ./mvnw -q compile`
Expected: BUILD SUCCESS, no output.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/xray/domain
git commit -m "feat(domain): add month, entity key, raw indicator, panel and causal window"
```

---

### Task 2: Entity rollup with `RollupTest`

**Files:**
- Test: `backend/src/test/java/com/xray/pipeline/RollupTest.java`
- Create: `backend/src/main/resources/sql/25_entity_rollup.sql`
- Create: `backend/src/main/java/com/xray/infrastructure/duckdb/DuckDbTables.java`
- Create: `backend/src/main/java/com/xray/pipeline/stages/S25_EntityRollup.java`

**Interfaces:**
- Consumes: contract tables of overview item 8 (company rows written by plan A).
- Produces:
  - Table `entities(entity_type, entity_id, group_id)`: every company and every group.
  - `GROUP` rows in `monthly_flows`, `monthly_cash`, `monthly_invoices`, `monthly_counterparty`, `debt_snapshot`.
  - `DuckDbTables.exists(SqlRunner sql, String table)` → `boolean`
  - Stage id `S25_ROLLUP`, `@Order(25)`.

- [ ] **Step 1: Write the failing test**

The fixture is the example of ARCHITECTURE §5: a 10 M€ subsidiary at DSO 30 and a 100 k€ one at DSO 120 give a group DSO near 31, not 75. It also checks that intragroup rows are removed and that the group minimum cash comes from the summed daily balances, not from the sum of company minimums.

```java
package com.xray.pipeline;

import com.xray.infrastructure.duckdb.DuckDbDataSource;
import com.xray.infrastructure.duckdb.DuckDbSqlRunner;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** A hand-built 2-company group: group ratios come from summed components (ARCHITECTURE §9). */
class RollupTest {

    /** Verbatim copy of overview contract item 8. */
    private static final List<String> CONTRACT_DDL = List.of(
            "CREATE OR REPLACE TABLE stg_companies (company_id VARCHAR, group_id VARCHAR, currency VARCHAR)",
            "CREATE OR REPLACE TABLE months (month_idx INTEGER, month VARCHAR, month_start DATE, month_end DATE)",
            "CREATE OR REPLACE TABLE daily_cash (company_id VARCHAR, date DATE, cash_eur DOUBLE, investment_eur DOUBLE)",
            """
            CREATE OR REPLACE TABLE monthly_flows (
              entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, flow_class VARCHAR, is_intragroup BOOLEAN,
              inflow_eur DOUBLE, outflow_eur DOUBLE, n_txn BIGINT)""",
            """
            CREATE OR REPLACE TABLE monthly_cash (
              entity_type VARCHAR, entity_id VARCHAR, month VARCHAR,
              cash_eom DOUBLE, cash_min DOUBLE, neg_days INTEGER, investment_eom DOUBLE)""",
            """
            CREATE OR REPLACE TABLE monthly_invoices (
              entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, direction VARCHAR, is_intragroup BOOLEAN,
              new_eur DOUBLE, n_new BIGINT,
              paid_eur DOUBLE, n_paid BIGINT, paid_days_x_eur DOUBLE, paid_late_days_x_eur DOUBLE,
              open_eur DOUBLE, due_90d_unpaid_eur DOUBLE,
              overdue_eur DOUBLE, overdue_0_30_eur DOUBLE, overdue_31_60_eur DOUBLE,
              overdue_61_90_eur DOUBLE, overdue_90p_eur DOUBLE)""",
            """
            CREATE OR REPLACE TABLE monthly_counterparty (
              entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, counterparty_id VARCHAR,
              direction VARCHAR, is_intragroup BOOLEAN, amount_eur DOUBLE, n_txn BIGINT)""",
            """
            CREATE OR REPLACE TABLE debt_snapshot (
              entity_type VARCHAR, entity_id VARCHAR, debt_type VARCHAR, n_products BIGINT,
              granted_eur DOUBLE, outstanding_eur DOUBLE, liquidity_eur DOUBLE,
              rated_outstanding_eur DOUBLE, rate_x_outstanding_eur DOUBLE)""");

    private static DuckDbDataSource ds;
    private static JdbcTemplate jdbc;

    @BeforeAll
    static void buildGroupAndRollUp() throws Exception {
        ds = new DuckDbDataSource("jdbc:duckdb:");
        jdbc = new JdbcTemplate(ds);
        CONTRACT_DDL.forEach(jdbc::execute);

        jdbc.execute("INSERT INTO stg_companies VALUES ('COMP_A','GROUP_T','EUR'), ('COMP_B','GROUP_T','EUR')");

        // Receivables paid in 2025-01: A 10 M€ at 30 days, B 100 k€ at 120 days.
        // A also has a 1 M€ intragroup invoice at 300 days, which must not count.
        jdbc.execute("""
            INSERT INTO monthly_invoices (entity_type, entity_id, month, direction, is_intragroup, paid_eur, paid_days_x_eur) VALUES
              ('COMPANY','COMP_A','2025-01','ISSUED',FALSE,10000000, 300000000),
              ('COMPANY','COMP_B','2025-01','ISSUED',FALSE,  100000,  12000000),
              ('COMPANY','COMP_A','2025-01','ISSUED',TRUE,  1000000, 300000000)""");

        // Operating outflows: A pays 500 to B (intragroup) plus 1000 to a supplier; B pays 200.
        jdbc.execute("""
            INSERT INTO monthly_flows VALUES
              ('COMPANY','COMP_A','2025-01','OPERATING_OUT',FALSE,0,1000,3),
              ('COMPANY','COMP_A','2025-01','OPERATING_OUT',TRUE, 0, 500,1),
              ('COMPANY','COMP_B','2025-01','OPERATING_OUT',FALSE,0, 200,2)""");

        // Daily cash: A 100 then -50, B -20 then 200. Group days: 80, 150. Sum of minimums would be -70.
        jdbc.execute("""
            INSERT INTO daily_cash VALUES
              ('COMP_A', DATE '2025-01-30', 100, 0), ('COMP_A', DATE '2025-01-31', -50, 0),
              ('COMP_B', DATE '2025-01-30', -20, 0), ('COMP_B', DATE '2025-01-31', 200, 0)""");

        jdbc.execute("""
            INSERT INTO debt_snapshot VALUES
              ('COMPANY','COMP_A','loan',1,NULL,300,NULL,300,12),
              ('COMPANY','COMP_B','loan',1,NULL,100,NULL,NULL,NULL)""");

        new DuckDbSqlRunner(jdbc).runScript("sql/25_entity_rollup.sql", Map.of());
    }

    @AfterAll
    static void close() throws Exception {
        ds.close();
    }

    @Test
    void groupDsoIsAmountWeightedNotTheMeanOfCompanyDsos() {
        Double dso = jdbc.queryForObject("""
            SELECT paid_days_x_eur / paid_eur FROM monthly_invoices
            WHERE entity_type = 'GROUP' AND entity_id = 'GROUP_T' AND month = '2025-01' AND direction = 'ISSUED'""",
                Double.class);
        assertEquals(312_000_000.0 / 10_100_000.0, dso, 1e-9);   // ≈ 30.89
        assertTrue(dso < 31.0, "mean of ratios would be 75");
    }

    @Test
    void intragroupFlowsAreRemovedAtGroupLevel() {
        Double out = jdbc.queryForObject("""
            SELECT SUM(outflow_eur) FROM monthly_flows
            WHERE entity_type = 'GROUP' AND entity_id = 'GROUP_T' AND flow_class = 'OPERATING_OUT'""", Double.class);
        assertEquals(1200.0, out, 1e-9);
        Long intragroupRows = jdbc.queryForObject(
                "SELECT COUNT(*) FROM monthly_flows WHERE entity_type = 'GROUP' AND is_intragroup", Long.class);
        assertEquals(0L, intragroupRows);
    }

    @Test
    void groupMinimumCashComesFromSummedDailyBalances() {
        Map<String, Object> row = jdbc.queryForMap("""
            SELECT cash_eom, cash_min, neg_days FROM monthly_cash
            WHERE entity_type = 'GROUP' AND entity_id = 'GROUP_T' AND month = '2025-01'""");
        assertEquals(150.0, ((Number) row.get("cash_eom")).doubleValue(), 1e-9);
        assertEquals(80.0, ((Number) row.get("cash_min")).doubleValue(), 1e-9);
        assertEquals(0, ((Number) row.get("neg_days")).intValue());
    }

    @Test
    void groupDebtSumsOutstandingAndKeepsTheRateComponents() {
        Map<String, Object> row = jdbc.queryForMap("""
            SELECT outstanding_eur, rated_outstanding_eur, rate_x_outstanding_eur FROM debt_snapshot
            WHERE entity_type = 'GROUP' AND entity_id = 'GROUP_T' AND debt_type = 'loan'""");
        assertEquals(400.0, ((Number) row.get("outstanding_eur")).doubleValue(), 1e-9);
        assertEquals(300.0, ((Number) row.get("rated_outstanding_eur")).doubleValue(), 1e-9);
        assertEquals(12.0, ((Number) row.get("rate_x_outstanding_eur")).doubleValue(), 1e-9);
    }

    @Test
    void everyCompanyAndGroupIsAnEntity() {
        Long companies = jdbc.queryForObject("SELECT COUNT(*) FROM entities WHERE entity_type = 'COMPANY'", Long.class);
        Long groups = jdbc.queryForObject("SELECT COUNT(*) FROM entities WHERE entity_type = 'GROUP'", Long.class);
        assertEquals(2L, companies);
        assertEquals(1L, groups);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && ./mvnw -q test -Dtest=RollupTest`
Expected: FAIL in `@BeforeAll` with `UncheckedIOException: Cannot read sql/25_entity_rollup.sql`.

- [ ] **Step 3: Create `sql/25_entity_rollup.sql`**

```sql
-- 25_entity_rollup.sql — company → group (SPEC §3.1, ARCHITECTURE §5).
-- Group rows SUM company components with intragroup rows removed. Never average a ratio.
-- Idempotent: deletes the GROUP rows first.

CREATE OR REPLACE TABLE entities (entity_type VARCHAR, entity_id VARCHAR, group_id VARCHAR);
INSERT INTO entities
SELECT 'COMPANY', company_id, group_id FROM stg_companies
UNION ALL
SELECT DISTINCT 'GROUP', group_id, group_id FROM stg_companies;

DELETE FROM monthly_flows WHERE entity_type = 'GROUP';
INSERT INTO monthly_flows (entity_type, entity_id, month, flow_class, is_intragroup, inflow_eur, outflow_eur, n_txn)
SELECT 'GROUP', c.group_id, f.month, f.flow_class, FALSE,
       SUM(f.inflow_eur), SUM(f.outflow_eur), SUM(f.n_txn)
FROM monthly_flows f
JOIN stg_companies c ON c.company_id = f.entity_id
WHERE f.entity_type = 'COMPANY' AND NOT f.is_intragroup
GROUP BY c.group_id, f.month, f.flow_class;

-- Cash: sum the daily balances first, then take eom / min / negative days of the group series.
DELETE FROM monthly_cash WHERE entity_type = 'GROUP';
INSERT INTO monthly_cash (entity_type, entity_id, month, cash_eom, cash_min, neg_days, investment_eom)
WITH g AS (
  SELECT c.group_id, d.date, SUM(d.cash_eur) AS cash_eur, SUM(d.investment_eur) AS investment_eur
  FROM daily_cash d JOIN stg_companies c ON c.company_id = d.company_id
  GROUP BY c.group_id, d.date)
SELECT 'GROUP', group_id, strftime(date, '%Y-%m'),
       arg_max(cash_eur, date), MIN(cash_eur),
       CAST(COUNT(*) FILTER (WHERE cash_eur < 0) AS INTEGER),
       arg_max(investment_eur, date)
FROM g
GROUP BY group_id, strftime(date, '%Y-%m');

DELETE FROM monthly_invoices WHERE entity_type = 'GROUP';
INSERT INTO monthly_invoices (entity_type, entity_id, month, direction, is_intragroup,
  new_eur, n_new, paid_eur, n_paid, paid_days_x_eur, paid_late_days_x_eur,
  open_eur, due_90d_unpaid_eur, overdue_eur, overdue_0_30_eur, overdue_31_60_eur,
  overdue_61_90_eur, overdue_90p_eur)
SELECT 'GROUP', c.group_id, i.month, i.direction, FALSE,
       SUM(i.new_eur), SUM(i.n_new), SUM(i.paid_eur), SUM(i.n_paid),
       SUM(i.paid_days_x_eur), SUM(i.paid_late_days_x_eur),
       SUM(i.open_eur), SUM(i.due_90d_unpaid_eur), SUM(i.overdue_eur),
       SUM(i.overdue_0_30_eur), SUM(i.overdue_31_60_eur),
       SUM(i.overdue_61_90_eur), SUM(i.overdue_90p_eur)
FROM monthly_invoices i
JOIN stg_companies c ON c.company_id = i.entity_id
WHERE i.entity_type = 'COMPANY' AND NOT i.is_intragroup
GROUP BY c.group_id, i.month, i.direction;

DELETE FROM monthly_counterparty WHERE entity_type = 'GROUP';
INSERT INTO monthly_counterparty (entity_type, entity_id, month, counterparty_id, direction, is_intragroup, amount_eur, n_txn)
SELECT 'GROUP', c.group_id, p.month, p.counterparty_id, p.direction, FALSE,
       SUM(p.amount_eur), SUM(p.n_txn)
FROM monthly_counterparty p
JOIN stg_companies c ON c.company_id = p.entity_id
WHERE p.entity_type = 'COMPANY' AND NOT p.is_intragroup
GROUP BY c.group_id, p.month, p.counterparty_id, p.direction;

DELETE FROM debt_snapshot WHERE entity_type = 'GROUP';
INSERT INTO debt_snapshot (entity_type, entity_id, debt_type, n_products,
  granted_eur, outstanding_eur, liquidity_eur, rated_outstanding_eur, rate_x_outstanding_eur)
SELECT 'GROUP', c.group_id, d.debt_type, SUM(d.n_products),
       SUM(d.granted_eur), SUM(d.outstanding_eur), SUM(d.liquidity_eur),
       SUM(d.rated_outstanding_eur), SUM(d.rate_x_outstanding_eur)
FROM debt_snapshot d
JOIN stg_companies c ON c.company_id = d.entity_id
WHERE d.entity_type = 'COMPANY'
GROUP BY c.group_id, d.debt_type;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && ./mvnw -q test -Dtest=RollupTest`
Expected: PASS, 5 tests.

- [ ] **Step 5: Create `DuckDbTables.java`**

```java
package com.xray.infrastructure.duckdb;

/** Lets a stage skip cleanly when its input tables are absent (overview contract item 7). */
public final class DuckDbTables {

    private DuckDbTables() {
    }

    public static boolean exists(SqlRunner sql, String table) {
        return !sql.query(
                "SELECT 1 FROM information_schema.tables WHERE table_schema = 'main' AND table_name = ?",
                (rs, i) -> 1, table).isEmpty();
    }
}
```

- [ ] **Step 6: Create `S25_EntityRollup.java`**

```java
package com.xray.pipeline.stages;

import com.xray.infrastructure.duckdb.DuckDbTables;
import com.xray.pipeline.PipelineContext;
import com.xray.pipeline.PipelineStage;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/** sql/25_entity_rollup.sql: entities + GROUP rows in the monthly tables. */
@Component
@Order(25)
public class S25_EntityRollup implements PipelineStage {

    private static final List<String> INPUTS = List.of(
            "stg_companies", "daily_cash", "monthly_flows", "monthly_cash",
            "monthly_invoices", "monthly_counterparty", "debt_snapshot");

    @Override
    public String id() {
        return "S25_ROLLUP";
    }

    @Override
    public void execute(PipelineContext ctx) {
        for (String table : INPUTS) {
            if (!DuckDbTables.exists(ctx.sql(), table)) {
                ctx.report(id(), 25, "skipped: missing table " + table);
                return;
            }
        }
        ctx.sql().runScript("sql/25_entity_rollup.sql", Map.of());
        ctx.report(id(), 25, ctx.sql().count("entities") + " entities");
    }
}
```

- [ ] **Step 7: Run all tests**

Run: `cd backend && ./mvnw -q test`
Expected: PASS (`RollupTest`, `ScoringConfigValidationTest`).

- [ ] **Step 8: Commit**

```bash
git add backend/src/test/java/com/xray/pipeline/RollupTest.java backend/src/main/resources/sql/25_entity_rollup.sql \
        backend/src/main/java/com/xray/infrastructure/duckdb/DuckDbTables.java \
        backend/src/main/java/com/xray/pipeline/stages/S25_EntityRollup.java
git commit -m "feat(rollup): sum company components into groups without intragroup rows"
```

---

### Task 3: Result writer on the DuckDB Appender

**Files:**
- Create: `backend/src/main/java/com/xray/infrastructure/duckdb/ResultWriter.java`

**Interfaces:**
- Produces: `ResultWriter.replace(String table, String columnsDdl, List<Object[]> rows)` → `int` (rows written). Drops the table, creates it with `columnsDdl`, appends every row. Supported cell types: `null`, `String`, `Double`, `Integer`, `Long`, `Boolean`, `LocalDate`. Blocks 4–8 use it for every results table (ARCHITECTURE §7).

- [ ] **Step 1: Create `ResultWriter.java`**

The API of `org.duckdb.DuckDBAppender` in 1.5.5.1: `DuckDBConnection.createAppender(String schema, String table)`, `beginRow()`, `append(...)`, `appendNull()`, `endRow()`, `close()`.

```java
package com.xray.infrastructure.duckdb;

import org.duckdb.DuckDBAppender;
import org.duckdb.DuckDBConnection;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDate;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Writes a results table in bulk with the DuckDB Appender (ARCHITECTURE §7).
 * Row-by-row INSERT on 132k rows takes minutes; the Appender takes seconds.
 * Every call drops and recreates the table: no migrations, no incremental updates.
 */
@Component
public class ResultWriter {

    private static final Pattern TABLE_NAME = Pattern.compile("[A-Za-z_][A-Za-z0-9_]*");

    private final DataSource dataSource;

    public ResultWriter(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    public int replace(String table, String columnsDdl, List<Object[]> rows) {
        if (!TABLE_NAME.matcher(table).matches()) {
            throw new IllegalArgumentException("Bad table name: " + table);
        }
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            st.execute("DROP TABLE IF EXISTS " + table);
            st.execute("CREATE TABLE " + table + " (" + columnsDdl + ")");
            try (DuckDBAppender a = c.unwrap(DuckDBConnection.class)
                    .createAppender(DuckDBConnection.DEFAULT_SCHEMA, table)) {
                for (Object[] row : rows) {
                    a.beginRow();
                    for (Object v : row) {
                        append(a, v);
                    }
                    a.endRow();
                }
            }
            return rows.size();
        } catch (SQLException e) {
            throw new IllegalStateException("Cannot write " + table, e);
        }
    }

    private static void append(DuckDBAppender a, Object v) throws SQLException {
        switch (v) {
            case null -> a.appendNull();
            case String s -> a.append(s);
            case Double d -> a.append(d.doubleValue());
            case Integer i -> a.append(i.intValue());
            case Long l -> a.append(l.longValue());
            case Boolean b -> a.append(b.booleanValue());
            case LocalDate d -> a.append(d);
            default -> throw new IllegalArgumentException("Unsupported cell type: " + v.getClass());
        }
    }
}
```

- [ ] **Step 2: Compile**

Run: `cd backend && ./mvnw -q compile`
Expected: BUILD SUCCESS. Task 5 checks the behavior with a scratch test.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/com/xray/infrastructure/duckdb/ResultWriter.java
git commit -m "feat(duckdb): add appender-based result writer"
```

---

### Task 4: Raw indicator table, panel loader and the S30 stage

**Files:**
- Create: `backend/src/main/resources/sql/29_indicator_values_raw.sql`
- Create: `backend/src/main/java/com/xray/infrastructure/duckdb/PanelLoader.java`
- Modify: `backend/src/main/java/com/xray/pipeline/PipelineContext.java`
- Create: `backend/src/main/java/com/xray/pipeline/stages/S30_RawIndicators.java`

**Interfaces:**
- Consumes: `entities` (Task 2), `Month`, `EntityPanel`, `RawIndicator` (Task 1), `DuckDbTables.exists`.
- Produces:
  - Table `indicator_values_raw` (overview item 10). Block 3 files `sql/30_*` … `sql/38_*` INSERT into it. Placeholder available to them: `${unit}`.
  - `PanelLoader.load(EntityType unit, List<Month> months)` → `List<EntityPanel>`, one panel for every entity of the unit, ordered by id.
  - `PipelineContext.panels()` → `List<EntityPanel>`, `PipelineContext.setPanels(List<EntityPanel>)`.
  - Stage id `S30_RAW_INDICATORS`, `@Order(30)`. Log line `S30_RAW_INDICATORS loaded N panels`.

- [ ] **Step 1: Create `sql/29_indicator_values_raw.sql`**

```sql
-- 29_indicator_values_raw.sql — the long table that sql/30_* … sql/38_* INSERT into (ARCHITECTURE §5).
CREATE OR REPLACE TABLE indicator_values_raw (
  entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, indicator_id VARCHAR,
  value DOUBLE, available BOOLEAN, is_static BOOLEAN, fallback BOOLEAN);
```

- [ ] **Step 2: Add the panels to `PipelineContext`**

Add the import, the field and two methods. Do not change the constructor.

```java
import com.xray.domain.model.EntityPanel;

import java.util.List;
```

```java
    private List<EntityPanel> panels = List.of();

    /** Populated by S30, enriched in place by S40..S90 (ARCHITECTURE §4.2). */
    public List<EntityPanel> panels() { return panels; }

    public void setPanels(List<EntityPanel> panels) { this.panels = List.copyOf(panels); }
```

Also change the class comment to: `/** State shared by the stages of one run. */`

- [ ] **Step 3: Create `PanelLoader.java`**

```java
package com.xray.infrastructure.duckdb;

import com.xray.domain.model.EntityKey;
import com.xray.domain.model.EntityPanel;
import com.xray.domain.model.EntityType;
import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.Month;
import com.xray.domain.model.RawIndicator;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** indicator_values_raw → one EntityPanel for each entity of the unit (ARCHITECTURE §3, §4.2). */
@Component
public class PanelLoader {

    private final SqlRunner sql;

    public PanelLoader(SqlRunner sql) {
        this.sql = sql;
    }

    public List<EntityPanel> load(EntityType unit, List<Month> months) {
        Map<String, Integer> monthIndex = new HashMap<>();
        for (int i = 0; i < months.size(); i++) {
            monthIndex.put(months.get(i).toString(), i);
        }

        Map<String, EntityPanel> panels = new LinkedHashMap<>();
        for (String id : sql.query(
                "SELECT entity_id FROM entities WHERE entity_type = ? ORDER BY entity_id",
                (rs, i) -> rs.getString(1), unit.name())) {
            panels.put(id, new EntityPanel(new EntityKey(unit, id), months));
        }

        List<Row> rows = sql.query("""
                SELECT entity_id, month, indicator_id, value, available, is_static, fallback
                FROM indicator_values_raw WHERE entity_type = ?""",
                (rs, i) -> new Row(rs.getString(1), rs.getString(2), rs.getString(3),
                        rs.getObject(4) == null ? null : rs.getDouble(4),
                        rs.getBoolean(5), rs.getBoolean(6), rs.getBoolean(7)),
                unit.name());

        for (Row r : rows) {
            EntityPanel panel = panels.get(r.entityId());
            if (panel == null) {
                throw new IllegalStateException("indicator_values_raw has unknown entity " + r.entityId());
            }
            Integer m = monthIndex.get(r.month());
            if (m == null) {
                continue;   // outside M00..M23
            }
            panel.setRaw(m, new RawIndicator(IndicatorId.valueOf(r.indicatorId()),
                    r.value(), r.available(), r.isStatic(), r.fallback()));
        }
        return new ArrayList<>(panels.values());
    }

    private record Row(String entityId, String month, String indicatorId, Double value,
                       boolean available, boolean isStatic, boolean fallback) {
    }
}
```

- [ ] **Step 4: Create `S30_RawIndicators.java`**

Block 3 adds `sql/30_*.sql` … `sql/38_*.sql`. This stage finds them on the classpath and runs them in filename order, so Block 3 changes no Java.

```java
package com.xray.pipeline.stages;

import com.xray.domain.model.EntityPanel;
import com.xray.domain.model.Month;
import com.xray.infrastructure.duckdb.DuckDbTables;
import com.xray.infrastructure.duckdb.PanelLoader;
import com.xray.pipeline.PipelineContext;
import com.xray.pipeline.PipelineStage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;

/** sql/29 creates indicator_values_raw, sql/30..38 fill it, then the panels load into memory. */
@Component
@Order(30)
public class S30_RawIndicators implements PipelineStage {

    private static final Logger log = LoggerFactory.getLogger(S30_RawIndicators.class);
    private static final Pattern INDICATOR_SQL = Pattern.compile("3[0-8]_.*\\.sql");

    private final PanelLoader loader;

    public S30_RawIndicators(PanelLoader loader) {
        this.loader = loader;
    }

    @Override
    public String id() {
        return "S30_RAW_INDICATORS";
    }

    @Override
    public void execute(PipelineContext ctx) {
        Map<String, String> params = Map.of("unit", ctx.unit().name());
        ctx.sql().runScript("sql/29_indicator_values_raw.sql", params);
        if (!DuckDbTables.exists(ctx.sql(), "entities")) {
            ctx.report(id(), 30, "skipped: no entities table");
            return;
        }
        for (String file : indicatorScripts()) {
            ctx.report(id(), 30, file);
            ctx.sql().runScript("sql/" + file, params);
        }
        List<Month> months = Month.range(
                Month.parse(ctx.config().months().start()), Month.parse(ctx.config().months().end()));
        List<EntityPanel> panels = loader.load(ctx.unit(), months);
        ctx.setPanels(panels);
        log.info("{} loaded {} panels", id(), panels.size());
        ctx.report(id(), 40, panels.size() + " panels");
    }

    private static List<String> indicatorScripts() {
        try {
            Resource[] found = new PathMatchingResourcePatternResolver().getResources("classpath:sql/3*.sql");
            return Arrays.stream(found)
                    .map(Resource::getFilename)
                    .filter(Objects::nonNull)
                    .filter(n -> INDICATOR_SQL.matcher(n).matches())
                    .sorted()
                    .toList();
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot list sql/3*.sql", e);
        }
    }
}
```

- [ ] **Step 5: Boot on this branch**

Run: `cd backend && rm -f ../data/xray.duckdb* && ./mvnw -q spring-boot:run`, then in a second shell `curl -s localhost:8080/api/pipeline/status`. Stop the backend with Ctrl+C.
Expected: state `DONE`. The log shows `S25_ROLLUP` skipped (no monthly tables on this branch) and `S30_RAW_INDICATORS` skipped (no entities table).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/resources/sql/29_indicator_values_raw.sql \
        backend/src/main/java/com/xray/infrastructure/duckdb/PanelLoader.java \
        backend/src/main/java/com/xray/pipeline/PipelineContext.java \
        backend/src/main/java/com/xray/pipeline/stages/S30_RawIndicators.java
git commit -m "feat(pipeline): add raw indicator table, panel loader and s30 stage"
```

---

### Task 5: Reference quantiles and a scratch check of writer, loader and quantiles

**Files:**
- Create: `backend/src/main/resources/sql/90_threshold_quantiles.sql`
- Create: `backend/src/main/java/com/xray/pipeline/stages/S95_Quantiles.java`
- Scratch (not committed): `backend/src/test/java/com/xray/pipeline/Phase2ScratchTest.java`

**Interfaces:**
- Consumes: `indicator_values_raw`, `ResultWriter`, `PanelLoader`.
- Produces: table `threshold_quantiles(entity_type, indicator_id, n, quantiles_json)` for the active unit, `quantiles_json` = `{"p5":…,"p10":…,"p25":…,"p50":…,"p75":…,"p90":…,"p95":…}`. Stage id `S95_QUANTILES`, `@Order(95)`. **Scoring code never reads this table** (ARCHITECTURE §0).

- [ ] **Step 1: Create `sql/90_threshold_quantiles.sql`**

```sql
-- 90_threshold_quantiles.sql — REFERENCE ONLY, for proposing anchors in docs/THRESHOLDS.md (SPEC §6.1).
-- Never read by scoring code. Computed for the active unit only (ARCHITECTURE §5).
CREATE OR REPLACE TABLE threshold_quantiles (
  entity_type VARCHAR, indicator_id VARCHAR, n BIGINT, quantiles_json VARCHAR);

INSERT INTO threshold_quantiles
SELECT entity_type, indicator_id, n,
       CAST(to_json({'p5': q[1], 'p10': q[2], 'p25': q[3], 'p50': q[4],
                     'p75': q[5], 'p90': q[6], 'p95': q[7]}) AS VARCHAR)
FROM (
  SELECT entity_type, indicator_id, COUNT(*) AS n,
         quantile_cont(value, [0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95]) AS q
  FROM indicator_values_raw
  WHERE entity_type = '${unit}' AND available AND value IS NOT NULL
  GROUP BY entity_type, indicator_id);
```

- [ ] **Step 2: Create `S95_Quantiles.java`**

```java
package com.xray.pipeline.stages;

import com.xray.infrastructure.duckdb.DuckDbTables;
import com.xray.pipeline.PipelineContext;
import com.xray.pipeline.PipelineStage;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.Map;

/** threshold_quantiles — reference only for docs/THRESHOLDS.md, never read by scoring. */
@Component
@Order(95)
public class S95_Quantiles implements PipelineStage {

    @Override
    public String id() {
        return "S95_QUANTILES";
    }

    @Override
    public void execute(PipelineContext ctx) {
        if (!DuckDbTables.exists(ctx.sql(), "indicator_values_raw")) {
            ctx.report(id(), 95, "skipped: no indicator_values_raw");
            return;
        }
        ctx.sql().runScript("sql/90_threshold_quantiles.sql", Map.of("unit", ctx.unit().name()));
        ctx.report(id(), 99, ctx.sql().count("threshold_quantiles") + " indicators with quantiles");
    }
}
```

- [ ] **Step 3: Write the scratch test**

This test checks `ResultWriter`, `PanelLoader` and `90_threshold_quantiles.sql` together. It is **not** one of the six required tests: run it, then delete it (Step 5).

```java
package com.xray.pipeline;

import com.xray.domain.model.EntityPanel;
import com.xray.domain.model.EntityType;
import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.Month;
import com.xray.infrastructure.duckdb.DuckDbDataSource;
import com.xray.infrastructure.duckdb.DuckDbSqlRunner;
import com.xray.infrastructure.duckdb.PanelLoader;
import com.xray.infrastructure.duckdb.ResultWriter;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class Phase2ScratchTest {

    @Test
    void writerLoaderAndQuantilesWorkTogether() throws Exception {
        try (var ds = new DuckDbDataSource("jdbc:duckdb:")) {
            var jdbc = new JdbcTemplate(ds);
            var sql = new DuckDbSqlRunner(jdbc);
            var writer = new ResultWriter(ds);

            writer.replace("entities", "entity_type VARCHAR, entity_id VARCHAR, group_id VARCHAR", List.of(
                    new Object[]{"GROUP", "G1", "G1"}, new Object[]{"GROUP", "G2", "G2"}));
            sql.runScript("sql/29_indicator_values_raw.sql", Map.of());

            List<Object[]> rows = new ArrayList<>();
            for (int v = 1; v <= 100; v++) {
                rows.add(new Object[]{"GROUP", "G1", "2025-01", "PAY_DSO", (double) v, true, false, false});
            }
            rows.add(new Object[]{"GROUP", "G2", "2024-09", "LIQ_RUNWAY", null, false, false, false});
            int n = writer.replace("indicator_values_raw", """
                    entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, indicator_id VARCHAR,
                    value DOUBLE, available BOOLEAN, is_static BOOLEAN, fallback BOOLEAN""", rows);
            assertEquals(101, n);

            List<Month> months = Month.range(Month.parse("2024-09"), Month.parse("2026-08"));
            List<EntityPanel> panels = new PanelLoader(sql).load(EntityType.GROUP, months);
            assertEquals(2, panels.size());
            assertEquals(24, panels.get(0).size());
            assertEquals(4, months.indexOf(Month.parse("2025-01")));
            assertTrue(panels.get(0).raw(IndicatorId.PAY_DSO, 4).available());
            assertFalse(panels.get(1).raw(IndicatorId.LIQ_RUNWAY, 0).available());

            sql.runScript("sql/90_threshold_quantiles.sql", Map.of("unit", "GROUP"));
            String json = jdbc.queryForObject(
                    "SELECT quantiles_json FROM threshold_quantiles WHERE indicator_id = 'PAY_DSO'", String.class);
            assertTrue(json.contains("\"p50\":50.5"), json);
        }
    }
}
```

- [ ] **Step 4: Run the scratch test**

Run: `cd backend && ./mvnw -q test -Dtest=Phase2ScratchTest`
Expected: PASS. If the `p50` string differs only in format (for example `50.50`), fix the assertion, not the SQL.

- [ ] **Step 5: Delete the scratch test and run the required tests**

```bash
rm backend/src/test/java/com/xray/pipeline/Phase2ScratchTest.java
cd backend && ./mvnw -q test
```
Expected: PASS (`RollupTest`, `ScoringConfigValidationTest`). `git status` shows no test file other than `RollupTest.java`.

- [ ] **Step 6: Boot on this branch**

Run the backend as in Task 4 Step 5.
Expected: state `DONE`, `stageTimingsMs` contains `S95_QUANTILES`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/resources/sql/90_threshold_quantiles.sql backend/src/main/java/com/xray/pipeline/stages/S95_Quantiles.java
git commit -m "feat(pipeline): add reference threshold quantiles per unit"
```
