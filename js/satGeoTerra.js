window.SOS = window.SOS || {};
(function (S) {
  'use strict';

  var MONO = "'JetBrains Mono','Fira Code',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
  var CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

  var TYPE_STYLES = {
    REM: { order: 1, stroke: '#ff3c3c', fill: 'rgba(255,60,60,0.22)',   badge: '#fca5a5', dash: [8, 5],       ar: 'إزالة',   en: 'REM' },
    REP: { order: 2, stroke: '#c084fc', fill: 'rgba(192,132,252,0.24)', badge: '#e9d5ff', dash: [10, 4, 3, 4], ar: 'استبدال', en: 'REP' },
    MOD: { order: 3, stroke: '#e8c84a', fill: 'rgba(232,200,74,0.24)',  badge: '#fde68a', dash: [],            ar: 'تعديل',   en: 'MOD' },
    ADD: { order: 4, stroke: '#39ff14', fill: 'rgba(57,255,20,0.22)',   badge: '#86efac', dash: [],            ar: 'إضافة',   en: 'ADD' }
  };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function formatId(n) { return 'ID-' + String(n).padStart(2, '0'); }
  function degToCardinal(deg) {
    var norm = ((deg % 360) + 360) % 360;
    return CARDINALS[Math.round(norm / 45) % 8];
  }
  function colLabel(idx) {
    var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (idx < 26) return letters[idx];
    return letters[Math.floor(idx / 26) - 1] + letters[idx % 26];
  }
  function sanitizeFilename(name) {
    var base = String(name || 'photo').replace(/\.[^.]+$/, '');
    var clean = base.replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
    return clean || 'photo';
  }
  function buildPhotoExportPath(featId, photoIdx, origName) {
    return 'photos/' + featId + '_' + (photoIdx + 1) + '_' + sanitizeFilename(origName) + '.jpg';
  }

  // =========================================================================
  // 1. STATE SCHEMA & NORMALIZATION
  // =========================================================================
  function blankState() {
    return {
      version: 7,
      boundary: [],
      boundaryClosed: false,
      grid: { cols: 6, rows: 4, aligned: true, dimOutside: true, subGrid: false, showGrid: true },
      filters: { REM: true, REP: true, MOD: true, ADD: true, pins: true, gcps: true },
      features: [],
      nextFeatNum: 1,
      gcps: [],
      georefModelType: 'auto',
      surveyGeom: 'polygon',
      editSavedVertices: false
    };
  }

  function mergeState(raw) {
    var b = blankState();
    if (!raw || typeof raw !== 'object') return b;
    var feats = Array.isArray(raw.features) ? raw.features.filter(function (f) {
      return f && Array.isArray(f.points) && f.points.length >= 1;
    }).map(function (f, i) {
      var isPin = f.geometry === 'point' || f.points.length === 1;
      return {
        id: f.id || formatId(i + 1),
        geometry: isPin ? 'point' : 'polygon',
        type: TYPE_STYLES[f.type] ? f.type : 'ADD',
        name: f.name || '',
        photoRef: f.photoRef || '',
        photos: Array.isArray(f.photos) ? f.photos.map(function (p) { return Object.assign({}, p); }) : [],
        notes: f.notes || '',
        removeNotes: f.removeNotes || '',
        addNotes: f.addNotes || '',
        points: f.points.map(function (p) { return { x: +p.x, y: +p.y }; })
      };
    }) : [];

    var maxN = feats.length;
    feats.forEach(function (f) {
      var m = /^ID-(\d+)$/.exec(f.id);
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
    });

    return {
      version: 7,
      boundary: Array.isArray(raw.boundary) ? raw.boundary.map(function (p) { return { x: +p.x, y: +p.y }; }) : [],
      boundaryClosed: !!raw.boundaryClosed && Array.isArray(raw.boundary) && raw.boundary.length >= 3,
      grid: Object.assign(b.grid, raw.grid || {}),
      filters: Object.assign(b.filters, raw.filters || {}),
      features: feats,
      nextFeatNum: Math.max(maxN + 1, parseInt(raw.nextFeatNum, 10) || 1),
      gcps: Array.isArray(raw.gcps) ? raw.gcps.filter(function (g) {
        return g && isFinite(+g.x) && isFinite(+g.y) && isFinite(+g.lat) && isFinite(+g.lon);
      }).map(function (g, i) {
        return {
          x: +g.x, y: +g.y, lat: +g.lat, lon: +g.lon,
          label: g.label || ('GCP-' + (i + 1)),
          enabled: g.enabled !== false
        };
      }) : [],
      georefModelType: raw.georefModelType || 'auto',
      surveyGeom: raw.surveyGeom === 'point' ? 'point' : 'polygon',
      editSavedVertices: false
    };
  }

  function isFeatureVisible(state, feat) {
    if (!state || !feat) return false;
    if (feat.geometry === 'point' && !state.filters.pins) return false;
    return state.filters[feat.type] !== false;
  }

  // =========================================================================
  // 2. BOUNDARY & ALIGNED SECTOR GRID GEOMETRY (A1..F4)
  // =========================================================================
  function normalizeAngle(theta) {
    var halfPi = Math.PI / 2;
    while (theta <= -Math.PI / 4) theta += halfPi;
    while (theta > Math.PI / 4) theta -= halfPi;
    return theta;
  }

  function clipHalfPlaneUV(poly, isInside, intersect) {
    if (!poly.length) return [];
    var out = [];
    for (var i = 0; i < poly.length; i++) {
      var curr = poly[i];
      var prev = poly[(i + poly.length - 1) % poly.length];
      var cIn = isInside(curr), pIn = isInside(prev);
      if (cIn) {
        if (!pIn) out.push(intersect(prev, curr));
        out.push(curr);
      } else if (pIn) {
        out.push(intersect(prev, curr));
      }
    }
    return out;
  }

  function clipPolyToRectUV(uvPoly, u0, u1, v0, v1) {
    var p = uvPoly;
    p = clipHalfPlaneUV(p, function (a) { return a.u >= u0; }, function (a, b) {
      var du = b.u - a.u, t = Math.abs(du) < 1e-12 ? 0 : (u0 - a.u) / du;
      return { u: u0, v: a.v + (b.v - a.v) * t };
    });
    p = clipHalfPlaneUV(p, function (a) { return a.u <= u1; }, function (a, b) {
      var du = b.u - a.u, t = Math.abs(du) < 1e-12 ? 0 : (u1 - a.u) / du;
      return { u: u1, v: a.v + (b.v - a.v) * t };
    });
    p = clipHalfPlaneUV(p, function (a) { return a.v >= v0; }, function (a, b) {
      var dv = b.v - a.v, t = Math.abs(dv) < 1e-12 ? 0 : (v0 - a.v) / dv;
      return { u: a.u + (b.u - a.u) * t, v: v0 };
    });
    p = clipHalfPlaneUV(p, function (a) { return a.v <= v1; }, function (a, b) {
      var dv = b.v - a.v, t = Math.abs(dv) < 1e-12 ? 0 : (v1 - a.v) / dv;
      return { u: a.u + (b.u - a.u) * t, v: v1 };
    });
    return p;
  }

  function polyAreaCentroidUV(poly) {
    if (poly.length < 3) return { area: 0, u: 0, v: 0 };
    var a = 0, cu = 0, cv = 0;
    for (var i = 0; i < poly.length; i++) {
      var p0 = poly[i], p1 = poly[(i + 1) % poly.length];
      var cross = p0.u * p1.v - p1.u * p0.v;
      a += cross;
      cu += (p0.u + p1.u) * cross;
      cv += (p0.v + p1.v) * cross;
    }
    a *= 0.5;
    if (Math.abs(a) < 1e-6) return { area: 0, u: 0, v: 0 };
    return { area: Math.abs(a), u: cu / (6 * a), v: cv / (6 * a) };
  }

  function polyAreaCentroidXY(pts) {
    if (!pts || !pts.length) return { areaPx: 0, cx: 0, cy: 0, perimeterPx: 0 };
    if (pts.length === 1) return { areaPx: 0, cx: pts[0].x, cy: pts[0].y, perimeterPx: 0 };
    if (pts.length < 3) {
      var sx = 0, sy = 0;
      pts.forEach(function (p) { sx += p.x; sy += p.y; });
      return { areaPx: 0, cx: sx / pts.length, cy: sy / pts.length, perimeterPx: 0 };
    }
    var a = 0, cx = 0, cy = 0, perim = 0;
    for (var i = 0; i < pts.length; i++) {
      var p0 = pts[i], p1 = pts[(i + 1) % pts.length];
      var cross = p0.x * p1.y - p1.x * p0.y;
      a += cross;
      cx += (p0.x + p1.x) * cross;
      cy += (p0.y + p1.y) * cross;
      perim += Math.hypot(p1.x - p0.x, p1.y - p0.y);
    }
    a *= 0.5;
    if (Math.abs(a) < 1e-6) {
      var mx = 0, my = 0;
      pts.forEach(function (p) { mx += p.x; my += p.y; });
      return { areaPx: 0, cx: mx / pts.length, cy: my / pts.length, perimeterPx: perim };
    }
    return { areaPx: Math.abs(a), cx: cx / (6 * a), cy: cy / (6 * a), perimeterPx: perim };
  }

  function computeGridModel(state) {
    if (!state || !state.boundaryClosed || state.boundary.length < 3) return null;
    var pts = state.boundary;
    var cols = clamp(parseInt(state.grid.cols, 10) || 6, 2, 20);
    var rows = clamp(parseInt(state.grid.rows, 10) || 4, 2, 20);
    var theta = state.grid.aligned
      ? normalizeAngle(Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x))
      : 0;
    var cosT = Math.cos(theta), sinT = Math.sin(theta);

    function toUV(x, y) { return { u: x * cosT + y * sinT, v: -x * sinT + y * cosT }; }
    function toXY(u, v) { return { x: u * cosT - v * sinT, y: u * sinT + v * cosT }; }

    var uvPoly = pts.map(function (p) { return toUV(p.x, p.y); });
    var uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    uvPoly.forEach(function (q) {
      if (q.u < uMin) uMin = q.u;
      if (q.u > uMax) uMax = q.u;
      if (q.v < vMin) vMin = q.v;
      if (q.v > vMax) vMax = q.v;
    });
    var spanU = uMax - uMin, spanV = vMax - vMin;
    if (spanU < 2 || spanV < 2) return null;

    var cu = spanU / cols, cv = spanV / rows, cellArea = cu * cv;
    var labels = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var u0 = uMin + c * cu, u1 = u0 + cu;
        var v0 = vMin + r * cv, v1 = v0 + cv;
        var clipped = clipPolyToRectUV(uvPoly, u0, u1, v0, v1);
        var res = polyAreaCentroidUV(clipped);
        if (res.area >= cellArea * 0.03) {
          var xy = toXY(res.u, res.v);
          labels.push({ text: colLabel(c) + (r + 1), x: xy.x, y: xy.y });
        }
      }
    }
    return { cols: cols, rows: rows, uMin: uMin, uMax: uMax, vMin: vMin, vMax: vMax, cu: cu, cv: cv, toUV: toUV, toXY: toXY, labels: labels, theta: theta };
  }

  function detectFeatureSectors(state, featPts) {
    var grid = computeGridModel(state);
    if (!grid || !featPts || !featPts.length) return [];
    var ctr = polyAreaCentroidXY(featPts);
    var samples = featPts.length === 1 ? [featPts[0]] : featPts.concat([{ x: ctr.cx, y: ctr.cy }]);
    var found = {};
    samples.forEach(function (p) {
      var uv = grid.toUV(p.x, p.y);
      var c = Math.floor((uv.u - grid.uMin) / grid.cu);
      var r = Math.floor((uv.v - grid.vMin) / grid.cv);
      if (c >= 0 && c < grid.cols && r >= 0 && r < grid.rows) {
        found[colLabel(c) + (r + 1)] = true;
      }
    });
    return Object.keys(found).sort();
  }

  // =========================================================================
  // 3. PURE-JS ZERO-DEPENDENCY STORE ZIP BUILDER (CRC32) & PHOTO COMPRESSOR
  // =========================================================================
  var CRC_TABLE = (function () {
    var tbl = new Uint32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      tbl[i] = c >>> 0;
    }
    return tbl;
  })();

  function crc32Bytes(u8) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function buildZipBlob(entries) {
    var enc = new TextEncoder();
    var localParts = [], centralParts = [];
    var offset = 0;

    entries.forEach(function (entry) {
      var nameBytes = enc.encode(entry.name);
      var data = (entry.data instanceof Uint8Array) ? entry.data : enc.encode(String(entry.data));
      var crc = crc32Bytes(data);
      var size = data.length;

      var lh = new ArrayBuffer(30);
      var lv = new DataView(lh);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, size, true);
      lv.setUint32(22, size, true);
      lv.setUint16(26, nameBytes.length, true);
      localParts.push(new Uint8Array(lh), nameBytes, data);

      var ch = new ArrayBuffer(46);
      var cv = new DataView(ch);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint32(42, offset, true);
      centralParts.push(new Uint8Array(ch), nameBytes);

      offset += 30 + nameBytes.length + size;
    });

    var cdSize = 0;
    centralParts.forEach(function (part) { cdSize += part.length; });
    var eocd = new ArrayBuffer(22);
    var ev = new DataView(eocd);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);

    return new Blob(localParts.concat(centralParts, [new Uint8Array(eocd)]), { type: 'application/zip' });
  }

  function triggerDownloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
  }

  function dataUrlToUint8Array(dataUrl) {
    var idx = dataUrl.indexOf(',');
    var b64 = idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function canvasToPngUint8Array(canvas) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) {
        if (!blob) return resolve(null);
        var r = new FileReader();
        r.onload = function () { resolve(new Uint8Array(r.result)); };
        r.onerror = function () { resolve(null); };
        r.readAsArrayBuffer(blob);
      }, 'image/png');
    });
  }

  function loadImageFromUrl(url) {
    return new Promise(function (resolve) {
      var im = new Image();
      im.onload = function () { resolve(im); };
      im.onerror = function () { resolve(null); };
      im.src = url;
    });
  }

  function compressImageFile(file, maxEdge, quality, compassHeading) {
    maxEdge = maxEdge || 1024;
    quality = quality || 0.82;
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('File read failed')); };
      reader.onload = function (ev) {
        var im = new Image();
        im.onerror = function () { reject(new Error('Image decode failed')); };
        im.onload = function () {
          var w = im.naturalWidth, h = im.naturalHeight;
          var longest = Math.max(w, h);
          if (longest > maxEdge) {
            var sc = maxEdge / longest;
            w = Math.max(1, Math.round(w * sc));
            h = Math.max(1, Math.round(h * sc));
          }
          var c = document.createElement('canvas');
          c.width = w; c.height = h;
          var cx = c.getContext('2d');
          cx.fillStyle = '#000000';
          cx.fillRect(0, 0, w, h);
          cx.drawImage(im, 0, 0, w, h);
          var dataUrl = c.toDataURL('image/jpeg', quality);
          c.width = 0; c.height = 0;
          var approxBytes = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
          var initBearing = '';
          if (typeof compassHeading === 'number' && isFinite(compassHeading)) {
            var d = Math.round(compassHeading) % 360;
            initBearing = d + '° ' + degToCardinal(d);
          }
          resolve({
            origName: file.name || 'photo.jpg',
            dataUrl: dataUrl,
            width: w,
            height: h,
            sizeKB: Math.max(1, Math.round(approxBytes / 1024)),
            bearing: initBearing
          });
        };
        im.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // =========================================================================
  // 4. LAYER 05_GEOTERRA_SURVEY RENDERER (LIVE VIEW + 1:1 EXPORT)
  // =========================================================================
  function placeLabelBox(cx, cy, bw, bh, placedBoxes) {
    var x = cx, y = cy;
    var gap = Math.max(3, bh * 0.2);
    for (var attempt = 0; attempt < 10; attempt++) {
      var collides = placedBoxes.some(function (b) {
        return Math.abs(x - b.x) < (bw + b.w) * 0.5 && Math.abs(y - b.y) < (bh + b.h) * 0.5;
      });
      if (!collides) break;
      var dir = (attempt % 2 === 0) ? 1 : -1;
      var step = Math.floor(attempt / 2) + 1;
      y = cy + dir * step * (bh + gap);
    }
    placedBoxes.push({ x: x, y: y, w: bw, h: bh });
    return { x: x, y: y };
  }

  function drawGeoTerraLayer(ctx, opts) {
    var state = opts.state;
    var imgW = opts.imgW, imgH = opts.imgH;
    if (!state || !imgW || !imgH) return;
    var forExport = !!opts.forExport;
    var zoom = forExport ? 1 : Math.max(0.05, opts.viewS || 1);
    var ox = forExport ? 0 : (opts.ox || 0);
    var oy = forExport ? 0 : (opts.oy || 0);
    var lang = opts.lang || 'en';
    var model = opts.georefModel || null;
    var ppm = opts.pxPerMeter || (model && model.pxPerMeter) || 0;
    var mpp = ppm > 0 ? (1 / ppm) : null;
    var refScale = Math.min(imgW, imgH);
    var pts = state.boundary || [];
    var closed = !!state.boundaryClosed && pts.length >= 3;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(zoom, zoom);

    if (closed && state.grid.dimOutside) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, imgW, imgH);
      ctx.moveTo(pts[0].x, pts[0].y);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(4, 10, 22, 0.52)';
      ctx.fill('evenodd');
      ctx.restore();
    }

    var grid = state.grid.showGrid ? computeGridModel(state) : null;
    if (grid) {
      var gridRef = Math.min(grid.uMax - grid.uMin, grid.vMax - grid.vMin);
      var baseLine = Math.max(1.2, gridRef / 480);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (var bi = 1; bi < pts.length; bi++) ctx.lineTo(pts[bi].x, pts[bi].y);
      ctx.closePath();
      ctx.clip();

      if (state.grid.subGrid) {
        ctx.save();
        ctx.strokeStyle = 'rgba(0,229,255,0.45)';
        ctx.lineWidth = Math.max(1, baseLine * 0.7);
        ctx.setLineDash([baseLine * 4, baseLine * 4]);
        for (var sc = 0; sc < grid.cols; sc++) {
          var su = grid.uMin + (sc + 0.5) * grid.cu;
          var sp0 = grid.toXY(su, grid.vMin), sp1 = grid.toXY(su, grid.vMax);
          ctx.beginPath(); ctx.moveTo(sp0.x, sp0.y); ctx.lineTo(sp1.x, sp1.y); ctx.stroke();
        }
        for (var sr = 0; sr < grid.rows; sr++) {
          var sv = grid.vMin + (sr + 0.5) * grid.cv;
          var rp0 = grid.toXY(grid.uMin, sv), rp1 = grid.toXY(grid.uMax, sv);
          ctx.beginPath(); ctx.moveTo(rp0.x, rp0.y); ctx.lineTo(rp1.x, rp1.y); ctx.stroke();
        }
        ctx.restore();
      }

      function strokeMainGrid(col, lw) {
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        ctx.setLineDash([]);
        for (var c = 1; c < grid.cols; c++) {
          var u = grid.uMin + c * grid.cu;
          var p0 = grid.toXY(u, grid.vMin), p1 = grid.toXY(u, grid.vMax);
          ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
        }
        for (var r = 1; r < grid.rows; r++) {
          var v = grid.vMin + r * grid.cv;
          var q0 = grid.toXY(grid.uMin, v), q1 = grid.toXY(grid.uMax, v);
          ctx.beginPath(); ctx.moveTo(q0.x, q0.y); ctx.lineTo(q1.x, q1.y); ctx.stroke();
        }
      }
      strokeMainGrid('rgba(0,0,0,0.78)', baseLine * 2.0);
      strokeMainGrid('rgba(232,200,74,0.88)', baseLine * 1.0);

      var cellMin = Math.min(grid.cu, grid.cv);
      var fs = clamp(Math.round(cellMin * 0.24), 10, 44);
      ctx.font = 'bold ' + fs + 'px ' + MONO;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      grid.labels.forEach(function (lbl) {
        var tw = ctx.measureText(lbl.text).width;
        var bw = tw + Math.max(6, fs * 0.48), bh = fs + Math.max(4, fs * 0.32);
        ctx.fillStyle = 'rgba(8,11,16,0.72)';
        ctx.fillRect(lbl.x - bw / 2, lbl.y - bh / 2, bw, bh);
        ctx.fillStyle = '#e8c84a';
        ctx.fillText(lbl.text, lbl.x, lbl.y + 0.5);
      });
      ctx.restore();
    }

    if (pts.length > 0) {
      var borderW = forExport ? Math.max(2.4, refScale / 360) : (2.4 / zoom);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (var k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
      if (closed) ctx.closePath();
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = borderW * 1.9;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.stroke();
      ctx.strokeStyle = closed ? '#00e5ff' : '#38bdf8';
      ctx.lineWidth = borderW;
      ctx.stroke();
      ctx.restore();
    }

    var feats = state.features || [];
    if (feats.length > 0) {
      var fLineW = forExport ? Math.max(2.2, refScale / 380) : (2.3 / zoom);
      var labelFs = forExport ? Math.max(12, Math.round(refScale / 56)) : Math.max(10, 12 / zoom);
      var pinR = forExport ? Math.max(6, refScale / 115) : (8 / zoom);

      var ordered = feats.map(function (feat, origIdx) { return { feat: feat, origIdx: origIdx }; })
        .filter(function (it) { return isFeatureVisible(state, it.feat); })
        .sort(function (a, b) {
          var gA = a.feat.geometry === 'point' ? 1 : 0;
          var gB = b.feat.geometry === 'point' ? 1 : 0;
          if (gA !== gB) return gA - gB;
          return (TYPE_STYLES[a.feat.type].order) - (TYPE_STYLES[b.feat.type].order);
        });

      ordered.forEach(function (it) {
        var feat = it.feat;
        if (!feat.points || !feat.points.length) return;
        var st = TYPE_STYLES[feat.type] || TYPE_STYLES.ADD;
        ctx.save();
        if (feat.geometry === 'point' || feat.points.length === 1) {
          var p = feat.points[0];
          ctx.beginPath(); ctx.arc(p.x, p.y, pinR * 1.55, 0, Math.PI * 2);
          ctx.fillStyle = st.fill; ctx.fill();
          ctx.beginPath(); ctx.arc(p.x, p.y, pinR, 0, Math.PI * 2);
          ctx.fillStyle = st.stroke; ctx.fill();
          ctx.lineWidth = Math.max(1.5, fLineW * 0.9); ctx.strokeStyle = '#ffffff'; ctx.stroke();
          ctx.beginPath(); ctx.arc(p.x, p.y, pinR * 0.32, 0, Math.PI * 2);
          ctx.fillStyle = '#080b10'; ctx.fill();
        } else if (feat.points.length >= 3) {
          ctx.beginPath();
          ctx.moveTo(feat.points[0].x, feat.points[0].y);
          for (var vi = 1; vi < feat.points.length; vi++) ctx.lineTo(feat.points[vi].x, feat.points[vi].y);
          ctx.closePath();
          ctx.fillStyle = st.fill; ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = fLineW * 1.9; ctx.lineJoin = 'round';
          ctx.stroke();
          ctx.strokeStyle = st.stroke; ctx.lineWidth = fLineW;
          if (st.dash.length) {
            var ds = forExport ? Math.max(1, refScale / 700) : (1 / zoom);
            ctx.setLineDash(st.dash.map(function (v) { return v * ds; }));
          }
          ctx.stroke(); ctx.setLineDash([]);

          if (!forExport && state.editSavedVertices) {
            var hr = 6.5 / zoom;
            feat.points.forEach(function (vp) {
              ctx.beginPath(); ctx.arc(vp.x, vp.y, hr, 0, Math.PI * 2);
              ctx.fillStyle = st.stroke; ctx.fill();
              ctx.lineWidth = 1.6 / zoom; ctx.strokeStyle = '#ffffff'; ctx.stroke();
            });
          }
        }
        ctx.restore();
      });

      var placedBoxes = [];
      ctx.save();
      ctx.font = 'bold ' + labelFs + 'px Tahoma, Arial, ' + MONO;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ordered.forEach(function (it) {
        var feat = it.feat;
        if (!feat.points || !feat.points.length) return;
        var st = TYPE_STYLES[feat.type] || TYPE_STYLES.ADD;
        var shortT = lang === 'ar' ? st.ar : st.en;
        var isPin = feat.geometry === 'point' || feat.points.length === 1;
        var anchor = isPin ? { cx: feat.points[0].x, cy: feat.points[0].y } : polyAreaCentroidXY(feat.points);
        var pCnt = (feat.photos && feat.photos.length) ? (' 📷' + feat.photos.length) : (feat.photoRef ? ' 📷' : '');
        var caption = (isPin ? '📌 ' : '') + feat.id + ' (' + shortT + ')' + (feat.name ? (': ' + feat.name) : '') + pCnt;
        var tw = ctx.measureText(caption).width;
        var bw = tw + labelFs * 0.84, bh = labelFs + labelFs * 0.52;
        var ty = isPin ? (anchor.cy - pinR * 2.1 - bh * 0.5) : anchor.cy;
        var pos = placeLabelBox(anchor.cx, ty, bw, bh, placedBoxes);

        if (isPin || Math.hypot(pos.x - anchor.cx, pos.y - anchor.cy) > bh * 0.5) {
          ctx.beginPath(); ctx.moveTo(anchor.cx, anchor.cy); ctx.lineTo(pos.x, pos.y);
          ctx.strokeStyle = st.stroke; ctx.lineWidth = Math.max(1, fLineW * 0.6); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(8,11,16,0.88)';
        ctx.fillRect(pos.x - bw / 2, pos.y - bh / 2, bw, bh);
        ctx.strokeStyle = st.stroke; ctx.lineWidth = Math.max(1, fLineW * 0.65);
        ctx.strokeRect(pos.x - bw / 2, pos.y - bh / 2, bw, bh);
        ctx.fillStyle = st.badge;
        ctx.fillText(caption, pos.x, pos.y + 0.5);
      });
      ctx.restore();
    }

    if (!forExport && (state.filters.gcps || opts.activeTool === 'gt_georef') && state.gcps.length > 0) {
      var rG = 8 / zoom;
      var fsG = Math.max(9, 10.5 / zoom);
      ctx.save();
      ctx.font = 'bold ' + fsG + 'px ' + MONO;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      state.gcps.forEach(function (g, idx) {
        var col = g.enabled !== false ? '#ff3c3c' : '#64748b';
        ctx.strokeStyle = '#000000'; ctx.lineWidth = 3.2 / zoom;
        ctx.beginPath();
        ctx.moveTo(g.x - rG * 1.6, g.y); ctx.lineTo(g.x + rG * 1.6, g.y);
        ctx.moveTo(g.x, g.y - rG * 1.6); ctx.lineTo(g.x, g.y + rG * 1.6);
        ctx.stroke();
        ctx.strokeStyle = col; ctx.lineWidth = 1.7 / zoom;
        ctx.beginPath();
        ctx.moveTo(g.x - rG * 1.6, g.y); ctx.lineTo(g.x + rG * 1.6, g.y);
        ctx.moveTo(g.x, g.y - rG * 1.6); ctx.lineTo(g.x, g.y + rG * 1.6);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(g.x, g.y, rG * 0.75, 0, Math.PI * 2); ctx.stroke();

        var lbl = g.label || ('GCP-' + (idx + 1));
        var tw = ctx.measureText(lbl).width;
        ctx.fillStyle = 'rgba(8,11,16,0.88)';
        ctx.fillRect(g.x + rG * 1.4, g.y - fsG * 0.7, tw + 8 / zoom, fsG * 1.4);
        ctx.fillStyle = col;
        ctx.fillText(lbl, g.x + rG * 1.4 + 4 / zoom, g.y);
      });
      ctx.restore();
    }

    if (!forExport && model) {
      var trk = opts.gpsTrack || [];
      if (trk.length >= 2) {
        ctx.save();
        ctx.beginPath();
        var started = false;
        trk.forEach(function (tp) {
          var xy = model.latLonToXY(tp.lat, tp.lon);
          if (!xy) return;
          if (!started) { ctx.moveTo(xy.x, xy.y); started = true; }
          else ctx.lineTo(xy.x, xy.y);
        });
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2.2 / zoom;
        ctx.setLineDash([5 / zoom, 3 / zoom]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      var fix = opts.liveGpsFix || null;
      if (fix) {
        var gp = model.latLonToXY(fix.lat, fix.lon);
        if (gp) {
          ctx.save();
          if (model.metersPerPx && fix.accuracy > 0) {
            var accPx = clamp(fix.accuracy / model.metersPerPx, 6 / zoom, Math.max(imgW, imgH) * 0.45);
            ctx.beginPath(); ctx.arc(gp.x, gp.y, accPx, 0, Math.PI * 2);
            ctx.fillStyle = fix.degraded ? 'rgba(232,200,74,0.16)' : 'rgba(0,229,255,0.16)'; ctx.fill();
            ctx.strokeStyle = fix.degraded ? '#e8c84a' : '#00e5ff'; ctx.lineWidth = 1.4 / zoom; ctx.stroke();
          }
          if (typeof opts.compassHeading === 'number' && isFinite(opts.compassHeading) && model.enToXY) {
            var rad = opts.compassHeading * Math.PI / 180;
            var o0 = model.enToXY(0, 0);
            var o1 = model.enToXY(Math.sin(rad), Math.cos(rad));
            if (o0 && o1) {
              var imgAng = Math.atan2(o1.y - o0.y, o1.x - o0.x);
              ctx.beginPath();
              ctx.moveTo(gp.x, gp.y);
              ctx.arc(gp.x, gp.y, 34 / zoom, imgAng - 0.35, imgAng + 0.35);
              ctx.closePath();
              ctx.fillStyle = 'rgba(57,255,20,0.32)'; ctx.fill();
            }
          }
          var dr = 8 / zoom;
          ctx.beginPath(); ctx.arc(gp.x, gp.y, dr, 0, Math.PI * 2);
          ctx.fillStyle = fix.driftApplied ? '#39ff14' : '#00e5ff'; ctx.fill();
          ctx.lineWidth = 2.5 / zoom; ctx.strokeStyle = '#ffffff'; ctx.stroke();
          ctx.restore();
        }
      }
    }

    var draft = opts.draftPoints || [];
    if (!forExport && draft.length > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(draft[0].x, draft[0].y);
      for (var di = 1; di < draft.length; di++) ctx.lineTo(draft[di].x, draft[di].y);
      if (draft.length >= 3) {
        ctx.save(); ctx.closePath(); ctx.fillStyle = 'rgba(57,255,20,0.18)'; ctx.fill(); ctx.restore();
      }
      ctx.strokeStyle = '#000'; ctx.lineWidth = 4.2 / zoom; ctx.stroke();
      ctx.strokeStyle = '#39ff14'; ctx.lineWidth = 2.2 / zoom; ctx.stroke();
      if (mpp && draft.length >= 2) {
        var efs = Math.max(9, 11 / zoom);
        ctx.font = 'bold ' + efs + 'px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (var ei = 1; ei < draft.length; ei++) {
          var a = draft[ei - 1], b = draft[ei];
          var dM = Math.hypot(b.x - a.x, b.y - a.y) * mpp;
          var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          var txt = dM.toFixed(1) + 'm';
          var tw2 = ctx.measureText(txt).width;
          ctx.fillStyle = 'rgba(8,11,16,0.82)';
          ctx.fillRect(mx - tw2 / 2 - 3 / zoom, my - efs / 2 - 2 / zoom, tw2 + 6 / zoom, efs + 4 / zoom);
          ctx.fillStyle = '#39ff14'; ctx.fillText(txt, mx, my);
        }
      }
      draft.forEach(function (dp, idx) {
        var r = 7.5 / zoom;
        ctx.beginPath(); ctx.arc(dp.x, dp.y, (idx === 0 && draft.length >= 3) ? r * 1.45 : r, 0, Math.PI * 2);
        ctx.fillStyle = idx === 0 ? '#e8c84a' : '#39ff14'; ctx.fill();
        ctx.lineWidth = 2 / zoom; ctx.strokeStyle = '#080b10'; ctx.stroke();
      });
      ctx.restore();
    }

    if (!forExport && opts.activeTool === 'gt_boundary' && pts.length > 0) {
      var rb = 7.5 / zoom;
      ctx.save();
      ctx.font = 'bold ' + Math.max(9, 10.5 / zoom) + 'px ' + MONO;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      pts.forEach(function (bp, idx) {
        ctx.beginPath(); ctx.arc(bp.x, bp.y, (!closed && pts.length >= 3 && idx === 0) ? rb * 1.4 : rb, 0, Math.PI * 2);
        ctx.fillStyle = (!closed && pts.length >= 3 && idx === 0) ? '#39ff14' : '#00e5ff'; ctx.fill();
        ctx.lineWidth = 1.8 / zoom; ctx.strokeStyle = '#ffffff'; ctx.stroke();
        ctx.fillStyle = '#080b10'; ctx.fillText(String(idx + 1), bp.x, bp.y + 0.5 / zoom);
      });
      ctx.restore();
    }

    ctx.restore();
  }

  // =========================================================================
  // 5. AI VISUAL REFERENCE SHEET PNG, STRUCTURED JSON & AI PROMPT BRIEF
  // =========================================================================
  function wrapLines(ctx, text, maxW, maxLines) {
    if (!text) return [];
    var words = String(text).split(/\s+/);
    var lines = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var test = cur ? (cur + ' ' + words[i]) : words[i];
      if (ctx.measureText(test).width <= maxW) cur = test;
      else {
        if (cur) lines.push(cur);
        cur = words[i];
        if (lines.length >= maxLines) break;
      }
    }
    if (cur && lines.length < maxLines) lines.push(cur);
    return lines.slice(0, maxLines);
  }

  function drawImageContain(ctx, im, x, y, w, h) {
    var scale = Math.min(w / im.naturalWidth, h / im.naturalHeight);
    var dw = im.naturalWidth * scale, dh = im.naturalHeight * scale;
    ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  function generateReferenceSheetCanvas(opts) {
    var state = opts.state, baseImg = opts.baseImg, model = opts.georefModel;
    var ppm = opts.pxPerMeter || (model && model.pxPerMeter) || 0;
    var mpp = ppm > 0 ? (1 / ppm) : null;
    if (!baseImg || !state || !state.features.length) return Promise.resolve(null);

    var ordered = state.features.slice().sort(function (a, b) {
      return (TYPE_STYLES[a.type].order) - (TYPE_STYLES[b.type].order);
    });

    return Promise.all(ordered.map(function (f) {
      var list = (f.photos || []).slice(0, 3);
      return Promise.all(list.map(function (ph, idx) {
        return loadImageFromUrl(ph.dataUrl).then(function (im) {
          return { im: im, exportName: buildPhotoExportPath(f.id, idx, ph.origName), bearing: ph.bearing || '' };
        });
      }));
    })).then(function (loadedPhotoLists) {
      var sheetW = 1400, pad = 22, headerH = 92, cardH = 340, cardGap = 18;
      var sheetH = headerH + pad + ordered.length * (cardH + cardGap) + pad;
      var cv = document.createElement('canvas');
      cv.width = sheetW; cv.height = sheetH;
      var ctx = cv.getContext('2d');

      ctx.fillStyle = '#080b10'; ctx.fillRect(0, 0, sheetW, sheetH);
      ctx.fillStyle = '#0c121b'; ctx.fillRect(0, 0, sheetW, headerH);
      ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, headerH); ctx.lineTo(sheetW, headerH); ctx.stroke();

      ctx.fillStyle = '#39ff14'; ctx.font = 'bold 24px ' + MONO;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('AI VISUAL REFERENCE SHEET — GEOTERRA SURVEY', pad, 18);

      var counts = { REM: 0, REP: 0, MOD: 0, ADD: 0 };
      ordered.forEach(function (f) { if (counts[f.type] !== undefined) counts[f.type]++; });
      ctx.fillStyle = '#cbd5e1'; ctx.font = '14px ' + MONO;
      ctx.fillText(
        'Base Map: ' + baseImg.naturalWidth + 'x' + baseImg.naturalHeight + 'px | ' +
        (ppm > 0 ? (ppm.toFixed(2) + ' px/m') : 'Uncalibrated') + ' | ' +
        (model ? ('Georef: ' + model.mode + ' (' + model.activeCount + ' GCPs, RMS ' + model.rmsPx + 'px)') : 'No Georef') +
        ' | Total: ' + ordered.length + ' (REM:' + counts.REM + ', REP:' + counts.REP + ', MOD:' + counts.MOD + ', ADD:' + counts.ADD + ')',
        pad, 56
      );

      var W = baseImg.naturalWidth, H = baseImg.naturalHeight;
      ordered.forEach(function (f, idx) {
        var y0 = headerH + pad + idx * (cardH + cardGap);
        var st = TYPE_STYLES[f.type] || TYPE_STYLES.ADD;
        var isPin = f.geometry === 'point' || f.points.length === 1;
        var cardW = sheetW - pad * 2;

        ctx.fillStyle = '#0c121b'; ctx.fillRect(pad, y0, cardW, cardH);
        ctx.strokeStyle = st.stroke; ctx.lineWidth = 2; ctx.strokeRect(pad, y0, cardW, cardH);

        var chH = 40;
        ctx.fillStyle = '#101926'; ctx.fillRect(pad, y0, cardW, chH);
        ctx.fillStyle = st.stroke; ctx.fillRect(pad, y0, 10, chH);

        var secs = detectFeatureSectors(state, f.points);
        var dimStr = '';
        if (!isPin && mpp) {
          var m = polyAreaCentroidXY(f.points);
          dimStr = ' | ' + (m.areaPx * mpp * mpp).toFixed(1) + ' m²';
        }
        ctx.fillStyle = st.badge; ctx.font = 'bold 17px Tahoma, Arial, ' + MONO;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(
          f.id + '  [' + f.type + ' / ' + (isPin ? 'PIN' : 'POLYGON') + ']  ' + (f.name || '(Unnamed)') +
          '  —  Sector: ' + (secs.length ? secs.join(',') : 'N/A') + dimStr,
          pad + 20, y0 + chH / 2
        );

        var mapX = pad + 14, mapY = y0 + chH + 26, mapW = 330, mapH = 200;
        ctx.fillStyle = '#00e5ff'; ctx.font = 'bold 12px ' + MONO; ctx.textBaseline = 'bottom';
        ctx.fillText('MAP LOCATION CONTEXT', mapX, mapY - 4);
        ctx.fillStyle = '#050a14'; ctx.fillRect(mapX, mapY, mapW, mapH);

        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        f.points.forEach(function (p) {
          if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
        });
        var span = isPin ? Math.max(120, Math.min(W, H) * 0.16) : Math.max(maxX - minX, maxY - minY) * 2.4;
        var halfW = Math.max(80, span * 0.6), halfH = halfW * (mapH / mapW);
        var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        var sx = cx - halfW, sy = cy - halfH, sw = halfW * 2, sh = halfH * 2;
        if (sw > W) { sw = W; sh = sw * (mapH / mapW); }
        if (sh > H) { sh = H; sw = sh * (mapW / mapH); }
        sx = clamp(sx, 0, Math.max(0, W - sw));
        sy = clamp(sy, 0, Math.max(0, H - sh));

        ctx.save();
        ctx.beginPath(); ctx.rect(mapX, mapY, mapW, mapH); ctx.clip();
        ctx.drawImage(baseImg, sx, sy, sw, sh, mapX, mapY, mapW, mapH);
        function toBox(p) { return { x: mapX + ((p.x - sx) / sw) * mapW, y: mapY + ((p.y - sy) / sh) * mapH }; }
        if (isPin) {
          var bp = toBox(f.points[0]);
          ctx.beginPath(); ctx.arc(bp.x, bp.y, 8, 0, Math.PI * 2);
          ctx.fillStyle = st.stroke; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke();
        } else {
          ctx.beginPath();
          f.points.forEach(function (pt, k) { var b = toBox(pt); if (k === 0) ctx.moveTo(b.x, b.y); else ctx.lineTo(b.x, b.y); });
          ctx.closePath(); ctx.fillStyle = st.fill; ctx.fill();
          ctx.strokeStyle = '#000'; ctx.lineWidth = 4.5; ctx.stroke();
          ctx.strokeStyle = st.stroke; ctx.lineWidth = 2.5; ctx.stroke();
        }
        ctx.restore();
        ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 1.5; ctx.strokeRect(mapX, mapY, mapW, mapH);

        var phX = mapX + mapW + 20, phW = cardW - (mapW + 48), phY = mapY, phH = mapH;
        ctx.fillStyle = '#c084fc'; ctx.font = 'bold 12px ' + MONO; ctx.textBaseline = 'bottom';
        ctx.fillText('ATTACHED FIELD PHOTOS + CAMERA BEARING', phX, phY - 4);

        var loaded = (loadedPhotoLists[idx] || []).filter(function (it) { return !!it.im; });
        if (!loaded.length) {
          ctx.fillStyle = '#06090e'; ctx.fillRect(phX, phY, phW, phH);
          ctx.strokeStyle = '#15222e'; ctx.strokeRect(phX, phY, phW, phH);
          ctx.fillStyle = '#7c97b0'; ctx.font = '14px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(f.photoRef ? ('Ref: ' + f.photoRef) : 'No field photo attached', phX + phW / 2, phY + phH / 2);
        } else {
          var slotGap = 12, slotW = (phW - slotGap * (loaded.length - 1)) / loaded.length;
          loaded.forEach(function (item, pi) {
            var bx = phX + pi * (slotW + slotGap);
            ctx.fillStyle = '#050a14'; ctx.fillRect(bx, phY, slotW, phH);
            drawImageContain(ctx, item.im, bx + 4, phY + 4, slotW - 8, phH - 28);
            ctx.strokeStyle = '#1f3b52'; ctx.strokeRect(bx, phY, slotW, phH);
            ctx.fillStyle = 'rgba(8,11,16,0.92)'; ctx.fillRect(bx, phY + phH - 22, slotW, 22);
            ctx.fillStyle = '#d9ecff'; ctx.font = '11px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(item.exportName + (item.bearing ? (' | Cam->' + item.bearing) : ''), bx + slotW / 2, phY + phH - 11, slotW - 8);
          });
        }

        var noteY = mapY + mapH + 10, noteH = cardH - (noteY - y0) - 10;
        ctx.fillStyle = '#06090e'; ctx.fillRect(mapX, noteY, cardW - 28, noteH);
        ctx.strokeStyle = '#15222e'; ctx.strokeRect(mapX, noteY, cardW - 28, noteH);

        var noteLine = f.type === 'REP'
          ? ('[STEP 1 REMOVE]: ' + (f.removeNotes || '-') + '  ||  [STEP 2 ADD]: ' + (f.addNotes || '-'))
          : ('[' + f.type + ']: ' + (f.notes || '-'));
        var ctr = polyAreaCentroidXY(f.points);
        var ll = (model && model.xyToLatLon) ? model.xyToLatLon(ctr.cx, ctr.cy) : null;
        var gpsTxt = ll ? (' | GPS: ' + ll.lat.toFixed(6) + ', ' + ll.lon.toFixed(6)) : '';
        ctx.fillStyle = '#d9ecff'; ctx.font = '13px Tahoma, Arial, ' + MONO; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        wrapLines(ctx, noteLine + gpsTxt, cardW - 48, 2).forEach(function (ln, li) {
          ctx.fillText(ln, mapX + 10, noteY + 8 + li * 20, cardW - 48);
        });
      });
      return cv;
    });
  }

  function buildProjectPayload(opts) {
    var state = opts.state, baseImg = opts.baseImg, model = opts.georefModel;
    var ppm = opts.pxPerMeter || (model && model.pxPerMeter) || 0;
    var mpp = ppm > 0 ? (1 / ppm) : null;
    var includePhotos = !!opts.includeBase64Photos;
    function r2(v) { return Math.round(v * 100) / 100; }
    function mapPt(p) {
      var o = { x: r2(p.x), y: r2(p.y) };
      if (model && model.xyToLatLon) {
        var ll = model.xyToLatLon(p.x, p.y);
        if (ll) { o.lat = ll.lat; o.lon = ll.lon; }
      }
      return o;
    }

    var exportedFeatures = (state.features || []).map(function (f) {
      var isPin = f.geometry === 'point' || f.points.length === 1;
      var photoEntries = (f.photos || []).map(function (ph, pi) {
        var po = { file: buildPhotoExportPath(f.id, pi, ph.origName), origName: ph.origName, cameraBearing: ph.bearing || '', width: ph.width, height: ph.height };
        if (includePhotos) po.dataUrl = ph.dataUrl;
        return po;
      });
      var entry = {
        id: f.id,
        geometry: isPin ? 'point' : 'polygon',
        type: f.type,
        executionOrder: TYPE_STYLES[f.type].order,
        name: f.name,
        photoRef: f.photoRef || '',
        photos: photoEntries,
        sectors: detectFeatureSectors(state, f.points),
        points: f.points.map(mapPt)
      };
      if (f.type === 'REP') { entry.removeNotes = f.removeNotes || ''; entry.addNotes = f.addNotes || ''; }
      else entry.notes = f.notes || '';
      if (!isPin && mpp) {
        var m = polyAreaCentroidXY(f.points);
        entry.areaM2 = r2(m.areaPx * mpp * mpp);
        entry.perimeterM = r2(m.perimeterPx * mpp);
      }
      return entry;
    });

    var executionPlan = {
      pass1_removals: exportedFeatures.filter(function (f) { return f.type === 'REM' || f.type === 'REP'; }).map(function (f) {
        return { id: f.id, geometry: f.geometry, sourceType: f.type, name: f.name, photos: f.photos.map(function (p) { return { file: p.file, cameraBearing: p.cameraBearing }; }), action: f.type === 'REP' ? f.removeNotes : f.notes };
      }),
      pass2_modifications: exportedFeatures.filter(function (f) { return f.type === 'MOD'; }).map(function (f) {
        return { id: f.id, geometry: f.geometry, name: f.name, photos: f.photos.map(function (p) { return { file: p.file, cameraBearing: p.cameraBearing }; }), action: f.notes };
      }),
      pass3_additions: exportedFeatures.filter(function (f) { return f.type === 'ADD' || f.type === 'REP'; }).map(function (f) {
        return { id: f.id, geometry: f.geometry, sourceType: f.type, name: f.name, photos: f.photos.map(function (p) { return { file: p.file, cameraBearing: p.cameraBearing }; }), action: f.type === 'REP' ? f.addNotes : f.notes };
      })
    };

    return {
      version: 7,
      language: opts.lang || 'en',
      imageWidth: baseImg ? baseImg.naturalWidth : 0,
      imageHeight: baseImg ? baseImg.naturalHeight : 0,
      metersPerPixel: mpp ? Number(mpp.toFixed(6)) : null,
      georeferencing: {
        active: !!model,
        mode: model ? model.mode : null,
        rmsPx: model ? model.rmsPx : null,
        northOffsetDeg: model ? model.northOffsetDeg : 0,
        gcps: (state.gcps || []).map(function (g) { return { x: r2(g.x), y: r2(g.y), lat: g.lat, lon: g.lon, label: g.label || '', enabled: g.enabled !== false }; })
      },
      grid: { cols: state.grid.cols, rows: state.grid.rows, aligned: state.grid.aligned },
      boundaryClosed: state.boundaryClosed,
      points: (state.boundary || []).map(mapPt),
      executionPlan: executionPlan,
      features: exportedFeatures
    };
  }

  function buildAiPromptBrief(payload) {
    var lines = [
      '===============================================================',
      'AI AGENT SATELLITE MAP UPDATE BRIEF (GEOTERRA / AJ-GeoCAD v7)',
      '===============================================================',
      'Base Map Dimensions : ' + payload.imageWidth + ' x ' + payload.imageHeight + ' px',
      'Scale Calibration   : ' + (payload.metersPerPixel ? ((1 / payload.metersPerPixel).toFixed(2) + ' px/m') : 'Uncalibrated'),
      'Georeferencing      : ' + (payload.georeferencing.active ? (payload.georeferencing.gcps.length + ' GCPs (' + payload.georeferencing.mode + ', RMS ' + payload.georeferencing.rmsPx + 'px)') : 'None'),
      'Total Marked Items  : ' + payload.features.length,
      '',
      'MANDATORY RULES FOR AI AGENT:',
      '1. Execute strictly in 3-pass order: Pass 1 (REM/REP-remove) -> Pass 2 (MOD) -> Pass 3 (ADD/REP-add).',
      '2. Use linked photos in photos/ and ai_reference_sheet.png (respecting cameraBearing) to simulate an accurate 90-degree orthographic top-down view.',
      '3. Match sun shadow direction, soil warmth, contrast, and grain. Leave unmarked areas untouched.',
      ''
    ];
    function fmtPh(arr) { return arr.map(function (p) { return p.cameraBearing ? (p.file + ' [Cam->' + p.cameraBearing + ']') : p.file; }).join(', '); }
    function dump(title, items) {
      lines.push('---------------------------------------------------------------');
      lines.push(title);
      lines.push('---------------------------------------------------------------');
      if (!items.length) { lines.push('(None)'); lines.push(''); return; }
      items.forEach(function (it) {
        lines.push('- ' + it.id + ' [' + (it.sourceType || 'MOD') + ' | ' + it.geometry + '] ' + (it.name || '(Unnamed)'));
        lines.push('  Action : ' + (it.action || '-'));
        if (it.photos.length) lines.push('  Photos : ' + fmtPh(it.photos));
      });
      lines.push('');
    }
    dump('PASS 1 — REMOVALS (Clean Plate First)', payload.executionPlan.pass1_removals);
    dump('PASS 2 — MODIFICATIONS', payload.executionPlan.pass2_modifications);
    dump('PASS 3 — ADDITIONS (Simulate 90-deg Top-Down & Blend)', payload.executionPlan.pass3_additions);
    return lines.join('\n');
  }

  function renderMarkedMapCanvas(opts, cropOnly) {
    var baseImg = opts.baseImg, state = opts.state;
    if (!baseImg) return null;
    var fullCv = document.createElement('canvas');
    fullCv.width = baseImg.naturalWidth;
    fullCv.height = baseImg.naturalHeight;
    var fg = fullCv.getContext('2d');
    fg.drawImage(baseImg, 0, 0);
    drawGeoTerraLayer(fg, Object.assign({}, opts, { imgW: baseImg.naturalWidth, imgH: baseImg.naturalHeight, forExport: true }));
    if (!cropOnly || !state.boundaryClosed || state.boundary.length < 3) return fullCv;

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    state.boundary.forEach(function (p) {
      if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
    });
    var pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.05);
    var sx = Math.max(0, Math.floor(minX - pad)), sy = Math.max(0, Math.floor(minY - pad));
    var ex = Math.min(baseImg.naturalWidth, Math.ceil(maxX + pad)), ey = Math.min(baseImg.naturalHeight, Math.ceil(maxY + pad));
    var cw = Math.max(1, ex - sx), ch = Math.max(1, ey - sy);
    var cropCv = document.createElement('canvas');
    cropCv.width = cw; cropCv.height = ch;
    cropCv.getContext('2d').drawImage(fullCv, sx, sy, cw, ch, 0, 0, cw, ch);
    fullCv.width = 0; fullCv.height = 0;
    return cropCv;
  }

  function exportAiZipPackage(opts, onStatus) {
    var baseImg = opts.baseImg, state = opts.state;
    if (!baseImg) { if (onStatus) onStatus('Import 01_Base_Satellite first.', true); return Promise.resolve(); }
    if (onStatus) onStatus('Building GeoTerra AI ZIP package...', false);
    var entries = [];
    var payload = buildProjectPayload(Object.assign({}, opts, { includeBase64Photos: false }));
    entries.push({ name: 'project_ai.json', data: JSON.stringify(payload, null, 2) });
    entries.push({ name: 'AI_PROMPT_BRIEF.txt', data: buildAiPromptBrief(payload) });

    if (opts.georefModel && S.SatGeorefGPS) {
      var pgw = S.SatGeorefGPS.buildWorldFilePGW(opts.georefModel, baseImg.naturalWidth, baseImg.naturalHeight);
      if (pgw) {
        entries.push({ name: 'marked_map_full.pgw', data: pgw });
        entries.push({ name: 'marked_map_full.prj', data: S.SatGeorefGPS.WGS84_PRJ_WKT });
      }
    }

    var fullCv = renderMarkedMapCanvas(opts, false);
    var cropCv = (state.boundaryClosed && state.boundary.length >= 3) ? renderMarkedMapCanvas(opts, true) : null;

    return Promise.all([
      fullCv ? canvasToPngUint8Array(fullCv) : Promise.resolve(null),
      cropCv ? canvasToPngUint8Array(cropCv) : Promise.resolve(null),
      state.features.length ? generateReferenceSheetCanvas(opts).then(function (scv) { return scv ? canvasToPngUint8Array(scv) : null; }) : Promise.resolve(null)
    ]).then(function (res) {
      if (fullCv) { fullCv.width = 0; fullCv.height = 0; }
      if (cropCv) { cropCv.width = 0; cropCv.height = 0; }
      if (res[0]) entries.push({ name: 'marked_map_full.png', data: res[0] });
      if (res[1]) entries.push({ name: 'marked_map_crop.png', data: res[1] });
      if (res[2]) entries.push({ name: 'ai_reference_sheet.png', data: res[2] });

      (state.features || []).forEach(function (f) {
        (f.photos || []).forEach(function (ph, pi) {
          if (ph.dataUrl) entries.push({ name: buildPhotoExportPath(f.id, pi, ph.origName), data: dataUrlToUint8Array(ph.dataUrl) });
        });
      });

      var zipBlob = buildZipBlob(entries);
      triggerDownloadBlob(zipBlob, 'geoterra_ai_package_v7.zip');
      if (onStatus) onStatus('Exported geoterra_ai_package_v7.zip (' + entries.length + ' files).', false);
    }).catch(function (err) {
      if (onStatus) onStatus('ZIP export failed: ' + err.message, true);
    });
  }

  function parseImportedSurveyJson(text) {
    var data = JSON.parse(text);
    var raw = {
      boundary: Array.isArray(data.points) ? data.points : (Array.isArray(data.boundary) ? data.boundary : []),
      boundaryClosed: typeof data.boundaryClosed === 'boolean' ? data.boundaryClosed : (Array.isArray(data.points) && data.points.length >= 3),
      grid: data.grid || { cols: data.cols || 6, rows: data.rows || 4, aligned: data.aligned !== false },
      gcps: (data.georeferencing && Array.isArray(data.georeferencing.gcps)) ? data.georeferencing.gcps : (data.gcps || []),
      features: Array.isArray(data.features) ? data.features.map(function (item) {
        var photos = Array.isArray(item.photos) ? item.photos.filter(function (p) {
          return p && typeof p.dataUrl === 'string' && p.dataUrl.indexOf('data:image/') === 0;
        }).map(function (p) {
          var bytes = Math.round((p.dataUrl.length - p.dataUrl.indexOf(',') - 1) * 0.75);
          return { origName: p.origName || p.file || 'photo.jpg', dataUrl: p.dataUrl, width: +p.width || 0, height: +p.height || 0, sizeKB: Math.max(1, Math.round(bytes / 1024)), bearing: p.cameraBearing || p.bearing || '' };
        }) : [];
        return Object.assign({}, item, { photos: photos });
      }) : []
    };
    return { state: mergeState(raw), metersPerPixel: (typeof data.metersPerPixel === 'number' && data.metersPerPixel > 0) ? data.metersPerPixel : null };
  }

  function convertToArcGISFeatures(state) {
    if (!S.SatArcGIS || !state) return [];
    var out = [];
    if (state.boundary && state.boundary.length >= 3) {
      out.push(S.SatArcGIS.createFeature({
        geom: 'polygon', category: 'perimeter', name: 'GeoTerra Village Boundary',
        points: state.boundary, notes: 'Synced from GeoTerra Boundary'
      }));
    }
    var catMap = { REM: 'hazard', REP: 'generic', MOD: 'building', ADD: 'safe_zone' };
    (state.features || []).forEach(function (f) {
      var noteTxt = f.type === 'REP'
        ? ('REM: ' + (f.removeNotes || '-') + ' | ADD: ' + (f.addNotes || '-'))
        : (f.notes || '');
      out.push(S.SatArcGIS.createFeature({
        geom: f.geometry === 'point' ? 'point' : 'polygon',
        category: catMap[f.type] || 'generic',
        name: f.id + (f.name ? (' ' + f.name) : ''),
        notes: noteTxt,
        points: f.points,
        props: { geoTerraId: f.id, opType: f.type, photoCount: (f.photos || []).length }
      }));
    });
    return out;
  }

  // =========================================================================
  // 6. SELF-CONTAINED TOUCH-FRIENDLY FEATURE MODAL & LIGHTBOX (Z-INDEX 2000)
  // =========================================================================
  function ensureModalCss() {
    if (document.getElementById('aj-sat-gt-css')) return;
    var st = document.createElement('style');
    st.id = 'aj-sat-gt-css';
    st.textContent =
      '.sgt-bg{position:fixed;inset:0;z-index:2000;background:rgba(2,6,15,.85);display:none;align-items:center;justify-content:center;padding:12px;font-family:' + MONO + '}' +
      '.sgt-bg.open{display:flex!important}' +
      '.sgt-box{width:100%;max-width:460px;max-height:90dvh;overflow-y:auto;background:#0c121b;color:#d9ecff;border:1.5px solid #00e5ff;border-radius:10px;padding:14px;box-shadow:0 14px 38px rgba(0,0,0,.78);display:flex;flex-direction:column;gap:10px;font-size:12px}' +
      'body.ui-day .sgt-box{background:#f8fafc;color:#0f172a;border-color:#0369a1}' +
      '.sgt-box h3{margin:0;font-size:13.5px;color:#00e5ff;display:flex;justify-content:space-between;align-items:center;gap:8px}' +
      'body.ui-day .sgt-box h3{color:#0369a1}' +
      '.sgt-badge{font-size:10px;padding:2px 7px;border-radius:4px;border:1px solid #c084fc;color:#c084fc;font-weight:700}' +
      '.sgt-types{display:grid;grid-template-columns:1fr 1fr;gap:6px}' +
      '.sgt-tbtn{min-height:36px;padding:7px;border-radius:6px;border:1.5px solid #1f3b52!important;background:#06090e!important;color:#d9ecff!important;cursor:pointer;font-family:inherit;font-size:11.5px;font-weight:700;box-shadow:none!important}' +
      'body.ui-day .sgt-tbtn{background:#ffffff!important;color:#0f172a!important;border-color:#94a3b8!important}' +
      '.sgt-tbtn.sel-ADD{border-color:#39ff14!important;color:#39ff14!important;background:rgba(57,255,20,.16)!important}' +
      '.sgt-tbtn.sel-REP{border-color:#c084fc!important;color:#c084fc!important;background:rgba(192,132,252,.18)!important}' +
      '.sgt-tbtn.sel-REM{border-color:#ff3c3c!important;color:#ff3c3c!important;background:rgba(255,60,60,.18)!important}' +
      '.sgt-tbtn.sel-MOD{border-color:#e8c84a!important;color:#e8c84a!important;background:rgba(232,200,74,.18)!important}' +
      'body.ui-day .sgt-tbtn.sel-ADD{border-color:#15803d!important;color:#15803d!important;background:#dcfce7!important}' +
      'body.ui-day .sgt-tbtn.sel-REP{border-color:#7e22ce!important;color:#7e22ce!important;background:#f3e8ff!important}' +
      'body.ui-day .sgt-tbtn.sel-REM{border-color:#dc2626!important;color:#dc2626!important;background:#fee2e2!important}' +
      'body.ui-day .sgt-tbtn.sel-MOD{border-color:#b45309!important;color:#b45309!important;background:#fef3c7!important}' +
      '.sgt-box input[type=text],.sgt-box textarea,.sgt-box select{width:100%;padding:7px 9px;border-radius:6px;border:1px solid #1f3b52;background:#06090e;color:#d9ecff;font-family:inherit;font-size:12px;box-sizing:border-box}' +
      'body.ui-day .sgt-box input[type=text],body.ui-day .sgt-box textarea,body.ui-day .sgt-box select{background:#fff;color:#0f172a;border-color:#cbd5e1}' +
      '.sgt-btn{min-height:36px;padding:7px 14px;border-radius:6px;border:1.5px solid #1f3b52!important;background:#101926!important;color:#d9ecff!important;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px;white-space:nowrap;box-shadow:none!important}' +
      'body.ui-day .sgt-btn{background:#eef3f8!important;color:#0f172a!important;border-color:#94a3b8!important}' +
      '.sgt-btn.ok{border-color:#00ff66!important;color:#00ff66!important;background:rgba(0,255,102,.15)!important}' +
      'body.ui-day .sgt-btn.ok{border-color:#15803d!important;color:#15803d!important;background:#dcfce7!important}' +
      '.sgt-btn.dng{border-color:#ff3c3c!important;color:#ff3c3c!important;background:rgba(255,60,60,.14)!important}' +
      '.sgt-thumbs{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}' +
      '.sgt-tcard{position:relative;width:102px;background:#06090e;border:1px solid #1f3b52;border-radius:6px;padding:4px}' +
      '.sgt-tcard img{width:100%;height:58px;object-fit:cover;border-radius:3px;cursor:pointer;display:block}' +
      '.sgt-tdel{position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#ff3c3c;color:#fff;border:1px solid #fff;font-size:12px;cursor:pointer;padding:0;line-height:1}' +
      '.sgt-flt{display:flex;flex-wrap:wrap;gap:4px}' +
      '.sgt-flt button{flex:1 1 auto;min-height:28px;padding:3px 6px;border-radius:4px;font-size:10.5px;font-weight:700;cursor:pointer;border:1px solid var(--sc-border,#15222e)!important;background:var(--sc-input,#06090e)!important;color:var(--sc-mut,#7c97b0)!important;box-shadow:none!important}' +
      '.sgt-flt button.on{border-color:var(--sc-cyan,#00e5ff)!important;color:var(--sc-txt,#d9ecff)!important;background:rgba(0,229,255,.14)!important}' +
      '.sgt-lb{position:fixed;inset:0;z-index:2100;background:rgba(2,6,15,.94);display:none;flex-direction:column;align-items:center;justify-content:center;padding:16px;cursor:pointer}' +
      '.sgt-lb.open{display:flex}' +
      '.sgt-lb img{max-width:95vw;max-height:82vh;border:2px solid #00e5ff;border-radius:6px;object-fit:contain}' +
      '.sgt-lb div{margin-top:8px;color:#00e5ff;font-family:' + MONO + ';font-size:12px;text-align:center}';
    document.head.appendChild(st);
  }

  function openLightbox(dataUrl, caption) {
    ensureModalCss();
    var lb = document.getElementById('sgt_lightbox');
    if (!lb) {
      lb = document.createElement('div');
      lb.id = 'sgt_lightbox';
      lb.className = 'sgt-lb';
      lb.dataset.ajDone = '1';
      lb.innerHTML = '<img id="sgt_lb_img" alt=""><div id="sgt_lb_cap"></div>';
      lb.onclick = function () { lb.classList.remove('open'); };
      document.body.appendChild(lb);
    }
    lb.querySelector('#sgt_lb_img').src = dataUrl;
    lb.querySelector('#sgt_lb_cap').textContent = caption || '';
    lb.classList.add('open');
  }

  function openFeatureModal(opts) {
    ensureModalCss();
    var state = opts.state;
    var editIdx = typeof opts.editIndex === 'number' ? opts.editIndex : -1;
    var geom = opts.geometry || 'polygon';
    var draftPts = opts.points || [];
    var lang = opts.lang || 'en';
    var getHeading = opts.getCompassHeading || function () { return null; };
    var onSave = opts.onSave || function () {};
    var onCancel = opts.onCancel || function () {};

    var bg = document.getElementById('sgt_feat_modal');
    if (!bg) {
      bg = document.createElement('div');
      bg.id = 'sgt_feat_modal';
      bg.className = 'sgt-bg';
      bg.dataset.ajDone = '1';
      document.body.appendChild(bg);
    }

    var isEdit = editIdx >= 0 && state.features[editIdx];
    var existing = isEdit ? state.features[editIdx] : null;
    var activeId = isEdit ? existing.id : formatId(state.nextFeatNum);
    var curType = isEdit ? existing.type : 'ADD';
    var draftPhotos = isEdit ? (existing.photos || []).map(function (p) { return Object.assign({}, p); }) : [];
    var secs = detectFeatureSectors(state, isEdit ? existing.points : draftPts);

    bg.innerHTML =
      '<div class="sgt-box" dir="' + (lang === 'ar' ? 'rtl' : 'ltr') + '" data-aj-done="1">' +
        '<h3><span>' + (lang === 'ar' ? (isEdit ? 'تعديل معلم GeoTerra' : 'إضافة معلم ميداني GeoTerra') : (isEdit ? 'Edit GeoTerra Feature' : 'Add GeoTerra Feature')) + '</span><span class="sgt-badge">' + esc(activeId) + '</span></h3>' +
        '<div style="font-size:10.5px;color:#00e5ff">' + (geom === 'point' ? '📌 PIN' : ('📐 POLYGON (' + (isEdit ? existing.points.length : draftPts.length) + ' pts)')) + ' | Sector: ' + (secs.length ? secs.join(', ') : 'N/A') + '</div>' +
        '<div class="sgt-types">' +
          '<button type="button" class="sgt-tbtn" data-tp="ADD">🟢 ADD / إضافة</button>' +
          '<button type="button" class="sgt-tbtn" data-tp="REP">🟣 REP / استبدال</button>' +
          '<button type="button" class="sgt-tbtn" data-tp="REM">🔴 REM / إزالة</button>' +
          '<button type="button" class="sgt-tbtn" data-tp="MOD">🟠 MOD / تعديل</button>' +
        '</div>' +
        '<label>' + (lang === 'ar' ? 'اسم المعلم' : 'Feature Name') + '<input type="text" id="sgt_name" placeholder="' + (lang === 'ar' ? 'مثال: خيمة، ملعب، مبنى...' : 'e.g. Tent, Pitch, Building...') + '" value="' + esc(existing ? existing.name : '') + '"></label>' +
        '<div>' +
          '<div style="display:flex;gap:6px;align-items:center">' +
            '<input type="text" id="sgt_photoref" placeholder="' + (lang === 'ar' ? 'مرجع الصور الميدانية...' : 'Field photo refs...') + '" value="' + esc(existing ? existing.photoRef : '') + '">' +
            '<label class="sgt-btn ok" style="cursor:pointer;min-height:34px;padding:5px 10px">📷 ' + (lang === 'ar' ? 'صور' : 'Photos') + '<input type="file" id="sgt_photo_in" accept="image/*" multiple hidden></label>' +
          '</div>' +
          '<div id="sgt_thumbs" class="sgt-thumbs"></div>' +
        '</div>' +
        '<div id="sgt_single_wrap"><label>' + (lang === 'ar' ? 'التعليمات والملاحظات الميدانية' : 'Field Notes / Instructions') + '<textarea id="sgt_notes" rows="2">' + esc(existing ? existing.notes : '') + '</textarea></label></div>' +
        '<div id="sgt_rep_wrap" style="display:none;border:1px dashed #c084fc;padding:8px;border-radius:6px">' +
          '<label style="color:#fca5a5">' + (lang === 'ar' ? 'الخطوة 1 — ما سيُزال (REM)' : 'Step 1 — Remove (REM)') + '<textarea id="sgt_rep_rem" rows="2">' + esc(existing ? existing.removeNotes : '') + '</textarea></label>' +
          '<label style="color:#86efac">' + (lang === 'ar' ? 'الخطوة 2 — ما سيُضاف (ADD)' : 'Step 2 — Add (ADD)') + '<textarea id="sgt_rep_add" rows="2">' + esc(existing ? existing.addNotes : '') + '</textarea></label>' +
        '</div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">' +
          '<button type="button" class="sgt-btn ok" id="sgt_save">💾 ' + (lang === 'ar' ? 'حفظ المعلم' : 'Save Feature') + '</button>' +
          '<button type="button" class="sgt-btn dng" id="sgt_cancel">' + (lang === 'ar' ? 'إلغاء' : 'Cancel') + '</button>' +
        '</div>' +
      '</div>';

    var boxEl = bg.querySelector('.sgt-box');
    boxEl.onclick = function (ev) { ev.stopPropagation(); };

    function syncType(tp) {
      curType = tp;
      [].forEach.call(bg.querySelectorAll('[data-tp]'), function (b) {
        b.className = 'sgt-tbtn' + (b.dataset.tp === tp ? (' sel-' + tp) : '');
      });
      bg.querySelector('#sgt_single_wrap').style.display = tp === 'REP' ? 'none' : 'block';
      bg.querySelector('#sgt_rep_wrap').style.display = tp === 'REP' ? 'block' : 'none';
    }
    [].forEach.call(bg.querySelectorAll('[data-tp]'), function (b) { b.onclick = function () { syncType(b.dataset.tp); }; });
    syncType(curType);

    function renderThumbs() {
      var wrap = bg.querySelector('#sgt_thumbs');
      wrap.innerHTML = '';
      draftPhotos.forEach(function (ph, idx) {
        var card = document.createElement('div');
        card.className = 'sgt-tcard';
        var im = document.createElement('img');
        im.src = ph.dataUrl;
        im.onclick = function () { openLightbox(ph.dataUrl, activeId + ' — ' + ph.origName + (ph.bearing ? (' | 🧭 ' + ph.bearing) : '')); };

        var row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:3px;margin-top:4px';
        var sel = document.createElement('select');
        sel.style.cssText = 'padding:2px;font-size:10px';
        var optsHtml = '<option value="">Dir?</option>';
        if (ph.bearing && CARDINALS.indexOf(ph.bearing) < 0) optsHtml += '<option value="' + esc(ph.bearing) + '" selected>' + esc(ph.bearing) + '</option>';
        CARDINALS.forEach(function (c) { optsHtml += '<option value="' + c + '"' + (ph.bearing === c ? ' selected' : '') + '>' + c + '</option>'; });
        sel.innerHTML = optsHtml;
        sel.onchange = function () { ph.bearing = sel.value; };

        var stmp = document.createElement('button');
        stmp.type = 'button'; stmp.className = 'sgt-btn'; stmp.textContent = '🧭'; stmp.style.cssText = 'min-height:22px;padding:2px 5px;font-size:10px';
        stmp.onclick = function () {
          var h = getHeading();
          if (typeof h === 'number' && isFinite(h)) {
            var d = Math.round(h) % 360;
            ph.bearing = d + '° ' + degToCardinal(d);
            renderThumbs();
          }
        };
        row.appendChild(sel); row.appendChild(stmp);

        var del = document.createElement('button');
        del.type = 'button'; del.className = 'sgt-tdel'; del.textContent = '×';
        del.onclick = function () { draftPhotos.splice(idx, 1); renderThumbs(); };

        card.appendChild(im); card.appendChild(row); card.appendChild(del);
        wrap.appendChild(card);
      });
    }
    renderThumbs();

    bg.querySelector('#sgt_photo_in').onchange = function () {
      var files = [].slice.call(this.files || []);
      this.value = '';
      if (!files.length) return;
      Promise.all(files.map(function (f) { return compressImageFile(f, 1024, 0.82, getHeading()); })).then(function (list) {
        list.forEach(function (ph) { draftPhotos.push(ph); });
        renderThumbs();
      });
    };

    bg.querySelector('#sgt_save').onclick = function () {
      var payload = {
        id: activeId,
        geometry: isEdit ? existing.geometry : geom,
        type: curType,
        name: bg.querySelector('#sgt_name').value.trim(),
        photoRef: bg.querySelector('#sgt_photoref').value.trim(),
        photos: draftPhotos,
        notes: curType === 'REP' ? '' : bg.querySelector('#sgt_notes').value.trim(),
        removeNotes: curType === 'REP' ? bg.querySelector('#sgt_rep_rem').value.trim() : '',
        addNotes: curType === 'REP' ? bg.querySelector('#sgt_rep_add').value.trim() : '',
        points: isEdit ? existing.points : draftPts.map(function (p) { return { x: +p.x.toFixed(2), y: +p.y.toFixed(2) }; })
      };
      bg.classList.remove('open');
      onSave(payload, isEdit ? editIdx : -1);
    };
    bg.querySelector('#sgt_cancel').onclick = function () {
      bg.classList.remove('open');
      onCancel();
    };
    bg.classList.add('open');
  }

  // =========================================================================
  // 7. UNIFIED GEOTERRA WORKSPACE PANEL RENDERER
  // =========================================================================
  function renderGeoTerraPanel(container, opts) {
    if (!container || !opts || !opts.state) return;
    ensureModalCss();
    var st = opts.state;
    var cb = opts.callbacks || {};
    var ar = opts.lang === 'ar';
    var model = opts.georefModel || null;
    var gpsStatus = opts.gpsStatus || 'OFF';

    var grid = computeGridModel(st);
    var secCount = grid ? grid.labels.length : 0;

    var listHtml = st.features.length ? st.features.map(function (f, idx) {
      var ts = TYPE_STYLES[f.type] || TYPE_STYLES.ADD;
      var secs = detectFeatureSectors(st, f.points);
      return '<div class="satc-ait" data-gtidx="' + idx + '">' +
        '<b style="color:' + ts.stroke + ';margin-inline-end:4px">' + esc(f.id) + '</b>' +
        '<span>' + esc(f.name || (ar ? '(بدون اسم)' : '(Unnamed)')) + (secs.length ? (' [' + secs.join(',') + ']') : '') + ((f.photos && f.photos.length) ? (' 📷' + f.photos.length) : '') + '</span>' +
        '<button type="button" class="satc-qbtn" data-gtfoc="' + idx + '" style="padding:2px 6px" title="Focus">👁</button>' +
        '<button type="button" class="satc-qbtn cy" data-gted="' + idx + '" style="padding:2px 6px" title="Edit">✎</button>' +
        '<button type="button" class="satc-qbtn dng" data-gtdel="' + idx + '" style="padding:2px 6px" title="Delete">×</button>' +
      '</div>';
    }).join('') : '<div class="mut">' + (ar ? 'لا توجد معالم GeoTerra بعد — اضغط (+ مضلع) أو (+ دبوس) للبدء.' : 'No GeoTerra features yet — tap (+ Polygon) or (+ Pin) to start.') + '</div>';

    container.innerHTML =
      '<div class="satc-card" style="border-color:var(--sc-purple,#c084fc)">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<b style="color:var(--sc-purple,#c084fc)">GEOTERRA SURVEY v7</b>' +
          '<span class="satc-tag gt">' + st.features.length + (ar ? ' معلم' : ' items') + ' · ' + secCount + (ar ? ' قطاع' : ' sec') + '</span>' +
        '</div>' +
        '<div class="satc-grid2">' +
          '<button type="button" class="satc-qbtn on" id="sgtP_poly">📐 ' + (ar ? '+ مضلع معلم' : '+ Add Polygon') + '</button>' +
          '<button type="button" class="satc-qbtn on" id="sgtP_pin">📌 ' + (ar ? '+ دبوس معلم' : '+ Add Pin') + '</button>' +
        '</div>' +
        '<div class="satc-grid2">' +
          '<button type="button" class="satc-qbtn" id="sgtP_bound">🗺 ' + (ar ? 'حدود القرية' : 'Boundary') + ' (' + st.boundary.length + ')</button>' +
          '<button type="button" class="satc-qbtn cy" id="sgtP_closeB"' + (st.boundaryClosed || st.boundary.length < 3 ? ' disabled' : '') + '>✅ ' + (ar ? 'إغلاق القطاعات' : 'Close Grid') + '</button>' +
        '</div>' +
        '<div class="sgt-flt">' +
          '<button type="button" data-gtf="ADD" class="' + (st.filters.ADD !== false ? 'on' : '') + '">🟢 ADD</button>' +
          '<button type="button" data-gtf="MOD" class="' + (st.filters.MOD !== false ? 'on' : '') + '">🟠 MOD</button>' +
          '<button type="button" data-gtf="REP" class="' + (st.filters.REP !== false ? 'on' : '') + '">🟣 REP</button>' +
          '<button type="button" data-gtf="REM" class="' + (st.filters.REM !== false ? 'on' : '') + '">🔴 REM</button>' +
          '<button type="button" data-gtf="pins" class="' + (st.filters.pins !== false ? 'on' : '') + '">📌 Pins</button>' +
        '</div>' +
        '<div class="satc-grid2">' +
          '<label>' + (ar ? 'أعمدة' : 'Cols') + '<input type="number" id="sgtP_cols" min="2" max="20" value="' + st.grid.cols + '"></label>' +
          '<label>' + (ar ? 'صفوف' : 'Rows') + '<input type="number" id="sgtP_rows" min="2" max="20" value="' + st.grid.rows + '"></label>' +
        '</div>' +
        '<div class="satc-grid2">' +
          '<label class="ck"><input type="checkbox" id="sgtP_align"' + (st.grid.aligned ? ' checked' : '') + '>' + (ar ? 'محاذاة الضلع' : 'Align Edge') + '</label>' +
          '<label class="ck"><input type="checkbox" id="sgtP_dim"' + (st.grid.dimOutside ? ' checked' : '') + '>' + (ar ? 'تعتيم الخارج' : 'Dim Outside') + '</label>' +
        '</div>' +
        '<div class="satc-grid2">' +
          '<label class="ck"><input type="checkbox" id="sgtP_sub"' + (st.grid.subGrid ? ' checked' : '') + '>' + (ar ? 'شبكة فرعية' : 'Sub-Grid') + '</label>' +
          '<label class="ck"><input type="checkbox" id="sgtP_editV"' + (st.editSavedVertices ? ' checked' : '') + '>' + (ar ? 'سحب الزوايا' : 'Drag Vertices') + '</label>' +
        '</div>' +
        '<div style="font-size:10px;color:var(--sc-cyan)">' +
          'GCPs: <b>' + st.gcps.length + '</b>' + (model ? (' (' + model.mode + ', RMS ' + model.rmsPx + 'px)') : ' (Need ≥ 2)') + ' | GPS: <b>' + esc(gpsStatus) + '</b>' +
        '</div>' +
        '<div class="satc-grid2">' +
          '<button type="button" class="satc-qbtn" id="sgtP_georef">🌐 GCP Mode</button>' +
          '<button type="button" class="satc-qbtn" id="sgtP_gcpTbl">⊞ GCP Table</button>' +
        '</div>' +
        '<div class="satc-grid2">' +
          '<button type="button" class="satc-qbtn" id="sgtP_gps">🛰 Live GPS</button>' +
          '<button type="button" class="satc-qbtn amb" id="sgtP_drift">🎯 Drift Fix</button>' +
        '</div>' +
        '<div class="satc-alist">' + listHtml + '</div>' +
        '<div class="satc-grid2">' +
          '<button type="button" class="satc-qbtn on" id="sgtP_zip">🤖 AI ZIP</button>' +
          '<button type="button" class="satc-qbtn" id="sgtP_ref">🖼 Ref Sheet</button>' +
        '</div>' +
        '<div class="satc-grid2">' +
          '<button type="button" class="satc-qbtn" id="sgtP_toGis">⇄ Push ➔ ArcGIS</button>' +
          '<button type="button" class="satc-qbtn" id="sgtP_json">📦 Export JSON</button>' +
        '</div>' +
      '</div>';

    container.querySelector('#sgtP_bound').onclick = function () { st.editSavedVertices = false; if (cb.onTool) cb.onTool('gt_boundary'); };
    container.querySelector('#sgtP_closeB').onclick = function () { if (cb.onCloseBoundary) cb.onCloseBoundary(); };
    container.querySelector('#sgtP_poly').onclick = function () {
      st.surveyGeom = 'polygon';
      st.editSavedVertices = false;
      if (cb.onTool) cb.onTool('gt_survey');
    };
    container.querySelector('#sgtP_pin').onclick = function () {
      st.surveyGeom = 'point';
      st.editSavedVertices = false;
      if (cb.onTool) cb.onTool('gt_survey');
    };
    [].forEach.call(container.querySelectorAll('[data-gtf]'), function (btn) {
      btn.onclick = function () {
        var k = btn.dataset.gtf;
        st.filters[k] = st.filters[k] === false ? true : false;
        if (cb.onMutate) cb.onMutate();
      };
    });
    container.querySelector('#sgtP_cols').onchange = function () { st.grid.cols = clamp(+this.value || 6, 2, 20); if (cb.onMutate) cb.onMutate(); };
    container.querySelector('#sgtP_rows').onchange = function () { st.grid.rows = clamp(+this.value || 4, 2, 20); if (cb.onMutate) cb.onMutate(); };
    container.querySelector('#sgtP_align').onchange = function () { st.grid.aligned = !!this.checked; if (cb.onMutate) cb.onMutate(); };
    container.querySelector('#sgtP_dim').onchange = function () { st.grid.dimOutside = !!this.checked; if (cb.onMutate) cb.onMutate(); };
    container.querySelector('#sgtP_sub').onchange = function () { st.grid.subGrid = !!this.checked; if (cb.onMutate) cb.onMutate(); };
    container.querySelector('#sgtP_editV').onchange = function () { st.editSavedVertices = !!this.checked; if (cb.onMutate) cb.onMutate(); };
    container.querySelector('#sgtP_georef').onclick = function () { if (cb.onTool) cb.onTool('gt_georef'); };
    container.querySelector('#sgtP_gcpTbl').onclick = function () { if (cb.onOpenGcpTable) cb.onOpenGcpTable(); };
    container.querySelector('#sgtP_gps').onclick = function () { if (cb.onToggleGps) cb.onToggleGps(); };
    container.querySelector('#sgtP_drift').onclick = function () { if (cb.onDriftFix) cb.onDriftFix(); };
    container.querySelector('#sgtP_zip').onclick = function () { if (cb.onExportZip) cb.onExportZip(); };
    container.querySelector('#sgtP_ref').onclick = function () { if (cb.onExportRefSheet) cb.onExportRefSheet(); };
    container.querySelector('#sgtP_toGis').onclick = function () { if (cb.onPushToArcGIS) cb.onPushToArcGIS(); };
    container.querySelector('#sgtP_json').onclick = function () { if (cb.onExportJson) cb.onExportJson(); };

    [].forEach.call(container.querySelectorAll('[data-gtidx]'), function (row) {
      row.onclick = function (ev) {
        if (ev.target.closest('button')) return;
        if (cb.onFocusFeature) cb.onFocusFeature(+row.dataset.gtidx);
      };
    });
    [].forEach.call(container.querySelectorAll('[data-gtfoc]'), function (b) {
      b.onclick = function (ev) { ev.stopPropagation(); if (cb.onFocusFeature) cb.onFocusFeature(+b.dataset.gtfoc); };
    });
    [].forEach.call(container.querySelectorAll('[data-gted]'), function (b) {
      b.onclick = function (ev) { ev.stopPropagation(); if (cb.onEditFeature) cb.onEditFeature(+b.dataset.gted); };
    });
    [].forEach.call(container.querySelectorAll('[data-gtdel]'), function (b) {
      b.onclick = function (ev) { ev.stopPropagation(); if (cb.onDeleteFeature) cb.onDeleteFeature(+b.dataset.gtdel); };
    });
  }

  S.SatGeoTerra = {
    TYPE_STYLES: TYPE_STYLES,
    CARDINALS: CARDINALS,
    degToCardinal: degToCardinal,
    formatId: formatId,
    blankState: blankState,
    mergeState: mergeState,
    computeGridModel: computeGridModel,
    detectFeatureSectors: detectFeatureSectors,
    polyAreaCentroidXY: polyAreaCentroidXY,
    compressImageFile: compressImageFile,
    crc32Bytes: crc32Bytes,
    buildZipBlob: buildZipBlob,
    triggerDownloadBlob: triggerDownloadBlob,
    drawGeoTerraLayer: drawGeoTerraLayer,
    generateReferenceSheetCanvas: generateReferenceSheetCanvas,
    buildProjectPayload: buildProjectPayload,
    buildAiPromptBrief: buildAiPromptBrief,
    renderMarkedMapCanvas: renderMarkedMapCanvas,
    exportAiZipPackage: exportAiZipPackage,
    parseImportedSurveyJson: parseImportedSurveyJson,
    convertToArcGISFeatures: convertToArcGISFeatures,
    openLightbox: openLightbox,
    openFeatureModal: openFeatureModal,
    renderGeoTerraPanel: renderGeoTerraPanel
  };
})(window.SOS);
