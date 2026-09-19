# Thresholds — status of the 10 pending anchors (SPEC §6.1)

Provisional anchors are live in `backend/src/main/resources/scoring-config.yml` with `status: pending`.
Quantiles come from `sql/90_threshold_quantiles.sql` after block 3, per `entity_type` of the active unit.
A human (Fran / José Javier) reviews every proposal before `status: closed`.

| Indicator | Fixed part | Provisional anchors | p5 / p25 / p50 / p75 / p95 | Proposal | Status |
|---|---|---|---|---|---|
| `PAY_DPO` | ≤ 60 days → 100 | [[60,100],[90,60],[120,30],[180,0]] | after block 3 | — | pending |
| `CF_NOCF_MARGIN` | < 0 → ≤ 35, 0 → 45 | [[-0.2,0],[-0.0001,35],[0,45],[0.1,75],[0.2,100]] | after block 3 | — | pending |
| `ACT_COLLECTIONS_GROWTH` | 0% → 50, symmetric | [[-0.3,0],[-0.15,25],[0,50],[0.15,75],[0.3,100]] | after block 3 | — | pending |
| `LIQ_MIN_BALANCE` | < 0 → ≤ 25 | [[-1,0],[0,25],[0.5,60],[1,80],[2,100]] | after block 3 | — | pending |
| `LEV_FACTORING_RELIANCE` | 0% → 100 | [[0,100],[0.2,70],[0.4,45],[0.7,15],[1.0,0]] | after block 3 | — | pending |
| `PAY_OVERDUE_PAYABLES` | 0% → 100 | [[0,100],[0.1,75],[0.25,45],[0.5,15],[0.8,0]] | after block 3 | — | pending |
| `DEL_OVERDUE_RECEIVABLES` | 0% → 100 | [[0,100],[0.1,75],[0.25,45],[0.5,15],[0.8,0]] | after block 3 | — | pending |
| `LEV_FUNDING_COST` | spread over `reference-rate` | [[0,100],[0.01,85],[0.025,60],[0.05,30],[0.08,0]] | after block 3 | — | pending |
| `CF_VOLATILITY` | — | [[0.1,100],[0.3,70],[0.6,40],[1.0,15],[2.0,0]] | after block 3 | — | pending |
| `CON_CUSTOMER_CHURN` | — | [[0.0,100],[0.1,75],[0.25,45],[0.5,15],[0.8,0]] | after block 3 | — | pending |

`reference-rate` (limit engine and `LEV_FUNDING_COST`) is a placeholder of 0.035. Set the current market rate by hand.
