# Phase 1 — Parallel Execution Overview

Phase 1 = **Block 1 (boot)** of `docs/ARCHITECTURE.md §11`, plus the
data-independent preparation for Block 2. It runs as two plans on two
branches at the same time, then the two branches merge into `main`.

| Plan | Branch | Owner (agent) | File |
|---|---|---|---|
| A — Backend foundation | `feat/phase1-backend` | Claude Code or Antigravity | `2026-09-19-phase1-A-backend.md` |
| B — Frontend, infra, docs | `feat/phase1-frontend-infra` | Claude Code or Antigravity | `2026-09-19-phase1-B-frontend-infra.md` |

Estimate: A about 2–3 h of agent time, B about 2 h. Merge and smoke test: 20 min.

## Why these two plans do not conflict

Each plan owns a disjoint set of paths. An agent must not edit a path that
the other plan owns.

| Path | Owner |
|---|---|
| `app/backend/**` → moved to `backend/**` | A |
| `app/web/**` → moved to `frontend/**` | B |
| All other paths under `app/` (mobile, packages, Makefile, pnpm files, compose, mise.toml, .editorconfig, scripts, README, CHEATSHEET, .env.example, .npmrc, .gitignore) | B (move or delete) |
| `docker-compose.yml` (root), `.gitignore` (root), `README.md`, `mise.toml` (root) | B |
| `docs/**` except the plan files | B |
| `scripts/**` | B |
| `CLAUDE.md` | nobody in phase 1 |

## Shared contract (both plans copy this verbatim)

1. Backend lives in `backend/`, Maven, Java package root `com.xray`, port `8080`.
2. Frontend lives in `frontend/`, npm (no pnpm), Vite dev server proxies `/api` to `http://localhost:8080`.
3. Data directory: property `xray.data-dir`, env `XRAY_DATA_DIR`, default `../data` (relative to `backend/`).
   DuckDB file = `<data-dir>/xray.duckdb`. CSVs = `<data-dir>/raw/*.csv`. In Docker: `/data`, bind mount `./data:/data`.
4. Demo mode: property `xray.demo-mode`, env `XRAY_DEMO_MODE`, default `false`.
5. The backend boots with an empty or missing `data/raw/`. Phase 1 stages are no-ops.
6. Compose service names: `backend` and `frontend`. nginx in `frontend` proxies `/api/` to `http://backend:8080/api/`.
7. Backend Docker image uses a **glibc** base (`eclipse-temurin:21-jre`, not `-alpine`), because the DuckDB JDBC native library does not load on musl.
8. Endpoints available after phase 1:
   - `GET /api/pipeline/status` → `200`
     ```json
     { "state": "IDLE|RUNNING|DONE|FAILED", "runId": "string|null",
       "currentStage": "string|null", "percent": 0,
       "message": "string|null", "stageTimingsMs": { "S00_INGEST": 3 } }
     ```
   - `POST /api/pipeline/run` → `202 {"runId": "..."}`; `409 {"error": "..."}` in demo mode or while a run is active.
   - `GET /actuator/health` → `200 {"status":"UP", ...}`
   - `GET /swagger-ui.html`

## Run procedure

1. Commit the three plan files on `main` and push. Worktrees see only committed files.
   ```bash
   git add docs/superpowers/plans && git commit -m "docs(plans): add phase 1 parallel plans" && git push
   ```
2. Create one worktree for each branch.
   ```bash
   git worktree add ../xray-phase1-backend  -b feat/phase1-backend
   git worktree add ../xray-phase1-frontend -b feat/phase1-frontend-infra
   ```
3. Start one agent in each worktree with this prompt (change the plan file):
   > Read `CLAUDE.md`, then execute `docs/superpowers/plans/2026-09-19-phase1-A-backend.md`
   > task by task. Only edit the paths this plan owns (see the overview file).
   > Commit after each task. Do not merge. Stop and report when all tasks are done.
4. When both agents report done, merge B first, then A:
   ```bash
   git checkout main && git pull
   git merge --no-ff feat/phase1-frontend-infra -m "merge: phase 1 frontend and infra"
   git merge --no-ff feat/phase1-backend       -m "merge: phase 1 backend foundation"
   ```
   Expected result: no conflicts. If a conflict occurs, one agent edited a path it does not own. Keep the owner's version.
5. Run the post-merge smoke test from the repository root:
   ```bash
   (cd backend && ./mvnw -q test)
   (cd frontend && npm ci && npm run build)
   docker compose up --build -d
   curl -s localhost/api/pipeline/status        # state DONE after a few seconds
   curl -s localhost:8080/actuator/health       # nginx proxies only /api
   ```
   Open `http://localhost/?profile=FUND&month=2026-05` in a browser. The top bar must show FUND and 2026-05, and the pipeline badge must show `DONE`.
6. Push `main`. Deploy with `docs/DEPLOY.md` (human step: it needs your host account).
7. Remove the worktrees: `git worktree remove ../xray-phase1-backend ../xray-phase1-frontend`.

## What comes after phase 1

Block 2 (data): Dev A runs `scripts/profiling.sql`, fills `docs/DATA_FINDINGS.md`, writes `sql/00`–`24`. Dev B writes `25_entity_rollup.sql`, `PanelLoader`, `ResultWriter`. Both need the CSVs in `data/raw/`.
