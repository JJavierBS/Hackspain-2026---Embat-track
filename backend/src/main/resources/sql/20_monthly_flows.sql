-- 20_monthly_flows.sql — company rows only; 25_entity_rollup.sql adds groups.
CREATE OR REPLACE TABLE monthly_flows (
  entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, flow_class VARCHAR, is_intragroup BOOLEAN,
  inflow_eur DOUBLE, outflow_eur DOUBLE, n_txn BIGINT);

INSERT INTO monthly_flows
SELECT 'COMPANY', t.company_id, t.month, t.flow_class, t.is_intragroup,
       SUM(CASE WHEN t.amount_eur > 0 THEN t.amount_eur ELSE 0 END),
       SUM(CASE WHEN t.amount_eur < 0 THEN -t.amount_eur ELSE 0 END),
       COUNT(*)
FROM stg_transactions t
WHERE t.is_booked AND t.amount_eur IS NOT NULL AND t.month IN (SELECT month FROM months)
GROUP BY ALL;
