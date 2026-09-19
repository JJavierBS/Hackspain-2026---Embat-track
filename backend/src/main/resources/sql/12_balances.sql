-- 12_balances.sql — daily balances backwards from the snapshot (SPEC §5.5):
--   balance(d) = B(T) − Σ amount of booked txns on the product with date in (d, T]
-- Native currency first, EUR after, with the static rate of the product currency.
CREATE OR REPLACE TABLE daily_product_balance AS
WITH prod AS (
  SELECT p.product_id, p.company_id, p.type, p.currency, b.snapshot_date, b.balance AS snap
  FROM stg_banking_products p
  JOIN stg_balances b USING (product_id)
  WHERE b.balance IS NOT NULL
    AND (p.type IN (${cash_types}) OR p.type IN (${semi_liquid_types}))),
cal AS (
  SELECT CAST(range AS DATE) AS date
  FROM range(TIMESTAMP '${period_start}', TIMESTAMP '${snapshot_date}' + INTERVAL 1 DAY, INTERVAL 1 DAY)),
tx AS (
  SELECT product_id, date, SUM(amount) AS amt
  FROM stg_transactions WHERE is_booked GROUP BY 1, 2),
grid AS (
  SELECT prod.*, cal.date, COALESCE(tx.amt, 0) AS amt_on_day
  FROM prod CROSS JOIN cal
  LEFT JOIN tx ON tx.product_id = prod.product_id AND tx.date = cal.date AND tx.date <= prod.snapshot_date)
SELECT product_id, company_id, type, date,
       snap - COALESCE(SUM(amt_on_day) OVER (
         PARTITION BY product_id ORDER BY date DESC
         ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS balance_native,
       currency
FROM grid;

ALTER TABLE daily_product_balance ADD COLUMN balance_eur DOUBLE;
UPDATE daily_product_balance d SET balance_eur = d.balance_native * fx.rate
FROM fx_to_eur fx WHERE fx.currency = d.currency;

CREATE OR REPLACE TABLE daily_cash (company_id VARCHAR, date DATE, cash_eur DOUBLE, investment_eur DOUBLE);
INSERT INTO daily_cash
SELECT company_id, date,
       COALESCE(SUM(balance_eur) FILTER (WHERE type IN (${cash_types})), 0),
       COALESCE(SUM(balance_eur) FILTER (WHERE type IN (${semi_liquid_types})), 0)
FROM daily_product_balance
WHERE date < DATE '${snapshot_date}'
GROUP BY 1, 2;
