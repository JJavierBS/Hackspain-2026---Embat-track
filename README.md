# X-Ray — HackSpain 2026 · Embat challenge

Monthly financial health score (0–100, Level + Trajectory) for SME groups, with
explanations, alerts and a working-capital limit engine for banks.

Read `CLAUDE.md`, then `docs/SPEC.md` and `docs/ARCHITECTURE.md`.
Product context for design work: `PRODUCT.md`.

## Run locally
1. Put the Embat CSVs in `data/raw/`.
2. Backend: `cd backend && ./mvnw spring-boot:run` (port 8080, Swagger at `/swagger-ui.html`).
3. Frontend: `cd frontend && npm install && npm run dev` (port 5173, proxies `/api`).

## Run the full stack
`docker compose up --build`, then open `http://localhost`.

## Data profiling
`duckdb < scripts/profiling.sql` → write the answers to `docs/DATA_FINDINGS.md`.

## Deploy
Backend on Render from `render.yaml` (blueprint), serving the frozen `backend/demo/xray-demo.duckdb.gz`.
See `docs/DEPLOY.md`.
