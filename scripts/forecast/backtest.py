"""
Rolling-origin backtest of score projection methods (phase 7, plan R2, docs/FORECAST.md).

For every entity, profile and origin month m with at least MIN_HISTORY scored months, each method
projects final[m+1..m+H] from final[0..m] only (causal, decision H12). The error is |forecast - actual|
where the actual month is scored. Output: MAE per horizon and skill against persistence, as Markdown.

Usage (the backend locks data/xray.duckdb, so pass a copy):
    python scripts/forecast/backtest.py --database data/.work/base.duckdb --unit GROUP
Needs numpy and duckdb.
"""
import argparse
from collections import defaultdict

import duckdb
import numpy as np

H = 6
MIN_HISTORY = 6


def persistence(hist):
    return [hist[-1]] * H


def damped_trend(n, d):
    """The source branch's method: least-squares slope of the last n values, damped by d^(h-1)."""
    def f(hist):
        y = np.array(hist[-n:])
        slope = np.polyfit(np.arange(len(y)), y, 1)[0] if len(y) >= 2 else 0.0
        v, out = hist[-1], []
        for h in range(1, H + 1):
            v = min(100.0, max(0.0, v + slope * d ** (h - 1)))
            out.append(v)
        return out
    return f


def holt_damped(alpha, beta, phi):
    def f(hist):
        level, trend = hist[0], 0.0
        for y in hist[1:]:
            previous = level
            level = alpha * y + (1 - alpha) * (level + phi * trend)
            trend = beta * (level - previous) + (1 - beta) * phi * trend
        out, acc = [], 0.0
        for h in range(1, H + 1):
            acc += phi ** h
            out.append(min(100.0, max(0.0, level + acc * trend)))
        return out
    return f


def mean_reversion(rho):
    """The product's method (ForecastCalculator): AR(1) toward the median of final[0..m]."""
    def f(hist):
        median, v, out = float(np.median(hist)), hist[-1], []
        for _ in range(H):
            v = min(100.0, max(0.0, median + rho * (v - median)))
            out.append(v)
        return out
    return f


METHODS = {
    "persistence (baseline)": persistence,
    "own median (rho = 0)": mean_reversion(0.0),
    "damped trend N=6 d=0.8 (branch)": damped_trend(6, 0.8),
    "damped trend N=12 d=0.3 (best of grid)": damped_trend(12, 0.3),
    "Holt damped a=1.0 b=0.1 phi=0.5 (best of grid)": holt_damped(1.0, 0.1, 0.5),
    "mean reversion rho=0.75": mean_reversion(0.75),
    "mean reversion rho=0.80": mean_reversion(0.80),
    "mean reversion rho=0.85 (shipped)": mean_reversion(0.85),
    "mean reversion rho=0.90": mean_reversion(0.90),
}


def load(database, unit, profile=None):
    con = duckdb.connect(database, read_only=True)
    q = "SELECT entity_id, profile, month, final FROM profile_scores WHERE entity_type = ?"
    args = [unit]
    if profile:
        q += " AND profile = ?"
        args.append(profile)
    series = defaultdict(list)
    for entity, prof, _, final in con.execute(q + " ORDER BY 1, 2, 3", args).fetchall():
        series[(entity, prof)].append(final)
    return series


def evaluate(series, method):
    errors = [[] for _ in range(H)]
    for s in series.values():
        for m, value in enumerate(s):
            if value is None:
                continue
            hist = [v for v in s[:m + 1] if v is not None]
            if len(hist) < MIN_HISTORY:
                continue
            forecast = method(hist)
            for h in range(1, H + 1):
                if m + h < len(s) and s[m + h] is not None:
                    errors[h - 1].append(abs(forecast[h - 1] - s[m + h]))
    return [float(np.mean(e)) for e in errors], [len(e) for e in errors]


def table(series, title):
    results = {name: evaluate(series, fn) for name, fn in METHODS.items()}
    base = results["persistence (baseline)"][0]
    print(f"\n### {title}\n")
    print(f"Forecasts per horizon: {results['persistence (baseline)'][1]}\n")
    print("| Method | " + " | ".join(f"h={h}" for h in range(1, H + 1)) + " | skill h1..h3 |")
    print("|---|" + "---:|" * (H + 1))
    for name, (mae, _) in results.items():
        skill = 100 * (1 - np.mean(mae[:3]) / np.mean(base[:3]))
        print(f"| {name} | " + " | ".join(f"{v:.2f}" for v in mae) + f" | {skill:+.1f} % |")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--database", required=True)
    parser.add_argument("--unit", default="GROUP")
    parser.add_argument("--by-profile", action="store_true")
    args = parser.parse_args()
    table(load(args.database, args.unit), f"{args.unit}, all profiles: MAE in points")
    if args.by_profile:
        for p in ["BANK", "FUND", "INSURER"]:
            table(load(args.database, args.unit, p), f"{args.unit}, {p}: MAE in points")


if __name__ == "__main__":
    main()
