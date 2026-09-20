# Thresholds — status of the 10 pending anchors (SPEC §6.1)

Provisional anchors are live in `backend/src/main/resources/scoring-config.yml` with `status: pending`.
Quantiles come from `sql/90_threshold_quantiles.sql` after block 3, per `entity_type` of the active unit.
A human (Fran / José Javier) reviews every proposal before `status: closed`.

Quantiles: run of 2026-09-19 on `main` after PRs #4 and #5, unit `GROUP`, available rows of all 24 months.
`n` = number of available group-months. The config does not change until the review (phase 3 decision D6).

| Indicator | Fixed part | Provisional anchors | n | p5 / p25 / p50 / p75 / p95 | Proposal | Status |
|---|---|---|---:|---|---|---|
| `PAY_DPO` | ≤ 60 days → 100 | [[60,100],[90,60],[120,30],[180,0]] | 2,407 | 0 / 4.3 / 17.6 / 31.2 / 70.4 | [[60,100],[75,70],[90,45],[120,15],[150,0]] | pending |
| `CF_NOCF_MARGIN` | < 0 → ≤ 35, 0 → 45 | [[-0.2,0],[-0.0001,35],[0,45],[0.1,75],[0.2,100]] | 3,668 | −1.19 / −0.157 / 0.013 / 0.164 / 0.584 | [[-0.5,0],[-0.15,20],[-0.0001,35],[0,45],[0.15,75],[0.4,100]] | pending |
| `ACT_COLLECTIONS_GROWTH` | 0% → 50, symmetric | [[-0.3,0],[-0.15,25],[0,50],[0.15,75],[0.3,100]] | 3,014 | −0.98 / −0.333 / 0.026 / 0.489 / 5.84 | [[-0.6,0],[-0.3,25],[0,50],[0.3,75],[0.6,100]] | pending |
| `LIQ_MIN_BALANCE` | < 0 → ≤ 25 | [[-1,0],[0,25],[0.5,60],[1,80],[2,100]] | 3,770 | −0.23 / 0.136 / 0.719 / 2.0 / 17.0 | [[-0.5,0],[0,25],[0.25,50],[1,75],[3,100]] | pending |
| `LEV_FACTORING_RELIANCE` | 0% → 100 | [[0,100],[0.2,70],[0.4,45],[0.7,15],[1.0,0]] | 4,280 | 0 / 0 / 0 / 0 / 0.100 | keep provisional | pending |
| `PAY_OVERDUE_PAYABLES` | 0% → 100 | [[0,100],[0.1,75],[0.25,45],[0.5,15],[0.8,0]] | 2,409 | 0 / 0 / 0.018 / 0.133 / 0.740 | keep provisional | pending |
| `DEL_OVERDUE_RECEIVABLES` | 0% → 100 | [[0,100],[0.1,75],[0.25,45],[0.5,15],[0.8,0]] | 2,238 | 0 / 0 / 0.021 / 0.160 / 1.0 | keep provisional | pending |
| `LEV_FUNDING_COST` | spread over `reference-rate` | [[0,100],[0.01,85],[0.025,60],[0.05,30],[0.08,0]] | 1,534 | −0.035 / −0.035 / −0.030 / −0.015 / 0.119 | keep provisional, review after `reference-rate` is set | pending |
| `CF_VOLATILITY` | — | [[0.1,100],[0.3,70],[0.6,40],[1.0,15],[2.0,0]] | 2,992 | 0.082 / 0.198 / 0.365 / 0.674 / 2.0 | keep provisional | pending |
| `CON_CUSTOMER_CHURN` | — | [[0.0,100],[0.1,75],[0.25,45],[0.5,15],[0.8,0]] | 330 | 0 / 0 / 0.143 / 0.294 / 1.0 | keep provisional | pending |

## Why each proposal

- **`PAY_DPO`:** 95 % of group-months are at 70 days or less, so the legal 60 days gives 100 to almost all of them (mean level 97.8 at M23). The fixed part stays. A steeper tail gives a real signal to the rare entity above 60 days.
- **`CF_NOCF_MARGIN`:** with the provisional anchors, p25 (−0.157) scores about 7 and p75 (0.164) scores 100. The proposal keeps the two fixed points and spreads the tails: p25 → about 20, p75 → about 76, p90 (0.36) → about 96.
- **`ACT_COLLECTIONS_GROWTH`:** ±30 % saturates. p25 and p75 are −33 % and +49 %. The proposal keeps 0 → 50 and the symmetry, and doubles the span: p25 → about 22, p75 → about 91.
- **`LIQ_MIN_BALANCE`:** p75 (2.0) is already at the provisional top. The proposal keeps < 0 → ≤ 25 and moves the top to 3: p25 → about 39, p50 → about 66, p75 → about 88.
- **`LEV_FACTORING_RELIANCE`:** p90 is 0.004. Only the top 5 % has a non-zero value. The data cannot support a finer tail, so the provisional anchors stay.
- **`PAY_OVERDUE_PAYABLES`, `DEL_OVERDUE_RECEIVABLES`:** the provisional anchors already spread p75 (about 65) and p90 (about 28 and 12). `DEL_OVERDUE_RECEIVABLES` at 0.20 and 0.35 (the SPEC §8.5 alert levels) scores 55 and 33, which agrees with the alerts. Keep.
- **`LEV_FUNDING_COST`:** p5 to p75 are between −0.035 and −0.015. The measured interest rate is almost zero for most entities, so the spread is about `−reference-rate` and the level is 100. The value moves when a human sets `reference-rate`. Review the anchors after that.
- **`CF_VOLATILITY`:** the provisional anchors give p25 → about 85, p50 → about 63, p75 → about 35. That is a good spread. Keep.
- **`CON_CUSTOMER_CHURN`:** only 330 available group-months (13.6 % at M23, concentration coverage guard D9). Too few rows to move anything. Keep.

`reference-rate` (limit engine and `LEV_FUNDING_COST`) is a placeholder of 0.035. Set the current market rate by hand.

**Update 2026-09-19 (presets).** The default in `scoring-config.yml` stays 0.035. The bank and SME presets
(`docs/PRESETS.md`) propose 0.030: the 12-month Euribor was 3.003 % on the last day of August 2026
(Banco de España, statistics table 1.7, read on 2026-09-19). An expert applies it from the Algorithm page.
The applied value lives in `data/scoring-overrides.yml`, not in the shipped file.

**Anchors proposed by presets (not the shipped defaults).** Sources and limits in `docs/PRESETS.md` §3–4.

| Indicator | Shipped status | Preset | Proposed anchors | Status of the proposal |
|---|---|---|---|---|
| `LEV_DEBT_TO_CF` | closed | Banco | adds 4.0× → 50, 6.0× → 35 (ECB leveraged-transactions guidance) | sourced |
| `ACT_COLLECTIONS_GROWTH` | pending | Fondo | 10 % → 80 (Eurostat high-growth definition, 11.9 % share) | sourced |
| `LIQ_MIN_BALANCE` | pending | Pyme | 0.43 → 35, 0.9 → 50, 2.07 → 65 (JPMorgan Chase Institute quartiles), 4 → 100 (placeholder) | derived |

A preset does not close a pending anchor. Close it here only when the team adopts the proposal as the
shipped default.

## Phase 7 A-8 — AHP weights adopted (2026-09-19) · decisions W1–W3

The decision and its reason are in `DECISIONS.md`. What follows is the evidence: the source, the
measured before and after, and the histogram check.

**Change.** `scoring.profiles.<P>.weights` and `scoring.indicators.<ID>.weight` now come from the AHP
generator (`scripts/weights_calc/ahp_w_cat_ind.py`). All ten categories have a positive weight in all
three profiles (decisions H4, H5). λ does not change (0.70 / 0.50 / 0.70).

**Source.** `docs/WEIGHTS.md` (plan R1): per-profile importance ratings, Saaty judgments from rating
ratios, every CR below 0.01 for categories and at most 0.0334 inside a category. The orderings are
`sourced`. Most magnitudes and all λ are `placeholder`. Embat's experts can change them in config only.

**Measured before / after** (GROUP, M23 = 2026-08, full pipeline run on both configs):

| Profile | mean | sd | p10 … p90 | bands A/B/C/D/E | corr | mean \|Δ\| | band changed |
|---|---|---|---|---|---|---|---|
| BANK before | 63.87 | 15.57 | 43.0 / 51.6 / 64.5 / 78.6 / 83.4 | 47 / 74 / 69 / 53 / 5 | | | |
| BANK after | 61.15 | 15.55 | 41.3 / 48.2 / 61.3 / 73.4 / 82.0 | 37 / 72 / 66 / 63 / 10 | 0.956 | 4.20 | 25.8 % |
| FUND before | 51.39 | 19.83 | 26.2 / 36.8 / 49.2 / 66.9 / 79.1 | 23 / 45 / 55 / 69 / 56 | | | |
| FUND after | 54.66 | 16.43 | 34.5 / 42.5 / 53.8 / 65.5 / 78.3 | 22 / 43 / 82 / 73 / 28 | 0.966 | 5.42 | 32.3 % |
| INSURER before | 68.64 | 13.60 | 51.9 / 62.7 / 70.9 / 77.7 / 83.8 | 48 / 124 / 54 / 15 / 7 | | | |
| INSURER after | 64.83 | 12.36 | 50.6 / 56.9 / 64.2 / 74.0 / 80.8 | 30 / 87 / 108 / 18 / 5 | 0.803 | 7.08 | 44.4 % |

Limit engine at M23 (BANK): DECLINE 5 → 10 (band E has no spread), MAINTAIN 167 → 163, INCREASE 38 → 37.

**Histogram check (`RULES.md` §3).** Histogram of `final` at M23, 10-point bins from 0 to 100:

- BANK `[0, 0, 4, 15, 54, 43, 52, 43, 34, 3]`, IQR 25.2
- FUND `[0, 3, 12, 35, 51, 62, 39, 24, 19, 3]`, IQR 23.1
- INSURER `[0, 0, 2, 7, 14, 66, 69, 60, 28, 2]`, IQR 17.1

No profile clusters in a ~15-point band, so the anchors stay. INSURER is the tightest: check it again
after any change to the `PAY_*` anchors.

## Band S — top tier above A (2026-09-19) · decision W5

**Change.** `scoring.bands` gains `s: 90`: S ≥ 90, A 80–89.9, the rest unchanged. `Band` is now
`S, A, B, C, D, E` (ordinal = best to worst, so band-step alerts count S → A as one step).
The config validator requires `100 ≥ s > a > b > c > d > 0`.

**Why.** Product request: a tier that singles out the best entities. At M23 the cut at 90 holds
3 BANK, 3 FUND and 2 INSURER entities (of 248), so S stays rare; A keeps the rest of the ≥ 80 group.

**Products.** Our assumptions, like the rest of the grid (`docs/WEIGHTS.md` §12), no source:
- `limit-engine.spread-bps-by-band.S: 100` (A is 150).
- `insurer.multiplier-by-band.S: 0.5` (A is 0.7).
- Insurer preset (`presets.yml`): `S: 0.4`, the same as A. Atradius publishes nothing below 0.10 %,
  so S shares A's floor instead of inventing a lower rate. A band missing from these maps means
  DECLINE / not insurable, so every map that lists A must also list S.

**Side effect.** `BandDowngradeRule` counts steps by ordinal: S → B is now 2 steps (CRITICAL), as A → C was.

## Coverage gate and proxy event triggers (2026-09-20) · decisions M8, M11

Two measurement defects found in the CTO review. Both are evidence problems, not weight problems.
The decisions and their reasons are in `DECISIONS.md`. The numbers are here.

### 1. Cold-start saturation — the coverage gate now refuses a month (M8)

`min-trusted-weight-share` was 0.4 and only tagged the confidence. `ProfileScorer` still published a
score. One available category renormalizes to 100 % of the weight, so a single indicator sitting on its
best anchor published a final of 100.

Measured on the run of 2026-09-19, GROUP, BANK, 4,280 scored months:

| confidence | months | mean final | months at exactly 100.0 |
|---|---:|---:|---:|
| HIGH | 1,022 | 59.2 | 0 |
| MEDIUM | 1,447 | 59.4 | 0 |
| LOW | 1,315 | 66.4 | 8 |
| **INSUFFICIENT** | **496** | **92.1** | **341** |

Every one of the 248 entities had an `INSUFFICIENT` first scored month, and 173 of those read 100.0.

`ProfileScorer` now returns no score below the gate. Effect, same unit and profile:

| | before | after |
|---|---:|---:|
| scored months | 4,280 | 3,784 |
| entities whose first score is 100.0 | 173 of 248 | 8 of 248 |
| first scored value, median | 100.0 | 73.8 |
| entities with 10 months or fewer: first to last change | −33.5 points | −6.7 points |
| **M23 scores** | | **unchanged** |
| `SCORE_DROP` alerts reading "(100 → …)" at M23 | 43 | 1 |

M23 holds no `INSUFFICIENT` BANK row, so the leaderboard export does not move. FUND loses 5 rows at
M23 and INSURER 6: those entities lack the evidence those profiles weigh, and the portfolio already
kept them out of the ranking.

### 2. The deterioration proxy event was a state, not an event (M11)

`dscr-below: 1.0` with `dscr-months: 2` held in **29.7 %** of scored group-months. The DSCR
distribution explains it: p25 = −9.76, median 0.36, and **33 % of the months have a negative 3-month
operating cash flow**. With no balance sheet, DSCR is a cash-flow proxy (SPEC §15), so one weak
quarter drives it below zero without any distress.

Prevalence of each trigger, run of 2026-09-20, GROUP, BANK, 3,784 scored months:

| trigger | share of months |
|---|---:|
| runway < 1.5 for 2 months | 12.8 % |
| `dscr < 1.0` for 2 months (was shipped) | **29.7 %** |
| `dscr < 0.0` for 6 months (now shipped) | 5.8 % |
| both overdue levels ≤ 20 | 2.6 % |
| final < 35 | 5.2 % |
| any trigger, old rule | **36.6 %** |
| any trigger, new rule | 20.1 % |

Lowering the threshold alone does not work: `dscr < 0.25` still holds in 34.8 % of months. The mass is
negative. The new rule asks for a sustained burn — operating cash below debt service for six straight
months — which a lender reads as distress.

Measured effect, BANK:

| | old rule | new rule |
|---|---:|---:|
| deterioration events | 139 | 81 |
| base rate | 0.634 | 0.365 |
| signal hit rate | 0.653 | 0.351 |
| **lift over chance** | **1.03** | **0.96** |
| detected at least one month ahead | 39 % | 40 % |
| **limit cut before the event** | 112 of 139, 2.8 months | **70 of 81, 4.5 months** |

The lift fell below 1. That is the point: the old base rate of 0.63 made every lift look like 1, so the
old 1.03 said nothing. With a real event the answer is legible — **the status signal does not beat
chance on deterioration**, the improvement signal does (1.54), and the limit engine anticipates by 4.5
months. The Methodology page now leads with the limit engine and prints all three.

`leadTime` values are evaluation only. They never enter a score, a band, a limit or a premium, so this
change cannot flatter any number the product shows.

### 3. The baseline counted the condition, not the onset

`LeadTimeAnalyzer` asked whether the risk condition was true within the horizon. An entity that stays
under the runway floor for a year made every neighbouring month count as "followed". It now asks
whether the entity *enters* the condition. On its own the fix moved the BANK base rate from 0.619 to
0.622: the real cause was the trigger above. The rule is correct either way, and both hit rate and base
rate use it, so they stay comparable.
