window.SOS = window.SOS || {};
(function (S) {
  var St = S.State, D = Math.PI / 180, cv, ctx, W = 1, H = 1, dpr = 1, dirty = 1, hq = true, theme = 'cyber', tool = 'select', addType = 'building',
    sel = null, meas = [], hits = [], labels = [], mouse = { x: 0, y: 0 }, drag = null, ptrs = {}, icons = {};
  var cam = { cx: 0, cy: 0, zoom: 1, base: 3, yaw: 0, pitch: 45 };
  var layers = { fence: 1, build: 1, tent: 1, solar: 1, trees: 1, labels: 1, grid: 1, routes: 1 };
  var cad = { snap: 0, ortho: false, osnap: true, showDims: true, snapHit: null, draft: [], rectA: null, rectB: null, lastVClick: { t: 0, vi: -1 } };

  var LAY = { fence: 'fence', building: 'build', medical: 'build', security: 'build', gate: 'build', assembly: 'build', vehicle: 'build', extinguisher: 'build',
    camera: 'build', custom: 'build', pool: 'build', cottage: 'tent', tent: 'tent', solar: 'solar', hazard: 'solar', diesel_tank: 'solar',
    olive_zone: 'trees', yard: 'trees', road: 'trees', field: 'trees', playground: 'trees', parking: 'trees', tree: 'trees' };
  var TIER = { yard: 0, road: 0, parking: 0, fence: 1, field: 1, playground: 1 };
  var DEF = {
    building: { w: 20, d: 12, h: 9, fl: 3, roof: 'flat', col: '#3b4c5e' },
    medical: { w: 12, d: 9, h: 3.5, fl: 1, roof: 'red_tile', col: '#d4423e' },
    security: { w: 5, d: 4, h: 3, fl: 1, roof: 'red_tile', col: '#c9413b' },
    cottage: { w: 6, d: 5, h: 3, fl: 1, roof: 'red_tile', col: '#c8935a' },
    tent: { w: 8, d: 5, h: 3.5, fl: 1, roof: 'pyramid', col: '#9aa8b8' },
    pool: { w: 12, d: 6, h: 3.2, fl: 1, roof: 'quonset', col: '#2b88d8' },
    playground: { w: 10, d: 8, h: 2.2, fl: 1, roof: 'flat', col: '#d4a359' },
    parking: { w: 12, d: 7, h: 0.1, fl: 1, roof: 'flat', col: '#8d96a0' },
    diesel_tank: { w: 6, d: 4, h: 2.4, fl: 1, roof: 'flat', col: '#c8cfd6' },
    hazard: { w: 6, d: 5, h: 2.5, fl: 1, roof: 'flat', col: '#ff3c3c' },
    solar: { w: 12, d: 6, h: 1.5, fl: 1, roof: 'flat', col: '#1e50c8' },
    fence: { w: 40, d: 30, h: 2.5, fl: 1, roof: 'flat', col: '#39ff14' },
    yard: { w: 14, d: 10, h: 0.1, fl: 1, roof: 'flat', col: '#c8b288' },
    road: { w: 20, d: 4, h: 0.1, fl: 1, roof: 'flat', col: '#8a857c' },
    field: { w: 30, d: 18, h: 3, fl: 1, roof: 'flat', col: '#3fa335' },
    olive_zone: { w: 18, d: 14, h: 3.5, fl: 1, roof: 'flat', col: '#4a9a3a' }
  };
  var PCOL = { tree: '#3f8f2f', vehicle: '#e8c84a', extinguisher: '#ff3c3c', camera: '#00d9ff', custom: '#8aa0b5' };
  var MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';

  function cl(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function sc() { return cam.base * cam.zoom; }
  function isPr() { return theme === 'print'; }
  function P(x, y, z) {
    var a = cam.yaw * D, t = cam.pitch * D, dx = x - cam.cx, dy = y - cam.cy, s = sc(),
      rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a);
    return [W / 2 + rx * s, H / 2 - ry * s * Math.cos(t) - (z || 0) * s * Math.sin(t), ry];
  }
  function inv(sx, sy) {
    var a = cam.yaw * D, t = cam.pitch * D, s = sc(), rx = (sx - W / 2) / s, ry = -(sy - H / 2) / (s * Math.cos(t)), c = Math.cos(a), n = Math.sin(a);
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
  function bakeRotation(f) {
    if (!f || f.geometryType !== 'polygon') return;
    if (f.rotationDeg) { f.coordsMetric = pts(f); f.rotationDeg = 0; }
    f.center = cen(f.coordsMetric);
  }
  function updateFenceMeta(f) {
    if (f && f.category === 'fence' && f.geometryType === 'polygon' && f.coordsMetric.length >= 3) {
      St.project.meta.areaSqm = area(f.coordsMetric);
      St.project.meta.perimeterM = perim(f.coordsMetric);
    }
  }
  function getSel() { return St.project.features.filter(function (f) { return f.id === sel; })[0] || null; }
  function icon(f) {
    var k = f.customIconBase64; if (!k) return null;
    var i = icons[k];
    if (!i) { i = icons[k] = new Image(); i.onload = function () { dirty = 1; }; i.src = k; }
    return i.complete && i.naturalWidth ? i : null;
  }

  // =========================================================================
  // CAD PRECISION ENGINE (OSNAP, GRID SNAP, ORTHO, VERTEX GRIPS, DIMENSIONS)
  // =========================================================================
  function cadAxisRad() {
    return -(cam.yaw * D);
  }
  function applyOrtho(w, anchor) {
    if (!cad.ortho || !anchor) return w;
    var th = cadAxisRad(), cs = Math.cos(th), sn = Math.sin(th);
    var dx = w.x - anchor.x, dy = w.y - anchor.y;
    var lx = dx * cs + dy * sn, ly = -dx * sn + dy * cs;
    if (Math.abs(lx) >= Math.abs(ly)) ly = 0; else lx = 0;
    return { x: anchor.x + lx * cs - ly * sn, y: anchor.y + lx * sn + ly * cs };
  }
  function applySnap(w, screenP, anchor, excludeFeatId, excludeVertIdx) {
    cad.snapHit = null;
    var out = applyOrtho({ x: w.x, y: w.y }, anchor);
    if (cad.osnap && screenP) {
      var bestD = 14, hit = null;
      St.project.features.forEach(function (f) {
        if (!vis(f)) return;
        var a = f.geometryType === 'point' ? [f.coordsMetric[0] || f.center] : pts(f);
        for (var i = 0; i < a.length; i++) {
          if (f.id === excludeFeatId && i === excludeVertIdx) continue;
          var sp = P(a[i].x, a[i].y, 0), d = Math.hypot(screenP.x - sp[0], screenP.y - sp[1]);
          if (d < bestD) { bestD = d; hit = { x: a[i].x, y: a[i].y, kind: 'end' }; }
          if (f.geometryType === 'polygon') {
            var q = a[(i + 1) % a.length];
            if (f.id === excludeFeatId && (i === excludeVertIdx || (i + 1) % a.length === excludeVertIdx)) continue;
            var mx = (a[i].x + q.x) / 2, my = (a[i].y + q.y) / 2, sm = P(mx, my, 0), dm = Math.hypot(screenP.x - sm[0], screenP.y - sm[1]);
            if (dm < bestD) { bestD = dm; hit = { x: mx, y: my, kind: 'mid' }; }
          }
        }
      });
      if (hit) { cad.snapHit = hit; return { x: hit.x, y: hit.y }; }
    }
    if (cad.snap > 0) {
      out.x = Math.round(out.x / cad.snap) * cad.snap;
      out.y = Math.round(out.y / cad.snap) * cad.snap;
    }
    return out;
  }

  function vertexHitAt(sx, sy, f) {
    if (!f || f.geometryType !== 'polygon') return null;
    var a = pts(f), n = a.length, i;
    for (i = 0; i < n; i++) {
      var sp = P(a[i].x, a[i].y, 0);
      if (Math.hypot(sx - sp[0], sy - sp[1]) <= 11) return { kind: 'v', i: i };
    }
    for (i = 0; i < n; i++) {
      var q = a[(i + 1) % n], sm = P((a[i].x + q.x) / 2, (a[i].y + q.y) / 2, 0);
      if (Math.hypot(sx - sm[0], sy - sm[1]) <= 10) return { kind: 'mid', i: i };
    }
    return null;
  }

  function drawCadOverlays() {
    var pr = isPr(), f = getSel(), i, p, q, sp, sq, mx, my, L, txt, tw;
    // 1. Live Edge Dimensions on selected polygon
    if (f && f.geometryType === 'polygon' && (cad.showDims || tool === 'vertices')) {
      var a = pts(f), n = a.length;
      ctx.save();
      ctx.font = 'bold 10px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (i = 0; i < n; i++) {
        p = a[i]; q = a[(i + 1) % n]; L = Math.hypot(q.x - p.x, q.y - p.y);
        sp = P(p.x, p.y, 0); sq = P(q.x, q.y, 0);
        if (Math.hypot(sq[0] - sp[0], sq[1] - sp[1]) < 26) continue;
        mx = (sp[0] + sq[0]) / 2; my = (sp[1] + sq[1]) / 2;
        txt = L.toFixed(2) + 'm'; tw = ctx.measureText(txt).width + 8;
        ctx.fillStyle = pr ? 'rgba(255,255,255,.92)' : 'rgba(8,11,16,.88)';
        ctx.fillRect(mx - tw / 2, my - 7, tw, 14);
        ctx.strokeStyle = pr ? '#0284c7' : '#e8c84a'; ctx.lineWidth = 1;
        ctx.strokeRect(mx - tw / 2, my - 7, tw, 14);
        ctx.fillStyle = pr ? '#0369a1' : '#e8c84a';
        ctx.fillText(txt, mx, my + .5);
      }
      ctx.restore();
    }

    // 2. AutoCAD Vertex & Midpoint Grips when in 'vertices' tool
    if (tool === 'vertices' && f && f.geometryType === 'polygon') {
      var av = pts(f), nv = av.length;
      ctx.save();
      ctx.strokeStyle = '#00d9ff'; ctx.lineWidth = 2; path(av.map(g0), 1); ctx.stroke();
      for (i = 0; i < nv; i++) {
        p = av[i]; q = av[(i + 1) % nv];
        // Green '+' midpoint insert handle
        var sm = P((p.x + q.x) / 2, (p.y + q.y) / 2, 0);
        ctx.beginPath(); ctx.arc(sm[0], sm[1], 6, 0, 6.3);
        ctx.fillStyle = '#080b10'; ctx.fill(); ctx.strokeStyle = '#39ff14'; ctx.lineWidth = 1.6; ctx.stroke();
        ctx.fillStyle = '#39ff14'; ctx.font = 'bold 10px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('+', sm[0], sm[1] + .5);
      }
      for (i = 0; i < nv; i++) {
        // Blue/Cyan square vertex grip
        sp = P(av[i].x, av[i].y, 0);
        ctx.fillStyle = '#00d9ff'; ctx.fillRect(sp[0] - 5, sp[1] - 5, 10, 10);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.strokeRect(sp[0] - 5, sp[1] - 5, 10, 10);
      }
      ctx.restore();
    }

    // 3. Active Draw Polygon rubber-band preview
    if (tool === 'draw_poly' && cad.draft.length) {
      ctx.save();
      var dp = cad.draft.map(g0), cur = P(mouse.x, mouse.y, 0);
      ctx.strokeStyle = '#39ff14'; ctx.lineWidth = 2.2;
      path(dp, false); ctx.lineTo(cur[0], cur[1]); ctx.stroke();
      // Closing preview dashed line
      if (cad.draft.length >= 2) {
        ctx.setLineDash([5, 4]); ctx.strokeStyle = 'rgba(0,217,255,.7)';
        line(cur, dp[0]); ctx.setLineDash([]);
      }
      // Vertices + edge lengths
      dp.forEach(function (pt, idx) {
        ctx.beginPath(); ctx.arc(pt[0], pt[1], idx === 0 ? 6 : 4, 0, 6.3);
        ctx.fillStyle = idx === 0 ? '#39ff14' : '#00d9ff'; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
      });
      var lastW = cad.draft[cad.draft.length - 1];
      var segL = Math.hypot(mouse.x - lastW.x, mouse.y - lastW.y);
      var segA = ((Math.atan2(mouse.y - lastW.y, mouse.x - lastW.x) / D) % 360 + 360) % 360;
      var lb = segL.toFixed(2) + ' m | ' + segA.toFixed(0) + '°';
      ctx.font = 'bold 11px ' + MONO; tw = ctx.measureText(lb).width + 10;
      ctx.fillStyle = 'rgba(8,11,16,.92)'; ctx.fillRect(cur[0] + 12, cur[1] - 24, tw, 18);
      ctx.strokeStyle = '#39ff14'; ctx.strokeRect(cur[0] + 12, cur[1] - 24, tw, 18);
      ctx.fillStyle = '#39ff14'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(lb, cur[0] + 17, cur[1] - 15);
      ctx.restore();
    }

    // 4. Active Draw Rectangle preview
    if (tool === 'draw_rect' && cad.rectA && cad.rectB) {
      var rc = buildRectCorners(cad.rectA, cad.rectB);
      ctx.save();
      fillPoly(rc.corners.map(g0), 'rgba(0,217,255,0.18)', '#00d9ff');
      var cm = P(rc.center.x, rc.center.y, 0);
      var rtxt = rc.w.toFixed(2) + ' × ' + rc.d.toFixed(2) + ' m (' + (rc.w * rc.d).toFixed(1) + ' m²)';
      ctx.font = 'bold 11px ' + MONO; tw = ctx.measureText(rtxt).width + 12;
      ctx.fillStyle = 'rgba(8,11,16,.92)'; ctx.fillRect(cm[0] - tw / 2, cm[1] - 10, tw, 20);
      ctx.strokeStyle = '#00d9ff'; ctx.strokeRect(cm[0] - tw / 2, cm[1] - 10, tw, 20);
      ctx.fillStyle = '#00d9ff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(rtxt, cm[0], cm[1]);
      ctx.restore();
    }

    // 5. OSNAP Visual Indicator (AutoCAD Endpoint square / Midpoint triangle)
    if (cad.snapHit && (tool === 'draw_poly' || tool === 'draw_rect' || tool === 'vertices' || tool === 'measure')) {
      var sh = P(cad.snapHit.x, cad.snapHit.y, 0);
      ctx.save();
      if (cad.snapHit.kind === 'end') {
        ctx.strokeStyle = '#39ff14'; ctx.lineWidth = 2; ctx.strokeRect(sh[0] - 7, sh[1] - 7, 14, 14);
      } else {
        ctx.strokeStyle = '#00d9ff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sh[0], sh[1] - 8); ctx.lineTo(sh[0] + 8, sh[1] + 6); ctx.lineTo(sh[0] - 8, sh[1] + 6); ctx.closePath(); ctx.stroke();
      }
      ctx.restore();
    }
  }

  function buildRectCorners(a, b) {
    var th = cadAxisRad(), cs = Math.cos(th), sn = Math.sin(th);
    var dx = b.x - a.x, dy = b.y - a.y;
    var lx = dx * cs + dy * sn, ly = -dx * sn + dy * cs;
    function L2W(u, v) { return { x: a.x + u * cs - v * sn, y: a.y + u * sn + v * cs }; }
    var corners = [L2W(0, 0), L2W(lx, 0), L2W(lx, ly), L2W(0, ly)];
    return { corners: corners, center: cen(corners), w: Math.abs(lx), d: Math.abs(ly) };
  }

  function createDrawnPoly(corners) {
    if (!corners || corners.length < 3) return;
    var cat = DEF[addType] ? addType : 'building', d = DEF[cat] || DEF.building;
    St.snapshot();
    var f = St.newFeature({
      category: cat, shapeType: 'extrude', geometryType: 'polygon',
      coordsMetric: corners.map(function (p) { return { x: +p.x.toFixed(3), y: +p.y.toFixed(3) }; }),
      center: cen(corners), height_m: d.h, floors: d.fl, roofType: d.roof, color: d.col,
      en_name: cat.replace('_', ' '), renderMode: (cat === 'tent' || cat === 'cottage') ? 'solid' : undefined
    });
    St.project.features.push(f);
    updateFenceMeta(f);
    select(f.id);
    St.emit('change');
  }

  // =========================================================================
  // 3D ARCHITECTURAL RENDERING (CYBER & DAYLIGHT PRINT)
  // =========================================================================
  function dropShadow(a, h) {
    if (!isPr() || !(h > 0.2)) return;
    fillPoly(a.map(function (p) { return P(p.x + h * 0.42, p.y - h * 0.34, 0); }), 'rgba(40,34,24,0.22)');
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
    o = o || {};
    var pr = isPr(), n = a.length, ws = [], i, k, wk = o.wk || (pr ? .92 : .5),
      win = o.win === undefined ? (pr ? '#4f8ec9' : 'rgba(0,217,255,.5)') : o.win,
      ink = o.edge || (pr ? '#2b3440' : shade(col, 1));
    function at(w, t, z) { return P(w.p.x + (w.q.x - w.p.x) * t, w.p.y + (w.q.y - w.p.y) * t, z); }
    for (i = 0; i < n; i++) {
      var p = a[i], q = a[(i + 1) % n];
      ws.push({ p: p, q: q, d: P((p.x + q.x) / 2, (p.y + q.y) / 2, 0)[2], L: Math.hypot(q.x - p.x, q.y - p.y), g: Math.atan2(q.y - p.y, q.x - p.x) + cam.yaw * D });
    }
    ws.sort(function (u, v) { return v.d - u.d; });
    ws.forEach(function (w) {
      fillPoly([at(w, 0, 0), at(w, 1, 0), at(w, 1, h), at(w, 0, h)], shade(col, wk * (.82 + .18 * Math.abs(Math.sin(w.g)))), ink);
      ctx.strokeStyle = o.ln || (pr ? '#475569' : shade(col, .85));
      for (k = 1; k < fl; k++) line(at(w, 0, h * k / fl), at(w, 1, h * k / fl));
      if (win && hq && w.L > 3 && sc() > 1.1)
        for (k = 0; k < fl; k++) for (var s = 1; s < w.L - 2; s += 2.6)
          fillPoly([at(w, s / w.L, h * (k + .28) / fl), at(w, (s + 1.4) / w.L, h * (k + .28) / fl), at(w, (s + 1.4) / w.L, h * (k + .72) / fl), at(w, s / w.L, h * (k + .72) / fl)], win, pr ? '#223244' : null);
      if (o.stripe) for (var s2 = 0, j = 0; s2 < w.L; s2++, j++) {
        var t0 = s2 / w.L, t1 = Math.min(1, (s2 + 1) / w.L);
        fillPoly([at(w, t0, h * .1), at(w, t1, h * .1), at(w, Math.min(1, t1 + .5 / w.L), h * .3), at(w, Math.min(1, t0 + .5 / w.L), h * .3)], j % 2 ? '#e8c84a' : '#ff3c3c');
      }
    });
  }
  function roof(a, h, col, type, rc) {
    var pr = isPr(), c = cen(a), n = a.length, i;
    if (type === 'quonset') {
      for (i = 0; i < 5; i++) {
        var t = i / 5 * Math.PI / 2, s = Math.cos(t), z = h + Math.sin(t) * Math.max(1.4, h * .55);
        fillPoly(a.map(function (p) { return P(c.x + (p.x - c.x) * s, c.y + (p.y - c.y) * s, z); }), pr ? shade(rc || '#e9edf2', .88 + i * .03) : shade(col, .6 + i * .07), pr ? '#475569' : col);
      }
      return;
    }
    if (type === 'pyramid' || type === 'red_tile') {
      var ap = P(c.x, c.y, h + Math.max(1.4, h * .48)), es = [], red = type === 'red_tile';
      for (i = 0; i < n; i++) { var p = a[i], q = a[(i + 1) % n]; es.push({ p: p, q: q, d: P((p.x + q.x) / 2, (p.y + q.y) / 2, 0)[2], i: i }); }
      es.sort(function (u, v) { return v.d - u.d; });
      es.forEach(function (e) {
        var fc = red ? shade(pr ? '#cf4b43' : '#c0502d', .82 + .07 * (e.i % 3)) : shade(rc || col, pr ? (.9 + .04 * (e.i % 3)) : (.7 + .1 * (e.i % 3)));
        fillPoly([P(e.p.x, e.p.y, h), P(e.q.x, e.q.y, h), ap], fc, pr ? '#333d47' : (red ? '#ff8a5c' : col));
      });
      return;
    }
    fillPoly(a.map(function (p) { return P(p.x, p.y, h); }), rc || shade(col, pr ? 1.04 : .8), pr ? '#2b3440' : (rc ? '#89a4be' : col));
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
      var sh = P(x + 1.1, y - 0.9, 0);
      ctx.beginPath(); ctx.arc(sh[0], sh[1], r * .95, 0, 6.3); ctx.fillStyle = 'rgba(45,40,28,0.22)'; ctx.fill();
      var u0 = P(x, y, 0), v0 = P(x, y, 1.8); ctx.strokeStyle = '#5c4028'; ctx.lineWidth = Math.max(1.5, .28 * s); line(u0, v0);
      var t0 = P(x, y, 2.7), t1 = P(x - .55, y + .3, 2.9), t2 = P(x + .5, y - .2, 3.0);
      ctx.lineWidth = .9;
      ctx.beginPath(); ctx.arc(t0[0], t0[1], r * .95, 0, 6.3); ctx.fillStyle = '#476b2d'; ctx.fill(); ctx.strokeStyle = '#283d19'; ctx.stroke();
      ctx.beginPath(); ctx.arc(t1[0], t1[1], r * .72, 0, 6.3); ctx.fillStyle = '#5c843c'; ctx.fill();
      ctx.beginPath(); ctx.arc(t2[0], t2[1], r * .62, 0, 6.3); ctx.fillStyle = '#739c4c'; ctx.fill();
      return;
    }
    var u = P(x, y, 0), v = P(x, y, 2.2); ctx.strokeStyle = '#6b4a2a'; line(u, v);
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
    } else if (cat === 'tree') { drawTreeAt(p.x, p.y, c, 1.8); }
    else if (cat === 'extinguisher') { u = P(p.x, p.y, 0); v = P(p.x, p.y, .9); ctx.lineCap = 'round'; ctx.lineWidth = Math.max(4, .4 * s); ctx.strokeStyle = '#dc2626'; line(u, v); ctx.lineCap = 'butt'; ctx.lineWidth = 1.3; }
    else if (cat === 'camera') { u = P(p.x, p.y, 0); v = P(p.x, p.y, 3.2); ctx.strokeStyle = pr ? '#475569' : '#8899aa'; line(u, v); ctx.fillStyle = pr ? '#1e293b' : c; ctx.fillRect(v[0] - 6, v[1] - 4, 12, 8); }
    else { u = P(p.x, p.y, 0); v = P(p.x, p.y, 2.5); ctx.strokeStyle = pr ? '#1e293b' : c; line(u, v); ctx.beginPath(); ctx.arc(v[0], v[1], 6, 0, 6.3); ctx.fillStyle = c; ctx.fill(); }
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
    var r0 = { x: (cn[0].x + cn[3].x) / 2, y: (cn[0].y + cn[3].y) / 2 }, r1 = { x: (cn[1].x + cn[2].x) / 2, y: (cn[1].y + cn[2].y) / 2 }, z = h + rise;
    var fs = [
      { v: [[cn[0], h], [cn[1], h], [r1, z], [r0, z]], c: roofA || '#b4502e' },
      { v: [[cn[3], h], [cn[2], h], [r1, z], [r0, z]], c: roofB || '#8e3d22' },
      { v: [[cn[0], h], [cn[3], h], [r0, z]], c: shade(c, .78) },
      { v: [[cn[1], h], [cn[2], h], [r1, z]], c: shade(c, .88) }
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
      var fcn = [[-fu / 2, -fv / 2], [fu / 2, -fv / 2], [fu / 2, fv / 2], [-fu / 2, fv / 2]].map(function (q) { return L2W(q[0], q[1]); });
      us.push({ lx: 0, ly: 0, cn: fcn, d: P(m.x, m.y, 0)[2] });
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
        extrude(o.cn, 2.1, wc, 1, { wk: .95, edge: pr ? '#3c2918' : null, win: pr ? '#3c4d5e' : 'rgba(255,255,255,.22)' });
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
    ctx.strokeStyle = pr ? '#4b5563' : '#ff3c3c'; ctx.lineWidth = 1;
    path(a.map(function (p) { return P(p.x, p.y, 1.4); }), 1); ctx.stroke();
    a.forEach(function (p) { line(P(p.x, p.y, 0), P(p.x, p.y, 1.4)); });
    var tw = Math.max(1.8, (b.x1 - b.x0) * .65), td = Math.max(1.2, Math.min(2.6, (b.y1 - b.y0) * .55));
    var tbox = [[-tw / 2, -td / 2], [tw / 2, -td / 2], [tw / 2, td / 2], [-tw / 2, td / 2]].map(function (q) { return L2W(q[0], q[1]); });
    dropShadow(tbox, hh);
    extrude(tbox, hh * .55, pr ? '#dde3e9' : '#586573', 1, { wk: .95, edge: pr ? '#2b3440' : '#ff3c3c', win: null, stripe: !pr });
    roof(tbox, hh * .55, pr ? '#eef2f6' : '#6c7a89', 'quonset', pr ? '#f8fafc' : '#7b8a99');
  }
  function drawPool(a, h) {
    var pr = isPr(), th = domAng(a), cs = Math.cos(th), sn = Math.sin(th), m = cen(a
