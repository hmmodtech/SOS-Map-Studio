window.SOS = window.SOS || {};
(function (S) {
  'use strict';

  var St = S.State;
  var MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
  var IDB_NAME = 'aj_geocad_sat_idb_v1';
  var IDB_STORE = 'kv';
  var MAX_SAFE_EDGE = 16384;
  var MAX_UNDO = 40;

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
      sun: { azimuthDeg: 135, lengthFactor: 0.75, opacity: 0.38, blurPx: 4, color: '#0f172a' },
      cleanupImage: { id: null, name: '', width: 0, height: 0 },
      patches: [],
      assets: [],
      overlays: { titleAr: '', titleEn: '', showNorth: true, showScale: true, showLegend: true, northDeg: 0, pins: [] }
    };
  }

  function blankBins() {
    return { base: null, cleanup: null, assets: {} };
  }

  // Isolated internal state (never stored in St.project or localStorage)
  var doc = blankDoc();
  var bins = blankBins();
  var imgs = { base: null, cleanup: null, assets: {} };
  var undoStack = [], redoStack = [];
  var opGen = 0; // Generation token prevents async IDB race conditions
  var idbQueue = Promise.resolve();
  var idbStatus = 'Ready';

  // UI & Viewport runtime state
  var ov = null, cv = null, ctx = null, built = false, isOpen = false;
  var W = 1, H = 1, dpr = 1;
  var view = { s: 1, ox: 0, oy: 0 };
  var tool = 'pan'; // 'pan' | 'calibrate' | 'measure'
  var ptrs = {}, drag = null, space = false;
  var hovImg = null; // { x, y } in natural base pixels
  var calibDraft = { p1: null, p2: null };
  var measPts = [];
  var statusMsg = 'Import a full-resolution satellite image to begin.';
  var statusErr = false;

  // =========================================================================
  // FAIL-SAFE SERIALIZED INDEXEDDB STORAGE
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
              if (snapGen !== opGen) return res(); // Ignore stale startup read
              if (rDoc.result) doc = mergeDoc(rDoc.result);
              if (rBin.result) bins = {
                base: rBin.result.base || null,
                cleanup: rBin.result.cleanup || null,
                assets: rBin.result.assets || {}
              };
              decodeAllImages(function () {
                if (snapGen !== opGen) return;
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
  // STATE MERGE, INTERNAL UNDO/REDO & IMAGE DECODING
  // =========================================================================
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
      assets: Array.isArray(raw.assets) ? raw.assets : [],
      overlays: Object.assign(b.overlays, raw.overlays || {})
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
    calibDraft = { p1: doc.calibration.p1, p2: doc.calibration.p2 };
    persistToIDB();
    syncUI(); draw();
  }

  function doRedo() {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify(doc));
    doc = mergeDoc(JSON.parse(redoStack.pop()));
    calibDraft = { p1: doc.calibration.p1, p2: doc.calibration.p2 };
    persistToIDB();
    syncUI(); draw();
  }

  function decodeImage(dataUrl, cb) {
    if (!dataUrl) return cb(null, null);
    var im = new Image();
    im.onload = function () { cb(null, im); };
    im.onerror = function () { cb(new Error('Failed to decode image data'), null); };
    im.src = dataUrl;
  }

  function decodeAllImages(done) {
    imgs.base = null;
    imgs.cleanup = null;
    imgs.assets = {};
    decodeImage(bins.base, function (err, im) {
      if (!err && im) {
        imgs.base = im;
        doc.base.width = im.naturalWidth;
        doc.base.height = im.naturalHeight;
      }
      if (done) done();
    });
  }

  function setStatus(msg, isErr) {
    statusMsg = msg;
    statusErr = !!isErr;
    if (ov) {
      var el = ov.querySelector('#scStatus');
      if (el) {
        el.textContent = msg;
        el.style.color = isErr ? 'var(--danger, #ff4757)' : 'var(--glow-cyan, #00e5ff)';
      }
    }
  }

  // =========================================================================
  // ZERO-COMPRESSION BASE IMAGE IMPORT
  // =========================================================================
  function importBaseFile(file) {
    if (!file) return;
    try {
      setStatus('Reading full-resolution image: ' + file.name + '...', false);
      var reader = new FileReader();
      reader.onerror = function () { setStatus('Error reading file: ' + (reader.error ? reader.error.message : 'Unknown'), true); };
      reader.onload = function () {
        try {
          var dataUrl = reader.result;
          decodeImage(dataUrl, function (err, im) {
            if (err || !im) { setStatus('Unsupported or corrupted image file.', true); return; }
            var nw = im.naturalWidth, nh = im.naturalHeight;
            if (!nw || !nh) { setStatus('Image has zero dimensions.', true); return; }
            opGen++;
            pushUndo();
            bins.base = dataUrl;
            imgs.base = im;
            doc.base = {
              id: 'base_' + Date.now().toString(36),
              name: file.name,
              mime: file.type || 'image/png',
              width: nw,
              height: nh,
              byteSize: file.size || Math.round(dataUrl.length * 0.75)
            };
            calibDraft = { p1: null, p2: null };
            measPts = [];
            var mp = (nw * nh) / 1e6;
            var mb = doc.base.byteSize / (1024 * 1024);
            var warn = (nw > MAX_SAFE_EDGE || nh > MAX_SAFE_EDGE)
              ? (' [WARNING: Edge exceeds ' + MAX_SAFE_EDGE + 'px browser safe limit!]')
              : '';
            setStatus('Loaded 01_Base_Satellite: ' + nw + 'x' + nh + ' px (' + mp.toFixed(1) + ' MP, ' + mb.toFixed(1) + ' MB) — Zero Compression' + warn, !!warn);
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

  // =========================================================================
  // VIEWPORT PROJECTION & NAVIGATION (NATURAL 1:1 IMAGE COORDINATES)
  // =========================================================================
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
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
  // RENDERER (PHASE 1: LAYER 01 + CALIBRATION + METRIC MEASURE + SCALE BAR)
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
        ctx.fillText('Zero-Compression Base Layer • 1:1 Original Pixels • Isolated IndexedDB Draft', W / 2, H / 2 + 12);
        return;
      }

      var iw = imgs.base.naturalWidth, ih = imgs.base.naturalHeight;
      var tl = i2s(0, 0), dw = iw * view.s, dh = ih * view.s;

      // Subtle checkerboard backdrop inside image bounds
      ctx.fillStyle = isDay ? '#cbd5e1' : '#0a1626';
      ctx.fillRect(tl[0], tl[1], dw, dh);

      // Layer 01: Base Satellite (Zero-Compression)
      if (doc.layers.base.visible) {
        ctx.save();
        ctx.globalAlpha = clamp(doc.layers.base.opacity, 0, 1);
        ctx.imageSmoothingEnabled = view.s < 2;
        ctx.drawImage(imgs.base, tl[0], tl[1], dw, dh);
        ctx.restore();
      }

      // Image frame border
      ctx.strokeStyle = isDay ? '#0369a1' : '#1b3b57';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(tl[0], tl[1], dw, dh);

      // Calibration overlay (active draft or saved reference when tool === 'calibrate')
      var cp1 = calibDraft.p1 || (tool === 'calibrate' ? doc.calibration.p1 : null);
      var cp2 = calibDraft.p2 || (tool === 'calibrate' ? doc.calibration.p2 : null);
      if (tool === 'calibrate' && cp1) {
        drawGuideSegment(cp1, cp2 || hovImg, '#00e5ff', 'CALIB');
      }

      // Measure tool overlay
      if (tool === 'measure' && measPts.length >= 1) {
        drawGuideSegment(measPts[0], measPts[1] || hovImg, '#f0c44d', 'MEAS');
      }

      // Metric Scale Bar (bottom-left) if calibrated
      if (doc.calibration.pxPerMeter > 0) {
        drawScaleBar(isDay);
      }

      // Live Zoom & Cursor HUD (top-left)
      drawViewportHud(isDay);
    } catch (err) {
      setStatus('Render warning: ' + err.message, true);
    }
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
      if (doc.calibration.pxPerMeter > 0) {
        lbl += '  |  ' + (pxD / doc.calibration.pxPerMeter).toFixed(2) + ' m';
      }
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
    var barPx = nice * screenPxPerM;
    var x0 = 16, y0 = H - 18;
    ctx.save();
    ctx.fillStyle = isDay ? 'rgba(255,255,255,0.92)' : 'rgba(6,13,24,0.88)';
    ctx.fillRect(x0 - 6, y0 - 22, barPx + 14, 28);
    ctx.strokeStyle = isDay ? '#0f172a' : '#00ff9d';
    ctx.lineWidth = 2;
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
    var parts = ['ZOOM ' + Math.round(view.s * 100) + '%'];
    if (imgs.base) parts.push('BASE ' + imgs.base.naturalWidth + 'x' + imgs.base.naturalHeight + ' px');
    if (hovImg) {
      parts.push('PX (' + Math.round(hovImg.x) + ', ' + Math.round(hovImg.y) + ')');
      if (doc.calibration.pxPerMeter > 0) {
        parts.push('M (' + (hovImg.x / doc.calibration.pxPerMeter).toFixed(1) + ', ' + (hovImg.y / doc.calibration.pxPerMeter).toFixed(1) + ')');
      }
    }
    var txt = parts.join('  |  ');
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
  // CALIBRATION ACTIONS
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
    setStatus('Scale calibrated: ' + doc.calibration.pxPerMeter.toFixed(3) + ' px/m (' + pxDist.toFixed(1) + ' px = ' + m + ' m).', false);
    setTool('pan');
    syncUI();
    draw();
  }

  function clearCalibration() {
    pushUndo();
    doc.calibration = { pxPerMeter: 0, p1: null, p2: null, knownMeters: 10 };
    calibDraft = { p1: null, p2: null };
    persistToIDB();
    setStatus('Scale calibration cleared.', false);
    syncUI();
    draw();
  }

  // =========================================================================
  // POINTER & KEYBOARD HANDLERS (FULLY ISOLATED)
  // =========================================================================
  function posOf(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function twoPtrs() {
    var ks = Object.keys(ptrs), a = ptrs[ks[0]], b = ptrs[ks[1]];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function bindCanvas() {
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
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
      if (tool === 'calibrate') {
        if (!calibDraft.p1 || (calibDraft.p1 && calibDraft.p2)) {
          calibDraft = { p1: ip, p2: null };
          setStatus('Calibration Point 1 set. Click Point 2 on the opposite end of your known reference.', false);
        } else {
          calibDraft.p2 = ip;
          var pxD = Math.hypot(ip.x - calibDraft.p1.x, ip.y - calibDraft.p1.y);
          setStatus('Calibration line: ' + pxD.toFixed(1) + ' px. Enter real length (m) in the right panel and click Apply Scale.', false);
        }
        syncUI(); draw(); return;
      }
      if (tool === 'measure') {
        if (measPts.length >= 2) measPts = [];
        measPts.push(ip);
        if (measPts.length === 2) {
          var dPx = Math.hypot(measPts[1].x - measPts[0].x, measPts[1].y - measPts[0].y);
          var msg = 'Measured: ' + dPx.toFixed(1) + ' px' + (doc.calibration.pxPerMeter > 0 ? (' | ' + (dPx / doc.calibration.pxPerMeter).toFixed(2) + ' m') : ' (calibrate scale for meters)');
          setStatus(msg, false);
        }
        draw(); return;
      }
    });

    cv.addEventListener('pointermove', function (e) {
      var p = posOf(e); if (ptrs[e.pointerId]) ptrs[e.pointerId] = p;
      hovImg = s2i(p.x, p.y);
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
      }
      draw();
    });

    function up(e) {
      delete ptrs[e.pointerId];
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
      setTool('pan');
      draw();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) doRedo(); else doUndo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      doRedo();
    }
  }
  function onKeyUp(e) { if (e.key === ' ') space = false; }

  // =========================================================================
  // UI BUILD (USES STUDIO CSS VARIABLES FOR CYBER HUD + DAYLIGHT PARITY)
  // =========================================================================
  function ensureCss() {
    if (document.getElementById('aj-satc-css')) return;
    var st = document.createElement('style');
    st.id = 'aj-satc-css';
    st.textContent =
      '.satc{position:fixed;inset:0;z-index:945;background:var(--bg-deep,#060d18);color:var(--txt-main,#d9ecff);display:flex;flex-direction:column;font-family:' + MONO + '}' +
      '.satc.hide{display:none}' +
      '.satc-top{display:flex;align-items:center;gap:6px;padding:6px 10px;background:var(--bg-panel,#0a1626);border-bottom:1px solid var(--border-petrol,#1b3b57);overflow-x:auto;flex-shrink:0}' +
      '.satc-title{background:var(--grad-sig,linear-gradient(90deg,#00b4d8,#00ff9d));-webkit-background-clip:text;background-clip:text;color:transparent;font-size:12px;font-weight:800;letter-spacing:.6px;white-space:nowrap;margin-right:4px}' +
      '.satc .sp{flex:1;min-width:8px}' +
      '.satc-body{flex:1;display:flex;min-height:0;overflow:hidden}' +
      '.satc-side{width:255px;background:var(--bg-panel,#0a1626);border-right:1px solid var(--border-petrol,#1b3b57);padding:10px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;flex-shrink:0}' +
      '.satc-side.r{border-right:0;border-left:1px solid var(--border-petrol,#1b3b57);width:270px}' +
      '.satc-side h4{margin:6px 0 2px;font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:var(--txt-sub,#78b5a0);border-bottom:1px solid var(--border-petrol,#1b3b57);padding-bottom:3px}' +
      '.satc-side h4:first-child{margin-top:0}' +
      '.satc-cv{flex:1;position:relative;min-width:0;min-height:0;overflow:hidden;background:var(--bg-input,#040911)}' +
      '#scCv{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}' +
      '.satc-card{background:var(--bg-input,#040911);border:1px solid var(--border-petrol,#1b3b57);border-radius:5px;padding:7px 8px;display:flex;flex-direction:column;gap:5px;font-size:11px}' +
      '.satc-layer{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:5px 6px;border:1px solid var(--border-petrol,#1b3b57);border-radius:4px;background:var(--bg-input,#040911);font-size:11px}' +
      '.satc-layer label{display:flex;align-items:center;gap:6px;margin:0;cursor:pointer;color:var(--txt-main,#d9ecff)!important}' +
      '.satc-tag{font-size:9px;padding:2px 5px;border-radius:3px;border:1px solid var(--border-petrol,#1b3b57);color:var(--txt-mut,#7f9bb5);white-space:nowrap}' +
      '.satc-tag.lk{border-color:var(--amber,#f0c44d);color:var(--amber,#f0c44d)}' +
      '.satc-foot{display:flex;align-items:center;gap:10px;padding:4px 10px;background:var(--bg-panel,#0a1626);border-top:1px solid var(--border-petrol,#1b3b57);font-size:10px;flex-shrink:0}' +
      '#scStatus{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--glow-cyan,#00e5ff)}' +
      '#scIdb{color:var(--glow-green,#00ff9d);white-space:nowrap}' +
      '@media(max-width:900px){.satc-body{flex-direction:column}.satc-side,.satc-side.r{width:100%;max-height:175px;border:0;border-bottom:1px solid var(--border-petrol,#1b3b57)}.satc-side.r{border-bottom:0;border-top:1px solid var(--border-petrol,#1b3b57)}}';
    document.head.appendChild(st);
  }

  function setTool(t) {
    tool = t;
    if (t !== 'measure') measPts = [];
    if (!ov) return;
    [].forEach.call(ov.querySelectorAll('[data-sctool]'), function (b) {
      b.classList.toggle('on', b.dataset.sctool === t);
    });
    if (cv) cv.style.cursor = t === 'pan' ? 'grab' : 'crosshair';
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
      return parts.length ? ('AJ-GeoCAD Ref: ' + parts.join(' | ')) : 'Tip: Pick a building edge or pitch length from AJ-GeoCAD to calibrate.';
    } catch (e) { return ''; }
  }

  function syncUI() {
    if (!ov) return;
    syncUndoBtns();
    setIdbBadge(idbStatus);

    // Base info card
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

    // Layers checkboxes
    ov.querySelector('#scLayBase').checked = !!doc.layers.base.visible;
    ov.querySelector('#scLayClean').checked = !!doc.layers.cleanup.visible;
    ov.querySelector('#scLayAssets').checked = !!doc.layers.assets.visible;
    ov.querySelector('#scLayOver').checked = !!doc.layers.overlays.visible;

    // Calibration card
    var p1 = calibDraft.p1 || doc.calibration.p1;
    var p2 = calibDraft.p2 || doc.calibration.p2;
    var pxD = (p1 && p2) ? Math.hypot(p2.x - p1.x, p2.y - p1.y) : 0;
    ov.querySelector('#scCalPx').textContent = pxD > 0 ? (pxD.toFixed(1) + ' px') : 'Not picked';
    ov.querySelector('#scCalStat').textContent = doc.calibration.pxPerMeter > 0
      ? (doc.calibration.pxPerMeter.toFixed(3) + ' px/m  (1 px = ' + (100 / doc.calibration.pxPerMeter).toFixed(1) + ' cm)')
      : 'Uncalibrated (px only)';
    var mInp = ov.querySelector('#scCalM');
    if (document.activeElement !== mInp) mInp.value = doc.calibration.knownMeters || 10;
    ov.querySelector('#scCadHint').textContent = getCadScaleHint();
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
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
        '<b class="satc-title">AJ-GeoCAD — SAT STUDIO (PHASE 1)</b>' +
        '<button id="scImportBase" class="on">Import Satellite Base</button>' +
        '<button data-sctool="pan" class="on">Pan</button>' +
        '<button data-sctool="calibrate" class="cy">Calibrate Scale (2-Pt)</button>' +
        '<button data-sctool="measure">Measure (m)</button>' +
        '<button id="scFit">Fit</button>' +
        '<button id="sc100">100% (1:1)</button>' +
        '<button id="scUndo" disabled>Undo</button>' +
        '<button id="scRedo" disabled>Redo</button>' +
        '<span class="sp"></span>' +
        '<button id="scClearSat" class="dng">Clear Sat Data</button>' +
        '<button id="scClose" class="on">Back to CAD</button>' +
        '<input type="file" id="scFileBase" accept="image/png,image/jpeg,image/webp,image/*" hidden>' +
      '</div>' +
      '<div class="satc-body">' +
        '<aside class="satc-side">' +
          '<h4>4-Layer Architecture</h4>' +
          '<div class="satc-layer"><label><input type="checkbox" id="scLayBase" checked>01_Base_Satellite</label><span class="satc-tag lk">LOCKED</span></div>' +
          '<div class="satc-layer"><label><input type="checkbox" id="scLayClean" checked>02_Ground_Cleanup</label><span class="satc-tag">Phase 2</span></div>' +
          '<div class="satc-layer"><label><input type="checkbox" id="scLayAssets" checked>03_Movable_Assets</label><span class="satc-tag">Phase 2</span></div>' +
          '<div class="satc-layer"><label><input type="checkbox" id="scLayOver" checked>04_Print_Overlays</label><span class="satc-tag">Phase 4</span></div>' +
          '<h4>01_Base_Satellite Info</h4>' +
          '<div id="scBaseInfo" class="satc-card"></div>' +
          '<div class="row"><button id="scReplaceBase" class="cy">Load / Replace Base</button></div>' +
          '<p class="mut">Base image is never downscaled or compressed. Stored locally in isolated IndexedDB (zero impact on CAD undo or localStorage).</p>' +
        '</aside>' +
        '<div class="satc-cv"><canvas id="scCv"></canvas></div>' +
        '<aside class="satc-side r">' +
          '<h4>Site Metric Calibration (px/m)</h4>' +
          '<div class="satc-card">' +
            '<div>Status: <b id="scCalStat">Uncalibrated</b></div>' +
            '<div>Picked Line: <b id="scCalPx">Not picked</b></div>' +
            '<label>Real Distance (meters)<input type="number" id="scCalM" step="0.1" min="0.1" value="10"></label>' +
            '<div class="row"><button id="scPickCal" class="cy">Pick 2 Points</button><button id="scApplyCal" class="on">Apply Scale</button></div>' +
            '<div class="row"><button id="scResetCal" class="dng">Clear Scale</button></div>' +
          '</div>' +
          '<p id="scCadHint" class="mut"></p>' +
          '<h4>Upcoming Modules (Locked Order)</h4>' +
          '<div class="satc-card mut">' +
            '<div>• <b>Phase 2:</b> Cleanup Patches + PNG Assets + Cut &amp; Relocate (1:1 A ➔ B)</div>' +
            '<div>• <b>Phase 3:</b> Global Sun Shadow (Multiply) + Satellite Match Filters</div>' +
            '<div>• <b>Phase 4:</b> Print Overlays + Master_Clean_2D &amp; A3/A2/A1 Safe Export</div>' +
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
    function openBasePicker() { fBase.value = ''; fBase.click(); }
    ov.querySelector('#scImportBase').onclick = openBasePicker;
    ov.querySelector('#scReplaceBase').onclick = openBasePicker;
    fBase.onchange = function () { if (this.files && this.files[0]) importBaseFile(this.files[0]); };

    [].forEach.call(ov.querySelectorAll('[data-sctool]'), function (b) {
      b.onclick = function () { setTool(b.dataset.sctool); };
    });
    ov.querySelector('#scFit').onclick = fitView;
    ov.querySelector('#sc100').onclick = zoomNative100;
    ov.querySelector('#scUndo').onclick = doUndo;
    ov.querySelector('#scRedo').onclick = doRedo;
    ov.querySelector('#scClose').onclick = close;
    ov.querySelector('#scClearSat').onclick = function () {
      if (confirm('Clear satellite base image, calibration, and local IndexedDB data for Sat Studio? (Your CAD map stays untouched)')) {
        clearData(false);
      }
    };

    function bindLayerToggle(id, key) {
      ov.querySelector(id).onchange = function () {
        pushUndo();
        doc.layers[key].visible = !!this.checked;
        persistToIDB();
        draw();
      };
    }
    bindLayerToggle('#scLayBase', 'base');
    bindLayerToggle('#scLayClean', 'cleanup');
    bindLayerToggle('#scLayAssets', 'assets');
    bindLayerToggle('#scLayOver', 'overlays');

    ov.querySelector('#scPickCal').onclick = function () {
      if (!imgs.base) { setStatus('Import a base satellite image first.', true); return; }
      calibDraft = { p1: null, p2: null };
      setTool('calibrate');
      setStatus('Click Point 1 and Point 2 on a known length in the satellite image.', false);
      syncUI();
    };
    ov.querySelector('#scApplyCal').onclick = function () { applyCalibration(ov.querySelector('#scCalM').value); };
    ov.querySelector('#scResetCal').onclick = clearCalibration;

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
      syncUI();
      draw();
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
    return !!(bins.base || bins.cleanup || doc.calibration.pxPerMeter > 0 || doc.patches.length || doc.assets.length);
  }

  function exportState(opts) {
    try {
      var includeHeavy = !opts || opts.includeHeavy !== false;
      return {
        version: 1,
        doc: JSON.parse(JSON.stringify(doc)),
        bins: includeHeavy
          ? { base: bins.base, cleanup: bins.cleanup, assets: Object.assign({}, bins.assets) }
          : { base: null, cleanup: null, assets: {} }
      };
    } catch (err) {
      console.warn('SatComposer exportState error:', err);
      return null;
    }
  }

  function importState(payload) {
    try {
      if (!payload || typeof payload !== 'object') return false;
      opGen++;
      undoStack = []; redoStack = [];
      doc = mergeDoc(payload.doc || payload);
      var inBins = payload.bins || {};
      // If loading a lightweight JSON where base is null, preserve current base only if IDs match
      var sameBase = !inBins.base && bins.base && doc.base.id && payload.doc && payload.doc.base && payload.doc.base.id === doc.base.id;
      bins = {
        base: inBins.base || (sameBase ? bins.base : null),
        cleanup: inBins.cleanup || null,
        assets: inBins.assets ? Object.assign({}, inBins.assets) : {}
      };
      calibDraft = { p1: doc.calibration.p1, p2: doc.calibration.p2 };
      decodeAllImages(function () {
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
      opGen++;
      doc = blankDoc();
      bins = blankBins();
      imgs = { base: null, cleanup: null, assets: {} };
      undoStack = []; redoStack = [];
      calibDraft = { p1: null, p2: null };
      measPts = [];
      wipeIDB();
      if (!silent) setStatus('Sat Studio data & local IndexedDB cleared.', false);
      if (isOpen) { syncUI(); draw(); }
    } catch (err) {
      console.warn('SatComposer clearData error:', err);
    }
  }

  // Hook into OPSEC Clear Workspace event & start non-blocking IDB hydration
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
