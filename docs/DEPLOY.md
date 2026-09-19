# Deploy (SPEC §14)

The deployed stack starts from a frozen database and has no CSVs. `data/raw/` (~617 MB) never leaves
your laptop. The Algorithm page can still edit the config in prod, and "Recalcular ahora" (or
`POST /api/pipeline/run`) reruns the pipeline there: S00..S25 skip without the CSVs, and S30 onwards
reads the input tables that ship in the frozen database.

Edits in prod live on a Render disk mounted at `/data`. A restart keeps them. A deploy that ships a
different `xray-demo.duckdb.gz` replaces the database and deletes the saved edits, because the shipped
database was exported with the shipped config (`docker-entrypoint.sh` compares a SHA-256 marker). `XRAY_DEMO_MODE=true` locks the config and the pipeline again, for
example during the jury presentation.

## The frozen database

The full `data/xray.duckdb` (~450 MB) is mostly staging that neither the API nor S30 onwards reads:
`daily_product_balance` (3.5M rows), `stg_transactions` (2.5M), `daily_cash`, `stg_invoices`.
`scripts/ExportDemoDb.java` writes the slice that is actually served: the results tables plus the
tables that sql/28..39 read (`monthly_*`, `debt_snapshot`, `monthly_line_tx`, `monthly_interest`, ...).
The output of S00..S25 depends only on the data rules, which the Algorithm page does not edit, so these
frozen tables stay correct after any edit.

| file | size | in git |
|---|---|---|
| `data/xray.duckdb` | 450 MB | no |
| `backend/demo/xray-demo.duckdb` | 112 MB | no |
| `backend/demo/xray-demo.duckdb.gz` | 49 MB | **yes** |

The `.gz` is committed because Render builds from the repo and has no other way to get it, and it
sits under `backend/` because a Dockerfile cannot copy anything outside its build context. The
image copies it in and expands it at startup.

### Regenerating it after a pipeline run

Stop the backend first — DuckDB allows one process per database file.

```bash
J=$(ls ~/.m2/repository/org/duckdb/duckdb_jdbc/1.5.5.1/duckdb_jdbc-1.5.5.1.jar)
java --enable-native-access=ALL-UNNAMED -cp $J scripts/ExportDemoDb.java data/xray.duckdb backend/demo/xray-demo.duckdb
git add backend/demo/xray-demo.duckdb.gz && git commit -m "chore(data): refresh the frozen demo database"
```

Export again after any change to the scoring config (the Algorithm page, a preset, or a hand edit).
`pipeline_runs.config_hash` holds the config fingerprint (`docs/ALGORITHM_PAGE.md` D3). The Algorithm
page compares it with the active config, and shows "Pendientes de recalcular" when they
differ. A slice exported before PR #17 stores the old hash format, so export it once from a run on the
new code. An edit in prod writes `/data/scoring-overrides.yml` on the container disk only: export the
slice again to make it the shipped state.

A new query over a table not yet in the slice returns a 500 in the deployed app and a 200 locally.
`ExportDemoDb.KEEP` is the list; add the table there when you add the query.

## Render (backend)

`render.yaml` is a blueprint: **New → Blueprint** in the Render dashboard, pick this repo, deploy.
It needs no manual upload: the database is inside the image, and the entrypoint unpacks it to the
disk at `/data` (`xray-data`, 1 GB). The disk needs a paid plan, and a service with a disk has no
zero-downtime deploy. A service created from the dashboard needs the disk added by hand: mount path
`/data`, 1 GB. The entrypoint starts as root, gives `/data` to the `xray` user, then runs Java as it.

- Build context is `backend/`, Dockerfile is `backend/Dockerfile`. A service created from the
  dashboard rather than the blueprint has these as **Root Directory** and **Dockerfile Path**;
  they must agree, or every `COPY` fails with `not found`.
- Render injects `$PORT`; `application.yml` prefers it over `SERVER_PORT`.
- Health check is `/actuator/health`.
- `plan: starter` keeps the service warm. `free` also works but spins down after 15 minutes idle,
  and a cold start in front of the jury is a ~1 minute blank page.
- Memory is set with `-XX:MaxRAMPercentage=50` rather than `-Xmx`, so the same image fits whatever
  instance size it lands on. DuckDB is capped with `XRAY_DUCKDB_MEMORY_LIMIT=64MB` and 1 thread: its
  default (80% of the RAM it sees) leaves no room for the JVM. The JIT runs C1 only, with a 48 MB code
  cache. Measured in a 512 MB / 0.5 CPU container, like starter: the live heap is 175-233 MB (the
  panels), non-heap ~85 MB, and anonymous memory reaches ~470 MB. Three runs in a row end with no OOM
  kill. The earlier values (55% heap, DuckDB 96 MB, 2 threads) were OOM killed in S50-S65. The margin
  is small: a larger dataset needs a larger plan, or the panels loaded in batches.
- The database on disk does not lower the memory use. Only DuckDB's buffer cache is in RAM, and
  `memory_limit` caps it. The same OOM kill happened with the database on the container disk and on a
  volume.
- A pipeline run works on a copy (`xray.run.duckdb`) and replaces the served tables in one transaction
  at the end (`RunDatabase`). A failed run changes nothing that the app shows. A heap
  `OutOfMemoryError` stops the JVM (`-XX:+ExitOnOutOfMemoryError`), and Render restarts it with the
  last published database on the disk.
- Neither the image nor `render.yaml` sets `XRAY_DEMO_MODE`, so the app default (`false`) applies. A
  service created from the dashboard keeps its own env vars: delete `XRAY_DEMO_MODE` there.

Checks once it is live:

```bash
curl https://<service>.onrender.com/actuator/health          # {"status":"UP"}
curl https://<service>.onrender.com/api/pipeline/status       # IDLE
curl -X POST https://<service>.onrender.com/api/pipeline/run  # 202 {"runId": ...}, ~1 min on starter
```

## Vercel (frontend)

`frontend/vercel.json` rewrites `/api/*` to the Render service. The client builds every URL
same-origin — `src/api/client.ts` and the `EventSource` in `src/api/useReplay.ts` — so `/api` has to
resolve on the Vercel domain. Proxying it keeps the app same-origin, which is why **the backend
needs no CORS configuration**. Changing the backend URL means editing this file and redeploying,
because there is no `VITE_API_BASE`.

Check after a deploy:

- `VITE_MOCKS` must be unset in the Vercel environment. Set to `true` the app serves synthetic data
  against a perfectly healthy backend, which looks like a data bug and is not one.
- Open `/monitor` and start the replay. It is an SSE stream held open for ~22 s at the default speed
  (18 months x 1200 ms), and it is the one call that a proxy can buffer. Months must arrive one at a
  time, not all at once at the end. If they do not, the fallback is a `VITE_API_BASE` build-time
  variable plus CORS on the backend, so the stream goes straight to Render.
- If a deep link such as `/monitor` 404s on reload, add an SPA fallback rewrite after the `/api` one.
  Vercel's Vite preset normally handles this.

The first request after an idle period takes ~12 s: that is Render's free plan spinning the service
back up, not the app being slow. `render.yaml` asks for `plan: starter`, which stays warm; a service
created from the dashboard keeps whatever plan it was created with.

## Full stack with Docker Compose

`docker compose up --build`, then open `http://localhost`. Compose bind-mounts `./data`, so the
backend uses your own full `xray.duckdb` and the baked demo slice is left alone. To lock the config
and the pipeline: `XRAY_DEMO_MODE=true docker compose up --build -d`.

## Checks from another device
- `/` loads in under 1 s.
- `/?profile=FUND&month=2026-05` keeps the params on every nav link.
