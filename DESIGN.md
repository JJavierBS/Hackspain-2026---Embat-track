---
name: X-Ray
description: Financial health scans of SMEs, read on a radiology lightbox.
colors:
  viewer: "#050b2c"
  viewer-raised: "#232845"
  viewer-rule: "#373c56"
  viewer-ink: "#ffffff"
  viewer-muted: "#a5a9bd"
  panel: "#f3f4f6"
  panel-grid: "#e8e8ed"
  film: "#ffffff"
  rule: "#d2d2db"
  ink: "#050b2c"
  ink-muted: "#53576b"
  scan: "#3878f6"
  scan-soft: "#e7efff"
  band-a: "#4338ca"
  band-b: "#0b7a88"
  band-c: "#9a6b00"
  band-d: "#c2500a"
  band-e: "#8e1b8f"
  series-level: "#7a6a55"
  series-trajectory: "#696d80"
  coral: "#f7b2a8"
  up: "#15803d"
  down: "#c62828"
typography:
  display:
    fontFamily: "HafferSQXH, Hanken Grotesk Variable, Arial, Verdana, sans-serif"
    fontSize: "6rem"
    fontWeight: 600
    lineHeight: 1
    fontVariation: "'wdth' 80"
    fontFeature: "'tnum'"
  figure:
    fontFamily: "HafferSQXH, Hanken Grotesk Variable, Arial, Verdana, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 2rem
    fontVariation: "'wdth' 85"
    fontFeature: "'tnum'"
  headline:
    fontFamily: "HafferSQXH, Hanken Grotesk Variable, Arial, Verdana, sans-serif"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.025em"
    fontVariation: "'wdth' 88"
  title:
    fontFamily: "HafferSQXH, Hanken Grotesk Variable, Arial, Verdana, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.5rem
    letterSpacing: "-0.01em"
  body:
    fontFamily: "HafferSQXH, Hanken Grotesk Variable, Arial, Verdana, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'tnum'"
  label:
    fontFamily: "HafferSQXH, Hanken Grotesk Variable, Arial, Verdana, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "'tnum'"
  caption:
    fontFamily: "HafferSQXH, Hanken Grotesk Variable, Arial, Verdana, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.25rem
    fontFeature: "'tnum'"
rounded:
  none: "0px"
  lamp: "9999px"
spacing:
  gap: "1px"
  xs: "8px"
  sm: "12px"
  md: "20px"
  lg: "24px"
  xl: "48px"
components:
  film:
    backgroundColor: "{colors.film}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "40px 20px 24px"
  film-tab:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.film}"
    typography: "{typography.title}"
    rounded: "{rounded.none}"
    padding: "4px 12px"
  film-meta:
    backgroundColor: "{colors.film}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.caption}"
    padding: "0 8px"
  nav-link:
    textColor: "{colors.viewer-muted}"
    typography: "{typography.label}"
    padding: "8px 8px"
  nav-link-active:
    textColor: "{colors.viewer-ink}"
  profile-cord:
    textColor: "{colors.viewer-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "6px 16px"
  profile-cord-active:
    backgroundColor: "{colors.viewer-ink}"
    textColor: "{colors.viewer}"
  profile-cord-hover:
    backgroundColor: "{colors.viewer-raised}"
    textColor: "{colors.viewer-ink}"
  month-select:
    backgroundColor: "{colors.viewer-raised}"
    textColor: "{colors.viewer-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "6px 8px"
  readout-cell:
    backgroundColor: "{colors.film}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    padding: "8px 12px"
  band-chip:
    textColor: "{colors.film}"
    rounded: "{rounded.none}"
    size: "32px"
  band-chip-row:
    textColor: "{colors.film}"
    rounded: "{rounded.none}"
    size: "24px"
  status-tag:
    backgroundColor: "{colors.film}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.none}"
    padding: "2px 8px"
  status-tag-critical:
    backgroundColor: "{colors.down}"
    textColor: "{colors.film}"
  question-filter:
    backgroundColor: "{colors.film}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "8px 12px"
  question-filter-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.film}"
  meter-track:
    backgroundColor: "{colors.panel-grid}"
    rounded: "{rounded.none}"
    height: "10px"
  ranking-row-hover:
    backgroundColor: "{colors.scan-soft}"
---

# Design System: X-Ray

## Embat identity layer (2026-09-19)

The Radiology Lightbox keeps its layout, films, tabs, ladder and scan line. Its tokens now follow the Embat brand (extracted with tastelabs from embat.io). These rules override the older text below where they conflict:

- **Palette.** Frame and ink are Embat Midnight Ink `#050B2C` (raised `#232845`, rule `#373C56`). Panel is `#F3F4F6`, films are white. "Scan" is Embat Action Blue `#3878F6`, and its wash is Cloud Blue `#E7EFFF`. Action Blue now also fills the primary action (Reproducir, Aplicar y recalcular). Coral `#F7B2A8` marks the demo-data flag, the one non-semantic marker.
- **Band A** moves from cobalt to indigo `#4338CA`, so a health value never reads as Action Blue (The Three Voices Rule).
- **Type.** The brand face is HafferSQXH. It is licensed and not shipped, so the stack loads it if installed and falls back to Hanken Grotesk. Hanken has no width axis: `font-stretch` values stay in the code but have no effect.
- **Shape and depth.** Films have 8px corners, a `#E8E8ED` border and the Embat level-1 shadow `0 1px 4px rgb(0 0 0 / 0.09)`. Tabs and controls have 4px corners. Joined groups (`.segmented`) round the frame, not the segments. The ink corner mark is removed. This replaces The Backlight Rule and the square-only rule for films and controls. Chips, cells and bars stay square.
- **Motion.** Controls change state over 0.3s, as on embat.io.

## Overview

**Creative North Star: "The Radiology Lightbox"**

Every company is read like a scan clipped to a lit viewer: measured, annotated with calipers, compared with the prior exam. The screen is two materials. A near-black viewer frame (the top bar and footer) carries every control: navigation, the buyer-profile cord, the 24-tick month strip and the pipeline lamp. Below it, a cool backlit panel with a visible diffuser grid holds the content, and the content sits on films: flat, pale sheets with hairline edges, a dark title tab on the top edge, two clip notches and an ink corner mark.

Density is operational, not decorative. Numbers are large, tabular and seated in fixed slots so they read from a projector. Color is rationed by meaning: five band colors name health (a 0–100 health value only), green and red name direction, and one cyan names "now" (the active month, the scan line, focus). The world refuses the white KPI-tile fintech dashboard: no rounded cards, no drop-shadow tiles, no gradient hero.

**Key Characteristics:**
- Dark viewer frame over a cool lit panel; two materials, never a third.
- Films, not cards: flat, square, hairline-edged, titled by a tab on the top rule.
- One cyan scan color marks the present moment everywhere.
- Band S–E colors carry 0–100 health values; green/red carry direction; nothing else borrows them.
- Tabular figures everywhere; the score sits in fixed numeral slots.
- One authored motion: a single scan line passes down the panel per view or profile change.

## Colors

A cold clinical palette of blue-black and backlit white, with one cyan signal and a strictly semantic set of band and direction hues.

### Primary
- **Scan Cyan** (`scan`): the present. Active month tick (with glow), active nav underline, the active-month band on every chart axis, the scan line, focus outlines, the "Listo" pipeline lamp, the stroke through the X-Ray mark.
- **Scan Wash** (`scan-soft`): text selection, and the ranking row under the pointer (at 40%).

### Secondary (semantic: health bands)
- **Violet S** (`band-s`, `#5b21b6`, the top tier ≥ 90: darker and more violet than A), **Indigo A** (`band-a`), **Teal B** (`band-b`), **Ochre C** (`band-c`), **Amber-Orange D** (`band-d`), **Plum E** (`band-e`): one hue per score band. Used only where a 0–100 health value is shown: the band letter, the 4px top stripe of each ladder rung, the lit rung's fill, the score numerals and their slot underlines, the square band chip (32px in the readout, 24px in rows), faint band zones behind trend charts (7%), the sparkline stroke (band of its last value), the Nivel meter fill, and each category's level figure and bar. A category with weight 0 keeps its band hue at 55% opacity.

### Tertiary (semantic: direction and chart series)
- **Direction Green** (`up`) / **Direction Red** (`down`): every signed change and every reading of where a company is heading. The delta and its drawn arrow (caliper, Δ 3m column, "what changed"), the Trayectoria meter (grown from the 50 mark), the arrow inside status and trend tags, driver bars (at 80%), positive/negative alert marks, the monthly alert summary bars (at 80%), the limit action and its change, the red-outlined count of negative alerts. A solid Direction Red fill with white text is reserved for critical severity: the "Crítica" status and a critical alert. Never used for a 0–100 health value.
- **Level Umber** (`series-level`) and **Trajectory Slate** (`series-trajectory`, dashed 7 4): chart series kept off cyan, the bands and green/red. The final score series is drawn in ink at 3px; each series is named by a 14px semibold label at its line end. In the two-entity overlay, A is ink and B is Trajectory Slate, both solid at 3px.

### Neutral
- **Viewer Black** (`viewer`): top bar, footer, and the html background.
- **Viewer Raised** (`viewer-raised`): hover fill and the month select inside the frame.
- **Viewer Rule** (`viewer-rule`): borders and future month ticks inside the frame.
- **Viewer Ink** (`viewer-ink`) / **Viewer Muted** (`viewer-muted`): text on the frame; muted is also elapsed month ticks.
- **Lit Panel** (`panel`) with **Diffuser Grid** (`panel-grid`): the page background and its 1px grid lines.
- **Film White** (`film`): every content sheet and cell.
- **Hairline** (`rule`): film borders, 1px gaps between cells, chart gridlines and axes.
- **Ink** (`ink`) / **Ink Muted** (`ink-muted`): text on films; ink also draws film tabs, corner marks and the caliper.

### Named Rules
**The Three Voices Rule.** Cyan means now, band hues mean health, green/red mean direction. A color never speaks for another role; a new state gets a neutral, not a borrowed band or direction hue. The one extension is critical severity, which is a solid Direction Red fill.

**The Health-Only Band Rule.** Band hues belong to 0–100 health values (Final, Nivel, category levels). Trajectory and change are direction and read in green/red, even though trajectory is also on a 0–100 scale; a status label, a link or a mode indicator never takes a band hue.

**The Full Ladder Rule.** All six bands appear together whenever bands are shown. The current band is lit (filled, white text); the others stay at rest with only their stripe and letter colored.

## Typography

**Display Font:** Archivo Variable (with Archivo, ui-sans-serif, system-ui)
**Body Font:** the same family.

**Character:** One grotesque carries everything. Width is the expressive axis: numerals and band letters are condensed (80%), page titles slightly condensed (88%), the wordmark 85%, body at normal width. `tabular-nums` is set on body, so every figure aligns.

### Hierarchy
- **Display** (600, 72px mobile / 96px desktop, line-height 1, wdth 80): the score in fixed numeral slots. The `md` readout drops to 48px.
- **Figure** (600, 24px in the ranking table, 30px in compact rows and the watchlist, wdth 85): a score seated in a row, in band color beside a 24px band chip. Stat cell values use 24px at wdth 88 in ink.
- **Headline** (600, 36px mobile / 48px desktop, tight tracking, wdth 88): page titles, one per view. Band letters in the ladder use the same size at wdth 80.
- **Title** (600, 18px / 24px, -0.01em): film tab titles.
- **Body** (400, 16px): ledes (max 62ch) and film copy.
- **Label** (400, 15px): nav, profile cord, month select, chart legend, question filters, list copy, meter labels (semibold), caliper caption.
- **Caption** (400, 14px): film meta readouts, study readout cells, ladder ranges and counts, chart ticks and line-end labels, table headers, status and trend tags (medium), secondary lines under entity names.

### Named Rules
**The Measured Figure Rule.** Numbers are tabular, formatted in Spanish (decimal comma, true minus sign "−"), and the headline score always occupies five slots sized for "100,0", with empty slots underlined in hairline.

**The Width Axis Rule.** Emphasis comes from weight 600 and a narrower width, not from uppercase, tracking or a second family.

## Layout

The page is a full-height column: viewer frame (top), lit panel (grows), viewer footer. The content column is `max-w-7xl` (1280px) with 24px side padding and 48px vertical padding; the top bar uses 16px side padding on mobile, 24px from `sm`.

The lit panel draws its diffuser grid across the full width, with the grid origin registered to the content column's left edge: columns are 1/24 of the content width, rows are 48px. Films stack with 48px gaps (the tab overhangs the top rule by half its height, so films need space above). Where two films sit side by side from `lg` (or `md` for the comparison pickers), they share the same 48px gutter in asymmetric pairs (7:5 for the alert feed and watchlist, 5:7 inside the entity radiograph for readout and chart) or halves (drivers and what-changed). Every film has `min-width: 0`, so wide content scrolls inside the film rather than stretching the page. The Monitor watchlist column is sticky (24px from the top) from `lg`.

Cells inside a film tile on a 1px hairline gap (the grid background shows through as the rule): the study readout (3 columns, 26rem wide from `md`), the band ladder (5 columns at every width), and product stat cells (1 column, 2 from `sm`, 3 or 4 from `lg`). Lists inside films are separated by hairline rules: solid for rows of entities, dashed for feed items and change notes.

Responsive behavior, observed: at `sm` the nav wraps to its own scrolling row below the wordmark; below `lg` the month strip takes its own full-width row with flexible ticks; below `md` the film meta readout drops from the top rule into a right-aligned line inside the film; below `sm` film notches hide and ladder counts drop their "entidades" word. The entity ranking is a full table (min 960px, bleeding to the film edges) from `lg`; below `lg` each entity becomes a compact row: rank and ID, name, figure and chip on the right, then Δ 3m, sparkline and status tags wrapping underneath.

**Open, not yet true of the build:** grid registration is on vertical lines only. Film tops do not snap to the 48px rows, and the columns (content/24) are not square with the rows. Do not describe the grid as fully modular until this is fixed.

## Elevation & Depth

Flat. Depth comes from material and light, never from lifted surfaces: the dark frame against the lit panel, pale films against the gridded panel, and hairline borders. The only shadows in the system are light emitted by the viewer, not cast by objects.

### Shadow Vocabulary
- **Scan glow** (`box-shadow: 0 6px 24px 4px rgb(15 163 194 / 0.28)`): trails the scan line.
- **Active tick glow** (`box-shadow: 0 0 10px 1px rgb(15 163 194 / 0.7)`): the selected month tick.
- **Lamp glow** (`box-shadow: 0 0 10px 2px <lamp color>`): the pipeline lamp when lit.

### Named Rules
**The Backlight Rule.** Glow is allowed only on things that emit light in the viewer (scan line, active tick, lamp). Films and cells never carry a shadow.

## Shapes

Square everywhere: films, tabs, cells, chips, the profile cord, the select and the band chip have no radius. The single round shape is the 8px pipeline lamp (the demo-data marker that replaces it is square). Bars (meters, driver bars, category bars, summary bars) are square-ended. Borders are 1px hairlines; 2px strokes are reserved for ink marks (film corner, caliper, nav underline, numeral slot underlines). A film's silhouette is its signature: a dark tab straddling the top edge on the left, two 16×8px notches cut into the top edge near center (from `sm`), a meta readout straddling the top edge on the right (from `md`), and a 10px ink L-bracket at the bottom-right corner.

## Components

### Film (signature)
The container for every section of content.
- **Corner Style:** square (0).
- **Background:** Film White with a 1px Hairline border.
- **Shadow Strategy:** none (see The Backlight Rule).
- **Internal Padding:** 40px top (clears the tab), 20px sides, 24px bottom. A plain untitled film uses 20px all round.
- **Tab:** Ink fill, Film White title text (Title role), 4px 12px padding, 20px from the left, centered on the top rule.
- **Tab width:** capped at the film width minus 120px so it never collides with the meta.
- **Meta:** Caption in Ink Muted on a Film White knockout, 20px from the right, centered on the top rule; states the film's measurement, scale, count or comparison month. Below `md` it drops inside the film as a right-aligned muted line.
- **Notches:** two clip notches filled with the panel color, bordered on three sides.

### Band Ladder (signature)
Five equal rungs on a 1px hairline gap. Each rung: a 4px band-color stripe on top, the letter (Headline size, wdth 80) in band color, the range in Caption, then the count. The lit rung fills with its band color and switches text to white (ranges at 85% white). Unknown counts show an em dash, never zero.

### Score Readout (signature)
Score numerals in band color across five fixed slots with 2px underlines, a 32px square band chip beside them, then a caliper: a 2px ink bracket enclosing the delta (30px, direction color, drawn arrow) and a 15px muted caption naming the comparison month.

### Delta
A signed change: a 15px drawn arrow (up, down or flat) and the figure with a true minus sign, semibold, in Direction Green, Direction Red or Ink Muted for flat (|Δ| ≤ 0,05). Used wherever a change is stated.

### Meter
A 0–100 reading on a 10px square Diffuser Grid track with a 1px ink mark at 50 that overhangs the track by 4px. Label (15px semibold) left, figure (24px semibold) right, optional muted hint below. Health mode (Nivel) fills from 0 in the band color. Direction mode (Trayectoria) grows from the 50 mark toward the value in green or red, and the figure carries the direction arrow.

### Status and Trend Tags
Square hairline-bordered tags, Caption size, medium weight, 2px 8px. The status tag carries a green or red arrow for improving or declining states; "Crítica" is the only filled tag (Direction Red fill, white text). The trend tag reads direction from the trajectory with the meter's 50 mark and a ±5 dead zone ("Tendencia al alza / a la baja / plana"). Regime and confidence use the same neutral tag. The same shape carries alert severity in the feed: critical filled red, warning red-outlined, positive green-outlined, information neutral.

### Sparkline
112×32px, 12 months of the final score: a 2px round-joined line in the band color of its last value, a 2.75px dot at the end, and a dashed hairline at 50. Fewer than two points shows an em dash.

### Question Filters
The status filters sit inside the Ranking film, as a bar above the table header ruled off by a 20% ink line: a muted "Filtrar" label, a "Todas" chip that clears every filter, one chip per status question (with the Estado column's green/red arrow where the status has a direction), and on FUND the rising-star chip. Below `sm` the bar scrolls sideways instead of wrapping. Chips are toggle buttons (Label size, 6px 12px): Film fill with a 25% ink border at rest, full ink border on hover, inverted to Ink fill with Film text when pressed. Each carries a count in a small Lit Panel cell (inverted when pressed). A question with no matches is disabled at 45% opacity. The Monitor direction switch uses the same ink inversion as a joined segmented group.

### Ranking Table
Hairline-ruled rows, muted Caption headers over a 20% ink rule, sortable headers in muted text that turn ink and semibold when active with a 14px sort arrow. Each row: rank, name (semibold, underlined on row hover) over a muted ID line, figure plus 24px band chip, Delta, sparkline, Nivel, Trayectoria, alert count, status tag, confidence. Row hover washes in Scan Wash at 40%.

### Bars
Driver bars diverge from a 1px ink center line, green right and red left at 80%, with the signed contribution at the right and a hairline-ruled sum line below. Category bars are 8px band-colored fills on a Diffuser Grid track under a label, weight and level figure. Monthly alert summary bars are 12px green/red fills with their counts.

### Load State
Loading and error share the film frame so the page does not jump: three Diffuser Grid skeleton bars (20px, 90/72/54% wide) under a "Cargando" tab, or a "No se pudo cargar" film with the message and a muted hint.

### Navigation
Top-bar links in Label size, Viewer Muted at rest, Viewer Ink on hover, active state in semibold Viewer Ink with a 2px Scan Cyan underline. On mobile the nav becomes a horizontally scrolling row.

### Profile Cord
A segmented radio group with a Viewer Rule border. Inactive segments are Viewer Muted text on the frame and turn Viewer Raised on hover; the active segment inverts to Viewer Ink fill with Viewer text, semibold.

### Month Strip
A month stepper and a 24-tick strip. The stepper is a joined group (previous, readout, next): the readout names the month in words ("Agosto 2026", semibold) with its M-code in Viewer Muted, at a fixed width so it never jumps. The readout is also a button with a chevron: it opens a month grid on Viewer Black under the stepper, one row per year split into two lines of six month slots (ene…dic). Months outside the data are empty Viewer Rule labels; the selected month is filled in Scan with its glow. Arrows move one month (up/down half a year), Escape or a click outside closes it and returns focus to the readout. The strip groups the ticks by year: each year has its label above (Viewer Ink semibold for the selected month's year) and its ticks stand on a Viewer Rule baseline, separated from the next year by a 12px gap. Elapsed months are 14px Viewer Muted ticks, future months 8px Viewer Rule ticks, hover grows any tick to 20px in Viewer Ink and names the month in a small Viewer Raised label below it, and the selected month is a 28px, 5px-wide Scan tick with glow. Arrow keys step, Home and End jump to the ends.

### Pipeline Lamp
A hairline-bordered status chip in the frame: an 8px round lamp, "Pipeline" in muted text, the state in medium weight. In demo mode a "Datos de demostración" marker takes its slot.

### Study Readout
A 3-cell definition grid on hairline gaps (Vista, Producto, Mes): Caption muted term above a semibold value; the month also shows its M-code in muted.

### Trend Chart
Faint band zones behind the plot, dashed horizontal hairline grid, a 14px-wide translucent Scan Cyan band on the active month, series in Ink (final, 3px), Level Umber and Trajectory Slate (dashed), 14px muted tick labels, and a legend above the plot in Label size.

### Pending Film
An unexposed film: a muted "Sin datos todavía" line and a two-column list of what will appear, each item on a dashed hairline with a small hollow square marker. Pending filter chips use a dashed muted border, square, Label size. Dashed means "not yet exposed", only.

### Algorithm Page Components (expert configuration, 2026-09-19)
Decisions and reasons: `docs/ALGORITHM_PAGE.md`. All reuse the existing materials: no new colour, no radius, no shadow.
- **Field Cell:** a parameter on the hairline cell grid (1, 2 from `sm`, 3 from `lg`). Label 15px semibold, optional muted hint, a square hairline input (18px semibold, wdth 88, tabular, cyan caret), unit in muted caption. An unsaved value gets a full ink border on the input and a 2px ink rule on the cell top. An invalid value gets a 2px ink border and a semibold ink message; errors stay neutral (The Three Voices Rule). "Por defecto: X · Restaurar" appears in muted caption only when the value differs from the shipped file.
- **Anchor Curve:** the level curve of an indicator, 320×136 viewBox. Faint band zones (7 %) behind the plot because the output is a 0–100 health level, dashed hairline at 50, the curve in ink 2.5px with 7px square hollow points, dotted ink extensions for the clamped ends, and the comparison curve dashed in ink muted. Points are edited in a vertical Valor / Nivel table beside it.
- **Weights Table:** categories by profile. Weight bars are ink (35 %, full ink when unsaved), never a band hue, because a weight is not a health value. The λ bar splits Level Umber and Trajectory Slate, the two chart series colours for level and trajectory.
- **Change Tray:** a fixed bottom bar in viewer material (the frame carries every control). Summary in viewer ink, actions as a text button, an outlined button and an inverted primary. The review list and the consent checkbox open in place above the actions. While the backend works, the tray shows the pipeline lamp vocabulary (amber pulse, then cyan when the data is ready) and a 4px progress rule.
- **Section Menu:** a sticky column from `lg` (top 24px) and a sticky scrolling strip below `lg`. Cells on a hairline gap. The section being read inverts to ink with film text, like a pressed question filter. An unsaved count sits in a small ink cell (inverted inside the active entry).
- **Preset Cards and Dossier:** four presets on the hairline cell grid (1, 2 from `sm`, 4 from `xl`). The open card inverts to ink. The dossier below has a 1px ink border, a close button, then one row per value: "En uso ahora" against "Con el preset" as readout cells (or an Anchor Curve), a status tag (solid hairline for "Con fuente", dashed for "Derivado" and "Sin fuente": dashed means not yet exposed), the reason, and each source as a citation with a 1px ink rule at 30 %, the exact quote, a linked publisher and title, and the read date.
- **Sector Tuning (Entity page, 2026-09-19):** a film titled "Ajuste por sector" after the radiograph. The sector picker is a radiogroup of five cells on the hairline grid (1, 2 from `sm`, 5 from `lg`): "Sin ajuste" plus four sectors. The chosen cell inverts to ink, like an open preset card. The result pairs "Publicada" and the tuned score as two readout cells with band figures and chips (stacked below 26rem), a Delta with the band sentence, the three-profile table (the active profile is marked by a 3px ink bar, never recoloured) and a two-series chart: published in ink, tuned in Trajectory Slate, both 3px, as in the Compare overlay. Each sector change is a row: a square ink checkbox (on by default) with the indicator name, the status tag, Valor / Nivel general / Nivel sector cells, and an Anchor Curve. A change turned off drops to 45 % opacity.
- **Anchor Curve entity mark:** the raw value of the entity this month is a 2px Scan line across the plot (Scan means "now"). A value past the axis sits on the edge, where the clamped level is the same.
- **Draft Preview (Algorithm page):** the same score pair, table and chart, labelled "Con el borrador", under an entity select. In demo mode the Change Tray shows "Probar en una entidad", names its review button "Revisar cambios", and keeps "Aplicar y recalcular" disabled with a visible reason line. "Recalcular ahora" is disabled in the same way.
- **Expert Warning:** a normal film titled "Zona de experto" with a drawn warning triangle in ink (never red: it is a caution, not a critical severity), a 24px semibold statement, the consequences as a muted list, and status cells on a hairline gap.

## Do's and Don'ts

### Do:
- **Do** put every content section on a film with a tab title; use the meta slot to state what is measured.
- **Do** show the full S–E ladder whenever bands appear, lighting only the current band.
- **Do** mark the active month in Scan Cyan on every time axis.
- **Do** set figures tabular, in Spanish format, with a true minus sign.
- **Do** tile cells on a 1px hairline gap instead of separate bordered boxes.
- **Do** color 0–100 health values by band and trajectory or change by direction; a meter in direction mode grows from 50.
- **Do** show loading and error states inside a film so the layout holds.
- **Do** keep emphasis to weight 600 plus a narrower width.
- **Do** disable the scan line under `prefers-reduced-motion`.

### Don't:
- **Don't** round corners on films, cells, chips or controls; the lamp is the only circle.
- **Don't** cast shadows from films or cells; glow belongs only to light sources in the viewer.
- **Don't** use green or red for a health value or decoration; they are direction, and a solid red fill means critical severity only.
- **Don't** use Scan Cyan for anything other than "now", focus and the viewer's own light.
- **Don't** use band hues outside 0–100 health values (not for status labels, links or mode markers), or chart series hues that collide with cyan, a band or green/red.
- **Don't** add a second authored animation; the scan line is the one moment.
- **Don't** show zero for a missing value; show an em dash.
