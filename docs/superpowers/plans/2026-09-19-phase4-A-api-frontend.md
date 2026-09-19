# Phase 4 · Plan A — Read API, submission export, frontend on real data

> **For agentic workers:** Claude Code: use superpowers:executing-plans (or superpowers:subagent-driven-development) to run this plan task by task. Antigravity or other agents: do the checkboxes in order. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the scores through the read API of SPEC §12.5 (meta, profiles, portfolio, entity detail, timeline, distribution, submission export), and connect the Portfolio, Entity and Methodology pages to it.

**Architecture:** Thin query classes in `application/` read the results tables with `SqlRunner.query` and return Java `record` DTOs from `infrastructure/web/dto/`. Controllers in `infrastructure/web/controller/` only parse parameters and call one query. Nothing is recomputed in a request (CLAUDE.md rule 8): a query reads, filters, sums and rounds. The frontend keeps its mock mode (`npm run dev:mock`) and its components. The types follow the new DTOs, and the pages handle the fields that stay `null` until plan B merges or until Blocks 6–7.

**Tech Stack:** Java 21, Spring Boot 3.5 (web, JDBC), DuckDB. React 19 + TypeScript + Vite, TanStack Query 5, Recharts, Tailwind 4 (versions pinned in `frontend/package.json`).

**Spec:** `docs/SPEC.md` §7.5, §8.3, §11, §12.5, §12.7, §15. `docs/ARCHITECTURE.md` §3, §10. Shared contract, decisions E1–E10 and path ownership: `docs/superpowers/plans/2026-09-19-phase4-overview.md`. **Read the overview before Task 1.**

## Global Constraints

- Edit only the paths that the overview gives to plan A: `backend/src/main/java/com/xray/application/**`, `backend/src/main/java/com/xray/infrastructure/web/**`, `frontend/**`.
- Java 21 target. The machine's JDK 21 has no `javac`. The default `java` (JDK 25) compiles with `--release 21`, so run plain `./mvnw ...`.
- No new Maven dependency. No new npm package. Node 24 LTS (`mise.toml`).
- No recomputation in a request. Read the results tables. Target < 1 s per endpoint.
- **No weight or λ value in any file** (overview decision E1). The UI reads the weights from `/api/profiles`.
- Scores, deltas and contributions are rounded to 1 decimal in the DTO, never before.
- Every endpoint works before plan B merges: `contributions`, `changepoints` and `profile_weights` can be missing, and `status`, `regime`, `confidence` can be NULL (contract item 8). Never an HTTP 500 for that.
- No test class. Only the six tests in `CLAUDE.md` may exist, and plan B owns `backend/src/test/**`. Check with `curl`, `jq`, `npm run typecheck`, `npm run build` and the browser.
- UI copy is Spanish. Code, identifiers and commits are English.
- Commits: Conventional Commits, English, lowercase subject. Commit after each task.
- Your backend runs on port 8081 with the worktree's own `data/xray.duckdb`. Never open that file with the CLI while the backend runs (file lock). Query a copy.

## File Structure

```
backend/src/main/java/com/xray/
  application/
    BadRequestException.java  NotFoundException.java
    ApiParams.java                    profile / month parsing and the month axis
    Scores.java                       round1 and nullable column reads
    MetaQuery.java                    GET /api/meta
    ProfilesQuery.java                GET /api/profiles, weights of the run
    PortfolioQuery.java               GET /api/portfolio and the portfolio rows
    TimelineQuery.java                timeline points and changepoints
    EntityDetailQuery.java            GET /api/entities/{id}
    DistributionQuery.java            GET /api/analytics/distribution
    export/
      SubmissionExporter.java         one implementation per format (SPEC §11)
      EntityScoreExporter.java        entity_id,score at the last month
      EntityMonthScoreExporter.java   entity_id,month,score
      ExportSubmissionUseCase.java
  infrastructure/web/
    ApiExceptionHandler.java          400 / 404 as {"error": "..."}
    dto/                              Java records (one file each, listed in Task 1)
    controller/
      MetaController.java  PortfolioController.java  EntityController.java
      AnalyticsController.java  ExportController.java
frontend/
  vite.config.ts                      proxy target from VITE_API_TARGET
  src/api/types.ts                    aligned with the DTOs
  src/api/queries.ts                  + useMeta, useProfiles, useTimeline
  src/mocks/generate.ts               new fields with empty values
  src/lib/format.ts                   + INDICATOR_LABELS, confidenceLabel
  src/components/StatusTag.tsx  Meter.tsx  Delta.tsx  TrendChart.tsx   accept null
  src/pages/PortfolioPage.tsx  EntityPage.tsx  MethodologyPage.tsx  ComparePage.tsx
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
   - `eff_weight` of an indicator = `w'_c · w_i / Σ w_j` over the available indicators of its category. `w_i` = `scoring.indicators.<ID>.weight`, 1 when the key is missing (decision E11).
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

Note on item 3: on this branch `profile_scores` has no `seasonal` column yet. Plan A never reads `seasonal`.

---

### Task 0: Check the worktree and build the fixture

**Files:** `frontend/vite.config.ts`

Before plan B merges, this branch has no `contributions`, `changepoints` or `profile_weights`, and every `status` is NULL. A fixture in **your local database only** lets you exercise those code paths. It is never committed.

- [ ] **Step 1: Confirm the branch and run the pipeline**

Run (worktree root):
```bash
git branch --show-current          # feat/phase4-api-frontend
ls data/raw | head -3
cd backend && rm -f ../data/xray.duckdb ../data/xray.duckdb.wal
SERVER_PORT=8081 ./mvnw -q spring-boot:run > /tmp/xray-a.log 2>&1 &
until curl -s localhost:8081/api/pipeline/status | grep -q '"state":"DONE"\|"state":"FAILED"'; do sleep 3; done
curl -s localhost:8081/api/pipeline/status; echo
```
Expected: `"state":"DONE"`, 9 stages. Leave the backend running while you code. Restart it after each Java change (`pkill -f 'spring-boot:run'`, then the `SERVER_PORT=8081 ./mvnw -q spring-boot:run ... &` line). A restart does not rerun the pipeline, because `pipeline_runs` is not empty.

- [ ] **Step 2: Write the fixture file (outside the repository)**

Write `/tmp/xray-a-fixture.sql`:
```sql
-- Fake plan B tables so plan A can exercise its code paths. Local database only. Never commit.
CREATE OR REPLACE TABLE contributions AS
SELECT i.entity_type, i.entity_id, i.month, p.profile, i.indicator_id AS driver_id, i.category,
       0.05 AS eff_weight, i.level_score AS blended, 0.05 * (i.level_score - 50) AS contrib,
       0.3 AS delta1, -0.6 AS delta3,
       'fixture 1m ' || i.indicator_id AS narrative_1m, 'fixture 3m ' || i.indicator_id AS narrative_3m
FROM indicator_values i CROSS JOIN (SELECT DISTINCT profile FROM profile_scores) p
WHERE i.available AND i.entity_type = 'GROUP';
CREATE OR REPLACE TABLE changepoints AS
SELECT 'GROUP' AS entity_type, 'GROUP_0016' AS entity_id, 'BANK' AS profile, 'FINAL' AS series,
       '2025-10' AS month, '2025-12' AS alarm_month, 'DOWN' AS direction;
UPDATE profile_scores SET status = 'WATCH', regime = 'STABLE', confidence = 'MEDIUM' WHERE final IS NOT NULL AND month >= '2026-01';
```
The fixture does not create `profile_weights`, so `/api/profiles` uses the config fallback path.

- [ ] **Step 3: Know how to apply and remove the fixture**

Apply (backend stopped): `pkill -f 'spring-boot:run'; sleep 3; duckdb ../data/xray.duckdb < /tmp/xray-a-fixture.sql`, then restart the backend.
Remove: stop the backend, `rm -f ../data/xray.duckdb ../data/xray.duckdb.wal`, restart (the pipeline runs again).
Tasks 3 and 4 tell you when to use it.

- [ ] **Step 4: Make the Vite proxy target configurable**

In `frontend/vite.config.ts`, replace the proxy block with:
```ts
    proxy: {
      // Forwards /api to the Spring Boot API. Avoids CORS in development.
      // VITE_API_TARGET lets a second worktree use another port (phase 4 plan A uses 8081).
      "/api": {
        target: process.env.VITE_API_TARGET ?? "http://localhost:8080",
        changeOrigin: true,
      },
    },
```
Run: `cd frontend && npm install && npm run typecheck`
Expected: exit code 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/vite.config.ts
git commit -m "build(frontend): read the dev proxy target from VITE_API_TARGET"
```

---

### Task 1: DTOs, parameters and error handling

**Files:**
- Create: `application/BadRequestException.java`, `NotFoundException.java`, `ApiParams.java`, `Scores.java`
- Create: `infrastructure/web/ApiExceptionHandler.java`
- Create: `infrastructure/web/dto/*.java` (the records below, one file each)

All paths are under `backend/src/main/java/com/xray/`.

**Interfaces:**
- Produces: `ApiParams.profile(String) → Profile`, `ApiParams.month(String) → String`, `ApiParams.minus(String month, int k) → String`, `ApiParams.months() → List<String>`, `ApiParams.lastMonth()`, `ApiParams.unit() → EntityType`; `Scores.round1(Double) → Double`, `Scores.dbl(ResultSet, String) → Double`; every DTO below.

- [ ] **Step 1: Write the exceptions and `ApiParams`**

`application/BadRequestException.java`:
```java
package com.xray.application;

/** A bad query parameter. ApiExceptionHandler maps it to HTTP 400. */
public class BadRequestException extends RuntimeException {
    public BadRequestException(String message) {
        super(message);
    }
}
```
`application/NotFoundException.java`:
```java
package com.xray.application;

/** An unknown entity. ApiExceptionHandler maps it to HTTP 404. */
public class NotFoundException extends RuntimeException {
    public NotFoundException(String message) {
        super(message);
    }
}
```
`application/ApiParams.java`:
```java
package com.xray.application;

import com.xray.config.ScoringConfig;
import com.xray.domain.model.EntityType;
import com.xray.domain.model.Month;
import com.xray.domain.model.Profile;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;

/** The query parameters every read endpoint shares: profile (default BANK) and month (default the last one). */
@Component
public class ApiParams {

    private final ScoringConfig config;
    private final List<String> months;

    public ApiParams(ScoringConfig config) {
        this.config = config;
        this.months = Month.range(Month.parse(config.months().start()), Month.parse(config.months().end()))
                .stream().map(Month::toString).toList();
    }

    public EntityType unit() {
        return config.unit();
    }

    public List<String> months() {
        return months;
    }

    public String lastMonth() {
        return months.getLast();
    }

    public Profile profile(String raw) {
        if (raw == null || raw.isBlank()) {
            return Profile.BANK;
        }
        try {
            return Profile.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Unknown profile " + raw + ". Use BANK, FUND or INSURER.");
        }
    }

    public String month(String raw) {
        if (raw == null || raw.isBlank()) {
            return lastMonth();
        }
        if (!months.contains(raw.trim())) {
            throw new BadRequestException("Month " + raw + " is outside " + months.getFirst() + " .. " + lastMonth() + ".");
        }
        return raw.trim();
    }

    /** month − k as YYYY-MM. It can fall before the first month: string comparison still orders it first. */
    public String minus(String month, int k) {
        return Month.parse(month).plus(-k).toString();
    }
}
```
`application/Scores.java`:
```java
package com.xray.application;

import java.sql.ResultSet;
import java.sql.SQLException;

/** Scores are rounded to 1 decimal at the API boundary only (CLAUDE.md conventions). */
public final class Scores {

    private Scores() {
    }

    public static Double round1(Double v) {
        return v == null ? null : Math.round(v * 10.0) / 10.0;
    }

    public static double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }

    /** A nullable DOUBLE column. */
    public static Double dbl(ResultSet rs, String column) throws SQLException {
        double v = rs.getDouble(column);
        return rs.wasNull() ? null : v;
    }
}
```

- [ ] **Step 2: Write the exception handler**

`infrastructure/web/ApiExceptionHandler.java`:
```java
package com.xray.infrastructure.web;

import com.xray.application.BadRequestException;
import com.xray.application.NotFoundException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(BadRequestException.class)
    public ResponseEntity<Map<String, String>> badRequest(BadRequestException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", e.getMessage()));
    }

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<Map<String, String>> notFound(NotFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
    }
}
```

- [ ] **Step 3: Write the DTO records**

One file each in `infrastructure/web/dto/`, package `com.xray.infrastructure.web.dto`. Add `import com.fasterxml.jackson.annotation.JsonProperty;`, `java.util.List` and `java.util.Map` where used.
```java
/** One scored entity at one month. `final` is a Java keyword, so the component is finalScore. */
public record PortfolioRowDto(String id, String name, String entityType, @JsonProperty("final") double finalScore,
                              double level, Double traj, String band, String status, String regime, Double delta3m,
                              List<Double> sparkline, int activeAlerts, String confidence) {
}

/** unscored = entities of the unit with no final score this month (not active yet). */
public record PortfolioDto(String profile, String month, int unscored, List<PortfolioRowDto> rows) {
}

public record MetaDto(String unit, List<String> months, List<String> profiles, Map<String, Long> entityCounts,
                      String runId, String finishedAt, boolean demoMode, boolean explanationsReady,
                      boolean dynamicsReady, List<String> caveats) {
}

public record ProfileWeightsDto(String profile, double lambda, Map<String, Double> weights) {
}

/** source = "run" (profile_weights of the last run) or "config" (scoring-config.yml, before plan B merges). */
public record ProfilesDto(String source, List<ProfileWeightsDto> profiles) {
}

/** weight = profile weight (0–100); effectiveWeight = renormalized share (0–1) this month. */
public record CategoryDto(String category, Double level, Double traj, double weight, double effectiveWeight,
                          double contribution, Double contributionDelta3m, int nAvailable) {
}

public record DriverDto(String driverId, String category, double contrib, double blended, double effWeight) {
}

public record ChangeDto(String driverId, String category, double delta, String narrative) {
}

public record IndicatorRowDto(String indicatorId, String category, Double value, Double level, Double traj,
                              boolean available, boolean isStatic, boolean fallback, String anchorStatus) {
}

public record TimelinePointDto(String month, @JsonProperty("final") Double finalScore, Double level, Double traj,
                               String band, String status, String regime) {
}

public record ChangepointDto(String series, String month, String alarmMonth, String direction) {
}

public record TimelineDto(String id, String profile, List<TimelinePointDto> points, List<ChangepointDto> changepoints) {
}

/** limit, premium and momentum stay null until Block 7 (decision E8). row is null when the entity has no score. */
public record EntityDetailDto(String id, String name, String entityType, String groupId, String profile, String month,
                              PortfolioRowDto row, List<CategoryDto> categories, List<DriverDto> drivers,
                              List<ChangeDto> changes1m, List<ChangeDto> changes3m, List<IndicatorRowDto> indicators,
                              List<TimelinePointDto> timeline, List<ChangepointDto> changepoints,
                              List<PortfolioRowDto> companies, Object limit, Object premium, Object momentum) {
}

public record BucketDto(int from, int to, long count) {
}

public record DistributionDto(String profile, String month, List<BucketDto> histogram, Map<String, Long> statusCounts,
                              Map<String, Long> bandCounts) {
}
```

- [ ] **Step 4: Build**

Run: `cd backend && ./mvnw -q compile`
Expected: exit code 0.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/xray/application backend/src/main/java/com/xray/infrastructure/web
git commit -m "feat(api): add read dtos, shared parameters and error mapping"
```

---

### Task 2: `/api/meta`, `/api/profiles`, `/api/portfolio`, `/api/analytics/distribution`

**Files:**
- Create: `application/MetaQuery.java`, `ProfilesQuery.java`, `PortfolioQuery.java`, `DistributionQuery.java`
- Create: `infrastructure/web/controller/MetaController.java`, `PortfolioController.java`, `AnalyticsController.java`

**Interfaces:**
- Consumes: `SqlRunner.query(String, RowMapper<T>, Object...)`, `DuckDbTables.exists(SqlRunner, String)`, `ApiParams`, `Scores`, `XRayProperties.demoMode()`.
- Produces: `ProfilesQuery.weights(Profile) → Map<Category, Double>`; `PortfolioQuery.rows(String entityType, String groupId, String entityId, Profile p, String month) → List<PortfolioRowDto>` (Task 3 uses it for one entity and for the companies of a group).

- [ ] **Step 1: Write `ProfilesQuery`**

```java
package com.xray.application;

import com.xray.config.ScoringConfig;
import com.xray.domain.model.Category;
import com.xray.domain.model.Profile;
import com.xray.infrastructure.duckdb.DuckDbTables;
import com.xray.infrastructure.duckdb.SqlRunner;
import com.xray.infrastructure.web.dto.ProfileWeightsDto;
import com.xray.infrastructure.web.dto.ProfilesDto;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The weights that produced the scores on screen (decision E1): profile_weights of the last run.
 * Before plan B merges that table does not exist, and the config is the fallback.
 */
@Service
public class ProfilesQuery {

    private final SqlRunner sql;
    private final ScoringConfig config;

    public ProfilesQuery(SqlRunner sql, ScoringConfig config) {
        this.sql = sql;
        this.config = config;
    }

    public ProfilesDto profiles() {
        List<ProfileWeightsDto> out = new ArrayList<>();
        for (Profile p : Profile.values()) {
            Map<String, Double> w = new LinkedHashMap<>();
            weights(p).entrySet().stream()
                    .sorted(Map.Entry.<Category, Double>comparingByValue().reversed())
                    .forEach(e -> w.put(e.getKey().name(), e.getValue()));
            out.add(new ProfileWeightsDto(p.name(), lambda(p), w));
        }
        return new ProfilesDto(fromRun() ? "run" : "config", out);
    }

    public Map<Category, Double> weights(Profile p) {
        Map<Category, Double> out = new EnumMap<>(Category.class);
        if (fromRun()) {
            sql.query("SELECT category, weight FROM profile_weights WHERE profile = ?",
                    (rs, i) -> out.put(Category.valueOf(rs.getString(1)), rs.getDouble(2)), p.name());
        } else {
            out.putAll(config.profiles().get(p).weights());
        }
        return out;
    }

    private double lambda(Profile p) {
        if (fromRun()) {
            List<Double> l = sql.query("SELECT ANY_VALUE(lambda) FROM profile_weights WHERE profile = ?",
                    (rs, i) -> rs.getDouble(1), p.name());
            if (!l.isEmpty()) return l.getFirst();
        }
        return config.profiles().get(p).lambda();
    }

    private boolean fromRun() {
        return DuckDbTables.exists(sql, "profile_weights");
    }
}
```

- [ ] **Step 2: Write `MetaQuery`**

```java
package com.xray.application;

import com.xray.config.XRayProperties;
import com.xray.domain.model.Profile;
import com.xray.infrastructure.duckdb.DuckDbTables;
import com.xray.infrastructure.duckdb.SqlRunner;
import com.xray.infrastructure.web.dto.MetaDto;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class MetaQuery {

    /** SPEC §15, shown in the UI (Spanish copy). */
    static final List<String> CAVEATS = List.of(
            "Sin balance ni cuenta de resultados: EBITDA, deuda/EBITDA y DSCR son aproximaciones desde el flujo de caja.",
            "La deuda dispuesta y concedida es una foto del 2026-09-01: los indicadores que la usan se marcan como estáticos.",
            "Datos sintéticos y sin etiqueta real de impago: la anticipación se mide contra eventos proxy documentados.",
            "Las historias cortas y los datos de ERP incompletos bajan la confianza: esas entidades se puntúan, no se excluyen.",
            "EBA/GL/2020/06 se cita como marco de buenas prácticas (alertas con umbrales y lista de vigilancia), no como lista obligatoria.");

    private final SqlRunner sql;
    private final ApiParams params;
    private final XRayProperties props;

    public MetaQuery(SqlRunner sql, ApiParams params, XRayProperties props) {
        this.sql = sql;
        this.params = params;
        this.props = props;
    }

    public MetaDto meta() {
        Map<String, Long> counts = new LinkedHashMap<>();
        if (DuckDbTables.exists(sql, "entities")) {
            sql.query("SELECT entity_type, COUNT(*) FROM entities GROUP BY 1 ORDER BY 1",
                    (rs, i) -> counts.put(rs.getString(1), rs.getLong(2)));
        }
        String runId = null;
        String finishedAt = null;
        if (DuckDbTables.exists(sql, "pipeline_runs")) {
            List<String[]> last = sql.query(
                    "SELECT run_id, CAST(finished_at AS VARCHAR) FROM pipeline_runs ORDER BY finished_at DESC LIMIT 1",
                    (rs, i) -> new String[]{rs.getString(1), rs.getString(2)});
            if (!last.isEmpty()) {
                runId = last.getFirst()[0];
                finishedAt = last.getFirst()[1];
            }
        }
        return new MetaDto(params.unit().name(), params.months(),
                Arrays.stream(Profile.values()).map(Enum::name).toList(), counts, runId, finishedAt,
                props.demoMode(), DuckDbTables.exists(sql, "contributions"),
                DuckDbTables.exists(sql, "changepoints"), CAVEATS);
    }
}
```
Check the column names of `pipeline_runs` first: `duckdb -readonly <copy> "DESCRIBE pipeline_runs"`. If `run_id` or `finished_at` has another name, use that name.

- [ ] **Step 3: Write `PortfolioQuery`**

```java
package com.xray.application;

import com.xray.domain.model.Profile;
import com.xray.infrastructure.duckdb.SqlRunner;
import com.xray.infrastructure.web.dto.PortfolioDto;
import com.xray.infrastructure.web.dto.PortfolioRowDto;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/** GET /api/portfolio (SPEC §12.5). Reads profile_scores only. */
@Service
public class PortfolioQuery {

    private static final int SPARKLINE_MONTHS = 12;

    private final SqlRunner sql;
    private final ApiParams params;

    public PortfolioQuery(SqlRunner sql, ApiParams params) {
        this.sql = sql;
        this.params = params;
    }

    public PortfolioDto portfolio(String profileRaw, String monthRaw, String status, String band, String q, String sort) {
        Profile p = params.profile(profileRaw);
        String month = params.month(monthRaw);
        String unit = params.unit().name();
        List<PortfolioRowDto> rows = rows(unit, null, null, p, month);
        long total = sql.query("SELECT COUNT(*) FROM entities WHERE entity_type = ?", (rs, i) -> rs.getLong(1), unit)
                .getFirst();
        int unscored = (int) (total - rows.size());

        Set<String> statuses = csv(status);
        Set<String> bands = csv(band);
        String needle = q == null ? "" : q.trim().toLowerCase(Locale.ROOT);
        List<PortfolioRowDto> filtered = rows.stream()
                .filter(r -> statuses.isEmpty() || (r.status() != null && statuses.contains(r.status())))
                .filter(r -> bands.isEmpty() || bands.contains(r.band()))
                .filter(r -> needle.isEmpty() || r.id().toLowerCase(Locale.ROOT).contains(needle))
                .sorted(order(sort))
                .toList();
        return new PortfolioDto(p.name(), month, unscored, filtered);
    }

    /**
     * Scored rows at month. groupId != null keeps the companies of that group; entityId != null keeps one entity.
     * Sorted by final score, highest first.
     */
    public List<PortfolioRowDto> rows(String entityType, String groupId, String entityId, Profile p, String month) {
        List<Object> args = new ArrayList<>(List.of(p.name(), params.minus(month, 3), entityType, p.name(), month));
        StringBuilder where = new StringBuilder();
        if (groupId != null) {
            where.append(" AND e.group_id = ?");
            args.add(groupId);
        }
        if (entityId != null) {
            where.append(" AND s.entity_id = ?");
            args.add(entityId);
        }
        record Base(String id, double fin, double level, Double traj, String band, String status, String regime,
                    String confidence, Double final3) {
        }
        List<Base> base = sql.query("""
                SELECT s.entity_id, s.final, s.level, s.traj, s.band, s.status, s.regime, s.confidence,
                       b.final AS final3
                FROM profile_scores s
                JOIN entities e ON e.entity_type = s.entity_type AND e.entity_id = s.entity_id
                LEFT JOIN profile_scores b ON b.entity_type = s.entity_type AND b.entity_id = s.entity_id
                     AND b.profile = ? AND b.month = ?
                WHERE s.entity_type = ? AND s.profile = ? AND s.month = ? AND s.final IS NOT NULL""" + where
                        + " ORDER BY s.final DESC",
                (rs, i) -> new Base(rs.getString("entity_id"), rs.getDouble("final"), rs.getDouble("level"),
                        Scores.dbl(rs, "traj"), rs.getString("band"), rs.getString("status"),
                        rs.getString("regime"), rs.getString("confidence"), Scores.dbl(rs, "final3")),
                args.toArray());
        Map<String, List<Double>> spark = sparklines(entityType, p, month,
                base.stream().map(Base::id).collect(Collectors.toSet()));
        return base.stream().map(b -> new PortfolioRowDto(b.id(), b.id(), entityType, Scores.round1(b.fin()),
                Scores.round1(b.level()), Scores.round1(b.traj()), b.band(), b.status(), b.regime(),
                b.final3() == null ? null : Scores.round1(b.fin() - b.final3()),
                spark.getOrDefault(b.id(), List.of()), 0, b.confidence())).toList();
    }

    /** Non-null finals of the 12 months up to month, oldest first. */
    private Map<String, List<Double>> sparklines(String entityType, Profile p, String month, Set<String> ids) {
        Map<String, List<Double>> out = new HashMap<>();
        if (ids.isEmpty()) return out;
        sql.query("""
                SELECT entity_id, final FROM profile_scores
                WHERE entity_type = ? AND profile = ? AND month BETWEEN ? AND ? AND final IS NOT NULL
                ORDER BY entity_id, month""",
                (rs, i) -> {
                    String id = rs.getString(1);
                    if (ids.contains(id)) out.computeIfAbsent(id, k -> new ArrayList<>()).add(Scores.round1(rs.getDouble(2)));
                    return null;
                },
                entityType, p.name(), params.minus(month, SPARKLINE_MONTHS - 1), month);
        return out;
    }

    private static Comparator<PortfolioRowDto> order(String sort) {
        Function<PortfolioRowDto, Double> key = switch (sort == null ? "final" : sort) {
            case "delta3m" -> PortfolioRowDto::delta3m;
            case "level" -> PortfolioRowDto::level;
            case "traj" -> PortfolioRowDto::traj;
            case "final" -> PortfolioRowDto::finalScore;
            default -> throw new BadRequestException("Unknown sort " + sort + ". Use final, delta3m, level or traj.");
        };
        return Comparator.comparing(key, Comparator.nullsLast(Comparator.reverseOrder()));
    }

    private static Set<String> csv(String raw) {
        if (raw == null || raw.isBlank()) return Set.of();
        return Arrays.stream(raw.split(",")).map(s -> s.trim().toUpperCase(Locale.ROOT))
                .filter(s -> !s.isEmpty()).collect(Collectors.toSet());
    }
}
```

- [ ] **Step 4: Write `DistributionQuery`**

```java
package com.xray.application;

import com.xray.domain.model.Profile;
import com.xray.infrastructure.duckdb.SqlRunner;
import com.xray.infrastructure.web.dto.BucketDto;
import com.xray.infrastructure.web.dto.DistributionDto;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** GET /api/analytics/distribution: 5-point histogram of final, status and band counts, unit entities only. */
@Service
public class DistributionQuery {

    private static final int BUCKET = 5;

    private final SqlRunner sql;
    private final ApiParams params;

    public DistributionQuery(SqlRunner sql, ApiParams params) {
        this.sql = sql;
        this.params = params;
    }

    public DistributionDto distribution(String profileRaw, String monthRaw) {
        Profile p = params.profile(profileRaw);
        String month = params.month(monthRaw);
        Object[] args = {params.unit().name(), p.name(), month};
        long[] counts = new long[100 / BUCKET];
        sql.query("""
                SELECT LEAST(CAST(FLOOR(final / 5) AS INTEGER), 19) AS b, COUNT(*) FROM profile_scores
                WHERE entity_type = ? AND profile = ? AND month = ? AND final IS NOT NULL GROUP BY 1""",
                (rs, i) -> counts[rs.getInt(1)] = rs.getLong(2), args);
        List<BucketDto> histogram = new ArrayList<>();
        for (int b = 0; b < counts.length; b++) {
            histogram.add(new BucketDto(b * BUCKET, (b + 1) * BUCKET, counts[b]));
        }
        return new DistributionDto(p.name(), month, histogram, grouped("status", args), grouped("band", args));
    }

    private Map<String, Long> grouped(String column, Object[] args) {
        Map<String, Long> out = new LinkedHashMap<>();
        sql.query("SELECT " + column + ", COUNT(*) FROM profile_scores WHERE entity_type = ? AND profile = ? "
                        + "AND month = ? AND " + column + " IS NOT NULL GROUP BY 1 ORDER BY 2 DESC",
                (rs, i) -> out.put(rs.getString(1), rs.getLong(2)), args);
        return out;
    }
}
```
`column` is one of two literals in this class, never user input.

- [ ] **Step 5: Write the controllers**

`infrastructure/web/controller/MetaController.java`:
```java
package com.xray.infrastructure.web.controller;

import com.xray.application.MetaQuery;
import com.xray.application.ProfilesQuery;
import com.xray.infrastructure.web.dto.MetaDto;
import com.xray.infrastructure.web.dto.ProfilesDto;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class MetaController {

    private final MetaQuery meta;
    private final ProfilesQuery profiles;

    public MetaController(MetaQuery meta, ProfilesQuery profiles) {
        this.meta = meta;
        this.profiles = profiles;
    }

    @GetMapping("/meta")
    public MetaDto meta() {
        return meta.meta();
    }

    @GetMapping("/profiles")
    public ProfilesDto profiles() {
        return profiles.profiles();
    }
}
```
`infrastructure/web/controller/PortfolioController.java`:
```java
package com.xray.infrastructure.web.controller;

import com.xray.application.PortfolioQuery;
import com.xray.infrastructure.web.dto.PortfolioDto;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PortfolioController {

    private final PortfolioQuery query;

    public PortfolioController(PortfolioQuery query) {
        this.query = query;
    }

    @GetMapping("/api/portfolio")
    public PortfolioDto portfolio(@RequestParam(required = false) String profile,
                                  @RequestParam(required = false) String month,
                                  @RequestParam(required = false) String status,
                                  @RequestParam(required = false) String band,
                                  @RequestParam(required = false) String q,
                                  @RequestParam(required = false) String sort) {
        return query.portfolio(profile, month, status, band, q, sort);
    }
}
```
`infrastructure/web/controller/AnalyticsController.java`:
```java
package com.xray.infrastructure.web.controller;

import com.xray.application.DistributionQuery;
import com.xray.infrastructure.web.dto.DistributionDto;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {

    private final DistributionQuery distribution;

    public AnalyticsController(DistributionQuery distribution) {
        this.distribution = distribution;
    }

    @GetMapping("/distribution")
    public DistributionDto distribution(@RequestParam(required = false) String profile,
                                        @RequestParam(required = false) String month) {
        return distribution.distribution(profile, month);
    }
}
```

- [ ] **Step 6: Restart the backend and check**

Run:
```bash
curl -s localhost:8081/api/meta | jq '{unit, n: (.months | length), entityCounts, explanationsReady, dynamicsReady}'
# {"unit":"GROUP","n":24,"entityCounts":{"COMPANY":1286,"GROUP":250},"explanationsReady":false,"dynamicsReady":false}
curl -s localhost:8081/api/profiles | jq '.source, (.profiles[] | {profile, lambda, sum: ([.weights[]] | add)})'
# "config", then each profile with sum 100
curl -s 'localhost:8081/api/portfolio?profile=BANK&month=2026-08' | jq '{unscored, n: (.rows | length), first: .rows[0]}'
# unscored 2, n 248, first row has final, band, sparkline (12 values or fewer), status null before the fixture
curl -s 'localhost:8081/api/portfolio?profile=FUND&month=2026-08' | jq '[.rows[0:5][] | .id]'
# a different top 5 than BANK: the profile switch re-ranks
curl -s 'localhost:8081/api/portfolio?profile=BANK&month=2026-08&band=A&sort=delta3m' | jq '[.rows[] | .band] | unique'
# ["A"]
curl -s 'localhost:8081/api/analytics/distribution?profile=BANK&month=2026-08' | jq '[.histogram[].count] | add'
# 248
curl -s -o /dev/null -w '%{http_code}\n' 'localhost:8081/api/portfolio?profile=XX'   # 400
curl -s -o /dev/null -w '%{http_code}\n' 'localhost:8081/api/portfolio?month=2023-01' # 400
curl -s -o /dev/null -w '%{time_total}\n' 'localhost:8081/api/portfolio?profile=BANK'  # < 1.0
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/xray/application backend/src/main/java/com/xray/infrastructure/web
git commit -m "feat(api): add meta, profiles, portfolio and distribution endpoints"
```

---

### Task 3: `/api/entities/{id}` and `/api/entities/{id}/timeline`

**Files:**
- Create: `application/TimelineQuery.java`, `EntityDetailQuery.java`
- Create: `infrastructure/web/controller/EntityController.java`

**Interfaces:**
- Consumes: `PortfolioQuery.rows(...)`, `ProfilesQuery.weights(Profile)`, `ApiParams`, `Scores`, `DuckDbTables.exists`.
- Produces: `TimelineQuery.points(String type, String id, Profile p, String upTo)`, `TimelineQuery.changepoints(String type, String id, Profile p, String upTo)`, `EntityDetailQuery.detail(String id, String profile, String month)`.

- [ ] **Step 1: Write `TimelineQuery`**

```java
package com.xray.application;

import com.xray.domain.model.Profile;
import com.xray.infrastructure.duckdb.DuckDbTables;
import com.xray.infrastructure.duckdb.SqlRunner;
import com.xray.infrastructure.web.dto.ChangepointDto;
import com.xray.infrastructure.web.dto.TimelineDto;
import com.xray.infrastructure.web.dto.TimelinePointDto;
import org.springframework.stereotype.Service;

import java.util.List;

/** Per-month scores and the changepoints an observer knew at each month (alarm_month <= upTo, causal). */
@Service
public class TimelineQuery {

    private final SqlRunner sql;
    private final ApiParams params;
    private final EntityLookup lookup;

    public TimelineQuery(SqlRunner sql, ApiParams params, EntityLookup lookup) {
        this.sql = sql;
        this.params = params;
        this.lookup = lookup;
    }

    public TimelineDto timeline(String id, String profileRaw) {
        Profile p = params.profile(profileRaw);
        EntityLookup.Entity e = lookup.find(id);
        return new TimelineDto(id, p.name(), points(e.type(), id, p, params.lastMonth()),
                changepoints(e.type(), id, p, params.lastMonth()));
    }

    public List<TimelinePointDto> points(String type, String id, Profile p, String upTo) {
        return sql.query("""
                SELECT month, final, level, traj, band, status, regime FROM profile_scores
                WHERE entity_type = ? AND entity_id = ? AND profile = ? AND month <= ? ORDER BY month""",
                (rs, i) -> new TimelinePointDto(rs.getString("month"), Scores.round1(Scores.dbl(rs, "final")),
                        Scores.round1(Scores.dbl(rs, "level")), Scores.round1(Scores.dbl(rs, "traj")),
                        rs.getString("band"), rs.getString("status"), rs.getString("regime")),
                type, id, p.name(), upTo);
    }

    public List<ChangepointDto> changepoints(String type, String id, Profile p, String upTo) {
        if (!DuckDbTables.exists(sql, "changepoints")) return List.of();
        return sql.query("""
                SELECT series, month, alarm_month, direction FROM changepoints
                WHERE entity_type = ? AND entity_id = ? AND (profile = ? OR profile IS NULL) AND alarm_month <= ?
                ORDER BY alarm_month, series""",
                (rs, i) -> new ChangepointDto(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4)),
                type, id, p.name(), upTo);
    }
}
```
It needs a small lookup. Create `application/EntityLookup.java`:
```java
package com.xray.application;

import com.xray.infrastructure.duckdb.SqlRunner;
import org.springframework.stereotype.Component;

import java.util.List;

/** entities row by id, or NotFoundException. */
@Component
public class EntityLookup {

    public record Entity(String id, String type, String groupId) {
    }

    private final SqlRunner sql;

    public EntityLookup(SqlRunner sql) {
        this.sql = sql;
    }

    public Entity find(String id) {
        List<Entity> found = sql.query("SELECT entity_id, entity_type, group_id FROM entities WHERE entity_id = ?",
                (rs, i) -> new Entity(rs.getString(1), rs.getString(2), rs.getString(3)), id);
        if (found.isEmpty()) throw new NotFoundException("Unknown entity " + id);
        return found.getFirst();
    }
}
```

- [ ] **Step 2: Write `EntityDetailQuery`**

```java
package com.xray.application;

import com.xray.domain.model.Category;
import com.xray.domain.model.Profile;
import com.xray.infrastructure.duckdb.DuckDbTables;
import com.xray.infrastructure.duckdb.SqlRunner;
import com.xray.infrastructure.web.dto.CategoryDto;
import com.xray.infrastructure.web.dto.ChangeDto;
import com.xray.infrastructure.web.dto.DriverDto;
import com.xray.infrastructure.web.dto.EntityDetailDto;
import com.xray.infrastructure.web.dto.IndicatorRowDto;
import com.xray.infrastructure.web.dto.PortfolioRowDto;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/** GET /api/entities/{id} (SPEC §12.5, §12.7): one read per section, no recomputation. */
@Service
public class EntityDetailQuery {

    private static final int TOP_DRIVERS = 5;

    private final SqlRunner sql;
    private final ApiParams params;
    private final EntityLookup lookup;
    private final PortfolioQuery portfolio;
    private final ProfilesQuery profiles;
    private final TimelineQuery timeline;

    public EntityDetailQuery(SqlRunner sql, ApiParams params, EntityLookup lookup, PortfolioQuery portfolio,
                             ProfilesQuery profiles, TimelineQuery timeline) {
        this.sql = sql;
        this.params = params;
        this.lookup = lookup;
        this.portfolio = portfolio;
        this.profiles = profiles;
        this.timeline = timeline;
    }

    public EntityDetailDto detail(String id, String profileRaw, String monthRaw) {
        Profile p = params.profile(profileRaw);
        String month = params.month(monthRaw);
        EntityLookup.Entity e = lookup.find(id);
        List<PortfolioRowDto> row = portfolio.rows(e.type(), null, id, p, month);
        boolean explained = DuckDbTables.exists(sql, "contributions");
        List<PortfolioRowDto> companies = "GROUP".equals(e.type())
                ? portfolio.rows("COMPANY", id, null, p, month) : List.of();
        return new EntityDetailDto(id, id, e.type(), "GROUP".equals(e.type()) ? null : e.groupId(), p.name(), month,
                row.isEmpty() ? null : row.getFirst(),
                categories(e.type(), id, p, month, explained),
                explained ? drivers(e.type(), id, p, month) : List.of(),
                explained ? changes(e.type(), id, p, month, "delta1", "narrative_1m") : List.of(),
                explained ? changes(e.type(), id, p, month, "delta3", "narrative_3m") : List.of(),
                indicators(e.type(), id, month),
                timeline.points(e.type(), id, p, month),
                timeline.changepoints(e.type(), id, p, month),
                companies, null, null, null);
    }

    private List<CategoryDto> categories(String type, String id, Profile p, String month, boolean explained) {
        record Cat(Double level, Double traj, int n) {
        }
        Map<Category, Cat> cats = new EnumMap<>(Category.class);
        sql.query("SELECT category, level, traj, n_available FROM category_scores "
                        + "WHERE entity_type = ? AND entity_id = ? AND month = ?",
                (rs, i) -> cats.put(Category.valueOf(rs.getString(1)),
                        new Cat(Scores.dbl(rs, "level"), Scores.dbl(rs, "traj"), rs.getInt("n_available"))),
                type, id, month);
        List<Double> momentum = sql.query("SELECT momentum FROM profile_scores "
                        + "WHERE entity_type = ? AND entity_id = ? AND profile = ? AND month = ?",
                (rs, i) -> Scores.dbl(rs, "momentum"), type, id, p.name(), month);
        cats.put(Category.MOMENTUM, new Cat(momentum.isEmpty() ? null : momentum.getFirst(), null, 0));

        Map<Category, double[]> now = explained ? sums(type, id, p, month) : Map.of();
        Map<Category, double[]> before = explained ? sums(type, id, p, params.minus(month, 3)) : Map.of();
        boolean hasBefore = !before.isEmpty();
        Map<Category, Double> weights = profiles.weights(p);
        List<CategoryDto> out = new ArrayList<>();
        for (Category c : Category.values()) {
            Cat x = cats.getOrDefault(c, new Cat(null, null, 0));
            double[] s = now.getOrDefault(c, new double[]{0, 0});
            Double d3 = hasBefore ? Scores.round1(s[0] - before.getOrDefault(c, new double[]{0, 0})[0]) : null;
            out.add(new CategoryDto(c.name(), Scores.round1(x.level()), Scores.round1(x.traj()),
                    weights.getOrDefault(c, 0.0), Math.round(s[1] * 1000) / 1000.0, Scores.round1(s[0]), d3, x.n()));
        }
        return out;
    }

    /** category -> {Σ contrib, Σ eff_weight} at one month. Empty when the month has no final score. */
    private Map<Category, double[]> sums(String type, String id, Profile p, String month) {
        Map<Category, double[]> out = new EnumMap<>(Category.class);
        sql.query("SELECT category, SUM(contrib), SUM(eff_weight) FROM contributions "
                        + "WHERE entity_type = ? AND entity_id = ? AND profile = ? AND month = ? GROUP BY 1",
                (rs, i) -> out.put(Category.valueOf(rs.getString(1)), new double[]{rs.getDouble(2), rs.getDouble(3)}),
                type, id, p.name(), month);
        return out;
    }

    /** Top 5 positive and top 5 negative contributions, highest first (SPEC §7.5 "why this number"). */
    private List<DriverDto> drivers(String type, String id, Profile p, String month) {
        List<DriverDto> all = sql.query("""
                SELECT driver_id, category, contrib, blended, eff_weight FROM contributions
                WHERE entity_type = ? AND entity_id = ? AND profile = ? AND month = ? ORDER BY contrib DESC""",
                (rs, i) -> new DriverDto(rs.getString(1), rs.getString(2), Scores.round1(rs.getDouble(3)),
                        Scores.round1(rs.getDouble(4)), Math.round(rs.getDouble(5) * 1000) / 1000.0),
                type, id, p.name(), month);
        List<DriverDto> pos = all.stream().filter(d -> d.contrib() > 0).limit(TOP_DRIVERS).toList();
        List<DriverDto> neg = all.reversed().stream().filter(d -> d.contrib() < 0).limit(TOP_DRIVERS).toList();
        List<DriverDto> out = new ArrayList<>(pos);
        out.addAll(neg.reversed());
        return out;
    }

    /** Rows with a narrative, biggest |delta| first. deltaColumn and narrativeColumn are literals of this class. */
    private List<ChangeDto> changes(String type, String id, Profile p, String month, String deltaColumn,
                                    String narrativeColumn) {
        return sql.query("SELECT driver_id, category, " + deltaColumn + ", " + narrativeColumn + " FROM contributions "
                        + "WHERE entity_type = ? AND entity_id = ? AND profile = ? AND month = ? AND "
                        + narrativeColumn + " IS NOT NULL ORDER BY ABS(" + deltaColumn + ") DESC",
                (rs, i) -> new ChangeDto(rs.getString(1), rs.getString(2), Scores.round1(rs.getDouble(3)),
                        rs.getString(4)),
                type, id, p.name(), month);
    }

    private List<IndicatorRowDto> indicators(String type, String id, String month) {
        return sql.query("""
                SELECT indicator_id, category, value, level_score, traj_score, available, is_static, fallback,
                       anchor_status
                FROM indicator_values WHERE entity_type = ? AND entity_id = ? AND month = ?
                ORDER BY category, indicator_id""",
                (rs, i) -> new IndicatorRowDto(rs.getString(1), rs.getString(2), Scores.dbl(rs, "value"),
                        Scores.round1(Scores.dbl(rs, "level_score")), Scores.round1(Scores.dbl(rs, "traj_score")),
                        rs.getBoolean("available"), rs.getBoolean("is_static"), rs.getBoolean("fallback"),
                        rs.getString("anchor_status")),
                type, id, month);
    }
}
```
`value` is a raw indicator value in its own unit (days, ratio, HHI). It is not a score, so it is not rounded to 1 decimal. The UI formats it.

- [ ] **Step 3: Write `EntityController`**

```java
package com.xray.infrastructure.web.controller;

import com.xray.application.EntityDetailQuery;
import com.xray.application.TimelineQuery;
import com.xray.infrastructure.web.dto.EntityDetailDto;
import com.xray.infrastructure.web.dto.TimelineDto;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/entities")
public class EntityController {

    private final EntityDetailQuery detail;
    private final TimelineQuery timeline;

    public EntityController(EntityDetailQuery detail, TimelineQuery timeline) {
        this.detail = detail;
        this.timeline = timeline;
    }

    @GetMapping("/{id}")
    public EntityDetailDto detail(@PathVariable String id, @RequestParam(required = false) String profile,
                                  @RequestParam(required = false) String month) {
        return detail.detail(id, profile, month);
    }

    @GetMapping("/{id}/timeline")
    public TimelineDto timeline(@PathVariable String id, @RequestParam(required = false) String profile) {
        return timeline.timeline(id, profile);
    }
}
```

- [ ] **Step 4: Check without the fixture**

Restart the backend. Pick a group with companies: `curl -s 'localhost:8081/api/portfolio?profile=BANK' | jq -r '.rows[0].id'` (call it `$G`).
```bash
curl -s "localhost:8081/api/entities/$G?profile=BANK&month=2026-08" | jq '{row: .row.final, cats: (.categories | length), drivers: (.drivers | length), ind: (.indicators | length), tl: (.timeline | length), companies: (.companies | length), limit}'
# row = the portfolio final, cats 10, drivers 0, ind 22, tl 24, companies 0 (no company panels before plan B), limit null
curl -s "localhost:8081/api/entities/$G?profile=BANK&month=2025-01" | jq '.timeline | length'   # 5 (causal cut)
curl -s "localhost:8081/api/entities/$G/timeline?profile=FUND" | jq '.points | length'         # 24
curl -s -o /dev/null -w '%{http_code}\n' localhost:8081/api/entities/NOPE                      # 404
curl -s -o /dev/null -w '%{time_total}\n' "localhost:8081/api/entities/$G?profile=BANK"         # < 1.0
```

- [ ] **Step 5: Check with the fixture**

Apply the fixture (Task 0 Step 3). Restart. Then:
```bash
curl -s 'localhost:8081/api/entities/GROUP_0016?profile=BANK&month=2026-08' | jq '{drivers: (.drivers | length), c1: (.changes1m | length), c3: (.changes3m[0]), cp: .changepoints, sum: ([.categories[].contribution] | add)}'
# drivers <= 10, c1 > 0, c3 has a "fixture 3m" narrative, cp has the 2025-10 DOWN row, sum is a number
curl -s 'localhost:8081/api/entities/GROUP_0016?profile=BANK&month=2025-11' | jq '.changepoints | length'   # 0 (alarm 2025-12 not known yet)
curl -s 'localhost:8081/api/meta' | jq '.explanationsReady, .dynamicsReady'   # true true
```
Keep the fixture for Task 5 (the Entity page), then remove it at the end of Task 7.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/xray/application backend/src/main/java/com/xray/infrastructure/web
git commit -m "feat(api): add entity detail and timeline endpoints"
```

---

### Task 4: `SubmissionExporter` and `/api/export/submission`

**Files:**
- Create: `application/export/SubmissionExporter.java`, `EntityScoreExporter.java`, `EntityMonthScoreExporter.java`, `ExportSubmissionUseCase.java`
- Create: `infrastructure/web/controller/ExportController.java`

**Interfaces:**
- Produces: `SubmissionExporter { String format(); String csv(Profile p); }`, `ExportSubmissionUseCase.export(String profile, String format) → Csv(String filename, String body)`.

- [ ] **Step 1: Write the exporters**

`application/export/SubmissionExporter.java`:
```java
package com.xray.application.export;

import com.xray.domain.model.Profile;

/**
 * One implementation per submission format (SPEC §11, decision E10). The hidden test arrives on Sunday in the
 * same CSV format as data/raw/. Add an implementation for its scoring unit and ID format, then submit once.
 */
public interface SubmissionExporter {
    /** The value of ?format=. */
    String format();

    /** The whole CSV, header included. */
    String csv(Profile profile);
}
```
`application/export/EntityScoreExporter.java`:
```java
package com.xray.application.export;

import com.xray.application.ApiParams;
import com.xray.domain.model.Profile;
import com.xray.infrastructure.duckdb.SqlRunner;
import org.springframework.stereotype.Component;

import java.util.Locale;

/** entity_id,score at the last month, every entity of the unit. An entity with no score gets an empty score. */
@Component
public class EntityScoreExporter implements SubmissionExporter {

    private final SqlRunner sql;
    private final ApiParams params;

    public EntityScoreExporter(SqlRunner sql, ApiParams params) {
        this.sql = sql;
        this.params = params;
    }

    @Override
    public String format() {
        return "entity";
    }

    @Override
    public String csv(Profile profile) {
        StringBuilder out = new StringBuilder("entity_id,score\n");
        sql.query("""
                SELECT e.entity_id, p.final FROM entities e
                LEFT JOIN profile_scores p ON p.entity_type = e.entity_type AND p.entity_id = e.entity_id
                     AND p.profile = ? AND p.month = ?
                WHERE e.entity_type = ? ORDER BY e.entity_id""",
                (rs, i) -> {
                    double v = rs.getDouble(2);
                    out.append(rs.getString(1)).append(',')
                            .append(rs.wasNull() ? "" : String.format(Locale.ROOT, "%.1f", v)).append('\n');
                    return null;
                },
                profile.name(), params.lastMonth(), params.unit().name());
        return out.toString();
    }
}
```
`application/export/EntityMonthScoreExporter.java`:
```java
package com.xray.application.export;

import com.xray.application.ApiParams;
import com.xray.domain.model.Profile;
import com.xray.infrastructure.duckdb.SqlRunner;
import org.springframework.stereotype.Component;

import java.util.Locale;

/** entity_id,month,score for every scored month of every entity of the unit (long format). */
@Component
public class EntityMonthScoreExporter implements SubmissionExporter {

    private final SqlRunner sql;
    private final ApiParams params;

    public EntityMonthScoreExporter(SqlRunner sql, ApiParams params) {
        this.sql = sql;
        this.params = params;
    }

    @Override
    public String format() {
        return "entity-month";
    }

    @Override
    public String csv(Profile profile) {
        StringBuilder out = new StringBuilder("entity_id,month,score\n");
        sql.query("""
                SELECT entity_id, month, final FROM profile_scores
                WHERE entity_type = ? AND profile = ? AND final IS NOT NULL ORDER BY entity_id, month""",
                (rs, i) -> {
                    out.append(rs.getString(1)).append(',').append(rs.getString(2)).append(',')
                            .append(String.format(Locale.ROOT, "%.1f", rs.getDouble(3))).append('\n');
                    return null;
                },
                params.unit().name(), profile.name());
        return out.toString();
    }
}
```
`application/export/ExportSubmissionUseCase.java`:
```java
package com.xray.application.export;

import com.xray.application.ApiParams;
import com.xray.application.BadRequestException;
import com.xray.domain.model.Profile;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class ExportSubmissionUseCase {

    public record Csv(String filename, String body) {
    }

    private final List<SubmissionExporter> exporters;
    private final ApiParams params;

    public ExportSubmissionUseCase(List<SubmissionExporter> exporters, ApiParams params) {
        this.exporters = exporters;
        this.params = params;
    }

    public Csv export(String profileRaw, String formatRaw) {
        Profile p = params.profile(profileRaw);
        String format = formatRaw == null || formatRaw.isBlank() ? "entity" : formatRaw.trim();
        SubmissionExporter ex = exporters.stream().filter(e -> e.format().equals(format)).findFirst()
                .orElseThrow(() -> new BadRequestException("Unknown format " + format + ". Use "
                        + exporters.stream().map(SubmissionExporter::format).sorted().toList() + "."));
        return new Csv("submission_" + p.name().toLowerCase() + "_" + format + ".csv", ex.csv(p));
    }
}
```
`infrastructure/web/controller/ExportController.java`:
```java
package com.xray.infrastructure.web.controller;

import com.xray.application.export.ExportSubmissionUseCase;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ExportController {

    private final ExportSubmissionUseCase export;

    public ExportController(ExportSubmissionUseCase export) {
        this.export = export;
    }

    @GetMapping("/api/export/submission")
    public ResponseEntity<String> submission(@RequestParam(required = false) String profile,
                                             @RequestParam(required = false) String format) {
        ExportSubmissionUseCase.Csv csv = export.export(profile, format);
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "csv"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + csv.filename() + "\"")
                .body(csv.body());
    }
}
```

- [ ] **Step 2: Restart and check**

```bash
curl -s 'localhost:8081/api/export/submission?profile=BANK&format=entity' | head -3
# entity_id,score / GROUP_0001,xx.x / ...
curl -s 'localhost:8081/api/export/submission?profile=BANK&format=entity' | wc -l            # 251 (header + 250)
curl -s 'localhost:8081/api/export/submission?profile=BANK&format=entity-month' | wc -l      # 4281 (header + 4,280)
curl -s -D - -o /dev/null 'localhost:8081/api/export/submission' | grep -i 'content-disposition'
curl -s -o /dev/null -w '%{http_code}\n' 'localhost:8081/api/export/submission?format=xml'   # 400
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/com/xray/application/export backend/src/main/java/com/xray/infrastructure/web/controller/ExportController.java
git commit -m "feat(export): add submission exporter with entity and entity-month formats"
```

---

### Task 5: Frontend types, queries and null-safe components

**Files:**
- Modify: `frontend/src/api/types.ts`, `frontend/src/api/queries.ts`, `frontend/src/mocks/generate.ts`, `frontend/src/lib/format.ts`
- Modify: `frontend/src/components/StatusTag.tsx`, `Meter.tsx`, `Delta.tsx`, `TrendChart.tsx`

**Interfaces:**
- Produces: the TypeScript types below; `useMeta()`, `useProfiles()`; `INDICATOR_LABELS`, `confidenceLabel()`, `formatIndicatorValue()`.

- [ ] **Step 1: Align `types.ts` with the DTOs**

Replace everything from `export interface PortfolioRow` to the end of `export interface EntityDetail { ... }` with:
```ts
export type EntityType = "GROUP" | "COMPANY";

export interface PortfolioRow {
  id: string;
  name: string;
  entityType: EntityType;
  final: number;
  level: number;
  /** null when no category has a trajectory yet (short history). */
  traj: number | null;
  band: BandLetter;
  /** null until the dynamics stage has run (phase 4 plan B). */
  status: Status | null;
  regime: Regime | null;
  /** null when the entity had no score 3 months before. */
  delta3m: number | null;
  /** Final score of up to 12 months up to the selected month, oldest first. */
  sparkline: number[];
  activeAlerts: number;
  confidence: Confidence | null;
}

export interface Portfolio {
  profile: string;
  month: string;
  /** Entities of the unit with no score this month (not active yet). */
  unscored: number;
  rows: PortfolioRow[];
}

export interface CategoryScore {
  category: Category;
  level: number | null;
  traj: number | null;
  /** Profile weight, 0–100. */
  weight: number;
  /** Renormalized share this month, 0–1 (0 when the category has no data). */
  effectiveWeight: number;
  /** Points this category adds to (or takes from) Final − 50. */
  contribution: number;
  /** Change of the contribution vs 3 months before. null when there was no score then. */
  contributionDelta3m: number | null;
  nAvailable: number;
}

export interface Driver {
  driverId: string;
  category: Category;
  contrib: number;
  blended: number;
  effWeight: number;
}

export interface Change {
  driverId: string;
  category: Category;
  delta: number;
  narrative: string;
}

export interface IndicatorRow {
  indicatorId: string;
  category: Category;
  value: number | null;
  level: number | null;
  traj: number | null;
  available: boolean;
  isStatic: boolean;
  fallback: boolean;
  anchorStatus: "closed" | "pending" | string;
}

export interface TimelinePoint {
  month: string;
  final: number | null;
  level: number | null;
  traj: number | null;
  band: BandLetter | null;
  status: Status | null;
  regime: Regime | null;
}

export interface Changepoint {
  series: string;
  month: string;
  alarmMonth: string;
  direction: "UP" | "DOWN";
}

export interface LimitDecision {
  limitEur: number;
  previousLimitEur: number;
  spreadBps: number | null;
  action: "INCREASE" | "REDUCE" | "FREEZE" | "MAINTAIN" | "DECLINE";
  bindingConstraint: "SCORE" | "DSCR" | "RUNWAY";
}

export interface PremiumQuote {
  premiumRate: number | null;
  previousPremiumRate: number | null;
  recommendedBuyerLimitEur: number;
}

export interface MomentumView {
  rank: number;
  of: number;
  trajPercentile: number;
  risingStar: boolean;
}

export interface EntityDetail {
  id: string;
  name: string;
  entityType: EntityType;
  groupId: string | null;
  profile: string;
  month: string;
  /** null when the entity has no score at this month. */
  row: PortfolioRow | null;
  categories: CategoryScore[];
  drivers: Driver[];
  changes1m: Change[];
  changes3m: Change[];
  indicators: IndicatorRow[];
  /** Up to the selected month (causal). */
  timeline: TimelinePoint[];
  changepoints: Changepoint[];
  /** Member companies, scored standalone (groups only). */
  companies: PortfolioRow[];
  /** null until Block 7. */
  limit: LimitDecision | null;
  premium: PremiumQuote | null;
  momentum: MomentumView | null;
}

export interface Meta {
  unit: EntityType;
  months: string[];
  profiles: string[];
  entityCounts: Record<string, number>;
  runId: string | null;
  finishedAt: string | null;
  demoMode: boolean;
  explanationsReady: boolean;
  dynamicsReady: boolean;
  caveats: string[];
}

export interface ProfileWeights {
  profile: string;
  lambda: number;
  weights: Partial<Record<Category, number>>;
}

export interface Profiles {
  source: "run" | "config";
  profiles: ProfileWeights[];
}
```

- [ ] **Step 2: Add the queries**

In `queries.ts`, change the type import to `import type { EntityDetail, Meta, MonitorData, Portfolio, Profiles } from "./types";` and append:
```ts
export function useMeta() {
  return useQuery({ queryKey: ["meta"], queryFn: () => apiGet<Meta>("/meta"), staleTime: 60_000 });
}

/** The weights that produced the scores on screen (profile_weights of the last run). */
export function useProfiles() {
  return useQuery({ queryKey: ["profiles"], queryFn: () => apiGet<Profiles>("/profiles"), staleTime: 60_000 });
}
```

- [ ] **Step 3: Keep the mock mode compiling**

In `mocks/generate.ts`:
1. In `mockPortfolio`, return `{ profile, month, unscored: 0, rows }`.
2. In the `categories` builder (the `BASE_CATEGORIES.map((c) => { ... })` near line 232), add `effectiveWeight: weight / 100` and `nAvailable: 3` to each object, where `weight` is the variable the builder already uses for the `weight` field. If the name differs, use that variable.
3. In `mockEntity`, add `band: bandLetter(p.final)` to each timeline point, and add these fields to the returned object: `groupId: null, profile, month, drivers: [], changes1m: [], changes3m: [], indicators: [], changepoints: [], companies: []`.

Run: `cd frontend && npm run typecheck`
Expected: errors only in `pages/` and `components/` (fixed in the next steps and in Task 6). None in `mocks/` or `api/`.

- [ ] **Step 4: Add labels and formatters to `lib/format.ts`**

Append:
```ts
export function confidenceLabel(c: Confidence | null): string {
  return c === null ? "—" : CONFIDENCE_LABELS[c];
}

/** Spanish label and display unit of each indicator (SPEC §6). */
export const INDICATOR_LABELS: Record<string, { label: string; unit: "days" | "months" | "pct" | "x" | "ratio" | "hhi" }> = {
  LIQ_RUNWAY: { label: "Meses de caja", unit: "months" },
  LIQ_BUFFER: { label: "Colchón de liquidez", unit: "x" },
  LIQ_MIN_BALANCE: { label: "Saldo mínimo", unit: "ratio" },
  CF_NOCF_MARGIN: { label: "Margen de caja operativa", unit: "pct" },
  CF_VOLATILITY: { label: "Volatilidad del flujo", unit: "ratio" },
  CF_IN_OUT_RATIO: { label: "Cobros sobre pagos", unit: "x" },
  ACT_COLLECTIONS_GROWTH: { label: "Crecimiento de cobros", unit: "pct" },
  DEBT_DSCR: { label: "Cobertura de deuda (DSCR)", unit: "x" },
  DEBT_LINE_UTIL: { label: "Uso de pólizas", unit: "pct" },
  LEV_DEBT_TO_CF: { label: "Deuda sobre caja operativa", unit: "x" },
  LEV_FACTORING_RELIANCE: { label: "Peso del factoring", unit: "pct" },
  LEV_FUNDING_COST: { label: "Diferencial de financiación", unit: "pct" },
  PAY_DSO: { label: "Plazo de cobro (DSO)", unit: "days" },
  PAY_DPO: { label: "Plazo de pago (DPO)", unit: "days" },
  PAY_SUPPLIER_LATENESS: { label: "Retraso a proveedores", unit: "days" },
  PAY_OVERDUE_PAYABLES: { label: "Pagos vencidos", unit: "pct" },
  DEL_OVERDUE_RECEIVABLES: { label: "Cobros vencidos", unit: "pct" },
  DEL_AGING_90: { label: "Vencido a más de 90 días", unit: "pct" },
  CON_HHI_CUSTOMERS: { label: "Concentración de clientes (HHI)", unit: "hhi" },
  CON_HHI_SUPPLIERS: { label: "Concentración de proveedores (HHI)", unit: "hhi" },
  CON_CUSTOMER_CHURN: { label: "Rotación de clientes", unit: "pct" },
  TAX_REGULARITY: { label: "Regularidad fiscal", unit: "pct" },
  MOMENTUM: { label: "Momentum", unit: "ratio" },
};

const NUM0 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const NUM1 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const NUM2 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function indicatorLabel(id: string): string {
  return INDICATOR_LABELS[id]?.label ?? id;
}

export function formatIndicatorValue(id: string, value: number | null): string {
  if (value === null) return "—";
  switch (INDICATOR_LABELS[id]?.unit) {
    case "days":
      return `${NUM0.format(value)} días`;
    case "months":
      return `${NUM1.format(value)} meses`;
    case "pct":
      return `${NUM0.format(value * 100)} %`;
    case "x":
      return `${NUM2.format(value)}x`;
    case "hhi":
      return NUM0.format(value);
    default:
      return NUM2.format(value);
  }
}
```

- [ ] **Step 5: Make four components accept `null`**

`StatusTag.tsx`: change the two signatures and add an early return.
```tsx
export function StatusTag({ status }: { status: Status | null }) {
  if (status === null) return <span className="text-ink-muted">—</span>;
```
```tsx
export function TrendTag({ traj }: { traj: number | null }) {
  if (traj === null) {
    return (
      <span className="inline-flex items-center gap-1 border border-rule px-2 py-0.5 text-sm font-medium whitespace-nowrap text-ink-muted">
        Sin tendencia todavía
      </span>
    );
  }
```
`Meter.tsx`: change `value: number;` to `value: number | null;`, then add as the first line of the function body:
```tsx
  if (value === null) {
    return (
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] font-semibold">{label}</span>
          <span className="text-2xl font-semibold text-ink-muted">—</span>
        </div>
        <div className="mt-2 h-2.5 bg-panel-grid" />
        {hint && <p className="mt-1.5 text-sm text-ink-muted">{hint}</p>}
      </div>
    );
  }
```
`Delta.tsx`: change `value: number` to `value: number | null` and add as the first line of the body:
```tsx
  if (value === null) return <span className={`text-ink-muted ${className}`}>—</span>;
```
`TrendChart.tsx`: make the series nullable and skip a label with no value.
```ts
export interface TrendPoint {
  month: string;
  final: number | null;
  level: number | null;
  trajectory: number | null;
}
```
In `labelOffsets`, replace `-last[s.key] * pxPerPoint` with `-(last[s.key] ?? 50) * pxPerPoint`.
In the `label` render prop, replace `props.index === data.length - 1 ? (` with `props.index === data.length - 1 && data[props.index][s.key] !== null ? (`.

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: errors only in `pages/PortfolioPage.tsx`, `pages/EntityPage.tsx`, `pages/ComparePage.tsx`, `pages/MethodologyPage.tsx` (fixed in Task 6).

- [ ] **Step 7: Commit**

Commit even with page errors: Task 6 fixes them, and the branch is not merged before that.
```bash
git add frontend/src/api frontend/src/mocks frontend/src/lib frontend/src/components
git commit -m "feat(frontend): align api types with the read dtos and accept missing values"
```

---

### Task 6: Portfolio, Entity, Methodology and Compare pages on real data

**Files:**
- Modify: `frontend/src/pages/PortfolioPage.tsx`, `EntityPage.tsx`, `MethodologyPage.tsx`, `ComparePage.tsx`

- [ ] **Step 1: Portfolio page**

In `PortfolioPage.tsx`:
1. Import `confidenceLabel` from `../lib/format` (remove `CONFIDENCE_LABELS` from that import if it becomes unused).
2. The filter: `filter.statuses.includes(r.status)` → `r.status !== null && filter.statuses.includes(r.status)`. Do the same in the six-questions counter (`data.rows.filter((r) => q.statuses.includes(r.status))`).
3. The sort: replace `(a, b) => dir * (a[sort.key] - b[sort.key])` with a null-last comparator:
```ts
    return [...filtered].sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return dir * (x - y);
    });
```
4. In `Row`: `formatScore(row.traj)` → `row.traj === null ? "—" : formatScore(row.traj)`, and `CONFIDENCE_LABELS[row.confidence]` → `confidenceLabel(row.confidence)`.
5. In the "Distribución por banda" film meta, show the unscored count: `` `${data.rows.length} entidades · ${monthCode(month)}${data.unscored > 0 ? ` · ${data.unscored} sin actividad todavía` : ""}` ``.

- [ ] **Step 2: Entity page, header and null row**

In `EntityPage.tsx`:
1. Import `PendingFilm`, `confidenceLabel`, `formatIndicatorValue`, `indicatorLabel`, `bandOf`, and the types `Change`, `IndicatorRow`, `PortfolioRow`.
2. After `const { row } = data;`, add the no-score case:
```tsx
  if (row === null) {
    return (
      <div className="grid gap-12">
        <PageHeader title={data.name} lede={`${data.entityType === "GROUP" ? "Grupo" : "Empresa"} ${data.id}.`} />
        <Film title="Sin puntuación" meta={monthCode(month)}>
          <p className="text-ink-muted">Esta entidad no tiene actividad suficiente en {monthCode(month)}. Elige un mes posterior.</p>
        </Film>
        <Indicators indicators={data.indicators} />
      </div>
    );
  }
```
3. Header lede: `confianza ${confidenceLabel(row.confidence).toLowerCase()}`, plus `${data.groupId ? ` · grupo ${data.groupId}` : ""}`.
4. `<ScoreReadout ... delta={row.delta3m ?? 0} ...>`. The readout shows a flat change when there is no score 3 months before.
5. Regime badge: `{row.regime !== null && row.regime !== "STABLE" && (...)}`. Confidence badge text: `Confianza {confidenceLabel(row.confidence).toLowerCase()}`.
6. The trend chart gets only scored months, with the changepoints known at this month in the film meta:
```tsx
          <TrendChart
            data={data.timeline
              .filter((p) => p.final !== null)
              .map((p) => ({ month: p.month, final: p.final, level: p.level, trajectory: p.traj }))}
            activeMonth={month}
            height={300}
          />
```
Change the `Film` meta of "Radiografía" to `` `Perfil activo · ${monthCode(month)}${data.changepoints.some((c) => c.series === "FINAL") ? ` · cambio detectado en ${monthCode(data.changepoints.filter((c) => c.series === "FINAL").at(-1)!.month)}` : ""}` ``.

- [ ] **Step 3: Entity page, drivers, changes, indicators, companies, product panel**

1. `weighted()` filters on the effective weight: `categories.filter((c) => c.effectiveWeight > 0)`.
2. `Categories`: `bandOf(c.level ?? 0)`, show `c.level === null ? "—" : formatScore(c.level)`, and the bar width `${c.level ?? 0}%`. Fade a category with `c.effectiveWeight === 0` (instead of `c.weight === 0`).
3. Replace the `Changes` component and its call. The call becomes `<Changes changes={data.changes3m} against={against} />`:
```tsx
function Changes({ changes, against }: { changes: Change[]; against: string }) {
  return (
    <Film title="Qué cambió" meta={`Frente a ${against}`}>
      {changes.length === 0 ? (
        <p className="text-ink-muted">Ningún indicador movió la nota más de 0,1 puntos, o las explicaciones no están calculadas todavía.</p>
      ) : (
        <ul className="grid gap-4">
          {changes.map((c) => (
            <li key={c.driverId} className="flex items-start justify-between gap-4 border-b border-dashed border-rule pb-3 last:border-b-0">
              <span>
                <span className="block font-semibold">{indicatorLabel(c.driverId)}</span>
                <span className="text-[15px] text-ink-muted">{c.narrative}</span>
              </span>
              <Delta value={c.delta} className="text-lg" />
            </li>
          ))}
        </ul>
      )}
    </Film>
  );
}
```
4. Add the indicator table, rendered after `<Categories ... />`:
```tsx
function Indicators({ indicators }: { indicators: IndicatorRow[] }) {
  return (
    <Film title="Indicadores" meta="Valor real · nivel 0–100 · trayectoria (50 = estable)">
      <div className="-mx-5 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-[15px]">
          <thead>
            <tr className="border-b border-ink/20 text-sm text-ink-muted">
              <th className="px-5 py-2 font-medium">Indicador</th>
              <th className="px-2 py-2 font-medium">Valor</th>
              <th className="px-2 py-2 font-medium">Nivel</th>
              <th className="px-2 py-2 font-medium">Trayectoria</th>
              <th className="px-5 py-2 font-medium">Notas</th>
            </tr>
          </thead>
          <tbody>
            {indicators.map((i) => (
              <tr key={i.indicatorId} className={`border-b border-rule last:border-b-0 ${i.available ? "" : "opacity-50"}`}>
                <td className="px-5 py-2">
                  <span className="font-medium">{indicatorLabel(i.indicatorId)}</span>
                  <span className="block text-sm text-ink-muted">{CATEGORY_LABELS[i.category]}</span>
                </td>
                <td className="px-2 py-2">{i.available ? formatIndicatorValue(i.indicatorId, i.value) : "sin datos"}</td>
                <td className="px-2 py-2">{i.level === null ? "—" : formatScore(i.level)}</td>
                <td className="px-2 py-2">{i.traj === null ? "—" : formatScore(i.traj)}</td>
                <td className="px-5 py-2 text-sm text-ink-muted">
                  {[i.isStatic && "foto 2026-09-01", i.fallback && "cálculo alternativo", i.anchorStatus === "pending" && "umbral provisional"]
                    .filter(Boolean)
                    .join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Film>
  );
}
```
5. Add the company drilldown, rendered after `<Indicators ... />` only when `data.companies.length > 0`:
```tsx
function Companies({ companies }: { companies: PortfolioRow[] }) {
  const linkSearch = useLinkSearch();
  return (
    <Film title="Empresas del grupo" meta="Puntuación de cada empresa por separado">
      <ul className="grid gap-2">
        {companies.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-4 border-b border-rule pb-2 last:border-b-0">
            <Link to={`/entity/${c.id}${linkSearch}`} className="font-semibold underline-offset-4 hover:underline">
              {c.id}
            </Link>
            <span className="flex items-center gap-3">
              <StatusTag status={c.status} />
              <span className="text-lg font-semibold" style={{ color: bandOf(c.final).color }}>
                {formatScore(c.final)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Film>
  );
}
```
6. `ProductPanel`: at the start of each profile branch, return a pending film when the product is null:
```tsx
  if (profile === "BANK" && data.limit === null)
    return <PendingFilm title="Límite de circulante" block="bloque 7" items={["Límite recomendado", "Acción del mes", "Diferencial por banda", "Historia del límite"]} />;
  if (profile === "INSURER" && data.premium === null)
    return <PendingFilm title="Prima de seguro de crédito" block="bloque 7" items={["Tasa de prima", "Límite por comprador", "Historia de la prima"]} />;
  if (profile === "FUND" && data.momentum === null)
    return <PendingFilm title="Momentum" block="bloque 7" items={["Posición en el ranking", "Percentil de trayectoria", "Estrella emergente"]} />;
```
Keep the existing branches after these guards. Inside them, TypeScript narrows `limit`, `premium` and `momentum` only if you read them after the guard: use `const limit = data.limit!;` (and the same for `premium`, `momentum`) where the old code destructures them. In the INSURER branch, `bandOf(data.row.final)` needs `data.row!`.

- [ ] **Step 4: Methodology page, weights from the API**

In `MethodologyPage.tsx`, replace the `PendingFilm` "Pesos e indicadores" with the weight tables and the caveats:
```tsx
function Weights() {
  const { profile } = useGlobalParams();
  const { data, error, isPending } = useProfiles();
  if (error || isPending) return <LoadState error={error} title="Pesos por perfil" />;
  const categories = [...new Set(data.profiles.flatMap((p) => Object.keys(p.weights)))] as Category[];
  return (
    <Film title="Pesos por perfil" meta={data.source === "run" ? "Pesos con los que se calcularon las notas" : "Pesos de la configuración"}>
      <div className="-mx-5 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left text-[15px]">
          <thead>
            <tr className="border-b border-ink/20 text-sm text-ink-muted">
              <th className="px-5 py-2 font-medium">Categoría</th>
              {data.profiles.map((p) => (
                <th key={p.profile} className={`px-2 py-2 font-medium ${p.profile === profile ? "text-ink" : ""}`}>
                  {PROFILE_LABELS[p.profile as Profile]?.name ?? p.profile}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c} className="border-b border-rule">
                <td className="px-5 py-2">{CATEGORY_LABELS[c]}</td>
                {data.profiles.map((p) => (
                  <td key={p.profile} className={`px-2 py-2 ${p.profile === profile ? "font-semibold" : "text-ink-muted"}`}>
                    {p.weights[c] ?? 0}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="px-5 py-2 text-ink-muted">λ (peso del nivel frente a la trayectoria)</td>
              {data.profiles.map((p) => (
                <td key={p.profile} className="px-2 py-2">{p.lambda}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </Film>
  );
}

function Caveats() {
  const { data } = useMeta();
  if (!data) return null;
  return (
    <Film title="Limitaciones de los datos" meta="Lo que este modelo no puede ver">
      <ul className="grid gap-2 text-[15px]">
        {data.caveats.map((c) => (
          <li key={c} className="border-t border-dashed border-rule pt-2">{c}</li>
        ))}
      </ul>
    </Film>
  );
}
```
Render `<Weights />` and `<Caveats />` where the `PendingFilm` was. Add a new `PendingFilm` with `block="bloque 8"` and `items={["Anticipación medida (lead time)", "Tasa de falsas alarmas"]}`. Import `useMeta` and `useProfiles` from `../api/queries`, `LoadState` from `../components/LoadState`, `PROFILE_LABELS` and `CATEGORY_LABELS` from `../lib/format`, `type Category` from `../api/types` and `type Profile` from `../hooks/useGlobalParams`. Change the page lede to: `"Cómo leer cada número de X-Ray: bandas, dirección, pesos por perfil y limitaciones."`

- [ ] **Step 5: Compare page, compile only**

Compare is Block 8. Only make it compile with the smallest guards:
1. Where the page reads `entity.row` or `a.row` / `b.row`, return `<LoadState error={new Error("Sin puntuación en este mes")} />` when the row is null, before the first use.
2. Use `a.row.traj ?? 50` and `b.row.traj ?? 50` in the comparison text (lines about 148–153), `delta={entity.row.delta3m ?? 0}` for the readout, and `.filter((p) => p.final !== null)` before the overlay chart `map`.

- [ ] **Step 6: Build and look**

Run:
```bash
cd frontend && npm run typecheck && npm run lint && npm run build
VITE_API_TARGET=http://localhost:8081 npx vite --port 5174
```
Expected: typecheck, lint and build exit with 0. With the fixture applied and the backend on 8081, open `http://localhost:5174/`:
1. The ranking shows 248 groups. Switch BANK → FUND: the order changes.
2. Click a group: the Entity page shows the readout, the trend chart, "Por qué esta puntuación", "Qué cambió" with fixture narratives, "Indicadores" with 22 rows, and the pending product panel.
3. Set the month to 2024-10: groups not active yet show "Sin puntuación".
4. `/methodology`: three weight columns (source "configuración" before plan B), λ row, 5 caveats.
5. `npm run dev:mock` still works (mock mode).
Also check the page at 375 px width (browser dev tools): no horizontal page scroll outside the tables.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages
git commit -m "feat(frontend): show portfolio, entity and methodology on real data"
```

---

### Task 7: Final check and report

**Files:** none.

- [ ] **Step 1: Remove the fixture and run clean**

Stop the backend. Run `rm -f data/xray.duckdb data/xray.duckdb.wal` (worktree root). Start the backend on 8081 and wait for `DONE`.
Run every `curl` of Tasks 2 (Step 6), 3 (Step 4) and 4 (Step 2) again. Expected: the same results. `drivers`, `changes1m`, `changepoints` are empty and `status` is null, because plan B is not merged.

- [ ] **Step 2: Check the paths you changed**

Run: `git diff --stat main...HEAD`
Expected: only `backend/src/main/java/com/xray/application/**`, `backend/src/main/java/com/xray/infrastructure/web/**` and `frontend/**`. No file under `backend/src/test/`. Read the diff of `frontend/src/pages` and `application/` once more: no profile weight and no λ value is written in them (the mock generator keeps its own synthetic values).

- [ ] **Step 3: Report**

Report: the endpoints and their response times at M23, the page checks of Task 6 Step 6, and anything in the contract that did not match the data.
