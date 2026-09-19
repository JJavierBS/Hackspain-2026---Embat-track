# Phase 3 · Plan B — Indicators: payment, delinquency, concentration + scoring core (S40–S60)

> **For agentic workers:** Claude Code: use superpowers:executing-plans (or superpowers:subagent-driven-development) to run this plan task by task. Antigravity or other agents: do the checkboxes in order. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write `sql/35`–`37` (9 indicators) and the Java scoring core. `S40` turns raw values into anchor levels, `S50` adds trajectories, `S60` builds categories and the three profiles and writes `indicator_values`, `category_scores` and `profile_scores`. When A's branch merges, the whole of M2 is done and M3 is done except for the API and the submission.

**Architecture:** The SQL files INSERT long rows into `indicator_values_raw` (overview contract items 2–9). The Java core is pure `domain/service` code (`AnchorInterpolator`, `TrajectoryCalculator`, `CategoryAggregator`, `ProfileScorer`), unit-tested without Spring. Three thin `@Component` stages map `ScoringConfig` to domain parameters, walk `ctx.panels()` in parallel, and write the results with `ResultWriter`.

**Tech Stack:** DuckDB SQL, Java 21, Spring Boot 3.5, JUnit 5.

**Spec:** `docs/SPEC.md` §6 (PAY, DEL, CON rows), §7.1–§7.4, §8.3 (bands). `docs/ARCHITECTURE.md` §3, §4.2, §4.3, §4.4, §7, §9. Shared contract, decisions D1–D9 and path ownership: `docs/superpowers/plans/2026-09-19-phase3-overview.md`. **Read the overview before Task 1.**

## Global Constraints

- Edit only the paths that the overview gives to plan B.
- Java 21 target. The machine's JDK 21 has no `javac`. The default `java` (JDK 25) compiles with `--release 21`, so run plain `./mvnw ...`.
- No JPA, no Lombok, no new Maven dependency.
- `domain/` imports nothing from `org.springframework`, `java.sql` **or `com.xray.config`** (contract item 11). Stages convert config records to domain records.
- Never hardcode a weight, lambda, anchor or threshold (CLAUDE.md rule 5). Code iterates `Category`, `IndicatorId` and `Profile` and reads the maps.
- Causality: a value for month m reads only indices `0..m` (`CausalWindow`). `LookAheadTest` (Block 8) will check this.
- Tests: add only `AnchorInterpolatorTest` and `ProfileRenormalizationTest` (package `com.xray.domain.service`). A scratch test is allowed locally and is deleted before the commit.
- Commits: Conventional Commits, English, lowercase subject. Commit after each task.
- The backend in the IDE may hold `data/xray.duckdb`. Run your checks on another port and another data dir (Task 0).
- On this branch only B's 9 indicators have rows. A's 13 indicators stay unavailable until the merge, so `profile_scores` covers only PAYMENT_BEHAVIOUR, DELINQUENCY and CONCENTRATION. That is expected.

## File Structure

```
backend/src/main/resources/sql/
  35_ind_payment.sql          PAY_DSO, PAY_DPO, PAY_SUPPLIER_LATENESS, PAY_OVERDUE_PAYABLES
  36_ind_delinquency.sql      DEL_OVERDUE_RECEIVABLES, DEL_AGING_90
  37_ind_concentration.sql    CON_HHI_CUSTOMERS, CON_HHI_SUPPLIERS, CON_CUSTOMER_CHURN
backend/src/main/java/com/xray/
  domain/model/SubScore.java          level + trajectory + availability
  domain/model/CategoryScore.java
  domain/model/ProfileScore.java      final, level, traj, band, momentum, persistence, effective weights
  domain/model/Band.java              A..E
  domain/model/BandThresholds.java    lower bounds of A..D
  domain/model/EntityPanel.java       + subScores, categories, profileScores
  domain/service/AnchorInterpolator.java
  domain/service/TrajectoryCalculator.java
  domain/service/CategoryAggregator.java
  domain/service/ProfileScorer.java
  pipeline/stages/S30_RawIndicators.java   + availability log
  pipeline/stages/S40_Normalize.java
  pipeline/stages/S50_Trajectory.java
  pipeline/stages/S60_Score.java
backend/src/test/java/com/xray/domain/service/
  AnchorInterpolatorTest.java
  ProfileRenormalizationTest.java
```

---

### Task 0: Scratch run environment

**Files:** none committed.

- [ ] **Step 1:** `S=/tmp/xray-b && rm -rf $S && mkdir -p $S && ln -s "$(git rev-parse --show-toplevel)/data/raw" $S/raw`
- [ ] **Step 2: Build and run once on port 8082.**
  ```bash
  cd backend && ./mvnw -q -DskipTests package
  SERVER_PORT=8082 XRAY_DATA_DIR=/tmp/xray-b java -jar target/xray-backend-0.0.1-SNAPSHOT.jar > /tmp/xray-b/boot.log 2>&1 &
  until curl -s localhost:8082/api/pipeline/status | grep -qE '"state":"(DONE|FAILED)"'; do sleep 2; done
  curl -s localhost:8082/api/pipeline/status; kill %1
  ```
- [ ] **Step 3: Query tool.** Use the DuckDB CLI if it exists. Otherwise, with the backend **stopped**:
  ```bash
  J=$(ls ~/.m2/repository/org/duckdb/duckdb_jdbc/1.5.5.1/*.jar)
  java --enable-native-access=ALL-UNNAMED -cp $J scripts/DuckQuery.java /tmp/xray-b/xray.duckdb "SELECT COUNT(*) FROM entity_months"
  ```
  Expected: `36864`.

"Run the pipeline" means Step 2, and "query" means Step 3.

---

### Task 1: `sql/35_ind_payment.sql`

`monthly_invoices` has a row for every month in which an invoice is new, paid or open. A missing month means "nothing open", so `COALESCE(…, 0)` is right **inside** the months of an entity that has invoices of that direction. An entity with no invoice of a direction has no row for it, and those indicators are unavailable (rule 3; 501 companies have no invoices, Q8).

- [ ] **Step 1: Helper table** (per entity, direction and month, dense over `entity_months` for the directions that exist):
  ```sql
  -- 35_ind_payment.sql — PAY_DSO, PAY_DPO, PAY_SUPPLIER_LATENESS, PAY_OVERDUE_PAYABLES (SPEC §6).
  -- COMPANY rows include intragroup invoices (standalone view), GROUP rows have none (contract item 7).
  CREATE OR REPLACE TABLE ind35_inv AS
  WITH mi AS (
    SELECT entity_type, entity_id, month, direction,
           SUM(new_eur) AS new_eur, SUM(paid_eur) AS paid_eur, SUM(paid_days_x_eur) AS paid_days_x_eur,
           SUM(paid_late_days_x_eur) AS paid_late_days_x_eur,
           SUM(overdue_eur) AS overdue_eur, SUM(overdue_90p_eur) AS overdue_90p_eur
    FROM monthly_invoices GROUP BY 1, 2, 3, 4),
  dirs AS (SELECT DISTINCT entity_type, entity_id, direction FROM monthly_invoices),
  g AS (
    SELECT em.entity_type, em.entity_id, em.month, em.month_idx, em.is_active, d.direction,
           COALESCE(mi.new_eur, 0) AS new_eur, COALESCE(mi.paid_eur, 0) AS paid_eur,
           COALESCE(mi.paid_days_x_eur, 0) AS paid_days_x_eur,
           COALESCE(mi.paid_late_days_x_eur, 0) AS paid_late_days_x_eur,
           COALESCE(mi.overdue_eur, 0) AS overdue_eur, COALESCE(mi.overdue_90p_eur, 0) AS overdue_90p_eur
    FROM entity_months em
    JOIN dirs d ON d.entity_type = em.entity_type AND d.entity_id = em.entity_id
    LEFT JOIN mi ON mi.entity_type = em.entity_type AND mi.entity_id = em.entity_id
                AND mi.month = em.month AND mi.direction = d.direction)
  SELECT *,
         SUM(is_active::INTEGER) OVER w3   AS act_3m,
         SUM(new_eur) OVER w3              AS new_3m,
         SUM(paid_eur) OVER w3             AS paid_3m,
         SUM(paid_days_x_eur) OVER w3      AS paid_days_3m,
         SUM(paid_late_days_x_eur) OVER w3 AS paid_late_3m
  FROM g
  WINDOW w3 AS (PARTITION BY entity_type, entity_id, direction ORDER BY month_idx
                ROWS BETWEEN 2 PRECEDING AND CURRENT ROW);
  ```
- [ ] **Step 2: The four indicators.** Each one starts from `entity_months` so every grid row gets exactly one output row (contract item 4):
  ```sql
  INSERT INTO indicator_values_raw
  SELECT em.entity_type, em.entity_id, em.month, 'PAY_DSO',
         CASE WHEN ok THEN v END, ok, FALSE, FALSE
  FROM (
    SELECT em.*, i.v, COALESCE(em.is_active AND i.act_3m = 3 AND i.v IS NOT NULL, FALSE) AS ok
    FROM entity_months em
    LEFT JOIN (SELECT entity_type, entity_id, month, act_3m,
                      CASE WHEN paid_3m > 0 THEN paid_days_3m / paid_3m END AS v
               FROM ind35_inv WHERE direction = 'ISSUED') i
      ON i.entity_type = em.entity_type AND i.entity_id = em.entity_id AND i.month = em.month) em;
  ```
  - `PAY_DSO`: ISSUED, `paid_days_3m / paid_3m`. Nothing paid in 3m → unavailable (no rate to measure; both are 0, D3).
  - `PAY_DPO`: RECEIVED, same formula.
  - `PAY_SUPPLIER_LATENESS`: RECEIVED, `paid_late_3m / paid_3m`.
  - `PAY_OVERDUE_PAYABLES`: RECEIVED, `overdue_eur (at m) / new_3m`. Lower is better. Zero denominator (D3): `new_3m = 0 AND overdue_eur > 0` → `${worst_x_PAY_OVERDUE_PAYABLES}`. Both 0 → unavailable.
  Keep `ind35_inv`: `sql/36` reads it and drops it.
- [ ] **Step 3: Run and check.**
  ```sql
  SELECT entity_type, indicator_id, COUNT(*), ROUND(AVG(available::INT), 3), quantile_cont(value, [0.05, 0.5, 0.95])
  FROM indicator_values_raw GROUP BY 1, 2 ORDER BY 1, 2;
  ```
  Expected: COUNT = 30,864 (COMPANY) and 6,000 (GROUP) for each of the 4. The weighted DSO median should be near the amount-weighted figures of Block 2 (ISSUED 27.9 days, RECEIVED 26.1). No duplicates.
- [ ] **Step 4: Commit** `feat(sql): add payment behaviour indicators`.

---

### Task 2: `sql/36_ind_delinquency.sql`

- [ ] **Step 1: `DEL_OVERDUE_RECEIVABLES`**: ISSUED `overdue_eur / new_3m`, `act_3m = 3`. Zero denominator: `new_3m = 0 AND overdue_eur > 0` → `${worst_x_DEL_OVERDUE_RECEIVABLES}`. Both 0 → unavailable.
- [ ] **Step 2: `DEL_AGING_90`**: ISSUED `overdue_90p_eur / overdue_eur` at m. Nothing overdue → both 0 → **unavailable** (D3). The category then rests on `DEL_OVERDUE_RECEIVABLES`, which is 0 → level 100.
- [ ] **Step 3:** `DROP TABLE ind35_inv;` at the end of the file.
- [ ] **Step 4: Check the aging quantiles** (Block 2 open question 4: 41 % of ISSUED overdue is 90+ days, because unpaid invoices stay open up to the snapshot, Q10). Report p5/p25/p50/p75/p95 of `DEL_AGING_90` for GROUP. If p50 ≥ 0.5, the closed anchors (`≥50% → 0`) score most entities 0: **write this in your final report** (the human decides after the merge; don't change anchors).
- [ ] **Step 5: Commit** `feat(sql): add delinquency indicators`.

---

### Task 3: `sql/37_ind_concentration.sql` (decision D9)

Coverage = the share of the window's operating flow that has a counterparty:
`Σ monthly_counterparty.amount_eur (direction, window) / Σ operating flow (window)`. The operating flow is `monthly_flows` inflow of `OPERATING_IN` for IN, and outflow of `OPERATING_OUT` for OUT, at the same `entity_type`. Below `${con_min_coverage}` → unavailable.

- [ ] **Step 1: Coverage first (data check).** Before you write the indicators, compute the 6m coverage per GROUP-month and report its distribution and the share of group-months ≥ `${con_min_coverage}` (IN and OUT). The planning-time figures are 4.9 % of the inflow amount and a per-company median of 26 %. **If fewer than 20 % of active group-months pass the threshold, stop and ask the human** (the threshold is provisional).
- [ ] **Step 2: HHI.** For direction IN (customers) and OUT (suppliers), 6m window, `act_6m = 6`:
  ```sql
  -- per entity-month m: amount per counterparty over months m-5..m, then shares, then sum of squares
  CREATE OR REPLACE TABLE ind37_cp AS
  SELECT mc.entity_type, mc.entity_id, m.month_idx, mc.direction, mc.counterparty_id, SUM(mc.amount_eur) AS amt
  FROM monthly_counterparty mc JOIN months m ON m.month = mc.month
  GROUP BY 1, 2, 3, 4, 5;

  -- window: join the grid to ind37_cp on cp.month_idx BETWEEN em.month_idx - 5 AND em.month_idx,
  -- sum amt per (entity, m, direction, counterparty), then
  -- hhi = 10000 * SUM(POWER(amt / total_identified, 2)), coverage = total_identified / operating_flow_6m
  ```
  `CON_HHI_CUSTOMERS` = IN, `CON_HHI_SUPPLIERS` = OUT. Available when `is_active AND act_6m = 6 AND coverage >= ${con_min_coverage}` and the identified total > 0.
- [ ] **Step 3: `CON_CUSTOMER_CHURN`** (SPEC: share of recurring customers, active in ≥ 3 of the previous 6 months, with zero inflow in the last 2 months). Count-based, direction IN:
  - recurring at m = IN counterparties with `amt > 0` in at least 3 of the months `m−7 … m−2`
  - churned = the recurring counterparties with no IN amount in `m−1 … m`
  - `value = churned / recurring`. No recurring customers → unavailable.
  - Available when `is_active`, all 8 months `m−7 … m` active, and the coverage over `m−7 … m` ≥ `${con_min_coverage}`.
- [ ] **Step 4:** Drop `ind37_cp`. Run, then check the counts, duplicates and quantiles. HHI must be within [0, 10000].
- [ ] **Step 5: Commit** `feat(sql): add concentration indicators with counterparty coverage guard`.

---

### Task 4: Availability log in S30

M2 asks that the availability % per indicator is logged.

- [ ] **Step 1:** At the end of `S30_RawIndicators.execute`, after the panels load:
  ```java
  for (IndicatorId id : IndicatorId.values()) {
      long avail = panels.stream().flatMap(p -> Arrays.stream(p.rawSeries(id))).filter(RawIndicator::available).count();
      long total = (long) panels.size() * months.size();
      log.info("{} availability {} {}/{} ({}%)", id(), id, avail, total, total == 0 ? 0 : avail * 100 / total);
  }
  ```
- [ ] **Step 2:** Run the pipeline. The log must show 22 lines. On this branch only B's 9 indicators are > 0 %.
- [ ] **Step 3: Commit** `feat(pipeline): log indicator availability after loading panels`.

---

### Task 5: Domain model and `AnchorInterpolator` (+ `AnchorInterpolatorTest`)

**Files:** `domain/model/SubScore.java`, `CategoryScore.java`, `ProfileScore.java`, `Band.java`, `BandThresholds.java`, `EntityPanel.java`, `domain/service/AnchorInterpolator.java`, test.

- [ ] **Step 1: Records.**
  ```java
  package com.xray.domain.model;

  /** Level from anchors, trajectory from the level series (SPEC §7.1, §7.2). trajectory null = not computable. */
  public record SubScore(double level, Double trajectory, boolean available) {
      public static SubScore missing() { return new SubScore(0, null, false); }
      public SubScore withTrajectory(Double t) { return new SubScore(level, t, available); }
  }
  ```
  ```java
  /** Mean of the available indicator sub-scores of one category (SPEC §7.3). level null = no indicator available. */
  public record CategoryScore(Double level, Double traj, int nAvailable) {
      public static CategoryScore missing() { return new CategoryScore(null, null, 0); }
      public boolean available() { return level != null; }
  }
  ```
  ```java
  // BandThresholds.java
  /** Lower bounds of bands A..D (SPEC §8.3). Below d is E. */
  public record BandThresholds(double a, double b, double c, double d) {}
  ```
  ```java
  // Band.java
  public enum Band {
      A, B, C, D, E;
      public static Band of(double score, BandThresholds t) {
          if (score >= t.a()) return A;
          if (score >= t.b()) return B;
          if (score >= t.c()) return C;
          if (score >= t.d()) return D;
          return E;
      }
  }
  ```
  ```java
  /**
   * One profile at one month (SPEC §7.3–§7.4). finalScore null = no category available.
   * effectiveWeights = w' renormalized over the available categories (MOMENTUM included when available),
   * summing to 1. S65 uses them for the exact additive explanation (SPEC §7.5).
   */
  public record ProfileScore(Double finalScore, Double level, Double traj, Band band,
                             Double momentum, int momPersistence, Map<Category, Double> effectiveWeights) {}
  ```
- [ ] **Step 2: `EntityPanel`**: add, next to `raw`, EnumMaps initialized like `raw`:
  ```java
  private final Map<IndicatorId, SubScore[]> subScores = new EnumMap<>(IndicatorId.class);   // S40, S50
  private final Map<Category, CategoryScore[]> categories = new EnumMap<>(Category.class);  // S60
  private final Map<Profile, ProfileScore[]> profileScores = new EnumMap<>(Profile.class);  // S60
  ```
  Fill `subScores` with `SubScore.missing()` in the constructor. Add the accessors `subScores(IndicatorId)`, `setSubScore(IndicatorId, int, SubScore)`, `categoryScores(Category)` / `setCategoryScores(Category, CategoryScore[])`, `profileScores(Profile)` / `setProfileScores(Profile, ProfileScore[])`. Keep the existing API unchanged.
- [ ] **Step 3: Write the failing test** `backend/src/test/java/com/xray/domain/service/AnchorInterpolatorTest.java`:
  ```java
  class AnchorInterpolatorTest {
      private static final List<double[]> RUNWAY = List.of(
              new double[]{0, 0}, new double[]{1, 20}, new double[]{3, 50}, new double[]{6, 75}, new double[]{12, 100});
      private static final List<double[]> DSCR = List.of(
              new double[]{0.8, 0}, new double[]{1.0, 30}, new double[]{1.25, 60}, new double[]{2.0, 85}, new double[]{3.0, 100});
      private static final List<double[]> DSO = List.of(     // lower is better
              new double[]{30, 100}, new double[]{60, 70}, new double[]{90, 40}, new double[]{150, 0});

      @Test void interpolatesBetweenAnchors() {
          assertEquals(35.0, AnchorInterpolator.score(2.0, RUNWAY), 1e-9);
          assertEquals(10.0, AnchorInterpolator.score(0.5, RUNWAY), 1e-9);
          assertEquals(85.0, AnchorInterpolator.score(45.0, DSO), 1e-9);
      }
      @Test void hitsAnchorsExactly() {
          assertEquals(50.0, AnchorInterpolator.score(3.0, RUNWAY), 1e-9);
          assertEquals(60.0, AnchorInterpolator.score(1.25, DSCR), 1e-9);
      }
      @Test void neverExtrapolatesBelowFirstOrAboveLast() {
          assertEquals(0.0, AnchorInterpolator.score(0.3, DSCR), 1e-9);     // ARCHITECTURE §4.3 example
          assertEquals(0.0, AnchorInterpolator.score(-5.0, RUNWAY), 1e-9);
          assertEquals(100.0, AnchorInterpolator.score(30.0, RUNWAY), 1e-9);
          assertEquals(100.0, AnchorInterpolator.score(10.0, DSO), 1e-9);
          assertEquals(0.0, AnchorInterpolator.score(400.0, DSO), 1e-9);
      }
      @Test void resultIsAlwaysWithin0And100() {
          for (double x = -10; x <= 200; x += 0.37) {
              double s = AnchorInterpolator.score(x, DSO);
              assertTrue(s >= 0 && s <= 100, "x=" + x + " -> " + s);
          }
      }
      @Test void rejectsNaNAndShortAnchorLists() {
          assertThrows(IllegalArgumentException.class, () -> AnchorInterpolator.score(Double.NaN, RUNWAY));
          assertThrows(IllegalArgumentException.class, () -> AnchorInterpolator.score(1, List.of(new double[]{0, 0})));
      }
  }
  ```
  Run `./mvnw -q test -Dtest=AnchorInterpolatorTest`. It must fail (the class doesn't exist yet).
- [ ] **Step 4: Implement.**
  ```java
  package com.xray.domain.service;

  /** Piecewise-linear anchors, clamped to [0,100], NO extrapolation (ARCHITECTURE §4.3, SPEC §7.1). */
  public final class AnchorInterpolator {
      private AnchorInterpolator() {}

      public static double score(double value, List<double[]> anchors) {
          if (Double.isNaN(value)) throw new IllegalArgumentException("value is NaN");
          if (anchors == null || anchors.size() < 2) throw new IllegalArgumentException("need at least 2 anchors");
          double[] first = anchors.get(0);
          double[] last = anchors.get(anchors.size() - 1);
          if (value <= first[0]) return clamp(first[1]);
          if (value >= last[0]) return clamp(last[1]);
          for (int i = 1; i < anchors.size(); i++) {
              double[] a = anchors.get(i - 1), b = anchors.get(i);
              if (value <= b[0]) return clamp(a[1] + (value - a[0]) / (b[0] - a[0]) * (b[1] - a[1]));
          }
          return clamp(last[1]);
      }

      static double clamp(double s) { return Math.max(0, Math.min(100, s)); }
  }
  ```
- [ ] **Step 5:** `./mvnw -q test`. All pass (Anchor, Rollup, ScoringConfigValidation).
- [ ] **Step 6: Commit** `feat(domain): add sub-score model and anchor interpolator`.

---

### Task 6: `TrajectoryCalculator` (SPEC §7.2)

- [ ] **Step 1: Implement**, with params as a domain record (contract item 11):
  ```java
  package com.xray.domain.service;

  /**
   * Trajectory sub-score from a level series (SPEC §7.2). Causal: out[m] reads levels[0..m] only.
   * levels[i] == null means the indicator is unavailable in month i.
   */
  public final class TrajectoryCalculator {
      /** SPEC §7.2 "delta3": smoothed(m) − smoothed(m−3). Part of the definition, not a tunable. */
      static final int DELTA_MONTHS = 3;

      public record Params(int smoothingWindow, int slopeWindow, int minPoints,
                           double slopeToScoreSpan, double slopeWeight, double deltaWeight) {}

      private TrajectoryCalculator() {}

      public static Double[] compute(Double[] levels, Params p) {
          int n = levels.length;
          Double[] smooth = new Double[n];
          for (int m = 0; m < n; m++) {
              int[] w = CausalWindow.window(m, p.smoothingWindow());
              double sum = 0; int k = 0;
              for (int i = w[0]; i <= w[1]; i++) if (levels[i] != null) { sum += levels[i]; k++; }
              smooth[m] = k == 0 ? null : sum / k;
          }
          Double[] out = new Double[n];
          for (int m = 0; m < n; m++) {
              if (levels[m] == null || smooth[m] == null || m < DELTA_MONTHS || smooth[m - DELTA_MONTHS] == null) continue;
              int[] w = CausalWindow.window(m, p.slopeWindow());
              double sx = 0, sy = 0, sxx = 0, sxy = 0; int k = 0;
              for (int i = w[0]; i <= w[1]; i++) {
                  if (smooth[i] == null) continue;
                  sx += i; sy += smooth[i]; sxx += (double) i * i; sxy += i * smooth[i]; k++;
              }
              if (k < p.minPoints()) continue;
              double den = k * sxx - sx * sx;
              if (den == 0) continue;
              double slope = (k * sxy - sx * sy) / den;
              double delta = smooth[m] - smooth[m - DELTA_MONTHS];
              double raw = p.slopeWeight() * slope + p.deltaWeight() * (delta / DELTA_MONTHS);
              out[m] = Math.max(0, Math.min(100, 50 + 50 * raw / p.slopeToScoreSpan()));
          }
          return out;
      }
  }
  ```
- [ ] **Step 2: Scratch check** (a local test, **deleted before the commit**):
  - a flat series of 60s → trajectory 50 from the first computable month
  - a series rising 5 pts/month → 100, falling 5 pts/month → 0
  - `levels = [null×4, 50, 55, 60, 65]` → null until there are 4 smoothed points *and* smooth(m−3) exists
  - causality: `compute(levels)` and `compute(Arrays.copyOf(levels, 13))` agree on indices 0..12.
- [ ] **Step 3: Commit** `feat(domain): add trajectory calculator`.

---

### Task 7: `CategoryAggregator`, `ProfileScorer` (+ `ProfileRenormalizationTest`)

Decisions this code implements: SPEC §7.3–§7.4, D5 (`blended = level` when the category has no trajectory).

- [ ] **Step 1: `CategoryAggregator`**:
  ```java
  /** C_level / C_traj = means of the available indicators of one category (SPEC §7.3). */
  public final class CategoryAggregator {
      private CategoryAggregator() {}

      public static CategoryScore[] aggregate(List<SubScore[]> members, int months) {
          CategoryScore[] out = new CategoryScore[months];
          for (int m = 0; m < months; m++) {
              double ls = 0, ts = 0; int n = 0, nt = 0;
              for (SubScore[] s : members) {
                  SubScore x = s[m];
                  if (!x.available()) continue;
                  ls += x.level(); n++;
                  if (x.trajectory() != null) { ts += x.trajectory(); nt++; }
              }
              out[m] = n == 0 ? CategoryScore.missing() : new CategoryScore(ls / n, nt == 0 ? null : ts / nt, n);
          }
          return out;
      }
  }
  ```
- [ ] **Step 2: `ProfileScorer`**:
  ```java
  /**
   * Level_p, Traj_p, MOMENTUM and Final_p for one profile (SPEC §7.3–§7.4). Causal: month m reads 0..m.
   * Weights are renormalized over the available categories. A category with a level but no trajectory
   * blends as its level alone (phase 3 decision D5).
   */
  public final class ProfileScorer {
      private static final double EPS = 1e-9;

      public record Params(double lambda, Map<Category, Double> weights, double momPointsPerMonth,
                           double momCap, BandThresholds bands) {}

      private ProfileScorer() {}

      public static ProfileScore[] score(Map<Category, CategoryScore[]> cats, int months, Params p) {
          ProfileScore[] out = new ProfileScore[months];
          Double prevLevel = null; int persistence = 0;
          for (int m = 0; m < months; m++) {
              double ln = 0, ld = 0, tn = 0, td = 0;
              for (var e : p.weights().entrySet()) {
                  Category c = e.getKey(); double w = e.getValue();
                  if (c == Category.MOMENTUM || w <= 0) continue;
                  CategoryScore cs = at(cats, c, m);
                  if (!cs.available()) continue;
                  ln += w * cs.level(); ld += w;
                  if (cs.traj() != null) { tn += w * cs.traj(); td += w; }
              }
              Double level = ld > 0 ? ln / ld : null;
              Double traj = td > 0 ? tn / td : null;      // = TrajOverall (SPEC §7.3)

              if (level != null && prevLevel != null) {
                  double d = level - prevLevel;
                  int sign = d > EPS ? 1 : d < -EPS ? -1 : 0;
                  persistence = sign == 0 ? 0 : Integer.signum(persistence) == sign ? persistence + sign : sign;
              } else {
                  persistence = 0;
              }
              prevLevel = level;

              Double momentum = traj == null ? null
                      : clamp(traj + Math.max(-p.momCap(), Math.min(p.momCap(), p.momPointsPerMonth() * persistence)));

              Map<Category, Double> eff = new EnumMap<>(Category.class);
              double wsum = 0;
              for (var e : p.weights().entrySet()) {
                  Category c = e.getKey(); double w = e.getValue();
                  if (w <= 0) continue;
                  boolean avail = c == Category.MOMENTUM ? momentum != null : at(cats, c, m).available();
                  if (avail) { eff.put(c, w); wsum += w; }
              }
              Double fin = null;
              if (wsum > 0) {
                  double f = 0;
                  for (var e : eff.entrySet()) {
                      double w = e.getValue() / wsum;
                      e.setValue(w);
                      f += w * (e.getKey() == Category.MOMENTUM ? momentum : blended(at(cats, e.getKey(), m), p.lambda()));
                  }
                  fin = clamp(f);
              }
              out[m] = new ProfileScore(fin, level, traj, fin == null ? null : Band.of(fin, p.bands()),
                      momentum, persistence, Map.copyOf(eff));
          }
          return out;
      }

      /** λ·level + (1−λ)·traj, or level alone when the category has no trajectory (D5). */
      public static double blended(CategoryScore cs, double lambda) {
          return cs.traj() == null ? cs.level() : lambda * cs.level() + (1 - lambda) * cs.traj();
      }

      private static CategoryScore at(Map<Category, CategoryScore[]> cats, Category c, int m) {
          CategoryScore[] s = cats.get(c);
          return s == null ? CategoryScore.missing() : s[m];
      }

      private static double clamp(double s) { return Math.max(0, Math.min(100, s)); }
  }
  ```
  `Map.copyOf` on an `EnumMap` returns an immutable map. Iteration order doesn't matter for the sums.
- [ ] **Step 3: `ProfileRenormalizationTest`** (ARCHITECTURE §9: with a category missing, the remaining weights still sum to 1 and the score stays in [0,100]):
  ```java
  class ProfileRenormalizationTest {
      private static final BandThresholds BANDS = new BandThresholds(80, 65, 50, 35);
      private static final Map<Category, Double> BANK_LIKE = Map.of(
              Category.DEBT_SERVICE, 25.0, Category.LIQUIDITY, 20.0, Category.OPERATING_CASH_FLOW, 20.0,
              Category.PAYMENT_BEHAVIOUR, 7.5, Category.DELINQUENCY, 7.5, Category.LEVERAGE, 10.0,
              Category.TAX_REGULARITY, 5.0, Category.CONCENTRATION, 5.0);
      private static final Map<Category, Double> FUND_LIKE = Map.of(
              Category.ACTIVITY_GROWTH, 30.0, Category.MOMENTUM, 25.0, Category.OPERATING_CASH_FLOW, 20.0,
              Category.LIQUIDITY, 10.0, Category.CONCENTRATION, 10.0, Category.LEVERAGE, 5.0);

      @Test void missingCategoryRedistributesWeight() {
          var cats = constant(Map.of(Category.LIQUIDITY, 80.0, Category.OPERATING_CASH_FLOW, 40.0), null);
          ProfileScore s = ProfileScorer.score(cats, 1, new ProfileScorer.Params(0.7, BANK_LIKE, 2, 10, BANDS))[0];
          assertEquals(1.0, sum(s.effectiveWeights()), 1e-9);
          assertEquals(60.0, s.finalScore(), 1e-9);          // 20/40·80 + 20/40·40, no trajectory -> level (D5)
          assertEquals(Band.C, s.band());
      }

      @Test void nothingAvailableGivesNoScore() {
          ProfileScore s = ProfileScorer.score(Map.of(), 1, new ProfileScorer.Params(0.7, BANK_LIKE, 2, 10, BANDS))[0];
          assertNull(s.finalScore());
          assertTrue(s.effectiveWeights().isEmpty());
      }

      @Test void momentumTakesItsWeightOnlyWhenTrajectoryExists() {
          var noTraj = constant(Map.of(Category.ACTIVITY_GROWTH, 70.0), null);
          var s1 = ProfileScorer.score(noTraj, 1, new ProfileScorer.Params(0.5, FUND_LIKE, 2, 10, BANDS))[0];
          assertFalse(s1.effectiveWeights().containsKey(Category.MOMENTUM));
          var withTraj = constant(Map.of(Category.ACTIVITY_GROWTH, 70.0), 60.0);
          var s2 = ProfileScorer.score(withTraj, 1, new ProfileScorer.Params(0.5, FUND_LIKE, 2, 10, BANDS))[0];
          assertEquals(1.0, sum(s2.effectiveWeights()), 1e-9);
          assertEquals(30.0 / 55.0, s2.effectiveWeights().get(Category.ACTIVITY_GROWTH), 1e-9);
      }

      @Test void randomAvailabilityAlwaysSumsToOneAndStaysInRange() {
          var rnd = new java.util.Random(42);
          for (int i = 0; i < 2000; i++) {
              Map<Category, CategoryScore[]> cats = new EnumMap<>(Category.class);
              for (Category c : Category.values()) {
                  if (c == Category.MOMENTUM || rnd.nextDouble() < 0.4) continue;
                  cats.put(c, new CategoryScore[]{new CategoryScore(rnd.nextDouble() * 100,
                          rnd.nextBoolean() ? rnd.nextDouble() * 100 : null, 1)});
              }
              for (var w : List.of(BANK_LIKE, FUND_LIKE)) {
                  ProfileScore s = ProfileScorer.score(cats, 1, new ProfileScorer.Params(0.7, w, 2, 10, BANDS))[0];
                  if (s.finalScore() == null) { assertTrue(s.effectiveWeights().isEmpty()); continue; }
                  assertEquals(1.0, sum(s.effectiveWeights()), 1e-9);
                  assertTrue(s.finalScore() >= 0 && s.finalScore() <= 100);
              }
          }
      }

      private static Map<Category, CategoryScore[]> constant(Map<Category, Double> levels, Double traj) {
          Map<Category, CategoryScore[]> m = new EnumMap<>(Category.class);
          levels.forEach((c, l) -> m.put(c, new CategoryScore[]{new CategoryScore(l, traj, 1)}));
          return m;
      }

      private static double sum(Map<Category, Double> w) {
          return w.values().stream().mapToDouble(Double::doubleValue).sum();
      }
  }
  ```
- [ ] **Step 4:** `./mvnw -q test`. All pass.
- [ ] **Step 5: Commit** `feat(domain): add category aggregation and profile scoring with renormalization`.

---

### Task 8: Stages `S40_Normalize`, `S50_Trajectory`, `S60_Score`

All three skip when `ctx.panels()` is empty (no data: the run still ends `DONE`). They use `ctx.panels().parallelStream()` (ARCHITECTURE §10). Each panel is touched by one thread only.

- [ ] **Step 1: `S40_Normalize`** (`@Component @Order(40)`, id `S40_NORMALIZE`). Build `Map<IndicatorId, List<double[]>>` from `config.indicators()` once per run. For each panel, indicator and month:
  - `!raw.available()` → `SubScore.missing()`
  - `raw.value() == null` → the rule-defined level (contract item 5):
    ```java
    private static double nullLevel(IndicatorId id, ScoringConfig c) {
        return switch (id) {
            case DEBT_DSCR -> c.debtDscr().noDebtLevel();
            case LEV_DEBT_TO_CF -> c.levDebtToCf().nonPositiveCfLevel();
            default -> throw new IllegalStateException(id + " is available with a null value");
        };
    }
    ```
  - otherwise `AnchorInterpolator.score(value, anchors)`.
  Store `new SubScore(level, null, true)`.
- [ ] **Step 2: `S50_Trajectory`** (`@Order(50)`, id `S50_TRAJECTORY`). Map `config.trajectory()` to `TrajectoryCalculator.Params`. For each panel and indicator, build `Double[] levels` (null where unavailable), call `compute`, and write `withTrajectory(traj[m])` back into each available SubScore.
- [ ] **Step 3: `S60_Score`** (`@Order(60)`, id `S60_SCORE`):
  1. Category members: for each `Category` except `MOMENTUM`, the `IndicatorId`s whose `config.indicators().get(id).category()` is that category (from config, not hardcoded).
  2. Per panel: `CategoryAggregator.aggregate` → `panel.setCategoryScores`. Then for each `Profile`, `ProfileScorer.score` with `Params(pc.lambda(), pc.weights(), momentum.pointsPerMonth(), momentum.cap(), new BandThresholds(bands.a(), bands.b(), bands.c(), bands.d()))` → `panel.setProfileScores`.
  3. Write the three tables with `ResultWriter.replace`, using exactly the DDL of overview contract item 10:
     - `indicator_values`: one row per panel × indicator × month. `level_score` NULL when unavailable. `category` from config. `anchor_status` = `config.indicators().get(id).status().name()`.
     - `category_scores`: one row per panel × category (without MOMENTUM) × month.
     - `profile_scores`: one row per panel × profile × month. `band` = `band.name()` or NULL. `status`, `regime` and `confidence` are NULL.
  4. `ctx.report(id(), 60, rows + " profile rows")`.
- [ ] **Step 4: Run the pipeline and check.**
  ```sql
  SELECT COUNT(*) FROM indicator_values;     -- 250 x 22 x 24 = 132,000
  SELECT COUNT(*) FROM category_scores;      -- 250 x 9 x 24 = 54,000
  SELECT profile, COUNT(*), COUNT(final), MIN(final), MAX(final) FROM profile_scores GROUP BY 1;   -- 6,000 each, in [0,100]
  SELECT COUNT(*) FROM indicator_values WHERE available AND (level_score < 0 OR level_score > 100);   -- 0
  ```
  On this branch INSURER gets scores (PAY, DEL, CON carry 70 % of its weight). BANK and FUND get few or none. That's expected until A merges.
- [ ] **Step 5: Timing.** `S40`–`S60` together must take well under 5 s for 250 panels. Report it.
- [ ] **Step 6: Commit** `feat(pipeline): add normalize, trajectory and score stages with results tables`.

---

### Task 9: Final report

- [ ] **Step 1:** Clean run (`rm /tmp/xray-b/xray.duckdb*`, run the pipeline). Record the stage timings.
- [ ] **Step 2: Final report** to the human. It goes into `DATA_FINDINGS.md` after the merge (overview step 8), because B doesn't edit that file:
  - the availability % of B's 9 indicators (GROUP and COMPANY)
  - the coverage distribution of Task 3 Step 1 and the share of group-months that pass `${con_min_coverage}`
  - the `DEL_AGING_90` quantiles and whether the closed anchors look miscalibrated (Task 2 Step 4)
  - the p5/p25/p50/p75/p95 of the 4 pending indicators of B (`PAY_DPO`, `PAY_OVERDUE_PAYABLES`, `DEL_OVERDUE_RECEIVABLES`, `CON_CUSTOMER_CHURN`), for THRESHOLDS.md
  - the S40–S60 timings, and the INSURER `final` distribution at M23 on this branch
  - anything you stopped to ask about
