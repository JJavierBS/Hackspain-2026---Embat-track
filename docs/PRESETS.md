# PRESETS — starting points an expert can load

A preset is a named list of config values, each one with its evidence. X-Ray ships three kinds, and
they differ in who writes them and how far they reach:

| Kind | Who writes it | Scope | Where | Section |
|---|---|---|---|---|
| **Client** | us, with a source we read | the whole portfolio | `presets.yml`, `/algorithm` | §1–§6 |
| **Sector** | us, with a source we read | one entity, what-if | `sectors.yml`, entity page | §7–§13 |
| **Custom** | the client | one entity, what-if, in memory | browser tab, entity page | §14–§18 |

Two rules hold across all three:

1. **Every value states its evidence.** `sourced` (a source we read gives the number), `derived`
   (a source gives the end points and a rule of ours, named in the text, gives the rest) or
   `placeholder` / `Sin fuente` (judgment, no source for the number). No figure is attributed to a
   source we did not read.
2. **No preset changes a weight.** The three profile weight tables are closed (`DECISIONS.md`
   W1–W3), and we found no source that gives different weights for any target client. A preset that
   needs a different weight is a new profile.

Nothing on this page is applied silently: a client preset loads into the `/algorithm` draft and waits
for the expert to apply it, and a sector or custom preset is a what-if on one entity that writes
nothing (`DECISIONS.md` P6–P8).

---

# Part 1 · Client presets

Source file: `backend/src/main/resources/presets.yml`. Endpoint: `GET /api/config/presets`.
UI: the "Presets por cliente" section, first on `/algorithm`.

A preset is a list of config values for one target client, each with its evidence. The page loads a
preset into the draft. Nothing changes until the expert reviews and applies the draft (the normal
`PUT /api/config` path, with the same checks and the same pipeline run).

## 1. Decision: presets change rules, not weights

Each target client already has its own weight profile (`WEIGHTS.md` §3), with sources, closed with the
Embat CTO on 2026-09-19 (`WEIGHTS.md` §10). The profile carries the client view: BANK against
FUND gives a rank correlation of 0.74, while a ±50 % error on every weight keeps 0.98–0.99
(`WEIGHTS.md` §11). So a preset:

1. names the profile that already fits the client (the page offers to switch the view), and
2. changes only the rules for which we read a source that gives a number.

The search found no source that gives different category weights for these four clients. So no preset
changes a weight.

## 2. Status of each value

The same rule as `WEIGHTS.md`. No figure is attributed to a source that we did not read.

| Status | Meaning |
|---|---|
| `sourced` | A source that we read gives the number. |
| `derived` | A source gives the end points. A rule of ours, named in the text, gives the rest. |
| `placeholder` | Our judgment. No source for the number. |

## 3. The four presets

| Preset | Profile | Value | New value | Status | Evidence |
|---|---|---|---|---|---|
| Banco · línea de circulante | BANK | `indicators.LEV_DEBT_TO_CF.anchors` | adds 4.0× → 50, 6.0× → 35 | sourced | ECB: above 4.0× Total Debt/EBITDA is a leveraged transaction. Above 6.0× "should remain exceptional". 50 and 35 are the lower edges of bands C and D. |
| | | `limitEngine.referenceRate` | 0.035 → 0.030 | sourced | Banco de España table 1.7: 12-month Euribor 3.003 % on the last day of August 2026. |
| Aseguradora de crédito comercial | INSURER | `insurer.multiplierByBand` | A 0.4, B 1, C 2, D 4 | derived | Atradius: premiums range from 0.1 % to 1 % of insured B2B sales. With the base 0.25 %, A = 0.10 % and D = 1.00 % are the two ends. C = geometric mean of B and D (our rule). Allianz Trade: generally less than 1 %. |
| Fondo de crecimiento | FUND | `indicators.ACT_COLLECTIONS_GROWTH.anchors` | 10 % → 80 (was 15 % → 75) | sourced | Eurostat: high-growth = average annual growth above 10 %. In 2018, 11.9 % of EU enterprises with 10 or more employees. So 10 % marks the band A edge (the top tenth). |
| Pyme · autodiagnóstico | BANK | `indicators.LIQ_MIN_BALANCE.anchors` | 0.43 → 35, 0.9 → 50, 2.07 → 65, 4 → 100 | derived | JPMorgan Chase Institute, 597,000 small businesses: 13 / 27 / 62 cash buffer days at the 25th / 50th / 75th percentile. The quartiles mark the D, C and B band edges (our rule). 4 months → 100 is a placeholder. |
| | | `limitEngine.referenceRate` | 0.035 → 0.030 | sourced | As for the bank. |

Weights note of the insurer preset: the European Commission attributes one in four EU bankruptcies to
late payment. This supports the order of the INSURER profile (payment behaviour first). It gives no weight.

## 4. Limits to state if asked

- **Eurostat** measures growth as a 3-year average (employees, or turnover as an option).
  `ACT_COLLECTIONS_GROWTH` is 12 months of collections. The threshold is the same, the window is not.
- **JPMorgan Chase Institute** uses US data from 2015 and the average daily balance. `LIQ_MIN_BALANCE`
  uses the lowest balance of the month, so the same anchors are a stricter test.
- **ECB** guidance binds banks in the SSM. It uses Total Debt/EBITDA. `LEV_DEBT_TO_CF` uses 12-month
  operating cash flow as the EBITDA proxy (SPEC §6).
- **Premium range:** Atradius and Allianz Trade give a market range, not a price per band.
- **Euribor** changes every day. The preset holds the value read on 2026-09-19. Update it with the date.

## 5. Change or add a preset

1. Edit `presets.yml`. Each change needs a `path` of `GET /api/config`, a `value`, a `status`, a `why`
   and source ids.
2. Add each new source with its URL, the exact short quote (or the figure read) and the date read.
3. Start the backend. The boot applies every preset to the shipped config and runs the same checks as
   `scoring-config.yml`. A bad preset stops the boot, and the message names the preset and the value.

## 6. Sources (read on 2026-09-19)

- ECB Banking Supervision, Guidance on leveraged transactions (May 2017), section 3.
  https://www.bankingsupervision.europa.eu/ecb/pub/pdf/ssm.leveraged_transactions_guidance_201705.en.pdf
- Banco de España, statistics table 1.7 (Euribor and other interest rates).
  https://www.bde.es/webbe/es/estadisticas/compartido/datos/pdf/ti_1_7.pdf
- Atradius, "What drives credit insurance costs?".
  https://group.atradius.com/knowledge-and-research/resources/what-drives-credit-insurance-costs
- Allianz Trade, "How much does trade credit insurance cost?".
  https://www.allianz-trade.com/en_GB/insights/protect-revenues/how-much-does-trade-credit-insurance-cost.html
- Eurostat, High-growth enterprises – statistics.
  https://ec.europa.eu/eurostat/statistics-explained/index.php?title=High-growth_enterprises_-_statistics
- Eurostat news, 1 in 10 EU enterprises classified as high growth (2020-12-01).
  https://ec.europa.eu/eurostat/web/products-eurostat-news/-/ddn-20201201-1
- JPMorgan Chase Institute, Cash Flows, Balances, and Buffer Days (2016).
  https://www.jpmorganchase.com/institute/all-topics/business-growth-and-entrepreneurship/report-cash-flows-balances-and-buffer-days
- European Commission, EU Payment Observatory.
  https://single-market-economy.ec.europa.eu/smes/challenges-and-resilience/late-payment/eu-payment-observatory_en

---

# Part 2 · Sector presets — tune one entity by sector

Source file: `backend/src/main/resources/sectors.yml`.
Endpoints: `GET /api/config/sectors`, `POST /api/entities/{id}/tuning`.
UI: the "Ajuste por sector" film on the Entity page, and the "Vista previa en una entidad" film on `/algorithm`.

## 7. What it does

The data has no sector field (SPEC §4). So the user picks the sector of one group or company on the Entity page.

1. Every sector is open to every entity. The default is "Sin ajuste" (the published score).
2. The user picks one of four sectors. All anchor changes of that sector apply by default.
3. The user can turn off one change with its checkbox. The score then uses the other changes only.
4. The backend scores that one entity again and returns the published score and the tuned score.
5. Nothing is written. Every other page keeps the published score.

The choice lives in the URL: `?sector=tech&off=LEV_DEBT_TO_CF`. A link shows the same tuning.

## 8. Decisions

| # | Decision | Why |
|---|---|---|
| S1 | A sector changes indicator anchors only. The boot refuses any other path. | The profile weights are closed with the Embat CTO (`WEIGHTS.md` §10). The user chose "anchors only" on 2026-09-19. |
| S2 | The tuning is a what-if for one entity, computed on request, not stored. | Prod serves precomputed data (demo mode). A stored sector would need writes in prod and a pipeline run. |
| S3 | The request runs the pipeline's own code (`PanelScoring`: S40, S50, S60) twice: with the config in use, and with the tuned config. | The difference comes from the config only. Test: on the frozen demo database, the base score equals the published score for 108 of 108 entity-profile pairs. |
| S4 | Each value says `sourced`, `derived` or `placeholder`, as in §2. | No figure is attributed to a source that we did not read. |
| S5 | The fixed parts of SPEC §6.1 stay: DPO ≤ 60 days → 100 (Ley 3/2004), NOCF margin < 0 → ≤ 35 and 0 → 45. | These are legal or natural points, not sector norms. One exception, stated in its text: the tech sector moves growth 0 % → 50 to 0 % → 35. |

docs/RULES.md rule 8 ("no recomputation in requests") has two exceptions now: the limit simulator and this tuning. Both
write nothing. The tuning of one entity takes about 13 ms (average over 108 requests, 39 ms at most).

## 9. The four sectors

Rules of ours, used for every sector:

- **DPO shift.** The DPO penalty curve above 60 days moves by (sector payment days − national payment days), rounded to whole days.
- **Margin scale.** The positive side of the NOCF margin curve is multiplied by (sector EBITDA/sales ÷ market EBITDA/sales).
- **Leverage scale.** Every point of the debt/cash-flow curve is multiplied by (sector debt/EBITDA ÷ market debt/EBITDA).

| Sector | Indicator | New anchors | Rule and numbers |
|---|---|---|---|
| Comercio minorista (CNAE 47) | `PAY_DPO` | 60→100, 80→60, 110→30, 170→0 | Shift −10: 69,2 against 79,0 days |
| | `CF_NOCF_MARGIN` | … 0,035→75, 0,07→100 | Scale 0,35: 5,52 % against 15,70 % |
| Tecnología · software B2B (CNAE 58.2, 62) | `ACT_COLLECTIONS_GROWTH` | −30 %→0, 0→35, 22 %→65, 44 %→100 | Median growth 22 % → band B edge. 7,3 % flat or negative → 0 % is the band D edge. 44 % is a placeholder. |
| | `CF_NOCF_MARGIN` | … 0,11→75, 0,22→100 | Scale 1,10: 17,23 % against 15,70 % |
| | `LEV_DEBT_TO_CF` | 0,66→90, 1,97→65, 3,29→40, 5,26→0 | Scale 0,66: 2,06 against 3,13 |
| | `PAY_DPO` | 60→100, 82→60, 112→30, 172→0 | Shift −8: professional activities 70,7 days |
| Construcción y promoción (CNAE 41–43) | `PAY_DPO` | 60→100, 108→60, 138→30, 198→0 | Shift +18: 96,5 days |
| | `CF_NOCF_MARGIN` | … 0,046→75, 0,093→100 | Scale 0,46: 7,27 % |
| | `LEV_DEBT_TO_CF` | 1,45→90, 4,35→65, 7,25→40, 11,6→0 | Scale 1,45: 4,53 |
| Industria · maquinaria y equipo (CNAE 28) | `PAY_DPO` | 60→100, 100→60, 130→30, 190→0 | Shift +10: 88,8 days |
| | `CF_NOCF_MARGIN` | … 0,083→75, 0,165→100 | Scale 0,83: 12,97 % |
| | `LEV_DEBT_TO_CF` | 0,6→90, 1,8→65, 2,99→40, 4,79→0 | Scale 0,60: 1,87 |

Context notes (no anchor changes): the late-payment index of CEPYME for retail (145), construction (155,1) and
machinery (123,9). Retail keeps the general leverage curve: Damodaran's retail debt includes store leases (IFRS 16),
and `LEV_DEBT_TO_CF` counts bank debt only.

## 10. Effect on the demo data

Measured on 2026-09-19, frozen demo database, BANK profile, M23, all 248 scored groups:

| Sector | Smallest change | Largest change |
|---|---|---|
| Comercio minorista | −1,1 | +4,2 |
| Tecnología | −3,4 | +1,4 |
| Construcción | −1,0 | +3,5 |
| Industria · maquinaria | −3,5 | +0,9 |

The effect is small because a sector changes 2 to 4 of 22 indicators, and many values fall where both curves give
the same level. Demo case: GROUP_0104 with the tech sector goes from 51,7 (C) to 48,3 (D) on BANK.

## 11. Limits to state if asked

- **Damodaran** covers listed European companies, not SMEs. We use the ratio sector ÷ market, not the level.
- **CEPYME** measures what a sector pays (days to pay). We use it for DPO only, not for DSO.
- **CEPYME** has no technology branch. The tech sector uses "actividades profesionales".
- **SaaS Capital** measures recurring revenue, mostly of US companies. `ACT_COLLECTIONS_GROWTH` measures 12 months of collections.
- **Construction leverage** goes past the ECB 6× "exceptional" line (BANK preset). The sector curve describes the sector, not the risk appetite of a bank.

## 12. Change or add a sector

1. Edit `sectors.yml`. Each change needs a `path` of the form `indicators.<ID>.anchors`, a `value`, a `status`, a `why` and source ids.
2. Add each new source with its URL, the exact short quote or the figure read, and the date read.
3. Start the backend. The boot applies each sector to the shipped config and runs the same checks as `scoring-config.yml`. A bad sector stops the boot, and the message names the sector and the value.

## 13. Sources (read on 2026-09-19)

- CEPYME, Observatorio de Morosidad, II semestre 2025 (table 1, charts 4 and 9).
  https://cepyme.es/storage/2026/04/Observatorio-Morosidad-II-semestre-2025.pdf
- BOE, Ley 3/2004, article 4.3. https://www.boe.es/buscar/act.php?id=BOE-A-2004-21830
- Damodaran, Margins by Sector (Europe), January 2026. https://pages.stern.nyu.edu/~adamodar/pc/datasets/marginEurope.xls
- Damodaran, Debt Fundamentals by Sector (Europe), January 2026. https://pages.stern.nyu.edu/~adamodar/pc/datasets/dbtfundEurope.xls
- SaaS Capital, 2026 Private B2B SaaS Company Growth Rate Benchmarks. https://www.saas-capital.com/research/private-saas-company-growth-rate-benchmarks/

---

# Part 3 · Custom presets — written by the client, one entity at a time

Decision: `DECISIONS.md` P8. Source files: `frontend/src/lib/customPresets.ts`,
`frontend/src/lib/presetValues.ts`, `frontend/src/components/tuning/CustomPresets.tsx`,
`frontend/src/components/tuning/CustomPresetEditor.tsx`.
UI: the film "Presets propios" on the Entity page, after "Ajuste por sector". No new endpoint.
Only the four sector presets are offered as a starting point: the client presets stay on the Algorithm page.

## 14. What it does

The catalogue holds four client presets (§3) and four sector presets (§9).
Every value there has a source that we read. A client wants to try its own rules, so this film lets it
write them on one group or one company.

1. The client creates a preset, empty or duplicated from a sector preset.
2. It adds values: an indicator (anchors and weight inside its category), a rule, a limit or premium
   parameter, a band map or an alert threshold. Each value carries its own evidence: state
   (`Con fuente`, `Derivado`, `Sin fuente`), the reason, and the sources with their exact words.
3. Opening a preset applies it to this entity. The backend scores that one entity again and returns the
   published score next to the preset score.
4. Duplicate, rename, edit and delete stay on the same panel.

The open preset lives in the URL: `?preset=<id>`. The id is of this tab, so the link reopens the entity,
not the preset.

## 15. Decisions

| # | Decision | Why |
|---|---|---|
| C1 | A custom preset is per entity. Each group or company owns its list. | The client tries a rule against a company it knows. A global catalogue already exists for a whole client type. |
| C2 | The presets live in memory, for as long as the tab lives. Nothing is written. | Production serves precomputed data in demo mode and refuses a config write (`DECISIONS.md` B3). A file would also need a volume that the deploy does not have. The film states the limit in its first paragraph. |
| C3 | A preset may change any editable section except `profiles`. The weights are not offered. | The profile weights are closed with the Embat CTO (W1–W3). Everything else is already editable from the Algorithm page (`ALGORITHM_PAGE.md`). |
| C4 | The what-if uses the endpoint that exists: `POST /api/entities/{id}/tuning` with `config`. | That request already runs `PanelScoring` on one entity with a draft config and writes nothing (P7). No backend change, so demo mode keeps working. |
| C5 | Each value states its evidence with the same three words as the catalogue. | A client value must not look like a sourced one. `Sin fuente` is the default, and its tag is dashed, as everywhere else in the UI. |
| C6 | The editors are the ones the Algorithm page already uses (`IndicatorRow`, `FieldCell`, `BandMapField`), through an `AlgorithmContext` whose draft is the preset. | One editor for one job. The bounds, the messages and the "Por defecto · Restaurar" line come for free, and the page cannot drift from `/algorithm`. |

## 16. What a preset holds

```ts
interface CustomPreset {
  id: string;
  name: string;
  note: string;              // what the client tests with it
  paths: string[];           // the rows of the editor, in order
  tree: ConfigTree;          // the config in use with this preset's values on top
  meta: Record<string, { status; why; sources[] }>;
}
```

`tree` starts as a copy of `GET /api/config`. `diff(config, tree, editableSections)` gives the values
that really changed, and only those sections travel in the what-if body.

## 17. Limits to state if asked

- **A reload empties the list.** The choice of 2026-09-20 was memory, not a file and not the browser
  store. A client that wants to keep a preset copies its values into `presets.yml` (§5).
- **Nothing else changes.** The portfolio, the monitor, the products and every other entity keep the
  published score, as with the sector tuning.
- **The weights are absent by design.** A preset that needs a different weight is a new profile, and
  that reopens W1–W3.
- **The evidence is the client's.** X-Ray prints what the client wrote and checks nothing.

## 18. How to add a new editable value

`frontend/src/lib/presetValues.ts` builds the list the picker offers, from `FIELDS`, `ALERT_LEVELS`,
`SECTIONS` and the indicator labels of `lib/format.ts`. A new config field with a `FIELDS` entry appears
in the picker with no further change.
