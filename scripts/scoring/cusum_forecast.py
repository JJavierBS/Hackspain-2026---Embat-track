"""OFFLINE CROSS-CHECK TOOL. Nothing in the product reads this script or its output (phase 7, decision H10).

The product projection is ForecastCalculator + S85_Forecast (mean reversion toward the entity's own
median, docs/FORECAST.md). This script keeps the source branch's damped linear trend and CUSUM for
comparison only: the backtest shows the damped trend loses to persistence, and its CUSUM baseline
reads future months (decision H12), so neither may feed the product (decision H13).

Forecast health scores with a small CUSUM change detector.

This script reuses health_scoring.py for weights, anchors, DuckDB loading,
normalization, and risk contributions. CUSUM detects sustained changes in the
    monthly health index; a damped linear projection of the recent index estimates
    the next months. The forecast is bounded to [0, 1] and is intentionally simple.

Example:
    python cusum_forecast.py --profile BANK --entity-id COMP_0720 \
        --alert-threshold 0.4 --forecast-months 3 --json
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

from health_scoring import (
    DEFAULT_CONFIG_PATH,
    DEFAULT_DATABASE_PATH,
    diagnose,
    load_config,
    load_database_values,
    score_indicators,
    validate_weighted_indicators,
    weights_from_config,
)


def linear_slope(values: list[float]) -> float:
    """Return the least-squares slope per month for an ordered series."""
    if len(values) < 2:
        return 0.0
    mean_x = (len(values) - 1) / 2
    mean_y = sum(values) / len(values)
    denominator = sum((index - mean_x) ** 2 for index in range(len(values)))
    return sum((index - mean_x) * (value - mean_y) for index, value in enumerate(values)) / denominator


def cusum(values: list[float], k: float, h: float) -> dict[str, Any]:
    """Detect sustained upward/downward changes in consecutive health deltas."""
    if k < 0 or h <= 0:
        raise ValueError("CUSUM k must be >= 0 and h must be > 0")
    if len(values) < 2:
        return {"alarm": False, "direction": None, "score": 0.0, "month_index": None}

    deltas = [right - left for left, right in zip(values, values[1:])]
    baseline_size = max(1, len(deltas) // 2)
    baseline_deltas = deltas[:baseline_size]
    baseline = sum(baseline_deltas) / len(baseline_deltas)
    positive = 0.0
    negative = 0.0
    max_score = 0.0
    alarm_direction: str | None = None
    alarm_index: int | None = None
    for index, delta in enumerate(deltas[baseline_size:], start=baseline_size + 1):
        positive = max(0.0, positive + delta - baseline - k)
        negative = max(0.0, negative + baseline - delta - k)
        if positive > max_score:
            max_score = positive
        if negative > max_score:
            max_score = negative
        if alarm_index is None and positive >= h:
            alarm_index = index
            alarm_direction = "IMPROVING"
        elif alarm_index is None and negative >= h:
            alarm_index = index
            alarm_direction = "DECLINING"

    return {
        "alarm": alarm_index is not None,
        "direction": alarm_direction,
        "score": max_score,
        "month_index": alarm_index,
        "baseline_delta": baseline,
        "k": k,
        "h": h,
    }


def forecast(values: list[float], months: int, recent_window: int, damping: float = 0.8) -> list[float]:
    """Project a damped recent trend and clamp future health to [0, 1]."""
    if months < 1:
        raise ValueError("forecast months must be at least 1")
    if not 0 < damping <= 1:
        raise ValueError("damping must be greater than 0 and at most 1")
    if not values:
        return []
    recent = values[-max(2, recent_window):]
    slope = linear_slope(recent)
    last = values[-1]
    projected = []
    for step in range(1, months + 1):
        damped_change = slope * (damping ** (step - 1))
        projected.append(_clamp((projected[-1] if projected else last) + damped_change))
    return projected


def reliability(history_months: int) -> dict[str, Any]:
    """Describe how much confidence the history length supports."""
    if history_months < 6:
        return {
            "level": "LOW",
            "reliable": False,
            "message": "Menos de 6 meses de histórico: el resultado CUSUM no es fiable.",
        }
    if history_months < 8:
        return {
            "level": "MEDIUM",
            "reliable": False,
            "message": "Entre 6 y 7 meses de histórico: la fiabilidad del resultado CUSUM es limitada.",
        }
    return {
        "level": "HIGH",
        "reliable": True,
        "message": "Al menos 8 meses de histórico: el resultado CUSUM se considera fiable.",
    }


def build_history(args: argparse.Namespace) -> list[dict[str, Any]]:
    config = load_config(args.config)["scoring"]
    profile_name = args.profile
    weights = weights_from_config(config, profile_name)
    indicators = config["indicators"]
    validate_weighted_indicators(weights, indicators)
    raw_values = load_database_values(args.database, set(weights), args.entity_id, args.entity_type)

    history = []
    for (entity_type, entity_id, month), values in raw_values.items():
        normalized = score_indicators(values, indicators)
        if not normalized:
            continue
        result = diagnose(normalized, indicators, {"name": profile_name, "weights": weights}, args.alert_threshold)
        result["indicator_scores"] = normalized
        result.update({"entity_type": entity_type, "entity_id": entity_id, "month": month})
        history.append(result)
    return sorted(history, key=lambda item: item["month"])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", required=True)
    parser.add_argument("--alert-threshold", type=float, required=True)
    parser.add_argument("--entity-id", "--company", dest="entity_id")
    parser.add_argument("--group-id", help="Forecast one precomputed group entity")
    parser.add_argument("--forecast-months", type=int, default=3)
    parser.add_argument("--recent-window", type=int, default=6)
    parser.add_argument("--damping", type=float, default=0.8,
                        help="Trend damping per forecast month, in (0, 1]; default: 0.8")
    parser.add_argument("--cusum-k", type=float, default=0.01)
    parser.add_argument("--cusum-h", type=float, default=0.05)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH)
    parser.add_argument("--database", type=Path, default=DEFAULT_DATABASE_PATH)
    args = parser.parse_args()
    if not args.entity_id and not args.group_id:
        parser.error("one of --entity-id/--company or --group-id is required")
    if args.entity_id and args.group_id:
        parser.error("use either --entity-id/--company or --group-id, not both")
    if args.group_id:
        args.entity_id = args.group_id
        args.entity_type = "GROUP"
    else:
        args.entity_type = None

    history = build_history(args)
    values = [item["global_index"] for item in history]
    recent = values[-max(2, args.recent_window):]
    detection = cusum(values, args.cusum_k, args.cusum_h)
    future_values = forecast(values, args.forecast_months, args.recent_window, args.damping)
    slope = linear_slope(recent)
    latest = history[-1] if history else None
    result_reliability = reliability(len(history))
    output = {
        "entity_id": args.entity_id,
        "profile": args.profile,
        "history_months": len(history),
        "latest": latest,
        "recent_slope_per_month": slope,
        "damping": args.damping,
        "reliability": result_reliability,
        "cusum": detection,
        "forecast": [
            {"months_ahead": index, "global_index": value,
             "imminent_failure_risk": value < args.alert_threshold}
            for index, value in enumerate(future_values, start=1)
        ],
    }
    if args.json:
        print(json.dumps(output, indent=2, sort_keys=True))
    else:
        print_forecast(output, args.alert_threshold)


def print_forecast(output: dict[str, Any], threshold: float) -> None:
    print(f"Health forecast | {output['entity_id']} | profile={output['profile']}")
    print(f"History: {output['history_months']} months | slope={output['recent_slope_per_month']:.4f}/month")
    result_reliability = output["reliability"]
    print(f"Reliability: {result_reliability['level']} - {result_reliability['message']}")
    cusum_result = output["cusum"]
    print(f"CUSUM: {'ALARM' if cusum_result['alarm'] else 'stable'}"
          f"{(' - ' + cusum_result['direction']) if cusum_result['direction'] else ''}")
    print("Forecast:")
    for point in output["forecast"]:
        status = "RISK" if point["imminent_failure_risk"] else "OK"
        print(f"  +{point['months_ahead']} month(s): {point['global_index']:.3f} [{status}, threshold={threshold}]")


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


if __name__ == "__main__":
    main()