-- 36_ind_delinquency.sql — DEL_OVERDUE_RECEIVABLES, DEL_AGING_90 (SPEC §6). Reads ind35_inv from sql/35 and drops it.

-- DEL_OVERDUE_RECEIVABLES: issued invoices overdue at the end of m / issued invoices issued in the 3m window.
-- Lower is better. Nothing issued but something overdue -> the worst anchor's x (D3). Both 0 -> unavailable.
INSERT INTO indicator_values_raw
SELECT entity_type, entity_id, month, 'DEL_OVERDUE_RECEIVABLES', CASE WHEN ok THEN v END, ok, FALSE, FALSE
FROM (
  SELECT em.entity_type, em.entity_id, em.month, i.v,
         COALESCE(em.is_active AND i.act_3m = 3 AND i.v IS NOT NULL, FALSE) AS ok
  FROM entity_months em
  LEFT JOIN (SELECT entity_type, entity_id, month, act_3m,
                    CASE WHEN new_3m > 0 THEN overdue_eur / new_3m
                         WHEN overdue_eur > 0 THEN ${worst_x_DEL_OVERDUE_RECEIVABLES} END AS v
             FROM ind35_inv WHERE direction = 'ISSUED') i
    ON i.entity_type = em.entity_type AND i.entity_id = em.entity_id AND i.month = em.month);

-- DEL_AGING_90: share of the issued overdue amount at the end of m that is more than 90 days overdue.
-- Nothing overdue -> unavailable (D3). The category then rests on DEL_OVERDUE_RECEIVABLES.
INSERT INTO indicator_values_raw
SELECT entity_type, entity_id, month, 'DEL_AGING_90', CASE WHEN ok THEN v END, ok, FALSE, FALSE
FROM (
  SELECT em.entity_type, em.entity_id, em.month, i.v,
         COALESCE(em.is_active AND i.v IS NOT NULL, FALSE) AS ok
  FROM entity_months em
  LEFT JOIN (SELECT entity_type, entity_id, month,
                    CASE WHEN overdue_eur > 0 THEN overdue_90p_eur / overdue_eur END AS v
             FROM ind35_inv WHERE direction = 'ISSUED') i
    ON i.entity_type = em.entity_type AND i.entity_id = em.entity_id AND i.month = em.month);

DROP TABLE ind35_inv;
