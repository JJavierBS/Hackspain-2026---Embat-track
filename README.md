# X-Ray

**A monthly financial health score for SMEs, read from their money trail — and a working-capital
limit that recalculates itself from that score.**

HackSpain 2026 · Embat track · Team Byte_Me

---

## Two companies, one point apart

In August 2026 two groups in the Embat dataset score almost the same:

| | Final | Trajectory | |
|---|---:|---:|---|
| `GROUP_0011` | 56.1 | **83.7** | climbing hard |
| `GROUP_0007` | 54.7 | **17.0** | falling hard |

1.4 points apart. A filed annual account cannot tell them apart. A rating that refreshes once a year
cannot either. Their cash can: one collects faster every month, the other stretches its suppliers and
burns its buffer.

X-Ray reads that trail — 2.5 million bank transactions, 898 thousand invoices and 2,239 debt
products over 24 months — and turns it into a number that moves every month, with the reason next to
it. The demo opens on this pair.

## What the system answers

Six questions, per entity and per month. They come straight from the brief.

| Question | Where X-Ray answers it |
|---|---|
| Who is healthy | Final score 0–100 and a band from S to E |
| Who is improving | Trajectory 0–100, where 50 means flat |
| Who starts to turn | Status "empieza a torcerse": the level is still good, the direction is not |
| A dip or a real decline | A CUSUM change detector plus a slope test and a persistence test |
| Why it changed | An exact additive breakdown: every driver, in points, with its raw value |
| How early it was seen | Lead time measured against documented proxy events |

The score never predicts a bankruptcy. It reads behaviour in both directions and says when it changed.

## The product, and who pays for it

The score is the engine. The product on top is a **working-capital limit that recalculates itself
every month**, with a price grid by band, a DSCR cap, and a simulator that answers a request for a
given amount and term.

**The SME that already uses Embat pays first.** The brief says the obvious buyer is the company that
hands over the data, and the data is legally its own: no bank sees a score without its consent. It
buys a limit that moves with its own cash flow instead of sending the same dossier to eight banks.

**The lender or the insurer pays second**, per line opened or per policy written, with the SME's
consent. For the lender the pitch is one measured number: on this dataset **the engine cut the limit
before the risk event in 70 of 81 cases, 4.5 months ahead on average**.

Two more views of the same score ship with it, selected by one switch in the URL:

- **Insurer** — a trade-credit premium that moves with the band every month instead of once a year.
- **Fund** — a momentum screen that finds the company at 45 that is on its way to 65.

Reasons and price structure: [`docs/PRODUCT.md`](docs/PRODUCT.md).

## How it works

```
data/raw/*.csv ─► DuckDB SQL ─────────────► Java, in memory ──────► results tables ─► REST ─► React
  9 files         ingest, staging,           anchors, trajectory,     250 × 24 × 3
  2.5 M rows      intragroup removal,        categories, profiles,    materialized
                  balance rebuild,           explanation, CUSUM,
                  monthly aggregates,        regimes, alerts,
                  22 raw indicators          limits, premiums,
                                             lead time, forecast
```

The one property that keeps the design small: **after the SQL layer the data is tiny.** 250 entities
× 24 months × 22 indicators is 132,000 rows. Everything past that point is plain Java collections. No
streaming, no batch framework, no cache.

Three rules hold the whole thing up:

1. **Causality.** A value for month `m` reads only data dated up to the end of month `m`.
   `LookAheadTest` truncates a panel at M12 and asserts every earlier value is unchanged. Without it
   the anticipation numbers would mean nothing.
2. **Anchors, never percentiles.** Each indicator maps its own raw value to 0–100 through fixed,
   clamped, piecewise-linear anchors. An entity the system has never seen scores exactly like a
   training entity — which is what the hidden test asks for.
3. **Missing is not zero.** An unavailable indicator is dropped and the weights renormalize over what
   is left. A company with no ERP connection is scored, marked, and never invented.

The score decomposes exactly, so the explanation is arithmetic and not a story:

```
Final − 50 = Σ contribution_i        (asserted to 0.05 by ExplanationSumTest, for every entity-month-profile)
```

**Stack.** Java 21, Spring Boot 3, Maven, DuckDB embedded over JDBC, plain SQL in numbered files,
springdoc-openapi, JUnit 5. React 19, TypeScript, Vite, TanStack Query, Recharts, Tailwind 4.
No JPA, no Postgres, no model server, and no external API call at runtime.

**Configuration over code.** Every anchor, weight, threshold, λ and product parameter lives in
`scoring-config.yml`. The `/algorithm` page exposes all of them to a risk expert, previews an edit on
one entity through the pipeline's own code, and writes an override file. Adding an indicator is an
enum constant, a YAML entry and one SQL insert.

## What we measured, including what is weak

BANK profile, 250 groups, 24 months, against documented proxy events. Every number below comes from
`/api/analytics/lead-time` and is reproducible from the frozen database.

**The signal that anticipates is the limit engine.**

| | |
|---|---:|
| Deterioration events with a limit cut before them | **70 of 81 — 86 %** |
| Mean lead of the cut | **4.5 months** |
| Median lead | 3.0 months |

It reads the level and the trajectory together, so it moves while the status flag still says the
entity is fine.

The status flag itself is weaker, and we publish that too:

| | Deterioration | Improvement |
|---|---:|---:|
| Proxy events | 81 | 51 |
| Detected at least one month ahead | 40 % | 47 % |
| Mean lead | 1.8 months | 1.2 months |
| False alarm rate | 65 % | 76 % |
| **Lift over chance** | **0.96** | **1.54** |

Read the lift, not the lead. A lift of 1 means the signal fires no more often before an event than
any other month does. **On deterioration the status signal does not beat chance.** On improvement it
does, by half again. Both figures sit on the Methodology page next to the limit engine, because a
number that only reports its wins is not a number anyone can underwrite with.

## Run it

### Requirements

| | Version | Note |
|---|---|---|
| JDK | 21+ | `mise.toml` pins `temurin-21`. Newer JDKs build and run fine. |
| Node | 20+ | `mise.toml` pins 24. **Use npm** — `package-lock.json` is the lockfile in git. |
| Docker | any recent | Only for the one-command path below. |

Maven and the DuckDB engine come down on the first build; nothing else to install.

### Option A — demo mode, no data files needed (start here)

The repo ships a **frozen slice of the results database**, so the demo runs with no CSVs and no
pipeline. This is exactly how production runs ([`docs/DEPLOY.md`](docs/DEPLOY.md)).

```bash
# 1. expand the frozen database (47 MB in git → 108 MB on disk)
mkdir -p data
gzip -dc backend/demo/xray-demo.duckdb.gz > data/xray.duckdb

# 2. backend — boots in ~2 s and serves the precomputed data
cd backend && XRAY_DEMO_MODE=true ./mvnw spring-boot:run

# 3. frontend, in a second terminal
cd frontend && npm install && npm run dev
```

Open **http://localhost:5173**. The API is on `:8080`, Swagger UI at
`http://localhost:8080/swagger-ui.html`.

In demo mode the pipeline never runs: "Aplicar y recalcular" on `/algorithm` and
`POST /api/pipeline/run` are disabled. Everything else — including the sector what-if, the custom
presets and the limit simulator — works, because those compute one entity per request and write
nothing.

### Option B — the whole pipeline from the raw CSVs

```bash
# 1. put the nine Embat CSVs in data/raw/ (gitignored, ~617 MB)
# 2. boot; the pipeline runs automatically when the results tables are empty (~1 min)
cd backend && ./mvnw spring-boot:run
cd frontend && npm install && npm run dev
```

```bash
curl localhost:8080/api/pipeline/status     # progress while it runs
curl -X POST localhost:8080/api/pipeline/run # rerun it by hand
```

### Option C — the full stack in one command

```bash
docker compose up --build      # http://localhost, backend on :8080
```

Compose bind-mounts `./data`, so it uses whatever database is already there. `XRAY_DEMO_MODE`
defaults to `true`; set it to `false` to allow a recalculation (needs the CSVs in `data/raw/`).

### Environment variables

| Variable | Default | What it does |
|---|---|---|
| `XRAY_DEMO_MODE` | `false` | `true` serves the frozen database and never runs the pipeline |
| `XRAY_DATA_DIR` | `../data` | Where `xray.duckdb`, `raw/` and `scoring-overrides.yml` live |
| `SERVER_PORT` / `PORT` | `8080` | API port. `PORT` wins, for PaaS hosts that inject it |
| `XRAY_DUCKDB_MEMORY_LIMIT` | unset | DuckDB `memory_limit`, e.g. `64MB`. Needed on small containers |
| `VITE_API_TARGET` | `http://localhost:8080` | Backend the Vite dev proxy points at |

### Tests

```bash
cd backend && ./mvnw test      # 31 tests; the six named ones guard the six claims
cd frontend && npm run typecheck && npm run lint && npm run build
```

The six that matter are listed in [`docs/RULES.md`](docs/RULES.md) §4: `AnchorInterpolatorTest`,
`ExplanationSumTest`, `LookAheadTest`, `ProfileRenormalizationTest`, `RollupTest` and
`ScoringConfigValidationTest`.

### If something goes wrong

| Symptom | Cause and fix |
|---|---|
| `IOException: Could not set lock on file` | DuckDB allows one process per database file. Stop the other backend first. |
| Empty pages, every score `null` | No database at `data/xray.duckdb`. Run step 1 of option A. |
| The pipeline starts when you did not want it to | `XRAY_DEMO_MODE` is not `true` and the results tables are empty. |
| The UI shows data that looks too healthy | `VITE_MOCKS=true` is set. Unset it — that is `npm run dev:mock`, not `npm run dev`. |
| `/monitor`, `/entity/...` return 404 on reload | An SPA-fallback rewrite is missing in the host config ([`docs/DEPLOY.md`](docs/DEPLOY.md)). |

## The demo

Six pages. `profile` and `month` live in the URL, so every view is a link.

| Page | What it shows |
|---|---|
| **Cartera** | 250 entities ranked, filtered by the six questions. The profile switch re-ranks everything. |
| **Entidad** | The score, its drivers, the timeline with regimes and changepoints, the product panel, and a sector what-if. |
| **Monitor** | The watchlist and an alert replay: months M06 to M23 stream by, and the system raises its hand on its own. |
| **Comparar** | Two entities side by side, preloaded with the showcase pair above. |
| **Metodología** | Every rule, every parameter, the measured anticipation and the limitations. |
| **Algoritmo** | Every parameter, editable, with a preview on one entity. For a risk expert. |

## What it cannot see

Stated in the UI, not hidden in a footnote.

- No balance sheet and no P&L. EBITDA, Debt/EBITDA and DSCR are cash-flow proxies.
- Debt granted and outstanding is a single snapshot of 2026-09-01. Indicators that use it are flagged.
- The data is synthetic and carries no default label. Anticipation is measured against proxy events.
- Ten of the 22 anchors are provisional and marked as such until a risk expert closes them.
- The spread grid, the premium multipliers and the reference rate are our assumptions, not market data.

## Documentation

Thirteen files under [`docs/`](docs/), each with one owner. [`docs/README.md`](docs/README.md) is the
full index; these are the four to start from.

| File | Owns |
|---|---|
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | **Every decision, with its reason and its evidence.** Read this before disagreeing with anything. |
| [`docs/RULES.md`](docs/RULES.md) | The engineering rules the code holds, the conventions, and the tests that guard them |
| [`docs/SPEC.md`](docs/SPEC.md) | *What* to compute: data, indicators, anchors, scoring, regimes, alerts, products, API |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | *How* it is built: packages, contracts, pipeline stages, SQL files, extension points, tests |

Then, by question: the data ([`DATA_FINDINGS.md`](docs/DATA_FINDINGS.md)), the anchors
([`THRESHOLDS.md`](docs/THRESHOLDS.md)), the weights and their sensitivity test
([`WEIGHTS.md`](docs/WEIGHTS.md)), the presets ([`PRESETS.md`](docs/PRESETS.md)), the expert page
([`ALGORITHM_PAGE.md`](docs/ALGORITHM_PAGE.md)), the two non-scoring outputs
([`FORECAST.md`](docs/FORECAST.md), [`RECOMMENDATIONS.md`](docs/RECOMMENDATIONS.md)), the product
([`PRODUCT.md`](docs/PRODUCT.md)), the design system ([`DESIGN.md`](docs/DESIGN.md)), the deploy
([`DEPLOY.md`](docs/DEPLOY.md)) and the original brief, unedited
([`embat-track.md`](docs/embat-track.md)).
