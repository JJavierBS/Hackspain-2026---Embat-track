"""
AHP en DOS NIVELES para los 22 indicadores:
  1) Nivel INDICADOR: dentro de cada categoria, AHP entre sus indicadores.
  2) Nivel CATEGORIA: AHP entre las 9 categorias, una vez por cada plan.

Peso final de un indicador = peso_categoria[plan] * peso_intra_categoria[plan]

Tres planes: bank (Banca), insurance (Aseguradora), fund (Fondo).
"""
import numpy as np
from ahp import ahp_weights

# ---------------------------------------------------------------------------
# 1) Los 22 indicadores, agrupados en 9 categorias
# ---------------------------------------------------------------------------
CATEGORIES = {
    "LIQUIDITY": ["LIQ_RUNWAY", "LIQ_BUFFER", "LIQ_MIN_BALANCE"],
    "CASH_FLOW": ["CF_NOCF_MARGIN", "CF_VOLATILITY", "CF_IN_OUT_RATIO"],
    "ACTIVITY_GROWTH": ["ACT_GROWTH"],
    "DEBT_SERVICE": ["DEBT_DSCR", "DEBT_LINE_UTIL"],
    "LEVERAGE": ["LEV_DEBT_TO_CF", "LEV_FACTORING_RELIANCE", "LEV_FUNDING_COST"],
    "PAYMENT_BEHAVIOUR": ["PAY_DSO", "PAY_DPO", "PAY_LATENESS", "PAY_OVERDUE"],
    "DELINQUENCY": ["DEL_OVERDUE_RECEIVABLES", "DEL_AGING_90"],
    "CONCENTRATION": ["CON_HHI_CUSTOMERS", "CON_HHI_SUPPLIERS", "CON_CUSTOMER_CHURN"],
    "TAX_REGULARITY": ["TAX_REGULARITY"],
}
CRITERIA = [ind for inds in CATEGORIES.values() for ind in inds]
PROFILES = ["bank", "insurance", "fund"]


def build_pairwise_matrix(criteria: list, judgments: dict) -> np.ndarray:
    """judgments: {(i,j): valor_saaty} solo para i antes que j; el reciproco
    se calcula solo. Valor > 1 significa que i es mas importante que j."""
    n = len(criteria)
    idx = {c: i for i, c in enumerate(criteria)}
    matrix = np.ones((n, n))
    for (ci, cj), value in judgments.items():
        i, j = idx[ci], idx[cj]
        matrix[i, j] = value
        matrix[j, i] = 1.0 / value
    return matrix


def judgments_from_ranking(ranking: list, saaty_for_distance) -> dict:
    """Genera los C(n,2) juicios de una matriz completa a partir de un orden
    (de mas a menos importante), usando saaty_for_distance(d) para traducir
    la distancia de ranking a un valor de la escala."""
    judgments = {}
    n = len(ranking)
    for i in range(n):
        for j in range(i + 1, n):
            judgments[(ranking[i], ranking[j])] = saaty_for_distance(j - i)
    return judgments


# Calibrado para que 9 elementos (las categorias) se mantengan consistentes
# (CR < 0.10). 
CATEGORY_RANK_TO_SAATY = lambda d: {1: 2, 2: 3, 3: 4}.get(d, 5)

# ---------------------------------------------------------------------------
# 2) NIVEL CATEGORIA: orden de importancia de las 9 categorias, por plan.
# ---------------------------------------------------------------------------
CATEGORY_RANKING = {
    "bank": [
        "DEBT_SERVICE", "LIQUIDITY", "CASH_FLOW", "LEVERAGE",
        "PAYMENT_BEHAVIOUR", "DELINQUENCY", "TAX_REGULARITY",
        "CONCENTRATION", "ACTIVITY_GROWTH",
    ],
    "insurance": [
        "PAYMENT_BEHAVIOUR", "DELINQUENCY", "CONCENTRATION", "LIQUIDITY",
        "CASH_FLOW", "LEVERAGE", "DEBT_SERVICE", "TAX_REGULARITY",
        "ACTIVITY_GROWTH",
    ],
    "fund": [
        "ACTIVITY_GROWTH", "CASH_FLOW", "LIQUIDITY", "CONCENTRATION",
        "LEVERAGE", "DEBT_SERVICE", "PAYMENT_BEHAVIOUR", "DELINQUENCY",
        "TAX_REGULARITY",
    ],
}

# Excepciones puntuales: forzar un par concreto sin tocar el ranking general.
# Ejemplo: CATEGORY_OVERRIDES["bank"][("LIQUIDITY", "CASH_FLOW")] = 1  # empate
CATEGORY_OVERRIDES = {"bank": {}, "insurance": {}, "fund": {}}

for name, ranking in CATEGORY_RANKING.items():
    assert sorted(ranking) == sorted(CATEGORIES.keys()), f"{name}: ranking incompleto"


def category_judgments(profile: str) -> dict:
    judgments = judgments_from_ranking(CATEGORY_RANKING[profile], CATEGORY_RANK_TO_SAATY)
    judgments.update(CATEGORY_OVERRIDES.get(profile, {}))
    return judgments


# ---------------------------------------------------------------------------
# 3) NIVEL INDICADOR: juicios explicitos dentro de cada categoria.
# ---------------------------------------------------------------------------
INDICATOR_JUDGMENTS_DEFAULT = {
    "LIQUIDITY": {
        ("LIQ_RUNWAY", "LIQ_BUFFER"): 1,
        ("LIQ_RUNWAY", "LIQ_MIN_BALANCE"): 3,
        ("LIQ_BUFFER", "LIQ_MIN_BALANCE"): 3,
    },
    "CASH_FLOW": {
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
        ("PAY_LATENESS", "PAY_OVERDUE"): 1,
        ("PAY_LATENESS", "PAY_DPO"): 3,
        ("PAY_LATENESS", "PAY_DSO"): 3,
        ("PAY_OVERDUE", "PAY_DPO"): 3,
        ("PAY_OVERDUE", "PAY_DSO"): 3,
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
    # ACTIVITY_GROWTH y TAX_REGULARITY: 1 solo indicador, no necesitan AHP.
}

# Excepciones por plan: INDICATOR_JUDGMENTS_OVERRIDES["insurance"]["PAYMENT_BEHAVIOUR"][(...)] = ...
INDICATOR_JUDGMENTS_OVERRIDES = {"bank": {}, "insurance": {}, "fund": {}}


def indicator_judgments_for(profile: str, category: str) -> dict:
    judgments = dict(INDICATOR_JUDGMENTS_DEFAULT.get(category, {}))
    judgments.update(INDICATOR_JUDGMENTS_OVERRIDES.get(profile, {}).get(category, {}))
    return judgments


# ---------------------------------------------------------------------------
# 4) Calculo: AHP a los dos niveles, combinacion final
# ---------------------------------------------------------------------------
def category_weights(profile: str) -> dict:
    matrix = build_pairwise_matrix(list(CATEGORIES.keys()), category_judgments(profile))
    result = ahp_weights(matrix)
    if not result["is_consistent"]:
        print(f"  [!] categorias/{profile}: CR={result['CR']:.3f} >= 0.10, revisar CATEGORY_RANKING")
    return dict(zip(CATEGORIES.keys(), result["weights"]))


def indicator_weights_within_category(profile: str, category: str) -> dict:
    indicators = CATEGORIES[category]
    if len(indicators) == 1:
        return {indicators[0]: 1.0}
    matrix = build_pairwise_matrix(indicators, indicator_judgments_for(profile, category))
    result = ahp_weights(matrix)
    if not result["is_consistent"]:
        print(f"  [!] {category}/{profile}: CR={result['CR']:.3f} >= 0.10, revisar judgments")
    return dict(zip(indicators, result["weights"]))


def final_weights(profile: str) -> dict:
    cat_w = category_weights(profile)
    weights = {}
    for cat, indicators in CATEGORIES.items():
        intra_w = indicator_weights_within_category(profile, cat)
        for ind in indicators:
            weights[ind] = cat_w[cat] * intra_w[ind]
    return weights, cat_w


if __name__ == "__main__":
    for profile in PROFILES:
        weights, cat_w = final_weights(profile)
        print(f"=== PLAN: {profile.upper()} ===")
        print("Pesos de categoria:")
        for cat, w in sorted(cat_w.items(), key=lambda x: -x[1]):
            print(f"  {cat:20s} {w:.3f}")
        print("Pesos finales de los 22 indicadores:")
        for ind, w in sorted(weights.items(), key=lambda x: -x[1]):
            print(f"  {ind:28s} {w:.4f}")
        print(f"  suma = {sum(weights.values()):.4f}")
        print()