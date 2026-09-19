-- 10_staging.sql — typed stg_* tables, EUR amounts, flow classes (SPEC §5.1–5.3).
CREATE OR REPLACE TABLE fx_to_eur AS SELECT * FROM (VALUES ${fx_values}) t(currency, rate);
CREATE OR REPLACE TABLE flow_class_map AS SELECT * FROM (VALUES ${flow_class_values}) t(category, flow_class);

CREATE OR REPLACE TABLE months (month_idx INTEGER, month VARCHAR, month_start DATE, month_end DATE);
INSERT INTO months
SELECT CAST(row_number() OVER (ORDER BY d) - 1 AS INTEGER), strftime(d, '%Y-%m'),
       CAST(d AS DATE), CAST(last_day(d) AS DATE)
FROM (SELECT range AS d FROM range(TIMESTAMP '${period_start}', TIMESTAMP '${snapshot_date}', INTERVAL 1 MONTH));

CREATE OR REPLACE TABLE stg_companies (company_id VARCHAR, group_id VARCHAR, currency VARCHAR);
INSERT INTO stg_companies SELECT company_id, group_id, currency FROM raw_companies;

CREATE OR REPLACE TABLE stg_banking_products AS
SELECT product_id, company_id, type, currency FROM raw_banking_products;

-- Currency of every product that can carry transactions: banking and debt products (DATA_FINDINGS Q4).
CREATE OR REPLACE TABLE product_currency AS
SELECT product_id, currency FROM raw_banking_products
UNION ALL
SELECT product_id, currency FROM raw_debt_products
WHERE product_id NOT IN (SELECT product_id FROM raw_banking_products);

CREATE OR REPLACE TABLE stg_balances AS
SELECT b.product_id, b.company_id, CAST(b.date AS DATE) AS snapshot_date,
       TRY_CAST(b.balance AS DOUBLE) AS balance
FROM raw_balances b;

CREATE OR REPLACE TABLE stg_transactions AS
SELECT t.transaction_id, t.company_id, t.product_id,
       CAST(t.date AS DATE) AS date,
       strftime(CAST(t.date AS DATE), '%Y-%m') AS month,
       CAST(t.amount AS DOUBLE) AS amount,
       ${tx_amount_eur} AS amount_eur,
       t.category,
       CASE
         WHEN COALESCE(m.flow_class, '${default_flow_class}') <> 'OTHER' THEN COALESCE(m.flow_class, '${default_flow_class}')
         WHEN ${other_sign_fallback} AND t.amount > 0 THEN 'OPERATING_IN'
         WHEN ${other_sign_fallback} AND t.amount < 0 THEN 'OPERATING_OUT'
         ELSE 'OTHER'
       END AS flow_class,
       t.counterparty_id,
       COALESCE(t.status IN (${booked_status}), FALSE) AS is_booked,
       FALSE AS is_intragroup
FROM raw_transactions t
JOIN stg_companies c ON c.company_id = t.company_id
LEFT JOIN product_currency pc ON pc.product_id = t.product_id
LEFT JOIN fx_to_eur fx ON fx.currency = ${tx_local_ccy}
LEFT JOIN flow_class_map m ON m.category = t.category
WHERE CAST(t.date AS DATE) >= DATE '${period_start}' AND CAST(t.date AS DATE) <= DATE '${snapshot_date}'
  AND ABS(t.amount) NOT IN (${tx_excluded_abs_amounts});

-- Net sign of the counterparty on this company's transactions, for invoice-direction COUNTERPARTY_FLOW.
CREATE OR REPLACE TABLE cp_sign AS
SELECT company_id, counterparty_id, SIGN(SUM(amount)) AS net_sign
FROM stg_transactions WHERE counterparty_id IS NOT NULL GROUP BY 1, 2;

-- payment_date is a real payment only for the paid statuses. For the other statuses it is the
-- expected date (= due_date), so the invoice stays open up to the snapshot (DATA_FINDINGS Q10).
CREATE OR REPLACE TABLE stg_invoices AS
SELECT i.operation_id, i.company_id,
       CASE
         WHEN '${invoice_direction}' = 'AMOUNT_SIGN'
           THEN CASE WHEN SIGN(i.amount) = ${invoice_issued_sign} THEN 'ISSUED' ELSE 'RECEIVED' END
         ELSE CASE WHEN cp.net_sign > 0 THEN 'ISSUED' WHEN cp.net_sign < 0 THEN 'RECEIVED' END
       END AS direction,
       i.document_type,
       CAST(i.issuance_date AS DATE) AS issuance_date,
       CAST(i.due_date AS DATE) AS due_date,
       CASE WHEN i.status IN (${invoice_paid_status}) THEN CAST(i.payment_date AS DATE) END AS payment_date,
       ${inv_amount_eur} AS amount_eur,
       i.counterparty_id,
       FALSE AS is_intragroup
FROM raw_invoices i
LEFT JOIN fx_to_eur fx ON fx.currency = ${inv_local_ccy}
LEFT JOIN cp_sign cp ON cp.company_id = i.company_id AND cp.counterparty_id = i.counterparty_id
WHERE i.document_type NOT IN (${invoice_excluded_types})
  AND i.status NOT IN (${invoice_excluded_status})
  AND i.amount <> 0;

DELETE FROM stg_invoices WHERE direction IS NULL OR amount_eur IS NULL OR issuance_date IS NULL;

DROP TABLE product_currency;
DROP TABLE cp_sign;
