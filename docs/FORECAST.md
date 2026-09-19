# FORECAST — score projection method (phase 7, plan R2)

Status: **implemented** in `ForecastCalculator` + `S85_Forecast` (branch `feat/phase7-integration`).
All numbers below come from `scripts/forecast/backtest.py` on the real `profile_scores` of the run of
2026-09-19 (weights before A-8). Re-run the script after any weight change.

## 1. Recommendation

Use **mean reversion toward the entity's own median** (an AR(1) process):

```
v[0] = final[m]
v[h] = clamp(median + rho × (v[h-1] − median), 0, 100)     median = median of final[0..m]
```

- `rho = 0.85`, `max-horizon-months = 6`, UI default horizon 3.
- It is the only method in the test that beats persistence (the last value carried forward).
- The damped linear trend of the source branch (N = 6, d = 0.8) loses to persistence at every horizon,
  by 29 % to 52 % in MAE. **It must not ship.** Each parameter choice below is `sourced` by the backtest.

## 2. Causality (decision H12)

A forecast made at month `m` reads `final[0..m]` and nothing else:

- the median is the median of the non-null values of `final[0..m]`;
- the start value is `final[m]`; no forecast when `final[m]` is null;
- the history count (for the reliability) is the number of non-null values of `final[0..m]`.

`LookAheadTest` enforces it: it runs `S85_Forecast` on the full panel and on the panel cut at M12, and
every `forecast_points` row with origin month ≤ M12 must be identical. A mutation check proves the test
works: a median over the whole series makes it fail.

The source branch's CUSUM baseline used the mean of the first half of **all** deltas. That reads months
after `m`, so rule 1 forbids it.

## 3. Alternatives and why they lose

| Method | Result on GROUP, h1..h3 vs persistence | Decision |
|---|---|---|
| Persistence (last value) | baseline | The bar every method must pass. |
| Damped linear trend, N=6, d=0.8 (branch) | −37.3 % | Rejected. A trend over 6 months of a score that turns fast extrapolates the last swing. |
| Damped linear trend, best of 30 settings (N=12, d=0.3) | −14.6 % | Rejected. No setting beats persistence. |
| Holt damped trend, best of 24 settings | −1.0 % | Rejected. Its best setting is almost persistence (alpha = 1). |
| Own median only (rho = 0) | −22.8 % | Rejected at short horizons, good at h ≥ 4. |
| **Mean reversion, rho = 0.85** | **+5.7 %** | **Shipped.** Ties persistence at h=1, better from h=2. |

Why mean reversion wins: the monthly score moves a lot (median move 5.6 points, mean 9.8) and it
returns toward its own level. R3 measured the same effect: over the next 3 months, the change in
`final` correlates −0.48 with the distance from the entity's own median (BANK).

## 4. Backtest tables

Rolling origin: every entity, profile and origin month with at least 6 scored months. MAE in points
on the 0–100 scale. Skill = 1 − MAE / MAE(persistence), mean over h1..h3.


### GROUP, all profiles: MAE in points

Forecasts per horizon: [8397, 7668, 6981, 6369, 5802, 5265]

| Method | h=1 | h=2 | h=3 | h=4 | h=5 | h=6 | skill h1..h3 |
|---|---:|---:|---:|---:|---:|---:|---:|
| persistence (baseline) | 8.40 | 12.92 | 17.06 | 18.87 | 19.73 | 19.32 | +0.0 % |
| own median (rho = 0) | 14.83 | 15.88 | 16.43 | 16.48 | 16.34 | 16.15 | -22.8 % |
| damped trend N=6 d=0.8 (branch) | 10.86 | 17.98 | 23.86 | 27.22 | 29.11 | 29.34 | -37.3 % |
| damped trend N=12 d=0.3 (best of grid) | 9.92 | 14.96 | 19.10 | 20.89 | 21.74 | 21.29 | -14.6 % |
| Holt damped a=1.0 b=0.1 phi=0.5 (best of grid) | 8.42 | 13.01 | 17.33 | 19.28 | 20.28 | 19.94 | -1.0 % |
| mean reversion rho=0.75 | 8.70 | 12.63 | 15.29 | 16.06 | 16.18 | 15.84 | +4.6 % |
| mean reversion rho=0.80 | 8.51 | 12.45 | 15.32 | 16.15 | 16.30 | 15.84 | +5.5 % |
| mean reversion rho=0.85 (shipped) | 8.38 | 12.36 | 15.46 | 16.38 | 16.58 | 15.99 | +5.7 % |
| mean reversion rho=0.90 | 8.30 | 12.39 | 15.75 | 16.85 | 17.13 | 16.43 | +5.1 % |

### GROUP, BANK: MAE in points

Forecasts per horizon: [2799, 2556, 2327, 2123, 1934, 1755]

| Method | h=1 | h=2 | h=3 | h=4 | h=5 | h=6 | skill h1..h3 |
|---|---:|---:|---:|---:|---:|---:|---:|
| persistence (baseline) | 7.55 | 11.14 | 14.60 | 15.67 | 16.33 | 16.45 | +0.0 % |
| own median (rho = 0) | 13.08 | 13.96 | 14.44 | 14.50 | 14.45 | 14.46 | -24.6 % |
| damped trend N=6 d=0.8 (branch) | 9.73 | 15.74 | 20.83 | 23.47 | 25.36 | 26.32 | -39.1 % |
| damped trend N=12 d=0.3 (best of grid) | 9.04 | 13.18 | 16.61 | 17.66 | 18.38 | 18.39 | -16.6 % |
| Holt damped a=1.0 b=0.1 phi=0.5 (best of grid) | 7.57 | 11.21 | 14.87 | 16.00 | 16.75 | 16.94 | -1.0 % |
| mean reversion rho=0.75 | 7.94 | 11.09 | 13.29 | 13.76 | 14.04 | 14.04 | +2.9 % |
| mean reversion rho=0.80 | 7.76 | 10.92 | 13.28 | 13.72 | 14.02 | 13.97 | +4.0 % |
| mean reversion rho=0.85 (shipped) | 7.61 | 10.81 | 13.37 | 13.83 | 14.10 | 13.99 | +4.5 % |
| mean reversion rho=0.90 | 7.53 | 10.78 | 13.57 | 14.14 | 14.40 | 14.21 | +4.3 % |

### GROUP, FUND: MAE in points

Forecasts per horizon: [2799, 2556, 2327, 2123, 1934, 1755]

| Method | h=1 | h=2 | h=3 | h=4 | h=5 | h=6 | skill h1..h3 |
|---|---:|---:|---:|---:|---:|---:|---:|
| persistence (baseline) | 11.81 | 18.84 | 25.30 | 28.23 | 29.41 | 27.92 | +0.0 % |
| own median (rho = 0) | 19.95 | 21.48 | 22.20 | 22.06 | 21.60 | 20.94 | -13.7 % |
| damped trend N=6 d=0.8 (branch) | 15.34 | 25.78 | 34.28 | 38.88 | 40.79 | 39.48 | -34.8 % |
| damped trend N=12 d=0.3 (best of grid) | 13.46 | 21.08 | 27.54 | 30.43 | 31.48 | 29.90 | -11.0 % |
| Holt damped a=1.0 b=0.1 phi=0.5 (best of grid) | 11.84 | 18.99 | 25.71 | 28.91 | 30.34 | 28.96 | -1.1 % |
| mean reversion rho=0.75 | 11.99 | 17.89 | 21.75 | 22.67 | 22.24 | 21.06 | +7.7 % |
| mean reversion rho=0.80 | 11.77 | 17.75 | 22.01 | 23.11 | 22.77 | 21.32 | +7.9 % |
| mean reversion rho=0.85 (shipped) | 11.63 | 17.74 | 22.44 | 23.78 | 23.62 | 21.92 | +7.4 % |
| mean reversion rho=0.90 | 11.58 | 17.90 | 23.07 | 24.78 | 24.86 | 23.00 | +6.1 % |

### GROUP, INSURER: MAE in points

Forecasts per horizon: [2799, 2556, 2327, 2123, 1934, 1755]

| Method | h=1 | h=2 | h=3 | h=4 | h=5 | h=6 | skill h1..h3 |
|---|---:|---:|---:|---:|---:|---:|---:|
| persistence (baseline) | 5.84 | 8.78 | 11.27 | 12.71 | 13.44 | 13.59 | +0.0 % |
| own median (rho = 0) | 11.47 | 12.19 | 12.64 | 12.86 | 12.95 | 13.05 | -40.2 % |
| damped trend N=6 d=0.8 (branch) | 7.52 | 12.43 | 16.48 | 19.30 | 21.18 | 22.22 | -40.7 % |
| damped trend N=12 d=0.3 (best of grid) | 7.26 | 10.61 | 13.14 | 14.57 | 15.35 | 15.57 | -19.7 % |
| Holt damped a=1.0 b=0.1 phi=0.5 (best of grid) | 5.84 | 8.82 | 11.42 | 12.93 | 13.74 | 13.91 | -0.8 % |
| mean reversion rho=0.75 | 6.18 | 8.93 | 10.83 | 11.77 | 12.25 | 12.42 | -0.2 % |
| mean reversion rho=0.80 | 6.01 | 8.69 | 10.66 | 11.61 | 12.11 | 12.22 | +2.0 % |
| mean reversion rho=0.85 (shipped) | 5.88 | 8.54 | 10.57 | 11.53 | 12.03 | 12.06 | +3.5 % |
| mean reversion rho=0.90 | 5.81 | 8.48 | 10.60 | 11.64 | 12.12 | 12.07 | +3.9 % |

### COMPANY, all profiles: MAE in points

Forecasts per horizon: [43164, 39378, 35847, 32694, 29730, 26874]

| Method | h=1 | h=2 | h=3 | h=4 | h=5 | h=6 | skill h1..h3 |
|---|---:|---:|---:|---:|---:|---:|---:|
| persistence (baseline) | 8.75 | 13.16 | 17.26 | 18.87 | 19.72 | 19.07 | +0.0 % |
| own median (rho = 0) | 15.48 | 16.55 | 17.07 | 17.15 | 17.04 | 16.85 | -25.4 % |
| damped trend N=6 d=0.8 (branch) | 11.38 | 18.39 | 24.26 | 27.37 | 29.23 | 29.31 | -37.9 % |
| damped trend N=12 d=0.3 (best of grid) | 10.45 | 15.40 | 19.50 | 21.13 | 21.94 | 21.32 | -15.8 % |
| Holt damped a=1.0 b=0.1 phi=0.5 (best of grid) | 8.77 | 13.27 | 17.59 | 19.31 | 20.30 | 19.70 | -1.2 % |
| mean reversion rho=0.75 | 9.14 | 13.00 | 15.62 | 16.37 | 16.52 | 16.28 | +3.6 % |
| mean reversion rho=0.80 | 8.94 | 12.80 | 15.59 | 16.38 | 16.53 | 16.15 | +4.7 % |
| mean reversion rho=0.85 (shipped) | 8.79 | 12.68 | 15.68 | 16.54 | 16.70 | 16.14 | +5.1 % |
| mean reversion rho=0.90 | 8.70 | 12.68 | 15.95 | 16.92 | 17.15 | 16.40 | +4.7 % |

### Error by history length (GROUP, all profiles, rho = 0.85 vs persistence)

| Scored months up to m | h=1 | h=2 | h=3 | persistence h=1 | persistence h=3 | origins |
|---|---:|---:|---:|---:|---:|---:|
| 2–3 | 20.52 | 24.54 | 28.68 | 20.11 | 28.74 | 1,488 |
| 4–5 | 12.13 | 17.71 | 20.45 | 11.63 | 19.44 | 1,467 |
| 6–7 | 9.19 | 14.10 | 17.80 | 9.15 | 19.05 | 1,416 |
| 8–11 | 8.93 | 12.69 | 15.88 | 8.87 | 17.28 | 2,226 |
| 12+ | 7.89 | 11.68 | 14.53 | 7.97 | 16.34 | 4,755 |

This table sets the reliability rule (decision H14): below 6 months the error doubles and the method
is no better than persistence, so **LOW**. At 6–7 months the error is still high, so **MEDIUM**. From
8 months the error is close to the 12+ level, so **HIGH**. The source branch's rule (< 6 / 6–7 / ≥ 8)
matches the data, so it stays. A LOW forecast is drawn and labelled, never hidden.

## 5. Honest horizon

- At h=1 the error (8.4 points) is close to the normal monthly move of the score. The projection
  adds little over "no change" at h=1.
- From h=3 the error (15–16 points) is larger than one band (15 points). A viewer must read a 3-month
  projection as a direction, not as a band.
- At h=6 the projection is 38 % of the way from the median (0.85^6). Past 6 months it is the median.
- So `max-horizon-months = 6`, and the UI opens at 3.

## 6. Does a causal CUSUM on the score add anything? (decision H13)

**No.** `CusumDetector` already runs on `final` (series `FINAL` in `changepoints`), causally, with a
median/MAD baseline of the previous 6 months. `RegimeClassifier` and `TrajectoryCalculator` turn it into
"declining / improving, sustained". A second CUSUM with its own `k`/`h` would give a second answer to
the same question, and the two could disagree on screen. The branch's CUSUM also read the future (§2).

## 7. Config block (applied)

```yaml
  forecast:
    mean-reversion: 0.85            # rho: best h1..h3 MAE on GROUP and COMPANY (FORECAST.md table 1)
    max-horizon-months: 6           # past 6 the projection is the median; MAE ~16 pts, above one band width
    min-points: 3                   # fewer scored months: no projection at all
    min-history-months: 6           # below: LOW (h1 MAE 12-20 pts, no better than persistence)
    medium-history-months: 8        # below: MEDIUM; from here on the error is close to the 12+ months level
```

## 8. Differences from the plan text

| Plan | Implemented | Why |
|---|---|---|
| `Params(slopeWindow, damping, …)` | `Params(meanReversion, maxHorizonMonths, minPoints, minHistoryMonths, mediumHistoryMonths)` | The plan said R2's method replaces the projection body. A slope window and a damping have no meaning in mean reversion. `minPoints` separates "no forecast" (< 3) from "LOW" (< 6), so a LOW forecast can be shown. |
| column `slope` | columns `median`, `history`, `target_month` | The median is what the projection reverts to. `target_month` saves date arithmetic in SQL and in the UI. |
| forecast on `TimelineDto` only | also on `EntityDetailDto` (`?horizon`) | The entity page reads `/api/entities/{id}`, not `/timeline`. One fetch for the UI (plan A-7). |
