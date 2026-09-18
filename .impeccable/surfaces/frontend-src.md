---
version: 1
slug: "frontend-src"
primary_target: "frontend/src"
related_targets: []
---

# X-Ray app shell

Scope: the whole web app (top bar, layout, the five route shells). Mode: Operate.
Audience: bank credit managers, fund managers, insurers, the Embat jury on a projector.
Task: pick a buyer profile and a month, read score, band and direction at a glance, drill into one entity.
Constraints: light theme, Spanish copy, green/red only for direction, one color per band A–E, numbers readable at projector distance. Phase 1 has no score data: shells show the frame, the band ladder and honest empty states.

## Direction contract

THESIS: Each company is read like a scan on a lit viewer: measured, annotated with calipers, compared with the prior exam. It refuses the white KPI-tile fintech dashboard.

OWN-WORLD: Cool backlit white panel (#F3F6F9 family) inside a near-black "viewer frame" top bar (#0D1B26). Content sits on "films": flat panels with a small top tab label and film-clip notches, hairline scan rules, no drop-shadow cards. Band colors A cobalt, B teal, C ochre, D amber-orange, E plum. Direction: green ▲ / red ▼ drawn icons. One cyan scan band marks the active month on every time axis. Tabular figures everywhere.

STORY: The viewer sees who is healthy and where each one is heading, believes it because every number shows its measurement, and opens one film to read why.

FIRST VIEWPORT: Dark viewer strip: X-Ray wordmark, nav, profile switch (the single cord), month scrubber as a 24-tick exposure strip with the selected month lit, exposure (pipeline) lamp. Below, the lit panel: page title large, then the always-visible A–E band ladder, then the film grid.

FORM: Radiology Lightbox, position 6 of my ordered list, seed key 2f05756b. Raises: fixed numeral slots (seven-segment), full band ladder lit (cathode), one shared time axis (deep dive), profile as single cord (cape), visible modular grid (Kraftwerk).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
