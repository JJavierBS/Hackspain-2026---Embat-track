# SECTOR_PRESETS — tune one entity by sector

Status: added on 2026-09-19, branch `feat/sector-tuning`. Source file: `backend/src/main/resources/sectors.yml`.
Endpoints: `GET /api/config/sectors`, `POST /api/entities/{id}/tuning`.
UI: the "Ajuste por sector" film on the Entity page, and the "Vista previa en una entidad" film on `/algorithm`.

## 1. What it does

The data has no sector field (SPEC §4). So the user picks the sector of one group or company on the Entity page.

1. Every sector is open to every entity. The default is "Sin ajuste" (the published score).
2. The user picks one of four sectors. All anchor changes of that sector apply by default.
3. The user can turn off one change with its checkbox. The score then uses the other changes only.
4. The backend scores that one entity again and returns the published score and the tuned score.
5. Nothing is written. Every other page keeps the published score.

The choice lives in the URL: `?sector=tech&off=LEV_DEBT_TO_CF`. A link shows the same tuning.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| S1 | A sector changes indicator anchors only. The boot refuses any other path. | The profile weights are closed with the Embat CTO (`WEIGHTS_JUSTIFICATION.md`). The user chose "anchors only" on 2026-09-19. |
| S2 | The tuning is a what-if for one entity, computed on request, not stored. | Prod serves precomputed data (demo mode). A stored sector would need writes in prod and a pipeline run. |
| S3 | The request runs the pipeline's own code (`PanelScoring`: S40, S50, S60) twice: with the config in use, and with the tuned config. | The difference comes from the config only. Test: on the frozen demo database, the base score equals the published score for 108 of 108 entity-profile pairs. |
| S4 | Each value says `sourced`, `derived` or `placeholder`, as in `PRESETS.md`. | No figure is attributed to a source that we did not read. |
| S5 | The fixed parts of SPEC §6.1 stay: DPO ≤ 60 days → 100 (Ley 3/2004), NOCF margin < 0 → ≤ 35 and 0 → 45. | These are legal or natural points, not sector norms. One exception, stated in its text: the tech sector moves growth 0 % → 50 to 0 % → 35. |

CLAUDE.md rule 8 ("no recomputation in requests") has two exceptions now: the limit simulator and this tuning. Both
write nothing. The tuning of one entity takes about 13 ms (average over 108 requests, 39 ms at most).

## 3. The four sectors

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

## 4. Effect on the demo data

Measured on 2026-09-19, frozen demo database, BANK profile, M23, all 248 scored groups:

| Sector | Smallest change | Largest change |
|---|---|---|
| Comercio minorista | −1,1 | +4,2 |
| Tecnología | −3,4 | +1,4 |
| Construcción | −1,0 | +3,5 |
| Industria · maquinaria | −3,5 | +0,9 |

The effect is small because a sector changes 2 to 4 of 22 indicators, and many values fall where both curves give
the same level. Demo case: GROUP_0104 with the tech sector goes from 51,7 (C) to 48,3 (D) on BANK.

## 5. Limits to state if asked

- **Damodaran** covers listed European companies, not SMEs. We use the ratio sector ÷ market, not the level.
- **CEPYME** measures what a sector pays (days to pay). We use it for DPO only, not for DSO.
- **CEPYME** has no technology branch. The tech sector uses "actividades profesionales".
- **SaaS Capital** measures recurring revenue, mostly of US companies. `ACT_COLLECTIONS_GROWTH` measures 12 months of collections.
- **Construction leverage** goes past the ECB 6× "exceptional" line (BANK preset). The sector curve describes the sector, not the risk appetite of a bank.

## 6. Change or add a sector

1. Edit `sectors.yml`. Each change needs a `path` of the form `indicators.<ID>.anchors`, a `value`, a `status`, a `why` and source ids.
2. Add each new source with its URL, the exact short quote or the figure read, and the date read.
3. Start the backend. The boot applies each sector to the shipped config and runs the same checks as `scoring-config.yml`. A bad sector stops the boot, and the message names the sector and the value.

## 7. Sources (read on 2026-09-19)

- CEPYME, Observatorio de Morosidad, II semestre 2025 (table 1, charts 4 and 9).
  https://cepyme.es/storage/2026/04/Observatorio-Morosidad-II-semestre-2025.pdf
- BOE, Ley 3/2004, article 4.3. https://www.boe.es/buscar/act.php?id=BOE-A-2004-21830
- Damodaran, Margins by Sector (Europe), January 2026. https://pages.stern.nyu.edu/~adamodar/pc/datasets/marginEurope.xls
- Damodaran, Debt Fundamentals by Sector (Europe), January 2026. https://pages.stern.nyu.edu/~adamodar/pc/datasets/dbtfundEurope.xls
- SaaS Capital, 2026 Private B2B SaaS Company Growth Rate Benchmarks. https://www.saas-capital.com/research/private-saas-company-growth-rate-benchmarks/
