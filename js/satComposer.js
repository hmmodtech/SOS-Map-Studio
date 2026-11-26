window.SOS = window.SOS || {};
(function (S) {
  'use strict';

  var St = S.State;
  var MONO = "'JetBrains Mono','Fira Code',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
  var IDB_NAME = 'aj_geocad_sat_idb_v1';
  var IDB_STORE = 'kv';
  var MAX_SAFE_EDGE = 16384;
  var MAX_LIVE_CACHE_EDGE = 4096;
  var MAX_UNDO = 40;
  var D = Math.PI / 180;

  function uid(p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function safeNormLang(raw) {
    if (S.SatThemeUI && typeof S.SatThemeUI.normalizeLangPrefs === 'function') {
      return S.SatThemeUI.normalizeLangPrefs(raw);
    }
    var r = (raw && typeof raw === 'object') ? raw : {};
    return {
      menus:  r.menus  === 'ar' ? 'ar' : 'en',
      guide:  r.guide  === 'ar' ? 'ar' : 'en',
      panels: r.panels === 'ar' ? 'ar' : 'en'
    };
  }

  function defaultLangPrefs() {
    if (S.SatThemeUI && typeof S.SatThemeUI.loadLangPrefs === 'function') {
      return S.SatThemeUI.loadLangPrefs();
    }
    return { menus: 'en', guide: 'en', panels: 'en' };
  }

  function blankDoc() {
    var lp = defaultLangPrefs();
    return {
      version: 2,
      lang: lp.panels,
      langPrefs: lp,
      base: { id: null, name: '', mime: '', width: 0, height: 0, byteSize: 0 },
      calibration: { pxPerMeter: 0, p1: null, p2: null, knownMeters: 10 },
      layers: {
        base: { visible: true, locked: true, opacity: 1 },
        cleanup: { visible: true, opacity: 1 },
        assets: { visible: true, opacity: 1 },
        overlays: { visible: true, opacity: 1 },
        gis: { visible: true, opacity: 1 },
        geoterra: { visible: true, opacity: 1 }
      },
      showScaleBar: true,
      sun: { azimuthDeg: 135, lengthFactor: 0.75, opacity: 0.38, blurPx: 4, color: '#2a2118' },
      cleanupImage: { id: null, name: '', width: 0, height: 0 },
      patches: [],
      cleanupErases: [],
      assets: [],
      overlays: {
        titleAr: '', titleEn: '', showNorth: true, showScale: true, showLegend: true, northDeg: 0,
        pins: [], paper: 'A2_L', dpi: 200, customWcm: 60, customHcm: 40
      },
      gis: {
        features: [],
        showGraticule: false,
        showHeatmap: false,
        gridStepM: 25,
        coordSys: 'dd',
        activeCategory: 'building',
        snap: { enabled: true, vertex: true, midpoint: true, edge: true, intersection: true }
      },
      geoterra: S.SatGeoTerra ? S.SatGeoTerra.blankState() : {
        version: 7, boundary: [], boundaryClosed: false,
        grid: { cols: 6, rows: 4, aligned: true, dimOutside: true, subGrid: false, showGrid: true },
        filters: { REM: true, REP: true, MOD: true, ADD: true, pins: true, gcps: true },
        features: [], nextFeatNum: 1, gcps: [], georefModelType: 'auto', surveyGeom: 'polygon', editSavedVertices: false
      }
    };
  }

  function blankBins() { return { base: null, cleanup: null, assets: {} }; }

  var doc = blankDoc();
  var bins = blankBins();
  var imgs = { base: null, cleanup: null, assets: {} };
  var undoStack = [], redoStack = [];
  var opGen = 0;
  var idbQueue = Promise.resolve();
  var idbStatus = 'Ready';

  var cleanupCacheCv = null, cleanupCacheScale = 1, cleanupDirty = true, patchScratchCv = null;
  var ov = null, cv = null, ctx = null, built = false, isOpen = false;
  var W = 1, H = 1, dpr = 1;
  var view = { s: 1, ox: 0, oy: 0 };
  var menuCtrl = null, railCtrl = null, wsCtrl = null;
  var tool = 'select';
  var selAssetId = null, selPinId = null, selGisIds = [], selGtIdx = -1, pinCat = 'bldg';
  var quickMoveArmed = false, quickPopEl = null;
  var ptrs = {}, drag = null, space = false, hovImg = null, snapPreview = null;
  var calibDraft = { p1: null, p2: null }, bearingDraft = { p1: null, p2: null };
  var measPts = [], cutPts = [], gisDraftPts = [], gtDraftPts = [];
  var cutFeatherPx = 3, autoHealOnLift = true, edgeSoftenPx = 3;
  var cloneCfg = { src: null, pickMode: false, radius: 28, feather: 0.65, opacity: 1.0, rotDeg: 0, followDrag: true };
  var eraseCfg = { radius: 28, feather: 0.65, opacity: 1.0 };
  var photoCfg = { color: '#c5a267', radius: 18, hardness: 0.5, opacity: 0.75, tolerance: 28, contiguous: true };
  var attrFilter = { text: '', cat: 'ALL' };
  var statusMsg = 'Import Base Satellite or GeoTerra JSON/ZIP (File menu) to begin.';
  var georefModel = null, gpsEngine = null, compassEngine = null;
  var liveGpsFix = null, liveCompassDeg = null, gpsStatusTxt = 'OFF';
  var viewshedResult = null, rangeRingsState = null, evacMatrixLinks = [];
  var driftFixPending = false, bottomTabMode = 'attr';

  function langOf(part) {
    var lp = doc.langPrefs || defaultLangPrefs();
    return lp[part] === 'ar' ? 'ar' : 'en';
  }

  function getBaseDims() {
    if (imgs.base && imgs.base.naturalWidth) return { w: imgs.base.naturalWidth, h: imgs.base.naturalHeight };
    if (doc.base.width > 0 && doc.base.height > 0) return { w: doc.base.width, h: doc.base.height };
    return { w: 0, h: 0 };
  }

  // =========================================================================
  // 1. SERIALIZED INDEXEDDB STORAGE
  // =========================================================================
  function openIDB() {
    return new Promise(function (res, rej) {
      try {
        if (!window.indexedDB) return rej(new Error('IndexedDB unavailable'));
        var req = window.indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = function (e) {
          var db = e.target.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
        };
        req.onsuccess = function () { res(req.result); };
        req.onerror = function () { rej(req.error || new Error('IndexedDB open failed')); };
      } catch (err) { rej(err); }
    });
  }

  function setIdbBadge(txt) {
    idbStatus = txt;
    if (ov) {
      var el = ov.querySelector('#scIdb');
      if (el) el.textContent = 'IDB: ' + txt;
    }
  }

  function persistToIDB() {
    var snapGen = opGen;
    var docCopy = JSON.parse(JSON.stringify(doc));
    var binCopy = { base: bins.base, cleanup: bins.cleanup, assets: Object.assign({}, bins.assets) };
    setIdbBadge('Saving...');
    idbQueue = idbQueue.then(function () {
      if (snapGen !== opGen) return;
      return openIDB().then(function (db) {
        return new Promise(function (res, rej) {
          try {
            var tx = db.transaction(IDB_STORE, 'readwrite');
            var st = tx.objectStore(IDB_STORE);
            st.put(docCopy, 'doc');
            st.put(binCopy, 'bins');
            tx.oncomplete = function () { db.close(); if (snapGen === opGen) setIdbBadge('Saved'); res(); };
            tx.onerror = function () { db.close(); rej(tx.error); };
          } catch (e) { db.close(); rej(e); }
        });
      });
    }).catch(function () {
      if (snapGen === opGen) setIdbBadge('Unavailable');
    });
    return idbQueue;
  }

  function wipeIDB() {
    setIdbBadge('Clearing...');
    idbQueue = idbQueue.then(function () {
      return openIDB().then(function (db) {
        return new Promise(function (res, rej) {
          try {
            var tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).clear();
            tx.oncomplete = function () { db.close(); setIdbBadge('Cleared'); res(); };
            tx.onerror = function () { db.close(); rej(tx.error); };
          } catch (e) { db.close(); rej(e); }
        });
      });
    }).catch(function () { setIdbBadge('Unavailable'); });
    return idbQueue;
  }

  function hydrateFromIDB() {
    var snapGen = opGen;
    setIdbBadge('Loading...');
    idbQueue = idbQueue.then(function () {
      if (snapGen !== opGen) return;
      return openIDB().then(function (db) {
        return new Promise(function (res, rej) {
          try {
            var tx = db.transaction(IDB_STORE, 'readonly');
            var st = tx.objectStore(IDB_STORE);
            var rDoc = st.get('doc'), rBin = st.get('bins');
            tx.oncomplete = function () {
              db.close();
              if (snapGen !== opGen) return res();
              if (rDoc.result) doc = mergeDoc(rDoc.result);
              if (rBin.result) bins = {
                base: rBin.result.base || null,
                cleanup: rBin.result.cleanup || null,
                assets: rBin.result.assets ? Object.assign({}, rBin.result.assets) : {}
              };
              recomputeGeoref(false);
              decodeAllImages(snapGen, function () {
                if (snapGen !== opGen) return;
                cleanupDirty = true;
                setIdbBadge(bins.base ? 'Restored' : 'Ready');
                if (isOpen) { applyLanguagePrefsUI(); fitView(); syncUI(); draw(); }
              });
              res();
            };
            tx.onerror = function () { db.close(); rej(tx.error); };
          } catch (e) { db.close(); rej(e); }
        });
      });
    }).catch(function () {
      if (snapGen === opGen) setIdbBadge('Unavailable');
    });
  }

  // =========================================================================
  // 2. STATE NORMALIZATION, HISTORY / UNDO / REDO & IMAGE DECODING
  // =========================================================================
  function normalizeAsset(a) {
    return Object.assign({
      id: uid('ast'), binId: '', name: 'Asset', source: 'png',
      naturalW: 100, naturalH: 100, x: 100, y: 100, wPx: 100, hPx: 100,
      lockAspect: true, rotationDeg: 0, flipX: false, flipY: false,
      opacity: 1, visible: true, locked: false, elevationM: 2.5, shadowEnabled: true
    }, a || {}, {
      filters: Object.assign(
        { brightness: 100, contrast: 100, saturation: 100, warmth: 0, blurPx: 0, grain: 0 },
        (a && a.filters) || {}
      )
    });
  }

  function mergeDoc(raw) {
    var b = blankDoc();
    if (!raw || typeof raw !== 'object') return b;
    var lp = raw.langPrefs ? safeNormLang(raw.langPrefs) : defaultLangPrefs();
    var gisRaw = raw.gis || {};
    var gisFeats = Array.isArray(gisRaw.features)
      ? gisRaw.features.map(function (f) { return S.SatArcGIS ? S.SatArcGIS.createFeature(f) : f; })
      : [];
    return {
      version: 2,
      lang: lp.panels,
      langPrefs: lp,
      base: Object.assign(b.base, raw.base || {}),
      calibration: Object.assign(b.calibration, raw.calibration || {}),
      layers: {
        base: Object.assign(b.layers.base, (raw.layers && raw.layers.base) || {}, { locked: true }),
        cleanup: Object.assign(b.layers.cleanup, (raw.layers && raw.layers.cleanup) || {}),
        assets: Object.assign(b.layers.assets, (raw.layers && raw.layers.assets) || {}),
        overlays: Object.assign(b.layers.overlays, (raw.layers && raw.layers.overlays) || {}),
        gis: Object.assign(b.layers.gis, (raw.layers && raw.layers.gis) || {}),
        geoterra: Object.assign(b.layers.geoterra, (raw.layers && raw.layers.geoterra) || {})
      },
      showScaleBar: raw.showScaleBar !== false,
      sun: Object.assign(b.sun, raw.sun || {}),
      cleanupImage: Object.assign(b.cleanupImage, raw.cleanupImage || {}),
      patches: Array.isArray(raw.patches) ? raw.patches : [],
      cleanupErases: Array.isArray(raw.cleanupErases) ? raw.cleanupErases : [],
      assets: Array.isArray(raw.assets) ? raw.assets.map(normalizeAsset) : [],
      overlays: Object.assign(b.overlays, raw.overlays || {}, {
        pins: Array.isArray(raw.overlays && raw.overlays.pins) ? raw.overlays.pins : []
      }),
      gis: {
        features: gisFeats,
        showGraticule: !!gisRaw.showGraticule,
        showHeatmap: !!gisRaw.showHeatmap,
        gridStepM: +gisRaw.gridStepM || 25,
        coordSys: gisRaw.coordSys || 'dd',
        activeCategory: gisRaw.activeCategory || 'building',
        snap: Object.assign({}, b.gis.snap, gisRaw.snap || {})
      },
      geoterra: S.SatGeoTerra ? S.SatGeoTerra.mergeState(raw.geoterra) : Object.assign(b.geoterra, raw.geoterra || {})
    };
  }

  function pushUndo(label) {
    undoStack.push({
      label: label || ('Edit (' + tool + ')'),
      ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      json: JSON.stringify(doc)
    });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack = [];
    syncUndoBtns();
  }

  function restoreUndoEntry(entry) {
    var raw = typeof entry === 'string' ? entry : entry.json;
    var curLp = Object.assign({}, doc.langPrefs);
    doc = mergeDoc(JSON.parse(raw));
    doc.langPrefs = curLp;
    doc.lang = curLp.panels;
    if (selAssetId && !getSelAsset()) selAssetId = null;
    if (selPinId && !getSelPin()) selPinId = null;
    selGisIds = selGisIds.filter(function (id) { return !!getGisById(id); });
    if (selGtIdx >= (doc.geoterra.features || []).length) selGtIdx = -1;
    quickMoveArmed = false;
    calibDraft = { p1: doc.calibration.p1, p2: doc.calibration.p2 };
    recomputeGeoref(false);
    cleanupDirty = true;
    persistToIDB(); syncUI(); draw();
  }

  function doUndo() {
    if (!undoStack.length) return;
    redoStack.push({ label: 'Redo Point', ts: '', json: JSON.stringify(doc) });
    restoreUndoEntry(undoStack.pop());
  }

  function doRedo() {
    if (!redoStack.length) return;
    undoStack.push({ label: 'Undo Point', ts: '', json: JSON.stringify(doc) });
    restoreUndoEntry(redoStack.pop());
  }

  function jumpToHistoryIndex(idx) {
    if (idx < 0 || idx >= undoStack.length) return;
    redoStack.push({ label: 'Before Jump', ts: '', json: JSON.stringify(doc) });
    var entry = undoStack[idx];
    undoStack = undoStack.slice(0, idx);
    restoreUndoEntry(entry);
  }

  function decodeImage(dataUrl, cb) {
    if (!dataUrl) return cb(null, null);
    var im = new Image();
    im.onload = function () { cb(null, im); };
    im.onerror = function () { cb(new Error('Image decode failed'), null); };
    im.src = dataUrl;
  }

  function decodeAllImages(snapGen, done) {
    imgs.base = null; imgs.cleanup = null; imgs.assets = {};
    var tasks = [];
    if (bins.base) tasks.push({ kind: 'base', data: bins.base });
    if (bins.cleanup) tasks.push({ kind: 'cleanup', data: bins.cleanup });
    Object.keys(bins.assets || {}).forEach(function (k) {
      if (bins.assets[k]) tasks.push({ kind: 'asset', id: k, data: bins.assets[k] });
    });
    if (!tasks.length) { if (done) done(); return; }
    var left = tasks.length;
    tasks.forEach(function (t) {
      decodeImage(t.data, function (err, im) {
        if (snapGen === opGen && !err && im) {
          if (t.kind === 'base') { imgs.base = im; doc.base.width = im.naturalWidth; doc.base.height = im.naturalHeight; }
          else if (t.kind === 'cleanup') { imgs.cleanup = im; if (doc.cleanupImage.id) { doc.cleanupImage.width = im.naturalWidth; doc.cleanupImage.height = im.naturalHeight; } }
          else if (t.kind === 'asset') { imgs.assets[t.id] = im; }
        }
        left--;
        if (left <= 0 && done) done();
      });
    });
  }

  function setStatus(msg, isErr) {
    statusMsg = msg;
    if (ov) {
      var el = ov.querySelector('#scStatus');
      if (el) {
        el.textContent = msg;
        el.style.color = isErr ? 'var(--sc-red, #ff3c3c)' : 'var(--sc-cyan, #00e5ff)';
      }
    }
  }

  function hasActiveCleanupImg() { return !!(doc.cleanupImage && doc.cleanupImage.id && imgs.cleanup); }
  function getSelAsset() { for (var i = 0; i < doc.assets.length; i++) if (doc.assets[i].id === selAssetId) return doc.assets[i]; return null; }
  function getSelPin() { var ps = (doc.overlays && doc.overlays.pins) || []; for (var i = 0; i < ps.length; i++) if (ps[i].id === selPinId) return ps[i]; return null; }
  function getGisById(id) { var fs = (doc.gis && doc.gis.features) || []; for (var i = 0; i < fs.length; i++) if (fs[i].id === id) return fs[i]; return null; }
  function getSelGt() { return (selGtIdx >= 0 && doc.geoterra && doc.geoterra.features && doc.geoterra.features[selGtIdx]) ? doc.geoterra.features[selGtIdx] : null; }
  function clearAllSelections() { selAssetId = null; selPinId = null; selGisIds = []; selGtIdx = -1; quickMoveArmed = false; }

  // =========================================================================
  // 3. GEOREFERENCING, LIVE GPS & COMPASS BRIDGE
  // =========================================================================
  function recomputeGeoref(syncScaleAndNorth) {
    if (!S.SatGeorefGPS || !doc.geoterra) { georefModel = null; return null; }
    georefModel = S.SatGeorefGPS.solveGeoref(doc.geoterra.gcps || [], {
      modelType: doc.geoterra.georefModelType || 'auto',
      fallbackPxPerMeter: doc.calibration.pxPerMeter || 0,
      fallbackNorthDeg: doc.overlays.northDeg || 0
    });
    if (georefModel && syncScaleAndNorth) {
      if (georefModel.pxPerMeter > 0) doc.calibration.pxPerMeter = georefModel.pxPerMeter;
      if (georefModel.activeCount >= 2) doc.overlays.northDeg = georefModel.northOffsetDeg;
    }
    return georefModel;
  }

  function ensureGpsCompassEngines() {
    if (!S.SatGeorefGPS) return;
    if (!gpsEngine) {
      gpsEngine = S.SatGeorefGPS.createGpsEngine({
        onFix: function (fix) {
          liveGpsFix = fix;
          gpsStatusTxt = '±' + Math.round(fix.accuracy) + 'm' + (fix.driftApplied ? ' [DRIFT]' : '') + (fix.degraded ? ' [WEAK]' : '');
          updateLiveHudChips();
          if (isOpen) draw();
        },
        onError: function (msg) {
          gpsStatusTxt = 'ERR';
          setStatus('GPS: ' + msg, true);
          updateLiveHudChips();
        },
        onTrackUpdate: function () { if (isOpen) draw(); }
      });
    }
    if (!compassEngine) {
      compassEngine = S.SatGeorefGPS.createCompassEngine(
        function (deg) { liveCompassDeg = deg; updateLiveHudChips(); if (isOpen) draw(); },
        function (state, msg) {
          if (state === 'off') liveCompassDeg = null;
          if (msg && state !== 'active') setStatus('Compass: ' + msg, state !== 'off');
          updateLiveHudChips();
        }
      );
    }
  }

  function updateLiveHudChips() {
    if (!ov) return;
    var gpsChip = ov.querySelector('#scFootGps');
    if (gpsChip) {
      gpsChip.textContent = 'GPS: ' + gpsStatusTxt;
      gpsChip.style.color = (gpsEngine && gpsEngine.isActive()) ? 'var(--sc-green2)' : 'var(--sc-mut)';
    }
    var cmpChip = ov.querySelector('#scFootCmp');
    if (cmpChip) {
      var lbl = (liveCompassDeg != null && S.SatGeoTerra)
        ? (Math.round(liveCompassDeg) + '° ' + S.SatGeoTerra.degToCardinal(liveCompassDeg))
        : 'OFF';
      cmpChip.textContent = '🧭 ' + lbl;
      cmpChip.style.color = liveCompassDeg != null ? 'var(--sc-cyan)' : 'var(--sc-mut)';
    }
  }

  function toggleLiveGps() {
    ensureGpsCompassEngines();
    if (!gpsEngine) return;
    if (gpsEngine.isActive()) {
      gpsEngine.stop(); liveGpsFix = null; gpsStatusTxt = 'OFF';
      setStatus('Live GPS stopped.', false);
    } else {
      var diag = gpsEngine.diagnoseEnvironment();
      if (!diag.ready) {
        alert('GPS Diagnostics:\n- ' + diag.issues.join('\n- ') + '\n\nTip: Use HTTPS / localhost, or paste coordinates / import GPX/KML.');
        setStatus('GPS blocked: ' + diag.issues[0], true);
        return;
      }
      gpsStatusTxt = 'SEARCHING...';
      gpsEngine.start();
      setStatus('Live GPS started (Kalman smoothed + accuracy gate).', false);
    }
    updateLiveHudChips(); syncUI(); draw();
  }

  function toggleLiveCompass() {
    ensureGpsCompassEngines();
    if (!compassEngine) return;
    if (compassEngine.isActive()) { compassEngine.stop(); setStatus('Live Compass stopped.', false); }
    else { compassEngine.start(); setStatus('Live Compass requested...', false); }
    updateLiveHudChips();
  }

  function triggerDriftFixAtClick(imgPt) {
    ensureGpsCompassEngines();
    if (!georefModel || !georefModel.xyToLatLon) { setStatus('Georeference map with ≥ 2 GCPs before GPS Drift Fix.', true); return; }
    if (!gpsEngine || !gpsEngine.getCurrentFix()) { setStatus('Turn on Live GPS and wait for a fix first.', true); return; }
    var ll = georefModel.xyToLatLon(imgPt.x, imgPt.y);
    if (!ll) return;
    var res = gpsEngine.setDriftCalibration(ll.lat, ll.lon, 'Map Anchor');
    if (res) { setStatus('GPS Drift Offset calibrated (shifted ' + res.shiftMeters + ' m).', false); draw(); }
  }

  function dropGpsPointNow() {
    ensureGpsCompassEngines();
    var dims = getBaseDims();
    if (!dims.w) { setStatus('Import Base Satellite image first.', true); return; }
    if (!georefModel) { setStatus('Link at least 2 GCPs before dropping GPS points.', true); return; }
    var fix = gpsEngine && gpsEngine.getCurrentFix();
    if (!fix) {
      setStatus('Capturing averaged GPS fix...', false);
      gpsEngine.captureAveragedFix(5, function (n, tot, acc) {
        setStatus('Averaging GPS ' + n + '/' + tot + ' (±' + Math.round(acc) + 'm)...', false);
      }, function (err, avg) {
        if (err || !avg) { setStatus('GPS Drop failed: ' + ((err && err.message) || 'No fix'), true); return; }
        insertGeorefPoint(avg.lat, avg.lon, avg.accuracy);
      });
      return;
    }
    insertGeorefPoint(fix.lat, fix.lon, fix.accuracy);
  }

  function insertGeorefPoint(lat, lon, accM) {
    var dims = getBaseDims();
    var xy = georefModel.latLonToXY(lat, lon);
    if (!xy) { setStatus('Could not project Lat/Lon onto image.', true); return; }
    var pt = { x: +clamp(xy.x, 0, dims.w).toFixed(2), y: +clamp(xy.y, 0, dims.h).toFixed(2) };
    if (tool === 'gt_boundary') {
      pushUndo('GPS Boundary Pt'); doc.geoterra.boundaryClosed = false; doc.geoterra.boundary.push(pt);
    } else if (tool === 'gt_survey') {
      if (doc.geoterra.surveyGeom === 'point') openGeoTerraModalFor([pt], 'point', -1);
      else gtDraftPts.push(pt);
    } else if (tool === 'gis_line' || tool === 'poly_draw') {
      gisDraftPts.push(pt);
    } else {
      pushUndo('GPS GIS Point');
      var f = S.SatArcGIS.createFeature({ geom: 'point', category: doc.gis.activeCategory, name: 'GPS Point', points: [pt], notes: 'GPS ±' + Math.round(accM || 0) + 'm' });
      doc.gis.features.push(f); clearAllSelections(); selGisIds = [f.id];
    }
    panToImgPt(pt.x, pt.y); persistToIDB(); syncUI(); draw();
    setStatus('Dropped GPS point at ' + lat.toFixed(6) + ', ' + lon.toFixed(6), false);
  }

  function panToImgPt(ix, iy) { view.ox = W / 2 - ix * view.s; view.oy = H / 2 - iy * view.s; }

  // =========================================================================
  // 4. IMPORTS: BASE, CLEANUP, PNG ASSETS, GIS FILES, GEOTERRA JSON & ZIP
  // =========================================================================
  function importBaseFile(file) {
    if (!file) return;
    setStatus('Reading full-resolution image: ' + file.name + '...', false);
    var reader = new FileReader();
    reader.onerror = function () { setStatus('Error reading file.', true); };
    reader.onload = function () {
      var dataUrl = reader.result;
      decodeImage(dataUrl, function (err, im) {
        if (err || !im || !im.naturalWidth) { alert(langOf('panels') === 'ar' ? 'ملف الصورة غير مدعوم أو تالف.' : 'Unsupported or corrupted image file.'); return; }
        var nw = im.naturalWidth, nh = im.naturalHeight;
        opGen++; pushUndo('Import Base Satellite');
        bins.base = dataUrl; imgs.base = im;
        doc.base = { id: uid('base'), name: file.name, mime: file.type || 'image/png', width: nw, height: nh, byteSize: file.size || Math.round(dataUrl.length * 0.75) };
        calibDraft = { p1: null, p2: null };
        measPts = []; cutPts = []; gisDraftPts = []; gtDraftPts = [];
        cloneCfg.src = null; cleanupDirty = true;
        setStatus('Loaded 01_Base_Satellite: ' + nw + 'x' + nh + ' px.', false);
        persistToIDB(); fitView(); syncUI(); draw();
      });
    };
    reader.readAsDataURL(file);
  }

  function importCleanupFile(file) {
    if (!file || !imgs.base) { alert(langOf('panels') === 'ar' ? 'حمّل صورة خريطة الأساس أولاً.' : 'Import Base Satellite image first.'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var dataUrl = reader.result;
      decodeImage(dataUrl, function (err, im) {
        if (err || !im) { alert(langOf('panels') === 'ar' ? 'صورة تنظيف غير صالحة.' : 'Invalid cleanup image.'); return; }
        pushUndo('Load Pre-Cleaned Layer');
        bins.cleanup = dataUrl; imgs.cleanup = im;
        doc.cleanupImage = { id: uid('cln'), name: file.name, width: im.naturalWidth, height: im.naturalHeight };
        doc.layers.cleanup.visible = true; cleanupDirty = true;
        persistToIDB(); syncUI(); draw();
      });
    };
    reader.readAsDataURL(file);
  }

  function importAssetFiles(fileList) {
    if (!fileList || !fileList.length) return;
    if (!imgs.base) { alert(langOf('panels') === 'ar' ? 'حمّل صورة خريطة الأساس أولاً قبل إضافة العناصر.' : 'Import Base Satellite image first.'); return; }
    var files = [].slice.call(fileList), doneCount = 0, addedCount = 0;
    pushUndo('Import PNG Asset');
    files.forEach(function (file, idx) {
      var reader = new FileReader();
      reader.onerror = function () { doneCount++; checkDone(); };
      reader.onload = function () {
        var dataUrl = reader.result;
        decodeImage(dataUrl, function (err, im) {
          if (!err && im && im.naturalWidth) {
            var binId = uid('abin'); bins.assets[binId] = dataUrl; imgs.assets[binId] = im;
            var ctr = s2i(W / 2, H / 2);
            ctr.x = clamp(ctr.x, 0, imgs.base.naturalWidth) + idx * 18;
            ctr.y = clamp(ctr.y, 0, imgs.base.naturalHeight) + idx * 18;
            var asp = im.naturalWidth / Math.max(1, im.naturalHeight);
            var wPx = doc.calibration.pxPerMeter > 0
              ? clamp(30 * doc.calibration.pxPerMeter, 24, imgs.base.naturalWidth * 0.92)
              : clamp(im.naturalWidth, 32, imgs.base.naturalWidth * 0.92);
            var ast = normalizeAsset({
              id: uid('ast'), binId: binId, name: file.name.replace(/\.[^.]+$/, '') || 'PNG Asset',
              source: 'png', naturalW: im.naturalWidth, naturalH: im.naturalHeight,
              x: +ctr.x.toFixed(2), y: +ctr.y.toFixed(2), wPx: +wPx.toFixed(2), hPx: +(wPx / asp).toFixed(2)
            });
            doc.assets.push(ast); doc.layers.assets.visible = true; clearAllSelections(); selAssetId = ast.id; addedCount++;
          }
          doneCount++; checkDone();
        });
      };
      reader.readAsDataURL(file);
    });
    function checkDone() {
      if (doneCount === files.length) {
        if (addedCount > 0) { persistToIDB(); setTool('select'); setStatus('Added ' + addedCount + ' asset(s).', false); }
        syncUI(); draw();
      }
    }
  }

  function importGISFile(file) {
    if (!file || !S.SatArcGIS) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var added = S.SatArcGIS.importGISFileText(file.name, String(r.result || ''), georefModel);
        if (!added.length) { alert('No GIS features found in: ' + file.name); return; }
        pushUndo('Import GIS: ' + file.name);
        added.forEach(function (f) { doc.gis.features.push(f); });
        doc.layers.gis.visible = true;
        persistToIDB(); syncUI(); draw();
        setStatus('Imported ' + added.length + ' GIS feature(s) from ' + file.name, false);
      } catch (e) { alert('GIS import failed:\n' + e.message); }
    };
    r.readAsText(file);
  }

  function u8ToBase64(u8) {
    var bin = '', chunk = 4096;
    for (var i = 0; i < u8.length; i += chunk) {
      var end = Math.min(u8.length, i + chunk), sub = '';
      for (var j = i; j < end; j++) sub += String.fromCharCode(u8[j]);
      bin += sub;
    }
    return btoa(bin);
  }

  function extractGeoTerraFromZip(buf) {
    var dv = new DataView(buf), u8 = new Uint8Array(buf), off = 0, dec = new TextDecoder('utf-8');
    var jsonText = null, photoMap = {}, mapPngUrl = null;
    while (off + 30 <= u8.length) {
      if (dv.getUint32(off, true) !== 0x04034b50) break;
      var compMethod = dv.getUint16(off + 8, true);
      var compSize = dv.getUint32(off + 18, true);
      var nLen = dv.getUint16(off + 26, true);
      var eLen = dv.getUint16(off + 28, true);
      var name = dec.decode(u8.subarray(off + 30, off + 30 + nLen));
      var dStart = off + 30 + nLen + eLen;
      if (dStart + compSize > u8.length) break;
      if (compMethod === 0 && compSize > 0) {
        var slice = u8.subarray(dStart, dStart + compSize);
        if (/\.json$/i.test(name)) {
          jsonText = dec.decode(slice);
        } else if (/^photos\/.+\.(jpe?g|png|webp)$/i.test(name)) {
          var mime = /\.png$/i.test(name) ? 'image/png' : /\.webp$/i.test(name) ? 'image/webp' : 'image/jpeg';
          photoMap[name] = 'data:' + mime + ';base64,' + u8ToBase64(slice);
        } else if (/marked_map_full\.png$/i.test(name)) {
          mapPngUrl = 'data:image/png;base64,' + u8ToBase64(slice);
        }
      }
      off = dStart + compSize;
    }
    if (!jsonText) return null;
    var obj = JSON.parse(jsonText.replace(/^\uFEFF/, '').trim());
    if (obj && Array.isArray(obj.features)) {
      obj.features.forEach(function (f) {
        if (Array.isArray(f.photos)) {
          f.photos.forEach(function (ph) {
            if (!ph.dataUrl && ph.file && photoMap[ph.file]) ph.dataUrl = photoMap[ph.file];
          });
        }
      });
    }
    return { data: obj, mapPngUrl: mapPngUrl };
  }

  function applyParsedGeoTerraData(dataObj, optionalMapUrl) {
    if (!S.SatGeoTerra) { alert('js/satGeoTerra.js is not loaded.'); return false; }
    var parsed = S.SatGeoTerra.parseImportedSurveyJson(JSON.stringify(dataObj));
    pushUndo('Import GeoTerra Session');
    doc.geoterra = parsed.state;
    if (parsed.metersPerPixel > 0) doc.calibration.pxPerMeter = +(1 / parsed.metersPerPixel).toFixed(5);
    doc.layers.geoterra.visible = true;

    if (!imgs.base) {
      var wEst = (+dataObj.imageWidth) || 0, hEst = (+dataObj.imageHeight) || 0;
      if (!(wEst > 0 && hEst > 0)) {
        var maxX = 1000, maxY = 800;
        (doc.geoterra.boundary || []).forEach(function (p) { if (p.x > maxX) maxX = p.x + 80; if (p.y > maxY) maxY = p.y + 80; });
        (doc.geoterra.features || []).forEach(function (f) { (f.points || []).forEach(function (p) { if (p.x > maxX) maxX = p.x + 80; if (p.y > maxY) maxY = p.y + 80; }); });
        wEst = Math.ceil(maxX); hEst = Math.ceil(maxY);
      }
      doc.base.width = wEst; doc.base.height = hEst;
    }

    recomputeGeoref(true);
    persistToIDB();
    if (isOpen) { fitView(); syncUI(); draw(); }

    var ar = langOf('panels') === 'ar';
    var msg = ar
      ? ('تم استيراد جلسة GeoTerra بنجاح (' + doc.geoterra.features.length + ' معلم | ' + doc.geoterra.gcps.length + ' GCP | ' + doc.geoterra.boundary.length + ' نقطة حدود).')
      : ('Imported GeoTerra session (' + doc.geoterra.features.length + ' items | ' + doc.geoterra.gcps.length + ' GCPs | ' + doc.geoterra.boundary.length + ' boundary pts).');
    setStatus(msg, false);
    if (wsCtrl) wsCtrl.toggleRight(true);
    var gp = ov && ov.querySelector('#scGtPanel');
    if (gp) gp.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (!imgs.base) {
      var qZip = ar
        ? (msg + '\n\nهل تريد عرض صورة الخريطة المرفقة داخل الـ ZIP كخلفية مؤقتة؟')
        : (msg + '\n\nDisplay the marked map inside this ZIP as a temporary background?');
      var infoNoBase = ar
        ? (msg + '\n\nالمعالم ظاهرة الآن. يمكنك تحميل صورة القمر الصناعي من (ملف ➔ استيراد خريطة الأساس).')
        : (msg + '\n\nFeatures are visible now. Load your Base Satellite via File -> Import Base Satellite.');
      if (optionalMapUrl && confirm(qZip)) {
        decodeImage(optionalMapUrl, function (err, im) {
          if (!err && im) {
            bins.base = optionalMapUrl; imgs.base = im;
            doc.base.width = im.naturalWidth; doc.base.height = im.naturalHeight; doc.base.name = 'GeoTerra_ZIP_Map.png';
            persistToIDB(); fitView(); syncUI(); draw();
          }
        });
      } else {
        alert(infoNoBase);
      }
    }
    return true;
  }

  function importGeoTerraJsonFile(file) {
    if (!file) return;
    if (!S.SatGeoTerra) { alert('js/satGeoTerra.js is not loaded.'); return; }
    if (/\.zip$/i.test(file.name)) {
      var rz = new FileReader();
      rz.onerror = function () { alert('Failed to read ZIP file.'); };
      rz.onload = function () {
        try {
          var ext = extractGeoTerraFromZip(rz.result);
          if (!ext || !ext.data) { alert('Could not extract project_ai.json from this ZIP.'); return; }
          applyParsedGeoTerraData(ext.data, ext.mapPngUrl);
        } catch (e) { alert('GeoTerra ZIP import failed:\n' + e.message); }
      };
      rz.readAsArrayBuffer(file);
      return;
    }

    var r = new FileReader();
    r.onerror = function () { alert('Failed to read file.'); };
    r.onload = function () {
      try {
        var cleanTxt = String(r.result || '').replace(/^\uFEFF/, '').trim();
        var obj = JSON.parse(cleanTxt);
        if (obj && obj.satStudio) {
          importState(obj.satStudio);
          alert('Imported Sat Studio data from project file.');
          return;
        }
        applyParsedGeoTerraData(obj, null);
      } catch (e) {
        setStatus('GeoTerra JSON import failed: ' + e.message, true);
        alert('GeoTerra JSON import failed:\n' + e.message);
      }
    };
    r.readAsText(file);
  }

  // =========================================================================
  // 5. PHOTOSHOP TOOLS, LIFT & AUTO-HEAL GROUND, EDGE SOFTEN & ASSETS
  // =========================================================================
  function replaceAssetImageDataUrl(asset, newDataUrl, newDims, statusText) {
    decodeImage(newDataUrl, function (err, im) {
      if (err || !im || !im.naturalWidth) { setStatus('Failed to update image.', true); return; }
      pushUndo(statusText || 'Edit Asset Image');
      var binId = uid('abin');
      bins.assets[binId] = newDataUrl; imgs.assets[binId] = im;
      asset.binId = binId; asset.naturalW = im.naturalWidth; asset.naturalH = im.naturalHeight;
      if (newDims) {
        if (newDims.x != null) asset.x = newDims.x;
        if (newDims.y != null) asset.y = newDims.y;
        if (newDims.wPx != null) asset.wPx = newDims.wPx;
        if (newDims.hPx != null) asset.hPx = newDims.hPx;
      }
      persistToIDB(); syncUI(); draw();
      if (statusText) setStatus(statusText, false);
    });
  }

  function applyCropSelectedAsset() {
    var a = getSelAsset();
    if (!a || !imgs.assets[a.binId] || !S.SatPhotoTools || cutPts.length < 3) {
      setStatus('Select an asset and click 3+ points around the area to keep.', true); return;
    }
    var pts = cutPts.slice();
    S.SatPhotoTools.cropSelectedAssetByPolygon(a, imgs.assets[a.binId], pts, cutFeatherPx, function (err, res) {
      cutPts = [];
      if (err || !res) { setStatus((err && err.message) || 'Crop failed.', true); syncUI(); draw(); return; }
      setTool('select');
      replaceAssetImageDataUrl(a, res.dataUrl, { x: res.x, y: res.y, wPx: res.wPx, hPx: res.hPx }, 'Cropped asset cleanly.');
    });
  }

  function applyLassoEraseAsset() {
    var a = getSelAsset();
    if (!a || !imgs.assets[a.binId] || !S.SatPhotoTools || cutPts.length < 3) {
      setStatus('Select an asset and click 3+ points to erase.', true); return;
    }
    var pts = cutPts.slice();
    S.SatPhotoTools.erasePolygonFromAsset(a, imgs.assets[a.binId], pts, cutFeatherPx, function (err, url) {
      cutPts = [];
      if (err || !url) { setStatus((err && err.message) || 'Lasso erase failed.', true); syncUI(); draw(); return; }
      setTool('select');
      replaceAssetImageDataUrl(a, url, null, 'Erased lasso region from asset.');
    });
  }

  function applyMagicWandOnAsset(imgPt) {
    var a = getSelAsset();
    if (!a || !imgs.assets[a.binId] || !S.SatPhotoTools) {
      setStatus('Select an asset first, then click the background color.', true); return;
    }
    S.SatPhotoTools.magicWandRemoveColor(a, imgs.assets[a.binId], imgPt, photoCfg.tolerance, photoCfg.contiguous, function (err, url) {
      if (err || !url) { setStatus((err && err.message) || 'Magic Wand failed.', true); return; }
      replaceAssetImageDataUrl(a, url, null, 'Magic Wand removed background color.');
    });
  }

  function applyCropBaseRect(p1, p2) {
    if (!imgs.base || !S.SatPhotoTools) return;
    S.SatPhotoTools.cropBaseCanvasRect(imgs.base, { x0: p1.x, y0: p1.y, x1: p2.x, y1: p2.y }, function (err, res) {
      if (err || !res) { setStatus((err && err.message) || 'Base crop failed.', true); return; }
      decodeImage(res.dataUrl, function (dErr, im) {
        if (dErr || !im) return;
        opGen++; pushUndo('Crop Base Canvas');
        bins.base = res.dataUrl; imgs.base = im;
        doc.base.width = res.width; doc.base.height = res.height;
        doc.base.byteSize = Math.round(res.dataUrl.length * 0.75);
        var sx = res.x0, sy = res.y0;
        doc.assets.forEach(function (a) { a.x = +(a.x - sx).toFixed(2); a.y = +(a.y - sy).toFixed(2); });
        doc.patches.forEach(function (pt) { pt.sx -= sx; pt.sy -= sy; pt.dx -= sx; pt.dy -= sy; });
        doc.cleanupErases.forEach(function (st) { st.pts.forEach(function (pt) { pt.x -= sx; pt.y -= sy; }); });
        doc.overlays.pins.forEach(function (pn) { pn.x -= sx; pn.y -= sy; });
        doc.gis.features.forEach(function (f) { f.points.forEach(function (pt) { pt.x -= sx; pt.y -= sy; }); });
        doc.geoterra.boundary.forEach(function (pt) { pt.x -= sx; pt.y -= sy; });
        doc.geoterra.features.forEach(function (f) { f.points.forEach(function (pt) { pt.x -= sx; pt.y -= sy; }); });
        doc.geoterra.gcps.forEach(function (g) { g.x -= sx; g.y -= sy; });
        recomputeGeoref(false);
        cleanupDirty = true; persistToIDB(); setTool('select'); fitView(); syncUI(); draw();
        setStatus('Cropped Base Satellite to ' + res.width + 'x' + res.height + ' px.', false);
      });
    });
  }

  function autoMatchSoilTone() {
    var a = getSelAsset();
    if (!a || !imgs.base || !imgs.assets[a.binId]) { setStatus('Select an asset on the map first.', true); return; }
    try {
      var ringR = Math.max(a.wPx, a.hPx) * 0.65 + 14;
      var c = document.createElement('canvas'); c.width = 16; c.height = 16;
      var g = c.getContext('2d');
      var sx = clamp(Math.floor(a.x - ringR), 0, imgs.base.naturalWidth - 16);
      var sy = clamp(Math.floor(a.y - ringR), 0, imgs.base.naturalHeight - 16);
      var sw = clamp(Math.round(ringR * 2), 16, imgs.base.naturalWidth - sx);
      var sh = clamp(Math.round(ringR * 2), 16, imgs.base.naturalHeight - sy);
      g.drawImage(imgs.base, sx, sy, sw, sh, 0, 0, 16, 16);
      var d = g.getImageData(0, 0, 16, 16).data, rS = 0, gS = 0, bS = 0, cnt = 0;
      for (var i = 0; i < d.length; i += 4) { rS += d[i]; gS += d[i + 1]; bS += d[i + 2]; cnt++; }
      var lumBase = (0.299 * rS + 0.587 * gS + 0.114 * bS) / Math.max(1, cnt), warmBase = (rS - bS) / Math.max(1, cnt);
      g.clearRect(0, 0, 16, 16); g.drawImage(imgs.assets[a.binId], 0, 0, 16, 16);
      var d2 = g.getImageData(0, 0, 16, 16).data, r2 = 0, g2 = 0, b2 = 0, c2 = 0;
      for (var j = 0; j < d2.length; j += 4) { if (d2[j + 3] < 40) continue; r2 += d2[j]; g2 += d2[j + 1]; b2 += d2[j + 2]; c2++; }
      c.width = 0; c.height = 0; if (!c2) return;
      var lumAst = (0.299 * r2 + 0.587 * g2 + 0.114 * b2) / c2, warmAst = (r2 - b2) / c2;
      pushUndo('Auto-Match Soil Tone');
      a.filters.brightness = Math.round(clamp((lumBase / Math.max(20, lumAst)) * 100, 65, 135));
      a.filters.warmth = Math.round(clamp((warmBase - warmAst) * 0.45, -35, 35));
      a.filters.saturation = Math.round(clamp(a.filters.saturation || 90, 75, 110));
      a.filters.blurPx = Math.max(a.filters.blurPx || 0, 0.4);
      persistToIDB(); syncUI(); draw();
      setStatus(langOf('panels') === 'ar' ? 'تمت مطابقة ألوان العنصر مع التربة المحيطة.' : 'Auto-matched asset tone with surrounding ground.', false);
    } catch (e) { setStatus('Auto-match error: ' + e.message, true); }
  }

  function softenAssetEdges(asset, featherPx) {
    if (!asset || !imgs.assets[asset.binId]) return;
    var im = imgs.assets[asset.binId], w = im.naturalWidth, h = im.naturalHeight;
    var fPx = clamp(+featherPx || 3, 1, 14);
    var d = Math.min(Math.max(1, Math.round(fPx * 0.55)), Math.max(1, Math.floor(Math.min(w, h) * 0.14)));

    var sil = document.createElement('canvas'); sil.width = w; sil.height = h;
    var sctx = sil.getContext('2d');
    sctx.drawImage(im, 0, 0);
    sctx.globalCompositeOperation = 'source-in';
    sctx.fillStyle = '#ffffff'; sctx.fillRect(0, 0, w, h);

    var er = document.createElement('canvas'); er.width = w; er.height = h;
    var ectx = er.getContext('2d');
    ectx.drawImage(sil, 0, 0);
    ectx.globalCompositeOperation = 'destination-in';
    ectx.drawImage(sil, -d, 0); ectx.drawImage(sil, d, 0);
    ectx.drawImage(sil, 0, -d); ectx.drawImage(sil, 0, d);

    var mask = document.createElement('canvas'); mask.width = w; mask.height = h;
    var mctx = mask.getContext('2d');
    if ('filter' in mctx) mctx.filter = 'blur(' + fPx + 'px)';
    mctx.drawImage(er, 0, 0); mctx.filter = 'none';

    var out = document.createElement('canvas'); out.width = w; out.height = h;
    var octx = out.getContext('2d');
    octx.drawImage(im, 0, 0);
    octx.globalCompositeOperation = 'destination-in';
    octx.drawImage(mask, 0, 0);

    var url = out.toDataURL('image/png');
    sil.width = er.width = mask.width = out.width = 0;
    sil.height = er.height = mask.height = out.height = 0;
    replaceAssetImageDataUrl(
      asset, url, null,
      langOf('panels') === 'ar' ? ('تم تنعيم حواف العنصر (' + fPx + 'px).') : ('Softened asset edges (' + fPx + 'px).')
    );
  }

  function distPtToPolyEdges(pt, poly) {
    var best = Infinity;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[j], b = poly[i], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
      var t = clamp(((pt.x - a.x) * dx + (pt.y - a.y) * dy) / l2, 0, 1);
      var d = Math.hypot(pt.x - (a.x + dx * t), pt.y - (a.y + dy * t));
      if (d < best) best = d;
    }
    return best;
  }

  function autoHealPolygonGround(pts, skipUndo) {
    if (!imgs.base || !pts || pts.length < 3) return 0;
    var iw = imgs.base.naturalWidth, ih = imgs.base.naturalHeight;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, cx = 0, cy = 0;
    pts.forEach(function (p) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      cx += p.x; cy += p.y;
    });
    cx /= pts.length; cy /= pts.length;
    var bw = Math.max(8, maxX - minX), bh = Math.max(8, maxY - minY), maxDim = Math.max(bw, bh);
    var r = clamp(Math.round(maxDim * 0.25), 14, 96);
    var step = Math.max(10, Math.round(r * 0.62));
    while ((Math.ceil(bw / step) + 2) * (Math.ceil(bh / step) + 2) > 110) {
      step = Math.round(step * 1.22);
      r = Math.min(130, Math.round(r * 1.15));
    }

    var added = [];
    for (var gy = minY - r * 0.15; gy <= maxY + r * 0.15; gy += step) {
      for (var gx = minX - r * 0.15; gx <= maxX + r * 0.15; gx += step) {
        var gp = { x: gx, y: gy };
        if (!pointInPolyLocal(gp, pts) && distPtToPolyEdges(gp, pts) > r * 0.35) continue;
        var vx = gx - cx, vy = gy - cy, vl = Math.hypot(vx, vy);
        var ux = vl > 1 ? vx / vl : 1, uy = vl > 1 ? vy / vl : 0;
        var sx = gx, sy = gy, walk = 0, maxWalk = maxDim * 1.6 + r * 2;
        while (walk < maxWalk && pointInPolyLocal({ x: sx, y: sy }, pts)) {
          walk += Math.max(4, r * 0.35);
          sx = gx + ux * walk; sy = gy + uy * walk;
        }
        sx = clamp(sx + ux * (r * 1.05), r, Math.max(r, iw - r));
        sy = clamp(sy + uy * (r * 1.05), r, Math.max(r, ih - r));
        if (pointInPolyLocal({ x: sx, y: sy }, pts)) {
          for (var aIdx = 0; aIdx < 8; aIdx++) {
            var ang = (aIdx * Math.PI) / 4;
            var tx = clamp(cx + Math.cos(ang) * (maxDim * 0.72 + r), r, Math.max(r, iw - r));
            var ty = clamp(cy + Math.sin(ang) * (maxDim * 0.72 + r), r, Math.max(r, ih - r));
            if (!pointInPolyLocal({ x: tx, y: ty }, pts)) { sx = tx; sy = ty; break; }
          }
        }
        added.push({
          id: uid('ptc'), sx: +sx.toFixed(1), sy: +sy.toFixed(1),
          dx: +clamp(gx, 0, iw).toFixed(1), dy: +clamp(gy, 0, ih).toFixed(1),
          r: r, feather: 0.78, opacity: 0.96, rotDeg: 0
        });
      }
    }
    if (!added.length) return 0;
    if (!skipUndo) pushUndo('Auto-Heal Ground');
    added.forEach(function (p) { doc.patches.push(p); });
    doc.layers.cleanup.visible = true;
    cleanupDirty = true;
    return added.length;
  }

  function healUnderSelectedAsset() {
    var a = getSelAsset();
    if (!a || !imgs.base) { setStatus('Select an asset with Base Satellite loaded first.', true); return; }
    var hw = a.wPx / 2, hh = a.hPx / 2;
    var quad = [
      assetLocalToImg(a, -hw, -hh), assetLocalToImg(a, hw, -hh),
      assetLocalToImg(a, hw, hh), assetLocalToImg(a, -hw, hh)
    ];
    var cnt = autoHealPolygonGround(quad, false);
    if (cnt > 0) {
      persistToIDB(); syncUI(); draw();
      setStatus(langOf('panels') === 'ar' ? ('تم تنظيف الخلفية تحت «' + a.name + '» تلقائياً.') : ('Auto-healed ground under "' + a.name + '".'), false);
    }
  }

  function liftPolygonFromBase(pts, label, autoHealBg, featherPx) {
    if (!imgs.base) {
      alert(langOf('panels') === 'ar' ? 'حمّل صورة القمر الصناعي (خريطة الأساس) أولاً لاستخراج المعلم منها.' : 'Import Base Satellite image first to lift & edit this object.');
      return;
    }
    if (!pts || pts.length < 3) { setStatus('Polygon must have at least 3 points.', true); return; }
    var iw = imgs.base.naturalWidth, ih = imgs.base.naturalHeight;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    pts.forEach(function (p) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
    var fPx = clamp(featherPx != null ? +featherPx : cutFeatherPx, 0, 10), pad = Math.ceil(fPx * 2) + 2;
    var x0 = Math.max(0, Math.floor(minX - pad)), y0 = Math.max(0, Math.floor(minY - pad));
    var x1 = Math.min(iw, Math.ceil(maxX + pad)), y1 = Math.min(ih, Math.ceil(maxY + pad));
    var bw = x1 - x0, bh = y1 - y0;
    if (bw < 4 || bh < 4 || bw > MAX_SAFE_EDGE || bh > MAX_SAFE_EDGE) { setStatus('Invalid cutout bounds.', true); return; }

    var cutCv = document.createElement('canvas'); cutCv.width = bw; cutCv.height = bh;
    var cctx = cutCv.getContext('2d'); cctx.drawImage(imgs.base, x0, y0, bw, bh, 0, 0, bw, bh);
    var maskCv = document.createElement('canvas'); maskCv.width = bw; maskCv.height = bh;
    var mctx = maskCv.getContext('2d'); mctx.beginPath();
    pts.forEach(function (p, i) { if (i === 0) mctx.moveTo(p.x - x0, p.y - y0); else mctx.lineTo(p.x - x0, p.y - y0); });
    mctx.closePath();
    if (fPx > 0 && 'filter' in mctx) mctx.filter = 'blur(' + fPx + 'px)';
    mctx.fillStyle = '#fff'; mctx.fill(); mctx.filter = 'none';
    cctx.globalCompositeOperation = 'destination-in'; cctx.drawImage(maskCv, 0, 0);
    var pngUrl = cutCv.toDataURL('image/png');
    cutCv.width = maskCv.width = 0; cutCv.height = maskCv.height = 0;

    decodeImage(pngUrl, function (err, im) {
      if (err || !im) return;
      pushUndo('Lift & Edit ' + (label || 'Object'));
      var healed = autoHealBg ? autoHealPolygonGround(pts, true) : 0;
      var binId = uid('cut'); bins.assets[binId] = pngUrl; imgs.assets[binId] = im;
      var cnt = doc.assets.filter(function (a) { return a.source === 'cutout'; }).length + 1;
      var ast = normalizeAsset({
        id: uid('ast'), binId: binId,
        name: (label ? (label + ' [Lifted]') : ('Lifted #' + cnt)),
        source: 'cutout', naturalW: bw, naturalH: bh,
        x: +(x0 + bw / 2).toFixed(2), y: +(y0 + bh / 2).toFixed(2),
        wPx: bw, hPx: bh, elevationM: 2.6, shadowEnabled: true
      });
      doc.assets.push(ast);
      doc.layers.assets.visible = true;
      clearAllSelections(); selAssetId = ast.id; cutPts = [];
      persistToIDB(); setTool('select'); syncUI(); draw();
      if (wsCtrl) wsCtrl.toggleRight(true);
      var insp = ov && ov.querySelector('#scAssetInsp');
      if (insp) insp.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var ar = langOf('panels') === 'ar';
      setStatus(
        ar
          ? ('تم استخراج «' + ast.name + '» ' + (healed ? 'وتنظيف الخلفية تحته تلقائياً — ' : '— ') + 'يمكنك الآن التدوير والتحجيم وعكس الظل والدمج بالكامل.')
          : ('Lifted "' + ast.name + '"' + (healed ? ' & auto-healed ground underneath — ' : ' — ') + 'ready for full rotation, resize, shadow & blending.'),
        false
      );
    });
  }

  function extractCutoutFromBase() {
    if (!imgs.base || cutPts.length < 3) { setStatus('Draw 3+ points around object first.', true); return; }
    var cnt = doc.assets.filter(function (a) { return a.source === 'cutout'; }).length + 1;
    liftPolygonFromBase(cutPts.slice(), 'Cutout #' + cnt, autoHealOnLift, cutFeatherPx);
  }

  function stampPaintBrushDab(imgPt) {
    if (!imgs.base) return;
    doc.layers.cleanup.visible = true;
    var r = Math.max(2, photoCfg.radius), d = Math.ceil(r * 2) + 4;
    var cvBrush = document.createElement('canvas'); cvBrush.width = d; cvBrush.height = d;
    var bg = cvBrush.getContext('2d'), rIn = Math.max(0, r * clamp(photoCfg.hardness, 0, 0.95));
    var grad = bg.createRadialGradient(d / 2, d / 2, rIn, d / 2, d / 2, r);
    grad.addColorStop(0, photoCfg.color); grad.addColorStop(1, 'rgba(0,0,0,0)');
    bg.fillStyle = grad; bg.fillRect(0, 0, d, d);
    if (!cleanupCacheCv) {
      var iw = imgs.base.naturalWidth, ih = imgs.base.naturalHeight, sc = Math.min(1, MAX_LIVE_CACHE_EDGE / Math.max(iw, ih));
      cleanupCacheCv = document.createElement('canvas');
      cleanupCacheCv.width = Math.max(1, Math.round(iw * sc)); cleanupCacheCv.height = Math.max(1, Math.round(ih * sc));
      cleanupCacheScale = cleanupCacheCv.width / iw;
      cleanupCacheCv.getContext('2d').clearRect(0, 0, cleanupCacheCv.width, cleanupCacheCv.height);
      cleanupDirty = false;
    }
    var cctx = cleanupCacheCv.getContext('2d'), dr = r * cleanupCacheScale;
    cctx.save(); cctx.globalAlpha = clamp(photoCfg.opacity, 0.05, 1);
    cctx.drawImage(cvBrush, imgPt.x * cleanupCacheScale - dr, imgPt.y * cleanupCacheScale - dr, dr * 2, dr * 2);
    cctx.restore(); cvBrush.width = 0; cvBrush.height = 0;
  }

  function addProceduralAssetToScene(name, kind, dataUrl, cx, cy, wPx, hPx, rotDeg, elevM, castSh) {
    decodeImage(dataUrl, function (err, im) {
      if (err || !im || !im.naturalWidth) return;
      pushUndo('Add ' + name);
      var binId = uid('pbin'); bins.assets[binId] = dataUrl; imgs.assets[binId] = im;
      var ast = normalizeAsset({
        id: uid('ast'), binId: binId, name: name, source: kind || 'png',
        naturalW: im.naturalWidth, naturalH: im.naturalHeight,
        x: +cx.toFixed(2), y: +cy.toFixed(2), wPx: +Math.max(16, wPx).toFixed(2), hPx: +Math.max(16, hPx).toFixed(2),
        rotationDeg: +(((rotDeg || 0) % 360 + 360) % 360).toFixed(1),
        elevationM: elevM != null ? elevM : 3.0, shadowEnabled: castSh !== false
      });
      doc.assets.push(ast); doc.layers.assets.visible = true; clearAllSelections(); selAssetId = ast.id;
      persistToIDB(); setTool('select'); syncUI(); draw();
    });
  }

  function createFutsalFromRect(p1, p2) {
    if (!S.SatProcedural || !imgs.base) return;
    var q = S.SatProcedural.makeOrientedRect(p1, p2); if (!q) return;
    var c = S.SatProcedural.polyCenter(q);
    var lenPx = Math.hypot(p2.x - p1.x, p2.y - p1.y), widPx = Math.max(16, lenPx * 0.60);
    var rotDeg = Math.atan2(p2.y - p1.y, p2.x - p1.x) / D;
    var url = S.SatProcedural.getCachedProceduralUrl('futsal|' + Math.round(lenPx) + 'x' + Math.round(widPx), function () {
      return S.SatProcedural.renderFutsalAssetCanvas({ wPx: lenPx, hPx: widPx });
    });
    addProceduralAssetToScene('Futsal + Red Net', 'futsal', url, c.x, c.y, lenPx, widPx, rotDeg, 3.0, true);
  }

  function addBuildingAt(ip) {
    if (!S.SatProcedural || !imgs.base) return;
    var ppm = doc.calibration.pxPerMeter || 0;
    var wPx = ppm > 0 ? clamp(10 * ppm, 24, imgs.base.naturalWidth * 0.35) : clamp(imgs.base.naturalWidth * 0.08, 36, 180);
    var url = S.SatProcedural.getCachedProceduralUrl('bldg|' + Math.round(wPx) + 'x' + Math.round(wPx * 0.65), function () {
      return S.SatProcedural.renderBuildingAssetCanvas({ wPx: wPx, hPx: wPx * 0.65 });
    });
    var idx = doc.assets.filter(function (a) { return a.source === 'bldg'; }).length + 1;
    addProceduralAssetToScene('Building #' + idx, 'bldg', url, ip.x, ip.y, wPx, wPx * 0.65, 0, 4.5, true);
  }

  function addTentAt(ip) {
    if (!S.SatProcedural || !imgs.base) return;
    var ppm = doc.calibration.pxPerMeter || 0;
    var wPx = ppm > 0 ? clamp(4.5 * ppm, 18, imgs.base.naturalWidth * 0.3) : clamp(imgs.base.naturalWidth * 0.055, 22, 140);
    var url = S.SatProcedural.getCachedProceduralUrl('tent|' + Math.round(wPx) + 'x' + Math.round(wPx), function () {
      return S.SatProcedural.renderTentAssetCanvas({ wPx: wPx, hPx: wPx });
    });
    var idx = doc.assets.filter(function (a) { return a.source === 'tent'; }).length + 1;
    addProceduralAssetToScene('Tent #' + idx, 'tent', url, ip.x, ip.y, wPx, wPx, 0, 2.6, true);
  }

  function addTreeAt(ip) {
    if (!S.SatProcedural || !imgs.base) return;
    var ppm = doc.calibration.pxPerMeter || 0;
    var dPx = ppm > 0 ? clamp(5.5 * ppm, 18, imgs.base.naturalWidth * 0.25) : clamp(imgs.base.naturalWidth * 0.05, 22, 120);
    var idx = doc.assets.filter(function (a) { return a.source === 'tree'; }).length + 1;
    var url = S.SatProcedural.getCachedProceduralUrl('tree|' + Math.round(dPx) + '|' + (4200 + idx * 97), function () {
      return S.SatProcedural.renderTreeAssetCanvas({ dPx: dPx, seed: 4200 + idx * 97 });
    });
    addProceduralAssetToScene('Tree #' + idx, 'tree', url, ip.x, ip.y, dPx, dPx, 0, 5.0, true);
  }

  // =========================================================================
  // 6. LAYER 02_GROUND_CLEANUP COMPOSITOR
  // =========================================================================
  function stampClonePatch(targetCtx, p, scale) {
    if (!imgs.base) return;
    var iw = imgs.base.naturalWidth, ih = imgs.base.naturalHeight;
    var r = Math.max(2, p.r * scale), d = Math.ceil(r * 2) + 2;
    if (!patchScratchCv) patchScratchCv = document.createElement('canvas');
    patchScratchCv.width = d; patchScratchCv.height = d;
    var pctx = patchScratchCv.getContext('2d'); pctx.clearRect(0, 0, d, d);
    var rrNat = Math.ceil(p.r * 1.5) + 2;
    var bx0 = Math.max(0, Math.floor(p.sx - rrNat)), by0 = Math.max(0, Math.floor(p.sy - rrNat));
    var bx1 = Math.min(iw, Math.ceil(p.sx + rrNat)), by1 = Math.min(ih, Math.ceil(p.sy + rrNat));
    var bw = bx1 - bx0, bh = by1 - by0;
    if (bw <= 0 || bh <= 0) return;
    pctx.save(); pctx.translate(d / 2, d / 2);
    if (p.rotDeg) pctx.rotate(p.rotDeg * D);
    pctx.drawImage(imgs.base, bx0, by0, bw, bh, (bx0 - p.sx) * scale, (by0 - p.sy) * scale, bw * scale, bh * scale);
    pctx.restore();
    var fe = clamp(p.feather != null ? p.feather : 0.65, 0.02, 1), rIn = Math.max(0, r * (1 - fe));
    var grad = pctx.createRadialGradient(d / 2, d / 2, rIn, d / 2, d / 2, r);
    grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    pctx.globalCompositeOperation = 'destination-in'; pctx.fillStyle = grad; pctx.fillRect(0, 0, d, d);
    pctx.globalCompositeOperation = 'source-over';
    targetCtx.save(); targetCtx.globalAlpha = clamp(p.opacity != null ? p.opacity : 1, 0.05, 1);
    targetCtx.drawImage(patchScratchCv, p.dx * scale - d / 2, p.dy * scale - d / 2); targetCtx.restore();
  }

  function applyEraseDab(targetCtx, x, y, r, rIn, op) {
    var g = targetCtx.createRadialGradient(x, y, rIn, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,' + op + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
    targetCtx.fillStyle = g; targetCtx.beginPath(); targetCtx.arc(x, y, r, 0, Math.PI * 2); targetCtx.fill();
  }

  function applyEraseSegment(targetCtx, ptA, ptB, cfg, scale, includeStart) {
    var r = Math.max(2, cfg.r * scale), fe = clamp(cfg.feather != null ? cfg.feather : 0.65, 0.02, 1);
    var rIn = Math.max(0, r * (1 - fe)), op = clamp(cfg.opacity != null ? cfg.opacity : 1, 0.05, 1);
    var step = Math.max(2, r * 0.26), x0 = ptA.x * scale, y0 = ptA.y * scale;
    targetCtx.save(); targetCtx.globalCompositeOperation = 'destination-out';
    if (includeStart) applyEraseDab(targetCtx, x0, y0, r, rIn, op);
    if (ptB) {
      var x1 = ptB.x * scale, y1 = ptB.y * scale, n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
      for (var k = 1; k <= n; k++) applyEraseDab(targetCtx, x0 + (x1 - x0) * (k / n), y0 + (y1 - y0) * (k / n), r, rIn, op);
    }
    targetCtx.restore();
  }

  function renderCleanupLayerTo(targetCtx, targetW, targetH, scale) {
    if (hasActiveCleanupImg()) targetCtx.drawImage(imgs.cleanup, 0, 0, targetW, targetH);
    for (var i = 0; i < doc.patches.length; i++) stampClonePatch(targetCtx, doc.patches[i], scale);
    for (var j = 0; j < doc.cleanupErases.length; j++) {
      var st = doc.cleanupErases[j];
      if (!st || !st.pts || !st.pts.length) continue;
      applyEraseSegment(targetCtx, st.pts[0], null, st, scale, true);
      for (var k = 1; k < st.pts.length; k++) applyEraseSegment(targetCtx, st.pts[k - 1], st.pts[k], st, scale, false);
    }
  }

  function ensureCleanupCache() {
    if (!imgs.base) return null;
    if (!hasActiveCleanupImg() && !doc.patches.length && !doc.cleanupErases.length) {
      if (cleanupCacheCv) { cleanupCacheCv.width = 0; cleanupCacheCv.height = 0; cleanupCacheCv = null; }
      cleanupDirty = false; return null;
    }
    if (!cleanupDirty && cleanupCacheCv) return cleanupCacheCv;
    var iw = imgs.base.naturalWidth, ih = imgs.base.naturalHeight;
    var sc = Math.min(1, MAX_LIVE_CACHE_EDGE / Math.max(iw, ih));
    var cw = Math.max(1, Math.round(iw * sc)), ch = Math.max(1, Math.round(ih * sc));
    if (!cleanupCacheCv) cleanupCacheCv = document.createElement('canvas');
    if (cleanupCacheCv.width !== cw || cleanupCacheCv.height !== ch) { cleanupCacheCv.width = cw; cleanupCacheCv.height = ch; }
    cleanupCacheScale = cw / iw;
    var cctx = cleanupCacheCv.getContext('2d'); cctx.clearRect(0, 0, cw, ch);
    renderCleanupLayerTo(cctx, cw, ch, cleanupCacheScale);
    cleanupDirty = false; return cleanupCacheCv;
  }

  function incrementalStampPatch(p) {
    if (cleanupDirty || !cleanupCacheCv) { cleanupDirty = true; ensureCleanupCache(); }
    else stampClonePatch(cleanupCacheCv.getContext('2d'), p, cleanupCacheScale);
  }

  function incrementalErase(ptA, ptB, stroke, includeStart) {
    if (cleanupDirty || !cleanupCacheCv) { cleanupDirty = true; ensureCleanupCache(); }
    else applyEraseSegment(cleanupCacheCv.getContext('2d'), ptA, ptB, stroke, cleanupCacheScale, includeStart);
  }

  // =========================================================================
  // 7. VIEWPORT PROJECTION & HIT-TESTING (ASSETS, PINS, ARCGIS, GEOTERRA)
  // =========================================================================
  function i2s(ix, iy) { return [view.ox + ix * view.s, view.oy + iy * view.s]; }
  function s2i(sx, sy) { return { x: (sx - view.ox) / view.s, y: (sy - view.oy) / view.s }; }
  function minScale() {
    var d = getBaseDims();
    return d.w ? Math.min(0.05, Math.min(W / d.w, H / d.h) * 0.25) : 0.1;
  }
  function fitView() {
    var d = getBaseDims();
    if (!d.w || !W || !H) { view.s = 1; view.ox = W / 2; view.oy = H / 2; return; }
    view.s = Math.min(Math.max(40, W - 48) / d.w, Math.max(40, H - 48) / d.h);
    view.ox = (W - d.w * view.s) / 2; view.oy = (H - d.h * view.s) / 2; draw();
  }
  function zoomNative100() {
    var d = getBaseDims(); if (!d.w) return;
    var ctr = s2i(W / 2, H / 2); view.s = 1;
    view.ox = W / 2 - ctr.x; view.oy = H / 2 - ctr.y; draw();
  }

  function pointInPolyLocal(pt, poly) {
    if (!poly || poly.length < 3) return false;
    if (S.SatArcGIS && S.SatArcGIS.pointInPolygon) return S.SatArcGIS.pointInPolygon(pt, poly);
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      if (((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / ((yj - yi) || 1e-12) + xi)) inside = !inside;
    }
    return inside;
  }

  function assetLocalToImg(a, lx, ly) {
    var r = (a.rotationDeg || 0) * D, c = Math.cos(r), s = Math.sin(r);
    return { x: a.x + lx * c - ly * s, y: a.y + lx * s + ly * c };
  }
  function imgToAssetLocal(a, ix, iy) {
    var r = (a.rotationDeg || 0) * D, c = Math.cos(r), s = Math.sin(r), dx = ix - a.x, dy = iy - a.y;
    return { x: dx * c + dy * s, y: -dx * s + dy * c };
  }
  function assetHandlesImg(a) {
    var hw = a.wPx / 2, hh = a.hPx / 2, stem = 26 / Math.max(0.05, view.s);
    return {
      tl: assetLocalToImg(a, -hw, -hh), tr: assetLocalToImg(a, hw, -hh),
      br: assetLocalToImg(a, hw, hh), bl: assetLocalToImg(a, -hw, hh),
      rot: assetLocalToImg(a, 0, -hh - stem), topMid: assetLocalToImg(a, 0, -hh)
    };
  }
  function hitAssetHandle(a, screenPt) {
    if (!a || !a.visible || a.locked) return null;
    var hs = assetHandlesImg(a), keys = ['rot', 'tl', 'tr', 'br', 'bl'];
    for (var i = 0; i < keys.length; i++) {
      var sp = i2s(hs[keys[i]].x, hs[keys[i]].y);
      if (Math.hypot(screenPt.x - sp[0], screenPt.y - sp[1]) <= 13) return keys[i];
    }
    return null;
  }
  function hitAssetAt(imgPt) {
    if (!doc.layers.assets.visible) return null;
    for (var i = doc.assets.length - 1; i >= 0; i--) {
      var a = doc.assets[i]; if (!a.visible) continue;
      var loc = imgToAssetLocal(a, imgPt.x, imgPt.y);
      if (Math.abs(loc.x) <= a.wPx / 2 && Math.abs(loc.y) <= a.hPx / 2) return a;
    }
    return null;
  }
  function hitPinAt(screenPt) {
    if (!doc.layers.overlays.visible) return null;
    var ps = (doc.overlays && doc.overlays.pins) || [];
    for (var i = ps.length - 1; i >= 0; i--) {
      var sp = i2s(ps[i].x, ps[i].y);
      if (Math.hypot(screenPt.x - sp[0], screenPt.y - sp[1]) <= 16) return ps[i];
    }
    return null;
  }
  function hitGisAt(imgPt, screenPt) {
    if (!doc.layers.gis.visible || !S.SatArcGIS) return null;
    var fs = doc.gis.features || [];
    for (var i = fs.length - 1; i >= 0; i--) {
      var f = fs[i]; if (!f.visible || !f.points.length) continue;
      if (f.geom === 'point' || f.points.length === 1) {
        var sp = i2s(f.points[0].x, f.points[0].y);
        if (Math.hypot(screenPt.x - sp[0], screenPt.y - sp[1]) <= 15) return f;
      } else if (f.geom === 'polygon' || f.geom === 'circle') {
        if (pointInPolyLocal(imgPt, f.points)) return f;
      } else if (f.geom === 'polyline') {
        for (var k = 0; k < f.points.length - 1; k++) {
          var sA = i2s(f.points[k].x, f.points[k].y), sB = i2s(f.points[k + 1].x, f.points[k + 1].y);
          var dx = sB[0] - sA[0], dy = sB[1] - sA[1], l2 = dx * dx + dy * dy || 1;
          var t = clamp(((screenPt.x - sA[0]) * dx + (screenPt.y - sA[1]) * dy) / l2, 0, 1);
          if (Math.hypot(screenPt.x - (sA[0] + dx * t), screenPt.y - (sA[1] + dy * t)) <= 12) return f;
        }
      }
    }
    return null;
  }
  function hitGeoTerraAt(imgPt, screenPt) {
    if (!doc.layers.geoterra.visible || !doc.geoterra || !doc.geoterra.features) return -1;
    var fs = doc.geoterra.features;
    for (var i = fs.length - 1; i >= 0; i--) {
      var f = fs[i];
      if (!f || !f.points || !f.points.length) continue;
      if (doc.geoterra.filters && doc.geoterra.filters[f.type] === false) continue;
      if (f.geometry === 'point' || f.points.length === 1) {
        if (doc.geoterra.filters && doc.geoterra.filters.pins === false) continue;
        var sp = i2s(f.points[0].x, f.points[0].y);
        if (Math.hypot(screenPt.x - sp[0], screenPt.y - sp[1]) <= 16) return i;
      } else if (f.points.length >= 3) {
        if (pointInPolyLocal(imgPt, f.points)) return i;
      }
    }
    return -1;
  }

  // =========================================================================
  // 8. MAIN 6-LAYER RENDERER + SWIPE + SELECTION HIGHLIGHT
  // =========================================================================
  function drawEditedLayers(iw, ih, tl, dw, dh) {
    if (doc.layers.cleanup.visible && imgs.base) {
      var ccv = ensureCleanupCache();
      if (ccv) {
        ctx.save(); ctx.globalAlpha = clamp(doc.layers.cleanup.opacity, 0, 1);
        ctx.imageSmoothingEnabled = view.s < 2; ctx.drawImage(ccv, tl[0], tl[1], dw, dh); ctx.restore();
      }
    }
    if (doc.layers.assets.visible && S.SatBlending && S.SatBlending.renderLayer03) {
      S.SatBlending.renderLayer03(ctx, {
        assets: doc.assets, imgs: imgs.assets, sun: doc.sun, pxPerMeter: doc.calibration.pxPerMeter,
        layerOpacity: clamp(doc.layers.assets.opacity, 0, 1), scale: view.s, ox: view.ox, oy: view.oy, viewW: W, viewH: H, forExport: false
      });
    }
    if (doc.layers.gis.visible && S.SatArcGIS) {
      S.SatArcGIS.renderGisLayer(ctx, {
        features: doc.gis.features, i2s: i2s, pxPerMeter: doc.calibration.pxPerMeter,
        selectedIds: selGisIds, viewshed: viewshedResult, rangeRings: rangeRingsState,
        evacLinks: evacMatrixLinks, showGraticule: doc.gis.showGraticule,
        showHeatmap: doc.gis.showHeatmap, gridStepM: doc.gis.gridStepM,
        georefModel: georefModel, northOffsetDeg: doc.overlays.northDeg || 0,
        imgW: iw, imgH: ih, viewS: view.s
      });
    }
    if (doc.layers.geoterra.visible && S.SatGeoTerra) {
      S.SatGeoTerra.drawGeoTerraLayer(ctx, {
        state: doc.geoterra, imgW: iw, imgH: ih, viewS: view.s, ox: view.ox, oy: view.oy,
        lang: langOf('panels'), georefModel: georefModel, pxPerMeter: doc.calibration.pxPerMeter,
        activeTool: tool, draftPoints: gtDraftPts,
        liveGpsFix: liveGpsFix, gpsTrack: gpsEngine ? gpsEngine.getTrack() : [],
        compassHeading: liveCompassDeg, forExport: false
      });
    }
    if (doc.layers.overlays.visible && S.SatExport && S.SatExport.drawLiveOverlays) {
      S.SatExport.drawLiveOverlays(ctx, {
        overlays: doc.overlays, i2s: i2s, selPinId: selPinId,
        layerOpacity: doc.layers.overlays.opacity, viewW: W, viewH: H
      });
    }
  }

  function draw() {
    if (!isOpen || !ctx) return;
    try {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var isDay = document.body.classList.contains('ui-day');
      ctx.fillStyle = isDay ? '#dfe7ef' : '#06090e';
      ctx.fillRect(0, 0, W, H);

      var dims = getBaseDims();
      if (!dims.w || !dims.h) {
        ctx.fillStyle = isDay ? '#334155' : '#7c97b0';
        ctx.font = 'bold 12px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('AJ-GeoCAD STUDIO — PHOTOSHOP + ArcGIS + GEOTERRA', W / 2, H / 2 - 12);
        ctx.font = '10.5px ' + MONO;
        ctx.fillText(
          langOf('panels') === 'ar'
            ? 'ملف ➔ استيراد خريطة الأساس  |  أو استيراد جلسة GeoTerra (.json / .zip)'
            : 'File ➔ Import Base Satellite  |  or Import GeoTerra Session (.json / .zip)',
          W / 2, H / 2 + 12
        );
        positionQuickPop();
        return;
      }

      var iw = dims.w, ih = dims.h, tl = i2s(0, 0), dw = iw * view.s, dh = ih * view.s;
      ctx.fillStyle = isDay ? '#cbd5e1' : '#0c121b';
      ctx.fillRect(tl[0], tl[1], dw, dh);

      if (doc.layers.base.visible && imgs.base) {
        ctx.save(); ctx.globalAlpha = clamp(doc.layers.base.opacity, 0, 1);
        ctx.imageSmoothingEnabled = view.s < 2; ctx.drawImage(imgs.base, tl[0], tl[1], dw, dh); ctx.restore();
      }

      var swipeOn = wsCtrl && wsCtrl.state.swipeActive && imgs.base;
      if (swipeOn) {
        var cutX = wsCtrl.state.swipeRatio * W;
        ctx.save(); ctx.beginPath(); ctx.rect(cutX, 0, W - cutX, H); ctx.clip();
        drawEditedLayers(iw, ih, tl, dw, dh); ctx.restore();
        ctx.save(); ctx.font = 'bold 10px ' + MONO;
        ctx.fillStyle = 'rgba(8,11,16,0.85)';
        ctx.fillRect(Math.max(10, cutX - 74), 40, 64, 18); ctx.fillRect(Math.min(W - 76, cutX + 10), 40, 66, 18);
        ctx.fillStyle = '#e8c84a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('BEFORE', Math.max(42, cutX - 42), 49);
        ctx.fillStyle = '#39ff14'; ctx.fillText('AFTER', Math.min(W - 43, cutX + 43), 49); ctx.restore();
      } else {
        drawEditedLayers(iw, ih, tl, dw, dh);
      }

      ctx.strokeStyle = isDay ? '#0369a1' : '#1f3b52'; ctx.lineWidth = 1.4;
      ctx.strokeRect(tl[0], tl[1], dw, dh);

      var selGt = getSelGt();
      if (selGt && doc.layers.geoterra.visible && selGt.points && selGt.points.length) {
        ctx.save();
        ctx.strokeStyle = quickMoveArmed ? '#e8c84a' : '#39ff14';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 4]);
        if (selGt.geometry === 'point' || selGt.points.length === 1) {
          var gsp0 = i2s(selGt.points[0].x, selGt.points[0].y);
          ctx.beginPath(); ctx.arc(gsp0[0], gsp0[1], 14, 0, Math.PI * 2); ctx.stroke();
        } else {
          ctx.beginPath();
          selGt.points.forEach(function (pt, idx) { var sp = i2s(pt.x, pt.y); if (idx === 0) ctx.moveTo(sp[0], sp[1]); else ctx.lineTo(sp[0], sp[1]); });
          ctx.closePath(); ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();
      }

      var sel = getSelAsset();
      if (sel && doc.layers.assets.visible && (tool === 'select' || tool === 'pan' || tool === 'crop_asset' || tool === 'lasso_erase' || tool === 'wand')) drawAssetGizmo(sel);
      if (tool === 'clone') drawCloneOverlay();
      if (tool === 'erase') drawEraserOverlay();
      if (tool === 'brush') drawBrushOverlay();
      if (tool === 'cutout' || tool === 'crop_asset' || tool === 'lasso_erase') drawPolyOverlay(cutPts, tool === 'lasso_erase' ? '#ff3c3c' : '#39ff14', true);
      if (tool === 'poly_draw' || tool === 'gis_line' || tool === 'gis_split') drawPolyOverlay(gisDraftPts, tool === 'gis_split' ? '#e8c84a' : '#00e5ff', tool === 'poly_draw');

      if (tool === 'crop_base' && drag && drag.m === 'crop_base') {
        var sA = i2s(drag.p1.x, drag.p1.y), sB = i2s(drag.p2.x, drag.p2.y);
        ctx.save(); ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
        ctx.strokeRect(Math.min(sA[0], sB[0]), Math.min(sA[1], sB[1]), Math.abs(sB[0] - sA[0]), Math.abs(sB[1] - sA[1])); ctx.restore();
      }
      if (tool === 'gis_circle' && drag && drag.m === 'gis_circle') {
        var scC = i2s(drag.c.x, drag.c.y), rScr = Math.hypot(drag.edge.x - drag.c.x, drag.edge.y - drag.c.y) * view.s;
        ctx.save(); ctx.strokeStyle = '#39ff14'; ctx.fillStyle = 'rgba(57,255,20,0.16)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(scC[0], scC[1], rScr, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
      }
      if (tool === 'futsal_rect' && drag && drag.m === 'futsal_rect' && S.SatProcedural) {
        var q = S.SatProcedural.makeOrientedRect(drag.p1, drag.p2);
        if (q) {
          ctx.save(); ctx.fillStyle = 'rgba(201,174,130,0.35)'; ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2;
          ctx.beginPath(); q.forEach(function (pt, idx) { var sp = i2s(pt.x, pt.y); if (idx === 0) ctx.moveTo(sp[0], sp[1]); else ctx.lineTo(sp[0], sp[1]); });
          ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
        }
      }

      var cp1 = calibDraft.p1 || (tool === 'calibrate' ? doc.calibration.p1 : null);
      var cp2 = calibDraft.p2 || (tool === 'calibrate' ? doc.calibration.p2 : null);
      if (tool === 'calibrate' && cp1) drawGuideSegment(cp1, cp2 || hovImg, '#00e5ff', 'CALIB');
      if (tool === 'bearing_cal' && bearingDraft.p1) drawGuideSegment(bearingDraft.p1, bearingDraft.p2 || hovImg, '#39ff14', 'NORTH');
      if (tool === 'measure' && measPts.length >= 1) drawGuideSegment(measPts[0], measPts[1] || hovImg, '#e8c84a', 'MEAS');

      if (snapPreview && snapPreview.snapped) {
        var ssp = i2s(snapPreview.x, snapPreview.y);
        ctx.save(); ctx.strokeStyle = '#39ff14'; ctx.lineWidth = 2; ctx.strokeRect(ssp[0] - 6, ssp[1] - 6, 12, 12);
        ctx.font = 'bold 9px ' + MONO; ctx.fillStyle = '#39ff14'; ctx.fillText(snapPreview.type, ssp[0] + 9, ssp[1] - 6); ctx.restore();
      }

      if (doc.showScaleBar && doc.calibration.pxPerMeter > 0) drawScaleBar(isDay);
      drawViewportHud(isDay, dims);
      positionQuickPop();
    } catch (err) {
      setStatus('Render warning: ' + err.message, true);
    }
  }

  function drawAssetGizmo(a) {
    var hs = assetHandlesImg(a), pts = [hs.tl, hs.tr, hs.br, hs.bl].map(function (p) { return i2s(p.x, p.y); });
    var topM = i2s(hs.topMid.x, hs.topMid.y), rotP = i2s(hs.rot.x, hs.rot.y);
    ctx.save();
    ctx.strokeStyle = a.locked ? '#e8c84a' : '#39ff14'; ctx.lineWidth = 1.8;
    ctx.setLineDash(a.locked ? [5, 4] : []); ctx.beginPath();
    pts.forEach(function (p, i) { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
    ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
    if (!a.locked) {
      ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(topM[0], topM[1]); ctx.lineTo(rotP[0], rotP[1]); ctx.stroke();
      ctx.beginPath(); ctx.arc(rotP[0], rotP[1], 6, 0, Math.PI * 2); ctx.fillStyle = '#06090e'; ctx.fill(); ctx.stroke();
      pts.forEach(function (p) { ctx.fillStyle = '#06090e'; ctx.strokeStyle = '#39ff14'; ctx.lineWidth = 2; ctx.fillRect(p[0] - 5, p[1] - 5, 10, 10); ctx.strokeRect(p[0] - 5, p[1] - 5, 10, 10); });
    }
    var dimTxt = a.name + (doc.calibration.pxPerMeter > 0 ? (' • ' + (a.wPx / doc.calibration.pxPerMeter).toFixed(1) + 'x' + (a.hPx / doc.calibration.pxPerMeter).toFixed(1) + 'm') : '') + ' • ' + Math.round(a.rotationDeg || 0) + '°';
    ctx.font = 'bold 10px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var tw = ctx.measureText(dimTxt).width + 12, bx = rotP[0], by = rotP[1] - 18;
    ctx.fillStyle = 'rgba(6,9,14,0.92)'; ctx.fillRect(bx - tw / 2, by - 9, tw, 18);
    ctx.strokeStyle = a.locked ? '#e8c84a' : '#39ff14'; ctx.lineWidth = 1; ctx.strokeRect(bx - tw / 2, by - 9, tw, 18);
    ctx.fillStyle = a.locked ? '#e8c84a' : '#39ff14'; ctx.fillText(dimTxt, bx, by + 0.5);
    ctx.restore();
  }

  function drawCloneOverlay() {
    ctx.save();
    if (cloneCfg.src) {
      var ss = i2s(cloneCfg.src.x, cloneCfg.src.y);
      ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(ss[0] - 9, ss[1]); ctx.lineTo(ss[0] + 9, ss[1]); ctx.moveTo(ss[0], ss[1] - 9); ctx.lineTo(ss[0], ss[1] + 9); ctx.stroke();
      ctx.beginPath(); ctx.arc(ss[0], ss[1], Math.max(4, cloneCfg.radius * view.s), 0, Math.PI * 2); ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
    }
    if (hovImg) {
      var hs = i2s(hovImg.x, hovImg.y);
      ctx.strokeStyle = cloneCfg.pickMode ? '#00e5ff' : '#39ff14'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(hs[0], hs[1], Math.max(4, cloneCfg.radius * view.s), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawEraserOverlay() {
    if (!hovImg) return;
    var hs = i2s(hovImg.x, hovImg.y);
    ctx.save(); ctx.strokeStyle = '#ff3c3c'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(hs[0], hs[1], Math.max(4, eraseCfg.radius * view.s), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }

  function drawBrushOverlay() {
    if (!hovImg) return;
    var hs = i2s(hovImg.x, hovImg.y);
    ctx.save(); ctx.strokeStyle = photoCfg.color || '#00e5ff'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(hs[0], hs[1], Math.max(4, photoCfg.radius * view.s), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }

  function drawPolyOverlay(pts, col, isClosed) {
    if (!pts || !pts.length) return;
    ctx.save();
    var sp = pts.map(function (p) { return i2s(p.x, p.y); });
    if (isClosed && sp.length >= 3) {
      ctx.fillStyle = col === '#ff3c3c' ? 'rgba(255,60,60,0.18)' : 'rgba(57,255,20,0.14)';
      ctx.beginPath(); sp.forEach(function (p, i) { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
      ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath();
    sp.forEach(function (p, i) { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); }); ctx.stroke();
    if (hovImg) {
      var last = sp[sp.length - 1], cur = i2s(hovImg.x, hovImg.y);
      ctx.strokeStyle = '#e8c84a'; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(cur[0], cur[1]); ctx.stroke(); ctx.setLineDash([]);
    }
    sp.forEach(function (p, idx) {
      ctx.beginPath(); ctx.arc(p[0], p[1], idx === 0 && sp.length >= 3 ? 7 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = idx === 0 ? '#e8c84a' : col; ctx.fill(); ctx.strokeStyle = '#06090e'; ctx.lineWidth = 1.5; ctx.stroke();
    });
    ctx.restore();
  }

  function drawGuideSegment(a, b, col, tag) {
    if (!a) return;
    var sa = i2s(a.x, a.y);
    ctx.save(); ctx.fillStyle = col; ctx.strokeStyle = '#06090e'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sa[0], sa[1], 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (b) {
      var sb = i2s(b.x, b.y);
      ctx.strokeStyle = '#06090e'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(sa[0], sa[1]); ctx.lineTo(sb[0], sb[1]); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([7, 4]); ctx.beginPath(); ctx.moveTo(sa[0], sa[1]); ctx.lineTo(sb[0], sb[1]); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = col; ctx.strokeStyle = '#06090e'; ctx.beginPath(); ctx.arc(sb[0], sb[1], 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      var pxD = Math.hypot(b.x - a.x, b.y - a.y);
      var brg = S.SatArcGIS ? S.SatArcGIS.calcBearingDeg(a, b, doc.overlays.northDeg || 0) : null;
      var lbl = tag + ': ' + pxD.toFixed(1) + ' px';
      if (doc.calibration.pxPerMeter > 0) lbl += ' | ' + (pxD / doc.calibration.pxPerMeter).toFixed(2) + ' m';
      if (brg) lbl += ' | ' + brg.bearingDeg + '° (Back ' + brg.backBearingDeg + '°)';
      var mx = (sa[0] + sb[0]) / 2, my = (sa[1] + sb[1]) / 2 - 14;
      ctx.font = 'bold 10.5px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var tw = ctx.measureText(lbl).width + 14;
      ctx.fillStyle = 'rgba(6,9,14,0.92)'; ctx.fillRect(mx - tw / 2, my - 10, tw, 20);
      ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.strokeRect(mx - tw / 2, my - 10, tw, 20);
      ctx.fillStyle = col; ctx.fillText(lbl, mx, my + 0.5);
    }
    ctx.restore();
  }

  function drawScaleBar(isDay) {
    var screenPxPerM = doc.calibration.pxPerMeter * view.s;
    if (!(screenPxPerM > 0)) return;
    var nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000].filter(function (m) { return m * screenPxPerM >= 60; })[0] || 1000;
    var barPx = nice * screenPxPerM, x0 = 24, y0 = H - 18;
    ctx.save();
    ctx.fillStyle = isDay ? 'rgba(255,255,255,0.92)' : 'rgba(8,11,16,0.9)';
    ctx.fillRect(x0 - 6, y0 - 22, barPx + 14, 28);
    ctx.strokeStyle = isDay ? '#0f172a' : '#39ff14'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + barPx, y0); ctx.moveTo(x0, y0 - 6); ctx.lineTo(x0, y0 + 3); ctx.moveTo(x0 + barPx, y0 - 6); ctx.lineTo(x0 + barPx, y0 + 3); ctx.stroke();
    ctx.fillStyle = isDay ? '#0f172a' : '#39ff14'; ctx.font = 'bold 10.5px ' + MONO; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(nice + ' m (' + doc.calibration.pxPerMeter.toFixed(2) + ' px/m)', x0 + 2, y0 - 6);
    ctx.restore();
  }

  function drawViewportHud(isDay, dims) {
    var parts = ['TOOL: ' + tool.toUpperCase(), 'ZOOM ' + Math.round(view.s * 100) + '%'];
    if (!imgs.base) parts.push('NO BASE IMG (File->Import Base)');
    else parts.push(dims.w + 'x' + dims.h + 'px');
    if (hovImg) {
      if (georefModel && S.SatGeorefGPS) {
        var ll = georefModel.xyToLatLon(hovImg.x, hovImg.y);
        if (ll) parts.push(S.SatGeorefGPS.formatCoords(ll.lat, ll.lon, doc.gis.coordSys));
      } else if (doc.calibration.pxPerMeter > 0) {
        parts.push('M (' + (hovImg.x / doc.calibration.pxPerMeter).toFixed(1) + ',' + (hovImg.y / doc.calibration.pxPerMeter).toFixed(1) + ')');
      } else {
        parts.push('PX (' + Math.round(hovImg.x) + ',' + Math.round(hovImg.y) + ')');
      }
    }
    var txt = parts.join(' | ');
    ctx.save(); ctx.font = 'bold 10px ' + MONO; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    var tw = Math.min(W - 44, ctx.measureText(txt).width + 16);
    ctx.fillStyle = isDay ? 'rgba(255,255,255,0.92)' : 'rgba(8,11,16,0.9)';
    ctx.fillRect(22, 10, tw, 22);
    ctx.strokeStyle = isDay ? '#94a3b8' : '#1f3b52'; ctx.lineWidth = 1; ctx.strokeRect(22, 10, tw, 22);
    ctx.fillStyle = isDay ? '#0369a1' : '#00e5ff'; ctx.fillText(txt, 30, 21.5);
    ctx.restore();
  }
// =========================================================================
  // 9. INDEPENDENT LANGUAGE SYNC & FLOATING QUICK MENU (LIFT/EDIT/MOVE/SHADOW)
  // =========================================================================
  var quickVertsArmed = false;

  function applyLanguagePrefsUI() {
    if (!ov) return;
    var lp = safeNormLang(doc.langPrefs);
    doc.langPrefs = lp;
    doc.lang = lp.panels;
    if (menuCtrl && typeof menuCtrl.setLang === 'function') menuCtrl.setLang(lp.menus, lp);
    if (railCtrl && typeof railCtrl.render === 'function') railCtrl.render(tool, lp.guide);
    if (S.SatThemeUI && typeof S.SatThemeUI.updateToolGuide === 'function') {
      S.SatThemeUI.updateToolGuide(ov.querySelector('#scToolGuide'), tool, lp.guide);
    }
    if (S.SatThemeUI && typeof S.SatThemeUI.applyPanelLang === 'function') {
      S.SatThemeUI.applyPanelLang(ov, lp.panels);
    }
  }

  function ensureQuickPopCss() {
    if (document.getElementById('aj-sat-qpop-css')) return;
    var st = document.createElement('style');
    st.id = 'aj-sat-qpop-css';
    st.textContent =
      '.satc-qpop{position:absolute;z-index:32;display:none;flex-direction:column;gap:4px;min-width:205px;max-width:calc(100% - 14px);' +
        'background:rgba(8,14,24,.95);border:1.5px solid var(--sc-cyan,#00e5ff);border-radius:8px;padding:6px 7px;' +
        'box-shadow:0 8px 26px rgba(0,0,0,.68);backdrop-filter:blur(4px);user-select:none}' +
      'body.ui-day .satc-qpop{background:rgba(255,255,255,.97);border-color:#0369a1;box-shadow:0 8px 22px rgba(15,23,42,.22)}' +
      '.satc-qpop.show{display:flex}' +
      '.satc-qpop-hd{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10.5px;font-weight:700;color:var(--sc-green2,#00ff66);border-bottom:1px solid var(--sc-border,#15222e);padding-bottom:3px}' +
      'body.ui-day .satc-qpop-hd{color:#15803d}' +
      '.satc-qpop-hd span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:210px}' +
      '.satc-qpop-row{display:flex;flex-wrap:wrap;gap:4px}' +
      '.satc-qpop-btn{flex:1 1 auto;min-height:28px;padding:4px 7px;border-radius:5px;border:1px solid var(--sc-border-hi,#1f3b52)!important;' +
        'background:var(--sc-input,#06090e)!important;color:var(--sc-txt,#d9ecff)!important;font-family:' + MONO + ';font-size:10.5px;font-weight:700;cursor:pointer;white-space:nowrap;box-shadow:none!important}' +
      'body.ui-day .satc-qpop-btn{background:#f8fafc!important;color:#0f172a!important;border-color:#94a3b8!important}' +
      '.satc-qpop-btn.on{border-color:var(--sc-green2,#00ff66)!important;color:var(--sc-green2,#00ff66)!important;background:rgba(0,255,102,.14)!important}' +
      '.satc-qpop-btn.cy{border-color:var(--sc-cyan,#00e5ff)!important;color:var(--sc-cyan,#00e5ff)!important;background:rgba(0,229,255,.14)!important}' +
      '.satc-qpop-btn.amb{border-color:var(--sc-amber,#e8c84a)!important;color:var(--sc-amber,#e8c84a)!important;background:rgba(232,200,74,.16)!important}' +
      '.satc-qpop-btn.dng{border-color:var(--sc-red,#ff3c3c)!important;color:var(--sc-red,#ff3c3c)!important;background:rgba(255,60,60,.14)!important}';
    document.head.appendChild(st);
  }

  function nudgeSunAzimuth(deltaDeg, reason) {
    pushUndo(reason || 'Adjust Shadow Direction');
    var cur = isFinite(doc.sun.azimuthDeg) ? doc.sun.azimuthDeg : 135;
    doc.sun.azimuthDeg = Math.round(((cur + deltaDeg) % 360 + 360) % 360);
    persistToIDB(); syncUI(); draw();
    setStatus(
      langOf('panels') === 'ar'
        ? ('اتجاه الظل الآن: ' + doc.sun.azimuthDeg + '°')
        : ('Shadow azimuth: ' + doc.sun.azimuthDeg + '°'),
      false
    );
  }

  function nudgeAssetRotation(asset, deltaDeg) {
    if (!asset) return;
    pushUndo('Rotate Asset');
    asset.rotationDeg = +((((asset.rotationDeg || 0) + deltaDeg) % 360 + 360) % 360).toFixed(1);
    persistToIDB(); syncUI(); draw();
  }

  function getActiveSelectionTarget() {
    if (tool !== 'select' && tool !== 'pin') return null;
    var p = getSelPin();
    if (p) return { kind: 'pin', item: p, label: (p.labelEn || p.labelAr || 'Pin'), anchorImg: { x: p.x, y: p.y }, isPoly: false };
    var a = getSelAsset();
    if (a) return { kind: 'asset', item: a, label: a.name || 'Asset', anchorImg: { x: a.x, y: a.y - a.hPx / 2 }, isPoly: false, locked: !!a.locked };
    var gt = getSelGt();
    if (gt && gt.points && gt.points.length) {
      var gc = S.SatGeoTerra ? S.SatGeoTerra.polyAreaCentroidXY(gt.points) : { cx: gt.points[0].x, cy: gt.points[0].y };
      return { kind: 'geoterra', item: gt, idx: selGtIdx, label: gt.id + (gt.name ? (' · ' + gt.name) : ''), anchorImg: { x: gc.cx, y: gc.cy }, isPoly: gt.points.length >= 2 };
    }
    var g = selGisIds.length ? getGisById(selGisIds[0]) : null;
    if (g && g.points && g.points.length) {
      var st = S.SatArcGIS ? S.SatArcGIS.polyStats(g.points, doc.calibration.pxPerMeter) : { cx: g.points[0].x, cy: g.points[0].y };
      return { kind: 'gis', item: g, label: g.name || g.id, anchorImg: { x: st.cx, y: st.cy }, isPoly: g.points.length >= 2 };
    }
    return null;
  }

  function drawQuickVertexHandles(target) {
    if (!ctx || !quickVertsArmed || !target || !target.isPoly || !target.item.points) return;
    ctx.save();
    target.item.points.forEach(function (pt, idx) {
      var sp = i2s(pt.x, pt.y);
      ctx.beginPath();
      ctx.arc(sp[0], sp[1], 7, 0, Math.PI * 2);
      ctx.fillStyle = '#e8c84a';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#06090e';
      ctx.stroke();
      ctx.fillStyle = '#06090e';
      ctx.font = 'bold 9px ' + MONO;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(idx + 1), sp[0], sp[1] + 0.5);
    });
    ctx.restore();
  }

  function editSelectedTarget(t) {
    if (!t) return;
    var ar = langOf('menus') === 'ar';
    if (t.kind === 'geoterra') {
      openGeoTerraModalFor(t.item.points, t.item.geometry, t.idx);
    } else if (t.kind === 'gis') {
      var nm = prompt(ar ? 'اسم المعلم:' : 'Feature Name:', t.item.name || '');
      if (nm === null) return;
      var nt = prompt(ar ? 'ملاحظات المعلم:' : 'Feature Notes:', t.item.notes || '');
      pushUndo('Edit GIS Feature');
      t.item.name = nm.trim() || t.item.name;
      if (nt !== null) t.item.notes = nt.trim();
      persistToIDB(); syncUI(); draw();
    } else if (t.kind === 'pin') {
      var arL = prompt(ar ? 'الاسم العربي للدبوس:' : 'Pin Arabic Label:', t.item.labelAr || '');
      if (arL === null) return;
      var enL = prompt(ar ? 'الاسم الإنجليزي للدبوس:' : 'Pin English Label:', t.item.labelEn || '');
      pushUndo('Edit Pin');
      t.item.labelAr = arL.trim();
      if (enL !== null) t.item.labelEn = enL.trim();
      persistToIDB(); syncUI(); draw();
    } else if (t.kind === 'asset') {
      if (wsCtrl) wsCtrl.toggleRight(true);
      var insp = ov && ov.querySelector('#scAssetInsp');
      if (insp) insp.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function cloneSelectedTarget(t) {
    if (!t) return;
    if (t.kind === 'asset') { duplicateSelectedAsset(); return; }
    var suffix = langOf('menus') === 'ar' ? ' (نسخة)' : ' (copy)';
    if (t.kind === 'gis' && S.SatArcGIS) {
      pushUndo('Clone GIS Feature');
      var cp = S.SatArcGIS.createFeature(Object.assign({}, JSON.parse(JSON.stringify(t.item)), {
        id: uid('gis'),
        name: (t.item.name || 'Feature') + suffix,
        points: t.item.points.map(function (p) { return { x: +(p.x + 22).toFixed(2), y: +(p.y + 22).toFixed(2) }; })
      }));
      doc.gis.features.push(cp);
      clearAllSelections(); selGisIds = [cp.id];
      persistToIDB(); syncUI(); draw();
    } else if (t.kind === 'geoterra' && S.SatGeoTerra) {
      pushUndo('Clone GeoTerra Feature');
      var gtCopy = JSON.parse(JSON.stringify(t.item));
      gtCopy.id = S.SatGeoTerra.formatId(doc.geoterra.nextFeatNum++);
      gtCopy.name = (gtCopy.name || '') + suffix;
      gtCopy.points = gtCopy.points.map(function (p) { return { x: +(p.x + 22).toFixed(2), y: +(p.y + 22).toFixed(2) }; });
      doc.geoterra.features.push(gtCopy);
      clearAllSelections(); selGtIdx = doc.geoterra.features.length - 1;
      persistToIDB(); syncUI(); draw();
    } else if (t.kind === 'pin') {
      pushUndo('Clone Pin');
      var pc = Object.assign({}, t.item, { id: uid('pin'), x: +(t.item.x + 22).toFixed(2), y: +(t.item.y + 22).toFixed(2) });
      doc.overlays.pins.push(pc);
      clearAllSelections(); selPinId = pc.id;
      persistToIDB(); syncUI(); draw();
    }
  }

  function deleteSelectedTarget(t) {
    if (!t) return;
    var ar = langOf('menus') === 'ar';
    var msg = ar ? ('حذف «' + t.label + '»؟ (يمكن التراجع بـ Undo)') : ('Delete "' + t.label + '"? (Undoable)');
    if (!confirm(msg)) return;
    quickMoveArmed = false; quickVertsArmed = false;
    if (t.kind === 'asset') { deleteSelectedAsset(); return; }
    if (t.kind === 'gis') {
      pushUndo('Delete GIS Feature');
      doc.gis.features = doc.gis.features.filter(function (f) { return selGisIds.indexOf(f.id) < 0; });
      selGisIds = [];
    } else if (t.kind === 'geoterra') {
      pushUndo('Delete GeoTerra Feature');
      doc.geoterra.features.splice(t.idx, 1);
      selGtIdx = -1;
    } else if (t.kind === 'pin') {
      pushUndo('Delete Pin');
      doc.overlays.pins = doc.overlays.pins.filter(function (p) { return p.id !== t.item.id; });
      selPinId = null;
    }
    persistToIDB(); syncUI(); draw();
  }

  function positionQuickPop() {
    if (!quickPopEl) return;
    var t = getActiveSelectionTarget();
    drawQuickVertexHandles(t);
    if (!t || (drag && drag.m !== 'pan')) {
      quickPopEl.classList.remove('show');
      return;
    }
    var ar = langOf('menus') === 'ar';
    var kindTag = t.kind === 'geoterra' ? 'GeoTerra' : t.kind === 'gis' ? 'ArcGIS' : t.kind === 'asset' ? 'Asset' : 'Pin';
    var canLift = (t.kind === 'gis' || t.kind === 'geoterra') && t.item.points && t.item.points.length >= 3;

    var extraBtns = '';
    if (canLift) {
      extraBtns += '<button type="button" class="satc-qpop-btn amb" data-qa="lift">✨ ' + (ar ? 'تعديل من الأساس' : 'Lift & Edit') + '</button>';
    }
    if (t.isPoly) {
      extraBtns += '<button type="button" class="satc-qpop-btn' + (quickVertsArmed ? ' amb' : '') + '" data-qa="verts">⬡ ' + (ar ? (quickVertsArmed ? 'إنهاء الزوايا' : 'زوايا') : (quickVertsArmed ? 'Done Pts' : 'Vertices')) + '</button>';
    } else if (t.kind === 'asset') {
      extraBtns +=
        '<button type="button" class="satc-qpop-btn cy" data-qa="rot15">↻ +15°</button>' +
        '<button type="button" class="satc-qpop-btn amb" data-qa="flipsh">⇄ ' + (ar ? 'عكس الظل' : 'Flip Sh') + '</button>' +
        '<button type="button" class="satc-qpop-btn on" data-qa="tone">🎨 ' + (ar ? 'دمج' : 'Blend') + '</button>' +
        '<button type="button" class="satc-qpop-btn" data-qa="crop">✂ ' + (ar ? 'قص' : 'Crop') + '</button>';
    }

    quickPopEl.dir = ar ? 'rtl' : 'ltr';
    quickPopEl.innerHTML =
      '<div class="satc-qpop-hd">' +
        '<span>[' + kindTag + '] ' + esc(t.label) + '</span>' +
        '<button type="button" class="satc-qpop-btn" data-qa="close" style="flex:0 0 auto;min-height:20px;padding:1px 6px">✕</button>' +
      '</div>' +
      '<div class="satc-qpop-row">' +
        '<button type="button" class="satc-qpop-btn" data-qa="edit">✎ ' + (ar ? 'تعديل' : 'Edit') + '</button>' +
        '<button type="button" class="satc-qpop-btn' + (quickMoveArmed ? ' on' : '') + '" data-qa="move">✥ ' + (ar ? (quickMoveArmed ? 'تثبيت' : 'تحريك') : (quickMoveArmed ? 'Done' : 'Move')) + '</button>' +
        extraBtns +
        '<button type="button" class="satc-qpop-btn" data-qa="clone">⧉ ' + (ar ? 'نسخ' : 'Clone') + '</button>' +
        '<button type="button" class="satc-qpop-btn dng" data-qa="del">🗑 ' + (ar ? 'حذف' : 'Delete') + '</button>' +
      '</div>';

    quickPopEl.classList.add('show');
    var sp = i2s(t.anchorImg.x, t.anchorImg.y);
    var pw = quickPopEl.offsetWidth || 235;
    var ph = quickPopEl.offsetHeight || 74;
    var left = clamp(sp[0] - pw / 2, 10, Math.max(10, W - pw - 10));
    var top = sp[1] - ph - 22;
    if (top < 38) top = Math.min(H - ph - 12, sp[1] + 24);
    quickPopEl.style.left = Math.round(left) + 'px';
    quickPopEl.style.top = Math.round(Math.max(38, top)) + 'px';

    [].forEach.call(quickPopEl.querySelectorAll('[data-qa]'), function (btn) {
      btn.onclick = function (ev) {
        ev.stopPropagation();
        var act = btn.dataset.qa;
        if (act === 'close') { clearAllSelections(); quickVertsArmed = false; syncUI(); draw(); }
        else if (act === 'edit') editSelectedTarget(t);
        else if (act === 'lift') {
          quickMoveArmed = false; quickVertsArmed = false;
          liftPolygonFromBase(t.item.points, t.label, autoHealOnLift, cutFeatherPx);
        } else if (act === 'move') {
          quickMoveArmed = !quickMoveArmed;
          if (quickMoveArmed) {
            quickVertsArmed = false;
            if (t.kind === 'asset' && t.item.locked) t.item.locked = false;
            setStatus(ar ? 'وضع التحريك مفعّل: اسحب بإصبعك لتحريك «' + t.label + '» ثم اضغط تثبيت.' : 'Move Armed: Drag anywhere to move "' + t.label + '", then tap Done.', false);
          } else {
            setStatus(ar ? 'تم تثبيت موقع المعلم.' : 'Position locked.', false);
          }
          draw();
        } else if (act === 'verts') {
          quickVertsArmed = !quickVertsArmed;
          if (quickVertsArmed) {
            quickMoveArmed = false;
            setStatus(ar ? 'اسحب أي نقطة صفراء لتعديل زوايا «' + t.label + '».' : 'Drag any yellow corner handle to reshape "' + t.label + '".', false);
          }
          draw();
        } else if (act === 'rot15') { nudgeAssetRotation(t.item, 15); }
        else if (act === 'flipsh') { nudgeSunAzimuth(180, 'Flip Shadow 180°'); }
        else if (act === 'tone') { autoMatchSoilTone(); }
        else if (act === 'crop') { setTool('crop_asset'); }
        else if (act === 'clone') cloneSelectedTarget(t);
        else if (act === 'del') deleteSelectedTarget(t);
      };
    });
  }

  // =========================================================================
  // 10. CALIBRATION, GIS TOPOLOGY, GEOPROCESSING, GEOTERRA & 3D/CAD BRIDGE
  // =========================================================================
  function applyCalibration(knownMeters) {
    var m = parseFloat(knownMeters);
    if (!(m > 0)) { setStatus('Enter a valid positive distance in meters.', true); return; }
    var p1 = calibDraft.p1 || doc.calibration.p1, p2 = calibDraft.p2 || doc.calibration.p2;
    if (!p1 || !p2) { setStatus('Pick 2 reference points on the image first.', true); return; }
    var pxDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (pxDist < 2) { setStatus('Reference points are too close.', true); return; }
    pushUndo('Calibrate Metric Scale');
    doc.calibration = { pxPerMeter: +(pxDist / m).toFixed(5), p1: { x: +p1.x.toFixed(2), y: +p1.y.toFixed(2) }, p2: { x: +p2.x.toFixed(2), y: +p2.y.toFixed(2) }, knownMeters: m };
    recomputeGeoref(false); persistToIDB(); setTool('select'); syncUI(); draw();
    setStatus('Scale calibrated: ' + doc.calibration.pxPerMeter.toFixed(3) + ' px/m.', false);
  }

  function clearCalibration() {
    pushUndo('Clear Calibration');
    doc.calibration = { pxPerMeter: 0, p1: null, p2: null, knownMeters: 10 };
    calibDraft = { p1: null, p2: null };
    persistToIDB(); syncUI(); draw();
  }

  function finalizeBearingCalibration(p1, p2) {
    if (!S.SatArcGIS) return;
    var knownStr = prompt('Enter true bearing of this line in degrees (0 = True North, 90 = East):', '0');
    if (knownStr === null) { bearingDraft = { p1: null, p2: null }; draw(); return; }
    var off = S.SatArcGIS.calcNorthOffsetFromLine(p1, p2, parseFloat(knownStr) || 0);
    bearingDraft = { p1: null, p2: null };
    if (off === null) { setStatus('Bearing line too short.', true); draw(); return; }
    pushUndo('Calibrate True North'); doc.overlays.northDeg = off;
    if (St && St.project && St.project.meta) { St.project.meta.trueNorthOffsetDeg = off; St.emit('change'); }
    persistToIDB(); setTool('select'); syncUI(); draw();
    setStatus('True North calibrated: ' + off + '°.', false);
  }

  function finalizeGisShape() {
    if (!S.SatArcGIS) return;
    if (tool === 'gis_split') {
      if (gisDraftPts.length < 2) { setStatus('Draw a cut line across the selected polygon first.', true); return; }
      var target = selGisIds.length ? getGisById(selGisIds[0]) : null;
      if (!target || target.geom !== 'polygon') { setStatus('Select a GIS polygon to split first.', true); gisDraftPts = []; draw(); return; }
      var parts = S.SatArcGIS.splitPolygonByLine(target.points, gisDraftPts);
      gisDraftPts = [];
      if (!parts) { setStatus('Cut line did not divide polygon.', true); draw(); return; }
      pushUndo('Split Polygon');
      doc.gis.features = doc.gis.features.filter(function (f) { return f.id !== target.id; });
      var f1 = S.SatArcGIS.createFeature(Object.assign({}, target, { id: uid('gis'), name: target.name + ' (A)', points: parts[0] }));
      var f2 = S.SatArcGIS.createFeature(Object.assign({}, target, { id: uid('gis'), name: target.name + ' (B)', points: parts[1] }));
      doc.gis.features.push(f1, f2); clearAllSelections(); selGisIds = [f1.id, f2.id];
      persistToIDB(); setTool('select'); syncUI(); draw(); return;
    }
    var minPts = tool === 'gis_line' ? 2 : 3;
    if (gisDraftPts.length < minPts) { setStatus('Click at least ' + minPts + ' points first.', true); return; }
    pushUndo(tool === 'gis_line' ? 'Draw GIS Line' : 'Draw GIS Polygon');
    var feat = S.SatArcGIS.createFeature({ geom: tool === 'gis_line' ? 'polyline' : 'polygon', category: doc.gis.activeCategory || 'building', points: gisDraftPts.slice() });
    doc.gis.features.push(feat); doc.layers.gis.visible = true; clearAllSelections(); selGisIds = [feat.id]; gisDraftPts = [];
    persistToIDB(); syncUI(); draw();
  }

  function runGisBooleanOp(op) {
    if (!S.SatArcGIS) return;
    var polys = selGisIds.map(getGisById).filter(function (f) { return f && f.geom === 'polygon' && f.points.length >= 3; });
    if (polys.length < 2) { alert('Select 2 GIS polygons first (Ctrl+Click) to run ' + op.toUpperCase() + '.'); return; }
    var rings = S.SatArcGIS.polygonBoolean(polys[0].points, polys[1].points, op);
    if (!rings.length) { setStatus('No overlapping result.', true); return; }
    pushUndo('Topology ' + op);
    if (op === 'union') doc.gis.features = doc.gis.features.filter(function (f) { return f.id !== polys[0].id && f.id !== polys[1].id; });
    else if (op === 'difference') doc.gis.features = doc.gis.features.filter(function (f) { return f.id !== polys[0].id; });
    var created = [];
    rings.forEach(function (r, i) {
      var nf = S.SatArcGIS.createFeature({ geom: 'polygon', category: polys[0].category, name: polys[0].name + ' [' + op + (rings.length > 1 ? (' ' + (i + 1)) : '') + ']', points: r });
      doc.gis.features.push(nf); created.push(nf.id);
    });
    clearAllSelections(); selGisIds = created; persistToIDB(); syncUI(); draw();
  }

  function runBufferTool(centerPt) {
    if (!S.SatArcGIS) return;
    if (!(doc.calibration.pxPerMeter > 0)) { alert('Calibrate metric scale (px/m) or GCPs first.'); return; }
    var target = selGisIds.length ? getGisById(selGisIds[0]) : (centerPt ? S.SatArcGIS.createFeature({ geom: 'point', category: 'generic', name: 'Buffer Center', points: [centerPt] }) : null);
    if (!target) { setStatus('Select a GIS feature or click on map.', true); return; }
    var raw = prompt('Buffer distances in meters (e.g. 10, 25, 50):', '10, 25, 50');
    if (!raw) return;
    var dists = raw.split(/[,;\s]+/).map(parseFloat).filter(function (v) { return isFinite(v) && v > 0; });
    var rings = S.SatArcGIS.createMultiRingBuffers(target, dists, doc.calibration.pxPerMeter);
    if (!rings.length) return;
    pushUndo('Multi-Ring Buffer'); rings.forEach(function (r) { doc.gis.features.push(r); });
    doc.layers.gis.visible = true; persistToIDB(); syncUI(); draw();
  }

  function runViewshedAt(originPt) {
    if (!S.SatArcGIS) return;
    var ppm = doc.calibration.pxPerMeter || 0;
    var raw = prompt('Viewshed radius (' + (ppm > 0 ? 'meters' : 'pixels') + '):', ppm > 0 ? '60' : '250');
    if (!raw) return;
    var radPx = ppm > 0 ? (parseFloat(raw) * ppm) : parseFloat(raw);
    if (!(radPx > 5)) return;
    var obstacles = (doc.gis.features || []).filter(function (f) { return f.visible && f.obstacle && f.geom === 'polygon' && f.points.length >= 3; }).map(function (f) { return f.points; });
    viewshedResult = S.SatArcGIS.computeViewshed2D(originPt, radPx, obstacles, 360);
    doc.layers.gis.visible = true; draw();
    setStatus('2D Viewshed: ' + viewshedResult.coveragePct + '% visible coverage.', false);
  }

  function runRangeRingsDialog() {
    var d = getBaseDims(); if (!d.w) return;
    if (!(doc.calibration.pxPerMeter > 0)) { alert('Calibrate metric scale first.'); return; }
    var raw = prompt('Range Rings in meters (empty to clear):', '15, 30, 60, 100');
    if (raw === null) return;
    if (!raw.trim()) { rangeRingsState = null; draw(); return; }
    var rings = raw.split(/[,;\s]+/).map(parseFloat).filter(function (v) { return isFinite(v) && v > 0; });
    var ctr = hovImg || { x: d.w / 2, y: d.h / 2 };
    if (selGisIds.length) { var sf = getGisById(selGisIds[0]); if (sf && S.SatArcGIS) { var st = S.SatArcGIS.polyStats(sf.points, doc.calibration.pxPerMeter); ctr = { x: st.cx, y: st.cy }; } }
    rangeRingsState = { center: ctr, ringsM: rings }; doc.layers.gis.visible = true; draw();
  }

  function runNearestEvacMatrix() {
    if (!S.SatArcGIS) return;
    if (evacMatrixLinks.length) { evacMatrixLinks = []; draw(); return; }
    var targets = doc.gis.features.filter(function (f) { return f.visible && (f.category === 'safe_zone' || f.category === 'evac_route'); });
    var sources = doc.gis.features.filter(function (f) { return f.visible && (f.category === 'building' || f.category === 'tent'); });
    if (!targets.length || !sources.length) { alert('Add at least one Building/Tent and one Safe Assembly/Route feature in GIS layer.'); return; }
    evacMatrixLinks = S.SatArcGIS.computeNearestEvacMatrix(sources, targets, doc.calibration.pxPerMeter);
    doc.layers.gis.visible = true; draw();
  }

  function runSpatialQueryPrompt() {
    if (!S.SatArcGIS) return;
    var ref = selGisIds.length ? getGisById(selGisIds[0]) : null;
    if (!ref) { alert('Select a reference GIS feature first.'); return; }
    var rel = prompt('Spatial relation (intersects / within / contains / within_distance):', 'within_distance');
    if (!rel) return;
    var dM = rel === 'within_distance' ? (parseFloat(prompt('Max distance in meters:', '20')) || 20) : 0;
    var hits = S.SatArcGIS.selectByLocation(doc.gis.features, ref, rel.trim(), dM, doc.calibration.pxPerMeter);
    clearAllSelections(); selGisIds = [ref.id].concat(hits); openBottomTab('attr'); syncUI(); draw();
  }

  function runCogoInput() {
    if (!S.SatArcGIS || !(doc.calibration.pxPerMeter > 0) || !gisDraftPts.length) { alert('Calibrate scale and click point 1 of a GIS Line/Polygon first.'); return; }
    var raw = prompt('COGO — Distance (m), Bearing (deg) e.g. "25, 90":', '15, 0');
    if (!raw) return;
    var parts = raw.split(/[,;\s]+/).map(parseFloat);
    if (!(parts[0] > 0) || !isFinite(parts[1])) return;
    var nextPt = S.SatArcGIS.cogoNextPoint(gisDraftPts[gisDraftPts.length - 1], parts[0], parts[1], doc.calibration.pxPerMeter, doc.overlays.northDeg || 0);
    if (nextPt) { gisDraftPts.push(nextPt); draw(); }
  }

  function openGeoTerraModalFor(pts, geom, editIdx) {
    if (!S.SatGeoTerra) return;
    S.SatGeoTerra.openFeatureModal({
      state: doc.geoterra, editIndex: editIdx, geometry: geom, points: pts, lang: langOf('panels'),
      getCompassHeading: function () { return liveCompassDeg; },
      onSave: function (payload, idx) {
        pushUndo('Save GeoTerra Feature ' + payload.id);
        if (idx >= 0) doc.geoterra.features[idx] = payload;
        else { doc.geoterra.features.push(payload); doc.geoterra.nextFeatNum++; }
        gtDraftPts = []; doc.layers.geoterra.visible = true;
        persistToIDB(); syncUI(); draw();
      },
      onCancel: function () { if (editIdx < 0) gtDraftPts = []; syncUI(); draw(); }
    });
  }

  function openGcpModal(imgPt) {
    if (!S.SatGeorefGPS) return;
    var bg = document.getElementById('scGcpModal');
    if (!bg) { bg = document.createElement('div'); bg.id = 'scGcpModal'; bg.className = 'sgt-bg'; bg.dataset.ajDone = '1'; document.body.appendChild(bg); }
    var gNum = doc.geoterra.gcps.length + 1, curFix = gpsEngine && gpsEngine.getCurrentFix();
    bg.innerHTML =
      '<div class="sgt-box">' +
        '<h3><span>Add Ground Control Point (GCP)</span><span class="satc-tag gis">GCP-' + gNum + '</span></h3>' +
        '<div style="font-size:10.5px;color:var(--sc-cyan)">Image Pixel: (' + Math.round(imgPt.x) + ', ' + Math.round(imgPt.y) + ')</div>' +
        '<button type="button" class="satc-qbtn on" id="scGcpAvgBtn" style="justify-content:center">🛰 Capture Averaged GPS (6 samples)</button>' +
        '<label>Smart Paste (DD, DMS, UTM 36N, or Google Maps URL)<input type="text" id="scGcpPaste" dir="ltr" placeholder="31.351234, 34.284567"></label>' +
        '<div class="satc-grid2"><label>Latitude<input type="text" id="scGcpLat" dir="ltr" value="' + (curFix ? curFix.lat.toFixed(7) : '') + '"></label><label>Longitude<input type="text" id="scGcpLon" dir="ltr" value="' + (curFix ? curFix.lon.toFixed(7) : '') + '"></label></div>' +
        '<label>GCP Label<input type="text" id="scGcpLbl" value="GCP-' + gNum + '"></label>' +
        '<div id="scGcpMsg" style="font-size:10px;color:var(--sc-amber)"></div>' +
        '<div style="display:flex;gap:6px;justify-content:flex-end"><button type="button" class="satc-qbtn on" id="scGcpOk">Save GCP</button><button type="button" class="satc-qbtn dng" id="scGcpCan">Cancel</button></div>' +
      '</div>';
    var latEl = bg.querySelector('#scGcpLat'), lonEl = bg.querySelector('#scGcpLon'), msgEl = bg.querySelector('#scGcpMsg');
    bg.querySelector('#scGcpPaste').oninput = function () {
      var parsed = S.SatGeorefGPS.parseSmartCoords(this.value);
      if (parsed) { latEl.value = parsed.lat.toFixed(7); lonEl.value = parsed.lon.toFixed(7); msgEl.style.color = 'var(--sc-green2)'; msgEl.textContent = 'Parsed (' + parsed.format + ')'; }
    };
    bg.querySelector('#scGcpAvgBtn').onclick = function () {
      ensureGpsCompassEngines(); var btn = this; btn.disabled = true;
      msgEl.style.color = 'var(--sc-cyan)'; msgEl.textContent = 'Averaging GPS...';
      gpsEngine.captureAveragedFix(6, function (n, tot, acc) { msgEl.textContent = 'Sample ' + n + '/' + tot + ' (±' + Math.round(acc) + 'm)...'; }, function (err, avg) {
        btn.disabled = false;
        if (err || !avg) { msgEl.style.color = 'var(--sc-red)'; msgEl.textContent = (err && err.message) || 'GPS unavailable'; return; }
        latEl.value = avg.lat.toFixed(7); lonEl.value = avg.lon.toFixed(7);
        msgEl.style.color = 'var(--sc-green2)'; msgEl.textContent = 'Averaged ' + avg.sampleCount + ' fixes (±' + avg.accuracy + 'm)';
      });
    };
    bg.querySelector('#scGcpOk').onclick = function () {
      var lat = parseFloat(latEl.value), lon = parseFloat(lonEl.value);
      if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { msgEl.style.color = 'var(--sc-red)'; msgEl.textContent = 'Invalid Lat/Lon.'; return; }
      pushUndo('Add GCP-' + gNum);
      doc.geoterra.gcps.push({ x: +imgPt.x.toFixed(2), y: +imgPt.y.toFixed(2), lat: lat, lon: lon, label: bg.querySelector('#scGcpLbl').value.trim() || ('GCP-' + gNum), enabled: true });
      recomputeGeoref(true); bg.classList.remove('open'); persistToIDB(); syncUI(); draw();
    };
    bg.querySelector('#scGcpCan').onclick = function () { bg.classList.remove('open'); };
    bg.classList.add('open');
  }

  function pushFeaturesToCad(open3DAfter) {
    var d = getBaseDims();
    var ar = langOf('panels') === 'ar';
    if (!St || !St.project || !d.w) { alert(ar ? 'حمّل خريطة أو جلسة أولاً.' : 'Load a base map or session first.'); return; }
    var ppm = doc.calibration.pxPerMeter || (georefModel && georefModel.pxPerMeter) || 0;
    if (!(ppm > 0)) { alert(ar ? 'عاير المقياس (px/m) أو اربط نقطتي GCP أولاً.' : 'Calibrate metric scale (px/m) or GCPs first.'); return; }
    var gisList = (doc.gis.features || []).filter(function (f) { return f.visible && f.points.length >= 1; });
    if (!gisList.length) {
      if (open3DAfter && S.WebGL3D) { close(); S.WebGL3D.open(); return; }
      alert(ar ? 'لا توجد معالم GIS لإرسالها. ارسم معالم أو اضغط Push to ArcGIS أولاً.' : 'No visible GIS features to push. Draw features or Push from GeoTerra first.'); return;
    }
    var cx0 = d.w / 2, cy0 = d.h / 2;
    var catMap = { building: 'building', tent: 'tent', evac_route: 'road', safe_zone: 'assembly', hazard: 'hazard', perimeter: 'fence', camera: 'camera', buffer: 'yard', generic: 'building' };
    St.snapshot();
    gisList.forEach(function (f) {
      var mPts = f.points.map(function (p) { return { x: +((p.x - cx0) / ppm).toFixed(2), y: +((cy0 - p.y) / ppm).toFixed(2) }; });
      var mx = 0, my = 0; mPts.forEach(function (p) { mx += p.x; my += p.y; }); mx /= mPts.length; my /= mPts.length;
      var cadCat = catMap[f.category] || 'building', isPoly = (f.geom === 'polygon' || f.geom === 'circle') && mPts.length >= 3;
      St.project.features.push(St.newFeature({
        en_name: f.name || f.id, category: cadCat, geometryType: isPoly ? 'polygon' : 'point',
        coordsMetric: isPoly ? mPts : [mPts[0]], center: { x: +mx.toFixed(2), y: +my.toFixed(2) },
        height_m: cadCat === 'building' ? 6 : (cadCat === 'tent' ? 2.6 : 2.5), color: f.color || '#00ff9d', notes: f.notes || 'Sat Studio GIS'
      }));
    });
    if (doc.overlays.northDeg) St.project.meta.trueNorthOffsetDeg = doc.overlays.northDeg;
    St.emit('change');
    if (open3DAfter && S.WebGL3D) { close(); S.WebGL3D.open(); }
  }

  function downloadTextFile(text, filename, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    if (S.SatGeoTerra && S.SatGeoTerra.triggerDownloadBlob) S.SatGeoTerra.triggerDownloadBlob(blob, filename);
  }

  function exportWorldFilePackage() {
    var d = getBaseDims();
    if (!georefModel || !d.w || !S.SatGeorefGPS) {
      alert(langOf('panels') === 'ar' ? 'اربط الخريطة بـ 2 GCP على الأقل أولاً.' : 'Georeference the map with at least 2 GCPs first.');
      return;
    }
    var pgw = S.SatGeorefGPS.buildWorldFilePGW(georefModel, d.w, d.h);
    var kml = S.SatGeorefGPS.buildKmlGroundOverlay(georefModel, d.w, d.h, 'Master_Clean_2D.png', doc.overlays.titleEn || 'AJ-GeoCAD Map');
    if (S.SatGeoTerra && S.SatGeoTerra.buildZipBlob) {
      var entries = [{ name: 'Master_Clean_2D.pgw', data: pgw }, { name: 'Master_Clean_2D.prj', data: S.SatGeorefGPS.WGS84_PRJ_WKT }];
      if (kml) entries.push({ name: 'doc.kml', data: kml });
      S.SatGeoTerra.triggerDownloadBlob(S.SatGeoTerra.buildZipBlob(entries), 'ArcGIS_Georef_WorldFile.zip');
    } else {
      downloadTextFile(pgw, 'Master_Clean_2D.pgw');
    }
  }

  function duplicateSelectedAsset() {
    var a = getSelAsset(); if (!a) return;
    pushUndo('Duplicate Asset');
    var copy = normalizeAsset(JSON.parse(JSON.stringify(a)));
    copy.id = uid('ast'); copy.name = a.name + ' (copy)';
    copy.x = +(a.x + 20).toFixed(2); copy.y = +(a.y + 20).toFixed(2); copy.locked = false;
    doc.assets.push(copy); clearAllSelections(); selAssetId = copy.id; persistToIDB(); syncUI(); draw();
  }
  function deleteSelectedAsset() {
    var a = getSelAsset(); if (!a) return;
    pushUndo('Delete Asset'); doc.assets = doc.assets.filter(function (x) { return x.id !== a.id; });
    selAssetId = null; persistToIDB(); syncUI(); draw();
  }
  function reorderSelectedAsset(dir) {
    var idx = -1; for (var i = 0; i < doc.assets.length; i++) if (doc.assets[i].id === selAssetId) { idx = i; break; }
    if (idx < 0 || idx + dir < 0 || idx + dir >= doc.assets.length) return;
    pushUndo('Reorder Asset'); var tmp = doc.assets[idx]; doc.assets[idx] = doc.assets[idx + dir]; doc.assets[idx + dir] = tmp;
    persistToIDB(); syncUI(); draw();
  }

  // =========================================================================
  // 11. POINTER & KEYBOARD HANDLERS (WITH QUICK MOVE + VERTEX DRAG)
  // =========================================================================
  function posOf(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function twoPtrs() {
    var ks = Object.keys(ptrs), a = ptrs[ks[0]], b = ptrs[ks[1]];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  function getSnappedImgPt(rawIp, e, draftArr) {
    var pt = rawIp; snapPreview = null;
    if (S.SatArcGIS && doc.gis.snap && doc.gis.snap.enabled && (tool === 'gis_point' || tool === 'gis_line' || tool === 'poly_draw' || tool === 'gis_split' || tool === 'gis_circle')) {
      var res = S.SatArcGIS.snapPoint(rawIp, doc.gis.features, draftArr, 14 / Math.max(0.1, view.s), doc.gis.snap);
      snapPreview = res; if (res.snapped) pt = { x: res.x, y: res.y };
    }
    if (e && e.shiftKey && draftArr && draftArr.length && S.SatArcGIS) pt = S.SatArcGIS.applyOrtho(draftArr[draftArr.length - 1], pt, 45);
    return pt;
  }

  function bindCanvas() {
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    cv.addEventListener('dblclick', function () {
      if (tool === 'cutout' && cutPts.length >= 3) extractCutoutFromBase();
      else if (tool === 'crop_asset' && cutPts.length >= 3) applyCropSelectedAsset();
      else if (tool === 'lasso_erase' && cutPts.length >= 3) applyLassoEraseAsset();
      else if ((tool === 'poly_draw' && gisDraftPts.length >= 3) || (tool === 'gis_line' && gisDraftPts.length >= 2) || (tool === 'gis_split' && gisDraftPts.length >= 2)) finalizeGisShape();
      else if (tool === 'gt_survey' && gtDraftPts.length >= 3) openGeoTerraModalFor(gtDraftPts, 'polygon', -1);
      else if (tool === 'gt_boundary' && doc.geoterra.boundary.length >= 3) { pushUndo('Close Boundary'); doc.geoterra.boundaryClosed = true; persistToIDB(); syncUI(); draw(); }
    });

    cv.addEventListener('pointerdown', function (e) {
      cv.setPointerCapture(e.pointerId);
      var p = posOf(e); ptrs[e.pointerId] = p;
      if (Object.keys(ptrs).length === 2) { var t = twoPtrs(); drag = { m: 'pinch', d: t.d, s: view.s, imgPt: s2i(t.x, t.y) }; return; }
      var ip = s2i(p.x, p.y); hovImg = ip;
      var dims = getBaseDims();
      if (e.button === 1 || e.button === 2 || space || tool === 'pan' || !dims.w) {
        drag = { m: 'pan', x: p.x, y: p.y, ox: view.ox, oy: view.oy }; return;
      }
      if (driftFixPending) { driftFixPending = false; triggerDriftFixAtClick(ip); return; }

      if (tool === 'select') {
        var curT = getActiveSelectionTarget();

        if (quickVertsArmed && curT && curT.isPoly && curT.item.points) {
          for (var vi = 0; vi < curT.item.points.length; vi++) {
            var vsp = i2s(curT.item.points[vi].x, curT.item.points[vi].y);
            if (Math.hypot(p.x - vsp[0], p.y - vsp[1]) <= 16) {
              drag = { m: curT.kind === 'geoterra' ? 'moveGtVert' : 'moveGisVert', fi: curT.idx, feat: curT.item, vi: vi, pushed: false };
              return;
            }
          }
        }

        if (quickMoveArmed && curT) {
          if (curT.kind === 'asset') {
            drag = { m: 'move', a: curT.item, sx: ip.x, sy: ip.y, x0: curT.item.x, y0: curT.item.y, pushed: false };
            return;
          }
          if (curT.kind === 'pin') {
            drag = { m: 'movePin', pin: curT.item, sx: ip.x, sy: ip.y, x0: curT.item.x, y0: curT.item.y, pushed: false };
            return;
          }
          if (curT.kind === 'gis' || curT.kind === 'geoterra') {
            drag = {
              m: 'movePolyWhole',
              feat: curT.item,
              label: curT.label,
              sx: ip.x, sy: ip.y,
              origPts: curT.item.points.map(function (pt) { return { x: pt.x, y: pt.y }; }),
              pushed: false
            };
            return;
          }
        }

        var hitP = hitPinAt(p);
        if (hitP) {
          clearAllSelections(); quickVertsArmed = false; selPinId = hitP.id;
          drag = { m: 'movePin', pin: hitP, sx: ip.x, sy: ip.y, x0: hitP.x, y0: hitP.y, pushed: false };
          syncUI(); draw(); return;
        }
        var sel = getSelAsset(), hk = hitAssetHandle(sel, p);
        if (hk && sel) {
          if (hk === 'rot') { drag = { m: 'rot', a: sel, pushed: false }; return; }
          var hw = sel.wPx / 2, hh = sel.hPx / 2;
          var oppMap = { tl: [hw, hh], tr: [-hw, hh], br: [-hw, -hh], bl: [hw, -hh] };
          var signMap = { tl: [-1, -1], tr: [1, -1], br: [1, 1], bl: [-1, 1] };
          drag = { m: 'resize', a: sel, sx: signMap[hk][0], sy: signMap[hk][1], anchor: assetLocalToImg(sel, oppMap[hk][0], oppMap[hk][1]), origW: sel.wPx, origH: sel.hPx, rad: (sel.rotationDeg || 0) * D, pushed: false };
          return;
        }
        var hitA = hitAssetAt(ip);
        if (hitA) {
          clearAllSelections(); quickVertsArmed = false; selAssetId = hitA.id;
          if (!hitA.locked) drag = { m: 'move', a: hitA, sx: ip.x, sy: ip.y, x0: hitA.x, y0: hitA.y, pushed: false };
          syncUI(); draw(); return;
        }
        var hitGtI = hitGeoTerraAt(ip, p);
        if (hitGtI >= 0) {
          clearAllSelections(); quickVertsArmed = false; selGtIdx = hitGtI;
          syncUI(); draw(); return;
        }
        var hitG = hitGisAt(ip, p);
        if (hitG) {
          if (e.ctrlKey || e.shiftKey) {
            var pos = selGisIds.indexOf(hitG.id);
            if (pos >= 0) selGisIds.splice(pos, 1); else selGisIds.push(hitG.id);
          } else {
            clearAllSelections(); quickVertsArmed = false; selGisIds = [hitG.id];
          }
          syncUI(); draw(); return;
        }
        clearAllSelections(); quickVertsArmed = false;
        drag = { m: 'pan', x: p.x, y: p.y, ox: view.ox, oy: view.oy };
        syncUI(); draw(); return;
      }

      if (tool === 'crop_asset' || tool === 'lasso_erase') {
        if (!getSelAsset()) { var ca = hitAssetAt(ip); if (ca) { selAssetId = ca.id; syncUI(); } else { setStatus('Select an asset first.', true); return; } }
        if (cutPts.length >= 3 && Math.hypot(p.x - i2s(cutPts[0].x, cutPts[0].y)[0], p.y - i2s(cutPts[0].x, cutPts[0].y)[1]) <= 13) {
          if (tool === 'crop_asset') applyCropSelectedAsset(); else applyLassoEraseAsset(); return;
        }
        cutPts.push({ x: +ip.x.toFixed(2), y: +ip.y.toFixed(2) }); syncUI(); draw(); return;
      }
      if (tool === 'crop_base') { drag = { m: 'crop_base', p1: ip, p2: ip }; draw(); return; }
      if (tool === 'wand') { applyMagicWandOnAsset(ip); return; }
      if (tool === 'eyedropper') {
        if (S.SatPhotoTools && imgs.base) { photoCfg.color = S.SatPhotoTools.sampleColorAt(imgs.base, ip.x, ip.y); setTool('brush'); }
        return;
      }
      if (tool === 'brush') { pushUndo('Brush Stroke'); stampPaintBrushDab(ip); drag = { m: 'brush', last: ip }; draw(); return; }
      if (tool === 'clone') {
        if (e.altKey || cloneCfg.pickMode || !cloneCfg.src) {
          cloneCfg.src = { x: +ip.x.toFixed(2), y: +ip.y.toFixed(2) }; cloneCfg.pickMode = false;
          setStatus('Clone Source set. Paint over target.', false); syncUI(); draw(); return;
        }
        pushUndo('Clone Patch'); doc.layers.cleanup.visible = true;
        var p0 = { id: uid('ptc'), sx: cloneCfg.src.x, sy: cloneCfg.src.y, dx: +ip.x.toFixed(2), dy: +ip.y.toFixed(2), r: cloneCfg.radius, feather: cloneCfg.feather, opacity: cloneCfg.opacity, rotDeg: cloneCfg.rotDeg };
        doc.patches.push(p0); incrementalStampPatch(p0);
        drag = { m: 'clone', startSrc: { x: cloneCfg.src.x, y: cloneCfg.src.y }, startDst: ip, lastDst: ip }; draw(); return;
      }
      if (tool === 'erase') {
        if (!hasActiveCleanupImg() && !doc.patches.length) { setStatus('Nothing on Cleanup layer to erase.', true); return; }
        pushUndo('Soft Erase');
        var pt0 = { x: +ip.x.toFixed(2), y: +ip.y.toFixed(2) };
        var st = { id: uid('ers'), r: eraseCfg.radius, feather: eraseCfg.feather, opacity: eraseCfg.opacity, pts: [pt0] };
        doc.cleanupErases.push(st); incrementalErase(pt0, null, st, true);
        drag = { m: 'erase', stroke: st, last: pt0 }; draw(); return;
      }
      if (tool === 'cutout') {
        if (cutPts.length >= 3 && Math.hypot(p.x - i2s(cutPts[0].x, cutPts[0].y)[0], p.y - i2s(cutPts[0].x, cutPts[0].y)[1]) <= 13) { extractCutoutFromBase(); return; }
        cutPts.push({ x: +ip.x.toFixed(2), y: +ip.y.toFixed(2) }); syncUI(); draw(); return;
      }
      if (tool === 'futsal_rect') { drag = { m: 'futsal_rect', p1: ip, p2: ip }; draw(); return; }
      if (tool === 'building_add') { addBuildingAt(ip); return; }
      if (tool === 'tent_add') { addTentAt(ip); return; }
      if (tool === 'tree_add') { addTreeAt(ip); return; }

      if (tool === 'gis_point') {
        var spPt = getSnappedImgPt(ip, e, null); pushUndo('Add GIS Point');
        var nf = S.SatArcGIS.createFeature({ geom: 'point', category: doc.gis.activeCategory, points: [spPt] });
        doc.gis.features.push(nf); doc.layers.gis.visible = true; clearAllSelections(); selGisIds = [nf.id]; persistToIDB(); syncUI(); draw(); return;
      }
      if (tool === 'gis_line' || tool === 'poly_draw' || tool === 'gis_split') {
        var spG = getSnappedImgPt(ip, e, gisDraftPts);
        if (tool === 'poly_draw' && gisDraftPts.length >= 3 && Math.hypot(p.x - i2s(gisDraftPts[0].x, gisDraftPts[0].y)[0], p.y - i2s(gisDraftPts[0].x, gisDraftPts[0].y)[1]) <= 13) { finalizeGisShape(); return; }
        gisDraftPts.push({ x: +spG.x.toFixed(2), y: +spG.y.toFixed(2) }); syncUI(); draw(); return;
      }
      if (tool === 'gis_circle') { var scPt = getSnappedImgPt(ip, e, null); drag = { m: 'gis_circle', c: scPt, edge: scPt }; draw(); return; }
      if (tool === 'gis_buffer') { runBufferTool(ip); return; }
      if (tool === 'gis_viewshed') { runViewshedAt(ip); return; }
      if (tool === 'pin') {
        var hp2 = hitPinAt(p);
        if (hp2) { clearAllSelections(); selPinId = hp2.id; drag = { m: 'movePin', pin: hp2, sx: ip.x, sy: ip.y, x0: hp2.x, y0: hp2.y, pushed: false }; syncUI(); draw(); return; }
        pushUndo('Place Pin'); doc.layers.overlays.visible = true;
        var catObj = (S.SatExport && S.SatExport.PIN_CATS[pinCat]) || { color: '#0284c7' };
        var nIdx = doc.overlays.pins.length + 1;
        var np = { id: uid('pin'), x: +ip.x.toFixed(2), y: +ip.y.toFixed(2), cat: pinCat, color: catObj.color, labelEn: 'Point ' + nIdx, labelAr: 'موقع ' + nIdx, showTag: false };
        doc.overlays.pins.push(np); clearAllSelections(); selPinId = np.id; persistToIDB(); syncUI(); draw(); return;
      }
      if (tool === 'calibrate') {
        if (!calibDraft.p1 || (calibDraft.p1 && calibDraft.p2)) calibDraft = { p1: ip, p2: null }; else calibDraft.p2 = ip;
        syncUI(); draw(); return;
      }
      if (tool === 'bearing_cal') {
        if (!bearingDraft.p1) { bearingDraft = { p1: ip, p2: null }; draw(); }
        else { bearingDraft.p2 = ip; draw(); finalizeBearingCalibration(bearingDraft.p1, bearingDraft.p2); }
        return;
      }
      if (tool === 'measure') { if (measPts.length >= 2) measPts = []; measPts.push(ip); draw(); return; }

      if (tool === 'gt_georef') {
        for (var gi = 0; gi < doc.geoterra.gcps.length; gi++) {
          var gsp = i2s(doc.geoterra.gcps[gi].x, doc.geoterra.gcps[gi].y);
          if (Math.hypot(p.x - gsp[0], p.y - gsp[1]) <= 13) { drag = { m: 'moveGcp', idx: gi, pushed: false }; return; }
        }
        openGcpModal(ip); return;
      }
      if (tool === 'gt_gps_drop') { dropGpsPointNow(); return; }
      if (tool === 'gt_boundary') {
        var bPts = doc.geoterra.boundary;
        for (var bi = 0; bi < bPts.length; bi++) {
          var bsp = i2s(bPts[bi].x, bPts[bi].y);
          if (Math.hypot(p.x - bsp[0], p.y - bsp[1]) <= 13) {
            if (bi === 0 && !doc.geoterra.boundaryClosed && bPts.length >= 3) { pushUndo('Close Boundary'); doc.geoterra.boundaryClosed = true; persistToIDB(); syncUI(); draw(); return; }
            drag = { m: 'moveGtBound', idx: bi, pushed: false }; return;
          }
        }
        if (!doc.geoterra.boundaryClosed) { pushUndo('Add Boundary Vertex'); doc.layers.geoterra.visible = true; bPts.push({ x: +ip.x.toFixed(2), y: +ip.y.toFixed(2) }); persistToIDB(); syncUI(); draw(); }
        return;
      }
      if (tool === 'gt_survey') {
        if (doc.geoterra.editSavedVertices) {
          for (var fi = 0; fi < doc.geoterra.features.length; fi++) {
            var fp = doc.geoterra.features[fi].points;
            for (var vi2 = 0; vi2 < fp.length; vi2++) {
              var vsp2 = i2s(fp[vi2].x, fp[vi2].y);
              if (Math.hypot(p.x - vsp2[0], p.y - vsp2[1]) <= 12) { drag = { m: 'moveGtVert', fi: fi, vi: vi2, pushed: false }; return; }
            }
          }
          return;
        }
        if (doc.geoterra.surveyGeom === 'point') { openGeoTerraModalFor([ip], 'point', -1); return; }
        if (gtDraftPts.length >= 3 && Math.hypot(p.x - i2s(gtDraftPts[0].x, gtDraftPts[0].y)[0], p.y - i2s(gtDraftPts[0].x, gtDraftPts[0].y)[1]) <= 13) {
          openGeoTerraModalFor(gtDraftPts, 'polygon', -1); return;
        }
        doc.layers.geoterra.visible = true; gtDraftPts.push({ x: +ip.x.toFixed(2), y: +ip.y.toFixed(2) }); syncUI(); draw(); return;
      }
    });

    cv.addEventListener('pointermove', function (e) {
      var p = posOf(e); if (ptrs[e.pointerId]) ptrs[e.pointerId] = p;
      var ip = s2i(p.x, p.y); hovImg = ip;
      var dims = getBaseDims();
      if (!drag) { getSnappedImgPt(ip, e, gisDraftPts); draw(); return; }
      if (drag.m === 'pan') { view.ox = drag.ox + (p.x - drag.x); view.oy = drag.oy + (p.y - drag.y); }
      else if (drag.m === 'pinch' && Object.keys(ptrs).length >= 2) {
        var t = twoPtrs(), ns = clamp(drag.s * t.d / drag.d, minScale(), 16);
        view.s = ns; view.ox = t.x - drag.imgPt.x * ns; view.oy = t.y - drag.imgPt.y * ns;
      } else if (drag.m === 'crop_base' || drag.m === 'futsal_rect') { drag.p2 = ip; }
      else if (drag.m === 'gis_circle') { drag.edge = ip; }
      else if (drag.m === 'brush') { if (Math.hypot(ip.x - drag.last.x, ip.y - drag.last.y) >= Math.max(2, photoCfg.radius * 0.25)) { stampPaintBrushDab(ip); drag.last = ip; } }
      else if (drag.m === 'move') { if (!drag.pushed) { pushUndo('Move Asset'); drag.pushed = true; } drag.a.x = +(drag.x0 + (ip.x - drag.sx)).toFixed(2); drag.a.y = +(drag.y0 + (ip.y - drag.sy)).toFixed(2); }
      else if (drag.m === 'movePin') { if (!drag.pushed) { pushUndo('Move Pin'); drag.pushed = true; } drag.pin.x = +(drag.x0 + (ip.x - drag.sx)).toFixed(2); drag.pin.y = +(drag.y0 + (ip.y - drag.sy)).toFixed(2); }
      else if (drag.m === 'movePolyWhole') {
        if (!drag.pushed) { pushUndo('Move ' + (drag.label || 'Feature')); drag.pushed = true; }
        var ddxW = ip.x - drag.sx, ddyW = ip.y - drag.sy;
        drag.feat.points = drag.origPts.map(function (pt) {
          return { x: +clamp(pt.x + ddxW, 0, dims.w).toFixed(2), y: +clamp(pt.y + ddyW, 0, dims.h).toFixed(2) };
        });
      } else if (drag.m === 'moveGisVert') {
        if (!drag.pushed) { pushUndo('Move GIS Vertex'); drag.pushed = true; }
        drag.feat.points[drag.vi] = { x: +clamp(ip.x, 0, dims.w).toFixed(2), y: +clamp(ip.y, 0, dims.h).toFixed(2) };
      } else if (drag.m === 'rot') {
        if (!drag.pushed) { pushUndo('Rotate Asset'); drag.pushed = true; }
        var deg = ((Math.atan2(ip.y - drag.a.y, ip.x - drag.a.x) / D + 90) % 360 + 360) % 360;
        if (e.shiftKey) deg = Math.round(deg / 15) * 15;
        drag.a.rotationDeg = +deg.toFixed(1);
      } else if (drag.m === 'resize') {
        if (!drag.pushed) { pushUndo('Resize Asset'); drag.pushed = true; }
        var ux = Math.cos(drag.rad), uy = Math.sin(drag.rad), vx = -Math.sin(drag.rad), vy = Math.cos(drag.rad);
        var ddx = ip.x - drag.anchor.x, ddy = ip.y - drag.anchor.y;
        var nw = Math.max(8, (ddx * ux + ddy * uy) * drag.sx), nh = Math.max(8, (ddx * vx + ddy * vy) * drag.sy);
        if (drag.a.lockAspect || e.shiftKey) { var asp = drag.origW / Math.max(1, drag.origH); if (nw / drag.origW >= nh / drag.origH) nh = nw / asp; else nw = nh * asp; }
        drag.a.x = +(drag.anchor.x + (drag.sx * nw / 2) * ux + (drag.sy * nh / 2) * vx).toFixed(2);
        drag.a.y = +(drag.anchor.y + (drag.sx * nw / 2) * uy + (drag.sy * nh / 2) * vy).toFixed(2);
        drag.a.wPx = +nw.toFixed(2); drag.a.hPx = +nh.toFixed(2);
      } else if (drag.m === 'clone') {
        if (Math.hypot(ip.x - drag.lastDst.x, ip.y - drag.lastDst.y) >= Math.max(4, cloneCfg.radius * 0.35)) {
          var sx = cloneCfg.followDrag ? (drag.startSrc.x + (ip.x - drag.startDst.x)) : drag.startSrc.x;
          var sy = cloneCfg.followDrag ? (drag.startSrc.y + (ip.y - drag.startDst.y)) : drag.startSrc.y;
          var ptc = { id: uid('ptc'), sx: +sx.toFixed(2), sy: +sy.toFixed(2), dx: +ip.x.toFixed(2), dy: +ip.y.toFixed(2), r: cloneCfg.radius, feather: cloneCfg.feather, opacity: cloneCfg.opacity, rotDeg: cloneCfg.rotDeg };
          doc.patches.push(ptc); incrementalStampPatch(ptc); drag.lastDst = ip;
        }
      } else if (drag.m === 'erase') {
        if (Math.hypot(ip.x - drag.last.x, ip.y - drag.last.y) >= Math.max(3, eraseCfg.radius * 0.22)) {
          var nxt = { x: +ip.x.toFixed(2), y: +ip.y.toFixed(2) }; drag.stroke.pts.push(nxt); incrementalErase(drag.last, nxt, drag.stroke, false); drag.last = nxt;
        }
      } else if (drag.m === 'moveGcp') {
        if (!drag.pushed) { pushUndo('Move GCP'); drag.pushed = true; }
        doc.geoterra.gcps[drag.idx].x = +clamp(ip.x, 0, dims.w).toFixed(2);
        doc.geoterra.gcps[drag.idx].y = +clamp(ip.y, 0, dims.h).toFixed(2);
        recomputeGeoref(true);
      } else if (drag.m === 'moveGtBound') {
        if (!drag.pushed) { pushUndo('Move Boundary Vertex'); drag.pushed = true; }
        doc.geoterra.boundary[drag.idx] = { x: +clamp(ip.x, 0, dims.w).toFixed(2), y: +clamp(ip.y, 0, dims.h).toFixed(2) };
      } else if (drag.m === 'moveGtVert') {
        if (!drag.pushed) { pushUndo('Move GeoTerra Vertex'); drag.pushed = true; }
        doc.geoterra.features[drag.fi].points[drag.vi] = { x: +clamp(ip.x, 0, dims.w).toFixed(2), y: +clamp(ip.y, 0, dims.h).toFixed(2) };
      }
      draw();
    });

    function up(e) {
      delete ptrs[e.pointerId];
      if (drag && drag.m === 'crop_base') { var a1 = drag.p1, a2 = drag.p2; drag = null; if (Math.hypot(a2.x - a1.x, a2.y - a1.y) >= 12) applyCropBaseRect(a1, a2); draw(); return; }
      if (drag && drag.m === 'futsal_rect') { var f1 = drag.p1, f2 = drag.p2; drag = null; if (Math.hypot(f2.x - f1.x, f2.y - f1.y) >= 6) createFutsalFromRect(f1, f2); draw(); return; }
      if (drag && drag.m === 'gis_circle') {
        var cc = drag.c, ed = drag.edge; drag = null;
        var rPx = Math.hypot(ed.x - cc.x, ed.y - cc.y);
        if (rPx >= 4 && S.SatArcGIS) {
          pushUndo('Draw GIS Circle');
          var poly = S.SatArcGIS.makeCirclePolygon(cc.x, cc.y, rPx, 48);
          var rM = doc.calibration.pxPerMeter > 0 ? (' (R ' + (rPx / doc.calibration.pxPerMeter).toFixed(1) + 'm)') : '';
          var cf = S.SatArcGIS.createFeature({ geom: 'polygon', category: doc.gis.activeCategory, name: 'Circle' + rM, points: poly });
          doc.gis.features.push(cf); doc.layers.gis.visible = true; clearAllSelections(); selGisIds = [cf.id]; persistToIDB(); syncUI();
        }
        draw(); return;
      }
      var didMutate = drag && (drag.pushed || drag.m === 'clone' || drag.m === 'erase' || drag.m === 'brush');
      if (!Object.keys(ptrs).length || (drag && drag.m === 'pinch')) drag = null;
      if (didMutate) { persistToIDB(); syncUI(); }
      draw();
    }
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = posOf(e), before = s2i(p.x, p.y);
      view.s = clamp(view.s * (e.deltaY < 0 ? 1.14 : 0.87), minScale(), 16);
      view.ox = p.x - before.x * view.s; view.oy = p.y - before.y * view.s; draw();
    }, { passive: false });
  }

  function onKeyDown(e) {
    if (!isOpen) return;
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === ' ') { space = true; e.preventDefault(); return; }
    if (e.key === 'Tab') { e.preventDefault(); if (wsCtrl) wsCtrl.toggleCleanMode(); return; }
    if (e.key === '[') { if (wsCtrl) wsCtrl.toggleLeft(); return; }
    if (e.key === ']') { if (wsCtrl) wsCtrl.toggleRight(); return; }
    if (e.key === 'Escape') {
      calibDraft = { p1: null, p2: null }; bearingDraft = { p1: null, p2: null };
      measPts = []; cutPts = []; gisDraftPts = []; gtDraftPts = [];
      cloneCfg.pickMode = false; driftFixPending = false; quickMoveArmed = false; quickVertsArmed = false;
      setTool('select'); return;
    }
    if (e.key === 'Enter') {
      if (tool === 'crop_asset' && cutPts.length >= 3) { e.preventDefault(); applyCropSelectedAsset(); return; }
      if (tool === 'lasso_erase' && cutPts.length >= 3) { e.preventDefault(); applyLassoEraseAsset(); return; }
      if (tool === 'cutout' && cutPts.length >= 3) { e.preventDefault(); extractCutoutFromBase(); return; }
      if ((tool === 'poly_draw' && gisDraftPts.length >= 3) || (tool === 'gis_line' && gisDraftPts.length >= 2) || (tool === 'gis_split' && gisDraftPts.length >= 2)) { e.preventDefault(); finalizeGisShape(); return; }
      if (tool === 'gt_survey' && gtDraftPts.length >= 3) { e.preventDefault(); openGeoTerraModalFor(gtDraftPts, 'polygon', -1); return; }
      if (tool === 'gt_boundary' && doc.geoterra.boundary.length >= 3) { e.preventDefault(); pushUndo('Close Boundary'); doc.geoterra.boundaryClosed = true; persistToIDB(); syncUI(); draw(); return; }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { var ct = getActiveSelectionTarget(); if (ct) { e.preventDefault(); cloneSelectedTarget(ct); } return; }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (cutPts.length) { e.preventDefault(); cutPts.pop(); syncUI(); draw(); return; }
      if (gisDraftPts.length) { e.preventDefault(); gisDraftPts.pop(); syncUI(); draw(); return; }
      if (gtDraftPts.length) { e.preventDefault(); gtDraftPts.pop(); syncUI(); draw(); return; }
      var dt = getActiveSelectionTarget();
      if (dt) { e.preventDefault(); deleteSelectedTarget(dt); return; }
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      var kMap = { v: 'select', h: 'pan', c: 'crop_asset', l: 'lasso_erase', w: 'wand', x: 'cutout', s: 'clone', e: 'erase', b: 'brush', i: 'eyedropper', p: 'poly_draw', m: 'measure' };
      var lk = e.key.toLowerCase();
      if (kMap[lk]) { setTool(kMap[lk]); return; }
      if (lk === '0') { fitView(); return; }
      if (lk === '1') { zoomNative100(); return; }
    }
  }
  function onKeyUp(e) { if (e.key === ' ') space = false; }

  // =========================================================================
  // 12. UNIFIED UI BUILD, MENU ROUTER & FULL ASSET INSPECTOR
  // =========================================================================
  function setTool(t) {
    tool = t;
    quickMoveArmed = false; quickVertsArmed = false;
    if (t !== 'measure') measPts = [];
    if (t !== 'cutout' && t !== 'crop_asset' && t !== 'lasso_erase') cutPts = [];
    if (t !== 'poly_draw' && t !== 'gis_line' && t !== 'gis_split') gisDraftPts = [];
    if (t !== 'gt_survey') gtDraftPts = [];
    if (t !== 'clone') cloneCfg.pickMode = false;
    if (t !== 'bearing_cal') bearingDraft = { p1: null, p2: null };
    if (railCtrl && typeof railCtrl.setActive === 'function') railCtrl.setActive(t);
    if (ov && S.SatThemeUI && typeof S.SatThemeUI.updateToolGuide === 'function') {
      S.SatThemeUI.updateToolGuide(ov.querySelector('#scToolGuide'), t, langOf('guide'));
    }
    if (cv) cv.style.cursor = t === 'pan' ? 'grab' : t === 'select' ? 'default' : 'crosshair';
    syncUI(); draw();
  }

  function syncUndoBtns() {
    if (!ov) return;
    if (bottomTabMode === 'hist' && wsCtrl && wsCtrl.state.bottomOpen) renderBottomDrawerContent();
  }

  function openBottomTab(tab) {
    bottomTabMode = tab;
    if (wsCtrl) {
      if (!wsCtrl.state.bottomOpen) wsCtrl.toggleBottom(tab);
      else { wsCtrl.state.bottomTab = tab; wsCtrl.applyState(); }
    }
    renderBottomDrawerContent();
  }

  function openLanguageSettings() {
    if (S.SatThemeUI && typeof S.SatThemeUI.openLangSettingsModal === 'function') {
      S.SatThemeUI.openLangSettingsModal(doc.langPrefs, function (newPrefs) {
        doc.langPrefs = safeNormLang(newPrefs);
        doc.lang = doc.langPrefs.panels;
        applyLanguagePrefsUI();
        persistToIDB();
        syncUI();
        draw();
      });
    } else {
      var nxt = langOf('menus') === 'en' ? 'ar' : 'en';
      doc.langPrefs = { menus: nxt, guide: nxt, panels: nxt };
      doc.lang = nxt;
      applyLanguagePrefsUI();
      persistToIDB(); syncUI(); draw();
    }
  }

  function handleMenuAction(act) {
    if (!act) return;
    if (act.indexOf('tool:') === 0) { setTool(act.slice(5)); return; }
    var fBase = ov.querySelector('#scFileBase'), fClean = ov.querySelector('#scFileCleanup'), fAsset = ov.querySelector('#scFileAsset');
    var fGis = ov.querySelector('#scFileGis'), fGt = ov.querySelector('#scFileGtJson');

    switch (act) {
      case 'import_base': fBase.value = ''; fBase.click(); break;
      case 'import_cleanup': fClean.value = ''; fClean.click(); break;
      case 'import_asset': fAsset.value = ''; fAsset.click(); break;
      case 'import_gis': fGis.value = ''; fGis.click(); break;
      case 'import_gt_json': fGt.value = ''; fGt.click(); break;
      case 'export_clean': if (S.SatExport) S.SatExport.exportMasterClean2D(buildExportPayload(), setStatus); break;
      case 'export_poster': if (S.SatExport) S.SatExport.exportPosterPNG(buildExportPayload(), doc.overlays, setStatus); break;
      case 'export_worldfile': exportWorldFilePackage(); break;
      case 'export_geojson': if (S.SatArcGIS) downloadTextFile(S.SatArcGIS.exportGeoJSON(doc.gis.features, georefModel, doc.calibration.pxPerMeter), 'aj_geocad_gis.geojson', 'application/geo+json'); break;
      case 'export_kml': if (S.SatArcGIS) downloadTextFile(S.SatArcGIS.exportKML(doc.gis.features, georefModel, doc.overlays.titleEn || 'AJ-GeoCAD'), 'aj_geocad_gis.kml', 'application/vnd.google-earth.kml+xml'); break;
      case 'export_gt_zip': if (S.SatGeoTerra) S.SatGeoTerra.exportAiZipPackage(buildGeoTerraOpts(), setStatus); break;
      case 'export_gt_refsheet':
        if (S.SatGeoTerra) S.SatGeoTerra.generateReferenceSheetCanvas(buildGeoTerraOpts()).then(function (scv) {
          if (scv) scv.toBlob(function (b) { if (b) S.SatGeoTerra.triggerDownloadBlob(b, 'geoterra_ai_reference_sheet.png'); }, 'image/png');
          else alert(langOf('panels') === 'ar' ? 'أضف معلماً واحداً على الأقل في GeoTerra أولاً.' : 'Add at least one GeoTerra feature first.');
        });
        break;
      case 'undo': doUndo(); break;
      case 'redo': doRedo(); break;
      case 'dup_sel': cloneSelectedTarget(getActiveSelectionTarget()); break;
      case 'del_sel': deleteSelectedTarget(getActiveSelectionTarget()); break;
      case 'auto_tone': autoMatchSoilTone(); break;
      case 'clear_patches': if (doc.patches.length) { pushUndo('Clear Patches'); doc.patches = []; cleanupDirty = true; persistToIDB(); syncUI(); draw(); } break;
      case 'clear_erases': if (doc.cleanupErases.length) { pushUndo('Clear Erases'); doc.cleanupErases = []; cleanupDirty = true; persistToIDB(); syncUI(); draw(); } break;
      case 'clear_sat': if (confirm('Clear ALL Sat Studio layers, GIS, GeoTerra & IndexedDB? (Language preferences stay saved)')) clearData(false); break;
      case 'fit': fitView(); break;
      case 'zoom_100': zoomNative100(); break;
      case 'toggle_left': if (wsCtrl) wsCtrl.toggleLeft(); break;
      case 'toggle_right': if (wsCtrl) wsCtrl.toggleRight(); break;
      case 'toggle_bottom_attr': bottomTabMode = 'attr'; if (wsCtrl) wsCtrl.toggleBottom('attr'); renderBottomDrawerContent(); break;
      case 'toggle_bottom_hist': bottomTabMode = 'hist'; if (wsCtrl) wsCtrl.toggleBottom('hist'); renderBottomDrawerContent(); break;
      case 'open_gcp_table': openBottomTab('gcp'); break;
      case 'toggle_swipe': if (wsCtrl) wsCtrl.toggleSwipe(); break;
      case 'toggle_clean': if (wsCtrl) wsCtrl.toggleCleanMode(); break;
      case 'toggle_grid': doc.gis.showGraticule = !doc.gis.showGraticule; persistToIDB(); draw(); break;
      case 'toggle_scalebar': doc.showScaleBar = !doc.showScaleBar; persistToIDB(); draw(); break;
      case 'toggle_theme': if (wsCtrl) wsCtrl.toggleTheme(); break;
      case 'open_lang_settings':
      case 'toggle_lang':
        openLanguageSettings();
        break;
      case 'toggle_fullscreen':
        if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
        else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
        break;
      case 'cycle_coord_sys':
        var order = ['dd', 'dms', 'utm', 'mercator'];
        doc.gis.coordSys = order[(order.indexOf(doc.gis.coordSys) + 1) % order.length];
        persistToIDB(); syncUI(); draw(); break;
      case 'gis_cogo': runCogoInput(); break;
      case 'gis_snap_toggle': doc.gis.snap.enabled = !doc.gis.snap.enabled; syncUI(); break;
      case 'gis_merge': runGisBooleanOp('union'); break;
      case 'gis_clip': runGisBooleanOp('difference'); break;
      case 'gis_range_rings': runRangeRingsDialog(); break;
      case 'gis_heatmap': doc.gis.showHeatmap = !doc.gis.showHeatmap; doc.layers.gis.visible = true; persistToIDB(); draw(); break;
      case 'gis_nearest': runNearestEvacMatrix(); break;
      case 'gis_spatial_query': runSpatialQueryPrompt(); break;
      case 'open_gt_panel':
        if (wsCtrl) wsCtrl.toggleRight(true);
        var gp = ov.querySelector('#scGtPanel');
        if (gp) gp.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      case 'gt_gps_toggle': toggleLiveGps(); break;
      case 'gt_gps_drift': driftFixPending = true; setStatus('DRIFT FIX: Click where you are standing on map.', false); break;
      case 'gt_gps_track':
        ensureGpsCompassEngines();
        if (gpsEngine) {
          if (gpsEngine.isRecordingTrack()) gpsEngine.stopTrack();
          else { if (!gpsEngine.isActive()) toggleLiveGps(); gpsEngine.startTrack(); }
        }
        break;
      case 'gt_compass_toggle': toggleLiveCompass(); break;
      case 'sync_cad_north':
        var offN = (St && St.project && St.project.meta && St.project.meta.trueNorthOffsetDeg) || 0;
        pushUndo('Sync CAD North'); doc.overlays.northDeg = +Number(offN).toFixed(1);
        persistToIDB(); syncUI(); draw(); break;
      case 'push_gis_to_cad': pushFeaturesToCad(false); break;
      case 'send_to_3d': pushFeaturesToCad(true); break;
      case 'back_to_cad': close(); break;
    }
  }

  function buildExportPayload() {
    return { doc: doc, baseImg: imgs.base, assetImgs: imgs.assets, siteName: (St && St.project && St.project.meta && St.project.meta.name) || 'Site', renderCleanupTo: renderCleanupLayerTo };
  }
  function buildGeoTerraOpts() {
    return { state: doc.geoterra, baseImg: imgs.base, georefModel: georefModel, pxPerMeter: doc.calibration.pxPerMeter, lang: langOf('panels') };
  }

  function renderLayersPanel() {
    var box = ov.querySelector('#scLayersBox');
    var ar = langOf('panels') === 'ar';
    var defs = [
      { k: 'base',     lbl: ar ? '01_خريطة الأساس' : '01_Base_Satellite',   tag: ar ? 'مقفل' : 'LOCKED', tc: 'lk' },
      { k: 'cleanup',  lbl: ar ? '02_تنظيف الأرضية' : '02_Ground_Cleanup',  tag: 'PHOTO',                tc: 'ok' },
      { k: 'assets',   lbl: ar ? '03_العناصر المضافة' : '03_Movable_Assets', tag: 'ASSETS',              tc: 'ok' },
      { k: 'gis',      lbl: ar ? '04_طبقات ArcGIS' : '04_ArcGIS_Vectors',   tag: 'ArcGIS',               tc: 'gis' },
      { k: 'geoterra', lbl: ar ? '05_مسح GeoTerra' : '05_GeoTerra_Survey',  tag: 'FIELD',                tc: 'gt' },
      { k: 'overlays', lbl: ar ? '06_دبابيس الطباعة' : '06_Print_Overlays', tag: 'PRINT',                tc: 'ok' }
    ];
    box.innerHTML = defs.map(function (d) {
      var vis = doc.layers[d.k] && doc.layers[d.k].visible !== false;
      return '<div class="satc-layer' + (vis ? '' : ' off') + '">' +
        '<button type="button" class="satc-eye" data-layeye="' + d.k + '" title="Toggle Visibility">' + (vis ? '👁' : '✕') + '</button>' +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + d.lbl + '</span>' +
        '<span class="satc-tag ' + d.tc + '">' + d.tag + '</span>' +
      '</div>';
    }).join('');
    [].forEach.call(box.querySelectorAll('[data-layeye]'), function (btn) {
      btn.onclick = function () {
        var k = btn.dataset.layeye; pushUndo('Toggle Layer ' + k);
        doc.layers[k].visible = !doc.layers[k].visible; persistToIDB(); syncUI(); draw();
      };
    });
  }

  function renderAssetInspector() {
    var box = ov.querySelector('#scAssetInsp'), a = getSelAsset();
    var ar = langOf('panels') === 'ar';
    if (!a) {
      box.innerHTML = '<div class="mut">' + (ar ? 'اختر عنصراً (أو اضغط ✨ تعديل من الأساس على أي مضلع) لتعديل دورانه وحجمه وظله ودمجه.' : 'Select an asset (or tap ✨ Lift & Edit on any polygon) to rotate, resize, flip shadow, soften & blend.') + '</div>';
      return;
    }
    var ppm = doc.calibration.pxPerMeter || 0;
    var fl = a.filters || { brightness: 100, contrast: 100, saturation: 100, warmth: 0, blurPx: 0, grain: 0 };
    var prHtml = (S.SatBlending && S.SatBlending.PRESETS)
      ? Object.keys(S.SatBlending.PRESETS).map(function (k) { return '<option value="' + k + '">' + esc(S.SatBlending.PRESETS[k].label) + '</option>'; }).join('')
      : '';
    box.innerHTML =
      '<label>' + (ar ? 'اسم العنصر' : 'Asset Name') + '<input type="text" id="saName" value="' + esc(a.name) + '"></label>' +
      (ppm > 0 ? '<div class="satc-grid2"><label>W (m)<input type="number" id="saWm" step="0.1" value="' + (a.wPx / ppm).toFixed(2) + '"></label><label>H (m)<input type="number" id="saHm" step="0.1" value="' + (a.hPx / ppm).toFixed(2) + '"></label></div>' : '') +
      '<div class="satc-grid2"><label>W (px)<input type="number" id="saWpx" step="1" value="' + Math.round(a.wPx) + '"></label><label>H (px)<input type="number" id="saHpx" step="1" value="' + Math.round(a.hPx) + '"></label></div>' +
      '<label class="ck"><input type="checkbox" id="saLockAsp"' + (a.lockAspect ? ' checked' : '') + '>' + (ar ? 'قفل التناسب (الحجم)' : 'Lock Aspect Ratio') + '</label>' +
      '<div class="satc-grid2"><label>' + (ar ? 'الدوران' : 'Rot') + ' (<span id="saRotV">' + Math.round(a.rotationDeg || 0) + '</span>°)<input type="range" id="saRot" min="0" max="359" step="0.5" value="' + (a.rotationDeg || 0) + '"></label><label>' + (ar ? 'الشفافية' : 'Op') + ' (<span id="saOpV">' + Math.round((a.opacity != null ? a.opacity : 1) * 100) + '</span>%)<input type="range" id="saOp" min="10" max="100" value="' + Math.round((a.opacity != null ? a.opacity : 1) * 100) + '"></label></div>' +
      '<div class="row"><button id="saRm90">-90°</button><button id="saRm15">-15°</button><button id="saRp15">+15°</button><button id="saRp90">+90°</button></div>' +
      '<div class="row"><button id="saFlipH">' + (ar ? 'قلب أفقي' : 'Flip H') + '</button><button id="saFlipV">' + (ar ? 'قلب عمودي' : 'Flip V') + '</button><button id="saLock">' + (a.locked ? (ar ? 'فتح القفل' : 'Unlock') : (ar ? 'قفل' : 'Lock')) + '</button></div>' +
      '<div class="row"><button id="saUp">' + (ar ? 'أعلى' : 'Up') + '</button><button id="saDn">' + (ar ? 'أسفل' : 'Down') + '</button><button id="saDup" class="cy">' + (ar ? 'نسخ' : 'Clone') + '</button></div>' +

      '<div class="satc-sec-h"><span>' + (ar ? 'انعكاس الظل والارتفاع' : 'Shadow Reflection & Height') + ' (' + Math.round(doc.sun.azimuthDeg || 0) + '°)</span></div>' +
      '<div class="satc-grid2"><label class="ck"><input type="checkbox" id="saShOn"' + (a.shadowEnabled !== false ? ' checked' : '') + '>' + (ar ? 'تفعيل الظل' : 'Shadow ON') + '</label><label>' + (ar ? 'الارتفاع (م)' : 'Elev (m)') + '<input type="number" id="saElev" step="0.2" value="' + (a.elevationM != null ? a.elevationM : 2.5) + '"></label></div>' +
      '<div class="row"><button id="saFlipSh" class="amb">⇄ ' + (ar ? 'عكس الظل 180°' : 'Flip Shadow 180°') + '</button><button id="saShM45">-45°</button><button id="saShP45">+45°</button></div>' +

      '<div class="satc-sec-h"><span>' + (ar ? 'التنعيم والدمج في الخلفية' : 'Edge Soften & Ground Blend') + '</span></div>' +
      '<div class="satc-grid2"><button id="saAutoTone" class="on">🎨 ' + (ar ? 'دمج لوني تلقائي' : 'Auto Blend Tone') + '</button><button id="saHealBg" class="cy">🧹 ' + (ar ? 'تنظيف الخلفية تحته' : 'Heal Ground') + '</button></div>' +
      '<label>' + (ar ? 'تنعيم الحواف' : 'Edge Feather') + ' (<span id="saSoftV">' + edgeSoftenPx + '</span>px)<input type="range" id="saSoftPx" min="1" max="12" step="1" value="' + edgeSoftenPx + '"></label>' +
      '<button id="saSoftenBtn" class="cy">✨ ' + (ar ? 'تطبيق تنعيم الحواف الآن' : 'Soften Asset Edges') + '</button>' +
      '<select id="saPreset"><option value="">' + (ar ? '-- نمط دمج السطح --' : '-- Surface Blend Preset --') + '</option>' + prHtml + '</select>' +
      '<label>' + (ar ? 'السطوع' : 'Bright') + ' (<span id="saBrV">' + fl.brightness + '</span>%)<input type="range" id="saBr" min="50" max="150" value="' + fl.brightness + '"></label>' +
      '<label>' + (ar ? 'التباين' : 'Contrast') + ' (<span id="saCtV">' + fl.contrast + '</span>%)<input type="range" id="saCt" min="50" max="150" value="' + fl.contrast + '"></label>' +
      '<label>' + (ar ? 'التشبع' : 'Sat') + ' (<span id="saSaV">' + fl.saturation + '</span>%)<input type="range" id="saSa" min="0" max="200" value="' + fl.saturation + '"></label>' +
      '<label>' + (ar ? 'الدفء اللوني' : 'Warmth') + ' (<span id="saWmV">' + (fl.warmth || 0) + '</span>)<input type="range" id="saWm" min="-50" max="50" value="' + (fl.warmth || 0) + '"></label>' +
      '<label>' + (ar ? 'تنعيم العدسة (Blur)' : 'Blur') + ' (<span id="saBlV">' + (fl.blurPx || 0) + '</span>px)<input type="range" id="saBl" min="0" max="2.5" step="0.1" value="' + (fl.blurPx || 0) + '"></label>' +
      '<label>' + (ar ? 'تحبب فضائي (Grain)' : 'Sat Grain') + ' (<span id="saGrV">' + (fl.grain || 0) + '</span>)<input type="range" id="saGr" min="0" max="30" step="1" value="' + (fl.grain || 0) + '"></label>' +
      '<button id="saDel" class="dng">' + (ar ? 'حذف العنصر' : 'Delete Asset') + '</button>';

    box.querySelector('#saName').onchange = function () { pushUndo('Rename Asset'); a.name = this.value.trim() || 'Asset'; persistToIDB(); syncUI(); draw(); };
    box.querySelector('#saLockAsp').onchange = function () { a.lockAspect = !!this.checked; persistToIDB(); };
    function setD(nw, nh, ax) {
      if (!(nw > 4) || !(nh > 4)) return; pushUndo('Resize Asset');
      var asp = a.naturalW / Math.max(1, a.naturalH);
      if (a.lockAspect) { if (ax === 'w') nh = nw / asp; else nw = nh * asp; }
      a.wPx = +nw.toFixed(2); a.hPx = +nh.toFixed(2); persistToIDB(); syncUI(); draw();
    }
    if (ppm > 0) {
      box.querySelector('#saWm').onchange = function () { setD((parseFloat(this.value) || 1) * ppm, a.hPx, 'w'); };
      box.querySelector('#saHm').onchange = function () { setD(a.wPx, (parseFloat(this.value) || 1) * ppm, 'h'); };
    }
    box.querySelector('#saWpx').onchange = function () { setD(parseFloat(this.value) || 8, a.hPx, 'w'); };
    box.querySelector('#saHpx').onchange = function () { setD(a.wPx, parseFloat(this.value) || 8, 'h'); };
    box.querySelector('#saRot').oninput = function () { a.rotationDeg = +this.value; box.querySelector('#saRotV').textContent = Math.round(a.rotationDeg); draw(); };
    box.querySelector('#saRot').onchange = function () { persistToIDB(); };
    box.querySelector('#saRm90').onclick = function () { nudgeAssetRotation(a, -90); };
    box.querySelector('#saRm15').onclick = function () { nudgeAssetRotation(a, -15); };
    box.querySelector('#saRp15').onclick = function () { nudgeAssetRotation(a, 15); };
    box.querySelector('#saRp90').onclick = function () { nudgeAssetRotation(a, 90); };
    box.querySelector('#saOp').oninput = function () { a.opacity = (+this.value) / 100; box.querySelector('#saOpV').textContent = this.value; draw(); };
    box.querySelector('#saOp').onchange = function () { persistToIDB(); };
    box.querySelector('#saFlipH').onclick = function () { pushUndo('Flip H'); a.flipX = !a.flipX; persistToIDB(); draw(); };
    box.querySelector('#saFlipV').onclick = function () { pushUndo('Flip V'); a.flipY = !a.flipY; persistToIDB(); draw(); };
    box.querySelector('#saLock').onclick = function () { a.locked = !a.locked; persistToIDB(); syncUI(); draw(); };
    box.querySelector('#saUp').onclick = function () { reorderSelectedAsset(1); };
    box.querySelector('#saDn').onclick = function () { reorderSelectedAsset(-1); };
    box.querySelector('#saDup').onclick = duplicateSelectedAsset;

    box.querySelector('#saFlipSh').onclick = function () { nudgeSunAzimuth(180, 'Flip Shadow 180°'); };
    box.querySelector('#saShM45').onclick = function () { nudgeSunAzimuth(-45, 'Rotate Shadow -45°'); };
    box.querySelector('#saShP45').onclick = function () { nudgeSunAzimuth(45, 'Rotate Shadow +45°'); };
    box.querySelector('#saAutoTone').onclick = autoMatchSoilTone;
    box.querySelector('#saHealBg').onclick = healUnderSelectedAsset;
    box.querySelector('#saSoftPx').oninput = function () { edgeSoftenPx = +this.value; box.querySelector('#saSoftV').textContent = this.value; };
    box.querySelector('#saSoftenBtn').onclick = function () { softenAssetEdges(a, edgeSoftenPx); };
    box.querySelector('#saDel').onclick = deleteSelectedAsset;

    box.querySelector('#saPreset').onchange = function () {
      var pr = S.SatBlending && S.SatBlending.PRESETS[this.value]; this.value = ''; if (!pr) return;
      pushUndo('Apply Blend Preset');
      if (pr.elevationM !== null) a.elevationM = pr.elevationM;
      if (pr.shadowEnabled !== null) a.shadowEnabled = pr.shadowEnabled;
      a.filters = Object.assign({}, pr.filters); persistToIDB(); syncUI(); draw();
    };
    box.querySelector('#saShOn').onchange = function () { a.shadowEnabled = !!this.checked; persistToIDB(); draw(); };
    box.querySelector('#saElev').onchange = function () { a.elevationM = Math.max(0, parseFloat(this.value) || 0); persistToIDB(); draw(); };
    function bF(id, vid, k, flt) {
      var el = box.querySelector(id);
      el.oninput = function () { a.filters[k] = flt ? parseFloat(this.value) : (+this.value); box.querySelector(vid).textContent = this.value; draw(); };
      el.onchange = function () { persistToIDB(); };
    }
    bF('#saBr', '#saBrV', 'brightness', false); bF('#saCt', '#saCtV', 'contrast', false);
    bF('#saSa', '#saSaV', 'saturation', false); bF('#saWm', '#saWmV', 'warmth', false);
    bF('#saBl', '#saBlV', 'blurPx', true); bF('#saGr', '#saGrV', 'grain', false);
  }

  function renderBottomDrawerContent() {
    if (!ov) return;
    var body = ov.querySelector('#scBotBody');
    var ar = langOf('panels') === 'ar';
    [].forEach.call(ov.querySelectorAll('[data-btab]'), function (b) { b.classList.toggle('on', b.dataset.btab === bottomTabMode); });
    if (bottomTabMode === 'attr' && S.SatArcGIS) {
      S.SatArcGIS.renderAttributeTable(body, {
        features: doc.gis.features, pxPerMeter: doc.calibration.pxPerMeter,
        georefModel: georefModel, selectedIds: selGisIds,
        filterText: attrFilter.text, filterCat: attrFilter.cat,
        callbacks: {
          onFilter: function (txt, cat) { attrFilter.text = txt; attrFilter.cat = cat; renderBottomDrawerContent(); },
          onSelect: function (id, multi) {
            if (multi) { var i = selGisIds.indexOf(id); if (i >= 0) selGisIds.splice(i, 1); else selGisIds.push(id); }
            else { clearAllSelections(); selGisIds = [id]; }
            renderBottomDrawerContent(); draw();
          },
          onToggleVis: function (id, vis) { var f = getGisById(id); if (f) { f.visible = vis; persistToIDB(); draw(); } },
          onZoom: function (id) { var f = getGisById(id); if (f) { var st = S.SatArcGIS.polyStats(f.points, doc.calibration.pxPerMeter); panToImgPt(st.cx, st.cy); draw(); } },
          onEdit: function (id) {
            var f = getGisById(id); if (!f) return;
            var nm = prompt(ar ? 'اسم المعلم:' : 'Feature Name:', f.name || ''); if (nm !== null) f.name = nm.trim() || f.name;
            var nt = prompt(ar ? 'ملاحظات:' : 'Notes:', f.notes || ''); if (nt !== null) f.notes = nt.trim();
            persistToIDB(); renderBottomDrawerContent(); draw();
          },
          onDelete: function (id) { pushUndo('Delete GIS Feature'); doc.gis.features = doc.gis.features.filter(function (f) { return f.id !== id; }); selGisIds = selGisIds.filter(function (x) { return x !== id; }); persistToIDB(); renderBottomDrawerContent(); draw(); },
          onExportCSV: function () { downloadTextFile(S.SatArcGIS.exportCSV(doc.gis.features, georefModel, doc.calibration.pxPerMeter), 'aj_geocad_attributes.csv', 'text/csv;charset=utf-8'); },
          onExportGeoJSON: function () { handleMenuAction('export_geojson'); },
          onExportKML: function () { handleMenuAction('export_kml'); }
        }
      });
    } else if (bottomTabMode === 'gcp' && S.SatGeorefGPS) {
      S.SatGeorefGPS.renderGcpLinkTable(body, {
        gcps: doc.geoterra.gcps, model: georefModel, modelType: doc.geoterra.georefModelType,
        callbacks: {
          onModelChange: function (mt) { doc.geoterra.georefModelType = mt; recomputeGeoref(true); persistToIDB(); syncUI(); draw(); },
          onToggle: function (idx, en) { doc.geoterra.gcps[idx].enabled = en; recomputeGeoref(true); persistToIDB(); syncUI(); draw(); },
          onZoom: function (idx) { var g = doc.geoterra.gcps[idx]; if (g) { panToImgPt(g.x, g.y); draw(); } },
          onDelete: function (idx) { pushUndo('Delete GCP'); doc.geoterra.gcps.splice(idx, 1); recomputeGeoref(true); persistToIDB(); syncUI(); draw(); },
          onExportWorldFile: exportWorldFilePackage,
          onExportKmlOverlay: function () {
            var d = getBaseDims();
            var kml = S.SatGeorefGPS.buildKmlGroundOverlay(georefModel, d.w, d.h, 'Master_Clean_2D.png', doc.overlays.titleEn || 'AJ-GeoCAD');
            if (kml) downloadTextFile(kml, 'AJ_GeoCAD_Overlay.kml', 'application/vnd.google-earth.kml+xml');
          }
        }
      });
    } else {
      body.innerHTML = undoStack.length
        ? '<div class="satc-alist" style="max-height:100%">' + undoStack.slice().reverse().map(function (it, ri) {
            var idx = undoStack.length - 1 - ri;
            var lbl = typeof it === 'string' ? ('State #' + (idx + 1)) : (it.label + ' (' + it.ts + ')');
            return '<div class="satc-ait" data-hist="' + idx + '"><span>' + esc(lbl) + '</span><span class="satc-tag">' + (ar ? 'استعادة' : 'Restore') + '</span></div>';
          }).join('') + '</div>'
        : '<div class="mut">' + (ar ? 'لا توجد تعديلات محفوظة بعد.' : 'No history entries yet.') + '</div>';
      [].forEach.call(body.querySelectorAll('[data-hist]'), function (el) { el.onclick = function () { jumpToHistoryIndex(+el.dataset.hist); }; });
    }
  }

  function syncUI() {
    if (!ov) return;
    var ar = langOf('panels') === 'ar';
    setIdbBadge(idbStatus);
    renderLayersPanel();

    var bi = ov.querySelector('#scBaseInfo');
    if (imgs.base && doc.base.width) {
      bi.innerHTML = '<b>' + esc(doc.base.name || 'Satellite') + '</b><div>' + doc.base.width + '×' + doc.base.height + ' px (' + ((doc.base.width * doc.base.height) / 1e6).toFixed(2) + ' MP)</div>';
    } else {
      bi.innerHTML = '<span class="mut">' + (ar ? 'لم يتم تحميل خريطة أساس بعد.' : 'No base satellite image loaded yet.') + '</span>';
    }

    var bldBox = ov.querySelector('#scBuildBox');
    var activePts = (tool === 'cutout' || tool === 'crop_asset' || tool === 'lasso_erase') ? cutPts : ((tool === 'poly_draw' || tool === 'gis_line' || tool === 'gis_split') ? gisDraftPts : (tool === 'gt_survey' ? gtDraftPts : []));
    bldBox.style.display = (tool === 'cutout' || tool === 'crop_asset' || tool === 'lasso_erase' || tool === 'poly_draw' || tool === 'gis_line' || tool === 'gis_split' || tool === 'gt_survey') ? 'flex' : 'none';
    ov.querySelector('#scBuildPtsV').textContent = String(activePts.length);
    var healRow = ov.querySelector('#scAutoHealRow');
    if (healRow) healRow.style.display = tool === 'cutout' ? 'flex' : 'none';
    var healChk = ov.querySelector('#scAutoHealChk');
    if (healChk) healChk.checked = !!autoHealOnLift;

    if (ov.querySelector('#scGisCat')) ov.querySelector('#scGisCat').value = doc.gis.activeCategory || 'building';
    if (ov.querySelector('#scSnapOn')) ov.querySelector('#scSnapOn').checked = !!(doc.gis.snap && doc.gis.snap.enabled);

    var al = ov.querySelector('#scAssetList');
    al.innerHTML = doc.assets.length ? doc.assets.slice().reverse().map(function (a) {
      return '<div class="satc-ait' + (a.id === selAssetId ? ' sel' : '') + '" data-aid="' + esc(a.id) + '"><input type="checkbox" data-avis="' + esc(a.id) + '"' + (a.visible ? ' checked' : '') + '><span>' + esc(a.name) + '</span></div>';
    }).join('') : '<div class="mut">' + (ar ? 'لا توجد عناصر مضافة بعد.' : 'No assets added yet.') + '</div>';
    [].forEach.call(al.querySelectorAll('[data-aid]'), function (el) {
      el.onclick = function (ev) { if (ev.target.dataset && ev.target.dataset.avis) return; clearAllSelections(); selAssetId = el.dataset.aid; syncUI(); draw(); };
    });
    [].forEach.call(al.querySelectorAll('[data-avis]'), function (cb) {
      cb.onchange = function () { for (var i = 0; i < doc.assets.length; i++) if (doc.assets[i].id === cb.dataset.avis) { doc.assets[i].visible = !!cb.checked; persistToIDB(); draw(); break; } };
    });

    renderAssetInspector();

    // Sync Global Sun Sliders with doc.sun (e.g. after Flip Shadow 180°)
    var sunAzEl = ov.querySelector('#scSunAz');
    if (sunAzEl && document.activeElement !== sunAzEl) { sunAzEl.value = Math.round(doc.sun.azimuthDeg || 0); ov.querySelector('#scSunAzV').textContent = String(Math.round(doc.sun.azimuthDeg || 0)); }
    var sunLenEl = ov.querySelector('#scSunLen');
    if (sunLenEl && document.activeElement !== sunLenEl) { sunLenEl.value = doc.sun.lengthFactor != null ? doc.sun.lengthFactor : 0.75; ov.querySelector('#scSunLenV').textContent = String(sunLenEl.value); }
    var sunOpEl = ov.querySelector('#scSunOp');
    if (sunOpEl && document.activeElement !== sunOpEl) { var opPct = Math.round((doc.sun.opacity != null ? doc.sun.opacity : 0.38) * 100); sunOpEl.value = opPct; ov.querySelector('#scSunOpV').textContent = String(opPct); }
    var sunBlEl = ov.querySelector('#scSunBl');
    if (sunBlEl && document.activeElement !== sunBlEl) { sunBlEl.value = doc.sun.blurPx != null ? doc.sun.blurPx : 4; ov.querySelector('#scSunBlV').textContent = String(sunBlEl.value); }

    var p1 = calibDraft.p1 || doc.calibration.p1, p2 = calibDraft.p2 || doc.calibration.p2;
    ov.querySelector('#scCalStat').textContent = doc.calibration.pxPerMeter > 0 ? (doc.calibration.pxPerMeter.toFixed(3) + ' px/m') : (ar ? 'غير معاير' : 'Uncalibrated');
    ov.querySelector('#scCalPx').textContent = (p1 && p2) ? (Math.hypot(p2.x - p1.x, p2.y - p1.y).toFixed(1) + ' px') : (ar ? 'غير محدد' : 'Not picked');
    if (document.activeElement !== ov.querySelector('#scNorthDeg')) ov.querySelector('#scNorthDeg').value = doc.overlays.northDeg || 0;

    if (S.SatGeoTerra) {
      S.SatGeoTerra.renderGeoTerraPanel(ov.querySelector('#scGtPanel'), {
        state: doc.geoterra, lang: langOf('panels'), georefModel: georefModel, gpsStatus: gpsStatusTxt,
        callbacks: {
          onTool: setTool,
          onCloseBoundary: function () { pushUndo('Close Boundary'); doc.geoterra.boundaryClosed = true; persistToIDB(); syncUI(); draw(); },
          onMutate: function () { persistToIDB(); syncUI(); draw(); },
          onOpenGcpTable: function () { openBottomTab('gcp'); },
          onToggleGps: toggleLiveGps,
          onDriftFix: function () { handleMenuAction('gt_gps_drift'); },
          onExportZip: function () { handleMenuAction('export_gt_zip'); },
          onExportRefSheet: function () { handleMenuAction('export_gt_refsheet'); },
          onExportJson: function () {
            var payload = S.SatGeoTerra.buildProjectPayload(Object.assign(buildGeoTerraOpts(), { includeBase64Photos: true }));
            downloadTextFile(JSON.stringify(payload, null, 2), 'geoterra_survey_v7.json', 'application/json');
          },
          onPushToArcGIS: function () {
            var added = S.SatGeoTerra.convertToArcGISFeatures(doc.geoterra);
            if (!added.length) { alert(ar ? 'لا توجد معالم GeoTerra للنقل.' : 'No GeoTerra features to push.'); return; }
            pushUndo('Push GeoTerra to ArcGIS'); added.forEach(function (f) { doc.gis.features.push(f); });
            doc.layers.gis.visible = true; persistToIDB(); syncUI(); draw();
            setStatus('Pushed ' + added.length + ' GeoTerra item(s) to ArcGIS layer.', false);
          },
          onFocusFeature: function (idx) {
            var f = doc.geoterra.features[idx]; if (!f) return;
            clearAllSelections(); selGtIdx = idx;
            var ctr = S.SatGeoTerra.polyAreaCentroidXY(f.points); panToImgPt(ctr.cx, ctr.cy); syncUI(); draw();
          },
          onEditFeature: function (idx) { var f = doc.geoterra.features[idx]; if (f) openGeoTerraModalFor(f.points, f.geometry, idx); },
          onDeleteFeature: function (idx) {
            if (!confirm(ar ? 'حذف معلم GeoTerra؟' : 'Delete GeoTerra feature?')) return;
            pushUndo('Delete GeoTerra Feature'); doc.geoterra.features.splice(idx, 1);
            if (selGtIdx === idx) selGtIdx = -1;
            persistToIDB(); syncUI(); draw();
          }
        }
      });
    }

    if (S.SatExport) {
      var d = getBaseDims();
      var est = S.SatExport.estimateExport(doc.overlays, d.w, d.h);
      ov.querySelector('#scRamEst').textContent = est.pw + '×' + est.ph + 'px (~' + Math.round(est.estPeakMB) + 'MB RAM)';
      ov.querySelector('#scExpPoster').disabled = (est.level === 'block');
    }

    ov.querySelector('#scFootCoord').textContent = 'CRS: ' + doc.gis.coordSys.toUpperCase();
    if (wsCtrl && wsCtrl.state.bottomOpen) renderBottomDrawerContent();
    updateLiveHudChips();
  }

  function resize() {
    if (!cv) return;
    var r = cv.parentNode.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); draw();
  }

  function build() {
    if (S.SatThemeUI && typeof S.SatThemeUI.ensureCss === 'function') S.SatThemeUI.ensureCss();
    ensureQuickPopCss();
    ov = document.createElement('div');
    ov.className = 'satc-pro hide';
    ov.dataset.ajDone = '1';

    var gisCatOpts = (S.SatArcGIS && S.SatArcGIS.CATEGORIES)
      ? Object.keys(S.SatArcGIS.CATEGORIES).map(function (k) {
          return '<option value="' + k + '">' + esc(S.SatArcGIS.CATEGORIES[k].label + ' / ' + S.SatArcGIS.CATEGORIES[k].ar) + '</option>';
        }).join('')
      : '<option value="building">Building</option>';

    ov.innerHTML =
      '<div class="satc-menubar" id="scMenuBar"></div>' +
      '<div class="satc-work">' +
        '<aside class="satc-left">' +
          '<div class="satc-rail" id="scIconRail"></div>' +
          '<div class="satc-lsub">' +
            '<div class="satc-guide" id="scToolGuide"></div>' +
            '<div id="scBuildBox" class="satc-card" style="display:none;border-color:var(--sc-cyan)">' +
              '<b><span data-i18n="active_poly">Active Polygon / Line</span> (<span id="scBuildPtsV">0</span> pts)</b>' +
              '<label><span data-i18n="edge_feather">Edge Feather</span> (<span id="scCutFeaV">3</span>px)<input type="range" id="scCutFea" min="0" max="10" step="0.5" value="3"></label>' +
              '<label id="scAutoHealRow" class="ck" style="display:none"><input type="checkbox" id="scAutoHealChk" checked><span>Auto-Heal Ground Underneath</span></label>' +
              '<div class="satc-grid2"><button id="scBuildExec" class="on" data-i18n="btn_apply">Apply / Finish</button><button id="scBuildUndo" data-i18n="btn_undo_pt">Undo Pt</button></div>' +
              '<button id="scBuildCan" class="dng" data-i18n="btn_cancel">Cancel</button>' +
            '</div>' +
            '<div class="satc-card">' +
              '<b data-i18n="photo_tools_h">Photo Brush, Clone &amp; Wand</b>' +
              '<div class="satc-grid2">' +
                '<label><span data-i18n="lbl_color">Color</span><input type="color" id="scPhotoCol" value="#c5a267"></label>' +
                '<label><span data-i18n="lbl_wand_tol">Wand Tol</span> (<span id="scPhotoTolV">28</span>)<input type="range" id="scPhotoTol" min="5" max="140" value="28"></label>' +
              '</div>' +
              '<label class="ck"><input type="checkbox" id="scPhotoCont" checked><span data-i18n="lbl_contig">Contiguous Wand</span></label>' +
              '<label><span data-i18n="lbl_radius">Radius</span> (<span id="scRadV">28</span>px)<input type="range" id="scRad" min="4" max="180" value="28"></label>' +
              '<label><span data-i18n="lbl_feather">Feather</span> (<span id="scFeaV">65</span>%)<input type="range" id="scFea" min="5" max="100" value="65"></label>' +
              '<div class="satc-grid2"><button id="scPickSrc" class="cy" data-i18n="btn_pick_src">Pick Clone Src</button><button id="scAddPngBtn" class="on" data-i18n="btn_add_png">+ PNG Asset</button></div>' +
            '</div>' +
            '<div class="satc-card">' +
              '<b data-i18n="arcgis_dig_h">ArcGIS Digitizing</b>' +
              '<label><span data-i18n="lbl_category">Category</span><select id="scGisCat">' + gisCatOpts + '</select></label>' +
              '<label class="ck"><input type="checkbox" id="scSnapOn" checked><span data-i18n="lbl_snapping">Snapping (Vertex/Mid/Edge)</span></label>' +
              '<div class="satc-grid2"><button id="scCogoBtn" class="cy" data-i18n="btn_cogo">COGO Dist+Brg</button><button id="scAttrBtn" data-i18n="btn_attr_tbl">Attribute Table</button></div>' +
            '</div>' +
          '</div>' +
        '</aside>' +

        '<div class="satc-center">' +
          '<div class="satc-cvwrap">' +
            '<canvas id="scCv"></canvas>' +
            '<div id="scQuickPop" class="satc-qpop" data-aj-done="1"></div>' +
            '<button type="button" class="satc-edge-btn l" title="Hide/Show Left Tools">◀</button>' +
            '<button type="button" class="satc-edge-btn r" title="Hide/Show Right Layers">▶</button>' +
            '<div class="satc-swipe"><div class="satc-swipe-knob">⇄</div></div>' +
            '<div class="satc-cleanbar">' +
              '<button type="button" class="satc-qbtn on" id="scExitClean" data-i18n="btn_show_panels">Show Panels</button>' +
              '<button type="button" class="satc-qbtn" id="scCleanGps" data-i18n="btn_drop_gps">🛰 Drop GPS</button>' +
              '<button type="button" class="satc-qbtn" id="scCleanUndo" data-i18n="btn_undo">↩ Undo</button>' +
            '</div>' +
          '</div>' +
          '<div class="satc-bottom">' +
            '<div class="satc-btabs">' +
              '<button type="button" class="satc-btab on" data-btab="attr" data-i18n="tab_attr">ArcGIS Attribute Table</button>' +
              '<button type="button" class="satc-btab" data-btab="gcp" data-i18n="tab_gcp">GCP Georef Link Table</button>' +
              '<button type="button" class="satc-btab" data-btab="hist" data-i18n="tab_hist">History</button>' +
              '<span style="flex:1"></span>' +
              '<button type="button" class="satc-qbtn dng" id="scBotClose">×</button>' +
            '</div>' +
            '<div class="satc-bbody" id="scBotBody"></div>' +
          '</div>' +
        '</div>' +

        '<aside class="satc-right">' +
          '<div class="satc-sec-h"><span data-i18n="sec_layers">Layers (Independent Visibility)</span></div>' +
          '<div id="scLayersBox" style="display:flex;flex-direction:column;gap:4px"></div>' +
          '<div id="scBaseInfo" class="satc-card"></div>' +

          '<div class="satc-sec-h"><span data-i18n="sec_scale">Scale Bar &amp; True North</span></div>' +
          '<div class="satc-card">' +
            '<div><span data-i18n="lbl_scale">Scale:</span> <b id="scCalStat">Uncalibrated</b> | <span data-i18n="lbl_line">Line:</span> <b id="scCalPx">Not picked</b></div>' +
            '<div class="satc-grid2">' +
              '<label><span data-i18n="lbl_known_m">Known (m)</span><input type="number" id="scCalM" step="0.1" value="10"></label>' +
              '<label><span data-i18n="lbl_north_deg">North (°)</span><input type="number" id="scNorthDeg" step="0.5" value="0"></label>' +
            '</div>' +
            '<div class="satc-grid2"><button id="scPickCal" class="cy" data-i18n="btn_pick_scale">Pick 2-Pt Scale</button><button id="scApplyCal" class="on" data-i18n="btn_apply_scale">Apply Scale</button></div>' +
            '<div class="satc-grid2"><button id="scPickBrg" class="amb" data-i18n="btn_cal_north">Calibrate North</button><button id="scResetCal" class="dng" data-i18n="btn_clear_scale">Clear Scale</button></div>' +
          '</div>' +

          '<div class="satc-sec-h"><span data-i18n="sec_assets">03_Movable_Assets &amp; Inspector</span></div>' +
          '<div id="scAssetList" class="satc-alist"></div>' +
          '<div id="scAssetInsp" class="satc-card"></div>' +

          '<div class="satc-sec-h"><span data-i18n="sec_sun">Global Sun Shadow</span></div>' +
          '<div class="satc-card">' +
            '<div class="satc-grid2">' +
              '<label><span data-i18n="lbl_az">Az</span> (<span id="scSunAzV">135</span>°)<input type="range" id="scSunAz" min="0" max="359" value="135"></label>' +
              '<label><span data-i18n="lbl_len">Len</span> (<span id="scSunLenV">0.75</span>x)<input type="range" id="scSunLen" min="0" max="2.5" step="0.05" value="0.75"></label>' +
            '</div>' +
            '<div class="satc-grid2">' +
              '<label><span data-i18n="lbl_op">Op</span> (<span id="scSunOpV">38</span>%)<input type="range" id="scSunOp" min="0" max="85" value="38"></label>' +
              '<label><span data-i18n="lbl_blur">Blur</span> (<span id="scSunBlV">4</span>px)<input type="range" id="scSunBl" min="0" max="16" step="0.5" value="4"></label>' +
            '</div>' +
          '</div>' +

          '<div class="satc-sec-h"><span data-i18n="sec_geoterra">GeoTerra Field Survey</span></div>' +
          '<button type="button" id="scImpGtDirect" class="satc-qbtn amb" style="width:100%" data-i18n="btn_imp_gt">⬆ Import GeoTerra Session (.json / .zip)</button>' +
          '<div id="scGtPanel"></div>' +

          '<div class="satc-sec-h"><span data-i18n="sec_export">Print Poster &amp; Dual Export</span></div>' +
          '<div class="satc-card">' +
            '<label><span data-i18n="lbl_tit_en">Poster Title EN</span><input type="text" id="scTitEn" placeholder="Site Updated Map"></label>' +
            '<label><span data-i18n="lbl_tit_ar">Poster Title AR</span><input type="text" id="scTitAr" dir="rtl" placeholder="خريطة الموقع المحدّثة"></label>' +
            '<div class="satc-grid2">' +
              '<label><span data-i18n="lbl_paper">Paper</span><select id="scPaper"></select></label>' +
              '<label><span data-i18n="lbl_dpi">DPI</span><select id="scDpi"><option value="150">150</option><option value="200" selected>200</option><option value="300">300</option></select></label>' +
            '</div>' +
            '<div id="scRamEst" style="font-size:10px;color:var(--sc-mut)"></div>' +
            '<div class="satc-grid2"><button id="scExpClean" class="on" data-i18n="btn_exp_clean">1. Clean 2D PNG</button><button id="scExpPoster" class="amb" data-i18n="btn_exp_poster">2. Poster PNG</button></div>' +
            '<div class="satc-grid2"><button id="scPushCad" class="cy" data-i18n="btn_push_cad">Push ➔ 2D CAD</button><button id="scSend3D" class="on" data-i18n="btn_open_3d">Open in 3D GPU</button></div>' +
          '</div>' +
        '</aside>' +
      '</div>' +
      '<div class="satc-foot">' +
        '<span id="scStatus">' + esc(statusMsg) + '</span>' +
        '<span class="satc-fchip" id="scFootCoord">CRS: DD</span>' +
        '<span class="satc-fchip" id="scFootGps">GPS: OFF</span>' +
        '<span class="satc-fchip" id="scFootCmp">🧭 OFF</span>' +
        '<span id="scIdb">IDB: ' + esc(idbStatus) + '</span>' +
      '</div>' +
      '<input type="file" id="scFileBase" accept="image/*" hidden>' +
      '<input type="file" id="scFileCleanup" accept="image/*" hidden>' +
      '<input type="file" id="scFileAsset" accept="image/*" multiple hidden>' +
      '<input type="file" id="scFileGis" hidden>' +
      '<input type="file" id="scFileGtJson" hidden>';

    document.body.appendChild(ov);
    cv = ov.querySelector('#scCv'); ctx = cv.getContext('2d');
    quickPopEl = ov.querySelector('#scQuickPop');
    bindCanvas();

    if (S.SatThemeUI) {
      menuCtrl = S.SatThemeUI.buildMenuBar(ov.querySelector('#scMenuBar'), {
        lang: langOf('menus'),
        langPrefs: doc.langPrefs,
        onAction: handleMenuAction
      });
      railCtrl = S.SatThemeUI.buildLeftIconRail(ov.querySelector('#scIconRail'), {
        lang: langOf('guide'),
        onSelectTool: setTool,
        onHoverTool: function (tid) {
          if (typeof S.SatThemeUI.updateToolGuide === 'function') {
            S.SatThemeUI.updateToolGuide(ov.querySelector('#scToolGuide'), tid || tool, langOf('guide'));
          }
        }
      });
      wsCtrl = S.SatThemeUI.createWorkspaceController(ov, { onResize: resize, onSwipeChange: draw });
      applyLanguagePrefsUI();
    }

    ov.querySelector('#scFileBase').onchange = function () { if (this.files[0]) importBaseFile(this.files[0]); };
    ov.querySelector('#scFileCleanup').onchange = function () { if (this.files[0]) importCleanupFile(this.files[0]); };
    ov.querySelector('#scFileAsset').onchange = function () { if (this.files.length) importAssetFiles(this.files); };
    ov.querySelector('#scFileGis').onchange = function () { if (this.files[0]) importGISFile(this.files[0]); };
    ov.querySelector('#scFileGtJson').onchange = function () { if (this.files[0]) importGeoTerraJsonFile(this.files[0]); };
    ov.querySelector('#scImpGtDirect').onclick = function () { handleMenuAction('import_gt_json'); };

    ov.querySelector('#scCutFea').oninput = function () { cutFeatherPx = +this.value; ov.querySelector('#scCutFeaV').textContent = this.value; };
    ov.querySelector('#scAutoHealChk').onchange = function () { autoHealOnLift = !!this.checked; };
    ov.querySelector('#scBuildUndo').onclick = function () { if (cutPts.length) cutPts.pop(); else if (gisDraftPts.length) gisDraftPts.pop(); else if (gtDraftPts.length) gtDraftPts.pop(); syncUI(); draw(); };
    ov.querySelector('#scBuildCan').onclick = function () { cutPts = []; gisDraftPts = []; gtDraftPts = []; setTool('select'); };
    ov.querySelector('#scBuildExec').onclick = function () {
      if (tool === 'crop_asset') applyCropSelectedAsset();
      else if (tool === 'lasso_erase') applyLassoEraseAsset();
      else if (tool === 'cutout') extractCutoutFromBase();
      else if (tool === 'gt_survey' && gtDraftPts.length >= 3) openGeoTerraModalFor(gtDraftPts, 'polygon', -1);
      else finalizeGisShape();
    };
    ov.querySelector('#scPhotoCol').onchange = function () { photoCfg.color = this.value; };
    ov.querySelector('#scPhotoTol').oninput = function () { photoCfg.tolerance = +this.value; ov.querySelector('#scPhotoTolV').textContent = this.value; };
    ov.querySelector('#scPhotoCont').onchange = function () { photoCfg.contiguous = !!this.checked; };
    ov.querySelector('#scRad').oninput = function () { var v = +this.value; cloneCfg.radius = v; eraseCfg.radius = v; photoCfg.radius = v; ov.querySelector('#scRadV').textContent = v; draw(); };
    ov.querySelector('#scFea').oninput = function () { var v = (+this.value) / 100; cloneCfg.feather = v; eraseCfg.feather = v; ov.querySelector('#scFeaV').textContent = this.value; draw(); };
    ov.querySelector('#scPickSrc').onclick = function () { cloneCfg.pickMode = true; setTool('clone'); };
    ov.querySelector('#scAddPngBtn').onclick = function () { handleMenuAction('import_asset'); };
    ov.querySelector('#scGisCat').onchange = function () { doc.gis.activeCategory = this.value; };
    ov.querySelector('#scSnapOn').onchange = function () { doc.gis.snap.enabled = !!this.checked; };
    ov.querySelector('#scCogoBtn').onclick = runCogoInput;
    ov.querySelector('#scAttrBtn').onclick = function () { openBottomTab('attr'); };

    ov.querySelector('#scExitClean').onclick = function () { if (wsCtrl) wsCtrl.toggleCleanMode(false); };
    ov.querySelector('#scCleanGps').onclick = dropGpsPointNow;
    ov.querySelector('#scCleanUndo').onclick = doUndo;
    [].forEach.call(ov.querySelectorAll('[data-btab]'), function (b) { b.onclick = function () { openBottomTab(b.dataset.btab); }; });
    ov.querySelector('#scBotClose').onclick = function () { if (wsCtrl && wsCtrl.state.bottomOpen) wsCtrl.toggleBottom(); };

    ov.querySelector('#scPickCal').onclick = function () { calibDraft = { p1: null, p2: null }; setTool('calibrate'); };
    ov.querySelector('#scApplyCal').onclick = function () { applyCalibration(ov.querySelector('#scCalM').value); };
    ov.querySelector('#scPickBrg').onclick = function () { bearingDraft = { p1: null, p2: null }; setTool('bearing_cal'); };
    ov.querySelector('#scResetCal').onclick = clearCalibration;
    ov.querySelector('#scNorthDeg').onchange = function () { doc.overlays.northDeg = (((parseFloat(this.value) || 0) % 360) + 360) % 360; persistToIDB(); draw(); };

    function bSun(id, vid, k, div, flt) {
      var el = ov.querySelector(id);
      el.oninput = function () { var r = flt ? parseFloat(this.value) : (+this.value); doc.sun[k] = div ? (r / div) : r; ov.querySelector(vid).textContent = this.value; draw(); };
      el.onchange = function () { persistToIDB(); };
    }
    bSun('#scSunAz', '#scSunAzV', 'azimuthDeg', 0, false); bSun('#scSunLen', '#scSunLenV', 'lengthFactor', 0, true);
    bSun('#scSunOp', '#scSunOpV', 'opacity', 100, false); bSun('#scSunBl', '#scSunBlV', 'blurPx', 0, true);

    if (S.SatExport) {
      ov.querySelector('#scPaper').innerHTML = Object.keys(S.SatExport.PAPERS).map(function (k) {
        return '<option value="' + k + '">' + esc(S.SatExport.PAPERS[k].label) + '</option>';
      }).join('');
    }
    ov.querySelector('#scTitEn').onchange = function () { doc.overlays.titleEn = this.value; persistToIDB(); };
    ov.querySelector('#scTitAr').onchange = function () { doc.overlays.titleAr = this.value; persistToIDB(); };
    ov.querySelector('#scPaper').onchange = function () { doc.overlays.paper = this.value; persistToIDB(); syncUI(); };
    ov.querySelector('#scDpi').onchange = function () { doc.overlays.dpi = +this.value; persistToIDB(); syncUI(); };
    ov.querySelector('#scExpClean').onclick = function () { handleMenuAction('export_clean'); };
    ov.querySelector('#scExpPoster').onclick = function () { handleMenuAction('export_poster'); };
    ov.querySelector('#scPushCad').onclick = function () { pushFeaturesToCad(false); };
    ov.querySelector('#scSend3D').onclick = function () { pushFeaturesToCad(true); };

    ov.querySelector('#scFootCoord').onclick = function () { handleMenuAction('cycle_coord_sys'); };
    ov.querySelector('#scFootGps').onclick = toggleLiveGps;
    ov.querySelector('#scFootCmp').onclick = toggleLiveCompass;

    if (window.ResizeObserver) new ResizeObserver(resize).observe(cv.parentNode);
    else window.addEventListener('resize', resize);
    built = true;
  }

  // =========================================================================
  // 13. PUBLIC ISOLATED MODULE API
  // =========================================================================
  function open() {
    try {
      if (!built) build();
      isOpen = true;
      ov.classList.remove('hide');
      resize();
      applyLanguagePrefsUI();
      if (getBaseDims().w && view.s === 1 && view.ox === 0 && view.oy === 0) fitView();
      syncUI(); draw();
      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('keyup', onKeyUp);
    } catch (err) { alert('Sat Studio failed to open: ' + err.message); }
  }

  function close() {
    isOpen = false; space = false; quickMoveArmed = false; quickVertsArmed = false;
    if (ov) ov.classList.add('hide');
    if (quickPopEl) quickPopEl.classList.remove('show');
    if (railCtrl && railCtrl.hideTip) railCtrl.hideTip();
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
  }

  function hasData() {
    return !!(
      bins.base || hasActiveCleanupImg() || doc.calibration.pxPerMeter > 0 ||
      doc.patches.length || doc.cleanupErases.length || doc.assets.length ||
      doc.gis.features.length || doc.geoterra.features.length || doc.geoterra.gcps.length ||
      (doc.overlays && doc.overlays.pins && doc.overlays.pins.length)
    );
  }

  function exportState(opts) {
    try {
      var includeHeavy = !opts || opts.includeHeavy !== false, activeAssetBins = {};
      if (includeHeavy) doc.assets.forEach(function (a) { if (a.binId && bins.assets[a.binId]) activeAssetBins[a.binId] = bins.assets[a.binId]; });
      return {
        version: 2, doc: JSON.parse(JSON.stringify(doc)),
        bins: includeHeavy ? { base: bins.base, cleanup: hasActiveCleanupImg() ? bins.cleanup : null, assets: activeAssetBins } : { base: null, cleanup: null, assets: {} }
      };
    } catch (err) { return null; }
  }

  function importState(payload) {
    try {
      if (S.SatBlending && S.SatBlending.clearCache) S.SatBlending.clearCache();
      if (S.SatProcedural && S.SatProcedural.clearProceduralCache) S.SatProcedural.clearProceduralCache();
      if (!payload || typeof payload !== 'object') return false;
      opGen++; var snapGen = opGen;
      undoStack = []; redoStack = [];
      clearAllSelections(); quickVertsArmed = false; cutPts = []; gisDraftPts = []; gtDraftPts = [];
      doc = mergeDoc(payload.doc || payload);
      var inBins = payload.bins || {};
      var sameBase = !inBins.base && bins.base && doc.base.id && payload.doc && payload.doc.base && payload.doc.base.id === doc.base.id;
      bins = { base: inBins.base || (sameBase ? bins.base : null), cleanup: inBins.cleanup || null, assets: inBins.assets ? Object.assign({}, inBins.assets) : {} };
      calibDraft = { p1: doc.calibration.p1, p2: doc.calibration.p2 };
      recomputeGeoref(false);
      decodeAllImages(snapGen, function () {
        if (snapGen !== opGen) return;
        cleanupDirty = true; persistToIDB();
        if (isOpen) { applyLanguagePrefsUI(); fitView(); syncUI(); draw(); }
      });
      return true;
    } catch (err) { return false; }
  }

  function clearData(silent) {
    try {
      if (S.SatBlending && S.SatBlending.clearCache) S.SatBlending.clearCache();
      if (S.SatProcedural && S.SatProcedural.clearProceduralCache) S.SatProcedural.clearProceduralCache();
      opGen++; doc = blankDoc(); bins = blankBins(); imgs = { base: null, cleanup: null, assets: {} };
      if (cleanupCacheCv) { cleanupCacheCv.width = 0; cleanupCacheCv.height = 0; cleanupCacheCv = null; }
      cleanupDirty = true; undoStack = []; redoStack = [];
      clearAllSelections(); quickVertsArmed = false; cutPts = []; gisDraftPts = []; gtDraftPts = []; measPts = [];
      calibDraft = { p1: null, p2: null }; bearingDraft = { p1: null, p2: null };
      georefModel = null; viewshedResult = null; rangeRingsState = null; evacMatrixLinks = [];
      cloneCfg.src = null; cloneCfg.pickMode = false;
      wipeIDB();
      if (!silent) setStatus('Sat Studio cleared.', false);
      if (isOpen) { applyLanguagePrefsUI(); syncUI(); draw(); }
    } catch (err) {}
  }

  if (St && St.on) { St.on('clear', function () { clearData(true); }); }
  hydrateFromIDB();

  S.SatComposer = {
    open: open,
    close: close,
    isOpen: function () { return isOpen; },
    hasData: hasData,
    exportState: exportState,
    importState: importState,
    clearData: clearData,
    importGeoTerraFile: importGeoTerraJsonFile,
    importGeoTerraData: applyParsedGeoTerraData
  };
})(window.SOS);
  // === END PART 1 / 2 ===
