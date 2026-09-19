# Deploy (SPEC §14)

The deployed stack runs in demo mode on a frozen `data/xray.duckdb`.
Choosing the host and logging in is a human step. Any host with Docker Compose works (a VPS is the simplest).

## First deploy (block 1, empty app)
1. On the host: `git clone <repo> && cd <repo>`.
2. `mkdir -p data && docker compose up --build -d`.
3. Open `http://<host>/`. The top bar must show and the pipeline lamp must show `Pipeline Listo` (state `DONE`).

## Later deploys (after each block)
1. Locally: run the pipeline, then copy `data/xray.duckdb` to the host with `scp data/xray.duckdb <host>:<repo>/data/`.
2. On the host: `git pull && XRAY_DEMO_MODE=true docker compose up --build -d`.
3. Check `http://<host>/api/pipeline/status` → `IDLE` (lamp `En espera`), and `POST /api/pipeline/run` → `409`.

## Checks from another device
- `/` loads in under 1 s.
- `/?profile=FUND&month=2026-05` keeps the params on every nav link.
