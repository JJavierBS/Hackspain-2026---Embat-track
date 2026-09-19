"""
Two-level AHP for the scoring weights (phase 7, plan A-2).

  1) Category level: pairwise judgments between the 10 categories, once per profile,
     derived from per-profile importance ratings (docs/WEIGHTS.md).
     Output -> scoring.profiles.<P>.weights (x100, 2 decimals, sums to 100).
  2) Indicator level: pairwise judgments inside each multi-indicator category.
     Profile-independent (decision H6). Output -> scoring.indicators.<ID>.weight.

The script prints two YAML fragments to stdout, ready to paste into
backend/src/main/resources/scoring-config.yml, and the consistency report to stderr.
It writes no file and the backend never reads it (decisions H3, H17): the config is
the only source of truth.

Usage:  python3 ahp_w_cat_ind.py            (needs numpy)

The judgments below come from docs/WEIGHTS.md. Change them there first, then here.
"""
import sys

import numpy as np

from ahp import ahp_weights

MAX_CR = 0.10
PROFILES = ["BANK", "FUND", "INSURER"]

# ---------------------------------------------------------------------------
# 1) Categories and their indicators: the identifiers of main (Category, IndicatorId).
#    MOMENTUM has no indicators; its intra-category weight is 1 (decision H5).
# ---------------------------------------------------------------------------
CATEGORIES = {
    "LIQUIDITY": ["LIQ_RUNWAY", "LIQ_BUFFER", "LIQ_MIN_BALANCE"],
    "OPERATING_CASH_FLOW": ["CF_NOCF_MARGIN", "CF_VOLATILITY", "CF_IN_OUT_RATIO"],
    "ACTIVITY_GROWTH": ["ACT_COLLECTIONS_GROWTH"],
    "DEBT_SERVICE": ["DEBT_DSCR", "DEBT_LINE_UTIL"],
    "LEVERAGE": ["LEV_DEBT_TO_CF", "LEV_FACTORING_RELIANCE", "LEV_FUNDING_COST"],
    "PAYMENT_BEHAVIOUR": ["PAY_DSO", "PAY_DPO", "PAY_SUPPLIER_LATENESS", "PAY_OVERDUE_PAYABLES"],
    "DELINQUENCY": ["DEL_OVERDUE_RECEIVABLES", "DEL_AGING_90"],
    "CONCENTRATION": ["CON_HHI_CUSTOMERS", "CON_HHI_SUPPLIERS", "CON_CUSTOMER_CHURN"],
    "TAX_REGULARITY": ["TAX_REGULARITY"],
    "MOMENTUM": [],
}

# ---------------------------------------------------------------------------
# 2) Category level, per profile (docs/WEIGHTS.md §2).
#    CATEGORY_RATINGS: importance of each category for one kind of user, 1..9. The judgment
#    for the pair (i, j) is rating_i / rating_j snapped to the nearest Saaty value, so each
#    profile has its own magnitudes, not a fixed decay vector permuted by a ranking.
#    CATEGORY_JUDGMENTS: explicit Saaty values that override single pairs (i, j), for the
#    expert review (decision H17). Value > 1 means i is more important than j.
# ---------------------------------------------------------------------------
CATEGORY_RATINGS = {
    "BANK": {
        "DEBT_SERVICE": 9, "OPERATING_CASH_FLOW": 9, "LIQUIDITY": 8, "LEVERAGE": 6, "DELINQUENCY": 4,
        "PAYMENT_BEHAVIOUR": 4, "TAX_REGULARITY": 3, "MOMENTUM": 3, "CONCENTRATION": 3, "ACTIVITY_GROWTH": 3,
    },
    "FUND": {
        "ACTIVITY_GROWTH": 9, "MOMENTUM": 7, "OPERATING_CASH_FLOW": 6, "LIQUIDITY": 5, "CONCENTRATION": 5,
        "LEVERAGE": 3, "DEBT_SERVICE": 2, "PAYMENT_BEHAVIOUR": 2, "DELINQUENCY": 2, "TAX_REGULARITY": 1,
    },
    "INSURER": {
        "PAYMENT_BEHAVIOUR": 9, "LIQUIDITY": 6, "DELINQUENCY": 5, "OPERATING_CASH_FLOW": 5, "CONCENTRATION": 4,
        "LEVERAGE": 4, "DEBT_SERVICE": 3, "TAX_REGULARITY": 3, "MOMENTUM": 2, "ACTIVITY_GROWTH": 2,
    },
}

CATEGORY_JUDGMENTS = {"BANK": {}, "FUND": {}, "INSURER": {}}

SAATY_SCALE = [1 / v for v in range(9, 1, -1)] + list(range(1, 10))


def snap_to_saaty(ratio):
    """Nearest Saaty value to a ratio, measured on a log scale (1/3 and 3 are equally far from 1)."""
    return min(SAATY_SCALE, key=lambda s: abs(np.log(s) - np.log(ratio)))


# ---------------------------------------------------------------------------
# 3) Indicator level: profile-independent (decision H6). Pairs (i, j), value > 1 = i matters more.
#    Single-indicator categories and MOMENTUM need no judgments.
# ---------------------------------------------------------------------------
INDICATOR_JUDGMENTS_DEFAULT = {
    "LIQUIDITY": {
        ("LIQ_RUNWAY", "LIQ_BUFFER"): 1,
        ("LIQ_RUNWAY", "LIQ_MIN_BALANCE"): 3,
        ("LIQ_BUFFER", "LIQ_MIN_BALANCE"): 3,
    },
    "OPERATING_CASH_FLOW": {
        ("CF_IN_OUT_RATIO", "CF_NOCF_MARGIN"): 1,
        ("CF_IN_OUT_RATIO", "CF_VOLATILITY"): 3,
        ("CF_NOCF_MARGIN", "CF_VOLATILITY"): 3,
    },
    "DEBT_SERVICE": {
        ("DEBT_DSCR", "DEBT_LINE_UTIL"): 3,
    },
    "LEVERAGE": {
        ("LEV_DEBT_TO_CF", "LEV_FACTORING_RELIANCE"): 3,
        ("LEV_DEBT_TO_CF", "LEV_FUNDING_COST"): 5,
        ("LEV_FACTORING_RELIANCE", "LEV_FUNDING_COST"): 3,
    },
    "PAYMENT_BEHAVIOUR": {
        ("PAY_SUPPLIER_LATENESS", "PAY_OVERDUE_PAYABLES"): 1,
        ("PAY_SUPPLIER_LATENESS", "PAY_DPO"): 3,
        ("PAY_SUPPLIER_LATENESS", "PAY_DSO"): 3,
        ("PAY_OVERDUE_PAYABLES", "PAY_DPO"): 3,
        ("PAY_OVERDUE_PAYABLES", "PAY_DSO"): 3,
        ("PAY_DPO", "PAY_DSO"): 1,
    },
    "DELINQUENCY": {
        ("DEL_AGING_90", "DEL_OVERDUE_RECEIVABLES"): 3,
    },
    "CONCENTRATION": {
        ("CON_HHI_CUSTOMERS", "CON_HHI_SUPPLIERS"): 3,
        ("CON_HHI_CUSTOMERS", "CON_CUSTOMER_CHURN"): 3,
        ("CON_HHI_SUPPLIERS", "CON_CUSTOMER_CHURN"): 1,
    },
}


# ---------------------------------------------------------------------------
# 4) Computation and checks. Every check fails loudly (plan A-2).
# ---------------------------------------------------------------------------
def fail(message):
    raise SystemExit(f"ahp: {message}")


def build_pairwise_matrix(criteria, judgments):
    n = len(criteria)
    idx = {c: i for i, c in enumerate(criteria)}
    matrix = np.ones((n, n))
    for (ci, cj), value in judgments.items():
        if ci not in idx or cj not in idx:
            fail(f"judgment ({ci}, {cj}) names an unknown criterion")
        if not 1 / 9 <= value <= 9:
            fail(f"judgment ({ci}, {cj}) = {value} is outside the Saaty scale 1/9..9")
        i, j = idx[ci], idx[cj]
        matrix[i, j] = value
        matrix[j, i] = 1.0 / value
    return matrix


def category_judgments(profile):
    ratings = CATEGORY_RATINGS[profile]
    names = list(ratings)
    judgments = {}
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            judgments[(names[i], names[j])] = snap_to_saaty(ratings[names[i]] / ratings[names[j]])
    judgments.update(CATEGORY_JUDGMENTS.get(profile, {}))
    return judgments


def checked_weights(label, criteria, judgments, report):
    result = ahp_weights(build_pairwise_matrix(criteria, judgments))
    report.append((label, result["CR"]))
    if not result["CR"] < MAX_CR:
        fail(f"{label}: CR = {result['CR']:.4f} >= {MAX_CR}")
    weights = dict(zip(criteria, result["weights"]))
    for c, w in weights.items():
        if not w > 0:
            fail(f"{label}: weight of {c} is {w}, must be > 0 (decision H4)")
    return weights


def category_weights_x100(profile, report):
    ratings = CATEGORY_RATINGS[profile]
    if sorted(ratings) != sorted(CATEGORIES):
        fail(f"{profile}: the ratings must hold the {len(CATEGORIES)} categories exactly once")
    if not all(1 <= r <= 9 for r in ratings.values()):
        fail(f"{profile}: every rating must be in 1..9")
    weights = checked_weights(f"categories/{profile}", list(ratings), category_judgments(profile), report)
    rounded = {c: round(w * 100, 2) for c, w in weights.items()}
    largest = max(rounded, key=rounded.get)
    rounded[largest] = round(rounded[largest] + 100 - sum(rounded.values()), 2)   # residual -> largest
    if abs(sum(rounded.values()) - 100) > 0.01:
        fail(f"{profile}: weights sum to {sum(rounded.values())}, expected 100")
    if min(rounded.values()) <= 0:
        fail(f"{profile}: a category rounds to 0 (decision H4)")
    return rounded


def indicator_weights(report):
    out = {}
    for category, indicators in CATEGORIES.items():
        if len(indicators) <= 1:
            out.update({ind: 1.0 for ind in indicators})
            continue
        weights = checked_weights(f"indicators/{category}", indicators,
                                  INDICATOR_JUDGMENTS_DEFAULT.get(category, {}), report)
        out.update({ind: round(w, 4) for ind, w in weights.items()})
    return out


def main():
    report = []
    # Decision H6: one judgment set for every profile, so the intra weights are identical by construction.
    intra = indicator_weights(report)
    profiles = {p: category_weights_x100(p, report) for p in PROFILES}

    print("# ---- fragment 1: scoring.profiles.<P>.weights (keep each profile's lambda) ----")
    for p in PROFILES:
        body = ", ".join(f"{c}: {w:g}" for c, w in sorted(profiles[p].items(), key=lambda x: -x[1]))
        print(f"    {p}: {{ weights: {{ {body} }} }}")
    print()
    print("# ---- fragment 2: scoring.indicators.<ID>.weight ----")
    for category, indicators in CATEGORIES.items():
        for ind in indicators:
            print(f"    {ind}: {{ weight: {intra[ind]:g} }}")

    print("consistency ratios (all < 0.10):", file=sys.stderr)
    for label, cr in report:
        print(f"  {label:34s} CR = {cr:.4f}", file=sys.stderr)


if __name__ == "__main__":
    main()
