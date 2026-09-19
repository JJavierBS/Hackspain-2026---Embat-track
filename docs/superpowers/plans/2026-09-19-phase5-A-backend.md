# Phase 5 · Plan A — Backend: signals, products (S75), alerts (S80), monitor and product API

> **For agentic workers:** Claude Code: use superpowers:executing-plans (or superpowers:subagent-driven-development) to run this plan task by task. Antigravity or other agents: do the checkboxes in order. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute the three products (working-capital limit, trade-credit premium, momentum screen) and the 15 early-warning alerts with a watchlist, for every entity-month and profile, at pipeline time. Serve them through the monitor, product and methodology endpoints, the limit simulator and the SSE monitor replay.

**Architecture:** One new SQL file (`39_signal_inputs.sql`) adds the monthly amounts that no indicator carries. Pure `domain/service` engines (`LimitEngine`, `PremiumEngine`, `MomentumScreen`, `AlertEngine`) do the math with no Spring and no SQL. Alert rules are one small `@Component` class per code in `alerting/rules/`, each a pure predicate over a causal `EntityMonthView`. Two thin stages (`S75_Products`, `S80_Alerts`) walk `ctx.panels()` and write the results tables with `ResultWriter`. The read API only reads those tables. The simulator is the only request that computes (overview F8).

**Tech Stack:** Java 21, Spring Boot 3.5 (Spring MVC `SseEmitter` for the replay), DuckDB JDBC (Appender through `ResultWriter`), JUnit 5.

**Spec:** `docs/SPEC.md` §8.5, §10.1–§10.3, §12.4, §12.5. `docs/ARCHITECTURE.md` §3, §4.2, §8.2, §10. Shared contract, decisions F1–F21 and path ownership: `docs/superpowers/plans/2026-09-19-phase5-overview.md`. **Read the overview before Task 1.**

## Global Constraints

- Edit only `backend/**`. Never edit `frontend/**`, `docs/**`, `CLAUDE.md`, `docker-compose.yml`.
- Java 21 target. The machine's JDK 21 has no `javac`. The default `java` (JDK 25) compiles with `--release 21`, so run plain `./mvnw ...`.
- No JPA, no Lombok, no new Maven dependency. `SseEmitter` is in `spring-webmvc`, already on the classpath.
- `domain/` imports nothing from `org.springframework`, `java.sql` or `com.xray.config`. Config records map themselves to domain `Params` records (`toParams()` methods in `config/`). `com.xray.alerting` (the rule API: `AlertRule`, `AlertSignal`, `EntityMonthView`) is plain Java too; only the classes in `alerting/rules/` carry `@Component`.
- Never hardcode a weight, λ, threshold, anchor or product parameter (CLAUDE.md rule 5). Every number in this plan that is not a formula constant (12 months, 10,000 bps, 100 points) comes from `scoring-config.yml`. **Never edit `scoring.profiles` or add `weight` keys to `scoring.indicators`.** New keys go at the end of the file or inside the existing `limit-engine` block.
- Causality: a value for month m reads only indices `0..m`. `EntityMonthView` throws on `k > m`. `LookAheadTest` (phase 6) checks it.
- Missing ≠ zero (CLAUDE.md rule 3): a NULL signal or an unavailable indicator never becomes 0 unless the contract says so (F6).
- Tests: add none. You may extend `ScoringConfigValidationTest` so the new keys bind. A scratch test is allowed locally and is deleted before the commit.
- Commits: Conventional Commits, English, lowercase subject. Commit after each task. No AI attribution line (CLAUDE.md).
- Your backend runs on port 8081 with the worktree's own `data/xray.duckdb`. Never open that file with the CLI while the backend runs (file lock). Query a copy.
- Plan B (frontend) will point its dev server at your backend on 8081 near the end. Keep the backend bootable after every commit.

## File Structure

```
backend/src/main/resources/
  scoring-config.yml                           limit-engine + rounding-eur; + products, alerts (end of file)
  sql/38_ind_tax.sql                           keeps ind30_base; materializes ind38_tax_cadence
  sql/39_signal_inputs.sql                     NEW: signal_values; drops ind30_base and ind38_tax_cadence
backend/src/main/java/com/xray/
  config/ScoringConfig.java                    + ProductsConfig, AlertsConfig (records), validation hook
  config/LimitEngineConfig.java                + roundingEur, toParams()
  config/ScoringConfigValidator.java           + products and alerts checks
  domain/model/
    SignalId.java                              the 8 signals of contract item 2
    LimitAction.java  BindingConstraint.java   INCREASE..DECLINE / SCORE, DSCR, RUNWAY, BAND
    LimitDecision.java  LimitSimulation.java   S75 row / simulator answer
    PremiumQuote.java  MomentumPoint.java      S75 rows
    Severity.java  AlertDirection.java         WARN, CRITICAL, INFO / NEGATIVE, POSITIVE, BOTH
    Alert.java  AlertState.java                S80 rows
    EntityPanel.java                           + signals, limits
  domain/service/
    LimitEngine.java                           SPEC §10.1 decide + simulate
    PremiumEngine.java                         SPEC §10.2
    MomentumScreen.java                        SPEC §10.3 (display-only percentiles, F10)
    AlertEngine.java                           transitions (F12)
  alerting/
    AlertRule.java                             extension point #2
    AlertSignal.java  EntityMonthView.java     rule API
    Thresholds.java  AlertText.java            shared helpers (below/above, Spanish number format)
    rules/*.java                               15 classes, one per code
  infrastructure/duckdb/PanelLoader.java       + loads signal_values
  pipeline/stages/
    S30_RawIndicators.java                     runs 3[0-9]_*.sql
    S75_Products.java                          limit_decisions, premium_quotes, momentum_screen
    S80_Alerts.java                            alerts, alert_states, watchlist
  application/
    AlertReads.java                            AlertDto mapping shared by the queries below
    ProductQuery.java  SimulateLimitUseCase.java
    MonitorQuery.java  MonitorReplayUseCase.java
    MethodologyQuery.java
    PortfolioQuery.java  TimelineQuery.java  EntityDetailQuery.java  MetaQuery.java   (extended)
  infrastructure/web/
    controller/MonitorController.java  controller/MethodologyController.java   NEW
    controller/EntityController.java                                           + limit, simulate, premium
    dto/AlertDto.java  WatchlistRowDto.java  MonitorDto.java  WatchlistDto.java  ReplayFrameDto.java
    dto/LimitDecisionDto.java  LimitSimulationDto.java  SimulateLimitRequest.java  PremiumQuoteDto.java
    dto/MomentumDto.java  MethodologyDto.java
    dto/PortfolioRowDto.java  TimelinePointDto.java  TimelineDto.java  EntityDetailDto.java  MetaDto.java  (extended)
backend/src/test/java/com/xray/config/ScoringConfigValidationTest.java   copyWith + new keys bind
```

## Shared contract

Copy of the overview's "Shared contract", items 1–10. **Read it there**: it holds the DDL of
the seven new tables, the limit formulas and actions, the premium and momentum rules, the
alert codes and the JSON of every endpoint. When this plan and the overview disagree, the
overview wins; tell the person who merges.

---

### Task 0: Check the worktree

**Files:** none.

- [ ] **Step 1: Confirm the branch and the data link**

Run (worktree root):
```bash
git branch --show-current     # feat/phase5-backend
ls data/raw | head -3         # balances.csv banking_products.csv companies.csv
```

- [ ] **Step 2: Run the tests**

Run: `cd backend && ./mvnw -q test`
Expected: exit code 0, five reports in `target/surefire-reports`.

- [ ] **Step 3: Write the run helper you use after every task**

From `backend/`:
```bash
rm -f ../data/xray.duckdb ../data/xray.duckdb.wal
SERVER_PORT=8081 ./mvnw -q spring-boot:run > /tmp/xray-a.log 2>&1 &
until curl -s localhost:8081/api/pipeline/status | grep -q '"state":"DONE"\|"state":"FAILED"'; do sleep 3; done
curl -s localhost:8081/api/pipeline/status; echo
```
For SQL checks, stop the backend first (`pkill -f 'spring-boot:run'; sleep 3`), then
`cp ../data/xray.duckdb /tmp/xray-a.duckdb` and query with `duckdb -readonly /tmp/xray-a.duckdb "<sql>"`
or, without the CLI, `java ../scripts/DuckQuery.java /tmp/xray-a.duckdb "<sql>"`.
For API checks, leave it running and use `curl localhost:8081/...`.

- [ ] **Step 4: Record the baseline**

Run the helper. Expected: `DONE`, 11 entries in `stageTimingsMs`. Note the total time; the target after this plan is still < 5 min (SPEC §5).

---

### Task 1: Config keys for products and alerts

**Files:**
- Modify: `backend/src/main/resources/scoring-config.yml`
- Modify: `backend/src/main/java/com/xray/config/ScoringConfig.java`, `LimitEngineConfig.java`, `ScoringConfigValidator.java`
- Modify: `backend/src/test/java/com/xray/config/ScoringConfigValidationTest.java`

**Interfaces:**
- Produces: `ScoringConfig.products()` → `ProductsConfig(Profile limitProfile, Profile premiumProfile, Profile momentumProfile, MomentumScreenConfig momentum)` with `MomentumScreenConfig(double risingStarMaxLevel, double risingStarMinTraj)`.
- Produces: `ScoringConfig.alerts()` → `AlertsConfig(Level runwayLow, Level dscrBreach, Level lineUtilHigh, Level dsoDrift, Level supplierLatenessUp, Level overdueReceivables, Level taxGap, Level concentrationHigh, Level factoringSpike, Level scoreDrop, int scoreDropMonths, int driftBaselineMonths, int driftBaselineMinPoints, int bandDowngradeCriticalSteps, WatchlistConfig watchlist)` with `Level(double warn, double critical)` and `WatchlistConfig(int minCritical, int minWarn)`.
- Produces: `LimitEngineConfig.roundingEur()` and `LimitEngineConfig.toParams(BandConfig)` → `LimitEngine.Params` (Task 3 defines the record; write `toParams` in Task 3).

- [ ] **Step 1: Write the failing test**

Add to `ScoringConfigValidationTest` (before `copyWith`):
```java
    @Test
    void phase5KeysBind() {
        assertNotNull(base.products().limitProfile());
        assertNotNull(base.products().premiumProfile());
        assertNotNull(base.products().momentumProfile());
        assertTrue(base.limitEngine().roundingEur() > 0);
        assertTrue(base.alerts().runwayLow().critical() < base.alerts().runwayLow().warn());
        assertTrue(base.alerts().scoreDrop().critical() > base.alerts().scoreDrop().warn());
        assertTrue(base.alerts().watchlist().minCritical() >= 1);
        assertTrue(base.alerts().driftBaselineMinPoints() <= base.alerts().driftBaselineMonths());
    }

    @Test
    void invertedAlertLevelsFail() {
        var a = base.alerts();
        var bad = new ScoringConfig.AlertsConfig(new ScoringConfig.Level(1.0, 3.0), a.dscrBreach(), a.lineUtilHigh(),
                a.dsoDrift(), a.supplierLatenessUp(), a.overdueReceivables(), a.taxGap(), a.concentrationHigh(),
                a.factoringSpike(), a.scoreDrop(), a.scoreDropMonths(), a.driftBaselineMonths(),
                a.driftBaselineMinPoints(), a.bandDowngradeCriticalSteps(), a.watchlist());
        var ex = assertThrows(IllegalStateException.class, () -> copyWith(base.indicators(), base.profiles(), bad));
        assertTrue(ex.getMessage().contains("runway-low"), ex.getMessage());
    }
```
Change `copyWith` to take a third argument `ScoringConfig.AlertsConfig alerts`, pass `base.products(), alerts` as the last two arguments of `new ScoringConfig(...)`, and add an overload `copyWith(ind, prof)` that calls `copyWith(ind, prof, base.alerts())`.

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd backend && ./mvnw -q test -Dtest=ScoringConfigValidationTest`
Expected: compilation error, `cannot find symbol ... products()`.

- [ ] **Step 3: Extend the config**

In `scoring-config.yml`, inside `limit-engine:` after `action-threshold: 0.10`, add:
```yaml
    rounding-eur: 1000              # SPEC §10.1: limit rounded to 1,000 EUR (down, never up)
```
Append at the end of the file:
```yaml

  # Phase 5 decision F5: which profile each product reads. SPEC §10: BANK limit, INSURER premium, FUND momentum.
  products:
    limit-profile: BANK
    premium-profile: INSURER
    momentum-profile: FUND
    momentum:                       # SPEC §10.3 "rising stars": level < 60 and traj >= 70
      rising-star-max-level: 60
      rising-star-min-traj: 70

  # SPEC §8.5 early-warning indicators (EBA/GL/2020/06), WARN / CRITICAL. PROVISIONAL: review with the first run.
  # "below" rules: runway-low, dscr-breach (critical < warn). The others are "above" rules (critical > warn).
  # dso-drift and supplier-lateness-up are days above the median of the previous drift-baseline-months values.
  # tax-gap is months since the last tax payment divided by the entity's own cadence.
  # factoring-spike: SPEC gives only 1.5x; the 3.0x critical level is ours (provisional).
  alerts:
    runway-low:           { warn: 3.0,  critical: 1.5 }
    dscr-breach:          { warn: 1.25, critical: 1.0 }
    line-util-high:       { warn: 0.80, critical: 0.95 }
    dso-drift:            { warn: 15,   critical: 30 }
    supplier-lateness-up: { warn: 10,   critical: 20 }
    overdue-receivables:  { warn: 0.20, critical: 0.35 }
    tax-gap:              { warn: 1.0,  critical: 2.0 }
    concentration-high:   { warn: 2500, critical: 5000 }
    factoring-spike:      { warn: 1.5,  critical: 3.0 }
    score-drop:           { warn: 8,    critical: 15 }
    score-drop-months: 3
    drift-baseline-months: 6
    drift-baseline-min-points: 4
    band-downgrade-critical-steps: 2
    watchlist: { min-critical: 1, min-warn: 2 }
```

In `ScoringConfig.java` add the components `ProductsConfig products, AlertsConfig alerts` at the end of the record, the nested records from the Interfaces list, and change the compact constructor to
`ScoringConfigValidator.validate(indicators, profiles); ScoringConfigValidator.validatePhase5(products, alerts, limitEngine);`.

In `LimitEngineConfig.java` add `double roundingEur` as the last component.

In `ScoringConfigValidator.java` add `validatePhase5`:
- `scoring.products.*-profile` not null; `scoring.limit-engine.rounding-eur` > 0.
- "below" levels (`runway-low`, `dscr-breach`): `critical < warn`. Every other level: `critical > warn`. The message names the kebab key, for example `Invalid scoring config: scoring.alerts.runway-low critical 3.0 must be below warn 1.0`.
- `score-drop-months ≥ 1`, `1 ≤ drift-baseline-min-points ≤ drift-baseline-months`, `band-downgrade-critical-steps ≥ 1`, `watchlist.min-critical ≥ 1`, `watchlist.min-warn ≥ 1`.

- [ ] **Step 4: Run the tests**

Run: `cd backend && ./mvnw -q test`
Expected: exit code 0, all five classes green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/scoring-config.yml backend/src/main/java/com/xray/config backend/src/test/java/com/xray/config
git commit -m "feat(config): add product profiles, limit rounding and alert thresholds"
```

---

### Task 2: Signal inputs (`39_signal_inputs.sql`) loaded into the panels

**Files:**
- Modify: `backend/src/main/resources/sql/38_ind_tax.sql`
- Create: `backend/src/main/resources/sql/39_signal_inputs.sql`
- Create: `backend/src/main/java/com/xray/domain/model/SignalId.java`
- Modify: `backend/src/main/java/com/xray/domain/model/EntityPanel.java`, `infrastructure/duckdb/PanelLoader.java`, `pipeline/stages/S30_RawIndicators.java`

**Interfaces:**
- Produces: table `signal_values` (contract item 2). `enum SignalId { OP_IN_MEDIAN_3M, OP_OUT_AVG_3M, NOCF_12M_ANN, DEBT_SERVICE_12M_ANN, FINANCING_IN_3M, FINANCING_IN_PREV_3M, TAX_GAP_MONTHS, TAX_CADENCE_MONTHS }`.
- Produces: `EntityPanel.signal(SignalId, int m)` → `Double` (null = missing), `EntityPanel.setSignal(SignalId, int m, Double v)`.

- [ ] **Step 1: Keep `ind30_base` alive and materialize the tax cadence in 38**

In `38_ind_tax.sql`:
1. Turn the CTE chain `tm … c` into `CREATE OR REPLACE TABLE ind38_tax_cadence AS WITH tm AS (...), b AS (...), agg AS (...) SELECT *, CASE ... END AS cadence, month_idx - last_tax AS gap_now, COALESCE(...) AS ok FROM agg;` (the body of CTE `c` becomes the final SELECT).
2. Change the `INSERT INTO indicator_values_raw` to read `FROM ind38_tax_cadence` with the same SELECT list as today.
3. Delete the last line `DROP TABLE ind30_base;`.
4. Update the header comment: "Reads ind30_base. Writes ind38_tax_cadence for sql/39, which drops both."

`TAX_REGULARITY` values must not change. Step 5 checks it.

- [ ] **Step 2: Write `39_signal_inputs.sql`**

```sql
-- 39_signal_inputs.sql — monthly amounts that products and alerts need and no indicator carries (phase 5 F4).
-- Reads ind30_base (sql/30) and ind38_tax_cadence (sql/38), then drops both. Long format; value NULL = missing.
-- All windows end at month m (causal). 12m amounts are annualized over the active months of the window.
CREATE OR REPLACE TABLE signal_values (
  entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, signal_id VARCHAR, value DOUBLE);

CREATE OR REPLACE TEMP TABLE sig_base AS
WITH fin AS (
  SELECT entity_type, entity_id, month, SUM(inflow_eur - outflow_eur) AS fin_in
  FROM monthly_flows
  WHERE flow_class = 'FINANCING_IN'
  GROUP BY 1, 2, 3)
SELECT b.entity_type, b.entity_id, b.month, b.is_active, b.act_3m, b.act_6m, b.act_12m, b.nocf_12m,
       MEDIAN(b.op_in)                  OVER w3    AS op_in_med_3m,
       SUM(b.op_out)                    OVER w3    AS op_out_3m,
       SUM(b.debt_service)              OVER w12   AS ds_12m,
       SUM(COALESCE(f.fin_in, 0))       OVER w3    AS fin_3m,
       SUM(COALESCE(f.fin_in, 0))       OVER wprev AS fin_prev_3m
FROM ind30_base b
LEFT JOIN fin f ON f.entity_type = b.entity_type AND f.entity_id = b.entity_id AND f.month = b.month
WINDOW w3    AS (PARTITION BY b.entity_type, b.entity_id ORDER BY b.month_idx ROWS BETWEEN 2 PRECEDING AND CURRENT ROW),
       w12   AS (PARTITION BY b.entity_type, b.entity_id ORDER BY b.month_idx ROWS BETWEEN 11 PRECEDING AND CURRENT ROW),
       wprev AS (PARTITION BY b.entity_type, b.entity_id ORDER BY b.month_idx ROWS BETWEEN 5 PRECEDING AND 3 PRECEDING);

INSERT INTO signal_values
SELECT entity_type, entity_id, month, 'OP_IN_MEDIAN_3M', CASE WHEN is_active AND act_3m = 3 THEN op_in_med_3m END FROM sig_base
UNION ALL
SELECT entity_type, entity_id, month, 'OP_OUT_AVG_3M', CASE WHEN is_active AND act_3m = 3 THEN op_out_3m / 3.0 END FROM sig_base
UNION ALL
SELECT entity_type, entity_id, month, 'NOCF_12M_ANN',
       CASE WHEN is_active AND act_12m >= ${annualize_min_months} THEN nocf_12m * 12.0 / act_12m END FROM sig_base
UNION ALL
SELECT entity_type, entity_id, month, 'DEBT_SERVICE_12M_ANN',
       CASE WHEN is_active AND act_12m >= ${annualize_min_months} THEN ds_12m * 12.0 / act_12m END FROM sig_base
UNION ALL
SELECT entity_type, entity_id, month, 'FINANCING_IN_3M', CASE WHEN is_active AND act_3m = 3 THEN fin_3m END FROM sig_base
UNION ALL
SELECT entity_type, entity_id, month, 'FINANCING_IN_PREV_3M', CASE WHEN is_active AND act_6m = 6 THEN fin_prev_3m END FROM sig_base
UNION ALL
SELECT entity_type, entity_id, month, 'TAX_GAP_MONTHS', CASE WHEN ok THEN gap_now END FROM ind38_tax_cadence
UNION ALL
SELECT entity_type, entity_id, month, 'TAX_CADENCE_MONTHS', CASE WHEN ok THEN cadence END FROM ind38_tax_cadence;

DROP TABLE sig_base;
DROP TABLE ind38_tax_cadence;
DROP TABLE ind30_base;
```
Check the column names against `30_ind_liquidity.sql` (`op_in`, `op_out`, `debt_service`, `nocf_12m`, `act_*`) and `38_ind_tax.sql` (`ok`, `cadence`, `gap_now`) before running. If `${annualize_min_months}` is not in the S30 params, it is: `34_ind_leverage.sql` already uses it.

- [ ] **Step 3: Run it from S30 and load it**

- `S30_RawIndicators.INDICATOR_SQL` becomes `Pattern.compile("3[0-9]_.*\\.sql")`. Update the class comment: "sql/30..38 fill it, sql/39 writes signal_values".
- `SignalId.java` in `domain/model` with the eight constants and a one-line javadoc pointing to overview contract item 2.
- `EntityPanel`: add `private final Map<SignalId, Double[]> signals = new EnumMap<>(SignalId.class);` filled with `new Double[months.size()]` (all null) in the constructor, plus:
  ```java
  /** Contract item 2. Null = missing (never zero). */
  public Double signal(SignalId id, int m) { return signals.get(id)[m]; }
  public void setSignal(SignalId id, int m, Double value) { signals.get(id)[m] = value; }
  ```
- `PanelLoader.load`: after the indicator rows, when `DuckDbTables.exists(sql, "signal_values")`, read `SELECT entity_id, month, signal_id, value FROM signal_values WHERE entity_type = ?` and call `setSignal` (skip months outside the range, like the indicator rows; unknown entity → the same `IllegalStateException`).

- [ ] **Step 4: Compile and run the tests**

Run: `cd backend && ./mvnw -q test`
Expected: exit code 0.

- [ ] **Step 5: Run the pipeline and check the signals**

Run the helper, stop the backend, then on the copy:
```sql
-- coverage per signal and entity type (the unit has 250 x 24 = 6000 rows per signal)
SELECT entity_type, signal_id, COUNT(*) AS n, COUNT(value) AS non_null,
       ROUND(quantile_cont(value, 0.5), 1) AS p50
FROM signal_values GROUP BY ALL ORDER BY 1, 2;
-- expect 0: TAX_REGULARITY unchanged by the refactor of sql/38 (compare with a run from main if in doubt)
SELECT COUNT(*) FROM indicator_values_raw WHERE indicator_id = 'TAX_REGULARITY' AND available AND value IS NULL;
-- expect 0: the helper tables are gone
SELECT COUNT(*) FROM information_schema.tables WHERE table_name IN ('ind30_base', 'ind38_tax_cadence', 'sig_base');
```
Expected: 8 signals × 2 entity types. `OP_IN_MEDIAN_3M` non-null for most active group-months, with a positive p50. `FINANCING_IN_3M` is 0 or NULL everywhere (F18). `TAX_CADENCE_MONTHS` values are only 1 and 3.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/resources/sql backend/src/main/java/com/xray/domain/model backend/src/main/java/com/xray/infrastructure/duckdb/PanelLoader.java backend/src/main/java/com/xray/pipeline/stages/S30_RawIndicators.java
git commit -m "feat(sql): add signal inputs for products and alerts"
```

---

### Task 3: `LimitEngine` (pure)

**Files:**
- Create: `domain/model/LimitAction.java`, `BindingConstraint.java`, `LimitDecision.java`, `LimitSimulation.java`
- Create: `domain/service/LimitEngine.java`
- Modify: `config/LimitEngineConfig.java` (`toParams`)

**Interfaces:**
- Produces: `LimitEngine.Params`, `LimitEngine.Inputs`, `static LimitDecision decide(Inputs, Params)`, `static LimitSimulation simulate(LimitDecision, double requestedEur, int termMonths, Params)`, `static double factor(double finalScore, Params)` (reused by the premium buyer limit).

- [ ] **Step 1: Domain types**

```java
package com.xray.domain.model;

/** SPEC §10.1 limit action (overview contract item 3). */
public enum LimitAction { INCREASE, REDUCE, FREEZE, MAINTAIN, DECLINE }
```
```java
package com.xray.domain.model;

/** What caps the limit. BAND only in a simulation: the band has no spread, so no credit (overview F7). */
public enum BindingConstraint { SCORE, DSCR, RUNWAY, BAND }
```
```java
package com.xray.domain.model;

/** One row of limit_decisions (overview contract item 3). EUR amounts; NULL fields as the contract says. */
public record LimitDecision(double finalScore, Double traj, Band band, double baseEur, double factor, double trend,
                            boolean runwayGuard, double rawLimitEur, Double nocf12m, Double debtService12m,
                            Double dscrCapEur, double limitEur, Double prevLimitEur, Integer spreadBps,
                            Double allInRate, LimitAction action, BindingConstraint bindingConstraint,
                            Double projectedDscr) {
}
```
```java
package com.xray.domain.model;

/** SPEC §10.1 simulator answer. decision = APPROVE | PARTIAL | DECLINE. */
public record LimitSimulation(String decision, double requestedEur, double approvedEur, double capacityEur,
                              int termMonths, Integer spreadBps, Double allInRate, Double projectedDscr,
                              BindingConstraint bindingConstraint) {
}
```

- [ ] **Step 2: The engine**

```java
package com.xray.domain.service;

import com.xray.domain.model.Band;
import com.xray.domain.model.BindingConstraint;
import com.xray.domain.model.LimitAction;
import com.xray.domain.model.LimitDecision;
import com.xray.domain.model.LimitSimulation;

import java.util.Map;

/** SPEC §10.1 working-capital limit, exactly as overview contract item 3. Pure: no Spring, no SQL. */
public final class LimitEngine {

    private LimitEngine() {
    }

    /** spreadBpsByBand: a band missing from the map has no spread (DECLINE). */
    public record Params(double scoreFloor, double factorAtFloor, double factorAt100, double trendModifierSpan,
                         double runwayGuardBelowMonths, double runwayGuardMultiplier, double dscrMin,
                         int defaultTermMonths, double referenceRate, Map<Band, Integer> spreadBpsByBand,
                         double actionThreshold, double roundingEur) {
    }

    /** traj, runwayMonths, nocf12m, debtService12m, prevLimitEur may be null (overview F6). */
    public record Inputs(double finalScore, Double traj, Band band, double baseEur, Double runwayMonths,
                         Double nocf12m, Double debtService12m, Double prevLimitEur) {
    }

    public static double factor(double finalScore, Params p) {
        if (finalScore < p.scoreFloor()) {
            return 0;
        }
        return p.factorAtFloor()
                + (finalScore - p.scoreFloor()) / (100 - p.scoreFloor()) * (p.factorAt100() - p.factorAtFloor());
    }

    static double trend(Double traj, Params p) {
        if (traj == null) {
            return 1;
        }
        double s = p.trendModifierSpan();
        return Math.max(1 - s, Math.min(1 + s, 1 + s * (traj - 50) / 50));
    }

    static double annualCostFactor(int termMonths, int spreadBps, Params p) {
        return 12.0 / termMonths + p.referenceRate() + spreadBps / 10_000.0;
    }

    static double roundDown(double eur, double step) {
        return Math.floor(Math.max(0, eur) / step) * step;
    }

    static Double dscr(Double nocf, double denominator) {
        return nocf == null || denominator <= 0 ? null : nocf / denominator;
    }

    /** DSCR cap for a term, or null when NOCF is missing (overview F6). */
    static Double cap(Double nocf12m, double ds, double acf, Params p) {
        return nocf12m == null ? null : Math.max(0, nocf12m / p.dscrMin() - ds) / acf;
    }

    public static LimitDecision decide(Inputs in, Params p) {
        Integer spread = p.spreadBpsByBand().get(in.band());
        double factor = factor(in.finalScore(), p);
        double trend = trend(in.traj(), p);
        boolean guard = in.runwayMonths() != null && in.runwayMonths() < p.runwayGuardBelowMonths();
        double raw = Math.max(0, in.baseEur() * factor * trend * (guard ? p.runwayGuardMultiplier() : 1));
        double ds = in.debtService12m() == null ? 0 : in.debtService12m();

        Double acf = spread == null ? null : annualCostFactor(p.defaultTermMonths(), spread, p);
        Double cap = acf == null ? null : cap(in.nocf12m(), ds, acf, p);
        double limit = spread == null ? 0 : roundDown(cap == null ? raw : Math.min(raw, cap), p.roundingEur());
        BindingConstraint binding = cap != null && cap < raw ? BindingConstraint.DSCR
                : guard ? BindingConstraint.RUNWAY : BindingConstraint.SCORE;
        Double projected = dscr(in.nocf12m(), ds + (limit > 0 ? limit * acf : 0));
        Double allIn = spread == null ? null : p.referenceRate() + spread / 10_000.0;

        return new LimitDecision(in.finalScore(), in.traj(), in.band(), in.baseEur(), factor, trend, guard, raw,
                in.nocf12m(), in.debtService12m(), cap, limit, in.prevLimitEur(), spread, allIn,
                action(limit, in.prevLimitEur(), spread != null, p.actionThreshold()), binding, projected);
    }

    /** Overview contract item 3, first match wins. */
    static LimitAction action(double limit, Double prev, boolean hasSpread, double t) {
        if (limit == 0 && prev != null && prev > 0) return LimitAction.FREEZE;
        if (!hasSpread) return LimitAction.DECLINE;
        if (prev == null) return LimitAction.MAINTAIN;
        if (limit > prev && limit >= prev * (1 + t)) return LimitAction.INCREASE;
        if (limit < prev && limit <= prev * (1 - t)) return LimitAction.REDUCE;
        return LimitAction.MAINTAIN;
    }

    /** SPEC §10.1 simulator on a stored decision: same caps, the user's term (overview F8). */
    public static LimitSimulation simulate(LimitDecision d, double requestedEur, int termMonths, Params p) {
        if (d.spreadBps() == null) {
            return new LimitSimulation("DECLINE", requestedEur, 0, 0, termMonths, null, null,
                    dscr(d.nocf12m(), d.debtService12m() == null ? 0 : d.debtService12m()), BindingConstraint.BAND);
        }
        double ds = d.debtService12m() == null ? 0 : d.debtService12m();
        double acf = annualCostFactor(termMonths, d.spreadBps(), p);
        Double cap = cap(d.nocf12m(), ds, acf, p);
        double capacity = roundDown(cap == null ? d.rawLimitEur() : Math.min(d.rawLimitEur(), cap), p.roundingEur());
        BindingConstraint binding = cap != null && cap < d.rawLimitEur() ? BindingConstraint.DSCR
                : d.runwayGuard() ? BindingConstraint.RUNWAY : BindingConstraint.SCORE;
        double approved = Math.min(requestedEur, capacity);
        String decision = capacity <= 0 ? "DECLINE" : requestedEur <= capacity ? "APPROVE" : "PARTIAL";
        return new LimitSimulation(decision, requestedEur, approved, capacity, termMonths, d.spreadBps(),
                d.allInRate(), dscr(d.nocf12m(), ds + approved * acf), binding);
    }
}
```

- [ ] **Step 3: Map the config**

In `LimitEngineConfig`, add:
```java
    /** Domain parameters. Band keys of spreadBpsByBand are A..E strings in the YAML. */
    public LimitEngine.Params toParams() {
        Map<Band, Integer> spreads = new EnumMap<>(Band.class);
        spreadBpsByBand.forEach((k, v) -> { if (v != null) spreads.put(Band.valueOf(k.toUpperCase(Locale.ROOT)), v); });
        return new LimitEngine.Params(scoreFloor, factorAtFloor, factorAt100, trendModifierSpan,
                runwayGuard.belowMonths(), runwayGuard.multiplier(), dscrMin, defaultTermMonths, referenceRate,
                spreads, actionThreshold, roundingEur);
    }
```

- [ ] **Step 4: Check the numbers with a scratch test (delete it after)**

Write `backend/src/test/java/com/xray/domain/service/LimitEngineScratchTest.java` with params `scoreFloor 35, factorAtFloor 0.25, factorAt100 1.5, span 0.2, guard 1.5 / 0.5, dscrMin 1.25, term 36, ref 0.035, spreads {A:150,B:250,C:400,D:650}, t 0.10, rounding 1000` and check:
- `factor(35) = 0.25`, `factor(100) = 1.5`, `factor(34.9) = 0`, `factor(67.5) = 0.875`.
- `trend(null) = 1`, `trend(100) = 1.2`, `trend(0) = 0.8`, `trend(75) = 1.1`.
- final 67.5, traj 75, band B, base 100,000, runway 6, NOCF 1,000,000, DS 0, prev null → raw 96,250, cap huge, limit 96,000, `SCORE`, `MAINTAIN`.
- same with runway 1.0 → raw 48,125, limit 48,000, `RUNWAY`.
- same with NOCF 50,000, DS 30,000 → cap = (40,000 − 30,000) / (12/36 + 0.035 + 0.025) = 25,423.7 → limit 25,000, `DSCR`, projected DSCR = 50,000 / (30,000 + 25,000 × 0.3933) ≈ 1.27.
- band E, prev 40,000 → limit 0, `FREEZE`; band E, prev null → `DECLINE`.
- prev 100,000: limit 111,000 → `INCREASE`; 105,000 → `MAINTAIN`; 89,000 → `REDUCE`.
- simulate on the DSCR case, requested 10,000, term 36 → APPROVE; requested 40,000 → PARTIAL with approved 25,000.

Run: `cd backend && ./mvnw -q test -Dtest=LimitEngineScratchTest`. Fix the engine until it passes, then `rm` the file.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/xray/domain backend/src/main/java/com/xray/config/LimitEngineConfig.java
git commit -m "feat(domain): add working-capital limit engine and simulator"
```

---

### Task 4: `PremiumEngine` and `MomentumScreen` (pure)

**Files:**
- Create: `domain/model/PremiumQuote.java`, `domain/model/MomentumPoint.java`
- Create: `domain/service/PremiumEngine.java`, `domain/service/MomentumScreen.java`
- Modify: `config/ScoringConfig.java` (`InsurerConfig.toParams()`, `MomentumScreenConfig.toParams()`)

**Interfaces:**
- `record PremiumQuote(double finalScore, Band band, boolean insurable, Double premiumRate, Double prevPremiumRate, Band prevBand, Double buyerLimitEur, ChangeDirection tierChange)`.
- `PremiumEngine.Params(double basePremiumRate, Map<Band, Double> multiplierByBand)`; `static PremiumQuote quote(double finalScore, Band band, Double opOutAvg3m, Double dpoDays, PremiumQuote prev, Params p, LimitEngine.Params lp)`.
- `record MomentumPoint(int rank, int of, Integer trajPercentile, Integer growthPercentile, boolean risingStar)`.
- `MomentumScreen.Params(double risingStarMaxLevel, double risingStarMinTraj)`; `record Peer(String entityId, double finalScore, double level, Double traj, Double growth)`; `static Map<String, MomentumPoint> screen(List<Peer> peers, Params p)`.

- [ ] **Step 1: `PremiumEngine`** (overview contract item 4)

- `insurable = p.multiplierByBand().containsKey(band)`; `premiumRate = insurable ? base · multiplier : null`.
- `buyerLimitEur`: `null` when `opOutAvg3m` or `dpoDays` is null; `0` when not insurable; else `LimitEngine.roundDown(opOutAvg3m · (dpoDays / 30) · LimitEngine.factor(finalScore, lp), lp.roundingEur())` (make `roundDown` package-private → public static, it is shared).
- `prevPremiumRate = prev == null ? null : prev.premiumRate()`, `prevBand = prev == null ? null : prev.band()`.
- `tierChange`: `UP` when `prevBand != null && band.ordinal() < prevBand.ordinal()` (A is the best band), `DOWN` when greater, else null. `ChangeDirection` already exists (`UP`, `DOWN`).

- [ ] **Step 2: `MomentumScreen`** (overview contract item 5, decision F10)

Javadoc: "Peer ranks and percentiles are display only (SPEC §10.3). No scoring code reads them (CLAUDE.md rule 2)."
- `rank` = 1 + number of peers with a strictly higher `finalScore`. `of` = `peers.size()`.
- `percentile(x, values)`: `values` = the non-null values among peers; `n = values.size()`; `n == 1` → 50; else `round(100 · (less + 0.5 · (equal − 1)) / (n − 1))` where `less` = count `< x`, `equal` = count `== x` (x itself included). `null` when `x` is null.
- `risingStar = traj != null && level < p.risingStarMaxLevel() && traj >= p.risingStarMinTraj()`.

- [ ] **Step 3: Config mapping**

`InsurerConfig.toParams()` maps the string band keys to `Band` like `LimitEngineConfig.toParams()`. `MomentumScreenConfig.toParams()` returns `MomentumScreen.Params`.

- [ ] **Step 4: Scratch-check (delete after)**

Peers finals `[80, 70, 70, 50]`, trajs `[60, null, 40, 80]`: ranks `1, 2, 2, 4`; traj percentiles among `{60, 40, 80}` → `50, null, 0, 100`. Premium: base 0.0025, B ×1.0 → 0.0025; band E → not insurable, rate null, buyer limit 0; prev band C → current B gives `UP`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/xray/domain backend/src/main/java/com/xray/config
git commit -m "feat(domain): add trade-credit premium and momentum screen"
```

---

### Task 5: `S75_Products` stage

**Files:**
- Create: `pipeline/stages/S75_Products.java`
- Modify: `domain/model/EntityPanel.java` (+ `limits`)

**Interfaces:**
- Produces: tables `limit_decisions`, `premium_quotes`, `momentum_screen` (contract items 3–5).
- Produces: `EntityPanel.limits()` → `LimitDecision[]` (null element = no decision that month; the array is null until S75), `setLimits(LimitDecision[])`. S80 reads it.

- [ ] **Step 1: EntityPanel**

Add `private LimitDecision[] limits;` with `/** S75, limit profile only. Null until S75 runs; an element is null for a month with no decision. */ public LimitDecision[] limits()` and `setLimits`.

- [ ] **Step 2: The stage**

```java
@Component
@Order(75)
public class S75_Products implements PipelineStage {
    static final String LIMIT_DDL = "entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, profile VARCHAR, "
            + "final DOUBLE, traj DOUBLE, band VARCHAR, base_eur DOUBLE, factor DOUBLE, trend DOUBLE, "
            + "runway_guard BOOLEAN, raw_limit_eur DOUBLE, nocf_12m DOUBLE, debt_service_12m DOUBLE, "
            + "dscr_cap_eur DOUBLE, limit_eur DOUBLE, prev_limit_eur DOUBLE, spread_bps INTEGER, "
            + "all_in_rate DOUBLE, action VARCHAR, binding_constraint VARCHAR, projected_dscr DOUBLE";
    static final String PREMIUM_DDL = "entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, profile VARCHAR, "
            + "final DOUBLE, band VARCHAR, insurable BOOLEAN, premium_rate DOUBLE, prev_premium_rate DOUBLE, "
            + "prev_band VARCHAR, buyer_limit_eur DOUBLE, tier_change VARCHAR";
    static final String MOMENTUM_DDL = "entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, profile VARCHAR, "
            + "final DOUBLE, rank INTEGER, of_count INTEGER, traj_percentile INTEGER, growth_percentile INTEGER, "
            + "rising_star BOOLEAN";
    // id() = "S75_PRODUCTS"; constructor takes ResultWriter
}
```
`execute(ctx)`:
1. `ctx.panels().isEmpty()` → `ctx.report(id(), 75, "skipped: no panels")` and return (same as S70).
2. `products = ctx.config().products()`, `lp = ctx.config().limitEngine().toParams()`, `pp = ctx.config().insurer().toParams()`, `mp = products.momentum().toParams()`.
3. **Limits**, `ctx.panels().parallelStream()`: for each panel, `ProfileScore[] s = panel.profileScores(products.limitProfile())` (skip the panel when null). Walk m = 0..n−1 with `LimitDecision prev = null`:
   - no decision (element null, and `prev = null` for the next month) when `s[m] == null || s[m].finalScore() == null` or `panel.signal(OP_IN_MEDIAN_3M, m) == null`;
   - else `LimitEngine.decide(new Inputs(final, traj, band, base, runway, panel.signal(NOCF_12M_ANN, m), panel.signal(DEBT_SERVICE_12M_ANN, m), prev == null ? null : prev.limitEur()), lp)`, where `runway` = the raw `LIQ_RUNWAY` value when `available`, else null.
   - `panel.setLimits(array)`; collect rows `[type, id, month, profile, final, traj, band, base, factor, trend, guard, raw, nocf, ds, cap, limit, prev, spread, allIn, action, binding, projected]`.
4. **Premiums**, same walk on `products.premiumProfile()`: `PremiumEngine.quote(final, band, panel.signal(OP_OUT_AVG_3M, m), dpo, prevQuote, pp, lp)` with `dpo` = the raw `PAY_DPO` value when available. `prevQuote` resets to null on a month with no row.
5. **Momentum**, per (entity type, month): peers = the panels of that type whose `profileScores(momentumProfile)[m]` has a final; `Peer(id, final, level, traj, growth)` with `growth` = raw `ACT_COLLECTIONS_GROWTH` when available. `MomentumScreen.screen(peers, mp)` → rows.
6. Write the three tables with `writer.replace(...)`. Log `"{} wrote {} limit, {} premium, {} momentum rows"`. `ctx.report(id(), 78, ...)`.

Keep `Double` / `Integer` / `Boolean` boxed in the row arrays (the `ResultWriter` switch handles `null`). Enum values go in as `name()`.

- [ ] **Step 3: Run and check**

Run the helper (13 → 12 stages for now: S80 comes in Task 8). Then on the copy:
```sql
SELECT entity_type, profile, COUNT(*) FROM limit_decisions GROUP BY ALL;          -- BANK only
SELECT action, binding_constraint, COUNT(*) FROM limit_decisions WHERE entity_type = 'GROUP' GROUP BY ALL ORDER BY 3 DESC;
SELECT band, COUNT(*), ROUND(AVG(limit_eur)), ROUND(AVG(base_eur)) FROM limit_decisions
WHERE entity_type = 'GROUP' AND month = '2026-08' GROUP BY 1 ORDER BY 1;
-- expect 0: the limit never exceeds the base times the top factor times the top trend
SELECT COUNT(*) FROM limit_decisions WHERE limit_eur > base_eur * 1.5 * 1.2 + 1;
-- expect 0: band E always has limit 0
SELECT COUNT(*) FROM limit_decisions WHERE spread_bps IS NULL AND limit_eur <> 0;
SELECT tier_change, COUNT(*) FROM premium_quotes WHERE entity_type = 'GROUP' GROUP BY 1;
SELECT month, SUM(rising_star::INT) FROM momentum_screen WHERE entity_type = 'GROUP' GROUP BY 1 ORDER BY 1;
```
Expected: the action mix is mostly `MAINTAIN` with some `INCREASE`/`REDUCE`; `DSCR` binds for part of the rows; average limit rises with the band; a handful of rising stars per month. If `DSCR` binds for almost every row, check the sign of `debt_service` in `ind30_base` (it is outflow − inflow, so positive for payments) and report it.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/xray
git commit -m "feat(pipeline): add products stage with limits, premiums and momentum"
```

---

### Task 6: Alert rule API and `AlertEngine`

**Files:**
- Create: `domain/model/Severity.java`, `AlertDirection.java`, `Alert.java`, `AlertState.java`
- Create: `alerting/AlertRule.java`, `AlertSignal.java`, `EntityMonthView.java`, `Thresholds.java`, `AlertText.java`
- Create: `domain/service/AlertEngine.java`

**Interfaces:**
- `enum Severity { WARN, CRITICAL, INFO }`, `enum AlertDirection { NEGATIVE, POSITIVE, BOTH }`.
- `record Alert(EntityKey key, int month, Profile profile, String code, Severity severity, AlertDirection direction, String message, Double value)`; `record AlertState(EntityKey key, int month, Profile profile, String code, Severity severity, AlertDirection direction, Double value)`.
- `AlertEngine.run(EntityPanel, Profile, boolean isLimitProfile, List<AlertRule>)` → `AlertEngine.Output(List<Alert> alerts, List<AlertState> states)`.

- [ ] **Step 1: The rule API (extension point #2, ARCHITECTURE §8.2)**

```java
package com.xray.alerting;

import com.xray.domain.model.AlertDirection;

import java.util.Optional;

/**
 * One early-warning indicator (SPEC §8.5). A pure predicate: it never deals with transitions,
 * AlertEngine does (overview F12). One class per code in alerting/rules/.
 */
public interface AlertRule {

    String code();

    /** NEGATIVE, POSITIVE or BOTH. Each signal carries its own NEGATIVE or POSITIVE direction. */
    AlertDirection direction();

    /** Event rules emit every month the predicate holds (band changes, limit actions). */
    default boolean event() {
        return false;
    }

    /** Spanish trigger text for /api/methodology, built from the config, e.g. "< 3 meses / < 1,5 meses". */
    String trigger();

    Optional<AlertSignal> evaluate(EntityMonthView view);
}
```
```java
package com.xray.alerting;

import com.xray.domain.model.AlertDirection;
import com.xray.domain.model.Severity;

/** direction is NEGATIVE (WARN or CRITICAL) or POSITIVE (INFO) — overview F13. message is Spanish UI copy. */
public record AlertSignal(Severity severity, AlertDirection direction, String message, Double value) {

    public AlertSignal {
        boolean ok = direction == AlertDirection.POSITIVE ? severity == Severity.INFO
                : direction == AlertDirection.NEGATIVE && severity != Severity.INFO;
        if (!ok) {
            throw new IllegalArgumentException("bad alert signal " + severity + " " + direction);
        }
    }

    public static AlertSignal negative(Severity severity, String message, Double value) {
        return new AlertSignal(severity, AlertDirection.NEGATIVE, message, value);
    }

    public static AlertSignal positive(String message, Double value) {
        return new AlertSignal(Severity.INFO, AlertDirection.POSITIVE, message, value);
    }
}
```

- [ ] **Step 2: The causal view**

```java
package com.xray.alerting;

/**
 * Read-only window over one panel at month m for one profile (ARCHITECTURE §8.2).
 * Reading a month after m throws: this is what keeps every rule causal. A month before 0 reads as null.
 */
public final class EntityMonthView {

    private final EntityPanel panel;
    private final Profile profile;
    private final int m;
    private final boolean limitProfile;

    public EntityMonthView(EntityPanel panel, Profile profile, int m, boolean limitProfile) { ... }

    public int m() { return m; }
    public Profile profile() { return profile; }
    public EntityKey key() { return panel.key(); }

    /** Raw value when available, else null. */
    public Double value(IndicatorId id, int k) {
        if (!inRange(k)) return null;
        RawIndicator r = panel.raw(id, k);
        return r.available() ? r.value() : null;
    }

    public ProfileScore score(int k) {
        if (!inRange(k)) return null;
        ProfileScore[] s = panel.profileScores(profile);
        return s == null ? null : s[k];
    }

    public Double finalScore(int k) {
        ProfileScore s = score(k);
        return s == null ? null : s.finalScore();
    }

    public DynamicsPoint dynamics(int k) {
        if (!inRange(k)) return null;
        DynamicsPoint[] d = panel.dynamics(profile);
        return d == null ? null : d[k];
    }

    /** Only in the limit profile (overview F11). */
    public LimitDecision limit(int k) {
        if (!limitProfile || !inRange(k) || panel.limits() == null) return null;
        return panel.limits()[k];
    }

    public Double signal(SignalId id, int k) {
        return inRange(k) ? panel.signal(id, k) : null;
    }

    /** Median of the available values of id over months m − months .. m − 1 (m excluded); null below minPoints. */
    public Double baselineMedian(IndicatorId id, int months, int minPoints) {
        List<Double> v = new ArrayList<>();
        for (int k = Math.max(0, m - months); k < m; k++) {
            Double x = value(id, k);
            if (x != null) v.add(x);
        }
        if (v.size() < minPoints) return null;
        Collections.sort(v);
        int n = v.size();
        return n % 2 == 1 ? v.get(n / 2) : (v.get(n / 2 - 1) + v.get(n / 2)) / 2;
    }

    private boolean inRange(int k) {
        if (k > m) {
            throw new IllegalArgumentException("look-ahead: rule read month " + k + " at month " + m);
        }
        return k >= 0;
    }
}
```
(Fill in imports and the constructor.)

- [ ] **Step 3: Helpers**

`Thresholds` (plain static methods):
```java
    /** CRITICAL when v < level.critical(), WARN when v < level.warn(), else empty. Null v → empty. */
    public static Optional<Severity> below(Double v, Level level)
    /** CRITICAL when v > level.critical(), WARN when v > level.warn(), else empty. */
    public static Optional<Severity> above(Double v, Level level)
```
`alerting` must not import `com.xray.config`, so give `Thresholds` its own `public record Level(double warn, double critical)` and let each rule convert `ScoringConfig.Level` in its constructor (`new Thresholds.Level(c.warn(), c.critical())`). The rules live in `alerting/rules/` and may import config: they are Spring beans.

`AlertText`: `static String num(double v, int decimals)` with `NumberFormat.getNumberInstance(Locale.forLanguageTag("es-ES"))` (thread-safe: create a new instance per call), `static String eur(double v)` → `"120.000 €"`, `static String pct(double ratio)` → `"23 %"`, `static String level(Thresholds.Level l, String unit, int decimals, String op)` → `"< 3 meses / < 1,5 meses"` for `trigger()`.

- [ ] **Step 4: The engine**

```java
package com.xray.domain.service;

/** Runs the rules over one panel and profile; emits alerts on transitions only (SPEC §8.5, overview F12). */
public final class AlertEngine {

    private AlertEngine() {
    }

    public record Output(List<Alert> alerts, List<AlertState> states) {
    }

    public static Output run(EntityPanel panel, Profile profile, boolean limitProfile, List<AlertRule> rules) {
        List<Alert> alerts = new ArrayList<>();
        List<AlertState> states = new ArrayList<>();
        ProfileScore[] scores = panel.profileScores(profile);
        if (scores == null) {
            return new Output(alerts, states);
        }
        Map<String, AlertSignal> prev = Map.of();
        boolean seeded = false;
        for (int m = 0; m < panel.size(); m++) {
            if (scores[m] == null || scores[m].finalScore() == null) {
                continue;
            }
            EntityMonthView view = new EntityMonthView(panel, profile, m, limitProfile);
            Map<String, AlertSignal> now = new HashMap<>();
            for (AlertRule rule : rules) {
                Optional<AlertSignal> s = rule.evaluate(view);
                if (s.isEmpty()) {
                    continue;
                }
                AlertSignal sig = s.get();
                now.put(rule.code(), sig);
                states.add(new AlertState(panel.key(), m, profile, rule.code(), sig.severity(), sig.direction(), sig.value()));
                AlertSignal before = prev.get(rule.code());
                boolean transition = rule.event() || before == null
                        || before.severity() != sig.severity() || before.direction() != sig.direction();
                if (seeded && transition) {
                    alerts.add(new Alert(panel.key(), m, profile, rule.code(), sig.severity(), sig.direction(),
                            sig.message(), sig.value()));
                }
            }
            prev = now;
            seeded = true;
        }
        return new Output(alerts, states);
    }
}
```
`AlertEngine` imports `com.xray.alerting` (plain Java). That is allowed: the rule is "no Spring, no SQL, no config in `domain/`".

- [ ] **Step 5: Compile and commit**

Run: `cd backend && ./mvnw -q test` → exit code 0.
```bash
git add backend/src/main/java/com/xray
git commit -m "feat(alerting): add alert rule api, causal month view and transition engine"
```

---

### Task 7: The 15 alert rules

**Files:**
- Create: 15 classes in `backend/src/main/java/com/xray/alerting/rules/`

Every rule is `@Component`, takes `ScoringConfig` in its constructor, reads only through `EntityMonthView` at month `v.m()` or before, and returns `Optional.empty()` when an input is null (missing ≠ zero). Messages are Spanish, built with `AlertText`. `value` is the raw number the alert is about.

- [ ] **Step 1: The two templates**

A state rule on an indicator:
```java
package com.xray.alerting.rules;

@Component
public class RunwayLowRule implements AlertRule {

    private final Thresholds.Level level;

    public RunwayLowRule(ScoringConfig config) {
        var l = config.alerts().runwayLow();
        this.level = new Thresholds.Level(l.warn(), l.critical());
    }

    @Override public String code() { return "RUNWAY_LOW"; }
    @Override public AlertDirection direction() { return AlertDirection.NEGATIVE; }
    @Override public String trigger() { return AlertText.level(level, "meses de caja", 1, "<"); }

    @Override
    public Optional<AlertSignal> evaluate(EntityMonthView v) {
        Double runway = v.value(IndicatorId.LIQ_RUNWAY, v.m());
        return Thresholds.below(runway, level).map(s -> AlertSignal.negative(s,
                "Caja para " + AlertText.num(runway, 1) + " meses de gasto neto", runway));
    }
}
```
An event rule on the score:
```java
@Component
public class BandDowngradeRule implements AlertRule {

    private final int criticalSteps;

    public BandDowngradeRule(ScoringConfig config) {
        this.criticalSteps = config.alerts().bandDowngradeCriticalSteps();
    }

    @Override public String code() { return "BAND_DOWNGRADE"; }
    @Override public AlertDirection direction() { return AlertDirection.NEGATIVE; }
    @Override public boolean event() { return true; }
    @Override public String trigger() { return "baja de banda / " + criticalSteps + " bandas o más, o a la banda E"; }

    @Override
    public Optional<AlertSignal> evaluate(EntityMonthView v) {
        ProfileScore now = v.score(v.m());
        ProfileScore before = v.score(v.m() - 1);
        if (now == null || before == null || now.band() == null || before.band() == null) return Optional.empty();
        int steps = now.band().ordinal() - before.band().ordinal();
        if (steps <= 0) return Optional.empty();
        Severity s = steps >= criticalSteps || now.band() == Band.E ? Severity.CRITICAL : Severity.WARN;
        return Optional.of(AlertSignal.negative(s,
                "Baja de banda " + before.band() + " a " + now.band(), now.finalScore()));
    }
}
```

- [ ] **Step 2: The other 13, from this table**

| Class | Code | Kind | Reads (at m unless noted) | Signal | Message (Spanish) |
|---|---|---|---|---|---|
| `DscrBreachRule` | `DSCR_BREACH` | state | `DEBT_DSCR` value (null when no debt service) | `below(dscr-breach)` | "Cobertura del servicio de deuda {x}x" |
| `LineUtilHighRule` | `LINE_UTIL_HIGH` | state | `DEBT_LINE_UTIL` value | `above(line-util-high)` | "Póliza de crédito dispuesta al {pct}" |
| `DsoDriftRule` | `DSO_DRIFT` | state | `PAY_DSO` value − `baselineMedian(PAY_DSO, drift-baseline-months, drift-baseline-min-points)` | `above(dso-drift)` on the drift | "Cobra a {x} días, +{d} sobre su mediana de {n} meses" |
| `SupplierLatenessUpRule` | `SUPPLIER_LATENESS_UP` | state | same on `PAY_SUPPLIER_LATENESS` | `above(supplier-lateness-up)` | "Paga con {x} días de retraso, +{d} sobre su mediana" |
| `OverdueReceivablesRule` | `OVERDUE_RECEIVABLES` | state | `DEL_OVERDUE_RECEIVABLES` value | `above(overdue-receivables)` | "{pct} de lo facturado está vencido sin cobrar" |
| `TaxGapRule` | `TAX_GAP` | state | `TAX_GAP_MONTHS / TAX_CADENCE_MONTHS` (signals) | `above(tax-gap)` on the ratio | "{g} meses sin pagar impuestos (lo habitual: cada {c})" |
| `ConcentrationHighRule` | `CONCENTRATION_HIGH` | state | `CON_HHI_CUSTOMERS` value | `above(concentration-high)` | "Concentración de clientes alta: HHI {x}" |
| `FactoringSpikeRule` | `FACTORING_SPIKE` | state | `FINANCING_IN_3M / FINANCING_IN_PREV_3M` (signals; empty when prev ≤ 0) | `above(factoring-spike)` | "La financiación de circulante se multiplica por {r} en 3 meses" |
| `ScoreDropRule` | `SCORE_DROP` | state | `finalScore(m − score-drop-months) − finalScore(m)` | `above(score-drop)` on the drop | "La nota cae {d} puntos en {n} meses ({a} → {b})" |
| `StructuralDeclineRule` | `STRUCTURAL_DECLINE` | state | `dynamics(m).regime() == STRUCTURAL_DECLINE` | `CRITICAL` negative | "Entra en deterioro estructural" |
| `StructuralImprovementRule` | `STRUCTURAL_IMPROVEMENT` | state, POSITIVE | `dynamics(m).regime() == STRUCTURAL_IMPROVEMENT` | `positive` | "Entra en mejora estructural" |
| `BandUpgradeRule` | `BAND_UPGRADE` | event, POSITIVE | band(m) better than band(m − 1) | `positive` | "Sube de banda {a} a {b}" |
| `LimitActionRule` | `LIMIT_ACTION` | event, BOTH | `limit(m)` (null outside the limit profile) | `INCREASE` → positive; `REDUCE` → WARN; `FREEZE` → CRITICAL; `MAINTAIN`, `DECLINE` → empty (F13) | "Límite ampliado / reducido / congelado: {prev} → {now}" |

Trigger texts use the config, for example `DsoDriftRule.trigger()` = `"+15 días / +30 días sobre la mediana de 6 meses"`, `TaxGapRule` = `"hueco > 1 × su cadencia / > 2 ×"`, `StructuralDeclineRule` = `"entra en régimen de deterioro estructural"`.

- [ ] **Step 3: Check the set is complete**

Temporarily log the codes from a `List<AlertRule>` in a scratch `@SpringBootTest`-free check, or simply `grep -c '@Component' backend/src/main/java/com/xray/alerting/rules/*.java | wc -l` → 15 and `grep -ho 'return "[A-Z_]*"' backend/src/main/java/com/xray/alerting/rules/*.java | sort | uniq -d` → empty (no duplicate code). S80 (Task 8) also fails the boot on a duplicate.

- [ ] **Step 4: Compile and commit**

Run: `cd backend && ./mvnw -q test` → exit code 0.
```bash
git add backend/src/main/java/com/xray/alerting
git commit -m "feat(alerting): add the fifteen early-warning rules"
```

---

### Task 8: `S80_Alerts` stage

**Files:**
- Create: `pipeline/stages/S80_Alerts.java`

**Interfaces:**
- Produces: tables `alerts`, `alert_states`, `watchlist` (contract items 6–7).

- [ ] **Step 1: The stage**

- `@Component @Order(80)`, `id()` = `"S80_ALERTS"`. Constructor `(ResultWriter writer, List<AlertRule> rules)`; throw `IllegalStateException("duplicate alert code " + c)` when two rules share a code (fail at boot).
- `execute`: skip on empty panels like S70. `limitProfile = ctx.config().products().limitProfile()`.
- `ctx.panels().parallelStream().flatMap(panel -> Arrays.stream(Profile.values()).map(p -> AlertEngine.run(panel, p, p == limitProfile, rules)))` → collect all `Output`s into one list.
- Rows: `alerts` `[type, id, month, profile, code, severity, direction, message, value]`; `alert_states` `[type, id, month, profile, code, severity, direction, value]`. Month = `panel.months().get(m).toString()`; keep a `Map<EntityKey, EntityPanel>` or carry the month string in the output (simplest: map the ordinal through the shared month list of the first panel, all panels have the same months).
- `watchlist`: group the NEGATIVE states by (type, id, month, profile); `n_critical` = CRITICAL count, `n_warn` = WARN count; keep the key when `n_critical ≥ min-critical || n_warn ≥ min-warn`.
- Write the three tables. Log counts and `ctx.report(id(), 85, ...)`.

- [ ] **Step 2: Run and check**

Run the helper. Expected: `DONE`, 13 stages. On the copy, run the SQL block of overview run procedure step 6 (alerts vs states, one alert per key, alert mix, watchlist per month, limit actions). Also:
```sql
-- expect 0: no alert in the first scored month of an entity-profile (F12 seeding)
WITH first AS (SELECT entity_type, entity_id, profile, MIN(month) AS m0 FROM profile_scores WHERE final IS NOT NULL GROUP BY ALL)
SELECT COUNT(*) FROM alerts a JOIN first f USING (entity_type, entity_id, profile) WHERE a.month = f.m0;
-- expect 0: indicator alerts identical across profiles (F11)
SELECT COUNT(*) FROM (
  SELECT entity_type, entity_id, month, code, COUNT(DISTINCT severity) AS k, COUNT(*) AS n FROM alert_states
  WHERE code IN ('RUNWAY_LOW','DSCR_BREACH','LINE_UTIL_HIGH','OVERDUE_RECEIVABLES','CONCENTRATION_HIGH','TAX_GAP')
  GROUP BY ALL) WHERE k > 1;
-- expect only the limit profile
SELECT DISTINCT profile FROM alerts WHERE code = 'LIMIT_ACTION';
-- M23 watchlist share per profile (flag if > 30 % or < 3 % of the 250 groups)
SELECT profile, COUNT(*) FROM watchlist WHERE entity_type = 'GROUP' AND month = '2026-08' GROUP BY 1;
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/com/xray/pipeline/stages/S80_Alerts.java
git commit -m "feat(pipeline): add alerts stage with transitions, states and watchlist"
```

---

### Task 9: Product API (limit, simulator, premium, momentum, timeline, entity detail)

**Files:**
- Create: `application/ProductQuery.java`, `application/SimulateLimitUseCase.java`, `application/AlertReads.java`
- Create: `infrastructure/web/dto/LimitDecisionDto.java`, `LimitSimulationDto.java`, `SimulateLimitRequest.java`, `PremiumQuoteDto.java`, `MomentumDto.java`, `AlertDto.java`
- Modify: `EntityController.java`, `TimelineQuery.java`, `EntityDetailQuery.java`, `dto/TimelinePointDto.java`, `dto/TimelineDto.java`, `dto/EntityDetailDto.java`

The JSON of every DTO is in overview contract item 8. Field names in the records are the JSON names.

- [ ] **Step 1: DTOs**

```java
public record AlertDto(String id, String entityId, String entityName, String entityType, String month, String code,
                       String severity, String direction, String message, Double value) { }
public record LimitDecisionDto(String month, String profile, double finalScore /* @JsonProperty("final") */, String band,
                               double limitEur, Double previousLimitEur, String action, String bindingConstraint,
                               Integer spreadBps, Double allInRate, Double projectedDscr, double baseEur, double factor,
                               double trend, boolean runwayGuard, Double dscrCapEur) { }
public record SimulateLimitRequest(String month, Double requestedAmountEur, Integer termMonths) { }
public record LimitSimulationDto(String month, String decision, double requestedAmountEur, double approvedAmountEur,
                                 double capacityEur, int termMonths, Integer spreadBps, Double allInRate,
                                 Double projectedDscr, String bindingConstraint) { }
public record PremiumQuoteDto(String month, String profile, double finalScore /* "final" */, String band, boolean insurable,
                              Double premiumRate, Double previousPremiumRate, String previousBand, String tierChange,
                              Double recommendedBuyerLimitEur) { }
public record MomentumDto(String month, String profile, int rank, int of, Integer trajPercentile,
                          Integer growthPercentile, boolean risingStar) { }
```
Rounding at the boundary: scores `Scores.round1`; EUR `Math.round`; rates 4 decimals; `factor`, `trend` 3 decimals; DSCR 2 decimals. Add `Scores.round(Double v, int decimals)` if it helps.

- [ ] **Step 2: `AlertReads`** (shared by this task and Task 10)

`@Component` with `List<AlertDto> read(String whereSql, Object... args)` over
`SELECT entity_type, entity_id, month, code, severity, direction, message, value FROM alerts WHERE ...`,
`id = entityType + ":" + entityId + ":" + month + ":" + code`, `entityName = entityId` (the data has no names).
Returns an empty list when `!DuckDbTables.exists(sql, "alerts")`.

- [ ] **Step 3: `ProductQuery`**

- `LimitDecisionDto limit(String id, String monthRaw)`: 404 (`NotFoundException`) for an unknown entity (via `EntityLookup`) or when there is no row; reads `limit_decisions` of the entity's own `entity_type` at the month.
- `PremiumQuoteDto premium(String id, String monthRaw)`: same on `premium_quotes`.
- `MomentumDto momentum(String type, String id, String month)` and the nullable variants `limitOrNull`, `premiumOrNull` for the entity detail (null when the table or row is missing — contract item 8).
- Every read checks `DuckDbTables.exists` first.

- [ ] **Step 4: `SimulateLimitUseCase`**

`LimitSimulationDto simulate(String id, SimulateLimitRequest body)`:
- `requestedAmountEur` null or ≤ 0 → `BadRequestException`. `termMonths` default `limit-engine.default-term-months`; outside [1, 120] → `BadRequestException`. `month` via `ApiParams.month`.
- Load the stored row into a `LimitDecision` (only the fields `simulate` reads: `rawLimitEur`, `nocf12m`, `debtService12m`, `spreadBps`, `allInRate`, `runwayGuard`; the rest from the row too). No row → 404.
- `LimitEngine.simulate(decision, requested, term, config.limitEngine().toParams())` → DTO.

- [ ] **Step 5: Timeline and entity detail**

- `TimelinePointDto` gets `Double limitEur, String limitAction, Double premiumRate, Double buyerLimitEur, int newAlerts` at the end. `TimelineQuery.points` adds LEFT JOINs on `limit_decisions` (profile = `products.limit-profile`), `premium_quotes` (profile = `products.premium-profile`) and a `COUNT(*)` of `alerts` per month for `?profile` — each only when its table exists (build the SQL with the joins you can use; otherwise the fields are null / 0).
- `TimelineDto` gets `List<AlertDto> alerts` (this entity, `?profile`, oldest first).
- `EntityDetailDto`: replace `Object limit, Object premium, Object momentum` with `LimitDecisionDto limit, PremiumQuoteDto premium, MomentumDto momentum`, and add `List<AlertDto> alerts` at the end (months ≤ `?month`, newest first, at most 20). Update its javadoc (decision E8 is closed).

- [ ] **Step 6: Controller**

In `EntityController`:
```java
    @GetMapping("/{id}/limit")
    public LimitDecisionDto limit(@PathVariable String id, @RequestParam(required = false) String month) { ... }

    @PostMapping("/{id}/limit/simulate")
    public LimitSimulationDto simulate(@PathVariable String id, @RequestBody SimulateLimitRequest body) { ... }

    @GetMapping("/{id}/premium")
    public PremiumQuoteDto premium(@PathVariable String id, @RequestParam(required = false) String month) { ... }
```

- [ ] **Step 7: Check**

Run the helper, keep the backend running:
```bash
ID=$(curl -s 'localhost:8081/api/portfolio?profile=BANK&month=2026-08' | jq -r '.rows[0].id')
curl -s "localhost:8081/api/entities/$ID/limit?month=2026-08" | jq
curl -s -X POST "localhost:8081/api/entities/$ID/limit/simulate" -H 'Content-Type: application/json' \
     -d '{"requestedAmountEur": 50000, "termMonths": 24}' | jq
curl -s -o /dev/null -w '%{http_code}\n' -X POST "localhost:8081/api/entities/$ID/limit/simulate" \
     -H 'Content-Type: application/json' -d '{"requestedAmountEur": -1}'                     # 400
curl -s "localhost:8081/api/entities/$ID/premium?month=2026-08" | jq
curl -s "localhost:8081/api/entities/$ID?profile=FUND&month=2026-08" | jq '.limit.action, .premium.band, .momentum, (.alerts | length)'
curl -s "localhost:8081/api/entities/$ID/timeline?profile=BANK" | jq '.points[-1], (.alerts | length)'
curl -s -o /dev/null -w '%{time_total}\n' "localhost:8081/api/entities/$ID?profile=BANK&month=2026-08"   # < 1 s
```

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/xray
git commit -m "feat(api): add limit, simulator, premium and momentum reads"
```

---

### Task 10: Monitor API, portfolio alert counts, meta flags, methodology

**Files:**
- Create: `application/MonitorQuery.java`, `application/MethodologyQuery.java`
- Create: `infrastructure/web/controller/MonitorController.java`, `controller/MethodologyController.java`
- Create: `dto/WatchlistRowDto.java`, `MonitorDto.java`, `WatchlistDto.java`, `MethodologyDto.java`
- Modify: `PortfolioQuery.java`, `dto/PortfolioRowDto.java`, `MetaQuery.java`, `dto/MetaDto.java`

- [ ] **Step 1: Portfolio rows**

- `PortfolioRowDto` gets `Boolean risingStar` as its last component. Every `new PortfolioRowDto(...)` call gets the extra argument.
- `PortfolioQuery.rows` replaces the constant `0` of `activeAlerts` with the count of NEGATIVE `alert_states` at the month for `?profile` (F16), and reads `rising_star` from `momentum_screen` at the month (momentum profile, whatever `?profile` is). Do it with two small follow-up queries keyed by `entity_id` (like `sparklines`), each skipped when its table does not exist (0 / null then).

- [ ] **Step 2: `MonitorQuery`**

- `MonitorDto alerts(String profileRaw, String monthRaw, String severity, String direction, Integer window)`: `window` default 6, must be in [1, 24]; `severity` ∈ `WARN, CRITICAL, INFO`, `direction` ∈ `NEGATIVE, POSITIVE` (case-insensitive, else 400). `fromMonth = params.minus(month, window - 1)`. Alerts of `entity_type = unit`, `profile`, `month BETWEEN fromMonth AND month`, ordered `month DESC, CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'WARN' THEN 1 ELSE 2 END, entity_id`. Plus `watchlist(...)` rows.
- `List<WatchlistRowDto> watchlist(Profile p, String month)`: `watchlist` rows of the unit at the month; `row` = the entity's `PortfolioRowDto` (one `PortfolioQuery.rows(unit, null, null, p, month)` call, then pick by id); `codes` = the distinct NEGATIVE `alert_states` codes at the month; sort `criticalAlerts DESC, warnAlerts DESC, row.final ASC`.
- `WatchlistDto watchlist(String profileRaw, String monthRaw)`.
- `List<ReplayFrameDto> frames(Profile p, String from, String to)` for Task 11: one frame per month in `params.months()` between `from` and `to`, with that month's alerts (same ordering) and the watchlist count (one `GROUP BY month` query).

- [ ] **Step 3: `MethodologyQuery`**

`MethodologyDto methodology()` built from `ScoringConfig` and the `List<AlertRule>` beans (overview contract item 8, `Methodology`):
- `alertRules`: for each rule, sorted by the SPEC §8.5 order (use the order of the table in the overview contract item 6 `code` list), `code`, `direction`, `event`, `trigger`, `fired` = `SELECT code, COUNT(*) FROM alerts WHERE entity_type = unit GROUP BY 1` (0 when absent).
- `products`, `limitEngine` (with `referenceRateIsExample: true` — CLAUDE.md open items; a boolean constant in the query is fine, it is a disclosure, not a parameter), `insurer`, `momentum`, `watchlist` straight from the config. **No weights** (contract item 9).

- [ ] **Step 4: Meta**

`MetaDto` gets `boolean alertsReady, boolean productsReady` at the end: `DuckDbTables.exists(sql, "alerts")`, `DuckDbTables.exists(sql, "limit_decisions")`. Add one caveat line to the list MetaQuery returns: "El límite de circulante, la prima y la lista de vigilancia usan umbrales provisionales y un tipo de referencia de ejemplo." (Spanish UI copy, like the existing caveats — check the language of the current ones and match it).

- [ ] **Step 5: Controllers**

```java
@RestController
@RequestMapping("/api/monitor")
public class MonitorController {
    @GetMapping("/alerts")    public MonitorDto alerts(@RequestParam(required = false) String profile, @RequestParam(required = false) String month,
                                                       @RequestParam(required = false) String severity, @RequestParam(required = false) String direction,
                                                       @RequestParam(required = false) Integer window) { ... }
    @GetMapping("/watchlist") public WatchlistDto watchlist(@RequestParam(required = false) String profile, @RequestParam(required = false) String month) { ... }
    // replay: Task 11
}

@RestController
@RequestMapping("/api/methodology")
public class MethodologyController { @GetMapping public MethodologyDto methodology() { ... } }
```

- [ ] **Step 6: Check**

```bash
curl -s 'localhost:8081/api/monitor/alerts?profile=BANK&month=2026-08' | jq '.fromMonth, (.alerts | length), .alerts[0], (.watchlist | length), .watchlist[0]'
curl -s 'localhost:8081/api/monitor/alerts?profile=BANK&month=2026-08&direction=POSITIVE' | jq '[.alerts[].severity] | unique'   # ["INFO"]
curl -s -o /dev/null -w '%{http_code}\n' 'localhost:8081/api/monitor/alerts?severity=LOUD'                                     # 400
curl -s 'localhost:8081/api/monitor/watchlist?profile=INSURER&month=2026-08' | jq '.rows | length'
curl -s 'localhost:8081/api/portfolio?profile=BANK&month=2026-08' | jq '[.rows[].activeAlerts] | add, ([.rows[] | select(.risingStar)] | length)'
curl -s localhost:8081/api/methodology | jq '.alertRules | length, map(select(.fired == 0) | .code)'
curl -s localhost:8081/api/meta | jq '.alertsReady, .productsReady'
curl -s -o /dev/null -w '%{time_total}\n' 'localhost:8081/api/monitor/alerts?profile=BANK&month=2026-08'   # < 1 s
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/xray
git commit -m "feat(api): add monitor alerts, watchlist, portfolio alert counts and methodology"
```

---

### Task 11: SSE monitor replay

**Files:**
- Create: `application/MonitorReplayUseCase.java`, `dto/ReplayFrameDto.java`
- Modify: `controller/MonitorController.java`

- [ ] **Step 1: The use case**

```java
package com.xray.application;

/**
 * GET /api/monitor/replay (SPEC §8.5, ARCHITECTURE §10): replays the stored causal alerts month by month.
 * Frames are read once, up front; the stream only paces them. Nothing is recomputed.
 */
@Service
public class MonitorReplayUseCase implements DisposableBean {

    private static final int DEFAULT_STEP_MS = 1200;
    private static final int MIN_STEP_MS = 200;
    private static final int MAX_STEP_MS = 5000;
    private static final int DEFAULT_FROM_INDEX = 6;   // M06 (SPEC §8.5 "play M06 → M23")

    private final ApiParams params;
    private final MonitorQuery monitor;
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "monitor-replay");
        t.setDaemon(true);
        return t;
    });

    // constructor

    public SseEmitter stream(String profileRaw, String fromRaw, String toRaw, Integer stepMsRaw) {
        Profile p = params.profile(profileRaw);
        List<String> months = params.months();
        String from = fromRaw == null || fromRaw.isBlank()
                ? months.get(Math.min(DEFAULT_FROM_INDEX, months.size() - 1)) : params.month(fromRaw);
        String to = params.month(toRaw);
        if (from.compareTo(to) > 0) {
            throw new BadRequestException("from " + from + " is after to " + to);
        }
        int step = Math.max(MIN_STEP_MS, Math.min(MAX_STEP_MS, stepMsRaw == null ? DEFAULT_STEP_MS : stepMsRaw));
        List<ReplayFrameDto> frames = monitor.frames(p, from, to);

        SseEmitter emitter = new SseEmitter((long) step * (frames.size() + 2) + 10_000L);
        AtomicInteger next = new AtomicInteger();
        AtomicReference<ScheduledFuture<?>> task = new AtomicReference<>();
        Runnable stop = () -> {
            ScheduledFuture<?> f = task.get();
            if (f != null) f.cancel(false);
        };
        task.set(scheduler.scheduleAtFixedRate(() -> {
            try {
                int k = next.getAndIncrement();
                if (k < frames.size()) {
                    emitter.send(SseEmitter.event().name("month").data(frames.get(k), MediaType.APPLICATION_JSON));
                } else {
                    emitter.send(SseEmitter.event().name("done").data(Map.of(), MediaType.APPLICATION_JSON));
                    emitter.complete();
                    stop.run();
                }
            } catch (IOException | IllegalStateException e) {   // client gone
                stop.run();
            }
        }, 100, step, TimeUnit.MILLISECONDS));
        emitter.onCompletion(stop);
        emitter.onTimeout(stop);
        emitter.onError(t -> stop.run());
        return emitter;
    }

    @Override
    public void destroy() {
        scheduler.shutdownNow();
    }
}
```
`record ReplayFrameDto(String month, List<AlertDto> newAlerts, int watchlistSize)`.

- [ ] **Step 2: The endpoint**

```java
    @GetMapping(path = "/replay", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter replay(@RequestParam(required = false) String profile, @RequestParam(required = false) String from,
                             @RequestParam(required = false) String to, @RequestParam(required = false) Integer stepMs,
                             HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("X-Accel-Buffering", "no");   // nginx must not buffer the stream (plan B Task 11)
        return replay.stream(profile, from, to, stepMs);
    }
```
A `BadRequestException` thrown before the emitter is returned still maps to 400 through `ApiExceptionHandler`. Check it: the handler must not try to write JSON into a `text/event-stream` response. If it fails with `HttpMediaTypeNotAcceptableException`, validate the params in the controller before setting the headers and return `ResponseEntity.badRequest()` — or make the handler return `ResponseEntity<String>` with `MediaType.TEXT_PLAIN`.

- [ ] **Step 3: Check**

```bash
curl -sN 'localhost:8081/api/monitor/replay?profile=BANK&stepMs=200' | head -12
# event:month / data:{"month":"2025-03","newAlerts":[...],"watchlistSize":N} ... then event:done
curl -sN 'localhost:8081/api/monitor/replay?profile=BANK&from=2026-06&to=2026-08&stepMs=200' | grep -c '^event:month'   # 3
curl -s -o /dev/null -w '%{http_code}\n' 'localhost:8081/api/monitor/replay?from=2026-08&to=2026-01'                # 400
```
Open two replays at once and stop one with Ctrl-C: the other keeps streaming, and the log shows no stack trace for the closed one.

Demo mode: restart with `XRAY_DEMO_MODE=true SERVER_PORT=8081 ./mvnw -q spring-boot:run` on the same database and check the replay still streams (it only reads).

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/xray
git commit -m "feat(api): stream the monitor replay over server-sent events"
```

---

### Task 12: Tidy up and full check

**Files:** any file of this plan.

- [ ] **Step 1: Architecture rules**

```bash
cd backend/src/main/java/com/xray
grep -rn "org.springframework\|java.sql\|com.xray.config" domain alerting/*.java     # nothing
grep -rn "0\.035\|1\.25\|2500\|rising" domain alerting application | grep -v "^.*//" # no config value hardcoded
```
Fix anything these find. (`alerting/rules/` may import Spring and config; `alerting/*.java` may not.)

- [ ] **Step 2: Tests and a clean run**

Run: `cd backend && ./mvnw -q test` → exit code 0 (five classes). No scratch test left: `git status --short backend/src/test` shows only `ScoringConfigValidationTest.java`, if anything.
Run the helper from a deleted database. Expected: `DONE`, 13 stages. Write down the total time and each stage's ms.

- [ ] **Step 3: Timing of every endpoint**

With the backend running, `curl -w '%{time_total}'` each endpoint of contract item 8 once for BANK at 2026-08. All < 1 s.

- [ ] **Step 4: Commit** (only if something changed)

```bash
git commit -am "refactor(backend): tidy phase 5 products and alerts"
```

---

### Task 13: Final report

**Files:** none. Do **not** edit `docs/`.

- [ ] **Step 1: Collect the findings on a copy of the database**

```sql
-- alert mix of the unit at M23 per profile
SELECT profile, code, severity, COUNT(*) FROM alert_states WHERE entity_type = 'GROUP' AND month = '2026-08' GROUP BY ALL ORDER BY 1, 4 DESC;
-- alerts per month (replay feel), BANK
SELECT month, COUNT(*) FROM alerts WHERE entity_type = 'GROUP' AND profile = 'BANK' GROUP BY 1 ORDER BY 1;
-- watchlist size per month and profile
SELECT profile, month, COUNT(*) FROM watchlist WHERE entity_type = 'GROUP' GROUP BY ALL ORDER BY 1, 2;
-- limit action and binding mix
SELECT action, binding_constraint, COUNT(*) FROM limit_decisions WHERE entity_type = 'GROUP' GROUP BY ALL ORDER BY 3 DESC;
-- showcase: a REDUCE or FREEZE up to 6 months before the first CRITICAL / STRUCTURAL_DECLINE status (BANK)
WITH ev AS (
  SELECT entity_id, MIN(month) AS e FROM profile_scores
  WHERE entity_type = 'GROUP' AND profile = 'BANK' AND status IN ('CRITICAL', 'STRUCTURAL_DECLINE') AND month >= '2025-03'
  GROUP BY 1),
cut AS (
  SELECT l.entity_id, MIN(l.month) AS s FROM limit_decisions l JOIN ev USING (entity_id)
  WHERE l.entity_type = 'GROUP' AND l.action IN ('REDUCE', 'FREEZE') AND l.month < ev.e
    AND l.month >= strftime(strptime(ev.e || '-01', '%Y-%m-%d') - INTERVAL 6 MONTH, '%Y-%m')
  GROUP BY 1)
SELECT ev.entity_id, cut.s AS first_cut, ev.e AS event,
       date_diff('month', strptime(cut.s || '-01', '%Y-%m-%d'), strptime(ev.e || '-01', '%Y-%m-%d')) AS lead_months
FROM ev JOIN cut USING (entity_id) ORDER BY lead_months DESC, entity_id LIMIT 10;
-- products never fired / never used
SELECT code, COUNT(*) FROM alerts GROUP BY 1 ORDER BY 2;
```

- [ ] **Step 2: Report**

Reply with:
1. Commits (one line each).
2. Stage timings (13 stages) and the total.
3. The tables above, short.
4. The showcase entities (at least one expected, see the overview "Done when"). If there is none, say so, and give the entity with the largest limit drop before its first `CRITICAL` month instead.
5. Anything in this plan you had to change, and why (for example a column name in `ind30_base`, the exception handler on the SSE endpoint).
6. Config values that look wrong against the data (watchlist share at M23 outside 3–30 %, an alert that fires for more than half of the groups, `DSCR` binding almost always). Do not tune them: list them for the human review.
