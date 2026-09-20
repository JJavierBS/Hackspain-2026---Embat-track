# scripts — offline tools

Nothing here runs in the product. The backend never shells out, and no script output is read at
request time. These are the tools that produced the numbers in `docs/`, plus the ones that build and
check a database.

Python tools need `pip install -r requirements.txt` (numpy, PyYAML, duckdb). The Java files are
single-file programs: run them with `java <file>.java`, with the DuckDB JDBC jar on the classpath
where they open a database.

## Building and checking a database

| File | What it does |
|---|---|
| `profiling.sql` | The SPEC §4 data profiling. Needs the CSVs in `data/raw/`. Its answers are written down in [`../docs/DATA_FINDINGS.md`](../docs/DATA_FINDINGS.md). |
| `validate_block2.sql` | Checks the staging and rollup layer: reconstructed balances against `balances.csv`, intragroup removal, ratio recomputation. |
| `validate_block3_a.sql` | Checks the raw indicators of `sql/30–34` and `38`: coverage, ranges and missing values. |
| `ExportDemoDb.java` | Writes the frozen slice that ships in the image ([`../docs/DEPLOY.md`](../docs/DEPLOY.md)). |
| `MakeHoldout.java` | Cuts a holdout copy of the database for an out-of-sample check. |
| `DuckQuery.java` | Runs one query against a DuckDB file and prints the result. Handy where the DuckDB CLI is not installed. |
| `snapshot-fallback.mjs` | Freezes the GET answers of a running backend into `frontend/public/fallback`, so the UI still renders if the backend is down. Node 24, no dependencies. |

**Every one of these opens the database file directly, and DuckDB allows one process per file.**
Stop the backend first, or work on a copy.

## Deriving the numbers in the docs

| File | Produces |
|---|---|
| `weights_calc/ahp_w_cat_ind.py` | The category and intra-category weights, from the importance ratings. Prints the YAML fragments of [`../docs/WEIGHTS.md`](../docs/WEIGHTS.md) §7 and the consistency ratios of §6. |
| `weights_calc/ahp.py` | The bare AHP helper (pairwise matrix → weights + consistency ratio) that the generator uses. |
| `weights_calc/sensitivity.sql` | The ±50 % sensitivity test of [`../docs/WEIGHTS.md`](../docs/WEIGHTS.md) §11. Seed 0.42, so it reproduces exactly. |
| `forecast/backtest.py` | The rolling-origin backtest of [`../docs/FORECAST.md`](../docs/FORECAST.md): MAE per horizon and skill against persistence. |

## Independent cross-checks

`scoring/` is a second, independent implementation of the level term in Python, written to contrast
the anchors and weights against the Java engine. **The product does not read it or its output**
(`DECISIONS.md` M10 and the note at the top of each file). It has its own documentation:
[`scoring/HEALTH_SCORING.md`](scoring/HEALTH_SCORING.md), in Spanish.

| File | What it does |
|---|---|
| `scoring/health_scoring.py` | Recomputes the level score on a 0–1 scale from `scoring-config.yml` and `indicator_values_raw`. |
| `scoring/cusum_forecast.py` | The damped linear trend and CUSUM of the source branch, kept for comparison. The backtest shows the damped trend loses to persistence, so it does not feed the product. |
| `scoring/test_health_scoring.py`, `scoring/test_cusum_forecast.py` | `pytest` tests for the two above. |
