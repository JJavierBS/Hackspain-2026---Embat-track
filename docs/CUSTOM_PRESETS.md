# CUSTOM_PRESETS — presets propios, one entity at a time

Status: added on 2026-09-20, branch `feat/custom-presets`. Decision: `DECISIONS.md` P8.
Source files: `frontend/src/lib/customPresets.ts`, `frontend/src/lib/presetValues.ts`,
`frontend/src/components/tuning/CustomPresets.tsx`, `frontend/src/components/tuning/CustomPresetEditor.tsx`.
UI: the film "Presets propios" on the Entity page, after "Ajuste por sector". No new endpoint.
Only the four sector presets are offered as a starting point: the client presets stay on the Algorithm page.

## 1. What it does

The catalogue holds four client presets (`PRESETS.md`) and four sector presets (`SECTOR_PRESETS.md`).
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

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| C1 | A custom preset is per entity. Each group or company owns its list. | The client tries a rule against a company it knows. A global catalogue already exists for a whole client type. |
| C2 | The presets live in memory, for as long as the tab lives. Nothing is written. | Production serves precomputed data in demo mode and refuses a config write (`DECISIONS.md` B3). A file would also need a volume that the deploy does not have. The film states the limit in its first paragraph. |
| C3 | A preset may change any editable section except `profiles`. The weights are not offered. | The profile weights are closed with the Embat CTO (W1–W3). Everything else is already editable from the Algorithm page (`ALGORITHM_PAGE.md`). |
| C4 | The what-if uses the endpoint that exists: `POST /api/entities/{id}/tuning` with `config`. | That request already runs `PanelScoring` on one entity with a draft config and writes nothing (P7). No backend change, so demo mode keeps working. |
| C5 | Each value states its evidence with the same three words as the catalogue. | A client value must not look like a sourced one. `Sin fuente` is the default, and its tag is dashed, as everywhere else in the UI. |
| C6 | The editors are the ones the Algorithm page already uses (`IndicatorRow`, `FieldCell`, `BandMapField`), through an `AlgorithmContext` whose draft is the preset. | One editor for one job. The bounds, the messages and the "Por defecto · Restaurar" line come for free, and the page cannot drift from `/algorithm`. |

## 3. What a preset holds

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

## 4. Limits to state if asked

- **A reload empties the list.** The choice of 2026-09-20 was memory, not a file and not the browser
  store. A client that wants to keep a preset copies its values into `presets.yml` (`PRESETS.md` §5).
- **Nothing else changes.** The portfolio, the monitor, the products and every other entity keep the
  published score, as with the sector tuning.
- **The weights are absent by design.** A preset that needs a different weight is a new profile, and
  that reopens W1–W3.
- **The evidence is the client's.** X-Ray prints what the client wrote and checks nothing.

## 5. How to add a new editable value

`frontend/src/lib/presetValues.ts` builds the list the picker offers, from `FIELDS`, `ALERT_LEVELS`,
`SECTIONS` and the indicator labels of `lib/format.ts`. A new config field with a `FIELDS` entry appears
in the picker with no further change.
