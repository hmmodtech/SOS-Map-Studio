# SOS Emergency & Evacuation 3D Master Studio — PROGRESS.md

## Architecture & Operational Constraints
- **Deployment Model:** Zero-build, zero-dependency static web app hosted on GitHub Pages (`Plan B OPSEC`: **ZERO** real GPS coordinates, site layouts, village names, or staff data hardcoded in the repository).
- **Local Data Workflow:** Site KML (`SOS-Village-Clean.kml`) and project state (`.sos.json`) remain strictly local on the operator's device and are imported/exported at runtime.
- **Namespace:** Global `window.SOS = window.SOS || {};` using classic `<script src="js/..."></script>` tags (no ES modules, no CDNs, no bundlers).
- **Visual Identity:** Dark Neon Matrix Cyber HUD (`#080b10` bg, `#0e141d` panels, `#1b2838` borders, `#39ff14` cyber green, `#e8c84a` warning amber, `#ff3c3c` danger red, `#00d9ff` info/safe-haven cyan).
- **UI Language:** Master Studio is **100% English** (with bilingual `en_name` / `ar_name` data fields for Village Field Edition export).

---

## Repository Structure & Status
- `index.html` — **[DONE — Phase 2A wired]** Main Cyber HUD shell, file pickers, toolbar, Inspector (including `Edit Floor Plan` button), and keyboard shortcut guard (`S.Interior.isOpen()`).
- `css/style.css` — **[DONE — Phase 1.1]** Single-row top HUD bar, responsive Cyber HUD layout.
- `js/state.js` — **[DONE — Phase 1]** Project state, undo/redo snapshots, `.sos.json` load/save, optional localStorage draft, OPSEC wipe.
- `js/kmlParser.js` — **[DONE — Phase 1.1]** KML 2.2 metric parser (ignores `<visibility>0</visibility>`, reads `ExtendedData`, computes metric area/perimeter & site alignment angle).
- `js/engine.js` — **[DONE — Phase 1.1]** Canvas 2D 2.5D/3D isometric engine, label collision filter, architectural neutral building colors, procedural sub-units (`auto` / `solid`) for tents & cottages, Base64 icon compressor, metric distance ruler.
- `js/interior.js` — **[DONE — Phase 2A]** Self-contained 2D architectural cutaway floor plan editor (injects `<style id="sos-interior-css">`), multi-floor tabs, snap-to-grid, templates, stair ghost alignment across floors, PNG export, True North mini-compass.
- `js/routing.js` — **[NEXT — Phase 2B]** Multi-protocol emergency routing graph (Dijkstra: Fire Evacuation + Shelling/Crossfire Safe Havens + Blocked Path simulation).
- `js/signage.js` — **[PENDING — Phase 3]** Context-aware A3/A4 Wall Signage generator (`YOU ARE HERE`, heads-up wall orientation, offline QR generator).
- `js/exporter.js` — **[PENDING — Phase 4]** Standalone `village.html` exporter (<400 KB, Read-Only bilingual AR/EN, `?alert=` & `?loc=` params, offline audio cues, MikroTik Captive Portal ready).

---

## Verified Public API Contracts (`window.SOS`)

### 1. `window.SOS.State` (`js/state.js`)
Verified members & methods used by `index.html` and `js/interior.js`:
- `project`: `{ meta: { areaSqm, perimeterM, ... }, features: [], interiors: {}, ... }`
- `autoSave` (boolean)
- `snapshot()`, `undo()`, `redo()`
- `on(event, fn)`, `emit(event, data)`
  - Verified events: `'change'`, `'select'`, `'view'`, `'measure'`, `'status'`
- `saveProjectJSON()`, `loadProjectJSON(file)`
- `autoSaveDraft()`, `restoreDraft()`, `clearWorkspace()`

### 2. `window.SOS.KMLParser` (`js/kmlParser.js`)
- `parse(xmlText)` → `{ meta, features, skipped }`

### 3. `window.SOS.Engine` (`js/engine.js`)
Verified methods used by `index.html`:
- `init(canvasEl)`, `fitView()`, `toggleNorthUp()`
- `isHQ()`, `setQuality(bool)`
- `setTool(tool)` (`'select' | 'pan' | 'add' | 'measure'`)
- `setAddType(type)`
- `setLayer(key, bool)` (`'fence' | 'build' | 'tent' | 'solar' | 'trees' | 'labels' | 'grid'`)
- `setYaw(deg)`, `setPitch(deg)`, `fmt(seconds)`
- `getSelected()`, `select(id)`, `deleteSelected()`
- `renderModeOf(feature)`, `sizeOf(feature)`, `resizeSelected(w, d)`
- `attachIcon(file)`, `clearIcon()`
- **Note for Phase 2B:** Do NOT guess internal camera/projection helpers in `js/engine.js`; inspect `js/engine.js` before adding route-overlay rendering or map click hooks.

### 4. `window.SOS.Interior` (`js/interior.js`)
- `open(featureId)` — Opens fullscreen 2D cutaway editor for polygon `building | medical | security` features.
- `close()` — Closes editor and emits `State.emit('change')`.
- `pick()` — Opens modal structure picker when no valid building is selected.
- `isOpen()` — Returns boolean (used by `index.html` to prevent global `Delete`/`Ctrl+Z` from affecting exterior features).
- **Verified Interior Data Schema** (`window.SOS.State.project.interiors[featureId]`):
  ```json
  {
    "featureId": "building_3story",
    "alignAngleRad": 0,
    "floors": {
      "1": {
        "rooms": [{ "id": "r_...", "x": 0, "y": 0, "w": 4, "h": 3, "en_name": "Office 1", "ar_name": "", "color": "#00d9ff" }],
        "walls": [{ "id": "w_...", "x1": 0, "y1": 0, "x2": 4, "y2": 0 }],
        "items": [{ "id": "i_...", "type": "safe_haven", "x": 0, "y": 0, "w": 4, "h": 3, "rotationDeg": 0, "en_name": "", "ar_name": "" }]
      }
    }
  }
