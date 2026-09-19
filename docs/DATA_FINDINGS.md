# Data Findings (SPEC §4)

Source: `scripts/profiling.sql`. Each decision below changes `scoring-config.yml`, never code.

## Q1 — Transaction categories → flow classes
**Query:** Q1 in `scripts/profiling.sql`
**Result:** Not run yet: needs data/raw.
**Decision:** Open.
**Config change:** Open. Target: `scoring.flow-classes`.

## Q2 — Invoice direction ⚠ (decision rule: issued vs received)
**Query:** Q2a and Q2b in `scripts/profiling.sql`
**Result:** Not run yet: needs data/raw.
**Decision:** Open.
**Config change:** Open. Target: invoice direction rule in `scoring-config.yml`.

## Q3 — Status values
**Query:** Q3 in `scripts/profiling.sql`
**Result:** Not run yet: needs data/raw.
**Decision:** Open.
**Config change:** Open. Target: `booked-status-values`.

## Q4 — `exchange_rate` convention ⚠ (`amount_eur` formula)
**Query:** Q4 in `scripts/profiling.sql`
**Result:** Not run yet: needs data/raw.
**Decision:** Open.
**Config change:** Open. Target: `amount_eur` formula (multiply or divide by `exchange_rate`).

## Q5 — Intragroup counterparties ⚠ (rule)
**Query:** Q5 in `scripts/profiling.sql`
**Result:** Not run yet: needs data/raw.
**Decision:** Open.
**Config change:** Open. Target: intragroup rule.

## Q6 — Debt products with transactions
**Query:** Q6 in `scripts/profiling.sql`
**Result:** Not run yet: needs data/raw.
**Decision:** Open.
**Config change:** Open. Target: `DEBT_LINE_UTIL` monthly or static.

## Q7 — History length per company
**Query:** Q7 in `scripts/profiling.sql`
**Result:** Not run yet: needs data/raw.
**Decision:** Open.
**Config change:** Open. Target: confidence thresholds.

## Q8 — Missingness per company
**Query:** Q8 in `scripts/profiling.sql`
**Result:** Not run yet: needs data/raw.
**Decision:** Open.
**Config change:** Open. Target: indicator availability.

## Q9 — Balances by banking product type
**Query:** Q9 in `scripts/profiling.sql`
**Result:** Not run yet: needs data/raw.
**Decision:** Open.
**Config change:** Open. Target: `cash-product-types`.
