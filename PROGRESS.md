ن# AJ-GeoCAD Studio — PROGRESS.md

## System Status
- **Production Baseline (`main`):** `v12 COMPLETE` (3D Architectural, GIS & AutoCAD Platform — backwards-compatible with `.ajcad.json`, `.sos.json`, and generic `.json` project files).
- **Active Feature Branch (`feature-satellite-composer`):** `v16 — Phase 4 PARTIALLY VERIFIED` (Steps 1–2 Verified: Clean Load & Layer `04_Print_Overlays`; Steps 3–7 Pending Final Export & Round-Trip Verification).
- **Deployment Model:** Zero-build, zero-dependency static web app hosted on GitHub Pages (`OPSEC`: **ZERO** real GPS coordinates, site layouts, village names, or staff data hardcoded in the repository).
- **Dual Studio UI Themes:**
  - **Cyber HUD (Permanent Visual Identity):** Deep Navy (`#060d18` / `#0a1626`), Dark Petrol borders (`#1b3b57`), Aqua-to-Cyber-Green gradient (`#00b4d8 → #00ff9d`) with Soft Neon Bloom, Muted Gray-Blue (`#7f9bb5`) body text, and Desaturated Green (`#78b5a0`) section headers.
  - **Daylight Design Mode (`UI: Daylight`):** High-contrast daylight UI (`#eef3f8` / `#f8fafc` / `#0f172a`) saved in `localStorage` (`aj_geocad_ui`) and synced with the Daylight architectural map view.
​[✓] Phase 1 — js/satThemeUI.js: مكتمل.
​[✓] Phase 2 — js/satGeorefGPS.js: مكتمل (إصلاح شامل للربط الجغرافي والـ GPS + 4 نماذج + جدول GCP وRMS + DD/DMS/UTM + تصدير .pgw/.prj/KML).
​[→] Phase 3 — js/satArcGIS.js: التالي مباشرة (أدوات ArcGIS المتجهية والطوبولوجيا والتحليل المكاني: النقاط/الخطوط/المضلعات/الدوائر، الالتقاط المغناطيسي Snapping وCOGO، Split / Merge / Clip، Buffer / Multi-Ring، Range Rings، 2D Viewshed، Heatmap، Spatial Query، مصفوفة أقرب مخرج، جدول الصفات وتصدير CSV / GeoJSON / KML / GPX).
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
​[✓] Phase 1 — js/satThemeUI.js: مكتمل.
​[✓] Phase 2 — js/satGeorefGPS.js: مكتمل.
​[✓] Phase 3 — js/satArcGIS.js: مكتمل (النقاط/الخطوط/المضلعات/الدوائر + Snapping + Ortho + COGO + Split/Union/Intersect/Erase + Buffer/Multi-Ring + Range Rings + 2D Viewshed + Heatmap + Nearest Evac Matrix + Spatial Query + Attribute Table + GeoJSON/KML/GPX/CSV/WKT).
​[→] Phase 4 — js/satGeoTerra.js: التالي مباشرة (دمج 100% من Village Survey Pro v7 المرفق: حدود القرية والقطاعات المحاذية A1..F4، معالم REM/REP/MOD/ADD بالمضلعات والدبابيس، ضغط الصور الميدانية 1024px + وسم اتجاه البوصلة + نافذة Lightbox، مولّد AI Reference Sheet PNG، وضغط ZIP محلي بـ CRC32 مع ربطه المباشر بـ satGeorefGPS وsatArcGIS).
# AJ-GeoCAD Studio — Project Progress Log (`PROGRESS.md`)

**Last Updated:** 2026-11-26  
**Scope:** Sat Studio Unified Upgrade (Photoshop + ArcGIS/QGIS + GeoTerra v7) + Mobile Responsive Layout + Floating Quick Menu + Independent Bilingual UI (Default: EN)

---

## 1. Architecture & File Status

| File | Status | Role / Summary |
| :--- | :---: | :--- |
| `js/satThemeUI.js` | **NEW / UPDATED** | Cyber HUD & Daylight (`ui-day`) CSS engine, offline SVG icon rail, top menu bar, live tool guide, collapsible fixed docks, Before/After swipe, Clean Field mode, and Independent Bilingual Settings modal (`aj_sat_lang_prefs_v1`). |
| `js/satGeorefGPS.js` | **NEW** | 4-model GCP Georeferencing solver + RMS table, Smart Coords parser (`DD / DMS / UTM 36N / Google Maps URL`), Kalman-smoothed Live GPS + 1-pt Drift Fix + Breadcrumb Track, Live Compass, `.pgw`/`.prj` & KML Ground Overlay export. |
| `js/satArcGIS.js` | **NEW** | Offline browser ArcGIS/QGIS engine: metrics & COGO, Snapping & Ortho, Topology (`Split / Union / Intersect / Difference`), Geoprocessing (`Buffer / Multi-Ring / Range Rings / 2D Viewshed / Heatmap / Nearest Evac Matrix`), Spatial & Attribute Queries, Attribute Table, and `GeoJSON / KML / GPX / CSV / WKT` I/O. |
| `js/satGeoTerra.js` | **NEW** | Full `GeoTerra / Village Survey Pro v7` integration: aligned village boundary & interior sectors (`A1..F4`), phased features (`REM / REP / MOD / ADD`), 1024px photo compression + compass bearing tags + Lightbox, `AI Reference Sheet PNG`, pure-JS `CRC32` ZIP builder, and `convertToArcGISFeatures` bridge. |
| `js/satComposer.js` | **UPDATED** | Unified 6-layer compositor (`01_Base_Satellite` .. `06_Print_Overlays`), IndexedDB persistence (`aj_geocad_sat_idb_v1`), 40-step Undo/Redo, GeoTerra `.json`/`.zip` direct import, Floating Quick Action Menu (`#scQuickPop`), CAD/3D push bridge, and independent EN/AR language binding. |
| `index.html` | **UPDATED** | Loaded new `sat*` modules (`?v=19`), locked viewport (`100dvh`), split wrapped `#hud` top bar (zero horizontal scroll on mobile), and fixed collapsible `#left`/`#right` sidebars with internal scroll only. |
| `js/state.js` | **UPDATED** | Auto-detects GeoTerra `.json` sessions and `.zip` bundles in `loadProjectJSON()` and opens/routes them directly into `Sat Studio`. |
| `js/webgl3d.js` | **UNCHANGED** | Verified intact; renders pushed Sat Studio / GIS features automatically via `St.project.features`. |

---

## 2. Detailed Changelog (Verified & Completed)

### A. Mobile & Responsive Workspace Layout (`index.html` & `js/satThemeUI.js`)
- Locked root viewport (`100dvh`, `overflow: hidden`) to eliminate whole-page scrolling; scrolling is isolated inside sidebars, tool rails, and tables.
- Converted top `#hud` (`index.html`) and `.satc-menubar` (`satThemeUI.js`) into multi-row flex layouts with zero horizontal scrolling on mobile (`<= 980px`).
- Prioritized core mobile actions in row 1 (`Tools`, `Sat Studio`, `WebGL 3D GPU`, `Cyber/Daylight`, `Inspector`).
- Configured `#left` / `#right` and Sat Studio docks as fixed-height slide-over drawers on mobile with auto-hide on startup and mutual exclusion (opening one closes the other).
- Scoped CSS selectors inside `.satc-pro` to prevent global `index.html` button rules from overriding active states or Daylight theme colors.

### B. ArcGIS / QGIS Vector & Spatial Analysis (`js/satArcGIS.js`)
- **Geometry & COGO:** Live Area ($m^2$, dunum), Perimeter, Length, Forward/Back Bearing (respecting `northOffsetDeg`), 2-point True North calibration, and COGO (`Distance + Bearing`) vertex input.
- **Snapping & Ortho:** Automatic snapping (`VERTEX`, `INTERSECT`, `MIDPOINT`, `EDGE`) + `Shift` 45°/90° ortho constraint.
- **Topology:** `splitPolygonByLine`, `polygonBoolean` (`union`, `intersect`, `difference`).
- **Geoprocessing:** Rounded outward `bufferGeometry` & `createMultiRingBuffers`, Range Rings + Azimuth Spider, 360-ray building-obstructed `computeViewshed2D`, `computeNearestEvacMatrix` (walk time at `1.4 m/s`), Heatmap overlay, `selectByLocation`, and `selectByAttribute`.
- **I/O & Table:** Interactive bottom Attribute Table (`CSV` with UTF-8 BOM for Arabic Excel, `GeoJSON`, `KML`, `GPX`, `WKT`).

### C. GeoTerra Field Survey v7 & Mobile Import Fixes (`js/satGeoTerra.js`, `js/satComposer.js`, `js/state.js`)
- Migrated full `Village Survey Pro v7` engine (aligned `A1..F4` clipped grid, `REM -> REP -> MOD -> ADD` execution plan, `AI_PROMPT_BRIEF.txt`, `ai_reference_sheet.png`, zero-dependency `CRC32` ZIP export, `.pgw` + `.prj` bundling).
- Removed restrictive `accept` attributes on `#scFileGis` and `#scFileGtJson` to fix grayed-out `.json`/`.zip` files on Android/Samsung file pickers.
- Added direct `.zip` extraction (`extractGeoTerraFromZip`) restoring `project_ai.json`, attached `photos/*`, and optional temporary background map.
- Enabled rendering of imported GeoTerra boundaries/features on a virtual canvas (`getBaseDims()`) even before `01_Base_Satellite` is loaded.
- Added a direct import button (`#scImpGtDirect`) in the right dock plus automatic routing from main `Load Project` (`state.js`).

### D. Floating Quick Action Menu (`js/satComposer.js`)
- Added context-aware floating menu (`#scQuickPop`) anchored beside any selected entity in `Select` mode (works across **ArcGIS features**, **GeoTerra polygons/pins**, **03_Movable_Assets**, and **Poster Pins**).
- Actions:
  - **Edit (`✎`):** Opens GeoTerra modal, GIS/Pin attribute prompts, or Asset Inspector.
  - **Move (`✥`):** Arms whole-object drag (moves all polygon vertices together from anywhere on screen until locked).
  - **Vertices (`⬡`):** Displays numbered yellow corner handles for direct touch vertex reshaping on polygons/lines (replaced by **Crop `✂`** on image assets).
  - **Clone (`⧉`) & Delete (`🗑`):** Full duplication and undoable deletion (`pushUndo`).

### E. Independent Bilingual UI System (`js/satThemeUI.js` & `js/satComposer.js`)
- **Default Language:** English (`en`) across all domains.
- **Independent Controls** (accessible via `🌐` button in top quick bar or `View -> Language Settings`, persisted in `localStorage` key `aj_sat_lang_prefs_v1` even after `Clear Sat`):
  1. `menus`: Top Menus, dropdowns, and Floating Quick Menu (`en` / `ar`).
  2. `guide`: Left Tool Guide card & hover tooltips (`en` / `ar`).
  3. `panels`: Left/Right sidebars, layer names, Asset Inspector, GeoTerra panel, and bottom drawer tabs (`en` / `ar`).
- Added 1-tap presets: `All English`, `الكل عربي`, and `EN + شرح عربي`.

---

## 3. Deployment Verification Checklist
- [ ] All 9 scripts uploaded under `js/` with exact casing (`satThemeUI.js`, `satGeorefGPS.js`, `satArcGIS.js`, `satGeoTerra.js`, `satComposer.js`, `state.js`).
- [ ] `index.html` updated (`?v=19`) and GitHub Pages `Actions` build passed (green).
- [ ] Tested on mobile in Incognito (Desktop site OFF): 2-row top bar, collapsible drawers, GeoTerra `.json`/`.zip` import, Floating Quick Menu, and `🌐` Language Settings modal.

---

## 4. Planned Next Upgrades (Pending Approval)
- [ ] **3D Satellite Ground Texture (`js/webgl3d.js`):** Project `Master_Clean_2D` from Sat Studio as a real WebGL ground texture beneath 3D extruded buildings.
- [ ] **Midpoint Vertex Add/Delete:** Allow adding/removing vertices along polygon edges inside `⬡ Vertices` mode on mobile.
- [ ] **Collapsible Tool Guide Toggle:** Optional mini-button to hide the left Tool Guide card while keeping only the 50px icon rail visible during mobile field drawing.
