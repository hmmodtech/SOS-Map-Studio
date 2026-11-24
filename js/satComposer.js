window.SOS = window.SOS || {};
(function (S) {
  'use strict';

  var St = S.State;
  var MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
  var IDB_NAME = 'aj_geocad_sat_idb_v1';
  var IDB_STORE = 'kv';
  var MAX_SAFE_EDGE = 16384;
  var MAX_LIVE_CACHE_EDGE = 4096;
  var MAX_UNDO = 40;
  var D = Math.PI / 180;

  function uid(p) {
    return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function blankDoc() {
    return {
      version: 1,
      base: { id: null, name: '', mime: '', width: 0, height: 0, byteSize: 0 },
      calibration: { pxPerMeter: 0, p1: null, p2: null, knownMeters: 10 },
      layers: {
        base: { visible: true, locked: true, opacity: 1 },
        cleanup: { visible: true, opacity: 1 },
        assets: { visible: true, opacity: 1 },
        overlays: { visible: true, opacity: 1 }
      },
      sun: { azimuthDeg: 135, lengthFactor: 0.75, opacity: 0.38, blurPx: 4, color: '#2a2118' },
      cleanupImage: { id: null, name: '', width: 0, height: 0 },
      patches: [],
      cleanupErases: [],
      assets: [],
      overlays: {
        titleAr: '', titleEn: '', showNorth: true, showScale: true, showLegend: true, northDeg: 0,
        pins: [], paper: 'A2_L', dpi: 200, customWcm: 60, customHcm: 40
      }
    };
  }

  function blankBins() {
    return { base: null, cleanup: null, assets: {} };
  }

  // Isolated internal state (never leaks into St.project or localStorage)
  var doc = blankDoc();
  var bins = blankBins();
  var imgs = { base: null, cleanup: null, assets: {} };
  var undoStack = [], redoStack = [];
  var opGen = 0;
  var idbQueue = Promise.resolve();
  var idbStatus = 'Ready';

  // Offscreen cache for Layer 02_Ground_Cleanup
  var cleanupCacheCv = null;
  var cleanupCacheScale = 1;
  var cleanupDirty = true;
  var patchScratchCv = null;

  // Viewport & Tool runtime state
  var ov = null, cv = null, ctx = null, built = false, isOpen = false;
  var W = 1, H = 1, dpr = 1;
  var view = { s: 1, ox: 0, oy: 0 };
  var tool = 'select'; // 'select' | 'pan' | 'clone' | 'erase' | 'cutout' | 'futsal_rect' | 'building_add' | 'tent_add' | 'tree_add' | 'poly_draw' | 'pin' | 'calibrate' | 'measure'
  var selAssetId = null;
  var selPinId = null;
  var pinCat = 'bldg';
  var ptrs = {}, drag = null, space = false;
  var hovImg = null;
  var calibDraft = { p1: null, p2: null };
  var measPts = [];
  var cutPts = [];
  var cutFeatherPx = 2;
  var cloneCfg = { src: null, pickMode: false, radius: 28, feather: 0.65, opacity: 1.0, rotDeg: 0, followDrag: true };
  var eraseCfg = { radius: 28, feather: 0.65, opacity: 1.0 };
  var statusMsg = 'Import a full-resolution satellite image to begin.';

  // =========================================================================
  // SERIALIZED FAIL-SAFE INDEXEDDB STORAGE
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
    }).catch(function (err) {
      if (snapGen === opGen) setIdbBadge('Unavailable');
      console.warn('SatComposer IDB save warning:', err);
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
              decodeAllImages(snapGen, function () {
                if (snapGen !== opGen) return;
                cleanupDirty = true;
                setIdbBadge(bins.base ? 'Restored' : 'Ready');
                if (isOpen) { fitView(); syncUI(); draw(); }
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
  // STATE MERGE, UNDO/REDO & MULTI-IMAGE DECODING
  // =========================================================================
  function normalizeAsset(a) {
    return Object.assign({
      id: uid('ast'),
      binId: '',
      name: 'Asset',
      source: 'png',
      naturalW: 100,
      naturalH: 100,
      x: 100,
      y: 100,
      wPx: 100,
      hPx: 100,
      lockAspect: true,
      rotationDeg: 0,
      flipX: false,
      flipY: false,
      opacity: 1,
      visible: true,
      locked: false,
      elevationM: 2.5,
      shadowEnabled: true
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
    return {
      version: 1,
      base: Object.assign(b.base, raw.base || {}),
      calibration: Object.assign(b.calibration, raw.calibration || {}),
      layers: {
        base: Object.assign(b.layers.base, (raw.layers && raw.layers.base) || {}, { locked: true }),
        cleanup: Object.assign(b.layers.cleanup, (raw.layers && raw.layers.cleanup) || {}),
        assets: Object.assign(b.layers.assets, (raw.layers && raw.layers.assets) || {}),
        overlays: Object.assign(b.layers.overlays, (raw.layers && raw.layers.overlays) || {})
      },
      sun: Object.assign(b.sun, raw.sun || {}),
      cleanupImage: Object.assign(b.cleanupImage, raw.cleanupImage || {}),
      patches: Array.isArray(raw.patches) ? raw.patches : [],
      cleanupErases: Array.isArray(raw.cleanupErases) ? raw.cleanupErases : [],
      assets: Array.isArray(raw.assets) ? raw.assets.map(normalizeAsset) : [],
      overlays: Object.assign(b.overlays, raw.overlays || {}, {
        pins: Array.isArray(raw.overlays && raw.overlays.pins) ? raw.overlays.pins : []
      })
    };
  }

  function pushUndo() {
    undoStack.push(JSON.stringify(doc));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack = [];
    syncUndoBtns();
  }

  function doUndo() {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify(doc));
    doc = mergeDoc(JSON.parse(undoStack.pop()));
    if (selAssetId && !getSelAsset()) selAssetId = null;
    if (selPinId && !getSelPin()) selPinId = null;
    calibDraft = { p1: doc.calibration.p1, p2: doc.calibration.p2 };
    cleanupDirty = true;
    persistToIDB();
    syncUI(); draw();
  }

  function doRedo() {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify(doc));
    doc = mergeDoc(JSON.parse(redoStack.pop()));
    if (selAssetId && !getSelAsset()) selAssetId = null;
    if (selPinId && !getSelPin()) selPinId = null;
    calibDraft = { p1: doc.calibration.p1, p2: doc.calibration.p2 };
    cleanupDirty = true;
    persistToIDB();
    syncUI(); draw();
  }

  function decodeImage(dataUrl, cb) {
    if (!dataUrl) return cb(null, null);
    var im = new Image();
    im.onload = function () { cb(null, im); };
    im.onerror = function () { cb(new Error('Image decode failed'), null); };
    im.src = dataUrl;
  }

  function decodeAllImages(snapGen, done) {
    imgs.base = null;
    imgs.cleanup = null;
    imgs.assets = {};
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
          if (t.kind === 'base') {
            imgs.base = im;
            doc.base.width = im.naturalWidth;
            doc.base.height = im.naturalHeight;
          } else if (t.kind === 'cleanup') {
            imgs.cleanup = im;
            if (doc.cleanupImage.id) {
              doc.cleanupImage.width = im.naturalWidth;
              doc.cleanupImage.height = im.naturalHeight;
            }
          } else if (t.kind === 'asset') {
            imgs.assets[t.id] = im;
          }
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
        el.style.color = isErr ? 'var(--danger, #ff4757)' : 'var(--glow-cyan, #00e5ff)';
      }
    }
  }

  function hasActiveCleanupImg() {
    return !!(doc.cleanupImage && doc.cleanupImage.id && imgs.cleanup);
  }

  function getSelAsset() {
    for (var i = 0; i < doc.assets.length; i++) {
      if (doc.assets[i].id === selAssetId) return doc.assets[i];
    }
    return null;
  }

  function getSelPin() {
    var ps = (doc.overlays && doc.overlays.pins) || [];
    for (var i = 0; i < ps.length; i++) if (ps[i].id === selPinId) return ps[i];
    return null;
  }

  function hitPinAt(screenPt) {
    if (!doc.layers.overlays.visible) return null;
    var ps = (doc.overlays && doc.overlays.pins) || [];
    for (var i = ps.length - 1; i >= 0; i--) {
      var sp = i2s(ps[i].x, ps[i].y);
      if (Math.hypot(screenPt.x - sp[0], screenPt.y - sp[1]) <= 15) return ps[i];
    }
    return null;
  }

  // =========================================================================
  // IMPORTS: BASE SATELLITE, PRE-CLEANED GROUND, PNG ASSETS
  // =========================================================================
  function importBaseFile(file) {
    if (!file) return;
    try {
      setStatus('Reading full-resolution image: ' + file.name + '...', false);
      var reader = new FileReader();
      reader.onerror = function () { setStatus('Error reading file.', true); };
      reader.onload = function () {
        try {
          var dataUrl = reader.result;
          decodeImage(dataUrl, function (err, im) {
            if (err || !im || !im.naturalWidth) { setStatus('Unsupported or corrupted image file.', true); return; }
            var nw = im.naturalWidth, nh = im.naturalHeight;
            opGen++;
            pushUndo();
            bins.base = dataUrl;
            imgs.base = im;
            doc.base = {
              id: uid('base'),
              name: file.name,
              mime: file.type || 'image/png',
              width: nw,
              height: nh,
              byteSize: file.size || Math.round(dataUrl.length * 0.75)
            };
            calibDraft = { p1: null, p2: null };
            measPts = [];
            cutPts = [];
            cloneCfg.src = null;
            cleanupDirty = true;
            var mp = (nw * nh) / 1e6;
            var mb = doc.base.byteSize / (1024 * 1024);
            var warn = (nw > MAX_SAFE_EDGE || nh > MAX_SAFE_EDGE)
              ? (' [WARNING: Edge exceeds ' + MAX_SAFE_EDGE + 'px safe browser limit!]')
              : '';
            setStatus('Loaded 01_Base_Satellite: ' + nw + 'x' + nh + ' px (' + mp.toFixed(2) + ' MP, ' + mb.toFixed(2) + ' MB) — Zero Compression' + warn, !!warn);
            persistToIDB();
            fitView();
            syncUI();
            draw();
          });
        } catch (innerErr) {
          setStatus('Import decode failed: ' + innerErr.message, true);
        }
      };
      reader.readAsDataURL(file);
    } catch (e) {
      setStatus('Import failed: ' + e.message, true);
    }
  }

  function importCleanupFile(file) {
    if (!file) return;
    if (!imgs.base) { setStatus('Import 01_Base_Satellite first before loading a cleanup layer.', true); return; }
    try {
      var reader = new FileReader();
      reader.onerror = function () { setStatus('Error reading cleanup image.', true); };
      reader.onload = function () {
        var dataUrl = reader.result;
        decodeImage(dataUrl, function (err, im) {
          if (err || !im || !im.naturalWidth) { setStatus('Invalid cleanup image.', true); return; }
          pushUndo();
          bins.cleanup = dataUrl;
          imgs.cleanup = im;
          doc.cleanupImage = { id: uid('cln'), name: file.name, width: im.naturalWidth, height: im.naturalHeight };
          doc.layers.cleanup.visible = true;
          cleanupDirty = true;
          persistToIDB();
          var dimNote = (im.naturalWidth === imgs.base.naturalWidth && im.naturalHeight === imgs.base.naturalHeight)
            ? 'exact 1:1 match'
            : ('auto-fitted 1:1 onto ' + imgs.base.naturalWidth + 'x' + imgs.base.naturalHeight);
          setStatus('Loaded 02_Ground_Cleanup: ' + file.name + ' (' + dimNote + '). Use Soft Eraser to reveal original base where needed.', false);
          syncUI(); draw();
        });
      };
      reader.readAsDataURL(file);
    } catch (e) {
      setStatus('Cleanup import failed: ' + e.message, true);
    }
  }

  function importAssetFiles(fileList) {
    if (!fileList || !fileList.length) return;
    if (!imgs.base) { setStatus('Import 01_Base_Satellite first before adding assets.', true); return; }
    var files = [].slice.call(fileList);
    var doneCount = 0, addedCount = 0;
    pushUndo();
    files.forEach(function (file, idx) {
      try {
        var reader = new FileReader();
        reader.onerror = function () { doneCount++; finishCheck(); };
        reader.onload = function () {
          var dataUrl = reader.result;
          decodeImage(dataUrl, function (err, im) {
            if (!err && im && im.naturalWidth) {
              var binId = uid('abin');
              bins.assets[binId] = dataUrl;
              imgs.assets[binId] = im;
              var ctr = s2i(W / 2, H / 2);
              ctr.x = clamp(ctr.x, 0, imgs.base.naturalWidth) + idx * 18;
              ctr.y = clamp(ctr.y, 0, imgs.base.naturalHeight) + idx * 18;
              var asp = im.naturalWidth / Math.max(1, im.naturalHeight);
              var wPx = doc.calibration.pxPerMeter > 0
                ? clamp(12 * doc.calibration.pxPerMeter, 24, imgs.base.naturalWidth * 0.4)
                : clamp(im.naturalWidth, 32, imgs.base.naturalWidth * 0.28);
              var hPx = wPx / asp;
              var cleanName = file.name.replace(/\.[^.]+$/, '');
              var ast = normalizeAsset({
                id: uid('ast'),
                binId: binId,
                name: cleanName || 'PNG Asset',
                source: 'png',
                naturalW: im.naturalWidth,
                naturalH: im.naturalHeight,
                x: +ctr.x.toFixed(2),
                y: +ctr.y.toFixed(2),
                wPx: +wPx.toFixed(2),
                hPx: +hPx.toFixed(2)
              });
              doc.assets.push(ast);
              doc.layers.assets.visible = true;
              selAssetId = ast.id;
              addedCount++;
            }
            doneCount++;
            finishCheck();
          });
        };
        reader.readAsDataURL(file);
      } catch (e) {
        doneCount++;
        finishCheck();
      }
    });
    function finishCheck() {
      if (doneCount === files.length) {
        if (addedCount > 0) {
          persistToIDB();
          setTool('select');
          setStatus('Added ' + addedCount + ' PNG asset(s) to 03_Movable_Assets. Drag corners to resize or top handle to rotate.', false);
        } else {
          setStatus('No valid image files could be decoded.', true);
        }
        syncUI(); draw();
      }
    }
  }

  // =========================================================================
  // CUT & RELOCATE (A -> B): EXACT 1:1 NATURAL PIXEL EXTRACTION
  // =========================================================================
  function extractCutoutFromBase() {
    if (!imgs.base) { setStatus('No base satellite image loaded.', true); return; }
    if (cutPts.length < 3) { setStatus('Draw at least 3 polygon points around the object first.', true); return; }
    var cutCv = null, maskCv = null;
    try {
      var iw = imgs.base.naturalWidth, ih = imgs.base.naturalHeight;
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      cutPts.forEach(function (p) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      });
      var fPx = clamp(+cutFeatherPx || 0, 0, 6);
      var pad = Math.ceil(fPx * 2) + 2;
      var x0 = Math.max(0, Math.floor(minX - pad));
      var y0 = Math.max(0, Math.floor(minY - pad));
      var x1 = Math.min(iw, Math.ceil(maxX + pad));
      var y1 = Math.min(ih, Math.ceil(maxY + pad));
      var bw = x1 - x0, bh = y1 - y0;
      if (bw < 4 || bh < 4) { setStatus('Cutout polygon is too small.', true); return; }
      if (bw > MAX_SAFE_EDGE || bh > MAX_SAFE_EDGE) { setStatus('Cutout exceeds safe canvas edge limit.', true); return; }

      cutCv = document.createElement('canvas');
      cutCv.width = bw; cutCv.height = bh;
      var cctx = cutCv.getContext('2d');
      cctx.drawImage(imgs.base, x0, y0, bw, bh, 0, 0, bw, bh);

      maskCv = document.createElement('canvas');
      maskCv.width = bw; maskCv.height = bh;
      var mctx = maskCv.getContext('2d');
      mctx.beginPath();
      cutPts.forEach(function (p, i) {
        var lx = p.x - x0, ly = p.y - y0;
        if (i === 0) mctx.moveTo(lx, ly); else mctx.lineTo(lx, ly);
      });
      mctx.closePath();
      if (fPx > 0 && 'filter' in mctx) mctx.filter = 'blur(' + fPx + 'px)';
      mctx.fillStyle = '#ffffff';
      mctx.fill();
      mctx.filter = 'none';

      cctx.globalCompositeOperation = 'destination-in';
      cctx.drawImage(maskCv, 0, 0);
      cctx.globalCompositeOperation = 'source-over';

      var pngUrl = cutCv.toDataURL('image/png');
      cutCv.width = 0; cutCv.height = 0;
      maskCv.width = 0; maskCv.height = 0;

      decodeImage(pngUrl, function (err, im) {
        if (err || !im) { setStatus('Failed to decode extracted cutout.', true); return; }
        pushUndo();
        var binId = uid('cut');
        bins.assets[binId] = pngUrl;
        imgs.assets[binId] = im;
        var cutCount = doc.assets.filter(function (a) { return a.source === 'cutout'; }).length + 1;
        var ast = normalizeAsset({
          id: uid('ast'),
          binId: binId,
          name: 'Cutout #' + cutCount + ' (A➔B)',
          source: 'cutout',
          naturalW: bw,
          naturalH: bh,
          x: +(x0 + bw / 2).toFixed(2),
          y: +(y0 + bh / 2).toFixed(2),
          wPx: bw,
          hPx: bh
        });
        doc.assets.push(ast);
        doc.layers.assets.visible = true;
        selAssetId = ast.id;
        cutPts = [];
        persistToIDB();
        setTool('select');
        setStatus('Extracted 1:1 cutout (' + bw + 'x' + bh + ' px). Move/rotate to Spot (B), then click "Clean Old Spot (A)".', false);
        syncUI(); draw();
      });
    } catch (e) {
      if (cutCv) { cutCv.width = 0; cutCv.height = 0; }
      if (maskCv) { maskCv.width = 0; maskCv.height = 0; }
      setStatus('Cutout extraction failed: ' + e.message, true);
    }
  }

  // =========================================================================
  // PROCEDURAL FUTSAL PITCH + RED TOP NET, BUILDINGS, TENTS, TREES & POLYGONS
  // =========================================================================
  function addProceduralAssetToScene(name, kind, dataUrl, cx, cy, wPx, hPx, rotDeg, elevM, castSh) {
    decodeImage(dataUrl, function (err, im) {
      if (err || !im || !im.naturalWidth) { setStatus('Procedural asset decode failed.', true); return; }
      pushUndo();
      var binId = uid('pbin');
      bins.assets[binId] = dataUrl;
      imgs.assets[binId] = im;
      var ast = normalizeAsset({
        id: uid('ast'),
        binId: binId,
        name: name,
        source: kind || 'png',
        naturalW: im.naturalWidth,
        naturalH: im.naturalHeight,
        x: +cx.toFixed(2),
        y: +cy.toFixed(2),
        wPx: +Math.max(16, wPx).toFixed(2),
        hPx: +Math.max(16, hPx).toFixed(2),
        rotationDeg: +(((rotDeg || 0) % 360 + 360) % 360).toFixed(1),
        elevationM: elevM != null ? elevM : 3.0,
        shadowEnabled: castSh !== false
      });
      doc.assets.push(ast);
      doc.layers.assets.visible = true;
      selAssetId = ast.id;
      persistToIDB();
      setTool('select');
      syncUI(); draw();
    });
  }

  function createFutsalFromRect(p1, p2) {
    if (!S.SatProcedural || !imgs.base) return;
    var quad = S.SatProcedural.makeOrientedRect(p1, p2);
    if (!quad) return;
    var c = S.SatProcedural.polyCenter(quad);
    var lenPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    var widPx = Math.max(16, lenPx * 0.60);
    var rotDeg = Math.atan2(p2.y - p1.y, p2.x - p1.x) / D;
    var ppm = doc.calibration.pxPerMeter || 0;
    var wM = ppm > 0 ? (lenPx / ppm) : 30;
    var hM = ppm > 0 ? (widPx / ppm) : 18;
    var fenceH = ppm > 0 ? Math.min(3.5, Math.max(2.0, hM * 0.14)) : 3.0;

    var url = S.SatProcedural.getCachedProceduralUrl(
      'futsal|' + Math.round(lenPx) + 'x' + Math.round(widPx),
      function () { return S.SatProcedural.renderFutsalAssetCanvas({ wPx: lenPx, hPx: widPx }); }
    );
    addProceduralAssetToScene(
      'Futsal Pitch + Red Net (' + wM.toFixed(0) + '×' + hM.toFixed(0) + 'm)',
      'futsal', url, c.x, c.y, lenPx, widPx, rotDeg, fenceH, true
    );
    setStatus('Added un-grassed futsal pitch with chain-link + red top net & global shadow.', false);
  }

  function addBuildingAt(imgPt) {
    if (!S.SatProcedural || !imgs.base) { setStatus('Import 01_Base_Satellite first.', true); return; }
    var ppm = doc.calibration.pxPerMeter || 0;
    var wPx = ppm > 0 ? clamp(10 * ppm, 24, imgs.base.naturalWidth * 0.35) : clamp(imgs.base.naturalWidth * 0.08, 36, 180);
    var hPx = wPx * 0.65;
    var url = S.SatProcedural.getCachedProceduralUrl(
      'bldg|' + Math.round(wPx) + 'x' + Math.round(hPx),
      function () { return S.SatProcedural.renderBuildingAssetCanvas({ wPx: wPx, hPx: hPx }); }
    );
    var idx = doc.assets.filter(function (a) { return a.source === 'bldg'; }).length + 1;
    addProceduralAssetToScene('Building #' + idx, 'bldg', url, imgPt.x, imgPt.y, wPx, hPx, 0, 4.5, true);
    setStatus('Added Building #' + idx + '. Drag to move, handle to rotate, or set exact meters in Inspector.', false);
  }

  function addTentAt(imgPt) {
    if (!S.SatProcedural || !imgs.base) { setStatus('Import 01_Base_Satellite first.', true); return; }
    var ppm = doc.calibration.pxPerMeter || 0;
    var wPx = ppm > 0 ? clamp(4.5 * ppm, 18, imgs.base.naturalWidth * 0.3) : clamp(imgs.base.naturalWidth * 0.055, 22, 140);
    var hPx = wPx;
    var url = S.SatProcedural.getCachedProceduralUrl(
      'tent|' + Math.round(wPx) + 'x' + Math.round(hPx),
      function () { return S.SatProcedural.renderTentAssetCanvas({ wPx: wPx, hPx: hPx }); }
    );
    var idx = doc.assets.filter(function (a) { return a.source === 'tent'; }).length + 1;
    addProceduralAssetToScene('Tent #' + idx, 'tent', url, imgPt.x, imgPt.y, wPx, hPx, 0, 2.6, true);
    setStatus('Added Tent #' + idx + '. Drag to move, handle to rotate, or edit Width/Height (m) in Inspector.', false);
  }

  function addTreeAt(imgPt) {
    if (!S.SatProcedural || !imgs.base) { setStatus('Import 01_Base_Satellite first.', true); return; }
    var ppm = doc.calibration.pxPerMeter || 0;
    var dPx = ppm > 0 ? clamp(5.5 * ppm, 18, imgs.base.naturalWidth * 0.25) : clamp(imgs.base.naturalWidth * 0.05, 22, 120);
    var idx = doc.assets.filter(function (a) { return a.source === 'tree'; }).length + 1;
    var seedVal = 4200 + idx * 97;
    var url = S.SatProcedural.getCachedProceduralUrl(
      'tree|' + Math.round(dPx) + '|' + seedVal,
      function () { return S.SatProcedural.renderTreeAssetCanvas({ dPx: dPx, seed: seedVal }); }
    );
    addProceduralAssetToScene('Tree #' + idx, 'tree', url, imgPt.x, imgPt.y, dPx, dPx, 0, 5.0, true);
    setStatus('Added natural Tree #' + idx + ' with foliage canopy & sun shadow.', false);
  }

  function finalizeFreePolygon() {
    if (!S.SatProcedural || !imgs.base || cutPts.length < 3) {
      setStatus('Click at least 3 polygon points first.', true); return;
    }
    var res = S.SatProcedural.renderPolygonAssetFromPoints(imgs.base, cutPts, null, 'rgba(0,229,255,0.85)');
    cutPts = [];
    if (!res) { setStatus('Polygon too large or invalid.', true); return; }
    var idx = doc.assets.filter(function (a) { return a.source === 'poly'; }).length + 1;
    addProceduralAssetToScene('Polygon #' + idx, 'poly', res.dataUrl, res.cx, res.cy, res.wPx, res.hPx, 0, 0, false);
    setStatus('Created Polygon #' + idx + '. Move, resize, or rotate it freely.', false);
  }

  // =========================================================================
  // LAYER 02_GROUND_CLEANUP COMPOSITOR (INCREMENTAL CACHE + FULL REBUILD)
  // =========================================================================
  function stampClonePatch(targetCtx, p, scale) {
    if (!imgs.base) return;
    var iw = imgs.base.naturalWidth, ih = imgs.base.naturalHeight;
    var r = Math.max(2, p.r * scale);
    var d = Math.ceil(r * 2) + 2;
    if (!patchScratchCv) patchScratchCv = document.createElement('canvas');
    patchScratchCv.width = d;
    patchScratchCv.height = d;
    var pctx = patchScratchCv.getContext('2d');
    pctx.clearRect(0, 0, d, d);

    var rrNat = Math.ceil(p.r * 1.5) + 2;
    var bx0 = Math.max(0, Math.floor(p.sx - rrNat));
    var by0 = Math.max(0, Math.floor(p.sy - rrNat));
    var bx1 = Math.min(iw, Math.ceil(p.sx + rrNat));
    var by1 = Math.min(ih, Math.ceil(p.sy + rrNat));
    var bw = bx1 - bx0, bh = by1 - by0;
    if (bw <= 0 || bh <= 0) return;

    pctx.save();
    pctx.translate(d / 2, d / 2);
    if (p.rotDeg) pctx.rotate(p.rotDeg * D);
    pctx.drawImage(imgs.base, bx0, by0, bw, bh, (bx0 - p.sx) * scale, (by0 - p.sy) * scale, bw * scale, bh * scale);
    pctx.restore();

    var fe = clamp(p.feather != null ? p.feather : 0.65, 0.02, 1);
    var rIn = Math.max(0, r * (1 - fe));
    var grad = pctx.createRadialGradient(d / 2, d / 2, rIn, d / 2, d / 2, r);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    pctx.globalCompositeOperation = 'destination-in';
    pctx.fillStyle = grad;
    pctx.fillRect(0, 0, d, d);
    pctx.globalCompositeOperation = 'source-over';

    targetCtx.save();
    targetCtx.globalAlpha = clamp(p.opacity != null ? p.opacity : 1, 0.05, 1);
    targetCtx.drawImage(patchScratchCv, p.dx * scale - d / 2, p.dy * scale - d / 2);
    targetCtx.restore();
  }

  function applyEraseDab(targetCtx, x, y, r, rIn, op) {
    var g = targetCtx.createRadialGradient(x, y, rIn, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,' + op + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    targetCtx.fillStyle = g;
    targetCtx.beginPath();
    targetCtx.arc(x, y, r, 0, Math.PI * 2);
    targetCtx.fill();
  }

  function applyEraseSegment(targetCtx, ptA, ptB, cfg, scale, includeStart) {
    var r = Math.max(2, cfg.r * scale);
    var fe = clamp(cfg.feather != null ? cfg.feather : 0.65, 0.02, 1);
    var rIn = Math.max(0, r * (1 - fe));
    var op = clamp(cfg.opacity != null ? cfg.opacity : 1, 0.05, 1);
    var step = Math.max(2, r * 0.26);
    var x0 = ptA.x * scale, y0 = ptA.y * scale;
    targetCtx.save();
    targetCtx.globalCompositeOperation = 'destination-out';
    if (includeStart) applyEraseDab(targetCtx, x0, y0, r, rIn, op);
    if (ptB) {
      var x1 = ptB.x * scale, y1 = ptB.y * scale;
      var dist = Math.hypot(x1 - x0, y1 - y0);
      var n = Math.max(1, Math.ceil(dist / step));
      for (var k = 1; k <= n; k++) {
        var t = k / n;
        applyEraseDab(targetCtx, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, rIn, op);
      }
    }
    targetCtx.restore();
  }

  function applySoftEraseStroke(targetCtx, st, scale) {
    if (!st || !st.pts || !st.pts.length) return;
    applyEraseSegment(targetCtx, st.pts[0], null, st, scale, true);
    for (var i = 1; i < st.pts.length; i++) {
      applyEraseSegment(targetCtx, st.pts[i - 1], st.pts[i], st, scale, false);
    }
  }

  function renderCleanupLayerTo(targetCtx, targetW, targetH, scale) {
    if (hasActiveCleanupImg()) {
      targetCtx.drawImage(imgs.cleanup, 0, 0, targetW, targetH);
    }
    for (var i = 0; i < doc.patches.length; i++) {
      stampClonePatch(targetCtx, doc.patches[i], scale);
    }
    for (var j = 0; j < doc.cleanupErases.length; j++) {
      applySoftEraseStroke(targetCtx, doc.cleanupErases[j], scale);
    }
  }

  function ensureCleanupCache() {
    if (!imgs.base) return null;
    if (!hasActiveCleanupImg() && !doc.patches.length && !doc.cleanupErases.length) {
      if (cleanupCacheCv) { cleanupCacheCv.width = 0; cleanupCacheCv.height = 0; cleanupCacheCv = null; }
      cleanupDirty = false;
      return null;
    }
    if (!cleanupDirty && cleanupCacheCv) return cleanupCacheCv;
    try {
      var iw = imgs.base.naturalWidth, ih = imgs.base.naturalHeight;
      var sc = Math.min(1, MAX_LIVE_CACHE_EDGE / Math.max(iw, ih));
      var cw = Math.max(1, Math.round(iw * sc)), ch = Math.max(1, Math.round(ih * sc));
      if (!cleanupCacheCv) cleanupCacheCv = document.createElement('canvas');
      if (cleanupCacheCv.width !== cw || cleanupCacheCv.height !== ch) {
        cleanupCacheCv.width = cw; cleanupCacheCv.height = ch;
      }
      cleanupCacheScale = cw / iw;
      var cctx = cleanupCacheCv.getContext('2d');
      cctx.clearRect(0, 0, cw, ch);
      renderCleanupLayerTo(cctx, cw, ch, cleanupCacheScale);
      cleanupDirty = false;
      return cleanupCacheCv;
    } catch (e) {
      setStatus('Cleanup layer cache error: ' + e.message, true);
      return null;
    }
  }

  function incrementalStampPatch(p) {
    if (cleanupDirty || !cleanupCacheCv) {
      cleanupDirty = true;
      ensureCleanupCache();
    } else {
      stampClonePatch(cleanupCacheCv.getContext('2d'), p, cleanupCacheScale);
    }
  }

  function incrementalErase(ptA, ptB, stroke, includeStart) {
    if (cleanupDirty || !cleanupCacheCv) {
      cleanupDirty = true;
      ensureCleanupCache();
    } else {
      applyEraseSegment(cleanupCacheCv.getContext('2d'), ptA, ptB, stroke, cleanupCacheScale, includeStart);
    }
  }

  // =========================================================================
  // ASSET GEOMETRY, HIT-TESTING & HANDLES (1:1 NATURAL PIXEL COORDS)
  // =========================================================================
  function assetLocalToImg(a, lx, ly) {
    var r = (a.rotationDeg || 0) * D, c = Math.cos(r), s = Math.sin(r);
    return { x: a.x + lx * c - ly * s, y: a.y + lx * s + ly * c };
  }

  function imgToAssetLocal(a, ix, iy) {
    var r = (a.rotationDeg || 0) * D, c = Math.cos(r), s = Math.sin(r);
    var dx = ix - a.x, dy = iy - a.y;
    return { x: dx * c + dy * s, y: -dx * s + dy * c };
  }

  function assetHandlesImg(a) {
    var hw = a.wPx / 2, hh = a.hPx / 2;
    var rotStemImg = 26 / Math.max(0.05, view.s);
    return {
      tl: assetLocalToImg(a, -hw, -hh),
      tr: assetLocalToImg(a, hw, -hh),
      br: assetLocalToImg(a, hw, hh),
      bl: assetLocalToImg(a, -hw, hh),
      rot: assetLocalToImg(a, 0, -hh - rotStemImg),
      topMid: assetLocalToImg(a, 0, -hh)
    };
  }

  function hitAssetHandle(a, screenPt) {
    if (!a || !a.visible || a.locked) return null;
    var hs = assetHandlesImg(a);
    var keys = ['rot', 'tl', 'tr', 'br', 'bl'];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], sp = i2s(hs[k].x, hs[k].y);
      if (Math.hypot(screenPt.x - sp[0], screenPt.y - sp[1]) <= 12) return k;
    }
    return null;
  }

  function hitAssetAt(imgPt) {
    if (!doc.layers.assets.visible) return null;
    for (var i = doc.assets.length - 1; i >= 0; i--) {
      var a = doc.assets[i];
      if (!a.visible || a.locked) continue;
      var loc = imgToAssetLocal(a, imgPt.x, imgPt.y);
      if (Math.abs(loc.x) <= a.wPx / 2 && Math.abs(loc.y) <= a.hPx / 2) return a;
    }
    return null;
  }

  // =========================================================================
  // VIEWPORT PROJECTION & NAVIGATION
  // =========================================================================
  function i2s(ix, iy) { return [view.ox + ix * view.s, view.oy + iy * view.s]; }
  function s2i(sx, sy) { return { x: (sx - view.ox) / view.s, y: (sy - view.oy) / view.s }; }
  function minScale() {
    if (!imgs.base) return 0.1;
    return Math.min(0.05, Math.min(W / imgs.base.naturalWidth, H / imgs.base.naturalHeight) * 0.25);
  }

  function fitView() {
    if (!imgs.base || !W || !H) { view.s = 1; view.ox = W / 2; view.oy = H / 2; return; }
    var iw = imgs.base.naturalWidth, ih = imgs.base.naturalHeight;
    view.s = Math.min(Math.max(40, W - 48) / iw, Math.max(40, H - 48) / ih);
    view.ox = (W - iw * view.s) / 2;
    view.oy = (H - ih * view.s) / 2;
    draw();
  }

  function zoomNative100() {
    if (!imgs.base) return;
    var ctr = s2i(W / 2, H / 2);
    view.s = 1;
    view.ox = W / 2 - ctr.x;
    view.oy = H / 2 - ctr.y;
    draw();
  }

  // =========================================================================
  // MAIN RENDERER (LAYERS 01 + 02 + 03 + 04 + INTERACTIVE OVERLAYS)
  // =========================================================================
  function draw() {
    if (!isOpen || !ctx) return;
    try {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var isDay = document.body.classList.contains('ui-day');
      ctx.fillStyle = isDay ? '#dfe7ef' : '#040911';
      ctx.fillRect(0, 0, W, H);

      if (!imgs.base) {
        ctx.fillStyle = isDay ? '#334155' : '#7f9bb5';
        ctx.font = 'bold 13px ' + MONO;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('SAT STUDIO READY — IMPORT HIGH-RES SATELLITE IMAGE (01_Base_Satellite)', W / 2, H / 2 - 12);
        ctx.font = '11px ' + MONO;
        ctx.fillText('Zero-Compression Base • Cleanup & Eraser • Futsal + Red Net • Buildings, Tents, Trees & Polygons', W / 2, H / 2 + 12);
        return;
      }

      var iw = imgs.base.naturalWidth, ih = imgs.base.naturalHeight;
      var tl = i2s(0, 0), dw = iw * view.s, dh = ih * view.s;

      ctx.fillStyle = isDay ? '#cbd5e1' : '#0a1626';
      ctx.fillRect(tl[0], tl[1], dw, dh);

      // LAYER 01: Base Satellite (Zero-Compression)
      if (doc.layers.base.visible) {
        ctx.save();
        ctx.globalAlpha = clamp(doc.layers.base.opacity, 0, 1);
        ctx.imageSmoothingEnabled = view.s < 2;
        ctx.drawImage(imgs.base, tl[0], tl[1], dw, dh);
        ctx.restore();
      }

      // LAYER 02: Ground Cleanup
      if (doc.layers.cleanup.visible) {
        var ccv = ensureCleanupCache();
        if (ccv) {
          ctx.save();
          ctx.globalAlpha = clamp(doc.layers.cleanup.opacity, 0, 1);
          ctx.imageSmoothingEnabled = view.s < 2;
          ctx.drawImage(ccv, tl[0], tl[1], dw, dh);
          ctx.restore();
        }
      }

      // LAYER 03: Movable Assets + Unified Global Sun Shadow (Multiply) + Satellite Match Filters
      if (doc.layers.assets.visible) {
        var layOp = clamp(doc.layers.assets.opacity, 0, 1);
        if (S.SatBlending && S.SatBlending.renderLayer03) {
          S.SatBlending.renderLayer03(ctx, {
            assets: doc.assets,
            imgs: imgs.assets,
            sun: doc.sun,
            pxPerMeter: doc.calibration.pxPerMeter,
            layerOpacity: layOp,
            scale: view.s,
            ox: view.ox,
            oy: view.oy,
            viewW: W,
            viewH: H,
            forExport: false
          });
        } else {
          for (var i = 0; i < doc.assets.length; i++) {
            var a = doc.assets[i];
            if (!a.visible || !imgs.assets[a.binId]) continue;
            var scPt = i2s(a.x, a.y);
            ctx.save();
            ctx.globalAlpha = layOp * clamp(a.opacity != null ? a.opacity : 1, 0, 1);
            ctx.translate(scPt[0], scPt[1]);
            if (a.rotationDeg) ctx.rotate(a.rotationDeg * D);
            if (a.flipX || a.flipY) ctx.scale(a.flipX ? -1 : 1, a.flipY ? -1 : 1);
            ctx.drawImage(imgs.assets[a.binId], -a.wPx * view.s / 2, -a.hPx * view.s / 2, a.wPx * view.s, a.hPx * view.s);
            ctx.restore();
          }
        }
      }

      // LAYER 04: Print Overlays Live Preview (Numbered Pins + North Arrow)
      if (doc.layers.overlays.visible && S.SatExport && S.SatExport.drawLiveOverlays) {
        S.SatExport.drawLiveOverlays(ctx, {
          overlays: doc.overlays,
          i2s: i2s,
          selPinId: selPinId,
          layerOpacity: doc.layers.overlays.opacity,
          viewW: W,
          viewH: H
        });
      }

      ctx.strokeStyle = isDay ? '#0369a1' : '#1b3b57';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(tl[0], tl[1], dw, dh);

      var sel = getSelAsset();
      if (sel && doc.layers.assets.visible && (tool === 'select' || tool === 'pan')) {
        drawAssetGizmo(sel);
      }

      if (tool === 'clone') drawCloneOverlay();
      if (tool === 'erase') drawEraserOverlay();
      if (tool === 'cutout' || tool === 'poly_draw') drawCutoutOverlay();

      if (tool === 'futsal_rect' && drag && drag.m === 'futsal_rect' && S.SatProcedural) {
        var q = S.SatProcedural.makeOrientedRect(drag.p1, drag.p2);
        if (q) {
          ctx.save();
          ctx.fillStyle = 'rgba(201,174,130,0.35)';
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 2;
          ctx.beginPath();
          q.forEach(function (pt, idx) { var sp = i2s(pt.x, pt.y); if (idx === 0) ctx.moveTo(sp[0], sp[1]); else ctx.lineTo(sp[0], sp[1]); });
          ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.restore();
        }
      }

      var cp1 = calibDraft.p1 || (tool === 'calibrate' ? doc.calibration.p1 : null);
      var cp2 = calibDraft.p2 || (tool === 'calibrate' ? doc.calibration.p2 : null);
      if (tool === 'calibrate' && cp1) drawGuideSegment(cp1, cp2 || hovImg, '#00e5ff', 'CALIB');
      if (tool === 'measure' && measPts.length >= 1) drawGuideSegment(measPts[0], measPts[1] || hovImg, '#f0c44d', 'MEAS');

      if (doc.calibration.pxPerMeter > 0) drawScaleBar(isDay);
      drawViewportHud(isDay);
    } catch (err) {
      setStatus('Render warning: ' + err.message, true);
    }
  }

  function drawAssetGizmo(a) {
    var hs = assetHandlesImg(a);
    var pts = [hs.tl, hs.tr, hs.br, hs.bl].map(function (p) { return i2s(p.x, p.y); });
    var topM = i2s(hs.topMid.x, hs.topMid.y);
    var rotP = i2s(hs.rot.x, hs.rot.y);

    ctx.save();
    ctx.strokeStyle = a.locked ? '#f0c44d' : '#00ff9d';
    ctx.lineWidth = 1.8;
    ctx.setLineDash(a.locked ? [5, 4] : []);
    ctx.beginPath();
    pts.forEach(function (p, i) { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    if (!a.locked) {
      ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(topM[0], topM[1]); ctx.lineTo(rotP[0], rotP[1]); ctx.stroke();
      ctx.beginPath(); ctx.arc(rotP[0], rotP[1], 6, 0, Math.PI * 2);
      ctx.fillStyle = '#040911'; ctx.fill(); ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 2; ctx.stroke();

      pts.forEach(function (p) {
        ctx.fillStyle = '#040911'; ctx.strokeStyle = '#00ff9d'; ctx.lineWidth = 2;
        ctx.fillRect(p[0] - 5, p[1] - 5, 10, 10);
        ctx.strokeRect(p[0] - 5, p[1] - 5, 10, 10);
      });
    }

    var dimTxt = a.name;
    if (doc.calibration.pxPerMeter > 0) {
      dimTxt += ' • ' + (a.wPx / doc.calibration.pxPerMeter).toFixed(1) + 'x' + (a.hPx / doc.calibration.pxPerMeter).toFixed(1) + ' m';
    }
    dimTxt += ' • ' + Math.round(a.rotationDeg || 0) + '°';
    ctx.font = 'bold 10px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var tw = ctx.measureText(dimTxt).width + 12;
    var bx = rotP[0], by = rotP[1] - 18;
    ctx.fillStyle = 'rgba(4,9,17,0.9)'; ctx.fillRect(bx - tw / 2, by - 9, tw, 18);
    ctx.strokeStyle = a.locked ? '#f0c44d' : '#00ff9d'; ctx.lineWidth = 1; ctx.strokeRect(bx - tw / 2, by - 9, tw, 18);
    ctx.fillStyle = a.locked ? '#f0c44d' : '#00ff9d'; ctx.fillText(dimTxt, bx, by + 0.5);
    ctx.restore();
  }

  function drawCloneOverlay() {
    ctx.save();
    if (cloneCfg.src) {
      var ss = i2s(cloneCfg.src.x, cloneCfg.src.y);
      ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(ss[0] - 9, ss[1]); ctx.lineTo(ss[0] + 9, ss[1]);
      ctx.moveTo(ss[0], ss[1] - 9); ctx.lineTo(ss[0], ss[1] + 9);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(ss[0], ss[1], Math.max(4, cloneCfg.radius * view.s), 0, Math.PI * 2);
      ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = 'bold 9px ' + MONO; ctx.fillStyle = '#00e5ff'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText('SRC', ss[0] + 8, ss[1] - 6);
    }
    if (hovImg) {
      var hs = i2s(hovImg.x, hovImg.y);
      var col = cloneCfg.pickMode ? '#00e5ff' : '#00ff9d';
      ctx.strokeStyle = col; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(hs[0], hs[1], Math.max(4, cloneCfg.radius * view.s), 0, Math.PI * 2); ctx.stroke();
      if (cloneCfg.src && !cloneCfg.pickMode) {
        var s2 = i2s(cloneCfg.src.x, cloneCfg.src.y);
        ctx.strokeStyle = 'rgba(0,229,255,0.45)'; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(s2[0], s2[1]); ctx.lineTo(hs[0], hs[1]); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  function drawEraserOverlay() {
    if (!hovImg) return;
    var hs = i2s(hovImg.x, hovImg.y);
    ctx.save();
    ctx.strokeStyle = '#ff4757'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(hs[0], hs[1], Math.max(4, eraseCfg.radius * view.s), 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(hs[0], hs[1], Math.max(2, eraseCfg.radius * (1 - eraseCfg.feather) * view.s), 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawCutoutOverlay() {
    if (!cutPts.length) return;
    ctx.save();
    var sp = cutPts.map(function (p) { return i2s(p.x, p.y); });
    if (sp.length >= 3) {
      ctx.fillStyle = 'rgba(0,255,157,0.16)';
      ctx.beginPath();
      sp.forEach(function (p, i) { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
      ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = '#00ff9d'; ctx.lineWidth = 2;
    ctx.beginPath();
    sp.forEach(function (p, i) { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
    ctx.stroke();

    if (hovImg) {
      var last = sp[sp.length - 1], cur = i2s(hovImg.x, hovImg.y);
      ctx.strokeStyle = '#f0c44d'; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(cur[0], cur[1]); ctx.stroke();
      ctx.setLineDash([]);
    }
    sp.forEach(function (p, idx) {
      ctx.beginPath(); ctx.arc(p[0], p[1], idx === 0 && sp.length >= 3 ? 7 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = idx === 0 ? '#f0c44d' : '#00ff9d'; ctx.fill();
      ctx.strokeStyle = '#040911'; ctx.lineWidth = 1.5; ctx.stroke();
    });
    ctx.restore();
  }

  function drawGuideSegment(a, b, col, tag) {
    if (!a) return;
    var sa = i2s(a.x, a.y);
    ctx.save();
    ctx.fillStyle = col; ctx.strokeStyle = '#040911'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sa[0], sa[1], 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (b) {
      var sb = i2s(b.x, b.y);
      ctx.strokeStyle = '#040911'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(sa[0], sa[1]); ctx.lineTo(sb[0], sb[1]); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([7, 4]);
      ctx.beginPath(); ctx.moveTo(sa[0], sa[1]); ctx.lineTo(sb[0], sb[1]); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = col; ctx.strokeStyle = '#040911'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sb[0], sb[1], 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

      var pxD = Math.hypot(b.x - a.x, b.y - a.y);
      var lbl = tag + ': ' + pxD.toFixed(1) + ' px';
      if (doc.calibration.pxPerMeter > 0) lbl += '  |  ' + (pxD / doc.calibration.pxPerMeter).toFixed(2) + ' m';
      var mx = (sa[0] + sb[0]) / 2, my = (sa[1] + sb[1]) / 2 - 14;
      ctx.font = 'bold 11px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var tw = ctx.measureText(lbl).width + 14;
      ctx.fillStyle = 'rgba(4,9,17,0.92)'; ctx.fillRect(mx - tw / 2, my - 10, tw, 20);
      ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.strokeRect(mx - tw / 2, my - 10, tw, 20);
      ctx.fillStyle = col; ctx.fillText(lbl, mx, my + 0.5);
    }
    ctx.restore();
  }

  function drawScaleBar(isDay) {
    var screenPxPerM = doc.calibration.pxPerMeter * view.s;
    if (!(screenPxPerM > 0)) return;
    var nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000].filter(function (m) { return m * screenPxPerM >= 60; })[0] || 1000;
    var barPx = nice * screenPxPerM, x0 = 16, y0 = H - 18;
    ctx.save();
    ctx.fillStyle = isDay ? 'rgba(255,255,255,0.92)' : 'rgba(6,13,24,0.88)';
    ctx.fillRect(x0 - 6, y0 - 22, barPx + 14, 28);
    ctx.strokeStyle = isDay ? '#0f172a' : '#00ff9d'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0); ctx.lineTo(x0 + barPx, y0);
    ctx.moveTo(x0, y0 - 6); ctx.lineTo(x0, y0 + 3);
    ctx.moveTo(x0 + barPx, y0 - 6); ctx.lineTo(x0 + barPx, y0 + 3);
    ctx.stroke();
    ctx.fillStyle = isDay ? '#0f172a' : '#00ff9d';
    ctx.font = 'bold 11px ' + MONO; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(nice + ' m  (' + doc.calibration.pxPerMeter.toFixed(2) + ' px/m)', x0 + 2, y0 - 6);
    ctx.restore();
  }

  function drawViewportHud(isDay) {
    var parts = ['TOOL: ' + tool.toUpperCase(), 'ZOOM ' + Math.round(view.s * 100) + '%'];
    if (imgs.base) parts.push('BASE ' + imgs.base.naturalWidth + 'x' + imgs.base.naturalHeight + ' px');
    if (hovImg) {
      parts.push('PX (' + Math.round(hovImg.x) + ',' + Math.round(hovImg.y) + ')');
      if (doc.calibration.pxPerMeter > 0) {
        parts.push('M (' + (hovImg.x / doc.calibration.pxPerMeter).toFixed(1) + ',' + (hovImg.y / doc.calibration.pxPerMeter).toFixed(1) + ')');
      }
    }
    var txt = parts.join(' | ');
    ctx.save();
    ctx.font = 'bold 10px ' + MONO; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    var tw = Math.min(W - 20, ctx.measureText(txt).width + 16);
    ctx.fillStyle = isDay ? 'rgba(255,255,255,0.92)' : 'rgba(6,13,24,0.88)';
    ctx.fillRect(10, 10, tw, 22);
    ctx.strokeStyle = isDay ? '#94a3b8' : '#1b3b57'; ctx.lineWidth = 1;
    ctx.strokeRect(10, 10, tw, 22);
    ctx.fillStyle = isDay ? '#0f172a' : '#00e5ff';
    ctx.fillText(txt, 18, 21.5);
    ctx.restore();
  }

  // =========================================================================
  // CALIBRATION & ASSET MANAGEMENT ACTIONS
  // =========================================================================
  function applyCalibration(knownMeters) {
    var m = parseFloat(knownMeters);
    if (!(m > 0)) { setStatus('Enter a valid positive distance in meters.', true); return; }
    var p1 = calibDraft.p1 || doc.calibration.p1;
    var p2 = calibDraft.p2 || doc.calibration.p2;
    if (!p1 || !p2) { setStatus('Click two reference points on the image first.', true); return; }
    var pxDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (pxDist < 2) { setStatus('Reference points are too close together.', true); return; }
    pushUndo();
    doc.calibration = {
      pxPerMeter: +(pxDist / m).toFixed(5),
      p1: { x: +p1.x.toFixed(2), y: +p1.y.toFixed(2) },
      p2: { x: +p2.x.toFixed(2), y: +p2.y.toFixed(2) },
      knownMeters: m
    };
    persistToIDB();
    setStatus('Scale calibrated: ' + doc.calibration.pxPerMeter.toFixed(3) + ' px/m.', false);
    setTool('select');
    syncUI(); draw();
  }

  function clearCalibration() {
    pushUndo();
    doc.calibration = { pxPerMeter: 0, p1: null, p2: null, knownMeters: 10 };
    calibDraft = { p1: null, p2: null };
    persistToIDB();
    setStatus('Scale calibration cleared.', false);
    syncUI(); draw();
  }

  function duplicateSelectedAsset() {
    var a = getSelAsset();
    if (!a) return;
    pushUndo();
    var copy = normalizeAsset(JSON.parse(JSON.stringify(a)));
    copy.id = uid('ast');
    copy.name = a.name + ' (copy)';
    copy.x = +(a.x + 20).toFixed(2);
    copy.y = +(a.y + 20).toFixed(2);
    copy.locked = false;
    doc.assets.push(copy);
    selAssetId = copy.id;
    persistToIDB();
    syncUI(); draw();
  }

  function deleteSelectedAsset() {
    var a = getSelAsset();
    if (!a) return;
    pushUndo();
    doc.assets = doc.assets.filter(function (x) { return x.id !== a.id; });
    selAssetId = null;
    persistToIDB();
    syncUI(); draw();
  }

  function reorderSelectedAsset(dir) {
    var idx = -1;
    for (var i = 0; i < doc.assets.length; i++) if (doc.assets[i].id === selAssetId) { idx = i; break; }
    if (idx < 0) return;
    var ni = idx + dir;
    if (ni < 0 || ni >= doc.assets.length) return;
    pushUndo();
    var tmp = doc.assets[idx];
    doc.assets[idx] = doc.assets[ni];
    doc.assets[ni] = tmp;
    persistToIDB();
    syncUI(); draw();
  }

  // =========================================================================
  // POINTER & KEYBOARD HANDLERS (ISOLATED)
  // =========================================================================
  function posOf(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function twoPtrs() {
    var ks = Object.keys(ptrs), a = ptrs[ks[0]], b = ptrs[ks[1]];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function bindCanvas() {
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    cv.addEventListener('dblclick', function () {
      if (tool === 'cutout' && cutPts.length >= 3) extractCutoutFromBase();
      else if (tool === 'poly_draw' && cutPts.length >= 3) finalizeFreePolygon();
    });

    cv.addEventListener('pointerdown', function (e) {
      cv.setPointerCapture(e.pointerId);
      var p = posOf(e); ptrs[e.pointerId] = p;
      if (Object.keys(ptrs).length === 2) {
        var t = twoPtrs();
        drag = { m: 'pinch', d: t.d, s: view.s, imgPt: s2i(t.x, t.y) };
        return;
      }
      var ip = s2i(p.x, p.y); hovImg = ip;
      if (e.button === 1 || e.button === 2 || space || tool === 'pan' || !imgs.base) {
        drag = { m: 'pan', x: p.x, y: p.y, ox: view.ox, oy: view.oy };
        return;
      }

      if (tool === 'select') {
        var hitP = hitPinAt(p);
        if (hitP) {
          selPinId = hitP.id;
          drag = { m: 'movePin', pin: hitP, sx: ip.x, sy: ip.y, x0: hitP.x, y0: hitP.y, pushed: false };
          syncUI(); draw(); return;
        }
        var sel = getSelAsset();
        var hk = hitAssetHandle(sel, p);
        if (hk && sel) {
          if (hk === 'rot') {
            drag = { m: 'rot', a: sel, pushed: false };
            return;
          }
          var hw = sel.wPx / 2, hh = sel.hPx / 2;
          var oppMap = { tl: [hw, hh], tr: [-hw, hh], br: [-hw, -hh], bl: [hw, -hh] };
          var signMap = { tl: [-1, -1], tr: [1, -1], br: [1, 1], bl: [-1, 1] };
          var opp = oppMap[hk], sgn = signMap[hk];
          var anchor = assetLocalToImg(sel, opp[0], opp[1]);
          drag = {
            m: 'resize', a: sel, sx: sgn[0], sy: sgn[1],
            anchor: anchor, origW: sel.wPx, origH: sel.hPx,
            rad: (sel.rotationDeg || 0) * D, pushed: false
          };
          return;
        }
        var hit = hitAssetAt(ip);
        if (hit) {
          selAssetId = hit.id;
          drag = { m: 'move', a: hit, sx: ip.x, sy: ip.y, x0: hit.x, y0: hit.y, pushed: false };
          syncUI(); draw(); return;
        }
        selAssetId = null;
        drag = { m: 'pan', x: p.x, y: p.y, ox: view.ox, oy: view.oy };
        syncUI(); draw(); return;
      }

      if (tool === 'clone') {
        if (e.altKey || cloneCfg.pickMode || !cloneCfg.src) {
          cloneCfg.src = { x: +ip.x.toFixed(2), y: +ip.y.toFixed(2) };
          cloneCfg.pickMode = false;
          setStatus('Clone source set at (' + Math.round(ip.x) + ', ' + Math.round(ip.y) + '). Click/drag on target area to clean (Alt+Click to re-pick).', false);
          syncUI(); draw(); return;
        }
        pushUndo();
        doc.layers.cleanup.visible = true;
        var p0 = {
          id: uid('ptc'),
          sx: cloneCfg.src.x, sy: cloneCfg.src.y,
          dx: +ip.x.toFixed(2), dy: +ip.y.toFixed(2),
          r: cloneCfg.radius, feather: cloneCfg.feather,
          opacity: cloneCfg.opacity, rotDeg: cloneCfg.rotDeg
        };
        doc.patches.push(p0);
        incrementalStampPatch(p0);
        drag = { m: 'clone', startSrc: { x: cloneCfg.src.x, y: cloneCfg.src.y }, startDst: ip, lastDst: ip };
        draw(); return;
      }

      if (tool === 'erase') {
        if (!hasActiveCleanupImg() && !doc.patches.length) {
          setStatus('Nothing on 02_Ground_Cleanup to erase yet.', true);
          return;
        }
        pushUndo();
        var pt0 = { x: +ip.x.toFixed(2), y: +ip.y.toFixed(2) };
        var st = {
          id: uid('ers'),
          r: eraseCfg.radius,
          feather: eraseCfg.feather,
          opacity: eraseCfg.opacity,
          pts: [pt0]
        };
        doc.cleanupErases.push(st);
        incrementalErase(pt0, null, st, true);
        drag = { m: 'erase', stroke: st, last: pt0 };
        draw(); return;
      }

      if (tool === 'cutout') {
        if (cutPts.length >= 3) {
          var firstSp = i2s(cutPts[0].x, cutPts[0].y);
          if (Math.hypot(p.x - firstSp[0], p.y - firstSp[1]) <= 13) {
            extractCutoutFromBase();
            return;
          }
        }
        cutPts.push({ x: +ip.x.toFixed(2), y: +ip.y.toFixed(2) });
        setStatus('Cutout polygon: ' + cutPts.length + ' points. Click first yellow point or press Enter to extract 1:1 cutout.', false);
        syncUI(); draw(); return;
      }

      if (tool === 'futsal_rect') {
        if (!drag || drag.m !== 'futsal_rect') {
          drag = { m: 'futsal_rect', p1: ip, p2: ip };
          setStatus('Drag or release to place un-grassed futsal pitch + chain-link + red top net...', false);
        }
        draw(); return;
      }

      if (tool === 'building_add') {
        addBuildingAt(ip);
        return;
      }

      if (tool === 'tent_add') {
        addTentAt(ip);
        return;
      }

      if (tool === 'tree_add') {
        addTreeAt(ip);
        return;
      }

      if (tool === 'poly_draw') {
        if (cutPts.length >= 3) {
          var firstS = i2s(cutPts[0].x, cutPts[0].y);
          if (Math.hypot(p.x - firstS[0], p.y - firstS[1]) <= 13) {
            finalizeFreePolygon(); return;
          }
        }
        cutPts.push({ x: +ip.x.toFixed(2), y: +ip.y.toFixed(2) });
        setStatus('Polygon points: ' + cutPts.length + ' (click first yellow point or press Enter to finish).', false);
        syncUI(); draw(); return;
      }

      if (tool === 'pin') {
        var hp2 = hitPinAt(p);
        if (hp2) {
          selPinId = hp2.id;
          drag = { m: 'movePin', pin: hp2, sx: ip.x, sy: ip.y, x0: hp2.x, y0: hp2.y, pushed: false };
          syncUI(); draw(); return;
        }
        pushUndo();
        doc.layers.overlays.visible = true;
        var catObj = (S.SatExport && S.SatExport.PIN_CATS[pinCat]) || { color: '#0284c7' };
        var idxNum = doc.overlays.pins.length + 1;
        var np = {
          id: uid('pin'),
          x: +ip.x.toFixed(2),
          y: +ip.y.toFixed(2),
          cat: pinCat,
          color: catObj.color,
          labelEn: 'Point ' + idxNum,
          labelAr: 'موقع ' + idxNum,
          showTag: false
        };
        doc.overlays.pins.push(np);
        selPinId = np.id;
        persistToIDB();
        setStatus('Placed Pin #' + idxNum + '. Edit its AR/EN legend label in the right panel.', false);
        syncUI(); draw(); return;
      }

      if (tool === 'calibrate') {
        if (!calibDraft.p1 || (calibDraft.p1 && calibDraft.p2)) {
          calibDraft = { p1: ip, p2: null };
          setStatus('Calibration Point 1 set. Click Point 2 on opposite end of reference.', false);
        } else {
          calibDraft.p2 = ip;
          var pxD = Math.hypot(ip.x - calibDraft.p1.x, ip.y - calibDraft.p1.y);
          setStatus('Calibration line: ' + pxD.toFixed(1) + ' px. Enter real meters and click Apply Scale.', false);
        }
        syncUI(); draw(); return;
      }

      if (tool === 'measure') {
        if (measPts.length >= 2) measPts = [];
        measPts.push(ip);
        if (measPts.length === 2) {
          var dPx = Math.hypot(measPts[1].x - measPts[0].x, measPts[1].y - measPts[0].y);
          setStatus('Measured: ' + dPx.toFixed(1) + ' px' + (doc.calibration.pxPerMeter > 0 ? (' | ' + (dPx / doc.calibration.pxPerMeter).toFixed(2) + ' m') : ' (calibrate for meters)'), false);
        }
        draw(); return;
      }
    });

    cv.addEventListener('pointermove', function (e) {
      var p = posOf(e); if (ptrs[e.pointerId]) ptrs[e.pointerId] = p;
      var ip = s2i(p.x, p.y); hovImg = ip;
      if (!drag) { draw(); return; }

      if (drag.m === 'pan') {
        view.ox = drag.ox + (p.x - drag.x);
        view.oy = drag.oy + (p.y - drag.y);
      } else if (drag.m === 'pinch' && Object.keys(ptrs).length >= 2) {
        var t = twoPtrs();
        var ns = clamp(drag.s * t.d / drag.d, minScale(), 16);
        view.s = ns;
        view.ox = t.x - drag.imgPt.x * ns;
        view.oy = t.y - drag.imgPt.y * ns;
      } else if (drag.m === 'futsal_rect') {
        drag.p2 = ip;
      } else if (drag.m === 'move') {
        if (!drag.pushed) { pushUndo(); drag.pushed = true; }
        drag.a.x = +(drag.x0 + (ip.x - drag.sx)).toFixed(2);
        drag.a.y = +(drag.y0 + (ip.y - drag.sy)).toFixed(2);
      } else if (drag.m === 'movePin') {
        if (!drag.pushed) { pushUndo(); drag.pushed = true; }
        drag.pin.x = +(drag.x0 + (ip.x - drag.sx)).toFixed(2);
        drag.pin.y = +(drag.y0 + (ip.y - drag.sy)).toFixed(2);
      } else if (drag.m === 'rot') {
        if (!drag.pushed) { pushUndo(); drag.pushed = true; }
        var deg = Math.atan2(ip.y - drag.a.y, ip.x - drag.a.x) / D + 90;
        deg = ((deg % 360) + 360) % 360;
        if (e.shiftKey) deg = Math.round(deg / 15) * 15;
        drag.a.rotationDeg = +deg.toFixed(1);
      } else if (drag.m === 'resize') {
        if (!drag.pushed) { pushUndo(); drag.pushed = true; }
        var ux = Math.cos(drag.rad), uy = Math.sin(drag.rad);
        var vx = -Math.sin(drag.rad), vy = Math.cos(drag.rad);
        var ddx = ip.x - drag.anchor.x, ddy = ip.y - drag.anchor.y;
        var nw = Math.max(8, (ddx * ux + ddy * uy) * drag.sx);
        var nh = Math.max(8, (ddx * vx + ddy * vy) * drag.sy);
        if (drag.a.lockAspect || e.shiftKey) {
          var asp = drag.origW / Math.max(1, drag.origH);
          if (nw / drag.origW >= nh / drag.origH) nh = nw / asp; else nw = nh * asp;
        }
        drag.a.x = +(drag.anchor.x + (drag.sx * nw / 2) * ux + (drag.sy * nh / 2) * vx).toFixed(2);
        drag.a.y = +(drag.anchor.y + (drag.sx * nw / 2) * uy + (drag.sy * nh / 2) * vy).toFixed(2);
        drag.a.wPx = +nw.toFixed(2);
        drag.a.hPx = +nh.toFixed(2);
      } else if (drag.m === 'clone') {
        var spacing = Math.max(4, cloneCfg.radius * 0.35);
        if (Math.hypot(ip.x - drag.lastDst.x, ip.y - drag.lastDst.y) >= spacing) {
          var sx = cloneCfg.followDrag ? (drag.startSrc.x + (ip.x - drag.startDst.x)) : drag.startSrc.x;
          var sy = cloneCfg.followDrag ? (drag.startSrc.y + (ip.y - drag.startDst.y)) : drag.startSrc.y;
          var ptc = {
            id: uid('ptc'),
            sx: +sx.toFixed(2), sy: +sy.toFixed(2),
            dx: +ip.x.toFixed(2), dy: +ip.y.toFixed(2),
            r: cloneCfg.radius, feather: cloneCfg.feather,
            opacity: cloneCfg.opacity, rotDeg: cloneCfg.rotDeg
          };
          doc.patches.push(ptc);
          incrementalStampPatch(ptc);
          drag.lastDst = ip;
        }
      } else if (drag.m === 'erase') {
        if (Math.hypot(ip.x - drag.last.x, ip.y - drag.last.y) >= Math.max(3, eraseCfg.radius * 0.22)) {
          var nxt = { x: +ip.x.toFixed(2), y: +ip.y.toFixed(2) };
          drag.stroke.pts.push(nxt);
          incrementalErase(drag.last, nxt, drag.stroke, false);
          drag.last = nxt;
        }
      }
      draw();
    });

    function up(e) {
      delete ptrs[e.pointerId];
      if (drag && drag.m === 'futsal_rect') {
        var dRect = Math.hypot(drag.p2.x - drag.p1.x, drag.p2.y - drag.p1.y);
        var fp1 = drag.p1, fp2 = drag.p2;
        drag = null;
        if (dRect >= 6) createFutsalFromRect(fp1, fp2);
        draw(); return;
      }
      if (drag) {
        if ((drag.m === 'move' || drag.m === 'movePin' || drag.m === 'rot' || drag.m === 'resize') && drag.pushed) {
          persistToIDB(); syncUI();
        } else if (drag.m === 'clone' || drag.m === 'erase') {
          persistToIDB(); syncUI();
        }
      }
      if (!Object.keys(ptrs).length || (drag && drag.m === 'pinch')) drag = null;
    }
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = posOf(e), before = s2i(p.x, p.y);
      var k = e.deltaY < 0 ? 1.14 : 0.87;
      view.s = clamp(view.s * k, minScale(), 16);
      view.ox = p.x - before.x * view.s;
      view.oy = p.y - before.y * view.s;
      draw();
    }, { passive: false });
  }
  function onKeyDown(e) {
    if (!isOpen) return;
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === ' ') { space = true; e.preventDefault(); return; }
    if (e.key === 'Escape') {
      calibDraft = { p1: null, p2: null };
      measPts = [];
      cutPts = [];
      cloneCfg.pickMode = false;
      setTool('select');
      syncUI(); draw(); return;
    }
    if (tool === 'cutout' || tool === 'poly_draw') {
      if (e.key === 'Backspace' && cutPts.length) { e.preventDefault(); cutPts.pop(); syncUI(); draw(); return; }
      if (e.key === 'Enter' && cutPts.length >= 3) {
        e.preventDefault();
        if (tool === 'poly_draw') finalizeFreePolygon();
        else extractCutoutFromBase();
        return;
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault(); doRedo(); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      if (getSelAsset()) { e.preventDefault(); duplicateSelectedAsset(); } return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (getSelPin() && tool === 'pin') {
        e.preventDefault();
        pushUndo();
        doc.overlays.pins = doc.overlays.pins.filter(function (x) { return x.id !== selPinId; });
        selPinId = null; persistToIDB(); syncUI(); draw();
      } else if (getSelAsset()) {
        e.preventDefault(); deleteSelectedAsset();
      }
    }
  }

  function onKeyUp(e) { if (e.key === ' ') space = false; }
  // =========================================================================
  // UI BUILD & SYNC (CYBER HUD + DAYLIGHT DESIGN MODE COMPATIBLE)
  // =========================================================================
  function ensureCss() {
    if (document.getElementById('aj-satc-css')) return;
    var st = document.createElement('style');
    st.id = 'aj-satc-css';
    st.textContent =
      '.satc{position:fixed;inset:0;z-index:945;background:var(--bg-deep,#060d18);color:var(--txt-main,#d9ecff);display:flex;flex-direction:column;font-family:' + MONO + '}' +
      '.satc.hide{display:none}' +
      '.satc-top{display:flex;align-items:center;gap:5px;padding:6px 10px;background:var(--bg-panel,#0a1626);border-bottom:1px solid var(--border-petrol,#1b3b57);overflow-x:auto;flex-shrink:0}' +
      '.satc-title{background:var(--grad-sig,linear-gradient(90deg,#00b4d8,#00ff9d));-webkit-background-clip:text;background-clip:text;color:transparent;font-size:12px;font-weight:800;letter-spacing:.6px;white-space:nowrap;margin-right:4px}' +
      '.satc .sp{flex:1;min-width:8px}' +
      '.satc-body{flex:1;display:flex;min-height:0;overflow:hidden}' +
      '.satc-side{width:265px;background:var(--bg-panel,#0a1626);border-right:1px solid var(--border-petrol,#1b3b57);padding:9px;overflow-y:auto;display:flex;flex-direction:column;gap:7px;flex-shrink:0}' +
      '.satc-side.r{border-right:0;border-left:1px solid var(--border-petrol,#1b3b57);width:280px}' +
      '.satc-side h4{margin:6px 0 2px;font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:var(--txt-sub,#78b5a0);border-bottom:1px solid var(--border-petrol,#1b3b57);padding-bottom:3px}' +
      '.satc-side h4:first-child{margin-top:0}' +
      '.satc-cv{flex:1;position:relative;min-width:0;min-height:0;overflow:hidden;background:var(--bg-input,#040911)}' +
      '#scCv{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}' +
      '.satc-card{background:var(--bg-input,#040911);border:1px solid var(--border-petrol,#1b3b57);border-radius:5px;padding:7px 8px;display:flex;flex-direction:column;gap:5px;font-size:11px}' +
      '.satc-layer{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:4px 6px;border:1px solid var(--border-petrol,#1b3b57);border-radius:4px;background:var(--bg-input,#040911);font-size:11px}' +
      '.satc-layer label{display:flex;align-items:center;gap:6px;margin:0;cursor:pointer;color:var(--txt-main,#d9ecff)!important}' +
      '.satc-tag{font-size:9px;padding:2px 5px;border-radius:3px;border:1px solid var(--border-petrol,#1b3b57);color:var(--txt-mut,#7f9bb5);white-space:nowrap}' +
      '.satc-tag.lk{border-color:var(--amber,#f0c44d);color:var(--amber,#f0c44d)}' +
      '.satc-tag.ok{border-color:var(--glow-green,#00ff9d);color:var(--glow-green,#00ff9d)}' +
      '.satc-alist{display:flex;flex-direction:column;gap:4px;max-height:190px;overflow-y:auto}' +
      '.satc-ait{display:flex;align-items:center;justify-content:space-between;gap:5px;padding:5px 6px;border:1px solid var(--border-petrol,#1b3b57);border-radius:4px;background:var(--bg-input,#040911);cursor:pointer;font-size:11px}' +
      '.satc-ait.sel{border-color:var(--glow-green,#00ff9d);background:rgba(0,255,157,.1)}' +
      '.satc-ait span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}' +
      '.satc-grid2{display:grid;grid-template-columns:1fr 1fr;gap:5px}' +
      '.satc-foot{display:flex;align-items:center;gap:10px;padding:4px 10px;background:var(--bg-panel,#0a1626);border-top:1px solid var(--border-petrol,#1b3b57);font-size:10px;flex-shrink:0}' +
      '#scStatus{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--glow-cyan,#00e5ff)}' +
      '#scIdb{color:var(--glow-green,#00ff9d);white-space:nowrap}' +
      '@media(max-width:920px){.satc-body{flex-direction:column}.satc-side,.satc-side.r{width:100%;max-height:185px;border:0;border-bottom:1px solid var(--border-petrol,#1b3b57)}.satc-side.r{border-bottom:0;border-top:1px solid var(--border-petrol,#1b3b57)}}';
    document.head.appendChild(st);
  }

  function setTool(t) {
    tool = t;
    if (t !== 'measure') measPts = [];
    if (t !== 'cutout' && t !== 'poly_draw') cutPts = [];
    if (t !== 'clone') cloneCfg.pickMode = false;
    if (!ov) return;
    [].forEach.call(ov.querySelectorAll('[data-sctool]'), function (b) {
      b.classList.toggle('on', b.dataset.sctool === t);
    });
    if (cv) cv.style.cursor = t === 'pan' ? 'grab' : t === 'select' ? 'default' : 'crosshair';
    syncUI();
    draw();
  }

  function syncUndoBtns() {
    if (!ov) return;
    ov.querySelector('#scUndo').disabled = !undoStack.length;
    ov.querySelector('#scRedo').disabled = !redoStack.length;
  }

  function getCadScaleHint() {
    try {
      var parts = [];
      if (St && St.project && St.project.meta && St.project.meta.perimeterM > 0) {
        parts.push('Site Perim: ' + Math.round(St.project.meta.perimeterM) + ' m');
      }
      if (S.Engine && S.Engine.getSelected && S.Engine.statsOf) {
        var sf = S.Engine.getSelected();
        if (sf && sf.geometryType === 'polygon') {
          var st = S.Engine.statsOf(sf);
          if (st) parts.push('Selected (' + (sf.en_name || sf.category) + '): ' + st.w.toFixed(1) + 'x' + st.d.toFixed(1) + ' m');
        }
      }
      return parts.length ? ('AJ-GeoCAD Ref: ' + parts.join(' | ')) : 'Tip: Calibrate using a known building wall or pitch length from AJ-GeoCAD.';
    } catch (e) { return ''; }
  }

  function renderAssetInspector() {
    var box = ov.querySelector('#scAssetInsp');
    var a = getSelAsset();
    if (!a) {
      box.innerHTML = '<div class="mut">Select an asset on the canvas or from 03_Movable_Assets list to move, resize, rotate, or blend.</div>';
      return;
    }
    var ppm = doc.calibration.pxPerMeter || 0;
    var wM = ppm > 0 ? (a.wPx / ppm).toFixed(2) : '';
    var hM = ppm > 0 ? (a.hPx / ppm).toFixed(2) : '';
    var fl = a.filters || { brightness: 100, contrast: 100, saturation: 100, warmth: 0, blurPx: 0, grain: 0 };
    var prHtml = (S.SatBlending && S.SatBlending.PRESETS)
      ? Object.keys(S.SatBlending.PRESETS).map(function (k) {
          return '<option value="' + k + '">' + esc(S.SatBlending.PRESETS[k].label) + '</option>';
        }).join('')
      : '';

    box.innerHTML =
      '<label>Asset Name<input type="text" id="saName" value="' + esc(a.name) + '"></label>' +
      (ppm > 0
        ? '<div class="satc-grid2">' +
            '<label>Width (m)<input type="number" id="saWm" step="0.1" min="0.2" value="' + wM + '"></label>' +
            '<label>Height (m)<input type="number" id="saHm" step="0.1" min="0.2" value="' + hM + '"></label>' +
          '</div>'
        : '<div class="mut">Calibrate scale (px/m) to enter exact dimensions in meters.</div>') +
      '<div class="satc-grid2">' +
        '<label>Width (px)<input type="number" id="saWpx" step="1" min="8" value="' + Math.round(a.wPx) + '"></label>' +
        '<label>Height (px)<input type="number" id="saHpx" step="1" min="8" value="' + Math.round(a.hPx) + '"></label>' +
      '</div>' +
      '<label class="ck"><input type="checkbox" id="saLockAsp"' + (a.lockAspect ? ' checked' : '') + '>Lock Aspect Ratio</label>' +
      '<label>Rotation (<span id="saRotV">' + Math.round(a.rotationDeg || 0) + '</span>&deg;)' +
        '<input type="range" id="saRot" min="0" max="359" step="0.5" value="' + (a.rotationDeg || 0) + '">' +
      '</label>' +
      '<div class="satc-grid2">' +
        '<label>Angle (&deg;)<input type="number" id="saRotN" step="0.5" value="' + (a.rotationDeg || 0) + '"></label>' +
        '<label>Opacity (<span id="saOpV">' + Math.round((a.opacity != null ? a.opacity : 1) * 100) + '</span>%)<input type="range" id="saOp" min="10" max="100" step="1" value="' + Math.round((a.opacity != null ? a.opacity : 1) * 100) + '"></label>' +
      '</div>' +
      '<div class="row">' +
        '<button id="saFlipH"' + (a.flipX ? ' class="on"' : '') + '>Flip H</button>' +
        '<button id="saFlipV"' + (a.flipY ? ' class="on"' : '') + '>Flip V</button>' +
        '<button id="saLock"' + (a.locked ? ' class="amb"' : '') + '>' + (a.locked ? 'Unlock' : 'Lock') + '</button>' +
      '</div>' +
      '<div class="row">' +
        '<button id="saUp">Bring Up</button>' +
        '<button id="saDn">Send Down</button>' +
        '<button id="saDup" class="cy">Clone</button>' +
      '</div>' +
      (a.source === 'cutout'
        ? '<div class="row"><button id="saCleanA" class="amb">Clean Old Spot (A) ➔ Clone Patch</button></div>'
        : '') +
      '<div class="satc-card" style="margin-top:4px">' +
        '<b>Satellite Blend &amp; Shadow Match</b>' +
        '<select id="saPreset"><option value="">-- Quick Surface Preset --</option>' + prHtml + '</select>' +
        '<div class="satc-grid2">' +
          '<label class="ck"><input type="checkbox" id="saShOn"' + (a.shadowEnabled !== false ? ' checked' : '') + '>Cast Shadow</label>' +
          '<label>Height (m)<input type="number" id="saElev" step="0.2" min="0" max="40" value="' + (a.elevationM != null ? a.elevationM : 2.5) + '"></label>' +
        '</div>' +
        '<label>Brightness (<span id="saBrV">' + fl.brightness + '</span>%)<input type="range" id="saBr" min="50" max="150" step="1" value="' + fl.brightness + '"></label>' +
        '<label>Contrast (<span id="saCtV">' + fl.contrast + '</span>%)<input type="range" id="saCt" min="50" max="150" step="1" value="' + fl.contrast + '"></label>' +
        '<label>Saturation (<span id="saSaV">' + fl.saturation + '</span>%)<input type="range" id="saSa" min="0" max="200" step="1" value="' + fl.saturation + '"></label>' +
        '<label>Warmth / Tint (<span id="saWmV">' + (fl.warmth || 0) + '</span>)<input type="range" id="saWm" min="-50" max="50" step="1" value="' + (fl.warmth || 0) + '"></label>' +
        '<label>Sat Softness Blur (<span id="saBlV">' + (fl.blurPx || 0) + '</span> px)<input type="range" id="saBl" min="0" max="2" step="0.1" value="' + (fl.blurPx || 0) + '"></label>' +
        '<label>Sensor Grain (<span id="saGrV">' + (fl.grain || 0) + '</span>)<input type="range" id="saGr" min="0" max="40" step="1" value="' + (fl.grain || 0) + '"></label>' +
      '</div>' +
      '<div class="row"><button id="saDel" class="dng">Delete Asset</button></div>';

    box.querySelector('#saName').onchange = function () { pushUndo(); a.name = this.value.trim() || 'Asset'; persistToIDB(); syncUI(); draw(); };
    box.querySelector('#saLockAsp').onchange = function () { pushUndo(); a.lockAspect = !!this.checked; persistToIDB(); };

    function setDimsPx(nw, nh, changedAxis) {
      if (!(nw > 4) || !(nh > 4)) return;
      pushUndo();
      var asp = a.naturalW / Math.max(1, a.naturalH);
      if (a.lockAspect) {
        if (changedAxis === 'w') nh = nw / asp; else nw = nh * asp;
      }
      a.wPx = +nw.toFixed(2); a.hPx = +nh.toFixed(2);
      persistToIDB(); syncUI(); draw();
    }
    if (ppm > 0) {
      box.querySelector('#saWm').onchange = function () { setDimsPx((parseFloat(this.value) || 1) * ppm, a.hPx, 'w'); };
      box.querySelector('#saHm').onchange = function () { setDimsPx(a.wPx, (parseFloat(this.value) || 1) * ppm, 'h'); };
    }
    box.querySelector('#saWpx').onchange = function () { setDimsPx(parseFloat(this.value) || 8, a.hPx, 'w'); };
    box.querySelector('#saHpx').onchange = function () { setDimsPx(a.wPx, parseFloat(this.value) || 8, 'h'); };

    var rotPushed = false;
    box.querySelector('#saRot').oninput = function () {
      if (!rotPushed) { pushUndo(); rotPushed = true; }
      a.rotationDeg = +this.value;
      box.querySelector('#saRotV').textContent = Math.round(a.rotationDeg);
      box.querySelector('#saRotN').value = a.rotationDeg;
      draw();
    };
    box.querySelector('#saRot').onchange = function () { rotPushed = false; persistToIDB(); };
    box.querySelector('#saRotN').onchange = function () {
      pushUndo();
      a.rotationDeg = (((parseFloat(this.value) || 0) % 360) + 360) % 360;
      persistToIDB(); syncUI(); draw();
    };

    var opPushed = false;
    box.querySelector('#saOp').oninput = function () {
      if (!opPushed) { pushUndo(); opPushed = true; }
      a.opacity = (+this.value) / 100;
      box.querySelector('#saOpV').textContent = this.value;
      draw();
    };
    box.querySelector('#saOp').onchange = function () { opPushed = false; persistToIDB(); };

    box.querySelector('#saFlipH').onclick = function () { pushUndo(); a.flipX = !a.flipX; persistToIDB(); syncUI(); draw(); };
    box.querySelector('#saFlipV').onclick = function () { pushUndo(); a.flipY = !a.flipY; persistToIDB(); syncUI(); draw(); };
    box.querySelector('#saLock').onclick = function () { pushUndo(); a.locked = !a.locked; persistToIDB(); syncUI(); draw(); };
    box.querySelector('#saUp').onclick = function () { reorderSelectedAsset(1); };
    box.querySelector('#saDn').onclick = function () { reorderSelectedAsset(-1); };
    box.querySelector('#saDup').onclick = duplicateSelectedAsset;
    box.querySelector('#saDel').onclick = deleteSelectedAsset;

    box.querySelector('#saPreset').onchange = function () {
      var pk = this.value, pr = S.SatBlending && S.SatBlending.PRESETS[pk];
      this.value = '';
      if (!pr) return;
      pushUndo();
      if (pr.elevationM !== null) a.elevationM = pr.elevationM;
      if (pr.shadowEnabled !== null) a.shadowEnabled = pr.shadowEnabled;
      a.filters = Object.assign({}, pr.filters);
      persistToIDB(); syncUI(); draw();
    };
    box.querySelector('#saShOn').onchange = function () { pushUndo(); a.shadowEnabled = !!this.checked; persistToIDB(); draw(); };
    box.querySelector('#saElev').onchange = function () {
      pushUndo(); a.elevationM = Math.max(0, parseFloat(this.value) || 0);
      if (a.elevationM === 0) a.shadowEnabled = false;
      persistToIDB(); syncUI(); draw();
    };
    function bindFilterSlider(id, valId, key, isFloat) {
      var el = box.querySelector(id), pushed = false;
      el.oninput = function () {
        if (!pushed) { pushUndo(); pushed = true; }
        a.filters[key] = isFloat ? parseFloat(this.value) : (+this.value);
        box.querySelector(valId).textContent = this.value;
        draw();
      };
      el.onchange = function () { pushed = false; persistToIDB(); };
    }
    bindFilterSlider('#saBr', '#saBrV', 'brightness', false);
    bindFilterSlider('#saCt', '#saCtV', 'contrast', false);
    bindFilterSlider('#saSa', '#saSaV', 'saturation', false);
    bindFilterSlider('#saWm', '#saWmV', 'warmth', false);
    bindFilterSlider('#saBl', '#saBlV', 'blurPx', true);
    bindFilterSlider('#saGr', '#saGrV', 'grain', false);

    if (box.querySelector('#saCleanA')) {
      box.querySelector('#saCleanA').onclick = function () {
        cloneCfg.pickMode = !cloneCfg.src;
        setTool('clone');
        setStatus(cloneCfg.src ? 'Paint over old Spot (A) to cover it with clean soil (Alt+Click to pick new source).' : 'Click a clean ground spot to set Clone Source, then paint over Spot (A).', false);
      };
    }
  }

  function syncSunDirBadge() {
    if (!ov) return;
    var az = doc.sun.azimuthDeg != null ? doc.sun.azimuthDeg : 135;
    var cast = ((az + 180) % 360 + 360) % 360;
    var cLbl = (S.SatBlending && S.SatBlending.compassLabel) ? S.SatBlending.compassLabel : function () { return ''; };
    var el = ov.querySelector('#scSunDirTxt');
    if (el) el.textContent = 'Sun: ' + Math.round(az) + '° ' + cLbl(az) + ' ➔ Shadow casts: ' + Math.round(cast) + '° ' + cLbl(cast);
  }

  function renderPinsPanel() {
    var listEl = ov.querySelector('#scPinList');
    var editEl = ov.querySelector('#scPinEdit');
    var pins = (doc.overlays && doc.overlays.pins) || [];
    if (!pins.length) {
      listEl.innerHTML = '<div class="mut">No pins placed yet. Click "+ Place Pin (1..N)" then click on the map.</div>';
      editEl.innerHTML = '';
      return;
    }
    listEl.innerHTML = pins.map(function (p, i) {
      var col = p.color || '#0284c7';
      return '<div class="satc-ait' + (p.id === selPinId ? ' sel' : '') + '" data-pid="' + esc(p.id) + '">' +
        '<b style="display:inline-block;width:16px;height:16px;line-height:16px;text-align:center;border-radius:50%;background:' + esc(col) + ';color:#fff;font-size:10px">' + (i + 1) + '</b>' +
        '<span>' + esc(p.labelEn || p.labelAr || ('Point ' + (i + 1))) + '</span>' +
      '</div>';
    }).join('');
    [].forEach.call(listEl.querySelectorAll('[data-pid]'), function (el) {
      el.onclick = function () { selPinId = el.dataset.pid; syncUI(); draw(); };
    });

    var sp = getSelPin();
    if (!sp) { editEl.innerHTML = ''; return; }
    editEl.innerHTML =
      '<div class="satc-card" style="margin-top:4px">' +
        '<b>Selected Pin Settings</b>' +
        '<label>Legend EN<input type="text" id="spEn" value="' + esc(sp.labelEn || '') + '"></label>' +
        '<label>Legend AR<input type="text" id="spAr" dir="rtl" value="' + esc(sp.labelAr || '') + '"></label>' +
        '<div class="satc-grid2">' +
          '<label>Color<input type="color" id="spCol" value="' + esc(sp.color || '#0284c7') + '"></label>' +
          '<label class="ck" style="align-self:end"><input type="checkbox" id="spTag"' + (sp.showTag ? ' checked' : '') + '>Tag on Map</label>' +
        '</div>' +
        '<div class="row"><button id="spDel" class="dng">Delete Pin</button></div>' +
      '</div>';
    editEl.querySelector('#spEn').onchange = function () { pushUndo(); sp.labelEn = this.value; persistToIDB(); syncUI(); draw(); };
    editEl.querySelector('#spAr').onchange = function () { pushUndo(); sp.labelAr = this.value; persistToIDB(); syncUI(); draw(); };
    editEl.querySelector('#spCol').onchange = function () { pushUndo(); sp.color = this.value; persistToIDB(); syncUI(); draw(); };
    editEl.querySelector('#spTag').onchange = function () { pushUndo(); sp.showTag = !!this.checked; persistToIDB(); draw(); };
    editEl.querySelector('#spDel').onclick = function () {
      pushUndo();
      doc.overlays.pins = doc.overlays.pins.filter(function (x) { return x.id !== sp.id; });
      selPinId = null; persistToIDB(); syncUI(); draw();
    };
  }

  function syncExportEstimator() {
    if (!ov || !S.SatExport) return;
    var paper = doc.overlays.paper || 'A2_L';
    ov.querySelector('#scPaper').value = paper;
    ov.querySelector('#scDpi').value = String(doc.overlays.dpi || 200);
    ov.querySelector('#scCustBox').style.display = paper === 'CUSTOM' ? 'grid' : 'none';
    if (document.activeElement !== ov.querySelector('#scCustW')) ov.querySelector('#scCustW').value = doc.overlays.customWcm || 60;
    if (document.activeElement !== ov.querySelector('#scCustH')) ov.querySelector('#scCustH').value = doc.overlays.customHcm || 40;

    var bw = imgs.base ? imgs.base.naturalWidth : 0;
    var bh = imgs.base ? imgs.base.naturalHeight : 0;
    var est = S.SatExport.estimateExport(doc.overlays, bw, bh);
    var col = est.level === 'safe' ? 'var(--glow-green,#00ff9d)' : est.level === 'warn' ? 'var(--amber,#f0c44d)' : 'var(--danger,#ff4757)';
    var el = ov.querySelector('#scRamEst');
    el.style.borderColor = col;
    el.innerHTML =
      '<div>Output: <b>' + est.pw + ' × ' + est.ph + ' px</b> (' + est.mp.toFixed(1) + ' MP)</div>' +
      '<div>Est. Peak RAM: <b>~' + Math.round(est.estPeakMB) + ' MB</b> | Max Edge: ' + est.maxEdge + ' / ' + MAX_SAFE_EDGE + ' px</div>' +
      (est.effDpi > 0 ? ('<div>Base Source Effective DPI: <b style="color:' + (est.effDpi < 120 ? 'var(--amber,#f0c44d)' : 'var(--glow-green,#00ff9d)') + '">' + est.effDpi + ' DPI</b>' + (est.effDpi < 120 ? ' (load higher-res base for sharp wall print)' : '') + '</div>') : '') +
      '<div style="color:' + col + '">' + esc(est.note) + '</div>';
    ov.querySelector('#scExpPoster').disabled = (est.level === 'block');
  }

  function syncUI() {
    if (!ov) return;
    syncUndoBtns();
    setIdbBadge(idbStatus);

    var bi = ov.querySelector('#scBaseInfo');
    if (imgs.base && doc.base.width) {
      var mp = (doc.base.width * doc.base.height) / 1e6;
      var mb = (doc.base.byteSize || 0) / (1024 * 1024);
      bi.innerHTML =
        '<b>' + esc(doc.base.name || 'Satellite Image') + '</b>' +
        '<div>Resolution: <b>' + doc.base.width + ' x ' + doc.base.height + ' px</b> (' + mp.toFixed(2) + ' MP)</div>' +
        '<div>Original Size: <b>' + mb.toFixed(2) + ' MB</b> (Zero-Compression)</div>';
    } else {
      bi.innerHTML = '<span class="mut">No base satellite image loaded yet.</span>';
    }

    ov.querySelector('#scLayBase').checked = !!doc.layers.base.visible;
    ov.querySelector('#scLayClean').checked = !!doc.layers.cleanup.visible;
    ov.querySelector('#scLayAssets').checked = !!doc.layers.assets.visible;
    ov.querySelector('#scLayOver').checked = !!doc.layers.overlays.visible;
    var cop = Math.round((doc.layers.cleanup.opacity != null ? doc.layers.cleanup.opacity : 1) * 100);
    ov.querySelector('#scCleanOp').value = cop;
    ov.querySelector('#scCleanOpV').textContent = cop;

    ov.querySelector('#scCleanStat').textContent =
      (hasActiveCleanupImg() ? ('Image: ' + doc.cleanupImage.name) : 'Image: None') +
      ' | Patches: ' + doc.patches.length + ' | Erases: ' + doc.cleanupErases.length;
    ov.querySelector('#scSrcStat').textContent = cloneCfg.src
      ? ('Source: (' + Math.round(cloneCfg.src.x) + ', ' + Math.round(cloneCfg.src.y) + ')')
      : 'Source: Not picked (Alt+Click)';
    ov.querySelector('#scPickSrc').classList.toggle('on', !!cloneCfg.pickMode);

    var al = ov.querySelector('#scAssetList');
    if (!doc.assets.length) {
      al.innerHTML = '<div class="mut">No assets yet. Add Futsal, Building, Tent, Tree, Polygon, or PNGs.</div>';
    } else {
      al.innerHTML = doc.assets.slice().reverse().map(function (a) {
        var tagLbl = a.source === 'cutout' ? 'CUT' : a.source === 'futsal' ? 'PITCH' : a.source === 'bldg' ? 'BLDG' : a.source === 'tent' ? 'TENT' : a.source === 'tree' ? 'TREE' : a.source === 'poly' ? 'POLY' : 'PNG';
        return '<div class="satc-ait' + (a.id === selAssetId ? ' sel' : '') + '" data-aid="' + esc(a.id) + '">' +
          '<input type="checkbox" data-avis="' + esc(a.id) + '"' + (a.visible ? ' checked' : '') + ' title="Toggle visibility">' +
          '<span>' + esc(a.name) + '</span>' +
          '<b class="satc-tag' + (a.source === 'cutout' ? ' lk' : ' ok') + '">' + tagLbl + '</b>' +
        '</div>';
      }).join('');
      [].forEach.call(al.querySelectorAll('[data-aid]'), function (el) {
        el.onclick = function (ev) {
          if (ev.target && ev.target.dataset && ev.target.dataset.avis) return;
          selAssetId = el.dataset.aid;
          syncUI(); draw();
        };
      });
      [].forEach.call(al.querySelectorAll('[data-avis]'), function (cb) {
        cb.onchange = function () {
          var id = cb.dataset.avis;
          for (var i = 0; i < doc.assets.length; i++) {
            if (doc.assets[i].id === id) { pushUndo(); doc.assets[i].visible = !!cb.checked; persistToIDB(); draw(); break; }
          }
        };
      });
    }

    var cutBox = ov.querySelector('#scCutBox');
    cutBox.style.display = (tool === 'cutout' || tool === 'poly_draw') ? 'flex' : 'none';
    ov.querySelector('#scCutPtsV').textContent = String(cutPts.length);

    renderAssetInspector();

    ov.querySelector('#scSunAz').value = Math.round(doc.sun.azimuthDeg != null ? doc.sun.azimuthDeg : 135);
    ov.querySelector('#scSunAzV').textContent = Math.round(doc.sun.azimuthDeg != null ? doc.sun.azimuthDeg : 135);
    ov.querySelector('#scSunLen').value = doc.sun.lengthFactor != null ? doc.sun.lengthFactor : 0.75;
    ov.querySelector('#scSunLenV').textContent = Number(doc.sun.lengthFactor != null ? doc.sun.lengthFactor : 0.75).toFixed(2);
    ov.querySelector('#scSunOp').value = Math.round((doc.sun.opacity != null ? doc.sun.opacity : 0.38) * 100);
    ov.querySelector('#scSunOpV').textContent = Math.round((doc.sun.opacity != null ? doc.sun.opacity : 0.38) * 100);
    ov.querySelector('#scSunBl').value = doc.sun.blurPx != null ? doc.sun.blurPx : 4;
    ov.querySelector('#scSunBlV').textContent = doc.sun.blurPx != null ? doc.sun.blurPx : 4;
    ov.querySelector('#scSunCol').value = doc.sun.color || '#2a2118';
    syncSunDirBadge();

    var p1 = calibDraft.p1 || doc.calibration.p1;
    var p2 = calibDraft.p2 || doc.calibration.p2;
    var pxD = (p1 && p2) ? Math.hypot(p2.x - p1.x, p2.y - p1.y) : 0;
    ov.querySelector('#scCalPx').textContent = pxD > 0 ? (pxD.toFixed(1) + ' px') : 'Not picked';
    ov.querySelector('#scCalStat').textContent = doc.calibration.pxPerMeter > 0
      ? (doc.calibration.pxPerMeter.toFixed(3) + ' px/m (1 px = ' + (100 / doc.calibration.pxPerMeter).toFixed(1) + ' cm)')
      : 'Uncalibrated (px only)';
    var mInp = ov.querySelector('#scCalM');
    if (document.activeElement !== mInp) mInp.value = doc.calibration.knownMeters || 10;
    ov.querySelector('#scCadHint').textContent = getCadScaleHint();

    var ovOn = !!doc.layers.overlays.visible;
    var tb = ov.querySelector('#scTogOver');
    tb.textContent = 'Overlays: ' + (ovOn ? 'ON' : 'OFF');
    tb.classList.toggle('on', ovOn);
    if (document.activeElement !== ov.querySelector('#scTitEn')) ov.querySelector('#scTitEn').value = doc.overlays.titleEn || '';
    if (document.activeElement !== ov.querySelector('#scTitAr')) ov.querySelector('#scTitAr').value = doc.overlays.titleAr || '';
    ov.querySelector('#scOvNorth').checked = doc.overlays.showNorth !== false;
    ov.querySelector('#scOvScale').checked = doc.overlays.showScale !== false;
    ov.querySelector('#scOvLeg').checked = doc.overlays.showLegend !== false;
    if (document.activeElement !== ov.querySelector('#scNorthDeg')) ov.querySelector('#scNorthDeg').value = doc.overlays.northDeg || 0;
    renderPinsPanel();
    syncExportEstimator();
  }

  function resize() {
    if (!cv) return;
    var r = cv.parentNode.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    draw();
  }

  function build() {
    ensureCss();
    ov = document.createElement('div');
    ov.className = 'satc hide';
    ov.dataset.ajDone = '1';
    ov.innerHTML =
      '<div class="satc-top">' +
        '<b class="satc-title">AJ-GeoCAD — SAT STUDIO (COMPLETE)</b>' +
        '<button id="scImportBase" class="on">Import Base</button>' +
        '<button data-sctool="select" class="on">Select / Move</button>' +
        '<button data-sctool="pan">Pan</button>' +
        '<button data-sctool="clone" class="amb" title="Soft-Feathered Clone Patch (Alt+Click picks source)">Clone Patch</button>' +
        '<button data-sctool="erase" title="Soft Eraser on 02_Ground_Cleanup (reveals original base)">Soft Eraser</button>' +
        '<button data-sctool="cutout" class="cy" title="Cut real pixels from 01_Base_Satellite (A) & relocate to (B)">Cut &amp; Relocate A➔B</button>' +
        '<button id="scAddPng" class="on">+ PNG Asset</button>' +
        '<button data-sctool="futsal_rect" class="amb" title="Drag to place un-grassed futsal pitch + chain-link + red top net">+ Futsal + Red Net</button>' +
        '<button data-sctool="building_add" class="on" title="Click on map to add realistic top-down building">+ Building</button>' +
        '<button data-sctool="tent_add" class="on" title="Click on map to add field tent">+ Tent</button>' +
        '<button data-sctool="tree_add" class="on" title="Click on map to add natural tree canopy">+ Tree</button>' +
        '<button data-sctool="poly_draw" class="cy" title="Draw custom polygon around area">+ Draw Poly</button>' +
        '<button data-sctool="pin" class="cy" title="Place numbered poster pins (1, 2, 3...)">+ Pin 1..N</button>' +
        '<button id="scTogOver" class="on" title="1-click hide/show 04_Print_Overlays">Overlays: ON</button>' +
        '<button data-sctool="calibrate">Calibrate 2-Pt</button>' +
        '<button data-sctool="measure">Measure</button>' +
        '<button id="scFit">Fit</button>' +
        '<button id="sc100">100%</button>' +
        '<button id="scUndo" disabled>Undo</button>' +
        '<button id="scRedo" disabled>Redo</button>' +
        '<span class="sp"></span>' +
        '<button id="scClearSat" class="dng">Clear Sat</button>' +
        '<button id="scClose" class="on">Back to CAD</button>' +
        '<input type="file" id="scFileBase" accept="image/png,image/jpeg,image/webp,image/*" hidden>' +
        '<input type="file" id="scFileCleanup" accept="image/png,image/jpeg,image/webp,image/*" hidden>' +
        '<input type="file" id="scFileAsset" accept="image/png,image/webp,image/svg+xml,image/*" multiple hidden>' +
      '</div>' +
      '<div class="satc-body">' +
        '<aside class="satc-side">' +
          '<h4>4-Layer Architecture</h4>' +
          '<div class="satc-layer"><label><input type="checkbox" id="scLayBase" checked>01_Base_Satellite</label><span class="satc-tag lk">LOCKED</span></div>' +
          '<div class="satc-layer"><label><input type="checkbox" id="scLayClean" checked>02_Ground_Cleanup</label><span class="satc-tag ok">ACTIVE</span></div>' +
          '<div class="satc-layer"><label><input type="checkbox" id="scLayAssets" checked>03_Movable_Assets</label><span class="satc-tag ok">ACTIVE</span></div>' +
          '<div class="satc-layer"><label><input type="checkbox" id="scLayOver" checked>04_Print_Overlays</label><span class="satc-tag ok">ACTIVE</span></div>' +

          '<h4>01_Base_Satellite Info</h4>' +
          '<div id="scBaseInfo" class="satc-card"></div>' +
          '<div class="row"><button id="scReplaceBase" class="cy">Load / Replace Base</button></div>' +

          '<h4>02_Ground_Cleanup (Patch &amp; Eraser)</h4>' +
          '<div class="satc-card">' +
            '<div id="scCleanStat" class="mut"></div>' +
            '<div class="row"><button id="scLoadClean" class="cy">Load Pre-Cleaned</button><button id="scClrCleanImg" class="dng">Clear Img</button></div>' +
            '<label>Cleanup Opacity (<span id="scCleanOpV">100</span>%)<input type="range" id="scCleanOp" min="0" max="100" step="1" value="100"></label>' +
            '<div id="scSrcStat" class="mut"></div>' +
            '<div class="row"><button id="scPickSrc" class="cy">Pick Source</button><button id="scUseErase">Soft Eraser</button></div>' +
            '<label>Brush Radius (<span id="scRadV">28</span> px)<input type="range" id="scRad" min="6" max="180" step="1" value="28"></label>' +
            '<label>Soft Feather (<span id="scFeaV">65</span>%)<input type="range" id="scFea" min="5" max="100" step="1" value="65"></label>' +
            '<label>Brush Opacity (<span id="scBopV">100</span>%)<input type="range" id="scBop" min="10" max="100" step="1" value="100"></label>' +
            '<label>Patch Rotation (<span id="scProtV">0</span>&deg;)<input type="range" id="scProt" min="0" max="359" step="5" value="0"></label>' +
            '<label class="ck"><input type="checkbox" id="scFollow" checked>Follow Drag (Clone Offset)</label>' +
            '<div class="row"><button id="scClrPatches" class="dng">Clear Patches</button><button id="scClrErases" class="dng">Clear Erases</button></div>' +
          '</div>' +

          '<h4>03_Movable_Assets</h4>' +
          '<div class="row"><button id="scAddPng2" class="on">+ PNG Asset</button><button id="scStartCut" class="cy">Cut A➔B</button></div>' +
          '<div id="scAssetList" class="satc-alist"></div>' +
        '</aside>' +

        '<div class="satc-cv"><canvas id="scCv"></canvas></div>' +

        '<aside class="satc-side r">' +
          '<div id="scCutBox" class="satc-card" style="display:none;border-color:var(--glow-cyan,#00e5ff)">' +
            '<b>Polygon / Cutout Builder</b>' +
            '<div class="mut">Click points on map. Vertices: <b id="scCutPtsV">0</b></div>' +
            '<label>Edge Feather (<span id="scCutFeaV">2</span> px)<input type="range" id="scCutFea" min="0" max="6" step="0.5" value="2"></label>' +
            '<div class="row"><button id="scCutUndo">Undo Pt</button><button id="scCutExec" class="on">Finish / Extract</button><button id="scCutCan" class="dng">Cancel</button></div>' +
          '</div>' +

          '<h4>Selected Asset Inspector</h4>' +
          '<div id="scAssetInsp" class="satc-card"></div>' +

          '<h4>Global Sun Shadow (Multiply)</h4>' +
          '<div class="satc-card">' +
            '<div id="scSunDirTxt" class="mut"></div>' +
            '<label>Sun Azimuth (<span id="scSunAzV">135</span>&deg;)<input type="range" id="scSunAz" min="0" max="359" step="1" value="135"></label>' +
            '<label>Shadow Length (<span id="scSunLenV">0.75</span>x)<input type="range" id="scSunLen" min="0" max="2.5" step="0.05" value="0.75"></label>' +
            '<label>Shadow Opacity (<span id="scSunOpV">38</span>%)<input type="range" id="scSunOp" min="0" max="85" step="1" value="38"></label>' +
            '<label>Shadow Softness (<span id="scSunBlV">4</span> px)<input type="range" id="scSunBl" min="0" max="16" step="0.5" value="4"></label>' +
            '<div class="row">' +
              '<input type="color" id="scSunCol" value="#2a2118" title="Global Shadow Color" style="max-width:44px;padding:1px">' +
              '<button id="scShWarm" class="amb">Warm Soil</button>' +
              '<button id="scShCool" class="cy">Cool Neutral</button>' +
            '</div>' +
          '</div>' +

          '<h4>Site Metric Calibration (px/m)</h4>' +
          '<div class="satc-card">' +
            '<div>Status: <b id="scCalStat">Uncalibrated</b></div>' +
            '<div>Picked Line: <b id="scCalPx">Not picked</b></div>' +
            '<label>Real Distance (meters)<input type="number" id="scCalM" step="0.1" min="0.1" value="10"></label>' +
            '<div class="row"><button id="scPickCal" class="cy">Pick 2 Points</button><button id="scApplyCal" class="on">Apply Scale</button></div>' +
            '<div class="row"><button id="scResetCal" class="dng">Clear Scale</button></div>' +
          '</div>' +
          '<p id="scCadHint" class="mut"></p>' +

          '<h4>04_Print_Overlays (Poster &amp; Legend)</h4>' +
          '<div class="satc-card">' +
            '<label>Poster Title (EN)<input type="text" id="scTitEn" placeholder="e.g. Site Updated Map"></label>' +
            '<label>Poster Title (AR)<input type="text" id="scTitAr" dir="rtl" placeholder="مثال: خريطة الموقع المحدّثة"></label>' +
            '<div class="satc-grid2">' +
              '<label class="ck"><input type="checkbox" id="scOvNorth" checked>North Arrow</label>' +
              '<label class="ck"><input type="checkbox" id="scOvScale" checked>Scale Bar</label>' +
            '</div>' +
            '<label class="ck"><input type="checkbox" id="scOvLeg" checked>Show Bilingual Legend</label>' +
            '<div class="satc-grid2">' +
              '<label>North (&deg;)<input type="number" id="scNorthDeg" step="1" value="0"></label>' +
              '<button id="scSyncNorth" class="cy" style="align-self:end">Sync CAD North</button>' +
            '</div>' +
            '<label>New Pin Category<select id="scPinCat"></select></label>' +
            '<div class="row"><button id="scAddPinBtn" class="cy">+ Place Pin (1..N)</button><button id="scClrPins" class="dng">Clear Pins</button></div>' +
            '<div id="scPinList" class="satc-alist"></div>' +
            '<div id="scPinEdit"></div>' +
          '</div>' +

          '<h4>Dual High-Res Export (Safe RAM Guard)</h4>' +
          '<div class="satc-card">' +
            '<div class="row"><button id="scExpClean" class="on">1. Export Master_Clean_2D.png</button></div>' +
            '<div class="mut">Merges Layers 1+2+3 ONLY at exact original resolution (3D Base Texture).</div>' +
            '<hr style="border:0;border-top:1px solid var(--border-petrol,#1b3b57);margin:3px 0">' +
            '<label>Poster Size (Contain Aspect)<select id="scPaper"></select></label>' +
            '<div id="scCustBox" class="satc-grid2" style="display:none">' +
              '<label>Width (cm)<input type="number" id="scCustW" min="10" max="200" step="1" value="60"></label>' +
              '<label>Height (cm)<input type="number" id="scCustH" min="10" max="200" step="1" value="40"></label>' +
            '</div>' +
            '<label>Print Resolution (DPI)<select id="scDpi">' +
              '<option value="150">150 DPI (Fast / Large Boards)</option>' +
              '<option value="200" selected>200 DPI (Recommended for A1/A2)</option>' +
              '<option value="300">300 DPI (Ultra Print — A3/A2)</option>' +
            '</select></label>' +
            '<div id="scRamEst" class="satc-card" style="font-size:10px;line-height:1.45"></div>' +
            '<div class="row"><button id="scExpPoster" class="amb">2. Export Print Poster PNG</button></div>' +
          '</div>' +
        '</aside>' +
      '</div>' +
      '<div class="satc-foot">' +
        '<span id="scStatus">' + esc(statusMsg) + '</span>' +
        '<span id="scIdb">IDB: ' + esc(idbStatus) + '</span>' +
      '</div>';

    document.body.appendChild(ov);
    cv = ov.querySelector('#scCv');
    ctx = cv.getContext('2d');
    bindCanvas();

    var fBase = ov.querySelector('#scFileBase');
    var fClean = ov.querySelector('#scFileCleanup');
    var fAsset = ov.querySelector('#scFileAsset');
    function pickBase() { fBase.value = ''; fBase.click(); }
    function pickAsset() { fAsset.value = ''; fAsset.click(); }
    ov.querySelector('#scImportBase').onclick = pickBase;
    ov.querySelector('#scReplaceBase').onclick = pickBase;
    fBase.onchange = function () { if (this.files && this.files[0]) importBaseFile(this.files[0]); };

    ov.querySelector('#scLoadClean').onclick = function () { fClean.value = ''; fClean.click(); };
    fClean.onchange = function () { if (this.files && this.files[0]) importCleanupFile(this.files[0]); };

    ov.querySelector('#scAddPng').onclick = pickAsset;
    ov.querySelector('#scAddPng2').onclick = pickAsset;
    fAsset.onchange = function () { if (this.files && this.files.length) importAssetFiles(this.files); };

    [].forEach.call(ov.querySelectorAll('[data-sctool]'), function (b) {
      b.onclick = function () { setTool(b.dataset.sctool); };
    });
    ov.querySelector('#scStartCut').onclick = function () {
      if (!imgs.base) { setStatus('Import base satellite image first.', true); return; }
      cutPts = []; setTool('cutout');
      setStatus('Click points around the real object (A) to extract at 1:1 natural pixels.', false);
    };
    ov.querySelector('#scFit').onclick = fitView;
    ov.querySelector('#sc100').onclick = zoomNative100;
    ov.querySelector('#scUndo').onclick = doUndo;
    ov.querySelector('#scRedo').onclick = doRedo;
    ov.querySelector('#scClose').onclick = close;
    ov.querySelector('#scClearSat').onclick = function () {
      if (confirm('Clear ALL Sat Studio layers, assets, and local IndexedDB data? (Your CAD map stays untouched)')) clearData(false);
    };

    function bindLay(id, key) {
      ov.querySelector(id).onchange = function () {
        pushUndo();
        doc.layers[key].visible = !!this.checked;
        persistToIDB();
        if (key === 'overlays') syncUI();
        draw();
      };
    }
    bindLay('#scLayBase', 'base');
    bindLay('#scLayClean', 'cleanup');
    bindLay('#scLayAssets', 'assets');
    bindLay('#scLayOver', 'overlays');

    var clnOpPushed = false;
    ov.querySelector('#scCleanOp').oninput = function () {
      if (!clnOpPushed) { pushUndo(); clnOpPushed = true; }
      doc.layers.cleanup.opacity = (+this.value) / 100;
      ov.querySelector('#scCleanOpV').textContent = this.value;
      draw();
    };
    ov.querySelector('#scCleanOp').onchange = function () { clnOpPushed = false; persistToIDB(); };

    ov.querySelector('#scClrCleanImg').onclick = function () {
      if (!hasActiveCleanupImg()) return;
      pushUndo();
      doc.cleanupImage = { id: null, name: '', width: 0, height: 0 };
      cleanupDirty = true; persistToIDB(); syncUI(); draw();
    };
    ov.querySelector('#scPickSrc').onclick = function () {
      if (!imgs.base) { setStatus('Import base satellite image first.', true); return; }
      cloneCfg.pickMode = true;
      setTool('clone');
      setStatus('Click any clean soil/ground point on the satellite image to set Clone Source.', false);
    };
    ov.querySelector('#scUseErase').onclick = function () { setTool('erase'); };
    ov.querySelector('#scRad').oninput = function () {
      var v = +this.value; cloneCfg.radius = v; eraseCfg.radius = v;
      ov.querySelector('#scRadV').textContent = v; draw();
    };
    ov.querySelector('#scFea').oninput = function () {
      var v = (+this.value) / 100; cloneCfg.feather = v; eraseCfg.feather = v;
      ov.querySelector('#scFeaV').textContent = this.value; draw();
    };
    ov.querySelector('#scBop').oninput = function () {
      var v = (+this.value) / 100; cloneCfg.opacity = v; eraseCfg.opacity = v;
      ov.querySelector('#scBopV').textContent = this.value;
    };
    ov.querySelector('#scProt').oninput = function () {
      cloneCfg.rotDeg = +this.value;
      ov.querySelector('#scProtV').textContent = this.value;
    };
    ov.querySelector('#scFollow').onchange = function () { cloneCfg.followDrag = !!this.checked; };
    ov.querySelector('#scClrPatches').onclick = function () {
      if (!doc.patches.length) return;
      pushUndo(); doc.patches = []; cleanupDirty = true; persistToIDB(); syncUI(); draw();
    };
    ov.querySelector('#scClrErases').onclick = function () {
      if (!doc.cleanupErases.length) return;
      pushUndo(); doc.cleanupErases = []; cleanupDirty = true; persistToIDB(); syncUI(); draw();
    };

    ov.querySelector('#scCutFea').oninput = function () {
      cutFeatherPx = +this.value;
      ov.querySelector('#scCutFeaV').textContent = this.value;
    };
    ov.querySelector('#scCutUndo').onclick = function () { if (cutPts.length) { cutPts.pop(); syncUI(); draw(); } };
    ov.querySelector('#scCutExec').onclick = function () {
      if (tool === 'poly_draw') finalizeFreePolygon();
      else extractCutoutFromBase();
    };
    ov.querySelector('#scCutCan').onclick = function () { cutPts = []; setTool('select'); };

    ov.querySelector('#scPickCal').onclick = function () {
      if (!imgs.base) { setStatus('Import a base satellite image first.', true); return; }
      calibDraft = { p1: null, p2: null }; setTool('calibrate');
      setStatus('Click Point 1 and Point 2 on a known length in the satellite image.', false);
    };
    ov.querySelector('#scApplyCal').onclick = function () { applyCalibration(ov.querySelector('#scCalM').value); };
    ov.querySelector('#scResetCal').onclick = clearCalibration;

    function bindSunSlider(id, valId, key, scaleDiv, isFloat) {
      var el = ov.querySelector(id), pushed = false;
      el.oninput = function () {
        if (!pushed) { pushUndo(); pushed = true; }
        var raw = isFloat ? parseFloat(this.value) : (+this.value);
        doc.sun[key] = scaleDiv ? (raw / scaleDiv) : raw;
        ov.querySelector(valId).textContent = this.value;
        syncSunDirBadge();
        draw();
      };
      el.onchange = function () { pushed = false; persistToIDB(); };
    }
    bindSunSlider('#scSunAz', '#scSunAzV', 'azimuthDeg', 0, false);
    bindSunSlider('#scSunLen', '#scSunLenV', 'lengthFactor', 0, true);
    bindSunSlider('#scSunOp', '#scSunOpV', 'opacity', 100, false);
    bindSunSlider('#scSunBl', '#scSunBlV', 'blurPx', 0, true);
    ov.querySelector('#scSunCol').onchange = function () { pushUndo(); doc.sun.color = this.value; persistToIDB(); draw(); };
    ov.querySelector('#scShWarm').onclick = function () {
      pushUndo(); doc.sun.color = (S.SatBlending && S.SatBlending.SHADOW_COLORS.desert) || '#2a2118';
      persistToIDB(); syncUI(); draw();
    };
    ov.querySelector('#scShCool').onclick = function () {
      pushUndo(); doc.sun.color = (S.SatBlending && S.SatBlending.SHADOW_COLORS.neutral) || '#0f172a';
      persistToIDB(); syncUI(); draw();
    };

    // Layer 04 Print Overlays & Dual High-Res Export Controls
    if (S.SatExport) {
      ov.querySelector('#scPinCat').innerHTML = Object.keys(S.SatExport.PIN_CATS).map(function (k) {
        return '<option value="' + k + '">' + esc(S.SatExport.PIN_CATS[k].label + ' / ' + S.SatExport.PIN_CATS[k].ar) + '</option>';
      }).join('');
      ov.querySelector('#scPaper').innerHTML = Object.keys(S.SatExport.PAPERS).map(function (k) {
        return '<option value="' + k + '">' + esc(S.SatExport.PAPERS[k].label) + '</option>';
      }).join('');
    }
    ov.querySelector('#scTogOver').onclick = function () {
      pushUndo();
      doc.layers.overlays.visible = !doc.layers.overlays.visible;
      persistToIDB(); syncUI(); draw();
    };
    ov.querySelector('#scTitEn').onchange = function () { pushUndo(); doc.overlays.titleEn = this.value; persistToIDB(); };
    ov.querySelector('#scTitAr').onchange = function () { pushUndo(); doc.overlays.titleAr = this.value; persistToIDB(); };
    ov.querySelector('#scOvNorth').onchange = function () { pushUndo(); doc.overlays.showNorth = !!this.checked; persistToIDB(); draw(); };
    ov.querySelector('#scOvScale').onchange = function () { pushUndo(); doc.overlays.showScale = !!this.checked; persistToIDB(); draw(); };
    ov.querySelector('#scOvLeg').onchange = function () { pushUndo(); doc.overlays.showLegend = !!this.checked; persistToIDB(); };
    ov.querySelector('#scNorthDeg').onchange = function () {
      pushUndo(); doc.overlays.northDeg = (((parseFloat(this.value) || 0) % 360) + 360) % 360;
      persistToIDB(); syncUI(); draw();
    };
    ov.querySelector('#scSyncNorth').onclick = function () {
      var offN = (St && St.project && St.project.meta && St.project.meta.trueNorthOffsetDeg) || 0;
      pushUndo(); doc.overlays.northDeg = +Number(offN).toFixed(1);
      persistToIDB(); syncUI(); draw();
      setStatus('Synced North Arrow to AJ-GeoCAD trueNorthOffsetDeg (' + doc.overlays.northDeg + '°).', false);
    };
    ov.querySelector('#scPinCat').onchange = function () { pinCat = this.value; };
    ov.querySelector('#scAddPinBtn').onclick = function () {
      if (!imgs.base) { setStatus('Import 01_Base_Satellite first.', true); return; }
      setTool('pin');
      setStatus('Click on the satellite map to place numbered pins (1, 2, 3...). Drag existing pins to reposition.', false);
    };
    ov.querySelector('#scClrPins').onclick = function () {
      if (!doc.overlays.pins.length) return;
      pushUndo(); doc.overlays.pins = []; selPinId = null; persistToIDB(); syncUI(); draw();
    };

    function onPosterCfgChange() {
      doc.overlays.paper = ov.querySelector('#scPaper').value;
      doc.overlays.dpi = +ov.querySelector('#scDpi').value;
      doc.overlays.customWcm = parseFloat(ov.querySelector('#scCustW').value) || 60;
      doc.overlays.customHcm = parseFloat(ov.querySelector('#scCustH').value) || 40;
      persistToIDB();
      syncExportEstimator();
    }
    ov.querySelector('#scPaper').onchange = onPosterCfgChange;
    ov.querySelector('#scDpi').onchange = onPosterCfgChange;
    ov.querySelector('#scCustW').onchange = onPosterCfgChange;
    ov.querySelector('#scCustH').onchange = onPosterCfgChange;

    function buildExportPayload() {
      return {
        doc: doc,
        baseImg: imgs.base,
        assetImgs: imgs.assets,
        siteName: (St && St.project && St.project.meta && St.project.meta.name) || 'Site',
        renderCleanupTo: renderCleanupLayerTo
      };
    }
    ov.querySelector('#scExpClean').onclick = function () {
      if (S.SatExport) S.SatExport.exportMasterClean2D(buildExportPayload(), setStatus);
    };
    ov.querySelector('#scExpPoster').onclick = function () {
      if (S.SatExport) S.SatExport.exportPosterPNG(buildExportPayload(), doc.overlays, setStatus);
    };

    if (window.ResizeObserver) new ResizeObserver(resize).observe(cv.parentNode);
    else window.addEventListener('resize', resize);
    built = true;
  }

  // =========================================================================
  // PUBLIC ISOLATED MODULE API
  // =========================================================================
  function open() {
    try {
      if (!built) build();
      isOpen = true;
      ov.classList.remove('hide');
      resize();
      if (imgs.base && view.s === 1 && view.ox === 0 && view.oy === 0) fitView();
      syncUI(); draw();
      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('keyup', onKeyUp);
    } catch (err) {
      alert('Sat Studio failed to open: ' + err.message);
    }
  }

  function close() {
    isOpen = false;
    space = false;
    if (ov) ov.classList.add('hide');
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
  }

  function hasData() {
    return !!(
      bins.base || hasActiveCleanupImg() || doc.calibration.pxPerMeter > 0 ||
      doc.patches.length || doc.cleanupErases.length || doc.assets.length ||
      (doc.overlays && doc.overlays.pins && doc.overlays.pins.length)
    );
  }

  function exportState(opts) {
    try {
      var includeHeavy = !opts || opts.includeHeavy !== false;
      var activeAssetBins = {};
      if (includeHeavy) {
        doc.assets.forEach(function (a) {
          if (a.binId && bins.assets[a.binId]) activeAssetBins[a.binId] = bins.assets[a.binId];
        });
      }
      return {
        version: 1,
        doc: JSON.parse(JSON.stringify(doc)),
        bins: includeHeavy
          ? { base: bins.base, cleanup: hasActiveCleanupImg() ? bins.cleanup : null, assets: activeAssetBins }
          : { base: null, cleanup: null, assets: {} }
      };
    } catch (err) {
      console.warn('SatComposer exportState error:', err);
      return null;
    }
  }

  function importState(payload) {
    try {
      if (S.SatBlending && S.SatBlending.clearCache) S.SatBlending.clearCache();
      if (S.SatProcedural && S.SatProcedural.clearProceduralCache) S.SatProcedural.clearProceduralCache();
      if (!payload || typeof payload !== 'object') return false;
      opGen++;
      var snapGen = opGen;
      undoStack = []; redoStack = [];
      selAssetId = null; selPinId = null; cutPts = [];
      doc = mergeDoc(payload.doc || payload);
      var inBins = payload.bins || {};
      var sameBase = !inBins.base && bins.base && doc.base.id && payload.doc && payload.doc.base && payload.doc.base.id === doc.base.id;
      bins = {
        base: inBins.base || (sameBase ? bins.base : null),
        cleanup: inBins.cleanup || null,
        assets: inBins.assets ? Object.assign({}, inBins.assets) : {}
      };
      calibDraft = { p1: doc.calibration.p1, p2: doc.calibration.p2 };
      decodeAllImages(snapGen, function () {
        if (snapGen !== opGen) return;
        cleanupDirty = true;
        persistToIDB();
        if (isOpen) { fitView(); syncUI(); draw(); }
      });
      return true;
    } catch (err) {
      console.warn('SatComposer importState error:', err);
      return false;
    }
  }

  function clearData(silent) {
    try {
      if (S.SatBlending && S.SatBlending.clearCache) S.SatBlending.clearCache();
      if (S.SatProcedural && S.SatProcedural.clearProceduralCache) S.SatProcedural.clearProceduralCache();
      opGen++;
      doc = blankDoc();
      bins = blankBins();
      imgs = { base: null, cleanup: null, assets: {} };
      if (cleanupCacheCv) { cleanupCacheCv.width = 0; cleanupCacheCv.height = 0; cleanupCacheCv = null; }
      cleanupDirty = true;
      undoStack = []; redoStack = [];
      selAssetId = null; selPinId = null; cutPts = []; measPts = [];
      calibDraft = { p1: null, p2: null };
      cloneCfg.src = null; cloneCfg.pickMode = false;
      wipeIDB();
      if (!silent) setStatus('Sat Studio data & local IndexedDB cleared.', false);
      if (isOpen) { syncUI(); draw(); }
    } catch (err) {
      console.warn('SatComposer clearData error:', err);
    }
  }

  if (St && St.on) {
    St.on('clear', function () { clearData(true); });
  }
  hydrateFromIDB();

  S.SatComposer = {
    open: open,
    close: close,
    isOpen: function () { return isOpen; },
    hasData: hasData,
    exportState: exportState,
    importState: importState,
    clearData: clearData
  };
})(window.SOS);
