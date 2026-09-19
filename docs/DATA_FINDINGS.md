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

**Decision:** `DIVIDE`, target `LOCAL`. Transactions convert to the company
currency, then to EUR with `fx-to-eur`. Invoices convert to the accounting
currency, then to EUR. When the two currencies are equal, the rate is forced
to 1 (the same-currency outliers above are noise). The product currency comes
from `banking_products` or `debt_products`. Cross-currency outliers
(for example a USD→EUR rate of 11,931) stay: they are < 0.01 % of rows.

`fx-to-eur` holds EUR per one unit of currency, for the 40 currencies seen
as company, product, accounting or debt currency:
- 25 currencies: ECB euro reference rates of 2026-09-01
  (`https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml`).
- 14 currencies without an ECB rate (AED, AOA, ARS, BAM, CLP, COP, GHS, MAD,
  MZN, NAD, PEN, RUB, VND, XOF): the dated open dataset
  `@fawazahmed0/currency-api@2026-09-01` (jsDelivr). BAM and XOF match their
  fixed euro pegs. CLP, PEN, AOA, MAD and AED are within 5 % of the data's
  own median cross rates.

The rates are static. SPEC §5.2 asks for EUR amounts only for comparison, and
ratios are computed inside one entity.

**Config change:** `data-rules.fx-convention: DIVIDE`, `fx-target: LOCAL`,
`fx-to-eur` = 40 entries.

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
