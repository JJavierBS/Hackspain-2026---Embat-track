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
