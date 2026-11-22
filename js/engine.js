window.SOS = window.SOS || {};
(function (S) {
  var St = S.State, D = Math.PI / 180, cv, ctx, W = 1, H = 1, dpr = 1, dirty = 1, hq = true, theme = 'cyber', tool = 'select', addType = 'building',
    sel = null, meas = [], hits = [], labels = [], mouse = { x: 0, y: 0 }, drag = null, ptrs = {}, icons = {};
  var cam = { cx: 0, cy: 0, zoom: 1, base: 3, yaw: 0, pitch: 48, lastPitch: 48, persp: 0.45, zBoost: 1.25 };
  var layers = { fence: 1, build: 1, tent: 1, solar: 1, trees: 1, routes: 1, labels: 1, dims: 1, grid: 1 };
  var cad = { ortho: false, osnap: true, gridSnap: 0, drawPts: [], cmdBuf: '', snapHit: null, lastVClick: { t: 0, i: -1 }, lastDClick: { t: 0, x: 0, y: 0 } };

  var LAY = { fence: 'fence', building: 'build', medical: 'build', security: 'build', gate: 'build', assembly: 'build', vehicle: 'build', extinguisher: 'build',
    camera: 'build', custom: 'build', pool: 'build', cottage: 'tent', tent: 'tent', solar: 'solar', hazard: 'solar', diesel_tank: 'solar',
    olive_zone: 'trees', yard: 'trees', road: 'trees', field: 'trees', playground: 'trees', parking: 'trees', tree: 'trees' };
  var TIER = { yard: 0, road: 0, parking: 0, fence: 1, field: 1, playground: 1 };
  var DEF = {
    building: { w: 20, d: 12, h: 9, fl: 3, roof: 'flat', col: '#3b4c5e' },
    cottage: { w: 6, d: 5, h: 3, fl: 1, roof: 'red_tile', col: '#c8935a' },
    tent: { w: 8, d: 5, h: 3.5, fl: 1, roof: 'pyramid', col: '#9aa8b8' },
    pool: { w: 12, d: 6, h: 3.2, fl: 1, roof: 'quonset', col: '#2b88d8' },
    playground: { w: 10, d: 8, h: 2.2, fl: 1, roof: 'flat', col: '#d4a359' },
    parking: { w: 12, d: 7, h: 0.1, fl: 1, roof: 'flat', col: '#8d96a0' },
    diesel_tank: { w: 6, d: 4, h: 2.4, fl: 1, roof: 'flat', col: '#c8cfd6' },
    solar: { w: 12, d: 6, h: 1.5, fl: 1, roof: 'flat', col: '#1e50c8' },
    medical: { w: 12, d: 8, h: 3.5, fl: 1, roof: 'red_tile', col: '#d4423e' },
    security: { w: 4, d: 4, h: 3, fl: 1, roof: 'red_tile', col: '#c9413b' },
    field: { w: 30, d: 18, h: 3, fl: 1, roof: 'flat', col: '#3fa335' },
    road: { w: 20, d: 4, h: 0.1, fl: 1, roof: 'flat', col: '#9aa0a6' },
    yard: { w: 16, d: 12, h: 0.1, fl: 1, roof: 'flat', col: '#d8be8a' },
    fence: { w: 40, d: 30, h: 2.5, fl: 1, roof: 'flat', col: '#39ff14' },
    olive_zone: { w: 20, d: 16, h: 3.5, fl: 1, roof: 'flat', col: '#4a9a3a' },
    hazard: { w: 6, d: 5, h: 2.4, fl: 1, roof: 'flat', col: '#ff3c3c' }
  };
  var PCOL = { tree: '#3f8f2f', vehicle: '#e8c84a', extinguisher: '#ff3c3c', camera: '#00d9ff', assembly: '#00d9ff', custom: '#8aa0b5' };
  var MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';

  function cl(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function sc() { return cam.base * cam.zoom; }
  function isPr() { return theme === 'print'; }
  function zEff(z) { return (z || 0) * (cam.pitch < 2 ? 0 : cam.zBoost); }

  // True 3D Perspective Projection + Exact Closed-Form Ground Inverse (z=0)
  function P(x, y, z) {
    var a = cam.yaw * D, t = cam.pitch * D, dx = x - cam.cx, dy = y - cam.cy, s = sc(),
      rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a),
      zb = zEff(z), pf = cam.pitch < 2 ? 0 : cam.persp,
      den = Math.max(0.28, 1 + pf * ((ry * Math.sin(t) - zb * Math.cos(t)) * s) / 950),
      f = 1 / den;
    return [W / 2 + rx * s * f, H / 2 - (ry * s * Math.cos(t) + zb * s * Math.sin(t)) * f, ry];
  }
  function inv(sx, sy) {
    var a = cam.yaw * D, t = cam.pitch * D, s = sc(), pf = cam.pitch < 2 ? 0 : cam.persp,
      sxR = sx - W / 2, syR = -(sy - H / 2), alpha = pf * Math.sin(t) * s / 950,
      den = s * Math.cos(t) - syR * alpha;
    if (Math.abs(den) < 1e-4) den = den >= 0 ? 1e-4 : -1e-4;
    var ry = syR / den, fac = Math.max(0.28, 1 + alpha * ry), rx = sxR * fac / s,
      c = Math.cos(a), n = Math.sin(a);
    return { x: cam.cx + rx * c + ry * n, y: cam.cy - rx * n + ry * c };
  }
  function g0(p) { return P(p.x, p.y, 0); }
  function S2(p, z) { var q = P(p.x, p.y, z); return { x: q[0], y: q[1] }; }
  function path(a, close) { ctx.beginPath(); a.forEach(function (p, i) { i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); if (close) ctx.closePath(); }
  function fillPoly(a, fill, stroke) { path(a, 1); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); } }
  function line(u, v) { ctx.beginPath(); ctx.moveTo(u[0], u[1]); ctx.lineTo(v[0], v[1]); ctx.stroke(); }
  function shade(hex, k) {
    if (!hex || hex[0] !== '#' || hex.length !== 7) return hex || '#888888';
    var n = parseInt(hex.slice(1), 16);
    return 'rgb(' + cl((n >> 16 & 255) * k | 0, 0, 255) + ',' + cl((n >> 8 & 255) * k | 0, 0, 255) + ',' + cl((n & 255) * k | 0, 0, 255) + ')';
  }
  function cen(a) { var x = 0, y = 0; a.forEach(function (p) { x += p.x; y += p.y; }); return { x: x / (a.length || 1), y: y / (a.length || 1) }; }
  function bb(a) { var b = { x0: 1e18, y0: 1e18, x1: -1e18, y1: -1e18 }; a.forEach(function (p) { b.x0 = Math.min(b.x0, p.x); b.x1 = Math.max(b.x1, p.x); b.y0 = Math.min(b.y0, p.y); b.y1 = Math.max(b.y1, p.y); }); return b; }
  function signedArea(a) { var s = 0; for (var i = 0; i < a.length; i++) { var q = a[(i + 1) % a.length]; s += a[i].x * q.y - q.x * a[i].y; } return s / 2; }
  function area(a) { return Math.abs(signedArea(a)); }
  function perim(a) { var s = 0; for (var i = 0; i < a.length; i++) { var q = a[(i + 1) % a.length]; s += Math.hypot(q.x - a[i].x, q.y - a[i].y); } return s; }
  function inP(x, y, a) {
    var r = false;
    for (var i = 0, j = a.length - 1; i < a.length; j = i++)
      if ((a[i].y > y) !== (a[j].y > y) && x < (a[j].x - a[i].x) * (y - a[i].y) / (a[j].y - a[i].y) + a[i].x) r = !r;
    return r;
  }
  function dSeg(px, py, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy || 1, t = cl(((px - a.x) * dx + (py - a.y) * dy) / l, 0, 1);
    return Math.hypot(px - a.x - t * dx, py - a.y - t * dy);
  }
  function hash(s) { var h = 7; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function pts(f) {
    var r = (f.rotationDeg || 0) * D, c = Math.cos(r), n = Math.sin(r), m = f.center;
    return f.coordsMetric.map(function (p) { var dx = p.x - m.x, dy = p.y - m.y; return { x: m.x + dx * c - dy * n, y: m.y + dx * n + dy * c }; });
  }
  function bake(f) {
    if (!f || f.geometryType !== 'polygon' || !f.coordsMetric.length) return;
    if (f.rotationDeg) { f.coordsMetric = pts(f); f.rotationDeg = 0; }
    f.center = cen(f.coordsMetric);
  }
  function recalcMeta() {
    var fence = St.project.features.filter(function (f) { return f.category === 'fence' && f.geometryType === 'polygon' && f.coordsMetric.length >= 3; })[0];
    if (fence) { var a = pts(fence); St.project.meta.areaSqm = area(a); St.project.meta.perimeterM = perim(a); }
  }
  function getSel() { return St.project.features.filter(function (f) { return f.id === sel; })[0] || null; }
  function icon(f) {
    var k = f.customIconBase64; if (!k) return null;
    var i = icons[k];
    if (!i) { i = icons[k] = new Image(); i.onload = function () { dirty = 1; }; i.src = k; }
    return i.complete && i.naturalWidth ? i : null;
  }

  // AutoCAD Geometry Algorithms (ORTHO, OSNAP, Oriented Rect, Simplify, Offset)
  function orthoLock(anchor, w) {
    var a = cam.yaw * D, c = Math.cos(a), n = Math.sin(a), dx = w.x - anchor.x, dy = w.y - anchor.y;
    var rx = dx * c - dy * n, ry = dx * n + dy * c;
    if (Math.abs(rx) >= Math.abs(ry)) ry = 0; else rx = 0;
    return { x: anchor.x + rx * c + ry * n, y: anchor.y - rx * n + ry * c };
  }
  function snapPoint(w, anchor, skipFeat, skipIdx) {
    cad.snapHit = null;
    var out = { x: w.x, y: w.y };
    if (cad.ortho && anchor) out = orthoLock(anchor, out);
    if (cad.osnap) {
      var sp = P(out.x, out.y, 0), bestD = 12, hit = null;
      St.project.features.forEach(function (f) {
        if (!vis(f)) return;
        var a = f.geometryType === 'polygon' ? pts(f) : [f.coordsMetric[0] || f.center];
        for (var i = 0; i < a.length; i++) {
          if (f === skipFeat && i === skipIdx) continue;
          var q = P(a[i].x, a[i].y, 0), d = Math.hypot(q[0] - sp[0], q[1] - sp[1]);
          if (d < bestD) { bestD = d; hit = { x: a[i].x, y: a[i].y, k: 'END' }; }
        }
        if (f.geometryType === 'polygon' && a.length >= 2) {
          for (var j = 0; j < a.length; j++) {
            var p1 = a[j], p2 = a[(j + 1) % a.length];
            if (f === skipFeat && (j === skipIdx || (j + 1) % a.length === skipIdx)) continue;
            var mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2, qm = P(mx, my, 0), dm = Math.hypot(qm[0] - sp[0], qm[1] - sp[1]);
            if (dm < bestD - 1) { bestD = dm; hit = { x: mx, y: my, k: 'MID' }; }
          }
        }
      });
      if (cad.drawPts.length >= 3) {
        var fp = cad.drawPts[0], fq = P(fp.x, fp.y, 0), df = Math.hypot(fq[0] - sp[0], fq[1] - sp[1]);
        if (df < 14) hit = { x: fp.x, y: fp.y, k: 'CLOSE' };
      }
      if (hit) { cad.snapHit = hit; return { x: hit.x, y: hit.y }; }
    }
    if (cad.gridSnap > 0) {
      var g = cad.gridSnap;
      out.x = Math.round(out.x / g) * g; out.y = Math.round(out.y / g) * g;
    }
    return out;
  }
  function makeOrientedRect(p1, p2) {
    var a = cam.yaw * D, c = Math.cos(a), n = Math.sin(a), dx = p2.x - p1.x, dy = p2.y - p1.y;
    var rx = dx * c - dy * n, ry = dx * n + dy * c;
    function back(lx, ly) { return { x: p1.x + lx * c + ly * n, y: p1.y - lx * n + ly * c }; }
    return { pts: [back(0, 0), back(rx, 0), back(rx, ry), back(0, ry)], w: Math.abs(rx), d: Math.abs(ry) };
  }
  function rdpChain(arr, tol) {
    if (arr.length <= 2) return arr.slice();
    var dmax = 0, idx = 0, a = arr[0], b = arr[arr.length - 1];
    for (var i = 1; i < arr.length - 1; i++) {
      var d = dSeg(arr[i].x, arr[i].y, a, b);
      if (d > dmax) { dmax = d; idx = i; }
    }
    if (dmax > tol) {
      var l = rdpChain(arr.slice(0, idx + 1), tol), r = rdpChain(arr.slice(idx), tol);
      return l.slice(0, -1).concat(r);
    }
    return [a, b];
  }
  function simplifyClosed(arr, tol) {
    var n = arr.length;
    if (n <= 3) return arr.slice();
    var i0 = 0, i1 = (n / 2) | 0, best = -1;
    for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) {
      var d = Math.hypot(arr[i].x - arr[j].x, arr[i].y - arr[j].y);
      if (d > best) { best = d; i0 = i; i1 = j; }
    }
    var c1 = arr.slice(i0, i1 + 1), c2 = arr.slice(i1).concat(arr.slice(0, i0 + 1));
    var res = rdpChain(c1, tol).slice(0, -1).concat(rdpChain(c2, tol).slice(0, -1));
    return res.length >= 3 ? res : arr.slice();
  }
  function offsetPoly(arr, dist) {
    var n = arr.length;
    if (n < 3 || !dist) return arr.slice();
    var wasCW = signedArea(arr) < 0;
    var a = wasCW ? arr.slice().reverse() : arr.slice();
    var lines = [];
    for (var i = 0; i < n; i++) {
      var p = a[i], q = a[(i + 1) % n], dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy);
      if (L < 1e-6) continue;
      var nx = dy / L, ny = -dx / L;
      lines.push({ x1: p.x + nx * dist, y1: p.y + ny * dist, ux: dx / L, uy: dy / L, nx: nx, ny: ny, orig: p });
    }
    var m = lines.length, out = [];
    for (var k = 0; k < m; k++) {
      var l1 = lines[(k - 1 + m) % m], l2 = lines[k], den = l1.ux * l2.uy - l1.uy * l2.ux;
      var ix, iy;
      if (Math.abs(den) < 1e-5) { ix = l2.x1; iy = l2.y1; }
      else {
        var t = ((l2.x1 - l1.x1) * l2.uy - (l2.y1 - l1.y1) * l2.ux) / den;
        ix = l1.x1 + t * l1.ux; iy = l1.y1 + t * l1.uy;
        if (Math.hypot(ix - l2.orig.x, iy - l2.orig.y) > Math.max(2, Math.abs(dist) * 3)) {
          ix = l2.orig.x + (l1.nx + l2.nx) * 0.5 * dist;
          iy = l2.orig.y + (l1.ny + l2.ny) * 0.5 * dist;
        }
      }
      out.push({ x: ix, y: iy });
    }
    return wasCW ? out.reverse() : out;
  }

  // Architectural 3D Primitives (AO, Shadows, Doors, Rooftop Parapet/Solar/Tanks)
  function dropShadow(a, h) {
    if (cam.pitch < 3 || !(h > 0.2)) return;
    var pr = isPr(), m = cen(a);
    fillPoly(a.map(function (p) { return P(m.x + (p.x - m.x) * 1.045, m.y + (p.y - m.y) * 1.045, 0); }), pr ? 'rgba(30,24,16,0.26)' : 'rgba(0,0,0,0.42)');
    if (!pr) return;
    var eh = h * cam.zBoost;
    fillPoly(a.map(function (p) { return P(p.x + eh * 0.44, p.y - eh * 0.36, 0); }), 'rgba(38,31,20,0.24)');
  }
  function drawCrescent(cx, cy, r) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.3); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.strokeStyle = '#991b1b'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx - r * 0.08, cy, r * 0.66, 0, 6.3); ctx.fillStyle = '#d62828'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx + r * 0.22, cy, r * 0.56, 0, 6.3); ctx.fillStyle = '#ffffff'; ctx.fill();
  }
  function isDiesel(f) {
    return f.category === 'diesel_tank' || (f.category === 'hazard' && /diesel|fuel|سولار/i.test((f.en_name || '') + ' ' + (f.ar_name || '') + ' ' + (f.id || '')));
  }
  function extrude(a, h, col, fl, o) {
    if (cam.pitch < 2 || !(h > 0.05)) return;
    o = o || {};
    var pr = isPr(), n = a.length, ws = [], i, k, wk = o.wk || (pr ? 0.96 : 0.56),
      win = o.win === undefined ? (pr ? '#4f8ec9' : 'rgba(0,217,255,.5)') : o.win,
      ink = o.edge || (pr ? '#232c36' : shade(col, 1)), maxL = 0, doorIdx = -1;
    function at(w, t, z) { return P(w.p.x + (w.q.x - w.p.x) * t, w.p.y + (w.q.y - w.p.y) * t, z); }
    for (i = 0; i < n; i++) {
      var p = a[i], q = a[(i + 1) % n], L = Math.hypot(q.x - p.x, q.y - p.y), ang = Math.atan2(q.y - p.y, q.x - p.x);
      var sunDot = Math.cos(ang - (-38 * D));
      var lightK = pr ? (0.72 + 0.34 * ((sunDot + 1) * 0.5)) : (0.7 + 0.32 * Math.abs(Math.sin(ang + cam.yaw * D)));
      ws.push({ p: p, q: q, d: P((p.x + q.x) / 2, (p.y + q.y) / 2, 0)[2], L: L, lk: lightK, idx: i });
      if (L > maxL) { maxL = L; doorIdx = i; }
    }
    ws.sort(function (u, v) { return v.d - u.d; });
    ws.forEach(function (w) {
      fillPoly([at(w, 0, 0), at(w, 1, 0), at(w, 1, h), at(w, 0, h)], shade(col, wk * w.lk), ink);
      if (pr && h >= 2.2) fillPoly([at(w, 0, 0), at(w, 1, 0), at(w, 1, 0.38), at(w, 0, 0.38)], shade(col, wk * w.lk * 0.76), null);
      ctx.strokeStyle = o.ln || (pr ? '#475569' : shade(col, .85));
      for (k = 1; k < fl; k++) line(at(w, 0, h * k / fl), at(w, 1, h * k / fl));
      if (win && hq && w.L > 3 && sc() > 1.05) {
        for (k = 0; k < fl; k++) for (var s = 1; s < w.L - 2; s += 2.6) {
          if (o.door && k === 0 && w.idx === doorIdx && Math.abs((s + 0.7) - w.L / 2) < 1.6) continue;
          fillPoly([at(w, s / w.L, h * (k + .28) / fl), at(w, (s + 1.4) / w.L, h * (k + .28) / fl), at(w, (s + 1.4) / w.L, h * (k + .72) / fl), at(w, s / w.L, h * (k + .72) / fl)], win, pr ? '#1e293b' : null);
        }
      }
      if (o.door && hq && w.idx === doorIdx && w.L >= 3.0 && sc() > 1.0) {
        var dw = Math.min(2.2, Math.max(1.1, w.L * 0.16)), dh = Math.min(2.3, (h / fl) * 0.76);
        var t0 = 0.5 - (dw / 2) / w.L, t1 = 0.5 + (dw / 2) / w.L;
        fillPoly([at(w, t0, 0), at(w, t1, 0), at(w, t1, dh), at(w, t0, dh)], pr ? '#2c3a47' : '#0b2239', pr ? '#0f172a' : '#00d9ff');
        if (dw >= 1.5) line(at(w, 0.5, 0), at(w, 0.5, dh));
      }
      if (o.stripe) for (var s2 = 0, j = 0; s2 < w.L; s2++, j++) {
        var st0 = s2 / w.L, st1 = Math.min(1, (s2 + 1) / w.L);
        fillPoly([at(w, st0, h * .1), at(w, st1, h * .1), at(w, Math.min(1, st1 + .5 / w.L), h * .3), at(w, Math.min(1, st0 + .5 / w.L), h * .3)], j % 2 ? '#e8c84a' : '#ff3c3c');
      }
    });
  }
  function drawRooftopDetails(a, h, fl) {
    if (cam.pitch < 4 || !hq || area(a) < 50) return;
    var pr = isPr(), th = domAng(a), cs = Math.cos(th), sn = Math.sin(th), m = cen(a);
    function L2W(lx, ly) { return { x: m.x + lx * cs - ly * sn, y: m.y + lx * sn + ly * cs }; }
    var loc = a.map(function (p) { var dx = p.x - m.x, dy = p.y - m.y; return { x: dx * cs + dy * sn, y: -dx * sn + dy * cs }; });
    var b = bb(loc), rw = b.x1 - b.x0, rd = b.y1 - b.y0, ph = 0.65, inner = offsetPoly(a, -0.45);
    if (inner.length === a.length && area(inner) > area(a) * 0.45) {
      fillPoly(a.map(function (p) { return P(p.x, p.y, h + ph); }), pr ? '#e2e8f0' : '#4a6075', pr ? '#2b3440' : '#89a4be');
      fillPoly(inner.map(function (p) { return P(p.x, p.y, h + 0.05); }), pr ? '#c4cdd6' : '#2d3d4e', pr ? '#64748b' : '#52687f');
      for (var i = 0; i < a.length; i++) {
        var q = a[(i + 1) % a.length];
        fillPoly([P(a[i].x, a[i].y, h), P(q.x, q.y, h), P(q.x, q.y, h + ph), P(a[i].x, a[i].y, h + ph)], pr ? '#d5dde5' : '#3d5166', pr ? '#2b3440' : '#6f8aa5');
      }
    }
    if (fl >= 2 && rw > 8 && rd > 6) {
      var pw = Math.min(4.8, rw * 0.34), pd = Math.min(3.4, rd * 0.46), gap = 0.9;
      [-pw / 2 - gap / 2, pw / 2 + gap / 2].forEach(function (ox) {
        var sp = [[ox - pw / 2, -pd / 2], [ox + pw / 2, -pd / 2], [ox + pw / 2, pd / 2], [ox - pw / 2, pd / 2]].map(function (q) { return L2W(q[0], q[1]); });
        if (sp.every(function (q) { return inP(q.x, q.y, a); })) {
          var ptsS = [P(sp[0].x, sp[0].y, h + 0.2), P(sp[1].x, sp[1].y, h + 0.2), P(sp[2].x, sp[2].y, h + 0.95), P(sp[3].x, sp[3].y, h + 0.95)];
          fillPoly(ptsS, pr ? '#1e4682' : '#10285f', pr ? '#0f172a' : '#3a7bff');
          ctx.strokeStyle = 'rgba(147,197,253,0.6)'; ctx.lineWidth = 0.8;
          for (var g = 1; g <= 2; g++) {
            var k = g / 3;
            line([ptsS[0][0] + (ptsS[1][0] - ptsS[0][0]) * k, ptsS[0][1] + (ptsS[1][1] - ptsS[0][1]) * k], [ptsS[3][0] + (ptsS[2][0] - ptsS[3][0]) * k, ptsS[3][1] + (ptsS[2][1] - ptsS[3][1]) * k]);
          }
          line([(ptsS[0][0] + ptsS[3][0]) / 2, (ptsS[0][1] + ptsS[3][1]) / 2], [(ptsS[1][0] + ptsS[2][0]) / 2, (ptsS[1][1] + ptsS[2][1]) / 2]);
        }
      });
      var tx0 = b.x1 - 1.9, ty0 = b.y1 - 1.7;
      [[tx0, ty0], [tx0 - 1.5, ty0]].forEach(function (tk) {
        var wp = L2W(tk[0], tk[1]);
        if (!inP(wp.x, wp.y, a)) return;
        var b0 = P(wp.x, wp.y, h + 0.1), t0 = P(wp.x, wp.y, h + 1.45), rad = Math.max(2.5, 0.55 * sc());
        ctx.fillStyle = pr ? '#cfd6de' : '#64748b'; ctx.strokeStyle = pr ? '#334155' : '#94a3b8'; ctx.lineWidth = 1;
        ctx.fillRect(t0[0] - rad, t0[1], rad * 2, Math.max(2, b0[1] - t0[1]));
        ctx.strokeRect(t0[0] - rad, t0[1], rad * 2, Math.max(2, b0[1] - t0[1]));
        ctx.beginPath(); ctx.ellipse(t0[0], t0[1], rad, rad * 0.48, 0, 0, 6.3);
        ctx.fillStyle = pr ? '#f8fafc' : '#94a3b8'; ctx.fill(); ctx.stroke();
      });
    }
  }
  // Feature Renderers & CAD Overlays
  function roof(a, h, col, type, rc) {
    var pr = isPr(), c = cen(a), n = a.length, i, zh = cam.pitch < 2 ? 0 : h;
    if (type === 'quonset') {
      for (i = 0; i < 5; i++) {
        var t = i / 5 * Math.PI / 2, s = Math.cos(t), z = zh + (cam.pitch < 2 ? 0 : Math.sin(t) * Math.max(1.4, h * .55));
        fillPoly(a.map(function (p) { return P(c.x + (p.x - c.x) * s, c.y + (p.y - c.y) * s, z); }), pr ? shade(rc || '#e9edf2', .88 + i * .03) : shade(col, .6 + i * .07), pr ? '#475569' : col);
      }
      return;
    }
    if (type === 'pyramid' || type === 'red_tile') {
      var ap = P(c.x, c.y, zh + (cam.pitch < 2 ? 0 : Math.max(1.4, h * .48))), es = [], red = type === 'red_tile';
      for (i = 0; i < n; i++) { var p = a[i], q = a[(i + 1) % n]; es.push({ p: p, q: q, d: P((p.x + q.x) / 2, (p.y + q.y) / 2, 0)[2], i: i }); }
      es.sort(function (u, v) { return v.d - u.d; });
      es.forEach(function (e) {
        var fc = red ? shade(pr ? '#cf4b43' : '#c0502d', .8 + .09 * (e.i % 3)) : shade(rc || col, pr ? (.88 + .05 * (e.i % 3)) : (.7 + .1 * (e.i % 3)));
        fillPoly([P(e.p.x, e.p.y, zh), P(e.q.x, e.q.y, zh), ap], fc, pr ? '#333d47' : (red ? '#ff8a5c' : col));
      });
      return;
    }
    fillPoly(a.map(function (p) { return P(p.x, p.y, zh); }), rc || shade(col, pr ? 1.04 : .8), pr ? '#2b3440' : (rc ? '#89a4be' : col));
  }
  function pulse(p) {
    if (isPr()) {
      ctx.beginPath(); ctx.arc(p[0], p[1], 4.5, 0, 6.3); ctx.fillStyle = '#e8c84a'; ctx.fill();
      ctx.lineWidth = 1.4; ctx.strokeStyle = '#b91c1c'; ctx.stroke(); return;
    }
    var k = .5 + .5 * Math.sin(Date.now() / 350), r = 2.5 + 2 * k;
    ctx.beginPath(); ctx.arc(p[0], p[1], r + 2, 0, 6.3); ctx.fillStyle = 'rgba(255,60,60,' + (.15 + .25 * k) + ')'; ctx.fill();
    ctx.beginPath(); ctx.arc(p[0], p[1], 2.5, 0, 6.3); ctx.fillStyle = '#e8c84a'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = '#ff3c3c'; ctx.stroke();
  }
  function drawTreeAt(x, y, col, radM) {
    var pr = isPr(), s = sc(), r = Math.max(2.5, (radM || 1.7) * s);
    if (pr) {
      if (cam.pitch >= 4) {
        var sh = P(x + 1.2 * cam.zBoost, y - 0.9 * cam.zBoost, 0);
        ctx.beginPath(); ctx.arc(sh[0], sh[1], r * .95, 0, 6.3); ctx.fillStyle = 'rgba(42,35,24,0.24)'; ctx.fill();
        var u0 = P(x, y, 0), v0 = P(x, y, 1.9); ctx.strokeStyle = '#5c4028'; ctx.lineWidth = Math.max(1.5, .28 * s); line(u0, v0);
      }
      var zt = cam.pitch < 2 ? 0 : 2.7;
      var t0 = P(x, y, zt), t1 = P(x - .55, y + .3, zt + .2), t2 = P(x + .5, y - .2, zt + .3);
      ctx.lineWidth = .9;
      ctx.beginPath(); ctx.arc(t0[0], t0[1], r * .95, 0, 6.3); ctx.fillStyle = '#476b2d'; ctx.fill(); ctx.strokeStyle = '#283d19'; ctx.stroke();
      ctx.beginPath(); ctx.arc(t1[0], t1[1], r * .72, 0, 6.3); ctx.fillStyle = '#5c843c'; ctx.fill();
      ctx.beginPath(); ctx.arc(t2[0], t2[1], r * .62, 0, 6.3); ctx.fillStyle = '#739c4c'; ctx.fill();
      return;
    }
    var u = P(x, y, 0), v = P(x, y, cam.pitch < 2 ? 0 : 2.2);
    if (cam.pitch >= 2) { ctx.strokeStyle = '#6b4a2a'; line(u, v); }
    ctx.beginPath(); ctx.arc(v[0], v[1], Math.max(2, (radM || 1.6) * s), 0, 6.3); ctx.fillStyle = col || '#3f8f2f'; ctx.fill();
  }
  function dpoint(f) {
    var pr = isPr(), p = f.coordsMetric[0] || f.center, c = f.color || '#39ff14', cat = f.category, s = sc(), r = (f.rotationDeg || 0) * D, i, u, v;
    if (cat === 'assembly') {
      var ring = [];
      for (i = 0; i < 36; i++) ring.push(P(p.x + 6 * Math.cos(i / 36 * 6.2832), p.y + 6 * Math.sin(i / 36 * 6.2832), 0));
      if (pr) {
        fillPoly(ring, 'rgba(22,163,74,0.22)', '#15803d');
        u = P(p.x, p.y, 0);
        ctx.beginPath(); ctx.arc(u[0], u[1], Math.max(9, 2.4 * s), 0, 6.3); ctx.fillStyle = '#15803d'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 12px ' + MONO; ctx.textAlign = 'center'; ctx.fillText('A', u[0], u[1] + 4);
      } else {
        if (hq) { ctx.shadowColor = '#00d9ff'; ctx.shadowBlur = 14; }
        ctx.globalAlpha = .25; fillPoly(ring, '#00d9ff'); ctx.globalAlpha = 1;
        ctx.strokeStyle = '#00d9ff'; ctx.lineWidth = 2; path(ring, 1); ctx.stroke(); ctx.shadowBlur = 0;
        u = P(p.x, p.y, 0); ctx.fillStyle = '#00d9ff'; ctx.font = 'bold 14px ' + MONO; ctx.textAlign = 'center'; ctx.fillText('A', u[0], u[1] + 5);
      }
    } else if (cat === 'vehicle') {
      var cs = Math.cos(r), sn = Math.sin(r), box = [[-5, -1.25], [5, -1.25], [5, 1.25], [-5, 1.25]].map(function (q) { return { x: p.x + q[0] * cs - q[1] * sn, y: p.y + q[0] * sn + q[1] * cs }; });
      dropShadow(box, 3);
      if (pr) {
        extrude(box, 1.3, '#1e5aa8', 1, { wk: 1, edge: '#1b2838', win: null });
        extrude(box, 2.9, '#eef2f6', 1, { wk: .96, edge: '#1b2838', win: '#3b6d9c' });
        roof(box, 2.9, '#ffffff', 'flat', '#f8fafc');
      } else { extrude(box, 3, c, 1); roof(box, 3, c, 'flat'); }
    } else if (cat === 'tree') drawTreeAt(p.x, p.y, c, 1.8);
    else if (cat === 'extinguisher') {
      u = P(p.x, p.y, 0); v = P(p.x, p.y, cam.pitch < 2 ? 0 : .9); ctx.lineCap = 'round'; ctx.lineWidth = Math.max(4, .4 * s); ctx.strokeStyle = '#dc2626'; line(u, v); ctx.lineCap = 'butt'; ctx.lineWidth = 1.3;
    } else if (cat === 'camera') {
      u = P(p.x, p.y, 0); v = P(p.x, p.y, cam.pitch < 2 ? 0 : 3.2); ctx.strokeStyle = pr ? '#475569' : '#8899aa'; line(u, v); ctx.fillStyle = pr ? '#1e293b' : c; ctx.fillRect(v[0] - 6, v[1] - 4, 12, 8);
    } else {
      u = P(p.x, p.y, 0); v = P(p.x, p.y, cam.pitch < 2 ? 0 : 2.5); ctx.strokeStyle = pr ? '#1e293b' : c; line(u, v); ctx.beginPath(); ctx.arc(v[0], v[1], 6, 0, 6.3); ctx.fillStyle = c; ctx.fill();
    }
  }
  function rmode(f) { return f.renderMode || (area(f.coordsMetric) > 45 ? 'auto' : 'solid'); }
  function bcol(f) { var c = (f.color || '').toLowerCase(); return !c || c === '#39ff14' ? '#3b4c5e' : f.color; }
  function domAng(a) {
    var sx = 0, sy = 0;
    for (var i = 0; i < a.length; i++) {
      var q = a[(i + 1) % a.length], dx = q.x - a[i].x, dy = q.y - a[i].y, l = Math.hypot(dx, dy), t = Math.atan2(dy, dx);
      sx += l * Math.cos(2 * t); sy += l * Math.sin(2 * t);
    }
    return .5 * Math.atan2(sy, sx);
  }
  function gable(cn, h, rise, c, roofA, roofB, edge) {
    var zh = cam.pitch < 2 ? 0 : h, z = zh + (cam.pitch < 2 ? 0 : rise);
    var r0 = { x: (cn[0].x + cn[3].x) / 2, y: (cn[0].y + cn[3].y) / 2 }, r1 = { x: (cn[1].x + cn[2].x) / 2, y: (cn[1].y + cn[2].y) / 2 };
    var fs = [
      { v: [[cn[0], zh], [cn[1], zh], [r1, z], [r0, z]], c: roofA || '#b4502e' },
      { v: [[cn[3], zh], [cn[2], zh], [r1, z], [r0, z]], c: roofB || '#8e3d22' },
      { v: [[cn[0], zh], [cn[3], zh], [r0, z]], c: shade(c, .76) },
      { v: [[cn[1], zh], [cn[2], zh], [r1, z]], c: shade(c, .9) }
    ];
    fs.forEach(function (f) { f.p = f.v.map(function (e) { return P(e[0].x, e[0].y, e[1]); }); f.d = f.p.reduce(function (s, q) { return s + q[2]; }, 0) / f.p.length; });
    fs.sort(function (u, v) { return v.d - u.d; });
    fs.forEach(function (f) { fillPoly(f.p, f.c, edge || '#ff8a5c'); });
  }
  function zone(f, a, c) {
    var pr = isPr(), cot = f.category === 'cottage', u = cot ? 4 : 3.5, v = cot ? 3.2 : 3.5, px = u + (cot ? 1.8 : 1.4), py = v + (cot ? 2.2 : 1.4),
      th = domAng(a), cs = Math.cos(th), sn = Math.sin(th), m = cen(a), us = [], x, y;
    function L2W(lx, ly) { return { x: m.x + lx * cs - ly * sn, y: m.y + lx * sn + ly * cs }; }
    var b = bb(a.map(function (p) { var dx = p.x - m.x, dy = p.y - m.y; return { x: dx * cs + dy * sn, y: -dx * sn + dy * cs }; }));
    if (pr) fillPoly(a.map(g0), 'rgba(218,195,152,0.35)', 'rgba(130,115,90,0.45)');
    else { ctx.globalAlpha = .16; fillPoly(a.map(g0), c); ctx.globalAlpha = 1; ctx.strokeStyle = c; ctx.setLineDash([5, 4]); path(a.map(g0), 1); ctx.stroke(); ctx.setLineDash([]); }
    for (y = b.y0 + v / 2 + .3; y <= b.y1 - v / 2 && us.length < 300; y += py)
      for (x = b.x0 + u / 2 + .3; x <= b.x1 - u / 2 && us.length < 300; x += px) {
        var cn = [[-u / 2, -v / 2], [u / 2, -v / 2], [u / 2, v / 2], [-u / 2, v / 2]].map(function (q) { return L2W(x + q[0], y + q[1]); });
        if (cn.every(function (q) { return inP(q.x, q.y, a); })) { var cc = L2W(x, y); us.push({ lx: x, ly: y, cn: cn, d: P(cc.x, cc.y, 0)[2] }); }
      }
    if (!us.length) {
      var fu = Math.max(2.2, Math.min(u, (b.x1 - b.x0) * .6)), fv = Math.max(2.2, Math.min(v, (b.y1 - b.y0) * .6));
      us.push({ lx: 0, ly: 0, cn: [[-fu / 2, -fv / 2], [fu / 2, -fv / 2], [fu / 2, fv / 2], [-fu / 2, fv / 2]].map(function (q) { return L2W(q[0], q[1]); }), d: P(m.x, m.y, 0)[2] });
    }
    if (cot) {
      ctx.globalAlpha = pr ? .75 : .55;
      us.forEach(function (o) { fillPoly([L2W(o.lx - u / 2, o.ly + v / 2), L2W(o.lx + u / 2, o.ly + v / 2), L2W(o.lx + u / 2, o.ly + v / 2 + 1.1), L2W(o.lx - u / 2, o.ly + v / 2 + 1.1)].map(function (q) { return P(q.x, q.y, 0); }), pr ? '#d1c8b8' : '#8a7a66'); });
      ctx.globalAlpha = 1;
    }
    us.sort(function (p, q) { return q.d - p.d; });
    us.forEach(function (o) {
      dropShadow(o.cn, cot ? 3.0 : 2.4);
      if (cot) {
        var wc = pr ? '#c88d55' : c;
        extrude(o.cn, 2.1, wc, 1, { wk: .95, edge: pr ? '#3c2918' : null, win: pr ? '#3c4d5e' : 'rgba(255,255,255,.22)', door: true });
        gable(o.cn, 2.1, .9, wc, pr ? '#b26e38' : '#b4502e', pr ? '#8e5325' : '#8e3d22', pr ? '#3c2918' : '#ff8a5c');
      } else {
        var tc = pr ? '#f2f3f0' : c;
        extrude(o.cn, 1.2, tc, 1, { wk: pr ? .96 : .6, edge: pr ? '#475569' : null, win: null });
        if (f.roofType === 'quonset') roof(o.cn, 1.2, tc, 'quonset', pr ? '#ffffff' : null);
        else gable(o.cn, 1.2, 1.1, tc, pr ? '#ffffff' : shade(c, .8), pr ? '#dde2e8' : shade(c, .65), pr ? '#475569' : c);
      }
    });
  }
  function drawDiesel(a, hh) {
    var pr = isPr(), th = domAng(a), cs = Math.cos(th), sn = Math.sin(th), m = cen(a);
    function L2W(lx, ly) { return { x: m.x + lx * cs - ly * sn, y: m.y + lx * sn + ly * cs }; }
    var b = bb(a.map(function (p) { var dx = p.x - m.x, dy = p.y - m.y; return { x: dx * cs + dy * sn, y: -dx * sn + dy * cs }; }));
    fillPoly(a.map(g0), pr ? '#cbd2d9' : '#252c34', pr ? '#475569' : '#ff3c3c');
    if (cam.pitch >= 2) {
      ctx.strokeStyle = pr ? '#4b5563' : '#ff3c3c'; ctx.lineWidth = 1;
      path(a.map(function (p) { return P(p.x, p.y, 1.4); }), 1); ctx.stroke();
      a.forEach(function (p) { line(P(p.x, p.y, 0), P(p.x, p.y, 1.4)); });
    }
    var tw = Math.max(1.8, (b.x1 - b.x0) * .65), td = Math.max(1.2, Math.min(2.6, (b.y1 - b.y0) * .55));
    var tbox = [[-tw / 2, -td / 2], [tw / 2, -td / 2], [tw / 2, td / 2], [-tw / 2, td / 2]].map(function (q) { return L2W(q[0], q[1]); });
    dropShadow(tbox, hh);
    extrude(tbox, hh * .55, pr ? '#dde3e9' : '#586573', 1, { wk: .95, edge: pr ? '#2b3440' : '#ff3c3c', win: null, stripe: !pr });
    roof(tbox, hh * .55, pr ? '#eef2f6' : '#6c7a89', 'quonset', pr ? '#f8fafc' : '#7b8a99');
  }
  function drawPool(a, h) {
    var pr = isPr(), th = domAng(a), cs = Math.cos(th), sn = Math.sin(th), m = cen(a);
    function L2W(lx, ly) { return { x: m.x + lx * cs - ly * sn, y: m.y + lx * sn + ly * cs }; }
    var b = bb(a.map(function (p) { var dx = p.x - m.x, dy = p.y - m.y; return { x: dx * cs + dy * sn, y: -dx * sn + dy * cs }; }));
    dropShadow(a, h);
    fillPoly(a.map(g0), pr ? '#d9dfe6' : '#1f364d', pr ? '#334155' : '#00d9ff');
    var iw = (b.x1 - b.x0) * .78, id = (b.y1 - b.y0) * .72;
    var water = [[-iw / 2, -id / 2], [iw / 2, -id / 2], [iw / 2, id / 2], [-iw / 2, id / 2]].map(function (q) { return P(L2W(q[0], q[1]).x, L2W(q[0], q[1]).y, .05); });
    fillPoly(water, '#22a6df', '#7dd3fc');
    if (cam.pitch >= 2) {
      ctx.save(); ctx.globalAlpha = pr ? .42 : .28;
      roof(a, Math.max(1.2, h * .45), pr ? '#e2f2fc' : '#00d9ff', 'quonset', pr ? '#f0f9ff' : '#00d9ff');
      ctx.restore();
      ctx.strokeStyle = pr ? '#334155' : '#00d9ff'; ctx.lineWidth = 1.2;
      a.forEach(function (p) { line(P(p.x, p.y, 0), P(p.x, p.y, Math.max(1.2, h * .45))); });
    }
  }
  function drawPlayground(a) {
    var pr = isPr(), m = cen(a);
    fillPoly(a.map(g0), pr ? '#e8ca8e' : 'rgba(212,163,89,0.2)', pr ? '#785a3a' : '#e8c84a');
    if (cam.pitch >= 2) {
      ctx.strokeStyle = pr ? '#6b4f35' : '#e8c84a'; ctx.lineWidth = 1;
      path(a.map(function (p) { return P(p.x, p.y, 1.1); }), 1); ctx.stroke();
      a.forEach(function (p) { line(P(p.x, p.y, 0), P(p.x, p.y, 1.1)); });
      ctx.strokeStyle = pr ? '#334155' : '#e8c84a'; ctx.lineWidth = 1.6;
      line(P(m.x - 2, m.y - 1, 0), P(m.x - 2, m.y, 2.2)); line(P(m.x - 2, m.y + 1, 0), P(m.x - 2, m.y, 2.2));
      line(P(m.x + .5, m.y - 1, 0), P(m.x + .5, m.y, 2.2)); line(P(m.x + .5, m.y + 1, 0), P(m.x + .5, m.y, 2.2));
      line(P(m.x - 2, m.y, 2.2), P(m.x + .5, m.y, 2.2));
      ctx.strokeStyle = '#dc2626'; line(P(m.x + 2, m.y - .5, 1.8), P(m.x + 3.4, m.y + 1, 0));
    }
  }
  function drawParking(a) {
    var pr = isPr(), th = domAng(a), cs = Math.cos(th), sn = Math.sin(th), m = cen(a);
    function L2W(lx, ly) { return { x: m.x + lx * cs - ly * sn, y: m.y + lx * sn + ly * cs }; }
    var b = bb(a.map(function (p) { var dx = p.x - m.x, dy = p.y - m.y; return { x: dx * cs + dy * sn, y: -dx * sn + dy * cs }; }));
    fillPoly(a.map(g0), pr ? '#9ca3af' : 'rgba(100,116,139,0.3)', pr ? '#374151' : '#8aa0b5');
    var cols = ['#f8fafc', '#64748b', '#dc2626', '#cbd5e1', '#1e3a8a'], idx = 0;
    for (var x = b.x0 + 1.8; x <= b.x1 - 1.8 && idx < 10; x += 2.9) {
      var p1 = L2W(x - 1.3, b.y0 + .4), p2 = L2W(x - 1.3, b.y1 - .4);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; line(P(p1.x, p1.y, .02), P(p2.x, p2.y, .02));
      var car = [[-.9, -1.9], [.9, -1.9], [.9, 1.9], [-.9, 1.9]].map(function (q) { return L2W(x + q[0], (b.y0 + b.y1) / 2 + q[1]); });
      if (car.every(function (q) { return inP(q.x, q.y, a); })) {
        dropShadow(car, 1.3);
        var cc = cols[idx % cols.length];
        extrude(car, 1.1, cc, 1, { wk: .95, edge: '#1f2937', win: null });
        roof(car, 1.1, cc, 'flat', shade(cc, 1.05));
        idx++;
      }
    }
  }
  function draw(f) {
    if (f.geometryType === 'point') return dpoint(f);
    var pr = isPr(), a = pts(f), c = f.color || '#39ff14', h = +f.height_m || 0, cat = f.category, fl = Math.max(1, f.floors | 0), i, k, b, u, v;
    ctx.setLineDash([]); ctx.lineWidth = hq ? 1.2 : 1;
    if (cat === 'yard' || cat === 'road') {
      if (pr) fillPoly(a.map(g0), cat === 'road' ? '#d4d0c8' : '#e8d0a2', cat === 'road' ? '#7a756c' : '#c8b288');
      else { ctx.globalAlpha = .5; fillPoly(a.map(g0), shade(c, .6), c); ctx.globalAlpha = 1; }
    } else if (cat === 'parking') drawParking(a);
    else if (cat === 'playground') drawPlayground(a);
    else if (cat === 'pool') drawPool(a, h || 3.2);
    else if (cat === 'fence') {
      var fh = cam.pitch < 2 ? 0 : (h || 2.5), n = a.length;
      ctx.strokeStyle = pr ? '#475569' : c; ctx.lineWidth = pr ? 1.4 : 1.2;
      if (pr && fh > 0) {
        var wallH = Math.min(1.0, fh * 0.42), innerF = offsetPoly(a, -0.35);
        extrude(a, wallH, '#cfc9be', 1, { wk: .95, edge: '#475569', win: null });
        if (innerF.length === a.length) {
          for (i = 0; i < n; i++) {
            var q1 = a[(i + 1) % n], iq0 = innerF[i], iq1 = innerF[(i + 1) % n];
            fillPoly([P(a[i].x, a[i].y, wallH), P(q1.x, q1.y, wallH), P(iq1.x, iq1.y, wallH), P(iq0.x, iq0.y, wallH)], '#e3dfd7', '#64748b');
          }
        }
      }
      path(a.map(g0), 1); ctx.stroke();
      if (fh > 0) {
        path(a.map(function (p) { return P(p.x, p.y, fh); }), 1); ctx.stroke();
        ctx.globalAlpha = .45; path(a.map(function (p) { return P(p.x, p.y, fh * .7); }), 1); ctx.stroke(); ctx.globalAlpha = 1;
        for (i = 0; i < n; i++) {
          var p = a[i], q = a[(i + 1) % n], m = Math.min(400, Math.max(1, Math.round(Math.hypot(q.x - p.x, q.y - p.y) / 6)));
          for (k = 0; k < m; k++) { var t = k / m, x = p.x + (q.x - p.x) * t, y = p.y + (q.y - p.y) * t; line(P(x, y, 0), P(x, y, fh)); }
        }
      }
    } else if (cat === 'field') {
      var th = domAng(a), cs = Math.cos(th), sn = Math.sin(th), mc = cen(a);
      function F2W(lx, ly) { return { x: mc.x + lx * cs - ly * sn, y: mc.y + lx * sn + ly * cs }; }
      var fb = bb(a.map(function (p) { var dx = p.x - mc.x, dy = p.y - mc.y; return { x: dx * cs + dy * sn, y: -dx * sn + dy * cs }; }));
      var fw = fb.x1 - fb.x0, fd = fb.y1 - fb.y0, mx = (fb.x0 + fb.x1) / 2, my = (fb.y0 + fb.y1) / 2;
      if (pr) fillPoly(a.map(g0), '#3fa335', '#ffffff');
      else { ctx.globalAlpha = .45; fillPoly(a.map(g0), '#1f6f1f'); ctx.globalAlpha = 1; ctx.strokeStyle = '#fff'; path(a.map(g0), 1); ctx.stroke(); }
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4;
      var l1 = F2W(mx, fb.y0), l2 = F2W(mx, fb.y1); line(P(l1.x, l1.y, .02), P(l2.x, l2.y, .02));
      var cr = Math.min(fw, fd) * .15, ring = [];
      for (i = 0; i < 32; i++) { var rp = F2W(mx + cr * Math.cos(i / 32 * 6.2832), my + cr * Math.sin(i / 32 * 6.2832)); ring.push(P(rp.x, rp.y, .02)); }
      path(ring, 1); ctx.stroke();
      var pw = fw * .16, pd = fd * .48;
      [[fb.x0, fb.x0 + pw], [fb.x1 - pw, fb.x1]].forEach(function (xs) {
        var box = [[xs[0], my - pd / 2], [xs[1], my - pd / 2], [xs[1], my + pd / 2], [xs[0], my + pd / 2]].map(function (q) { var wp = F2W(q[0], q[1]); return P(wp.x, wp.y, .02); });
        path(box, 1); ctx.stroke();
      });
      if (cam.pitch >= 2) {
        ctx.strokeStyle = pr ? 'rgba(55,65,81,.55)' : 'rgba(255,255,255,.55)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
        path(a.map(function (p) { return P(p.x, p.y, 3); }), 1); ctx.stroke(); ctx.setLineDash([]);
        a.forEach(function (p) { line(P(p.x, p.y, 0), P(p.x, p.y, 3)); });
      }
    } else if (cat === 'olive_zone') {
      if (pr) fillPoly(a.map(g0), '#ebd4a2', '#b09a70');
      else { ctx.globalAlpha = .25; fillPoly(a.map(g0), '#2f6f1f'); ctx.globalAlpha = 1; ctx.strokeStyle = c; ctx.setLineDash([5, 4]); path(a.map(g0), 1); ctx.stroke(); ctx.setLineDash([]); }
      b = bb(a); var cnt = Math.min(hq ? 90 : 25, Math.max(5, area(a) / 42 | 0)), sd = hash(f.id), tr = [], tries = 0;
      while (tr.length < cnt && tries++ < cnt * 20) {
        sd = (sd * 1664525 + 1013904223) >>> 0; var rx = b.x0 + sd / 4294967296 * (b.x1 - b.x0);
        sd = (sd * 1664525 + 1013904223) >>> 0; var ry = b.y0 + sd / 4294967296 * (b.y1 - b.y0);
        if (inP(rx, ry, a)) tr.push({ x: rx, y: ry, d: P(rx, ry, 0)[2] });
      }
      tr.sort(function (p, q) { return q.d - p.d; });
      tr.forEach(function (t) { drawTreeAt(t.x, t.y, '#3f8f2f', 1.65); });
    } else if (cat === 'solar') {
      b = bb(a); var tp = a.map(function (p) { return P(p.x, p.y, cam.pitch < 2 ? 0 : (.5 + (p.y - b.y0) / Math.max(1, b.y1 - b.y0) * 1.3)); });
      dropShadow(a, 1.4);
      if (cam.pitch >= 2) { ctx.strokeStyle = pr ? '#475569' : '#8899aa'; a.forEach(function (p, j) { line(P(p.x, p.y, 0), tp[j]); }); }
      fillPoly(tp, pr ? '#224a88' : '#10285f', pr ? '#1e293b' : '#3a7bff');
      if (pr && hq && tp.length >= 4) {
        ctx.strokeStyle = 'rgba(147,197,253,0.55)'; ctx.lineWidth = .8;
        for (i = 1; i <= 3; i++) {
          var t = i / 4;
          line([tp[0][0] + (tp[1][0] - tp[0][0]) * t, tp[0][1] + (tp[1][1] - tp[0][1]) * t], [tp[3][0] + (tp[2][0] - tp[3][0]) * t, tp[3][1] + (tp[2][1] - tp[3][1]) * t]);
          line([tp[0][0] + (tp[3][0] - tp[0][0]) * t, tp[0][1] + (tp[3][1] - tp[0][1]) * t], [tp[1][0] + (tp[2][0] - tp[1][0]) * t, tp[1][1] + (tp[2][1] - tp[1][1]) * t]);
        }
      }
    } else if (isDiesel(f)) drawDiesel(a, h || 2.4);
    else if (cat === 'hazard') {
      var hh = h || 3; dropShadow(a, hh);
      extrude(a, hh, pr ? '#5c6470' : '#2b3138', 1, { wk: 1, ln: '#4a5560', edge: pr ? '#1f2937' : '#4a5560', win: null, stripe: 1 });
      roof(a, hh, pr ? '#737c88' : '#2b3138', 'flat', pr ? '#858e9a' : '#39424b');
      ctx.strokeStyle = pr ? '#b91c1c' : '#ff3c3c'; path(a.map(function (p) { return P(p.x, p.y, cam.pitch < 2 ? 0 : hh); }), 1); ctx.stroke();
    } else if ((cat === 'tent' || cat === 'cottage') && rmode(f) === 'auto') zone(f, a, c);
    else {
      var bld = cat === 'building', wh = cat === 'tent' ? h * .45 : h;
      dropShadow(a, wh);
      if (pr && cat === 'medical') {
        extrude(a, wh, '#ede9e1', 1, { wk: .96, edge: '#2b3440', win: '#5b8ec4', door: true });
        roof(a, wh, '#d4423e', 'red_tile');
        var cm = cen(a), um = P(cm.x, cm.y, cam.pitch < 2 ? 0 : (wh + Math.max(1.4, wh * .48) * .55));
        drawCrescent(um[0], um[1], Math.max(6, cl(sc() * 2.2, 6, 16)));
      } else if (pr && cat === 'security') {
        extrude(a, wh, '#dedbd4', 1, { wk: .96, edge: '#2b3440', win: '#4f8ec9', door: true });
        roof(a, wh, '#c9413b', 'red_tile');
      } else if (pr && cat === 'gate') {
        extrude(a, 1.4, '#dc2626', 1, { wk: 1, edge: '#1f2937', win: null, stripe: 1 });
        roof(a, 1.4, '#ffffff', 'flat', '#f8fafc');
      } else if (pr && cat === 'tent') {
        extrude(a, wh, '#f2f3f0', 1, { wk: .96, edge: '#475569', win: null });
        roof(a, wh, '#ffffff', f.roofType || 'pyramid', '#ffffff');
      } else {
        if (bld) c = pr ? '#cfd7df' : bcol(f);
        extrude(a, wh, c, cat === 'tent' ? 1 : fl, bld ? { wk: 1, ln: pr ? '#64748b' : '#89a4be', edge: pr ? '#2b3440' : '#6f8aa5', win: pr ? '#4b86c2' : 'rgba(137,164,190,.32)', door: true } : { door: cat === 'cottage' });
        roof(a, wh, c, f.roofType || 'flat', bld ? (pr ? '#dfe5ec' : '#52687f') : null);
        if (bld && (f.roofType || 'flat') === 'flat') drawRooftopDetails(a, wh, fl);
        var cc = cen(a);
        if (cat === 'medical') { u = P(cc.x, cc.y, cam.pitch < 2 ? 0 : wh + .1); var z = Math.max(3, sc() * 1.2); ctx.fillStyle = '#ff3c3c'; ctx.fillRect(u[0] - z, u[1] - z / 3, 2 * z, 2 * z / 3); ctx.fillRect(u[0] - z / 3, u[1] - z, 2 * z / 3, 2 * z); }
        if (cat === 'security') { u = P(cc.x, cc.y, cam.pitch < 2 ? 0 : wh); v = P(cc.x, cc.y, cam.pitch < 2 ? 0 : wh + 2.5); ctx.strokeStyle = '#00d9ff'; line(u, v); ctx.beginPath(); ctx.arc(v[0], v[1], 4, 0, 6.3); ctx.fillStyle = '#00d9ff'; ctx.fill(); }
      }
    }
  }
  function drawFeature(f) {
    draw(f);
    var h = cam.pitch < 2 ? 0 : (+f.height_m || 0), c = f.center, pt = f.geometryType === 'point', top = P(c.x, c.y, pt ? (cam.pitch < 2 ? 0 : 3) : h), a = pt ? null : pts(f);
    if (f.hazard_flag === true || f.hazard_flag === 'high_fire' || f.category === 'hazard' || f.category === 'diesel_tank') pulse(pt ? top : P(a[0].x, a[0].y, h || 0));
    var im = icon(f), io = im ? cl(sc() * 4, 16, 48) : 0;
    if (im) ctx.drawImage(im, top[0] - io / 2, top[1] - io - 6, io, io * ((im.naturalHeight / im.naturalWidth) || 1));
    var hid = f.category === 'fence' || f.category === 'road' || f.category === 'yard';
    if (layers.labels && f.en_name && (!hid || f.id === sel)) labels.push({ f: f, x: top[0], y: top[1] - 14 - io, i: labels.length });
    if (pt) hits.push({ f: f, c: P(c.x, c.y, cam.pitch < 2 ? 0 : 1) });
    else hits.push({ f: f, edge: f.category === 'fence', a: a.map(function (p) { return S2(p, 0); }), b: a.map(function (p) { return S2(p, h); }) });
  }
  var LPRI = { assembly: 1, gate: 1, medical: 1, hazard: 1, diesel_tank: 1, building: 2, pool: 2, cottage: 3, tent: 3, playground: 3, parking: 4, solar: 4, olive_zone: 5 };
  var LTINT = { building: '#52687f', hazard: '#d97706', diesel_tank: '#b91c1c', assembly: '#15803d', gate: '#b45309', medical: '#dc2626', pool: '#0284c7', cottage: '#a16207', tent: '#64748b', playground: '#b45309', parking: '#475569', solar: '#1d4ed8', olive_zone: '#3f6212' };
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function drawLabels() {
    var pr = isPr(), placed = [], hh = 15;
    labels.forEach(function (l) { l.p = l.f.id === sel ? 0 : (LPRI[l.f.category] || 6); });
    labels.sort(function (a, b) { return a.p - b.p || b.i - a.i; });
    ctx.font = (pr ? 'bold ' : '') + '10px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 1; ctx.setLineDash([]);
    labels.forEach(function (l) {
      var t = l.f.en_name, w = ctx.measureText(t).width + 12, x = l.x - w / 2, y = l.y - hh / 2;
      if (x > W || x + w < 0 || y > H || y + hh < 0) return;
      var r = [x - 4, y - 4, w + 8, hh + 8];
      for (var i = 0; i < placed.length; i++) { var q = placed[i]; if (r[0] < q[0] + q[2] && r[0] + r[2] > q[0] && r[1] < q[1] + q[3] && r[1] + r[3] > q[1]) return; }
      placed.push(r);
      rr(x, y, w, hh, 4);
      ctx.fillStyle = pr ? 'rgba(255,255,255,0.93)' : 'rgba(8,11,16,0.88)'; ctx.fill();
      ctx.strokeStyle = LTINT[l.f.category] || l.f.color || '#64748b'; ctx.stroke();
      ctx.fillStyle = pr ? '#111827' : '#e6f3ff'; ctx.fillText(t, l.x, l.y + .5);
    });
    ctx.textBaseline = 'alphabetic';
  }
  function vis(f) { return f.visible !== false && layers[LAY[f.category] || 'build']; }
  function drawDimTag(p1, p2, col) {
    var s1 = P(p1.x, p1.y, 0), s2 = P(p2.x, p2.y, 0);
    if (Math.hypot(s2[0] - s1[0], s2[1] - s1[1]) < 24) return;
    var mx = (s1[0] + s2[0]) / 2, my = (s1[1] + s2[1]) / 2, txt = Math.hypot(p2.x - p1.x, p2.y - p1.y).toFixed(2) + ' m';
    ctx.font = 'bold 10px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var tw = ctx.measureText(txt).width + 8;
    ctx.fillStyle = isPr() ? 'rgba(255,255,255,0.92)' : 'rgba(8,11,16,0.9)';
    ctx.fillRect(mx - tw / 2, my - 7, tw, 14);
    ctx.strokeStyle = col || '#00d9ff'; ctx.lineWidth = 0.8; ctx.strokeRect(mx - tw / 2, my - 7, tw, 14);
    ctx.fillStyle = isPr() ? '#0f172a' : (col || '#00d9ff'); ctx.fillText(txt, mx, my + .5);
  }
  function drawCadOverlays() {
    var pr = isPr(), sf = getSel();
    if (sf && sf.geometryType === 'polygon' && sf.coordsMetric.length >= 3) {
      var a = pts(sf);
      if (layers.dims || tool === 'vertices') for (var i = 0; i < a.length; i++) drawDimTag(a[i], a[(i + 1) % a.length], tool === 'vertices' ? '#39ff14' : (pr ? '#0284c7' : '#00d9ff'));
      if (tool === 'vertices') {
        ctx.strokeStyle = '#39ff14'; ctx.lineWidth = 2; ctx.setLineDash([]); path(a.map(g0), 1); ctx.stroke();
        for (var j = 0; j < a.length; j++) {
          var p1 = a[j], p2 = a[(j + 1) % a.length], mp = P((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, 0);
          ctx.beginPath(); ctx.arc(mp[0], mp[1], 5.5, 0, 6.3);
          ctx.fillStyle = '#080b10'; ctx.fill(); ctx.strokeStyle = '#e8c84a'; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.fillStyle = '#e8c84a'; ctx.font = 'bold 10px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+', mp[0], mp[1] + .5);
        }
        for (var k = 0; k < a.length; k++) {
          var vp = P(a[k].x, a[k].y, 0);
          ctx.fillStyle = (drag && drag.m === 'vert' && drag.i === k) ? '#39ff14' : '#080b10';
          ctx.strokeStyle = '#00d9ff'; ctx.lineWidth = 2;
          ctx.fillRect(vp[0] - 5, vp[1] - 5, 10, 10); ctx.strokeRect(vp[0] - 5, vp[1] - 5, 10, 10);
        }
        var cm = P(sf.center.x, sf.center.y, 0), stTxt = 'AREA ' + area(a).toFixed(1) + ' m2 | PERIM ' + perim(a).toFixed(1) + ' m | ' + a.length + ' PTS';
        ctx.font = 'bold 10px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        var sw = ctx.measureText(stTxt).width + 12;
        ctx.fillStyle = 'rgba(8,11,16,.9)'; ctx.fillRect(cm[0] - sw / 2, cm[1] - 9, sw, 18);
        ctx.strokeStyle = '#39ff14'; ctx.lineWidth = 1; ctx.strokeRect(cm[0] - sw / 2, cm[1] - 9, sw, 18);
        ctx.fillStyle = '#39ff14'; ctx.fillText(stTxt, cm[0], cm[1] + .5);
      }
    }
    if ((tool === 'draw_poly' || tool === 'draw_rect') && cad.drawPts.length) {
      var cur = snapPoint(mouse, cad.drawPts[cad.drawPts.length - 1]);
      if (tool === 'draw_rect') {
        var rInfo = makeOrientedRect(cad.drawPts[0], cur);
        ctx.save(); fillPoly(rInfo.pts.map(g0), 'rgba(57,255,20,0.16)', '#39ff14'); ctx.lineWidth = 2; path(rInfo.pts.map(g0), 1); ctx.stroke();
        var rc = P((cad.drawPts[0].x + cur.x) / 2, (cad.drawPts[0].y + cur.y) / 2, 0);
        var rt = rInfo.w.toFixed(2) + ' m x ' + rInfo.d.toFixed(2) + ' m (' + (rInfo.w * rInfo.d).toFixed(1) + ' m2)';
        ctx.font = 'bold 11px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        var rtw = ctx.measureText(rt).width + 12;
        ctx.fillStyle = 'rgba(8,11,16,.92)'; ctx.fillRect(rc[0] - rtw / 2, rc[1] - 9, rtw, 18);
        ctx.strokeStyle = '#39ff14'; ctx.strokeRect(rc[0] - rtw / 2, rc[1] - 9, rtw, 18);
        ctx.fillStyle = '#39ff14'; ctx.fillText(rt, rc[0], rc[1] + .5); ctx.restore();
      } else {
        var dp = cad.drawPts.concat([cur]);
        ctx.save();
        if (dp.length >= 3) { ctx.globalAlpha = 0.14; fillPoly(dp.map(g0), '#39ff14'); ctx.globalAlpha = 1; }
        ctx.strokeStyle = '#39ff14'; ctx.lineWidth = 2; path(cad.drawPts.map(g0), 0); ctx.stroke();
        ctx.strokeStyle = '#e8c84a'; ctx.setLineDash([6, 4]); line(P(cad.drawPts[cad.drawPts.length - 1].x, cad.drawPts[cad.drawPts.length - 1].y, 0), P(cur.x, cur.y, 0)); ctx.setLineDash([]);
        for (var m = 0; m < cad.drawPts.length - 1; m++) drawDimTag(cad.drawPts[m], cad.drawPts[m + 1], '#39ff14');
        var last = cad.drawPts[cad.drawPts.length - 1], segL = Math.hypot(cur.x - last.x, cur.y - last.y);
        var segAng = ((Math.atan2(cur.y - last.y, cur.x - last.x) / D) + 360) % 360;
        var spM = P((last.x + cur.x) / 2, (last.y + cur.y) / 2, 0), dTxt = segL.toFixed(2) + ' m @ ' + segAng.toFixed(1) + '°';
        ctx.font = 'bold 11px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        var dw = ctx.measureText(dTxt).width + 10;
        ctx.fillStyle = 'rgba(8,11,16,.92)'; ctx.fillRect(spM[0] - dw / 2, spM[1] - 9, dw, 18);
        ctx.strokeStyle = '#e8c84a'; ctx.strokeRect(spM[0] - dw / 2, spM[1] - 9, dw, 18);
        ctx.fillStyle = '#e8c84a'; ctx.fillText(dTxt, spM[0], spM[1] + .5);
        var p0 = P(cad.drawPts[0].x, cad.drawPts[0].y, 0);
        ctx.beginPath(); ctx.arc(p0[0], p0[1], cad.drawPts.length >= 3 ? 7 : 4, 0, 6.3);
        ctx.strokeStyle = '#39ff14'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
      }
    }
    if (cad.snapHit && (tool === 'draw_poly' || tool === 'draw_rect' || tool === 'vertices' || tool === 'measure')) {
      var sh = P(cad.snapHit.x, cad.snapHit.y, 0);
      ctx.save(); ctx.strokeStyle = cad.snapHit.k === 'MID' ? '#e8c84a' : '#39ff14'; ctx.lineWidth = 2;
      if (cad.snapHit.k === 'MID') { ctx.beginPath(); ctx.moveTo(sh[0], sh[1] - 7); ctx.lineTo(sh[0] + 7, sh[1] + 6); ctx.lineTo(sh[0] - 7, sh[1] + 6); ctx.closePath(); ctx.stroke(); }
      else ctx.strokeRect(sh[0] - 6, sh[1] - 6, 12, 12);
      ctx.font = 'bold 9px ' + MONO; ctx.fillStyle = ctx.strokeStyle; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(cad.snapHit.k, sh[0] + 8, sh[1] - 6); ctx.restore();
    }
    var hint = '';
    if (tool === 'vertices') hint = 'CAD VERTICES: Drag square=Move | Click (+)=Add corner | Alt+Click or DblClick=Delete | F8 Ortho | Esc Exit';
    else if (tool === 'draw_poly') hint = 'CAD POLYLINE (' + addType + '): Click pts | Type length (m)' + (cad.cmdBuf ? (' [' + cad.cmdBuf + ' m]') : '') + ' + Enter | Backspace Undo | Enter Close | Esc Cancel';
    else if (tool === 'draw_rect') hint = 'CAD RECTANGLE (' + addType + '): Click Corner 1 then Corner 2 (auto-aligned to view) | Esc Cancel';
    if (hint) {
      ctx.font = 'bold 10px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var hw = Math.min(W - 24, ctx.measureText(hint).width + 18);
      ctx.fillStyle = 'rgba(8,11,16,0.92)'; ctx.fillRect(W / 2 - hw / 2, H - 36, hw, 22);
      ctx.strokeStyle = cad.cmdBuf ? '#e8c84a' : '#39ff14'; ctx.lineWidth = 1.2; ctx.strokeRect(W / 2 - hw / 2, H - 36, hw, 22);
      ctx.fillStyle = cad.cmdBuf ? '#e8c84a' : '#39ff14'; ctx.fillText(hint, W / 2, H - 25);
    }
    ctx.textBaseline = 'alphabetic';
  }
  // Grid, Overlays, Render Loop, Pointer Events & Public API
  function grid() {
    var pr = isPr(), s = sc(), st = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].filter(function (v) { return v * s >= 36; })[0] || 1000;
    var cs = [inv(0, 0), inv(W, 0), inv(0, H), inv(W, H)], b = bb(cs);
    while ((b.x1 - b.x0) / st > 120 || (b.y1 - b.y0) / st > 120) st *= 2;
    var x, y; ctx.lineWidth = 1;
    for (x = Math.floor(b.x0 / st) * st; x <= b.x1; x += st) {
      ctx.strokeStyle = pr ? (x === 0 ? 'rgba(100,85,65,.24)' : 'rgba(100,85,65,.1)') : (x === 0 ? 'rgba(57,255,20,.35)' : 'rgba(57,255,20,.1)');
      line(P(x, b.y0, 0), P(x, b.y1, 0));
    }
    for (y = Math.floor(b.y0 / st) * st; y <= b.y1; y += st) {
      ctx.strokeStyle = pr ? (y === 0 ? 'rgba(100,85,65,.24)' : 'rgba(100,85,65,.1)') : (y === 0 ? 'rgba(57,255,20,.35)' : 'rgba(57,255,20,.1)');
      line(P(b.x0, y, 0), P(b.x1, y, 0));
    }
  }
  function fmt(s) { var m = Math.floor(s / 60), x = Math.round(s % 60); return m + 'm ' + (x < 10 ? '0' : '') + x + 's'; }
  function minfo() {
    if (meas.length < 2) return null;
    var dx = meas[1].x - meas[0].x, dy = meas[1].y - meas[0].y, d = Math.hypot(dx, dy);
    return { d: d, dx: dx, dy: dy, ang: ((Math.atan2(dy, dx) / D) + 360) % 360, t12: d / 1.2, t08: d / .8 };
  }
  function overlays() {
    var pr = isPr(), s = sc(), t = cam.pitch * D, a = cam.yaw * D;
    if (meas.length) {
      ctx.strokeStyle = pr ? '#b45309' : '#e8c84a'; ctx.fillStyle = pr ? '#b45309' : '#e8c84a'; ctx.lineWidth = 2;
      var m = meas.map(function (p) { return P(p.x, p.y, 0); });
      if (m.length > 1) { ctx.setLineDash([6, 4]); path(m); ctx.stroke(); ctx.setLineDash([]); }
      m.forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, 6.3); ctx.fill(); });
      var mi = minfo();
      if (mi) {
        var tx = (m[0][0] + m[1][0]) / 2, ty = (m[0][1] + m[1][1]) / 2;
        var txt = mi.d.toFixed(2) + ' m | ' + mi.ang.toFixed(1) + '° | dX ' + mi.dx.toFixed(1) + ' dY ' + mi.dy.toFixed(1) + ' | ' + fmt(mi.t12) + ' @1.2';
        ctx.font = 'bold 11px ' + MONO; ctx.textAlign = 'center'; var tw = ctx.measureText(txt).width + 10;
        ctx.fillStyle = pr ? 'rgba(255,255,255,.94)' : 'rgba(8,11,16,.88)'; ctx.fillRect(tx - tw / 2, ty - 18, tw, 16);
        ctx.fillStyle = pr ? '#92400e' : '#e8c84a'; ctx.fillText(txt, tx, ty - 6);
      }
    }
    var cx = W - 44, cy = 44;
    ctx.lineWidth = 1.2; ctx.strokeStyle = pr ? '#475569' : '#1b2838'; ctx.fillStyle = pr ? 'rgba(255,255,255,.92)' : 'rgba(14,20,29,.85)';
    ctx.beginPath(); ctx.arc(cx, cy, 30, 0, 6.3); ctx.fill(); ctx.stroke();
    [[0, 1, 'N'], [1, 0, 'E'], [0, -1, 'S'], [-1, 0, 'W']].forEach(function (d) {
      var rx = d[0] * Math.cos(a) - d[1] * Math.sin(a), ry = d[0] * Math.sin(a) + d[1] * Math.cos(a), ex = cx + rx * 20, ey = cy - ry * 20 * Math.cos(t), n = d[2] === 'N';
      ctx.strokeStyle = n ? '#dc2626' : (pr ? '#334155' : '#00d9ff'); ctx.lineWidth = n ? 2.5 : 1; line([cx, cy], [ex, ey]);
      ctx.fillStyle = n ? '#dc2626' : (pr ? '#1e293b' : '#00d9ff'); ctx.font = 'bold 10px ' + MONO; ctx.textAlign = 'center'; ctx.fillText(d[2], cx + rx * 27, cy - ry * 27 * Math.cos(t) + 3);
    });
    var nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000].filter(function (v) { return v * s >= 60; })[0] || 2000, px = nice * s;
    ctx.strokeStyle = pr ? '#1e293b' : '#39ff14'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(14, H - 16); ctx.lineTo(14 + px, H - 16); ctx.moveTo(14, H - 21); ctx.lineTo(14, H - 11); ctx.moveTo(14 + px, H - 21); ctx.lineTo(14 + px, H - 11); ctx.stroke();
    ctx.fillStyle = pr ? '#1e293b' : '#39ff14'; ctx.font = 'bold 11px ' + MONO; ctx.textAlign = 'left'; ctx.fillText(nice + ' m', 18, H - 24);
  }
  function render() {
    var pr = isPr();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = pr ? '#f6f1e7' : '#080b10'; ctx.fillRect(0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    if (layers.grid) grid();
    if (pr) {
      St.project.features.forEach(function (f) {
        if (f.category === 'fence' && f.geometryType === 'polygon' && f.visible !== false) fillPoly(pts(f).map(g0), '#f1dbb0');
      });
    }
    hits = []; labels = [];
    var list = St.project.features.filter(vis).map(function (f) {
      return { f: f, t: f.geometryType === 'point' ? 3 : (TIER[f.category] === undefined ? 2 : TIER[f.category]), d: P(f.center.x, f.center.y, 0)[2] };
    });
    list.sort(function (a, b) { return a.t - b.t || b.d - a.d; });
    list.forEach(function (o) { drawFeature(o.f); });
    if (layers.routes && S.Routing && S.Routing.drawOn3D) {
      ctx.save();
      if (pr) { ctx.shadowColor = 'rgba(15,23,42,0.75)'; ctx.shadowBlur = 3; }
      S.Routing.drawOn3D(ctx, P, sc);
      ctx.restore();
    }
    hits.forEach(function (h) {
      if (h.f.id !== sel || tool === 'vertices') return;
      ctx.strokeStyle = pr ? '#0284c7' : '#00d9ff'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 3]);
      if (h.c) { ctx.beginPath(); ctx.arc(h.c[0], h.c[1], 14, 0, 6.3); ctx.stroke(); }
      else { path(h.a.map(function (p) { return [p.x, p.y]; }), 1); ctx.stroke(); if (cam.pitch >= 2) { path(h.b.map(function (p) { return [p.x, p.y]; }), 1); ctx.stroke(); } }
      ctx.setLineDash([]);
    });
    drawLabels(); drawCadOverlays(); overlays();
    St.emit('status', { x: mouse.x, y: mouse.y, zoom: cam.zoom, count: St.project.features.length, meta: St.project.meta, ortho: cad.ortho, osnap: cad.osnap, snap: cad.gridSnap });
  }
  function loop() {
    var hz = !isPr() && St.project.features.some(function (f) { return (f.hazard_flag === true || f.hazard_flag === 'high_fire' || f.category === 'hazard') && vis(f); });
    var rt = layers.routes && S.Routing && S.Routing.hasActiveAnim && S.Routing.hasActiveAnim();
    if (dirty || hz || rt) { dirty = 0; render(); }
    requestAnimationFrame(loop);
  }
  function resize() {
    var r = cv.parentNode.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = hq ? Math.min(window.devicePixelRatio || 1, 3) : 1;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); dirty = 1;
  }
  function viewEvt() { St.emit('view', { yaw: cam.yaw, pitch: cam.pitch, persp: cam.persp, zBoost: cam.zBoost, north: Math.abs(cam.yaw % 360) < .5, top2D: cam.pitch < 2 }); dirty = 1; }
  function select(id) { sel = id; dirty = 1; St.emit('select', getSel()); }
  function hitAt(x, y) {
    for (var i = hits.length - 1; i >= 0; i--) {
      var h = hits[i];
      if (h.c) { if (Math.hypot(x - h.c[0], y - h.c[1]) < 16) return h; continue; }
      if (h.edge) { for (var j = 0; j < h.a.length; j++) if (dSeg(x, y, h.a[j], h.a[(j + 1) % h.a.length]) < 8) return h; continue; }
      if (inP(x, y, h.a) || inP(x, y, h.b)) return h;
    }
    return null;
  }
  function createPolygonFeature(polyPts) {
    if (!polyPts || polyPts.length < 3) return;
    var t = DEF[addType] ? addType : 'building', d = DEF[t];
    St.snapshot();
    var c = cen(polyPts);
    var f = St.newFeature({
      category: t, shapeType: 'extrude', geometryType: 'polygon',
      coordsMetric: polyPts.map(function (p) { return { x: +p.x.toFixed(3), y: +p.y.toFixed(3) }; }),
      center: c, height_m: d.h, floors: d.fl, roofType: d.roof, color: d.col,
      en_name: t.replace('_', ' '), renderMode: (t === 'tent' || t === 'cottage') ? 'solid' : undefined
    });
    St.project.features.push(f); if (t === 'fence') recalcMeta();
    select(f.id); St.emit('change');
  }
  function addAt(x, y) {
    var t = addType, d = DEF[t], f; St.snapshot();
    if (d) {
      var w = d.w / 2, e = d.d / 2;
      f = St.newFeature({ category: t, shapeType: 'extrude', geometryType: 'polygon', coordsMetric: [{ x: x - w, y: y - e }, { x: x + w, y: y - e }, { x: x + w, y: y + e }, { x: x - w, y: y + e }],
        center: { x: x, y: y }, height_m: d.h, floors: d.fl, roofType: d.roof, color: d.col, en_name: t.replace('_', ' '), renderMode: (t === 'tent' || t === 'cottage') ? 'solid' : undefined });
    } else {
      f = St.newFeature({ category: t, shapeType: 'marker', geometryType: 'point', coordsMetric: [{ x: x, y: y }], center: { x: x, y: y },
        height_m: t === 'tree' ? 4 : t === 'vehicle' ? 3 : 1, color: PCOL[t] || '#39ff14', en_name: t });
    }
    St.project.features.push(f); select(f.id); St.emit('change');
  }
  function pos(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function two() { var k = Object.keys(ptrs), a = ptrs[k[0]], b = ptrs[k[1]]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, a: Math.atan2(b.y - a.y, b.x - a.x) }; }

  function bind() {
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    cv.addEventListener('pointerdown', function (e) {
      cv.setPointerCapture(e.pointerId); var p = pos(e); ptrs[e.pointerId] = p;
      if (Object.keys(ptrs).length === 2) { var t = two(); drag = { m: 'pinch', d: t.d, a: t.a, z: cam.zoom, y: cam.yaw }; return; }
      var w = inv(p.x, p.y);
      if (e.button === 2 || e.shiftKey) { drag = { m: 'orbit', x: p.x, y: p.y }; return; }
      if (e.button === 1) { drag = { m: 'pan', x: p.x, y: p.y, cx: cam.cx, cy: cam.cy }; return; }
      if (tool === 'vertices') {
        var sf = getSel();
        if (sf && sf.geometryType === 'polygon' && sf.coordsMetric.length >= 3) {
          bake(sf);
          var a = sf.coordsMetric, now = Date.now();
          for (var i = 0; i < a.length; i++) {
            var vp = P(a[i].x, a[i].y, 0);
            if (Math.hypot(p.x - vp[0], p.y - vp[1]) <= 11) {
              var isDbl = (now - cad.lastVClick.t < 350 && cad.lastVClick.i === i);
              cad.lastVClick = { t: now, i: i };
              if (e.altKey || isDbl) {
                if (a.length > 3) { St.snapshot(); a.splice(i, 1); sf.center = cen(a); if (sf.category === 'fence') recalcMeta(); St.emit('change'); St.emit('select', sf); dirty = 1; }
                return;
              }
              drag = { m: 'vert', f: sf, i: i, moved: false }; return;
            }
          }
          for (var j = 0; j < a.length; j++) {
            var p1 = a[j], p2 = a[(j + 1) % a.length], mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2, mp = P(mx, my, 0);
            if (Math.hypot(p.x - mp[0], p.y - mp[1]) <= 10) {
              St.snapshot(); a.splice(j + 1, 0, { x: mx, y: my }); sf.center = cen(a);
              if (sf.category === 'fence') recalcMeta();
              drag = { m: 'vert', f: sf, i: j + 1, moved: true }; St.emit('change'); St.emit('select', sf); dirty = 1; return;
            }
          }
        }
        var hv = hitAt(p.x, p.y);
        if (hv && hv.f.geometryType === 'polygon') { select(hv.f.id); return; }
        drag = { m: 'pan', x: p.x, y: p.y, cx: cam.cx, cy: cam.cy }; return;
      }
      if (tool === 'draw_poly') {
        var anchor = cad.drawPts.length ? cad.drawPts[cad.drawPts.length - 1] : null, sp = snapPoint(w, anchor), now2 = Date.now();
        if (cad.drawPts.length >= 3) {
          var p0 = P(cad.drawPts[0].x, cad.drawPts[0].y, 0);
          var dblClose = (now2 - cad.lastDClick.t < 320 && Math.hypot(p.x - cad.lastDClick.x, p.y - cad.lastDClick.y) < 10);
          if (Math.hypot(p.x - p0[0], p.y - p0[1]) <= 14 || dblClose) { createPolygonFeature(cad.drawPts); cad.drawPts = []; cad.cmdBuf = ''; dirty = 1; return; }
        }
        cad.lastDClick = { t: now2, x: p.x, y: p.y }; cad.drawPts.push(sp); cad.cmdBuf = ''; dirty = 1; return;
      }
      if (tool === 'draw_rect') {
        var sr = snapPoint(w, null);
        if (!cad.drawPts.length) { cad.drawPts = [sr]; dirty = 1; return; }
        var rInfo = makeOrientedRect(cad.drawPts[0], sr);
        if (rInfo.w > 0.2 && rInfo.d > 0.2) createPolygonFeature(rInfo.pts);
        cad.drawPts = []; dirty = 1; return;
      }
      if (tool === 'add') { addAt(w.x, w.y); return; }
      if (tool === 'measure') {
        var sm = snapPoint(w, meas.length === 1 ? meas[0] : null);
        if (meas.length >= 2) meas = [];
        meas.push(sm); St.emit('measure', minfo()); dirty = 1; return;
      }
      if (tool === 'select') {
        var h = hitAt(p.x, p.y);
        if (h) { select(h.f.id); drag = { m: 'move', x: w.x, y: w.y, moved: false }; return; }
        select(null);
      }
      drag = { m: 'pan', x: p.x, y: p.y, cx: cam.cx, cy: cam.cy };
    });
    cv.addEventListener('pointermove', function (e) {
      var p = pos(e), w; if (ptrs[e.pointerId]) ptrs[e.pointerId] = p;
      w = inv(p.x, p.y); mouse = { x: w.x, y: w.y };
      if (!drag && (tool === 'draw_poly' || tool === 'draw_rect' || tool === 'measure')) {
        var anc = tool === 'draw_poly' && cad.drawPts.length ? cad.drawPts[cad.drawPts.length - 1] : (tool === 'measure' && meas.length === 1 ? meas[0] : null);
        snapPoint(w, anc);
      }
      dirty = 1;
      if (!drag) return;
      if (drag.m === 'pan') { cam.cx = drag.cx; cam.cy = drag.cy; var a = inv(drag.x, drag.y), b = inv(p.x, p.y); cam.cx = drag.cx + a.x - b.x; cam.cy = drag.cy + a.y - b.y; }
      else if (drag.m === 'vert') {
        if (!drag.moved) { St.snapshot(); drag.moved = true; }
        var vf = drag.f, prevIdx = (drag.i - 1 + vf.coordsMetric.length) % vf.coordsMetric.length;
        var spv = snapPoint(w, vf.coordsMetric[prevIdx], vf, drag.i);
        vf.coordsMetric[drag.i].x = +spv.x.toFixed(3); vf.coordsMetric[drag.i].y = +spv.y.toFixed(3);
        vf.center = cen(vf.coordsMetric); if (vf.category === 'fence') recalcMeta();
      } else if (drag.m === 'move') {
        if (!drag.moved) { St.snapshot(); drag.moved = true; }
        var f = getSel(); if (f) { var dx = w.x - drag.x, dy = w.y - drag.y; f.center.x += dx; f.center.y += dy; f.coordsMetric.forEach(function (q) { q.x += dx; q.y += dy; }); }
        drag.x = w.x; drag.y = w.y;
      } else if (drag.m === 'orbit') {
        cam.yaw = (((cam.yaw + (p.x - drag.x) * .5) % 360) + 360) % 360; cam.pitch = cl(cam.pitch + (p.y - drag.y) * .3, 0, 78); drag.x = p.x; drag.y = p.y; viewEvt();
      } else if (drag.m === 'pinch' && Object.keys(ptrs).length >= 2) {
        var t = two(); cam.zoom = cl(drag.z * t.d / drag.d, .25, 8); cam.yaw = (((drag.y - (t.a - drag.a) / D) % 360) + 360) % 360; viewEvt();
      }
    });
    function up(e) {
      delete ptrs[e.pointerId];
      if (!Object.keys(ptrs).length || (drag && drag.m === 'pinch')) {
        if (drag && (drag.m === 'move' || drag.m === 'vert') && drag.moved) { St.emit('change'); St.emit('select', getSel()); }
        drag = null;
      }
    }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', function (e) { e.preventDefault(); cam.zoom = cl(cam.zoom * (e.deltaY < 0 ? 1.1 : .9), .25, 8); dirty = 1; }, { passive: false });
  }

  S.Engine = {
    init: function (canvas) {
      cv = canvas; ctx = cv.getContext('2d'); bind(); resize();
      if (window.ResizeObserver) new ResizeObserver(resize).observe(cv.parentNode); else window.addEventListener('resize', resize);
      St.on('change', function () { if (sel && !getSel()) select(null); dirty = 1; });
      this.fitView(); loop();
    },
    setTool: function (t) {
      tool = t; cad.drawPts = []; cad.cmdBuf = ''; cad.snapHit = null;
      if (t !== 'measure') { meas = []; St.emit('measure', null); }
      cv.style.cursor = t === 'pan' ? 'grab' : (t === 'select' || t === 'vertices') ? 'default' : 'crosshair';
      dirty = 1;
    },
    getTool: function () { return tool; },
    setAddType: function (t) { addType = t; },
    setYaw: function (v) { cam.yaw = ((+v % 360) + 360) % 360; viewEvt(); },
    setPitch: function (v) { cam.pitch = cl(+v, 0, 78); if (cam.pitch >= 2) cam.lastPitch = cam.pitch; viewEvt(); },
    setPersp: function (v) { cam.persp = cl(+v, 0, 1); viewEvt(); },
    getPersp: function () { return cam.persp; },
    setZBoost: function (v) { cam.zBoost = cl(+v, 1, 2.5); viewEvt(); },
    getZBoost: function () { return cam.zBoost; },
    getCam: function () { return Object.assign({}, cam); },
    nudgeYaw: function (d) { this.setYaw(cam.yaw + d); },
    nudgePan: function (dxPx, dyPx) { var a = inv(W / 2, H / 2), b = inv(W / 2 + dxPx, H / 2 + dyPx); cam.cx += b.x - a.x; cam.cy += b.y - a.y; dirty = 1; },
    isTop2D: function () { return cam.pitch < 2; },
    toggleTop2D: function () { if (cam.pitch < 2) cam.pitch = cam.lastPitch >= 15 ? cam.lastPitch : 48; else { cam.lastPitch = cam.pitch; cam.pitch = 0; } viewEvt(); return cam.pitch < 2; },
    setOrtho: function (b) { cad.ortho = !!b; dirty = 1; },
    isOrtho: function () { return cad.ortho; },
    setOsnap: function (b) { cad.osnap = !!b; cad.snapHit = null; dirty = 1; },
    isOsnap: function () { return cad.osnap; },
    setSnapGrid: function (m) { cad.gridSnap = Math.max(0, +m || 0); dirty = 1; },
    getSnapGrid: function () { return cad.gridSnap; },
    setQuality: function (h) { hq = !!h; resize(); },
    isHQ: function () { return hq; },
    getTheme: function () { return theme; },
    setTheme: function (t) { theme = t === 'print' ? 'print' : 'cyber'; dirty = 1; return theme; },
    toggleTheme: function () { return this.setTheme(theme === 'print' ? 'cyber' : 'print'); },
    setLayer: function (k, v) { layers[k] = v ? 1 : 0; dirty = 1; },
    toggleNorthUp: function () { var off = St.project.meta.trueNorthOffsetDeg || 0; cam.yaw = Math.abs(cam.yaw % 360) < .5 ? ((off % 360) + 360) % 360 : 0; viewEvt(); return Math.abs(cam.yaw) < .5; },
    fitView: function () {
      var fs = St.project.features;
      if (!fs.length) { cam.cx = 0; cam.cy = 0; cam.base = 3; cam.zoom = 1; viewEvt(); return; }
      var all = []; fs.forEach(function (f) { all = all.concat(f.coordsMetric); });
      var b = bb(all), w = Math.max(20, b.x1 - b.x0), d = Math.max(20, b.y1 - b.y0);
      cam.cx = (b.x0 + b.x1) / 2; cam.cy = (b.y0 + b.y1) / 2; cam.base = .85 * Math.min(W / w, H / d); cam.zoom = 1; viewEvt();
    },
    select: select, getSelected: getSel,
    deleteSelected: function () { var f = getSel(); if (!f) return; St.project.features = St.project.features.filter(function (x) { return x !== f; }); sel = null; St.emit('select', null); St.emit('change'); },
    duplicateSelected: function () {
      var f = getSel(); if (!f) return;
      St.snapshot(); var copy = JSON.parse(JSON.stringify(f));
      copy.id = 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      copy.en_name = (copy.en_name || copy.category) + ' (copy)';
      copy.center.x += 2; copy.center.y -= 2; copy.coordsMetric.forEach(function (p) { p.x += 2; p.y -= 2; });
      St.project.features.push(copy); select(copy.id); St.emit('change');
    },
    sizeOf: function (f) { var b = bb(pts(f)); return { w: b.x1 - b.x0, d: b.y1 - b.y0 }; },
    statsOf: function (f) { if (!f || f.geometryType !== 'polygon' || f.coordsMetric.length < 3) return null; var a = pts(f), b = bb(a); return { area: area(a), perim: perim(a), verts: a.length, w: b.x1 - b.x0, d: b.y1 - b.y0 }; },
    resizeSelected: function (w, d) {
      var f = getSel(); if (!f || f.geometryType !== 'polygon' || !(w > 0) || !(d > 0)) return;
      bake(f); var s = this.sizeOf(f), kx = s.w ? w / s.w : 1, ky = s.d ? d / s.d : 1, c = f.center;
      f.coordsMetric = f.coordsMetric.map(function (p) { return { x: c.x + (p.x - c.x) * kx, y: c.y + (p.y - c.y) * ky }; });
      if (f.category === 'fence') recalcMeta(); dirty = 1;
    },
    squareSelected: function () {
      var f = getSel(); if (!f || f.geometryType !== 'polygon' || f.coordsMetric.length < 3) return;
      St.snapshot(); bake(f);
      var a = f.coordsMetric, th = domAng(a), cs = Math.cos(th), sn = Math.sin(th), m = cen(a);
      var loc = a.map(function (p) { var dx = p.x - m.x, dy = p.y - m.y; return { x: dx * cs + dy * sn, y: -dx * sn + dy * cs }; });
      var b = bb(loc), oldA = area(a), newA = (b.x1 - b.x0) * (b.y1 - b.y0), k = (newA > 1e-4 && oldA > 1e-4) ? Math.sqrt(oldA / newA) : 1;
      var mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2, hw = (b.x1 - b.x0) * 0.5 * k, hh = (b.y1 - b.y0) * 0.5 * k;
      var rect = [[mx - hw, my - hh], [mx + hw, my - hh], [mx + hw, my + hh], [mx - hw, my + hh]];
      f.coordsMetric = rect.map(function (q) { return { x: +(m.x + q[0] * cs - q[1] * sn).toFixed(3), y: +(m.y + q[0] * sn + q[1] * cs).toFixed(3) }; });
      f.center = cen(f.coordsMetric); if (f.category === 'fence') recalcMeta(); St.emit('change'); St.emit('select', f); dirty = 1;
    },
    simplifySelected: function (tol) {
      var f = getSel(); if (!f || f.geometryType !== 'polygon' || f.coordsMetric.length <= 3) return;
      St.snapshot(); bake(f); var t = tol || 0.6, res = simplifyClosed(f.coordsMetric, t);
      if (res.length === f.coordsMetric.length && f.coordsMetric.length > 4) res = simplifyClosed(f.coordsMetric, t * 2);
      f.coordsMetric = res; f.center = cen(res); if (f.category === 'fence') recalcMeta(); St.emit('change'); St.emit('select', f); dirty = 1;
    },
    offsetSelected: function (distM) {
      var f = getSel(), d = parseFloat(distM); if (!f || f.geometryType !== 'polygon' || f.coordsMetric.length < 3 || !d) return;
      St.snapshot(); bake(f); f.coordsMetric = offsetPoly(f.coordsMetric, d); f.center = cen(f.coordsMetric);
      if (f.category === 'fence') recalcMeta(); St.emit('change'); St.emit('select', f); dirty = 1;
    },
    mirrorSelected: function (axis) {
      var f = getSel(); if (!f || f.geometryType !== 'polygon' || f.coordsMetric.length < 3) return;
      St.snapshot(); bake(f); var a = cam.yaw * D, c = Math.cos(a), n = Math.sin(a), m = f.center;
      f.coordsMetric = f.coordsMetric.map(function (p) {
        var dx = p.x - m.x, dy = p.y - m.y, rx = dx * c - dy * n, ry = dx * n + dy * c;
        if (axis === 'h') rx = -rx; else ry = -ry;
        return { x: m.x + rx * c + ry * n, y: m.y - rx * n + ry * c };
      }).reverse();
      f.center = cen(f.coordsMetric); St.emit('change'); St.emit('select', f); dirty = 1;
    },
    alignSelectedToSite: function () {
      var f = getSel(); if (!f || f.geometryType !== 'polygon' || f.coordsMetric.length < 3) return;
      St.snapshot(); bake(f); var siteAng = -(St.project.meta.trueNorthOffsetDeg || 0) * D, diff = siteAng - domAng(f.coordsMetric);
      while (diff > Math.PI / 4) diff -= Math.PI / 2; while (diff < -Math.PI / 4) diff += Math.PI / 2;
      var c = Math.cos(diff), n = Math.sin(diff), m = f.center;
      f.coordsMetric = f.coordsMetric.map(function (p) { var dx = p.x - m.x, dy = p.y - m.y; return { x: m.x + dx * c - dy * n, y: m.y + dx * n + dy * c }; });
      f.center = cen(f.coordsMetric); St.emit('change'); St.emit('select', f); dirty = 1;
    },
    offsetFenceOnly: function (distM) {
      var d = parseFloat(distM); if (!d) return false;
      var fence = St.project.features.filter(function (f) { return f.category === 'fence' && f.geometryType === 'polygon' && f.coordsMetric.length >= 3; })[0];
      if (!fence) return false;
      St.snapshot(); bake(fence); fence.coordsMetric = offsetPoly(fence.coordsMetric, d); fence.center = cen(fence.coordsMetric);
      recalcMeta(); St.emit('change'); if (sel === fence.id) St.emit('select', fence); dirty = 1; return true;
    },
    scaleFenceOnly: function (pct) {
      var k = parseFloat(pct) / 100; if (!(k > 0.1 && k < 10)) return false;
      var fence = St.project.features.filter(function (f) { return f.category === 'fence' && f.geometryType === 'polygon' && f.coordsMetric.length >= 3; })[0];
      if (!fence) return false;
      St.snapshot(); bake(fence); var c = fence.center;
      fence.coordsMetric = fence.coordsMetric.map(function (p) { return { x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k }; });
      recalcMeta(); St.emit('change'); if (sel === fence.id) St.emit('select', fence); dirty = 1; return true;
    },
    scaleEntireSite: function (pct) {
      var k = parseFloat(pct) / 100; if (!(k > 0.1 && k < 10)) return false;
      var fs = St.project.features; if (!fs.length) return false;
      St.snapshot(); var all = []; fs.forEach(function (f) { all = all.concat(f.coordsMetric); });
      var b = bb(all), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      fs.forEach(function (f) {
        if (f.geometryType === 'polygon') bake(f);
        f.coordsMetric.forEach(function (p) { p.x = cx + (p.x - cx) * k; p.y = cy + (p.y - cy) * k; });
        f.center.x = cx + (f.center.x - cx) * k; f.center.y = cy + (f.center.y - cy) * k;
      });
      ['fire', 'shelling'].forEach(function (rk) {
        var g = St.project.routes && St.project.routes[rk];
        if (g && g.nodes) g.nodes.forEach(function (n) { n.x = +(cx + (n.x - cx) * k).toFixed(2); n.y = +(cy + (n.y - cy) * k).toFixed(2); });
      });
      (St.project.signagePins || []).forEach(function (pin) {
        if (pin.scope !== 'interior') { pin.x = +(cx + (pin.x - cx) * k).toFixed(2); pin.y = +(cy + (pin.y - cy) * k).toFixed(2); }
      });
      recalcMeta(); St.emit('change'); St.emit('select', getSel()); this.fitView(); return true;
    },
    finishDraw: function () { if (tool === 'draw_poly' && cad.drawPts.length >= 3) { createPolygonFeature(cad.drawPts); cad.drawPts = []; cad.cmdBuf = ''; dirty = 1; return true; } return false; },
    cancelDraw: function () { cad.drawPts = []; cad.cmdBuf = ''; cad.snapHit = null; dirty = 1; },
    undoDrawPoint: function () { if (cad.drawPts.length) { cad.drawPts.pop(); cad.cmdBuf = ''; dirty = 1; return true; } return false; },
    handleCadKey: function (e) {
      if (tool !== 'draw_poly' || !cad.drawPts.length) return false;
      if (/^[0-9.]$/.test(e.key)) { cad.cmdBuf += e.key; dirty = 1; return true; }
      if (e.key === 'Backspace') { e.preventDefault(); if (cad.cmdBuf.length) cad.cmdBuf = cad.cmdBuf.slice(0, -1); else cad.drawPts.pop(); dirty = 1; return true; }
      if (e.key === 'Enter') {
        e.preventDefault(); var v = parseFloat(cad.cmdBuf);
        if (v > 0) {
          var last = cad.drawPts[cad.drawPts.length - 1], cur = snapPoint(mouse, last);
          var dx = cur.x - last.x, dy = cur.y - last.y, L = Math.hypot(dx, dy);
          if (L < 1e-4) { dx = 1; dy = 0; L = 1; }
          cad.drawPts.push({ x: last.x + dx / L * v, y: last.y + dy / L * v }); cad.cmdBuf = ''; dirty = 1; return true;
        }
        if (cad.drawPts.length >= 3) { createPolygonFeature(cad.drawPts); cad.drawPts = []; cad.cmdBuf = ''; dirty = 1; return true; }
      }
      return false;
    },
    attachIcon: function (file) {
      var f = getSel();
      return new Promise(function (res, rej) {
        if (!f) return rej(new Error('Select a feature first'));
        var r = new FileReader(); r.onerror = rej;
        r.onload = function () {
          var im = new Image(); im.onerror = function () { rej(new Error('Unsupported image')); };
          im.onload = function () {
            var m = 128, iw = im.width || m, ih = im.height || m, k = Math.min(1, m / Math.max(iw, ih)), w = Math.max(1, Math.round(iw * k)), h = Math.max(1, Math.round(ih * k)),
              c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(im, 0, 0, w, h);
            var u = c.toDataURL('image/webp', .8); if (u.indexOf('data:image/webp') !== 0) u = c.toDataURL('image/png');
            St.snapshot(); f.customIconBase64 = u; St.emit('change'); res(u);
          };
          im.src = r.result;
        };
        r.readAsDataURL(file);
      });
    },
    clearIcon: function () { var f = getSel(); if (f) { St.snapshot(); f.customIconBase64 = null; St.emit('change'); } },
    getMeasure: minfo, fmt: fmt, renderModeOf: rmode, project: P, getCanvas: function () { return cv; },
    render: function () { dirty = 1; }
  };
})(window.SOS);
