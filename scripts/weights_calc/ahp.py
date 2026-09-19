"""
AHP (Analytic Hierarchy Process) — Matriz de pares -> pesos + consistencia.
"""
import numpy as np

# Indice Aleatorio (RI) de Saaty, segun tamano de la matriz (n=1..10).
# Se usa para calcular el Ratio de Consistencia (CR = CI / RI).
RANDOM_INDEX = {1: 0.0, 2: 0.0, 3: 0.58, 4: 0.90, 5: 1.12,
                6: 1.24, 7: 1.32, 8: 1.41, 9: 1.45, 10: 1.49}


def ahp_weights(pairwise_matrix: np.ndarray) -> dict:
    """
    pairwise_matrix: matriz n x n de comparaciones (escala de Saaty 1-9,
    con reciprocos: si A/B = 3, entonces B/A = 1/3). La diagonal debe ser 1.

    Devuelve:
      - weights: vector de pesos (suma 1)
      - CR: ratio de consistencia (valido si CR < 0.10)
      - lambda_max: autovalor principal (usado para calcular CR)
    """
    matrix = np.array(pairwise_matrix, dtype=float)
    n = matrix.shape[0]
    assert matrix.shape == (n, n), "la matriz debe ser cuadrada"

    # 1) Normalizar cada columna (dividir por la suma de su columna)
    col_sums = matrix.sum(axis=0)
    normalized = matrix / col_sums

    # 2) Peso de cada criterio = promedio de su fila ya normalizada
    weights = normalized.mean(axis=1)

    # 3) Comprobar consistencia: lambda_max, Indice de Consistencia (CI), Ratio (CR)
    weighted_sum = matrix @ weights          # A * w
    lambda_max = (weighted_sum / weights).mean()
    ci = (lambda_max - n) / (n - 1) if n > 1 else 0.0
    ri = RANDOM_INDEX.get(n, 1.49)
    cr = ci / ri if ri > 0 else 0.0

    return {
        "weights": weights,
        "lambda_max": lambda_max,
        "CI": ci,
        "CR": cr,
        "is_consistent": cr < 0.10,
    }