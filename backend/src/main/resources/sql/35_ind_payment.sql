-- 35_ind_payment.sql — PAY_DSO, PAY_DPO, PAY_SUPPLIER_LATENESS, PAY_OVERDUE_PAYABLES (SPEC §6).
-- COMPANY rows include intragroup invoices (standalone view), GROUP rows have none (contract item 7).
-- ind35_inv is dense over entity_months only for the directions an entity has invoices in. A missing
-- month inside it means "nothing new, paid or open" (0). An entity with no invoice of a direction has no
-- rows for it, so its indicators of that direction are unavailable (rule 3). sql/36 reads and drops it.
CREATE OR REPLACE TABLE ind35_inv AS
WITH mi AS (
  SELECT entity_type, entity_id, month, direction,
         SUM(new_eur) AS new_eur, SUM(paid_eur) AS paid_eur, SUM(paid_days_x_eur) AS paid_days_x_eur,
         SUM(paid_late_days_x_eur) AS paid_late_days_x_eur,
         SUM(overdue_eur) AS overdue_eur, SUM(overdue_90p_eur) AS overdue_90p_eur
  FROM monthly_invoices GROUP BY 1, 2, 3, 4),
dirs AS (SELECT DISTINCT entity_type, entity_id, direction FROM monthly_invoices),
g AS (
  SELECT em.entity_type, em.entity_id, em.month, em.month_idx, em.is_active, d.direction,
         COALESCE(mi.new_eur, 0) AS new_eur, COALESCE(mi.paid_eur, 0) AS paid_eur,
         COALESCE(mi.paid_days_x_eur, 0) AS paid_days_x_eur,
         COALESCE(mi.paid_late_days_x_eur, 0) AS paid_late_days_x_eur,
         COALESCE(mi.overdue_eur, 0) AS overdue_eur, COALESCE(mi.overdue_90p_eur, 0) AS overdue_90p_eur
  FROM entity_months em
  JOIN dirs d ON d.entity_type = em.entity_type AND d.entity_id = em.entity_id
  LEFT JOIN mi ON mi.entity_type = em.entity_type AND mi.entity_id = em.entity_id
              AND mi.month = em.month AND mi.direction = d.direction)
SELECT *,
       SUM(is_active::INTEGER) OVER w3   AS act_3m,
       SUM(new_eur) OVER w3              AS new_3m,
       SUM(paid_eur) OVER w3             AS paid_3m,
       SUM(paid_days_x_eur) OVER w3      AS paid_days_3m,
       SUM(paid_late_days_x_eur) OVER w3 AS paid_late_3m
FROM g
WINDOW w3 AS (PARTITION BY entity_type, entity_id, direction ORDER BY month_idx
              ROWS BETWEEN 2 PRECEDING AND CURRENT ROW);

-- Each indicator starts from entity_months: exactly one row per grid row (contract item 4).
-- PAY_DSO: amount-weighted days to collect of the invoices issued and paid in the 3m window.
-- Nothing paid in the window -> no rate to measure -> unavailable (D3, both terms are 0).
INSERT INTO indicator_values_raw
SELECT entity_type, entity_id, month, 'PAY_DSO', CASE WHEN ok THEN v END, ok, FALSE, FALSE
FROM (
  SELECT em.entity_type, em.entity_id, em.month, i.v,
         COALESCE(em.is_active AND i.act_3m = 3 AND i.v IS NOT NULL, FALSE) AS ok
  FROM entity_months em
  LEFT JOIN (SELECT entity_type, entity_id, month, act_3m,
                    CASE WHEN paid_3m > 0 THEN paid_days_3m / paid_3m END AS v
             FROM ind35_inv WHERE direction = 'ISSUED') i
    ON i.entity_type = em.entity_type AND i.entity_id = em.entity_id AND i.month = em.month);

-- PAY_DPO: the same on received invoices.
INSERT INTO indicator_values_raw
SELECT entity_type, entity_id, month, 'PAY_DPO', CASE WHEN ok THEN v END, ok, FALSE, FALSE
FROM (
  SELECT em.entity_type, em.entity_id, em.month, i.v,
         COALESCE(em.is_active AND i.act_3m = 3 AND i.v IS NOT NULL, FALSE) AS ok
  FROM entity_months em
  LEFT JOIN (SELECT entity_type, entity_id, month, act_3m,
                    CASE WHEN paid_3m > 0 THEN paid_days_3m / paid_3m END AS v
             FROM ind35_inv WHERE direction = 'RECEIVED') i
    ON i.entity_type = em.entity_type AND i.entity_id = em.entity_id AND i.month = em.month);

-- PAY_SUPPLIER_LATENESS: amount-weighted days paid after the due date, received invoices paid in the 3m window.
INSERT INTO indicator_values_raw
SELECT entity_type, entity_id, month, 'PAY_SUPPLIER_LATENESS', CASE WHEN ok THEN v END, ok, FALSE, FALSE
FROM (
  SELECT em.entity_type, em.entity_id, em.month, i.v,
         COALESCE(em.is_active AND i.act_3m = 3 AND i.v IS NOT NULL, FALSE) AS ok
  FROM entity_months em
  LEFT JOIN (SELECT entity_type, entity_id, month, act_3m,
                    CASE WHEN paid_3m > 0 THEN paid_late_3m / paid_3m END AS v
             FROM ind35_inv WHERE direction = 'RECEIVED') i
    ON i.entity_type = em.entity_type AND i.entity_id = em.entity_id AND i.month = em.month);

-- PAY_OVERDUE_PAYABLES: received invoices overdue at the end of m / received invoices issued in the 3m window.
-- Lower is better. Nothing issued but something overdue -> the worst anchor's x (D3). Both 0 -> unavailable.
INSERT INTO indicator_values_raw
SELECT entity_type, entity_id, month, 'PAY_OVERDUE_PAYABLES', CASE WHEN ok THEN v END, ok, FALSE, FALSE
FROM (
  SELECT em.entity_type, em.entity_id, em.month, i.v,
         COALESCE(em.is_active AND i.act_3m = 3 AND i.v IS NOT NULL, FALSE) AS ok
  FROM entity_months em
  LEFT JOIN (SELECT entity_type, entity_id, month, act_3m,
                    CASE WHEN new_3m > 0 THEN overdue_eur / new_3m
                         WHEN overdue_eur > 0 THEN ${worst_x_PAY_OVERDUE_PAYABLES} END AS v
             FROM ind35_inv WHERE direction = 'RECEIVED') i
    ON i.entity_type = em.entity_type AND i.entity_id = em.entity_id AND i.month = em.month);
