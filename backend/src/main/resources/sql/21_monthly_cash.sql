-- 21_monthly_cash.sql — end-of-month, minimum intra-month and negative days from daily_cash.
CREATE OR REPLACE TABLE monthly_cash (
  entity_type VARCHAR, entity_id VARCHAR, month VARCHAR,
  cash_eom DOUBLE, cash_min DOUBLE, neg_days INTEGER, investment_eom DOUBLE);

INSERT INTO monthly_cash
SELECT 'COMPANY', company_id, strftime(date, '%Y-%m'),
       arg_max(cash_eur, date), MIN(cash_eur),
       CAST(COUNT(*) FILTER (WHERE cash_eur < 0) AS INTEGER),
       arg_max(investment_eur, date)
FROM daily_cash
GROUP BY 1, 2, 3;
