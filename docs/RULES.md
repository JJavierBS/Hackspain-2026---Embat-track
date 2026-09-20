# RULES — engineering rules of this repo

The invariants the code must hold, the conventions it is written in, and the tests that guard them.
They are referenced by number from the source (`RULES.md rule 4`), so the numbering is stable.

Precedence: **`DECISIONS.md` wins over everything.** Then `SPEC.md` on *what* to compute, and
`ARCHITECTURE.md` on *how* it is built.

## 1. Non-negotiable rules

1. **Causality.** A value for month `m` uses only data dated ≤ end of month `m`. Use `CausalWindow`.
   `LookAheadTest` must pass; it is what makes the lead-time numbers defensible.
2. **Anchors only.** Level scores are absolute piecewise-linear functions of the entity's own value,
   clamped, **no extrapolation**. No runtime percentile anywhere in the scoring path. Quantiles are
   reference-only (`threshold_quantiles`) and never read by scoring code.
3. **Missing ≠ zero.** Unavailable indicators are excluded and weights renormalized over the
   available categories.
4. **Never average ratios across companies.** Groups sum components (intragroup removed) and
   recompute ratios (`25_entity_rollup.sql`).
5. **Config over code.** Every threshold, anchor, weight, flow-class mapping and λ lives in
   `scoring-config.yml`, bound to typed records. Never hardcode or special-case a weight value.
6. **`domain/` is pure.** No `org.springframework`, no `java.sql` imports.
7. **Don't assume unverified data semantics.** Invoice direction, category names, the `exchange_rate`
   convention, intragroup ids, the scoring unit and the submission format were all profiled against
   the CSVs before any config changed. Anything still open is marked `⚠ UNKNOWN` in
   `DATA_FINDINGS.md`: profile it, record the answer there, then change the config.
8. **No recomputation in requests.** The API reads results tables. All three profiles are materialized
   at pipeline time. Target < 1 s per page. Two what-if requests are the only exceptions, and they
   compute and write nothing: the limit simulator and `POST /api/entities/{id}/tuning` (one entity,
   through `PanelScoring`, the same code as S40–S60).
9. **No external API calls at runtime.** Narratives come from `TemplateNarrativeRenderer`.
10. **Four extension points only** — `PipelineStage`, `AlertRule`, `NarrativeRenderer`,
    `ScoreCalibrator`. No other plugin mechanism.

## 2. Conventions

- English for code, identifiers, commits, API and docs. UI copy may be Spanish.
- Months as the `Month` value object / `YYYY-MM` strings. `M00 = 2024-09` … `M23 = 2026-08`.
- DTOs are Java `record`s. Scores are rounded to 1 decimal **at the API boundary only**.
- SQL files are numbered and run in filename order, with `${placeholder}` substitution.
- Results tables are written with the DuckDB Appender (`ResultWriter`), dropped and recreated per run.
- Frontend: `profile` and `month` live in URL search params, so every view is linkable.

## 3. Extending the engine

- **An indicator:** an `IndicatorId` enum constant, a `scoring-config.yml` entry, and an INSERT in the
  right `3x_ind_*.sql` (`ARCHITECTURE.md` §8.4).
- **An alert:** one class in `alerting/rules/`, a pure predicate. `AlertEngine` handles the transitions.
- **A config override:** expert edits from `/algorithm` are written to `data/scoring-overrides.yml`,
  never to `scoring-config.yml`.
- **A preset:** every value in `presets.yml` needs a source we read, and a preset never changes a
  weight (`PRESETS.md`).

When a spec value turns out wrong against the data, change the config and write down why in
`DATA_FINDINGS.md` or `THRESHOLDS.md`. Do not silently diverge from `SPEC.md`.

If the histogram of `final` at M23 clusters in a ~15-point band, widen the anchors. Do not touch the
weights (`WEIGHTS.md` §5 gives the only three reasons to reopen one).

## 4. The tests that guard the rules

| Test | Guards |
|---|---|
| `AnchorInterpolatorTest` | Rule 2 — clamping, no extrapolation, exact anchor points |
| `ExplanationSumTest` | The additive breakdown: `final − 50 = Σ contribution_i`, to 0.05 |
| `LookAheadTest` | Rule 1 — a panel truncated at M12 leaves M00–M12 unchanged |
| `ProfileRenormalizationTest` | Rules 3 and 8 — missing categories renormalize, coverage gate |
| `RollupTest` | Rule 4 — components sum, ratios recompute, intragroup removed |
| `ScoringConfigValidationTest` | Rule 5 — the shipped config, every preset and every sector validate |

`ARCHITECTURE.md` §9 describes what each one asserts.
