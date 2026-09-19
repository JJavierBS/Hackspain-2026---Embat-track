-- M1 checks for block 2. Run on a COPY of data/xray.duckdb:
--   cp data/xray.duckdb /tmp/v.duckdb && duckdb /tmp/v.duckdb < scripts/validate_block2.sql
.mode markdown

.print '## V1 reconstructed balance at T equals balances.csv (expect n_mismatch = 0)'
SELECT COUNT(*) AS n_products,
       SUM(CASE WHEN ABS(d.balance_native - b.balance) > 0.01 THEN 1 ELSE 0 END) AS n_mismatch
FROM stg_balances b
JOIN daily_product_balance d ON d.product_id = b.product_id AND d.date = b.snapshot_date;

.print '## V2 products with a snapshot but no reconstruction (expect only non-cash types)'
SELECT p.type, COUNT(*) AS n FROM stg_balances b JOIN stg_banking_products p USING (product_id)
WHERE b.product_id NOT IN (SELECT DISTINCT product_id FROM daily_product_balance)
GROUP BY 1 ORDER BY 2 DESC;

.print '## V3 row counts'
SELECT 'daily_cash' AS t, COUNT(*) AS n FROM daily_cash
UNION ALL SELECT 'monthly_flows', COUNT(*) FROM monthly_flows
UNION ALL SELECT 'monthly_cash', COUNT(*) FROM monthly_cash
UNION ALL SELECT 'monthly_invoices', COUNT(*) FROM monthly_invoices
UNION ALL SELECT 'monthly_counterparty', COUNT(*) FROM monthly_counterparty
UNION ALL SELECT 'debt_snapshot', COUNT(*) FROM debt_snapshot;

.print '## V4 spot check: 3 companies, monthly cash and net operating flow'
WITH pick AS (SELECT company_id FROM stg_companies ORDER BY hash(company_id) LIMIT 3)
SELECT c.entity_id, c.month, ROUND(c.cash_eom) AS cash_eom, ROUND(c.cash_min) AS cash_min, c.neg_days,
       ROUND(SUM(f.inflow_eur - f.outflow_eur) FILTER (WHERE f.flow_class IN ('OPERATING_IN','OPERATING_OUT','TAX'))) AS nocf
FROM monthly_cash c
LEFT JOIN monthly_flows f ON f.entity_type = c.entity_type AND f.entity_id = c.entity_id AND f.month = c.month
WHERE c.entity_type = 'COMPANY' AND c.entity_id IN (SELECT company_id FROM pick)
GROUP BY ALL ORDER BY 1, 2;
