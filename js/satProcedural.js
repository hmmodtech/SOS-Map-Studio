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

  function makeOrientedRect(p1, p2) {
    var dx = p2.x - p1.x, dy = p2.y - p1.y;
    var len = Math.hypot(dx, dy);
    if (len < 2) return null;
    var ux = dx / len, uy = dy / len;
    var nx = -uy, ny = ux;
    var halfW = Math.max(8, len * 0.30);
    return [
      { x: +(p1.x + nx * halfW).toFixed(2), y: +(p1.y + ny * halfW).toFixed(2) },
      { x: +(p2.x + nx * halfW).toFixed(2), y: +(p2.y + ny * halfW).toFixed(2) },
      { x: +(p2.x - nx * halfW).toFixed(2), y: +(p2.y - ny * halfW).toFixed(2) },
      { x: +(p1.x - nx * halfW).toFixed(2), y: +(p1.y - ny * halfW).toFixed(2) }
    ];
  }

  function seededRandom(seedInit) {
    var s = seedInit >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // 1. Un-grassed Futsal Pitch + Chain-Link Fence + Red Top Netting
 // 1. Un-grassed Futsal Pitch + Lower Chain-Link + Upper Red Netting + Posts
  function renderFutsalAssetCanvas(opts) {
    var wPx = Math.max(32, Math.round(opts.wPx || 240));
    var hPx = Math.max(24, Math.round(opts.hPx || 144));
    var sc = Math.min(1, MAX_PROC_EDGE / Math.max(wPx, hPx));
    var cw = Math.max(16, Math.round(wPx * sc));
    var ch = Math.max(16, Math.round(hPx * sc));

    var c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    var g = c.getContext('2d');
    var rand = seededRandom(90210);

    var soilCol = opts.soilColor || '#c5a267';
    var lineCol = opts.lineColor || 'rgba(248,250,252,0.48)';
    var postCol = opts.postColor || '#64748b';
    var lowerMeshCol = opts.fenceColor || 'rgba(100,116,139,0.68)';
    var upperRedNetCol = opts.topNetColor || 'rgba(185,48,38,0.68)';

    var upperNetBand = Math.max(3, Math.round(Math.min(cw, ch) * 0.045));
    var lowerFenceBand = Math.max(5, Math.round(Math.min(cw, ch) * 0.065));
    var totalWallBand = upperNetBand + lowerFenceBand;

    // 1. Compacted sandy/earth court surface (un-grassed)
    g.fillStyle = soilCol;
    g.fillRect(0, 0, cw, ch);

    var specks = Math.min(2000, Math.floor((cw * ch) / 85));
    for (var i = 0; i < specks; i++) {
      var rx = rand() * cw, ry = rand() * ch;
      g.fillStyle = (i % 2 === 0) ? 'rgba(65,45,20,0.08)' : 'rgba(255,246,220,0.09)';
      g.fillRect(rx, ry, 2, 2);
    }

    // 2. Subtle court pitch lines inside perimeter
    var padX = totalWallBand + Math.max(4, cw * 0.03);
    var padY = totalWallBand + Math.max(4, ch * 0.04);
    var fw = Math.max(12, cw - padX * 2);
    var fh = Math.max(10, ch - padY * 2);
    var lw = Math.max(1.2, Math.min(cw, ch) * 0.01);

    g.strokeStyle = lineCol;
    g.lineWidth = lw;
    g.strokeRect(padX, padY, fw, fh);

    var midX = padX + fw / 2, midY = padY + fh / 2;
    g.beginPath(); g.moveTo(midX, padY); g.lineTo(midX, padY + fh); g.stroke();
    var cRad = Math.max(4, Math.min(fw, fh) * 0.16);
    g.beginPath(); g.arc(midX, midY, cRad, 0, Math.PI * 2); g.stroke();

    var penW = fw * 0.15, penH = fh * 0.52;
    g.strokeRect(padX, midY - penH / 2, penW, penH);
    g.strokeRect(padX + fw - penW, midY - penH / 2, penW, penH);

    // 3. Perimeter upper red safety net + lower chain-link fence + vertical steel posts
    function drawPerimeterSide(x0, y0, x1, y1, nx, ny) {
      var segLen = Math.hypot(x1 - x0, y1 - y0);
      if (segLen < 2) return;

      var midEdgeX = x0 + nx * upperNetBand;
      var midEdgeY = y0 + ny * upperNetBand;
      var innerEdgeX = x0 + nx * totalWallBand;
      var innerEdgeY = y0 + ny * totalWallBand;
      var dx = x1 - x0, dy = y1 - y0;

      // Upper red netting band (outer edge)
      g.fillStyle = upperRedNetCol;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.lineTo(midEdgeX + dx, midEdgeY + dy);
      g.lineTo(midEdgeX, midEdgeY);
      g.closePath();
      g.fill();

      // Lower chain-link mesh band (inner to upper net)
      g.fillStyle = 'rgba(148,163,184,0.14)';
      g.beginPath();
      g.moveTo(midEdgeX, midEdgeY);
      g.lineTo(midEdgeX + dx, midEdgeY + dy);
      g.lineTo(innerEdgeX + dx, innerEdgeY + dy);
      g.lineTo(innerEdgeX, innerEdgeY);
      g.closePath();
      g.fill();

      // Fine red mesh lines on upper band
      var redSteps = Math.max(6, Math.round(segLen / Math.max(3, upperNetBand * 0.65)));
      g.strokeStyle = upperRedNetCol;
      g.lineWidth = Math.max(0.7, lw * 0.6);
      for (var m = 0; m < redSteps; m++) {
        var u0 = m / redSteps, u1 = (m + 1) / redSteps;
        var ux0 = x0 + dx * u0, uy0 = y0 + dy * u0;
        var ux1 = x0 + dx * u1, uy1 = y0 + dy * u1;
        g.beginPath();
        g.moveTo(ux0, uy0); g.lineTo(ux1 + nx * upperNetBand, uy1 + ny * upperNetBand);
        g.moveTo(ux1, uy1); g.lineTo(ux0 + nx * upperNetBand, uy0 + ny * upperNetBand);
        g.stroke();
      }

      // Chain-link diamond weave on lower band
      var meshSteps = Math.max(5, Math.round(segLen / Math.max(4, lowerFenceBand * 0.5)));
      g.strokeStyle = lowerMeshCol;
      g.lineWidth = Math.max(0.7, lw * 0.65);
      for (var k = 0; k < meshSteps; k++) {
        var t0 = k / meshSteps, t1 = (k + 1) / meshSteps;
        var ax = midEdgeX + dx * t0, ay = midEdgeY + dy * t0;
        var bx = midEdgeX + dx * t1, by = midEdgeY + dy * t1;
        g.beginPath();
        g.moveTo(ax, ay); g.lineTo(bx + nx * lowerFenceBand, by + ny * lowerFenceBand);
        g.moveTo(bx, by); g.lineTo(ax + nx * lowerFenceBand, ay + ny * lowerFenceBand);
        g.stroke();
      }

      // Top & bottom rail lines
      g.strokeStyle = postCol;
      g.lineWidth = Math.max(1, lw * 0.85);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.beginPath(); g.moveTo(innerEdgeX, innerEdgeY); g.lineTo(innerEdgeX + dx, innerEdgeY + dy); g.stroke();

      // Vertical support posts along side
      var postCount = Math.max(2, Math.round(segLen / Math.max(18, Math.min(cw, ch) * 0.24)));
      var postR = Math.max(1.4, lw * 1.15);
      for (var p = 0; p <= postCount; p++) {
        var pt = p / postCount;
        var px = x0 + dx * pt, py = y0 + dy * pt;
        g.fillStyle = postCol;
        g.beginPath();
        g.arc(px, py, postR, 0, Math.PI * 2);
        g.fill();
      }
    }

    drawPerimeterSide(0, 0, cw, 0, 0, 1);
    drawPerimeterSide(cw, 0, cw, ch, -1, 0);
    drawPerimeterSide(cw, ch, 0, ch, 0, -1);
    drawPerimeterSide(0, ch, 0, 0, 1, 0);

    return c.toDataURL('image/png');
  }

  // 2. Top-Down Building / Prefab Structure with Roof Ridge, Parapet & AC/Solar Detail
  function renderBuildingAssetCanvas(opts) {
    var wPx = Math.max(24, Math.round(opts.wPx || 140));
    var hPx = Math.max(24, Math.round(opts.hPx || 96));
    var sc = Math.min(1, MAX_PROC_EDGE / Math.max(wPx, hPx));
    var cw = Math.max(14, Math.round(wPx * sc));
    var ch = Math.max(14, Math.round(hPx * sc));

    var c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    var g = c.getContext('2d');

    var roofCol = opts.roofColor || '#e2e8f0';
    var trimCol = opts.trimColor || '#64748b';
    var ridgeCol = opts.ridgeColor || 'rgba(100,116,139,0.55)';
    var pad = Math.max(2, Math.round(Math.min(cw, ch) * 0.04));
    var bw = cw - pad * 2, bh = ch - pad * 2;

    g.fillStyle = roofCol;
    g.fillRect(pad, pad, bw, bh);

    // Subtle roof bevel / parapet border
    g.strokeStyle = trimCol;
    g.lineWidth = Math.max(1.2, Math.min(cw, ch) * 0.025);
    g.strokeRect(pad, pad, bw, bh);

    // Roof central ridge / rib lines for realistic aerial look
    g.strokeStyle = ridgeCol;
    g.lineWidth = Math.max(0.8, Math.min(cw, ch) * 0.012);
    if (bw >= bh) {
      g.beginPath();
      g.moveTo(pad, pad + bh / 2);
      g.lineTo(pad + bw, pad + bh / 2);
      g.stroke();
      var ribs = Math.min(10, Math.max(3, Math.floor(bw / Math.max(10, bh * 0.35))));
      for (var i = 1; i < ribs; i++) {
        var rx = pad + (bw * i) / ribs;
        g.beginPath(); g.moveTo(rx, pad + 2); g.lineTo(rx, pad + bh - 2); g.stroke();
      }
    } else {
      g.beginPath();
      g.moveTo(pad + bw / 2, pad);
      g.lineTo(pad + bw / 2, pad + bh);
      g.stroke();
      var ribsV = Math.min(10, Math.max(3, Math.floor(bh / Math.max(10, bw * 0.35))));
      for (var j = 1; j < ribsV; j++) {
        var ry = pad + (bh * j) / ribsV;
        g.beginPath(); g.moveTo(pad + 2, ry); g.lineTo(pad + bw - 2, ry); g.stroke();
      }
    }

    // Small rooftop mechanical unit
    var uw = Math.max(4, Math.min(bw, bh) * 0.16);
    g.fillStyle = 'rgba(148,163,184,0.65)';
    g.strokeStyle = 'rgba(51,65,85,0.6)';
    g.lineWidth = 1;
    g.fillRect(pad + bw * 0.14, pad + bh * 0.18, uw, uw);
    g.strokeRect(pad + bw * 0.14, pad + bh * 0.18, uw, uw);

    return c.toDataURL('image/png');
  }

  // 3. Top-Down Field Tent with Seams, Guy-Lines & Ridge
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
    g.strokeStyle = 'rgba(71,85,105,0.55)';
    g.lineWidth = Math.max(1, Math.min(cw, ch) * 0.02);
    g.fillRect(pad, pad, rw, rh);
    g.strokeRect(pad, pad, rw, rh);

    g.strokeStyle = 'rgba(120,113,108,0.45)';
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

  // 4. Top-Down Natural Tree Crown (Organic Multi-Lobe Foliage + Leaf Texture)
  function renderTreeAssetCanvas(opts) {
    var dPx = Math.max(24, Math.round(opts.dPx || 96));
    var sc = Math.min(1, MAX_PROC_EDGE / dPx);
    var csz = Math.max(16, Math.round(dPx * sc));

    var c = document.createElement('canvas');
    c.width = csz; c.height = csz;
    var g = c.getContext('2d');
    var rand = seededRandom(opts.seed || 4242);

    var cx = csz / 2, cy = csz / 2;
    var baseR = csz * 0.34;
    var baseCol = opts.foliageColor || '#3f6236';
    var hiCol = opts.highlightColor || '#5b8449';
    var darkCol = opts.shadeColor || '#284222';

    // Outer organic foliage lobes
    var lobes = 11;
    g.fillStyle = darkCol;
    g.beginPath();
    for (var i = 0; i <= lobes; i++) {
      var ang = (i / lobes) * Math.PI * 2;
      var rad = baseR * (0.86 + rand() * 0.28);
      var px = cx + Math.cos(ang) * rad;
      var py = cy + Math.sin(ang) * rad;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();

    // Main mid-tone canopy
    g.fillStyle = baseCol;
    g.beginPath();
    for (var j = 0; j <= lobes; j++) {
      var a2 = (j / lobes) * Math.PI * 2 + 0.15;
      var r2 = baseR * (0.78 + rand() * 0.24);
      var x2 = cx + Math.cos(a2) * r2;
      var y2 = cy + Math.sin(a2) * r2;
      if (j === 0) g.moveTo(x2, y2); else g.lineTo(x2, y2);
    }
    g.closePath();
    g.fill();

    // Sunlit crown clusters & micro leaf tufts
    var tufts = Math.min(48, Math.max(12, Math.floor(csz / 3)));
    for (var k = 0; k < tufts; k++) {
      var dist = rand() * baseR * 0.78;
      var th = rand() * Math.PI * 2;
      var tx = cx + Math.cos(th) * dist;
      var ty = cy + Math.sin(th) * dist;
      var tr = Math.max(1.8, csz * (0.04 + rand() * 0.05));
      g.fillStyle = (k % 3 === 0) ? hiCol : baseCol;
      g.beginPath();
      g.arc(tx, ty, tr, 0, Math.PI * 2);
      g.fill();
    }

    return c.toDataURL('image/png');
  }

  // 5. Closed Custom Polygon Asset (1:1 Natural Coordinates)
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

    g.strokeStyle = strokeCol || 'rgba(0,229,255,0.85)';
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
    while (procOrder.length > 36) {
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
    renderFutsalAssetCanvas: renderFutsalAssetCanvas,
    renderBuildingAssetCanvas: renderBuildingAssetCanvas,
    renderTentAssetCanvas: renderTentAssetCanvas,
    renderTreeAssetCanvas: renderTreeAssetCanvas,
    renderPolygonAssetFromPoints: renderPolygonAssetFromPoints,
    getCachedProceduralUrl: getCachedProceduralUrl,
    clearProceduralCache: clearProceduralCache
  };
})(window.SOS);
