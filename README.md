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

Reasons and price structure: [`PRODUCT.md`](PRODUCT.md).

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

```bash
# 1. Put the nine Embat CSVs in data/raw/ (gitignored, ~617 MB)
cd backend && ./mvnw spring-boot:run     # :8080, runs the pipeline on first boot, Swagger at /swagger-ui.html
cd frontend && npm install && npm run dev # :5173, proxies /api

# everything at once, as deployed
docker compose up --build                 # http://localhost

# the six tests that guard the six claims
cd backend && ./mvnw test
```

No CSVs at hand? The repo ships a frozen slice of the results database
(`backend/demo/xray-demo.duckdb.gz`, 47 MB in git, 108 MB expanded). Start the backend with
`XRAY_DEMO_MODE=true` and it serves the
precomputed data without ever running the pipeline. That is exactly how production runs
([`docs/DEPLOY.md`](docs/DEPLOY.md)).

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

Start here, then follow the one file you need.

| File | Owns |
|---|---|
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | **Every decision, with its reason and its evidence.** Read this before disagreeing with anything. |
| [`docs/SPEC.md`](docs/SPEC.md) | *What* to compute: data, indicators, anchors, scoring, regimes, alerts, products, API |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | *How* it is built: packages, contracts, pipeline stages, SQL files, extension points, tests |
| [`docs/DATA_FINDINGS.md`](docs/DATA_FINDINGS.md) | What the CSVs actually say. Every profiling answer, with the query |
| [`docs/THRESHOLDS.md`](docs/THRESHOLDS.md) | The anchors: quantiles, proposals and review status |
| [`docs/WEIGHTS.md`](docs/WEIGHTS.md) · [`docs/WEIGHTS_JUSTIFICATION.md`](docs/WEIGHTS_JUSTIFICATION.md) | How the weights were derived, and the sensitivity test that says the magnitudes barely matter |
| [`docs/PRESETS.md`](docs/PRESETS.md) · [`docs/SECTOR_PRESETS.md`](docs/SECTOR_PRESETS.md) | Client and sector starting points, each value with the source we read |
| [`docs/CUSTOM_PRESETS.md`](docs/CUSTOM_PRESETS.md) | Presets the client writes for one entity, in memory, with its own evidence |
| [`docs/ALGORITHM_PAGE.md`](docs/ALGORITHM_PAGE.md) | The expert configuration page: decisions, limits and test evidence |
| [`docs/FORECAST.md`](docs/FORECAST.md) · [`docs/RECOMMENDATIONS.md`](docs/RECOMMENDATIONS.md) | The two outputs that do not feed the score |
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | Render, Vercel, the frozen database and the memory budget |
| [`PRODUCT.md`](PRODUCT.md) · [`DESIGN.md`](DESIGN.md) | Product context and the design system |
| [`CLAUDE.md`](CLAUDE.md) | Working rules for coding agents on this repo |
| [`docs/embat-track.md`](docs/embat-track.md) | The original brief, unedited |
