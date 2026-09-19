-- 31_ind_cashflow.sql — CF_NOCF_MARGIN, CF_VOLATILITY, CF_IN_OUT_RATIO (SPEC §6). Reads ind30_base (sql/30).
-- A non-positive denominator counts as zero (decision D3): a net OPERATING_IN below zero is not a base for a ratio.

-- CF_NOCF_MARGIN: NOCF 3m / OPERATING_IN 3m. Zero denominator and positive NOCF gives the best anchor x.
INSERT INTO indicator_values_raw
SELECT entity_type, entity_id, month, 'CF_NOCF_MARGIN', CASE WHEN ok THEN v END, ok, FALSE, FALSE
FROM (
  SELECT *, COALESCE(is_active AND act_3m = 3 AND v IS NOT NULL, FALSE) AS ok
  FROM (
    SELECT *, CASE
                WHEN op_in_3m > 0 THEN nocf_3m / op_in_3m
                WHEN nocf_3m > 0 THEN ${best_x_CF_NOCF_MARGIN}
              END AS v
    FROM ind30_base));

-- CF_VOLATILITY: stddev of monthly NOCF over 6m / average monthly OPERATING_IN over 6m. Lower is better.
-- Zero denominator and a positive stddev gives the worst anchor x. Both zero means unavailable.
INSERT INTO indicator_values_raw
SELECT entity_type, entity_id, month, 'CF_VOLATILITY', CASE WHEN ok THEN v END, ok, FALSE, FALSE
FROM (
  SELECT *, COALESCE(is_active AND act_6m = 6 AND v IS NOT NULL, FALSE) AS ok
  FROM (
    SELECT *, CASE
                WHEN op_in_6m > 0 THEN nocf_std_6m / (op_in_6m / 6.0)
                WHEN nocf_std_6m > 0 THEN ${worst_x_CF_VOLATILITY}
              END AS v
    FROM ind30_base));

-- CF_IN_OUT_RATIO: OPERATING_IN 3m / (OPERATING_OUT 3m + TAX 3m).
-- Zero denominator and positive OPERATING_IN gives the best anchor x.
INSERT INTO indicator_values_raw
SELECT entity_type, entity_id, month, 'CF_IN_OUT_RATIO', CASE WHEN ok THEN v END, ok, FALSE, FALSE
FROM (
  SELECT *, COALESCE(is_active AND act_3m = 3 AND v IS NOT NULL, FALSE) AS ok
  FROM (
    SELECT *, CASE
                WHEN op_out_3m + tax_3m > 0 THEN op_in_3m / (op_out_3m + tax_3m)
                WHEN op_in_3m > 0 THEN ${best_x_CF_IN_OUT_RATIO}
              END AS v
    FROM ind30_base));
