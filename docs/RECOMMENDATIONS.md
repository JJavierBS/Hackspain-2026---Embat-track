# Recommendations — "Qué hacer ahora"

Static, rule-based recommendations on the entity page. No generative AI, no external call (docs/RULES.md rule 9).
The AI action plan of the `ia` branch (Helmcode client, `POST /entities/{id}/action-plan`, the recommendation
rules on `/algorithm`) was removed on 2026-09-19 at the product owner's request.

Code: `domain/service/RecommendationEngine` (what to say, pure), `narrative/RecommendationTemplates` (the
Spanish text, behind `NarrativeRenderer`), `pipeline/stages/S88_Recommendations` (writes `recommendations` and
`recommendation_summaries` for every entity × month × profile), read by `EntityDetailQuery`. Config:
`scoring.recommendations` in `scoring-config.yml`. It is not editable from `/algorithm` (product decision).

## 1. Decisions (product owner, 2026-09-19)

| Question | Decision |
|---|---|
| Ranking | Points the score would recover, **for the active profile**, × severity. Survival first. One per category. |
| Healthy entity | Opportunities only when the data backs them. Otherwise fewer than 3 and "no hay acciones prioritarias". |
| Short history | Tiered: < 3 scored months nothing; 3–5 severe level problems only; ≥ 6 everything. |
| Detail | Per-indicator texts with the entity's own numbers. No counterparty or loan names. |

## 2. Algorithm

For one entity, month m and profile p:

1. **No score** at m → summary only ("no hay datos").
2. **History** = scored months up to m (causal, like `ConfidenceResolver`). Below `min-history-months` (3) →
   summary "historial insuficiente", no finding. Below `full-history-months` (6) → *limited*: only indicators
   below `limited-max-level` (40), no trend, no "sigue empeorando", no opportunity.
3. **Candidates**, one per available indicator:
   - *level problem*: level < `problem-max-level` (60);
   - *worsening*: trajectory ≤ `trend-max-traj` (40) **and** level < `trend-max-level` (80), only with full history,
     a trajectory, and not static or fallback;
   - *survival*: value past the CRITICAL level of its early-warning alert (`alerts.runway-low`, `dscr-breach`,
     `line-util-high`).
4. **Points** = the final-score gain if the indicator reached `target-level` (75) and its trajectory came back to
   flat (50), from the exact additive decomposition of `ExplanationService`:
   `w'_c · [λ·w_i·(75 − L)/w_avail + (1−λ)·w_i·(50 − T)/w_traj]` (level only when the category has no trajectory).
   It depends on the profile weights, so BANK, FUND and INSURER rank differently (112 of 247 groups at M23).
   Non-survival candidates below `min-points` (0.3) are dropped.
5. **Severity**: CRITICAL = survival or level < 20; HIGH = level < 40 or worsening with trajectory ≤ 25; else MEDIUM.
6. **Order**: survival first (runway, then DSCR, then credit line: the most immediate first), then
   points × severity factor (3 / 2 / 1). One finding per category; redundant pairs skipped (§5).
7. **Opportunities** fill the free slots only with full history, no survival or CRITICAL finding, and final ≥ 65.
8. **Summary**: one sentence per health status (SPEC §8.3), plus limited history, the profile's categories with no
   data ("Sin datos de …: no se puede recomendar nada sobre esas áreas"), and the no-finding line.

Every value for month m reads only month m and the history count up to m. `LookAheadTest` runs S88 and checks it.

## 3. Provisional values

Every value is in `scoring.recommendations`. Where possible it reuses a threshold that already exists:

| Key | Value | Why |
|---|---|---|
| `full-history-months` | 6 | = `confidence.low-history-months` |
| `trend-max-traj` | 40 | = `statuses.turning-max-traj` |
| `trend-max-level` | 80 | = `bands.a`. M23 run flagged runway at the 24-month cap and a DSCR of 2,000x as "worsening" |
| `high-max-level` / `critical-max-level` | 40 / 20 | Half and a quarter of the scale, close to `bands.d` (35) |
| `target-level` | 75 | "Recovered" level: runway 6 months, DSO 55 days, DSCR 1.7x |
| `min-points` | 0.3 | Below it the gain rounds to nothing on the 1-decimal UI |
| `aging-min-overdue-share` | 5 % | M23: 6 of 14 groups with a low `DEL_AGING_90` had under 2 % overdue |
| `growth-collapse-below` | −90 % | 19 groups at M23 near −100 %: activity stopped or an account is missing |
| `overtrading-min-growth` | +30 % | The +100-point anchor of `ACT_COLLECTIONS_GROWTH` |
| `opportunity.*` | 65, 12 m, 3x, 2x, 1 y | `bands.b` and the top anchors of runway, buffer, DSCR and debt/cash |

## 4. Catalogue

Style: impersonal (infinitive titles and actions). The same page is read by the company and by its bank, insurer
or fund. Each item has a title, a *why* with the entity's numbers, an action and a goal (the value that scores 75).
Suffixes: "Además, sigue empeorando." (level problem that is also worsening), "Dato calculado sobre la foto de
deuda más reciente." (static indicator), "(estimado con menos de 12 meses de datos)" / "frente al trimestre
anterior" (fallback).

| Variant | When | Message (short) |
|---|---|---|
| `RUNWAY_CRITICAL` | runway < 1.5 m (survival) | 13-week weekly cash forecast, defer non-critical payments, draw available financing now |
| `RUNWAY_LOW` | runway < 3 m | Set a minimum buffer, cut or defer spending, negotiate working capital while there is margin |
| `BUFFER_SHORT` | cash < 1x commitments at 90 days | Rank the 90-day maturities, renegotiate non-critical suppliers **before** the due date |
| `OVERDRAFT` | minimum balance < 0 | Align large payments with collections or replace the overdraft with a credit line |
| `NOCF_NEGATIVE` | cash margin < 0 | "Por cada 100 € cobrados se pagaron X €": fixed vs variable costs, margin by customer |
| `OVERTRADING` | margin < 0 and collections ≥ +30 % | Growth financed with cash: prices, payment terms, finance working capital before accelerating |
| `IN_OUT_BELOW_ONE` | collections / payments < 1 | Review the payments that grew most, speed up collection |
| `NO_COLLECTIONS` | margin or volatility sentinel (§5) | No collections in 3 (6) months: has activity stopped, or is an account missing? |
| `GROWTH_COLLAPSE` | collections ≤ −90 % | Same question, framed on the drop |
| `GROWTH_DECLINE` | collections < 0 | Which customers dropped, commercial action, adjust costs if confirmed |
| `DSCR_NEGATIVE` | DSCR < 0 (survival) | Debt paid from reserves: ask the banks for a grace period **before** the first missed payment |
| `DSCR_BELOW_ONE` | 0 ≤ DSCR < 1 (survival) | Same, and no new debt |
| `DSCR_BELOW_COVENANT` | 1 ≤ DSCR < 1.25 | Banks usually require the `dscr-breach` warn level. No new debt, refinance to a longer term |
| `LINE_EXHAUSTED` | line use > 95 % (survival) | Renew or extend now, move the permanent part to a term loan |
| `DEBT_NO_CF` | debt with NOCF 12m ≤ 0 | Debt cannot be repaid by the activity: no new debt, calendar with the banks |
| `OVERDUE_NO_BASE` | overdue sentinel (§5) | Overdue invoices and no new invoice in 3 months |
| `LEVEL` | generic level problem | One text per indicator (22), with its number and its own action |
| `TREND` | worsening, level still ≥ 60 | "El indicador «X» empeora desde hace meses (hoy V). Corregirlo ahora es más barato." |
| `IDLE_CASH` | runway ≥ 12, buffer ≥ 3, margin ≥ 0 | Keep a buffer and invest the surplus. If debt is expensive (funding cost level < 60): prepay it |
| `DEBT_CAPACITY` | DSCR ≥ 2, debt ≤ 1 year of cash | Arguments to ask for better prices or more limit |
| `NO_DEBT_CAPACITY` | no debt service, zero debt, margin > 0 | Negotiate a standby credit line while conditions are good |

Legal facts in the texts (checked 2026-09-19, prefixed "En España" because 1,056 of 1,286 companies have no
country):
- 60 days is the maximum B2B payment term and cannot be extended by contract — Ley 3/2004 as amended by
  Ley 15/2010 ([BOE](https://www.boe.es/buscar/doc.php?id=BOE-A-2010-10708)). Shown with DSO > 60 and with DPO.
- AEAT deferrals need no guarantee up to €50,000 of total debt — Orden HFP/311/2023
  ([AEAT](https://sede.agenciatributaria.gob.es/Sede/procedimientos/RB01.shtml)). Shown with `TAX_REGULARITY`.
- Being up to date with tax and social security is a condition for subsidies and public contracts. Stated
  generically, with no article number.

## 5. Corner cases found in the data

| Case | Rule |
|---|---|
| `DEBT_DSCR` null = no debt service (level 100) | Never a problem. `NO_DEBT_CAPACITY` needs `LEV_DEBT_TO_CF` = 0 too: no service is not "no debt" |
| `DEBT_DSCR` < 0 (87 groups at M23) | Own text: the debt is paid from reserves, not "0.3x" |
| `LEV_DEBT_TO_CF` null = debt with NOCF ≤ 0 | `DEBT_NO_CF`, never a number of years |
| SQL writes the worst anchor x when a ratio has no base (`CF_NOCF_MARGIN`, `CF_VOLATILITY`, `PAY_OVERDUE_PAYABLES`, `DEL_OVERDUE_RECEIVABLES`) | Detected (value = worst anchor x). Text says "no collections" / "no new invoice", never "por cada 100 € se pagaron 120 €" |
| `LIQ_RUNWAY` = 0 when cash ≤ 0 (265 group-months) | "La caja disponible es nula o negativa" |
| `DEL_AGING_90` high on a tiny overdue balance | Needs overdue receivables ≥ `aging-min-overdue-share` |
| Multiples in the thousands (DSCR 10,533x) | Shown as "más de 10x" |
| Trajectory falling at level 100 | Not "worsening" (`trend-max-level`) |
| Static indicators (debt snapshot) | No trend; suffix on the text |
| Fallback (QoQ growth, < 12 m windows, schedule rate) | No trend; the text names the shorter base |
| CON_* only on identified counterparties | "(sobre los cobros con cliente identificado)" |
| DSCR < 1 and debt/cash both picked (20 % of M23 top 3) | Debt/cash skipped: same message |
| No collections and collections −90 % both picked | Only the first one |
| Category with no data | Listed in the summary, never guessed |

## 6. Coverage (run of 2026-09-19, GROUP, BANK)

- M23: every scored group has a summary; 247 of 248 have 1–3 actions. The one without is "excepcional" with 4
  months of data and 5 empty areas: "Con los datos disponibles no se detecta ningún problema grave."
- M00: the 95 scored groups get "historial insuficiente" and no action. M02: 95 limited-history groups.
- Limited history: 0 trend findings, 0 "sigue empeorando", 0 opportunities (checked in the results table).
- `GET /api/entities/{id}` with the block: 0.11 s.
