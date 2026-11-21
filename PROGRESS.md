# SOS Emergency & Evacuation 3D Master Studio — PROGRESS.md

## System Status: ALL 4 PHASES COMPLETE (Production-Ready Zero-Build Architecture)
- **Deployment Model:** Zero-build, zero-dependency static web app hosted on GitHub Pages (`Plan B OPSEC`: **ZERO** real GPS coordinates, site layouts, village names, or staff data hardcoded in the repository). Ready for seamless migration to **Plan A** (Private Repo + Cloudflare Pages + Cloudflare Access) upon management approval.
- **Local Data Workflow:** Site KML (`SOS-Village-Clean.kml`) and master project file (`.sos.json`) stay strictly local on the operator's device.
- **Namespace:** Global `window.SOS = window.SOS || {};` with classic `<script src="js/..."></script>` tags and `?v=4` cache-busting query strings.
- **Dual Visual Identity:**
  - **Master Studio (`cyber` default + `print` toggle):** Dark Neon Matrix Cyber HUD (`#080b10`, `#0e141d`, `#39ff14`, `#e8c84a`, `#ff3c3c`, `#00d9ff`).
  - **Wall Signage & Village Field Edition (`print` default + `dark` toggle):** Daylight Print architectural styling (warm off-white backdrop, sandy compound terrain, sun drop shadows, Red Crescent clinic, white tents, wooden cottages, oriented football field, multi-tone olive trees, cylindrical diesel tank, blue-and-white bus).

---

## Repository Structure (Complete)
- `index.html` — **[COMPLETE — v4]** Cyber HUD shell, all 4 modules active (`Interiors`, `Routing`, `Signage`, `Export Village`), `?v=4` cache busting, modal keyboard guards.
- `css/style.css` — **[COMPLETE]** Single-row top HUD bar, responsive desktop & mobile Cyber HUD layout.
- `js/state.js` — **[COMPLETE]** Full `.sos.json` persistence (`meta`, `qrBaseUrl`, `exportConfig`, `features`, `interiors`, `routes`, `signagePins`), 30-step undo/redo, optional draft, OPSEC wipe.
- `js/kmlParser.js` — **[COMPLETE]** KML 2.2 metric parser (ignores hidden folders, reads `ExtendedData`, calculates metric area/perimeter & `trueNorthOffsetDeg`).
- `js/engine.js` — **[COMPLETE]** Dual-theme (`cyber` / `print`) Canvas 2D 2.5D/3D isometric engine, label collision prevention, narrow-polygon tent/cottage fallback, extra assets (`pool`, `playground`, `parking`, `diesel_tank`), Base64 icon compressor, metric ruler, live animated 3D route overlay.
- `js/interior.js` — **[COMPLETE — Phase 2A]** Self-contained 2D architectural cutaway floor plan editor (multi-floor tabs, stair ghost alignment, snap-to-grid, quick templates, Safe Haven & fire safety items, PNG export).
- `js/routing.js` — **[COMPLETE — Phase 2B]** Self-contained 2D Top-Down Emergency Routing Studio (Fire & Shelling graphs, Auto-Seed, Auto-Connect Prim MST + alternate links, Dijkstra shortest path + evacuation times at `1.2 m/s` & `0.8 m/s`, Blocked Path/Hazard simulator, 3D overlay).
- `js/signage.js` — **[COMPLETE — Phase 3]** Self-contained A3/A4 Wall Signage Generator with verified pure-JS ISO/IEC 18004 QR encoder (`V1–V10`, EC-M), editable `meta.qrBaseUrl` settings, Exterior & Interior floor posters, `YOU ARE HERE` + Heads-Up auto-rotation, live Dijkstra Fire/Shelling paths & nearest fire extinguisher callout, 150/300 DPI PNG export + Batch Export.
- `js/exporter.js` — **[COMPLETE — Phase 4]** Self-contained Village Field Edition Exporter + MikroTik RouterOS IT Helper:
  - Generates 100% standalone, zero-CDN, read-only `village.html` (<400 KB target with live size check).
  - Features: Bilingual AR/EN (default Arabic), Daylight Print + Night toggle, `?loc=` & `?alert=fire|shelling` URL params, Panic-First 4-zone quick picker, GPS jamming/out-of-bounds guard (>250m fallback), offline Web Audio API emergency siren, read-only interior floor plan viewer, and live preview buttons.
  - Includes MikroTik RouterOS deployment tab (Captive Portal redirect stub + RouterOS trigger/clear scripts for IT review).

---

## Verified Public API Contracts (`window.SOS`)
- `window.SOS.State` (`js/state.js`): `project`, `blank()`, `newFeature()`, `merge()`, `on()`, `emit()`, `snapshot()`, `undo()`, `redo()`, `saveProjectJSON()`, `loadProjectJSON()`, `autoSaveDraft()`, `restoreDraft()`, `clearWorkspace()`.
- `window.SOS.KMLParser` (`js/kmlParser.js`): `parse(xmlText)`.
- `window.SOS.Engine` (`js/engine.js`): `init()`, `setTool()`, `setAddType()`, `setYaw()`, `setPitch()`, `setQuality()`, `isHQ()`, `getTheme()`, `setTheme()`, `toggleTheme()`, `setLayer()`, `toggleNorthUp()`, `fitView()`, `select()`, `getSelected()`, `deleteSelected()`, `sizeOf()`, `resizeSelected()`, `attachIcon()`, `clearIcon()`, `getMeasure()`, `fmt()`, `renderModeOf()`, `project()`, `getCanvas()`, `render()`.
- `window.SOS.Interior` (`js/interior.js`): `open()`, `close()`, `pick()`, `isOpen()`.
- `window.SOS.Routing` (`js/routing.js`): `open()`, `close()`, `isOpen()`, `setOverlayMode()`, `getOverlayMode()`, `solveDijkstra()`, `drawOn3D()`, `hasActiveAnim()`.
- `window.SOS.Signage` (`js/signage.js`): `open()`, `close()`, `isOpen()`, `encodeQR()`, `drawQR()`.
- `window.SOS.Exporter` (`js/exporter.js`): `open()`, `close()`, `isOpen()`, `generateHtml(overrideAlert, overrideLoc)`.
