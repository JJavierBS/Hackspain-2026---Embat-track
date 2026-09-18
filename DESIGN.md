---
name: X-Ray
description: Financial health scans of SMEs, read on a radiology lightbox.
colors:
  viewer: "#0d1b26"
  viewer-raised: "#16293a"
  viewer-rule: "#2a4052"
  viewer-ink: "#e4edf3"
  viewer-muted: "#8fa6b8"
  panel: "#eef3f7"
  panel-grid: "#dde6ed"
  film: "#fbfcfd"
  rule: "#cfdae3"
  ink: "#0d1b26"
  ink-muted: "#4a5d6d"
  scan: "#0fa3c2"
  scan-soft: "#d3eff5"
  band-a: "#1f5fd1"
  band-b: "#0b7a88"
  band-c: "#9a6b00"
  band-d: "#c2500a"
  band-e: "#8e1b8f"
  series-level: "#7a6a55"
  series-trajectory: "#4f6a8f"
  up: "#15803d"
  down: "#c62828"
typography:
  display:
    fontFamily: "Archivo Variable, Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "6rem"
    fontWeight: 600
    lineHeight: 1
    fontVariation: "'wdth' 80"
    fontFeature: "'tnum'"
  headline:
    fontFamily: "Archivo Variable, Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.025em"
    fontVariation: "'wdth' 88"
  title:
    fontFamily: "Archivo Variable, Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.5rem
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Archivo Variable, Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'tnum'"
  label:
    fontFamily: "Archivo Variable, Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "'tnum'"
  caption:
    fontFamily: "Archivo Variable, Archivo, ui-sans-serif, system-ui, sans-serif"
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
---

# Design System: X-Ray

## Overview

**Creative North Star: "The Radiology Lightbox"**

Every company is read like a scan clipped to a lit viewer: measured, annotated with calipers, compared with the prior exam. The screen is two materials. A near-black viewer frame (the top bar and footer) carries every control: navigation, the buyer-profile cord, the 24-tick month strip and the pipeline lamp. Below it, a cool backlit panel with a visible diffuser grid holds the content, and the content sits on films: flat, pale sheets with hairline edges, a dark title tab on the top edge, two clip notches and an ink corner mark.

Density is operational, not decorative. Numbers are large, tabular and seated in fixed slots so they read from a projector. Color is rationed by meaning: five band colors name health, green and red name direction only, and one cyan names "now" (the active month, the scan line, focus). The world refuses the white KPI-tile fintech dashboard: no rounded cards, no drop-shadow tiles, no gradient hero.

**Key Characteristics:**
- Dark viewer frame over a cool lit panel; two materials, never a third.
- Films, not cards: flat, square, hairline-edged, titled by a tab on the top rule.
- One cyan scan color marks the present moment everywhere.
- Band A–E colors carry health; green/red carry direction; nothing else borrows them.
- Tabular figures everywhere; the score sits in fixed numeral slots.
- One authored motion: a single scan line passes down the panel per view or profile change.

## Colors

A cold clinical palette of blue-black and backlit white, with one cyan signal and a strictly semantic set of band and direction hues.

### Primary
- **Scan Cyan** (`scan`): the present. Active month tick (with glow), active nav underline, the active-month band on every chart axis, the scan line, focus outlines, the "Listo" pipeline lamp, the stroke through the X-Ray mark.
- **Scan Wash** (`scan-soft`): text selection only.

### Secondary (semantic: health bands)
- **Cobalt A** (`band-a`), **Teal B** (`band-b`), **Ochre C** (`band-c`), **Amber-Orange D** (`band-d`), **Plum E** (`band-e`): one hue per score band. Used for the band letter, the 4px top stripe of each ladder rung, the lit rung's fill, the score numerals and their slot underlines, the square band chip, and faint band zones behind trend charts.

### Tertiary (semantic: direction and chart series)
- **Direction Green** (`up`) / **Direction Red** (`down`): the delta and its drawn arrow in the caliper. Never used for health, backgrounds or status.
- **Level Umber** (`series-level`) and **Trajectory Slate** (`series-trajectory`, dashed 7 4): chart series kept off cyan, the bands and green/red. The final score series is drawn in ink at 3px.

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
**The Three Voices Rule.** Cyan means now, band hues mean health, green/red mean direction. A color never speaks for another role; a new state gets a neutral, not a borrowed band or direction hue.

**The Full Ladder Rule.** All five bands appear together whenever bands are shown. The current band is lit (filled, white text); the others stay at rest with only their stripe and letter colored.

## Typography

**Display Font:** Archivo Variable (with Archivo, ui-sans-serif, system-ui)
**Body Font:** the same family.

**Character:** One grotesque carries everything. Width is the expressive axis: numerals and band letters are condensed (80%), page titles slightly condensed (88%), the wordmark 85%, body at normal width. `tabular-nums` is set on body, so every figure aligns.

### Hierarchy
- **Display** (600, 72px mobile / 96px desktop, line-height 1, wdth 80): the score in fixed numeral slots. The `md` readout drops to 48px.
- **Headline** (600, 36px mobile / 48px desktop, tight tracking, wdth 88): page titles, one per view. Band letters in the ladder use the same size at wdth 80.
- **Title** (600, 18px / 24px, -0.01em): film tab titles.
- **Body** (400, 16px): ledes (max 62ch) and film copy.
- **Label** (400, 15px): nav, profile cord, month select, chart legend, chips, caliper caption.
- **Caption** (400, 14px): film meta readouts, study readout cells, ladder ranges and counts, chart ticks.

### Named Rules
**The Measured Figure Rule.** Numbers are tabular, formatted in Spanish (decimal comma, true minus sign "−"), and the headline score always occupies five slots sized for "100,0", with empty slots underlined in hairline.

**The Width Axis Rule.** Emphasis comes from weight 600 and a narrower width, not from uppercase, tracking or a second family.

## Layout

The page is a full-height column: viewer frame (top), lit panel (grows), viewer footer. The content column is `max-w-7xl` (1280px) with 24px side padding and 48px vertical padding; the top bar uses 16px side padding on mobile, 24px from `sm`.

The lit panel draws its diffuser grid across the full width, with the grid origin registered to the content column's left edge: columns are 1/24 of the content width, rows are 48px. Films stack in a single column with generous vertical gaps (the tab overhangs the top rule by half its height, so films need space above).

Cells inside a film tile on a 1px hairline gap (the grid background shows through as the rule): the study readout (3 columns, 26rem wide from `md`), the band ladder (5 columns at every width).

Responsive behavior, observed: at `sm` the nav wraps to its own scrolling row below the wordmark; below `lg` the month strip takes its own full-width row with flexible ticks; below `md` the film meta readout drops from the top rule into a right-aligned line inside the film; below `sm` film notches hide and ladder counts drop their "entidades" word.

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

Square everywhere: films, tabs, cells, chips, the profile cord, the select and the band chip have no radius. The single round shape is the 8px pipeline lamp. Borders are 1px hairlines; 2px strokes are reserved for ink marks (film corner, caliper, nav underline, numeral slot underlines). A film's silhouette is its signature: a dark tab straddling the top edge on the left, two 16×8px notches cut into the top edge near center (from `sm`), a meta readout straddling the top edge on the right (from `md`), and a 10px ink L-bracket at the bottom-right corner.

## Components

### Film (signature)
The container for every section of content.
- **Corner Style:** square (0).
- **Background:** Film White with a 1px Hairline border.
- **Shadow Strategy:** none (see The Backlight Rule).
- **Internal Padding:** 40px top (clears the tab), 20px sides, 24px bottom. A plain untitled film uses 20px all round.
- **Tab:** Ink fill, Film White title text (Title role), 4px 12px padding, 20px from the left, centered on the top rule.
- **Meta:** Caption in Ink Muted on a Film White knockout, 20px from the right, centered on the top rule; states the film's measurement or scale.
- **Notches:** two clip notches filled with the panel color, bordered on three sides.

### Band Ladder (signature)
Five equal rungs on a 1px hairline gap. Each rung: a 4px band-color stripe on top, the letter (Headline size, wdth 80) in band color, the range in Caption, then the count. The lit rung fills with its band color and switches text to white (ranges at 85% white). Unknown counts show an em dash, never zero.

### Score Readout (signature)
Score numerals in band color across five fixed slots with 2px underlines, a 32px square band chip beside them, then a caliper: a 2px ink bracket enclosing the delta (30px, direction color, drawn arrow) and a 15px muted caption naming the comparison month.

### Navigation
Top-bar links in Label size, Viewer Muted at rest, Viewer Ink on hover, active state in semibold Viewer Ink with a 2px Scan Cyan underline. On mobile the nav becomes a horizontally scrolling row.

### Profile Cord
A segmented radio group with a Viewer Rule border. Inactive segments are Viewer Muted text on the frame and turn Viewer Raised on hover; the active segment inverts to Viewer Ink fill with Viewer text, semibold.

### Month Strip
24 radio ticks (3px wide, 3px apart), one per month, with a year label above each January. Elapsed months are 16px Viewer Muted ticks, future months 12px Viewer Rule ticks, hover grows any tick to 24px in Viewer Ink, and the selected month is a 32px, 5px-wide Scan Cyan tick with glow. Arrow keys step through months. A square month select sits beside it as the precise fallback.

### Pipeline Lamp
A hairline-bordered status chip in the frame: an 8px round lamp, "Pipeline" in muted text, the state in medium weight.

### Study Readout
A 3-cell definition grid on hairline gaps (Vista, Producto, Mes): Caption muted term above a semibold value; the month also shows its M-code in muted.

### Trend Chart
Faint band zones behind the plot, dashed horizontal hairline grid, a 14px-wide translucent Scan Cyan band on the active month, series in Ink (final, 3px), Level Umber and Trajectory Slate (dashed), 14px muted tick labels, and a legend above the plot in Label size.

### Pending Film
An unexposed film: a muted "Sin datos todavía" line and a two-column list of what will appear, each item on a dashed hairline with a small hollow square marker. Pending filter chips use a dashed muted border, square, Label size. Dashed means "not yet exposed", only.

## Do's and Don'ts

### Do:
- **Do** put every content section on a film with a tab title; use the meta slot to state what is measured.
- **Do** show the full A–E ladder whenever bands appear, lighting only the current band.
- **Do** mark the active month in Scan Cyan on every time axis.
- **Do** set figures tabular, in Spanish format, with a true minus sign.
- **Do** tile cells on a 1px hairline gap instead of separate bordered boxes.
- **Do** keep emphasis to weight 600 plus a narrower width.
- **Do** disable the scan line under `prefers-reduced-motion`.

### Don't:
- **Don't** round corners on films, cells, chips or controls; the lamp is the only circle.
- **Don't** cast shadows from films or cells; glow belongs only to light sources in the viewer.
- **Don't** use green or red for health, status or decoration; they are direction only.
- **Don't** use Scan Cyan for anything other than "now", focus and the viewer's own light.
- **Don't** use band hues outside band meaning, or chart series hues that collide with cyan, a band or green/red.
- **Don't** add a second authored animation; the scan line is the one moment.
- **Don't** show zero for a missing value; show an em dash.
