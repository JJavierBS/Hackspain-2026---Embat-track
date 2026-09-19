# Deploy (SPEC §14)

The deployed stack runs in demo mode on a frozen database: no ingest, no pipeline, no CSVs.
`data/raw/` (~617 MB) never leaves your laptop.

## The frozen database

The API only ever reads results tables. The full `data/xray.duckdb` (~247 MB) is mostly staging that
no query touches — `daily_product_balance` (3.5M rows), `stg_transactions` (2.5M), `daily_cash`,
`stg_invoices`. `scripts/ExportDemoDb.java` writes the slice that is actually served:

| file | size | in git |
|---|---|---|
| `data/xray.duckdb` | 247 MB | no |
| `backend/demo/xray-demo.duckdb` | 75 MB | no |
| `backend/demo/xray-demo.duckdb.gz` | 31 MB | **yes** |

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

A new query over a table not yet in the slice returns a 500 in the deployed app and a 200 locally.
`ExportDemoDb.KEEP` is the list; add the table there when you add the query.

## Render (backend)

`render.yaml` is a blueprint: **New → Blueprint** in the Render dashboard, pick this repo, deploy.
It needs no persistent disk and no manual upload — the database rides inside the image.

- Build context is `backend/`, Dockerfile is `backend/Dockerfile`. A service created from the
  dashboard rather than the blueprint has these as **Root Directory** and **Dockerfile Path**;
  they must agree, or every `COPY` fails with `not found`.
- Render injects `$PORT`; `application.yml` prefers it over `SERVER_PORT`.
- Health check is `/actuator/health`.
- `plan: starter` keeps the service warm. `free` also works but spins down after 15 minutes idle,
  and a cold start in front of the jury is a ~1 minute blank page.
- Memory is set with `-XX:MaxRAMPercentage=55` rather than `-Xmx`, so the same image fits whatever
  instance size it lands on and leaves the rest to DuckDB's buffer pool.

Checks once it is live:

```bash
curl https://<service>.onrender.com/actuator/health          # {"status":"UP"}
curl https://<service>.onrender.com/api/pipeline/status       # IDLE
curl -X POST https://<service>.onrender.com/api/pipeline/run  # 409, demo mode refuses it
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
backend uses your own full `xray.duckdb` and the baked demo slice is left alone. To rehearse the
deployed configuration instead: `XRAY_DEMO_MODE=true docker compose up --build -d`.

## Checks from another device
- `/` loads in under 1 s.
- `/?profile=FUND&month=2026-05` keeps the params on every nav link.
