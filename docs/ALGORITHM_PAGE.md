# ALGORITHM_PAGE — decisions of the expert configuration page

Status: added on 2026-09-19 (PR #17, branch `feat/algorithm-config`).
Scope: the `/algorithm` page, the `/api/config` endpoints and the client presets.
Companion files: `PRESETS.md` (evidence of each preset), `WEIGHTS_JUSTIFICATION.md` (why the weights
stay), `THRESHOLDS.md` (anchor status).

Each decision gives the context, the choice, the options we rejected, and the evidence. Use it to answer
"why is it built this way?" from a juror, a reviewer or Embat.

## 1. Summary

A risk expert edits every scoring parameter on one page and recalculates all data from it.

1. The page loads the active config and the shipped defaults (`GET /api/config`).
2. The expert edits a draft, or loads a client preset into the draft.
3. The bottom bar lists the changes. The expert ticks a consent box and applies.
4. The backend validates, writes `data/scoring-overrides.yml`, restarts the Spring context and runs
   the pipeline again. The page follows the run and fetches all data again.
5. "Volver a los valores por defecto" deletes the override file and recalculates.

## 2. Decisions

### D1. Overrides go to a separate file, not into `scoring-config.yml`

- **Choice.** `PUT /api/config` writes `data/scoring-overrides.yml`. `application.yml` imports it after
  `classpath:scoring-config.yml`, so its values win (Spring: a later import has priority).
- **Why.** `scoring-config.yml` is in the JAR and in git. It is the reviewed baseline (CLAUDE.md rule 5,
  "config over code"). A file next to `xray.duckdb` keeps the expert values with the data they produced,
  outside git. A reset is one file delete, and the baseline never changes.
- **Rejected.** Write back to `scoring-config.yml`: the file is read-only inside the JAR, and a write
  would mix expert edits with reviewed values. A database table: a second source of truth for the
  config, against rule 5.
- **Detail.** The file holds only the sections that differ from the shipped defaults (D4). A header
  comment says who wrote it and how to go back.

### D2. A save restarts the Spring context

- **Choice.** After a valid save, `XRayApplication.restart()` closes the context and starts a new one on
  a non-daemon thread, after 500 ms so the HTTP answer leaves first.
- **Why.** More than 20 beans inject `ScoringConfig` in their constructor (11 alert rules, the API queries,
  the pipeline runner). A new context binds the new values everywhere at once. No bean can keep an old value.
- **Rejected.** A mutable config holder: every injection point would change, and a half-updated state is
  possible. Spring Cloud `@RefreshScope`: a new dependency for one feature, and records do not refresh.
- **Measured.** The restart takes about 0.5 s (log: "Started application in 0.435 seconds"). DuckDB
  releases its file lock on close (`DuckDbConfig`, `destroyMethod = "close"`), so the new context opens it.

### D3. The pipeline runs again when the config fingerprint changes

- **Choice.** `ConfigFingerprint` gives the MD5 of the active config as JSON, with keys sorted.
  `pipeline_runs.config_hash` stores it. At boot, `PipelineStartupTrigger` runs the pipeline when the
  table is empty **or** when the latest hash is different from the active config.
- **Why.** The data on screen must match the config. The same rule catches a hand edit of
  `scoring-config.yml`, not only a save from the page. The page reads `appliedToData` to say whether
  the data on screen uses the active values.
- **Rejected.** A "rerun pending" marker file: it misses hand edits and can go stale. The old hash (MD5
  of the YAML file text) changes with a comment and misses the override file.
- **Consequence.** The first boot after the merge runs the pipeline once, because the stored hashes use
  the old format. Demo mode never runs the pipeline (D7).

### D4. Only the changed sections go to the override file

- **Choice.** The backend compares the validated config with the shipped defaults. It writes a top-level
  section only when it differs. For `profiles` and `indicators`, it writes only the changed entries.
  A save that equals the defaults deletes the file.
- **Why.** Spring merges maps across property sources key by key, but a list in a higher source replaces
  the whole list. So a changed indicator entry carries its full anchor list, and an unchanged entry stays
  out. The file shows exactly what the expert changed.
- **Tested.** Save of one BANK weight pair, one anchor list and the reference rate: the file held
  `profiles.BANK`, `indicators.LIQ_RUNWAY` and `limitEngine`, and `LIQ_BUFFER` kept its shipped anchors
  after the restart.

### D5. The same checks as the boot, on both sides

- **Choice.** The backend converts the merged config to `ScoringConfig` with Jackson. The record's compact
  constructor runs `ScoringConfigValidator`, so an invalid save gets HTTP 400 with the validator message
  (for example "scoring.profiles.BANK.weights sum to 105.0, expected 100"). The page repeats the main
  checks while the expert types: number format, bounds, integers, weights sum to 100, anchors strictly
  increasing, alert critical on the correct side of warn.
- **Why.** One rule set. The page checks only to give fast feedback. The backend check is the one that
  counts, so a direct API call cannot bypass it.

### D6. What the page edits, and what stays read-only

| Editable | Read-only | Reason for read-only |
|---|---|---|
| Profile weights and λ, indicator anchors and weights, trajectory, regimes, statuses, confidence, explanation, indicator edge rules, limit engine, premium, products, alerts, lead time, showcase, forecast | Band cut-offs 80/65/50/35 | The UI draws the band ladder and colours with fixed cut-offs (`lib/format.ts` `BANDS`). A backend-only change gives letters and colours that do not match. |
| | Data rules: flow classes, FX, invoice and intragroup rules, CSV filters | They come from data profiling (`DATA_FINDINGS.md`), not from expert judgment. A wrong value corrupts the input, not the score. |
| | Scoring unit and month range | They define the dataset and the submission (CLAUDE.md open items). |

The user chose this scope on 2026-09-19 ("all scoring parameters").

### D7. Demo mode is read-only. A running pipeline blocks a save

- **Choice.** With `xray.demo-mode=true`, `GET /api/config` returns `editable: false`, the page locks
  every input, and `PUT` / `DELETE` return HTTP 409. A save while the pipeline runs also returns 409.
- **Why.** The demo serves a frozen database without raw CSVs, so a run cannot happen, and a jury member
  must not change what the pitch shows. A second run during a run would race on the same tables.

### D8. A consent gate before apply, and no modal

- **Choice.** Edits collect in a bottom bar in the dark viewer material. "Revisar y aplicar" opens the list
  of changes in place (old → new, with undo for each). "Aplicar y recalcular" stays locked until the expert
  ticks a box that says all data changes for every user of the server, and until no value is invalid.
- **Why.** The user asked for a warning that the change alters the data shown. The action affects every
  user, so the gate names the effect before the click, not after. The review sits in the bar because the
  viewer frame carries every control (DESIGN.md, "Radiology Lightbox"). A modal would hide the values
  under review (Impeccable craft floor: no modal for a task that does not need protected focus).
- **Also.** The "Zona de experto" section at the top states the effect, the file used and the way back.
  Its status cells show where the values come from and whether the data on screen uses them.

### D9. Three values per field: draft, in use, shipped

- **Choice.** The page keeps the draft (unsaved), the saved config (in use on the server) and the shipped
  defaults. A 2px ink rule marks an unsaved field. "Por defecto: X · Restaurar" shows when a value differs
  from the shipped file.
- **Why.** An expert must see what they change now, and how far the server is from the reviewed baseline.
  The ink mark follows the design rule "a new state gets a neutral": cyan means "now", band hues mean
  health, green and red mean direction.

### D10. The weights stay editable, with the warning of the closed decision

- **Choice.** The page shows the profile weights first in the editor, with a note: the weights were closed
  with the Embat CTO on 2026-09-19 (`WEIGHTS_JUSTIFICATION.md`), so change one only with a reason you can
  defend.
- **Why.** The user asked for every parameter to be editable. `WEIGHTS_JUSTIFICATION.md` §5 still gives
  the only valid reasons for a change. The page makes a change possible, not advisable.

### D11. Client presets change rules, never weights

See `PRESETS.md`. In short: each target client already has a sourced weight profile, and we found no
source that gives other weights. A preset picks that profile and changes only rules with a source number.
Presets live in `presets.yml` (config, not code). The boot applies each preset to the shipped config
and runs the D5 checks, so a bad preset stops the boot.

### D12. A sticky section menu, and the layout fix it needed

- **Choice.** A section menu sticks beside the editor from `lg`, and a strip sticks at the top below `lg`.
  It shows the section being read and counts unsaved edits for each section. A click keeps `?profile` and
  `?month` and adds the section hash.
- **Fix.** `Layout` used `overflow-hidden` on `main`, which stopped `position: sticky` below it. That rule
  also stopped the Monitor watchlist from sticking. `overflow-clip` clips the scan line in the same way
  and keeps sticky working.

## 3. Known limits and risks

| Limit | Effect | What to do |
|---|---|---|
| **No authentication on `PUT` / `DELETE /api/config`** | Outside demo mode, anyone who can reach the API can change the config for every user. | Keep the deployed demo in demo mode. Before a real deployment, put the endpoints behind authentication. |
| Last write wins | Two experts who save at the same time: the second save replaces the first. | Acceptable for a demo with one expert. A real deployment needs a version check on save. |
| Restart window | For about 0.5 s the API does not answer. The page waits for a new `bootId`. Other pages retry their queries. | None for the demo. |
| Frozen demo database | It stores the old hash format, so the page shows "Pendientes de recalcular" in demo mode. | Export the demo database again from a run on this branch before the demo. |
| Band cut-offs fixed in the UI | Bands cannot change from the page (D6). | Make `BANDS` come from `/api/meta` before bands become editable. |

## 4. Test evidence (2026-09-19)

Run on a copy of the data (backend port 8093, scratchpad data folder), with headless Chrome at 1440 px
and 390 px.

| Test | Result |
|---|---|
| `PUT` with BANK weights that sum to 105 | HTTP 400, message names the key and the sum |
| Valid `PUT` (weights, anchors, reference rate) | 202, override file holds only 3 sections, restart 0.435 s, pipeline runs again, `appliedToData` becomes true |
| `DELETE` | Override file removed, pipeline runs again with the defaults |
| Browser: edit, review, consent, apply | The bar shows each stage, then "Datos recalculados", and the page shows the new values |
| Browser: section menu | A click puts the section tab at the top (40 px on desktop, 96 px on mobile below the strip), and the current entry follows the scroll |
| Boot with a broken preset (anchors out of order) | The boot stops: "Invalid presets.yml: preset fund gives an invalid config …" |
| `./mvnw test` | 30 tests pass |
| `npm run typecheck`, `lint`, `build`, Impeccable detector | Clean |

## 5. Files

| File | Role |
|---|---|
| `backend/…/application/AlgorithmConfigUseCase.java` | View, validate, diff, write and delete the overrides (D1, D4, D5, D7) |
| `backend/…/application/PresetCatalog.java` | Load and check `presets.yml` at boot (D11) |
| `backend/…/config/ConfigFingerprint.java` | Fingerprint of the active config (D3) |
| `backend/…/infrastructure/web/controller/ConfigController.java` | `GET`, `PUT`, `DELETE /api/config`, `GET /api/config/presets` |
| `backend/…/XRayApplication.java` | `restart()` (D2) |
| `backend/src/main/resources/presets.yml` | The four presets and their sources |
| `frontend/src/pages/AlgorithmPage.tsx` | Page layout, draft state, the warning and read-only sections |
| `frontend/src/components/algorithm/*` | Fields, anchor editor, weights table, alert levels, bottom bar, section menu, presets |
| `frontend/src/lib/algorithm.ts` | Paths, diff, labels, units and bounds of every field |
