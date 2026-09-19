# Phase 4 · Plan B — Explanation (S65), dynamics (S70), company panels

> **For agentic workers:** Claude Code: use superpowers:executing-plans (or superpowers:subagent-driven-development) to run this plan task by task. Antigravity or other agents: do the checkboxes in order. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Score the company panels next to the groups, write the exact additive explanation (`contributions`, S65) with template narratives, and write CUSUM changepoints, regimes, statuses and confidence (S70) into `profile_scores` and `changepoints`.

**Architecture:** Pure `domain/service` classes (`ExplanationService`, `CusumDetector`, `RegimeClassifier`, `StatusResolver`, `ConfidenceResolver`) do the math on arrays, with no Spring and no SQL. Two thin `@Component` stages map `ScoringConfig` to domain parameters, walk `ctx.panels()` in parallel, keep the results on `EntityPanel` and write the tables with `ResultWriter`. S60 also writes `profile_weights`, so the UI always shows the weights that produced the scores.

**Tech Stack:** Java 21, Spring Boot 3.5, DuckDB JDBC (Appender through `ResultWriter`), JUnit 5.

**Spec:** `docs/SPEC.md` §7.5, §7.6, §8.1, §8.2, §8.3. `docs/ARCHITECTURE.md` §3, §4.2, §4.4, §8.3, §9. Shared contract, decisions E1–E10 and path ownership: `docs/superpowers/plans/2026-09-19-phase4-overview.md`. **Read the overview before Task 1.**

## Global Constraints

- Edit only the paths that the overview gives to plan B.
- Java 21 target. The machine's JDK 21 has no `javac`. The default `java` (JDK 25) compiles with `--release 21`, so run plain `./mvnw ...`.
- No JPA, no Lombok, no new Maven dependency.
- `domain/` imports nothing from `org.springframework`, `java.sql` or `com.xray.config`. Stages convert config records to domain records.
- Never hardcode a weight, λ, threshold or anchor (CLAUDE.md rule 5). **Never read or edit `scoring.profiles`** in `scoring-config.yml`: Almudena owns it (overview decision E1). New keys go at the end of the file, or inside the `regimes` line that already exists.
- Causality: a value for month m reads only indices `0..m`. Use `CausalWindow`. `LookAheadTest` (Block 8) checks this.
- Tests: add only `ExplanationSumTest` (package `com.xray.domain.service`). You may extend `ScoringConfigValidationTest`. A scratch test is allowed locally and is deleted before the commit.
- Commits: Conventional Commits, English, lowercase subject. Commit after each task.
- Your backend runs on port 8082 with the worktree's own `data/xray.duckdb`. Never open that file with the CLI while the backend runs (file lock). Query a copy.

## File Structure

```
backend/src/main/resources/
  scoring-config.yml                          regimes line extended; + statuses, confidence, explanation (end of file)
backend/src/main/java/com/xray/
  config/ScoringConfig.java                   RegimeConfig extended; + StatusConfig, ConfidenceConfig, ExplanationConfig
  domain/model/
    Contribution.java                         one driver's share of final − 50
    HealthStatus.java  Regime.java  Confidence.java  ChangeDirection.java
    Changepoint.java                          CUSUM alarm on one series
    DynamicsPoint.java                        status, regime, seasonal, confidence of one month
    EntityPanel.java                          + contributions, dynamics, changepoints
  domain/service/
    ExplanationService.java                   exact additive decomposition (SPEC §7.5)
    CusumDetector.java                        two-sided CUSUM on a robust baseline (SPEC §8.1)
    RegimeClassifier.java                     dip vs structural change (SPEC §8.2)
    StatusResolver.java                       the eight statuses (SPEC §8.3)
    ConfidenceResolver.java                   HIGH / MEDIUM / LOW (SPEC §7.6)
  narrative/
    NarrativeRenderer.java                    extension point #3 (decision E7)
    TemplateNarrativeRenderer.java            Spanish templates
  pipeline/stages/
    CategoryMembers.java                      category -> indicators, from config (shared by S60, S65, S70)
    ProfileScoreTable.java                    profile_scores DDL and rows (shared by S60, S70)
    S30_RawIndicators.java                    + COMPANY panels when unit = GROUP (decision E2)
    S60_Score.java                            uses the two helpers; + profile_weights
    S65_Explain.java                          contributions
    S70_Dynamics.java                         changepoints; rewrites profile_scores
backend/src/test/java/com/xray/
  domain/service/ExplanationSumTest.java      required test (ARCHITECTURE §9)
  config/ScoringConfigValidationTest.java     copyWith + new keys bind
```

## Shared contract (copied from the overview)

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

---

### Task 0: Check the worktree

**Files:** none.

- [ ] **Step 1: Confirm the branch and the data link**

Run (worktree root):
```bash
git branch --show-current     # feat/phase4-explain-dynamics
ls data/raw | head -3         # balances.csv banking_products.csv companies.csv
```

- [ ] **Step 2: Run the tests**

Run: `cd backend && ./mvnw -q test`
Expected: exit code 0, reports for `AnchorInterpolatorTest`, `ProfileRenormalizationTest`, `RollupTest`, `ScoringConfigValidationTest` in `target/surefire-reports`.

- [ ] **Step 3: Write the run helper you use after every task**

Use these commands, from `backend/`, to run the pipeline from a clean database and stop the backend:
```bash
rm -f ../data/xray.duckdb ../data/xray.duckdb.wal
SERVER_PORT=8082 ./mvnw -q spring-boot:run > /tmp/xray-b.log 2>&1 &
until curl -s localhost:8082/api/pipeline/status | grep -q '"state":"DONE"\|"state":"FAILED"'; do sleep 3; done
curl -s localhost:8082/api/pipeline/status; echo
pkill -f 'spring-boot:run.*' ; sleep 3
cp ../data/xray.duckdb /tmp/xray-b.duckdb
```
Then query with `duckdb -readonly /tmp/xray-b.duckdb "<sql>"`. If the DuckDB CLI is missing, use `java ../scripts/DuckQuery.java /tmp/xray-b.duckdb "<sql>"`.

---

### Task 1: Config keys for regimes, statuses, confidence and explanation

**Files:**
- Modify: `backend/src/main/resources/scoring-config.yml` (the `regimes:` line, and the end of the file)
- Modify: `backend/src/main/java/com/xray/config/ScoringConfig.java`
- Modify: `backend/src/test/java/com/xray/config/ScoringConfigValidationTest.java`

**Interfaces:**
- Produces: `ScoringConfig.RegimeConfig(double cusumK, double cusumH, double cusumZCap, int persistenceMonths, double slopeThreshold, double dipZ, int dipMaxMonths, int baselineMonths, int baselineMinPoints, double sigmaFloor, int dipRecoveryMonths, int slopeMonths, int slopeMinPoints, List<IndicatorId> cusumIndicators)`, `ScoringConfig.StatusConfig`, `ScoringConfig.ConfidenceConfig`, `ScoringConfig.ExplanationConfig`, accessors `statuses()`, `confidence()`, `explanation()`.

- [ ] **Step 1: Write the failing test**

Add this method to `ScoringConfigValidationTest` (before `copyWith`):
```java
    @Test
    void phase4KeysBind() {
        assertEquals(6, base.regimes().baselineMonths());
        assertTrue(base.regimes().baselineMinPoints() <= base.regimes().baselineMonths());
        assertTrue(base.regimes().sigmaFloor() > 0);
        assertEquals(List.of(IndicatorId.CF_NOCF_MARGIN, IndicatorId.PAY_DSO, IndicatorId.LIQ_RUNWAY),
                base.regimes().cusumIndicators());
        assertTrue(base.statuses().criticalBelow() < base.statuses().healthyMinFinal());
        assertTrue(base.confidence().lowHistoryMonths() < base.confidence().mediumHistoryMonths());
        assertTrue(base.explanation().narrativeTopN() > 0);
    }
```
Append `, base.statuses(), base.confidence(), base.explanation()` to the argument list of the `new ScoringConfig(...)` call in `copyWith`, after `base.taxRegularity()`.

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd backend && ./mvnw -q test -Dtest=ScoringConfigValidationTest`
Expected: compilation error, `cannot find symbol ... baselineMonths()` / `statuses()`.

- [ ] **Step 3: Extend the config**

In `scoring-config.yml`, replace the `regimes:` line with:
```yaml
  # SPEC §8.1–§8.2. CUSUM runs on final and on the level scores of cusum-indicators (phase 4 decision E3).
  # Baseline = median and MAD x 1.4826 of the previous baseline-months non-null values, sigma >= sigma-floor (points).
  # Each z adds at most cusum-z-cap to the sums (Huber CUSUM), so one outlier cannot hold an alarm for months (E4).
  # sigma-floor and cusum-z-cap are PROVISIONAL: review with the status mix of the first run.
  regimes: { cusum-k: 0.5, cusum-h: 4.0, cusum-z-cap: 3.0, persistence-months: 3, slope-threshold: 1.5, dip-z: -2.0, dip-max-months: 2,
             baseline-months: 6, baseline-min-points: 4, sigma-floor: 2.0, dip-recovery-months: 2,
             slope-months: 6, slope-min-points: 4, cusum-indicators: [CF_NOCF_MARGIN, PAY_DSO, LIQ_RUNWAY] }
```
Append at the end of the file:
```yaml

  # SPEC §8.3: statuses in precedence order CRITICAL > STRUCTURAL_DECLINE > TURNING > DIP > IMPROVING > EXCEPTIONAL > HEALTHY > WATCH.
  statuses:
    critical-below: 35
    turning-min-level: 60
    turning-max-traj: 40
    improving-min-traj: 65
    exceptional-min-final: 85
    exceptional-min-traj: 45
    healthy-min-final: 65

  # SPEC §7.6: history = scored months up to m; share = available indicators of the profile's weighted categories.
  confidence:
    low-history-months: 6
    medium-history-months: 12
    low-available-share: 0.5

  # SPEC §7.5: narratives for the top movers of each entity-month-profile (phase 4 decision E6).
  explanation:
    narrative-top-n: 5
    min-narrated-delta: 0.05
```
In `ScoringConfig.java`:
1. Add `import java.util.List;` if it is not there (it is, for `cashProductTypes`).
2. Append three components to the record header, after `TaxRegularityConfig taxRegularity`:
```java
        TaxRegularityConfig taxRegularity,
        StatusConfig statuses,
        ConfidenceConfig confidence,
        ExplanationConfig explanation) {
```
3. Replace the `RegimeConfig` record and add three records:
```java
    /** SPEC §8.1–§8.2 and phase 4 decisions E3–E5. */
    public record RegimeConfig(double cusumK, double cusumH, double cusumZCap, int persistenceMonths, double slopeThreshold,
                               double dipZ, int dipMaxMonths, int baselineMonths, int baselineMinPoints,
                               double sigmaFloor, int dipRecoveryMonths, int slopeMonths, int slopeMinPoints,
                               List<IndicatorId> cusumIndicators) {
    }

    /** SPEC §8.3 status thresholds, in points. */
    public record StatusConfig(double criticalBelow, double turningMinLevel, double turningMaxTraj,
                               double improvingMinTraj, double exceptionalMinFinal, double exceptionalMinTraj,
                               double healthyMinFinal) {
    }

    /** SPEC §7.6. */
    public record ConfidenceConfig(int lowHistoryMonths, int mediumHistoryMonths, double lowAvailableShare) {
    }

    /** SPEC §7.5 narratives (phase 4 decision E6). */
    public record ExplanationConfig(int narrativeTopN, double minNarratedDelta) {
    }
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && ./mvnw -q test`
Expected: exit code 0.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/scoring-config.yml backend/src/main/java/com/xray/config/ScoringConfig.java backend/src/test/java/com/xray/config/ScoringConfigValidationTest.java
git commit -m "feat(config): add regime, status, confidence and explanation keys"
```

---

### Task 2: Company panels, shared stage helpers and `profile_weights`

**Files:**
- Create: `backend/src/main/java/com/xray/domain/model/HealthStatus.java`, `Regime.java`, `Confidence.java`, `ChangeDirection.java`, `Changepoint.java`, `Contribution.java`, `DynamicsPoint.java`
- Modify: `backend/src/main/java/com/xray/domain/model/EntityPanel.java`
- Create: `backend/src/main/java/com/xray/pipeline/stages/CategoryMembers.java`, `ProfileScoreTable.java`
- Modify: `backend/src/main/java/com/xray/pipeline/stages/S60_Score.java`, `S30_RawIndicators.java`

**Interfaces:**
- Produces: the model types below; `EntityPanel.contributions(Profile)`, `setContributions(Profile, List<List<Contribution>>)`, `dynamics(Profile)`, `setDynamics(Profile, DynamicsPoint[])`, `changepoints()`, `addChangepoint(Changepoint)`; `CategoryMembers.of(ScoringConfig)`; `ProfileScoreTable.NAME`, `ProfileScoreTable.DDL`, `ProfileScoreTable.rows(EntityPanel)`.

- [ ] **Step 1: Add the model types**

`domain/model/HealthStatus.java`:
```java
package com.xray.domain.model;

/** SPEC §8.3, in precedence order. */
public enum HealthStatus {
    CRITICAL, STRUCTURAL_DECLINE, TURNING, DIP, IMPROVING, EXCEPTIONAL, HEALTHY, WATCH
}
```
`domain/model/Regime.java`:
```java
package com.xray.domain.model;

/** SPEC §8.2: dip ("bache") vs structural change ("caída"). */
public enum Regime {
    STABLE, DIP, DIP_RECOVERED, STRUCTURAL_DECLINE, STRUCTURAL_IMPROVEMENT
}
```
`domain/model/Confidence.java`:
```java
package com.xray.domain.model;

/** SPEC §7.6. */
public enum Confidence {
    HIGH, MEDIUM, LOW
}
```
`domain/model/ChangeDirection.java`:
```java
package com.xray.domain.model;

public enum ChangeDirection {
    UP, DOWN
}
```
`domain/model/Changepoint.java`:
```java
package com.xray.domain.model;

/**
 * One CUSUM alarm (SPEC §8.1). series = FINAL or an IndicatorId name; profile null for indicator series.
 * month = last month the cumulative sum was 0 before the alarm, alarmMonth = the month it fired (ordinals).
 */
public record Changepoint(String series, Profile profile, int month, int alarmMonth, ChangeDirection direction) {
}
```
`domain/model/Contribution.java`:
```java
package com.xray.domain.model;

/**
 * One driver's share of final − 50 (SPEC §7.5). driverId = an IndicatorId name or MOMENTUM.
 * effWeight = w'_c / n_available (the category's effective weight for MOMENTUM).
 * blended = λ·level + (1−λ)·traj of the driver (the momentum value for MOMENTUM).
 */
public record Contribution(String driverId, Category category, double effWeight, double blended, double contrib) {
}
```
`domain/model/DynamicsPoint.java`:
```java
package com.xray.domain.model;

/** S70 output for one profile at one month. Null for a month with no final score. */
public record DynamicsPoint(HealthStatus status, Regime regime, boolean seasonal, Confidence confidence) {
}
```

- [ ] **Step 2: Extend `EntityPanel`**

Add the imports `java.util.ArrayList` and `java.util.Collections`. Add these fields after `profileScores`:
```java
    private final Map<Profile, List<List<Contribution>>> contributions = new EnumMap<>(Profile.class); // S65
    private final Map<Profile, DynamicsPoint[]> dynamics = new EnumMap<>(Profile.class);                // S70
    private final List<Changepoint> changepoints = new ArrayList<>();                                  // S70
```
Add these methods at the end of the class:
```java
    /** One list per month ordinal, empty when final is null. Null until S65 runs. */
    public List<List<Contribution>> contributions(Profile p) {
        return contributions.get(p);
    }

    public void setContributions(Profile p, List<List<Contribution>> series) {
        contributions.put(p, series);
    }

    /** Null until S70 runs. An element is null for a month with no final score. */
    public DynamicsPoint[] dynamics(Profile p) {
        return dynamics.get(p);
    }

    public void setDynamics(Profile p, DynamicsPoint[] series) {
        dynamics.put(p, series);
    }

    public List<Changepoint> changepoints() {
        return Collections.unmodifiableList(changepoints);
    }

    public void addChangepoint(Changepoint c) {
        changepoints.add(c);
    }
```

- [ ] **Step 3: Add `CategoryMembers`**

`pipeline/stages/CategoryMembers.java`:
```java
package com.xray.pipeline.stages;

import com.xray.config.ScoringConfig;
import com.xray.domain.model.Category;
import com.xray.domain.model.IndicatorId;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/** Category -> its indicators, from scoring-config.yml. MOMENTUM has no indicators (SPEC §7.3). */
final class CategoryMembers {

    private CategoryMembers() {
    }

    static Map<Category, List<IndicatorId>> of(ScoringConfig config) {
        Map<Category, List<IndicatorId>> members = new EnumMap<>(Category.class);
        for (Category c : Category.values()) {
            if (c != Category.MOMENTUM) {
                members.put(c, new ArrayList<>());
            }
        }
        for (IndicatorId id : IndicatorId.values()) {
            members.get(config.indicators().get(id).category()).add(id);
        }
        return members;
    }
}
```

- [ ] **Step 4: Add `ProfileScoreTable`**

`pipeline/stages/ProfileScoreTable.java`:
```java
package com.xray.pipeline.stages;

import com.xray.domain.model.DynamicsPoint;
import com.xray.domain.model.EntityPanel;
import com.xray.domain.model.Profile;
import com.xray.domain.model.ProfileScore;

import java.util.ArrayList;
import java.util.List;

/** profile_scores (phase 4 contract item 3). S60 writes it without dynamics, S70 rewrites it with them. */
final class ProfileScoreTable {

    static final String NAME = "profile_scores";
    static final String DDL = "entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, profile VARCHAR, "
            + "final DOUBLE, level DOUBLE, traj DOUBLE, band VARCHAR, momentum DOUBLE, mom_persistence INTEGER, "
            + "status VARCHAR, regime VARCHAR, confidence VARCHAR, seasonal BOOLEAN";

    private ProfileScoreTable() {
    }

    static List<Object[]> rows(EntityPanel panel) {
        List<Object[]> rows = new ArrayList<>(Profile.values().length * panel.size());
        for (Profile p : Profile.values()) {
            ProfileScore[] s = panel.profileScores(p);
            DynamicsPoint[] d = panel.dynamics(p);
            for (int m = 0; m < panel.size(); m++) {
                ProfileScore x = s[m];
                DynamicsPoint y = d == null ? null : d[m];
                rows.add(new Object[]{panel.key().type().name(), panel.key().id(), panel.months().get(m).toString(),
                        p.name(), x.finalScore(), x.level(), x.traj(), x.band() == null ? null : x.band().name(),
                        x.momentum(), x.momPersistence(),
                        y == null ? null : y.status().name(),
                        y == null ? null : y.regime().name(),
                        y == null ? null : y.confidence().name(),
                        y == null ? null : y.seasonal()});
            }
        }
        return rows;
    }
}
```

- [ ] **Step 5: Use the helpers in S60 and write `profile_weights`**

In `S60_Score.java`:
1. Delete `PROFILE_SCORES_DDL` and the `profileRows` method.
2. Replace the block that builds `members` (from `Map<Category, List<IndicatorId>> members = new EnumMap<>(Category.class);` to `config.indicators().forEach(...)`) with:
```java
        Map<Category, List<IndicatorId>> members = CategoryMembers.of(config);
```
3. Add a DDL constant:
```java
    private static final String PROFILE_WEIGHTS_DDL = "profile VARCHAR, category VARCHAR, weight DOUBLE, lambda DOUBLE";
```
4. Replace the block from `List<Object[]> profileRows = ...` to `int rows = writer.replace("profile_scores", ...);` (five lines, the three `writer.replace` calls included) with:
```java
        List<Object[]> profileRows = ctx.panels().parallelStream()
                .flatMap(panel -> ProfileScoreTable.rows(panel).stream()).toList();
        writer.replace("indicator_values", INDICATOR_VALUES_DDL, indicatorRows);
        writer.replace("category_scores", CATEGORY_SCORES_DDL, categoryRows);
        writer.replace("profile_weights", PROFILE_WEIGHTS_DDL, weightRows(config));
        int rows = writer.replace(ProfileScoreTable.NAME, ProfileScoreTable.DDL, profileRows);
```
5. Add this method:
```java
    /** The weights that produced this run's scores, so the UI never shows other weights (decision E1). */
    private static List<Object[]> weightRows(ScoringConfig config) {
        List<Object[]> rows = new ArrayList<>();
        config.profiles().forEach((p, pc) -> pc.weights().forEach((c, w) ->
                rows.add(new Object[]{p.name(), c.name(), w, pc.lambda()})));
        return rows;
    }
```
6. Update the class Javadoc: `status, regime, confidence and seasonal stay NULL until S70 rewrites profile_scores.`
7. Remove imports that are now unused (`ProfileScore` if unused, `EnumMap` only if unused).

- [ ] **Step 6: Load the company panels in S30**

In `S30_RawIndicators.execute`, replace the lines from `List<EntityPanel> panels = loader.load(ctx.unit(), months);` to the end of the availability loop with:
```java
        List<EntityPanel> panels = loader.load(ctx.unit(), months);
        for (IndicatorId id : IndicatorId.values()) {
            long avail = panels.stream().flatMap(p -> Arrays.stream(p.rawSeries(id))).filter(RawIndicator::available).count();
            long total = (long) panels.size() * months.size();
            log.info("{} availability {} {}/{} ({}%)", id(), id, avail, total, total == 0 ? 0 : avail * 100 / total);
        }
        List<EntityPanel> all = new ArrayList<>(panels);
        if (ctx.unit() == EntityType.GROUP) {
            all.addAll(loader.load(EntityType.COMPANY, months));   // standalone company scores for the drilldown (E2)
        }
        ctx.setPanels(all);
        log.info("{} loaded {} {} panels, {} in total", id(), panels.size(), ctx.unit(), all.size());
```
Add the imports `com.xray.domain.model.EntityType` and `java.util.ArrayList`. Keep the final `ctx.report(...)` line, and change its message to `all.size() + " panels"`.

- [ ] **Step 7: Build and run the pipeline**

Run: `cd backend && ./mvnw -q test`, then the run helper of Task 0 Step 3.
Expected: status `DONE`. Then:
```sql
SELECT entity_type, COUNT(DISTINCT entity_id), COUNT(*) FROM profile_scores GROUP BY 1;
-- GROUP 250 18000, COMPANY 1286 92592
SELECT * FROM profile_weights ORDER BY profile, weight DESC;
-- one row per entry of scoring.profiles, values equal to the config
SELECT COUNT(*) FROM profile_scores WHERE status IS NOT NULL OR seasonal IS NOT NULL;   -- 0
```

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/xray/domain/model backend/src/main/java/com/xray/pipeline/stages
git commit -m "feat(pipeline): score company panels and write the run's profile weights"
```

---

### Task 3: `ExplanationService` and `ExplanationSumTest`

**Files:**
- Create: `backend/src/main/java/com/xray/domain/service/ExplanationService.java`
- Test: `backend/src/test/java/com/xray/domain/service/ExplanationSumTest.java`

**Interfaces:**
- Consumes: `ProfileScore` (with `effectiveWeights`, `momentum`), `SubScore`, `CategoryAggregator.aggregate`, `ProfileScorer.score`, `Contribution`.
- Produces: `ExplanationService.MOMENTUM` (`"MOMENTUM"`), `static List<Contribution> explain(ProfileScore ps, Map<Category, List<IndicatorId>> members, Function<IndicatorId, SubScore> subScoreAt, double lambda)`.

The math. For a category c with effective weight `w'_c`, available indicators A (n of them) and the subset T with a trajectory (nt):
- nt > 0: `contrib_i = w'_c · [ λ·(level_i − 50)/n + (1−λ)·(traj_i − 50)/nt·[i ∈ T] ]`
- nt = 0: `contrib_i = w'_c · (level_i − 50)/n` (phase 3 decision D5: the category blends as its level)
- MOMENTUM: `contrib = w'_MOM · (momentum − 50)`

Summed over i, a category gives `w'_c · (blended_c − 50)`. The `w'` sum to 1, so the total is `final − 50` exactly.

- [ ] **Step 1: Write the failing test**

`ExplanationSumTest.java`:
```java
package com.xray.domain.service;

import com.xray.domain.model.BandThresholds;
import com.xray.domain.model.Category;
import com.xray.domain.model.CategoryScore;
import com.xray.domain.model.Contribution;
import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.ProfileScore;
import com.xray.domain.model.SubScore;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** ARCHITECTURE §9: Σ contrib_i = Final − 50 for every entity-month-profile. The weights are this test's own (E1). */
class ExplanationSumTest {

    private static final BandThresholds BANDS = new BandThresholds(80, 65, 50, 35);
    private static final int MONTHS = 24;

    @Test
    void contributionsSumToFinalMinus50() {
        Random rnd = new Random(7);
        Map<Category, List<IndicatorId>> members = members();
        int checked = 0;
        for (int trial = 0; trial < 300; trial++) {
            Map<IndicatorId, SubScore[]> subs = randomSubScores(rnd);
            double lambda = rnd.nextDouble();
            ProfileScore[] scores = score(members, subs, lambda, randomWeights(rnd));
            for (int m = 0; m < MONTHS; m++) {
                int mm = m;
                List<Contribution> cs = ExplanationService.explain(scores[m], members, id -> subs.get(id)[mm], lambda);
                if (scores[m].finalScore() == null) {
                    assertTrue(cs.isEmpty(), "trial " + trial + " month " + m);
                    continue;
                }
                double sum = cs.stream().mapToDouble(Contribution::contrib).sum();
                assertEquals(scores[m].finalScore() - 50, sum, 1e-6, "trial " + trial + " month " + m);
                checked++;
            }
        }
        assertTrue(checked > 3000, "too few scored months: " + checked);
    }

    @Test
    void effectiveWeightsOfACategorySumToItsWeight() {
        Random rnd = new Random(11);
        Map<Category, List<IndicatorId>> members = members();
        for (int trial = 0; trial < 50; trial++) {
            Map<IndicatorId, SubScore[]> subs = randomSubScores(rnd);
            ProfileScore[] scores = score(members, subs, 0.6, randomWeights(rnd));
            for (int m = 0; m < MONTHS; m++) {
                int mm = m;
                Map<Category, Double> byCat = ExplanationService.explain(scores[m], members, id -> subs.get(id)[mm], 0.6)
                        .stream().collect(Collectors.groupingBy(Contribution::category,
                                Collectors.summingDouble(Contribution::effWeight)));
                ProfileScore ps = scores[m];
                assertEquals(ps.effectiveWeights().keySet(), byCat.keySet());
                byCat.forEach((c, w) -> assertEquals(ps.effectiveWeights().get(c), w, 1e-9));
            }
        }
    }

    private static ProfileScore[] score(Map<Category, List<IndicatorId>> members, Map<IndicatorId, SubScore[]> subs,
                                        double lambda, Map<Category, Double> weights) {
        Map<Category, CategoryScore[]> cats = new EnumMap<>(Category.class);
        members.forEach((c, ids) -> cats.put(c, CategoryAggregator.aggregate(ids.stream().map(subs::get).toList(), MONTHS)));
        return ProfileScorer.score(cats, MONTHS, new ProfileScorer.Params(lambda, weights, 2, 10, BANDS));
    }

    /** Some months have nothing available, most have a random subset; 30 % of the available ones have no trajectory. */
    private static Map<IndicatorId, SubScore[]> randomSubScores(Random rnd) {
        boolean[] dead = new boolean[MONTHS];
        for (int m = 0; m < MONTHS; m++) {
            dead[m] = rnd.nextDouble() < 0.1;
        }
        Map<IndicatorId, SubScore[]> out = new EnumMap<>(IndicatorId.class);
        for (IndicatorId id : IndicatorId.values()) {
            SubScore[] s = new SubScore[MONTHS];
            for (int m = 0; m < MONTHS; m++) {
                if (dead[m] || rnd.nextDouble() < 0.3) {
                    s[m] = SubScore.missing();
                } else {
                    Double traj = rnd.nextDouble() < 0.3 ? null : rnd.nextDouble() * 100;
                    s[m] = new SubScore(rnd.nextDouble() * 100, traj, true);
                }
            }
            out.put(id, s);
        }
        return out;
    }

    /** A random subset of the categories (MOMENTUM included sometimes), scaled to sum to 100. */
    private static Map<Category, Double> randomWeights(Random rnd) {
        List<Category> picked = new ArrayList<>();
        for (Category c : Category.values()) {
            if (rnd.nextDouble() < 0.6) {
                picked.add(c);
            }
        }
        if (picked.stream().allMatch(c -> c == Category.MOMENTUM)) {
            picked.add(Category.LIQUIDITY);
        }
        Map<Category, Double> raw = new EnumMap<>(Category.class);
        picked.forEach(c -> raw.put(c, 1.0 + rnd.nextInt(30)));
        double sum = raw.values().stream().mapToDouble(Double::doubleValue).sum();
        raw.replaceAll((c, w) -> w * 100 / sum);
        return raw;
    }

    /** This test's own category map, by indicator prefix. */
    private static Map<Category, List<IndicatorId>> members() {
        Map<Category, List<IndicatorId>> members = new EnumMap<>(Category.class);
        for (IndicatorId id : IndicatorId.values()) {
            members.computeIfAbsent(categoryOf(id), c -> new ArrayList<>()).add(id);
        }
        return members;
    }

    private static Category categoryOf(IndicatorId id) {
        String n = id.name();
        if (n.startsWith("LIQ_")) return Category.LIQUIDITY;
        if (n.startsWith("CF_")) return Category.OPERATING_CASH_FLOW;
        if (n.startsWith("ACT_")) return Category.ACTIVITY_GROWTH;
        if (n.startsWith("DEBT_")) return Category.DEBT_SERVICE;
        if (n.startsWith("LEV_")) return Category.LEVERAGE;
        if (n.startsWith("PAY_")) return Category.PAYMENT_BEHAVIOUR;
        if (n.startsWith("DEL_")) return Category.DELINQUENCY;
        if (n.startsWith("CON_")) return Category.CONCENTRATION;
        return Category.TAX_REGULARITY;
    }
}
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd backend && ./mvnw -q test -Dtest=ExplanationSumTest`
Expected: compilation error, `cannot find symbol ... ExplanationService`.

- [ ] **Step 3: Write `ExplanationService`**

```java
package com.xray.domain.service;

import com.xray.domain.model.Category;
import com.xray.domain.model.Contribution;
import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.ProfileScore;
import com.xray.domain.model.SubScore;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * Exact additive decomposition of Final − 50 (SPEC §7.5). It reads the effective weights that ProfileScorer
 * kept, so it never sees a config weight. Σ contrib = final − 50 up to floating point.
 */
public final class ExplanationService {

    public static final String MOMENTUM = "MOMENTUM";

    private ExplanationService() {
    }

    public static List<Contribution> explain(ProfileScore ps, Map<Category, List<IndicatorId>> members,
                                             Function<IndicatorId, SubScore> subScoreAt, double lambda) {
        if (ps.finalScore() == null) {
            return List.of();
        }
        List<Contribution> out = new ArrayList<>();
        for (var e : ps.effectiveWeights().entrySet()) {
            Category c = e.getKey();
            double wc = e.getValue();
            if (c == Category.MOMENTUM) {
                out.add(new Contribution(MOMENTUM, c, wc, ps.momentum(), wc * (ps.momentum() - 50)));
                continue;
            }
            List<IndicatorId> avail = members.get(c).stream().filter(id -> subScoreAt.apply(id).available()).toList();
            int n = avail.size();
            long nt = avail.stream().filter(id -> subScoreAt.apply(id).trajectory() != null).count();
            for (IndicatorId id : avail) {
                SubScore s = subScoreAt.apply(id);
                double part;
                double blended;
                if (nt == 0) {
                    part = (s.level() - 50) / n;
                    blended = s.level();
                } else {
                    part = lambda * (s.level() - 50) / n
                            + (s.trajectory() == null ? 0 : (1 - lambda) * (s.trajectory() - 50) / nt);
                    blended = s.trajectory() == null ? s.level() : lambda * s.level() + (1 - lambda) * s.trajectory();
                }
                out.add(new Contribution(id.name(), c, wc / n, blended, wc * part));
            }
        }
        return out;
    }
}
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && ./mvnw -q test`
Expected: exit code 0. `ExplanationSumTest` runs 2 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/xray/domain/service/ExplanationService.java backend/src/test/java/com/xray/domain/service/ExplanationSumTest.java
git commit -m "feat(domain): add exact additive explanation of the final score"
```

---

### Task 4: Narratives and `S65_Explain`

**Files:**
- Create: `backend/src/main/java/com/xray/narrative/NarrativeRenderer.java`, `TemplateNarrativeRenderer.java`
- Create: `backend/src/main/java/com/xray/pipeline/stages/S65_Explain.java`

**Interfaces:**
- Consumes: `ExplanationService.explain`, `CategoryMembers.of`, `EntityPanel.setContributions`, `ResultWriter.replace`.
- Produces: the `contributions` table (contract item 4). `NarrativeRenderer.render(String driverId, RawIndicator before, RawIndicator after, double deltaPoints)`.

- [ ] **Step 1: Write the extension point**

`narrative/NarrativeRenderer.java`:
```java
package com.xray.narrative;

import com.xray.domain.model.RawIndicator;

/**
 * Extension point #3 (ARCHITECTURE §8.3). One line for a driver whose contribution moved by deltaPoints
 * between two months. before or after is null for MOMENTUM. Called at pipeline time only, never in a request.
 * The signature differs from ARCHITECTURE §8.3 so a 1-month and a 3-month delta can share it (phase 4 decision E7).
 */
public interface NarrativeRenderer {
    String render(String driverId, RawIndicator before, RawIndicator after, double deltaPoints);
}
```

- [ ] **Step 2: Write the Spanish templates**

`narrative/TemplateNarrativeRenderer.java`:
```java
package com.xray.narrative;

import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.RawIndicator;
import org.springframework.stereotype.Component;

import java.util.EnumMap;
import java.util.Locale;
import java.util.Map;

/** The only NarrativeRenderer in scope: Spanish templates, no external call (SPEC §14). */
@Component
public class TemplateNarrativeRenderer implements NarrativeRenderer {

    private static final Locale ES = Locale.forLanguageTag("es-ES");
    private static final String MOMENTUM = "MOMENTUM";

    private enum Unit { DAYS, MONTHS, PCT, MULTIPLE, RATIO, HHI }

    private record Meta(String label, Unit unit) {
    }

    private static final Map<IndicatorId, Meta> META = new EnumMap<>(IndicatorId.class);

    static {
        META.put(IndicatorId.LIQ_RUNWAY, new Meta("Meses de caja", Unit.MONTHS));
        META.put(IndicatorId.LIQ_BUFFER, new Meta("Colchón de liquidez", Unit.MULTIPLE));
        META.put(IndicatorId.LIQ_MIN_BALANCE, new Meta("Saldo mínimo", Unit.RATIO));
        META.put(IndicatorId.CF_NOCF_MARGIN, new Meta("Margen de caja operativa", Unit.PCT));
        META.put(IndicatorId.CF_VOLATILITY, new Meta("Volatilidad del flujo", Unit.RATIO));
        META.put(IndicatorId.CF_IN_OUT_RATIO, new Meta("Cobros sobre pagos", Unit.MULTIPLE));
        META.put(IndicatorId.ACT_COLLECTIONS_GROWTH, new Meta("Crecimiento de cobros", Unit.PCT));
        META.put(IndicatorId.DEBT_DSCR, new Meta("Cobertura de deuda (DSCR)", Unit.MULTIPLE));
        META.put(IndicatorId.DEBT_LINE_UTIL, new Meta("Uso de pólizas", Unit.PCT));
        META.put(IndicatorId.LEV_DEBT_TO_CF, new Meta("Deuda sobre caja operativa", Unit.MULTIPLE));
        META.put(IndicatorId.LEV_FACTORING_RELIANCE, new Meta("Peso del factoring", Unit.PCT));
        META.put(IndicatorId.LEV_FUNDING_COST, new Meta("Diferencial de financiación", Unit.PCT));
        META.put(IndicatorId.PAY_DSO, new Meta("Plazo de cobro (DSO)", Unit.DAYS));
        META.put(IndicatorId.PAY_DPO, new Meta("Plazo de pago (DPO)", Unit.DAYS));
        META.put(IndicatorId.PAY_SUPPLIER_LATENESS, new Meta("Retraso a proveedores", Unit.DAYS));
        META.put(IndicatorId.PAY_OVERDUE_PAYABLES, new Meta("Pagos vencidos", Unit.PCT));
        META.put(IndicatorId.DEL_OVERDUE_RECEIVABLES, new Meta("Cobros vencidos", Unit.PCT));
        META.put(IndicatorId.DEL_AGING_90, new Meta("Vencido a más de 90 días", Unit.PCT));
        META.put(IndicatorId.CON_HHI_CUSTOMERS, new Meta("Concentración de clientes (HHI)", Unit.HHI));
        META.put(IndicatorId.CON_HHI_SUPPLIERS, new Meta("Concentración de proveedores (HHI)", Unit.HHI));
        META.put(IndicatorId.CON_CUSTOMER_CHURN, new Meta("Rotación de clientes", Unit.PCT));
        META.put(IndicatorId.TAX_REGULARITY, new Meta("Regularidad fiscal", Unit.PCT));
    }

    @Override
    public String render(String driverId, RawIndicator before, RawIndicator after, double deltaPoints) {
        String pts = signed(String.format(ES, "%.1f", Math.abs(deltaPoints)), deltaPoints) + " pts";
        if (MOMENTUM.equals(driverId)) {
            return "Inercia de la trayectoria (momentum) → " + pts;
        }
        Meta meta = META.get(IndicatorId.valueOf(driverId));
        if (before == null || !before.available()) {
            return String.format(ES, "%s entra en el cálculo con %s → %s", meta.label(), value(after, meta.unit()), pts);
        }
        if (after == null || !after.available()) {
            return String.format(ES, "%s deja de estar disponible → %s", meta.label(), pts);
        }
        if (before.value() == null || after.value() == null) {
            return String.format(ES, "%s pasa de %s a %s → %s",
                    meta.label(), value(before, meta.unit()), value(after, meta.unit()), pts);
        }
        double diff = after.value() - before.value();
        if (diff == 0) {
            return String.format(ES, "%s se mantiene en %s → %s", meta.label(), value(after, meta.unit()), pts);
        }
        return String.format(ES, "%s %s de %s a %s (%s) → %s", meta.label(), diff > 0 ? "sube" : "baja",
                value(before, meta.unit()), value(after, meta.unit()), change(diff, meta.unit()), pts);
    }

    /** A rule-defined level has no value (phase 3 contract item 5): DSCR with no debt service. */
    private static String value(RawIndicator r, Unit unit) {
        if (r == null || r.value() == null) {
            return r != null && r.id() == IndicatorId.DEBT_DSCR ? "sin deuda" : "n/d";
        }
        double v = r.value();
        return switch (unit) {
            case DAYS -> String.format(ES, "%.0f días", v);
            case MONTHS -> String.format(ES, "%.1f meses", v);
            case PCT -> String.format(ES, "%.0f %%", v * 100);
            case MULTIPLE -> String.format(ES, "%.2fx", v);
            case RATIO -> String.format(ES, "%.2f", v);
            case HHI -> String.format(ES, "%.0f", v);
        };
    }

    private static String change(double d, Unit unit) {
        double a = Math.abs(d);
        String body = switch (unit) {
            case DAYS -> String.format(ES, "%.0f días", a);
            case MONTHS -> String.format(ES, "%.1f meses", a);
            case PCT -> String.format(ES, "%.0f pp", a * 100);
            case MULTIPLE -> String.format(ES, "%.2fx", a);
            case RATIO -> String.format(ES, "%.2f", a);
            case HHI -> String.format(ES, "%.0f", a);
        };
        return signed(body, d);
    }

    /** A real minus sign, like the UI (lib/format.ts formatDelta). */
    private static String signed(String abs, double v) {
        return (v > 0 ? "+" : v < 0 ? "−" : "") + abs;
    }
}
```

- [ ] **Step 3: Write `S65_Explain`**

```java
package com.xray.pipeline.stages;

import com.xray.config.ScoringConfig;
import com.xray.domain.model.Category;
import com.xray.domain.model.Contribution;
import com.xray.domain.model.EntityPanel;
import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.Profile;
import com.xray.domain.model.ProfileScore;
import com.xray.domain.service.ExplanationService;
import com.xray.infrastructure.duckdb.ResultWriter;
import com.xray.narrative.NarrativeRenderer;
import com.xray.pipeline.PipelineContext;
import com.xray.pipeline.PipelineStage;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/** Contributions, 1m and 3m deltas and narratives (SPEC §7.5, phase 4 contract item 4). */
@Component
@Order(65)
public class S65_Explain implements PipelineStage {

    static final String DDL = "entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, profile VARCHAR, "
            + "driver_id VARCHAR, category VARCHAR, eff_weight DOUBLE, blended DOUBLE, contrib DOUBLE, "
            + "delta1 DOUBLE, delta3 DOUBLE, narrative_1m VARCHAR, narrative_3m VARCHAR";

    private final ResultWriter writer;
    private final NarrativeRenderer renderer;

    public S65_Explain(ResultWriter writer, NarrativeRenderer renderer) {
        this.writer = writer;
        this.renderer = renderer;
    }

    @Override
    public String id() {
        return "S65_EXPLAIN";
    }

    @Override
    public void execute(PipelineContext ctx) {
        if (ctx.panels().isEmpty()) {
            ctx.report(id(), 65, "skipped: no panels");
            return;
        }
        ScoringConfig config = ctx.config();
        Map<Category, List<IndicatorId>> members = CategoryMembers.of(config);
        Map<Profile, Double> lambdas = new EnumMap<>(Profile.class);
        config.profiles().forEach((p, pc) -> lambdas.put(p, pc.lambda()));
        int topN = config.explanation().narrativeTopN();
        double minDelta = config.explanation().minNarratedDelta();

        ctx.panels().parallelStream().forEach(panel -> explain(panel, members, lambdas));
        ctx.report(id(), 67, "writing contributions");
        List<Object[]> rows = ctx.panels().parallelStream()
                .flatMap(panel -> rows(panel, topN, minDelta).stream()).toList();
        int n = writer.replace("contributions", DDL, rows);
        ctx.report(id(), 69, n + " contribution rows");
    }

    private static void explain(EntityPanel panel, Map<Category, List<IndicatorId>> members, Map<Profile, Double> lambdas) {
        for (Profile p : Profile.values()) {
            ProfileScore[] s = panel.profileScores(p);
            List<List<Contribution>> series = new ArrayList<>(panel.size());
            for (int m = 0; m < panel.size(); m++) {
                int mm = m;
                series.add(ExplanationService.explain(s[m], members, id -> panel.subScores(id)[mm], lambdas.get(p)));
            }
            panel.setContributions(p, series);
        }
    }

    private List<Object[]> rows(EntityPanel panel, int topN, double minDelta) {
        List<Object[]> rows = new ArrayList<>();
        for (Profile p : Profile.values()) {
            List<List<Contribution>> series = panel.contributions(p);
            ProfileScore[] s = panel.profileScores(p);
            for (int m = 0; m < panel.size(); m++) {
                List<Contribution> now = series.get(m);
                if (now.isEmpty()) continue;
                Map<String, Double> d1 = deltas(series, s, m, 1);
                Map<String, Double> d3 = deltas(series, s, m, 3);
                Set<String> n1 = top(d1, topN, minDelta);
                Set<String> n3 = top(d3, topN, minDelta);
                for (Contribution c : now) {
                    Double x1 = d1 == null ? null : d1.get(c.driverId());
                    Double x3 = d3 == null ? null : d3.get(c.driverId());
                    rows.add(new Object[]{panel.key().type().name(), panel.key().id(),
                            panel.months().get(m).toString(), p.name(), c.driverId(), c.category().name(),
                            c.effWeight(), c.blended(), c.contrib(), x1, x3,
                            n1.contains(c.driverId()) ? narrate(panel, c.driverId(), m - 1, m, x1) : null,
                            n3.contains(c.driverId()) ? narrate(panel, c.driverId(), m - 3, m, x3) : null});
                }
            }
        }
        return rows;
    }

    /** driver -> contrib(m) − contrib(m−k); a driver absent at m−k counts as 0. Null when final(m−k) is null. */
    private static Map<String, Double> deltas(List<List<Contribution>> series, ProfileScore[] s, int m, int k) {
        if (m < k || s[m - k].finalScore() == null) {
            return null;
        }
        Map<String, Double> before = series.get(m - k).stream()
                .collect(Collectors.toMap(Contribution::driverId, Contribution::contrib));
        Map<String, Double> out = new HashMap<>();
        for (Contribution c : series.get(m)) {
            out.put(c.driverId(), c.contrib() - before.getOrDefault(c.driverId(), 0.0));
        }
        return out;
    }

    private static Set<String> top(Map<String, Double> deltas, int n, double minDelta) {
        if (deltas == null) {
            return Set.of();
        }
        return deltas.entrySet().stream()
                .filter(e -> Math.abs(e.getValue()) >= minDelta)
                .sorted(Comparator.comparingDouble((Map.Entry<String, Double> e) -> -Math.abs(e.getValue())))
                .limit(n)
                .map(Map.Entry::getKey)
                .collect(Collectors.toSet());
    }

    private String narrate(EntityPanel panel, String driverId, int from, int to, double delta) {
        if (ExplanationService.MOMENTUM.equals(driverId)) {
            return renderer.render(driverId, null, null, delta);
        }
        IndicatorId id = IndicatorId.valueOf(driverId);
        return renderer.render(driverId, panel.raw(id, from), panel.raw(id, to), delta);
    }
}
```

- [ ] **Step 4: Build and run the pipeline**

Run: `cd backend && ./mvnw -q test`, then the run helper of Task 0 Step 3.
Expected: status `DONE` with `S65_EXPLAIN` in `stageTimingsMs`. Then:
```sql
-- the sum on real data: expect 0
SELECT COUNT(*) FROM (
  SELECT c.entity_type, c.entity_id, c.month, c.profile, SUM(c.contrib) AS s, ANY_VALUE(p.final) AS f
  FROM contributions c JOIN profile_scores p USING (entity_type, entity_id, month, profile)
  GROUP BY ALL) WHERE ABS(s - (f - 50)) > 0.05;
-- every scored row has contributions: expect 0
SELECT COUNT(*) FROM profile_scores p WHERE final IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM contributions c WHERE c.entity_type = p.entity_type AND c.entity_id = p.entity_id
    AND c.month = p.month AND c.profile = p.profile);
-- narratives look right
SELECT driver_id, ROUND(delta1, 1), narrative_1m FROM contributions
WHERE entity_type = 'GROUP' AND profile = 'BANK' AND month = '2026-08' AND narrative_1m IS NOT NULL LIMIT 10;
SELECT entity_type, COUNT(*) FROM contributions GROUP BY 1;
```
Write down the row counts and the `S65_EXPLAIN` time for the final report. If S65 takes more than 30 s, report it. Do not optimize now.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/xray/narrative backend/src/main/java/com/xray/pipeline/stages/S65_Explain.java
git commit -m "feat(pipeline): add contributions with 1m and 3m deltas and narratives"
```

---

### Task 5: `CusumDetector` and `RegimeClassifier`

**Files:**
- Create: `backend/src/main/java/com/xray/domain/service/CusumDetector.java`, `RegimeClassifier.java`
- Scratch test (delete before the commit): `backend/src/test/java/com/xray/domain/service/ScratchDynamicsTest.java`

**Interfaces:**
- Produces: `CusumDetector.Params(double k, double h, double zCap, int baselineMonths, int baselineMinPoints, double sigmaFloor)`, `CusumDetector.Alarm(int changeMonth, int alarmMonth, ChangeDirection direction)`, `CusumDetector.Result(boolean[] upActive, boolean[] downActive, Double[] z, Double[] median, Double[] sigma, List<Alarm> alarms)`, `static Result run(Double[] x, Params p)`, `CusumDetector.MAD_TO_SIGMA`.
- Produces: `RegimeClassifier.Params(int slopeMonths, int slopeMinPoints, double slopeThreshold, int persistenceMonths, double dipZ, int dipMaxMonths, int dipRecoveryMonths)`, `RegimeClassifier.Result(Regime[] regimes, boolean[] seasonal)`, `static Result classify(Double[] x, CusumDetector.Result c, Params p)`.

- [ ] **Step 1: Write the scratch test**

```java
package com.xray.domain.service;

import com.xray.domain.model.ChangeDirection;
import com.xray.domain.model.Regime;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/** Scratch: delete before the commit (only the six CLAUDE.md tests may exist). */
class ScratchDynamicsTest {

    private static final CusumDetector.Params CP = new CusumDetector.Params(0.5, 4.0, 3.0, 6, 4, 2.0);
    private static final RegimeClassifier.Params RP = new RegimeClassifier.Params(6, 4, 1.5, 3, -2.0, 2, 2);

    @Test
    void steadyDeclineIsStructural() {
        Double[] x = new Double[24];
        for (int m = 0; m < 24; m++) x[m] = m < 10 ? 70.0 + (m % 2) : 70.0 - 3.0 * (m - 9);
        CusumDetector.Result c = CusumDetector.run(x, CP);
        assertTrue(c.alarms().stream().anyMatch(a -> a.direction() == ChangeDirection.DOWN));
        assertTrue(c.downActive()[15]);
        assertFalse(c.upActive()[15]);
        Regime[] r = RegimeClassifier.classify(x, c, RP).regimes();
        assertEquals(Regime.STRUCTURAL_DECLINE, r[15]);
        assertEquals(Regime.STABLE, r[5]);
    }

    @Test
    void oneMonthDropIsADipThenRecovers() {
        Double[] x = new Double[24];
        for (int m = 0; m < 24; m++) x[m] = 70.0 + (m % 2);
        x[12] = 55.0;
        CusumDetector.Result c = CusumDetector.run(x, CP);
        Regime[] r = RegimeClassifier.classify(x, c, RP).regimes();
        assertEquals(Regime.DIP, r[12]);
        assertEquals(Regime.DIP_RECOVERED, r[13]);
    }

    @Test
    void nullMonthsCarryNoRegimeAndNoBaselineMeansNoAlarm() {
        Double[] x = new Double[24];
        for (int m = 20; m < 24; m++) x[m] = 50.0;
        CusumDetector.Result c = CusumDetector.run(x, CP);
        Regime[] r = RegimeClassifier.classify(x, c, RP).regimes();
        assertNull(r[3]);
        assertEquals(Regime.STABLE, r[23]);
        assertTrue(c.alarms().isEmpty());
    }

    @Test
    void cusumIsCausal() {
        Double[] full = new Double[24];
        for (int m = 0; m < 24; m++) full[m] = 60.0 + 10 * Math.sin(m / 3.0);
        Double[] cut = java.util.Arrays.copyOf(full, 13);
        CusumDetector.Result a = CusumDetector.run(full, CP);
        CusumDetector.Result b = CusumDetector.run(cut, CP);
        for (int m = 0; m < 13; m++) {
            assertEquals(a.z()[m], b.z()[m]);
            assertEquals(a.downActive()[m], b.downActive()[m]);
        }
        assertEquals(java.util.Arrays.asList(RegimeClassifier.classify(full, a, RP).regimes()).subList(0, 13),
                java.util.Arrays.asList(RegimeClassifier.classify(cut, b, RP).regimes()));
    }
}
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd backend && ./mvnw -q test -Dtest=ScratchDynamicsTest`
Expected: compilation error, `cannot find symbol ... CusumDetector`.

- [ ] **Step 3: Write `CusumDetector`**

```java
package com.xray.domain.service;

import com.xray.domain.model.ChangeDirection;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Two-sided CUSUM (SPEC §8.1, phase 4 decision E4). The baseline at m is the median and MAD × 1.4826 of the
 * non-null values of the previous baselineMonths months (m excluded), with σ ≥ sigmaFloor. No reset after an
 * alarm: an alarm is active while its cumulative sum stays above h. Each z adds at most zCap to a sum, so one
 * outlier cannot hold an alarm for months. z[] keeps the raw z (RegimeClassifier uses it for dips).
 * A null value carries the sums and the state.
 */
public final class CusumDetector {

    public static final double MAD_TO_SIGMA = 1.4826;

    public record Params(double k, double h, double zCap, int baselineMonths, int baselineMinPoints, double sigmaFloor) {
    }

    /** changeMonth = last month the sum was 0 before the alarm; alarmMonth = the month it fired. */
    public record Alarm(int changeMonth, int alarmMonth, ChangeDirection direction) {
    }

    public record Result(boolean[] upActive, boolean[] downActive, Double[] z, Double[] median, Double[] sigma,
                         List<Alarm> alarms) {
    }

    private CusumDetector() {
    }

    public static Result run(Double[] x, Params p) {
        int n = x.length;
        boolean[] up = new boolean[n];
        boolean[] down = new boolean[n];
        Double[] z = new Double[n];
        Double[] med = new Double[n];
        Double[] sig = new Double[n];
        List<Alarm> alarms = new ArrayList<>();
        double sPos = 0;
        double sNeg = 0;
        int zeroPos = 0;
        int zeroNeg = 0;
        boolean upOn = false;
        boolean downOn = false;
        for (int m = 0; m < n; m++) {
            if (x[m] != null) {
                double[] base = baseline(x, m, p.baselineMonths());
                if (base.length >= p.baselineMinPoints()) {
                    double md = median(base);
                    double s = Math.max(p.sigmaFloor(), MAD_TO_SIGMA * mad(base, md));
                    double zz = (x[m] - md) / s;
                    med[m] = md;
                    sig[m] = s;
                    z[m] = zz;
                    double zc = Math.max(-p.zCap(), Math.min(p.zCap(), zz));   // Huber: one outlier adds at most zCap
                    sPos = Math.max(0, sPos + zc - p.k());
                    sNeg = Math.max(0, sNeg - zc - p.k());
                } else {
                    sPos = 0;   // no baseline yet: nothing to compare with
                    sNeg = 0;
                }
                if (sPos == 0) zeroPos = m;
                if (sNeg == 0) zeroNeg = m;
                boolean upNow = sPos > p.h();
                boolean downNow = sNeg > p.h();
                if (upNow && !upOn) alarms.add(new Alarm(zeroPos, m, ChangeDirection.UP));
                if (downNow && !downOn) alarms.add(new Alarm(zeroNeg, m, ChangeDirection.DOWN));
                upOn = upNow;
                downOn = downNow;
            }
            up[m] = upOn;
            down[m] = downOn;
        }
        return new Result(up, down, z, med, sig, List.copyOf(alarms));
    }

    /** Non-null values of the `size` months before m, m excluded (causal). */
    static double[] baseline(Double[] x, int m, int size) {
        int[] w = CausalWindow.window(m - 1, size);
        return Arrays.stream(x, w[0], w[1] + 1).filter(v -> v != null).mapToDouble(Double::doubleValue).toArray();
    }

    static double median(double[] v) {
        double[] a = v.clone();
        Arrays.sort(a);
        int k = a.length / 2;
        return a.length % 2 == 1 ? a[k] : (a[k - 1] + a[k]) / 2;
    }

    static double mad(double[] v, double md) {
        return median(Arrays.stream(v).map(d -> Math.abs(d - md)).toArray());
    }
}
```
Note: for m = 0, `CausalWindow.window(-1, size)` gives `[0, -1]`, and `Arrays.stream(x, 0, 0)` is empty.

- [ ] **Step 4: Write `RegimeClassifier`**

```java
package com.xray.domain.service;

import com.xray.domain.model.Regime;

/**
 * Regime per month on a final-score series (SPEC §8.2). Causal: month m reads 0..m and the CUSUM result at 0..m.
 * Persistence counts consecutive months with the same sign of change of the series (phase 4 decision E5).
 */
public final class RegimeClassifier {

    /** SPEC §8.2 "the same month last year". Part of the definition, not a tunable. */
    static final int YEAR = 12;
    private static final double EPS = 1e-9;

    public record Params(int slopeMonths, int slopeMinPoints, double slopeThreshold, int persistenceMonths,
                         double dipZ, int dipMaxMonths, int dipRecoveryMonths) {
    }

    /** regimes[m] null when x[m] is null. seasonal[m] true only for a DIP month. */
    public record Result(Regime[] regimes, boolean[] seasonal) {
    }

    private RegimeClassifier() {
    }

    public static Result classify(Double[] x, CusumDetector.Result c, Params p) {
        int n = x.length;
        Regime[] out = new Regime[n];
        boolean[] seasonal = new boolean[n];
        int persistence = 0;
        Double prev = null;
        int dipRun = 0;
        int lastDip = -1;
        double dipMedian = 0;
        double dipMad = 0;
        for (int m = 0; m < n; m++) {
            if (x[m] == null) {
                persistence = 0;
                prev = null;
                dipRun = 0;
                continue;
            }
            if (prev != null) {
                double d = x[m] - prev;
                int sign = d > EPS ? 1 : d < -EPS ? -1 : 0;
                persistence = sign == 0 ? 0 : Integer.signum(persistence) == sign ? persistence + sign : sign;
            }
            prev = x[m];
            Double slope = slope(x, m, p);
            if (c.downActive()[m] && slope != null && slope < -p.slopeThreshold() && persistence <= -p.persistenceMonths()) {
                out[m] = Regime.STRUCTURAL_DECLINE;
                dipRun = 0;
                lastDip = -1;
                continue;
            }
            if (c.upActive()[m] && slope != null && slope > p.slopeThreshold() && persistence >= p.persistenceMonths()) {
                out[m] = Regime.STRUCTURAL_IMPROVEMENT;
                dipRun = 0;
                lastDip = -1;
                continue;
            }
            Double z = c.z()[m];
            if (z != null && z <= p.dipZ()) {
                dipRun++;
                if (dipRun == 1) {
                    dipMedian = c.median()[m];
                    dipMad = c.sigma()[m] / CusumDetector.MAD_TO_SIGMA;
                }
                if (dipRun <= p.dipMaxMonths()) {
                    out[m] = Regime.DIP;
                    lastDip = m;
                    seasonal[m] = m >= YEAR && c.z()[m - YEAR] != null && c.z()[m - YEAR] <= p.dipZ();
                } else {
                    out[m] = Regime.STABLE;   // too long for a dip, not structural either
                    lastDip = -1;
                }
                continue;
            }
            dipRun = 0;
            if (lastDip >= 0 && m - lastDip <= p.dipRecoveryMonths() && Math.abs(x[m] - dipMedian) <= dipMad) {
                out[m] = Regime.DIP_RECOVERED;
                lastDip = -1;
                continue;
            }
            if (lastDip >= 0 && m - lastDip > p.dipRecoveryMonths()) {
                lastDip = -1;
            }
            out[m] = Regime.STABLE;
        }
        return new Result(out, seasonal);
    }

    /** OLS slope (points/month) of the non-null values in the window ending at m. Null below slopeMinPoints. */
    static Double slope(Double[] x, int m, Params p) {
        int[] w = CausalWindow.window(m, p.slopeMonths());
        double sx = 0, sy = 0, sxx = 0, sxy = 0;
        int k = 0;
        for (int i = w[0]; i <= w[1]; i++) {
            if (x[i] == null) continue;
            sx += i;
            sy += x[i];
            sxx += (double) i * i;
            sxy += i * x[i];
            k++;
        }
        if (k < p.slopeMinPoints()) return null;
        double den = k * sxx - sx * sx;
        return den == 0 ? null : (k * sxy - sx * sy) / den;
    }
}
```

- [ ] **Step 5: Run the scratch test**

Run: `cd backend && ./mvnw -q test -Dtest=ScratchDynamicsTest`
Expected: 4 tests pass. If `steadyDeclineIsStructural` fails on `r[15]`, print `c.z()`, `c.downActive()` and the slope for m = 10..16 before you change code. Do not change a config value to make the test pass.

- [ ] **Step 6: Delete the scratch test and commit**

```bash
rm backend/src/test/java/com/xray/domain/service/ScratchDynamicsTest.java
cd backend && ./mvnw -q test && cd ..
git add backend/src/main/java/com/xray/domain/service/CusumDetector.java backend/src/main/java/com/xray/domain/service/RegimeClassifier.java
git commit -m "feat(domain): add cusum change detection and regime classification"
```

---

### Task 6: `StatusResolver`, `ConfidenceResolver` and `S70_Dynamics`

**Files:**
- Create: `backend/src/main/java/com/xray/domain/service/StatusResolver.java`, `ConfidenceResolver.java`
- Create: `backend/src/main/java/com/xray/pipeline/stages/S70_Dynamics.java`

**Interfaces:**
- Consumes: `CusumDetector`, `RegimeClassifier`, `ProfileScoreTable`, `CategoryMembers`, `EntityPanel.setDynamics`, `EntityPanel.addChangepoint`.
- Produces: `StatusResolver.Params(...)`, `static HealthStatus resolve(double fin, Double level, Double traj, Regime regime, boolean cusumDown, Params p)`; `ConfidenceResolver.Params(int lowHistoryMonths, int mediumHistoryMonths, double lowAvailableShare)`, `static Confidence resolve(int historyMonths, double availableShare, boolean fallbackUsed, Params p)`; the tables `profile_scores` (rewritten) and `changepoints`.

- [ ] **Step 1: Write `StatusResolver`**

```java
package com.xray.domain.service;

import com.xray.domain.model.HealthStatus;
import com.xray.domain.model.Regime;

/** The eight statuses of SPEC §8.3, in precedence order. traj null never meets a trajectory condition. */
public final class StatusResolver {

    public record Params(double criticalBelow, double turningMinLevel, double turningMaxTraj, double improvingMinTraj,
                         double exceptionalMinFinal, double exceptionalMinTraj, double healthyMinFinal) {
    }

    private StatusResolver() {
    }

    public static HealthStatus resolve(double fin, Double level, Double traj, Regime regime, boolean cusumDown, Params p) {
        if (fin < p.criticalBelow()) return HealthStatus.CRITICAL;
        if (regime == Regime.STRUCTURAL_DECLINE) return HealthStatus.STRUCTURAL_DECLINE;
        if (level != null && level >= p.turningMinLevel()
                && ((traj != null && traj <= p.turningMaxTraj()) || cusumDown)) return HealthStatus.TURNING;
        if (regime == Regime.DIP) return HealthStatus.DIP;
        if (regime == Regime.STRUCTURAL_IMPROVEMENT || (traj != null && traj >= p.improvingMinTraj())) {
            return HealthStatus.IMPROVING;
        }
        if (fin >= p.exceptionalMinFinal() && traj != null && traj >= p.exceptionalMinTraj()) return HealthStatus.EXCEPTIONAL;
        if (fin >= p.healthyMinFinal()) return HealthStatus.HEALTHY;
        return HealthStatus.WATCH;
    }
}
```

- [ ] **Step 2: Write `ConfidenceResolver`**

```java
package com.xray.domain.service;

import com.xray.domain.model.Confidence;

/**
 * SPEC §7.6. history = scored months up to m. availableShare = available indicators of the profile's weighted
 * categories. A fallback indicator (e.g. QoQ growth before M14) caps the confidence at MEDIUM.
 */
public final class ConfidenceResolver {

    public record Params(int lowHistoryMonths, int mediumHistoryMonths, double lowAvailableShare) {
    }

    private ConfidenceResolver() {
    }

    public static Confidence resolve(int historyMonths, double availableShare, boolean fallbackUsed, Params p) {
        if (historyMonths < p.lowHistoryMonths() || availableShare < p.lowAvailableShare()) return Confidence.LOW;
        if (historyMonths < p.mediumHistoryMonths() || fallbackUsed) return Confidence.MEDIUM;
        return Confidence.HIGH;
    }
}
```

- [ ] **Step 3: Write `S70_Dynamics`**

```java
package com.xray.pipeline.stages;

import com.xray.config.ScoringConfig;
import com.xray.domain.model.Category;
import com.xray.domain.model.Changepoint;
import com.xray.domain.model.Confidence;
import com.xray.domain.model.DynamicsPoint;
import com.xray.domain.model.EntityPanel;
import com.xray.domain.model.HealthStatus;
import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.Profile;
import com.xray.domain.model.ProfileScore;
import com.xray.domain.model.Regime;
import com.xray.domain.model.SubScore;
import com.xray.domain.service.ConfidenceResolver;
import com.xray.domain.service.CusumDetector;
import com.xray.domain.service.RegimeClassifier;
import com.xray.domain.service.StatusResolver;
import com.xray.infrastructure.duckdb.ResultWriter;
import com.xray.pipeline.PipelineContext;
import com.xray.pipeline.PipelineStage;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/** CUSUM changepoints, regimes, statuses and confidence (SPEC §7.6, §8.1–§8.3). Rewrites profile_scores. */
@Component
@Order(70)
public class S70_Dynamics implements PipelineStage {

    static final String CHANGEPOINTS_DDL = "entity_type VARCHAR, entity_id VARCHAR, profile VARCHAR, series VARCHAR, "
            + "month VARCHAR, alarm_month VARCHAR, direction VARCHAR";
    static final String FINAL_SERIES = "FINAL";

    private final ResultWriter writer;

    public S70_Dynamics(ResultWriter writer) {
        this.writer = writer;
    }

    @Override
    public String id() {
        return "S70_DYNAMICS";
    }

    private record Setup(CusumDetector.Params cusum, RegimeClassifier.Params regime, StatusResolver.Params status,
                         ConfidenceResolver.Params confidence, List<IndicatorId> cusumIndicators,
                         Map<Profile, List<IndicatorId>> used) {
    }

    @Override
    public void execute(PipelineContext ctx) {
        if (ctx.panels().isEmpty()) {
            ctx.report(id(), 70, "skipped: no panels");
            return;
        }
        Setup setup = setup(ctx.config());
        ctx.panels().parallelStream().forEach(panel -> dynamics(panel, setup));
        ctx.report(id(), 80, "writing profile_scores and changepoints");
        List<Object[]> profileRows = ctx.panels().parallelStream()
                .flatMap(panel -> ProfileScoreTable.rows(panel).stream()).toList();
        List<Object[]> changeRows = ctx.panels().parallelStream()
                .flatMap(panel -> changepointRows(panel).stream()).toList();
        writer.replace(ProfileScoreTable.NAME, ProfileScoreTable.DDL, profileRows);
        int n = writer.replace("changepoints", CHANGEPOINTS_DDL, changeRows);
        ctx.report(id(), 90, n + " changepoints");
    }

    private static Setup setup(ScoringConfig c) {
        var r = c.regimes();
        var s = c.statuses();
        var f = c.confidence();
        Map<Category, List<IndicatorId>> members = CategoryMembers.of(c);
        Map<Profile, List<IndicatorId>> used = new EnumMap<>(Profile.class);
        c.profiles().forEach((p, pc) -> {
            List<IndicatorId> ids = new ArrayList<>();
            pc.weights().forEach((cat, w) -> {
                if (cat != Category.MOMENTUM && w > 0) ids.addAll(members.get(cat));
            });
            used.put(p, ids);
        });
        return new Setup(
                new CusumDetector.Params(r.cusumK(), r.cusumH(), r.cusumZCap(), r.baselineMonths(), r.baselineMinPoints(),
                        r.sigmaFloor()),
                new RegimeClassifier.Params(r.slopeMonths(), r.slopeMinPoints(), r.slopeThreshold(),
                        r.persistenceMonths(), r.dipZ(), r.dipMaxMonths(), r.dipRecoveryMonths()),
                new StatusResolver.Params(s.criticalBelow(), s.turningMinLevel(), s.turningMaxTraj(),
                        s.improvingMinTraj(), s.exceptionalMinFinal(), s.exceptionalMinTraj(), s.healthyMinFinal()),
                new ConfidenceResolver.Params(f.lowHistoryMonths(), f.mediumHistoryMonths(), f.lowAvailableShare()),
                r.cusumIndicators(), used);
    }

    private static void dynamics(EntityPanel panel, Setup setup) {
        for (IndicatorId id : setup.cusumIndicators()) {
            SubScore[] s = panel.subScores(id);
            Double[] x = new Double[s.length];
            for (int m = 0; m < s.length; m++) x[m] = s[m].available() ? s[m].level() : null;
            for (CusumDetector.Alarm a : CusumDetector.run(x, setup.cusum()).alarms()) {
                panel.addChangepoint(new Changepoint(id.name(), null, a.changeMonth(), a.alarmMonth(), a.direction()));
            }
        }
        for (Profile p : Profile.values()) {
            ProfileScore[] s = panel.profileScores(p);
            Double[] x = new Double[s.length];
            for (int m = 0; m < s.length; m++) x[m] = s[m].finalScore();
            CusumDetector.Result cusum = CusumDetector.run(x, setup.cusum());
            for (CusumDetector.Alarm a : cusum.alarms()) {
                panel.addChangepoint(new Changepoint(FINAL_SERIES, p, a.changeMonth(), a.alarmMonth(), a.direction()));
            }
            RegimeClassifier.Result regimes = RegimeClassifier.classify(x, cusum, setup.regime());
            List<IndicatorId> used = setup.used().get(p);
            DynamicsPoint[] out = new DynamicsPoint[s.length];
            int history = 0;
            for (int m = 0; m < s.length; m++) {
                if (x[m] == null) continue;
                history++;
                Regime regime = regimes.regimes()[m];
                HealthStatus status = StatusResolver.resolve(x[m], s[m].level(), s[m].traj(), regime,
                        cusum.downActive()[m], setup.status());
                int avail = 0;
                boolean fallback = false;
                for (IndicatorId id : used) {
                    if (panel.subScores(id)[m].available()) {
                        avail++;
                        fallback |= panel.raw(id, m).fallback();
                    }
                }
                double share = used.isEmpty() ? 0 : (double) avail / used.size();
                Confidence conf = ConfidenceResolver.resolve(history, share, fallback, setup.confidence());
                out[m] = new DynamicsPoint(status, regime, regimes.seasonal()[m], conf);
            }
            panel.setDynamics(p, out);
        }
    }

    private static List<Object[]> changepointRows(EntityPanel panel) {
        List<Object[]> rows = new ArrayList<>(panel.changepoints().size());
        for (Changepoint c : panel.changepoints()) {
            rows.add(new Object[]{panel.key().type().name(), panel.key().id(),
                    c.profile() == null ? null : c.profile().name(), c.series(),
                    panel.months().get(c.month()).toString(), panel.months().get(c.alarmMonth()).toString(),
                    c.direction().name()});
        }
        return rows;
    }
}
```

- [ ] **Step 4: Build and run the pipeline**

Run: `cd backend && ./mvnw -q test`, then the run helper of Task 0 Step 3.
Expected: status `DONE`, 11 stages in `stageTimingsMs`. Then:
```sql
-- every scored row has dynamics, and no unscored row has them: expect 0 and 0
SELECT COUNT(*) FROM profile_scores WHERE final IS NOT NULL AND (status IS NULL OR regime IS NULL OR confidence IS NULL OR seasonal IS NULL);
SELECT COUNT(*) FROM profile_scores WHERE final IS NULL AND status IS NOT NULL;
-- status mix at M23 for groups
SELECT profile, status, COUNT(*) FROM profile_scores WHERE entity_type = 'GROUP' AND month = '2026-08' GROUP BY 1, 2 ORDER BY 1, 3 DESC;
-- regimes over all group-months
SELECT profile, regime, COUNT(*) FROM profile_scores WHERE entity_type = 'GROUP' AND final IS NOT NULL GROUP BY 1, 2 ORDER BY 1, 3 DESC;
SELECT confidence, COUNT(*) FROM profile_scores WHERE entity_type = 'GROUP' AND month = '2026-08' AND profile = 'BANK' GROUP BY 1;
SELECT series, direction, COUNT(*) FROM changepoints WHERE entity_type = 'GROUP' GROUP BY 1, 2 ORDER BY 1, 2;
-- the ExplanationSum check of Task 4 still gives 0
```
Record the results for the final report. If one status holds more than 60 % of the groups at M23 for a profile, report it. Do not change the thresholds.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/xray/domain/service/StatusResolver.java backend/src/main/java/com/xray/domain/service/ConfidenceResolver.java backend/src/main/java/com/xray/pipeline/stages/S70_Dynamics.java
git commit -m "feat(pipeline): add regimes, statuses, confidence and changepoints"
```

---

### Task 7: Final check and report

**Files:** none.

- [ ] **Step 1: Run everything from a clean database**

Run: `cd backend && ./mvnw -q test`, then the run helper of Task 0 Step 3.
Expected: 5 test classes pass. Status `DONE`.

- [ ] **Step 2: Check the paths you changed**

Run: `git diff --stat main...HEAD`
Expected: only paths that the overview gives to plan B. `scoring.profiles` in `scoring-config.yml` is unchanged: `git diff main...HEAD -- backend/src/main/resources/scoring-config.yml | grep -c "profiles"` prints `0`.

- [ ] **Step 3: Write the final report**

Report these items. The person who merges copies them into `docs/DATA_FINDINGS.md` ("Block 5 run"):
1. The stage timings (all 11 stages) and the total.
2. The row counts of `contributions` and `changepoints` per entity type.
3. The ExplanationSum check result on real data.
4. The status mix at M23 per profile, the regime counts, the confidence mix at M23 (BANK).
5. Any status above 60 % of the groups at M23, and any surprise in the data.
