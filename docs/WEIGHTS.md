# WEIGHTS — AHP category weights, intra-category weights and λ (phase 7, R1)

**Closed on 2026-09-19** (Embat CTO: no more time on weights). The values of this file are in the
config. The reason to keep them, and the sensitivity test, are in `WEIGHTS_JUSTIFICATION.md`.

Status: **proposal** (decision H17). José Javier decides. Embat experts can override any value later
through config only. Every number carries a status: `sourced` (a source that we read supports it) or
`placeholder` (our judgment, no source for the magnitude). Decision H18 applies: no figure is
attributed to a source that we did not read.

Generator: `scripts/weights_calc/ahp_w_cat_ind.py`. Run it from `scripts/weights_calc` (needs numpy).
It prints the two YAML fragments of §7 and the CR table of §6.

## 1. Summary

Category weights in points (sum = 100 per profile). "Now" is `scoring-config.yml` on `main`
(2026-09-19). "Proposed" is the generator output with the ratings of §2.

| Category | BANK now | BANK proposed | FUND now | FUND proposed | INSURER now | INSURER proposed |
|---|---:|---:|---:|---:|---:|---:|
| LIQUIDITY | 20 | 16.03 | 10 | 13.03 | 15 | 13.70 |
| OPERATING_CASH_FLOW | 20 | 17.15 | 20 | 13.27 | 10 | 11.88 |
| ACTIVITY_GROWTH | 0 | 6.01 | 30 | 22.25 | 0 | 4.10 |
| DEBT_SERVICE | 25 | 17.13 | 0 | 4.25 | 0 | 7.45 |
| LEVERAGE | 10 | 11.97 | 5 | 7.46 | 5 | 8.97 |
| PAYMENT_BEHAVIOUR | 7.5 | 6.84 | 0 | 4.25 | 30 | 21.50 |
| DELINQUENCY | 7.5 | 6.84 | 0 | 4.25 | 20 | 11.88 |
| CONCENTRATION | 5 | 6.01 | 10 | 13.03 | 20 | 8.97 |
| TAX_REGULARITY | 5 | 6.01 | 0 | 2.32 | 0 | 7.45 |
| MOMENTUM | 0 | 6.01 | 25 | 15.89 | 0 | 4.10 |
| λ (level share) | 0.70 | 0.70 | 0.50 | 0.50 | 0.70 | 0.70 |

What changes:

1. No category has weight 0 in any profile (decision H4). Today 10 of 30 cells are 0.
2. MOMENTUM has a positive weight in all three profiles (decision H5).
3. Each profile has its own magnitudes. The old rank-distance rule gave one fixed decay vector
   `(27.97, 20.80, 15.43, …)` for all profiles, only permuted (see §2.1).
4. λ does not change (§5).

## 2. Method

### 2.1 The caveat of the old method, and the fix

The branch derived every category judgment from the rank distance:
`CATEGORY_RANK_TO_SAATY = {1: 2, 2: 3, 3: 4}.get(d, 5)`. The result is the same weight vector in
every profile, only in a different order. The AHP then gives an order, not magnitudes.

The generator now uses **importance ratings**. Each profile rates each category on 1..9. The judgment
for the pair (i, j) is `rating_i / rating_j`, snapped to the nearest Saaty value on a log scale
(1/9 … 1/2, 1, 2 … 9). Consequences:

- Each profile has its own magnitudes. A category rated 9 against one rated 3 gives a judgment of 3.
  Two categories with equal ratings give 1.
- The matrix stays close to consistent by construction. The snap to the Saaty scale adds a small
  inconsistency. All category CRs are below 0.01 (§6).
- `CATEGORY_JUDGMENTS[<P>][(i, j)] = v` overrides one pair. The Embat experts can use it to state a
  real pairwise judgment where they disagree with the ratio. The generator checks CR < 0.10 after
  every override and fails if the matrix becomes inconsistent.

This is option (b) of the plan in a reduced form: 10 ratings per profile, not 45 elicited
judgments. We state this plainly. Genuine pairwise elicitation needs the experts. The override
dictionary is the place for it.

### 2.2 Hard constraints (all checked by the generator)

- Saaty 1–9 with reciprocals, diagonal 1.
- CR < 0.10 for every matrix.
- No weight ≤ 0 (H4). MOMENTUM rated in all profiles, intra weight 1 (H5).
- Intra-category judgments identical across profiles (H6).
- Each profile sums to 100 ± 0.01 after rounding. The residual goes to the largest category.

## 3. Category ratings per profile

### 3.1 BANK — a lender deciding a working-capital limit

Ratings: DEBT_SERVICE 9, OPERATING_CASH_FLOW 9, LIQUIDITY 8, LEVERAGE 6, DELINQUENCY 4,
PAYMENT_BEHAVIOUR 4, TAX_REGULARITY 3, MOMENTUM 3, CONCENTRATION 3, ACTIVITY_GROWTH 3.

| Rank | Category | Rating | Status | Justification and source |
|---:|---|---:|---|---|
| 1 | OPERATING_CASH_FLOW | 9 | sourced (order) | EBA/GL/2020/06 ¶119 (micro and small) and ¶142 (medium and large): cash flow from the ordinary business is "the primary sources of repayment". ¶120 and ¶143: emphasis on "future income and future cash flow, and not on available collateral". Beaver (1966) finds cash flow / total debt the best single predictor of failure. |
| 1 | DEBT_SERVICE | 9 | sourced (order) | EBA/GL/2020/06 ¶128a: assess the "source of repayment capacity to meet contractual obligations". Annex 3, B, item 14: "Total debt service coverage ratio". ¶274b: "significant increases in debt service ratios" is a deterioration signal. The 1.25× covenant already in the config is bank practice. |
| 3 | LIQUIDITY | 8 | sourced (order) | EBA/GL/2020/06 Annex 3, B, item 16: "Coverage ratio (total current assets divided by total short-term debt)". Altman Z'' uses working capital / total assets as its first variable. Ohlson (1980) uses WC/TA and CL/CA. |
| 4 | LEVERAGE | 6 | sourced (order) | EBA/GL/2020/06 Annex 3, B, items 7 and 10 ("debt-to-equity", "Interest bearing debt/EBITDA"). ¶128b: "the borrower's leverage level". Beaver (1966) reports the debt ratio among the best predictors. Rated below the three repayment categories because EBA ¶120 puts repayment capacity first. |
| 5 | DELINQUENCY | 4 | sourced (order) | CRR Art. 178: default = "more than 90 days past due on any material credit obligation". Overdue receivables of the entity are a leading cause of its own cash stress. Magnitude 4: placeholder. |
| 5 | PAYMENT_BEHAVIOUR | 4 | sourced (order) | EBA/GL/2020/06 ¶274l: "significant changes in the expected payment behaviour of the borrower". ¶274s: "one or more borrower-related facilities 30 days past due". Magnitude 4: placeholder. |
| 7 | TAX_REGULARITY | 3 | placeholder | No source that we read ranks tax regularity. We keep it low and positive (H4). Tax arrears are a public-creditor signal, but the data shows only cadence, not arrears. |
| 7 | MOMENTUM | 3 | placeholder | EBA/GL/2020/06 ¶274 lists trend signals (drop in turnover, narrowing margins). The λ blend already gives the trajectory 30 % (§5). MOMENTUM adds persistence on top, so it stays low for a lender. |
| 7 | CONCENTRATION | 3 | sourced (order) | EBA/GL/2020/06 ¶135: assess "reliance on key contracts, customers or suppliers … including any concentrations". ¶274c: "loss of a major contract/client/tenant". Raised from 2 in the draft. |
| 7 | ACTIVITY_GROWTH | 3 | sourced (order) | EBA/GL/2020/06 Annex 3, B, item 25: "Turnover evolution". ¶274c: "a significant drop in turnover". Raised from 2 in the draft. Low for a lender: growth does not repay debt by itself. |

### 3.2 FUND — a growth investor screening for momentum

Ratings: ACTIVITY_GROWTH 9, MOMENTUM 7, OPERATING_CASH_FLOW 6, LIQUIDITY 5, CONCENTRATION 5,
LEVERAGE 3, DEBT_SERVICE 2, PAYMENT_BEHAVIOUR 2, DELINQUENCY 2, TAX_REGULARITY 1.

| Rank | Category | Rating | Status | Justification and source |
|---:|---|---:|---|---|
| 1 | ACTIVITY_GROWTH | 9 | sourced (order) | The Rule of 40 (Brad Feld, 2015): revenue growth rate + profit margin ≥ 40 %. Growth is the first term. Growth investors pay for growth. |
| 2 | MOMENTUM | 7 | placeholder | A growth investor buys the direction of travel. MOMENTUM is the sustained trajectory (SPEC §7.3). No source gives its magnitude. |
| 3 | OPERATING_CASH_FLOW | 6 | sourced (order) | The Rule of 40 second term is the margin. The burn multiple (David Sacks, 2020) = net burn / net new ARR: cash efficiency of growth. Our CF_NOCF_MARGIN and CF_IN_OUT_RATIO measure cash generation. |
| 4 | LIQUIDITY | 5 | sourced (order) | Burn multiple practice: runway decides how long growth can be financed. LIQ_RUNWAY measures it. Magnitude: placeholder. |
| 4 | CONCENTRATION | 5 | sourced (order), secondary | Customer concentration is a standard due-diligence item. Wall Street Prep: "the risk attributable to a company's revenue being too reliant on a small subset of customers". Secondary source (practitioner), not a regulator. |
| 6 | LEVERAGE | 3 | placeholder | An equity investor is junior to debt. Leverage matters, but less than for a lender. |
| 7 | DEBT_SERVICE | 2 | placeholder | Repayment capacity is the lender's question. Kept positive (H4). |
| 7 | PAYMENT_BEHAVIOUR | 2 | placeholder | Weak link to growth quality. Kept positive (H4). |
| 7 | DELINQUENCY | 2 | placeholder | Weak link to growth quality. Kept positive (H4). |
| 10 | TAX_REGULARITY | 1 | placeholder | Lowest relevance for a growth investor. Kept positive (H4). |

### 3.3 INSURER — a trade-credit insurer pricing cover on this entity as a buyer

Ratings: PAYMENT_BEHAVIOUR 9, LIQUIDITY 6, DELINQUENCY 5, OPERATING_CASH_FLOW 5, CONCENTRATION 4,
LEVERAGE 4, DEBT_SERVICE 3, TAX_REGULARITY 3, MOMENTUM 2, ACTIVITY_GROWTH 2.

Source for the whole profile: Atradius, "What is underwriting in credit insurance?". It lists what an
underwriter evaluates about a buyer: "Payment history: Past behaviour in settling invoices, including
any defaults or delays"; "Balance sheet strength: Liquidity ratios, debt levels, and working capital";
"Cash flow: Ability to generate cash from operations"; "Order patterns: Sudden increases in order
volume may signal distress". The page gives no weights: every magnitude below is a placeholder.

| Rank | Category | Rating | Status | Justification and source |
|---:|---|---:|---|---|
| 1 | PAYMENT_BEHAVIOUR | 9 | sourced (order) | The insured risk is that this buyer does not pay its suppliers. Atradius: payment history, and "payment experience" pooled across suppliers. Ley 3/2004 (as amended by Ley 15/2010) sets the legal payment term at 60 days maximum, the anchor of PAY_DPO. |
| 2 | LIQUIDITY | 6 | sourced (order) | Atradius: "Liquidity ratios … and working capital". A buyer pays its invoices from cash. |
| 3 | DELINQUENCY | 5 | placeholder | When the buyer's own customers pay late, the buyer's cash to pay its suppliers falls. No source ranks it. |
| 3 | OPERATING_CASH_FLOW | 5 | sourced (order) | Atradius: "Cash flow: Ability to generate cash from operations". |
| 5 | CONCENTRATION | 4 | placeholder | Loss of one large customer can stop payments to suppliers. Not in the Atradius list that we read. |
| 5 | LEVERAGE | 4 | sourced (order) | Atradius: "debt levels". |
| 7 | DEBT_SERVICE | 3 | placeholder | Bank debt competes with trade creditors for the same cash. |
| 7 | TAX_REGULARITY | 3 | placeholder | Tax debt competes with trade creditors. No source for the magnitude. |
| 9 | MOMENTUM | 2 | placeholder | The insurer reviews cover monthly. Direction matters less than the current state. |
| 9 | ACTIVITY_GROWTH | 2 | sourced (order) | Atradius: sudden order growth "may signal distress". Growth is not a plus for this user. |

## 4. Intra-category judgments (profile-independent, decision H6)

| Category | Pair (i, j) | Saaty | Resulting weights | Status | Justification |
|---|---|---:|---|---|---|
| LIQUIDITY | LIQ_RUNWAY, LIQ_BUFFER | 1 | RUNWAY 0.4286, BUFFER 0.4286, MIN_BALANCE 0.1429 | placeholder | Runway and buffer measure the same coverage in two ways. EBA Annex 3 item 16 (coverage ratio) is closest to LIQ_BUFFER. |
| | LIQ_RUNWAY, LIQ_MIN_BALANCE | 3 | | placeholder | A single low day is noisier than a monthly coverage measure. |
| | LIQ_BUFFER, LIQ_MIN_BALANCE | 3 | | placeholder | Same reason. |
| OPERATING_CASH_FLOW | CF_IN_OUT_RATIO, CF_NOCF_MARGIN | 1 | IN_OUT 0.4286, NOCF 0.4286, VOLATILITY 0.1429 | placeholder | Both measure cash generation. EBA Annex 3 item 15 (cash debt coverage) is the nearest metric. |
| | CF_IN_OUT_RATIO, CF_VOLATILITY | 3 | | placeholder | Volatility is second-order: it qualifies the level. |
| | CF_NOCF_MARGIN, CF_VOLATILITY | 3 | | placeholder | Same reason. |
| DEBT_SERVICE | DEBT_DSCR, DEBT_LINE_UTIL | **3** (was 5) | DSCR 0.75, LINE_UTIL 0.25 | sourced (order) | DSCR is EBA Annex 3 item 14. Line utilisation is a monitoring signal (EBA ¶274h "worsening in financing conditions"), not a repayment measure. The old 5 left LINE_UTIL at 0.17. We lower it to 3 because the SPEC uses line utilisation as an early-warning alert (`line-util-high`). Magnitude: placeholder. |
| LEVERAGE | LEV_DEBT_TO_CF, LEV_FACTORING_RELIANCE | 3 | DEBT_TO_CF 0.6333, FACTORING 0.2605, FUNDING_COST 0.1062 | sourced (order) | Debt / EBITDA is EBA Annex 3 items 10 and 37. The other two have no regulatory metric. |
| | LEV_DEBT_TO_CF, LEV_FUNDING_COST | 5 | | placeholder | Funding cost depends on the reference rate, which is an example value (CLAUDE.md). |
| | LEV_FACTORING_RELIANCE, LEV_FUNDING_COST | 3 | | placeholder | |
| PAYMENT_BEHAVIOUR | PAY_SUPPLIER_LATENESS, PAY_OVERDUE_PAYABLES | 1 | LATENESS 0.375, OVERDUE 0.375, DSO 0.125, DPO 0.125 | placeholder | Both measure payment against the due date. |
| | PAY_SUPPLIER_LATENESS, PAY_DPO | 3 | | sourced (order) | Lateness is behaviour against the agreed term. DPO is a level that the legal 60-day limit (Ley 3/2004) bounds. |
| | PAY_SUPPLIER_LATENESS, PAY_DSO | 3 | | placeholder | DSO is the receivables side. |
| | PAY_OVERDUE_PAYABLES, PAY_DPO | 3 | | placeholder | |
| | PAY_OVERDUE_PAYABLES, PAY_DSO | 3 | | placeholder | |
| | PAY_DPO, PAY_DSO | 1 | | placeholder | |
| DELINQUENCY | DEL_AGING_90, DEL_OVERDUE_RECEIVABLES | 3 | AGING_90 0.75, OVERDUE 0.25 | sourced (order) | 90 days past due is the default threshold of CRR Art. 178. Magnitude: placeholder. |
| CONCENTRATION | CON_HHI_CUSTOMERS, CON_HHI_SUPPLIERS | 3 | CUSTOMERS 0.6, SUPPLIERS 0.2, CHURN 0.2 | sourced (order) | EBA ¶274c names the "loss of a major contract/client". Magnitude: placeholder. |
| | CON_HHI_CUSTOMERS, CON_CUSTOMER_CHURN | 3 | | placeholder | |
| | CON_HHI_SUPPLIERS, CON_CUSTOMER_CHURN | 1 | | placeholder | |

ACTIVITY_GROWTH, TAX_REGULARITY: one indicator, weight 1. MOMENTUM: no indicators, intra weight 1 (H5).

### 4.1 Where H6 may be wrong (post-demo item)

Payment behaviour is the core risk for the INSURER, but the same four intra weights apply to BANK.
For an insurer, PAY_SUPPLIER_LATENESS and PAY_OVERDUE_PAYABLES could reasonably weigh more against
PAY_DSO (the receivables side) than for a bank. `main` cannot express per-profile intra weights today
(`IndicatorConfig`, `CategoryAggregator`, `S60_Score`, `ExplanationService`, `ExplanationSumTest`).
We respect H6 tonight and flag it as a post-demo item.

## 5. λ per profile

λ = the share of the level in `final = λ · level + (1 − λ) · traj`.

| Profile | Now | Proposed | Status | Reasoning |
|---|---:|---:|---|---|
| BANK | 0.70 | 0.70 | placeholder | EBA/GL/2020/06 ¶120 and ¶143 ask for "realistic and sustainable future income and future cash flow". This supports a real weight on the trajectory. It gives no number. A lender decides on the capacity to repay now, so the level dominates. |
| FUND | 0.50 | 0.50 | placeholder | A growth investor buys direction as much as state. Equal shares. MOMENTUM (15.89 %) adds more trajectory inside the level term. |
| INSURER | 0.70 | 0.70 | placeholder | Cover is reviewed monthly and priced on the current risk. The level dominates. |

No source that we read gives λ. We recommend **no change**. A change of λ moves every score and
every band. It needs the same before/after measurement as the weights.

## 6. Consistency ratios (generator output, 2026-09-19)

| Matrix | CR |
|---|---:|
| indicators/LIQUIDITY | 0.0000 |
| indicators/OPERATING_CASH_FLOW | 0.0000 |
| indicators/DEBT_SERVICE | 0.0000 |
| indicators/LEVERAGE | 0.0334 |
| indicators/PAYMENT_BEHAVIOUR | 0.0000 |
| indicators/DELINQUENCY | 0.0000 |
| indicators/CONCENTRATION | 0.0000 |
| categories/BANK | 0.0061 |
| categories/FUND | 0.0038 |
| categories/INSURER | 0.0083 |

All below 0.10. A 2×2 matrix is always consistent (CR 0).

## 7. Paste-ready output

### 7.1 Python block (as in the generator)

```python
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

CATEGORY_JUDGMENTS = {"BANK": {}, "FUND": {}, "INSURER": {}}   # expert overrides of single pairs

INDICATOR_JUDGMENTS_DEFAULT = {
    "LIQUIDITY": {("LIQ_RUNWAY", "LIQ_BUFFER"): 1, ("LIQ_RUNWAY", "LIQ_MIN_BALANCE"): 3,
                  ("LIQ_BUFFER", "LIQ_MIN_BALANCE"): 3},
    "OPERATING_CASH_FLOW": {("CF_IN_OUT_RATIO", "CF_NOCF_MARGIN"): 1, ("CF_IN_OUT_RATIO", "CF_VOLATILITY"): 3,
                            ("CF_NOCF_MARGIN", "CF_VOLATILITY"): 3},
    "DEBT_SERVICE": {("DEBT_DSCR", "DEBT_LINE_UTIL"): 3},
    "LEVERAGE": {("LEV_DEBT_TO_CF", "LEV_FACTORING_RELIANCE"): 3, ("LEV_DEBT_TO_CF", "LEV_FUNDING_COST"): 5,
                 ("LEV_FACTORING_RELIANCE", "LEV_FUNDING_COST"): 3},
    "PAYMENT_BEHAVIOUR": {("PAY_SUPPLIER_LATENESS", "PAY_OVERDUE_PAYABLES"): 1,
                          ("PAY_SUPPLIER_LATENESS", "PAY_DPO"): 3, ("PAY_SUPPLIER_LATENESS", "PAY_DSO"): 3,
                          ("PAY_OVERDUE_PAYABLES", "PAY_DPO"): 3, ("PAY_OVERDUE_PAYABLES", "PAY_DSO"): 3,
                          ("PAY_DPO", "PAY_DSO"): 1},
    "DELINQUENCY": {("DEL_AGING_90", "DEL_OVERDUE_RECEIVABLES"): 3},
    "CONCENTRATION": {("CON_HHI_CUSTOMERS", "CON_HHI_SUPPLIERS"): 3, ("CON_HHI_CUSTOMERS", "CON_CUSTOMER_CHURN"): 3,
                      ("CON_HHI_SUPPLIERS", "CON_CUSTOMER_CHURN"): 1},
}
```

### 7.2 YAML fragment 1 — `scoring.profiles.<P>.weights` (keep each λ)

```yaml
    BANK: { weights: { OPERATING_CASH_FLOW: 17.15, DEBT_SERVICE: 17.13, LIQUIDITY: 16.03, LEVERAGE: 11.97, DELINQUENCY: 6.84, PAYMENT_BEHAVIOUR: 6.84, TAX_REGULARITY: 6.01, MOMENTUM: 6.01, CONCENTRATION: 6.01, ACTIVITY_GROWTH: 6.01 } }
    FUND: { weights: { ACTIVITY_GROWTH: 22.25, MOMENTUM: 15.89, OPERATING_CASH_FLOW: 13.27, LIQUIDITY: 13.03, CONCENTRATION: 13.03, LEVERAGE: 7.46, DEBT_SERVICE: 4.25, PAYMENT_BEHAVIOUR: 4.25, DELINQUENCY: 4.25, TAX_REGULARITY: 2.32 } }
    INSURER: { weights: { PAYMENT_BEHAVIOUR: 21.5, LIQUIDITY: 13.7, DELINQUENCY: 11.88, OPERATING_CASH_FLOW: 11.88, CONCENTRATION: 8.97, LEVERAGE: 8.97, DEBT_SERVICE: 7.45, TAX_REGULARITY: 7.45, MOMENTUM: 4.1, ACTIVITY_GROWTH: 4.1 } }
```

BANK OCF (17.15) and DEBT_SERVICE (17.13) have equal ratings. The 0.02 difference is the rounding
residual that the generator adds to the largest category.

### 7.3 YAML fragment 2 — `scoring.indicators.<ID>.weight`

```yaml
    LIQ_RUNWAY: { weight: 0.4286 }
    LIQ_BUFFER: { weight: 0.4286 }
    LIQ_MIN_BALANCE: { weight: 0.1429 }
    CF_NOCF_MARGIN: { weight: 0.4286 }
    CF_VOLATILITY: { weight: 0.1429 }
    CF_IN_OUT_RATIO: { weight: 0.4286 }
    ACT_COLLECTIONS_GROWTH: { weight: 1 }
    DEBT_DSCR: { weight: 0.75 }
    DEBT_LINE_UTIL: { weight: 0.25 }
    LEV_DEBT_TO_CF: { weight: 0.6333 }
    LEV_FACTORING_RELIANCE: { weight: 0.2605 }
    LEV_FUNDING_COST: { weight: 0.1062 }
    PAY_DSO: { weight: 0.125 }
    PAY_DPO: { weight: 0.125 }
    PAY_SUPPLIER_LATENESS: { weight: 0.375 }
    PAY_OVERDUE_PAYABLES: { weight: 0.375 }
    DEL_OVERDUE_RECEIVABLES: { weight: 0.25 }
    DEL_AGING_90: { weight: 0.75 }
    CON_HHI_CUSTOMERS: { weight: 0.6 }
    CON_HHI_SUPPLIERS: { weight: 0.2 }
    CON_CUSTOMER_CHURN: { weight: 0.2 }
    TAX_REGULARITY: { weight: 1 }
```

The intra weights are merged into the existing indicator lines (`…, weight: 0.4286 }`), not pasted
as new keys.

## 8. Measured impact (GROUP, M23 = 2026-08)

Measured with a full pipeline run on the **draft** ratings (BANK OCF 8, CONCENTRATION 2,
ACTIVITY_GROWTH 3 → 2). `data/.work/stats.py base.duckdb ahp.duckdb`.

- **BANK: these numbers belong to the draft and must be re-measured** after A-8. The final BANK
  ratings raise OCF, CONCENTRATION and ACTIVITY_GROWTH.
- FUND and INSURER: the final ratings equal the draft. The numbers below are valid.

| Profile | | mean | sd | p10 | p25 | p50 | p75 | p90 | A | B | C | D | E |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| BANK (draft) | now | 63.87 | 15.57 | 43.0 | 51.6 | 64.5 | 78.6 | 83.4 | 47 | 74 | 69 | 53 | 5 |
| | draft | 61.85 | 15.50 | 41.9 | 49.0 | 62.4 | 74.3 | 82.2 | 37 | 74 | 68 | 60 | 9 |
| FUND | now | 51.39 | 19.83 | 26.2 | 36.8 | 49.2 | 66.9 | 79.1 | 23 | 45 | 55 | 69 | 56 |
| | proposed | 54.68 | 16.42 | 34.5 | 42.7 | 53.8 | 65.5 | 78.3 | 22 | 43 | 82 | 73 | 28 |
| INSURER | now | 68.64 | 13.60 | 51.9 | 62.7 | 70.9 | 77.7 | 83.8 | 48 | 124 | 54 | 15 | 7 |
| | proposed | 64.84 | 12.36 | 50.6 | 56.9 | 64.2 | 74.0 | 80.8 | 30 | 87 | 108 | 18 | 5 |

| Profile | corr(now, new) | mean abs Δ | max abs Δ | groups that change band |
|---|---:|---:|---:|---:|
| BANK (draft) | 0.9629 | 3.71 | 15.60 | 23.8 % |
| FUND | 0.9663 | 5.41 | 19.70 | 32.3 % |
| INSURER | **0.8031** | 7.07 | 25.99 | **44.4 %** |

Limit engine (BANK profile, M23 actions, draft): DECLINE 5 → 9, FREEZE 15 → 15, INCREASE 38 → 37,
MAINTAIN 167 → 164, REDUCE 23 → 23.

### 8.1 Flags for the decision

1. **INSURER moves the most.** corr 0.80 and 44 % of the groups change band. The cause: today
   INSURER puts 70 % on PAYMENT_BEHAVIOUR, DELINQUENCY and CONCENTRATION, and 0 on four
   categories. The proposal spreads the weight over all ten. The premium product reads INSURER
   (`products.premium-profile`), so premiums change for close to half of the groups. This is a
   product change, not a cosmetic one.
2. **Band E means DECLINE.** `limit-engine.spread-bps-by-band` has no E, so an E band gets no limit.
   With the draft, BANK E goes 5 → 9 groups and DECLINE goes 5 → 9. Re-measure after the final
   BANK ratings.
3. **Spread.** CLAUDE.md asks to widen anchors if `final` clusters in a ~15-point band. FUND sd
   drops 19.83 → 16.42 and INSURER 13.60 → 12.36. INSURER p25..p75 becomes 56.9..74.0 (17 points).
   That is close to the limit. Check the histogram after A-8. If it clusters, widen anchors, do not
   touch the weights.
4. **Safest cut (plan cut list item 4):** keep today's weights and ship this file as the documented
   proposal. The scoring then does not move on demo day.

## 9. Sources (read on 2026-09-19)

- EBA, Guidelines on loan origination and monitoring, EBA/GL/2020/06, Final Report: ¶119–120,
  ¶128, ¶135, ¶142–143, ¶150, ¶274 (a–s), Annex 3 (B, items 6–25).
  https://www.bde.es/f/webbde/INF/MenuHorizontal/Normativa/guias/EBA-GL-2020-06-EN.pdf
- Regulation (EU) 575/2013 (CRR), Art. 178, default of an obligor (90 days past due).
  https://lexparency.org/eu/CRR/ART_178/
- Beaver, W. (1966), "Financial Ratios as Predictors of Failure", Journal of Accounting Research 4,
  71–111. https://ideas.repec.org/a/bla/joares/v4y1966ip71-111.html — finding (cash flow / total
  debt as the best single predictor) as summarised in https://en.wikipedia.org/wiki/Bankruptcy_prediction
  and https://arxiv.org/pdf/1001.1446. We did not read the original paper.
- Altman Z'' (non-manufacturers): variables WC/TA, RE/TA, EBIT/TA, book equity/TL.
  https://en.wikipedia.org/wiki/Altman_Z-score (cites Altman et al. 2017, JIFMA 28(2)).
- Ohlson (1980) O-score variables (TL/TA, WC/TA, CL/CA, NI/TA, FFO/TL, …).
  https://en.wikipedia.org/wiki/Ohlson_O-score
- Atradius, "What is underwriting in credit insurance?".
  https://group.atradius.com/knowledge-and-research/resources/what-is-underwriting-in-credit-insurance
- Ley 3/2004, de 29 de diciembre, lucha contra la morosidad (60-day maximum payment term).
  https://www.boe.es/buscar/doc.php?id=BOE-A-2004-21830
- Rule of 40 (Brad Feld, 2015). https://www.wallstreetprep.com/knowledge/rule-of-40/
- Burn multiple (David Sacks, 2020). https://www.wallstreetprep.com/knowledge/burn-multiple/
- Customer concentration risk (practitioner source).
  https://www.wallstreetprep.com/knowledge/customer-concentration/

Not found or not read: Coface and Allianz Trade published buyer-grade methodology (no page read),
Basel SME supporting factor (not needed for the ranking). No weight in this file comes from them.
