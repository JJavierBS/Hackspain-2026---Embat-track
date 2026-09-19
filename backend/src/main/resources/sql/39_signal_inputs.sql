-- 39_signal_inputs.sql — monthly amounts that products and alerts need and no indicator carries (phase 5 F4).
-- Reads ind30_base (sql/30) and ind38_tax_cadence (sql/38), then drops both. Long format; value NULL = missing.
-- All windows end at month m (causal). 12m amounts are annualized over the active months of the window.
CREATE OR REPLACE TABLE signal_values (
  entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, signal_id VARCHAR, value DOUBLE);

CREATE OR REPLACE TABLE sig_base AS
WITH fin AS (
  SELECT entity_type, entity_id, month, SUM(inflow_eur - outflow_eur) AS fin_in
  FROM monthly_flows
  WHERE flow_class = 'FINANCING_IN'
  GROUP BY 1, 2, 3)
SELECT b.entity_type, b.entity_id, b.month, b.is_active, b.act_3m, b.act_6m, b.act_12m, b.nocf_12m,
       MEDIAN(b.op_in)                  OVER w3    AS op_in_med_3m,
       SUM(b.op_out)                    OVER w3    AS op_out_3m,
       SUM(b.debt_service)              OVER w12   AS ds_12m,
       SUM(COALESCE(f.fin_in, 0))       OVER w3    AS fin_3m,
       SUM(COALESCE(f.fin_in, 0))       OVER wprev AS fin_prev_3m
FROM ind30_base b
LEFT JOIN fin f ON f.entity_type = b.entity_type AND f.entity_id = b.entity_id AND f.month = b.month
WINDOW w3    AS (PARTITION BY b.entity_type, b.entity_id ORDER BY b.month_idx ROWS BETWEEN 2 PRECEDING AND CURRENT ROW),
       w12   AS (PARTITION BY b.entity_type, b.entity_id ORDER BY b.month_idx ROWS BETWEEN 11 PRECEDING AND CURRENT ROW),
       wprev AS (PARTITION BY b.entity_type, b.entity_id ORDER BY b.month_idx ROWS BETWEEN 5 PRECEDING AND 3 PRECEDING);

INSERT INTO signal_values
SELECT entity_type, entity_id, month, 'OP_IN_MEDIAN_3M', CASE WHEN is_active AND act_3m = 3 THEN op_in_med_3m END FROM sig_base
UNION ALL
SELECT entity_type, entity_id, month, 'OP_OUT_AVG_3M', CASE WHEN is_active AND act_3m = 3 THEN op_out_3m / 3.0 END FROM sig_base
UNION ALL
SELECT entity_type, entity_id, month, 'NOCF_12M_ANN',
       CASE WHEN is_active AND act_12m >= ${annualize_min_months} THEN nocf_12m * 12.0 / act_12m END FROM sig_base
UNION ALL
SELECT entity_type, entity_id, month, 'DEBT_SERVICE_12M_ANN',
       CASE WHEN is_active AND act_12m >= ${annualize_min_months} THEN ds_12m * 12.0 / act_12m END FROM sig_base
UNION ALL
SELECT entity_type, entity_id, month, 'FINANCING_IN_3M', CASE WHEN is_active AND act_3m = 3 THEN fin_3m END FROM sig_base
UNION ALL
SELECT entity_type, entity_id, month, 'FINANCING_IN_PREV_3M', CASE WHEN is_active AND act_6m = 6 THEN fin_prev_3m END FROM sig_base
UNION ALL
SELECT entity_type, entity_id, month, 'TAX_GAP_MONTHS', CASE WHEN ok THEN gap_now END FROM ind38_tax_cadence
UNION ALL
SELECT entity_type, entity_id, month, 'TAX_CADENCE_MONTHS', CASE WHEN ok THEN cadence END FROM ind38_tax_cadence;

DROP TABLE sig_base;
DROP TABLE ind38_tax_cadence;
DROP TABLE ind30_base;
