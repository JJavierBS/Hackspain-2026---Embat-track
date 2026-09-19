# Phase 6 · Plan A — Backend: lead time, showcase pairs, `LookAheadTest`, analytics API

> **For agentic workers:** Claude Code: use superpowers:executing-plans (or superpowers:subagent-driven-development) to run this plan task by task. Antigravity or other agents: do the checkboxes in order. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure the anticipation the system already has: proxy events per entity and profile, the month the system first raised its hand, the lead in months, the false alarm rate, and the month the limit engine cut the line before the event. Find the showcase pairs of SPEC §10.4. Serve both through the analytics API and on the entity. Prove causality with `LookAheadTest`. Rehearse Sunday's run on a 60-group holdout.

**Architecture:** Two pure services (`LeadTimeAnalyzer`, `ShowcaseFinder`) in `domain/service`, one thin stage `S90_Analytics` that builds their input from the panels and writes three results tables with `ResultWriter`, and read-only queries over those tables. Nothing new in SQL. `LookAheadTest` runs the Java stages S40 → S90 twice on seeded synthetic panels (full and cut at M12), each on its own in-memory DuckDB, and compares the results tables month by month.

**Tech Stack:** Java 21, Spring Boot 3.5, DuckDB JDBC (Appender through `ResultWriter`), JUnit 5.

**Spec:** `docs/SPEC.md` §8.4, §10.4, §11, §12.4, §12.5. `docs/ARCHITECTURE.md` §4.4, §8.1, §9, §10. Shared contract, decisions G1–G16 and path ownership: `docs/superpowers/plans/2026-09-19-phase6-overview.md`. **Read the overview before Task 1.**

## Global Constraints

- Edit only `backend/**` and `scripts/MakeHoldout.java`. Never edit `frontend/**`, `docs/**`, `CLAUDE.md`, `docker-compose.yml`, `.gitignore`, `data/raw/**`.
- Java 21 target. The machine's JDK 21 is a JRE (no `javac`); the default `java` (JDK 25) compiles with `--release 21`, so run plain `./mvnw ...`.
- No new Maven dependency. No JPA, no Lombok.
- `domain/` imports nothing from `org.springframework`, `java.sql` or `com.xray.config`. Config records map themselves to domain `Params` records (`toParams()` in `config/`), like `LimitEngineConfig` does.
- Never hardcode a threshold, weight, λ or window (CLAUDE.md rule 5). Every number of decisions G3–G9 is a key in `scoring-config.yml`. **Never edit `scoring.profiles` or the `weight` keys of `scoring.indicators`.**
- Causality (CLAUDE.md rule 1): every value a stage writes for month m uses indices `0..m` only. The lead-time tables are the documented exception (decision G8) and are read by nothing in the scoring path.
- Missing ≠ zero: a NULL indicator, NULL `traj` or NULL `final` is never read as 0; it makes the condition false.
- `S90_Analytics` must not call `ctx.sql()`. It reads `ctx.panels()` and writes with `ResultWriter`. `LookAheadTest` passes a `null` `SqlRunner` and would NPE.
- Tests: the six of CLAUDE.md. This plan adds `LookAheadTest`. You may extend `ScoringConfigValidationTest` for the new keys. Delete any scratch test before committing.
- Commits: Conventional Commits, English, lowercase subject. Commit after each task. No AI attribution line (CLAUDE.md).
- Your backend runs on port 8081 with the worktree's own `data/xray.duckdb`. Never open that file with a second process while the backend runs (DuckDB locks it): copy it first.
- Plan B points its dev server at your backend on 8081 near the end. Keep the backend bootable after every commit.

## File Structure

```
backend/src/main/resources/scoring-config.yml            + lead-time, showcase (end of file)
backend/src/main/java/com/xray/
  config/ScoringConfig.java                              + LeadTimeConfig, ShowcaseConfig records + toParams()
  config/ScoringConfigValidator.java                     + lead-time and showcase checks
  domain/model/EventType.java  EventTrigger.java         DETERIORATION|IMPROVEMENT / RUNWAY..LEVEL_CROSS
  domain/model/LeadTimeEvent.java  LeadTimeSignal.java   S90 rows
  domain/model/ShowcasePair.java                         S90 row
  domain/service/LeadTimeAnalyzer.java                   SPEC §8.4 (pure)
  domain/service/ShowcaseFinder.java                     SPEC §10.4 (pure)
  pipeline/stages/S90_Analytics.java                     lead_time_events, lead_time_signals, showcase_pairs
  application/AnalyticsQuery.java                        lead-time aggregation + showcase reads + entity events
  application/EntityDetailQuery.java  TimelineQuery.java  MetaQuery.java     (extended)
  infrastructure/web/controller/AnalyticsController.java + /lead-time, /showcase-pairs
  infrastructure/web/dto/LeadTimeDto.java  LeadTimeBlockDto.java  LeadTimeExampleDto.java
  infrastructure/web/dto/ShowcasePairsDto.java  ShowcasePairDto.java  EntityEventDto.java
  infrastructure/web/dto/EntityDetailDto.java  TimelineDto.java  MetaDto.java                (extended)
backend/src/test/java/com/xray/pipeline/LookAheadTest.java      NEW (ARCHITECTURE §9)
backend/src/test/java/com/xray/config/ScoringConfigValidationTest.java   + phase 6 keys bind
scripts/MakeHoldout.java                                 NEW: 60-group subset of the CSVs (decision G14)
```

## Shared contract

Copy of the overview's "Shared contract", items 1–9. **Read it there**: it holds the stage
order, the config block, the DDL of the three new tables and the JSON of every endpoint.
When this plan and the overview disagree, the overview wins; tell the person who merges.

---

### Task 0: Check the worktree

**Files:** none.

- [ ] **Step 1: Branch, data and baseline**

Run (worktree root):
```bash
git branch --show-current                  # feat/phase6-backend
ls data/raw | wc -l                        # 8 files (6 from git + 2 symlinks)
head -2 data/raw/transactions.csv          # the symlink resolves
cd backend && ./mvnw -q test               # exit 0, five test classes
```
If `transactions.csv` or `invoices.csv` is missing, stop and ask for the links (overview run procedure step 3).

- [ ] **Step 2: Write the run helper you use after every task**

From `backend/`:
```bash
rm -f ../data/xray.duckdb ../data/xray.duckdb.wal
SERVER_PORT=8081 ./mvnw -q spring-boot:run > /tmp/xray-a6.log 2>&1 &
until curl -s localhost:8081/api/pipeline/status | grep -q '"state":"DONE"\|"state":"FAILED"'; do sleep 3; done
curl -s localhost:8081/api/pipeline/status; echo
```
For SQL checks, stop the backend (`kill $(lsof -t -i:8081)`), copy the database
(`cp ../data/xray.duckdb /tmp/xray-a6.duckdb`) and query it:
```bash
J=$(ls ~/.m2/repository/org/duckdb/duckdb_jdbc/*/duckdb_jdbc-*.jar | tail -1)
java --enable-native-access=ALL-UNNAMED -cp "$J" ../scripts/DuckQuery.java /tmp/xray-a6.duckdb "SELECT 1"
```
Never `pkill -f` a pattern that also matches your own shell command.

- [ ] **Step 3: Record the baseline**

Run the helper. Expected: `DONE`, **13** entries in `stageTimingsMs`. Write down the total time; after this plan it must still be under 5 minutes (SPEC §5).

---

### Task 1: Config keys for lead time and showcase pairs

**Files:**
- Modify: `backend/src/main/resources/scoring-config.yml`
- Modify: `backend/src/main/java/com/xray/config/ScoringConfig.java`, `ScoringConfigValidator.java`
- Modify: `backend/src/test/java/com/xray/config/ScoringConfigValidationTest.java`

**Interfaces:**
- Produces: `ScoringConfig.leadTime()` → `LeadTimeConfig(int minHistoryMonths, int windowMonths, int horizonMonths, EventsConfig events, SignalConfig signal)` with
  `EventsConfig(double runwayBelow, int runwayMonths, double dscrBelow, int dscrMonths, double overdueMaxLevel, double scoreBelow, double improvementCross, double improvementBelow, int improvementBelowMonths)` and
  `SignalConfig(List<HealthStatus> deteriorationStatuses, double deteriorationMaxTraj, List<HealthStatus> improvementStatuses, double improvementMinTraj)`.
- Produces: `ScoringConfig.showcase()` → `ShowcaseConfig(double maxFinalGap, double upMinTraj, double downMaxTraj, int topN)`.

- [ ] **Step 1: Write the failing test**

Add to `ScoringConfigValidationTest`:
```java
    @Test
    void phase6KeysBind() {
        var lt = base.leadTime();
        assertEquals(6, lt.minHistoryMonths());
        assertEquals(12, lt.windowMonths());
        assertEquals(6, lt.horizonMonths());
        assertEquals(1.5, lt.events().runwayBelow());
        assertEquals(65.0, lt.events().improvementCross());
        assertTrue(lt.signal().deteriorationStatuses().contains(HealthStatus.TURNING));
        assertEquals(35.0, lt.signal().deteriorationMaxTraj());
        assertEquals(3.0, base.showcase().maxFinalGap());
        assertEquals(10, base.showcase().topN());
    }
```
Run `./mvnw -q test` → it fails to compile. That is the red step.

- [ ] **Step 2: Add the YAML**

Append the `lead-time` and `showcase` blocks of contract item 2 at the end of `scoring-config.yml`, verbatim, with their comments.

- [ ] **Step 3: Bind and validate**

Add the two records and the two accessors to `ScoringConfig`. In `ScoringConfigValidator` add, with messages that name the offending key:
- `lead-time.min-history-months`, `window-months`, `horizon-months` ≥ 1.
- `events.runway-months`, `dscr-months`, `improvement-below-months` ≥ 1.
- `events.improvement-below` < `events.improvement-cross`.
- `signal.deterioration-statuses` and `improvement-statuses` not empty.
- `showcase.max-final-gap` > 0, `top-n` ≥ 1, `down-max-traj` < `up-min-traj`.

- [ ] **Step 4: Check and commit**

Run: `./mvnw -q test` → exit 0.
```bash
git add backend/src
git commit -m "feat(config): add lead-time and showcase keys"
```

---

### Task 2: `LeadTimeAnalyzer` (pure)

**Files:**
- Create: `backend/src/main/java/com/xray/domain/model/EventType.java`, `EventTrigger.java`, `LeadTimeEvent.java`, `LeadTimeSignal.java`
- Create: `backend/src/main/java/com/xray/domain/service/LeadTimeAnalyzer.java`
- Modify: `backend/src/main/java/com/xray/config/ScoringConfig.java` (a `toParams()` on `LeadTimeConfig`)

**Interfaces:**
- Produces: `LeadTimeAnalyzer.analyze(Series s, Params p) → Result(List<Event> events, List<Signal> signals)`.
- Consumes: nothing but its arguments. No Spring, no SQL, no config import.

- [ ] **Step 1: The model records**

```java
public enum EventType { DETERIORATION, IMPROVEMENT }
/** Which condition opened the event (SPEC §8.4 proxy events). */
public enum EventTrigger { RUNWAY, DSCR, OVERDUE, SCORE, LEVEL_CROSS }
```
```java
/** One row of lead_time_events (contract item 3). Month ordinals; null = not detected. */
public record LeadTimeEvent(EntityKey key, Profile profile, EventType type, EventTrigger trigger,
                            int eventMonth, Integer signalMonth, Integer limitSignalMonth) {
    public Integer leadMonths() { return signalMonth == null ? null : eventMonth - signalMonth; }
    public Integer limitLeadMonths() { return limitSignalMonth == null ? null : eventMonth - limitSignalMonth; }
}
/** One row of lead_time_signals (contract item 4). */
public record LeadTimeSignal(EntityKey key, Profile profile, EventType type, int month,
                             boolean evaluable, boolean followed) {
}
```

- [ ] **Step 2: The analyzer**

`domain/service/LeadTimeAnalyzer.java` — the whole of decisions G3–G7:
```java
/**
 * SPEC §8.4 measured anticipation, per entity and profile (decisions G3–G7).
 * Proxy events (no default label exists), the first month the system raised its hand inside the window
 * before the event, and the onsets of that signal that no event followed.
 * These are evaluation numbers: they look at months after the signal on purpose (decision G8) and are
 * never read by scoring, products or alerts.
 */
public final class LeadTimeAnalyzer {

    public record Params(int minHistoryMonths, int windowMonths, int horizonMonths,
                         double runwayBelow, int runwayMonths, double dscrBelow, int dscrMonths,
                         double overdueMaxLevel, double scoreBelow,
                         double improvementCross, double improvementBelow, int improvementBelowMonths,
                         Set<HealthStatus> deteriorationStatuses, double deteriorationMaxTraj,
                         Set<HealthStatus> improvementStatuses, double improvementMinTraj) {
    }

    /** One entity and one profile, indexed by month ordinal. null = missing. limitActions null off the limit profile. */
    public record Series(Double[] finalScore, Double[] level, Double[] traj, HealthStatus[] status, Regime[] regime,
                         Double[] runway, Double[] dscr, Double[] overdueReceivablesLevel,
                         Double[] overduePayablesLevel, LimitAction[] limitActions) {
    }

    public record Event(EventType type, EventTrigger trigger, int month, Integer signalMonth, Integer limitSignalMonth) {
    }

    public record Signal(EventType type, int month, boolean evaluable, boolean followed) {
    }

    public record Result(List<Event> events, List<Signal> signals) {
    }

    private LeadTimeAnalyzer() {
    }

    public static Result analyze(Series s, Params p) {
        int n = s.finalScore().length;
        int first = firstScored(s.finalScore());
        if (first < 0) {
            return new Result(List.of(), List.of());
        }
        List<Event> events = new ArrayList<>();
        List<Signal> signals = new ArrayList<>();
        for (EventType type : EventType.values()) {
            EventTrigger[] cond = new EventTrigger[n];
            for (int m = 0; m < n; m++) {
                cond[m] = type == EventType.DETERIORATION ? deterioration(s, m, p) : improvement(s, m, p);
            }
            firstEvent(s, cond, first, type, p).ifPresent(events::add);
            signals.addAll(signalOnsets(s, cond, first, type, p));
        }
        return new Result(List.copyOf(events), List.copyOf(signals));
    }

    /** The first onset of the condition with min-history-months of scored months before it (G3, G4). */
    private static Optional<Event> firstEvent(Series s, EventTrigger[] cond, int first, EventType type, Params p) {
        for (int e = first + p.minHistoryMonths(); e < cond.length; e++) {
            if (cond[e] == null || cond[e - 1] != null || s.finalScore()[e] == null) {
                continue;
            }
            Integer signal = null;
            for (int m = Math.max(first, e - p.windowMonths()); m <= e && signal == null; m++) {
                if (signal(s, type, m, p)) signal = m;
            }
            Integer cut = null;
            if (type == EventType.DETERIORATION && s.limitActions() != null) {
                for (int m = Math.max(0, e - p.windowMonths()); m <= e && cut == null; m++) {
                    LimitAction a = s.limitActions()[m];
                    if (a == LimitAction.REDUCE || a == LimitAction.FREEZE) cut = m;
                }
            }
            return Optional.of(new Event(type, cond[e], e, signal, cut));
        }
        return Optional.empty();
    }

    /** Signal onsets outside the event condition, and whether the condition followed within the horizon (G7). */
    private static List<Signal> signalOnsets(Series s, EventTrigger[] cond, int first, EventType type, Params p) {
        List<Signal> out = new ArrayList<>();
        boolean previous = false;
        for (int m = first; m < cond.length; m++) {
            boolean on = signal(s, type, m, p);
            if (on && !previous && cond[m] == null) {
                boolean followed = false;
                int last = Math.min(cond.length - 1, m + p.horizonMonths());
                for (int k = m + 1; k <= last; k++) {
                    followed |= cond[k] != null;
                }
                boolean evaluable = followed || m + p.horizonMonths() <= cond.length - 1;
                out.add(new Signal(type, m, evaluable, followed));
            }
            previous = on;
        }
        return out;
    }

    private static boolean signal(Series s, EventType type, int m, Params p) {
        HealthStatus st = s.status()[m];
        Double traj = s.traj()[m];
        if (type == EventType.DETERIORATION) {
            return (st != null && p.deteriorationStatuses().contains(st))
                    || (traj != null && traj <= p.deteriorationMaxTraj());
        }
        return (st != null && p.improvementStatuses().contains(st))
                || s.regime()[m] == Regime.STRUCTURAL_IMPROVEMENT
                || (traj != null && traj >= p.improvementMinTraj());
    }

    /** Trigger order is fixed: the cash conditions before the score (G3). */
    private static EventTrigger deterioration(Series s, int m, Params p) {
        if (below(s.runway(), m, p.runwayBelow(), p.runwayMonths())) return EventTrigger.RUNWAY;
        if (below(s.dscr(), m, p.dscrBelow(), p.dscrMonths())) return EventTrigger.DSCR;
        Double recv = s.overdueReceivablesLevel()[m];
        Double pay = s.overduePayablesLevel()[m];
        if (recv != null && pay != null && recv <= p.overdueMaxLevel() && pay <= p.overdueMaxLevel()) {
            return EventTrigger.OVERDUE;
        }
        Double f = s.finalScore()[m];
        return f != null && f < p.scoreBelow() ? EventTrigger.SCORE : null;
    }

    /** Level crosses up through the threshold after a run below the low threshold inside the window (G4). */
    private static EventTrigger improvement(Series s, int m, Params p) {
        if (m == 0) return null;
        Double now = s.level()[m];
        Double before = s.level()[m - 1];
        if (now == null || before == null || now < p.improvementCross() || before >= p.improvementCross()) {
            return null;
        }
        int run = 0;
        for (int k = Math.max(0, m - p.windowMonths()); k < m; k++) {
            Double lv = s.level()[k];
            run = lv != null && lv < p.improvementBelow() ? run + 1 : 0;
            if (run >= p.improvementBelowMonths()) return EventTrigger.LEVEL_CROSS;
        }
        return null;
    }

    /** Every month of the window ends at m, has a value and is below the threshold. */
    private static boolean below(Double[] x, int m, double threshold, int months) {
        if (m - months + 1 < 0) return false;
        for (int k = m - months + 1; k <= m; k++) {
            if (x[k] == null || x[k] >= threshold) return false;
        }
        return true;
    }

    private static int firstScored(Double[] finalScore) {
        for (int m = 0; m < finalScore.length; m++) {
            if (finalScore[m] != null) return m;
        }
        return -1;
    }
}
```

- [ ] **Step 3: `toParams()` in config**

In `config/ScoringConfig.LeadTimeConfig` add `toParams()` returning `LeadTimeAnalyzer.Params` (a `Set.copyOf` of the status lists). The domain never imports config; config imports domain, like `LimitEngineConfig`.

- [ ] **Step 4: Scratch check (deleted before the commit)**

Write a temporary `@Test` that builds a 24-month series by hand:
- runway 5,5,5,4,3,2,**1.2,1.1**,… → a `RUNWAY` event at the second month below 1.5, not the first;
- traj ≤ 35 from month 2 → `signalMonth` = 2 and lead = event − 2 (and, with the window at 12, no earlier month);
- a series with the condition true from month 0 → no event (censored);
- a signal onset at month 3 with no condition in 3..9 → `followed = false`, `evaluable = true`;
- a signal onset at month 21 with nothing after → `evaluable = false`.
Run it, then **delete the file** (CLAUDE.md: only the six tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/xray
git commit -m "feat(domain): measure lead time from proxy events and signals"
```

---

### Task 3: `ShowcaseFinder` (pure)

**Files:**
- Create: `backend/src/main/java/com/xray/domain/model/ShowcasePair.java`, `backend/src/main/java/com/xray/domain/service/ShowcaseFinder.java`
- Modify: `backend/src/main/java/com/xray/config/ScoringConfig.java` (`ShowcaseConfig.toParams()`)

**Interfaces:**
- Produces: `ShowcaseFinder.find(List<Candidate> candidates, Params p) → List<Pair>` ranked as decision G9.

- [ ] **Step 1: The finder**

```java
/**
 * SPEC §10.4: two entities with the same score today heading in opposite directions — the pitch opener.
 * Ranked pairs, an entity in at most one pair (decision G9). Display only: nothing reads this back.
 */
public final class ShowcaseFinder {

    public record Candidate(String id, double finalScore, Double traj) {
    }

    public record Params(double maxFinalGap, double upMinTraj, double downMaxTraj, int topN) {
    }

    public record Pair(String upId, String downId, double upFinal, double downFinal, double upTraj, double downTraj,
                       boolean meetsSpec) {
        public double finalGap() { return Math.abs(upFinal - downFinal); }
        public double trajGap() { return upTraj - downTraj; }
    }

    public static List<Pair> find(List<Candidate> candidates, Params p) {
        List<Candidate> sorted = candidates.stream().filter(c -> c.traj() != null)
                .sorted(Comparator.comparingDouble(Candidate::finalScore).thenComparing(Candidate::id)).toList();
        List<Pair> pairs = new ArrayList<>();
        for (int i = 0; i < sorted.size(); i++) {
            for (int j = i + 1; j < sorted.size()
                    && sorted.get(j).finalScore() - sorted.get(i).finalScore() <= p.maxFinalGap(); j++) {
                Candidate a = sorted.get(i);
                Candidate b = sorted.get(j);
                Candidate up = a.traj() >= b.traj() ? a : b;
                Candidate down = up == a ? b : a;
                if (up.traj() <= down.traj()) continue;                       // no direction, no story
                pairs.add(new Pair(up.id(), down.id(), up.finalScore(), down.finalScore(), up.traj(), down.traj(),
                        up.traj() >= p.upMinTraj() && down.traj() <= p.downMaxTraj()));
            }
        }
        pairs.sort(Comparator.comparing(Pair::meetsSpec).reversed()
                .thenComparing(Comparator.comparingDouble(Pair::trajGap).reversed())
                .thenComparingDouble(Pair::finalGap)
                .thenComparing(Pair::upId).thenComparing(Pair::downId));
        List<Pair> out = new ArrayList<>();
        Set<String> used = new HashSet<>();
        for (Pair pair : pairs) {
            if (out.size() >= p.topN()) break;
            if (used.add(pair.upId()) & used.add(pair.downId())) {            // both must be free
                out.add(pair);
            } else {
                used.add(pair.upId());
                used.add(pair.downId());
            }
        }
        return List.copyOf(out);
    }
}
```
Careful with the greedy filter: an entity already used must not be re-added. Write it however
you like as long as the result is "each entity appears at most once", checked in the next step.

- [ ] **Step 2: Scratch check (deleted before the commit)**

Five candidates: (A 60, traj 80), (B 62, traj 20), (C 61, traj 75), (D 90, traj 10), (E 59, traj 55).
Expected: the first pair is one of A/C against B with `meetsSpec = true` and the largest traj gap; D is
in no pair (nobody within 3 points); no id appears twice. Delete the file after it passes.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/com/xray
git commit -m "feat(domain): find showcase pairs with opposite trajectories"
```

---

### Task 4: `S90_Analytics` stage

**Files:**
- Create: `backend/src/main/java/com/xray/pipeline/stages/S90_Analytics.java`

**Interfaces:**
- Produces: tables `lead_time_events`, `lead_time_signals`, `showcase_pairs` (contract items 3–5).
- Consumes: `ctx.panels()` (scores, dynamics, raw indicators, sub-scores, limits), `ctx.config()`.

- [ ] **Step 1: The stage**

```java
@Component
@Order(90)
public class S90_Analytics implements PipelineStage {

    static final String EVENTS_DDL = "entity_type VARCHAR, entity_id VARCHAR, profile VARCHAR, event_type VARCHAR, "
            + "trigger VARCHAR, event_month VARCHAR, signal_month VARCHAR, lead_months INTEGER, "
            + "limit_signal_month VARCHAR, limit_lead_months INTEGER";
    static final String SIGNALS_DDL = "entity_type VARCHAR, entity_id VARCHAR, profile VARCHAR, event_type VARCHAR, "
            + "signal_month VARCHAR, evaluable BOOLEAN, followed BOOLEAN";
    static final String PAIRS_DDL = "entity_type VARCHAR, month VARCHAR, profile VARCHAR, rank INTEGER, "
            + "up_id VARCHAR, down_id VARCHAR, up_final DOUBLE, down_final DOUBLE, up_traj DOUBLE, down_traj DOUBLE, "
            + "final_gap DOUBLE, traj_gap DOUBLE, meets_spec BOOLEAN";
    // "trigger" and "rank" are reserved words in some engines: DuckDB accepts them, but always quote them in SQL you write.
```
`execute(ctx)`:
1. `if (ctx.panels().isEmpty())` → report "skipped: no panels" and return (same shape as the other stages).
2. Build `LeadTimeAnalyzer.Params` and `ShowcaseFinder.Params` from the config, plus `Profile limitProfile = ctx.config().products().limitProfile()`.
3. `panels.parallelStream().flatMap(panel -> for each Profile: analyze(series(panel, p, p == limitProfile), params))` collected into a list of `(EntityKey, Profile, Result)`.
4. Rows for `lead_time_events` and `lead_time_signals`, months through `panel.months().get(ordinal).toString()` (keep a `List<Month> months = ctx.panels().getFirst().months()`, as `S80_Alerts` does).
5. Showcase pairs: group the panels by `entity_type`; for each month ordinal and each profile build the candidate list from `panel.profileScores(p)[m]` where `finalScore != null` (`traj` may be null: the finder filters it), call `ShowcaseFinder.find`, and write the top N with `rank = index + 1`.
6. `writer.replace(...)` for the three tables, `log.info` the counts, `ctx.report(id(), 95, ...)`.

`series(panel, p, limit)` builds the `LeadTimeAnalyzer.Series`:
```java
    private static LeadTimeAnalyzer.Series series(EntityPanel panel, Profile p, boolean limitProfile) {
        int n = panel.size();
        ProfileScore[] ps = panel.profileScores(p);
        DynamicsPoint[] dyn = panel.dynamics(p);
        Double[] fin = new Double[n], level = new Double[n], traj = new Double[n];
        Double[] runway = new Double[n], dscr = new Double[n], recv = new Double[n], pay = new Double[n];
        HealthStatus[] status = new HealthStatus[n];
        Regime[] regime = new Regime[n];
        for (int m = 0; m < n; m++) {
            fin[m] = ps[m].finalScore();
            level[m] = ps[m].level();
            traj[m] = ps[m].traj();
            if (dyn != null && dyn[m] != null) {
                status[m] = dyn[m].status();
                regime[m] = dyn[m].regime();
            }
            runway[m] = rawValue(panel, IndicatorId.LIQ_RUNWAY, m);
            dscr[m] = rawValue(panel, IndicatorId.DEBT_DSCR, m);       // null value = no debt: never triggers
            recv[m] = levelValue(panel, IndicatorId.DEL_OVERDUE_RECEIVABLES, m);
            pay[m] = levelValue(panel, IndicatorId.PAY_OVERDUE_PAYABLES, m);
        }
        LimitAction[] actions = null;
        if (limitProfile && panel.limits() != null) {
            actions = new LimitAction[n];
            for (int m = 0; m < n; m++) {
                LimitDecision d = panel.limits()[m];
                actions[m] = d == null ? null : d.action();
            }
        }
        return new LeadTimeAnalyzer.Series(fin, level, traj, status, regime, runway, dscr, recv, pay, actions);
    }
```
`rawValue` returns `panel.raw(id, m).available() ? panel.raw(id, m).value() : null`; `levelValue` returns
`panel.subScores(id)[m].available() ? level : null`.

- [ ] **Step 2: Run the pipeline**

Run the helper. Expected: `DONE`, **14** stages, `S90_ANALYTICS` under 2 s, total still under 5 min.

- [ ] **Step 3: Look at the numbers**

Stop the backend, copy the database, then:
```sql
SELECT profile, event_type, "trigger", COUNT(*) AS events,
       COUNT(lead_months) AS detected,
       COUNT(*) FILTER (lead_months >= 1) AS ahead,
       ROUND(AVG(lead_months), 2) AS mean_lead, MEDIAN(lead_months) AS median_lead
FROM lead_time_events WHERE entity_type = 'GROUP' GROUP BY ALL ORDER BY 1, 2, 4 DESC;

SELECT profile, event_type, COUNT(*) AS signals, COUNT(*) FILTER (evaluable) AS evaluable,
       COUNT(*) FILTER (followed) AS followed,
       ROUND(1 - COUNT(*) FILTER (followed)::DOUBLE / NULLIF(COUNT(*) FILTER (evaluable), 0), 3) AS false_alarm_rate
FROM lead_time_signals WHERE entity_type = 'GROUP' GROUP BY ALL ORDER BY 1, 2;

SELECT lead_months, COUNT(*) FROM lead_time_events
WHERE entity_type = 'GROUP' AND profile = 'BANK' AND event_type = 'DETERIORATION' GROUP BY 1 ORDER BY 1;

SELECT COUNT(*) FILTER (limit_lead_months >= 1) AS cut_ahead, COUNT(*) AS events,
       ROUND(AVG(limit_lead_months), 2) AS mean_limit_lead
FROM lead_time_events WHERE entity_type = 'GROUP' AND profile = 'BANK' AND event_type = 'DETERIORATION';

SELECT month, COUNT(*) AS pairs, COUNT(*) FILTER (meets_spec) AS spec_pairs
FROM showcase_pairs WHERE entity_type = 'GROUP' AND profile = 'BANK' GROUP BY 1 ORDER BY 1;

SELECT * FROM showcase_pairs
WHERE entity_type = 'GROUP' AND profile = 'BANK' AND month = '2026-08' ORDER BY rank LIMIT 3;
```
Write the results down for the final report. Do **not** tune the config to make them look better.
Two numbers matter (SPEC §8.4): if the mean lead is under 1 month, or the histogram piles up at 12,
say so in the report — the human decides.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/xray
git commit -m "feat(pipeline): add analytics stage with lead time and showcase pairs"
```

---

### Task 5: `LookAheadTest`

**Files:**
- Create: `backend/src/test/java/com/xray/pipeline/LookAheadTest.java`

**Interfaces:**
- Consumes: the shipped `scoring-config.yml`, the stages S40..S90, `ResultWriter` on an in-memory DuckDB.
- Produces: the sixth required test (ARCHITECTURE §9). This is the test that makes every lead-time number defensible.

- [ ] **Step 1: The test**

```java
package com.xray.pipeline;

/**
 * ARCHITECTURE §9: truncate the panel at M12, recompute, and every value for M00..M12 must be identical
 * to the full run. Runs the Java stages S40 → S90 on seeded synthetic panels, each run on its own
 * in-memory DuckDB, and compares the results tables row by row (decision G10).
 * The SQL layer is out of scope: balances are reconstructed backwards from the 2026-09-01 snapshot on
 * purpose (SPEC §0.2 static exception, a documented caveat).
 */
class LookAheadTest {

    private static final int MONTHS = 24;
    private static final int CUT = 12;                 // inclusive: months 0..12 must match
    private static final int ENTITIES = 40;

    /** table -> the column that dates the row. */
    private static final Map<String, String> MONTH_COLUMN = new LinkedHashMap<>(Map.of(
            "indicator_values", "month", "category_scores", "month", "profile_scores", "month",
            "contributions", "month", "changepoints", "alarm_month", "limit_decisions", "month",
            "premium_quotes", "month", "momentum_screen", "month", "alerts", "month"));
    // alert_states, watchlist, showcase_pairs: "month". lead_time_events: "event_month".
    // lead_time_signals: "signal_month", and its evaluable/followed columns are dropped before comparing (G8).

    @Test
    void pastValuesDoNotChangeWhenTheFutureIsCut() throws Exception {
        ScoringConfig config = shippedConfig();
        List<EntityPanel> full = panels(config, MONTHS);
        List<EntityPanel> cut = panels(config, MONTHS).stream().map(p -> truncate(p, CUT + 1)).toList();

        Map<String, List<String>> a = run(config, full);
        Map<String, List<String>> b = run(config, cut);

        assertEquals(a.keySet(), b.keySet(), "the two runs wrote different tables");
        String lastMonth = MONTHS_LIST.get(CUT).toString();
        for (String table : a.keySet()) {
            List<String> expected = a.get(table);
            List<String> actual = b.get(table);
            assertEquals(expected, actual, table + " differs up to " + lastMonth);
        }
        assertFalse(a.get("profile_scores").isEmpty(), "the synthetic panels produced no scores");
    }
```
`run(config, panels)`:
```java
    private static Map<String, List<String>> run(ScoringConfig config, List<EntityPanel> panels) throws Exception {
        try (DuckDbDataSource ds = new DuckDbDataSource("jdbc:duckdb:")) {
            ResultWriter writer = new ResultWriter(ds);
            PipelineContext ctx = new PipelineContext(null, config, "test", EntityType.GROUP,
                    (stage, pct, msg) -> { });
            ctx.setPanels(panels);
            for (PipelineStage stage : stages(writer, config)) {
                stage.execute(ctx);
            }
            return dump(ds);
        }
    }

    private static List<PipelineStage> stages(ResultWriter writer, ScoringConfig config) {
        return List.of(new S40_Normalize(), new S50_Trajectory(), new S60_Score(writer),
                new S65_Explain(writer, new TemplateNarrativeRenderer()), new S70_Dynamics(writer),
                new S75_Products(writer), new S80_Alerts(writer, rules(config)), new S90_Analytics(writer));
    }

    /** The 15 rules of phase 5. Four take no config; the rest take ScoringConfig. */
    private static List<AlertRule> rules(ScoringConfig c) {
        return List.of(new RunwayLowRule(c), new DscrBreachRule(c), new LineUtilHighRule(c), new DsoDriftRule(c),
                new SupplierLatenessUpRule(c), new OverdueReceivablesRule(c), new TaxGapRule(c),
                new ConcentrationHighRule(c), new FactoringSpikeRule(c), new ScoreDropRule(c),
                new StructuralDeclineRule(), new StructuralImprovementRule(), new BandUpgradeRule(),
                new BandDowngradeRule(c), new LimitActionRule());
    }
```
Check each constructor against `alerting/rules/`; if one differs, follow the source, not this list.

`dump(ds)` reads every table of the database, keeps the rows whose month column is ≤ the cut month,
and returns one sorted list of strings per table:
```java
    private static Map<String, List<String>> dump(DataSource ds) throws SQLException {
        Map<String, List<String>> out = new TreeMap<>();
        String cut = MONTHS_LIST.get(CUT).toString();
        try (Connection c = ds.getConnection(); Statement st = c.createStatement()) {
            List<String> tables = new ArrayList<>();
            try (ResultSet rs = st.executeQuery("SELECT table_name FROM information_schema.tables ORDER BY 1")) {
                while (rs.next()) tables.add(rs.getString(1));
            }
            for (String table : tables) {
                String monthColumn = monthColumn(table);
                List<String> rows = new ArrayList<>();
                try (ResultSet rs = st.executeQuery("SELECT * FROM " + table)) {
                    int n = rs.getMetaData().getColumnCount();
                    while (rs.next()) {
                        if (rs.getString(monthColumn).compareTo(cut) > 0) continue;
                        StringBuilder b = new StringBuilder();
                        for (int k = 1; k <= n; k++) {
                            String column = rs.getMetaData().getColumnName(k);
                            if (IGNORED_COLUMNS.contains(column)) continue;       // evaluable, followed (G8)
                            b.append(column).append('=').append(rs.getString(k)).append('|');
                        }
                        rows.add(b.toString());
                    }
                }
                rows.sort(Comparator.naturalOrder());
                out.put(table, rows);
            }
        }
        return out;
    }
```
`monthColumn(table)`: the map above, `"event_month"` for `lead_time_events`, `"signal_month"` for
`lead_time_signals`, `"month"` otherwise. `profile_weights` has no month column: skip that table
entirely (it is config, not data).

Panels: 40 entities, seeded `Random(42)`, 24 months.
```java
    /** A random walk inside each indicator's anchor range, with holes, so every stage has something to chew on. */
    private static List<EntityPanel> panels(ScoringConfig config, int months) {
        Random rnd = new Random(42);
        List<EntityPanel> out = new ArrayList<>();
        for (int i = 0; i < ENTITIES; i++) {
            EntityPanel panel = new EntityPanel(new EntityKey(EntityType.GROUP, String.format("G_%03d", i)),
                    MONTHS_LIST.subList(0, months));
            for (IndicatorId id : IndicatorId.values()) {
                List<List<Double>> anchors = config.indicators().get(id).anchors();
                double lo = anchors.getFirst().getFirst();
                double hi = anchors.getLast().getFirst();
                double value = lo + rnd.nextDouble() * (hi - lo);
                for (int m = 0; m < months; m++) {
                    value = Math.max(lo - (hi - lo) * 0.1, Math.min(hi + (hi - lo) * 0.1,
                            value + (rnd.nextDouble() - 0.5) * (hi - lo) * 0.25));
                    boolean available = rnd.nextDouble() > 0.08;                 // 8 % holes
                    panel.setRaw(m, available ? new RawIndicator(id, value, true, false, false)
                            : RawIndicator.missing(id));
                }
            }
            for (SignalId id : SignalId.values()) {
                double value = 10_000 + rnd.nextDouble() * 500_000;
                for (int m = 0; m < months; m++) {
                    value = Math.max(0, value * (0.9 + rnd.nextDouble() * 0.25));
                    panel.setSignal(id, m, rnd.nextDouble() > 0.1 ? value : null);
                }
            }
            out.add(panel);
        }
        return out;
    }
```
`TAX_GAP_MONTHS` and `TAX_CADENCE_MONTHS` want small numbers: give those two `rnd.nextInt(6)` and
`rnd.nextBoolean() ? 1.0 : 3.0`. `truncate(panel, n)` builds a new `EntityPanel` over the first `n`
months and copies `raw` and `signals` for `0..n-1` — nothing else (the later stages recompute
everything). `MONTHS_LIST` = `Month.range(Month.parse("2024-09"), Month.parse("2026-08"))`.

- [ ] **Step 2: Make it pass**

Run: `./mvnw -q test -Dtest=LookAheadTest`.
If it fails, the message names the table and the differing rows. Read the diff before touching
anything: a real look-ahead is a bug in a stage, and fixing that bug is the point of this task.
Two known traps, both legitimate to fix in the **test**, not in the stages:
- a table the cut run never writes because no entity reaches the condition (compare the key sets and accept an empty list on both sides);
- `showcase_pairs`, `momentum_screen`: they compare entities against each other **within one month**, which is causal; they must still match.
Anything else — a stage reading `m+1`, a baseline computed over the whole series, a "previous"
value taken from the end of the array — is a real defect. Fix the stage, note it in the final report.

- [ ] **Step 3: Full suite and commit**

Run: `./mvnw -q test` → exit 0, **six** test classes.
```bash
git add backend/src/test/java/com/xray/pipeline/LookAheadTest.java backend/src/main/java/com/xray
git commit -m "test: prove past values do not change when the future is cut"
```

---

### Task 6: Analytics reads (lead time, showcase pairs, entity events)

**Files:**
- Create: `backend/src/main/java/com/xray/application/AnalyticsQuery.java`
- Create: `backend/src/main/java/com/xray/infrastructure/web/dto/LeadTimeDto.java`, `LeadTimeBlockDto.java`, `LeadTimeExampleDto.java`, `ShowcasePairsDto.java`, `ShowcasePairDto.java`, `EntityEventDto.java`

**Interfaces:**
- Produces: `AnalyticsQuery.leadTime(profile)`, `AnalyticsQuery.showcasePairs(profile, month)`, `AnalyticsQuery.events(type, id, profile, upToMonthOrNull)`.
- Consumes: `lead_time_events`, `lead_time_signals`, `showcase_pairs` through `SqlRunner`; `DuckDbTables.exists` for the "not computed yet" case.

- [ ] **Step 1: The DTOs**

Exactly the JSON of contract item 6. `LeadTimeBlockDto` carries the counts, the rates, the mean and
median lead, the histogram (`0..windowMonths`, **every bucket present**, count 0 where empty) and
`byTrigger`. `LeadTimeDto` carries both blocks, the limit block (null off the limit profile) and the
examples. `EntityEventDto(String eventType, String trigger, String eventMonth, String signalMonth, Integer leadMonths, String limitSignalMonth, Integer limitLeadMonths)`.

- [ ] **Step 2: The query**

- Every read filters `entity_type = params.unit().name()` and `profile = ?`.
- Missing table → an empty `LeadTimeDto` (zero counts, null rates, a histogram of zeros) and an empty pair list. Never a 500.
- Aggregation per `event_type` in one query:
  ```sql
  SELECT event_type, COUNT(*) AS events, COUNT(lead_months) AS detected,
         COUNT(*) FILTER (lead_months >= 1) AS ahead,
         AVG(lead_months) AS mean_lead, MEDIAN(lead_months) AS median_lead
  FROM lead_time_events WHERE entity_type = ? AND profile = ? GROUP BY 1
  ```
  the histogram with `GROUP BY event_type, lead_months`, `byTrigger` with `GROUP BY event_type, "trigger"`,
  and the signals with one query over `lead_time_signals`. Six small queries are fine; the tables have
  a few thousand rows.
- Limit block (only when `profile == config.products().limitProfile()`): `events`, `cut_ahead = COUNT(*) FILTER (limit_lead_months >= 1)`, mean and median of `limit_lead_months`.
- Examples: deterioration events with a `lead_months`, ordered `lead_months DESC, entity_id`, limit 5; then the same for improvement, limit 5 — a single query with a `UNION ALL` or two queries, your call. `entityName` = the id (the API has no other name, see `EntityDetailQuery`).
- Rounding: rates to 3 decimals, means to 1 (`Scores.round`).
- `showcasePairs(profile, month)`: `SELECT ... ORDER BY rank`, mapped to `ShowcasePairDto` with `up`/`down` objects (`id`, `name` = id, `final` rounded to 1, `traj` rounded to 1) and the gaps to 1 decimal.
- `events(type, id, profile, upTo)`: rows of `lead_time_events` for that entity and profile, `event_month <= upTo` when `upTo != null`, ordered `event_month`.

- [ ] **Step 3: Check**

```bash
curl -s 'localhost:8081/api/analytics/lead-time?profile=BANK' | jq   # after Task 7 wires the controller
```
Until then, a scratch `main` or a unit check is fine — or just do Task 7 and check both at once.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/xray
git commit -m "feat(api): read lead time, false alarms and showcase pairs"
```

---

### Task 7: Analytics endpoints, entity events, meta flag

**Files:**
- Modify: `backend/src/main/java/com/xray/infrastructure/web/controller/AnalyticsController.java`
- Modify: `backend/src/main/java/com/xray/application/EntityDetailQuery.java`, `TimelineQuery.java`, `MetaQuery.java`
- Modify: `backend/src/main/java/com/xray/infrastructure/web/dto/EntityDetailDto.java`, `TimelineDto.java`, `MetaDto.java`

- [ ] **Step 1: The endpoints**

```java
    @GetMapping("/lead-time")
    public LeadTimeDto leadTime(@RequestParam(required = false) String profile) {
        return analytics.leadTime(profile);
    }

    @GetMapping("/showcase-pairs")
    public ShowcasePairsDto showcasePairs(@RequestParam(required = false) String profile,
                                          @RequestParam(required = false) String month) {
        return analytics.showcasePairs(profile, month);
    }
```

- [ ] **Step 2: Events on the entity**

- `EntityDetailDto` gains `List<EntityEventDto> events` (last field). `EntityDetailQuery.detail` fills it with `analytics.events(e.type(), id, p, month)` — **`eventMonth <= ?month`** (decision G8: the page at month m never shows a later event).
- `TimelineDto` gains `List<EntityEventDto> events`, with no month filter (the timeline is the whole series).
- `MetaDto` gains `analyticsReady` = `DuckDbTables.exists(sql, "lead_time_events") && DuckDbTables.exists(sql, "showcase_pairs")`.

- [ ] **Step 3: Check**

```bash
curl -s 'localhost:8081/api/analytics/lead-time?profile=BANK' | jq '{w: .windowMonths, d: .deterioration, l: .limit, ex: (.examples | length)}'
curl -s 'localhost:8081/api/analytics/lead-time?profile=FUND' | jq '.limit'            # null
curl -s 'localhost:8081/api/analytics/showcase-pairs?profile=BANK&month=2026-08' | jq '.pairs[0]'
curl -s 'localhost:8081/api/analytics/showcase-pairs?profile=BANK&month=2025-01' | jq '.pairs | length'
ID=$(curl -s 'localhost:8081/api/analytics/lead-time?profile=BANK' | jq -r '.examples[0].entityId')
curl -s "localhost:8081/api/entities/$ID?profile=BANK&month=2026-08" | jq '.events'
curl -s "localhost:8081/api/entities/$ID?profile=BANK&month=2025-01" | jq '.events'     # only events up to that month
curl -s "localhost:8081/api/entities/$ID/timeline?profile=BANK" | jq '.events | length'
curl -s localhost:8081/api/meta | jq '.analyticsReady'                                  # true
for u in 'analytics/lead-time?profile=BANK' 'analytics/showcase-pairs?profile=BANK' "entities/$ID?profile=BANK"; do
  curl -s -o /dev/null -w "$u %{time_total}\n" "localhost:8081/api/$u"; done            # all < 1 s
```
Also check the histogram has every bucket 0..12 and that a profile with no events answers with zeros, not 500.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/xray
git commit -m "feat(api): serve lead time, showcase pairs and entity events"
```

---

### Task 8: Demo mode and empty-table behaviour

**Files:** any file of this plan (fixes only).

- [ ] **Step 1: Demo mode**

Restart on the same database with `XRAY_DEMO_MODE=true SERVER_PORT=8081 ./mvnw -q spring-boot:run`.
Check the two analytics endpoints and `/api/meta` still answer, and `POST /api/pipeline/run` → 409.

- [ ] **Step 2: A database without the phase 6 tables**

```bash
cp ../data/xray.duckdb /tmp/no-analytics.duckdb
java --enable-native-access=ALL-UNNAMED -cp "$J" ../scripts/DuckQuery.java /tmp/no-analytics.duckdb \
  "DROP TABLE lead_time_events" "DROP TABLE lead_time_signals" "DROP TABLE showcase_pairs"
```
Run the backend with `XRAY_DEMO_MODE=true XRAY_DATA_DIR=/tmp/...` pointing at a directory holding that
file as `xray.duckdb`. Expected: `/api/analytics/lead-time` → zeros and nulls, `/api/analytics/showcase-pairs`
→ empty list, `/api/entities/{id}` → `"events": []`, `/api/meta` → `analyticsReady: false`. No 500 anywhere.

- [ ] **Step 3: Commit** (only if something changed)

```bash
git commit -am "fix(api): answer the analytics endpoints before the stage has run"
```

---

### Task 9: Tidy up and full check

**Files:** any file of this plan.

- [ ] **Step 1: Architecture rules**

```bash
cd backend/src/main/java/com/xray
grep -rn "org.springframework\|java.sql\|com.xray.config" domain                      # nothing
grep -rn "ctx.sql()" pipeline/stages/S90_Analytics.java                               # nothing
grep -rn "1\.5\|0\.35\|\b65\b\|\b35\b" domain/service/LeadTimeAnalyzer.java domain/service/ShowcaseFinder.java  # only in comments
```

- [ ] **Step 2: Clean run**

```bash
cd backend && ./mvnw -q test                       # 6 classes, exit 0
git status --short backend/src/test                # only LookAheadTest.java (+ ScoringConfigValidationTest)
```
Run the helper from a deleted database: `DONE`, 14 stages. Note each stage's ms and the total.

- [ ] **Step 3: Commit** (only if something changed)

```bash
git commit -am "refactor(backend): tidy phase 6 analytics"
```

---

### Task 10: Hidden-test rehearsal on a 60-group holdout

**Files:**
- Create: `scripts/MakeHoldout.java`

**Interfaces:** none (a developer tool). Nothing in `backend/src` may know about the holdout.

- [ ] **Step 1: The subset builder**

Single-file program, run the way `scripts/DuckQuery.java` is run. It reads `data/raw/*.csv` with
`read_csv_auto`, picks 60 groups with a fixed seed, and copies every row of those groups' companies
to `data/holdout/raw/` with `COPY ... TO '...' (HEADER, DELIMITER ',')`:
```java
/**
 * Builds a 60-group subset of data/raw in data/holdout/raw, same files, same headers (phase 6 decision G14).
 * Rehearsal for Sunday's hidden test, which arrives in exactly this format.
 *   java --enable-native-access=ALL-UNNAMED -cp $DUCKDB_JAR scripts/MakeHoldout.java data/raw data/holdout/raw 60
 */
```
Tables and their filter:
- `groups.csv` — the 60 sampled `group_id` (`ORDER BY hash(group_id || 'holdout') LIMIT 60`, deterministic).
- `companies.csv` — companies of those groups.
- `banking_products.csv`, `debt_products.csv`, `debt_schedule_config.csv`, `transactions.csv`, `invoices.csv`, `balances.csv` — rows whose `company_id` is in that set.
Print the row count written per file.

- [ ] **Step 2: Build it and run the pipeline on it**

```bash
J=$(ls ~/.m2/repository/org/duckdb/duckdb_jdbc/*/duckdb_jdbc-*.jar | tail -1)
mkdir -p data/holdout/raw
java --enable-native-access=ALL-UNNAMED -cp "$J" scripts/MakeHoldout.java data/raw data/holdout/raw 60
ls -la data/holdout/raw                      # 8 files, transactions much smaller than 451 MB
cd backend && SERVER_PORT=8082 XRAY_DATA_DIR=../data/holdout ./mvnw -q spring-boot:run > /tmp/xray-holdout.log 2>&1 &
until curl -s localhost:8082/api/pipeline/status | grep -q '"state":"DONE"\|"state":"FAILED"'; do sleep 3; done
curl -s localhost:8082/api/pipeline/status | jq '{state, stages: (.stageTimingsMs | keys | length)}'   # DONE, 14
curl -s localhost:8082/api/meta | jq '.entityCounts'                                                    # ~60 groups
```
**No code change is allowed to make this work.** If the pipeline fails on the subset, that is a real
bug that would also break Sunday: fix it in `backend/src`, and say what it was in the final report.

- [ ] **Step 3: Export both formats**

```bash
curl -s 'localhost:8082/api/export/submission?profile=BANK&format=entity' -o /tmp/sub_entity.csv
curl -s 'localhost:8082/api/export/submission?profile=BANK&format=entity-month' -o /tmp/sub_entity_month.csv
head -3 /tmp/sub_entity.csv; wc -l /tmp/sub_entity.csv          # header + ~60 rows
head -3 /tmp/sub_entity_month.csv; wc -l /tmp/sub_entity_month.csv
```
Check the ids are the holdout's ids and the score column has no NULL, no `NaN` and no comma as decimal
separator. Stop the backend on 8082. Do not commit anything under `data/`.

- [ ] **Step 4: Commit**

```bash
git add scripts/MakeHoldout.java
git commit -m "chore(scripts): build a 60-group holdout for the hidden-test rehearsal"
```

---

### Task 11: Final report

**Files:** none. Do **not** edit `docs/`.

- [ ] **Step 1: Collect the findings on a copy of the database**

Run the queries of Task 4 Step 3 again on the final database, plus:
```sql
-- entities with no event (censored or healthy), BANK
SELECT COUNT(*) FROM profile_scores p WHERE entity_type = 'GROUP' AND profile = 'BANK' AND month = '2026-08'
  AND NOT EXISTS (SELECT 1 FROM lead_time_events e WHERE e.entity_id = p.entity_id AND e.profile = 'BANK');
-- the demo pair and the demo entity
SELECT * FROM showcase_pairs WHERE entity_type = 'GROUP' AND profile = 'BANK' AND month = '2026-08' ORDER BY rank LIMIT 3;
SELECT entity_id, "trigger", event_month, signal_month, lead_months, limit_signal_month, limit_lead_months
FROM lead_time_events WHERE entity_type = 'GROUP' AND profile = 'BANK' AND event_type = 'DETERIORATION'
  AND limit_lead_months >= 1 ORDER BY limit_lead_months DESC, lead_months DESC LIMIT 5;
```

- [ ] **Step 2: Report**

Reply with:
1. Commits (one line each).
2. Stage timings (14 stages) and the total.
3. Lead time per profile and event type: events, detected, detected ahead, mean and median lead, the histogram, the false alarm rate. The limit lead for BANK.
4. **The three entities to open in the demo**: the top showcase pair at M23 and the entity with the largest `limit_lead_months` (with its event month and trigger).
5. Showcase pairs at M23 per profile: how many, how many `meets_spec`.
6. `LookAheadTest`: what it caught, if anything, and what you changed in which stage.
7. The holdout rehearsal: row counts, pipeline time, both submission files' first lines, and anything that had to be fixed.
8. Config values that look wrong against the data (mean lead < 1 month, false alarm rate > 70 %, the lead histogram piling up at 12, a profile with almost no events). Do not tune them: list them for the human review.
9. Anything in this plan you had to change, and why.
