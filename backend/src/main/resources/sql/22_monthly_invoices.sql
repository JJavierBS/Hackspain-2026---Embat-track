-- 22_monthly_invoices.sql — summable invoice components per company, month, direction.
-- Overdue at end of month uses payment_date, never pending_amount (SPEC §5.6). stg_invoices keeps
-- payment_date only for paid invoices (DATA_FINDINGS Q10). A prepayment (payment_date before
-- issuance_date) counts as paid on the issuance date, so it is not lost and its days-to-pay is 0.
CREATE OR REPLACE TABLE monthly_invoices (
  entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, direction VARCHAR, is_intragroup BOOLEAN,
  new_eur DOUBLE, n_new BIGINT,
  paid_eur DOUBLE, n_paid BIGINT, paid_days_x_eur DOUBLE, paid_late_days_x_eur DOUBLE,
  open_eur DOUBLE, due_90d_unpaid_eur DOUBLE,
  overdue_eur DOUBLE, overdue_0_30_eur DOUBLE, overdue_31_60_eur DOUBLE,
  overdue_61_90_eur DOUBLE, overdue_90p_eur DOUBLE);

INSERT INTO monthly_invoices
WITH inv AS (
  SELECT company_id, direction, is_intragroup, amount_eur, issuance_date, due_date,
         GREATEST(payment_date, issuance_date) AS pay_date
  FROM stg_invoices),
x AS (
  SELECT i.company_id, i.direction, i.is_intragroup, i.amount_eur,
         i.issuance_date, i.due_date, i.pay_date, m.month, m.month_start, m.month_end,
         i.issuance_date >= m.month_start AS is_new,
         i.pay_date BETWEEN m.month_start AND m.month_end AS is_paid,
         (i.pay_date IS NULL OR i.pay_date > m.month_end) AS is_open,
         date_diff('day', i.due_date, m.month_end) AS days_overdue
  FROM inv i
  JOIN months m
    ON i.issuance_date <= m.month_end
   AND (i.pay_date IS NULL OR i.pay_date >= m.month_start))
SELECT 'COMPANY', company_id, month, direction, is_intragroup,
       COALESCE(SUM(amount_eur) FILTER (WHERE is_new), 0),
       COUNT(*) FILTER (WHERE is_new),
       COALESCE(SUM(amount_eur) FILTER (WHERE is_paid), 0),
       COUNT(*) FILTER (WHERE is_paid),
       COALESCE(SUM(amount_eur * date_diff('day', issuance_date, pay_date)) FILTER (WHERE is_paid), 0),
       COALESCE(SUM(amount_eur * GREATEST(0, date_diff('day', due_date, pay_date))) FILTER (WHERE is_paid), 0),
       COALESCE(SUM(amount_eur) FILTER (WHERE is_open), 0),
       COALESCE(SUM(amount_eur) FILTER (WHERE is_open AND due_date <= month_end + INTERVAL 90 DAY), 0),
       COALESCE(SUM(amount_eur) FILTER (WHERE is_open AND days_overdue > 0), 0),
       COALESCE(SUM(amount_eur) FILTER (WHERE is_open AND days_overdue BETWEEN 1 AND 30), 0),
       COALESCE(SUM(amount_eur) FILTER (WHERE is_open AND days_overdue BETWEEN 31 AND 60), 0),
       COALESCE(SUM(amount_eur) FILTER (WHERE is_open AND days_overdue BETWEEN 61 AND 90), 0),
       COALESCE(SUM(amount_eur) FILTER (WHERE is_open AND days_overdue > 90), 0)
FROM x
GROUP BY 1, 2, 3, 4, 5;
