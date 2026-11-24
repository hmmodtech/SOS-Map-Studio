# AJ-GeoCAD Studio — PROGRESS.md

## System Status
- **Production Baseline:** `v12 COMPLETE` (3D Architectural, GIS & AutoCAD Platform — backwards-compatible with `.ajcad.json`, `.sos.json`, and generic `.json` project files).
- **Active Feature Branch (`feature-satellite-composer`):** `v14 — Phase 2 VERIFIED` (Isolated Realistic Satellite Patch & Poster Composer Module — `js/satComposer.js`).
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
  1. `index.html`: Added `#btnSat` in `#hud`, loaded `js/satComposer.js`, bound `$('btnSat').onclick`, and added `S.SatComposer.isOpen()` guard to global `keydown`.
  2. `js/state.js` (`?v=13`): Added optional `satStudio` export hook (with `> 30 MB` full vs. lightweight guard), strict `delete p.satStudio` cleanup before `merge(p)` in `loadProjectJSON()` / `restoreDraft()`, and OPSEC `clear` event emission in `clearWorkspace()`.
- **Added Files:** `js/satComposer.js` (isolated `window.SOS.SatComposer`, `z-index: 945`).
- **Verified Features:** Zero-compression `01_Base_Satellite` import (`naturalWidth × naturalHeight`), pan/zoom (`Fit`, `100% 1:1`), 2-point metric scale calibration (`px/m`) + scale bar + metric measure, race-safe serialized `IndexedDB` (`aj_geocad_sat_idb_v1`), and internal `Undo/Redo`.
- **Zero-Regression:** Console clean; all existing `AJ-GeoCAD Studio` features confirmed intact.

### Phase 2 (`v14`) — Verified: 2026-11-24
- **Modified Files:**
  1. `index.html`: Bumped cache tag `js/satComposer.js?v=14` (zero new hooks).
  2. `js/satComposer.js` (`?v=14`): Full Layer `02_Ground_Cleanup` and Layer `03_Movable_Assets` implementation.
- **Verified Features (Phase 2):**
  - `02_Ground_Cleanup`: Pre-cleaned ground image import (1:1 fit + undo-safe clear + opacity slider), procedural soft-feathered `Clone Patch` (`Alt+Click` / `Pick Source`, radius, feather, opacity, rotation, follow-drag), and `Soft Eraser` with incremental 60 FPS live cache stamping.
  - `03_Movable_Assets`: Top-down transparent PNG import (single/batch), interactive move, 4-corner resize (aspect-locked or free), rotation handle (`Shift` 15° snap), metric width/height controls linked to `px/m`, flip H/V, lock, Z-order, clone (`Ctrl+D`), and delete.
  - `Cut & Relocate (A ➔ B)`: Polygon cutout extracted directly from 1:1 `naturalWidth × naturalHeight` pixels of `01_Base_Satellite` with optional `Edge Feather (0–6 px)` and one-click `Clean Old Spot (A) ➔ Clone Patch` handoff.
  - Full internal `Undo/Redo` (`Ctrl+Z` / `Ctrl+Y`) and `IndexedDB` persistence across reloads.
- **Zero-Regression Verification (Phase 2):**
  - Tested on `feature-satellite-composer` with zero modifications to `js/state.js` or any legacy studio module.
- **Known Technical Constraints:**
  - Sample test image (`1564 × 1006 px`, `0.44 MB`) is sufficient for functional testing; replace with original high-res uncompressed satellite imagery via `Load / Replace Base` before final A2/A1 poster printing.
  - Browser `Canvas` safe export limits to be enforced in Phase 4 (`≤ 16384 px` per edge; `200 DPI` recommended cap for `A1`).
- **Next Step:**
  - Implement and verify **Phase 3 (`?v=15`)** on `feature-satellite-composer`: Photorealistic Blending Engine — rotation-independent `Global Sun Shadow` (`Multiply` pass with warm/cool presets + sun compass) and per-asset satellite quality matching (`Brightness`, `Contrast`, `Saturation`, `Warmth/Tint`, `Blur 0–2px`, `Noise/Grain`, plus 1-click height presets).

---

## Repository Structure
- `index.html` — **[VERIFIED — v14 on `feature-satellite-composer`]** Studio shell + 4 minimal hooks for `Sat Studio`.
- `js/state.js` — **[VERIFIED — v13 on `feature-satellite-composer`]** State manager + `satStudio` isolation hooks + `30 MB` JSON guard + OPSEC `clear` event.
- `js/satComposer.js` — **[PHASE 2 VERIFIED — v14 | PHASE 3 IN PROGRESS]** Isolated Satellite Patch & Poster Composer module.
- `css/style.css`, `js/kmlParser.js`, `js/engine.js`, `js/interior.js`, `js/routing.js`, `js/signage.js`, `js/exporter.js`, `js/webgl3d.js` — **[UNMODIFIED & COMPATIBLE — v12]**.
