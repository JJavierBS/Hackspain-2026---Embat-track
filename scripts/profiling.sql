-- SPEC §4 data profiling. Run from the repo root:  duckdb < scripts/profiling.sql
-- Needs the Embat CSVs in data/raw/. Write the answers to docs/DATA_FINDINGS.md.
.mode markdown

CREATE OR REPLACE VIEW tx   AS SELECT * FROM read_csv_auto('data/raw/transactions.csv');
CREATE OR REPLACE VIEW inv  AS SELECT * FROM read_csv_auto('data/raw/invoices.csv');
CREATE OR REPLACE VIEW co   AS SELECT * FROM read_csv_auto('data/raw/companies.csv');
CREATE OR REPLACE VIEW bp   AS SELECT * FROM read_csv_auto('data/raw/banking_products.csv');
CREATE OR REPLACE VIEW debt AS SELECT * FROM read_csv_auto('data/raw/debt_products.csv');
CREATE OR REPLACE VIEW bal  AS SELECT * FROM read_csv_auto('data/raw/balances.csv');

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
