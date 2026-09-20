# DECISIONS — the register

Every decision that closes an open question or supersedes an earlier text lives here, once.
Each row gives the reason and the file that holds the evidence. The evidence files keep the numbers,
the quantiles, the backtests and the sources. They no longer repeat the decision.

**Rule of the register.** A decision goes here. A measurement stays in its topic file.
When a document and this register disagree, this register wins, and the document gets fixed.

Dates are the day the team closed the item. All of them fall in the build weekend, 18–20 September 2026.

---

## 1. Method: how the score is built

| # | Decision | Why | Evidence |
|---|---|---|---|
| M1 | The scoring unit is `GROUP`. `entity_type ∈ {GROUP, COMPANY}` runs through every table and every API. | The dataset holds 250 groups and 1,286 companies, and the brief counts 250 companies. The hidden test is almost certainly at group level. A config flip covers the other case. | `SPEC.md` §3.1 |
| M2 | A group is built by summing components with intragroup flows removed, then recomputing every ratio. Ratios are never averaged across companies. | A group with a 10 M€ subsidiary at DSO 30 and a 100 k€ one at DSO 120 has a group DSO near 31, not 75. | `sql/25_entity_rollup.sql`, `RollupTest` |
| M3 | The per-subsidiary score adjustment is dropped. Company scores exist for drilldown only. | The group is the unit that is scored. A second, blended company score would have no reader. | `ARCHITECTURE.md` §0 |
| M4 | Every level score comes from fixed anchors: piecewise-linear, absolute, clamped, no extrapolation. No percentile is computed at runtime anywhere in the scoring path. | An entity that the system has never seen must score exactly like a training entity. An anchor also explains itself in real units: "DSO 75 days → 55 points". | `SPEC.md` §7.1, `AnchorInterpolatorTest` |
| M5 | Population quantiles are reference material. They propose anchors and are written to `threshold_quantiles`. Scoring code never reads them. They are computed per `entity_type`. | Reading them at runtime would make one entity's score depend on the other 249. That breaks M4. A consolidated group has a different distribution from a single company, so mixing the two would miscalibrate every pending anchor. | `THRESHOLDS.md`, `sql/90_threshold_quantiles.sql` |
| M6 | A missing indicator is excluded and the weights are renormalized over the available categories. Missing is never zero. | A company without an ERP connection has no invoices. Scoring it as if it had zero receivables would invent a fact. | `ProfileRenormalizationTest` |
| M7 | A value for month `m` reads only data dated up to the end of month `m`. Snapshot data is flagged `static`. | The whole anticipation claim rests on this. `LookAheadTest` truncates a panel at M12 and asserts that M00–M12 do not move. | `ARCHITECTURE.md` §4.4, `LookAheadTest` |
| M8 | An entity-month whose available categories carry less than `confidence.min-trusted-weight-share` of the profile weight gets **no score at all**. `ProfileScorer` returns null, so the export, the alerts, the regimes, the products and the lead time all skip it. Strengthened on 2026-09-20: the gate used to tag the confidence and publish the score anyway. | One available category renormalizes to 100 % of the weight, so a single indicator on its best anchor published a final of 100. Every one of the 248 entities began its life at that ceiling and then fell, which manufactured a deterioration that never happened. M23 holds no such row, so no leaderboard score moves. | `THRESHOLDS.md` "Coverage gate", `ProfileRenormalizationTest` |
| M9 | A month with no flow data is a gap, not a zero. Momentum persistence restarts on the first full month after one. | Otherwise a return to normal data reads as a large improvement that never happened. | `DATA_FINDINGS.md` "Missing months are not zero" |
| M9b | `DEBT_DSCR` with no debt service scores level 100, through the config key `debt-dscr.no-debt-level`. | No debt to serve is not a risk. The key exists so one line flips it to unavailable if the distribution looks wrong. | `scoring-config.yml` |
| M10 | Supervised calibration is out of scope. Only the `ScoreCalibrator` interface exists, with no implementation, no Smile dependency and no `/api/model/*` endpoint. | The dataset carries no target column, and the hidden test did not arrive on Friday as announced. Fitting a model to our own judgment would add no information. | `ARCHITECTURE.md` §0 §8.5 |
| M11 | A deterioration proxy event needs a sustained cash burn: `dscr-below: 0.0` for `dscr-months: 6`. It was `1.0` for 2 months. | The old rule held in 29.7 % of scored months, because 33 % of the months have a negative 3-month operating cash flow. A condition that common is a state of this data, not an event, and it pinned the base rate at 0.63 so no lift could move. Lowering the threshold does not help: the mass is negative. | `THRESHOLDS.md` "Proxy event triggers" |
| M12 | The lead-time baseline counts entries into the risk condition, not months inside it. | A condition that lasts a year made every neighbouring month count as "followed". Both the hit rate and the base rate use the same rule, so they stay comparable. | `LeadTimeAnalyzer` |
| M13 | The headline anticipation number is the limit engine, not the status flag. The UI prints all three figures. | The limit engine reads the level and the trajectory together and cut the line before 86 % of the events, 4.5 months ahead. The status signal does not beat chance on deterioration (lift 0.96) and does beat it on improvement (1.54). A number that only reports its wins cannot underwrite a credit. | `THRESHOLDS.md`, `/api/analytics/lead-time` |

## 2. Weights, anchors and thresholds

| # | Decision | Date | Why | Evidence |
|---|---|---|---|---|
| W1 | The category weights, the intra-category weights and λ come from the AHP generator, and they are closed. | 2026-09-19 | The Embat CTO asked the team to stop tuning weights. A ±50 % error on every weight keeps the rank correlation at 0.98–0.99, while the choice of profile moves it to 0.74. The profile design carries the information, not the magnitudes. | `WEIGHTS.md`, `WEIGHTS_JUSTIFICATION.md` §2 |
| W2 | All ten categories carry a positive weight in all three profiles. | 2026-09-19 | A zero weight deletes a category for that buyer. An AHP rating can rank a category last without erasing it. | `WEIGHTS.md` §2.2 |
| W3 | Only three events reopen a weight: real labels arrive, an Embat expert disputes an ordering, or the ±50 % test falls below 0.90 on new data. | 2026-09-19 | Any other change would fit the score to this one synthetic dataset. | `WEIGHTS_JUSTIFICATION.md` §5 |
| W4 | Ten anchors stay `status: pending` with provisional values. The quantiles and a proposal for each one are written down and wait for a human review. | 2026-09-19 | Rounding a quantile into an anchor is a judgment. The UI marks every pending anchor, so no number is presented as settled when it is not. | `THRESHOLDS.md` |
| W5 | Band S (≥ 90) sits above band A. | 2026-09-19 | The product needed a tier for the few outstanding entities. At M23 it holds 2 to 3 entities of 248, so it stays rare. | `THRESHOLDS.md` "Band S" |
| W6 | `limit-engine.reference-rate` stays 0.035 in the shipped config. It is an example value, and the UI says so. | 2026-09-19 | No expert has agreed a rate with us. The bank and SME presets propose 0.030, the 12-month Euribor of 31 August 2026 read from Banco de España table 1.7. | `THRESHOLDS.md`, `PRESETS.md` §6 |
| W7 | The spread grid and the premium multipliers are our assumptions. They are monotone in the band and have no market source. | 2026-09-19 | State it when asked. Inventing a source would be worse than having none. | `WEIGHTS_JUSTIFICATION.md` §4 |

## 3. Product

| # | Decision | Date | Why | Evidence |
|---|---|---|---|---|
| P1 | The first buyer is the SME that already uses Embat. The lender or the insurer pays second, per line or per policy, with the SME's consent. This supersedes `SPEC.md` §10, which named the bank first. | 2026-09-19 | The data belongs to the SME, so every sale to a lender starts with its consent. Embat already bills that company, so X-Ray is a module in a contract that exists. | `PRODUCT.md` "Buyer" |
| P2 | The three buyer views (BANK, FUND, INSURER) are three weight tables over one score, materialized at pipeline time. `?profile=` filters, it never recomputes. | — | One engine, three products. A page must not recompute 250 entities to answer a request. | `ARCHITECTURE.md` §10 |
| P3 | The products run before the alerts: `S75_Products`, then `S80_Alerts`. `ARCHITECTURE.md` originally had `S85_Products`. | — | The `LIMIT_ACTION` alert reads a limit decision. The limit engine reads only scores, regimes and indicators, never an alert. | `pipeline/stages/` |
| P4 | The score projection uses AR(1) mean reversion to the entity's own median, ρ = 0.85. It is output only and never feeds a score. | 2026-09-19 | In the backtest it beats repeating the last value from horizon 2 on, and the damped linear trend loses to repeating the last value at every horizon. | `FORECAST.md` §4 |
| P5 | The recommendations are template text built from the entity's own contributions. No model runs at request time. | 2026-09-19 | `SPEC.md` §14 forbids an external call at runtime. A template that names the real driver is also easier to defend than generated prose. | `RECOMMENDATIONS.md` |
| P6 | A client preset changes rules, never a weight. | 2026-09-19 | Each target client already has a weight profile with sources (W1). We found no source that gives different weights for these four clients. | `PRESETS.md` §1 |
| P7 | The per-entity sector tuning changes anchors only, computes one entity, and writes nothing. | 2026-09-19 | The data has no sector field, so the reader picks the sector. A what-if must not change what anyone else sees. | `SECTOR_PRESETS.md` |
| P8 | A custom preset is written by the client on the entity page, lives in memory, changes any editable section except the weights, and computes only that entity. | 2026-09-20 | The catalogue presets carry a source we read, so a client value must not enter `presets.yml`. Memory needs no write in demo mode and no volume in production, and the film states the limit. | `CUSTOM_PRESETS.md` |

## 4. Build and delivery

| # | Decision | Date | Why | Evidence |
|---|---|---|---|---|
| B1 | DuckDB embedded in one file is both the analytical engine and the results store. No Postgres, no JPA. | — | It reads 2.5 M transactions straight from CSV and aggregates them in seconds. After the SQL layer the data is 132,000 rows and fits in memory. | `ARCHITECTURE.md` §1 |
| B2 | The app deployed on the first day, empty. Every block since ships to the same URL. | — | A public URL on Saturday morning removes the largest risk of the weekend. | `ARCHITECTURE.md` §11 |
| B3 | Production runs in demo mode on a frozen 112 MB slice of the database. The pipeline never runs there. | 2026-09-19 | The raw CSVs are 617 MB and stay on the laptop. A recalculation in front of the jury is a risk with no upside. | `DEPLOY.md` |
| B4 | An expert edit is written to `data/scoring-overrides.yml`. `scoring-config.yml` stays the reviewed baseline. | 2026-09-19 | The shipped defaults must stay readable and reviewable after any number of edits. | `ALGORITHM_PAGE.md` D1 |
| B5 | The Algorithm page and the sector tuning stay usable in demo mode: the expert edits a draft and previews it on one entity. Apply and recalculate are off, with the reason next to the control. | 2026-09-19 | The preview scores that entity through the same code as the pipeline, so the demo shows a real effect without a write. | `ALGORITHM_PAGE.md` D7 |
| B6 | No external API is called at runtime. Narratives come from `TemplateNarrativeRenderer`. | — | A demo must not depend on a third party. | `SPEC.md` §14 |
| B7 | There are four extension points and no fifth: `PipelineStage`, `AlertRule`, `NarrativeRenderer`, `ScoreCalibrator`. | — | Two developers in twenty hours cannot maintain more than one way to add a thing. | `ARCHITECTURE.md` §8 |
| B8 | Six tests exist and no more: anchors, explanation sum, look-ahead, renormalization, rollup, config validation. | — | Each one guards a claim we make to the jury. Coverage beyond them buys nothing this weekend. | `ARCHITECTURE.md` §9 |
| B9 | `SubmissionExporter` writes `entity_id,score` at M23 by default. | — | The hidden test, the scoring script and the leaderboard were announced for Friday and did not arrive. The one known fact: the test uses the same CSV format as `data/raw/`. | `SPEC.md` §11 |

---

## 5. Still open

| Item | Owner | When |
|---|---|---|
| Scoring unit, label semantics and submission format of the hidden test | Embat | Sunday. Read the unit from the test IDs, adapt the exporter, submit once. |
| The ten pending anchors (W4) | Fran / José Javier | After a review of the proposals in `THRESHOLDS.md`. |
| The value of `reference-rate` (W6) | An Embat expert | A config edit from the Algorithm page. Record the new value and its source in `THRESHOLDS.md`. |
| Whether the intra-category weights should differ per profile | post-demo | `WEIGHTS.md` §4.1 names where the assumption may be wrong. |
