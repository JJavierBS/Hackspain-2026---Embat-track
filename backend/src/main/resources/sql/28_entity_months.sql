-- 28_entity_months.sql — the dense entity x month grid every sql/3x_ind_*.sql file starts from (phase 3 contract).
-- is_active: the month is on or after the entity's first month with a booked flow. Months before it have a
-- flat rebuilt cash and no flows, so they are not "stable", they are unknown (DATA_FINDINGS Block 2 open question 1).
-- has_data: the month has at least one booked transaction. An active month without one is a gap in the record,
-- not a month of zero activity (rule 3). Levels still read it as zero flows, so an entity that stops transacting
-- still shows its decline. data_gap marks the active months whose 3-month window (m-2..m) holds such a month.
-- A month with full data never uses them as a comparison base: growth (sql/32), trajectory (S50) and
-- MOM_PERSISTENCE (ProfileScorer) (DATA_FINDINGS "Missing months are not zero").
CREATE OR REPLACE TABLE entity_months AS
WITH active AS (
  SELECT entity_type, entity_id, month
  FROM monthly_flows
  WHERE n_txn > 0
  GROUP BY 1, 2, 3),
first_active AS (
  SELECT entity_type, entity_id, MIN(month) AS first_month
  FROM active
  GROUP BY 1, 2),
grid AS (
  SELECT e.entity_type, e.entity_id, m.month, m.month_idx, m.month_end,
         COALESCE(m.month >= f.first_month, FALSE) AS is_active,
         a.month IS NOT NULL AS has_data
  FROM entities e
  CROSS JOIN months m
  LEFT JOIN first_active f ON f.entity_type = e.entity_type AND f.entity_id = e.entity_id
  LEFT JOIN active a ON a.entity_type = e.entity_type AND a.entity_id = e.entity_id AND a.month = m.month)
SELECT *,
       is_active AND SUM((is_active AND NOT has_data)::INTEGER) OVER (
         PARTITION BY entity_type, entity_id ORDER BY month_idx ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) > 0 AS data_gap
FROM grid;
