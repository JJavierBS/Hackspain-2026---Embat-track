-- 30_ind_liquidity.sql — ind30_base (shared by sql/30-34 and 38) + LIQ_RUNWAY, LIQ_BUFFER, LIQ_MIN_BALANCE (SPEC §6).
-- ind30_base: one row per entity_months row, monthly net components per flow class and rolling window sums.
-- Nets per class, so small reversed rows (collection_refund inflows, ...) net out. COMPANY rows include
-- intragroup flows (standalone view), GROUP rows have them removed already (25_entity_rollup.sql).
-- Months before is_active have no flows, so the window sums cover active months only. act_Nm counts them.
-- data_3m counts the months of the 3m window with a booked transaction (has_data, sql/28).
CREATE OR REPLACE TABLE ind30_base AS
WITH f AS (
  SELECT entity_type, entity_id, month,
         SUM(CASE WHEN flow_class = 'OPERATING_IN'  THEN inflow_eur - outflow_eur ELSE 0 END) AS op_in,
         SUM(CASE WHEN flow_class = 'OPERATING_OUT' THEN outflow_eur - inflow_eur ELSE 0 END) AS op_out,
         SUM(CASE WHEN flow_class = 'TAX'           THEN outflow_eur - inflow_eur ELSE 0 END) AS tax,
         SUM(CASE WHEN flow_class = 'DEBT_SERVICE'  THEN outflow_eur - inflow_eur ELSE 0 END) AS debt_service,
         SUM(CASE WHEN flow_class = 'TAX'           THEN outflow_eur ELSE 0 END)               AS tax_paid
  FROM monthly_flows
  GROUP BY 1, 2, 3),
g AS (
  SELECT em.entity_type, em.entity_id, em.month, em.month_idx, em.is_active, em.has_data,
         COALESCE(f.op_in, 0) AS op_in, COALESCE(f.op_out, 0) AS op_out, COALESCE(f.tax, 0) AS tax,
         COALESCE(f.debt_service, 0) AS debt_service, COALESCE(f.tax_paid, 0) AS tax_paid,
         c.cash_eom, c.cash_min
  FROM entity_months em
  LEFT JOIN f ON f.entity_type = em.entity_type AND f.entity_id = em.entity_id AND f.month = em.month
  LEFT JOIN monthly_cash c ON c.entity_type = em.entity_type AND c.entity_id = em.entity_id AND c.month = em.month)
SELECT *,
       op_in - op_out - tax                                   AS nocf,
       SUM(is_active::INTEGER) OVER w3                        AS act_3m,
       SUM(has_data::INTEGER) OVER w3                         AS data_3m,
       SUM(is_active::INTEGER) OVER w6                        AS act_6m,
       SUM(is_active::INTEGER) OVER w12                       AS act_12m,
       SUM(op_in) OVER w3                                     AS op_in_3m,
       SUM(op_out) OVER w3                                    AS op_out_3m,
       SUM(tax) OVER w3                                       AS tax_3m,
       SUM(debt_service) OVER w3                              AS ds_3m,
       SUM(op_in - op_out - tax) OVER w3                      AS nocf_3m,
       SUM(op_in) OVER w6                                     AS op_in_6m,
       STDDEV_SAMP(op_in - op_out - tax) OVER w6              AS nocf_std_6m,
       SUM(op_in - op_out - tax) OVER w12                     AS nocf_12m
FROM g
WINDOW w3  AS (PARTITION BY entity_type, entity_id ORDER BY month_idx ROWS BETWEEN 2 PRECEDING AND CURRENT ROW),
       w6  AS (PARTITION BY entity_type, entity_id ORDER BY month_idx ROWS BETWEEN 5 PRECEDING AND CURRENT ROW),
       w12 AS (PARTITION BY entity_type, entity_id ORDER BY month_idx ROWS BETWEEN 11 PRECEDING AND CURRENT ROW);

-- LIQ_RUNWAY: cash_eom / monthly burn, burn = (OPERATING_OUT + TAX + DEBT_SERVICE - OPERATING_IN) over 3m / 3
-- (decision D1). Burn <= 0 gives the cap (SPEC §6) only when cash is positive. An overdrawn entity has no
-- runway whatever its burn: negative or zero cash gives the worst anchor x. No cash row means unavailable.
INSERT INTO indicator_values_raw
SELECT entity_type, entity_id, month, 'LIQ_RUNWAY', CASE WHEN ok THEN v END, ok, FALSE, FALSE
FROM (
  SELECT *, COALESCE(is_active AND act_3m = 3 AND v IS NOT NULL, FALSE) AS ok
  FROM (
    SELECT *, CASE
                WHEN cash_eom IS NULL THEN NULL
                WHEN cash_eom <= 0 THEN ${worst_x_LIQ_RUNWAY}
                WHEN op_out_3m + tax_3m + ds_3m - op_in_3m <= 0 THEN ${runway_cap_months}
                ELSE LEAST(cash_eom / ((op_out_3m + tax_3m + ds_3m - op_in_3m) / 3.0), ${runway_cap_months})
              END AS v
    FROM ind30_base));

-- LIQ_BUFFER: cash_eom / (RECEIVED invoices due in 90 days and unpaid + DEBT_SERVICE 3m).
-- Payables are known from the first month with a RECEIVED invoice row. Before it, or with no RECEIVED rows,
-- payables are unknown, not zero (rule 3), and the month is unavailable. The check reads only months <= m (rule 1).
-- Zero denominator (D3): positive cash gives the best anchor x, otherwise unavailable.
INSERT INTO indicator_values_raw
WITH inv_entities AS (
  SELECT entity_type, entity_id, MIN(month) AS first_month
  FROM monthly_invoices WHERE direction = 'RECEIVED' GROUP BY 1, 2),
due AS (
  SELECT entity_type, entity_id, month, SUM(due_90d_unpaid_eur) AS due_90d
  FROM monthly_invoices WHERE direction = 'RECEIVED' GROUP BY 1, 2, 3)
SELECT entity_type, entity_id, month, 'LIQ_BUFFER', CASE WHEN ok THEN v END, ok, FALSE, FALSE
FROM (
  SELECT *, COALESCE(is_active AND act_3m = 3 AND v IS NOT NULL, FALSE) AS ok
  FROM (
    SELECT b.entity_type, b.entity_id, b.month, b.is_active, b.act_3m,
           CASE
             WHEN b.cash_eom IS NULL OR ie.entity_id IS NULL THEN NULL
             WHEN COALESCE(d.due_90d, 0) + GREATEST(b.ds_3m, 0) > 0
               THEN b.cash_eom / (COALESCE(d.due_90d, 0) + GREATEST(b.ds_3m, 0))
             WHEN b.cash_eom > 0 THEN ${best_x_LIQ_BUFFER}
           END AS v
    FROM ind30_base b
    LEFT JOIN inv_entities ie ON ie.entity_type = b.entity_type AND ie.entity_id = b.entity_id
                             AND ie.first_month <= b.month
    LEFT JOIN due d ON d.entity_type = b.entity_type AND d.entity_id = b.entity_id AND d.month = b.month));

-- LIQ_MIN_BALANCE: lowest daily cash in the month / average monthly OPERATING_OUT over 3m.
-- Negative values are allowed (an overdraft). Zero denominator (D3): positive cash_min gives the best anchor x.
INSERT INTO indicator_values_raw
SELECT entity_type, entity_id, month, 'LIQ_MIN_BALANCE', CASE WHEN ok THEN v END, ok, FALSE, FALSE
FROM (
  SELECT *, COALESCE(is_active AND act_3m = 3 AND v IS NOT NULL, FALSE) AS ok
  FROM (
    SELECT *, CASE
                WHEN cash_min IS NULL THEN NULL
                WHEN op_out_3m > 0 THEN cash_min / (op_out_3m / 3.0)
                WHEN cash_min > 0 THEN ${best_x_LIQ_MIN_BALANCE}
              END AS v
    FROM ind30_base));
