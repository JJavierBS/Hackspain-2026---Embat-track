-- Sensitivity of the GROUP ranking to the category weights and to lambda (docs/WEIGHTS.md).
-- Reads the results tables of any pipeline run, at its last month. No input from this dataset is hardcoded.
-- Rebuilds final exactly as S60 does (checked on 2026-09-19: MAE 0.0 against profile_scores).
-- Run: duckdb -readonly data/xray.duckdb < scripts/weights_calc/sensitivity.sql
select setseed(0.42);
create or replace temp table last as select max(month) m from profile_scores;
create or replace temp table base as
select c.entity_id, c.category, c.level, c.traj from category_scores c
where c.entity_type='GROUP' and c.month=(select m from last) and c.level is not null;
create or replace temp table mom as
select entity_id, profile, momentum, final from profile_scores where entity_type='GROUP' and month=(select m from last);
create or replace temp table w0 as select profile, category, weight, "lambda" as lam from profile_weights;
-- Scenarios: 200 draws, each weight x U(0.5, 1.5) on its own. Equal weights. Lambda +/- 0.1.
create or replace temp table draws as select range k from range(1,201);
create or replace temp table ws as
select 'perturb' scen, k, profile, category, weight*(0.5+random()) weight, lam from w0, draws
union all select 'equal', 0, profile, category, 10.0, lam from w0
union all select 'lambda-0.1', 0, profile, category, weight, lam-0.1 from w0
union all select 'lambda+0.1', 0, profile, category, weight, lam+0.1 from w0;
create or replace temp table f as
select ws.scen, ws.k, ws.profile, b.entity_id,
  sum(ws.weight * case when b.traj is null then b.level else ws.lam*b.level+(1-ws.lam)*b.traj end) as num,
  sum(ws.weight) as den
from base b join ws on ws.category=b.category group by all;
create or replace temp table g as
select f.scen, f.k, f.profile, f.entity_id,
  (f.num + coalesce(m.momentum*wm.weight,0)) / (f.den + case when m.momentum is null then 0 else wm.weight end) fin, m.final f0
from f join mom m on m.entity_id=f.entity_id and m.profile=f.profile
join ws wm on wm.scen=f.scen and wm.k=f.k and wm.profile=f.profile and wm.category='MOMENTUM';
create or replace temp table r as
select *, rank() over (partition by scen,k,profile order by fin) r1, rank() over (partition by scen,k,profile order by f0) r0,
 case when fin>=80 then 'A' when fin>=65 then 'B' when fin>=50 then 'C' when fin>=35 then 'D' else 'E' end b1,
 case when f0>=80 then 'A' when f0>=65 then 'B' when f0>=50 then 'C' when f0>=35 then 'D' else 'E' end b0 from g;
create or replace temp table per as
select scen, k, profile, corr(r1,r0) spearman, avg(abs(fin-f0)) mad, avg((b1<>b0)::int) band_change,
  -- bottom-25 overlap: share of the 25 lowest-scored groups that stay in the 25 lowest
  sum(case when r0<=25 and r1<=25 then 1 else 0 end)/25.0 bottom25_overlap
from r group by all;
select scen, profile, count(*) n,
  round(min(spearman),3) spearman_min, round(median(spearman),3) spearman_med,
  round(median(mad),2) mean_abs_delta_med, round(quantile_cont(mad,0.95),2) mean_abs_delta_p95,
  round(100*median(band_change),1) band_change_pct_med, round(100*quantile_cont(band_change,0.95),1) band_change_pct_p95,
  round(100*min(bottom25_overlap),0) bottom25_min, round(100*median(bottom25_overlap),0) bottom25_med
from per group by all order by scen, profile;

-- Reference: how far apart the three profiles rank the same groups.
with rk as (select entity_id, profile, rank() over (partition by profile order by final) r
            from profile_scores where entity_type='GROUP' and month=(select m from last))
select a.profile p1, b.profile p2, round(corr(a.r, b.r), 3) spearman
from rk a join rk b using (entity_id) where a.profile < b.profile group by all order by all;

-- Part 2: indicator weights inside each category. iw is a copy of scoring.indicators.<ID>.weight
-- (config, not data): update it when the config changes. Rebuild checked on 2026-09-19: error 0.0.
create or replace temp table iw(indicator_id varchar, w double);
insert into iw values ('LIQ_RUNWAY',0.4286),('LIQ_BUFFER',0.4286),('LIQ_MIN_BALANCE',0.1429),('CF_NOCF_MARGIN',0.4286),('CF_VOLATILITY',0.1429),('CF_IN_OUT_RATIO',0.4286),('ACT_COLLECTIONS_GROWTH',1),('DEBT_DSCR',0.75),('DEBT_LINE_UTIL',0.25),('LEV_DEBT_TO_CF',0.6333),('LEV_FACTORING_RELIANCE',0.2605),('LEV_FUNDING_COST',0.1062),('PAY_DSO',0.125),('PAY_DPO',0.125),('PAY_SUPPLIER_LATENESS',0.375),('PAY_OVERDUE_PAYABLES',0.375),('DEL_OVERDUE_RECEIVABLES',0.25),('DEL_AGING_90',0.75),('CON_HHI_CUSTOMERS',0.6),('CON_HHI_SUPPLIERS',0.2),('CON_CUSTOMER_CHURN',0.2),('TAX_REGULARITY',1);
create or replace temp table iv as select i.entity_id, i.category, i.indicator_id, i.level_score, i.traj_score, iw.w
from indicator_values i join iw using(indicator_id) where i.entity_type='GROUP' and i.month=(select m from last);
create or replace temp table draws2 as select range k from range(1,201);
create or replace temp table iws as
select 'perturb' scen, k, indicator_id, w*(0.5+random()) w from iw, draws2
union all select 'equal', 0, indicator_id, 1.0 from iw;
create or replace temp table cat2 as
select s.scen, s.k, v.entity_id, v.category,
  sum(s.w*v.level_score) filter (where v.level_score is not null)/sum(s.w) filter (where v.level_score is not null) lv,
  sum(s.w*v.traj_score) filter (where v.traj_score is not null)/sum(s.w) filter (where v.traj_score is not null) tr
from iv v join iws s using(indicator_id) group by all;
create or replace temp table w0b as select profile, category, weight, "lambda" as lam from profile_weights;
create or replace temp table momb as select entity_id, profile, momentum, final from profile_scores where entity_type='GROUP' and month=(select m from last);
create or replace temp table g2 as
select c.scen, c.k, w.profile, c.entity_id,
  (sum(w.weight*case when c.tr is null then c.lv else w.lam*c.lv+(1-w.lam)*c.tr end) + coalesce(max(m.momentum*wm.weight),0))
  / (sum(w.weight) + max(case when m.momentum is null then 0 else wm.weight end)) fin, max(m.final) f0
from cat2 c join w0b w on w.category=c.category
join momb m on m.entity_id=c.entity_id and m.profile=w.profile
join w0b wm on wm.profile=w.profile and wm.category='MOMENTUM'
where c.lv is not null group by all;
create or replace temp table r2 as
select *, rank() over (partition by scen,k,profile order by fin) r1, rank() over (partition by scen,k,profile order by f0) r0,
 case when fin>=80 then 'A' when fin>=65 then 'B' when fin>=50 then 'C' when fin>=35 then 'D' else 'E' end b1,
 case when f0>=80 then 'A' when f0>=65 then 'B' when f0>=50 then 'C' when f0>=35 then 'D' else 'E' end b0 from g2;
create or replace temp table per2 as
select scen, k, profile, corr(r1,r0) spearman, avg(abs(fin-f0)) mad, avg((b1<>b0)::int) band_change,
  sum(case when r0<=25 and r1<=25 then 1 else 0 end)/25.0 bottom25_overlap from r2 group by all;
select scen, profile, count(*) n, round(min(spearman),3) spearman_min, round(median(spearman),3) spearman_med,
  round(median(mad),2) mean_abs_delta_med, round(100*median(band_change),1) band_change_pct_med,
  round(100*min(bottom25_overlap),0) bottom25_min, round(100*median(bottom25_overlap),0) bottom25_med
from per2 group by all order by scen, profile;
