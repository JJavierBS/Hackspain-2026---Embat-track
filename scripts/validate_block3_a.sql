-- Block 3 checks for plan A's indicators (sql/30-34, 38). Run on a COPY of data/xray.duckdb:
--   cp data/xray.duckdb /tmp/v.duckdb && duckdb /tmp/v.duckdb < scripts/validate_block3_a.sql
.mode markdown

CREATE OR REPLACE TEMP TABLE a_ind AS
SELECT * FROM (VALUES ('LIQ_RUNWAY'), ('LIQ_BUFFER'), ('LIQ_MIN_BALANCE'), ('CF_NOCF_MARGIN'), ('CF_VOLATILITY'),
                      ('CF_IN_OUT_RATIO'), ('ACT_COLLECTIONS_GROWTH'), ('DEBT_DSCR'), ('DEBT_LINE_UTIL'),
                      ('LEV_DEBT_TO_CF'), ('LEV_FACTORING_RELIANCE'), ('LEV_FUNDING_COST'), ('TAX_REGULARITY'))
  t(indicator_id);

.print '## V5 one row per entity_months row, per indicator (expect n_bad = 0, 13 indicators x 2 entity types)'
WITH grid AS (SELECT entity_type, COUNT(*) AS n_grid FROM entity_months GROUP BY 1),
got AS (SELECT entity_type, indicator_id, COUNT(*) AS n,
               COUNT(DISTINCT (entity_id, month)) AS n_distinct
        FROM indicator_values_raw JOIN a_ind USING (indicator_id) GROUP BY 1, 2)
SELECT COUNT(*) AS n_pairs, SUM(CASE WHEN n <> n_grid OR n_distinct <> n_grid THEN 1 ELSE 0 END) AS n_bad
FROM got JOIN grid USING (entity_type);

.print '## V6 available with a NULL value only for DEBT_DSCR and LEV_DEBT_TO_CF (expect no other row)'
SELECT indicator_id, COUNT(*) AS n
FROM indicator_values_raw JOIN a_ind USING (indicator_id)
WHERE available AND value IS NULL GROUP BY 1 ORDER BY 1;

.print '## V7 no available row in an inactive month, no NULL flag (expect 0 and 0)'
SELECT SUM(CASE WHEN r.available AND NOT em.is_active THEN 1 ELSE 0 END) AS n_avail_inactive,
       SUM(CASE WHEN r.available IS NULL OR r.is_static IS NULL OR r.fallback IS NULL THEN 1 ELSE 0 END) AS n_null_flag
FROM indicator_values_raw r JOIN a_ind USING (indicator_id)
JOIN entity_months em USING (entity_type, entity_id, month);

.print '## V8 availability and quantiles per indicator'
SELECT indicator_id, entity_type, ROUND(AVG(available::INT) * 100, 1) AS avail_pct,
       ROUND(AVG(available::INT) FILTER (WHERE em.is_active) * 100, 1) AS avail_pct_active,
       SUM(fallback::INT) AS n_fallback, SUM(is_static::INT) AS n_static,
       ROUND(quantile_cont(value, 0.05), 3) AS p5, ROUND(quantile_cont(value, 0.5), 3) AS p50,
       ROUND(quantile_cont(value, 0.95), 3) AS p95
FROM indicator_values_raw r JOIN a_ind USING (indicator_id)
JOIN entity_months em USING (entity_type, entity_id, month)
GROUP BY 1, 2 ORDER BY 1, 2;

.print '## V9 causality spot check at M12 (2025-09): recompute from rows dated <= 2025-09 only (expect diff = 0)'
-- Groups with a runway below the cap, so the burn formula is checked, not only the cap.
WITH g AS (
  SELECT m.entity_id FROM indicator_values_raw m
  JOIN indicator_values_raw r ON r.entity_type = m.entity_type AND r.entity_id = m.entity_id AND r.month = m.month
   AND r.indicator_id = 'LIQ_RUNWAY' AND r.available AND r.value < 24
  WHERE m.entity_type = 'GROUP' AND m.month = '2025-09' AND m.indicator_id = 'CF_NOCF_MARGIN' AND m.available
  ORDER BY m.entity_id LIMIT 3),
f AS (
  SELECT entity_id,
         SUM(CASE WHEN flow_class = 'OPERATING_IN'  THEN inflow_eur - outflow_eur ELSE 0 END) AS op_in,
         SUM(CASE WHEN flow_class = 'OPERATING_OUT' THEN outflow_eur - inflow_eur ELSE 0 END) AS op_out,
         SUM(CASE WHEN flow_class = 'TAX'           THEN outflow_eur - inflow_eur ELSE 0 END) AS tax,
         SUM(CASE WHEN flow_class = 'DEBT_SERVICE'  THEN outflow_eur - inflow_eur ELSE 0 END) AS ds
  FROM monthly_flows
  WHERE entity_type = 'GROUP' AND month BETWEEN '2025-07' AND '2025-09' AND month <= '2025-09'
    AND entity_id IN (SELECT entity_id FROM g)
  GROUP BY 1),
h AS (
  SELECT f.entity_id, (f.op_in - f.op_out - f.tax) / f.op_in AS margin,
         CASE WHEN f.op_out + f.tax + f.ds - f.op_in <= 0 THEN NULL
              ELSE c.cash_eom / ((f.op_out + f.tax + f.ds - f.op_in) / 3.0) END AS runway_uncapped
  FROM f JOIN monthly_cash c ON c.entity_type = 'GROUP' AND c.entity_id = f.entity_id AND c.month = '2025-09')
SELECT h.entity_id,
       ROUND(h.margin, 6) AS margin_by_hand, ROUND(m.value, 6) AS margin_stored,
       ROUND(ABS(h.margin - m.value), 9) AS diff_margin,
       ROUND(h.runway_uncapped, 4) AS runway_by_hand, ROUND(r.value, 4) AS runway_stored,
       ROUND(ABS(h.runway_uncapped - r.value), 9) AS diff_runway
FROM h
JOIN indicator_values_raw m ON m.entity_type = 'GROUP' AND m.entity_id = h.entity_id AND m.month = '2025-09'
 AND m.indicator_id = 'CF_NOCF_MARGIN'
JOIN indicator_values_raw r ON r.entity_type = 'GROUP' AND r.entity_id = h.entity_id AND r.month = '2025-09'
 AND r.indicator_id = 'LIQ_RUNWAY'
ORDER BY 1;
