-- 23_monthly_counterparty.sql — operating flows by counterparty, for HHI and churn (Block 3).
CREATE OR REPLACE TABLE monthly_counterparty (
  entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, counterparty_id VARCHAR,
  direction VARCHAR, is_intragroup BOOLEAN, amount_eur DOUBLE, n_txn BIGINT);

INSERT INTO monthly_counterparty
SELECT 'COMPANY', company_id, month, counterparty_id,
       CASE WHEN flow_class = 'OPERATING_IN' THEN 'IN' ELSE 'OUT' END,
       is_intragroup, SUM(ABS(amount_eur)), COUNT(*)
FROM stg_transactions
WHERE is_booked AND counterparty_id IS NOT NULL AND amount_eur IS NOT NULL
  AND flow_class IN ('OPERATING_IN', 'OPERATING_OUT')
  AND month IN (SELECT month FROM months)
GROUP BY 1, 2, 3, 4, 5, 6;
