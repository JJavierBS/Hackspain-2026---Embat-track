-- 33_ind_debt.sql — DEBT_DSCR, DEBT_LINE_UTIL (SPEC §6, decision D4). Reads ind30_base (sql/30).

-- DEBT_DSCR: NOCF 3m / DEBT_SERVICE 3m. No debt service in the window: value NULL, available TRUE.
-- S40 maps that case to debt-dscr.no-debt-level (phase 3 contract item 5).
INSERT INTO indicator_values_raw
SELECT entity_type, entity_id, month, 'DEBT_DSCR', CASE WHEN ok AND ds_3m > 0 THEN nocf_3m / ds_3m END, ok, FALSE, FALSE
FROM (
  SELECT *, COALESCE(is_active AND act_3m = 3, FALSE) AS ok
  FROM ind30_base);

-- Credit lines (decision D4, DATA_FINDINGS Q13-Q14). Lines with booked transactions: drawn balance at each
-- month end rebuilt backwards from debt_products.outstanding at the snapshot, like cash:
--   bal(m) = outstanding - sum of booked amounts with month > m, drawn = GREATEST(-bal, 0).
-- Lines without transactions: the static snapshot, the same in every month. Native currency first, EUR after.
-- A line without a limit (granted NULL or 0) or without outstanding has no utilization: left out of both sums.
CREATE OR REPLACE TABLE ind33_lines AS
WITH lines AS (
  SELECT d.product_id, d.company_id, d.currency,
         TRY_CAST(d.outstanding AS DOUBLE) AS snap, ABS(TRY_CAST(d.granted AS DOUBLE)) AS granted
  FROM raw_debt_products d
  WHERE d.type IN (${credit_line_types})
    AND TRY_CAST(d.outstanding AS DOUBLE) IS NOT NULL
    AND ABS(TRY_CAST(d.granted AS DOUBLE)) > 0),
tx AS (
  SELECT product_id, month, amt FROM monthly_line_tx WHERE product_id IN (SELECT product_id FROM lines)),
rebuilt AS (
  SELECT l.product_id, l.company_id, l.currency, l.granted, m.month,
         l.snap - COALESCE(SUM(tx.amt) FILTER (WHERE tx.month > m.month), 0) AS bal_eom
  FROM lines l
  CROSS JOIN months m
  LEFT JOIN tx ON tx.product_id = l.product_id
  WHERE l.product_id IN (SELECT product_id FROM tx)
  GROUP BY l.product_id, l.company_id, l.currency, l.granted, l.snap, m.month)
SELECT r.company_id, r.month, TRUE AS is_rebuilt,
       GREATEST(-r.bal_eom, 0) * fx.rate AS drawn_eur, r.granted * fx.rate AS granted_eur
FROM rebuilt r JOIN fx_to_eur fx ON fx.currency = r.currency
UNION ALL
SELECT l.company_id, m.month, FALSE, GREATEST(-l.snap, 0) * fx.rate, l.granted * fx.rate
FROM lines l CROSS JOIN months m JOIN fx_to_eur fx ON fx.currency = l.currency
WHERE l.product_id NOT IN (SELECT product_id FROM tx);

-- DEBT_LINE_UTIL: sum of drawn / sum of granted per entity (rule 4). Groups sum their companies. Credit lines
-- are bank products, never intragroup. is_static when the entity has no rebuilt line.
INSERT INTO indicator_values_raw
WITH comp AS (
  SELECT 'COMPANY' AS entity_type, company_id AS entity_id, month,
         SUM(drawn_eur) AS drawn, SUM(granted_eur) AS granted, bool_or(is_rebuilt) AS any_rebuilt
  FROM ind33_lines GROUP BY 1, 2, 3),
grp AS (
  SELECT 'GROUP' AS entity_type, c.group_id AS entity_id, l.month,
         SUM(l.drawn_eur) AS drawn, SUM(l.granted_eur) AS granted, bool_or(l.is_rebuilt) AS any_rebuilt
  FROM ind33_lines l JOIN stg_companies c ON c.company_id = l.company_id GROUP BY 1, 2, 3),
u AS (SELECT * FROM comp UNION ALL SELECT * FROM grp)
SELECT entity_type, entity_id, month, 'DEBT_LINE_UTIL', CASE WHEN ok THEN drawn / granted END, ok,
       ok AND NOT any_rebuilt, FALSE
FROM (
  SELECT em.entity_type, em.entity_id, em.month, u.drawn, u.granted, u.any_rebuilt,
         COALESCE(em.is_active AND u.granted > 0, FALSE) AS ok
  FROM entity_months em
  LEFT JOIN u ON u.entity_type = em.entity_type AND u.entity_id = em.entity_id AND u.month = em.month);

DROP TABLE ind33_lines;
