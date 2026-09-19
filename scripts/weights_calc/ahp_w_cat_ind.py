"""
Two-level AHP for the scoring weights (phase 7, plan A-2).

  1) Category level: pairwise judgments between the 10 categories, once per profile.
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
# 2) Category level, per profile.
#    CATEGORY_RANKING: most to least important. CATEGORY_JUDGMENTS: explicit Saaty values
#    for the pairs (i, j) with i ranked above j; a pair left out falls back to
#    CATEGORY_RANK_TO_SAATY(rank distance). Value > 1 means i is more important than j.
# ---------------------------------------------------------------------------
CATEGORY_RANKING = {
    "BANK": [
        "DEBT_SERVICE", "LIQUIDITY", "OPERATING_CASH_FLOW", "LEVERAGE", "DELINQUENCY",
        "PAYMENT_BEHAVIOUR", "TAX_REGULARITY", "MOMENTUM", "CONCENTRATION", "ACTIVITY_GROWTH",
    ],
    "FUND": [
        "ACTIVITY_GROWTH", "MOMENTUM", "OPERATING_CASH_FLOW", "LIQUIDITY", "CONCENTRATION",
        "LEVERAGE", "DEBT_SERVICE", "PAYMENT_BEHAVIOUR", "DELINQUENCY", "TAX_REGULARITY",
    ],
    "INSURER": [
        "PAYMENT_BEHAVIOUR", "DELINQUENCY", "LIQUIDITY", "CONCENTRATION", "OPERATING_CASH_FLOW",
        "LEVERAGE", "DEBT_SERVICE", "TAX_REGULARITY", "MOMENTUM", "ACTIVITY_GROWTH",
    ],
}


def CATEGORY_RANK_TO_SAATY(d):
    return {1: 2, 2: 3, 3: 4}.get(d, 5)


CATEGORY_JUDGMENTS = {"BANK": {}, "FUND": {}, "INSURER": {}}

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
        ("DEBT_DSCR", "DEBT_LINE_UTIL"): 5,
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
    ranking = CATEGORY_RANKING[profile]
    judgments = {}
    for i in range(len(ranking)):
        for j in range(i + 1, len(ranking)):
            judgments[(ranking[i], ranking[j])] = CATEGORY_RANK_TO_SAATY(j - i)
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
    ranking = CATEGORY_RANKING[profile]
    if sorted(ranking) != sorted(CATEGORIES):
        fail(f"{profile}: the ranking must hold the {len(CATEGORIES)} categories exactly once")
    weights = checked_weights(f"categories/{profile}", ranking, category_judgments(profile), report)
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
