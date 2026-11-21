# SOS Emergency & Evacuation 3D Master Studio — PROGRESS.md

## Architecture & Operational Constraints
- **Deployment Model:** Zero-build, zero-dependency static web app hosted on GitHub Pages (`Plan B OPSEC`: **ZERO** real GPS coordinates, site layouts, village names, or staff data hardcoded in the repository).
- **Local Data Workflow:** Site KML (`SOS-Village-Clean.kml`) and project state (`.sos.json`) remain strictly local on the operator's device and are imported/exported at runtime.
- **Namespace:** Global `window.SOS = window.SOS || {};` using classic `<script src="js/..."></script>` tags (no ES modules, no CDNs, no bundlers).
- **Dual Visual Identity:**
  - **Master Studio HUD & Default Canvas (`cyber`):** Dark Neon Matrix Cyber HUD (`#080b10` bg, `#0e141d` panels, `#1b2838` borders, `#39ff14` cyber green, `#e8c84a` warning amber, `#ff3c3c` danger red, `#00d9ff` cyan, `#a06bff` safe-haven purple).
  - **Daylight Print Architectural Canvas (`print`):** Warm paper backdrop (`#f6f1e7`), sandy compound terrain (`#f1dbb0`), dark architectural ink outlines, sun drop shadows, Red Crescent clinic roof, white tents, wooden pitched-roof cottages, oriented football field penalty boxes, clustered multi-tone olive trees, cylindrical diesel tank, blue-and-white bus, white high-contrast label pills.
- **UI Language:** Master Studio is **100% English** (with bilingual `en_name` / `ar_name` fields for signage & Village Field Edition export).

---

## Repository Structure & Status
- `index.html` — **[DONE — Phase 2.5]** Cyber HUD shell, `#btnTheme` (`Theme: Cyber / Print`), `Interiors` + `Routing` active, extra Add tools (`Covered Pool`, `Playground`, `Parking Lot`, `Diesel Tank`).
- `css/style.css` — **[DONE — Phase 1.1]** Single-row top HUD bar, responsive Cyber HUD layout.
- `js/state.js` — **[DONE — Phase 1, verified]** Full `.sos.json` persistence (`features`, `interiors`, `routes`, `signagePins`), undo/redo, draft, OPSEC wipe.
- `js/kmlParser.js` — **[DONE — Phase 1.1]** KML 2.2 metric parser.
- `js/engine.js` — **[DONE — Phase 2.5]** Dual-theme (`cyber` / `print`) Canvas 2D 2.5D/3D isometric engine, sun drop shadows, Red Crescent clinic emblem, narrow-polygon tent/cottage auto-unit fallback, procedural `pool` / `playground` / `parking` / `diesel_tank` assets, `routes` layer + animated 3D route overlay.
- `js/interior.js` — **[DONE — Phase 2A]** Self-contained 2D architectural cutaway floor plan editor.
- `js/routing.js` — **[DONE — Phase 2B]** Self-contained 2D Top-Down Emergency Routing Studio (Fire & Shelling graphs, Auto-Seed, Auto-Connect, Dijkstra shortest path + evacuation times, Blocked Path/Hazard simulator, 3D overlay).
- `js/signage.js` — **[NEXT — Phase 3]** Context-aware A3/A4 Wall Signage generator using Daylight Print architectural styling (`YOU ARE HERE` pin, heads-up wall orientation, nearest fire extinguisher + Fire/Shelling Dijkstra routes, offline QR generator, 300/150 DPI PNG export).
- `js/exporter.js` — **[PENDING — Phase 4]** Standalone `village.html` exporter (<400 KB, Read-Only bilingual AR/EN, defaults to Daylight Print architectural theme with Night toggle, `?alert=` & `?loc=` params, offline audio cues, MikroTik Captive Portal deployment).

---

## Verified Public API Contracts (`window.SOS`)

### 1. `window.SOS.State` (`js/state.js`)
- `project`: `{ meta, features, customAssets, interiors, routes: { fire: { nodes, edges }, shelling: { nodes, edges } }, signagePins }`
- Methods: `blank()`, `newFeature(o)`, `merge(p)`, `on(e, f)`, `emit(e, d)`, `snapshot()`, `undo()`, `redo()`, `saveProjectJSON()`, `loadProjectJSON(file)`, `autoSaveDraft()`, `restoreDraft()`, `clearWorkspace()`.

### 2. `window.SOS.Engine` (`js/engine.js`)
- Methods: `init(cv)`, `setTool(t)`, `setAddType(t)`, `setYaw(v)`, `setPitch(v)`, `setQuality(h)`, `isHQ()`, `getTheme()`, `setTheme('cyber'|'print')`, `toggleTheme()`, `setLayer(k, v)`, `toggleNorthUp()`, `fitView()`, `select(id)`, `getSelected()`, `deleteSelected()`, `sizeOf(f)`, `resizeSelected(w, d)`, `attachIcon(file)`, `clearIcon()`, `getMeasure()`, `fmt(s)`, `renderModeOf(f)`, `project(x, y, z)`, `getCanvas()`, `render()`.
- Layers: `fence`, `build`, `tent`, `solar`, `trees`, `routes`, `labels`, `grid`.
- Supported categories: `building`, `cottage`, `tent`, `pool`, `playground`, `parking`, `diesel_tank`, `solar`, `olive_zone`, `hazard`, `medical`, `security`, `gate`, `fence`, `field`, `yard`, `road`, `assembly`, `vehicle`, `tree`, `extinguisher`, `camera`, `custom`.

### 3. `window.SOS.Interior` (`js/interior.js`)
- Methods: `open(featureId)`, `close()`, `pick()`, `isOpen()`.

### 4. `window.SOS.Routing` (`js/routing.js`)
- Methods: `open()`, `close()`, `isOpen()`, `setOverlayMode('both'|'fire'|'shelling'|'off')`, `getOverlayMode()`, `solveDijkstra(protocol, startId, goalFilter)`, `drawOn3D(ctx, P, sc)`, `hasActiveAnim()`.

### 5. Top-Bar Placeholders Remaining (`index.html`)
- `#btnSign` (`disabled`, `[Phase 3] Signage`)
- `#btnExp` (`disabled`, `[Phase 4] Export Village`)

---

## Handoff Notes for Phase 3 (`js/signage.js`)
1. Enable `#btnSign` (label: `Signage`) and persist pins inside `window.SOS.State.project.signagePins`.
2. Render print-ready **A3 / A4 Poster PNG** (`300 DPI` desktop / `150 DPI` mobile) in **Daylight Print** architectural styling (warm off-white poster frame, bilingual AR/EN header, compass rose, legend, `YOU ARE HERE` red-yellow pin, wall facing direction **Heads-Up Orientation**, nearest fire extinguisher + bold dark-cased Fire & Shelling routes computed via `window.SOS.Routing.solveDijkstra`).
3. Support both **Site Exterior Posters** and **Building Interior Floor Posters** (reading `window.SOS.State.project.interiors[featureId]`).
4. Embed a pure-JS zero-dependency **Offline QR Code Generator** encoding the zone URL (`?loc=pin_id`).
