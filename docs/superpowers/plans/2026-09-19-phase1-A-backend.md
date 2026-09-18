# Phase 1 · Plan A — Backend Foundation Implementation Plan

> **For agentic workers:** Claude Code: use superpowers:executing-plans (or superpowers:subagent-driven-development) to run this plan task by task. Antigravity or other agents: do the checkboxes in order. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Spring Boot app in `backend/` that boots on DuckDB, binds and validates the full `scoring-config.yml`, and runs an async pipeline of two no-op stages with status and run endpoints.

**Architecture:** Replace the template (JPA + Postgres, package `com.hackspain.api`) with the layout of `docs/ARCHITECTURE.md §3`. DuckDB is embedded through a small `DataSource` that duplicates one root connection per request. The pipeline is an ordered list of `PipelineStage` beans that runs on a single-thread executor. Its state is held in memory and each finished run is written to `pipeline_runs`.

**Tech Stack:** Java 21 (Temurin, pinned in `mise.toml`), Spring Boot 3.5.x, Maven wrapper, `org.duckdb:duckdb_jdbc`, `spring-boot-starter-jdbc`, springdoc-openapi 2.8.x, JUnit 5.

**Spec:** `docs/XRAY_APP_SPEC.md` (plan B renames it to `docs/SPEC.md`; read whichever exists) §9, §12.2. `docs/ARCHITECTURE.md` §0, §3, §4.1, §5, §6, §10. Overview and shared contract: `docs/superpowers/plans/2026-09-19-phase1-overview.md`.

## Global Constraints

- Edit only `app/backend/**` (moved to `backend/**`). All other paths belong to plan B.
- Java 21. If `java -version` is not 21, run Maven as `mise exec java@temurin-21 -- ./mvnw ...`.
- Spring Boot **3.x** (CLAUDE.md stack). Use the newest `3.5.*` GA patch. No SNAPSHOT, RC or milestone.
- No JPA, no Postgres, no H2, no Lombok, no Smile.
- `domain/` imports nothing from `org.springframework` or `java.sql`.
- Every threshold, anchor, weight and λ lives in `scoring-config.yml`. Never hardcode a weight.
- Only the six tests in `CLAUDE.md` may exist. Phase 1 adds one: `ScoringConfigValidationTest`. Delete the template tests.
- Commits: Conventional Commits, English, lowercase subject.
- Shared contract items 1, 3, 4, 5, 7, 8 of the overview apply exactly: port 8080, `xray.data-dir` / `XRAY_DATA_DIR` default `../data`, `xray.demo-mode` / `XRAY_DEMO_MODE`, boot with no CSVs, glibc Docker base, and the JSON shapes of `/api/pipeline/status` and `/api/pipeline/run`.

## File Structure

```
backend/
  pom.xml                                       rewritten
  Dockerfile                                    glibc base, /data volume
  src/main/resources/
    application.yml                             xray.*, config import, springdoc
    scoring-config.yml                          all 22 indicators, 3 profiles
  src/main/java/com/xray/
    XRayApplication.java
    config/
      XRayProperties.java                       xray.data-dir, xray.demo-mode
      ScoringConfig.java                        root record + small nested records
      IndicatorConfig.java
      ProfileConfig.java
      LimitEngineConfig.java
      ScoringConfigValidator.java               fail-fast checks
      DuckDbConfig.java                         DataSource bean
    domain/model/
      EntityType.java  Category.java  IndicatorId.java  Profile.java
      FlowClass.java   AnchorStatus.java
    pipeline/
      PipelineStage.java  PipelineContext.java  ProgressSink.java
      PipelineStatus.java  PipelineRunner.java  PipelineStartupTrigger.java
      stages/S00_Ingest.java  stages/S10_Staging.java
    infrastructure/duckdb/
      DuckDbDataSource.java  SqlRunner.java  DuckDbSqlRunner.java
      PipelineRunRepository.java
    infrastructure/web/controller/
      PipelineController.java
  src/test/java/com/xray/config/
    ScoringConfigValidationTest.java
```

---

### Task 1: Move the template and reshape the Maven project

**Files:**
- Move: `app/backend/` → `backend/`
- Delete: `backend/src/main/java/com/hackspain/**`, `backend/src/test/java/com/hackspain/**`, `backend/src/test/resources/application.yml`, `backend/src/main/resources/application-demo.yml`
- Modify: `backend/pom.xml`
- Create: `backend/src/main/java/com/xray/XRayApplication.java`, `backend/src/main/resources/application.yml`

**Interfaces:**
- Produces: a compiling Spring Boot 3.5 project with root package `com.xray`.

- [ ] **Step 1: Move the folder and delete the template code**

```bash
git mv app/backend backend
git rm -r -q backend/src/main/java/com/hackspain backend/src/test/java/com/hackspain \
  backend/src/test/resources/application.yml backend/src/main/resources/application-demo.yml
```

- [ ] **Step 2: Find the current stable versions**

```bash
curl -s https://repo1.maven.org/maven2/org/springframework/boot/spring-boot-starter-parent/maven-metadata.xml | grep -o '<version>3\.5\.[0-9]*</version>' | tail -1
curl -s https://repo1.maven.org/maven2/org/duckdb/duckdb_jdbc/maven-metadata.xml | grep -o '<release>[^<]*' 
curl -s https://repo1.maven.org/maven2/org/springdoc/springdoc-openapi-starter-webmvc-ui/maven-metadata.xml | grep -o '<version>2\.8\.[0-9]*</version>' | tail -1
```

Use these three values in Step 3. Write them in the commit body.

- [ ] **Step 3: Replace `backend/pom.xml`**

Replace `3.5.X`, `DUCKDB_VERSION` and `2.8.X` with the values from Step 2.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.5.X</version>
        <relativePath/>
    </parent>
    <groupId>com.xray</groupId>
    <artifactId>xray-backend</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <name>xray-backend</name>
    <description>X-Ray financial health scoring engine (HackSpain 2026, Embat)</description>
    <properties>
        <java.version>21</java.version>
        <duckdb.version>DUCKDB_VERSION</duckdb.version>
        <springdoc.version>2.8.X</springdoc.version>
    </properties>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-jdbc</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-actuator</artifactId>
        </dependency>
        <dependency>
            <groupId>org.duckdb</groupId>
            <artifactId>duckdb_jdbc</artifactId>
            <version>${duckdb.version}</version>
        </dependency>
        <dependency>
            <groupId>org.springdoc</groupId>
            <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
            <version>${springdoc.version}</version>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-configuration-processor</artifactId>
            <optional>true</optional>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>
    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
```

- [ ] **Step 4: Create `XRayApplication.java`**

```java
package com.xray;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class XRayApplication {
    public static void main(String[] args) {
        SpringApplication.run(XRayApplication.class, args);
    }
}
```

- [ ] **Step 5: Replace `backend/src/main/resources/application.yml`**

```yaml
spring:
  application:
    name: xray
  config:
    import: classpath:scoring-config.yml
  jackson:
    default-property-inclusion: always

server:
  port: ${SERVER_PORT:8080}

xray:
  data-dir: ${XRAY_DATA_DIR:../data}
  demo-mode: ${XRAY_DEMO_MODE:false}

management:
  endpoints:
    web:
      exposure:
        include: health,info

springdoc:
  swagger-ui:
    path: /swagger-ui.html

logging:
  level:
    com.xray: DEBUG
```

`default-property-inclusion: always` keeps `null` fields in JSON, so `runId: null` is present as the contract says.

- [ ] **Step 6: Compile**

Run: `cd backend && ./mvnw -q -DskipTests compile`
Expected: no output and exit code 0. Do not boot the app yet: `scoring-config.yml` comes in Task 2.

- [ ] **Step 7: Commit**

```bash
git add -A backend app/backend
git commit -m "build(backend): move template to backend and switch to duckdb stack"
```

---

### Task 2: Domain enums, full `scoring-config.yml`, typed binding and validation

**Files:**
- Create: `backend/src/main/java/com/xray/domain/model/{EntityType,Category,IndicatorId,Profile,FlowClass,AnchorStatus}.java`
- Create: `backend/src/main/java/com/xray/config/{ScoringConfig,IndicatorConfig,ProfileConfig,LimitEngineConfig,ScoringConfigValidator}.java`
- Create: `backend/src/main/resources/scoring-config.yml`
- Test: `backend/src/test/java/com/xray/config/ScoringConfigValidationTest.java`

**Interfaces:**
- Consumes: Task 1 project.
- Produces: `ScoringConfig` bean (prefix `scoring`) with accessors `unit()`, `indicators()`, `profiles()`, and the other fields below. `ScoringConfigValidator.validate(Map<IndicatorId, IndicatorConfig>, Map<Profile, ProfileConfig>)` throws `IllegalStateException` whose message names the offending key.

- [ ] **Step 1: Create the domain enums**

`EntityType.java`
```java
package com.xray.domain.model;

public enum EntityType { GROUP, COMPANY }
```

`Category.java`
```java
package com.xray.domain.model;

public enum Category {
    LIQUIDITY, OPERATING_CASH_FLOW, ACTIVITY_GROWTH, DEBT_SERVICE, LEVERAGE,
    PAYMENT_BEHAVIOUR, DELINQUENCY, CONCENTRATION, TAX_REGULARITY, MOMENTUM
}
```

`IndicatorId.java`
```java
package com.xray.domain.model;

/** The 22 level indicators of SPEC §6. MOM_PERSISTENCE is a derived feature, not listed here. */
public enum IndicatorId {
    LIQ_RUNWAY, LIQ_BUFFER, LIQ_MIN_BALANCE,
    CF_NOCF_MARGIN, CF_VOLATILITY, CF_IN_OUT_RATIO,
    ACT_COLLECTIONS_GROWTH,
    DEBT_DSCR, DEBT_LINE_UTIL,
    LEV_DEBT_TO_CF, LEV_FACTORING_RELIANCE, LEV_FUNDING_COST,
    PAY_DSO, PAY_DPO, PAY_SUPPLIER_LATENESS, PAY_OVERDUE_PAYABLES,
    DEL_OVERDUE_RECEIVABLES, DEL_AGING_90,
    CON_HHI_CUSTOMERS, CON_HHI_SUPPLIERS, CON_CUSTOMER_CHURN,
    TAX_REGULARITY
}
```

`Profile.java`
```java
package com.xray.domain.model;

public enum Profile { BANK, FUND, INSURER }
```

`FlowClass.java`
```java
package com.xray.domain.model;

public enum FlowClass { OPERATING_IN, OPERATING_OUT, TAX, DEBT_SERVICE, FINANCING_IN, INTERNAL, OTHER }
```

`AnchorStatus.java`
```java
package com.xray.domain.model;

public enum AnchorStatus { CLOSED, PENDING }
```

- [ ] **Step 2: Write the failing test**

`ScoringConfigValidationTest.java`
```java
package com.xray.config;

import com.xray.domain.model.Category;
import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.Profile;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.ConfigurationPropertySources;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.io.ClassPathResource;

import java.io.IOException;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class ScoringConfigValidationTest {

    private static ScoringConfig base;

    @BeforeAll
    static void loadShippedConfig() throws IOException {
        var sources = new YamlPropertySourceLoader()
                .load("scoring-config", new ClassPathResource("scoring-config.yml"));
        base = new Binder(ConfigurationPropertySources.from(sources))
                .bind("scoring", ScoringConfig.class).get();
    }

    @Test
    void shippedConfigBindsEveryIndicatorAndProfile() {
        assertEquals(IndicatorId.values().length, base.indicators().size());
        assertEquals(Profile.values().length, base.profiles().size());
        assertEquals(100.0, base.debtDscr().noDebtLevel());
    }

    @Test
    void emptyAnchorsFail() {
        var ind = new EnumMap<>(base.indicators());
        var cf = ind.get(IndicatorId.CF_VOLATILITY);
        ind.put(IndicatorId.CF_VOLATILITY,
                new IndicatorConfig(cf.category(), cf.method(), cf.status(), cf.source(), List.of()));
        var ex = assertThrows(IllegalStateException.class, () -> copyWith(ind, base.profiles()));
        assertTrue(ex.getMessage().contains("CF_VOLATILITY"), ex.getMessage());
    }

    @Test
    void nonMonotonicAnchorsFail() {
        var ind = new EnumMap<>(base.indicators());
        var lr = ind.get(IndicatorId.LIQ_RUNWAY);
        ind.put(IndicatorId.LIQ_RUNWAY, new IndicatorConfig(lr.category(), lr.method(), lr.status(), lr.source(),
                List.of(List.of(0.0, 0.0), List.of(3.0, 50.0), List.of(1.0, 20.0))));
        var ex = assertThrows(IllegalStateException.class, () -> copyWith(ind, base.profiles()));
        assertTrue(ex.getMessage().contains("LIQ_RUNWAY"), ex.getMessage());
    }

    @Test
    void missingIndicatorFails() {
        var ind = new EnumMap<>(base.indicators());
        ind.remove(IndicatorId.TAX_REGULARITY);
        var ex = assertThrows(IllegalStateException.class, () -> copyWith(ind, base.profiles()));
        assertTrue(ex.getMessage().contains("TAX_REGULARITY"), ex.getMessage());
    }

    @Test
    void weightsNotSummingTo100Fail() {
        var prof = new EnumMap<>(base.profiles());
        var bank = prof.get(Profile.BANK);
        var w = new EnumMap<>(bank.weights());
        w.put(Category.DEBT_SERVICE, 30.0);
        prof.put(Profile.BANK, new ProfileConfig(bank.lambda(), w));
        var ex = assertThrows(IllegalStateException.class, () -> copyWith(base.indicators(), prof));
        assertTrue(ex.getMessage().contains("BANK"), ex.getMessage());
    }

    private static ScoringConfig copyWith(Map<IndicatorId, IndicatorConfig> ind, Map<Profile, ProfileConfig> prof) {
        return new ScoringConfig(base.unit(), base.months(), base.cashProductTypes(), base.semiLiquidTypes(),
                base.bookedStatusValues(), base.runwayCapMonths(), base.trajectory(), base.flowClasses(),
                base.defaultFlowClass(), base.otherSignFallback(), ind, prof, base.regimes(), base.bands(),
                base.limitEngine(), base.insurer(), base.debtDscr());
    }
}
```

- [ ] **Step 3: Run the test to see it fail**

Run: `cd backend && ./mvnw -q test -Dtest=ScoringConfigValidationTest`
Expected: compilation FAIL, `cannot find symbol ... ScoringConfig`.

- [ ] **Step 4: Create the config records**

`IndicatorConfig.java`
```java
package com.xray.config;

import com.xray.domain.model.AnchorStatus;
import com.xray.domain.model.Category;

import java.util.List;

/** One indicator of SPEC §6. anchors = sorted [x, score] pairs, score in [0,100]. */
public record IndicatorConfig(
        Category category,
        String method,
        AnchorStatus status,
        String source,
        List<List<Double>> anchors) {
}
```

`ProfileConfig.java`
```java
package com.xray.config;

import com.xray.domain.model.Category;

import java.util.Map;

/** lambda = level share of the blend; weights sum to 100 (validated at boot). */
public record ProfileConfig(double lambda, Map<Category, Double> weights) {
}
```

`LimitEngineConfig.java`
```java
package com.xray.config;

import java.util.Map;

/** SPEC §10.1. A band missing from spreadBpsByBand means DECLINE. */
public record LimitEngineConfig(
        String base,
        double scoreFloor,
        double factorAtFloor,
        double factorAt100,
        double trendModifierSpan,
        RunwayGuard runwayGuard,
        double dscrMin,
        int defaultTermMonths,
        double referenceRate,
        Map<String, Integer> spreadBpsByBand,
        double actionThreshold) {

    public record RunwayGuard(double belowMonths, double multiplier) {
    }
}
```

`ScoringConfig.java`
```java
package com.xray.config;

import com.xray.domain.model.EntityType;
import com.xray.domain.model.FlowClass;
import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.Profile;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;
import java.util.Map;

/** Binds scoring-config.yml. The compact constructor validates, so a bad config stops the boot. */
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
        FlowClass defaultFlowClass,
        boolean otherSignFallback,
        Map<IndicatorId, IndicatorConfig> indicators,
        Map<Profile, ProfileConfig> profiles,
        RegimeConfig regimes,
        BandConfig bands,
        LimitEngineConfig limitEngine,
        InsurerConfig insurer,
        DebtDscrConfig debtDscr) {

    public ScoringConfig {
        ScoringConfigValidator.validate(indicators, profiles);
    }

    public record MonthRange(String start, String end) {
    }

    public record TrajectoryConfig(int smoothingWindow, int slopeWindow, int minPoints,
                                   double slopeToScoreSpan, double slopeWeight, double deltaWeight) {
    }

    public record RegimeConfig(double cusumK, double cusumH, int persistenceMonths,
                               double slopeThreshold, double dipZ, int dipMaxMonths) {
    }

    /** Lower bounds of bands A..D. Below d is band E. */
    public record BandConfig(double a, double b, double c, double d) {
    }

    /** A band missing from multiplierByBand means not insurable. */
    public record InsurerConfig(double basePremiumRate, Map<String, Double> multiplierByBand) {
    }

    /** DEBT_DSCR level when the entity has no debt service (CLAUDE.md resolved conflict 7). */
    public record DebtDscrConfig(double noDebtLevel) {
    }
}
```

`ScoringConfigValidator.java`
```java
package com.xray.config;

import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.Profile;

import java.util.List;
import java.util.Map;

/** Fail-fast checks of ARCHITECTURE §6. Every message names the offending key. */
final class ScoringConfigValidator {

    private ScoringConfigValidator() {
    }

    static void validate(Map<IndicatorId, IndicatorConfig> indicators, Map<Profile, ProfileConfig> profiles) {
        if (indicators == null) {
            throw fail("scoring.indicators is missing");
        }
        for (IndicatorId id : IndicatorId.values()) {
            IndicatorConfig ic = indicators.get(id);
            String key = "scoring.indicators." + id;
            if (ic == null) {
                throw fail(key + " is missing");
            }
            if (ic.category() == null) {
                throw fail(key + ".category is missing");
            }
            List<List<Double>> a = ic.anchors();
            if (a == null || a.size() < 2) {
                throw fail(key + ".anchors needs at least 2 points");
            }
            for (int i = 0; i < a.size(); i++) {
                List<Double> p = a.get(i);
                if (p == null || p.size() != 2) {
                    throw fail(key + ".anchors[" + i + "] must be [x, score]");
                }
                if (p.get(1) < 0 || p.get(1) > 100) {
                    throw fail(key + ".anchors[" + i + "] score " + p.get(1) + " is outside [0, 100]");
                }
                if (i > 0 && p.get(0) <= a.get(i - 1).get(0)) {
                    throw fail(key + ".anchors[" + i + "] x " + p.get(0) + " is not strictly increasing");
                }
            }
        }
        if (profiles == null) {
            throw fail("scoring.profiles is missing");
        }
        for (Profile p : Profile.values()) {
            ProfileConfig pc = profiles.get(p);
            String key = "scoring.profiles." + p;
            if (pc == null || pc.weights() == null) {
                throw fail(key + " is missing");
            }
            double sum = pc.weights().values().stream().mapToDouble(Double::doubleValue).sum();
            if (Math.abs(sum - 100.0) > 0.01) {
                throw fail(key + ".weights sum to " + sum + ", expected 100");
            }
            if (pc.lambda() < 0 || pc.lambda() > 1) {
                throw fail(key + ".lambda " + pc.lambda() + " is outside [0, 1]");
            }
        }
    }

    private static IllegalStateException fail(String message) {
        return new IllegalStateException("Invalid scoring config: " + message);
    }
}
```

- [ ] **Step 5: Create `scoring-config.yml`**

Keys use kebab-case. Map keys have no leading underscore, because Spring drops that character from map keys. Pending anchors are the provisional placeholders of CLAUDE.md, resolved conflict 4.

```yaml
# The only place where thresholds, anchors, weights and lambda live (SPEC §9).
# Pending anchors are provisional; see docs/THRESHOLDS.md.
scoring:
  unit: GROUP                       # GROUP | COMPANY — confirm with Embat
  months: { start: "2024-09", end: "2026-08" }
  cash-product-types: [checking, saving, tpv, expensesPlatform]
  semi-liquid-types: [investment]
  booked-status-values: [booked]    # confirm in profiling (SPEC §4.3)
  runway-cap-months: 24
  trajectory:
    smoothing-window: 3
    slope-window: 6
    min-points: 4
    slope-to-score-span: 5.0
    slope-weight: 0.7
    delta-weight: 0.3

  # Category names are GUESSES until profiling (SPEC §4.1). Replace after block 2.
  flow-classes:
    collection: OPERATING_IN
    supplier: OPERATING_OUT
    payroll: OPERATING_OUT
    utility: OPERATING_OUT
    rent: OPERATING_OUT
    tax: TAX
    loan: DEBT_SERVICE
    interest: DEBT_SERVICE
    leasing: DEBT_SERVICE
    transfer: INTERNAL
    financing: FINANCING_IN
    factoring: FINANCING_IN
  default-flow-class: OTHER
  other-sign-fallback: true

  indicators:
    LIQ_RUNWAY:             { category: LIQUIDITY, method: anchors, status: closed, source: "runway literature", anchors: [[0,0],[1,20],[3,50],[6,75],[12,100]] }
    LIQ_BUFFER:             { category: LIQUIDITY, method: anchors, status: closed, source: "coverage literature", anchors: [[0,0],[0.5,30],[1,60],[2,85],[3,100]] }
    LIQ_MIN_BALANCE:        { category: LIQUIDITY, method: anchors, status: pending, source: "natural zero (overdraft <= 25) + quantiles (provisional)", anchors: [[-1,0],[0,25],[0.5,60],[1,80],[2,100]] }
    CF_NOCF_MARGIN:         { category: OPERATING_CASH_FLOW, method: anchors, status: pending, source: "natural zero + quantiles (provisional)", anchors: [[-0.2,0],[-0.0001,35],[0,45],[0.1,75],[0.2,100]] }
    CF_VOLATILITY:          { category: OPERATING_CASH_FLOW, method: anchors, status: pending, source: "quantiles only (provisional)", anchors: [[0.1,100],[0.3,70],[0.6,40],[1.0,15],[2.0,0]] }
    CF_IN_OUT_RATIO:        { category: OPERATING_CASH_FLOW, method: anchors, status: closed, source: "coverage literature", anchors: [[0.8,10],[1.0,50],[1.2,80],[1.5,100]] }
    ACT_COLLECTIONS_GROWTH: { category: ACTIVITY_GROWTH, method: anchors, status: pending, source: "natural zero (0% -> 50), symmetric + quantiles (provisional)", anchors: [[-0.3,0],[-0.15,25],[0,50],[0.15,75],[0.3,100]] }
    DEBT_DSCR:              { category: DEBT_SERVICE, method: anchors, status: closed, source: "bank covenant 1.25x", anchors: [[0.8,0],[1.0,30],[1.25,60],[2.0,85],[3.0,100]] }
    DEBT_LINE_UTIL:         { category: DEBT_SERVICE, method: anchors, status: closed, source: "credit line practice", anchors: [[0.5,100],[0.8,50],[1.0,0]] }
    LEV_DEBT_TO_CF:         { category: LEVERAGE, method: anchors, status: closed, source: "Debt/EBITDA practice", anchors: [[0,100],[1,90],[3,65],[5,40],[8,0]] }
    LEV_FACTORING_RELIANCE: { category: LEVERAGE, method: anchors, status: pending, source: "natural zero (0% -> 100) + quantiles (provisional)", anchors: [[0,100],[0.2,70],[0.4,45],[0.7,15],[1.0,0]] }
    LEV_FUNDING_COST:       { category: LEVERAGE, method: anchors, status: pending, source: "spread over reference-rate (provisional)", anchors: [[0,100],[0.01,85],[0.025,60],[0.05,30],[0.08,0]] }
    PAY_DSO:                { category: PAYMENT_BEHAVIOUR, method: anchors, status: closed, source: "DSO practice", anchors: [[30,100],[60,70],[90,40],[150,0]] }
    PAY_DPO:                { category: PAYMENT_BEHAVIOUR, method: anchors, status: pending, source: "legal 60d (Ley 3/2004) + quantiles (provisional)", anchors: [[60,100],[90,60],[120,30],[180,0]] }
    PAY_SUPPLIER_LATENESS:  { category: PAYMENT_BEHAVIOUR, method: anchors, status: closed, source: "lateness practice", anchors: [[0,100],[15,70],[30,45],[60,0]] }
    PAY_OVERDUE_PAYABLES:   { category: PAYMENT_BEHAVIOUR, method: anchors, status: pending, source: "natural zero (0% -> 100) + quantiles (provisional)", anchors: [[0,100],[0.1,75],[0.25,45],[0.5,15],[0.8,0]] }
    DEL_OVERDUE_RECEIVABLES: { category: DELINQUENCY, method: anchors, status: pending, source: "natural zero (0% -> 100) + quantiles (provisional)", anchors: [[0,100],[0.1,75],[0.25,45],[0.5,15],[0.8,0]] }
    DEL_AGING_90:           { category: DELINQUENCY, method: anchors, status: closed, source: "aging practice", anchors: [[0,100],[0.1,70],[0.25,40],[0.5,0]] }
    CON_HHI_CUSTOMERS:      { category: CONCENTRATION, method: anchors, status: closed, source: "DOJ HHI 1000/1800", anchors: [[1000,100],[1800,60],[2500,45],[5000,20],[10000,0]] }
    CON_HHI_SUPPLIERS:      { category: CONCENTRATION, method: anchors, status: closed, source: "DOJ HHI 1000/1800", anchors: [[1000,100],[1800,60],[2500,45],[5000,20],[10000,0]] }
    CON_CUSTOMER_CHURN:     { category: CONCENTRATION, method: anchors, status: pending, source: "quantiles only (provisional)", anchors: [[0.0,100],[0.1,75],[0.25,45],[0.5,15],[0.8,0]] }
    TAX_REGULARITY:         { category: TAX_REGULARITY, method: anchors, status: closed, source: "own cadence", anchors: [[0,0],[0.5,40],[0.8,75],[1.0,100]] }

  profiles:   # provisional weights, external review pending
    BANK:    { lambda: 0.70, weights: { DEBT_SERVICE: 25, LIQUIDITY: 20, OPERATING_CASH_FLOW: 20, PAYMENT_BEHAVIOUR: 7.5, DELINQUENCY: 7.5, LEVERAGE: 10, TAX_REGULARITY: 5, CONCENTRATION: 5 } }
    FUND:    { lambda: 0.50, weights: { ACTIVITY_GROWTH: 30, MOMENTUM: 25, OPERATING_CASH_FLOW: 20, LIQUIDITY: 10, CONCENTRATION: 10, LEVERAGE: 5 } }
    INSURER: { lambda: 0.70, weights: { PAYMENT_BEHAVIOUR: 30, DELINQUENCY: 20, CONCENTRATION: 20, LIQUIDITY: 15, OPERATING_CASH_FLOW: 10, LEVERAGE: 5 } }

  regimes: { cusum-k: 0.5, cusum-h: 4.0, persistence-months: 3, slope-threshold: 1.5, dip-z: -2.0, dip-max-months: 2 }
  bands: { a: 80, b: 65, c: 50, d: 35 }

  limit-engine:
    base: median_operating_in_3m
    score-floor: 35
    factor-at-floor: 0.25
    factor-at100: 1.5
    trend-modifier-span: 0.2
    runway-guard: { below-months: 1.5, multiplier: 0.5 }
    dscr-min: 1.25
    default-term-months: 36
    reference-rate: 0.035           # PENDING placeholder: set the current market rate by hand
    spread-bps-by-band: { A: 150, B: 250, C: 400, D: 650 }   # E missing = DECLINE
    action-threshold: 0.10

  insurer:
    base-premium-rate: 0.0025
    multiplier-by-band: { A: 0.7, B: 1.0, C: 1.5, D: 2.5 }   # E missing = not insurable

  debt-dscr:
    no-debt-level: 100
```

- [ ] **Step 6: Run the test to see it pass**

Run: `cd backend && ./mvnw -q test -Dtest=ScoringConfigValidationTest`
Expected: `Tests run: 5, Failures: 0, Errors: 0`.
If `shippedConfigBindsEveryIndicatorAndProfile` fails on `limitEngine().factorAt100()` binding, change the YAML key to `factor-at-100` and run again. Report which key worked.

- [ ] **Step 7: Commit**

```bash
git add backend
git commit -m "feat(config): bind and validate scoring-config with all 22 indicators"
```

---

### Task 3: DuckDB data source and `SqlRunner`

**Files:**
- Create: `backend/src/main/java/com/xray/config/XRayProperties.java`, `config/DuckDbConfig.java`
- Create: `backend/src/main/java/com/xray/infrastructure/duckdb/{DuckDbDataSource,SqlRunner,DuckDbSqlRunner}.java`

**Interfaces:**
- Produces: `XRayProperties(String dataDir, boolean demoMode)` with `Path dataPath()` and `Path rawPath()`. A `DataSource` bean, a `JdbcTemplate` (Boot auto-config), and `SqlRunner`:
  ```java
  void runScript(String classpathPath, Map<String, String> params);
  <T> List<T> query(String sql, RowMapper<T> mapper, Object... args);
  long count(String table);
  ```

- [ ] **Step 1: Create `XRayProperties.java`**

```java
package com.xray.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.nio.file.Path;

@ConfigurationProperties(prefix = "xray")
public record XRayProperties(
        @DefaultValue("../data") String dataDir,
        @DefaultValue("false") boolean demoMode) {

    public Path dataPath() {
        return Path.of(dataDir).toAbsolutePath().normalize();
    }

    public Path rawPath() {
        return dataPath().resolve("raw");
    }
}
```

- [ ] **Step 2: Create `DuckDbDataSource.java`**

One root connection keeps the database open. Each caller gets a duplicate, so the pipeline thread and request threads never share a JDBC connection.

```java
package com.xray.infrastructure.duckdb;

import org.duckdb.DuckDBConnection;
import org.springframework.jdbc.datasource.AbstractDataSource;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

public class DuckDbDataSource extends AbstractDataSource implements AutoCloseable {

    private final DuckDBConnection root;

    public DuckDbDataSource(String jdbcUrl) throws SQLException {
        try {
            Class.forName("org.duckdb.DuckDBDriver");
        } catch (ClassNotFoundException e) {
            throw new SQLException("DuckDB JDBC driver not on classpath", e);
        }
        this.root = (DuckDBConnection) DriverManager.getConnection(jdbcUrl);
    }

    @Override
    public Connection getConnection() throws SQLException {
        return root.duplicate();
    }

    @Override
    public Connection getConnection(String username, String password) throws SQLException {
        return getConnection();
    }

    @Override
    public void close() throws SQLException {
        root.close();
    }
}
```

- [ ] **Step 3: Create `DuckDbConfig.java`**

```java
package com.xray.config;

import com.xray.infrastructure.duckdb.DuckDbDataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.SQLException;

@Configuration
public class DuckDbConfig {

    @Bean(destroyMethod = "close")
    public DuckDbDataSource dataSource(XRayProperties props) throws IOException, SQLException {
        Path dir = props.dataPath();
        Files.createDirectories(dir);
        return new DuckDbDataSource("jdbc:duckdb:" + dir.resolve("xray.duckdb"));
    }
}
```

- [ ] **Step 4: Create `SqlRunner.java` and `DuckDbSqlRunner.java`**

```java
package com.xray.infrastructure.duckdb;

import org.springframework.jdbc.core.RowMapper;

import java.util.List;
import java.util.Map;

/** Runs classpath SQL files with ${placeholder} substitution (ARCHITECTURE §5). */
public interface SqlRunner {
    void runScript(String classpathPath, Map<String, String> params);

    <T> List<T> query(String sql, RowMapper<T> mapper, Object... args);

    long count(String table);
}
```

```java
package com.xray.infrastructure.duckdb;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

@Component
public class DuckDbSqlRunner implements SqlRunner {

    private static final Logger log = LoggerFactory.getLogger(DuckDbSqlRunner.class);
    private static final Pattern STATEMENT_END = Pattern.compile(";\\s*(\\r?\\n|$)");
    private static final Pattern TABLE_NAME = Pattern.compile("[A-Za-z_][A-Za-z0-9_]*");

    private final JdbcTemplate jdbc;

    public DuckDbSqlRunner(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void runScript(String classpathPath, Map<String, String> params) {
        String sql = load(classpathPath);
        for (var e : params.entrySet()) {
            sql = sql.replace("${" + e.getKey() + "}", e.getValue());
        }
        if (sql.contains("${")) {
            throw new IllegalArgumentException("Unresolved placeholder in " + classpathPath);
        }
        for (String statement : STATEMENT_END.split(sql)) {
            if (!statement.isBlank()) {
                jdbc.execute(statement);
            }
        }
        log.debug("ran {}", classpathPath);
    }

    @Override
    public <T> List<T> query(String sql, RowMapper<T> mapper, Object... args) {
        return jdbc.query(sql, mapper, args);
    }

    @Override
    public long count(String table) {
        if (!TABLE_NAME.matcher(table).matches()) {
            throw new IllegalArgumentException("Bad table name: " + table);
        }
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Long.class);
        return n == null ? 0 : n;
    }

    private static String load(String classpathPath) {
        try (var in = new ClassPathResource(classpathPath).getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read " + classpathPath, e);
        }
    }
}
```

- [ ] **Step 5: Boot and check that DuckDB opens**

Run: `cd backend && timeout 60 ./mvnw -q spring-boot:run` in the background, wait for `Started XRayApplication`, then:
```bash
curl -s localhost:8080/actuator/health
ls ../data/xray.duckdb
```
Expected: `{"status":"UP",...}` and the file exists. Stop the app.

- [ ] **Step 6: Commit**

```bash
git add backend
git commit -m "feat(duckdb): add embedded duckdb data source and sql runner"
```

---

### Task 4: Pipeline runner, two no-op stages, status and run endpoints

**Files:**
- Create: `backend/src/main/java/com/xray/pipeline/{PipelineStage,ProgressSink,PipelineContext,PipelineStatus,PipelineRunner,PipelineStartupTrigger}.java`
- Create: `backend/src/main/java/com/xray/pipeline/stages/{S00_Ingest,S10_Staging}.java`
- Create: `backend/src/main/java/com/xray/infrastructure/duckdb/PipelineRunRepository.java`
- Create: `backend/src/main/java/com/xray/infrastructure/web/controller/PipelineController.java`

**Interfaces:**
- Consumes: `SqlRunner`, `ScoringConfig`, `XRayProperties`, `JdbcTemplate` from Tasks 2–3.
- Produces: `PipelineStage { String id(); void execute(PipelineContext ctx); }` (extension point #1). `PipelineContext` with `sql()`, `config()`, `runId()`, `unit()`, `report(String stageId, int pct, String message)`. `PipelineRunner.startAsync()` returns the run id or throws `IllegalStateException` while a run is active. `PipelineStatus.Snapshot` is the JSON body of `GET /api/pipeline/status`.

- [ ] **Step 1: Create the stage contract and context**

```java
package com.xray.pipeline;

/** Extension point #1 (ARCHITECTURE §8.1). Add a @Component @Order(n) class under stages/. */
public interface PipelineStage {
    String id();

    void execute(PipelineContext ctx);
}
```

```java
package com.xray.pipeline;

@FunctionalInterface
public interface ProgressSink {
    void report(String stageId, int percent, String message);
}
```

```java
package com.xray.pipeline;

import com.xray.config.ScoringConfig;
import com.xray.domain.model.EntityType;
import com.xray.infrastructure.duckdb.SqlRunner;

/** State shared by the stages of one run. Block 2 adds the in-memory panels (ARCHITECTURE §4.2). */
public class PipelineContext {

    private final SqlRunner sql;
    private final ScoringConfig config;
    private final String runId;
    private final EntityType unit;
    private final ProgressSink progress;

    public PipelineContext(SqlRunner sql, ScoringConfig config, String runId, EntityType unit, ProgressSink progress) {
        this.sql = sql;
        this.config = config;
        this.runId = runId;
        this.unit = unit;
        this.progress = progress;
    }

    public SqlRunner sql() { return sql; }

    public ScoringConfig config() { return config; }

    public String runId() { return runId; }

    public EntityType unit() { return unit; }

    public void report(String stageId, int pct, String message) {
        progress.report(stageId, pct, message);
    }
}
```

- [ ] **Step 2: Create `PipelineStatus.java`**

```java
package com.xray.pipeline;

import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/** In-memory run state. The status endpoint reads this, never the database. */
@Component
public class PipelineStatus {

    public enum State { IDLE, RUNNING, DONE, FAILED }

    public record Snapshot(State state, String runId, String currentStage, int percent,
                           String message, Map<String, Long> stageTimingsMs) {
    }

    private volatile Snapshot snapshot = new Snapshot(State.IDLE, null, null, 0, null, Map.of());

    public Snapshot snapshot() {
        return snapshot;
    }

    synchronized void start(String runId) {
        snapshot = new Snapshot(State.RUNNING, runId, null, 0, "starting", Map.of());
    }

    synchronized void progress(String stageId, int percent, String message) {
        var s = snapshot;
        snapshot = new Snapshot(State.RUNNING, s.runId(), stageId, percent, message, s.stageTimingsMs());
    }

    synchronized void timings(Map<String, Long> timings) {
        var s = snapshot;
        snapshot = new Snapshot(s.state(), s.runId(), s.currentStage(), s.percent(), s.message(),
                new LinkedHashMap<>(timings));
    }

    synchronized void done(Map<String, Long> timings) {
        snapshot = new Snapshot(State.DONE, snapshot.runId(), null, 100, "done", new LinkedHashMap<>(timings));
    }

    synchronized void failed(String message, Map<String, Long> timings) {
        var s = snapshot;
        snapshot = new Snapshot(State.FAILED, s.runId(), s.currentStage(), s.percent(), message,
                new LinkedHashMap<>(timings));
    }
}
```

- [ ] **Step 3: Create `PipelineRunRepository.java`**

```java
package com.xray.infrastructure.duckdb;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xray.domain.model.EntityType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;

/** pipeline_runs keeps the run history; it is not dropped per run (ARCHITECTURE §7). */
@Repository
public class PipelineRunRepository {

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public PipelineRunRepository(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public boolean isEmpty() {
        ensureTable();
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM pipeline_runs", Long.class);
        return n == null || n == 0;
    }

    public void save(String runId, EntityType unit, Instant startedAt, Instant finishedAt,
                     Map<String, Long> stageTimingsMs, String configHash) {
        ensureTable();
        try {
            jdbc.update("INSERT INTO pipeline_runs VALUES (?, ?, ?, ?, ?, ?)",
                    runId, unit.name(), Timestamp.from(startedAt), Timestamp.from(finishedAt),
                    json.writeValueAsString(stageTimingsMs), configHash);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Cannot serialize stage timings", e);
        }
    }

    private void ensureTable() {
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS pipeline_runs (
                  run_id VARCHAR PRIMARY KEY,
                  unit VARCHAR,
                  started_at TIMESTAMP,
                  finished_at TIMESTAMP,
                  stage_timings_json VARCHAR,
                  config_hash VARCHAR)""");
    }
}
```

- [ ] **Step 4: Create `PipelineRunner.java`**

```java
package com.xray.pipeline;

import com.xray.config.ScoringConfig;
import com.xray.infrastructure.duckdb.PipelineRunRepository;
import com.xray.infrastructure.duckdb.SqlRunner;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.util.DigestUtils;

import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Runs the ordered stages one by one on a single background thread (ARCHITECTURE §4.1, §10). */
@Service
public class PipelineRunner {

    private static final Logger log = LoggerFactory.getLogger(PipelineRunner.class);

    private final List<PipelineStage> stages;
    private final SqlRunner sql;
    private final ScoringConfig config;
    private final PipelineStatus status;
    private final PipelineRunRepository runs;
    private final ExecutorService executor =
            Executors.newSingleThreadExecutor(r -> new Thread(r, "pipeline"));

    public PipelineRunner(List<PipelineStage> stages, SqlRunner sql, ScoringConfig config,
                          PipelineStatus status, PipelineRunRepository runs) {
        this.stages = stages;
        this.sql = sql;
        this.config = config;
        this.status = status;
        this.runs = runs;
    }

    public synchronized String startAsync() {
        if (status.snapshot().state() == PipelineStatus.State.RUNNING) {
            throw new IllegalStateException("Pipeline already running: " + status.snapshot().runId());
        }
        String runId = UUID.randomUUID().toString();
        status.start(runId);
        executor.submit(() -> run(runId));
        return runId;
    }

    private void run(String runId) {
        Instant startedAt = Instant.now();
        Map<String, Long> timings = new LinkedHashMap<>();
        var ctx = new PipelineContext(sql, config, runId, config.unit(), status::progress);
        try {
            for (int i = 0; i < stages.size(); i++) {
                PipelineStage stage = stages.get(i);
                ctx.report(stage.id(), i * 100 / stages.size(), "running");
                long t0 = System.nanoTime();
                stage.execute(ctx);
                long ms = (System.nanoTime() - t0) / 1_000_000;
                timings.put(stage.id(), ms);
                status.timings(timings);
                log.info("{} took {} ms", stage.id(), ms);
            }
            runs.save(runId, config.unit(), startedAt, Instant.now(), timings, configHash());
            status.done(timings);
            log.info("pipeline run {} done", runId);
        } catch (RuntimeException e) {
            log.error("pipeline run {} failed", runId, e);
            status.failed(e.getMessage(), timings);
        }
    }

    private static String configHash() {
        try (InputStream in = new ClassPathResource("scoring-config.yml").getInputStream()) {
            return DigestUtils.md5DigestAsHex(in);
        } catch (IOException e) {
            return "unknown";
        }
    }

    @PreDestroy
    void shutdown() {
        executor.shutdownNow();
    }
}
```

- [ ] **Step 5: Create the two no-op stages**

```java
package com.xray.pipeline.stages;

import com.xray.pipeline.PipelineContext;
import com.xray.pipeline.PipelineStage;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/** Block 2 replaces the body with sql/00_ingest.sql. */
@Component
@Order(0)
public class S00_Ingest implements PipelineStage {

    @Override
    public String id() {
        return "S00_INGEST";
    }

    @Override
    public void execute(PipelineContext ctx) {
        ctx.report(id(), 0, "no-op until block 2");
    }
}
```

```java
package com.xray.pipeline.stages;

import com.xray.pipeline.PipelineContext;
import com.xray.pipeline.PipelineStage;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/** Block 2 replaces the body with sql/10_staging.sql and sql/11_intragroup.sql. */
@Component
@Order(10)
public class S10_Staging implements PipelineStage {

    @Override
    public String id() {
        return "S10_STAGING";
    }

    @Override
    public void execute(PipelineContext ctx) {
        ctx.report(id(), 50, "no-op until block 2");
    }
}
```

- [ ] **Step 6: Create `PipelineStartupTrigger.java`**

```java
package com.xray.pipeline;

import com.xray.config.XRayProperties;
import com.xray.infrastructure.duckdb.PipelineRunRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/** Runs the pipeline at boot when pipeline_runs is empty. Never in demo mode (ARCHITECTURE §10). */
@Component
class PipelineStartupTrigger implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(PipelineStartupTrigger.class);

    private final XRayProperties props;
    private final PipelineRunRepository runs;
    private final PipelineRunner runner;

    PipelineStartupTrigger(XRayProperties props, PipelineRunRepository runs, PipelineRunner runner) {
        this.props = props;
        this.runs = runs;
        this.runner = runner;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (props.demoMode()) {
            log.info("demo mode: pipeline disabled, serving {}", props.dataPath().resolve("xray.duckdb"));
            return;
        }
        if (runs.isEmpty()) {
            log.info("pipeline_runs is empty: starting run {}", runner.startAsync());
        }
    }
}
```

- [ ] **Step 7: Create `PipelineController.java`**

```java
package com.xray.infrastructure.web.controller;

import com.xray.config.XRayProperties;
import com.xray.pipeline.PipelineRunner;
import com.xray.pipeline.PipelineStatus;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/pipeline")
public class PipelineController {

    private final PipelineRunner runner;
    private final PipelineStatus status;
    private final XRayProperties props;

    public PipelineController(PipelineRunner runner, PipelineStatus status, XRayProperties props) {
        this.runner = runner;
        this.status = status;
        this.props = props;
    }

    @GetMapping("/status")
    public PipelineStatus.Snapshot status() {
        return status.snapshot();
    }

    @PostMapping("/run")
    public ResponseEntity<Map<String, String>> run() {
        if (props.demoMode()) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "Pipeline disabled in demo mode"));
        }
        try {
            return ResponseEntity.accepted().body(Map.of("runId", runner.startAsync()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        }
    }
}
```

- [ ] **Step 8: Smoke test the endpoints**

```bash
rm -f data/xray.duckdb            # from the repo root
cd backend && ./mvnw -q spring-boot:run &   # wait for "Started XRayApplication"
curl -s localhost:8080/api/pipeline/status
curl -s -X POST -i localhost:8080/api/pipeline/run | head -1
curl -s localhost:8080/api/pipeline/status
curl -s -o /dev/null -w '%{http_code}\n' localhost:8080/swagger-ui.html
```

Expected:
- First status: `"state":"DONE"` and `stageTimingsMs` has `S00_INGEST` and `S10_STAGING` (the startup run already finished).
- POST: `HTTP/1.1 202`.
- Second status: `DONE` with a new `runId`.
- Swagger: `200` or `302`.
- The log shows `S00_INGEST took N ms` and `S10_STAGING took N ms` in that order.

Stop the app. Start it again with `XRAY_DEMO_MODE=true ./mvnw -q spring-boot:run`. Check that `POST /api/pipeline/run` returns `409` and the status stays `IDLE`. Stop the app.

- [ ] **Step 9: Commit**

```bash
git add backend
git commit -m "feat(pipeline): add async pipeline runner with status and run endpoints"
```

---

### Task 5: Docker image and final verification

**Files:**
- Modify: `backend/Dockerfile`
- Modify: `backend/.dockerignore` (keep the template entries, make sure `target/` is listed)

**Interfaces:**
- Produces: an image that plan B's `docker-compose.yml` builds from `./backend`, listening on 8080, reading `XRAY_DATA_DIR=/data`.

- [ ] **Step 1: Replace `backend/Dockerfile`**

```dockerfile
# glibc base images: the DuckDB JDBC native library does not load on Alpine (musl).
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN ./mvnw -q -B dependency:go-offline
COPY src/ src/
RUN ./mvnw -q -B package -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
ENV XRAY_DATA_DIR=/data
VOLUME /data
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

- [ ] **Step 2: Build and run the image**

```bash
cd backend
docker build -t xray-backend .
mkdir -p /tmp/xray-data && docker run --rm -d --name xray-be -p 8080:8080 -v /tmp/xray-data:/data xray-backend
sleep 15 && curl -s localhost:8080/api/pipeline/status
docker stop xray-be
```

Expected: JSON with `"state":"DONE"`. If Docker is not running (Colima), report that and skip to Step 3.

- [ ] **Step 3: Run the full test suite**

Run: `cd backend && ./mvnw -q test`
Expected: `Tests run: 5, Failures: 0, Errors: 0`, `BUILD SUCCESS`.

- [ ] **Step 4: Check the hard rules**

```bash
grep -rn "org.springframework\|java.sql" backend/src/main/java/com/xray/domain && echo "RULE BROKEN" || echo "domain is pure"
grep -rn "hackspain\|jpa\|postgres\|lombok" backend/src backend/pom.xml && echo "TEMPLATE LEFTOVER" || echo "clean"
```

Expected: `domain is pure` and `clean`.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "build(backend): use glibc base image for duckdb native library"
```

- [ ] **Step 6: Report**

Report to the human: the three versions from Task 1 Step 2, the result of each smoke test, and anything that differs from this plan. Do not merge.
