# SOS Emergency & Evacuation 3D Master Studio — PROGRESS.md

## Architecture & Operational Constraints
- **Deployment Model:** Zero-build, zero-dependency static web app hosted on GitHub Pages (`Plan B OPSEC`: **ZERO** real GPS coordinates, site layouts, village names, or staff data hardcoded in the repository).
- **Local Data Workflow:** Site KML (`SOS-Village-Clean.kml`) and project state (`.sos.json`) remain strictly local on the operator's device and are imported/exported at runtime.
- **Namespace:** Global `window.SOS = window.SOS || {};` using classic `<script src="js/..."></script>` tags (no ES modules, no CDNs, no bundlers).
- **Dual Visual Identity:**
  - **Master Studio HUD & Default Canvas (`cyber`):** Dark Neon Matrix Cyber HUD (`#080b10`, `#0e141d`, `#1b2838`, `#39ff14`, `#e8c84a`, `#ff3c3c`, `#00d9ff`, `#a06bff`).
  - **Daylight Print Architectural Canvas (`print`):** Warm paper backdrop (`#f6f1e7`), sandy terrain (`#f1dbb0`), dark architectural ink outlines, sun drop shadows, Red Crescent clinic, white tents, wooden cottages, oriented football field, multi-tone olive trees, cylindrical diesel tank, blue-and-white bus.
- **UI Language:** Master Studio is **100% English**; generated Wall Posters and exported Village Field Edition are **bilingual (Arabic / English)**.

---

## Repository Structure & Status
- `index.html` — **[DONE — Phase 3 wired]** Cyber HUD shell, `#btnTheme`, `#btnInt`, `#btnRoute`, `#btnSign` active, modal keyboard guards.
- `css/style.css` — **[DONE — Phase 1.1]** Single-row top HUD bar, responsive Cyber HUD layout.
- `js/state.js` — **[DONE — Phase 1, verified]** Full `.sos.json` persistence (`meta.qrBaseUrl`, `features`, `interiors`, `routes`, `signagePins`), undo/redo, draft, OPSEC wipe.
- `js/kmlParser.js` — **[DONE — Phase 1.1]** KML 2.2 metric parser.
- `js/engine.js` — **[DONE — Phase 2.5]** Dual-theme (`cyber` / `print`) Canvas 2D 2.5D/3D isometric engine + extra facilities (`pool`, `playground`, `parking`, `diesel_tank`) + 3D route overlay.
- `js/interior.js` — **[DONE — Phase 2A]** Self-contained 2D architectural cutaway floor plan editor.
- `js/routing.js` — **[DONE — Phase 2B]** Self-contained 2D Top-Down Emergency Routing Studio (Fire & Shelling graphs, Auto-Seed, Auto-Connect, Dijkstra, Blocked Path/Hazard simulator, 3D overlay).
- `js/signage.js` — **[DONE — Phase 3]** Self-contained Context-Aware A3/A4 Wall Signage Generator (injects `<style id="sos-signage-css">`), verified pure-JS ISO/IEC 18004 QR encoder (`V1–V10`, EC-M), editable `meta.qrBaseUrl` settings with presets, Exterior & Interior floor posters, `YOU ARE HERE` pin + Heads-Up auto-rotation, live Dijkstra Fire/Shelling paths & nearest fire extinguisher callout, live Poster Preview, 150/300 DPI PNG export, Saved Pins manager + Batch Export.
- `js/exporter.js` — **[NEXT — Phase 4]** Standalone `village.html` exporter (<400 KB, Zero External CDNs, Read-Only bilingual AR/EN, defaults to Daylight Print theme with Night toggle, supports `?alert=fire`, `?alert=shelling`, `?loc=zone_id`, 1-tap "Where are you now?" panic modal, offline Web Audio emergency sirens, optional MikroTik Captive Portal deployment guide & RouterOS script generator).

---

## Verified Public API Contracts (`window.SOS`)

### 1. `window.SOS.State` (`js/state.js`)
- `project`: `{ meta: { qrBaseUrl, ... }, features, customAssets, interiors, routes: { fire: { nodes, edges }, shelling: { nodes, edges } }, signagePins }`
- Methods: `blank()`, `newFeature(o)`, `merge(p)`, `on(e, f)`, `emit(e, d)`, `snapshot()`, `undo()`, `redo()`, `saveProjectJSON()`, `loadProjectJSON(file)`, `autoSaveDraft()`, `restoreDraft()`, `clearWorkspace()`.

### 2. `window.SOS.Engine` (`js/engine.js`)
- Methods: `init(cv)`, `setTool(t)`, `setAddType(t)`, `setYaw(v)`, `setPitch(v)`, `setQuality(h)`, `isHQ()`, `getTheme()`, `setTheme('cyber'|'print')`, `toggleTheme()`, `setLayer(k, v)`, `toggleNorthUp()`, `fitView()`, `select(id)`, `getSelected()`, `deleteSelected()`, `sizeOf(f)`, `resizeSelected(w, d)`, `attachIcon(file)`, `clearIcon()`, `getMeasure()`, `fmt(s)`, `renderModeOf(f)`, `project(x, y, z)`, `getCanvas()`, `render()`.

### 3. `window.SOS.Interior` (`js/interior.js`)
- Methods: `open(featureId)`, `close()`, `pick()`, `isOpen()`.

### 4. `window.SOS.Routing` (`js/routing.js`)
- Methods: `open()`, `close()`, `isOpen()`, `setOverlayMode('both'|'fire'|'shelling'|'off')`, `getOverlayMode()`, `solveDijkstra(protocol, startId, goalFilter)`, `drawOn3D(ctx, P, sc)`, `hasActiveAnim()`.

### 5. `window.SOS.Signage` (`js/signage.js`)
- Methods: `open()`, `close()`, `isOpen()`, `encodeQR(text)`, `drawQR(ctx, text, x, y, size)`.
- **Verified Signage Pin Schema** (`window.SOS.State.project.signagePins[]`):
  ```json
  {
    "id": "pin_...",
    "locCode": "office_f1",
    "en_name": "Main Corridor Poster",
    "ar_name": "لوحة الممر الرئيسي",
    "scope": "exterior|interior",
    "featureId": null,
    "floor": "1",
    "x": 0,
    "y": 0,
    "facingDeg": 0,
    "headsUp": true,
    "paper": "A3_L|A3_P|A4_L|A4_P",
    "dpi": 150,
    "showQR": true,
    "showFire": true,
    "showShelling": true
  }
6. Top-Bar Placeholders Remaining (index.html)
​#btnExp (disabled, [Phase 4] Export Village)
​Handoff Notes for Phase 4 (js/exporter.js)
​1. Enable #btnExp (label: Export Village) and build a clean Export Studio modal producing a 100% standalone, zero-CDN, read-only village.html file (<400 KB) embedding the active .sos.json payload (features, interiors, routes, signagePins).
​2. village.html features:
​Bilingual Arabic / English switcher (default Arabic for village residents/mothers/children), Daylight Print architectural theme default + Night toggle.
​URL parameter support: ?loc=<locCode> (matches signagePins or feature IDs to auto-place YOU ARE HERE) and ?alert=fire / ?alert=shelling (auto-triggers Panic-First UI + Web Audio siren pattern + animated route arrows).
​1-Tap "أين أنت الآن؟ / Where are you now?" 4-zone quick picker if opened without ?loc=.
​Optional GPS assist button (only activates gracefully when served over HTTPS and permission granted).
​Read-only floor plan viewer for buildings with saved interiors.
​3. Include a MikroTik RouterOS Deployment Helper tab inside the Export modal generating ready-to-paste RouterOS commands for local offline Hotspot Captive Portal emergency redirect (editable IP/interface fields once IT grants access).
