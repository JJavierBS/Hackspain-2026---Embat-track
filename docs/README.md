# Documentation index

Fifteen files, each with one owner. Read them in this order and stop when you have your answer.

## Start here

| File | Owns |
|---|---|
| [`DECISIONS.md`](DECISIONS.md) | **Every decision, with its reason and its evidence.** It wins over every other file. Read it before disagreeing with anything. |
| [`RULES.md`](RULES.md) | The engineering rules the code holds (causality, anchors, missing ≠ zero, …), the conventions, and the tests that guard them. |
| [`SPEC.md`](SPEC.md) | ***What*** to compute: data, indicators, anchors, scoring, trajectory, regimes, alerts, products, API contract. |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | ***How*** it is built: packages, contracts, pipeline stages, SQL files, extension points, tests, build order. |

Precedence when two files disagree: **DECISIONS → SPEC (on *what*) → ARCHITECTURE (on *how*)**.

## The numbers, and where they come from

| File | Owns |
|---|---|
| [`DATA_FINDINGS.md`](DATA_FINDINGS.md) | What the CSVs actually say. Every profiling question, with the query that answered it. |
| [`THRESHOLDS.md`](THRESHOLDS.md) | The anchors: quantiles, proposals, and the review status of the ten that are still pending. |
| [`WEIGHTS.md`](WEIGHTS.md) | The category weights, intra-category weights and λ: the AHP derivation with its sources (§1–§9), and the sensitivity test that says the magnitudes barely matter (§10–§14). |
| [`FORECAST.md`](FORECAST.md) | The score projection: method, backtest and why AR(1) mean reversion won. Output only — nothing scores from it. |
| [`RECOMMENDATIONS.md`](RECOMMENDATIONS.md) | The "qué hacer ahora" panel: static rules built from the entity's own contributions. |

## Configuration, product and delivery

| File | Owns |
|---|---|
| [`ALGORITHM_PAGE.md`](ALGORITHM_PAGE.md) | The expert configuration page: every decision, the limits, and the test evidence. |
| [`PRESETS.md`](PRESETS.md) | The three kinds of preset — client (§1–§6), sector (§7–§13) and custom (§14–§18) — each value with the source we read. |
| [`PRODUCT.md`](PRODUCT.md) | Who buys it, what they buy, and the price structure. |
| [`DESIGN.md`](DESIGN.md) | The design system: tokens, components and the rules the UI follows. |
| [`DEPLOY.md`](DEPLOY.md) | Render, Vercel, the frozen database, demo mode and the memory budget. |

## Reference

| File | Owns |
|---|---|
| [`embat-track.md`](embat-track.md) | The original challenge brief, unedited. |

## Elsewhere in the repo

| File | Owns |
|---|---|
| [`../README.md`](../README.md) | The front door: the story, the measured results and how to run it. |
| [`../scripts/README.md`](../scripts/README.md) | The offline tools that produced the numbers in these files, and the ones that build or check a database. |
| [`../frontend/README.md`](../frontend/README.md) | Frontend commands, the lockfile rule and how `/api` resolves. |
