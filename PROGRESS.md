# AJ-GeoCAD Studio — PROGRESS.md

## System Status
- **Production Baseline (`main`):** `v12 COMPLETE` (3D Architectural, GIS & AutoCAD Platform — backwards-compatible with `.ajcad.json`, `.sos.json`, and generic `.json` project files).
- **Active Feature Branch (`feature-satellite-composer`):** `v16 — Phase 4 PARTIALLY VERIFIED` (Steps 1–2 Verified: Clean Load & Layer `04_Print_Overlays`; Steps 3–7 Pending Final Export & Round-Trip Verification).
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
- **Modified Files & Integration Hooks:** `index.html` (4 minimal hooks: `#btnSat`, `?v=13` script tags, `onclick`, `keydown` guard), `js/state.js` (`saveProjectJSON` with `>30 MB` guard, `loadProjectJSON`/`restoreDraft` deleting `p.satStudio` prior to `merge`, OPSEC `clear` event).
- **Added Files:** `js/satComposer.js` (`window.SOS.SatComposer`, `z-index: 945`).
- **Verified Features:** Zero-compression `01_Base_Satellite` import (`naturalWidth × naturalHeight`), Pan/Zoom (`Fit` / `100%`), 2-point metric calibration (`px/m`) + scale bar + measure tool, serialized race-safe `IndexedDB` (`aj_geocad_sat_idb_v1`), internal `Undo/Redo`.

### Phase 2 (`v14`) — Verified: 2026-11-24
- **Modified Files:** `index.html` (`?v=14`), `js/satComposer.js` (`?v=14`).
- **Verified Features:** `02_Ground_Cleanup` (pre-cleaned ground 1:1 auto-fit + procedural soft-feathered `Clone Patch` + `Soft Eraser` + incremental 60 FPS live cache), `03_Movable_Assets` (multi-PNG import, metric sizing, corner resize, top-handle rotate, Z-order, `Ctrl+D`), and 1:1 natural pixel `Cut & Relocate (A ➔ B)` with one-click `Clean Old Spot (A)`.

### Phase 3 (`v15`) — Verified: 2026-11-24
- **Added Files:** `js/satBlending.js` (`window.SOS.SatBlending`).
- **Modified Files:** `index.html` (`?v=15`), `js/satComposer.js` (`?v=15`).
- **Verified Features:** Unified Global Sun Shadow (`Multiply`, decoupled from asset rotation, anti-double-darken buffer up to `18 MP`), `Warm Soil` / `Cool Neutral` shadow presets, per-asset `Brightness`, `Contrast`, `Saturation`, `Warmth/Tint`, `Sat Softness Blur (0–2px)`, deterministic `Sensor Grain` (`source-atop`), and 1-click surface presets (`0m` flat pitch vs. elevated canopies/buildings).

### Phase 4 (`v16`) — Partially Verified: 2026-11-24
- **Added Files:** `js/satExport.js` (`window.SOS.SatExport` — Layer `04_Print_Overlays` renderer + Dual High-Res Safe Exporter).
- **Modified Files:**
  1. `index.html`: Loaded `js/satExport.js?v=16` prior to `js/satComposer.js?v=16`.
  2. `js/satComposer.js` (`?v=16`): Integrated live Layer `04_Print_Overlays` pins/north arrow, `+ Pin 1..N` tool, `Overlays: ON/OFF` toggle, bilingual poster titles/legend editor, and Dual Export panel with live Pre-Flight RAM & Edge Estimator.
- **Verified So Far (Steps 1–2):**
  - Clean load on `feature-satellite-composer` with zero Console errors; `AJ-GeoCAD — SAT STUDIO (COMPLETE)` shell renders with `+ Pin 1..N` and `Overlays: ON/OFF`.
  - Layer `04_Print_Overlays` verified: bilingual poster titles, `Sync CAD North`, category-colored numbered pins (`1..N`) placement/drag/edit/undo, and 1-click `Overlays: ON/OFF` toggle.
- **Pending Final Verification (Steps 3–7 before `main` merge):**
  - [ ] Export 1: `Master_Clean_2D.png` (`1+2+3` only at exact original `naturalWidth × naturalHeight`).
  - [ ] Export 2: Print Poster PNG (`A3 @ 150 DPI` and `A1 @ 200 DPI`) verifying `Contain` aspect ratio, bilingual legend alignment, North arrow, and scale bar.
  - [ ] Pre-Flight RAM Guard (`A1 @ 300 DPI` warning + `Custom 200×200 cm @ 300 DPI` `> 16384 px` block).
  - [ ] Full `.ajcad.json` `Save ➔ Clear (OPSEC) ➔ F5 ➔ Load` round-trip.
  - [ ] Final Zero-Regression check (legacy `.ajcad.json` load + all core `AJ-GeoCAD Studio` modules).
- **Known Technical Constraints:**
  - Final poster printing requires replacing compressed test imagery (`1564 × 1006 px`) with original high-resolution satellite imagery via `Load / Replace Base`.
  - Browser Canvas safe export hard cap: `≤ 16384 px` per edge; `200 DPI` recommended cap for `A1` posters.

---

## Repository Structure (`feature-satellite-composer`)
- `index.html` — **[v16]** Studio shell + 4 minimal `Sat Studio` integration hooks.
- `js/state.js` — **[v13]** State manager + `satStudio` isolation hooks + `30 MB` JSON guard + OPSEC `clear`.
- `js/satBlending.js` — **[v15 — VERIFIED]** Isolated Global Sun Shadow (`Multiply`) & Satellite Match Filter engine.
- `js/satExport.js` — **[v16 — STEPS 1–2 VERIFIED]** Isolated `04_Print_Overlays` & Dual High-Res Safe Exporter.
- `js/satComposer.js` — **[v16 — STEPS 1–2 VERIFIED]** Isolated Satellite Patch & Poster Composer module.
- `css/style.css`, `js/kmlParser.js`, `js/engine.js`, `js/interior.js`, `js/routing.js`, `js/signage.js`, `js/exporter.js`, `js/webgl3d.js` — **[UNMODIFIED & COMPATIBLE — v12]**.
- 
​[✓] Phase 1 — js/satThemeUI.js: مكتمل بالكامل وجاهز (الهوية البصرية Cyber HUD + الوضع النهاري ui-day + التجاوب للجوال/التابلت/اللابتوب + القوائم العلوية + عمود الأيقونات مع Hover ودليل التعليمات الحي + أزرار إخفاء/إظهار الأشرطة + شريط مقارنة قبل/بعد).
​[→] Phase 2 — js/satGeorefGPS.js: التالي مباشرة (إصلاح شامل لمحرك الربط الجغرافي بـ 4 نماذج + جدول GCP وRMS + محوّل الإحداثيات DD / DMS / UTM 36N / Web Mercator + محلل اللصق الذكي + محرك GPS المطوّر بفلترة Kalman ومتوسط القراءات وتصحيح تشويش الـ GPS + البوصلة الحية + تصدير .pgw و.prj لـ ArcGIS/QGIS).
