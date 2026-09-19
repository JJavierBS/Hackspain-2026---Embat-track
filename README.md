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
`setup` ejecuta las pruebas Java, compila el frontend y prepara la caché sin consumir tokens. **S7 usa frontend 5174 y backend 8081** para no mezclarse con la web de desarrollo habitual. Abre `http://127.0.0.1:5174/entity/GROUP_0039?profile=BANK&month=2026-07#sugerencias` y compara GROUP_0101. El arranque comprueba que el backend devuelve el módulo S7 y muestra un enlace al caso configurado. `S7_FRONTEND_PORT`/`S7_BACKEND_PORT` permiten elegir otros puertos. Ctrl+C detiene ambos procesos. No modificar pesos ni recalcular la base de demo.

La sección **«Insights y recomendaciones»** aparece al principio de la ficha, antes de la gráfica, incluso sin puntuación. Distingue IA de Helmcode, recomendaciones por reglas y falta de datos. La cartera abre agosto, pero los ejemplos IA predeterminados son de julio: el enlace «Abrir caso configurado» lleva al periodo correcto. Hasta tres prioridades de atención con evidencia, sin puntos recuperables ni comparación de impactos de actuaciones.

**Helmcode preconfigurado:** modelo `glm5.3`, GROUP_0039/GROUP_0101, julio 2026 y tres perfiles. `start` prepara las respuestas IA si encuentra una clave en la variable privada `HELMCODE_API_KEY` o en `.env.local`; reutiliza la caché válida. Sin clave usa plantillas. `node scripts/local.mjs start-offline` no hace llamadas nuevas aunque exista clave.

Para guardar la clave una sola vez en cada ordenador: con la app detenida, `./Preparar-IA.ps1 -GuardarLocal`. La pide sin mostrarla, crea `.env.local` excluido de Git y prueba la IA; no sobrescribe configuraciones existentes. Alternativa multiplataforma: proporcionar `HELMCODE_API_KEY` mediante un gestor de secretos y ejecutar `node scripts/local.mjs configure-ia`. Después basta `node scripts/local.mjs start`. **Git no distribuye las claves:** cada compañero configura la suya por un canal seguro. No instalar modelos.

`HELMCODE_MODEL=deepseek-v4-flash` selecciona la alternativa; `S7_ENTITY_IDS`/`S7_MONTH` cambian casos (máximo seis entidades por lote). Las variables explícitas prevalecen sobre `.env.local`. La preparación también puede ejecutarse con `node scripts/local.mjs prepare-ia`. Timeout 20 s, sin reintentos automáticos; errores conservan plantillas. La IA selecciona formulaciones verificadas, no prosa libre ni prioridades. Envía agregados sin identificadores empresariales/texto bancario. Navegar nunca llama al proveedor y el proceso web no recibe la clave. La ficha identifica Helmcode o plantilla; cambios de run/config/modelo/catálogo/prompt invalidan caché.

Verificado el acceso real a GLM: seis respuestas aceptadas en septiembre 2026; saldo de 600M y acceso a Deepseek no comprobados. Las claves usadas para las pruebas no se incluyen en código, Git ni logs.

Verificación: `node --test scripts/local-settings.test.mjs`; `node scripts/check-private-config.mjs` antes de commit/push; `cd frontend` y `npm run lint`. Con la app iniciada, `node scripts/smoke.mjs` verifica doce fichas; `CHROME_PATH` añade Chrome aislado y `S7_EXPECT_HELMCODE=true` exige IA real en los seis casos de julio. `.env.local`, datos y cachés están ignorados. Detener el backend antes de preparar DuckDB.
