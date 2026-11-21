# SOS Emergency & Evacuation 3D Master Studio — PROGRESS.md

## Architecture & Operational Constraints
- **Deployment Model:** Zero-build, zero-dependency static web app hosted on GitHub Pages (`Plan B OPSEC`: **ZERO** real GPS coordinates, site layouts, village names, or staff data hardcoded in the repository).
- **Local Data Workflow:** Site KML (`SOS-Village-Clean.kml`) and project state (`.sos.json`) remain strictly local on the operator's device and are imported/exported at runtime.
- **Namespace:** Global `window.SOS = window.SOS || {};` using classic `<script src="js/..."></script>` tags (no ES modules, no CDNs, no bundlers).
- **Visual Identity:** Dark Neon Matrix Cyber HUD (`#080b10` bg, `#0e141d` panels, `#1b2838` borders, `#39ff14` cyber green, `#e8c84a` warning amber, `#ff3c3c` danger red, `#00d9ff` cyan, `#a06bff` safe-haven purple).
- **UI Language:** Master Studio is **100% English** (with bilingual `en_name` / `ar_name` data fields for Village Field Edition export).

---

## Repository Structure & Status
- `index.html` — **[DONE — Phase 2B wired]** Cyber HUD shell, `Interiors` + `Routing` active, `Emergency Routes` layer & 3D Route Overlay selector, modal keyboard guards.
- `css/style.css` — **[DONE — Phase 1.1]** Single-row top HUD bar, responsive Cyber HUD layout.
- `js/state.js` — **[DONE — Phase 1, verified]** Full `.sos.json` persistence for `features`, `interiors`, `routes`, `signagePins`, undo/redo, draft, OPSEC wipe.
- `js/kmlParser.js` — **[DONE — Phase 1.1]** KML 2.2 metric parser.
- `js/engine.js` — **[DONE — Phase 2B hook]** Canvas 2D 2.5D/3D isometric engine + `routes` layer + `S.Routing.drawOn3D(ctx, P, sc)` live animated overlay + `project: P` exposed.
- `js/interior.js` — **[DONE — Phase 2A]** Self-contained 2D architectural cutaway floor plan editor.
- `js/routing.js` — **[DONE — Phase 2B]** Self-contained 2D Top-Down Emergency Routing Studio (injects `<style id="sos-routing-css">`), Fire & Shelling protocols, Auto-Seed Nodes, Auto-Connect (Prim MST + alternate links), Dijkstra shortest path + evacuation time (`1.2 m/s` & `0.8 m/s`), Blocked Path/Hazard simulator, PNG export, and Live 3D animated overlay.
- `js/signage.js` — **[NEXT — Phase 3]** Context-aware A3/A4 Wall Signage generator (`YOU ARE HERE` pin, heads-up wall orientation, nearest extinguisher & fire/shelling paths, offline QR code generator).
- `js/exporter.js` — **[PENDING — Phase 4]** Standalone `village.html` exporter (<400 KB, Read-Only bilingual AR/EN, `?alert=` & `?loc=` params, offline audio cues, MikroTik Captive Portal script).

---

## Verified Public API Contracts (`window.SOS`)

### 1. `window.SOS.State` (`js/state.js`)
- `project`: `{ meta, features, customAssets, interiors, routes: { fire: { nodes, edges }, shelling: { nodes, edges } }, signagePins }`
- Methods: `blank()`, `newFeature(o)`, `merge(p)`, `on(e, f)`, `emit(e, d)`, `snapshot()`, `undo()`, `redo()`, `saveProjectJSON()`, `loadProjectJSON(file)`, `autoSaveDraft()`, `restoreDraft()`, `clearWorkspace()`.

### 2. `window.SOS.Engine` (`js/engine.js`)
- Methods: `init(cv)`, `setTool(t)`, `setAddType(t)`, `setYaw(v)`, `setPitch(v)`, `setQuality(h)`, `isHQ()`, `setLayer(k, v)`, `toggleNorthUp()`, `fitView()`, `select(id)`, `getSelected()`, `deleteSelected()`, `sizeOf(f)`, `resizeSelected(w, d)`, `attachIcon(file)`, `clearIcon()`, `getMeasure()`, `fmt(s)`, `renderModeOf(f)`, `project(x, y, z)`, `render()`.
- Layers: `fence`, `build`, `tent`, `solar`, `trees`, `routes`, `labels`, `grid`.

### 3. `window.SOS.Interior` (`js/interior.js`)
- Methods: `open(featureId)`, `close()`, `pick()`, `isOpen()`.

### 4. `window.SOS.Routing` (`js/routing.js`)
- Methods: `open()`, `close()`, `isOpen()`, `setOverlayMode('both'|'fire'|'shelling'|'off')`, `getOverlayMode()`, `solveDijkstra(protocol, startId, goalFilter)`, `drawOn3D(ctx, P, sc)`, `hasActiveAnim()`.
- **Verified Routes Schema** (`window.SOS.State.project.routes.fire` / `.shelling`):
  ```json
  {
    "nodes": [{ "id": "n_...", "x": 0, "y": 0, "type": "start|waypoint|assembly|exit|safe_haven", "en_name": "", "ar_name": "", "featureId": null, "blocked": false }],
    "edges": [{ "id": "e_...", "from": "n_1", "to": "n_2", "blocked": false, "bidirectional": true }]
  }
5. Top-Bar Placeholders Remaining (index.html)
​#btnSign (disabled, [Phase 3] Signage)
​#btnExp (disabled, [Phase 4] Export Village)
​Handoff Notes for Phase 3 (js/signage.js)
​1. Enable #btnSign (label: Signage) and store wall signage pins in window.SOS.State.project.signagePins.
​2. Allow placing a YOU ARE HERE pin on either the exterior site map or inside a building floor (interiors), setting the viewer's wall facing angle (Heads-Up Orientation), auto-rotating the diagram so "forward" is up, highlighting the nearest fire extinguisher + Fire (green) & Shelling (cyan) Dijkstra routes via window.SOS.Routing.solveDijkstra.
​3. Include a zero-dependency pure-JS offline QR generator encoding the zone URL (?loc=pin_id) and export print-ready A3/A4 PNG (300 DPI desktop / 150 DPI mobile).
