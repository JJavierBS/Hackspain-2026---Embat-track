# PRESETS — client starting points for the Algorithm page

Status: added on 2026-09-19. Source file: `backend/src/main/resources/presets.yml`.
Endpoint: `GET /api/config/presets`. UI: the "Presets por cliente" section, first on `/algorithm`.

A preset is a list of config values for one target client, each with its evidence. The page loads a
preset into the draft. Nothing changes until the expert reviews and applies the draft (the normal
`PUT /api/config` path, with the same checks and the same pipeline run).

## 1. Decision: presets change rules, not weights

Each target client already has its own weight profile (`WEIGHTS.md` §3), with sources, closed with the
Embat CTO on 2026-09-19 (`WEIGHTS_JUSTIFICATION.md`). The profile carries the client view: BANK against
FUND gives a rank correlation of 0.74, while a ±50 % error on every weight keeps 0.98–0.99
(`WEIGHTS_JUSTIFICATION.md` §2). So a preset:

1. names the profile that already fits the client (the page offers to switch the view), and
2. changes only the rules for which we read a source that gives a number.

The search found no source that gives different category weights for these four clients. So no preset
changes a weight.

## 2. Status of each value

The same rule as `WEIGHTS_JUSTIFICATION.md`. No figure is attributed to a source that we did not read.

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
