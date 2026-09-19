-- SPEC §4 data profiling. Run from the repo root:  duckdb < scripts/profiling.sql
-- Needs the Embat CSVs in data/raw/. Write the answers to docs/DATA_FINDINGS.md.
.mode markdown

CREATE OR REPLACE VIEW tx   AS SELECT * FROM read_csv_auto('data/raw/transactions.csv');
CREATE OR REPLACE VIEW inv  AS SELECT * FROM read_csv_auto('data/raw/invoices.csv');
CREATE OR REPLACE VIEW co   AS SELECT * FROM read_csv_auto('data/raw/companies.csv');
CREATE OR REPLACE VIEW bp   AS SELECT * FROM read_csv_auto('data/raw/banking_products.csv');
CREATE OR REPLACE VIEW debt AS SELECT * FROM read_csv_auto('data/raw/debt_products.csv');
CREATE OR REPLACE VIEW bal  AS SELECT * FROM read_csv_auto('data/raw/balances.csv');
CREATE OR REPLACE VIEW sched AS SELECT * FROM read_csv_auto('data/raw/debt_schedule_config.csv');

.print '## Q1 transaction categories (fills flow-classes)'
SELECT category, COUNT(*) AS n,
       SUM(CASE WHEN amount < 0 THEN 1 ELSE 0 END) AS n_out,
       SUM(CASE WHEN amount > 0 THEN 1 ELSE 0 END) AS n_in
FROM tx GROUP BY 1 ORDER BY 2 DESC;

.print '## Q2a invoice document_type and amount sign'
SELECT document_type, COUNT(*) AS n,
       SUM(CASE WHEN amount < 0 THEN 1 ELSE 0 END) AS n_neg,
       SUM(CASE WHEN amount > 0 THEN 1 ELSE 0 END) AS n_pos
FROM inv GROUP BY 1 ORDER BY 2 DESC;

.print '## Q2b invoice counterparties seen on inflows vs outflows'
WITH cp AS (
  SELECT company_id, counterparty_id,
         SUM(CASE WHEN amount > 0 THEN 1 ELSE 0 END) AS n_in,
         SUM(CASE WHEN amount < 0 THEN 1 ELSE 0 END) AS n_out
  FROM tx WHERE counterparty_id IS NOT NULL GROUP BY 1, 2)
SELECT i.document_type, SUM(cp.n_in) AS tx_in, SUM(cp.n_out) AS tx_out
FROM inv i JOIN cp USING (company_id, counterparty_id)
GROUP BY 1 ORDER BY 1;

.print '## Q3 status values'
SELECT status, accounting_status, COUNT(*) AS n FROM tx GROUP BY 1, 2 ORDER BY 3 DESC;
SELECT status, COUNT(*) AS n,
       AVG(CASE WHEN payment_date IS NULL THEN 1.0 ELSE 0.0 END) AS share_payment_date_null
FROM inv GROUP BY 1 ORDER BY 2 DESC;

.print '## Q4 currencies and exchange_rate'
SELECT currency, COUNT(*) AS n_companies FROM co GROUP BY 1 ORDER BY 2 DESC;
SELECT c.currency, COUNT(*) AS n_tx,
       MIN(t.exchange_rate) AS min_rate, MEDIAN(t.exchange_rate) AS median_rate, MAX(t.exchange_rate) AS max_rate,
       MEDIAN(ABS(t.amount)) AS median_abs_amount,
       MEDIAN(ABS(t.amount) * t.exchange_rate) AS median_times_rate,
       MEDIAN(ABS(t.amount) / NULLIF(t.exchange_rate, 0)) AS median_div_rate
FROM tx t JOIN co c USING (company_id) GROUP BY 1 ORDER BY 2 DESC;

.print '## Q5 intragroup: counterparty_id equal to a company_id'
SELECT COUNT(*) AS n_tx, COUNT(DISTINCT t.counterparty_id) AS n_counterparties,
       SUM(CASE WHEN a.group_id = b.group_id THEN 1 ELSE 0 END) AS n_same_group
FROM tx t JOIN co a ON t.company_id = a.company_id
          JOIN co b ON t.counterparty_id = b.company_id;

.print '## Q6 debt products that have transactions'
SELECT d.type, COUNT(DISTINCT d.product_id) AS n_products, COUNT(DISTINCT t.product_id) AS n_with_tx
FROM debt d LEFT JOIN tx t ON t.product_id = d.product_id
GROUP BY 1 ORDER BY 2 DESC;

.print '## Q7 history length per company'
WITH h AS (
  SELECT company_id, COUNT(DISTINCT date_trunc('month', CAST(date AS DATE))) AS n_months
  FROM tx GROUP BY 1)
SELECT COUNT(*) AS n_companies,
       SUM(CASE WHEN n_months < 6 THEN 1 ELSE 0 END) AS lt_6_months,
       SUM(CASE WHEN n_months < 12 THEN 1 ELSE 0 END) AS lt_12_months,
       MIN(n_months) AS min_months, MEDIAN(n_months) AS median_months
FROM h;

.print '## Q8 missingness per company'
SELECT
  (SELECT COUNT(*) FROM co) AS n_companies,
  (SELECT COUNT(*) FROM co WHERE company_id NOT IN (SELECT DISTINCT company_id FROM inv)) AS no_invoices,
  (SELECT COUNT(*) FROM co WHERE company_id NOT IN (SELECT DISTINCT company_id FROM debt)) AS no_debt,
  (SELECT COUNT(*) FROM co WHERE company_id NOT IN (
     SELECT DISTINCT company_id FROM tx
     WHERE lower(category) LIKE '%tax%' OR lower(category) LIKE '%impuesto%' OR lower(category) LIKE '%hacienda%'
  )) AS no_tax_like_category;   -- adjust the patterns after Q1

.print '## Q9 balances by banking product type'
SELECT bp.type, COUNT(*) AS n, SUM(CASE WHEN b.balance < 0 THEN 1 ELSE 0 END) AS n_negative,
       MEDIAN(b.balance) AS median_balance
FROM bal b LEFT JOIN bp USING (product_id)
GROUP BY 1 ORDER BY 2 DESC;

.print '## Q2c invoice amount sign vs counterparty flow direction (per sign)'
WITH cp AS (
  SELECT company_id, counterparty_id,
         SUM(CASE WHEN amount > 0 THEN 1 ELSE 0 END) AS n_in,
         SUM(CASE WHEN amount < 0 THEN 1 ELSE 0 END) AS n_out
  FROM tx WHERE counterparty_id IS NOT NULL GROUP BY 1, 2)
SELECT i.document_type, SIGN(i.amount) AS inv_sign, COUNT(*) AS n_inv,
       SUM(cp.n_in) AS tx_in, SUM(cp.n_out) AS tx_out
FROM inv i JOIN cp USING (company_id, counterparty_id)
GROUP BY 1, 2 ORDER BY 1, 2;

.print '## Q4b invoice currency vs accounting currency vs exchange_rate'
SELECT currency, accounting_currency, COUNT(*) AS n,
       MEDIAN(exchange_rate) AS median_rate, MIN(exchange_rate) AS min_rate, MAX(exchange_rate) AS max_rate
FROM inv GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 30;
SELECT bp.currency AS product_currency, c.currency AS company_currency, COUNT(*) AS n_tx,
       MEDIAN(t.exchange_rate) AS median_rate
FROM tx t JOIN bp USING (product_id) JOIN co c ON c.company_id = t.company_id
GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 30;

.print '## Q5b intragroup mirror pairs (opposite amount, same group, other company, within 2 days)'
WITH t AS (
  SELECT tx.transaction_id, tx.company_id, co.group_id, CAST(tx.date AS DATE) AS d, tx.amount
  FROM tx JOIN co USING (company_id) WHERE tx.status = 'booked')
SELECT COUNT(*) AS n_pairs, COUNT(DISTINCT a.transaction_id) AS n_out_tx,
       COUNT(DISTINCT a.group_id) AS n_groups
FROM t a JOIN t b
  ON b.group_id = a.group_id AND b.company_id <> a.company_id
 AND b.amount = -a.amount AND ABS(date_diff('day', a.d, b.d)) <= 2
WHERE a.amount < 0;
SELECT category, COUNT(*) AS n FROM tx
WHERE lower(category) LIKE '%transfer%' OR lower(category) LIKE '%internal%' OR lower(category) LIKE '%intra%'
GROUP BY 1 ORDER BY 2 DESC;

.print '## Q10 invoice dates: payment_date vs status, dates after snapshot'
SELECT status, COUNT(*) AS n,
       SUM(CASE WHEN payment_date IS NULL THEN 1 ELSE 0 END) AS n_no_payment_date,
       SUM(CASE WHEN pending_amount > 0 THEN 1 ELSE 0 END) AS n_pending_gt0,
       SUM(CASE WHEN CAST(payment_date AS DATE) >= DATE '2026-09-01' THEN 1 ELSE 0 END) AS n_paid_after_snapshot,
       MIN(CAST(issuance_date AS DATE)) AS min_issue, MAX(CAST(issuance_date AS DATE)) AS max_issue
FROM inv GROUP BY 1 ORDER BY 2 DESC;

.print '## Q11 debt sign and schedule coverage'
SELECT type, COUNT(*) AS n,
       SUM(CASE WHEN outstanding < 0 THEN 1 ELSE 0 END) AS n_out_neg,
       SUM(CASE WHEN outstanding > 0 THEN 1 ELSE 0 END) AS n_out_pos,
       SUM(CASE WHEN granted IS NULL THEN 1 ELSE 0 END) AS n_granted_null,
       SUM(CASE WHEN product_id IN (SELECT product_id FROM sched) THEN 1 ELSE 0 END) AS n_with_schedule,
       COUNT(DISTINCT currency) AS n_currencies
FROM debt GROUP BY 1 ORDER BY 2 DESC;
SELECT MIN(CAST(date AS DATE)) AS min_snapshot, MAX(CAST(date AS DATE)) AS max_snapshot,
       SUM(CASE WHEN product_id NOT IN (SELECT product_id FROM bp) THEN 1 ELSE 0 END) AS n_not_banking
FROM bal;

-- Follow-up questions (second round, same session).
.print '## Q4c same currency but rate <> 1'
SELECT 'tx' AS src, COUNT(*) AS n_same_ccy, SUM(CASE WHEN t.exchange_rate <> 1 THEN 1 ELSE 0 END) AS n_rate_ne_1,
       SUM(CASE WHEN t.exchange_rate IS NULL THEN 1 ELSE 0 END) AS n_null
FROM tx t JOIN bp USING (product_id) JOIN co c ON c.company_id = t.company_id WHERE bp.currency = c.currency
UNION ALL
SELECT 'inv', COUNT(*), SUM(CASE WHEN exchange_rate <> 1 THEN 1 ELSE 0 END), SUM(CASE WHEN exchange_rate IS NULL THEN 1 ELSE 0 END)
FROM inv WHERE currency = accounting_currency;
SELECT 'tx no banking product' AS what, COUNT(*) FROM tx WHERE product_id NOT IN (SELECT product_id FROM bp);
.print '## currencies needed'
SELECT DISTINCT ccy FROM (SELECT currency AS ccy FROM co UNION SELECT currency FROM bp UNION SELECT accounting_currency FROM inv UNION SELECT currency FROM debt) ORDER BY 1;
.print '## cross rates to EUR seen in data (units of foreign per 1 EUR)'
SELECT bp.currency AS ccy, COUNT(*) n, MEDIAN(t.exchange_rate) r FROM tx t JOIN bp USING (product_id) JOIN co c ON c.company_id=t.company_id
WHERE c.currency='EUR' AND bp.currency<>'EUR' GROUP BY 1 ORDER BY 2 DESC;
SELECT currency AS ccy, COUNT(*) n, MEDIAN(exchange_rate) r FROM inv WHERE accounting_currency='EUR' AND currency<>'EUR' GROUP BY 1 ORDER BY 2 DESC;
SELECT currency AS ccy, accounting_currency, COUNT(*) n, MEDIAN(exchange_rate) r FROM inv WHERE currency='USD' AND accounting_currency<>'USD' GROUP BY 1,2 ORDER BY 3 DESC;
.print '## Q5c mirror pairs by category'
WITH t AS (
  SELECT tx.transaction_id, tx.company_id, co.group_id, CAST(tx.date AS DATE) AS d, tx.amount, tx.category
  FROM tx JOIN co USING (company_id) WHERE tx.status = 'booked')
SELECT a.category AS out_cat, b.category AS in_cat, COUNT(*) AS n_pairs, COUNT(DISTINCT a.transaction_id) AS n_out,
       MEDIAN(ABS(a.amount)) AS med_amt
FROM t a JOIN t b
  ON b.group_id = a.group_id AND b.company_id <> a.company_id
 AND b.amount = -a.amount AND ABS(date_diff('day', a.d, b.d)) <= 2
WHERE a.amount < 0 GROUP BY 1,2 ORDER BY 3 DESC LIMIT 20;
.print '## Q10b payment_date vs due_date by status'
SELECT status, COUNT(*) n,
  SUM(CASE WHEN payment_date = due_date THEN 1 ELSE 0 END) AS pay_eq_due,
  SUM(CASE WHEN payment_date < issuance_date THEN 1 ELSE 0 END) AS pay_before_issue,
  SUM(CASE WHEN pending_amount = ABS(amount) OR pending_amount = amount THEN 1 ELSE 0 END) AS fully_pending,
  SUM(CASE WHEN pending_amount = 0 THEN 1 ELSE 0 END) AS pending_zero,
  MEDIAN(date_diff('day', CAST(issuance_date AS DATE), CAST(payment_date AS DATE))) AS med_days_issue_to_pay
FROM inv GROUP BY 1 ORDER BY 2 DESC;
SELECT status, CAST(payment_date AS DATE) >= DATE '2026-09-01' AS future_pay, COUNT(*) n,
  SUM(CASE WHEN payment_date = due_date THEN 1 ELSE 0 END) pay_eq_due FROM inv WHERE status IN ('paid','overdue') GROUP BY 1,2 ORDER BY 1,2;
.print '## Q11b debt outstanding sign details'
SELECT type, SIGN(outstanding) s, COUNT(*) n, MEDIAN(outstanding) med_out, MEDIAN(granted) med_granted, MEDIAN(liquidity) med_liq,
  SUM(CASE WHEN liquidity IS NOT NULL THEN 1 ELSE 0 END) n_liq, SUM(CASE WHEN outstanding IS NULL THEN 1 ELSE 0 END) n_null
FROM debt GROUP BY 1,2 ORDER BY 1,2;
SELECT type, SIGN(granted) s, COUNT(*) n FROM debt GROUP BY 1,2 ORDER BY 1,2;
SELECT type, SIGN(liquidity) s, COUNT(*) n FROM debt GROUP BY 1,2 ORDER BY 1,2;
.print '## Q9b balances of debt products (balances rows not in banking_products)'
SELECT d.type, COUNT(*) n, SUM(CASE WHEN b.balance<0 THEN 1 ELSE 0 END) neg, SUM(CASE WHEN ABS(b.balance - d.outstanding) < 0.01 THEN 1 ELSE 0 END) eq_outstanding
FROM bal b JOIN debt d USING (product_id) GROUP BY 1 ORDER BY 2 DESC;
SELECT bp.type, COUNT(*) n FROM bp WHERE product_id NOT IN (SELECT product_id FROM bal) GROUP BY 1;
SELECT COUNT(*) AS n_tx_on_snapshot_day FROM tx WHERE CAST(date AS DATE) = DATE '2026-09-01';
SELECT MIN(CAST(date AS DATE)), MAX(CAST(date AS DATE)) FROM tx;
.print '## Q1b uncategorised - by sign and counterparty presence'
SELECT category, SIGN(amount) s, COUNT(*) n, SUM(CASE WHEN counterparty_id IS NULL THEN 0 ELSE 1 END) n_cp, MEDIAN(ABS(amount)) med
FROM tx WHERE category IN ('-', 'transfer') OR category IS NULL GROUP BY 1,2 ORDER BY 1,2;

.print '## Q5d own-account transfers (same company, other product, opposite amount, lag -1..1 day)'
WITH t AS (
  SELECT transaction_id, company_id, product_id, CAST(date AS DATE) AS d, amount, category
  FROM tx WHERE status = 'booked')
SELECT date_diff('day', a.d, b.d) AS lag, COUNT(*) AS pairs, COUNT(DISTINCT a.transaction_id) AS n_out,
       COUNT(DISTINCT a.company_id) AS n_companies, ROUND(SUM(-a.amount) / 1e9, 1) AS bn
FROM t a JOIN t b
  ON b.company_id = a.company_id AND b.product_id <> a.product_id
 AND b.amount = -a.amount AND ABS(date_diff('day', a.d, b.d)) <= 1
WHERE a.amount < 0 GROUP BY 1 ORDER BY 1;

.print '## Q12 sentinel and very large amounts'
SELECT ABS(amount) AS abs_amount, COUNT(*) AS n, COUNT(DISTINCT company_id) AS n_companies,
       any_value(category) AS category, any_value(description) AS description
FROM tx WHERE ABS(amount) >= 1e8 GROUP BY 1 ORDER BY 2 DESC LIMIT 12;

-- Q13-Q15 read the staged tables of a pipeline run (data/xray.duckdb, backend stopped).
ATTACH 'data/xray.duckdb' AS x (READ_ONLY);
USE x;

.print '## Q13 credit lines: which snapshot explains the gap between balances.balance and outstanding'
CREATE OR REPLACE TEMP TABLE q13 AS
WITH d AS (SELECT d.product_id, d.granted, d.outstanding, d.liquidity, b.balance, CAST(b.date AS DATE) AS bdate
           FROM raw_debt_products d JOIN raw_balances b USING (product_id) WHERE d.type = 'lineofcredit'),
t AS (SELECT t.product_id, SUM(amount) FILTER (WHERE t.is_booked AND t.date > d.bdate) AS after_b
      FROM stg_transactions t JOIN d USING (product_id) GROUP BY 1)
SELECT d.*, t.product_id IS NOT NULL AS has_tx, COALESCE(after_b, 0) AS tx_after FROM d LEFT JOIN t USING (product_id);
SELECT has_tx, COUNT(*) AS n, SUM((ABS(balance - outstanding) < 0.01)::INT) AS eq_outstanding,
       SUM((ABS(balance - outstanding) >= 0.01 AND ABS(balance + tx_after - outstanding) < 0.01)::INT) AS out_eq_bal_plus_after,
       SUM((ABS(balance - outstanding) >= 0.01 AND ABS(balance - tx_after - outstanding) < 0.01)::INT) AS out_eq_bal_minus_after,
       SUM((ABS(balance - outstanding) >= 0.01 AND ABS(balance - liquidity) < 0.01)::INT) AS bal_eq_liquidity,
       SUM((ABS(balance - outstanding) >= 0.01 AND ABS(balance + outstanding) < 0.01)::INT) AS bal_eq_neg_outstanding,
       MIN(bdate) AS min_date, MAX(bdate) AS max_date
FROM q13 GROUP BY 1;

.print '## Q14 rebuilt drawn / granted within [0, 1.2] at every month end, per snapshot'
CREATE OR REPLACE TEMP TABLE q14 AS
WITH lines AS (
  SELECT d.product_id, ABS(d.granted) AS g, d.outstanding AS s_out, b.balance AS s_bal
  FROM raw_debt_products d LEFT JOIN raw_balances b USING (product_id) WHERE d.type = 'lineofcredit'),
tx AS (SELECT product_id, month, SUM(amount) AS amt FROM stg_transactions WHERE is_booked GROUP BY 1, 2)
SELECT l.product_id, l.g, m.month,
       -(l.s_out - COALESCE(SUM(tx.amt) FILTER (WHERE tx.month > m.month), 0)) AS drawn_out,
       -(l.s_bal - COALESCE(SUM(tx.amt) FILTER (WHERE tx.month > m.month), 0)) AS drawn_bal
FROM lines l CROSS JOIN months m LEFT JOIN tx ON tx.product_id = l.product_id
WHERE l.product_id IN (SELECT product_id FROM tx)
GROUP BY l.product_id, l.g, m.month, l.s_out, l.s_bal;
SELECT 'outstanding' AS snap, COUNT(*) AS lines, SUM(ok::INT) AS lines_all_in, ROUND(AVG(ok::INT), 3) AS share_lines,
       SUM(neg::INT) AS lines_credit_below_minus_20pct, SUM(far::INT) AS lines_above_2
FROM (SELECT product_id, bool_and(GREATEST(drawn_out, 0) / g <= 1.2) AS ok,
             bool_or(drawn_out / g < -0.2) AS neg, bool_or(drawn_out / g > 2) AS far
      FROM q14 WHERE g > 0 GROUP BY 1)
UNION ALL
SELECT 'balances', COUNT(*), SUM(ok::INT), ROUND(AVG(ok::INT), 3), SUM(neg::INT), SUM(far::INT)
FROM (SELECT product_id, bool_and(GREATEST(drawn_bal, 0) / g <= 1.2) AS ok,
             bool_or(drawn_bal / g < -0.2) AS neg, bool_or(drawn_bal / g > 2) AS far
      FROM q14 WHERE g > 0 AND drawn_bal IS NOT NULL GROUP BY 1);
SELECT COUNT(DISTINCT product_id) FILTER (WHERE g IS NULL OR g = 0) AS rebuilt_lines_without_granted FROM q14;

.print '## Q15 interest flows (LEV_FUNDING_COST numerator)'
SELECT category, COUNT(*) AS n, SUM((amount_eur < 0)::INT) AS n_out, ROUND(SUM(-amount_eur)) AS eur_net_out,
       COUNT(DISTINCT company_id) AS n_companies, COUNT(DISTINCT company_id || month) AS n_company_months
FROM stg_transactions WHERE is_booked AND category = 'interest_charge' GROUP BY 1;
WITH debtco AS (SELECT entity_id, SUM(outstanding_eur) AS debt FROM debt_snapshot
                WHERE entity_type = 'COMPANY' GROUP BY 1 HAVING SUM(outstanding_eur) > 0),
i AS (SELECT company_id, SUM(-amount_eur) AS int12 FROM stg_transactions
      WHERE is_booked AND category = 'interest_charge' AND month > '2025-08' GROUP BY 1)
SELECT COUNT(*) AS companies_with_debt, SUM((i.company_id IS NULL OR int12 <= 0)::INT) AS no_interest_12m,
       ROUND(quantile_cont(int12 / debt, 0.5), 4) AS p50_interest_over_debt,
       ROUND(quantile_cont(int12 / debt, 0.95), 4) AS p95_interest_over_debt
FROM debtco d LEFT JOIN i ON i.company_id = d.entity_id;
