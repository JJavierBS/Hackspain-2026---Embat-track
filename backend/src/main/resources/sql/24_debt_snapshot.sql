-- 24_debt_snapshot.sql — static debt as of the snapshot, positive magnitudes in EUR.
-- outstanding < 0 means money is owed. A positive outstanding (credit balance on a line) owes
-- nothing, so the owed amount is GREATEST(-outstanding, 0), not ABS (DATA_FINDINGS Q11).
CREATE OR REPLACE TABLE debt_snapshot (
  entity_type VARCHAR, entity_id VARCHAR, debt_type VARCHAR, n_products BIGINT,
  granted_eur DOUBLE, outstanding_eur DOUBLE, liquidity_eur DOUBLE,
  rated_outstanding_eur DOUBLE, rate_x_outstanding_eur DOUBLE);

INSERT INTO debt_snapshot
WITH d AS (
  SELECT p.company_id, p.type,
         ABS(TRY_CAST(p.granted AS DOUBLE)) * fx.rate AS granted_eur,
         GREATEST(-TRY_CAST(p.outstanding AS DOUBLE), 0) * fx.rate AS outstanding_eur,
         ABS(TRY_CAST(p.liquidity AS DOUBLE)) * fx.rate AS liquidity_eur,
         TRY_CAST(s.annual_interest_rate_or_spread AS DOUBLE) AS rate
  FROM raw_debt_products p
  LEFT JOIN raw_debt_schedule s USING (product_id)
  LEFT JOIN fx_to_eur fx ON fx.currency = p.currency)
SELECT 'COMPANY', company_id, type, COUNT(*),
       SUM(granted_eur), SUM(outstanding_eur), SUM(liquidity_eur),
       SUM(outstanding_eur) FILTER (WHERE rate IS NOT NULL),
       SUM(outstanding_eur * rate) FILTER (WHERE rate IS NOT NULL)
FROM d
GROUP BY 1, 2, 3;
