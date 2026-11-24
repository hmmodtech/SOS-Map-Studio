window.SOS = window.SOS || {};
(function (S) {
  'use strict';

  var D = Math.PI / 180;
  var MAX_PROC_EDGE = 2048;
  var procCache = {};
  var procOrder = [];

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function polyCenter(pts) {
    var sx = 0, sy = 0;
    for (var i = 0; i < pts.length; i++) { sx += pts[i].x; sy += pts[i].y; }
    return { x: sx / Math.max(1, pts.length), y: sy / Math.max(1, pts.length) };
  }

  function polyBounds(pts) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (var i = 0; i < pts.length; i++) {
      if (pts[i].x < x0) x0 = pts[i].x;
      if (pts[i].y < y0) y0 = pts[i].y;
      if (pts[i].x > x1) x1 = pts[i].x;
      if (pts[i].y > y1) y1 = pts[i].y;
    }
    return { x0: x0, y0: y0, x1: x1, y1: y1, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  }

  function pointInPoly(px, py, pts) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
      var hit = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-9) + xi);
      if (hit) inside = !inside;
    }
    return inside;
  }

  // Build oriented 4-corner rectangle in image pixels from two corner clicks
  function makeOrientedRect(p1, p2) {
    var dx = p2.x - p1.x, dy = p2.y - p1.y;
    var len = Math.hypot(dx, dy);
    if (len < 2) return null;
    var ux = dx / len, uy = dy / len;
    var nx = -uy, ny = ux;
    // Default perpendicular width = 0.6 * length (matches 30x18m 5-a-side ratio)
    var halfW = Math.max(8, len * 0.30);
    return [
      { x: +(p1.x + nx * halfW).toFixed(2), y: +(p1.y + ny * halfW).toFixed(2) },
      { x: +(p2.x + nx * halfW).toFixed(2), y: +(p2.y + ny * halfW).toFixed(2) },
      { x: +(p2.x - nx * halfW).toFixed(2), y: +(p2.y - ny * halfW).toFixed(2) },
      { x: +(p1.x - nx * halfW).toFixed(2), y: +(p1.y - ny * halfW).toFixed(2) }
    ];
  }

  // Render Un-grassed Futsal Pitch + Chain-Link Fence + Red Top Netting onto a transparent PNG canvas
  function renderFutsalAssetCanvas(opts) {
    var wPx = Math.max(32, Math.round(opts.wPx || 240));
    var hPx = Math.max(24, Math.round(opts.hPx || 144));
    var sc = Math.min(1, MAX_PROC_EDGE / Math.max(wPx, hPx));
    var cw = Math.max(16, Math.round(wPx * sc));
    var ch = Math.max(16, Math.round(hPx * sc));

    var c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    var g = c.getContext('2d');

    var soilCol = opts.soilColor || '#c9ae82';
    var lineCol = opts.lineColor || 'rgba(248,250,252,0.52)';
    var fenceCol = opts.fenceColor || 'rgba(71,85,105,0.72)';
    var topNetCol = opts.topNetColor || 'rgba(220,38,38,0.76)';
    var fenceBand = Math.max(5, Math.round(Math.min(cw, ch) * 0.085));
    var topBand = Math.max(2.5, Math.round(fenceBand * 0.38));

    // 1. Un-grassed compacted sandy/earth pitch surface with subtle natural speckle
    g.fillStyle = soilCol;
    g.fillRect(0, 0, cw, ch);

    var seed = 90210;
    var specks = Math.min(1800, Math.floor((cw * ch) / 90));
    for (var i = 0; i < specks; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      var rx = (seed % 10000) / 10000 * cw;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      var ry = (seed % 10000) / 10000 * ch;
      g.fillStyle = (i % 2 === 0) ? 'rgba(60,45,25,0.08)' : 'rgba(255,248,230,0.08)';
      g.fillRect(rx, ry, 2, 2);
    }

    // 2. Futsal court markings (outer boundary, halfway line, center circle, penalty boxes)
    var padX = fenceBand + Math.max(4, cw * 0.03);
    var padY = fenceBand + Math.max(4, ch * 0.04);
    var fw = Math.max(12, cw - padX * 2);
    var fh = Math.max(10, ch - padY * 2);
    var lw = Math.max(1.2, Math.min(cw, ch) * 0.011);

    g.strokeStyle = lineCol;
    g.lineWidth = lw;
    g.strokeRect(padX, padY, fw, fh);

    // Center line & circle
    var midX = padX + fw / 2, midY = padY + fh / 2;
    g.beginPath(); g.moveTo(midX, padY); g.lineTo(midX, padY + fh); g.stroke();
    var cRad = Math.max(4, Math.min(fw, fh) * 0.16);
    g.beginPath(); g.arc(midX, midY, cRad, 0, Math.PI * 2); g.stroke();

    // Left & right penalty areas
    var penW = fw * 0.15, penH = fh * 0.52;
    g.strokeRect(padX, midY - penH / 2, penW, penH);
    g.strokeRect(padX + fw - penW, midY - penH / 2, penW, penH);

    // 3. Perimeter chain-link mesh + upper red safety netting strip
    function drawMeshEdge(x0, y0, x1, y1, nx, ny) {
      var segLen = Math.hypot(x1 - x0, y1 - y0);
      if (segLen < 2) return;
      var steps = Math.max(4, Math.round(segLen / Math.max(4, fenceBand * 0.45)));

      // Outer & inner wire rails
      g.strokeStyle = fenceCol;
      g.lineWidth = Math.max(1, lw * 0.9);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.beginPath(); g.moveTo(x0 + nx * fenceBand, y0 + ny * fenceBand); g.lineTo(x1 + nx * fenceBand, y1 + ny * fenceBand); g.stroke();

      // Diagonal chain-link weave inside band
      g.lineWidth = Math.max(0.7, lw * 0.65);
      for (var k = 0; k < steps; k++) {
        var t0 = k / steps, t1 = (k + 1) / steps;
        var ax = x0 + (x1 - x0) * t0, ay = y0 + (y1 - y0) * t0;
        var bx = x0 + (x1 - x0) * t1, by = y0 + (y1 - y0) * t1;
        g.beginPath();
        g.moveTo(ax, ay); g.lineTo(bx + nx * fenceBand, by + ny * fenceBand);
        g.moveTo(bx, by); g.lineTo(ax + nx * fenceBand, ay + ny * fenceBand);
        g.stroke();
      }

      // Red top netting along outer perimeter edge
      g.fillStyle = topNetCol;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.lineTo(x1 + nx * topBand, y1 + ny * topBand);
      g.lineTo(x0 + nx * topBand, y0 + ny * topBand);
      g.closePath();
      g.fill();

      g.strokeStyle = topNetCol;
      g.lineWidth = Math.max(0.8, lw * 0.7);
      for (var m = 0; m < steps * 2; m++) {
        var u0 = m / (steps * 2), u1 = (m + 1) / (steps * 2);
        var px0 = x0 + (x1 - x0) * u0, py0 = y0 + (y1 - y0) * u0;
        var px1 = x0 + (x1 - x0) * u1, py1 = y0 + (y1 - y0) * u1;
        g.beginPath();
        g.moveTo(px0, py0); g.lineTo(px1 + nx * topBand, py1 + ny * topBand);
        g.moveTo(px1, py1); g.lineTo(px0 + nx * topBand, py0 + ny * topBand);
        g.stroke();
      }
    }

    // Top, Right, Bottom, Left inward normals
    drawMeshEdge(0, 0, cw, 0, 0, 1);
    drawMeshEdge(cw, 0, cw, ch, -1, 0);
    drawMeshEdge(cw, ch, 0, ch, 0, -1);
    drawMeshEdge(0, ch, 0, 0, 1, 0);

    return c.toDataURL('image/png');
  }

  // Render top-down white/ivory field tent onto a transparent PNG canvas
  function renderTentAssetCanvas(opts) {
    var wPx = Math.max(24, Math.round(opts.wPx || 96));
    var hPx = Math.max(24, Math.round(opts.hPx || 96));
    var sc = Math.min(1, MAX_PROC_EDGE / Math.max(wPx, hPx));
    var cw = Math.max(12, Math.round(wPx * sc));
    var ch = Math.max(12, Math.round(hPx * sc));

    var c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    var g = c.getContext('2d');

    var col = opts.tentColor || '#f4f2ec';
    var pad = Math.max(2, Math.round(Math.min(cw, ch) * 0.08));
    var rw = cw - pad * 2, rh = ch - pad * 2;

    g.fillStyle = col;
    g.strokeStyle = 'rgba(51,65,85,0.55)';
    g.lineWidth = Math.max(1, Math.min(cw, ch) * 0.02);
    g.fillRect(pad, pad, rw, rh);
    g.strokeRect(pad, pad, rw, rh);

    // Ridge/diagonal tent canvas seams
    g.strokeStyle = 'rgba(100,116,139,0.45)';
    g.lineWidth = Math.max(0.8, Math.min(cw, ch) * 0.014);
    if (rw >= rh) {
      g.beginPath();
      g.moveTo(pad, pad + rh / 2); g.lineTo(pad + rw, pad + rh / 2);
      g.moveTo(pad, pad); g.lineTo(pad + rw / 2, pad + rh / 2); g.lineTo(pad, pad + rh);
      g.moveTo(pad + rw, pad); g.lineTo(pad + rw / 2, pad + rh / 2); g.lineTo(pad + rw, pad + rh);
      g.stroke();
    } else {
      g.beginPath();
      g.moveTo(pad + rw / 2, pad); g.lineTo(pad + rw / 2, pad + rh);
      g.moveTo(pad, pad); g.lineTo(pad + rw / 2, pad + rh / 2); g.lineTo(pad + rw, pad);
      g.moveTo(pad, pad + rh); g.lineTo(pad + rw / 2, pad + rh / 2); g.lineTo(pad + rw, pad + rh);
      g.stroke();
    }
    return c.toDataURL('image/png');
  }

  // Render arbitrary closed polygon into a tight transparent PNG canvas (1:1 natural coords)
  function renderPolygonAssetFromPoints(baseImg, polyPts, fillCol, strokeCol) {
    if (!polyPts || polyPts.length < 3) return null;
    var b = polyBounds(polyPts);
    var pad = 4;
    var x0 = Math.floor(b.x0 - pad), y0 = Math.floor(b.y0 - pad);
    var x1 = Math.ceil(b.x1 + pad), y1 = Math.ceil(b.y1 + pad);
    var bw = Math.max(8, x1 - x0), bh = Math.max(8, y1 - y0);
    if (Math.max(bw, bh) > MAX_PROC_EDGE * 2) return null;

    var c = document.createElement('canvas');
    c.width = bw; c.height = bh;
    var g = c.getContext('2d');

    g.beginPath();
    for (var i = 0; i < polyPts.length; i++) {
      var lx = polyPts[i].x - x0, ly = polyPts[i].y - y0;
      if (i === 0) g.moveTo(lx, ly); else g.lineTo(lx, ly);
    }
    g.closePath();

    if (baseImg && baseImg.naturalWidth) {
      g.save();
      g.clip();
      var sx0 = clamp(x0, 0, baseImg.naturalWidth);
      var sy0 = clamp(y0, 0, baseImg.naturalHeight);
      var sx1 = clamp(x1, 0, baseImg.naturalWidth);
      var sy1 = clamp(y1, 0, baseImg.naturalHeight);
      if (sx1 > sx0 && sy1 > sy0) {
        g.drawImage(baseImg, sx0, sy0, sx1 - sx0, sy1 - sy0, sx0 - x0, sy0 - y0, sx1 - sx0, sy1 - sy0);
      }
      if (fillCol) {
        g.fillStyle = fillCol;
        g.fillRect(0, 0, bw, bh);
      }
      g.restore();
    } else {
      g.fillStyle = fillCol || 'rgba(201,174,130,0.65)';
      g.fill();
    }

    g.strokeStyle = strokeCol || 'rgba(15,23,42,0.75)';
    g.lineWidth = 2;
    g.stroke();

    return {
      dataUrl: c.toDataURL('image/png'),
      wPx: bw,
      hPx: bh,
      cx: +(x0 + bw / 2).toFixed(2),
      cy: +(y0 + bh / 2).toFixed(2)
    };
  }

  function getCachedProceduralUrl(key, builderFn) {
    if (procCache[key]) return procCache[key];
    var url = builderFn();
    procCache[key] = url;
    procOrder.push(key);
    while (procOrder.length > 24) {
      delete procCache[procOrder.shift()];
    }
    return url;
  }

  function clearProceduralCache() {
    procCache = {};
    procOrder = [];
  }

  S.SatProcedural = {
    makeOrientedRect: makeOrientedRect,
    polyCenter: polyCenter,
    polyBounds: polyBounds,
    pointInPoly: pointInPoly,
    renderFutsalAssetCanvas: renderFutsalAssetCanvas,
    renderTentAssetCanvas: renderTentAssetCanvas,
    renderPolygonAssetFromPoints: renderPolygonAssetFromPoints,
    getCachedProceduralUrl: getCachedProceduralUrl,
    clearProceduralCache: clearProceduralCache
  };
})(window.SOS);
