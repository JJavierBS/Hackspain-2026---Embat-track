# WEIGHTS_JUSTIFICATION — why every weight stays as it is

Status: **closed on 2026-09-19.** The Embat CTO asked the team to stop spending time on weights and
ideal values. This file is the last investigation. It gives the reason for every weight in
`scoring-config.yml` and the test that shows why more tuning has little value.

Scope: every value that **combines** numbers into a score or a product figure. Anchors and alert
thresholds are values that **judge** one number. They are in `THRESHOLDS.md` and `DATA_FINDINGS.md`.

Source rule (decision H18 of `WEIGHTS.md`): no figure is attributed to a source that we did not read.
Status of each value: `sourced` (a source that we read supports it), `principle` (a mathematical or
design fact that holds on any dataset) or `placeholder` (our judgment, no source for the magnitude).

## 1. Decision

Keep every weight value. Change a weight only through config, and only for one of the reasons in §5.

Three facts support the decision:

1. **The ranking does not depend on the exact magnitudes (§2).** If each category weight moves by up to
   ±50 %, the rank correlation with today's ranking stays at 0.98–0.99 (median). The choice of
   profile changes the ranking far more: BANK against FUND gives 0.74.
2. **This is a known result.** A linear score with weights of the correct sign ranks almost as well as
   a score with optimal weights, when the inputs correlate positively (§3).
3. **Optimal weights need labels, and we have none.** The data has no default label (SPEC §7.7).
   Supervised calibration is out of scope (ARCHITECTURE §0). So no "ideal value" can be estimated.
   More tuning would only fit our judgment to this one synthetic dataset.

## 2. Test: how much the exact values move the ranking

Method: `scripts/weights_calc/sensitivity.sql`. It rebuilds `final` from `category_scores` and
`indicator_values` the same way as `S60_Score`. The rebuild error on the 2026-09-19 run is 0.0 for all
three profiles. The script reads the last month of any pipeline run and has no dataset value in it.
Seed 0.42. Unit: GROUP, month 2026-08, 250 groups.

Metrics, each against today's scores:
- **Spearman**: rank correlation. 1.0 = same order.
- **Mean |Δ|**: mean absolute change of `final`, in points.
- **Band change**: share of groups that move to another band (A–E).
- **Bottom-25 overlap**: share of the 25 lowest-scored groups that stay in the 25 lowest.

### 2.1 Category weights and λ

| Scenario | Profile | Spearman min | Spearman median | Mean \|Δ\| median | Band change median | Bottom-25 overlap median |
|---|---|---:|---:|---:|---:|---:|
| Each weight × U(0.5, 1.5), 200 draws | BANK | 0.967 | 0.989 | 1.99 | 11.7 % | 84 % |
| | FUND | 0.933 | 0.990 | 1.90 | 13.3 % | 88 % |
| | INSURER | 0.933 | 0.980 | 1.99 | 13.7 % | 84 % |
| All ten weights equal | BANK | 0.924 | 0.924 | 4.97 | 35.5 % | 76 % |
| | FUND | 0.935 | 0.935 | 5.82 | 36.3 % | 64 % |
| | INSURER | 0.941 | 0.941 | 4.00 | 27.0 % | 84 % |
| λ − 0.1 | BANK | 0.993 | 0.993 | 2.00 | 14.1 % | 92 % |
| | FUND | 0.994 | 0.994 | 1.46 | 9.7 % | 96 % |
| | INSURER | 0.990 | 0.990 | 2.13 | 12.1 % | 88 % |
| λ + 0.1 | BANK | 0.993 | 0.993 | 2.00 | 8.9 % | 84 % |
| | FUND | 0.995 | 0.995 | 1.46 | 12.1 % | 88 % |
| | INSURER | 0.992 | 0.992 | 2.13 | 15.7 % | 92 % |

### 2.2 Indicator weights inside each category

| Scenario | Profile | Spearman min | Spearman median | Mean \|Δ\| median | Band change median | Bottom-25 overlap median |
|---|---|---:|---:|---:|---:|---:|
| Each weight × U(0.5, 1.5), 200 draws | BANK | 0.995 | 0.998 | 0.67 | 3.2 % | 92 % |
| | FUND | 0.998 | 0.999 | 0.45 | 3.6 % | 96 % |
| | INSURER | 0.993 | 0.997 | 0.66 | 4.4 % | 96 % |
| Equal weights in each category | BANK | 0.985 | 0.985 | 2.69 | 16.5 % | 68 % |
| | FUND | 0.995 | 0.995 | 1.52 | 8.9 % | 96 % |
| | INSURER | 0.980 | 0.980 | 2.29 | 12.5 % | 88 % |

### 2.3 Reference: what a different view does

| Pair | Spearman |
|---|---:|
| BANK vs INSURER | 0.934 |
| BANK vs FUND | 0.739 |
| FUND vs INSURER | 0.724 |

### 2.4 What the test shows

- A ±50 % error on every category weight at the same time moves a score by about 2 points. The worst
  of 200 draws still keeps a rank correlation of 0.93.
- **Which categories a profile favours** matters. BANK against FUND gives 0.74. So the profile design
  (WEIGHTS.md §3: the order of the categories, with sources) carries the information. The exact
  magnitudes (placeholders) carry little.
- Indicator weights inside a category matter even less (median 0.997–0.999). The indicators of one
  category measure the same thing, so they move together.
- **Limit of the test:** about 12–14 % of the groups change band under a ±50 % error. The mean change
  is about 2 points, so the groups that change band are the groups near an edge (80, 65, 50, 35).
  The band sets the spread and the premium, so an edge group can change product terms. This is a property of any cut point, not of the weights.
  The UI shows the score with one decimal and the explanation, so a reader sees an edge case.
- **Limit of the data:** the numbers come from one synthetic dataset. The script has no dataset value
  in it. Run it on the hidden test data on Sunday (about 1 minute). If the median Spearman under the
  ±50 % draws falls below 0.90, the magnitudes matter on that data. Then go to §5.

## 3. Literature (cited from general knowledge, not read for this file)

- Wainer, H. (1976). "Estimating coefficients in linear models: It don't make no nevermind."
  Psychological Bulletin, 83(2), 213–217.
- Dawes, R. M. (1979). "The robust beauty of improper linear models in decision making."
  American Psychologist, 34(7), 571–582.
- Einhorn, H. J., and Hogarth, R. M. (1975). "Unit weighting schemes for decision making."
  Organizational Behavior and Human Performance, 13(2), 171–192.

The common finding: when the inputs correlate positively and each weight has the correct sign, equal
or rough weights predict almost as well as weights fitted to the data. They are also more stable on
new data. We use only this qualitative finding. No number in this file comes from these papers.
Our test in §2 checks the same property on our own score instead of trusting it.

## 4. Inventory: every weight in `scoring-config.yml`

| Value | Config key | Status | Justification | Effect of an error |
|---|---|---|---|---|
| Category weights, 10 per profile | `profiles.<P>.weights` | order: sourced. magnitude: placeholder | AHP from 1–9 importance ratings. Order from EBA/GL/2020/06, Atradius underwriting criteria and the Rule of 40. Full table and sources: `WEIGHTS.md` §3. No weight is 0 (H4). All CR < 0.01 (`WEIGHTS.md` §6). | Small. §2.1: ±50 % gives Spearman 0.98–0.99 (median). |
| Indicator weights inside a category | `indicators.<ID>.weight` | order: partly sourced. magnitude: placeholder | AHP pairwise judgments, the same for all profiles (H6). DSCR over line use (EBA Annex 3 item 14). 90 days past due over overdue share (CRR Art. 178). `WEIGHTS.md` §4. | Very small. §2.2: ±50 % gives Spearman 0.997–0.999. |
| MOMENTUM category weight | `profiles.<P>.weights.MOMENTUM` | principle | Positive in all profiles (H5). Highest for FUND, because a growth investor buys the direction. Included in the §2.1 test. | Small (§2.1). |
| λ, the share of the level in `final` | `profiles.<P>.lambda` | principle, magnitude placeholder | A lender and an insurer decide on the present capacity to pay: level first (0.70). A growth investor weighs direction as much as state (0.50). EBA/GL/2020/06 ¶120 and ¶143 support a real weight on the future cash flow but give no number. `WEIGHTS.md` §5. | Small. §2.1: ±0.1 gives Spearman ≥ 0.99. |
| Trajectory mix, slope 0.7 and delta 0.3 | `trajectory.slope-weight`, `trajectory.delta-weight` | principle | For a straight-line path, `slope6` and `delta3 / 3` both equal the slope. So the split has no effect on a steady trend. It acts only at a bend. More weight goes to the 6-month least-squares slope because it uses more points than a 3-month difference, so it has less noise. SPEC §7.2. | Zero on a straight path. At a bend the change is bounded by the difference of the two terms. |
| Trajectory span, 5 points a month = 0 or 100 | `trajectory.slope-to-score-span` | principle | Symmetric map: 50 means flat, and each direction gets the same range (SPEC §7.2). A fall of 5 level points a month for 6 months is a 30-point fall, two bands. | Changes the spread of the trajectory, not its sign or order. |
| Momentum persistence, 2 points a month, cap 10 | `momentum.points-per-month`, `momentum.cap` | principle | The cap bounds the effect on `final` to cap × MOMENTUM weight: 0.6 points (BANK), 1.6 (FUND), 0.4 (INSURER). SPEC §7.3. | At most 1.6 points of `final`, by construction. |
| Missing categories | (rule, no key) | principle | Weights renormalize over the available categories (CLAUDE.md rule 3). A missing value is not a zero. | Not a tunable value. |
| Limit engine: factor 0.25 → 1.5, trend ±20 %, runway cut × 0.5 | `limit-engine.*` | principle, magnitude placeholder | Product rules of SPEC §10.1. The limit rises with the score (monotone). The trajectory can move the limit by 20 % at most, so the level dominates, as in λ. Short runway halves the limit. | Product only. It does not change any score or ranking. |
| Limit engine DSCR floor 1.25 | `limit-engine.dscr-min` | sourced | The usual bank covenant, the same value as the `DEBT_DSCR` anchor (SPEC §6.1). | Product only. |
| Spread by band 150 / 250 / 400 / 650 bps | `limit-engine.spread-bps-by-band` | placeholder | Monotone in the band. No market source. Say so if a juror asks. | Product only. |
| Reference rate 0.035 | `limit-engine.reference-rate` | placeholder | Example value (CLAUDE.md open items). | Product only, plus `LEV_FUNDING_COST` (intra weight 0.1062, so small by §2.2). |
| Premium multiplier by band 0.7 / 1.0 / 1.5 / 2.5 | `insurer.multiplier-by-band` | placeholder | Monotone in the band. B = 1.0 is the base rate. No market source. | Product only. |
| Forecast mean reversion ρ = 0.85 | `forecast.mean-reversion` | fitted | The only weight fitted to the data: the best 1–3 month error in a backtest (`FORECAST.md` table 1). Output only: nothing scores from it. | None on scores. |
| Band cut points 80 / 65 / 50 / 35 | `bands` | principle | Equal 15-point steps (SPEC §8). Cut points, not weights. They explain the band changes in §2.4. | See §2.4. |

## 5. When to change a weight (and only then)

1. **Labels arrive.** With a real default label, fit the weights (SPEC §7.7) and compare against these.
2. **An Embat expert disagrees with an order.** Put the pairwise judgment in `CATEGORY_JUDGMENTS` of
   `scripts/weights_calc/ahp_w_cat_ind.py`, run the generator, and paste its output into the config.
   The generator fails if the matrix becomes inconsistent (CR ≥ 0.10).
3. **The hidden data fails the test.** The median Spearman under the ±50 % draws falls below 0.90.

Do not change a weight to move one entity, one band or one demo number. The pipeline must give an
honest score on any dataset, not a good-looking one on this dataset.

## 6. Reproduce

```bash
# any pipeline run; the script reads its last month
duckdb -readonly data/xray.duckdb < scripts/weights_calc/sensitivity.sql
```

Output: the tables of §2.1, §2.3 and §2.2, in that order. The draws use seed 0.42, so a run on the same
database gives the same numbers.
