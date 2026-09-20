# Data Findings (SPEC §4)

Profiled with DuckDB CLI v1.5.5 (Homebrew stable), on 2026-09-19.

Source: `scripts/profiling.sql`. Run it from the repository root:
`duckdb < scripts/profiling.sql`. The full run takes about 6 s.
Each decision below changes `scoring-config.yml`. SQL files read the values
through `SqlParams` placeholders.

Data period: transactions from 2024-09-01 to 2026-09-01 (inclusive). The
scoring window is `2024-09 … 2026-08`. The snapshot date is 2026-09-01.

## Q1 — Transaction categories → flow classes
**Query:** Q1, Q1b in `scripts/profiling.sql`
**Result:** 2,556,437 rows. 24 category values. `-` is the "no category"
value (635,530 rows, 25 %). `NULL` has 330 rows.

| category | n | out | in |
|---|---:|---:|---:|
| `-` | 635,530 | 410,614 | 224,671 |
| collection | 567,417 | 29 | 567,376 |
| payment | 362,276 | 362,276 | 0 |
| utility | 259,430 | 259,430 | 0 |
| fee | 179,500 | 179,429 | 71 |
| transfer | 152,102 | 61,379 | 90,723 |
| bulk_collection | 65,492 | 0 | 65,492 |
| tax | 55,904 | 55,005 | 899 |
| cash_settlement | 48,280 | 0 | 48,279 |
| pos_settlement | 47,315 | 0 | 47,204 |
| salary | 42,223 | 42,223 | 0 |
| bulk_payment | 41,469 | 41,469 | 0 |
| social_security | 24,158 | 24,158 | 0 |
| debt_repayment | 23,044 | 23,044 | 0 |
| cash_withdrawal | 14,096 | 14,096 | 0 |
| collection_refund | 11,848 | 11,571 | 277 |
| interest_charge | 7,822 | 7,822 | 0 |
| pos_withdrawal | 7,506 | 7,506 | 0 |
| investment_deployment | 3,923 | 3,923 | 0 |
| investment_return | 3,458 | 0 | 3,458 |
| payment_refund | 3,222 | 990 | 2,232 |
| cash_settlements, tax_refund | 92 | 0 | 92 |

Only 2 % of `transfer` rows have a counterparty. No category marks a loan
disbursement or a factoring advance.

**Decision:**
- `OPERATING_IN`: collection, bulk_collection, cash_settlement, cash_settlements, pos_settlement.
- `OPERATING_OUT`: payment, bulk_payment, utility, salary, fee, collection_refund, cash_withdrawal, pos_withdrawal.
- `TAX`: tax, tax_refund, social_security. Social security is a statutory
  payment to the public administration. Arrears with the TGSS are a classic
  distress signal in Spain, so it feeds `TAX_REGULARITY`. Both classes are
  in NOCF, so the cash-flow indicators do not change.
- `DEBT_SERVICE`: debt_repayment, interest_charge.
- `INTERNAL`: transfer, investment_deployment, investment_return.
- `FINANCING_IN`: no category. The class stays empty.
- `-`, `NULL` and payment_refund (mixed sign) stay unmapped: `OTHER` with the sign fallback.

`fee` goes to `OPERATING_OUT`, not to `DEBT_SERVICE`. The plan table said
"commissions → DEBT_SERVICE". But every company pays account fees, so with
fees in `DEBT_SERVICE` no company has zero debt service. The SPEC rule
"`DEBT_DSCR` with no debt service → level 100, flag `no_debt`" would then
never apply, and 908 companies have no debt product (Q8).

**Config change:** `scoring.flow-classes` replaced. `default-flow-class: OTHER`
and `other-sign-fallback: true` unchanged.

## Q2 — Invoice direction ⚠ (decision rule: issued vs received)
**Query:** Q2a, Q2b, Q2c in `scripts/profiling.sql`
**Result:** 897,894 invoices, 10 document types. `invoice` is 85 %.
For `invoice`, the amount sign matches the counterparty flow direction:

| document_type | sign | n | cp tx in | cp tx out |
|---|---:|---:|---:|---:|
| invoice | +1 | 145,910 | 4,306,016 | 318,354 |
| invoice | −1 | 229,351 | 262,437 | 5,680,560 |
| invoiceGroup | +1 | 843 | 8,197 | 314 |
| invoiceGroup | −1 | 1,183 | 607 | 35,943 |
| note | +1 | 7,803 | 16,718 | 140,568 |
| note | −1 | 9,938 | 164,120 | 28,994 |
| refund | +1 | 430 | 384 | 9,298 |
| deposit | +1 / −1 | 6,201 / 3,635 | mostly in | mostly in |

A positive `invoice` goes to a counterparty that pays us (a customer). A
negative `invoice` goes to a counterparty that we pay (a supplier).
`note` and `refund` have the opposite sign pattern (credit notes).
`deposit` maps to inflows for both signs.

**Decision:** `AMOUNT_SIGN`, positive amount = `ISSUED`. Keep `invoice` and
`invoiceGroup`. Exclude the other types:
- `note`, `refund`: credit notes with a reversed sign (4.5 % of rows).
- `deposit`: direction is not clear from the sign.
- `paymentDocument`: payment records. They would count the same cash twice.
- `deliveryNote`, `purchaseOrder`, `other`, `cheque`: not invoices.

Rows with `amount = 0` are dropped in `10_staging.sql`.

**Config change:** `data-rules.invoice-direction: AMOUNT_SIGN`,
`invoice-issued-sign: 1`, `invoice-excluded-document-types` = the 8 types above.

## Q3 — Status values
**Query:** Q3 in `scripts/profiling.sql`
**Result:** Transactions: `booked` 2,520,019 · `NULL` 29,839 · `pending` 6,579.
`accounting_status` is a reconciliation state, not a bank state
(`DISCARDED` = 306k booked rows). Invoices: paid 660,299 · overdue 192,556 ·
pending 29,717 · cancel 13,699 · payment_in_progress 1,216 · paymentOrder 406
· shipped 1. `payment_date` is almost never null (< 0.001 %), for every status.

**Decision:** Flows and balances use `status = 'booked'` only. Invoices with
status `cancel` are excluded. The other statuses stay.
**Config change:** `booked-status-values: [booked]` (unchanged),
`data-rules.invoice-excluded-status-values: [cancel]`.

## Q4 — `exchange_rate` convention ⚠ (`amount_eur` formula)
**Query:** Q4, Q4b, Q4c in `scripts/profiling.sql`
**Result:** 28 company currencies, EUR = 1,149 of 1,286 companies. The median
rate is 1 when the product currency equals the company currency. When they
differ, the rate is the number of product-currency units for one
company-currency unit:

| product ccy | company ccy | median rate | meaning |
|---|---|---:|---|
| USD | EUR | 1.16 | 1 EUR = 1.16 USD |
| GBP | EUR | 0.87 | 1 EUR = 0.87 GBP |
| BRL | EUR | 6.22 | 1 EUR = 6.22 BRL |
| CLP | EUR | 1047.81 | 1 EUR ≈ 1,048 CLP |
| USD | GBP | 1.34 | 1 GBP = 1.34 USD |

Invoices use the same convention towards `accounting_currency`
(USD→EUR 1.16, NOK→EUR 11.0, USD→MYR 0.247, USD→ARS 0.0007).
So `amount / exchange_rate` is in the company currency (transactions) or in
the accounting currency (invoices). It is not in EUR.

Q4c: 2,169 transactions and 3,502 invoices have the same currency on both
sides but a rate ≠ 1 (for example 0.0003 or 6500). 242 same-currency invoices
have a null rate. 184,941 transactions are on debt products (mostly credit
lines), not on banking products.

**Decision:** The convention of `exchange_rate` is `DIVIDE` towards the
local currency. But the column is not reliable: the first staging run gave
24 bn EUR for one 25 M USD collection (COMP_0761, USD→CHF rate 0.0011).
So the pipeline ignores `exchange_rate` (`fx-convention: NONE`). It converts
the native amount with the static rate of its own currency:
- Transactions: the product currency (`banking_products` or `debt_products`).
  14 companies have 1,314 transactions on products that are in neither file:
  they use the company currency.
- Invoices: the invoice `currency`.

The balance reconstruction converts with the same product-currency rate, so
flows and balances stay consistent. Set `fx-convention: DIVIDE` to go back to
the column (then the local currency is the company or accounting currency,
and a rate is forced to 1 when both currencies are equal).

`fx-to-eur` holds EUR per one unit of currency, for the 44 currencies seen
as company, product, invoice, accounting or debt currency (EUR = 1.0):
- 28 currencies: ECB euro reference rates of 2026-09-01
  (`https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml`).
- 15 currencies without an ECB rate (AED, AOA, ARS, BAM, CLP, COP, GHS, MAD,
  MZN, NAD, PEN, RUB, SAR, VND, XOF): the dated open dataset
  `@fawazahmed0/currency-api@2026-09-01` (jsDelivr). BAM and XOF match their
  fixed euro pegs. CLP, PEN, AOA, MAD and AED are within 5 % of the data's
  own median cross rates.

The rates are static. SPEC §5.2 asks for EUR amounts only for comparison, and
ratios are computed inside one entity.

**Config change:** `data-rules.fx-convention: NONE`, `fx-target: LOCAL`,
`fx-to-eur` = 44 entries.

## Q5 — Intragroup counterparties ⚠ (rule)
**Query:** Q5, Q5b, Q5c in `scripts/profiling.sql`
**Result:** No `counterparty_id` equals a `company_id` (0 rows). The mirror
test (outflow in one company, the same amount as inflow in another company
of the same group, within 2 days) finds 135,864 pairs, 70,843 distinct
outflows, in 163 of 250 groups. Top category pairs:

| out | in | pairs | median amount |
|---|---|---:|---:|
| payment | collection | 29,155 | 10,000 |
| transfer | transfer | 27,360 | 15,000 |
| payment | transfer | 19,127 | 15,000 |
| `-` | transfer | 10,430 | 10,000 |
| `-` | `-` | 7,735 | 1,569 |

Most pairs are round amounts paid by one group company and collected by
another: intragroup trade and cash pooling. Small coincidental pairs exist
(fee ↔ collection, median 25 EUR, 1,666 pairs), but their amounts are small.

**Decision:** `MIRROR_MATCH` with a 2-day lag. Both sides of a pair are tagged.
**Config change:** `data-rules.intragroup-rule: MIRROR_MATCH`,
`intragroup-max-lag-days: 2`.

## Q5d — Own-account transfers (same company, two products)
**Query:** Q5d in `scripts/profiling.sql`
**Result:** An outflow on one product and the same amount as inflow on another
product of the same company:

| lag (days) | pairs | outflows | companies | EUR |
|---:|---:|---:|---:|---:|
| −1 | 4,371 | 3,054 | 296 | 7.6 bn |
| 0 | 47,118 | 32,907 | 672 | 44.2 bn |
| +1 | 12,504 | 8,990 | 508 | 6.8 bn |

Top category pairs (lag 0): payment ↔ collection 10,461, transfer ↔ transfer
10,341, payment ↔ transfer 5,834 (median 15,000 EUR). These are sweeps
between the company's own accounts, but the bank categories call them
payment and collection. Without this rule they count as revenue and cost.
**Decision:** SPEC §4.5 fallback. Both sides of a pair within 1 day get flow
class `INTERNAL` (in `11_intragroup.sql`). They leave NOCF and the
counterparty tables. After this rule 213,004 transactions are `INTERNAL`.
**Config change:** `data-rules.own-account-max-lag-days: 1` (−1 turns it off).
**Known gap:** COMP_1185 still has 48 bn EUR of operating flows in 2 years.
Its "TRASPAS AUTOMATIC" sweeps do not have exact mirror amounts. Its flow
ratios are distorted. Block 3 must check this company.

## Q6 — Debt products with transactions
**Query:** Q6 in `scripts/profiling.sql`
**Result:**

| type | products | with transactions |
|---|---:|---:|
| loan | 1,022 | 10 |
| lineofcredit | 536 | 312 |
| confirming | 229 | 49 |
| factoring | 24 | 4 |
| leasing, guarantee, mortgage, renting | 428 | 0 |

**Decision:** `DEBT_LINE_UTIL` can be monthly for the 312 credit lines with
transactions: rebuild the drawn balance backwards from the snapshot, like
cash. The other lines use the static `outstanding / granted`. Block 3 decides.
**Config change:** None now.

## Q7 — History length per company
**Query:** Q7 in `scripts/profiling.sql`
**Result:** 1,286 companies. Months with at least one transaction: minimum 1,
median 19. 6 companies have < 6 months, 377 have < 12 months.
**Decision:** Block 3 confidence must handle short histories. 12-month
indicators need a fallback or `available = false` for 377 companies.
**Config change:** None now.

## Q8 — Missingness per company
**Query:** Q8 in `scripts/profiling.sql`
**Result:** 501 companies have no invoices. 908 have no debt product.
131 have no tax-like category.
**Decision:** Invoice indicators (PAY_*, DEL_*) are unavailable for 501
companies. Weights renormalize (rule 3). DSCR uses `noDebtLevel` when there
is no debt service.
**Config change:** None.

## Q9 — Balances by banking product type
**Query:** Q9, Q9b in `scripts/profiling.sql`
**Result:** 7,996 balance rows. 5,760 are banking products, 2,236 are debt
products (not in `banking_products.csv`).

| type | n | negative | median |
|---|---:|---:|---:|
| checking | 4,647 | 91 | 6,781.88 |
| card | 794 | 267 | 0.00 |
| investment | 185 | 2 | 61,779.19 |
| wallet | 32 | 0 | 0.50 |
| tpv | 25 | 0 | 0.00 |
| risk | 25 | 5 | 0.00 |
| expensesPlatform | 23 | 0 | 7,175.13 |
| lineofcomex | 19 | 7 | 0.00 |
| saving | 10 | 0 | 20,730.46 |

225 banking products have no balance row (207 checking). Snapshot dates run
from 2026-08-25 to 2026-09-01. 9,242 transactions are dated 2026-09-01.

**Decision:** Keep cash = checking, saving, tpv, expensesPlatform and
semi-liquid = investment. `card` is a liability (a third of the rows are
negative). `wallet`, `risk` and `lineofcomex` stay out (tiny or not cash).
The snapshot balance is taken as the end-of-day balance of its date, so
transactions dated on the snapshot day are inside it.
**Config change:** None (`cash-product-types` unchanged).

## Q10 — Invoice `payment_date` vs status
**Query:** Q10, Q10b in `scripts/profiling.sql`
**Result:**

| status | n | payment_date = due_date | fully pending | payment_date ≥ 2026-09-01 |
|---|---:|---:|---:|---:|
| paid | 660,299 | 342,575 | 1,166 | 23,385 |
| overdue | 192,556 | 185,449 | 186,002 | 6,574 |
| pending | 29,717 | 29,215 | 29,280 | 26,185 |
| payment_in_progress | 1,216 | 1,199 | 1,192 | 401 |

For unpaid statuses, `payment_date` is filled and equals `due_date` in
96–99 % of rows. It is an expected date, not a payment. 19,095 paid invoices
have `payment_date` before `issuance_date` (prepayments).

**Decision:** `payment_date` is a real payment only when `status = 'paid'`.
For every other status, the invoice is open at every month end up to the
snapshot (unpaid at extraction ⇒ unpaid before, so this stays causal).
Without this rule no invoice is ever overdue: the "payment" would fall on
the due date. Paid invoices with `payment_date` after the snapshot are open
at every scored month end, which the contract rule gives with no special code.
Days-to-pay use `GREATEST(0, …)` so prepayments count as 0 days.

**Config change:** `data-rules.invoice-paid-status-values: [paid]` (new key,
not in the plan's record shape; read by `10_staging.sql`).

## Q11 — Debt sign and schedule coverage
**Query:** Q11, Q11b in `scripts/profiling.sql`
**Result:** `outstanding` is negative when money is owed. `granted` is
negative (1 positive guarantee, 2 positive credit lines). `liquidity` is
positive. Positive `outstanding` exists: 110 credit lines (median +31,840,
liquidity above the granted limit), 23 loans (mostly the value 223.52),
8 confirming, 3 factoring. For a credit line, positive `outstanding` is a
credit balance, not debt. 87 schedules (75 loans, 7 leasing).

**Decision:** Owed amount = `GREATEST(-outstanding, 0)`, not `ABS`. A positive
outstanding means nothing is owed. `granted_eur = ABS(granted)`,
`liquidity_eur = ABS(liquidity)`.
**Config change:** None. Expression in `24_debt_snapshot.sql`.

## Q12 — Sentinel amounts
**Query:** Q12 in `scripts/profiling.sql`
**Result:** 5 transactions (2 companies, COMP_0538 and COMP_0604) have
`|amount| = 999,999,999`, all inflows, category `-`, narrative
"MANUAL QUITAR RETENCION". They give +4 bn EUR to COMP_0604 in one day, and
the backward balance rebuild would put its cash at −4 bn before that day.
**Decision:** Drop them in staging.
**Config change:** `data-rules.tx-excluded-abs-amounts: [999999999]`.

## Q13 — Credit-line snapshot for the monthly rebuild
**Query:** Q13 in `scripts/profiling.sql` (reads a pipeline run)
**Result:** 532 credit lines have a `balances.csv` row, dated 2026-08-28 …
2026-09-01. `balance = outstanding` on 284 of them (148 without
transactions, 136 with). For the other 248 lines, no rule explains the gap:
`balance ± booked amount after balance.date = outstanding` matches 0 lines,
`balance = −outstanding` matches 0, and `balance = liquidity` matches 7.
The two values do not describe the same balance at different dates.
**Decision:** The plan rule applies: rebuild from `debt_products.outstanding`
at `${snapshot_date}`. `balances.csv` fits a little better in Q14
(93.8 % against 90.8 %), but no date logic explains it, and D4 already uses
`outstanding` for the static lines. One source for both kinds of line.
**Config change:** None (`sql/33_ind_debt.sql`).

## Q14 — Direction of the credit-line rebuild
**Query:** Q14 in `scripts/profiling.sql`
**Result:** drawn(m) = `GREATEST(−(S − Σ booked amount with month > m), 0)`.
273 rebuilt lines have `granted ≠ 0`. With `S = outstanding`, 248 (90.8 %)
stay within [0, 1.2] × granted at every month end. With `S = balance`,
255 of 272 (93.8 %). 84 lines have a credit balance above 20 % of the
limit in some month (clamped to 0 drawn). 9 lines go above 2 × granted.
22 rebuilt lines have no `granted` (NULL or 0): unavailable.
**Decision:** The sign is correct (≥ 90 %). Keep `GREATEST(…, 0)` for credit
balances. Do not clamp above 1: an overdraft beyond the limit is a real signal.
**Config change:** None.

## Q15 — Interest flows
**Query:** Q15 in `scripts/profiling.sql`
**Result:** 7,803 booked `interest_charge` rows, all outflows, 18.8 M EUR,
470 companies, 3,475 company-months. 307 companies have debt outstanding at
the snapshot. 128 of them (41.7 %) have no interest flow in the last 12
months. Interest 12m / debt: p50 0.36 %, p95 16.4 %.
**Decision:** `LEV_FUNDING_COST` falls back to the static schedule rate for
about 42 % of indebted companies. The flow-based cost is low (p50 0.36 %),
so most spreads over `reference_rate` are negative. Hypothesis, not
checked: much interest is inside `debt_repayment` instalments (Q1).
Check the quantiles in Block 3 before the anchors close.
**Config change:** `data-rules.interest-categories: [interest_charge]`,
`data-rules.credit-line-debt-types: [lineofcredit]`,
`data-rules.factoring-debt-types: [factoring, confirming]`.

## Block 2 run (2026-09-19)
Clean run on the real CSVs: `rm -f data/xray.duckdb*`, then boot. State `DONE`.
With an empty `data/raw/`, the three stages skip and the run also ends `DONE`.

| stage | ms |
|---|---:|
| S00_INGEST | 230 |
| S10_STAGING | 5,899 |
| S20_MONTHLY | 318 |
| total | 6,447 |

**V1** (`scripts/validate_block2.sql`): the rebuilt balance at the snapshot
equals `balances.csv` for all 4,890 cash and semi-liquid products
(0 mismatches). **V2:** the products with a snapshot and no rebuild are only
card (794), wallet (32), risk (25) and lineofcomex (19).

**V3** row counts (company rows):

| table | rows |
|---|---:|
| daily_cash | 924,910 (1,267 companies × 730 days) |
| monthly_flows | 90,638 (1,282 companies, 24 months) |
| monthly_cash | 30,408 |
| monthly_invoices | 31,257 |
| monthly_counterparty | 139,749 |
| debt_snapshot | 655 |

Staging: 2,556,432 transactions (5 sentinels dropped), 2,520,014 booked,
136,471 intragroup, 213,004 `INTERNAL`, 0 without an EUR amount.
761,114 invoices kept. Amount-weighted days-to-pay: ISSUED 27.9,
RECEIVED 26.1. Share of overdue that is 90+ days: ISSUED 41 %, RECEIVED 36 %.

**V4** spot check:
- COMP_0804: cash flat at 1,540 EUR until 2025-12, then 5–10 k EUR. First transaction 2026-01-05, so NOCF is null before 2026-01.
- COMP_1090: cash 4.1–4.5 M EUR, no negative day, monthly NOCF between −394 k and +267 k EUR.
- COMP_1200: cash about 29 k EUR, flat until 2026-02, then 28–45 k EUR. NOCF −118 k EUR in 2026-08.

**Open questions for Block 3:**
1. Months before a company's first transaction have a flat rebuilt cash and no flows. Treat them as unavailable, not as stable (Q7: 377 companies have < 12 months).
2. `DEBT_LINE_UTIL`: monthly for the 312 credit lines with transactions, static for the others (Q6). The drawn balance needs a backward rebuild like cash.
3. COMP_1185 has 48 bn EUR of operating flows from own-account sweeps without exact mirrors (Q5d). Check its indicators.
4. A high share of overdue invoices is 90+ days. Unpaid invoices stay open up to the snapshot (Q10). Check `DEL_AGING_90` quantiles before the anchors close.
5. `FINANCING_IN` is empty: no category marks a disbursement (Q1).

## Block 3 run (A) (2026-09-19)
Clean run on the real CSVs with plan A's files (`sql/30`–`34`, `sql/38`).
State `DONE`. B's files (`sql/35`–`37`) are not on this branch.

| stage | ms |
|---|---:|
| S00_INGEST | 239 |
| S10_STAGING | 6,098 |
| S20_MONTHLY | 319 |
| S25_ROLLUP | 153 |
| S30_RAW_INDICATORS | 943 |
| S95_QUANTILES | 5 |
| total | 7,757 |

Checks (`scripts/validate_block3_a.sql`):
- **V5:** 13 indicators × 2 entity types, one row per `entity_months` row (30,864 company, 6,000 group). 0 bad pairs.
- **V6:** `available` with a NULL value only for `DEBT_DSCR` (12,475 rows, no debt service) and `LEV_DEBT_TO_CF` (2,283 rows, debt with NOCF 12m ≤ 0).
- **V7:** 0 available rows in an inactive month. 0 NULL flags.
- **V9:** at M12, `CF_NOCF_MARGIN` and `LIQ_RUNWAY` recomputed from rows dated ≤ 2025-09 match the stored values exactly (GROUP_0016, 0017, 0019).

**V8** availability (% of all rows / % of active rows) and quantiles:

| indicator | type | avail % | avail % active | p5 | p50 | p95 |
|---|---|---:|---:|---:|---:|---:|
| LIQ_RUNWAY | GROUP | 63.1 | 88.4 | 0 | 24 | 24 |
| LIQ_RUNWAY | COMPANY | 62.6 | 87.6 | 0 | 24 | 24 |
| LIQ_BUFFER | GROUP | 41.8 | 58.5 | −0.02 | 2.58 | 204.2 |
| LIQ_BUFFER | COMPANY | 38.0 | 53.2 | −0.02 | 3.0 | 463.5 |
| LIQ_MIN_BALANCE | GROUP | 62.8 | 88.1 | −0.23 | 0.72 | 17.0 |
| LIQ_MIN_BALANCE | COMPANY | 62.3 | 87.2 | −0.19 | 0.53 | 60.3 |
| CF_NOCF_MARGIN | GROUP | 61.1 | 85.7 | −1.19 | 0.013 | 0.58 |
| CF_NOCF_MARGIN | COMPANY | 61.7 | 86.2 | −8.52 | −0.004 | 0.72 |
| CF_VOLATILITY | GROUP | 49.9 | 69.9 | 0.08 | 0.37 | 2.0 |
| CF_VOLATILITY | COMPANY | 50.1 | 70.0 | 0.09 | 0.60 | 6.66 |
| CF_IN_OUT_RATIO | GROUP | 61.1 | 85.7 | 0.40 | 1.01 | 2.29 |
| CF_IN_OUT_RATIO | COMPANY | 61.7 | 86.2 | 0.002 | 1.00 | 3.19 |
| ACT_COLLECTIONS_GROWTH | GROUP | 50.2 | 70.4 | −0.98 | 0.03 | 5.84 |
| ACT_COLLECTIONS_GROWTH | COMPANY | 49.5 | 69.2 | −1.0 | 0.00 | 8.23 |
| DEBT_DSCR | GROUP | 63.1 | 88.4 | −2,038 | 0.37 | 813 |
| DEBT_DSCR | COMPANY | 63.2 | 88.4 | −3,731 | 0.21 | 1,118 |
| DEBT_LINE_UTIL | GROUP | 30.8 | 43.2 | 0 | 0.35 | 1.17 |
| DEBT_LINE_UTIL | COMPANY | 10.2 | 14.3 | 0 | 0.29 | 1.07 |
| LEV_DEBT_TO_CF | GROUP | 50.7 | 71.1 | 0 | 0 | 5.88 |
| LEV_DEBT_TO_CF | COMPANY | 50.8 | 71.0 | 0 | 0 | 2.49 |
| LEV_FACTORING_RELIANCE | GROUP | 71.3 | 100 | 0 | 0 | 0.10 |
| LEV_FACTORING_RELIANCE | COMPANY | 71.5 | 100 | 0 | 0 | 0 |
| LEV_FUNDING_COST | GROUP | 25.6 | 35.8 | −0.035 | −0.030 | 0.12 |
| LEV_FUNDING_COST | COMPANY | 8.3 | 11.6 | −0.035 | −0.031 | 0.24 |
| TAX_REGULARITY | GROUP | 47.0 | 65.9 | 0.17 | 1.0 | 1.0 |
| TAX_REGULARITY | COMPANY | 43.0 | 60.1 | 0.08 | 1.0 | 1.0 |

Notes on the values:
- `LIQ_RUNWAY`: the median is the cap (24). In half of the entity-months the operating flows cover the burn (burn ≤ 0).
- `LIQ_RUNWAY` **differs from SPEC §6:** the SPEC gives the cap when burn ≤ 0, and does not say what happens when cash is ≤ 0. Here cash ≤ 0 gives the worst anchor x (score 0) for any burn. An overdrawn entity has no runway. Found in the branch review.
- `LIQ_BUFFER`: payables are known from the first month with a `RECEIVED` invoice row, never before (rules 1 and 3). An entity with only `ISSUED` invoices is unavailable.
- `CF_NOCF_MARGIN`: `OPERATING_IN` 3m ≤ 0 with negative NOCF gives the worst anchor x (decision D3, the negative side).
- `DEBT_DSCR`: the tails are very long because `DEBT_SERVICE` 3m is often tiny. The anchors clamp them.
- `ACT_COLLECTIONS_GROWTH`: every available row before M14 is a QoQ fallback. After M14, 7,403 rows are YoY and 4,410 are QoQ (entities with a short history).
- `TAX_REGULARITY`: the median gap is ≤ 1.5 months (monthly cadence) for 94 % of groups and 83 % of companies with at least two tax months. GROUP_0206 stops paying tax after 2026-04. Its value falls month by month: 0.40, 0.18, 0.11, 0.08.
- `LEV_FUNDING_COST`: 93–95 % of values are within [−0.035, 0.1]. 16 companies go above 0.165 (up to 47). The interest rows are real `interest_charge` outflows. The cause is the denominator: the snapshot debt is small for loans that are almost repaid (COMP_0827: 2 k EUR left of a 250 k EUR loan, 91 k EUR interest in 24 months). The anchors clamp them to score 0. A monthly debt balance for loans does not exist (Q6: 10 loans have transactions), so no fix now.
- `LEV_FUNDING_COST` is computed only for entities with debt. `reference_rate` is still the placeholder 0.035, so the level moves when a human sets it.
- `DEBT_LINE_UTIL` and `LEV_FUNDING_COST` flow-based values read snapshot debt, so they set `is_static` (contract item 9). The monthly credit-line rebuild sets `is_static = FALSE` (decision D4).

**Answers to the Block 2 open questions:**
1. **Months before the first transaction:** `entity_months.is_active` is FALSE for them, and every indicator is unavailable there. Groups: 4,280 of 6,000 group-months are active, 95 of 250 groups are active from M00, 2 are never active. Companies: 22,073 of 30,864 active, 437 of 1,286 from M00, 4 never active.
2. **`DEBT_LINE_UTIL`:** monthly (rebuilt from `outstanding`, Q13–Q14) for 131 companies and 80 groups. Static for 55 companies and 28 groups. At M23, 46 single-line companies match `outstanding / granted` within 1 %. The 6 that do not match have booked transactions dated 2026-09-01, after the M23 month end.
3. **COMP_1185:** from 2025-07 its operating flows are 0.8–2.3 bn EUR per month in each direction, with categories `payment` and `collection` (24 bn EUR each way, product PRODUCT_04414 alone has 68 bn EUR gross). Its indicators are absurd from 2025-07: `CF_IN_OUT_RATIO` stays at 0.98–1.00, `CF_NOCF_MARGIN` at −0.02–0.00, and `CF_VOLATILITY` at 0.00–0.02. Its group GROUP_0126 (11 companies) shows the same pattern.
   **Decision (2026-09-19, Fran):** no rule for one entity or one product. The product must run unchanged on any
   dataset, so the pipeline never special-cases an ID. The indicators of this company stay as computed.
4. **`DEL_AGING_90`:** owned by plan B. See B's report.
5. **`FINANCING_IN` empty:** `LEV_FACTORING_RELIANCE` uses only the debt mix (factoring and confirming outstanding / total outstanding). The SPEC component "growth of factoring-classified inflows" is not built, because no category marks a factoring advance. The value is 0 for most entities (p95 0 for companies).

## Block 3 run (merged) (2026-09-19)
Clean run on `main` after PRs #4 and #5 (A and B merged), real CSVs, unit `GROUP`. State `DONE`, 9 stages.
The 4 tests pass (`AnchorInterpolatorTest`, `ProfileRenormalizationTest`, `RollupTest`, `ScoringConfigValidationTest`).

| stage | ms |
|---|---:|
| S00_INGEST | 254 |
| S10_STAGING | 6,297 |
| S20_MONTHLY | 320 |
| S25_ROLLUP | 149 |
| S30_RAW_INDICATORS | 1,789 |
| S40_NORMALIZE | 9 |
| S50_TRAJECTORY | 5 |
| S60_SCORE | 720 |
| S95_QUANTILES | 4 |
| total | 9,547 |

Checks:
- `indicator_values_raw`: 22 indicators × 2 entity types. Every indicator has 6,000 group rows and 30,864 company rows.
- `profile_scores`: 6,000 rows for each profile, 4,280 with a `final` (the active group-months). Every `final` is in [0, 100]. At M23, 248 of 250 groups have a score (2 groups are never active).
- `threshold_quantiles`: 22 rows. The 10 pending indicators are in `docs/THRESHOLDS.md` with a proposal.

Plan B indicators, availability over all group rows (% of 6,000):

| indicator | avail % |
|---|---:|
| PAY_DSO | 37.1 |
| PAY_DPO | 40.1 |
| PAY_SUPPLIER_LATENESS | 40.1 |
| PAY_OVERDUE_PAYABLES | 40.2 |
| DEL_OVERDUE_RECEIVABLES | 37.3 |
| DEL_AGING_90 | 28.3 |
| CON_HHI_CUSTOMERS | 7.7 |
| CON_HHI_SUPPLIERS | 3.2 |
| CON_CUSTOMER_CHURN | 5.5 |

B's final report is not in the repository. Its data findings (open question 4, `DEL_AGING_90`) stay open.

**Histogram of `final` at M23** (248 groups):

| profile | p5 | p25 | p50 | p75 | p95 |
|---|---:|---:|---:|---:|---:|
| BANK | 39.8 | 51.6 | 64.5 | 78.6 | 86.2 |
| FUND | 19.6 | 36.8 | 49.2 | 66.9 | 85.0 |
| INSURER | 38.5 | 62.7 | 70.9 | 77.7 | 86.0 |

BANK and FUND do not cluster (p5–p95 spans 46 and 65 points). INSURER has a narrow middle: p25–p75 spans 15 points, but p5–p95 spans 48 points.
A probable cause is the payment and delinquency levels near 100 (mean level at M23: `PAY_DPO` 97.8, `DEL_OVERDUE_RECEIVABLES` 93.8, `PAY_DSO` 93.0), and INSURER gives these two categories 50 % of the weight.
**Decision:** no anchor change now (D6). The `PAY_DPO` proposal in `THRESHOLDS.md` widens the tail. Weights do not change for this reason (`RULES.md` §3).

## Phase 6 lead-time review (2026-09-19)

**Finding.** Decision G5 credited an event with the first signal month in the 12 months before it. On this data the rule picked signals of an earlier decline. Example, `GROUP_0014` (BANK): event in 2026-02 (DSCR), signal credited in 2025-02, but the group was IMPROVING or HEALTHY for 8 months between the two. All five top "most anticipated" examples had a 12-month lead. Decision G6 had the same defect, and it was worse: the limit engine alternates REDUCE and INCREASE from month to month, so a cut in the window existed for 132 of 139 BANK events.

**Change.** A signal counts only when its run reaches the event: on at the event, or off for at most `lead-time.signal.max-gap-months` (1) months in a row. The lead is measured from the start of that run. The limit cut is the first REDUCE or FREEZE after the last INCREASE before the event. Code: `LeadTimeAnalyzer.runStart` and `LeadTimeAnalyzer.limitCut`.

**Effect** (deterioration, groups, same data):

| profile | ahead rate before → after | mean lead | median lead |
|---|---|---|---|
| BANK | 65 % → 43 % | 4,3 → 1,9 | 3 → 1 |
| FUND | — → 32 % | — → 1,2 | — → 1 |
| INSURER | — → 50 % | — → 2,7 | — → 1 |

BANK limit cut ahead of the event: 132/139 (mean 5,3 months) → 111/138 (mean 2,7). BANK improvements detected ahead: 51 % → 10 %. The numbers are lower and they are defensible.

**Open.** Two pipeline runs on the same input give a different `final` for one group of 248 (`GROUP_0120`, trajectory 32,8 against 33,3), so the event count moves by one (138 or 139). The cause is outside phase 6 (probably the summation order of a parallel or SQL aggregate). It matters for the hidden-test submission.


## Phase 7 R3 — Why forward AUC is below 0.5 (2026-09-19)

**Question.** In the phase 7 plan, the score separates entity-months with a fundamental proxy event
(trigger `RUNWAY`, `DSCR` or `OVERDUE`) from the others in the same month (AUC 0,58–0,72). It does not
separate them 1–3 months before the event (AUC 0,39–0,44). This section explains the gap.

**Method.** GROUP unit, entity-months M06..M20 (2025-03 .. 2026-05), lower score = higher risk, data of
the current config. Script: `data/.work/r3.py` (not committed). The fundamental condition per month is
rebuilt with the rules of `LeadTimeAnalyzer`: runway < 1,5 for 2 months, DSCR < 1,0 for 2 months, or both
overdue levels ≤ 20.

**Reproduction.** The plan's table reproduces exactly: BANK `final` 0,725 now and 0,422 forward, `level`
0,726 and 0,440. FUND 0,579 / 0,390. INSURER 0,659 / 0,429.

**Hypotheses.**

| # | Hypothesis | Result |
|---|---|---|
| a | Distressed months count as "clean" | **Confirmed, main cause of the value below 0,5.** `lead_time_events` keeps one event per entity. So 39,6 % of the forward negatives (BANK) are months that are already in the fundamental condition. They have the lowest scores and they count as "no event ahead". If you remove the months at or after the event, BANK goes to 0,478. The value is still not above 0,5. |
| b | The G3 history rule removes the entities the score catches | **Rejected.** No entity has the condition on for its whole first 7 months. 202 of 250 groups enter the condition at least once. |
| c | Horizon mismatch | **Partly.** The table below shows it. The signal is strong at 1 month and falls to no signal at 3–6 months. |
| d | Other causes | **Two found.** (1) Overlap: the condition needs 2 months below the threshold. The first of these months is already inside the score (for example LIQ_RUNWAY level). So "1 month ahead" is almost the same month. (2) Flicker and mean reversion: `DSCR` makes 238 of the 335 onsets, and 97 of 202 entities enter the condition more than once. An onset comes after a recovery, when the score is at a local peak. Over the next 3 months, the change in `final` correlates −0,48 with its distance from the entity's own median (BANK). |

**Recomputation 1 — first onset only.** Label = the first onset of the condition falls in m+1..m+h.
Months in the condition, and months after the first onset, are removed. AUC of `final`:

| Horizon | BANK | FUND | INSURER |
|---|---|---|---|
| 1..1 | 0,938 | 0,798 | 0,726 |
| 1..2 | 0,700 | 0,598 | 0,563 |
| 1..3 | 0,607 | 0,502 | 0,486 |
| 1..4 | 0,574 | 0,471 | 0,466 |
| 1..5 | 0,547 | 0,446 | 0,446 |
| 1..6 | 0,522 | 0,428 | 0,425 |

**Recomputation 2 — each horizon on its own (1–6 months).** Label = the condition is on at exactly m+h and
off at m. Any onset counts. AUC of `final`, and of the 6-month mean of `final`:

| h | BANK | BANK 6m mean | FUND | INSURER | BANK runway only |
|---|---|---|---|---|---|
| 1 | 0,916 | 0,575 | 0,712 | 0,703 | 0,842 |
| 2 | 0,645 | 0,530 | 0,543 | 0,546 | 0,661 |
| 3 | 0,528 | 0,500 | 0,446 | 0,460 | 0,569 |
| 4 | 0,509 | 0,514 | 0,429 | 0,460 | 0,558 |
| 5 | 0,493 | 0,499 | 0,412 | 0,444 | 0,565 |
| 6 | 0,467 | 0,500 | 0,394 | 0,425 | 0,580 |

If you remove the overlap too (the raw runway or DSCR must not be below its threshold at m yet), the first-onset
AUC at h = 2..6 is 0,37–0,45 for all three profiles.

**Conclusion.** After the labels are corrected, the score detects distress when it arrives (the same month or
1 month before). It gives a useful but weak warning at 2 months for BANK (0,65–0,70) and for runway events
(0,56–0,66 up to 6 months). It does **not** lead fundamental events by 3 months or more in this panel. FUND
and INSURER fall below 0,5 at 3 months or more. A probable cause (not tested): their weights favour growth
and payment categories, and a DSCR onset does not show in those categories first. The lead times on the Methodology page are correct
as a count of signal runs. But they do not prove that the score ranks entities before the event. The
phase 6 code is not changed (plan R3).

**Proposal for José Javier (accept or reject).** In `MethodologyPage.tsx`, `AnticipationFilm`, the text now says:
"Cuántos meses antes de un evento la nota ya avisaba. Medido contra eventos proxy: los datos no traen
etiquetas de impago. Las cifras son del perfil {name} y cambian con el perfil." Proposed replacement:

> Cuántos meses antes de un evento la nota ya avisaba. Medido contra **eventos proxy**: los datos no traen
> etiquetas de impago. La nota detecta bien el deterioro cuando llega: el mismo mes o el anterior. Con dos
> meses de antelación el aviso es útil pero débil. Con tres meses o más, en estos 24 meses de datos, la nota
> no ordena mejor que el azar qué entidades van a entrar en riesgo. Las cifras son del perfil {name} y
> cambian con el perfil.

Post-demo items: record every onset in `lead_time_events`, not only the first one per entity. Evaluate
with the overlap removed. Look again at the DSCR event rule (2 months below 1,0 on monthly flows flickers).

## Phase 7 R4 — Watchlist, improvement event and baseline (2026-09-19)

**Rule for these changes.** The hidden test data can differ from this dataset. So no value below is
chosen for its result on this data. Each rule comes from the brief, the SPEC or the code. The data only
checks that the rule behaves as expected.

### Watchlist: moves, not states

**Finding.** The watchlist counted every active negative state. A group with a DSCR below 1,0 for 12
months stayed on the list for 12 months. `AlertEngine` has no confirmation step: 29 % of `DSCR_BREACH`
runs and 43 % of `RUNWAY_LOW` runs (BANK, groups) last one month only. At M23 the list held 176 of 250
BANK groups (70 %).

**Rejected option.** `min-critical: 3, min-warn: 4` gave the best precision on this data (13,6 % of the
groups). It was chosen by its result on the same data, so it is overfit. On other data it can flag 2 %
or 50 %.

**Change.** An alert counts for the watchlist only while its negative run is **confirmed** (on for
`confirm-months: 2` months in a row) and **new** (confirmed in the last `recent-months: 3` months).
2 months is the hold that SPEC §8.4 already asks of every deterioration event. 3 months is the window of
`score-drop-months`. The brief asks for a monitor that "levanta la mano cuando una empresa se mueve de
verdad": "se mueve" is a change, "de verdad" is a confirmation. A long-lasting condition shows in the
entity status. Code: `S80_Alerts` (watchlist build only). The alert feed does not change.

**Check (groups, M23):**

| Profile | Before | After |
|---|---:|---:|
| BANK | 176 | 75 |
| FUND | 184 | 92 |
| INSURER | 173 | 79 |

On a forward outcome (a group at 35 or more falls below 35 within 6 months, base rate 15,2 %), no
watchlist rule that we tried predicts much better than chance (precision 17–24 %). So the claim for
the list is "new and confirmed", not "predictive".

**Correction of an earlier idea.** A 12-month DSCR does not shrink the list: 116 groups are below 1,0
at M23, against 104 with the 3-month DSCR. It only removes flicker (256 crossings of 1,0 instead of
623). Post-demo item, because it changes scores, events and limits.

### Improvement event: the same proof in both directions

**Finding.** A deterioration event from runway or DSCR needs the condition for 2 months in a row. An
improvement event needed one month above 65. Only 196 of 326 crossings of 65 (BANK, groups) stay above
65 for 3 months. From below 65, 70,6 % of group-months touch 65 within 6 months, and 69,0 % of the
IMPROVING months do. So the old event measured a rebound, and the signal could not beat it.

**Change.** `lead-time.events.improvement-cross-months: 2`, the same value as `runway-months` and
`dscr-months`. The event month is the second month above 65, as the deterioration event month is the
second month in the condition. Code: `LeadTimeAnalyzer.improvement`.

**Fact from the design.** The trajectory comes from past changes of the score. It rises after the
score rises. So a trajectory signal cannot lead a crossing of the same score by much. Claim
"confirms improvement". For deterioration, see the baseline below before any claim of anticipation.

### Baseline next to every lead-time number

**Change.** `LeadTimeAnalyzer` also counts every month outside the event condition and whether the
event followed within the horizon (`lead_time_baseline`). The API gives `hitRate`, `baseRate` and
`lift = hitRate / baseRate`. The Methodology page shows "Frente al azar". The number reads the same
on any dataset: above 1 the signal adds information, at 1 it adds none.

**Result (groups, horizon 6 months):**

| Profile | Event | Events | Ahead (≥ 1 month) | False alarms | Signal hit | Base | Lift |
|---|---|---:|---:|---:|---:|---:|---:|
| BANK | deterioration | 139 | 54 | 36,4 % | 63,6 % | 63,2 % | 1,01 |
| BANK | improvement | 54 (was 63) | 25 (was 7) | 76,9 % (was 75,2 %) | 23,1 % | 13,2 % | 1,75 |
| FUND | deterioration | 157 | 57 | 25,5 % | 74,5 % | 73,7 % | 1,01 |
| FUND | improvement | 57 (was 67) | 21 (was 12) | 81,2 % | 18,8 % | 13,4 % | 1,40 |
| INSURER | deterioration | 141 | 60 | 35,5 % | 64,5 % | 63,5 % | 1,02 |
| INSURER | improvement | 21 (was 26) | 13 (was 6) | 88,3 % | 11,7 % | 5,4 % | 2,17 |

Read it with two cautions:

1. **Part of the improvement "ahead" gain is the dating rule.** The event is now dated at the second
   month. A signal that starts at the first month above 65 counts as 1 month ahead. BANK: 12 of the 25
   are at 1 month, 13 are at 2 months or more.
2. **The deterioration signal does not beat chance on this data (lift 1,01).** Most months are followed
   by a deterioration condition within 6 months (base 63 %), mostly from DSCR flicker. This agrees with
   R3: the score detects distress when it arrives, not 3 or more months before. The pitch must not
   claim more than the lift shows.

## Coverage gate: "Sin historial" on thin evidence (2026-09-19)

**Problem.** In the Cartera view, early months showed many entities at exactly 100. In 2024-09 (BANK),
397 of 437 scored entities had final = 100, and 363 of them rested on one indicator only:
`LEV_FACTORING_RELIANCE`. That indicator is static, and an entity with no debt gets value 0, which maps
to 100. Most other indicators need a window of 3 to 12 active months, so a new entity has none of them.
The rule "missing ≠ zero" renormalizes the weights over the available categories, so one category at
100 gave a final score of 100. `confidence = LOW` did not separate these rows from real ones.

**Rule.** `scoring.confidence.min-trusted-weight-share` (default 0.4). S70 sets confidence to
`INSUFFICIENT` when the available categories hold less than this share of the profile weight. MOMENTUM
is not in the sum, because it comes from the other categories. The score is still computed and stored,
as SPEC §7.6 asks ("scored, never excluded, shown with a badge"). The Cartera view shows these rows
after the ranking with a "Sin historial" badge, a neutral colour and no band, rank or status. They do
not count in the band ladder, the six questions or the rising-star chip. The export keeps their score.

The rule is general: it reads only the profile weights and category availability, never an entity, a
product or a month of this dataset. The value 0.4 means "at least 40 % of what the profile values is
known". It is a config value, not a value fitted to these CSVs.

**Effect on this data (GROUP unit).**
- BANK, 2024-09 and 2024-10: every scored group is `INSUFFICIENT` (95 and 99 rows, 74 and 76 at 100).
- BANK, 2025-01 and 2026-01: no trusted row is at 100. The 16 and 26 rows at 100 are all `INSUFFICIENT`.
- M23: all 248 groups keep a score. 3 FUND and 5 INSURER groups are `INSUFFICIENT`, 0 BANK groups.

**Separate finding.** Two runs of the same code gave different values for 52 rows of `LIQ_RUNWAY`,
`LIQ_BUFFER` and `LIQ_MIN_BALANCE`, on 15 entities. The pipeline is not fully deterministic there.
Not fixed here.

## Missing months are not zero (2026-09-19)

**Problem.** `is_active` stays TRUE from an entity's first booked flow to M23. After it, a month without any
booked transaction was read as a month of zero flows (`COALESCE(..., 0)` in `ind30_base`). There are 917 such
company-months (197 companies) and 193 group-months (27 groups). Of the gaps, 124 companies and 20 groups stay
without data until M23. Variations measured against these zero months are artificial:
- `ACT_COLLECTIONS_GROWTH` hit the best anchor x (zero base, D3) or a huge ratio when the base window was
  empty or partly empty, so an entity back after a gap got a growth score of 100.
- The trajectory and `MOM_PERSISTENCE` of the months after the gap compared real levels with levels built
  from zeros, so momentum jumped (in either direction: zero flows give a low margin but a capped runway).

**Rule.** `entity_months.has_data` = the month has at least one booked transaction. `data_gap` = an active
month whose 3-month window (m-2..m) holds an active month without data (causal). A month with full data never
uses gap months as a comparison base:
- `ACT_COLLECTIONS_GROWTH` (sql/32): the base window (12 or 3 months before) needs `data_3m = 3`. If neither
  base qualifies, the value is unavailable, never the best anchor x.
- Trajectory (S50, `TrajectoryCalculator.compute(levels, dataGap, p)`): outside gap months, smoothing,
  slope and delta3 skip gap levels. It is unavailable until enough clean points exist (`min-points`).
- `MOM_PERSISTENCE` (`ProfileScorer`): restarts at 0 on the first month with full data after a gap.

Levels, and the variations *inside* a gap month, keep the plain computation. At month m we cannot tell a data
gap from an entity that stopped operating, and hiding the second would hide a real decline. Tried and rejected:
dropping the trajectory in gap months too left only zero-based levels, and FUND scores went up to 100 for
entities with no transactions (COMP_0889 at M23: 36.8 → 100).

**Effect on this data (COMPANY unit, `main` vs this change, same raw CSVs).**
- `ACT_COLLECTIONS_GROWTH`: 581 values become unavailable, 124 change value. Values ≥ 10 (growth of
  ≥ 1,000 %): 799 → 709. p99: 222 → 157.
- In the 6 months after a gap (515 entity-months), FUND momentum ≥ 80: 43 → 11, ≤ 20: 21 → 4. Momentum is
  available in 317 of them (515 before) while the clean history rebuilds.
- Final scores change on 1,137–1,167 of the 5,376 entity-months of gap entities (mean +2 pts, range
  −36 to +42 in FUND). Entities without gaps do not change, apart from the known `LIQ_*` nondeterminism above.
