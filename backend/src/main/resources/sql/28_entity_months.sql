-- 28_entity_months.sql — the dense entity x month grid every sql/3x_ind_*.sql file starts from (phase 3 contract).
-- is_active: the month is on or after the entity's first month with a booked flow. Months before it have a
-- flat rebuilt cash and no flows, so they are not "stable", they are unknown (DATA_FINDINGS Block 2 open question 1).
CREATE OR REPLACE TABLE entity_months AS
WITH first_active AS (
  SELECT entity_type, entity_id, MIN(month) AS first_month
  FROM monthly_flows
  WHERE n_txn > 0
  GROUP BY 1, 2)
SELECT e.entity_type, e.entity_id, m.month, m.month_idx, m.month_end,
       COALESCE(m.month >= f.first_month, FALSE) AS is_active
FROM entities e
CROSS JOIN months m
LEFT JOIN first_active f ON f.entity_type = e.entity_type AND f.entity_id = e.entity_id;
