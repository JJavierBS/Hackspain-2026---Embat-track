-- 11_intragroup.sql — tag intragroup rows (SPEC §5.4). Rule: scoring.data-rules.intragroup-rule.
-- Company rows keep them (tagged). 25_entity_rollup.sql drops them at group level.

-- Rule COUNTERPARTY_IS_COMPANY: the counterparty is a company of the same group.
UPDATE stg_transactions t SET is_intragroup = TRUE
FROM stg_companies a, stg_companies b
WHERE '${intragroup_rule}' = 'COUNTERPARTY_IS_COMPANY'
  AND a.company_id = t.company_id AND b.company_id = t.counterparty_id AND a.group_id = b.group_id;

-- Rule MIRROR_MATCH: an outflow in one company and the opposite inflow in another company of
-- the same group, within intragroup-max-lag-days. Both sides are tagged.
CREATE OR REPLACE TABLE mirror_pairs AS
SELECT a.transaction_id AS tx_out, b.transaction_id AS tx_in
FROM stg_transactions a
JOIN stg_companies ca ON ca.company_id = a.company_id
JOIN stg_companies cb ON cb.group_id = ca.group_id AND cb.company_id <> ca.company_id
JOIN stg_transactions b ON b.company_id = cb.company_id
 AND b.amount_eur = -a.amount_eur
 AND ABS(date_diff('day', a.date, b.date)) <= ${intragroup_max_lag_days}
WHERE '${intragroup_rule}' = 'MIRROR_MATCH'
  AND a.amount_eur < 0 AND a.is_booked AND b.is_booked;

UPDATE stg_transactions SET is_intragroup = TRUE
WHERE transaction_id IN (SELECT tx_out FROM mirror_pairs UNION SELECT tx_in FROM mirror_pairs);

-- Counterparties seen on intragroup transactions are intragroup for invoices too.
CREATE OR REPLACE TABLE intragroup_counterparties AS
SELECT DISTINCT company_id, counterparty_id FROM stg_transactions
WHERE is_intragroup AND counterparty_id IS NOT NULL;

UPDATE stg_invoices i SET is_intragroup = TRUE
FROM intragroup_counterparties g
WHERE g.company_id = i.company_id AND g.counterparty_id = i.counterparty_id;

DROP TABLE mirror_pairs;

-- Own-account transfers (SPEC §4.5 fallback, DATA_FINDINGS Q5d): an outflow and the opposite inflow on
-- two products of the same company, within own-account-max-lag-days. Both sides become INTERNAL.
CREATE OR REPLACE TABLE own_account_pairs AS
SELECT a.transaction_id AS tx_out, b.transaction_id AS tx_in
FROM stg_transactions a
JOIN stg_transactions b
  ON b.company_id = a.company_id AND b.product_id <> a.product_id
 AND b.amount = -a.amount
 AND ABS(date_diff('day', a.date, b.date)) <= ${own_account_max_lag_days}
WHERE a.amount < 0 AND a.is_booked AND b.is_booked;

UPDATE stg_transactions SET flow_class = 'INTERNAL'
WHERE transaction_id IN (SELECT tx_out FROM own_account_pairs UNION SELECT tx_in FROM own_account_pairs);

DROP TABLE own_account_pairs;
