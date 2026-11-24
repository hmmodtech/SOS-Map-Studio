# AJ-GeoCAD Studio — PROGRESS.md

## System Status
- **Production Baseline:** `v12 COMPLETE` (3D Architectural, GIS & AutoCAD Platform — backwards-compatible with `.ajcad.json`, `.sos.json`, and generic `.json` project files).
- **Active Feature Branch (`feature-satellite-composer`):** `v15 — Phase 3 VERIFIED` (Isolated Realistic Satellite Patch & Poster Composer Module).
- **Deployment Model:** Zero-build, zero-dependency static web app hosted on GitHub Pages (`OPSEC`: **ZERO** real GPS coordinates, site layouts, village names, or staff data hardcoded in the repository).
- **Dual Studio UI Themes:**
  - **Cyber HUD (Permanent Visual Identity):** Deep Navy (`#060d18` / `#0a1626`), Dark Petrol borders (`#1b3b57`), Aqua-to-Cyber-Green gradient (`#00b4d8 → #00ff9d`) with Soft Neon Bloom, Muted Gray-Blue (`#7f9bb5`) body text, and Desaturated Green (`#78b5a0`) section headers.
  - **Daylight Design Mode (`UI: Daylight`):** High-contrast daylight UI (`#eef3f8` / `#f8fafc` / `#0f172a`) saved in `localStorage` (`aj_geocad_ui`) and synced with the Daylight architectural map view.

---

## Baseline Reconciliation (`v10` ➔ `v12` Pre-Module State)
- Reconciled documentation gap between prior `PROGRESS.md` (`v10`) and deployed repository assets (`?v=12`):
  - `index.html` (`?v=12`): `#projName` synced with `St.project.meta.name` and `<title>`, plus `MutationObserver` (`scanModalTree`) applying Daylight Design Mode to all sub-editor modals.
  - Core modules verified at `?v=12`: `css/style.css`, `js/state.js`, `js/kmlParser.js`, `js/engine.js`, `js/interior.js`, `js/routing.js`, `js/signage.js`, `js/exporter.js`, `js/webgl3d.js`.

---

## Changelog — `feature-satellite-composer`

### Phase 1 (`v13`) — Verified: 2026-11-24
- **Modified Files & Integration Hooks:** `index.html` (4 hooks: `#btnSat`, `?v=13` script tags, `onclick`, `keydown` guard), `js/state.js` (`saveProjectJSON` with `>30 MB` guard, `loadProjectJSON`/`restoreDraft` cleaning `satStudio` before `merge`, OPSEC `clear` event).
- **Added Files:** `js/satComposer.js` (`window.SOS.SatComposer`, `z-index: 945`).
- **Verified Features:** Zero-compression `01_Base_Satellite` import, Pan/Zoom (`Fit` / `100%`), 2-point metric calibration (`px/m`) + scale bar + measure tool, serialized race-safe `IndexedDB` (`aj_geocad_sat_idb_v1`), internal `Undo/Redo`.

### Phase 2 (`v14`) — Verified: 2026-11-24
- **Modified Files:** `index.html` (`?v=14`), `js/satComposer.js` (`?v=14`).
- **Verified Features:** `02_Ground_Cleanup` (pre-cleaned ground 1:1 auto-fit + procedural soft-feathered `Clone Patch` + `Soft Eraser` + incremental 60 FPS live cache), `03_Movable_Assets` (multi-PNG import, metric sizing, corner resize, top-handle rotate, Z-order, `Ctrl+D`), and 1:1 natural pixel `Cut & Relocate (A ➔ B)` with one-click `Clean Old Spot (A)`.

### Phase 3 (`v15`) — Verified: 2026-11-24
- **Added Files:** `js/satBlending.js` (`window.SOS.SatBlending` — isolated Photorealistic Blending & Global Sun Shadow engine).
- **Modified Files:**
  1. `index.html`: Loaded `js/satBlending.js?v=15` prior to `js/satComposer.js?v=15`.
  2. `js/satComposer.js` (`?v=15`): Routed Layer `03_Movable_Assets` rendering through `S.SatBlending.renderLayer03`, added Global Sun Shadow panel (`Azimuth`, `Length`, `Opacity`, `Softness`, `Warm Soil` / `Cool Neutral` presets + color picker), added per-asset blend sliders (`Brightness`, `Contrast`, `Saturation`, `Warmth/Tint`, `Sat Softness Blur 0–2px`, `Sensor Grain`) and 1-click surface presets (`Flat Pitch 0m`, `Tent/Shade 3m`, `Caravan/Building 4.8m`, `1:1 Cutout Match`), and wired cache cleanup on `importState`/`clearData`.
- **Verified Features:**
  - Global Sun Shadow rendered in a unified `Multiply` pass beneath elevated assets (prevents double-darkening on overlapping shadows) and completely decoupled from individual asset rotation.
  - Flat ground assets (`0m`) sit beneath elevated shadows; per-asset `Warmth` and deterministic `Sensor Grain` clip strictly inside asset alpha (`source-atop`).
- **Zero-Regression Verification (Phase 3):**
  - Phase 3 blending & shadow engine tested on `feature-satellite-composer` with zero disruption to existing `AJ-GeoCAD Studio` tools.
- **Known Technical Constraints:**
  - Unified anti-double-darken shadow buffer auto-switches to direct `Multiply` pass above `18 MP` to protect RAM during ultra-high-res exports.
  - Final poster printing requires replacing low-res WhatsApp test imagery (`1564 × 1006 px`) with the original full-resolution satellite image via `Load / Replace Base`.
- **Next Step:**
  - Implement and verify **Phase 4 (`?v=16`)** on `feature-satellite-composer`: isolated **`js/satExport.js`** (`04_Print_Overlays` with category-colored numbered pins `1..N`, synced bilingual Legend, North Arrow, metric scale bar, 1-click hide/show + Dual High-Res Safe Export: `Master_Clean_2D.png` for 3D Base Texture and `A3/A2/A1/Custom` `Contain` Poster with `Pre-Flight RAM & ≤16384px Guard` via `toBlob()`).

---

## Repository Structure
- `index.html` — **[VERIFIED — v15 | PHASE 4 PENDING]** Studio shell + minimal `Sat Studio` hooks.
- `js/state.js` — **[VERIFIED — v13]** State manager + `satStudio` isolation hooks + `30 MB` JSON guard + OPSEC `clear`.
- `js/satBlending.js` — **[PHASE 3 VERIFIED — v15]** Isolated Global Sun Shadow (`Multiply`) & Satellite Match Filter engine.
- `js/satComposer.js` — **[PHASE 3 VERIFIED — v15 | PHASE 4 IN PROGRESS]** Isolated Satellite Patch & Poster Composer module.
- `js/satExport.js` — **[NEW — PHASE 4 IN PROGRESS]** Isolated `04_Print_Overlays` & Dual High-Res Safe Exporter.
- `css/style.css`, `js/kmlParser.js`, `js/engine.js`, `js/interior.js`, `js/routing.js`, `js/signage.js`, `js/exporter.js`, `js/webgl3d.js` — **[UNMODIFIED & COMPATIBLE — v12]**.
