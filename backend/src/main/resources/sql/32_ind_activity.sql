-- 32_ind_activity.sql — ACT_COLLECTIONS_GROWTH (SPEC §6). Reads ind30_base (sql/30).
-- YoY: OPERATING_IN 3m / OPERATING_IN 3m twelve months before - 1. It needs a year-ago window with a booked
-- transaction in each of its 3 months, so it starts at M14. Before that, or with a gap in the year-ago window,
-- QoQ against three months before, with fallback = TRUE. Zero base and positive current inflow gives the best
-- anchor x (decision D3). The base window must have a booked transaction in every month (data_3m = 3): a month
-- without any is missing, not zero, so an entity back after a gap never gets an artificial jump (rule 3). The
-- current window keeps the plain check, so an entity that stops transacting still shows its fall.
INSERT INTO indicator_values_raw
SELECT entity_type, entity_id, month, 'ACT_COLLECTIONS_GROWTH', CASE WHEN ok THEN v END, ok, FALSE, ok AND fb
FROM (
  SELECT *, COALESCE(is_active AND act_3m = 3 AND v IS NOT NULL, FALSE) AS ok
  FROM (
    SELECT *,
           CASE
             WHEN data_3m_l12 = 3 AND op_in_3m_l12 > 0 THEN op_in_3m / op_in_3m_l12 - 1
             WHEN data_3m_l12 = 3 AND op_in_3m > 0     THEN ${best_x_ACT_COLLECTIONS_GROWTH}
             WHEN data_3m_l3 = 3 AND op_in_3m_l3 > 0   THEN op_in_3m / op_in_3m_l3 - 1
             WHEN data_3m_l3 = 3 AND op_in_3m > 0      THEN ${best_x_ACT_COLLECTIONS_GROWTH}
           END AS v,
           NOT COALESCE(data_3m_l12 = 3 AND (op_in_3m_l12 > 0 OR op_in_3m > 0), FALSE) AS fb
    FROM (
      SELECT *,
             LAG(op_in_3m, 12) OVER w AS op_in_3m_l12, LAG(data_3m, 12) OVER w AS data_3m_l12,
             LAG(op_in_3m, 3)  OVER w AS op_in_3m_l3,  LAG(data_3m, 3)  OVER w AS data_3m_l3
      FROM ind30_base
      WINDOW w AS (PARTITION BY entity_type, entity_id ORDER BY month_idx))));
