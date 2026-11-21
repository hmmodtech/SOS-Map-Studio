# SOS Emergency & Evacuation 3D Master Studio — PROGRESS

## Phase 1 status: COMPLETE (6 files)
`index.html`, `css/style.css`, `js/state.js`, `js/kmlParser.js`, `js/engine.js`, `PROGRESS.md`

Load order (global namespace, no ES modules): `state.js` -> `kmlParser.js` -> `engine.js` -> inline UI script in `index.html`.

## OPSEC
No coordinates, names or KML are in source. The app starts empty. localStorage draft is OFF by default (checkbox in left panel). "Clear Data (OPSEC)" wipes project, undo history and the draft.

## window.SOS API contract

### Schema (`SOS.State.project`)
```
{ meta:{version:"1.0",name,originLat,originLon,trueNorthOffsetDeg,areaSqm,perimeterM},
  features:[], customAssets:[], interiors:{},
  routes:{fire:{nodes:[],edges:[]},shelling:{nodes:[],edges:[]}}, signagePins:[] }
```
Feature: `{id,ar_name,en_name,category,shapeType,geometryType("polygon"|"point"),coordsMetric:[{x,y}],center:{x,y},height_m,floors,roofType("flat"|"red_tile"|"quonset"|"pyramid"),hazard_flag,color,visible,customIconBase64,rotationDeg,notes}`
(KML import also adds `areaSqm`, `perimeterM` on polygon features.)
Metric frame: meters, +x east, +y north, origin = bbox centre of fence (or all features).
`rotationDeg` rotates `coordsMetric` about `center` at render time.

### `SOS.State`
`project`, `autoSave`, `blank()`, `newFeature(overrides)`, `merge(obj)`, `snapshot()`, `undo()`, `redo()` (max 30), `saveProjectJSON()`, `loadProjectJSON(file)->Promise`, `autoSaveDraft()`, `restoreDraft()->bool`, `clearWorkspace()`,
`on(evt,fn)`, `emit(evt,data)`.
Events: `change` (project mutated), `select` (feature|null), `view` ({yaw,pitch,north}), `status` ({x,y,zoom,count,meta}), `measure` ({d,t12,t08}|null).
Rule: call `St.snapshot()` BEFORE mutating, then `St.emit('change')`.

### `SOS.KMLParser`
`parse(xmlText) -> {meta:{originLat,originLon,areaSqm,perimeterM,trueNorthOffsetDeg}, features[], skipped}`. Throws on invalid XML / no visible placemarks.
ExtendedData keys read: `feature_id, category, en_name, ar_name, height_m, floors, hazard_flag` (optional `roof_type`).

### `SOS.Engine`
`init(canvas)`, `setTool('select'|'pan'|'add'|'measure')`, `setAddType(type)`, `setYaw(deg)`, `setPitch(0..75)`, `setQuality(bool)`, `isHQ()`, `setLayer(key,bool)` (keys: fence, build, tent, solar, trees, labels, grid), `toggleNorthUp()`, `fitView()`, `select(id)`, `getSelected()`, `deleteSelected()`, `sizeOf(f)`, `resizeSelected(w,d)`, `attachIcon(file)->Promise` (128px max WebP/PNG base64), `clearIcon()`, `getMeasure()`, `fmt(sec)`, `render()`.

## Known Phase 1 simplifications
- `quonset` roof is drawn as a layered dome approximation, not a true half-cylinder.
- Rotation handle is the Inspector field (no on-canvas handle); resize is via Inspector width/depth.
- Windows draw only in High quality at zoom > 1.2.

## Phase 2 handoff (Interior Cutaway Floor Editor + Dijkstra Routing)
1. Add `js/interiors.js` (`SOS.Interiors`): per-building floor plans in `project.interiors[featureId] = {floors:[{level, walls:[], doors:[], stairs:[], rooms:[]}]}`. Cutaway = engine draws selected building with front walls/roof hidden; add `Engine.setCutaway(featureId, floor)`.
2. Add `js/routing.js` (`SOS.Routing`): graph in `project.routes.fire|shelling = {nodes:[{id,x,y,floor,type}], edges:[{a,b,w,blocked}]}`. Dijkstra with a protocol weight function: fire = avoid hazard features and interior corridors with smoke; shelling = prefer shelters / minimise open-ground exposure. Output path ids, metres, and time at 1.2 and 0.8 m/s.
3. In `index.html` enable the two `[Phase 2]` buttons, add `<script>` tags AFTER `engine.js`, extend `Engine.render()` with a route overlay pass (after features, before compass).
4. Keep `meta.version` bump to `"1.1"` and make `State.merge` tolerant of older files.
5. Do not add any real coordinates or site data to source; test with self-made dummy KML kept off the repo.
