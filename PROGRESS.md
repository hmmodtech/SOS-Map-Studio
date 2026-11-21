# SOS Emergency & Evacuation 3D Master Studio — PROGRESS.md

## System Status: PHASES 1–5 COMPLETE (3D Studio + AutoCAD Architectural Drafting Suite)
- **Deployment Model:** Zero-build, zero-dependency static web app hosted on GitHub Pages (`Plan B OPSEC`: **ZERO** real GPS coordinates, site layouts, village names, or staff data hardcoded in the repository).
- **Local Data Workflow:** Site KML (`SOS-Village-Clean.kml`) and master project file (`.sos.json`) stay strictly local on the operator's device.
- **Namespace:** Global `window.SOS = window.SOS || {};` with classic `<script src="js/..."></script>` tags and `?v=6` cache-busting query strings.
- **Dual Visual Identity:**
  - **Master Studio (`cyber` default + `print` toggle + `2D CAD Top` / `3D Iso` toggle):** Dark Neon Matrix Cyber HUD + Daylight Print Architectural canvas.
  - **Wall Signage & Village Field Edition (`print` 3D Isometric default + `2D` & `Night` toggles):** Coloured 3D architectural styling with bilingual AR/EN UI.

---

## Repository Structure (Complete — v6)
- `index.html` — **[COMPLETE — v6]** Cyber HUD shell, all modules active (`Interiors`, `Routing`, `Signage`, `Export Village`), AutoCAD toolbar (`Edit Vertices`, `Draw Poly`, `Draw Rect`, `ORTHO F8`, `OSNAP F3`, `Grid Snap`, `2D CAD Top`), `Site & Fence CAD` panel (Option A Fence-only + Option B Entire-Site scaling), Inspector CAD modifiers (`Square 90°`, `Simplify`, `Offset`, `Align Site`, `Mirror H/V`, `Clone`, live Area/Perimeter telemetry), laptop keyboard navigation (`Arrows`, `Q/E`, `Ctrl+D`, `F3`, `F8`), `?v=6` cache busting.
- `css/style.css` — **[COMPLETE]** Single-row top HUD bar, responsive desktop & mobile layout.
- `js/state.js` — **[COMPLETE]** Full `.sos.json` persistence, 30-step undo/redo, optional draft, OPSEC wipe.
- `js/kmlParser.js` — **[COMPLETE]** KML 2.2 metric parser.
- `js/engine.js` — **[COMPLETE — Phase 5 AutoCAD Suite]** Dual-theme (`cyber` / `print`) 3D/2D engine + full architectural CAD suite:
  - Interactive `vertices` editor (drag corners, click `+` midpoint handle to insert, `Alt+Click` or double-click to delete, live edge lengths & area/perimeter).
  - `draw_poly` (live length/angle rubber-band + direct keyboard numeric length entry in meters + Enter) and `draw_rect` (2-point view-aligned 90° rectangle).
  - `OSNAP` (magnetic `END` vertex, `MID` edge midpoint, `CLOSE` start ring), `ORTHO` (view/site-aligned 90° lock), metric `Grid Snap`, `CAD Dimensions` layer.
  - Geometry modifiers: `squareSelected()` (area-preserving 90° rectify — auto-straightens `Interiors` outer walls), `simplifySelected()` (closed-ring RDP), `offsetSelected()` (CCW/CW normal offset with miter clamp), `mirrorSelected()`, `alignSelectedToSite()`, `duplicateSelected()`.
  - Dual site scaling: `offsetFenceOnly()`, `scaleFenceOnly()`, and `scaleEntireSite()` (scales features, routes & exterior signage pins uniformly with undo support).
- `js/interior.js` — **[COMPLETE — Phase 2A]** 2D cutaway floor plan editor (multi-floor, snap, templates, stair alignment, PNG export).
- `js/routing.js` — **[COMPLETE — Phase 2B]** Fire & Shelling routing graphs, Auto-Seed, Auto-Connect, Dijkstra + evacuation times, Hazard blockage simulator, live 3D animated overlay.
- `js/signage.js` — **[COMPLETE — Phase 3 + 3D Upgrade]** Context-aware A3/A4 Wall Signage Generator (3D Isometric / 2D Plan toggle, verified pure-JS ISO/IEC 18004 QR encoder `V1–V10` EC-M, editable `qrBaseUrl`, Heads-Up orientation, Dijkstra routes, 150/300 DPI PNG + Batch Export).
- `js/exporter.js` — **[COMPLETE — Phase 4 + 3D Upgrade]** Standalone 3D/2D `village.html` exporter (<400 KB, zero-CDN, bilingual AR/EN, Daylight Print 3D default + 2D/Night/Gyro 360° toggles, `?loc=` & `?alert=`, 4-zone panic picker, GPS jamming guard, offline Web Audio siren, floor plan viewer, MikroTik IT helper).
