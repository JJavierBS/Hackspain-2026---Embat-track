"""OFFLINE CROSS-CHECK TOOL. Nothing in the product reads this script or its output (phase 7, decision H10).

The product score is computed by the backend pipeline (S40..S70). This script is an independent
re-implementation of the level term only, on a 0..1 scale, to sanity-check anchors and weights.

Normalize raw indicators and compute profile-specific health diagnostics.

The script follows the backend scoring contracts:
- anchors are piecewise-linear and clamped, with no extrapolation;
- unavailable indicators are excluded instead of treated as zero;
- supplied indicator weights are used directly, without equal splitting;
- available indicator weights are renormalized after unavailable values are removed.

Example:
    python scripts/scoring/health_scoring.py --profile BANK --alert-threshold 0.4

Anchors and weights are read from ``backend/src/main/resources/scoring-config.yml``, the only
source of truth (CLAUDE.md rule 5): indicator weight = scoring.profiles.<P>.weights[category] / 100
x scoring.indicators.<ID>.weight / sum of the weights of its category. MOMENTUM has no indicators,
so it drops out and the rest renormalize. Raw indicator values are read from ``data/xray.duckdb``
table ``indicator_values_raw``; the backend locks that file, so query a copy.
Output includes a visual summary table and an ASCII chart for quick terminal inspection.
"""

from __future__ import annotations

import argparse
import importlib
import json
import math
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

DEFAULT_CONFIG_PATH = Path(__file__).resolve().parents[2] / "backend" / "src" / "main" / "resources" / "scoring-config.yml"
DEFAULT_DATABASE_PATH = Path(__file__).resolve().parents[2] / "data" / "xray.duckdb"


def interpolate(value: float, anchors: list[list[float]]) -> float:
    """Return an anchor score in [0, 1], holding the end scores outside range."""
    if not math.isfinite(value):
        raise ValueError("indicator values must be finite")
    if len(anchors) < 2:
        raise ValueError("each indicator needs at least two anchors")

    points = [(float(x), float(score) / 100.0) for x, score in anchors]
    if any(left[0] >= right[0] for left, right in zip(points, points[1:])):
        raise ValueError("anchors must be strictly increasing by value")
    if value <= points[0][0]:
        return _clamp(points[0][1])
    if value >= points[-1][0]:
        return _clamp(points[-1][1])

    for (left_value, left_score), (right_value, right_score) in zip(points, points[1:]):
        if value <= right_value:
            fraction = (value - left_value) / (right_value - left_value)
            return _clamp(left_score + fraction * (right_score - left_score))
    return _clamp(points[-1][1])


def score_indicators(
    values: dict[str, Any], indicators: dict[str, dict[str, Any]]
) -> dict[str, float]:
    """Normalize every available raw value using its configured anchors."""
    scores: dict[str, float] = {}
    for indicator, raw_value in values.items():
        if raw_value is None:
            continue
        if indicator not in indicators:
            raise KeyError(f"indicator {indicator!r} is missing from scoring config")
        scores[indicator] = interpolate(float(raw_value), indicators[indicator]["anchors"])
    return scores


def validate_weighted_indicators(weights: dict[str, Any], indicators: dict[str, dict[str, Any]]) -> None:
    """Require every externally weighted indicator to have configured anchors."""
    missing = sorted(set(weights) - set(indicators))
    if missing:
        raise ValueError(
            "weights name indicators without configured anchors: "
            + ", ".join(missing)
        )


def weights_from_config(config: dict[str, Any], profile: str) -> dict[str, float]:
    """Flatten the two config levels into one weight per indicator for one profile."""
    profiles = config["profiles"]
    if profile not in profiles:
        raise KeyError(f"profile {profile!r} is not in scoring.profiles ({', '.join(profiles)})")
    category_weights = profiles[profile]["weights"]
    indicators = config["indicators"]
    intra_total: dict[str, float] = defaultdict(float)
    for spec in indicators.values():
        intra_total[spec["category"]] += float(spec.get("weight", 1.0))
    return {
        indicator: float(category_weights.get(spec["category"], 0)) / 100
        * float(spec.get("weight", 1.0)) / intra_total[spec["category"]]
        for indicator, spec in indicators.items()
        if float(category_weights.get(spec["category"], 0)) > 0
    }


def diagnose(
    scores: dict[str, float],
    indicators: dict[str, dict[str, Any]],
    profile: dict[str, Any],
    alert_threshold: float,
) -> dict[str, Any]:
    """Calculate the weighted index and rank each indicator's risk contribution."""
    category_indicators: dict[str, list[str]] = defaultdict(list)
    for indicator in scores:
        category_indicators[indicators[indicator]["category"]].append(indicator)

    configured_weights = {
        indicator: float(weight)
        for indicator, weight in profile["weights"].items()
        if float(weight) > 0 and indicator in scores
    }
    weight_total = sum(configured_weights.values())
    if weight_total <= 0:
        raise ValueError("no configured profile weight is available for the supplied values")

    indicator_weights = {
        indicator: weight / weight_total
        for indicator, weight in configured_weights.items()
    }
    category_scores: dict[str, float] = {}
    for category, members in category_indicators.items():
        weighted_members = [indicator for indicator in members if indicator in indicator_weights]
        if not weighted_members:
            continue
        category_scores[category] = sum(
            scores[indicator] * indicator_weights[indicator] for indicator in weighted_members
        ) / sum(indicator_weights[indicator] for indicator in weighted_members)

    ignored_indicators = sorted(set(scores) - set(indicator_weights))
    global_index = sum(scores[indicator] * indicator_weights[indicator] for indicator in indicator_weights)
    contributions = [
        {
            "indicator": indicator,
            "category": indicators[indicator]["category"],
            "score": scores[indicator],
            "weight": indicator_weights[indicator],
            "risk_contribution": (1.0 - scores[indicator]) * indicator_weights[indicator],
        }
        for indicator in indicator_weights
    ]
    contributions.sort(key=lambda item: (-item["risk_contribution"], item["indicator"]))

    return {
        "profile": profile.get("name"),
        "global_index": global_index,
        "alert_threshold": alert_threshold,
        "imminent_failure_risk": global_index < alert_threshold,
        "category_scores": category_scores,
        "effective_weights": indicator_weights,
        "risk_contributions": contributions,
        "risk_contribution_total": sum(item["risk_contribution"] for item in contributions),
        "available_indicators": len(indicator_weights),
        "ignored_indicators": ignored_indicators,
    }


def load_config(path: Path) -> dict[str, Any]:
    try:
        yaml = importlib.import_module("yaml")
    except ImportError as exc:
        raise RuntimeError("PyYAML is required: python -m pip install -r scripts/requirements.txt") from exc
    with path.open(encoding="utf-8") as stream:
        return yaml.safe_load(stream)


def load_database_values(
    path: Path,
    indicators: set[str],
    entity_id: str | None = None,
    entity_type: str | None = None,
) -> dict[tuple[str, str, str], dict[str, Any]]:
    """Read available raw indicator values grouped by entity type, entity and month."""
    if not path.is_file():
        raise FileNotFoundError(
            f"DuckDB database not found: {path}. "
            "Run the backend pipeline first so it can create data/xray.duckdb."
        )
    try:
        duckdb = importlib.import_module("duckdb")
    except ImportError as exc:
        raise RuntimeError("duckdb is required: python -m pip install -r scripts/requirements.txt") from exc

    try:
        connection = duckdb.connect(str(path), read_only=True)
    except Exception as exc:
        if "lock" in str(exc).lower() or "conflicting" in str(exc).lower():
            raise RuntimeError(
                "DuckDB is locked by the backend. Wait for the pipeline to finish, "
                "stop Spring Boot, then run health_scoring.py again."
            ) from exc
        raise
    try:
        query = """
            SELECT entity_type, entity_id, month, indicator_id, value, available
            FROM indicator_values_raw
            WHERE indicator_id IN (SELECT UNNEST(?))
        """
        parameters: list[Any] = [list(indicators)]
        if entity_id is not None:
            query += " AND entity_id = ?"
            parameters.append(entity_id)
        if entity_type is not None:
            query += " AND entity_type = ?"
            parameters.append(entity_type)
        query += " ORDER BY entity_type, entity_id, month, indicator_id"
        rows = connection.execute(query, parameters).fetchall()
    finally:
        connection.close()

    grouped: dict[tuple[str, str, str], dict[str, Any]] = {}
    for entity_type, entity_id, month, indicator_id, value, available in rows:
        key = (entity_type, entity_id, month)
        grouped.setdefault(key, {})[indicator_id] = value if available else None
    return grouped


def print_visual_summary(results: list[dict[str, Any]], alert_threshold: float, profile_name: str | None) -> None:
    """Imprime una tabla resumen y un gráfico de barras ASCII directamente en la terminal."""
    if not results:
        print("\n[!] No se encontraron datos para mostrar en el reporte visual.", file=sys.stderr)
        return

    print("\n" + "=" * 95)
    print(f" 📊 REPORTE DE SALUD FINANCIERA | Perfil: {profile_name or 'Default'} | Umbral de Alerta: {alert_threshold}")
    print("=" * 95)
    
    # Tabla resumen
    print(f"\n{'ENTIDAD':<15} | {'TIPO':<10} | {'MES':<8} | {'ÍNDICE':<8} | {'ESTADO':<15} | {'MAYOR FACTOR DE RIESGO':<25}")
    print("-" * 95)
    
    for res in results:
        eid = res.get("entity_id", "N/A")
        etype = res.get("entity_type", "N/A")
        month = res.get("month", "N/A")
        g_index = res.get("global_index", 0.0)
        is_at_risk = res.get("imminent_failure_risk", False)
        
        status = "🔴 EN RIESGO" if is_at_risk else "🟢 SALUDABLE"
        
        contributions = res.get("risk_contributions", [])
        top_risk = contributions[0]["indicator"] if contributions else "N/A"
        
        print(f"{eid:<15} | {etype:<10} | {month:<8} | {g_index:<8.2f} | {status:<15} | {top_risk:<25}")

    print("\n" + "-" * 95)
    print(" 📈 GRÁFICO DE ÍNDICE GLOBAL DE SALUD (0.0 = Crítico, 1.0 = Excelente)")
    print("-" * 95)
    
    for res in results:
        eid = res.get("entity_id", "N/A")
        g_index = res.get("global_index", 0.0)
        
        # Barra de 25 caracteres
        bar_len = int(round(g_index * 25))
        bar_len = max(0, min(25, bar_len))
        bar = "█" * bar_len + "░" * (25 - bar_len)
        
        icon = "🔴" if g_index < alert_threshold else ("🟡" if g_index < 0.7 else "🟢")
        print(f"{eid:<15} {icon} [{bar}] {g_index:.2f}")
        
    print("=" * 95 + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH)
    parser.add_argument("--database", type=Path, default=DEFAULT_DATABASE_PATH,
                        help="DuckDB file; defaults to data/xray.duckdb")
    parser.add_argument(
        "--entity-id", "--company", dest="entity_id",
        help="Only score one company/entity, for example COMP_0720",
    )
    parser.add_argument(
        "--group-id",
        help="Score one precomputed group entity, for example GROUP_0001",
    )
    parser.add_argument("--alert-threshold", type=float, required=True)
    parser.add_argument("--profile", required=True, help="A key of scoring.profiles: BANK, FUND or INSURER")
    parser.add_argument("--json", action="store_true", help="Print raw JSON output instead of visual summary")
    args = parser.parse_args()

    config = load_config(args.config)["scoring"]
    profile_name = args.profile
    weights = weights_from_config(config, profile_name)
    indicators = config["indicators"]
    validate_weighted_indicators(weights, indicators)
    if args.group_id and args.entity_id:
        parser.error("use either --entity-id/--company or --group-id, not both")
    selected_entity_id = args.group_id or args.entity_id
    selected_entity_type = "GROUP" if args.group_id else None
    raw_values = load_database_values(args.database, set(weights), selected_entity_id, selected_entity_type)
    
    results = []
    skipped_groups = 0
    for (entity_type, entity_id, month), values in raw_values.items():
        normalized = score_indicators(values, indicators)
        if not normalized:
            skipped_groups += 1
            continue
        result = diagnose(normalized, indicators, {"name": profile_name, "weights": weights}, args.alert_threshold)
        result["indicator_scores"] = normalized
        result.update({"entity_type": entity_type, "entity_id": entity_id, "month": month})
        results.append(result)
        
    if skipped_groups:
        print(f"Skipped {skipped_groups} entity-month groups without available indicators.", file=sys.stderr)

    # Si pasan --json, escupe el JSON puro (útil para pipelines). Si no, muestra la vista gráfica.
    if args.json:
        print(json.dumps(results, indent=2, sort_keys=True))
    else:
        print_visual_summary(results, args.alert_threshold, profile_name)


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


if __name__ == "__main__":
    main()