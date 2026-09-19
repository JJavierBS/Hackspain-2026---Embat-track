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

## Prueba de S7 en rama independiente

Rama: `feat/s7-prioridades-atencion`, creada desde `main@7aeca32`. El merge queda pendiente de aceptación. Java 21 (JDK) y Node.js 24; no requiere Docker ni CSV para usar la base sintética incluida.

Desde la raíz de esta rama:
```sh
node scripts/local.mjs setup
node scripts/local.mjs start
```
`setup` ejecuta las pruebas Java, compila el frontend y prepara la caché sin consumir tokens. Abre `http://127.0.0.1:5173/entity/GROUP_0039?profile=BANK&month=2026-07` y compara GROUP_0101. Ctrl+C detiene ambos procesos. No modificar pesos ni recalcular la base de demo.

S7 muestra hasta tres **prioridades de atención**, con evidencia del mes/perfil. El orden usa peso efectivo del indicador y, en empate, peor nivel; no estima puntos recuperables. El catálogo cubre gastos, vencidos, pagos a proveedores y caída de cobros; se abstiene si faltan señales. No incluye comparación de impactos de actuaciones.

**Helmcode es opcional:** sin clave funcionan plantillas. Con la app detenida, `./Preparar-IA.ps1` solicita consentimiento y clave sin mostrarla ni guardarla. GLM `glm5.3` por defecto; alternativa `./Preparar-IA.ps1 -Modelo deepseek-v4-flash`. Arrancar con el mismo `HELMCODE_MODEL`. No instalar modelos; código promocional y clave API son distintos. Bolsa de 600M y acceso real pendientes de comprobar.

Alternativa multiplataforma: variable privada `HELMCODE_API_KEY` y `node scripts/local.mjs prepare-ia`. Por defecto prepara dos grupos/julio/tres perfiles (hasta seis llamadas). `S7_ENTITY_IDS` y `S7_MONTH` cambian los casos; máximo seis entidades por lote. Timeout 20 s, sin reintentos automáticos. La IA selecciona formulaciones verificadas, no prosa libre ni prioridades. Envía agregados sin identificadores empresariales/texto bancario; fallo o JSON inválido conserva plantillas. La ficha distingue las dos fuentes. Navegar nunca llama al proveedor; cambios de run/config/modelo/catálogo/prompt invalidan caché. Claves nunca en Git, frontend ni logs.

Verificación: `cd frontend` y `npm run lint`; con la app iniciada, `node scripts/smoke.mjs` desde la raíz (doce fichas por API; `CHROME_PATH` añade Chrome aislado). Datos y cachés quedan ignorados en `data/`, `.local-maven/`, `.local-npm/`, `backend/target/` y `frontend/node_modules/`. Detener el backend antes de preparar DuckDB.
