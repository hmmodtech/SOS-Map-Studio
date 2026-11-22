# SOS Emergency & Evacuation 3D Master Studio — PROGRESS.md

## System Status: PHASES 1–6 COMPLETE (Dual-Engine 3D Studio + AutoCAD CAD Suite + Offline WebGL GPU Cinema)
- **Deployment Model:** Zero-build, zero-dependency static web app hosted on GitHub Pages (`Plan B OPSEC`: **ZERO** real GPS coordinates, site layouts, village names, or staff data hardcoded in the repository).
- **Local Data Workflow:** Site KML (`SOS-Village-Clean.kml`) and master project file (`.sos.json`) stay strictly local on the operator's device.
- **Namespace:** Global `window.SOS = window.SOS || {};` with classic `<script src="js/..."></script>` tags and `?v=7` cache-busting query strings.
- **Dual 3D Engine Architecture:**
  - **Engine 1 — Architectural Perspective 3D + AutoCAD Studio (`js/engine.js`):** True 3D perspective projection (`0–100%`) with exact closed-form ground inverse (`z=0`), `3D Depth Boost (1.0x–2.5x)`, rooftop parapet walls + solar arrays + water tanks, ground entrance doors, ambient occlusion contact halos, directional sun shading, thickened masonry fence base, full AutoCAD drafting (`Edit Vertices`, `Draw Poly`, `Draw Rect`, `ORTHO F8`, `OSNAP F3`, `Grid Snap`, `Square 90°`, `Simplify`, `Offset`, `Fence-Only` & `Entire-Site` scaling).
  - **Engine 2 — Offline WebGL 3D GPU Cinema (`js/webgl3d.js`):** Native WebGL (zero-CDN) GPU renderer with `360°` Orbit up to `85°` street-level tilt, **First-Person Walk** (`WASD`/Arrows + mobile D-pad), interior multi-floor cutaway walkthrough (`Floor 1/2/3`), dynamic Sun Hour slider (`07:00–17:30`) with stencil-guarded real-time projected shadows, procedural materials (glass windows, sand grain, grass stripes, wood planks, solar grid, roof tiles, pool water), 3D glowing route ribbons, and PNG snapshot export.

---

## Repository Structure (Complete — v7)
- `index.html` — **[COMPLETE — v7]** Cyber HUD shell, all 6 modules wired (`Interiors`, `Routing`, `Signage`, `Export Village`, `AutoCAD Suite`, `WebGL 3D GPU`), `3D Perspective` & `3D Depth Boost` sliders, `?v=7` cache busting, modal keyboard guards.
- `css/style.css` — **[COMPLETE]** Single-row top HUD bar, responsive desktop & mobile layout.
- `js/state.js` — **[COMPLETE]** Full `.sos.json` persistence, 30-step undo/redo, optional draft, OPSEC wipe.
- `js/kmlParser.js` — **[COMPLETE]** KML 2.2 metric parser.
- `js/engine.js` — **[COMPLETE — v7]** Dual-theme (`cyber`/`print`), True 3D Perspective + `zBoost`, architectural rooftop/door/AO details, full AutoCAD drafting suite, dual site/fence scaling.
- `js/webgl3d.js` — **[COMPLETE — Phase 6]** Self-contained zero-CDN WebGL 3D GPU Cinema & First-Person Walk engine (injects `<style id="sos-webgl-css">`).
- `js/interior.js` — **[COMPLETE — Phase 2A]** 2D cutaway floor plan editor (multi-floor, snap, templates, stair alignment, PNG export).
- `js/routing.js` — **[COMPLETE — Phase 2B]** Fire & Shelling routing graphs, Auto-Seed, Auto-Connect, Dijkstra + evacuation times, Hazard blockage simulator, live 3D animated overlay.
- `js/signage.js` — **[COMPLETE — Phase 3 + 3D]** Context-aware A3/A4 Wall Signage Generator (3D Isometric / 2D Plan toggle, verified pure-JS ISO/IEC 18004 QR encoder `V1–V10` EC-M, editable `qrBaseUrl`, Heads-Up orientation, Dijkstra routes, 150/300 DPI PNG + Batch Export).
- `js/exporter.js` — **[COMPLETE — Phase 4 + 3D]** Standalone 3D/2D `village.html` exporter (<400 KB MikroTik-safe, zero-CDN, bilingual AR/EN, Daylight Print 3D default + 2D/Night/Gyro 360° toggles, `?loc=` & `?alert=`, 4-zone panic picker, GPS jamming guard, offline Web Audio siren, floor plan viewer, MikroTik IT helper).

---

## Verified Public API Contracts (`window.SOS`)
- `window.SOS.State`: `project`, `blank()`, `newFeature()`, `merge()`, `on()`, `emit()`, `snapshot()`, `undo()`, `redo()`, `saveProjectJSON()`, `loadProjectJSON()`, `autoSaveDraft()`, `restoreDraft()`, `clearWorkspace()`.
- `window.SOS.KMLParser`: `parse(xmlText)`.
- `window.SOS.Engine`: `init()`, `setTool()`, `getTool()`, `setAddType()`, `setYaw()`, `setPitch()`, `setPersp()`, `getPersp()`, `setZBoost()`, `getZBoost()`, `getCam()`, `nudgeYaw()`, `nudgePan()`, `isTop2D()`, `toggleTop2D()`, `setOrtho()`, `isOrtho()`, `setOsnap()`, `isOsnap()`, `setSnapGrid()`, `getSnapGrid()`, `setQuality()`, `isHQ()`, `getTheme()`, `setTheme()`, `toggleTheme()`, `setLayer()`, `toggleNorthUp()`, `fitView()`, `select()`, `getSelected()`, `deleteSelected()`, `duplicateSelected()`, `sizeOf()`, `statsOf()`, `resizeSelected()`, `squareSelected()`, `simplifySelected()`, `offsetSelected()`, `mirrorSelected()`, `alignSelectedToSite()`, `offsetFenceOnly()`, `scaleFenceOnly()`, `scaleEntireSite()`, `finishDraw()`, `cancelDraw()`, `undoDrawPoint()`, `handleCadKey()`, `attachIcon()`, `clearIcon()`, `getMeasure()`, `fmt()`, `renderModeOf()`, `project()`, `getCanvas()`, `render()`.
- `window.SOS.WebGL3D`: `open()`, `close()`, `isOpen()`.
- `window.SOS.Interior`: `open()`, `close()`, `pick()`, `isOpen()`.
- `window.SOS.Routing`: `open()`, `close()`, `isOpen()`, `setOverlayMode()`, `getOverlayMode()`, `solveDijkstra()`, `drawOn3D()`, `hasActiveAnim()`.
- `window.SOS.Signage`: `open()`, `close()`, `isOpen()`, `encodeQR()`, `drawQR()`.
- `window.SOS.Exporter`: `open()`, `close()`, `isOpen()`, `generateHtml(overrideAlert, overrideLoc)`.
