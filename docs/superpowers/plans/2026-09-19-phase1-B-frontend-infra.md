# Phase 1 · Plan B — Frontend, Infra and Docs Implementation Plan

> **For agentic workers:** Claude Code: use superpowers:executing-plans (or superpowers:subagent-driven-development) to run this plan task by task. Antigravity or other agents: do the checkboxes in order. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A React app in `frontend/` with the global profile/month bar, the five route shells and a live pipeline badge; a root `docker-compose.yml` for the full stack; the repo cleaned to the layout of `docs/ARCHITECTURE.md §2`; and the profiling kit for Block 2.

**Architecture:** Move `app/web` to `frontend/`, drop the pnpm workspace and the shared package, and switch to npm. `profile` and `month` live in URL search params through one hook. A small `fetch` client talks to `/api`, which Vite (dev) and nginx (Docker) proxy to the backend. The profiling SQL runs with the DuckDB CLI straight on the CSVs, so it does not need the backend.

**Tech Stack:** Node 24 LTS (pinned in `mise.toml`), npm, React 19 + TypeScript + Vite (versions from the template), React Router 7, TanStack Query 5, Tailwind 4, Recharts, nginx, Docker Compose, DuckDB CLI.

**Spec:** `docs/XRAY_APP_SPEC.md` (this plan renames it to `docs/SPEC.md`) §4, §6.1, §12.6, §12.7, §14. `docs/ARCHITECTURE.md` §2, §10, §11. Overview and shared contract: `docs/superpowers/plans/2026-09-19-phase1-overview.md`.

## Global Constraints

- Never edit `app/backend/**` or `backend/**`. Plan A owns them. Never run `git rm -r app` as one command.
- Do not edit `CLAUDE.md`.
- Keep the template's pinned versions. Add new npm packages with `--save-exact`, stable releases only.
- Node 24 LTS (from `mise.toml`). Do not bump to 25 or 26.
- UI copy may be Spanish. Code, identifiers, commits and docs are English.
- `profile` ∈ `BANK | FUND | INSURER`, default `BANK`. `month` ∈ `2024-09 … 2026-08`, default `2026-08` (M23).
- Commits: Conventional Commits, English, lowercase subject.
- Shared contract items 1, 2, 3, 4, 6, 8 of the overview apply exactly: `frontend/` with npm, `/api` proxy, `./data:/data` mount, `XRAY_DEMO_MODE`, service names `backend` and `frontend`, and the JSON shape of `/api/pipeline/status`.

## File Structure

```
.gitignore                      + data/, frontend/dist/, .env
.editorconfig  mise.toml        moved from app/
README.md                       rewritten: how to run
docker-compose.yml              backend + frontend
docs/SPEC.md                    renamed from XRAY_APP_SPEC.md
docs/DATA_FINDINGS.md           9 profiling questions, answers pending data
docs/THRESHOLDS.md              10 pending anchors, provisional values
docs/DEPLOY.md                  host-agnostic deploy steps
scripts/profiling.sql           SPEC §4 queries for the DuckDB CLI
frontend/
  package.json  package-lock.json  .npmrc  Dockerfile  .dockerignore  nginx.conf
  src/main.tsx  src/routes.tsx  src/index.css
  src/api/client.ts  src/api/types.ts  src/api/usePipelineStatus.ts
  src/hooks/useGlobalParams.ts
  src/components/Layout.tsx  TopBar.tsx  PipelineBadge.tsx  (+ template Button, Card, Input, ErrorBoundary)
  src/pages/PortfolioPage.tsx  EntityPage.tsx  MonitorPage.tsx  ComparePage.tsx  MethodologyPage.tsx  NotFoundPage.tsx
```

---

### Task 1: Restructure the repo and switch the frontend to npm

**Files:**
- Move: `app/web/` → `frontend/`, `app/mise.toml` → `mise.toml`, `app/.editorconfig` → `.editorconfig`, `docs/XRAY_APP_SPEC.md` → `docs/SPEC.md`
- Delete: `app/mobile`, `app/packages`, `app/scripts`, `app/Makefile`, `app/docker-compose.yml`, `app/package.json`, `app/pnpm-lock.yaml`, `app/pnpm-workspace.yaml`, `app/.npmrc`, `app/.gitignore`, `app/.env.example`, `app/README.md`, `app/CHEATSHEET.md`
- Delete: `frontend/Dockerfile` (rewritten in Task 3), `frontend/src/lib/api.ts`, `frontend/src/pages/ItemPage.tsx`, `frontend/src/pages/ItemsPage.tsx`
- Modify: `frontend/package.json`, `.gitignore`
- Create: `frontend/.npmrc`

**Interfaces:**
- Produces: `frontend/` that installs with `npm ci` and builds with `npm run build`, with no `@app/shared` import.

- [ ] **Step 1: Move and delete paths one by one**

```bash
git mv app/web frontend
git mv app/mise.toml mise.toml
git mv app/.editorconfig .editorconfig
git mv docs/XRAY_APP_SPEC.md docs/SPEC.md
git rm -r -q app/mobile app/packages app/scripts
git rm -q app/Makefile app/docker-compose.yml app/package.json app/pnpm-lock.yaml \
  app/pnpm-workspace.yaml app/.npmrc app/.gitignore app/.env.example app/README.md app/CHEATSHEET.md
git rm -q frontend/Dockerfile frontend/src/lib/api.ts frontend/src/pages/ItemPage.tsx frontend/src/pages/ItemsPage.tsx
ls app
```

Expected: `ls app` shows only `backend`. Plan A moves it.

- [ ] **Step 2: Edit `frontend/package.json`**

Remove the line `"@app/shared": "workspace:*",` from `dependencies`. Change `"name": "web"` to `"name": "xray-frontend"`. Keep every other version as it is.

- [ ] **Step 3: Create `frontend/.npmrc`**

```
save-exact=true
```

- [ ] **Step 4: Install with npm and add Recharts**

```bash
cd frontend
rm -rf node_modules
npm install
npm install --save-exact recharts
grep -rn "@app/shared" src package.json && echo "LEFTOVER" || echo "clean"
```

Expected: `package-lock.json` exists, `recharts` has an exact version in `package.json`, output `clean`. Recharts is for Block 4; installing it now keeps later branches from touching the lockfile.

- [ ] **Step 5: Append to the root `.gitignore`**

```
# Data (CSVs and DuckDB file) never go to git
data/

# Frontend build
frontend/dist/

# Local env
.env
```

- [ ] **Step 6: Commit (the build is fixed in Task 2)**

```bash
git add -A .gitignore .editorconfig mise.toml docs frontend app
git commit -m "chore(repo): move web to frontend, drop pnpm workspace and mobile app"
```

---

### Task 2: Global params, layout, route shells and pipeline badge

**Files:**
- Create: `frontend/src/hooks/useGlobalParams.ts`
- Create: `frontend/src/api/{client,types,usePipelineStatus}.ts`
- Create: `frontend/src/components/{TopBar,PipelineBadge}.tsx`
- Modify: `frontend/src/components/Layout.tsx`, `frontend/src/routes.tsx`
- Create: `frontend/src/pages/{PortfolioPage,EntityPage,MonitorPage,ComparePage,MethodologyPage,NotFoundPage}.tsx`

**Interfaces:**
- Consumes: `GET /api/pipeline/status` (shared contract item 8).
- Produces:
  - `useGlobalParams(): { profile: Profile; month: string; setProfile(p: Profile): void; setMonth(m: string): void }`
  - `PROFILES`, `MONTHS`, `DEFAULT_MONTH`, type `Profile` from `hooks/useGlobalParams.ts`
  - `apiGet<T>(path: string): Promise<T>`, `apiPost<T>(path: string, body?: unknown): Promise<T>`, class `ApiError` from `api/client.ts`
  - type `PipelineStatus` from `api/types.ts`
  - `usePipelineStatus()` TanStack Query hook, query key `["pipeline-status"]`

- [ ] **Step 1: Create `src/hooks/useGlobalParams.ts`**

```ts
import { useSearchParams } from "react-router-dom";

export const PROFILES = ["BANK", "FUND", "INSURER"] as const;
export type Profile = (typeof PROFILES)[number];

/** M00 = 2024-09 … M23 = 2026-08 (SPEC §3.2). Block 4 reads this from /api/meta. */
export const MONTHS: string[] = Array.from({ length: 24 }, (_, i) =>
  new Date(Date.UTC(2024, 8 + i, 1)).toISOString().slice(0, 7),
);
export const DEFAULT_MONTH = "2026-08";

function isProfile(value: string | null): value is Profile {
  return value !== null && (PROFILES as readonly string[]).includes(value);
}

/** profile and month live in the URL so every view is linkable (SPEC §12.6). */
export function useGlobalParams() {
  const [params, setParams] = useSearchParams();
  const rawProfile = params.get("profile");
  const rawMonth = params.get("month");
  const profile: Profile = isProfile(rawProfile) ? rawProfile : "BANK";
  const month = rawMonth && MONTHS.includes(rawMonth) ? rawMonth : DEFAULT_MONTH;

  function update(key: "profile" | "month", value: string) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(key, value);
      return next;
    });
  }

  return {
    profile,
    month,
    setProfile: (p: Profile) => update("profile", p),
    setMonth: (m: string) => update("month", m),
  };
}
```

- [ ] **Step 2: Create `src/api/client.ts`, `src/api/types.ts`, `src/api/usePipelineStatus.ts`**

```ts
// client.ts — same-origin "/api": Vite proxies it in dev, nginx in Docker.
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }
  return (await res.json()) as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  return handle<T>(await fetch(`/api${path}`));
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return handle<T>(
    await fetch(`/api${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}
```

```ts
// types.ts — mirrors the backend DTOs. Keep in sync with the shared contract.
export type PipelineState = "IDLE" | "RUNNING" | "DONE" | "FAILED";

export interface PipelineStatus {
  state: PipelineState;
  runId: string | null;
  currentStage: string | null;
  percent: number;
  message: string | null;
  stageTimingsMs: Record<string, number>;
}
```

```ts
// usePipelineStatus.ts
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./client";
import type { PipelineStatus } from "./types";

/** Polls every 2 s while a run is active, every 30 s otherwise. */
export function usePipelineStatus() {
  return useQuery({
    queryKey: ["pipeline-status"],
    queryFn: () => apiGet<PipelineStatus>("/pipeline/status"),
    refetchInterval: (query) => (query.state.data?.state === "RUNNING" ? 2_000 : 30_000),
    retry: false,
  });
}
```

- [ ] **Step 3: Create `src/components/PipelineBadge.tsx`**

```tsx
import { usePipelineStatus } from "../api/usePipelineStatus";

const STYLES: Record<string, string> = {
  DONE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100",
  RUNNING: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
  IDLE: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200",
  OFFLINE: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
};

export function PipelineBadge() {
  const { data, isError } = usePipelineStatus();
  const state = isError ? "OFFLINE" : (data?.state ?? "IDLE");
  const detail =
    state === "RUNNING" && data?.currentStage ? ` · ${data.currentStage} ${data.percent}%` : "";
  return (
    <span
      title={data?.message ?? (isError ? "Backend no disponible" : "")}
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[state]}`}
    >
      Pipeline: {state}
      {detail}
    </span>
  );
}
```

- [ ] **Step 4: Create `src/components/TopBar.tsx`**

```tsx
import { NavLink, useLocation } from "react-router-dom";
import { MONTHS, PROFILES, useGlobalParams } from "../hooks/useGlobalParams";
import { PipelineBadge } from "./PipelineBadge";

const NAV = [
  { to: "/", label: "Cartera" },
  { to: "/monitor", label: "Monitor" },
  { to: "/compare", label: "Comparar" },
  { to: "/methodology", label: "Metodología" },
];

export function TopBar() {
  const { profile, month, setProfile, setMonth } = useGlobalParams();
  const { search } = useLocation();

  return (
    <header className="border-b border-gray-200 dark:border-gray-800">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
        <span className="text-lg font-semibold">X-Ray</span>
        <nav className="flex gap-3 text-sm">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={{ pathname: item.to, search }}
              end={item.to === "/"}
              className={({ isActive }) => (isActive ? "font-semibold text-brand" : "text-gray-500")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div role="radiogroup" aria-label="Perfil" className="flex rounded-md border border-gray-300 dark:border-gray-700">
            {PROFILES.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={p === profile}
                onClick={() => setProfile(p)}
                className={`px-3 py-1 text-sm ${p === profile ? "bg-brand text-white" : ""}`}
              >
                {p}
              </button>
            ))}
          </div>
          <select
            aria-label="Mes"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-md border border-gray-300 bg-transparent px-2 py-1 text-sm dark:border-gray-700"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={m}>
                {m} (M{String(i).padStart(2, "0")})
              </option>
            ))}
          </select>
          <PipelineBadge />
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 5: Replace `src/components/Layout.tsx`**

```tsx
import { Outlet } from "react-router-dom";
import { TopBar } from "./TopBar";

export function Layout() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <TopBar />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 6: Create the six page shells**

Every shell shows its title, the active profile and month, and the block that fills it. Use this shape for each file; the table gives the values.

```tsx
// src/pages/PortfolioPage.tsx
import { Card } from "../components/Card";
import { useGlobalParams } from "../hooks/useGlobalParams";

export function PortfolioPage() {
  const { profile, month } = useGlobalParams();
  return (
    <Card>
      <h2 className="text-xl font-semibold">Cartera</h2>
      <p className="mt-2 text-sm text-gray-500">
        Perfil {profile} · {month} — ranking, KPIs por estado y filtros de las seis preguntas (bloque 4).
      </p>
    </Card>
  );
}
```

| File | Export | Title | Text after `—` |
|---|---|---|---|
| `EntityPage.tsx` | `EntityPage` | `Entidad {id}` (read `id` with `useParams()`) | `gauges, timeline, drivers e indicadores (bloque 5).` |
| `MonitorPage.tsx` | `MonitorPage` | `Monitor` | `watchlist, alertas y replay (bloque 6).` |
| `ComparePage.tsx` | `ComparePage` | `Comparar` | `dos entidades lado a lado (bloque 8).` |
| `MethodologyPage.tsx` | `MethodologyPage` | `Metodología` | `pesos, catálogo de indicadores, lead time y caveats (bloques 7–8).` |

`EntityPage.tsx` in full:

```tsx
import { useParams } from "react-router-dom";
import { Card } from "../components/Card";
import { useGlobalParams } from "../hooks/useGlobalParams";

export function EntityPage() {
  const { id } = useParams();
  const { profile, month } = useGlobalParams();
  return (
    <Card>
      <h2 className="text-xl font-semibold">Entidad {id}</h2>
      <p className="mt-2 text-sm text-gray-500">
        Perfil {profile} · {month} — gauges, timeline, drivers e indicadores (bloque 5).
      </p>
    </Card>
  );
}
```

`NotFoundPage.tsx`:

```tsx
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <p className="text-sm">
      Página no encontrada. <Link to="/" className="text-brand underline">Volver a la cartera</Link>
    </p>
  );
}
```

- [ ] **Step 7: Replace `src/routes.tsx`**

```tsx
import { createBrowserRouter } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ComparePage } from "./pages/ComparePage";
import { EntityPage } from "./pages/EntityPage";
import { MethodologyPage } from "./pages/MethodologyPage";
import { MonitorPage } from "./pages/MonitorPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PortfolioPage } from "./pages/PortfolioPage";

// SPEC §12.7 pages. profile and month travel as search params on every route.
export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <PortfolioPage /> },
      { path: "entity/:id", element: <EntityPage /> },
      { path: "monitor", element: <MonitorPage /> },
      { path: "compare", element: <ComparePage /> },
      { path: "methodology", element: <MethodologyPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
```

- [ ] **Step 8: Typecheck, lint and build**

```bash
cd frontend && npm run typecheck && npm run lint && npm run build
```

Expected: no type errors, no lint errors, `dist/index.html` exists.

- [ ] **Step 9: Check in the browser**

Run `npm run dev`. Open `http://localhost:5173/?profile=FUND&month=2026-05`.
Expected: FUND is selected, the month select shows `2026-05 (M20)`, the badge shows `Pipeline: OFFLINE` (no backend yet). Click `Monitor`: the URL keeps `?profile=FUND&month=2026-05`. Click `INSURER`: the URL changes to `profile=INSURER`. Stop the dev server.

- [ ] **Step 10: Commit**

```bash
git add frontend
git commit -m "feat(frontend): add global profile and month bar, route shells and pipeline badge"
```

---

### Task 3: Docker images and compose

**Files:**
- Create: `frontend/Dockerfile`, `frontend/.dockerignore`
- Modify: `frontend/nginx.conf`
- Create: `docker-compose.yml` (root)

**Interfaces:**
- Consumes: `backend/Dockerfile` from plan A (not present on this branch; the compose file references it).
- Produces: `docker compose up --build` runs `backend` on 8080 and `frontend` on `${FRONTEND_PORT:-80}`.

- [ ] **Step 1: Create `frontend/Dockerfile` and `frontend/.dockerignore`**

```dockerfile
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

```
node_modules
dist
```

- [ ] **Step 2: Replace `frontend/nginx.conf`**

```nginx
server {
    listen 80;

    root /usr/share/nginx/html;
    index index.html;

    # Client-side routing: unknown paths fall back to index.html.
    location / {
        try_files $uri /index.html;
    }

    # Same-origin proxy to the "backend" compose service.
    # Buffering off and a long read timeout keep the SSE monitor replay alive (SPEC §8.5).
    location /api/ {
        proxy_pass http://backend:8080/api/;
        proxy_set_header Host $host;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_read_timeout 1h;
    }
}
```

- [ ] **Step 3: Create the root `docker-compose.yml`**

```yaml
# Full stack as deployed (SPEC §14). Put the CSVs in ./data/raw first.
#   docker compose up --build
#   XRAY_DEMO_MODE=true docker compose up -d     # frozen xray.duckdb, pipeline disabled
name: xray

services:
  backend:
    build: ./backend
    restart: unless-stopped
    environment:
      XRAY_DATA_DIR: /data
      XRAY_DEMO_MODE: ${XRAY_DEMO_MODE:-false}
    volumes:
      - ./data:/data
    ports:
      - "8080:8080"

  frontend:
    build: ./frontend
    restart: unless-stopped
    depends_on:
      - backend
    ports:
      - "${FRONTEND_PORT:-80}:80"
```

- [ ] **Step 4: Validate compose and test the frontend image alone**

```bash
docker compose config --quiet && echo "compose ok"
docker build -t xray-frontend frontend
docker run --rm -d --name xray-fe -p 8081:80 --add-host backend:127.0.0.1 xray-frontend
sleep 2 && curl -s -o /dev/null -w '%{http_code}\n' localhost:8081/monitor
docker stop xray-fe
```

Expected: `compose ok` and `200` (the SPA fallback works). `--add-host` lets nginx resolve `backend` without the backend image. If Docker is not running (Colima), report that and continue.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml frontend/Dockerfile frontend/.dockerignore frontend/nginx.conf
git commit -m "build(docker): add compose stack and frontend nginx image"
```

---

### Task 4: Profiling kit, findings and thresholds docs

**Files:**
- Create: `scripts/profiling.sql`, `docs/DATA_FINDINGS.md`, `docs/THRESHOLDS.md`

**Interfaces:**
- Produces: `duckdb < scripts/profiling.sql` run from the repo root answers SPEC §4 questions 1–9 from `data/raw/*.csv`.

- [ ] **Step 1: Create `scripts/profiling.sql`**

```sql
-- SPEC §4 data profiling. Run from the repo root:  duckdb < scripts/profiling.sql
-- Needs the Embat CSVs in data/raw/. Write the answers to docs/DATA_FINDINGS.md.
.mode markdown

CREATE OR REPLACE VIEW tx   AS SELECT * FROM read_csv_auto('data/raw/transactions.csv');
CREATE OR REPLACE VIEW inv  AS SELECT * FROM read_csv_auto('data/raw/invoices.csv');
CREATE OR REPLACE VIEW co   AS SELECT * FROM read_csv_auto('data/raw/companies.csv');
CREATE OR REPLACE VIEW bp   AS SELECT * FROM read_csv_auto('data/raw/banking_products.csv');
CREATE OR REPLACE VIEW debt AS SELECT * FROM read_csv_auto('data/raw/debt_products.csv');
CREATE OR REPLACE VIEW bal  AS SELECT * FROM read_csv_auto('data/raw/balances.csv');

.print '## Q1 transaction categories (fills flow-classes)'
SELECT category, COUNT(*) AS n,
       SUM(CASE WHEN amount < 0 THEN 1 ELSE 0 END) AS n_out,
       SUM(CASE WHEN amount > 0 THEN 1 ELSE 0 END) AS n_in
FROM tx GROUP BY 1 ORDER BY 2 DESC;

.print '## Q2a invoice document_type and amount sign'
SELECT document_type, COUNT(*) AS n,
       SUM(CASE WHEN amount < 0 THEN 1 ELSE 0 END) AS n_neg,
       SUM(CASE WHEN amount > 0 THEN 1 ELSE 0 END) AS n_pos
FROM inv GROUP BY 1 ORDER BY 2 DESC;

.print '## Q2b invoice counterparties seen on inflows vs outflows'
WITH cp AS (
  SELECT company_id, counterparty_id,
         SUM(CASE WHEN amount > 0 THEN 1 ELSE 0 END) AS n_in,
         SUM(CASE WHEN amount < 0 THEN 1 ELSE 0 END) AS n_out
  FROM tx WHERE counterparty_id IS NOT NULL GROUP BY 1, 2)
SELECT i.document_type, SUM(cp.n_in) AS tx_in, SUM(cp.n_out) AS tx_out
FROM inv i JOIN cp USING (company_id, counterparty_id)
GROUP BY 1 ORDER BY 1;

.print '## Q3 status values'
SELECT status, accounting_status, COUNT(*) AS n FROM tx GROUP BY 1, 2 ORDER BY 3 DESC;
SELECT status, COUNT(*) AS n,
       AVG(CASE WHEN payment_date IS NULL THEN 1.0 ELSE 0.0 END) AS share_payment_date_null
FROM inv GROUP BY 1 ORDER BY 2 DESC;

.print '## Q4 currencies and exchange_rate'
SELECT currency, COUNT(*) AS n_companies FROM co GROUP BY 1 ORDER BY 2 DESC;
SELECT c.currency, COUNT(*) AS n_tx,
       MIN(t.exchange_rate) AS min_rate, MEDIAN(t.exchange_rate) AS median_rate, MAX(t.exchange_rate) AS max_rate,
       MEDIAN(ABS(t.amount)) AS median_abs_amount,
       MEDIAN(ABS(t.amount) * t.exchange_rate) AS median_times_rate,
       MEDIAN(ABS(t.amount) / NULLIF(t.exchange_rate, 0)) AS median_div_rate
FROM tx t JOIN co c USING (company_id) GROUP BY 1 ORDER BY 2 DESC;

.print '## Q5 intragroup: counterparty_id equal to a company_id'
SELECT COUNT(*) AS n_tx, COUNT(DISTINCT t.counterparty_id) AS n_counterparties,
       SUM(CASE WHEN a.group_id = b.group_id THEN 1 ELSE 0 END) AS n_same_group
FROM tx t JOIN co a ON t.company_id = a.company_id
          JOIN co b ON t.counterparty_id = b.company_id;

.print '## Q6 debt products that have transactions'
SELECT d.type, COUNT(DISTINCT d.product_id) AS n_products, COUNT(DISTINCT t.product_id) AS n_with_tx
FROM debt d LEFT JOIN tx t ON t.product_id = d.product_id
GROUP BY 1 ORDER BY 2 DESC;

.print '## Q7 history length per company'
WITH h AS (
  SELECT company_id, COUNT(DISTINCT date_trunc('month', CAST(date AS DATE))) AS n_months
  FROM tx GROUP BY 1)
SELECT COUNT(*) AS n_companies,
       SUM(CASE WHEN n_months < 6 THEN 1 ELSE 0 END) AS lt_6_months,
       SUM(CASE WHEN n_months < 12 THEN 1 ELSE 0 END) AS lt_12_months,
       MIN(n_months) AS min_months, MEDIAN(n_months) AS median_months
FROM h;

.print '## Q8 missingness per company'
SELECT
  (SELECT COUNT(*) FROM co) AS n_companies,
  (SELECT COUNT(*) FROM co WHERE company_id NOT IN (SELECT DISTINCT company_id FROM inv)) AS no_invoices,
  (SELECT COUNT(*) FROM co WHERE company_id NOT IN (SELECT DISTINCT company_id FROM debt)) AS no_debt,
  (SELECT COUNT(*) FROM co WHERE company_id NOT IN (
     SELECT DISTINCT company_id FROM tx
     WHERE lower(category) LIKE '%tax%' OR lower(category) LIKE '%impuesto%' OR lower(category) LIKE '%hacienda%'
  )) AS no_tax_like_category;   -- adjust the patterns after Q1

.print '## Q9 balances by banking product type'
SELECT bp.type, COUNT(*) AS n, SUM(CASE WHEN b.balance < 0 THEN 1 ELSE 0 END) AS n_negative,
       MEDIAN(b.balance) AS median_balance
FROM bal b LEFT JOIN bp USING (product_id)
GROUP BY 1 ORDER BY 2 DESC;
```

- [ ] **Step 2: Run it if the data is present**

```bash
ls data/raw/*.csv && duckdb < scripts/profiling.sql > /tmp/profiling-output.md
```

If `data/raw` is empty or `duckdb` is not installed (`brew install duckdb`), skip this step and say so in the report. If a query fails because a column name differs, fix the query and note the real column name.

- [ ] **Step 3: Create `docs/DATA_FINDINGS.md`**

Write one section per question with this exact structure. If Step 2 ran, paste the result table under **Result** and write the decision. If it did not run, write `Not run yet: needs data/raw.` under **Result** and leave **Decision** and **Config change** as `Open.`

```markdown
# Data Findings (SPEC §4)

Source: `scripts/profiling.sql`. Each decision below changes `scoring-config.yml`, never code.

## Q1 — Transaction categories → flow classes
**Query:** Q1 in `scripts/profiling.sql`
**Result:**
**Decision:**
**Config change:** `scoring.flow-classes`
```

Repeat for Q2 (invoice direction ⚠, decision rule issued vs received), Q3 (status values, `booked-status-values`), Q4 (exchange_rate ⚠, `amount_eur` formula), Q5 (intragroup ⚠, rule), Q6 (debt products with transactions, `DEBT_LINE_UTIL` monthly or static), Q7 (history length, confidence), Q8 (missingness), Q9 (balances by type, `cash-product-types`).

- [ ] **Step 4: Create `docs/THRESHOLDS.md`**

```markdown
# Thresholds — status of the 10 pending anchors (SPEC §6.1)

Provisional anchors are live in `backend/src/main/resources/scoring-config.yml` with `status: pending`.
Quantiles come from `sql/90_threshold_quantiles.sql` after block 3, per `entity_type` of the active unit.
A human (Fran / José Javier) reviews every proposal before `status: closed`.

| Indicator | Fixed part | Provisional anchors | p5 / p25 / p50 / p75 / p95 | Proposal | Status |
|---|---|---|---|---|---|
| `PAY_DPO` | ≤ 60 days → 100 | [[60,100],[90,60],[120,30],[180,0]] | after block 3 | — | pending |
| `CF_NOCF_MARGIN` | < 0 → ≤ 35, 0 → 45 | [[-0.2,0],[-0.0001,35],[0,45],[0.1,75],[0.2,100]] | after block 3 | — | pending |
| `ACT_COLLECTIONS_GROWTH` | 0% → 50, symmetric | [[-0.3,0],[-0.15,25],[0,50],[0.15,75],[0.3,100]] | after block 3 | — | pending |
| `LIQ_MIN_BALANCE` | < 0 → ≤ 25 | [[-1,0],[0,25],[0.5,60],[1,80],[2,100]] | after block 3 | — | pending |
| `LEV_FACTORING_RELIANCE` | 0% → 100 | [[0,100],[0.2,70],[0.4,45],[0.7,15],[1.0,0]] | after block 3 | — | pending |
| `PAY_OVERDUE_PAYABLES` | 0% → 100 | [[0,100],[0.1,75],[0.25,45],[0.5,15],[0.8,0]] | after block 3 | — | pending |
| `DEL_OVERDUE_RECEIVABLES` | 0% → 100 | [[0,100],[0.1,75],[0.25,45],[0.5,15],[0.8,0]] | after block 3 | — | pending |
| `LEV_FUNDING_COST` | spread over `reference-rate` | [[0,100],[0.01,85],[0.025,60],[0.05,30],[0.08,0]] | after block 3 | — | pending |
| `CF_VOLATILITY` | — | [[0.1,100],[0.3,70],[0.6,40],[1.0,15],[2.0,0]] | after block 3 | — | pending |
| `CON_CUSTOMER_CHURN` | — | [[0.0,100],[0.1,75],[0.25,45],[0.5,15],[0.8,0]] | after block 3 | — | pending |

`reference-rate` (limit engine and `LEV_FUNDING_COST`) is a placeholder of 0.035. Set the current market rate by hand.
```

- [ ] **Step 5: Commit**

```bash
git add scripts docs/DATA_FINDINGS.md docs/THRESHOLDS.md
git commit -m "docs(data): add profiling queries and findings and thresholds trackers"
```

---

### Task 5: README and deploy guide

**Files:**
- Modify: `README.md` (root)
- Create: `docs/DEPLOY.md`

- [ ] **Step 1: Replace `README.md`**

```markdown
# X-Ray — HackSpain 2026 · Embat challenge

Monthly financial health score (0–100, Level + Trajectory) for SME groups, with
explanations, alerts and a working-capital limit engine for banks.

Read `CLAUDE.md`, then `docs/SPEC.md` and `docs/ARCHITECTURE.md`.

## Run locally
1. Put the Embat CSVs in `data/raw/`.
2. Backend: `cd backend && ./mvnw spring-boot:run` (port 8080, Swagger at `/swagger-ui.html`).
3. Frontend: `cd frontend && npm install && npm run dev` (port 5173, proxies `/api`).

## Run the full stack
`docker compose up --build`, then open `http://localhost`.

## Data profiling
`duckdb < scripts/profiling.sql` → write the answers to `docs/DATA_FINDINGS.md`.

## Deploy
See `docs/DEPLOY.md`.
```

- [ ] **Step 2: Create `docs/DEPLOY.md`**

```markdown
# Deploy (SPEC §14)

The deployed stack runs in demo mode on a frozen `data/xray.duckdb`.
Choosing the host and logging in is a human step. Any host with Docker Compose works (a VPS is the simplest).

## First deploy (block 1, empty app)
1. On the host: `git clone <repo> && cd <repo>`.
2. `mkdir -p data && docker compose up --build -d`.
3. Open `http://<host>/`. The top bar must show and the badge must show `Pipeline: DONE`.

## Later deploys (after each block)
1. Locally: run the pipeline, then copy `data/xray.duckdb` to the host with `scp data/xray.duckdb <host>:<repo>/data/`.
2. On the host: `git pull && XRAY_DEMO_MODE=true docker compose up --build -d`.
3. Check `http://<host>/api/pipeline/status` → `IDLE`, and `POST /api/pipeline/run` → `409`.

## Checks from another device
- `/` loads in under 1 s.
- `/?profile=FUND&month=2026-05` keeps the params on every nav link.
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/DEPLOY.md
git commit -m "docs: rewrite readme and add deploy guide"
```

- [ ] **Step 4: Report**

Report to the human: the result of each check in Tasks 2–4, whether profiling ran, and anything that differs from this plan. Do not merge.
