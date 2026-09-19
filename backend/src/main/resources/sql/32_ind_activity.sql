-- 32_ind_activity.sql — ACT_COLLECTIONS_GROWTH (SPEC §6). Reads ind30_base (sql/30).
-- YoY: OPERATING_IN 3m / OPERATING_IN 3m twelve months before - 1. It needs a fully active year-ago window,
-- so it starts at M14. Before that, or with a partly inactive year-ago window, QoQ against three months
-- before, with fallback = TRUE. Zero base and positive current inflow gives the best anchor x (decision D3).
INSERT INTO indicator_values_raw
SELECT entity_type, entity_id, month, 'ACT_COLLECTIONS_GROWTH', CASE WHEN ok THEN v END, ok, FALSE, ok AND fb
FROM (
  SELECT *, COALESCE(is_active AND act_3m = 3 AND v IS NOT NULL, FALSE) AS ok
  FROM (
    SELECT *,
           CASE
             WHEN act_3m_l12 = 3 AND op_in_3m_l12 > 0 THEN op_in_3m / op_in_3m_l12 - 1
             WHEN act_3m_l12 = 3 AND op_in_3m > 0     THEN ${best_x_ACT_COLLECTIONS_GROWTH}
             WHEN act_3m_l3 = 3 AND op_in_3m_l3 > 0   THEN op_in_3m / op_in_3m_l3 - 1
             WHEN act_3m_l3 = 3 AND op_in_3m > 0      THEN ${best_x_ACT_COLLECTIONS_GROWTH}
           END AS v,
           NOT COALESCE(act_3m_l12 = 3 AND (op_in_3m_l12 > 0 OR op_in_3m > 0), FALSE) AS fb
    FROM (
      SELECT *,
             LAG(op_in_3m, 12) OVER w AS op_in_3m_l12, LAG(act_3m, 12) OVER w AS act_3m_l12,
             LAG(op_in_3m, 3)  OVER w AS op_in_3m_l3,  LAG(act_3m, 3)  OVER w AS act_3m_l3
      FROM ind30_base
      WINDOW w AS (PARTITION BY entity_type, entity_id ORDER BY month_idx))));
