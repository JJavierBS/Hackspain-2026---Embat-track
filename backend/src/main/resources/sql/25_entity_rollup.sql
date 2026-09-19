-- 25_entity_rollup.sql — company → group (SPEC §3.1, ARCHITECTURE §5).
-- Group rows SUM company components with intragroup rows removed. Never average a ratio.
-- Idempotent: deletes the GROUP rows first.

CREATE OR REPLACE TABLE entities (entity_type VARCHAR, entity_id VARCHAR, group_id VARCHAR);
INSERT INTO entities
SELECT 'COMPANY', company_id, group_id FROM stg_companies
UNION ALL
SELECT DISTINCT 'GROUP', group_id, group_id FROM stg_companies;

DELETE FROM monthly_flows WHERE entity_type = 'GROUP';
INSERT INTO monthly_flows (entity_type, entity_id, month, flow_class, is_intragroup, inflow_eur, outflow_eur, n_txn)
SELECT 'GROUP', c.group_id, f.month, f.flow_class, FALSE,
       SUM(f.inflow_eur), SUM(f.outflow_eur), SUM(f.n_txn)
FROM monthly_flows f
JOIN stg_companies c ON c.company_id = f.entity_id
WHERE f.entity_type = 'COMPANY' AND NOT f.is_intragroup
GROUP BY c.group_id, f.month, f.flow_class;

-- Cash: sum the daily balances first, then take eom / min / negative days of the group series.
DELETE FROM monthly_cash WHERE entity_type = 'GROUP';
INSERT INTO monthly_cash (entity_type, entity_id, month, cash_eom, cash_min, neg_days, investment_eom)
WITH g AS (
  SELECT c.group_id, d.date, SUM(d.cash_eur) AS cash_eur, SUM(d.investment_eur) AS investment_eur
  FROM daily_cash d JOIN stg_companies c ON c.company_id = d.company_id
  GROUP BY c.group_id, d.date)
SELECT 'GROUP', group_id, strftime(date, '%Y-%m'),
       arg_max(cash_eur, date), MIN(cash_eur),
       CAST(COUNT(*) FILTER (WHERE cash_eur < 0) AS INTEGER),
       arg_max(investment_eur, date)
FROM g
GROUP BY group_id, strftime(date, '%Y-%m');

DELETE FROM monthly_invoices WHERE entity_type = 'GROUP';
INSERT INTO monthly_invoices (entity_type, entity_id, month, direction, is_intragroup,
  new_eur, n_new, paid_eur, n_paid, paid_days_x_eur, paid_late_days_x_eur,
  open_eur, due_90d_unpaid_eur, overdue_eur, overdue_0_30_eur, overdue_31_60_eur,
  overdue_61_90_eur, overdue_90p_eur)
SELECT 'GROUP', c.group_id, i.month, i.direction, FALSE,
       SUM(i.new_eur), SUM(i.n_new), SUM(i.paid_eur), SUM(i.n_paid),
       SUM(i.paid_days_x_eur), SUM(i.paid_late_days_x_eur),
       SUM(i.open_eur), SUM(i.due_90d_unpaid_eur), SUM(i.overdue_eur),
       SUM(i.overdue_0_30_eur), SUM(i.overdue_31_60_eur),
       SUM(i.overdue_61_90_eur), SUM(i.overdue_90p_eur)
FROM monthly_invoices i
JOIN stg_companies c ON c.company_id = i.entity_id
WHERE i.entity_type = 'COMPANY' AND NOT i.is_intragroup
GROUP BY c.group_id, i.month, i.direction;

DELETE FROM monthly_counterparty WHERE entity_type = 'GROUP';
INSERT INTO monthly_counterparty (entity_type, entity_id, month, counterparty_id, direction, is_intragroup, amount_eur, n_txn)
SELECT 'GROUP', c.group_id, p.month, p.counterparty_id, p.direction, FALSE,
       SUM(p.amount_eur), SUM(p.n_txn)
FROM monthly_counterparty p
JOIN stg_companies c ON c.company_id = p.entity_id
WHERE p.entity_type = 'COMPANY' AND NOT p.is_intragroup
GROUP BY c.group_id, p.month, p.counterparty_id, p.direction;

DELETE FROM debt_snapshot WHERE entity_type = 'GROUP';
INSERT INTO debt_snapshot (entity_type, entity_id, debt_type, n_products,
  granted_eur, outstanding_eur, liquidity_eur, rated_outstanding_eur, rate_x_outstanding_eur)
SELECT 'GROUP', c.group_id, d.debt_type, SUM(d.n_products),
       SUM(d.granted_eur), SUM(d.outstanding_eur), SUM(d.liquidity_eur),
       SUM(d.rated_outstanding_eur), SUM(d.rate_x_outstanding_eur)
FROM debt_snapshot d
JOIN stg_companies c ON c.company_id = d.entity_id
WHERE d.entity_type = 'COMPANY'
GROUP BY c.group_id, d.debt_type;
