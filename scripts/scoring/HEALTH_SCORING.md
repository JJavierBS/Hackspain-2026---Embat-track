# Health Scoring

`health_scoring.py` calcula el índice de salud financiera de una o varias empresas a partir de los indicadores producidos por el pipeline del backend.

## Fuentes de datos

El script utiliza automáticamente:

- Pesos AHP: `scripts/weights_calc/weights.json`
- Anchors y categorías: `backend/src/main/resources/scoring-config.yml`
- Valores reales de indicadores: `data/xray.duckdb`, tabla `indicator_values_raw`

No es necesario pasar estas rutas en la ejecución normal. Se pueden sobrescribir con `--weights`, `--config` y `--database`.

## Qué calcula

### 1. Normalización

Cada valor bruto se transforma a una puntuación entre `0` y `1` mediante interpolación lineal entre sus anchors:

- `0`: peor resultado
- `1`: mejor resultado
- Por debajo o por encima de los anchors se mantiene el valor extremo correspondiente.

Los indicadores no disponibles no se convierten en cero: se excluyen del cálculo.

### 2. Índice global

Para un perfil seleccionado, el índice se calcula como:

```text
Índice global = Σ(score_indicador × peso_efectivo_indicador)
```

Los pesos proceden directamente del perfil en `weights.json`. No se dividen por categorías ni se igualan.

Cuando faltan indicadores, los pesos de los indicadores disponibles se renormalizan para que sumen `1`.

### 3. Riesgo aportado

Para identificar el origen del riesgo:

```text
Riesgo aportado = (1 - score_indicador) × peso_efectivo_indicador
```

Los indicadores se ordenan de mayor a menor riesgo aportado.

La suma cumple:

```text
Σ riesgo aportado = 1 - índice global
```

### 4. Alerta

La empresa se marca como en riesgo cuando:

```text
índice global < alert_threshold
```

El umbral se proporciona en la línea de comandos y no está fijado en el código.

## Requisitos

1. Python 3.10 o superior.
2. Dependencias de Python:

```bash
python -m pip install -r scripts/requirements.txt
```

3. Datos procesados por el backend en `data/xray.duckdb`.
4. La tabla `indicator_values_raw` creada por el pipeline.
5. El backend debe estar detenido antes de leer DuckDB, porque puede mantener el archivo bloqueado.

## Preparar los datos

Desde la raíz del repositorio, arranca el backend y espera a que termine el pipeline:

```bash
cd backend
./mvnw spring-boot:run
```

Cuando aparezca una línea similar a:

```text
pipeline run ... done
```

detén Spring Boot con `Ctrl+C` para liberar el bloqueo de DuckDB.

## Ejecución para una empresa

```bash
cd scripts/scoring
python health_scoring.py \
  --profile bank \
  --alert-threshold 0.4 \
  --entity-id COMP_0720
```

También se puede usar el alias `--company`:

```bash
python health_scoring.py \
  --profile bank \
  --alert-threshold 0.4 \
  --company COMP_0720
```

El filtro se ejecuta dentro de DuckDB y evita procesar las demás empresas.

## Ejecución para todas las empresas

Omitiendo el filtro:

```bash
python health_scoring.py \
  --profile bank \
  --alert-threshold 0.4
```

## Perfiles

Los perfiles no están fijados en el script. Se leen como claves de `weights.json`.

Actualmente el archivo tiene perfiles como `bank`, `insurance` y `fund`, pero pueden añadirse o cambiarse externamente:

```json
{
  "profiles": {
    "nombre_perfil": {
      "weights": {
        "INDICADOR_A": 0.12,
        "INDICADOR_B": 0.35,
        "INDICADOR_C": 0.53
      }
    }
  }
}
```

La suma de los pesos no tiene que ser exactamente `1`: el script los renormaliza entre los indicadores disponibles.

## Salida

### Vista visual

Es la salida por defecto:

```bash
python health_scoring.py \
  --profile bank \
  --alert-threshold 0.4 \
  --entity-id COMP_0720
```

Muestra una tabla con:

- Empresa
- Tipo de entidad
- Mes
- Índice global
- Estado de riesgo
- Principal factor de riesgo

También muestra un gráfico de barras ASCII del índice.

### JSON

Para obtener la salida estructurada completa:

```bash
python health_scoring.py \
  --profile bank \
  --alert-threshold 0.4 \
  --entity-id COMP_0720 \
  --json > resultado.json
```

Cada resultado contiene, entre otros campos:

```json
{
  "entity_id": "COMP_0720",
  "entity_type": "COMPANY",
  "month": "2025-12",
  "profile": "bank",
  "global_index": 0.21,
  "alert_threshold": 0.4,
  "imminent_failure_risk": true,
  "indicator_scores": {},
  "effective_weights": {},
  "risk_contributions": [],
  "category_scores": {},
  "ignored_indicators": []
}
```

## Alias de indicadores

El AHP puede generar tres nombres históricos que se traducen automáticamente a los identificadores canónicos del backend:

| Nombre externo | Nombre backend |
|---|---|
| `ACT_GROWTH` | `ACT_COLLECTIONS_GROWTH` |
| `PAY_LATENESS` | `PAY_SUPPLIER_LATENESS` |
| `PAY_OVERDUE` | `PAY_OVERDUE_PAYABLES` |

No se modifican los pesos; únicamente se adapta el nombre para localizar el valor y sus anchors.

## Problemas frecuentes

### No existe `data/xray.duckdb`

El pipeline todavía no ha creado la base de datos. Arranca el backend y espera a que termine.

### DuckDB está bloqueado

Spring Boot sigue ejecutándose. Detén el backend con `Ctrl+C` y vuelve a lanzar el script.

### No existe `indicator_values_raw`

La base existe, pero el pipeline no terminó de ejecutar las etapas de indicadores. Vuelve a arrancar el backend y espera a `pipeline run ... done`.

### No hay pesos disponibles para los valores

Ese grupo entidad-mes no tiene ningún indicador disponible con peso positivo. Los grupos sin indicadores disponibles se omiten; los valores ausentes nunca se convierten en cero.

## Tests

Ejecuta los tests desde cualquier ubicación con:

```bash
python /Users/almudenamartin/Desktop/Hackspain-2026---Embat-track/scripts/scoring/test_health_scoring.py
```
