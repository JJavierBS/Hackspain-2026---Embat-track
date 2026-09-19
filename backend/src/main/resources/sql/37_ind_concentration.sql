-- 37_ind_concentration.sql — CON_HHI_CUSTOMERS, CON_HHI_SUPPLIERS, CON_CUSTOMER_CHURN (SPEC §6, decision D9).
-- Source: monthly_counterparty (operating transactions with a counterparty_id). Only part of the operating flow
-- carries a counterparty, so every CON_* value needs coverage = identified flow / operating flow over its window
-- of at least ${con_min_coverage}. IN = customers (OPERATING_IN inflow), OUT = suppliers (OPERATING_OUT outflow).

-- One row per entity, month, direction and counterparty with a positive amount.
CREATE OR REPLACE TABLE ind37_cp AS
SELECT mc.entity_type, mc.entity_id, m.month_idx, mc.direction, mc.counterparty_id, SUM(mc.amount_eur) AS amt
FROM monthly_counterparty mc JOIN months m ON m.month = mc.month
GROUP BY 1, 2, 3, 4, 5
HAVING SUM(mc.amount_eur) > 0;

-- The grid with windowed activity, operating flow and identified flow.
CREATE OR REPLACE TABLE ind37_base AS
WITH op AS (
  SELECT entity_type, entity_id, month,
         SUM(inflow_eur) FILTER (WHERE flow_class = 'OPERATING_IN') AS op_in,
         SUM(outflow_eur) FILTER (WHERE flow_class = 'OPERATING_OUT') AS op_out
  FROM monthly_flows GROUP BY 1, 2, 3),
cp AS (
  SELECT entity_type, entity_id, month,
         SUM(amount_eur) FILTER (WHERE direction = 'IN') AS cp_in,
         SUM(amount_eur) FILTER (WHERE direction = 'OUT') AS cp_out
  FROM monthly_counterparty GROUP BY 1, 2, 3),
g AS (
  SELECT em.entity_type, em.entity_id, em.month, em.month_idx, em.is_active,
         COALESCE(op.op_in, 0) AS op_in, COALESCE(op.op_out, 0) AS op_out,
         COALESCE(cp.cp_in, 0) AS cp_in, COALESCE(cp.cp_out, 0) AS cp_out
  FROM entity_months em
  LEFT JOIN op ON op.entity_type = em.entity_type AND op.entity_id = em.entity_id AND op.month = em.month
  LEFT JOIN cp ON cp.entity_type = em.entity_type AND cp.entity_id = em.entity_id AND cp.month = em.month)
SELECT entity_type, entity_id, month, month_idx, is_active,
       SUM(is_active::INTEGER) OVER w6 AS act_6m,
       SUM(cp_in) OVER w6  AS cp_in_6m,
       SUM(cp_out) OVER w6 AS cp_out_6m,
       SUM(cp_in) OVER w6  / NULLIF(SUM(op_in) OVER w6, 0)  AS cov_in_6m,
       SUM(cp_out) OVER w6 / NULLIF(SUM(op_out) OVER w6, 0) AS cov_out_6m,
       SUM(is_active::INTEGER) OVER w8 AS act_8m,
       SUM(cp_in) OVER w8  / NULLIF(SUM(op_in) OVER w8, 0)  AS cov_in_8m
FROM g
WINDOW w6 AS (PARTITION BY entity_type, entity_id ORDER BY month_idx ROWS BETWEEN 5 PRECEDING AND CURRENT ROW),
       w8 AS (PARTITION BY entity_type, entity_id ORDER BY month_idx ROWS BETWEEN 7 PRECEDING AND CURRENT ROW);

-- HHI over the 6m window: amount per counterparty over m-5..m, shares of the identified total, sum of squares x 10000.
CREATE OR REPLACE TABLE ind37_hhi AS
WITH w AS (
  SELECT b.entity_type, b.entity_id, b.month, cp.direction, cp.counterparty_id, SUM(cp.amt) AS amt
  FROM ind37_base b
  JOIN ind37_cp cp ON cp.entity_type = b.entity_type AND cp.entity_id = b.entity_id
                  AND cp.month_idx BETWEEN b.month_idx - 5 AND b.month_idx
  WHERE b.is_active AND b.act_6m = 6
  GROUP BY 1, 2, 3, 4, 5)
SELECT entity_type, entity_id, month, direction, 10000 * SUM(POWER(amt / tot, 2)) AS hhi
FROM (SELECT *, SUM(amt) OVER (PARTITION BY entity_type, entity_id, month, direction) AS tot FROM w)
GROUP BY 1, 2, 3, 4;

-- CON_HHI_CUSTOMERS: direction IN.
INSERT INTO indicator_values_raw
SELECT entity_type, entity_id, month, 'CON_HHI_CUSTOMERS', CASE WHEN ok THEN hhi END, ok, FALSE, FALSE
FROM (
  SELECT b.entity_type, b.entity_id, b.month, h.hhi,
         COALESCE(b.is_active AND b.act_6m = 6 AND b.cp_in_6m > 0 AND b.cov_in_6m >= ${con_min_coverage}
                  AND h.hhi IS NOT NULL, FALSE) AS ok
  FROM ind37_base b
  LEFT JOIN ind37_hhi h ON h.entity_type = b.entity_type AND h.entity_id = b.entity_id
                       AND h.month = b.month AND h.direction = 'IN');

-- CON_HHI_SUPPLIERS: direction OUT.
INSERT INTO indicator_values_raw
SELECT entity_type, entity_id, month, 'CON_HHI_SUPPLIERS', CASE WHEN ok THEN hhi END, ok, FALSE, FALSE
FROM (
  SELECT b.entity_type, b.entity_id, b.month, h.hhi,
         COALESCE(b.is_active AND b.act_6m = 6 AND b.cp_out_6m > 0 AND b.cov_out_6m >= ${con_min_coverage}
                  AND h.hhi IS NOT NULL, FALSE) AS ok
  FROM ind37_base b
  LEFT JOIN ind37_hhi h ON h.entity_type = b.entity_type AND h.entity_id = b.entity_id
                       AND h.month = b.month AND h.direction = 'OUT');

-- CON_CUSTOMER_CHURN (count-based): recurring = IN counterparties with an amount in at least 3 of m-7..m-2,
-- churned = recurring ones with no IN amount in m-1..m. value = churned / recurring.
-- Needs all 8 months m-7..m active and IN coverage over m-7..m >= threshold. No recurring customer -> unavailable.
INSERT INTO indicator_values_raw
WITH c AS (
  SELECT b.entity_type, b.entity_id, b.month, cp.counterparty_id,
         COUNT(*) FILTER (WHERE cp.month_idx <= b.month_idx - 2) AS n_prev,
         COUNT(*) FILTER (WHERE cp.month_idx >= b.month_idx - 1) AS n_recent
  FROM ind37_base b
  JOIN ind37_cp cp ON cp.entity_type = b.entity_type AND cp.entity_id = b.entity_id AND cp.direction = 'IN'
                  AND cp.month_idx BETWEEN b.month_idx - 7 AND b.month_idx
  WHERE b.is_active AND b.act_8m = 8
  GROUP BY 1, 2, 3, 4),
r AS (
  SELECT entity_type, entity_id, month,
         COUNT(*) FILTER (WHERE n_prev >= 3) AS recurring,
         COUNT(*) FILTER (WHERE n_prev >= 3 AND n_recent = 0) AS churned
  FROM c GROUP BY 1, 2, 3)
SELECT entity_type, entity_id, month, 'CON_CUSTOMER_CHURN', CASE WHEN ok THEN v END, ok, FALSE, FALSE
FROM (
  SELECT b.entity_type, b.entity_id, b.month, r.churned::DOUBLE / NULLIF(r.recurring, 0) AS v,
         COALESCE(b.is_active AND b.act_8m = 8 AND b.cov_in_8m >= ${con_min_coverage}
                  AND r.recurring > 0, FALSE) AS ok
  FROM ind37_base b
  LEFT JOIN r ON r.entity_type = b.entity_type AND r.entity_id = b.entity_id AND r.month = b.month);

DROP TABLE ind37_hhi;
DROP TABLE ind37_base;
DROP TABLE ind37_cp;
