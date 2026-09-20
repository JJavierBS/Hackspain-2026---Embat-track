-- 34_ind_leverage.sql — LEV_DEBT_TO_CF, LEV_FACTORING_RELIANCE, LEV_FUNDING_COST (SPEC §6, §6.1). Reads ind30_base.
-- Debt = debt_snapshot.outstanding_eur summed over every debt type: static, in EUR, a positive magnitude,
-- with group rows already built (24_debt_snapshot.sql). Every value that reads it sets is_static (contract item 9).
-- 12m windows annualize over the active months in the window. They need at least annualize_min_months
-- active months, and set fallback when there are fewer than 12 (contract item 6).
CREATE OR REPLACE TABLE ind34_debt AS
SELECT entity_type, entity_id,
       SUM(outstanding_eur) AS debt,
       COALESCE(SUM(outstanding_eur) FILTER (WHERE debt_type IN (${factoring_types})), 0) AS factoring_debt,
       SUM(rated_outstanding_eur) AS rated_debt,
       SUM(rate_x_outstanding_eur) AS rate_x_debt
FROM debt_snapshot
GROUP BY 1, 2;

-- LEV_DEBT_TO_CF: debt / annualized NOCF 12m. No debt gives 0. Debt with NOCF 12m <= 0: value NULL,
-- available TRUE, and S40 maps it to lev-debt-to-cf.non-positive-cf-level (contract item 5).
INSERT INTO indicator_values_raw
SELECT entity_type, entity_id, month, 'LEV_DEBT_TO_CF',
       CASE WHEN ok THEN CASE WHEN debt <= 0 THEN 0
                              WHEN nocf_12m > 0 THEN debt / (nocf_12m * 12.0 / act_12m) END END,
       ok, ok, ok AND act_12m < 12
FROM (
  SELECT b.entity_type, b.entity_id, b.month, b.act_12m, b.nocf_12m, COALESCE(d.debt, 0) AS debt,
         COALESCE(b.is_active AND b.act_12m >= ${annualize_min_months}, FALSE) AS ok
  FROM ind30_base b
  LEFT JOIN ind34_debt d ON d.entity_type = b.entity_type AND d.entity_id = b.entity_id);

-- LEV_FACTORING_RELIANCE: factoring and confirming outstanding / total outstanding. Static, the same in every
-- active month. No debt gives 0 (no reliance, the natural zero of SPEC §6.1). The SPEC component "growth of
-- factoring-classified inflows" is not built: no category marks a factoring advance (FINANCING_IN is empty, Q1).
INSERT INTO indicator_values_raw
SELECT b.entity_type, b.entity_id, b.month, 'LEV_FACTORING_RELIANCE',
       CASE WHEN b.is_active THEN CASE WHEN COALESCE(d.debt, 0) > 0 THEN d.factoring_debt / d.debt ELSE 0 END END,
       b.is_active, b.is_active, FALSE
FROM ind30_base b
LEFT JOIN ind34_debt d ON d.entity_type = b.entity_type AND d.entity_id = b.entity_id;

-- LEV_FUNDING_COST: annualized interest 12m / debt - reference_rate (the spread, SPEC §6.1).
-- Interest = booked interest-category outflows. Groups sum their companies without intragroup rows.
-- No interest in the window, or too few active months: fallback to the schedule rate
-- (rate_x_outstanding / rated_outstanding - reference_rate). No debt: unavailable (nothing to score).
-- reference_rate is a placeholder until a human sets it (docs/DECISIONS.md §5).
INSERT INTO indicator_values_raw
WITH ic AS (SELECT company_id, month, interest, interest_ext FROM monthly_interest),
i AS (
  SELECT 'COMPANY' AS entity_type, company_id AS entity_id, month, interest FROM ic
  UNION ALL
  SELECT 'GROUP', c.group_id, ic.month, SUM(COALESCE(ic.interest_ext, 0))
  FROM ic JOIN stg_companies c ON c.company_id = ic.company_id GROUP BY 1, 2, 3),
w AS (
  SELECT b.entity_type, b.entity_id, b.month, b.is_active, b.act_12m,
         SUM(COALESCE(i.interest, 0)) OVER (PARTITION BY b.entity_type, b.entity_id ORDER BY b.month_idx
                                            ROWS BETWEEN 11 PRECEDING AND CURRENT ROW) AS interest_12m
  FROM ind30_base b
  LEFT JOIN i ON i.entity_type = b.entity_type AND i.entity_id = b.entity_id AND i.month = b.month),
x AS (
  SELECT w.*, d.debt, d.rated_debt, d.rate_x_debt,
         COALESCE(w.act_12m >= ${annualize_min_months} AND w.interest_12m > 0, FALSE) AS from_flows
  FROM w LEFT JOIN ind34_debt d ON d.entity_type = w.entity_type AND d.entity_id = w.entity_id),
v AS (
  SELECT *, CASE
              WHEN NOT COALESCE(debt > 0, FALSE) THEN NULL
              WHEN from_flows THEN interest_12m * 12.0 / act_12m / debt - ${reference_rate}
              WHEN rated_debt > 0 THEN rate_x_debt / rated_debt - ${reference_rate}
            END AS v
  FROM x)
SELECT entity_type, entity_id, month, 'LEV_FUNDING_COST', CASE WHEN ok THEN v END, ok, ok,
       ok AND (NOT from_flows OR act_12m < 12)
FROM (SELECT *, COALESCE(is_active AND v IS NOT NULL, FALSE) AS ok FROM v);

DROP TABLE ind34_debt;
