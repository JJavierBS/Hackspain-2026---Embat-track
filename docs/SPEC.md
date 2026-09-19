# X-Ray — Application Specification for Coding Agents

> **Audience:** Claude Code, Gemini, Codex or any coding agent/LLM working on this repo.
> **Context:** HackSpain 2026, Embat challenge "X-Ray" (Madrid, 18–20 Sept 2026). Two developers, ~20 effective hours.
> **Source documents:** `embat-track.md` (official challenge) and `Embat-x-ray-investigacion.md` (our research). This spec is the single source of truth for implementation. When this spec and the research disagree, this spec wins.
> **Language:** code, identifiers, commits and API in English. UI copy may be Spanish.

---

## 0. Rules for the agent (read first)

1. **Never assume data semantics that are marked `⚠ UNKNOWN`.** Run the profiling queries in §4, write the answers to `docs/DATA_FINDINGS.md`, and only then implement the dependent logic. If a finding contradicts this spec, update the config (§9), not hard-coded logic.
2. **All per-month computations must be causal.** The value for month `m` may only use data dated `<= end of month m`. This is what makes "anticipation" and the monitor replay credible. Snapshot-only data (debt outstanding, balances) is the only exception and must be flagged `static=true`.
3. **Every indicator can be missing.** Missing ≠ zero. Missing indicators are excluded and weights are renormalized (§7.4).
4. **Keep the demo alive at every milestone.** Build order in §13 always leaves a runnable app. Precomputed results are persisted so the demo never depends on recomputation.
5. **Config over code.** Anchors, weights, thresholds, category mappings live in `backend/src/main/resources/scoring-config.yml` (§9).
6. Prefer boring, well-known libraries. No experimental dependencies.
7. **All level scores are absolute functions of the entity's own value** (fixed anchors in config). No indicator is scored against other entities at runtime. Indicators marked `⏳ PENDING` in §6 have provisional anchors until the threshold decision in §6.1 is closed.

---

## 1. What we are building (one paragraph)

A **financial health scoring engine (0–100)** computed monthly for every business entity from its money trail (bank transactions, invoices, debt), split into a **Level** component (how healthy it is now) and a **Trajectory** component (where it is heading), with **per-entity explanations**, **dip-vs-structural-decline detection**, **measured anticipation (lead time)**, and an **alert monitor**. On top of the score we build a **sellable product**: a **self-recalculating working-capital credit limit engine + early-warning monitor** sold to banks/lenders (primary buyer), plus two re-weighted views of the same score: **dynamic trade-credit insurance premium** (insurers) and **momentum screening** (investment funds). A UI parameter switches between the **three weight tables** (BANK / FUND / INSURER), recomputing scores, rankings, explanations and product outputs instantly.

## 2. What the challenge requires (acceptance at the product level)

| Requirement (Embat) | Status | Where in this spec |
|---|---|---|
| Prediction on hidden test (60–80 entities) for leaderboard | Mandatory | §11 Submission export |
| Signal in both directions (improvement and deterioration) | Mandatory | §7 Trajectory, §8 Regimes/Statuses |
| Trajectory, not snapshot | Mandatory | §7.2 |
| Explanation (why this number, what moved it) | Mandatory | §7.5 |
| Product on top of the score | Mandatory | §10 |
| Identified buyer | Mandatory | §10 (bank primary) |
| Navigable demo (not a notebook) | Mandatory | §12 Frontend, §14 Deployment |
| Measured anticipation (months ahead) | Bonus | §8.4 Lead time |
| Monitor that alerts on its own | Bonus | §8.5 Alerts, replay |

Evaluation blocks (equal weight): **accuracy** (generalization, trajectory, both directions), **timeliness** (anticipation, stability dip vs decline, monitor), **value** (product, buyer, explanation, craft). Embat explicitly prefers a simple model with a clear product over a sophisticated model without one.

The six questions the system must answer, per entity and per month:
1. Who is healthy (including exceptionally solid). 2. Who is improving. 3. Who is starting to turn. 4. Dip or structural decline. 5. Why it changed. 6. How early it was seen.

---

## 3. Data

Synthetic dataset, **1,286 companies in 250 business groups**, 24 months, **2024-09-01 → 2026-09-01**. Files in `data/raw/` (gitignored).

| File | Rows | Key fields |
|---|---|---|
| `groups.csv` | 250 | `group_id, erp, n_companies_in_sample` |
| `companies.csv` | 1,286 | `company_id, group_id, country, currency, erp, created_at` |
| `banking_products.csv` | 5,987 | `product_id, company_id, label, type(checking/card/investment/tpv/saving/expensesPlatform), bank_name, service, currency, created_at` |
| `debt_products.csv` | 2,239 | same + `granted, outstanding, liquidity`; `type` ∈ loan, leasing, lineofcredit, mortgage, renting, factoring, confirming, guarantee |
| `debt_schedule_config.csv` | 87 | `product_id, company_id, settlement_product_id, amortization_type, interest_calc_method, amortising_frequency, interest_type, granted_balance, outstanding_balance, total_periods, next_payment_date, last_payment_date, annual_interest_rate_or_spread` |
| `transactions.csv` | 2,556,437 | `transaction_id, company_id, product_id, date, value_date, amount(neg=out,pos=in), exchange_rate, status, accounting_status, category, description, counterparty_id` |
| `invoices.csv` | 897,894 | `operation_id, company_id, document_type, issuance_date, due_date, payment_date, amount, pending_amount, status, currency, accounting_currency, exchange_rate, concept, counterparty_id` |
| `balances.csv` | 7,996 | `product_id, company_id, date(=2026-09-01 or closest prior), balance, available, granted, liquidity, countable` |

Free-text fields (`description`, `concept`) contain placeholders: `COUNTERPARTY_xxxxx`, `[COMPANY]`, `[PERSON]`, `[NAME]`, `[IBAN]`, `[ACCOUNT]`, `[CARD]`, `[TAXID]`, `[EMAIL]`, `[PHONE]`, `[URL]`, `[ADDRESS]`, `[REF]`, `[NUM]`, `[X]`. IDs are stable across all files.

### 3.1 Scoring unit ⚠ UNKNOWN (critical)
The challenge text says "250 companies"; the dataset has **250 groups** and 1,286 companies. The hidden test is very likely at **group level**. Design everything with a generic `entity_type ∈ {GROUP, COMPANY}`:
- Compute raw monthly aggregates at **company** level.
- Build **group** level by **summing components** (flows, balances, invoice amounts) across the group's companies **after removing intragroup flows** (§5.4), then recompute ratios from summed components. **Never average ratios across companies.**
- Default scoring unit = `GROUP`; configurable. Confirm with Embat on Friday from the test ID format.

### 3.2 Time axis
Months `M00 = 2024-09` … `M23 = 2026-08`. `2026-09-01` is the snapshot date. Store months as `YYYY-MM` strings. "Current month" in the UI defaults to `M23`.

---

## 4. Data profiling (Milestone 0 — must run before indicator code)

Run these in DuckDB and record answers in `docs/DATA_FINDINGS.md`:

1. `SELECT category, COUNT(*), SUM(amount<0), SUM(amount>0) FROM transactions GROUP BY 1 ORDER BY 2 DESC` → fill the category→flow-class map (§9).
2. **Invoice direction ⚠ UNKNOWN:** the dictionary does not say how to tell issued (sales) vs received (purchases) invoices. Check `document_type` values, `amount` sign, and whether `counterparty_id` of an invoice appears on inflows or outflows in transactions. Decide the rule and write it down.
3. `status` values in transactions and invoices; `document_type` values; share of `payment_date` nulls.
4. **exchange_rate direction ⚠ UNKNOWN:** determine whether `amount_eur = amount * exchange_rate` or `amount / exchange_rate` (check a non-EUR company against EUR-denominated counterparts / typical magnitudes). Distribution of `currency` in companies.
5. **Intragroup detection ⚠ UNKNOWN:** do any `counterparty_id` values equal a `company_id`? If yes, intragroup = counterparty in same `group_id`. If no, fall back to categories like internal transfer and to transfers between own `product_id`s.
6. Do debt `product_id`s appear in `transactions.product_id`? (Needed for monthly line-of-credit utilization and debt service.)
7. History length per company: first/last transaction month, `created_at`. Count entities with < 6 and < 12 months.
8. Missingness per company: no invoices (no ERP), no debt, no tax category.
9. Which `banking_products.type` have balances; are card balances negative?

---

## 5. Pipeline (backend batch)

Triggered by `POST /api/pipeline/run` (and on startup if the results DB is empty). Output persisted to `data/xray.duckdb`. Target runtime: < 5 min on a laptop.

### 5.1 Ingestion
DuckDB `read_csv_auto` views over `data/raw/*.csv` (`raw_*`), then typed staging tables (`stg_*`). Only `status = 'booked'` transactions count for flows (confirm values in profiling); keep pending for display only.

### 5.2 Currency normalization
Add `amount_eur` to transactions and invoices using the rule from profiling §4.4. Group aggregation is always in EUR.

### 5.3 Flow classification
Map each transaction `category` to a `flow_class` via config (§9):
`OPERATING_IN`, `OPERATING_OUT`, `TAX`, `DEBT_SERVICE`, `FINANCING_IN` (disbursements, factoring advances), `INTERNAL` (own-account transfers), `OTHER`.
- `NOCF` uses `OPERATING_IN − OPERATING_OUT − TAX`. `FINANCING_IN` and `INTERNAL` are **excluded** (a loan disbursement is not revenue).
- `OTHER` falls back to sign: positive → operating in, negative → operating out (configurable).

### 5.4 Intragroup neutralization
At group level, drop transactions/invoices whose counterparty belongs to the same group (rule from §4.5). At company level keep them but tag `is_intragroup=true`.

### 5.5 Balance reconstruction (backwards from snapshot)
For each banking product with a snapshot balance `B(T)`, `T = 2026-09-01`:
```
balance(d) = B(T) − Σ amount_eur of booked txns on that product with date in (d, T]
```
Compute daily balances with window functions (reverse cumulative sum). Derive per month: end-of-month balance (`eom`), **minimum intra-month balance**, days with negative balance.
Cash definition (configurable): `checking + saving + tpv + expensesPlatform`. `investment` reported separately as semi-liquid, excluded from runway. `card` excluded.

### 5.6 Monthly aggregate tables
- `monthly_flows(entity_type, entity_id, month, flow_class, inflow_eur, outflow_eur, n_txn)`
- `monthly_cash(entity_type, entity_id, month, cash_eom, cash_min, neg_days, investment_eom)`
- `monthly_invoices(...)` issued/received: amounts issued, amounts paid, amount-weighted days-to-pay, lateness, overdue-at-eom buckets (0–30, 31–60, 61–90, 90+). **Overdue at eom must use `payment_date`, not `pending_amount`** (pending is as-of-extraction, not historical).
- `monthly_counterparty(entity, month, counterparty_id, direction, amount_eur)` for HHI and churn.
- `debt_snapshot(entity, type, granted, outstanding, liquidity)` — static.

---

## 6. Indicator catalogue (22 indicators)

Each indicator produces per entity-month: `value` (raw), `level_score` (0–100, §7.1), `traj_score` (0–100, §7.2), `available` (bool), `static` (bool). Windows: `3m` = months m-2..m, `6m` = m-5..m, `12m` = m-11..m.

| ID | Category | Definition (month m) | Better | Normalization |
|---|---|---|---|---|
| `LIQ_RUNWAY` | LIQUIDITY | `cash_eom / avg(monthly net outflow, 3m)`; if avg net outflow ≤ 0 → 24 (cap) | Higher | Anchors: 0→0, 1→20, 3→50, 6→75, ≥12→100 |
| `LIQ_BUFFER` | LIQUIDITY | `cash_eom / (received invoices unpaid at eom with due_date ≤ eom+90d + DEBT_SERVICE avg 3m × 3)` | Higher | Anchors: 0→0, 0.5→30, 1→60, 2→85, ≥3→100 |
| `LIQ_MIN_BALANCE` | LIQUIDITY | `cash_min / avg monthly operating outflow 3m` (negative allowed) | Higher | ⏳ PENDING — natural: < 0 (overdraft) → ≤ 25; rest from quantiles |
| `CF_NOCF_MARGIN` | OPERATING_CASH_FLOW | `NOCF_3m / OPERATING_IN_3m` | Higher | ⏳ PENDING — natural: < 0 → ≤ 35, 0 → 45; positive side from quantiles |
| `CF_VOLATILITY` | OPERATING_CASH_FLOW | `std(NOCF monthly, 6m) / mean(OPERATING_IN monthly, 6m)` | Lower | ⏳ PENDING — quantiles only |
| `CF_IN_OUT_RATIO` | OPERATING_CASH_FLOW | `OPERATING_IN_3m / (OPERATING_OUT_3m + TAX_3m)` | Higher | Anchors: ≤0.8→10, 1.0→50, 1.2→80, ≥1.5→100 |
| `ACT_COLLECTIONS_GROWTH` | ACTIVITY_GROWTH | YoY: `OPERATING_IN_3m / same 3m previous year − 1` (available from M14). Before M14 fallback: `OPERATING_IN_3m / previous 3m − 1`, flagged `fallback=true` | Higher | ⏳ PENDING — natural: 0% → 50, symmetric; span from quantiles |
| `DEBT_DSCR` | DEBT_SERVICE | `NOCF_3m / DEBT_SERVICE_3m`; if no debt service → value null, level 100, flag `no_debt` | Higher | Anchors: ≤0.8→0, 1.0→30, 1.25→60, 2.0→85, ≥3→100 |
| `DEBT_LINE_UTIL` | DEBT_SERVICE | `outstanding / granted` of lineofcredit products; monthly if §4.6 allows, else static | Lower | Anchors: ≤50%→100, 80%→50, ≥100%→0 |
| `LEV_DEBT_TO_CF` | LEVERAGE | `total debt outstanding / NOCF_12m annualized` (EBITDA proxy); NOCF ≤ 0 → level 0 | Lower | Anchors: 0→100, 1→90, 3→65, 5→40, ≥8→0 |
| `LEV_FACTORING_RELIANCE` | LEVERAGE | `(factoring + confirming outstanding) / total debt outstanding` (static) combined with growth of factoring-classified inflows 3m vs prior 3m if category exists | Lower | ⏳ PENDING — natural: 0% → 100; tail from quantiles |
| `LEV_FUNDING_COST` | LEVERAGE | `interest-classified outflows 12m / debt outstanding`, fallback amount-weighted `annual_interest_rate_or_spread` | Lower | ⏳ PENDING — market: spread over `reference_rate` (rate set manually in config) |
| `PAY_DSO` | PAYMENT_BEHAVIOUR | amount-weighted avg `(payment_date − issuance_date)` of issued invoices paid in 3m | Lower | Anchors: ≤30→100, 60→70, 90→40, ≥150→0 |
| `PAY_DPO` | PAYMENT_BEHAVIOUR | amount-weighted avg `(payment_date − issuance_date)` of received invoices paid in 3m (stretching suppliers = stress) | Lower | ⏳ PENDING — legal: ≤ 60 days → 100 (Ley 3/2004 mod. Ley 15/2010), penalty curve above from quantiles |
| `PAY_SUPPLIER_LATENESS` | PAYMENT_BEHAVIOUR | amount-weighted avg `max(0, payment_date − due_date)` of received invoices paid in 3m | Lower | Anchors: 0→100, 15→70, 30→45, ≥60→0 |
| `PAY_OVERDUE_PAYABLES` | PAYMENT_BEHAVIOUR | received invoices overdue & unpaid at eom / received invoice amount 3m | Lower | ⏳ PENDING — natural: 0% → 100; tail from quantiles |
| `DEL_OVERDUE_RECEIVABLES` | DELINQUENCY | issued invoices overdue & unpaid at eom / issued invoice amount 3m | Lower | ⏳ PENDING — natural: 0% → 100; tail from quantiles |
| `DEL_AGING_90` | DELINQUENCY | share of overdue receivables > 90 days | Lower | Anchors: 0→100, 10%→70, 25%→40, ≥50%→0 |
| `CON_HHI_CUSTOMERS` | CONCENTRATION | HHI (0–10,000) of operating inflows by counterparty, 6m | Lower | Anchors: ≤1000→100, 1800→60, 2500→45, 5000→20, 10000→0 |
| `CON_HHI_SUPPLIERS` | CONCENTRATION | same on operating outflows | Lower | same anchors |
| `CON_CUSTOMER_CHURN` | CONCENTRATION | share of recurring customers (active in ≥3 of previous 6 months) with zero inflow in the last 2 months | Lower | ⏳ PENDING — quantiles only |
| `TAX_REGULARITY` | TAX_REGULARITY | `months with TAX outflow in 12m / expected months` (expected learned from the entity's own pattern: monthly or quarterly), penalize current gap longer than usual cadence | Higher | Anchors: 0→0, 0.5→40, 0.8→75, ≥1.0→100 |

Plus one derived trajectory feature (not a level indicator):
- `MOM_PERSISTENCE`: signed count of consecutive months the entity's Level score (per profile) moved in the same direction (+n improving, −n declining). Feeds the MOMENTUM category and the regime classifier.

Notes:
- Thresholds in anchors come from the research (DSCR 1.25x bank covenant; HHI 1,000/1,800 DOJ; runway). They are defaults in config.
- Indicators needing invoices are unavailable for entities without ERP data → handled by renormalization.

### 6.1 Threshold decision status (anchors)

**Decision:** every indicator is scored with **fixed anchors** (piecewise-linear, absolute). No runtime percentile against other entities. Anchor sources, in order of preference:

1. **Label-learned** — monotonic binning (WoE cut points) or isotonic regression of the indicator against Embat's target, if labels exist (§7.7).
2. **External / legal / literature benchmark** — e.g. DSCR 1.25x, HHI 1,000/1,800, 60-day legal B2B payment term.
3. **Natural breakpoints** — a zero with business meaning (burning cash, overdraft, no growth, no factoring).
4. **Population quantiles, computed once, rounded and reviewed** — only to fill what 1–3 don't cover. They become hard-coded anchors in `scoring-config.yml`; they are never recomputed at runtime.

**Closed (12)** — anchors already defined in §6 from literature/benchmarks:
`LIQ_RUNWAY`, `LIQ_BUFFER`, `CF_IN_OUT_RATIO`, `DEBT_DSCR`, `DEBT_LINE_UTIL`, `LEV_DEBT_TO_CF`, `PAY_DSO`, `PAY_SUPPLIER_LATENESS`, `DEL_AGING_90`, `CON_HHI_CUSTOMERS`, `CON_HHI_SUPPLIERS`, `TAX_REGULARITY`.
(They may still be refined with source 1 if labels arrive.)

**⏳ PENDING (10)** — anchors not yet decided:

| Indicator | Fixed part (already decided) | Still to decide | Source used |
|---|---|---|---|
| `PAY_DPO` | ≤ 60 days → 100 | Penalty curve above 60 days | 2 + 4 |
| `CF_NOCF_MARGIN` | < 0 → ≤ 35, 0 → 45 | Positive side anchors | 3 + 4 |
| `ACT_COLLECTIONS_GROWTH` | 0% → 50, symmetric | Span (growth that maps to 0 / 100) | 3 + 4 |
| `LIQ_MIN_BALANCE` | < 0 (overdraft) → ≤ 25 | Positive side anchors | 3 + 4 |
| `LEV_FACTORING_RELIANCE` | 0% → 100 | Tail anchors | 3 + 4 |
| `PAY_OVERDUE_PAYABLES` | 0% → 100 | Tail anchors | 3 + 4 |
| `DEL_OVERDUE_RECEIVABLES` | 0% → 100 | Tail anchors | 3 + 4 |
| `LEV_FUNDING_COST` | Scored as spread over `reference_rate` | Value of `reference_rate` (set manually, verify current market rate) and spread anchors | 2 |
| `CF_VOLATILITY` | — | All anchors | 4 only |
| `CON_CUSTOMER_CHURN` | — | All anchors | 4 only |

**Procedure to close a PENDING indicator (part of M2):**
1. Compute p5, p10, p25, p50, p75, p90, p95 of the raw value over all entity-months with `available=true` (script: `resources/sql/threshold_quantiles.sql`).
2. Propose anchors that respect the fixed part; round to human-readable values (e.g. 58.3 days → 60).
3. Write the proposal and quantiles to `docs/THRESHOLDS.md` with a one-line business justification per anchor.
4. **Human review** (Fran / José Javier) before setting `status: closed` in `scoring-config.yml`.
5. Until closed, the indicator runs with the provisional anchors and the UI shows a "provisional threshold" marker in the indicator table and the Methodology page.

---

## 7. Scoring model

### 7.1 Level sub-score (0–100 per indicator)
- **Anchors**: piecewise-linear interpolation between anchor points, clamped to [0,100]. Direction is encoded in the anchors.
- **All indicators use anchors.** There is no runtime percentile normalization: an entity's level score depends only on its own value, so it is absolute, explainable in real units ("DSO 75 days → 55 pts") and identical for training and hidden-test entities.
- Indicators still `⏳ PENDING` (§6.1) use **provisional anchors** until closed; they behave exactly the same at runtime.

### 7.2 Trajectory sub-score (0–100 per indicator)
1. Smooth the level sub-score series with a 3-month moving average (damps one-off dips).
2. `slope6` = OLS slope (points/month) of the smoothed series over the last 6 months (min 4 points, else unavailable).
3. `delta3` = smoothed(m) − smoothed(m−3).
4. `traj_raw = 0.7·slope6 + 0.3·(delta3/3)`.
5. Map: −5 pts/month → 0, 0 → **50 (flat)**, +5 → 100, clamped.
50 means stable; > 50 improving; < 50 deteriorating. This gives both directions symmetrically.

### 7.3 Category scores
Canonical categories: `LIQUIDITY, OPERATING_CASH_FLOW, ACTIVITY_GROWTH, DEBT_SERVICE, LEVERAGE, PAYMENT_BEHAVIOUR, DELINQUENCY, CONCENTRATION, TAX_REGULARITY, MOMENTUM`.
- `C_level(c)` = mean of available indicator level sub-scores in c.
- `C_traj(c)` = mean of available indicator trajectory sub-scores in c.
- `MOMENTUM` is special: `C(MOMENTUM) = TrajOverall` (weighted mean of all categories' `C_traj` using the active profile's weights) adjusted by `MOM_PERSISTENCE`: `+2 pts per month of persistence, capped ±10`, clamped [0,100].

### 7.4 Profile scores (the three weight tables)
For profile p with weights `w_c` (sum 100) and level/trajectory mix `λ_p`:
```
Level_p = Σ_{c≠MOM} w_c · C_level(c) / Σ_{c≠MOM, available} w_c
Traj_p  = Σ_{c≠MOM} w_c · C_traj(c)  / Σ_{c≠MOM, available} w_c
Final_p = Σ_{c≠MOM} w'_c · (λ_p·C_level(c) + (1−λ_p)·C_traj(c)) + w'_MOM · C(MOMENTUM)
```
`w'` = weights renormalized over **available** categories (missing categories redistribute their weight proportionally). All scores are 0–100, rounded to 1 decimal.

**Weight tables** (from research; mapping to canonical categories):

| Category | BANK (lender) | FUND (investor) | INSURER (trade credit) |
|---|---|---|---|
| DEBT_SERVICE (DSCR, line utilization) | 25 | 0 | 0 |
| LIQUIDITY | 20 | 10 | 15 |
| OPERATING_CASH_FLOW | 20 | 20 | 10 |
| PAYMENT_BEHAVIOUR (DSO/DPO/lateness) | 7.5 ¹ | 0 | 30 |
| DELINQUENCY (overdue, aging) | 7.5 ¹ | 0 | 20 |
| LEVERAGE | 10 | 5 | 5 |
| TAX_REGULARITY | 5 | 0 | 0 |
| CONCENTRATION | 5 | 10 | 20 |
| ACTIVITY_GROWTH | 0 | 30 | 0 |
| MOMENTUM | 0 | 25 | 0 |
| **Total** | **100** | **100** | **100** |
| λ (level share) | 0.70 | 0.50 | 0.70 |

¹ The research gives BANK "Working capital / morosidad = 15"; split evenly between the two canonical categories.

The active profile is a **global UI parameter** (`?profile=BANK|FUND|INSURER`). Switching it must re-rank the portfolio, recompute statuses, explanations and the product panel. Category-level scores are profile-independent and precomputed; profile scores are materialized for the three profiles at pipeline time (cheap: 250 groups × 24 months × 3).

### 7.5 Explanation (additive, exact)
Because `Final_p` is a weighted average of sub-scores, it decomposes exactly:
```
Final_p − 50 = Σ_i contrib_i,   contrib_i = eff_weight_i · (blended_subscore_i − 50)
eff_weight_i = w'_c / n_available_indicators_in_c
blended_subscore_i = λ·level_i + (1−λ)·traj_i   (MOMENTUM handled as one pseudo-indicator)
```
- **"Why this number"**: top 5 positive and top 5 negative `contrib_i` at month m.
- **"Why it changed"**: `Δcontrib_i = contrib_i(m) − contrib_i(m−1)` (and vs m−3), top movers, with raw value change.
- **Narrative**: template strings, no LLM needed. Example: `"DSO rose from 48 to 71 days (+23) → −4.2 pts"`, `"Runway fell from 5.1 to 2.3 months → −3.8 pts"`.
- Contributions must sum (within rounding) to `Final − 50`; add a unit test for this.

### 7.6 Confidence
`confidence ∈ {HIGH, MEDIUM, LOW}` per entity-month from: months of history (< 6 → LOW, < 12 → MEDIUM), share of indicators available (< 50% → LOW), fallback indicators used. Low-confidence entities are scored, never excluded, and shown with a badge.

### 7.7 Supervised calibration (activates only if Embat provides labels)
The dataset dictionary has **no target column**; the track mentions a scoring script and leaderboard from Friday. ⚠ UNKNOWN: label semantics and format.
- `POST /api/labels` uploads the labels file; a `LabelAdapter` maps it to `(entity_id, month?, target)`.
- If the target is **binary** (distress yes/no): fit a **WoE scorecard + logistic regression** on indicator sub-scores (5 quantile bins per indicator → WoE), 5-fold CV AUC reported. Library: Smile (`com.github.haifengl:smile-core`) or a hand-rolled logistic (gradient descent is enough for ~250×22).
- If the target is a **continuous 0–100 score**: fit a constrained linear regression of the target on category scores to learn weights; report MAE/Spearman.
- The calibrated model produces a 4th, internal `CALIBRATED` score used only for the leaderboard submission if it beats the BANK profile in CV. The three product profiles remain unchanged in the UI.
- Optional: gradient boosting + TreeSHAP (Smile) as analytical comparison, shown in the Methodology page. Verify the Smile API for the version used.
- Research rule: if CV AUC < 0.65, increase trajectory weight (lower λ) and re-check.
- **Threshold refinement:** with labels, derive monotonic cut points per indicator (WoE bins / isotonic) and propose them as replacement anchors (source 1 in §6.1), prioritizing the `⏳ PENDING` indicators. Same human-review rule applies.

---

## 8. Dynamics: regimes, statuses, lead time, alerts

### 8.1 Change detection (CUSUM)
Per entity, on the series `Final_p`, `NOCF` (standardized), `PAY_DSO` and `LIQ_RUNWAY`:
- Baseline mean/σ = rolling median and MAD×1.4826 of the previous 6 months (causal).
- Two-sided CUSUM with `k = 0.5σ`, `h = 4σ` (config). On alarm, record `changepoint_month` = last month the cumulative sum was 0 before the alarm, and direction (UP/DOWN).

### 8.2 Regime classification (bache vs caída)
Per entity-month (on `Final_p`):
- `STRUCTURAL_DECLINE`: CUSUM DOWN alarm active **and** `slope6 < −1.5 pts/month` **and** persistence ≤ −3 months (k=3 configurable; raise to 4–5 if false alarms from seasonality are high).
- `STRUCTURAL_IMPROVEMENT`: symmetric (UP alarm, slope6 > +1.5, persistence ≥ +3).
- `DIP`: robust z of the month vs baseline ≤ −2 for at most 2 consecutive months without structural conditions; resolved as `DIP_RECOVERED` if it returns within 1 MAD of baseline within 2 months. Seasonal check: if the same month last year showed a similar deviation, tag `seasonal=true`.
- `STABLE`: otherwise.

### 8.3 Health statuses (the six questions, for UI filters)
Evaluated in this precedence order:
1. `CRITICAL` — Final < 35
2. `STRUCTURAL_DECLINE` → shown as **"Deteriorating"**
3. `TURNING` ("empieza a torcerse") — Level ≥ 60 and (Traj ≤ 40 or CUSUM DOWN alarm)
4. `DIP` ("bache")
5. `IMPROVING` — regime STRUCTURAL_IMPROVEMENT or Traj ≥ 65
6. `EXCEPTIONAL` — Final ≥ 85 and Traj ≥ 45
7. `HEALTHY` — Final ≥ 65
8. `WATCH` — otherwise

Score bands (for pricing and colors): `A ≥ 80`, `B 65–79.9`, `C 50–64.9`, `D 35–49.9`, `E < 35`.

### 8.4 Lead time (measured anticipation — bonus)
Since there is no default label, define **proxy events** (config):
- Deterioration event at month e (first occurrence, with ≥ 6 months of prior history): `LIQ_RUNWAY < 1.5` for 2 consecutive months, or `DEBT_DSCR < 1.0` for 2 consecutive months, or `DEL_OVERDUE_RECEIVABLES` level score ≤ 20 and `PAY_OVERDUE_PAYABLES` level score ≤ 20 (both ⏳ PENDING → this event rule is provisional too), or `Final < 35`.
- Improvement event: Level crosses up through 65 after ≥ 3 months below 50.
- Signal at month s: first month in `[e−12, e]` with status `TURNING`/`STRUCTURAL_DECLINE` or `Traj ≤ 35` (mirror for improvement).
- `lead_months = e − s`. Report per profile: count of events, share detected, mean/median lead, histogram, and **false alarm rate** (signals not followed by an event within 6 months).
- If labels arrive (§7.7), recompute lead time against real labels as well.
- Research rule: if mean lead < 1 month, triggers are too late → tune thresholds.

Persist in `lead_time_events(entity, profile, event_type, event_month, signal_month, lead_months)`.

### 8.5 Alerts / Early-Warning Indicators (monitor — bonus)
Aligned with EBA/GL/2020/06 §8.5: each EWI has trigger levels, severity and escalation to a **watchlist**. Alerts fire **on state transition only** (no repeated alerts while the condition persists).

| Alert code | Trigger (WARN / CRITICAL) | Direction |
|---|---|---|
| `RUNWAY_LOW` | < 3 months / < 1.5 months | Negative |
| `DSCR_BREACH` | < 1.25 / < 1.0 | Negative |
| `LINE_UTIL_HIGH` | > 80% / > 95% | Negative |
| `DSO_DRIFT` | +15 days / +30 days vs 6m baseline | Negative |
| `SUPPLIER_LATENESS_UP` | +10 / +20 days vs 6m baseline | Negative |
| `OVERDUE_RECEIVABLES` | > 20% / > 35% | Negative |
| `TAX_GAP` | gap > usual cadence / > 2× cadence | Negative |
| `CONCENTRATION_HIGH` | customer HHI > 2,500 / > 5,000 | Negative |
| `FACTORING_SPIKE` | factoring inflows 3m > 1.5× prior 3m | Negative |
| `SCORE_DROP` | Final −8 / −15 pts in 3 months | Negative |
| `STRUCTURAL_DECLINE` | regime entered | Negative |
| `STRUCTURAL_IMPROVEMENT` | regime entered | **Positive** |
| `BAND_UPGRADE` / `BAND_DOWNGRADE` | band change | Both |
| `LIMIT_ACTION` | limit engine action INCREASE / REDUCE / FREEZE | Both |

**Watchlist** = entities with ≥ 1 CRITICAL or ≥ 2 WARN negative alerts active at month m.
**Monitor replay**: the UI can "play" months M06→M23; the backend streams, month by month, the new alerts computed causally (SSE). This is the demo of "the system raises its hand by itself".

---

## 9. Configuration (`scoring-config.yml`)

```yaml
scoring:
  unit: GROUP                 # GROUP | COMPANY — confirm with Embat
  months: { start: "2024-09", end: "2026-08" }
  cash_product_types: [checking, saving, tpv, expensesPlatform]
  semi_liquid_types: [investment]
  booked_status_values: [booked]          # confirm in profiling
  runway_cap_months: 24
  trajectory: { smoothing_window: 3, slope_window: 6, min_points: 4, slope_to_score_span: 5.0, slope_weight: 0.7, delta_weight: 0.3 }

flow_classes:                  # ⚠ category names are GUESSES — replace after profiling §4.1
  collection: OPERATING_IN
  supplier: OPERATING_OUT
  payroll: OPERATING_OUT
  utility: OPERATING_OUT
  rent: OPERATING_OUT
  tax: TAX
  loan: DEBT_SERVICE
  interest: DEBT_SERVICE
  leasing: DEBT_SERVICE
  transfer: INTERNAL
  financing: FINANCING_IN
  factoring: FINANCING_IN
  _default: OTHER
  other_sign_fallback: true

indicators:
  LIQ_RUNWAY:       { category: LIQUIDITY, method: anchors, anchors: [[0,0],[1,20],[3,50],[6,75],[12,100]] }
  DEBT_DSCR:        { category: DEBT_SERVICE, method: anchors, anchors: [[0.8,0],[1.0,30],[1.25,60],[2.0,85],[3.0,100]] }
  PAY_DPO:          { category: PAYMENT_BEHAVIOUR, method: anchors, status: pending,   # ⏳ penalty curve above 60 days
                      anchors: [[60,100],[90,60],[120,30],[180,0]], source: "legal 60d + quantiles (provisional)" }
  CF_NOCF_MARGIN:   { category: OPERATING_CASH_FLOW, method: anchors, status: pending,  # ⏳ positive side
                      anchors: [[-0.2,0],[-0.0001,35],[0,45],[0.1,75],[0.2,100]], source: "natural zero + quantiles (provisional)" }
  CF_VOLATILITY:    { category: OPERATING_CASH_FLOW, method: anchors, status: pending,  # ⏳ all anchors from quantiles
                      anchors: [], source: "quantiles (to compute in M2)" }
  # ... one entry per indicator of §6; every entry has `status: closed | pending` and `source`

profiles:
  BANK:    { lambda: 0.70, weights: { DEBT_SERVICE: 25, LIQUIDITY: 20, OPERATING_CASH_FLOW: 20, PAYMENT_BEHAVIOUR: 7.5, DELINQUENCY: 7.5, LEVERAGE: 10, TAX_REGULARITY: 5, CONCENTRATION: 5 } }
  FUND:    { lambda: 0.50, weights: { ACTIVITY_GROWTH: 30, MOMENTUM: 25, OPERATING_CASH_FLOW: 20, LIQUIDITY: 10, CONCENTRATION: 10, LEVERAGE: 5 } }
  INSURER: { lambda: 0.70, weights: { PAYMENT_BEHAVIOUR: 30, DELINQUENCY: 20, CONCENTRATION: 20, LIQUIDITY: 15, OPERATING_CASH_FLOW: 10, LEVERAGE: 5 } }

regimes:  { cusum_k: 0.5, cusum_h: 4.0, persistence_months: 3, slope_threshold: 1.5, dip_z: -2.0, dip_max_months: 2 }
bands:    { A: 80, B: 65, C: 50, D: 35 }
limit_engine:
  base: median_operating_in_3m
  score_floor: 35
  factor_at_floor: 0.25
  factor_at_100: 1.5
  trend_modifier_span: 0.2
  runway_guard: { below_months: 1.5, multiplier: 0.5 }
  dscr_min: 1.25
  default_term_months: 36
  reference_rate: 0.035            # ⏳ PENDING — placeholder, verify current market rate; also used by LEV_FUNDING_COST
  spread_bps_by_band: { A: 150, B: 250, C: 400, D: 650, E: null }
  action_threshold: 0.10
insurer:
  base_premium_rate: 0.0025
  multiplier_by_band: { A: 0.7, B: 1.0, C: 1.5, D: 2.5, E: null }
```

---

## 10. Product layer (what we sell, to whom)

> **Superseded on 2026-09-19:** the primary buyer is the SME that uses Embat; lenders and insurers pay second, with the SME's consent. Reasons and price structure: `PRODUCT.md`, section "Buyer". The text below stays for history.

**Primary buyer: banks / lenders.** Pitch line: incumbents (Informa D&B, Axesor) score on annual filed accounts; we score monthly real cash flow, with trajectory, measured anticipation and per-entity explanation, re-weightable per buyer. Secondary distribution: Embat itself (it owns the data and the customer relationship; the scored company can also buy its own report/"health seal" to negotiate better terms).

### 10.1 BANK — Self-recalculating working-capital limit engine (core product)
Per entity-month (causal):
```
base        = median(OPERATING_IN monthly, 3m)                       # EUR
factor      = 0                                  if Final < 35
            = 0.25 + (Final − 35)/65 · (1.5 − 0.25)  otherwise       # 0.25 .. 1.5
trend       = clamp(1 + 0.2 · (Traj − 50)/50, 0.8, 1.2)
raw_limit   = base · factor · trend
if LIQ_RUNWAY < 1.5: raw_limit *= 0.5
annual_cost_factor = 12/term_months + (reference_rate + spread)
dscr_cap    = max(0, NOCF_12m/1.25 − DEBT_SERVICE_12m) / annual_cost_factor
limit       = min(raw_limit, dscr_cap), rounded to 1,000 EUR
spread_bps  = by band; band E → DECLINE
action      = INCREASE if limit ≥ prev·1.10; REDUCE if ≤ prev·0.90; FREEZE if limit = 0 and prev > 0; else MAINTAIN
```
Outputs: `limit_eur, spread_bps, all_in_rate, action, binding_constraint (SCORE|DSCR|RUNWAY), projected_dscr`.
**Limit history chart**: the killer demo moment — show the limit being reduced N months **before** the deterioration event.
**Simulator** (`POST .../limit/simulate {requested_amount, term_months}`): returns APPROVE / PARTIAL (with approved amount) / DECLINE, rate, projected DSCR after the new facility, and which constraint binds.

### 10.2 INSURER — Dynamic trade-credit premium
Entity viewed as a **buyer** someone insures receivables against:
- `premium_rate = base_premium_rate · multiplier(band_INSURER)`; band E → not insurable.
- `recommended_buyer_limit = avg monthly operating outflows 3m · (PAY_DPO/30) · factor(Final_INSURER)` (exposure proxy; label it as proxy in the UI).
- Premium history per month (moves with the score instead of an annual review) + alert when the premium tier changes ("the policy learns before the claim").

### 10.3 FUND — Momentum screen
- Ranking by `Final_FUND`, with "Rising stars" filter: `Level < 60 and Traj ≥ 70` (e.g. the 45→65 company).
- Peer percentile of `Traj` and `ACT_COLLECTIONS_GROWTH` (display-only ranking context for the investor; never feeds the score).
- No sector field exists in the data ⚠ → no sector aggregation; say so if asked.

### 10.4 Showcase pairs (pitch opener)
`GET /api/analytics/showcase-pairs?profile=BANK` finds pairs of entities with |Final(M23) difference| ≤ 3 and opposite trajectories (one Traj ≥ 65, other ≤ 35), ranked by trajectory gap. Mirrors the Northbrook (45→65) vs Velasco (82→68) example from the track.

---

## 11. Leaderboard submission

`GET /api/export/submission?profile=BANK|FUND|INSURER|CALIBRATED&format=csv`
⚠ UNKNOWN: exact format from Embat's scoring script (per entity? per entity-month? id column name?). Implement a `SubmissionExporter` interface with one implementation per format; default: `entity_id, score` at M23 plus an optional long format `entity_id, month, score`. Adapt on Friday as soon as the script is available and **submit early** (Friday night) to validate the pipeline end to end.

---

## 12. Architecture

### 12.1 Repo layout
```
/backend            Spring Boot app
/frontend           React app
/data/raw           CSVs (gitignored)
/data/xray.duckdb   pipeline output (gitignored, but keep a frozen copy for the demo)
/docs               SPEC.md (this file), DATA_FINDINGS.md, THRESHOLDS.md, PITCH.md
docker-compose.yml
CLAUDE.md           short pointer: "Read docs/SPEC.md first"
```

### 12.2 Backend stack
- Java 21, Spring Boot 3.x, Maven.
- **DuckDB embedded via JDBC** (`org.duckdb:duckdb_jdbc`) as analytical engine and results store: reads CSVs directly, aggregates 2.5M transactions in seconds. **No MySQL/JPA** for this workload; use `JdbcTemplate` + SQL files in `resources/sql/`.
- Heavy set-based work (monthly aggregates, balance reconstruction, HHI) in **SQL**; time-series logic (normalization, slopes, CUSUM, regimes, limits, explanations) in **Java** over the small monthly tables loaded in memory.
- `springdoc-openapi` for Swagger UI. Java `record`s for DTOs. JUnit 5 for the few critical tests.
- Optional: Smile for supervised calibration.

### 12.3 Package structure (hexagonal-lite: pragmatic, not dogmatic)
```
com.xray
├── domain
│   ├── model        Indicator, Category, Profile, SubScore, CategoryScore, ScoreSnapshot,
│   │                Regime, HealthStatus, Band, Alert, LimitDecision, PremiumQuote, LeadTimeEvent
│   └── service      NormalizationService, TrajectoryCalculator, ScoringEngine, ExplanationService,
│                    CusumDetector, RegimeClassifier, StatusResolver, AlertEngine,
│                    LimitEngine, PremiumEngine, MomentumScreen, LeadTimeAnalyzer, ShowcaseFinder
├── application      RunPipelineUseCase, PortfolioQuery, EntityDetailQuery, TimelineQuery,
│                    SimulateLimitUseCase, MonitorReplayUseCase, ExportSubmissionUseCase, CalibrateUseCase
└── infrastructure
    ├── duckdb       SqlRunner, repositories, sql/*.sql (ingest, staging, aggregates, indicators)
    ├── web          REST controllers, DTOs, SSE controller, CORS config
    └── config       ScoringConfig (@ConfigurationProperties from scoring-config.yml)
```

### 12.4 Results tables (DuckDB)
`indicator_values(entity_type, entity_id, month, indicator_id, value, level_score, traj_score, available, static, fallback)`
`category_scores(entity_type, entity_id, month, category, level, traj)`
`profile_scores(entity_type, entity_id, month, profile, final, level, traj, band, status, regime, confidence)`
`contributions(entity_type, entity_id, month, profile, indicator_id, contrib)`
`changepoints(entity, series, profile, month, direction)`
`alerts(entity, profile, month, code, severity, direction, message, value)`
`limit_decisions(entity, month, limit_eur, spread_bps, action, binding_constraint, projected_dscr)`
`premium_quotes(entity, month, premium_rate, buyer_limit)`
`lead_time_events(...)`, `threshold_quantiles(indicator_id, quantiles_json)` (reference only for §6.1, never read by scoring), `pipeline_runs(...)`

### 12.5 REST API
| Method | Path | Returns |
|---|---|---|
| POST | `/api/pipeline/run` · GET `/api/pipeline/status` | run / progress |
| GET | `/api/meta` | months, profiles, unit, entity counts, data caveats |
| GET | `/api/profiles` | the three weight tables + λ |
| GET | `/api/portfolio?profile&month&status&band&q&sort` | rows: id, final, level, traj, band, status, regime, delta3m, sparkline(12m), active alerts, confidence |
| GET | `/api/entities/{id}?profile&month` | scores, category bars, top drivers, change drivers, indicator table, companies (if group) |
| GET | `/api/entities/{id}/timeline?profile` | per month: final/level/traj, regime, status, changepoints, events, alerts, limit/premium |
| GET | `/api/entities/{id}/limit?month` | limit decision |
| POST | `/api/entities/{id}/limit/simulate` | simulation result |
| GET | `/api/entities/{id}/premium?month` | insurer quote |
| GET | `/api/monitor/alerts?profile&month&severity` · `/api/monitor/watchlist?profile&month` | alerts, watchlist |
| GET (SSE) | `/api/monitor/replay?profile&from&to&stepMs` | stream of `{month, newAlerts[], watchlistSize}` |
| GET | `/api/analytics/lead-time?profile` | stats + histogram + false alarm rate |
| GET | `/api/analytics/showcase-pairs?profile` | pairs |
| GET | `/api/analytics/distribution?profile&month` | score histogram, status counts |
| GET | `/api/export/submission?profile&format` | CSV |
| POST | `/api/labels` · POST `/api/model/calibrate` · GET `/api/model/report` | supervised mode (§7.7) |

### 12.6 Frontend stack
React 18 + TypeScript + Vite, React Router, TanStack Query, Recharts, Tailwind CSS. Profile and month are **URL search params** (`?profile=BANK&month=2026-08`) so every view is linkable and the profile switch is global.

### 12.7 Frontend pages
1. **Portfolio** (`/`): global profile switch (segmented control BANK / FUND / INSURER) and month selector in the top bar; KPI cards per status; filter chips answering the six questions (Healthy/Exceptional, Improving, Turning, Dip, Deteriorating, Critical); sortable table with sparkline, band color, Δ3m arrow, alert count, confidence badge. Switching profile visibly re-ranks.
2. **Entity** (`/entity/:id`): score gauge (Final) + two dials (Level, Traj); status + regime + confidence badges; **timeline chart** (Final/Level/Traj lines, shaded regimes, vertical changepoint marker, event markers, annotation "detected N months before"); **Why this score** (top ± drivers bar chart); **What changed** (Δ vs last month / 3 months, narratives); category bars; indicator table (raw value, level, trend arrow, available/static flags); group → company drilldown. **Product panel by profile**: BANK → limit card + limit history chart + simulator form; INSURER → premium quote + premium history; FUND → momentum rank + peer percentiles.
3. **Monitor** (`/monitor`): watchlist, alert feed with severity/direction filters, **Replay** control (play/pause, month scrubber) consuming SSE; new alerts animate into the feed; positive alerts in green.
4. **Compare** (`/compare?a=&b=`): two entities side by side, overlaid timelines; preloaded with the top showcase pair.
5. **Methodology** (`/methodology`): the three weight tables with the active one highlighted; indicator catalogue; lead-time histogram, detection rate, false alarm rate; data caveats; submission export button; supervised model report if available.

UI principles: one accent color per band (A→E), green/red only for direction, every number has a tooltip with its definition, no page takes > 1 s after the pipeline has run.

---

## 13. Build order (milestones with acceptance criteria)

All features are in scope. Order ensures a working demo exists as early as possible.

| # | Milestone | Done when |
|---|---|---|
| M0 | Scaffolding + profiling | Both apps boot via docker-compose; `DATA_FINDINGS.md` answers §4 1–9; config flow map filled |
| M1 | Ingestion, currency, flow classes, intragroup, balance reconstruction, monthly tables | Reconstructed balance at T matches `balances.csv` exactly per product; spot-check 3 entities |
| M2 | 22 indicators + threshold calibration | `indicator_values` populated; availability % per indicator logged; no look-ahead (unit test with truncated data gives identical past values); quantiles for the 10 `⏳ PENDING` indicators in `docs/THRESHOLDS.md` with proposed anchors awaiting human review |
| M3 | Normalization, trajectory, categories, 3 profiles, final score, **submission export** | Scores 0–100 for all entities/months/profiles; first leaderboard submission sent |
| M4 | Explanations, CUSUM, regimes, statuses, confidence | Contributions sum to Final−50 (test); every entity has status per month |
| M5 | Frontend Portfolio + Entity (scores, timeline, drivers) | Profile switch re-ranks; entity page loads < 1 s |
| M6 | Alerts, watchlist, SSE replay, Monitor page | Replay M06→M23 streams alerts; positive alerts visible |
| M7 | Limit engine + simulator, insurer premium, fund momentum, product panels | Limit history shows reductions before events for showcase entities |
| M8 | Lead-time analytics, showcase pairs, Compare + Methodology pages | Mean lead time and false alarm rate displayed per profile |
| M9 | Supervised calibration (if labels) + optional SHAP | CV metric reported; CALIBRATED submission exported |
| M10 | Hardening & deploy | Public URL works from another device; frozen `xray.duckdb`; demo script rehearsed |

---

## 14. Deployment & demo robustness
- `docker-compose up` runs backend (port 8080) and frontend (nginx, port 80, proxy `/api` → backend).
- The demo must be **navigable by the jury** (track: "a notebook that only runs on your laptop doesn't count"): deploy to a public host (Railway / Render / Fly.io / a VPS) with the **precomputed** `xray.duckdb`; the pipeline endpoint is disabled in demo mode (`xray.demo-mode=true`).
- Frontend has a static JSON fallback for Portfolio and the showcase entities in case the backend is down.
- No runtime dependency on external APIs.

## 15. Caveats to surface in the UI and pitch (honesty = credibility)
- No balance sheet or P&L: EBITDA, Debt/EBITDA and DSCR are **cash-flow proxies**.
- Debt outstanding/granted is a **2026-09-01 snapshot** → static indicators flagged.
- Synthetic data, **no real default label**: anticipation measured against documented proxy events (§8.4).
- Short histories and missing ERP data lower confidence; entities are scored, not dropped.
- EBA/GL/2020/06 is cited as a framework of best practices (EWIs with trigger levels + watchlist), not as a mandatory metric list.

## 16. Open questions to resolve with Embat on Friday (block list)
1. Scoring unit of the hidden test: `group_id` or `company_id`?
2. Label/target definition for training entities and submission format of the scoring script.
3. How to distinguish issued vs received invoices.
4. Full list of transaction `category` values and meaning (esp. financing, factoring, internal transfers).
5. `exchange_rate` convention.
6. How to identify intragroup counterparties.
7. Whether debt products have transactions (monthly utilization/debt service).
8. (Internal, not Embat) Close the 10 `⏳ PENDING` thresholds of §6.1 after M2 quantiles.
