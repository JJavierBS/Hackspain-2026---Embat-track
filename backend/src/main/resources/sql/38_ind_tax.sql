-- 38_ind_tax.sql — TAX_REGULARITY from the entity's own cadence (SPEC §6, decision D2).
-- Reads ind30_base. Writes ind38_tax_cadence for sql/39, which drops both.
-- All causal: month m reads only the tax months up to m.
--   tax month   = an active month with a TAX outflow. gap = month_idx minus the previous tax month's month_idx.
--   cadence     = monthly when the median gap of the tax months up to m is small enough, otherwise quarterly.
--                 Fewer than tax_min_months tax months up to m: cadence unknown, unavailable.
--   ratio       = LEAST(1, tax months in the window / (active months in the window / cadence)).
--   value       = ratio x (cadence / gap_now when gap_now > cadence, else 1), gap_now = m - last tax month.
-- Available when the window has at least annualize_min_months active months. fallback when it is not full.
CREATE OR REPLACE TABLE ind38_tax_cadence AS
WITH tm AS (
  SELECT entity_type, entity_id, month_idx,
         month_idx - LAG(month_idx) OVER (PARTITION BY entity_type, entity_id ORDER BY month_idx) AS gap
  FROM ind30_base
  WHERE is_active AND tax_paid > 0),
b AS (
  SELECT entity_type, entity_id, month, month_idx, is_active,
         SUM(is_active::INTEGER) OVER (PARTITION BY entity_type, entity_id ORDER BY month_idx
                                       ROWS BETWEEN ${tax_window_months} - 1 PRECEDING AND CURRENT ROW) AS n_win
  FROM ind30_base),
agg AS (
  SELECT b.entity_type, b.entity_id, b.month, b.month_idx, b.is_active, b.n_win,
         COUNT(tm.month_idx) AS n_tax,
         quantile_cont(tm.gap, 0.5) AS median_gap,
         MAX(tm.month_idx) AS last_tax,
         COUNT(tm.month_idx) FILTER (WHERE tm.month_idx > b.month_idx - ${tax_window_months}) AS tax_in_win
  FROM b
  LEFT JOIN tm ON tm.entity_type = b.entity_type AND tm.entity_id = b.entity_id AND tm.month_idx <= b.month_idx
  GROUP BY b.entity_type, b.entity_id, b.month, b.month_idx, b.is_active, b.n_win)
SELECT *,
       CASE WHEN median_gap <= ${tax_monthly_max_median_gap} THEN ${tax_monthly_cadence}
            ELSE ${tax_quarterly_cadence} END AS cadence,
       month_idx - last_tax AS gap_now,
       COALESCE(is_active AND n_win >= ${annualize_min_months} AND n_tax >= ${tax_min_months}
                AND median_gap IS NOT NULL, FALSE) AS ok
FROM agg;

INSERT INTO indicator_values_raw
SELECT entity_type, entity_id, month, 'TAX_REGULARITY',
       CASE WHEN ok THEN LEAST(1.0, tax_in_win / (n_win / cadence::DOUBLE))
                         * CASE WHEN gap_now > cadence THEN cadence / gap_now::DOUBLE ELSE 1.0 END END,
       ok, FALSE, ok AND n_win < ${tax_window_months}
FROM ind38_tax_cadence;
