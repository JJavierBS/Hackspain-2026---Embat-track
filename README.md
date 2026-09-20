<div align="center">

# X-Ray

**Un score mensual de salud financiera para pymes, leído en el rastro de su dinero —
y un límite de circulante que se recalcula solo a partir de ese score.**

[![Demo](https://img.shields.io/badge/demo-en%20vivo-3878f6?style=flat-square)](https://hackspain-2026-embat-track.vercel.app/)
[![API](https://img.shields.io/badge/API-Swagger-85ea2d?style=flat-square)](https://hackspain-2026-embat-track.onrender.com/swagger-ui.html)
![Java](https://img.shields.io/badge/Java-21-orange?style=flat-square)
![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.5-6db33f?style=flat-square)
![DuckDB](https://img.shields.io/badge/DuckDB-embebido-fff000?style=flat-square)
![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square)

HackSpain 2026 · Reto Embat · Equipo Byte_Me

**[▶ Abrir la demo](https://hackspain-2026-embat-track.vercel.app/)** ·
[Metodología](https://hackspain-2026-embat-track.vercel.app/methodology) ·
[English version ↓](#x-ray-english)

</div>

---

## Índice

1. [El problema](#el-problema)
2. [Qué responde el sistema](#qué-responde-el-sistema)
3. [El producto, y quién paga](#el-producto-y-quién-paga)
4. [Lo que medimos, incluido lo que falla](#lo-que-medimos-incluido-lo-que-falla)
5. [Cómo funciona](#cómo-funciona)
6. [Puesta en marcha](#puesta-en-marcha)
7. [La demo](#la-demo)
8. [API](#api)
9. [Estructura del repositorio](#estructura-del-repositorio)
10. [Documentación](#documentación)
11. [Lo que el sistema no puede ver](#lo-que-el-sistema-no-puede-ver)
12. [Equipo](#equipo)

---

## El problema

En agosto de 2026, dos grupos del dataset de Embat puntúan casi igual:

| | Final | Trayectoria | |
|---|---:|---:|---|
| `GROUP_0011` | 56.1 | **83.7** | subiendo con fuerza |
| `GROUP_0007` | 54.7 | **17.0** | cayendo con fuerza |

1,4 puntos de diferencia. Unas cuentas anuales depositadas no los distinguen. Un rating que se
refresca una vez al año, tampoco. Su caja sí: uno cobra más rápido cada mes, el otro estira a sus
proveedores y quema su colchón.

X-Ray lee ese rastro — 2,5 millones de movimientos bancarios, 898 mil facturas y 2.239 productos de
deuda a lo largo de 24 meses — y lo convierte en un número que se mueve cada mes, con el motivo al
lado. La demo abre sobre esta pareja.

## Qué responde el sistema

Seis preguntas, por entidad y por mes. Salen directamente del reto.

| Pregunta | Dónde la responde X-Ray |
|---|---|
| Quién está sano | Score final 0–100 y una banda de S a E |
| Quién está mejorando | Trayectoria 0–100, donde 50 significa plano |
| Quién empieza a torcerse | Estado "empieza a torcerse": el nivel aún es bueno, la dirección no |
| Bache o deterioro real | Un detector de cambio CUSUM, más un test de pendiente y uno de persistencia |
| Por qué ha cambiado | Un desglose aditivo exacto: cada driver, en puntos, con su valor crudo |
| Con cuánta antelación se vio | Antelación medida contra eventos proxy documentados |

El score nunca predice una quiebra. Lee comportamiento en las dos direcciones y dice cuándo cambió.

## El producto, y quién paga

El score es el motor. El producto que va encima es un **límite de circulante que se recalcula cada
mes**, con una parrilla de precios por banda, un tope por DSCR y un simulador que responde a una
petición de importe y plazo concretos.

**Paga primero la pyme que ya usa Embat.** El reto dice que el comprador evidente es la empresa que
entrega los datos, y los datos son legalmente suyos: ningún banco ve un score sin su consentimiento.
Compra un límite que se mueve con su propia caja en lugar de mandar el mismo dossier a ocho bancos.

**Los bancos y las aseguradoras pagan después**, por línea abierta o por póliza emitida, con el
consentimiento de la pyme. Para un banco el argumento es un número medido: sobre este dataset,
**el motor recortó el límite antes del evento de riesgo en 70 de 81 casos, con 4,5 meses de
antelación media**.

Los tres grandes clientes tienen cada uno su vista del mismo score, seleccionable con un parámetro
en la URL (`?profile=BANK|FUND|INSURER`):

- **Banco** (`BANK`) — el límite de circulante que se recalcula cada mes, con su spread por banda y su
  tope por DSCR. Es el producto descrito arriba.
- **Fondo** (`FUND`) — un screening de momentum que encuentra a la empresa que está en 45 camino de 65.
- **Aseguradora** (`INSURER`) — una prima de crédito comercial que se mueve con la banda cada mes, no
  una vez al año.

Un perfil es una tabla de pesos distinta sobre el mismo motor: cambia qué categorías pesan para ese
comprador, no cómo se calcula el score. Las tres vistas se materializan en el pipeline, así que cambiar de
perfil reordena la cartera entera sin recalcular nada.

Razonamiento y estructura de precios: [`docs/PRODUCT.md`](docs/PRODUCT.md).

## Lo que medimos, incluido lo que falla

Perfil BANK, 250 grupos, 24 meses, contra eventos proxy documentados. Todos los números salen de
`/api/analytics/lead-time` y son reproducibles desde la base de datos congelada.

**La señal que anticipa es el motor de límites.**

| | |
|---|---:|
| Eventos de deterioro con un recorte de límite previo | **70 de 81 — 86 %** |
| Antelación media del recorte | **4,5 meses** |
| Mediana | 3,0 meses |

Lee el nivel y la trayectoria a la vez, así que se mueve mientras la señal de estado todavía dice
que la entidad está bien.

La señal de estado por sí sola es más débil, y también lo publicamos:

| | Deterioro | Mejora |
|---|---:|---:|
| Eventos proxy | 81 | 51 |
| Detectados con ≥ 1 mes de antelación | 40 % | 47 % |
| Antelación media | 1,8 meses | 1,2 meses |
| Tasa de falsas alarmas | 65 % | 76 % |
| **Lift sobre el azar** | **0,96** | **1,54** |

> **Mira el lift, no la antelación.** Un lift de 1 significa que la señal no se dispara antes de un
> evento más de lo que se dispara en cualquier otro mes. **En deterioro, la señal de estado no le
> gana al azar.** En mejora sí, un 54 % por encima. Las dos cifras están en la página de Metodología
> junto al motor de límites, porque un número que solo cuenta sus aciertos no es un número con el
> que nadie pueda asumir un riesgo.

## Cómo funciona

```
data/raw/*.csv ─► SQL en DuckDB ──────────► Java, en memoria ──────► tablas de     ─► REST ─► React
  9 ficheros      ingesta, staging,          anclas, trayectoria,     resultados
  2,5 M filas     eliminación intragrupo,    categorías, perfiles,    250 × 24 × 3
                  reconstrucción de saldos,  explicación, CUSUM,      materializadas
                  agregados mensuales,       regímenes, alertas,
                  22 indicadores crudos      límites, primas,
                                             antelación, proyección
```

La propiedad que mantiene pequeño todo el diseño: **después de la capa SQL los datos son
diminutos.** 250 entidades × 24 meses × 22 indicadores son 132.000 filas. Todo lo que viene después
son colecciones Java normales. Sin streaming, sin framework de batch, sin caché.

Tres reglas sostienen el conjunto:

1. **Causalidad.** El valor del mes `m` solo lee datos con fecha hasta el cierre del mes `m`.
   `LookAheadTest` trunca un panel en M12 y comprueba que ningún valor anterior se mueve. Sin esto,
   las cifras de antelación no significarían nada.
2. **Anclas, nunca percentiles.** Cada indicador convierte su valor crudo a 0–100 mediante anclas
   fijas, acotadas y lineales a tramos. Una entidad que el sistema no ha visto nunca puntúa
   exactamente igual que una de entrenamiento, que es lo que pide el test oculto.
3. **Ausente no es cero.** Un indicador no disponible se descarta y los pesos se renormalizan sobre
   lo que queda. Una empresa sin ERP conectado se puntúa, se marca, y no se inventa nada.

El score se descompone de forma exacta, así que la explicación es aritmética y no un relato:

```
Final − 50 = Σ contribución_i     (comprobado con tolerancia 0,05 por ExplanationSumTest,
                                   para cada combinación entidad-mes-perfil)
```

**Stack.** Java 21, Spring Boot 3, Maven, DuckDB embebido sobre JDBC, SQL plano en ficheros
numerados, springdoc-openapi, JUnit 5. React 19, TypeScript, Vite, TanStack Query, Recharts,
Tailwind 4. Sin JPA, sin Postgres, sin servidor de modelos y sin una sola llamada externa en runtime.

**Configuración antes que código.** Cada ancla, peso, umbral, λ y parámetro de producto vive en
`scoring-config.yml`. La página `/algorithm` los expone todos a un experto de riesgos, previsualiza
una edición sobre una entidad usando el código del propio pipeline, y escribe un fichero de
overrides. Añadir un indicador son una constante de enum, una entrada YAML y un INSERT de SQL.

## Puesta en marcha

### Requisitos

| | Versión | Nota |
|---|---|---|
| JDK | 21+ | `mise.toml` fija `temurin-21`. JDKs más nuevos compilan y arrancan sin problema. |
| Node | 20+ | `mise.toml` fija la 24. **Usa npm** — `package-lock.json` es el lockfile que está en git. |
| Docker | reciente | Solo para la vía de un único comando. |

Maven y el motor DuckDB se descargan en la primera compilación; no hay nada más que instalar.

### Opción A — modo demo, sin necesidad de los CSV (empieza por aquí)

El repositorio incluye un **corte congelado de la base de datos de resultados**, así que la demo
funciona sin los CSV y sin ejecutar el pipeline. Es exactamente como corre producción
([`docs/DEPLOY.md`](docs/DEPLOY.md)).

```bash
# 1. descomprime la base de datos congelada (47 MB en git → 108 MB en disco)
mkdir -p data
gzip -dc backend/demo/xray-demo.duckdb.gz > data/xray.duckdb

# 2. backend — arranca en ~2 s y sirve los datos precalculados
cd backend && XRAY_DEMO_MODE=true ./mvnw spring-boot:run

# 3. frontend, en una segunda terminal
cd frontend && npm install && npm run dev
```

Abre **http://localhost:5173**. La API está en `:8080` y Swagger UI en
`http://localhost:8080/swagger-ui.html`.

En modo demo el pipeline no se ejecuta nunca: "Aplicar y recalcular" en `/algorithm` y
`POST /api/pipeline/run` quedan deshabilitados. Todo lo demás funciona —incluidos el what-if por
sector, los presets propios y el simulador de límite— porque esos calculan una sola entidad por
petición y no escriben nada.

### Opción B — el pipeline completo desde los CSV crudos

```bash
# 1. deja los nueve CSV de Embat en data/raw/ (en .gitignore, ~617 MB)
# 2. arranca; el pipeline se lanza solo cuando las tablas de resultados están vacías (~1 min)
cd backend && ./mvnw spring-boot:run
cd frontend && npm install && npm run dev
```

```bash
curl localhost:8080/api/pipeline/status      # progreso mientras se ejecuta
curl -X POST localhost:8080/api/pipeline/run # relanzarlo a mano
```

### Opción C — el stack completo en un comando

```bash
docker compose up --build      # http://localhost, backend en :8080
```

Compose monta `./data`, así que usa la base de datos que ya tengas ahí. `XRAY_DEMO_MODE` vale `true`
por defecto; ponlo a `false` para permitir un recálculo (necesita los CSV en `data/raw/`).

### Variables de entorno

| Variable | Por defecto | Para qué sirve |
|---|---|---|
| `XRAY_DEMO_MODE` | `false` | `true` sirve la base congelada y no ejecuta nunca el pipeline |
| `XRAY_DATA_DIR` | `../data` | Dónde viven `xray.duckdb`, `raw/` y `scoring-overrides.yml` |
| `SERVER_PORT` / `PORT` | `8080` | Puerto de la API. `PORT` gana, para los PaaS que lo inyectan |
| `XRAY_DUCKDB_MEMORY_LIMIT` | sin valor | `memory_limit` de DuckDB, p. ej. `64MB`. Necesario en contenedores pequeños |
| `VITE_API_TARGET` | `http://localhost:8080` | Backend al que apunta el proxy de desarrollo de Vite |

### Tests

```bash
cd backend && ./mvnw test      # 31 tests; los seis con nombre propio respaldan las seis afirmaciones
cd frontend && npm run typecheck && npm run lint && npm run build
```

Los seis que importan están en [`docs/RULES.md`](docs/RULES.md) §4: `AnchorInterpolatorTest`,
`ExplanationSumTest`, `LookAheadTest`, `ProfileRenormalizationTest`, `RollupTest` y
`ScoringConfigValidationTest`.

### Si algo falla

| Síntoma | Causa y solución |
|---|---|
| `IOException: Could not set lock on file` | DuckDB solo admite un proceso por fichero. Para el otro backend primero. |
| Páginas vacías, todos los scores a `null` | No hay base de datos en `data/xray.duckdb`. Ejecuta el paso 1 de la opción A. |
| El pipeline arranca sin querer | `XRAY_DEMO_MODE` no está a `true` y las tablas de resultados están vacías. |
| La UI muestra datos sospechosamente sanos | Está puesto `VITE_MOCKS=true`. Quítalo: eso es `npm run dev:mock`, no `npm run dev`. |
| `/monitor` o `/entity/...` dan 404 al recargar | Falta el fallback de SPA en la configuración del host ([`docs/DEPLOY.md`](docs/DEPLOY.md)). |

## La demo

Seis páginas. `profile` y `month` viven en la URL, así que toda vista es un enlace.

| Página | Qué muestra |
|---|---|
| **Cartera** | 250 entidades ordenadas y filtrables por las seis preguntas. El selector de perfil reordena todo. |
| **Entidad** | El score, sus drivers, la línea temporal con regímenes y changepoints, el panel de producto y un what-if por sector. |
| **Monitor** | La watchlist y una reproducción de alertas: los meses M06 a M23 pasan en directo y el sistema levanta la mano solo. |
| **Comparar** | Dos entidades lado a lado, precargadas con la pareja de arriba. |
| **Metodología** | Cada regla, cada parámetro, la antelación medida y las limitaciones. |
| **Algoritmo** | Todos los parámetros, editables, con vista previa sobre una entidad. Para un experto de riesgos. |

## API

Documentación interactiva en [`/swagger-ui.html`](https://hackspain-2026-embat-track.onrender.com/swagger-ui.html).
Ninguna petición recalcula nada: la API lee tablas de resultados y apunta a menos de 1 s por página.

| Endpoint | Devuelve |
|---|---|
| `GET /api/meta` | Unidad de scoring, meses disponibles, estado del run |
| `GET /api/portfolio` | La cartera ordenada para un `profile` y un `month` |
| `GET /api/entities/{id}` | Score, bandas, drivers y explicación aditiva de una entidad |
| `GET /api/entities/{id}/timeline` | Serie mensual con regímenes, changepoints y proyección |
| `GET /api/entities/{id}/limit` · `/premium` | El límite de circulante y la prima de la aseguradora |
| `POST /api/entities/{id}/limit/simulate` | What-if de importe y plazo. No escribe nada |
| `POST /api/entities/{id}/tuning` | What-if de configuración sobre una entidad. No escribe nada |
| `GET /api/monitor/watchlist` · `/alerts` | Watchlist y alertas con sus transiciones |
| `GET /api/analytics/lead-time` | Las cifras de antelación de la sección de resultados |
| `GET /api/methodology` | Cada regla y cada parámetro activos, para la página de Metodología |
| `GET /api/config` · `PUT` · `DELETE` | Configuración activa y overrides del experto |
| `GET /api/export/submission` | La entrega en el formato del reto |

Las dos únicas peticiones que calculan algo son los dos what-if, y ninguno escribe
([`docs/RULES.md`](docs/RULES.md) regla 8).

## Estructura del repositorio

```
backend/                  Spring Boot + DuckDB
  src/main/java/com/xray/
    domain/               Modelo y servicios puros. Sin Spring, sin java.sql
    pipeline/stages/      S00 … S90, una etapa por paso
    application/          Casos de uso y consultas que lee la API
    alerting/rules/       Una clase por regla de alerta, predicados puros
    config/               scoring-config.yml mapeado a records tipados
    infrastructure/       Controladores REST, DuckDB, DTOs
  src/main/resources/
    scoring-config.yml    El único sitio donde viven anclas, pesos, umbrales y λ
    presets.yml           Presets de cliente, cada valor con su fuente
    sectors.yml           Presets sectoriales del ajuste por entidad
    sql/                  23 ficheros numerados, se ejecutan en orden de nombre
  demo/                   La base de datos congelada que se despliega
frontend/                 React 19 + TypeScript + Vite
  src/pages/              Las seis páginas de la demo
  src/components/         Componentes del sistema de diseño
  src/api/                Cliente, tipos y hooks de TanStack Query
docs/                     15 documentos, uno por tema. Empieza por docs/README.md
scripts/                  Herramientas offline. Nada de esto corre en producto
data/                     CSV crudos y xray.duckdb (en .gitignore)
```

## Documentación

Quince ficheros en [`docs/`](docs/), cada uno con un dueño. [`docs/README.md`](docs/README.md) es el
índice completo; estos son los cuatro por los que empezar.

| Fichero | De qué es dueño |
|---|---|
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | **Cada decisión, con su motivo y su evidencia.** Léelo antes de discutir nada. |
| [`docs/RULES.md`](docs/RULES.md) | Las reglas de ingeniería que el código cumple, las convenciones y los tests que las vigilan |
| [`docs/SPEC.md`](docs/SPEC.md) | *Qué* calcular: datos, indicadores, anclas, scoring, regímenes, alertas, productos, API |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | *Cómo* está construido: paquetes, contratos, etapas, ficheros SQL, puntos de extensión, tests |

Después, según la pregunta: los datos ([`DATA_FINDINGS.md`](docs/DATA_FINDINGS.md)), las anclas
([`THRESHOLDS.md`](docs/THRESHOLDS.md)), los pesos y su test de sensibilidad
([`WEIGHTS.md`](docs/WEIGHTS.md)), los presets ([`PRESETS.md`](docs/PRESETS.md)), la página de
experto ([`ALGORITHM_PAGE.md`](docs/ALGORITHM_PAGE.md)), las dos salidas que no puntúan
([`FORECAST.md`](docs/FORECAST.md), [`RECOMMENDATIONS.md`](docs/RECOMMENDATIONS.md)), el producto
([`PRODUCT.md`](docs/PRODUCT.md)), el sistema de diseño ([`DESIGN.md`](docs/DESIGN.md)), el
despliegue ([`DEPLOY.md`](docs/DEPLOY.md)) y el enunciado original sin editar
([`embat-track.md`](docs/embat-track.md)).

## Lo que el sistema no puede ver

Está dicho en la UI, no escondido en una nota al pie.

- No hay balance ni cuenta de resultados. EBITDA, Deuda/EBITDA y DSCR son proxies de flujo de caja.
- La deuda concedida y dispuesta es una única foto a 2026-09-01. Los indicadores que la usan van marcados.
- Los datos son sintéticos y no traen etiqueta de impago. La antelación se mide contra eventos proxy.
- Diez de las 22 anclas son provisionales y están marcadas como tal hasta que las cierre un experto de riesgos.
- La parrilla de spreads, los multiplicadores de prima y el tipo de referencia son supuestos nuestros, no datos de mercado.

## Equipo

**Byte_Me** — HackSpain 2026, reto Embat (Madrid, 18–20 de septiembre de 2026).

- José Javier Bravo
- Francisco Moreno
- María de la Almudena Martín
- Luis Gómez

---

<div align="center">

# X-Ray (English)

**A monthly financial health score for SMEs, read from their money trail —
and a working-capital limit that recalculates itself from that score.**

[![Demo](https://img.shields.io/badge/demo-live-3878f6?style=flat-square)](https://hackspain-2026-embat-track.vercel.app/)
[![API](https://img.shields.io/badge/API-Swagger-85ea2d?style=flat-square)](https://hackspain-2026-embat-track.onrender.com/swagger-ui.html)
![Java](https://img.shields.io/badge/Java-21-orange?style=flat-square)
![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.5-6db33f?style=flat-square)
![DuckDB](https://img.shields.io/badge/DuckDB-embedded-fff000?style=flat-square)
![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square)

HackSpain 2026 · Embat track · Team Byte_Me

**[▶ Open the demo](https://hackspain-2026-embat-track.vercel.app/)** ·
[Methodology](https://hackspain-2026-embat-track.vercel.app/methodology) ·
[Versión en español ↑](#x-ray)

</div>

---

## Contents

1. [The problem](#the-problem)
2. [What the system answers](#what-the-system-answers)
3. [The product, and who pays for it](#the-product-and-who-pays-for-it)
4. [What we measured, including what is weak](#what-we-measured-including-what-is-weak)
5. [How it works](#how-it-works)
6. [Getting started](#getting-started)
7. [The demo](#the-demo)
8. [API](#api-1)
9. [Repository layout](#repository-layout)
10. [Documentation](#documentation)
11. [What it cannot see](#what-it-cannot-see)
12. [Team](#team)

---

## The problem

In August 2026 two groups in the Embat dataset score almost the same:

| | Final | Trajectory | |
|---|---:|---:|---|
| `GROUP_0011` | 56.1 | **83.7** | climbing hard |
| `GROUP_0007` | 54.7 | **17.0** | falling hard |

1.4 points apart. A filed annual account cannot tell them apart. A rating that refreshes once a year
cannot either. Their cash can: one collects faster every month, the other stretches its suppliers and
burns its buffer.

X-Ray reads that trail — 2.5 million bank transactions, 898 thousand invoices and 2,239 debt products
over 24 months — and turns it into a number that moves every month, with the reason next to it. The
demo opens on this pair.

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

**Banks and insurers pay second**, per line opened or per policy written, with the SME's
consent. For a bank the pitch is one measured number: on this dataset **the engine cut the limit
before the risk event in 70 of 81 cases, 4.5 months ahead on average**.

Each of the three buyers gets its own view of the same score, selected by one parameter in the URL
(`?profile=BANK|FUND|INSURER`):

- **Bank** (`BANK`) — the working-capital limit that recalculates every month, with its spread by band
  and its DSCR cap. That is the product described above.
- **Fund** (`FUND`) — a momentum screen that finds the company at 45 that is on its way to 65.
- **Insurer** (`INSURER`) — a trade-credit premium that moves with the band every month instead of
  once a year.

A profile is a different weight table over the same engine: it changes which categories count for
that buyer, not how the score is computed. All three are materialized at pipeline time, so switching
profile re-ranks the whole portfolio without recomputing anything.

Reasons and price structure: [`docs/PRODUCT.md`](docs/PRODUCT.md).

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

> **Read the lift, not the lead.** A lift of 1 means the signal fires no more often before an event
> than any other month does. **On deterioration the status signal does not beat chance.** On
> improvement it does, by half again. Both figures sit on the Methodology page next to the limit
> engine, because a number that only reports its wins is not a number anyone can underwrite with.

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
Final − 50 = Σ contribution_i     (asserted to 0.05 by ExplanationSumTest,
                                   for every entity-month-profile)
```

**Stack.** Java 21, Spring Boot 3, Maven, DuckDB embedded over JDBC, plain SQL in numbered files,
springdoc-openapi, JUnit 5. React 19, TypeScript, Vite, TanStack Query, Recharts, Tailwind 4.
No JPA, no Postgres, no model server, and no external API call at runtime.

**Configuration over code.** Every anchor, weight, threshold, λ and product parameter lives in
`scoring-config.yml`. The `/algorithm` page exposes all of them to a risk expert, previews an edit on
one entity through the pipeline's own code, and writes an override file. Adding an indicator is an
enum constant, a YAML entry and one SQL insert.

## Getting started

### Requirements

| | Version | Note |
|---|---|---|
| JDK | 21+ | `mise.toml` pins `temurin-21`. Newer JDKs build and run fine. |
| Node | 20+ | `mise.toml` pins 24. **Use npm** — `package-lock.json` is the lockfile in git. |
| Docker | any recent | Only for the one-command path below. |

Maven and the DuckDB engine come down on the first build; nothing else to install.

### Option A — demo mode, no data files needed (start here)

The repo ships a **frozen slice of the results database**, so the demo runs with no CSVs and no
pipeline. This is exactly how production runs ([`docs/DEPLOY.md`](docs/DEPLOY.md)).

```bash
# 1. expand the frozen database (47 MB in git → 108 MB on disk)
mkdir -p data
gzip -dc backend/demo/xray-demo.duckdb.gz > data/xray.duckdb

# 2. backend — boots in ~2 s and serves the precomputed data
cd backend && XRAY_DEMO_MODE=true ./mvnw spring-boot:run

# 3. frontend, in a second terminal
cd frontend && npm install && npm run dev
```

Open **http://localhost:5173**. The API is on `:8080`, Swagger UI at
`http://localhost:8080/swagger-ui.html`.

In demo mode the pipeline never runs: "Aplicar y recalcular" on `/algorithm` and
`POST /api/pipeline/run` are disabled. Everything else — including the sector what-if, the custom
presets and the limit simulator — works, because those compute one entity per request and write
nothing.

### Option B — the whole pipeline from the raw CSVs

```bash
# 1. put the nine Embat CSVs in data/raw/ (gitignored, ~617 MB)
# 2. boot; the pipeline runs automatically when the results tables are empty (~1 min)
cd backend && ./mvnw spring-boot:run
cd frontend && npm install && npm run dev
```

```bash
curl localhost:8080/api/pipeline/status      # progress while it runs
curl -X POST localhost:8080/api/pipeline/run # rerun it by hand
```

### Option C — the full stack in one command

```bash
docker compose up --build      # http://localhost, backend on :8080
```

Compose bind-mounts `./data`, so it uses whatever database is already there. `XRAY_DEMO_MODE`
defaults to `true`; set it to `false` to allow a recalculation (needs the CSVs in `data/raw/`).

### Environment variables

| Variable | Default | What it does |
|---|---|---|
| `XRAY_DEMO_MODE` | `false` | `true` serves the frozen database and never runs the pipeline |
| `XRAY_DATA_DIR` | `../data` | Where `xray.duckdb`, `raw/` and `scoring-overrides.yml` live |
| `SERVER_PORT` / `PORT` | `8080` | API port. `PORT` wins, for PaaS hosts that inject it |
| `XRAY_DUCKDB_MEMORY_LIMIT` | unset | DuckDB `memory_limit`, e.g. `64MB`. Needed on small containers |
| `VITE_API_TARGET` | `http://localhost:8080` | Backend the Vite dev proxy points at |

### Tests

```bash
cd backend && ./mvnw test      # 31 tests; the six named ones guard the six claims
cd frontend && npm run typecheck && npm run lint && npm run build
```

The six that matter are listed in [`docs/RULES.md`](docs/RULES.md) §4: `AnchorInterpolatorTest`,
`ExplanationSumTest`, `LookAheadTest`, `ProfileRenormalizationTest`, `RollupTest` and
`ScoringConfigValidationTest`.

### Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `IOException: Could not set lock on file` | DuckDB allows one process per database file. Stop the other backend first. |
| Empty pages, every score `null` | No database at `data/xray.duckdb`. Run step 1 of option A. |
| The pipeline starts when you did not want it to | `XRAY_DEMO_MODE` is not `true` and the results tables are empty. |
| The UI shows data that looks too healthy | `VITE_MOCKS=true` is set. Unset it — that is `npm run dev:mock`, not `npm run dev`. |
| `/monitor`, `/entity/...` return 404 on reload | An SPA-fallback rewrite is missing in the host config ([`docs/DEPLOY.md`](docs/DEPLOY.md)). |

## The demo

Six pages. `profile` and `month` live in the URL, so every view is a link.

| Page | What it shows |
|---|---|
| **Cartera** (Portfolio) | 250 entities ranked, filtered by the six questions. The profile switch re-ranks everything. |
| **Entidad** (Entity) | The score, its drivers, the timeline with regimes and changepoints, the product panel, and a sector what-if. |
| **Monitor** | The watchlist and an alert replay: months M06 to M23 stream by, and the system raises its hand on its own. |
| **Comparar** (Compare) | Two entities side by side, preloaded with the showcase pair above. |
| **Metodología** (Methodology) | Every rule, every parameter, the measured anticipation and the limitations. |
| **Algoritmo** (Algorithm) | Every parameter, editable, with a preview on one entity. For a risk expert. |

## API

Interactive docs at [`/swagger-ui.html`](https://hackspain-2026-embat-track.onrender.com/swagger-ui.html).
No request recomputes anything: the API reads results tables and targets under 1 s per page.

| Endpoint | Returns |
|---|---|
| `GET /api/meta` | Scoring unit, available months, run status |
| `GET /api/portfolio` | The ranked portfolio for a `profile` and a `month` |
| `GET /api/entities/{id}` | Score, bands, drivers and the additive explanation of one entity |
| `GET /api/entities/{id}/timeline` | The monthly series with regimes, changepoints and the forecast |
| `GET /api/entities/{id}/limit` · `/premium` | The working-capital limit and the insurer premium |
| `POST /api/entities/{id}/limit/simulate` | Amount and term what-if. Writes nothing |
| `POST /api/entities/{id}/tuning` | Config what-if on one entity. Writes nothing |
| `GET /api/monitor/watchlist` · `/alerts` | The watchlist and the alerts with their transitions |
| `GET /api/analytics/lead-time` | The anticipation figures of the results section |
| `GET /api/methodology` | Every active rule and parameter, for the Methodology page |
| `GET /api/config` · `PUT` · `DELETE` | Active configuration and the expert overrides |
| `GET /api/export/submission` | The submission in the format the brief asks for |

The only two requests that compute anything are the two what-ifs, and neither writes
([`docs/RULES.md`](docs/RULES.md) rule 8).

## Repository layout

```
backend/                  Spring Boot + DuckDB
  src/main/java/com/xray/
    domain/               Pure model and services. No Spring, no java.sql
    pipeline/stages/      S00 … S90, one stage per step
    application/          Use cases and the queries the API reads
    alerting/rules/       One class per alert rule, pure predicates
    config/               scoring-config.yml bound to typed records
    infrastructure/       REST controllers, DuckDB, DTOs
  src/main/resources/
    scoring-config.yml    The only place anchors, weights, thresholds and λ live
    presets.yml           Client presets, each value with its source
    sectors.yml           Sector presets of the per-entity tuning
    sql/                  23 numbered files, run in filename order
  demo/                   The frozen database that ships to production
frontend/                 React 19 + TypeScript + Vite
  src/pages/              The six demo pages
  src/components/         Design-system components
  src/api/                Client, types and TanStack Query hooks
docs/                     15 documents, one per topic. Start at docs/README.md
scripts/                  Offline tools. None of this runs in the product
data/                     Raw CSVs and xray.duckdb (gitignored)
```

## Documentation

Fifteen files under [`docs/`](docs/), each with one owner. [`docs/README.md`](docs/README.md) is the
full index; these are the four to start from.

| File | Owns |
|---|---|
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | **Every decision, with its reason and its evidence.** Read this before disagreeing with anything. |
| [`docs/RULES.md`](docs/RULES.md) | The engineering rules the code holds, the conventions, and the tests that guard them |
| [`docs/SPEC.md`](docs/SPEC.md) | *What* to compute: data, indicators, anchors, scoring, regimes, alerts, products, API |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | *How* it is built: packages, contracts, pipeline stages, SQL files, extension points, tests |

Then, by question: the data ([`DATA_FINDINGS.md`](docs/DATA_FINDINGS.md)), the anchors
([`THRESHOLDS.md`](docs/THRESHOLDS.md)), the weights and their sensitivity test
([`WEIGHTS.md`](docs/WEIGHTS.md)), the presets ([`PRESETS.md`](docs/PRESETS.md)), the expert page
([`ALGORITHM_PAGE.md`](docs/ALGORITHM_PAGE.md)), the two non-scoring outputs
([`FORECAST.md`](docs/FORECAST.md), [`RECOMMENDATIONS.md`](docs/RECOMMENDATIONS.md)), the product
([`PRODUCT.md`](docs/PRODUCT.md)), the design system ([`DESIGN.md`](docs/DESIGN.md)), the deploy
([`DEPLOY.md`](docs/DEPLOY.md)) and the original brief, unedited
([`embat-track.md`](docs/embat-track.md)).

## What it cannot see

Stated in the UI, not hidden in a footnote.

- No balance sheet and no P&L. EBITDA, Debt/EBITDA and DSCR are cash-flow proxies.
- Debt granted and outstanding is a single snapshot of 2026-09-01. Indicators that use it are flagged.
- The data is synthetic and carries no default label. Anticipation is measured against proxy events.
- Ten of the 22 anchors are provisional and marked as such until a risk expert closes them.
- The spread grid, the premium multipliers and the reference rate are our assumptions, not market data.

## Team

**Byte_Me** — HackSpain 2026, Embat track (Madrid, 18–20 September 2026).

- José Javier Bravo
- Francisco Moreno
- María de la Almudena Martín
- Luis Gómez
