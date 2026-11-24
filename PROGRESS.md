# AJ-GeoCAD Studio — PROGRESS.md

## System Status
- **Production Baseline:** `v12 COMPLETE` (3D Architectural, GIS & AutoCAD Platform — backwards-compatible with `.ajcad.json`, `.sos.json`, and generic `.json` project files).
- **Active Feature Branch (`feature-satellite-composer`):** `v13 — Phase 1 VERIFIED` (Isolated Realistic Satellite Patch & Poster Composer Module — `js/satComposer.js`).
- **Deployment Model:** Zero-build, zero-dependency static web app hosted on GitHub Pages (`OPSEC`: **ZERO** real GPS coordinates, site layouts, village names, or staff data hardcoded in the repository).
- **Dual Studio UI Themes:**
  - **Cyber HUD (Permanent Visual Identity):** Deep Navy (`#060d18` / `#0a1626`), Dark Petrol borders (`#1b3b57`), Aqua-to-Cyber-Green gradient (`#00b4d8 → #00ff9d`) with Soft Neon Bloom, Muted Gray-Blue (`#7f9bb5`) body text, and Desaturated Green (`#78b5a0`) section headers.
  - **Daylight Design Mode (`UI: Daylight`):** High-contrast daylight UI (`#eef3f8` / `#f8fafc` / `#0f172a`) saved in `localStorage` (`aj_geocad_ui`) and synced with the Daylight architectural map view.

---

## Baseline Reconciliation (`v10` ➔ `v12` Pre-Module State)
- Reconciled documentation gap between prior `PROGRESS.md` (`v10`) and deployed repository assets (`?v=12`):
  - `index.html` (`?v=12`): Added `#projName` site title input synced with `St.project.meta.name` and page `<title>`, plus automatic `MutationObserver` (`scanModalTree`) applying Daylight Design Mode chrome to all sub-editor modals (`Interiors`, `Routing`, `Signage`, `Exporter`, `WebGL3D`).
  - Core modules verified at `?v=12`: `css/style.css`, `js/state.js`, `js/kmlParser.js`, `js/engine.js`, `js/interior.js`, `js/routing.js`, `js/signage.js`, `js/exporter.js`, `js/webgl3d.js`.

---

## Changelog — `feature-satellite-composer`

### Phase 1 (`v13`) — Verified: 2026-11-24
- **Modified Files & Minimal Integration Hooks:**
  1. `index.html`:
     - Added `<button id="btnSat" class="amb">` in `#hud` after `#btnExp`.
     - Updated cache-busting tag `js/state.js?v=13` and loaded isolated module `<script src="js/satComposer.js?v=13"></script>`.
     - Bound `$('btnSat').onclick` to `S.SatComposer.open()`.
     - Added `|| (S.SatComposer && S.SatComposer.isOpen())` guard to global `keydown` listener to prevent CAD shortcut collisions.
  2. `js/state.js` (`?v=13`):
     - `saveProjectJSON()`: Appends optional `satStudio` payload to exported `.ajcad.json` only (with `> 30 MB` warning prompt offering full vs. lightweight export) without polluting `St.project`, `undoStack`, or `localStorage`.
     - `loadProjectJSON()` & `restoreDraft()`: Extracts and deletes `p.satStudio` prior to `self.merge(p)`, forwarding it inside `try/catch` to `S.SatComposer.importState(...)` for 100% backwards compatibility with legacy `.ajcad.json` / `.sos.json` files.
     - `clearWorkspace()`: Emits `clear` event so `Clear (OPSEC)` wipes `SatComposer` RAM and `IndexedDB`.
- **Added Files:**
  - `js/satComposer.js` (`?v=13`): Fully isolated `window.SOS.SatComposer` module (`z-index: 945`) inheriting Cyber HUD / Daylight CSS variables.
- **Verified Features (Phase 1):**
  - Full-resolution, zero-compression `01_Base_Satellite` import (`naturalWidth × naturalHeight` preserved; verified with `1564 × 1006 px` test image).
  - Smooth pan/zoom viewport (`Fit`, `100% 1:1`, wheel zoom toward cursor, pinch zoom).
  - Two-point metric scale calibration (`px/m`) + live metric scale bar + metric measure tool.
  - Serialized, race-safe `IndexedDB` persistence (`aj_geocad_sat_idb_v1` with `opGen` token + `idbQueue`) and internal `Undo/Redo` (`Ctrl+Z` / `Ctrl+Y`).
- **Zero-Regression Verification (Phase 1):**
  - `Sat Studio` button opens/closes cleanly on `feature-satellite-composer`.
  - Browser Console verified free of errors.
  - All existing `AJ-GeoCAD Studio` features confirmed intact (2D CAD, 3D/WebGL, KML, Signage, Routing, Interiors, Export Field, Daylight/Cyber HUD).
- **Known Technical Constraints:**
  - Sample test image (`1564 × 1006 px`, `0.44 MB` JPEG) is suitable for functional testing but yields ~`47.2 DPI` at `A1` (`841 × 594 mm`); original uncompressed high-res satellite source must be loaded via `Load / Replace Base` before final poster printing.
  - Browser `Canvas` safe export limits enforced in upcoming Phase 4 (`≤ 16384 px` per edge; `200 DPI` recommended cap for `A1`).
- **Next Step:**
  - Implement and verify **Phase 2 (`?v=14`)** on `feature-satellite-composer`: Layer `02_Ground_Cleanup` (pre-cleaned ground + procedural soft-feathered clone patches + soft eraser), Layer `03_Movable_Assets` (top-down PNG import with metric sizing + 1:1 `Cut & Relocate A ➔ B`), and full internal `Undo/Redo`.

---

## Repository Structure
- `index.html` — **[VERIFIED — v13 on `feature-satellite-composer`]** Studio shell + 4 minimal hooks for `Sat Studio`.
- `js/state.js` — **[VERIFIED — v13 on `feature-satellite-composer`]** State manager + `satStudio` isolation hooks + `30 MB` JSON guard + OPSEC `clear` event.
- `js/satComposer.js` — **[PHASE 1 VERIFIED — v13 | PHASE 2 IN PROGRESS]** Isolated Satellite Patch & Poster Composer module.
- `css/style.css`, `js/kmlParser.js`, `js/engine.js`, `js/interior.js`, `js/routing.js`, `js/signage.js`, `js/exporter.js`, `js/webgl3d.js` — **[UNMODIFIED & COMPATIBLE — v12]**.
