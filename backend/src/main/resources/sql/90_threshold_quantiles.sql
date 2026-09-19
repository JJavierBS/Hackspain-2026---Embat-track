-- 90_threshold_quantiles.sql — REFERENCE ONLY, for proposing anchors in docs/THRESHOLDS.md (SPEC §6.1).
-- Never read by scoring code. Computed for the active unit only (ARCHITECTURE §5).
CREATE OR REPLACE TABLE threshold_quantiles (
  entity_type VARCHAR, indicator_id VARCHAR, n BIGINT, quantiles_json VARCHAR);

INSERT INTO threshold_quantiles
SELECT entity_type, indicator_id, n,
       CAST(to_json({'p5': q[1], 'p10': q[2], 'p25': q[3], 'p50': q[4],
                     'p75': q[5], 'p90': q[6], 'p95': q[7]}) AS VARCHAR)
FROM (
  SELECT entity_type, indicator_id, COUNT(*) AS n,
         quantile_cont(value, [0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95]) AS q
  FROM indicator_values_raw
  WHERE entity_type = '${unit}' AND available AND value IS NOT NULL
  GROUP BY entity_type, indicator_id);
