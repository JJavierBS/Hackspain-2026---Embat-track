# Phase 7 — Algorithm integration: AHP weights + causal forecast

Phase 7 integrates `origin/feature/salud-financiera` into `main`. It is **not** a block of
`docs/ARCHITECTURE.md §11`: phase 6 closed that plan. This is an addition decided on
2026-09-19 after reviewing the branch, and it is the **last code that touches the scoring
path before the demo (Sunday 11:00)**.

Three things live on that branch and they get three different answers:

| Piece | Verdict | Where it goes |
|---|---|---|
| **AHP weights** (`scripts/weights_calc/`) | **Keep.** The slot for it already exists in `main` (decision E11). | Config only, plus a rewritten generator script |
| **`health_scoring` index** (`scripts/scoring/health_scoring.py`, `HealthScoring.java`) | **Drop from the product.** `main`'s engine is a strict superset. | Python kept as an offline cross-check; Java deleted |
| **CUSUM forecast** (`cusum_forecast.py`, `CusumForecast.java`) | **Keep the projection, rebuild it causal.** | New pure service + stage + API + UI |

The split is by layer, like phases 5 and 6, plus a **research track (R) that runs in
parallel from minute zero** because its output is the input to A's last step.

| Plan | Branch | Owner | File |
|---|---|---|---|
| R — Research: category rankings, intra-category judgments, MOMENTUM, λ, forecast method | none (docs only) | subagents + José Javier | this file, §"Plan R" |
| A — Backend: AHP generator, config wiring, `ForecastCalculator`, `S85_Forecast`, API | `feat/phase7-backend` | Claude Code | this file, §"Plan A" |
| B — Frontend: projection on the entity chart, horizon control, reliability badge, methodology | `feat/phase7-frontend` | Claude Code or Antigravity | this file, §"Plan B" |

**Hard deadline.** It is Saturday 2026-09-19 14:07. The demo is Sunday 11:00. See
§"Timeline and freeze" — there is a **21:00 config freeze** and a **02:00 code freeze**, and
a cut list. `main` must boot at every commit (CLAUDE.md).

---

## State checked on 2026-09-19 (evidence, not assumptions)

Everything below was measured, not inferred. Re-check before trusting it if hours have passed.

**The branch.** `origin/feature/salud-financiera` = 3 commits on top of `dae65c9` (the AHP
commit, which is already in `main`). It is well behind `main` (phase 5 and 6 landed after it).
Never merge it as-is: rebase or cherry-pick.

- `scripts/weights_calc/ahp.py` — Saaty AHP: column-normalize, row-mean, λ_max, CI, CR.
- `scripts/weights_calc/ahp_w_cat_ind.py` — two-level AHP over 9 categories × 22 indicators, 3 profiles.
- `scripts/weights_calc/weights.json` — the **flattened** output. Do not import this file (see H3).
- `scripts/scoring/health_scoring.py`, `cusum_forecast.py`, tests, `HEALTH_SCORING.md` (308 lines).
- `backend/.../domain/service/HealthScoring.java`, `CusumForecast.java`, `CusumForecastTest.java`.
- 4 committed `__pycache__/*.pyc` files.

**The two Java files compile clean against current `main`** (verified: `./mvnw compile`, exit 0,
class files produced). But nothing references them — they are dead `@Service` beans. They also
sit in `com.xray.domain.service` while importing `org.springframework` and Jackson, which
**violates CLAUDE.md rule 6** (`domain/` is pure).

**The AHP maps 1:1 onto `main`, and that is not luck.** `docs/superpowers/plans/2026-09-19-phase4-overview.md:47`:

> `| E11 | Weights inside a category (Almudena, confirmed 2026-09-19) | scoring.indicators.<ID>.weight (optional, > 0, default 1) |`

| AHP level | Config key in `main` | Consumer |
|---|---|---|
| Level 1: weight of each category, per profile | `scoring.profiles.<P>.weights` (×100) | `ProfileScorer` |
| Level 2: weight inside a category | `scoring.indicators.<ID>.weight` | `CategoryAggregator`, `ExplanationService` |

**Consistency of the current (placeholder) judgments.** Recomputed independently:
categories CR = **0.0616**; every intra-category matrix CR ≤ **0.0334**; all < 0.10. Profile
weights sum to exactly 1.0, so ×100 satisfies `ScoringConfigValidator` (100 ± 0.01).

**Intra-category weights are identical across the three profiles** (`INDICATOR_JUDGMENTS_OVERRIDES`
is empty for all three; verified numerically, e.g. `LIQ_MIN_BALANCE/LIQ_RUNWAY = 0.3333` in all
three). This is exactly what `main`'s single global `weight` key can express. **If research
concludes they must differ per profile, `main` cannot hold that** — see H6.

**Measured impact of swapping today's placeholder weights for the AHP ones** (BANK, 248 GROUP
entities, M23 = 2026-08, recomputed from `indicator_values`; the model reproduces the real
`profile_scores` exactly — mean 63.86, sd 15.58 — so the simulation is trustworthy):

```
             mean     sd     corr   mean |Δ|   max |Δ|   bands changed
current     63.86  15.58
AHP         61.84  18.57  0.9734      3.89     15.97        28.6 %

bands:    A    B    C    D    E
current  47   74   69   53    5
AHP      54   67   44   63   20
```

Correlation 0.97 — the ranking survives. **sd 15.58 → 18.57**: CLAUDE.md asks to widen anchors
if `final` clusters in a ~15-point band; these weights improve the spread instead. Note band E
goes 5 → 20 groups, and `limit-engine.spread-bps-by-band` has no E, so **20 more groups fall to
`DECLINE`** in the limit engine. That is a product change, not a cosmetic one.

**The `health_scoring` question, tested rather than asserted.** `profile_scores.level` is
structurally what `health_scoring.py` computes (weighted mean of category levels, same
renormalization, ×100). So `final` vs `level` *is* `main`'s engine vs the branch's. Tested as a
discriminator of the fundamental proxy events in `lead_time_events` (triggers `DSCR`, `OVERDUE`,
`RUNWAY` — `SCORE` excluded as circular), AUC over entity-months M06..M20 (2025-03 .. 2026-05):

```
                        contemporaneous          forward (event in m+1..m+3)
profile          final(blend)  level(only)     final(blend)  level(only)
BANK                0.7244       0.7250           0.4222       0.4409
FUND                0.5792       0.6056           0.3881       0.3989
INSURER             0.6589       0.6308           0.4298       0.4283
```

**Read this honestly: the data does not pick a winner.** Differences are ≈0.02 AUC, i.e. noise,
and they change sign by profile. The decision (H8) therefore rests on structure, not on this
table. **And note the second finding: forward AUC is below 0.5 on all three profiles** while
contemporaneous AUC is 0.58–0.72. The scores coincide with distress but do not lead it on these
proxy events. That is a real issue for the "anticipación" claim of the demo — see R3. It concerns
phase 6's `lead_time_*` tables, not this integration, and it must not be allowed to derail phase 7.

---

## Decisions taken before writing this plan (2026-09-19, José Javier)

| # | Question | Decision |
|---|---|---|
| H1 | Scope | AHP weights into config; forecast as a causal pipeline stage with API and UI; `health_scoring` index dropped from the product. No new scoring concept beyond these. |
| H2 | Window | **Everything before the demo.** Research is parallelized to subagents and closes with whatever it has at the 21:00 config freeze. |
| H3 | `weights.json` | **Not imported, not read at runtime.** It flattens the two AHP levels into one number per indicator and destroys the structure `main` needs; a second source of truth also breaks CLAUDE.md rule 5. The generator emits YAML fragments for `scoring-config.yml` instead. The file is deleted from the repo. |
| H4 | Zeros | **No category may have weight 0 in any profile.** Today BANK has `ACTIVITY_GROWTH: 0` implicitly (absent), INSURER has no `DEBT_SERVICE`/`TAX_REGULARITY`/`ACTIVITY_GROWTH`, FUND has no `DEBT_SERVICE`/`PAYMENT_BEHAVIOUR`/`DELINQUENCY`/`TAX_REGULARITY`. All ten categories get a positive weight in all three profiles. Setting them is R1's job. |
| H5 | MOMENTUM | **Positive weight in all three profiles**, not only FUND. It becomes the 10th category in the AHP ranking with a trivial intra-category weight of 1 (it has no indicators). This is what makes it rankable by the same method instead of being hand-set. |
| H6 | Intra-category weights per profile | **Keep them profile-independent** (one global `scoring.indicators.<ID>.weight`). `main` cannot express per-profile intra weights without changing `IndicatorConfig`, `CategoryAggregator`, `S60_Score`, `ExplanationService` and `ExplanationSumTest` — out of scope tonight. R1 must respect this constraint, and say so explicitly if it believes the constraint is wrong (that becomes a post-demo item). |
| H7 | λ | **Also a placeholder, also in scope for research** (R1). Today 0.70 / 0.50 / 0.70 for BANK / FUND / INSURER. |
| H8 | `health_scoring` | **`main`'s engine wins.** The empirical test is a wash (see above); `main` wins on structure: it computes level **and** trajectory **and** the λ blend **and** MOMENTUM **and** bands, regime, status, confidence, plus an exactly additive explanation (`S65_Explain`, guarded by the required `ExplanationSumTest`). The branch's index is the level term alone, on a 0–1 scale. |
| H9 | `HealthScoring.java` / `CusumForecast.java` | **Deleted.** They violate rule 6 (Spring and JDBC inside `domain/`), duplicate `AnchorInterpolator`, and `scoreGroupAverage` averages company results into a group, against rule 4 and against `25_entity_rollup.sql` — and against the branch's own documentation, which says to use the precomputed GROUP rows. |
| H10 | `health_scoring.py` | **Kept, clearly relabelled as an offline cross-check tool.** It is a useful independent re-implementation for sanity-checking anchors and weights. Nothing in the product reads it. Its header must say so. |
| H11 | Forecast horizon | **Month by month, for as many months ahead as the user asks**, bounded by `forecast.max-horizon-months` in config. Materialized per `(entity, profile, month, horizon)`. |
| H12 | Forecast causality | The branch's CUSUM baseline is the mean of the first half of **all** deltas, so a value for month `m` depends on months > `m`. **Non-negotiable rule 1 forbids this.** The forecast at month `m` reads `final[0..m]` only, and `LookAheadTest` is extended to cover `forecast_points`. |
| H13 | The branch's CUSUM detector | **Dropped.** `main` already answers "declining / improving, sustained" through `CusumDetector` + `RegimeClassifier` + `TrajectoryCalculator`, causally. A second CUSUM with its own `k`/`h` on a differently scaled series gives two answers to one question that can contradict each other on screen. Whether a causal CUSUM on the score series adds anything is R2's question, not tonight's code. |
| H14 | Forecast reliability | The branch's `< 6 / 6–7 / ≥ 8 months` rule is **kept** — it is an honest touch and it demos well — but the thresholds move to config. The UI must show it. |
| H15 | Forecast parameters | `slope-window`, `damping`, `max-horizon-months`, `min-history-months`, reliability thresholds all live in a new `scoring.forecast` block (rule 5). No argparse defaults survive. |
| H16 | Nothing reads the forecast | `forecast_points` is an **output**. Scoring, products, alerts and the phase-6 analytics never read it, exactly like the `lead_time_*` tables (decision G8). |
| H17 | Research authority | Subagent research produces a **documented proposal**, never a silent config edit. José Javier applies it. **Embat's expert judgment overrides it later through config only** — no code change, which is the whole point of doing it this way. |
| H18 | Research honesty | Every number in the research deliverable carries either a real citation or an explicit `status: placeholder` tag. Inventing a figure and attributing it to a regulator or a rating agency is a failure of the task, not a shortcut. |
| H19 | Branch hygiene | Rebase / cherry-pick onto `main`; delete the 4 committed `.pyc` files and gitignore `__pycache__/`; fix the absolute path `/Users/almudenamartin/Desktop/...` in `HEALTH_SCORING.md`. |
| H20 | Tests | The six required tests of CLAUDE.md stay the only ones, plus the existing `LookAheadTest` extended to `forecast_points` and `ScoringConfigValidationTest` extended to the `forecast` block. `CusumForecastTest` is deleted with its subject. |

---

## Plan R — Research (starts immediately, runs in parallel)

This is the part that turns placeholder numbers into defensible ones. It produces **documents,
not commits to the scoring path**. Three independent missions; R1 is the one that blocks A's
last step.

### R1 — Weights, rankings and λ  *(blocking, deliverable by 20:30)*

**Question.** For each of the three profiles (BANK, FUND, INSURER), what is the defensible
ordering and relative importance of the ten categories, what are the pairwise judgments inside
each category, and what is λ?

**Deliverable: `docs/WEIGHTS.md`**, with, per profile:

1. A ranked list of the **ten** categories (`LIQUIDITY`, `OPERATING_CASH_FLOW`, `ACTIVITY_GROWTH`,
   `DEBT_SERVICE`, `LEVERAGE`, `PAYMENT_BEHAVIOUR`, `DELINQUENCY`, `CONCENTRATION`,
   `TAX_REGULARITY`, `MOMENTUM`), each position carrying **one paragraph of justification with a
   source**.
2. The Saaty pairwise judgments **inside** each multi-indicator category, profile-independent per
   H6, each with its justification.
3. **λ** per profile, with the reasoning: how much the current level should weigh against where
   the entity is heading, for that kind of user.
4. A paste-ready Python block: `CATEGORY_RANKING`, `INDICATOR_JUDGMENTS_DEFAULT`, and either a
   justified `CATEGORY_RANK_TO_SAATY` **or** explicit pairwise matrices (see the caveat below).
5. A one-line status per number: `sourced` (citation) or `placeholder` (H18).

**The caveat that must be addressed head-on.** Today's `CATEGORY_RANK_TO_SAATY = lambda d:
{1:2, 2:3, 3:4}.get(d, 5)` derives every judgment from *rank distance*. The consequence,
verified numerically: the nine category weights are a **fixed decay vector**
`(27.97, 20.80, 15.43, 11.42, 8.33, 5.95, 4.31, 3.22, 2.57)`, **identical in all three profiles**,
merely permuted by the ranking. So today the AHP contributes a documented *ordering*, not
independent *magnitudes*. R1 must either (a) justify a rank-distance function as a deliberate,
defensible simplification, or (b) replace it with genuine pairwise judgments per profile. **(b)
is the better answer if time allows**; it is what makes the AHP more than a sorting exercise.

**Sources to consult** (start here, do not stop here):

- **BANK** — Basel III / CRR credit-risk treatment of SME exposures; **EBA Guidelines on loan
  origination and monitoring (EBA/GL/2020/06)**, which enumerate the metrics for SME lending and
  ongoing monitoring; ICAAP practice; DSCR covenant practice (the 1.25× already cited in
  `scoring-config.yml`); Altman Z''-score for private firms; published SME scorecard
  methodologies from the rating agencies.
- **INSURER** — trade-credit-insurance underwriting criteria (Coface, Atradius, Allianz Trade
  published methodology); Solvency II counterparty-default treatment; receivables-aging and DSO
  practice; **Ley 3/2004** on late payment (already cited for `PAY_DPO`).
- **FUND** — growth and PE due-diligence metrics; Rule of 40; net revenue retention and cohort
  churn; cash-conversion and burn-multiple practice.
- **Cross-cutting, empirical** — the failure-prediction literature (Altman, Ohlson O-score,
  Beaver): which *categories* actually carry predictive weight, which is direct evidence for the
  ranking rather than opinion.

**Method constraints (hard).**
- Saaty 1–9 with reciprocals; diagonal 1.
- **CR < 0.10 for every matrix**, categories and intra-category alike. Report each CR.
- **No zero and no negative weight anywhere** (H4).
- Intra-category judgments identical across profiles (H6) — if you disagree, say so in a
  clearly-marked section rather than breaking the constraint.
- MOMENTUM is ranked among the ten; its intra-category weight is 1 (H5).

**Acceptance.** `docs/WEIGHTS.md` exists; the paste-ready block runs through the rewritten
generator (A-2) producing CR < 0.10 everywhere, no zeros, and three profile blocks summing to
100 ± 0.01; every number tagged `sourced` or `placeholder`.

### R2 — Forecast method  *(deliverable by 20:30, non-blocking)*

**Question.** Is "least-squares slope over the last N months, damped by `d^(h-1)`, clamped to
[0,100]" the right projection for a monthly financial-health score over a 24-month panel, and
what are N, d and the sensible maximum horizon?

**Must cover:**
1. **Causality.** Confirm the design of H12 and specify exactly which months feed a forecast made
   at month `m`. This is the part `LookAheadTest` will enforce.
2. **Alternatives**, with a recommendation and a reason to reject each other: damped linear trend
   (the branch's), Holt / Holt-Winters damped trend (the classical answer, and the damping
   parameter has a literature), a simple AR(1) toward the entity's own median, or plain
   persistence (last value carried forward) as the **baseline any method must beat**.
3. **Parameters.** N (`slope-window`), d (`damping`), `max-horizon-months`. The branch's 6 / 0.8 /
   3 are argparse defaults with no justification. Justify or replace.
4. **Honest horizon.** With 24 months of history and a monthly score, at what horizon does the
   projection stop meaning anything? The answer sets `max-horizon-months` and what the UI is
   allowed to draw.
5. **Whether a causal CUSUM on the score series adds anything** over the existing
   `CusumDetector` + `RegimeClassifier` (H13). If the answer is no, say so plainly — that is a
   useful result.
6. **Backtest, on real data.** Hold out the last K months of `profile_scores`, forecast from
   `M23−K`, measure MAE per horizon against the actual, and **compare against the persistence
   baseline**. A method that does not beat persistence should not ship. `data/xray.duckdb` is
   available; the backend holds a lock on it, so copy the file before querying (`scripts/DuckQuery.java`).

**Deliverable: `docs/FORECAST.md`** with the recommendation, the parameters, the backtest table,
and the `scoring.forecast` YAML block ready to paste.

### R3 — Why forward AUC is below 0.5  *(deliverable by 21:00, informational, must not block)*

The finding in §"State checked" is unexplained and it undercuts the demo's anticipation claim if
someone in the audience probes it. Investigate and write up **one page** in
`docs/DATA_FINDINGS.md` under a new heading:

- Are `lead_time_events` recurring rather than first-onset per entity, so that chronically
  distressed entities label their own low-score months as "clean" in the forward window?
- Does the `min-history-months` censoring rule (G3) remove exactly the entities the score would
  have caught?
- Is the horizon (1–3 months) mismatched with the signal definition (G5, window 12)?
- Recompute with first-onset-only labels and with a 1–6 month horizon and report both.

**Explicitly: do not change any phase-6 code tonight.** The deliverable is a written finding and,
if the claim turns out to be weaker than the Methodology page says, a **proposed wording change**
for that page, for José Javier to accept or reject. Honesty about a limitation beats a number
that does not survive a question.

---

## Plan A — Backend

Branch `feat/phase7-backend` off `main`. Commits are small and each one leaves the app booting.

### A-1 — Hygiene  *(15 min)*
- Cherry-pick nothing yet. Delete from the working tree anything coming from the branch that H9
  kills. Add `__pycache__/` and `*.pyc` to `.gitignore`.
- Commit: `chore(scripts): ignore python bytecode`.

### A-2 — Rewrite the AHP generator  *(1 h)*
`scripts/weights_calc/ahp_w_cat_ind.py`, taking `ahp.py` from the branch as-is (it is correct):

- **Rename to `main`'s canonical identifiers.** `CASH_FLOW` → `OPERATING_CASH_FLOW`;
  `ACT_GROWTH` → `ACT_COLLECTIONS_GROWTH`; `PAY_LATENESS` → `PAY_SUPPLIER_LATENESS`;
  `PAY_OVERDUE` → `PAY_OVERDUE_PAYABLES`. **Delete the `INDICATOR_ALIASES` map**, do not port it:
  a runtime alias table is a second naming authority and it will rot.
- **Add `MOMENTUM`** as a tenth category with an empty indicator list and intra weight 1 (H5).
- **Emit two YAML fragments to stdout**, not `weights.json` (H3):
  - `scoring.profiles.<P>.weights` — category weight ×100, 2 decimals.
  - the `weight:` values for `scoring.indicators.<ID>`.
- **Assert, and fail loudly:** every CR < 0.10; no weight ≤ 0 (H4); intra weights identical across
  profiles (H6); each profile's weights sum to 100 ± 0.01 after rounding — absorb the rounding
  residual into the **largest** category so `ScoringConfigValidator` passes.
- Delete `scripts/weights_calc/weights.json`.
- Commit: `feat(scripts): emit ahp weights as scoring-config fragments`.

### A-3 — `ForecastCalculator` (pure domain)  *(1 h)*
`backend/src/main/java/com/xray/domain/service/ForecastCalculator.java`. **No Spring, no
`java.sql`, no Jackson** (rule 6). Mirror the shape of `CusumDetector` / `RegimeClassifier`:

```java
public record Params(int slopeWindow, double damping, int maxHorizonMonths,
                     int minHistoryMonths, int mediumHistoryMonths) {}
public record Point(int horizon, double value) {}
public record Reliability(String level, boolean reliable) {}   // LOW | MEDIUM | HIGH
public record Result(Point[][] byMonth, Reliability[] reliability, Double[] slope) {}
public static Result forecast(Double[] finalSeries, Params p) { ... }
```

- For each month `m`, use `finalSeries[0..m]` **only** (H12). Fewer than
  `minHistoryMonths` scored points → no forecast for that month, reliability `LOW`.
- Least-squares slope over the last `slopeWindow` non-null values; project
  `v[h] = clamp(v[h-1] + slope · damping^(h-1), 0, 100)`.
- Reliability thresholds from config (H14). Scale is **0–100**, `main`'s scale, not the
  branch's 0–1.
- Whatever R2 recommends replaces the projection body; the signature and the causality contract
  do not change. If R2 is late, ship the damped linear trend and record it as provisional.
- Commit: `feat(domain): project the health score with a damped causal trend`.

### A-4 — Config block  *(20 min)*
New block at the end of `scoring-config.yml`, bound in `ScoringConfig` as
`ForecastConfig(int slopeWindow, double damping, int maxHorizonMonths, int minHistoryMonths, int mediumHistoryMonths)`
with a `toParams()`, plus checks in `ScoringConfigValidator.validatePhase7` (all positive,
`0 < damping ≤ 1`, `minHistoryMonths < mediumHistoryMonths`). Extend
`ScoringConfigValidationTest`.
- Commit: `feat(config): add the forecast block`.

### A-5 — `S85_Forecast`  *(1 h)*
`@Order(85)`, between `S80_Alerts` and `S90_Analytics`. Reads the panels' profile scores, writes
`forecast_points` with `ResultWriter.replace` (dropped and recreated per run):

```
entity_type VARCHAR, entity_id VARCHAR, month VARCHAR, profile VARCHAR,
horizon INTEGER, value DOUBLE, slope DOUBLE, reliability VARCHAR
```

One row per `(entity, profile, month, horizon)` up to `max-horizon-months`. Nothing downstream
reads it (H16) — state that in the class javadoc.
- Commit: `feat(pipeline): add the forecast stage`.

### A-6 — Extend `LookAheadTest`  *(30 min)*  **— the test that makes this defensible**
Add `forecast_points` to the tables compared between the full run and the run cut at M12. Every
row with `month ≤ M12` must be byte-identical. **If this fails, the forecast is wrong, not the
test.**
- Commit: `test: prove the forecast does not read the future`.

### A-7 — API  *(45 min)*
Extend `TimelineDto` with `List<ForecastPointDto> forecast` and add an optional `horizon` query
parameter to `GET /api/entities/{id}/timeline` (default `max-horizon-months`, clamped). One
fetch for the UI, a plain read of `forecast_points` — no recomputation (rule 8). Also surface
`reliability` on `EntityDetailDto`.
- Commit: `feat(api): serve the score forecast on the entity timeline`.

### A-8 — Apply R1  *(30 min, after the 21:00 freeze input)*  **— config only, zero Java**
Run A-2's generator with R1's rankings and judgments, paste both fragments into
`scoring-config.yml`, rerun the pipeline, and **check the M23 histogram of `final`** (CLAUDE.md:
if it clusters in a ~15-point band, widen anchors — do **not** touch weights). Record the change,
its source and the measured before/after in `docs/THRESHOLDS.md`.
- Commit: `feat(config): adopt the researched ahp weights`.

### A-9 — Relabel the Python cross-check  *(10 min)*
Move `scripts/scoring/health_scoring.py` and `cusum_forecast.py` under a clear header stating
they are **offline cross-check tools that nothing in the product reads** (H10), point them at
`scoring.indicators.<ID>.weight` + `scoring.profiles` instead of the deleted `weights.json`, and
fix the absolute path in `HEALTH_SCORING.md` (H19).
- Commit: `docs(scripts): mark the python scoring as an offline cross-check`.

---

## Plan B — Frontend

Branch `feat/phase7-frontend` off `main`. Works on a mocked `forecast` array until A-7 lands.

### B-1 — Types and query  *(20 min)*
Add `ForecastPoint` to `frontend/src/api/types.ts` and the `horizon` param to the timeline query
in `queries.ts`. `horizon` lives in the **URL search params** alongside `profile` and `month`,
so the view stays linkable (CLAUDE.md conventions).

### B-2 — Projection on the trend chart  *(1 h 30)*
`frontend/src/components/TrendChart.tsx`, used at `EntityPage.tsx:166`:
- Append the forecast months after the last real month and render them as a **dashed** line in
  the same series colour, visually separated by a reference line at the last real month.
- The projected segment must be unmistakably different from the historical one. A viewer should
  never confuse a projection with a measurement.
- Load the `dataviz` skill before writing the chart code.

### B-3 — Horizon control and reliability badge  *(45 min)*
- A small control on the entity page: how many months ahead to project, 1..`maxHorizon` (H11),
  written to the URL.
- A badge next to it showing `reliability` with the honest wording, in Spanish (UI copy may be
  Spanish): `LOW` → "menos de 6 meses de histórico: previsión poco fiable"; `MEDIUM` → "fiabilidad
  limitada"; `HIGH` → "histórico suficiente". **Never hide a LOW forecast — label it.**

### B-4 — Methodology  *(30 min)*
A short section on `MethodologyPage.tsx`: the projection method, its parameters read from
`/api/meta` or the methodology endpoint (never hardcoded in the frontend), the reliability rule,
and one sentence saying the projection is an orientation signal, not a measurement.

### B-5 — Static fallback  *(15 min)*
Re-run `scripts/snapshot-fallback.mjs` so the committed `frontend/public/fallback/*.json` carry
the new timeline shape (phase 6 decision G12), or the offline demo breaks.

---

## Timeline and freeze

It is **Saturday 14:07**. Demo **Sunday 11:00**.

| Time | What |
|---|---|
| 14:15 | R1, R2, R3 launched in parallel. A-1 starts. |
| 14:30 – 17:30 | A-2 … A-5 (generator, calculator, config, stage). B-1 … B-3 on mocks. |
| 17:30 – 19:00 | A-6 (`LookAheadTest`) and A-7 (API). B integrates against the real backend. |
| 19:00 – 20:30 | R deliverables land. B-4, B-5. Full pipeline run, smoke test. |
| **20:30 – 21:00** | José Javier reads `docs/WEIGHTS.md` and `docs/FORECAST.md` and **decides**. |
| **21:00 — CONFIG FREEZE** | A-8 applied, pipeline rerun, histogram checked, `THRESHOLDS.md` written. **After this, no weight, λ or anchor changes.** |
| 21:00 – 23:00 | Merge both branches to `main`. `./mvnw test` (six tests). Deploy. Rehearse. |
| **02:00 — CODE FREEZE** | Freeze `xray.duckdb`, final deploy, verify the public URL. |
| Sunday 09:00 | Hidden test: same CSV format (`data/raw/*.csv`), `XRAY_DATA_DIR`, export, submit once. |

## Cut list (only a human triggers it — CLAUDE.md)

In this order, if time runs out:

1. **B-4** (methodology section) — the forecast still works and shows.
2. **R2's replacement method** — ship the damped linear trend, tag it provisional in `THRESHOLDS.md`.
3. **B-3's horizon control** — fix the horizon at 3 months, drop the picker, keep the badge.
4. **A-8** — keep today's placeholder weights and ship `docs/WEIGHTS.md` as the documented
   proposal. *This is the safest cut: the research still exists and still demos as rigour, and
   the scoring never moves on demo day.*

**Never cut A-6.** The look-ahead test is what makes the forecast defensible; a forecast that
reads the future is worse than no forecast.

## Acceptance

- `./mvnw test` runs the **six** required tests plus the extended `LookAheadTest`, all green.
- The pipeline runs 15 stages; `forecast_points` exists for the three profiles and every month
  with enough history.
- `GET /api/entities/{id}/timeline?profile&horizon` returns the history and the projection in
  one response, in under 1 s.
- The entity page draws the projection as a visually distinct dashed segment, with a reliability
  label that is never hidden.
- `docs/WEIGHTS.md` exists, every number tagged `sourced` or `placeholder`, every CR reported
  and below 0.10, no zero weight in any profile, all ten categories present in all three.
- `docs/FORECAST.md` exists with a backtest against the persistence baseline.
- If A-8 was applied: `docs/THRESHOLDS.md` records the new weights, their source, and the
  measured before/after on the M23 distribution.
- `grep -r "org.springframework" backend/src/main/java/com/xray/domain/` returns nothing.
- `main` boots at every commit; the deployed URL works.
