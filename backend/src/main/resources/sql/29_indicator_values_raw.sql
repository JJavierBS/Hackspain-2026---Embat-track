-- 29_indicator_values_raw.sql — the long table that sql/30_* … sql/38_* INSERT into (ARCHITECTURE §5).
CREATE OR REPLACE TABLE indicator_values_raw (
  entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, indicator_id VARCHAR,
  value DOUBLE, available BOOLEAN, is_static BOOLEAN, fallback BOOLEAN);
