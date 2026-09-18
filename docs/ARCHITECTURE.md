# X-Ray — Implementation Architecture

> Companion to `docs/SPEC.md`. **SPEC.md owns business rules** (indicators, anchors, weights, thresholds, product formulas). **This document owns implementation**: modules, contracts, execution model, extension points, file layout, build order.
> If the two disagree on *what* to compute, SPEC.md wins. If they disagree on *how* to structure the code, this document wins.
>
> Audience: coding agents and the two developers. Language: English for code, identifiers, commits, API.

---

## 0. Locked decisions

These were open during design. They are now closed. Do not reopen without updating this table.

| Decision | Value | Note |
|---|---|---|
| Scoring unit | `GROUP` by default, `entity_type ∈ {GROUP, COMPANY}` everywhere | SPEC §3.1. Confirm with Embat Sunday; config flip only |
| Group adjustment of subsidiary scores | **Dropped** | The group *is* the scoring unit (components summed, ratios recomputed). Company scores exist for drilldown only, computed standalone |
| Normalization | Anchors only, absolute, piecewise-linear | SPEC §6.1, §7.1. No runtime percentile anywhere in the scoring path |
| Quantiles | Reference only, for proposing anchors | Written to `threshold_quantiles`, `docs/THRESHOLDS.md`. **Never read by scoring code** |
| Store | DuckDB embedded, single file `data/xray.duckdb` | Analytical engine *and* results store. No Postgres, no JPA |
| Supervised calibration (SPEC §7.7) | **Out of scope** until the hidden test is confirmed (Sunday) | Seam preserved (§8.5 below), no implementation. M9 is not planned work |
| LLM narratives | **Not in the runtime path** | Explanations are template strings. `NarrativeRenderer` port exists so an LLM adapter can be dropped in later without touching callers |
| Weights | From `scoring-config.yml`, provisional until an expert reviews | Code must never assume the values in §7.4 of the spec |

---

## 1. Runtime shape

The single most important property of this system: **after the SQL layer the data is tiny.**

```
250 entities × 24 months × 22 indicators = 132,000 rows      (GROUP)
1,286       × 24       × 22             = 679,000 rows        (COMPANY)
```

So: heavy set-based work in SQL over 2.5M transactions, then **everything else in memory in plain Java collections**. No streaming, no chunking, no batch framework, no pagination inside the pipeline. This is what keeps the whole thing simple and under the 5-minute target.

```
┌─ SQL (DuckDB) ─────────────────────────┐   ┌─ Java (in memory) ──────────────────┐
│ raw_* → stg_* → monthly_* →            │──►│ normalize → trajectory → categories │
│ indicator_values_raw (long, tiny)      │   │ → profiles → explain → dynamics      │
└────────────────────────────────────────┘   │ → products → analytics               │
                                             └──────────────┬───────────────────────┘
                                                            ▼
                                             results tables in the same DuckDB file
```

---

## 2. Repo layout

```
/backend
  pom.xml
  src/main/java/com/xray/...                  (§3)
  src/main/resources/
    application.yml
    scoring-config.yml                        (SPEC §9 — the only place thresholds live)
    sql/                                      (§5)
  src/test/java/com/xray/...                  (§9)
/frontend                                     React 18 + TS + Vite (SPEC §12.6)
/data/raw/*.csv                               gitignored
/data/xray.duckdb                             gitignored; keep a frozen copy for the demo
/docs
  SPEC.md  ARCHITECTURE.md  DATA_FINDINGS.md  THRESHOLDS.md  PITCH.md
docker-compose.yml
CLAUDE.md                                     "Read docs/SPEC.md then docs/ARCHITECTURE.md"
```

---

## 3. Package structure

```
com.xray
├── XRayApplication.java
│
├── config/
│   ├── ScoringConfig.java            @ConfigurationProperties("scoring") — see §6
│   ├── IndicatorConfig.java          anchors, category, status, source
│   ├── ProfileConfig.java            lambda + weights
│   ├── LimitEngineConfig.java
│   └── DuckDbConfig.java             single connection bean + SqlRunner
│
├── domain/                           ← no Spring annotations, no SQL, pure logic
│   ├── model/
│   │   ├── EntityKey.java            (EntityType type, String id)
│   │   ├── Month.java                YYYY-MM value object with plus/minus/compareTo
│   │   ├── IndicatorId.java          enum, 22 values
│   │   ├── Category.java             enum, 10 values
│   │   ├── Profile.java              enum BANK | FUND | INSURER
│   │   ├── RawIndicator.java         value + flags, straight from SQL
│   │   ├── SubScore.java             level + traj + availability
│   │   ├── CategoryScore.java
│   │   ├── ProfileScore.java         final, level, traj, band, status, regime, confidence
│   │   ├── Contribution.java
│   │   ├── Alert.java  Band.java  HealthStatus.java  Regime.java
│   │   ├── LimitDecision.java  PremiumQuote.java  LeadTimeEvent.java
│   │   └── EntityPanel.java          ← the in-memory unit of work, see §4.2
│   └── service/
│       ├── AnchorInterpolator.java   raw value → 0-100
│       ├── TrajectoryCalculator.java smoothing + OLS slope + delta3
│       ├── CategoryAggregator.java
│       ├── ProfileScorer.java        renormalization over available categories
│       ├── ExplanationService.java   exact additive decomposition
│       ├── CusumDetector.java
│       ├── RegimeClassifier.java
│       ├── StatusResolver.java
│       ├── AlertEngine.java          runs the AlertRule beans, handles transitions
│       ├── LimitEngine.java
│       ├── PremiumEngine.java
│       ├── MomentumScreen.java
│       ├── LeadTimeAnalyzer.java
│       └── ShowcaseFinder.java
│
├── pipeline/
│   ├── PipelineStage.java            ← extension point #1 (§8.1)
│   ├── PipelineContext.java
│   ├── PipelineRunner.java           orchestrator, ordered stages, progress
│   ├── PipelineStatus.java
│   └── stages/
│       ├── S00_Ingest.java           runs sql/00_*
│       ├── S10_Staging.java          sql/10_*
│       ├── S20_MonthlyAggregates.java sql/20_*
│       ├── S30_RawIndicators.java    sql/30_* → indicator_values_raw
│       ├── S40_Normalize.java        anchors → level_score   (Java)
│       ├── S50_Trajectory.java       → traj_score            (Java)
│       ├── S60_Score.java            categories → profiles    (Java)
│       ├── S65_Explain.java          contributions            (Java)
│       ├── S70_Dynamics.java         CUSUM, regimes, statuses (Java)
│       ├── S80_Alerts.java           alert rules              (Java)
│       ├── S85_Products.java         limits, premiums         (Java)
│       ├── S90_Analytics.java        lead time, showcase      (Java)
│       └── S95_Quantiles.java        threshold_quantiles — reference only
│
├── alerting/
│   ├── AlertRule.java                ← extension point #2 (§8.2)
│   └── rules/                        one class per alert code (SPEC §8.5)
│
├── narrative/
│   ├── NarrativeRenderer.java        ← extension point #3 (§8.3)
│   └── TemplateNarrativeRenderer.java  the only implementation in scope
│
├── calibration/
│   └── ScoreCalibrator.java          ← extension point #4 (§8.5) — interface only, no impl
│
├── application/                      use cases, thin
│   ├── RunPipelineUseCase.java
│   ├── PortfolioQuery.java  EntityDetailQuery.java  TimelineQuery.java
│   ├── SimulateLimitUseCase.java  MonitorReplayUseCase.java
│   └── ExportSubmissionUseCase.java
│
└── infrastructure/
    ├── duckdb/
    │   ├── SqlRunner.java            loads + executes classpath SQL, param substitution
    │   ├── PanelLoader.java          indicator_values_raw → List<EntityPanel>
    │   └── ResultWriter.java         batch appender writes for every results table
    └── web/
        ├── controller/               REST + SSE (SPEC §12.5)
        ├── dto/                      Java records
        └── WebConfig.java            CORS
```

**Hard rule:** `domain/` imports nothing from `org.springframework` or `java.sql`. It takes data in, returns data out. Everything in `domain/service` is unit-testable without a container.

---

## 4. Core contracts

### 4.1 Pipeline

```java
public interface PipelineStage {
    String id();                       // "S40_NORMALIZE" — shown in progress
    void execute(PipelineContext ctx);
}
```

```java
public class PipelineContext {
    private final SqlRunner sql;
    private final ScoringConfig config;
    private final String runId;
    private final EntityType unit;
    private List<EntityPanel> panels;  // populated by S30, mutated by S40..S90
    private final ProgressSink progress;

    public void report(String stageId, int pct, String message) { ... }
}
```

```java
@Service
public class PipelineRunner {
    private final List<PipelineStage> stages;   // Spring injects ordered by @Order

    public PipelineRunner(List<PipelineStage> stages) { this.stages = stages; }

    public void run(PipelineContext ctx) {
        for (PipelineStage s : stages) {
            long t0 = System.nanoTime();
            ctx.report(s.id(), pctFor(s), "running");
            s.execute(ctx);
            log.info("{} took {} ms", s.id(), (System.nanoTime()-t0)/1_000_000);
        }
    }
}
```

Stages are strictly sequential and each one is idempotent: re-running drops and rebuilds its own output tables. No stage reads a table written by a later stage.

### 4.2 The in-memory panel

Loaded once by `S30`, then enriched in place by every Java stage. This is what makes causality easy to enforce: a stage sees the whole series and is responsible for only reading `months[0..m]`.

```java
public class EntityPanel {
    private final EntityKey key;
    private final List<Month> months;                          // ordered, M00..M23
    private final Map<IndicatorId, RawIndicator[]> raw;         // indexed by month ordinal
    private final Map<IndicatorId, SubScore[]> subScores;       // filled by S40/S50
    private final Map<Category, CategoryScore[]> categories;    // S60
    private final Map<Profile, ProfileScore[]> profileScores;   // S60
    private final List<Contribution> contributions;             // S65
    private final List<Alert> alerts;                           // S80
    // ... limits, premiums, lead-time events
}
```

```java
public record RawIndicator(
    IndicatorId id,
    Double value,        // null = not computable this month
    boolean available,
    boolean isStatic,    // snapshot-derived (SPEC §0.2 exception)
    boolean fallback     // e.g. ACT_COLLECTIONS_GROWTH before M14
) {}

public record SubScore(
    double level,        // 0-100, from anchors
    Double trajectory,   // 0-100, null when < min_points
    boolean available
) {}
```

### 4.3 Anchors

```java
public final class AnchorInterpolator {
    /**
     * Piecewise-linear over sorted anchor points, clamped to [0,100].
     * NO EXTRAPOLATION: below the first anchor returns the first anchor's score,
     * above the last returns the last anchor's score.
     */
    public static double score(double value, List<double[]> anchors) { ... }
}
```

The no-extrapolation rule is not optional. `DEBT_DSCR` starts at `0.8→0`; a DSCR of 0.3 must return 0, not a negative number that then poisons the additive decomposition.

Every indicator config carries `status: closed | pending` and `source`. Pending indicators run with provisional anchors and the API surfaces the flag so the UI can mark them (SPEC §6.1).

**`CF_VOLATILITY` and `CON_CUSTOMER_CHURN` must ship with provisional anchors before M2 runs.** An empty anchor list is a startup failure, not a runtime fallback — `ScoringConfig` validates this with `@PostConstruct` and refuses to boot.

### 4.4 Causality

```java
public interface CausalWindow {
    /** Returns indices [start, m] for a window ending at month ordinal m. */
    static int[] window(int m, int size) { return new int[]{ Math.max(0, m - size + 1), m }; }
}
```

Every Java stage that walks months uses this. The look-ahead test (§9) is what actually enforces it.

---

## 5. SQL layer

One numbered file per step, executed in filename order by `SqlRunner`. Files are plain SQL with `${placeholder}` substitution for the unit and paths.

```
resources/sql/
  00_ingest.sql               read_csv_auto views over data/raw/*.csv → raw_*
  10_staging.sql              typed stg_*, status filter, amount_eur, flow_class
  11_intragroup.sql           intragroup tagging / removal (SPEC §5.4)
  12_balances.sql             reverse cumulative sum → daily_balance → monthly cash
  20_monthly_flows.sql
  21_monthly_cash.sql
  22_monthly_invoices.sql
  23_monthly_counterparty.sql
  24_debt_snapshot.sql
  25_entity_rollup.sql        ← company → group: SUM components, then recompute
  30_ind_liquidity.sql        ┐
  31_ind_cashflow.sql         │ each INSERTs long rows into indicator_values_raw
  32_ind_activity.sql         │ (entity_type, entity_id, month, indicator_id,
  33_ind_debt.sql             │  value, available, is_static, fallback)
  34_ind_leverage.sql         │
  35_ind_payment.sql          │ ← parallelizable across the two devs,
  36_ind_delinquency.sql      │   one file each, no merge conflicts
  37_ind_concentration.sql    │
  38_ind_tax.sql              ┘
  90_threshold_quantiles.sql  reference only (§0)
```

**`25_entity_rollup.sql` is the file to get right.** Group rows are built by summing *components* across member companies with intragroup removed, then recomputing every ratio from the sums. Never average a ratio across companies — a group with a 10 M€ subsidiary at DSO 30 and a 100 k€ one at DSO 120 has a group DSO near 31, not 75.

**Quantiles are computed per `entity_type`.** A consolidated group has different volatility, HHI and volume distributions than a single company. Proposing anchors from company-level quantiles and then scoring groups miscalibrates all 10 pending indicators. `90_threshold_quantiles.sql` filters by the active unit and writes it into the output.

`SqlRunner` contract:

```java
public interface SqlRunner {
    void runScript(String classpathPath, Map<String, String> params);
    <T> List<T> query(String sql, RowMapper<T> mapper, Object... args);
    long count(String table);
}
```

---

## 6. Configuration binding

`scoring-config.yml` (SPEC §9) binds to typed records. Nothing reads it by string key.

```java
@ConfigurationProperties(prefix = "scoring")
public record ScoringConfig(
    EntityType unit,
    MonthRange months,
    List<String> cashProductTypes,
    List<String> semiLiquidTypes,
    List<String> bookedStatusValues,
    double runwayCapMonths,
    TrajectoryConfig trajectory,
    Map<String, FlowClass> flowClasses,
    boolean otherSignFallback,
    Map<IndicatorId, IndicatorConfig> indicators,
    Map<Profile, ProfileConfig> profiles,
    RegimeConfig regimes,
    BandConfig bands,
    LimitEngineConfig limitEngine,
    InsurerConfig insurer
) {
    @PostConstruct
    void validate() {
        // every IndicatorId in the enum has a config entry
        // every config entry has ≥ 2 anchors, strictly increasing in x
        // every profile's weights sum to 100 ± 0.01
        // fail fast with a message naming the offending key
    }
}
```

Profile weights are provisional (an expert reviews them later), so **no code may hardcode or special-case a weight value**. `ProfileScorer` reads the map and renormalizes over available categories; adding a fourth profile is a YAML edit.

---

## 7. Results tables

Exactly as SPEC §12.4, with these implementation notes:

- All written by `ResultWriter` using the **DuckDB Appender**, not row-by-row `INSERT`. Row-by-row on 132k rows is the difference between 2 seconds and 2 minutes.
- Every table is dropped and recreated per run. No migrations, no incremental updates.
- `pipeline_runs(run_id, unit, started_at, finished_at, stage_timings_json, config_hash)` — `config_hash` lets the UI show which thresholds produced a given result.
- `indicator_values` carries `anchor_status` (`closed`/`pending`) denormalized so the API doesn't need to join config.

---

## 8. Extension points

Four seams. All follow the same pattern: an interface, beans implementing it, Spring injecting the ordered list. **Do not add a fifth kind of plugin mechanism.**

### 8.1 `PipelineStage` — adding a computation step
Add a class under `pipeline/stages/`, annotate `@Component @Order(n)`. It is picked up automatically. Use the existing number gaps (S45, S75…) to insert without renumbering.

### 8.2 `AlertRule` — adding an early-warning indicator

```java
public interface AlertRule {
    String code();
    AlertDirection direction();          // NEGATIVE | POSITIVE | BOTH
    Optional<AlertSignal> evaluate(EntityMonthView view);
}

public record AlertSignal(Severity severity, String message, Double value) {}
```

One class per alert code in `alerting/rules/`. `EntityMonthView` is a causal read-only window over the panel at month `m`. **Rules never deal with transitions** — `AlertEngine` compares consecutive months and emits an `Alert` only when the state changes (SPEC §8.5), so a rule is a pure predicate. Adding the 14 spec rules is 14 small classes, trivially parallel between two devs.

### 8.3 `NarrativeRenderer` — how explanations read

```java
public interface NarrativeRenderer {
    String render(Contribution c, RawIndicator before, RawIndicator after);
    String summarize(EntityKey key, Month month, List<Contribution> top);
}
```

`TemplateNarrativeRenderer` is the only implementation in scope and has no external dependency (SPEC §14: no runtime dependency on external APIs). The interface exists so an LLM-backed renderer can be added later as a separate bean without touching a single caller. If one is ever added it must be cached to the results table and never called during a request.

### 8.4 `IndicatorId` — adding an indicator
Three edits, no code structure change: enum constant, `scoring-config.yml` entry, an `INSERT` into the right `3x_ind_*.sql`. The Java stages iterate the enum.

### 8.5 `ScoreCalibrator` — the supervised seam (not implemented)

```java
public interface ScoreCalibrator {
    CalibrationReport fit(List<EntityPanel> panels, LabelSet labels);
    double[] score(EntityPanel panel);
}
```

Interface only. No implementation, no `Smile` dependency in `pom.xml`, no `/api/labels`, `/api/model/*` endpoints, no M9 in the plan. If labels appear on Sunday this is where they plug in; until then it is dead weight and stays unwritten.

---

## 9. Tests that must exist

Only these. Skip the rest.

| Test | Asserts |
|---|---|
| `AnchorInterpolatorTest` | interpolation, clamping, **no extrapolation** below first / above last anchor |
| `ExplanationSumTest` | `Σ contrib_i ≈ Final − 50` within 0.05 for every entity-month-profile |
| `LookAheadTest` | truncate the panel at M12, recompute; every value for M00..M12 is byte-identical to the full run |
| `ProfileRenormalizationTest` | with a category missing, remaining weights still sum to 1 and the score stays in [0,100] |
| `RollupTest` | a hand-built 2-company group: group DSO equals the amount-weighted figure, not the mean of the two |
| `ScoringConfigValidationTest` | empty anchors, non-monotonic anchors and weights ≠ 100 all fail at boot |

`LookAheadTest` is the one that protects the entire anticipation story. If it passes, lead-time numbers are defensible in front of the jury. If it is skipped, they are not.

---

## 10. Execution & API notes

- **Pipeline trigger:** `POST /api/pipeline/run` runs async on a single-thread executor; `GET /api/pipeline/status` returns the current stage, percentage and per-stage timings. Runs automatically on startup if `pipeline_runs` is empty.
- **Demo mode:** `xray.demo-mode=true` disables the run endpoint and serves the frozen `xray.duckdb`. This is the deployed configuration.
- **Reads:** all query endpoints read results tables directly. No recomputation in a request. Target < 1 s per page.
- **Profile switching:** all three profiles are materialized at pipeline time. `?profile=` is a filter on `profile_scores`, not a recomputation.
- **SSE replay:** `MonitorReplayUseCase` streams month by month from the persisted `alerts` table with `stepMs` delay. It replays stored causal results; it does not recompute during the stream.
- **Parallelism:** Java stages use `panels.parallelStream()`. With 250 entities everything is sub-second; do not add threads anywhere else.

---

## 11. Build order

Two developers. `SPEC.md` §13 defines the milestones; this is who does what and in what order, with the hidden test unresolved until Sunday.

| Block | Dev A (data / backend) | Dev B (backend / frontend) |
|---|---|---|
| **1 — boot** | Maven project, DuckDB bean, `SqlRunner`, `ScoringConfig` binding + validation, `PipelineRunner` with two no-op stages | Vite + React scaffold, docker-compose, **deploy the empty app to a public URL now** |
| **2 — data** | `00`–`24` SQL, profiling answers into `DATA_FINDINGS.md`, fill the flow-class map | `25_entity_rollup.sql`, `PanelLoader`, `ResultWriter` |
| **3 — indicators** | `30`–`34` (liquidity, cashflow, activity, debt, leverage) | `35`–`38` (payment, delinquency, concentration, tax) + `90_threshold_quantiles.sql` |
| **4 — score** | `S40`–`S60`: anchors, trajectory, categories, profiles | `/api/meta`, `/api/portfolio`, `/api/entities/{id}` + Portfolio page against real data |
| **5 — explain & dynamics** | `S65` contributions + `ExplanationSumTest`, `S70` CUSUM/regimes/statuses | Entity page: gauges, timeline, drivers, indicator table |
| **6 — monitor** | `S80` + the 14 `AlertRule` classes, SSE endpoint | Monitor page, replay control |
| **7 — product** | `S85` limit engine + simulator, premium, momentum | Product panels per profile, Methodology page |
| **8 — close** | `S90` lead time + showcase pairs, `LookAheadTest` | Compare page, freeze `xray.duckdb`, deploy, rehearse |

**Deploy in block 1, not block 8.** An empty app on a public URL on Saturday morning removes the single largest risk of the weekend. Every block after that ships to the same URL.

### Cut list, in the order things get cut
1. Compare page — the showcase pair can be shown inside Entity.
2. Premium and momentum as read-only panels with no engine behind them.
3. The limit *simulator* form (keep the limit card and history chart — that is the demo moment).
4. Methodology page reduced to the weight tables and the caveats list.

Do **not** cut: the monitor replay, the limit history chart, the explanation panel. Those are what the three evaluation blocks actually reward.

---

## 12. Open items

| Item | Owner | When |
|---|---|---|
| Hidden test: unit, labels, submission format | Embat | Sunday. Until then §7.7 stays unwritten and `SubmissionExporter` defaults to `entity_id,score` at M23 |
| 10 pending anchors (SPEC §6.1) | Fran / José Javier | After block 3 quantiles, reviewed before block 4 |
| Profile weights | external expert | Config edit, no code change |
| `DEBT_DSCR` with no debt → level 100 | follow SPEC | Exposed as `debtDscr.noDebtLevel` in config so it can be flipped to `available=false` in one line if the score distribution looks wrong |
| Score distribution sanity check | Dev A | **First thing after block 4.** Histogram of `final` at M23. If it clusters in a 15-point band, widen anchors — do not touch weights |
