window.SOS = window.SOS || {};
(function (S) {
  var St = S.State, D = Math.PI / 180, cv, ctx, W = 1, H = 1, dpr = 1, dirty = 1, hq = true, tool = 'select', addType = 'building',
    sel = null, meas = [], hits = [], mouse = { x: 0, y: 0 }, drag = null, ptrs = {}, icons = {};
  var cam = { cx: 0, cy: 0, zoom: 1, base: 3, yaw: 0, pitch: 45 };
  var layers = { fence: 1, build: 1, tent: 1, solar: 1, trees: 1, labels: 1, grid: 1 };
  var LAY = { fence: 'fence', building: 'build', medical: 'build', security: 'build', gate: 'build', assembly: 'build', vehicle: 'build', extinguisher: 'build',
    camera: 'build', custom: 'build', cottage: 'tent', tent: 'tent', solar: 'solar', hazard: 'solar', olive_zone: 'trees', yard: 'trees', road: 'trees', field: 'trees', tree: 'trees' };
  var TIER = { yard: 0, road: 0, fence: 1, field: 1 };
  var DEF = { building: { w: 20, d: 12, h: 9, fl: 3, roof: 'flat', col: '#39ff14' }, cottage: { w: 6, d: 5, h: 3, fl: 1, roof: 'red_tile', col: '#c8935a' },
    tent: { w: 8, d: 5, h: 3.5, fl: 1, roof: 'pyramid', col: '#9aa8b8' }, solar: { w: 12, d: 6, h: 1.5, fl: 1, roof: 'flat', col: '#1e50c8' } };
  var PCOL = { tree: '#3f8f2f', vehicle: '#e8c84a', extinguisher: '#ff3c3c', camera: '#00d9ff', custom: '#39ff14' };
  var MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';

  function cl(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function sc() { return cam.base * cam.zoom; }
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
  function shade(hex, k) { var n = parseInt(hex.slice(1), 16); return 'rgb(' + ((n >> 16 & 255) * k | 0) + ',' + ((n >> 8 & 255) * k | 0) + ',' + ((n & 255) * k | 0) + ')'; }
  function cen(a) { var x = 0, y = 0; a.forEach(function (p) { x += p.x; y += p.y; }); return { x: x / a.length, y: y / a.length }; }
  function bb(a) { var b = { x0: 1e18, y0: 1e18, x1: -1e18, y1: -1e18 }; a.forEach(function (p) { b.x0 = Math.min(b.x0, p.x); b.x1 = Math.max(b.x1, p.x); b.y0 = Math.min(b.y0, p.y); b.y1 = Math.max(b.y1, p.y); }); return b; }
  function area(a) { var s = 0; for (var i = 0; i < a.length; i++) { var q = a[(i + 1) % a.length]; s += a[i].x * q.y - q.x * a[i].y; } return Math.abs(s) / 2; }
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
    var r = f.rotationDeg * D, c = Math.cos(r), n = Math.sin(r), m = f.center;
    return f.coordsMetric.map(function (p) { var dx = p.x - m.x, dy = p.y - m.y; return { x: m.x + dx * c - dy * n, y: m.y + dx * n + dy * c }; });
  }
  function getSel() { return St.project.features.filter(function (f) { return f.id === sel; })[0] || null; }
  function icon(f) {
    var k = f.customIconBase64; if (!k) return null;
    var i = icons[k];
    if (!i) { i = icons[k] = new Image(); i.onload = function () { dirty = 1; }; i.src = k; }
    return i.complete && i.naturalWidth ? i : null;
  }

  function extrude(a, h, col, fl) {
    var n = a.length, ws = [], i, k;
    for (i = 0; i < n; i++) { var p = a[i], q = a[(i + 1) % n]; ws.push({ p: p, q: q, d: P((p.x + q.x) / 2, (p.y + q.y) / 2, 0)[2], L: Math.hypot(q.x - p.x, q.y - p.y) }); }
    ws.sort(function (u, v) { return v.d - u.d; });
    ws.forEach(function (w) {
      fillPoly([P(w.p.x, w.p.y, 0), P(w.q.x, w.q.y, 0), P(w.q.x, w.q.y, h), P(w.p.x, w.p.y, h)], shade(col, .5), shade(col, 1));
      ctx.strokeStyle = shade(col, .85);
      for (k = 1; k < fl; k++) { var z = h * k / fl; line(P(w.p.x, w.p.y, z), P(w.q.x, w.q.y, z)); }
      if (hq && w.L > 3 && sc() > 1.2)
        for (k = 0; k < fl; k++) for (var s = 1; s < w.L - 2; s += 2.6) {
          var z0 = h * (k + .3) / fl, z1 = h * (k + .7) / fl, e0 = s / w.L, e1 = (s + 1.4) / w.L,
            x0 = w.p.x + (w.q.x - w.p.x) * e0, y0 = w.p.y + (w.q.y - w.p.y) * e0, x1 = w.p.x + (w.q.x - w.p.x) * e1, y1 = w.p.y + (w.q.y - w.p.y) * e1;
          fillPoly([P(x0, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y0, z1)], 'rgba(0,217,255,.5)');
        }
    });
  }
  function roof(a, h, col, type) {
    var c = cen(a), n = a.length, i;
    if (type === 'quonset') {
      for (i = 0; i < 5; i++) {
        var t = i / 5 * Math.PI / 2, s = Math.cos(t), z = h + Math.sin(t) * Math.max(1.5, h * .6);
        fillPoly(a.map(function (p) { return P(c.x + (p.x - c.x) * s, c.y + (p.y - c.y) * s, z); }), shade(col, .6 + i * .07), col);
      }
      return;
    }
    if (type === 'pyramid' || type === 'red_tile') {
      var ap = P(c.x, c.y, h + Math.max(1.5, h * .5)), es = [], red = type === 'red_tile';
      for (i = 0; i < n; i++) { var p = a[i], q = a[(i + 1) % n]; es.push({ p: p, q: q, d: P((p.x + q.x) / 2, (p.y + q.y) / 2, 0)[2], i: i }); }
      es.sort(function (u, v) { return v.d - u.d; });
      es.forEach(function (e) { fillPoly([P(e.p.x, e.p.y, h), P(e.q.x, e.q.y, h), ap], red ? shade('#c0502d', .6 + .1 * (e.i % 3)) : shade(col, .7 + .1 * (e.i % 3)), red ? '#ff8a5c' : col); });
      return;
    }
    fillPoly(a.map(function (p) { return P(p.x, p.y, h); }), shade(col, .8), col);
  }
  function badge(t) {
    var k = .5 + .5 * Math.sin(Date.now() / 300), r = 9 + 3 * k;
    if (hq) { ctx.shadowColor = '#ff3c3c'; ctx.shadowBlur = 10 + 8 * k; }
    ctx.beginPath(); ctx.arc(t[0], t[1] - 20, r, 0, 6.3); ctx.fillStyle = 'rgba(232,200,74,' + (.55 + .4 * k) + ')'; ctx.fill();
    ctx.strokeStyle = '#ff3c3c'; ctx.lineWidth = 2; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#300'; ctx.font = 'bold 12px ' + MONO; ctx.textAlign = 'center'; ctx.fillText('!', t[0], t[1] - 16);
  }
  function dpoint(f) {
    var p = f.coordsMetric[0] || f.center, c = f.color || '#39ff14', cat = f.category, s = sc(), r = f.rotationDeg * D, i, u, v;
    if (cat === 'assembly') {
      var ring = [];
      for (i = 0; i < 36; i++) ring.push(P(p.x + 6 * Math.cos(i / 36 * 6.2832), p.y + 6 * Math.sin(i / 36 * 6.2832), 0));
      if (hq) { ctx.shadowColor = '#00d9ff'; ctx.shadowBlur = 14; }
      ctx.globalAlpha = .25; fillPoly(ring, '#00d9ff'); ctx.globalAlpha = 1;
      ctx.strokeStyle = '#00d9ff'; ctx.lineWidth = 2; path(ring, 1); ctx.stroke(); ctx.shadowBlur = 0;
      u = P(p.x, p.y, 0); ctx.fillStyle = '#00d9ff'; ctx.font = 'bold 14px ' + MONO; ctx.textAlign = 'center'; ctx.fillText('A', u[0], u[1] + 5);
    } else if (cat === 'vehicle') {
      var cs = Math.cos(r), sn = Math.sin(r), box = [[-5, -1.25], [5, -1.25], [5, 1.25], [-5, 1.25]].map(function (q) { return { x: p.x + q[0] * cs - q[1] * sn, y: p.y + q[0] * sn + q[1] * cs }; });
      extrude(box, 3, c, 1); roof(box, 3, c, 'flat');
    } else if (cat === 'tree') {
      u = P(p.x, p.y, 0); v = P(p.x, p.y, 2.5); ctx.strokeStyle = '#6b4a2a'; line(u, v);
      u = P(p.x, p.y, 3.8); ctx.beginPath(); ctx.arc(u[0], u[1], Math.max(3, 1.8 * s), 0, 6.3); ctx.fillStyle = c; ctx.fill();
    } else if (cat === 'extinguisher') {
      u = P(p.x, p.y, 0); v = P(p.x, p.y, .9); ctx.lineCap = 'round'; ctx.lineWidth = Math.max(4, .4 * s); ctx.strokeStyle = '#ff3c3c'; line(u, v); ctx.lineCap = 'butt'; ctx.lineWidth = 1.3;
    } else if (cat === 'camera') {
      u = P(p.x, p.y, 0); v = P(p.x, p.y, 3.2); ctx.strokeStyle = '#8899aa'; line(u, v); ctx.fillStyle = c; ctx.fillRect(v[0] - 6, v[1] - 4, 12, 8);
    } else {
      u = P(p.x, p.y, 0); v = P(p.x, p.y, 2.5); ctx.strokeStyle = c; line(u, v); ctx.beginPath(); ctx.arc(v[0], v[1], 6, 0, 6.3); ctx.fillStyle = c; ctx.fill();
    }
  }
  function draw(f) {
    if (f.geometryType === 'point') return dpoint(f);
    var a = pts(f), c = f.color || '#39ff14', h = +f.height_m || 0, cat = f.category, fl = Math.max(1, f.floors | 0), i, k, b, u, v;
    ctx.setLineDash([]); ctx.lineWidth = hq ? 1.3 : 1;
    if (cat === 'yard' || cat === 'road') { ctx.globalAlpha = .5; fillPoly(a.map(g0), shade(c, .6), c); ctx.globalAlpha = 1; }
    else if (cat === 'fence') {
      var fh = h || 2.4, n = a.length; ctx.strokeStyle = c;
      path(a.map(g0), 1); ctx.stroke(); path(a.map(function (p) { return P(p.x, p.y, fh); }), 1); ctx.stroke();
      ctx.globalAlpha = .4; path(a.map(function (p) { return P(p.x, p.y, fh / 2); }), 1); ctx.stroke(); ctx.globalAlpha = 1;
      for (i = 0; i < n; i++) {
        var p = a[i], q = a[(i + 1) % n], m = Math.min(400, Math.max(1, Math.round(Math.hypot(q.x - p.x, q.y - p.y) / 6)));
        for (k = 0; k < m; k++) { var t = k / m, x = p.x + (q.x - p.x) * t, y = p.y + (q.y - p.y) * t; line(P(x, y, 0), P(x, y, fh)); }
      }
    } else if (cat === 'field') {
      ctx.globalAlpha = .45; fillPoly(a.map(g0), '#1f6f1f'); ctx.globalAlpha = 1; ctx.strokeStyle = '#fff'; path(a.map(g0), 1); ctx.stroke();
      b = bb(a); var w = b.x1 - b.x0, d = b.y1 - b.y0, mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
      if (w >= d) line(P(mx, b.y0, 0), P(mx, b.y1, 0)); else line(P(b.x0, my, 0), P(b.x1, my, 0));
      var ring = []; for (i = 0; i < 32; i++) ring.push(P(mx + Math.min(w, d) * .12 * Math.cos(i / 32 * 6.2832), my + Math.min(w, d) * .12 * Math.sin(i / 32 * 6.2832), 0));
      path(ring, 1); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.setLineDash([4, 3]); path(a.map(function (p) { return P(p.x, p.y, 3); }), 1); ctx.stroke(); ctx.setLineDash([]);
      a.forEach(function (p) { line(P(p.x, p.y, 0), P(p.x, p.y, 3)); });
    } else if (cat === 'olive_zone') {
      ctx.globalAlpha = .25; fillPoly(a.map(g0), '#2f6f1f'); ctx.globalAlpha = 1; ctx.strokeStyle = c; ctx.setLineDash([5, 4]); path(a.map(g0), 1); ctx.stroke(); ctx.setLineDash([]);
      b = bb(a); var cnt = Math.min(hq ? 90 : 25, Math.max(4, area(a) / 50 | 0)), sd = hash(f.id), tr = [], tries = 0;
      while (tr.length < cnt && tries++ < cnt * 20) {
        sd = (sd * 1664525 + 1013904223) >>> 0; var rx = b.x0 + sd / 4294967296 * (b.x1 - b.x0);
        sd = (sd * 1664525 + 1013904223) >>> 0; var ry = b.y0 + sd / 4294967296 * (b.y1 - b.y0);
        if (inP(rx, ry, a)) tr.push({ x: rx, y: ry, d: P(rx, ry, 0)[2] });
      }
      tr.sort(function (p, q) { return q.d - p.d; });
      tr.forEach(function (t) {
        u = P(t.x, t.y, 0); v = P(t.x, t.y, 2); ctx.strokeStyle = '#6b4a2a'; line(u, v);
        ctx.beginPath(); ctx.arc(v[0], v[1], Math.max(2, 1.6 * sc()), 0, 6.3); ctx.fillStyle = '#3f8f2f'; ctx.fill();
      });
    } else if (cat === 'solar') {
      b = bb(a); var tp = a.map(function (p) { return P(p.x, p.y, .5 + (p.y - b.y0) / Math.max(1, b.y1 - b.y0) * 1.3); });
      ctx.strokeStyle = '#8899aa'; a.forEach(function (p, j) { line(P(p.x, p.y, 0), tp[j]); });
      fillPoly(tp, '#10285f', '#3a7bff');
    } else if (cat === 'hazard') {
      var hh = h || 3; extrude(a, hh, c, 1); roof(a, hh, c, 'flat'); ctx.strokeStyle = '#ff3c3c'; path(a.map(function (p) { return P(p.x, p.y, hh); }), 1); ctx.stroke();
    } else {
      var wh = cat === 'tent' ? h * .45 : h;
      extrude(a, wh, c, cat === 'tent' ? 1 : fl);
      roof(a, wh, c, f.roofType || 'flat');
      var cc = cen(a);
      if (cat === 'medical') { u = P(cc.x, cc.y, wh + .1); var z = Math.max(3, sc() * 1.2); ctx.fillStyle = '#ff3c3c'; ctx.fillRect(u[0] - z, u[1] - z / 3, 2 * z, 2 * z / 3); ctx.fillRect(u[0] - z / 3, u[1] - z, 2 * z / 3, 2 * z); }
      if (cat === 'security') { u = P(cc.x, cc.y, wh); v = P(cc.x, cc.y, wh + 2.5); ctx.strokeStyle = '#00d9ff'; line(u, v); ctx.beginPath(); ctx.arc(v[0], v[1], 4, 0, 6.3); ctx.fillStyle = '#00d9ff'; ctx.fill(); }
    }
  }
  function drawFeature(f) {
    draw(f);
    var h = +f.height_m || 0, c = f.center, pt = f.geometryType === 'point', top = P(c.x, c.y, pt ? 3 : h);
    if (f.hazard_flag || f.category === 'hazard') badge(top);
    var im = icon(f);
    if (im) { var s = cl(sc() * 4, 16, 48); ctx.drawImage(im, top[0] - s / 2, top[1] - s - 6, s, s * ((im.naturalHeight / im.naturalWidth) || 1)); }
    if (layers.labels && f.en_name) {
      ctx.font = '10px ' + MONO; ctx.textAlign = 'center'; ctx.fillStyle = '#080b10'; ctx.fillText(f.en_name, top[0] + 1, top[1] - 9); ctx.fillStyle = '#cfe'; ctx.fillText(f.en_name, top[0], top[1] - 10);
    }
    if (pt) { var q = P(c.x, c.y, 1); hits.push({ f: f, c: q }); }
    else { var a = pts(f); hits.push({ f: f, edge: f.category === 'fence', a: a.map(function (p) { return S2(p, 0); }), b: a.map(function (p) { return S2(p, h); }) }); }
  }
  function vis(f) { return f.visible !== false && layers[LAY[f.category] || 'build']; }

  function grid() {
    var s = sc(), st = [5, 10, 20, 50, 100, 200, 500, 1000].filter(function (v) { return v * s >= 40; })[0] || 1000;
    var cs = [inv(0, 0), inv(W, 0), inv(0, H), inv(W, H)], b = bb(cs);
    while ((b.x1 - b.x0) / st > 120 || (b.y1 - b.y0) / st > 120) st *= 2;
    var x, y; ctx.lineWidth = 1;
    for (x = Math.floor(b.x0 / st) * st; x <= b.x1; x += st) { ctx.strokeStyle = x === 0 ? 'rgba(57,255,20,.35)' : 'rgba(57,255,20,.1)'; line(P(x, b.y0, 0), P(x, b.y1, 0)); }
    for (y = Math.floor(b.y0 / st) * st; y <= b.y1; y += st) { ctx.strokeStyle = y === 0 ? 'rgba(57,255,20,.35)' : 'rgba(57,255,20,.1)'; line(P(b.x0, y, 0), P(b.x1, y, 0)); }
  }
  function fmt(s) { var m = Math.floor(s / 60), x = Math.round(s % 60); return m + 'm ' + (x < 10 ? '0' : '') + x + 's'; }
  function minfo() { if (meas.length < 2) return null; var d = Math.hypot(meas[1].x - meas[0].x, meas[1].y - meas[0].y); return { d: d, t12: d / 1.2, t08: d / .8 }; }
  function overlays() {
    var s = sc(), i, t = cam.pitch * D, a = cam.yaw * D;
    if (meas.length) {
      ctx.strokeStyle = '#e8c84a'; ctx.fillStyle = '#e8c84a'; ctx.lineWidth = 2;
      var m = meas.map(function (p) { return P(p.x, p.y, 0); });
      if (m.length > 1) { ctx.setLineDash([6, 4]); path(m); ctx.stroke(); ctx.setLineDash([]); }
      m.forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, 6.3); ctx.fill(); });
      var mi = minfo();
      if (mi) {
        var tx = (m[0][0] + m[1][0]) / 2, ty = (m[0][1] + m[1][1]) / 2, txt = mi.d.toFixed(1) + ' m | ' + fmt(mi.t12) + ' @1.2 | ' + fmt(mi.t08) + ' @0.8';
        ctx.font = 'bold 11px ' + MONO; ctx.textAlign = 'center'; var tw = ctx.measureText(txt).width + 10;
        ctx.fillStyle = 'rgba(8,11,16,.85)'; ctx.fillRect(tx - tw / 2, ty - 18, tw, 16); ctx.fillStyle = '#e8c84a'; ctx.fillText(txt, tx, ty - 6);
      }
    }
    var cx = W - 44, cy = 44;
    ctx.lineWidth = 1; ctx.strokeStyle = '#1b2838'; ctx.fillStyle = 'rgba(14,20,29,.85)'; ctx.beginPath(); ctx.arc(cx, cy, 30, 0, 6.3); ctx.fill(); ctx.stroke();
    [[0, 1, 'N'], [1, 0, 'E'], [0, -1, 'S'], [-1, 0, 'W']].forEach(function (d) {
      var rx = d[0] * Math.cos(a) - d[1] * Math.sin(a), ry = d[0] * Math.sin(a) + d[1] * Math.cos(a), ex = cx + rx * 20, ey = cy - ry * 20 * Math.cos(t), n = d[2] === 'N';
      ctx.strokeStyle = n ? '#ff3c3c' : '#00d9ff'; ctx.lineWidth = n ? 2.5 : 1; line([cx, cy], [ex, ey]);
      ctx.fillStyle = n ? '#ff3c3c' : '#00d9ff'; ctx.font = 'bold 10px ' + MONO; ctx.textAlign = 'center'; ctx.fillText(d[2], cx + rx * 27, cy - ry * 27 * Math.cos(t) + 3);
    });
    var nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000].filter(function (v) { return v * s >= 60; })[0] || 2000, px = nice * s;
    ctx.strokeStyle = '#39ff14'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(14, H - 16); ctx.lineTo(14 + px, H - 16); ctx.moveTo(14, H - 21); ctx.lineTo(14, H - 11); ctx.moveTo(14 + px, H - 21); ctx.lineTo(14 + px, H - 11); ctx.stroke();
    ctx.fillStyle = '#39ff14'; ctx.font = '11px ' + MONO; ctx.textAlign = 'left'; ctx.fillText(nice + ' m', 18, H - 24);
  }
  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#080b10'; ctx.fillRect(0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    if (layers.grid) grid();
    hits = [];
    var list = St.project.features.filter(vis).map(function (f) {
      return { f: f, t: f.geometryType === 'point' ? 3 : (TIER[f.category] === undefined ? 2 : TIER[f.category]), d: P(f.center.x, f.center.y, 0)[2] };
    });
    list.sort(function (a, b) { return a.t - b.t || b.d - a.d; });
    list.forEach(function (o) { drawFeature(o.f); });
    hits.forEach(function (h) {
      if (h.f.id !== sel) return;
      ctx.strokeStyle = '#00d9ff'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 3]);
      if (h.c) { ctx.beginPath(); ctx.arc(h.c[0], h.c[1], 14, 0, 6.3); ctx.stroke(); }
      else { path(h.a.map(function (p) { return [p.x, p.y]; }), 1); ctx.stroke(); path(h.b.map(function (p) { return [p.x, p.y]; }), 1); ctx.stroke(); }
      ctx.setLineDash([]);
    });
    overlays();
    St.emit('status', { x: mouse.x, y: mouse.y, zoom: cam.zoom, count: St.project.features.length, meta: St.project.meta });
  }
  function loop() {
    var hz = St.project.features.some(function (f) { return (f.hazard_flag || f.category === 'hazard') && vis(f); });
    if (dirty || hz) { dirty = 0; render(); }
    requestAnimationFrame(loop);
  }
  function resize() {
    var r = cv.parentNode.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = hq ? Math.min(window.devicePixelRatio || 1, 3) : 1;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); dirty = 1;
  }
  function viewEvt() { St.emit('view', { yaw: cam.yaw, pitch: cam.pitch, north: Math.abs(cam.yaw % 360) < .5 }); dirty = 1; }
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
  function addAt(x, y) {
    var t = addType, d = DEF[t], f; St.snapshot();
    if (d) {
      var w = d.w / 2, e = d.d / 2;
      f = St.newFeature({ category: t, shapeType: 'extrude', geometryType: 'polygon', coordsMetric: [{ x: x - w, y: y - e }, { x: x + w, y: y - e }, { x: x + w, y: y + e }, { x: x - w, y: y + e }],
        center: { x: x, y: y }, height_m: d.h, floors: d.fl, roofType: d.roof, color: d.col, en_name: t });
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
      if (tool === 'add') { addAt(w.x, w.y); return; }
      if (tool === 'measure') { if (meas.length >= 2) meas = []; meas.push(w); St.emit('measure', minfo()); dirty = 1; return; }
      if (tool === 'select') {
        var h = hitAt(p.x, p.y);
        if (h) { select(h.f.id); drag = { m: 'move', x: w.x, y: w.y, moved: false }; return; }
        select(null);
      }
      drag = { m: 'pan', x: p.x, y: p.y, cx: cam.cx, cy: cam.cy };
    });
    cv.addEventListener('pointermove', function (e) {
      var p = pos(e), w; if (ptrs[e.pointerId]) ptrs[e.pointerId] = p;
      w = inv(p.x, p.y); mouse = { x: w.x, y: w.y }; dirty = 1;
      if (!drag) return;
      if (drag.m === 'pan') { cam.cx = drag.cx; cam.cy = drag.cy; var a = inv(drag.x, drag.y), b = inv(p.x, p.y); cam.cx = drag.cx + a.x - b.x; cam.cy = drag.cy + a.y - b.y; }
      else if (drag.m === 'move') {
        if (!drag.moved) { St.snapshot(); drag.moved = true; }
        var f = getSel(); if (f) { var dx = w.x - drag.x, dy = w.y - drag.y; f.center.x += dx; f.center.y += dy; f.coordsMetric.forEach(function (q) { q.x += dx; q.y += dy; }); }
        drag.x = w.x; drag.y = w.y;
      } else if (drag.m === 'orbit') {
        cam.yaw = (((cam.yaw + (p.x - drag.x) * .5) % 360) + 360) % 360; cam.pitch = cl(cam.pitch + (p.y - drag.y) * .3, 0, 75); drag.x = p.x; drag.y = p.y; viewEvt();
      } else if (drag.m === 'pinch' && Object.keys(ptrs).length >= 2) {
        var t = two(); cam.zoom = cl(drag.z * t.d / drag.d, .3, 5); cam.yaw = (((drag.y - (t.a - drag.a) / D) % 360) + 360) % 360; viewEvt();
      }
    });
    function up(e) { delete ptrs[e.pointerId]; if (!Object.keys(ptrs).length || (drag && drag.m === 'pinch')) { if (drag && drag.m === 'move' && drag.moved) St.emit('change'); drag = null; } }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', function (e) { e.preventDefault(); cam.zoom = cl(cam.zoom * (e.deltaY < 0 ? 1.1 : .9), .3, 5); dirty = 1; }, { passive: false });
  }

  S.Engine = {
    init: function (canvas) {
      cv = canvas; ctx = cv.getContext('2d'); bind(); resize();
      if (window.ResizeObserver) new ResizeObserver(resize).observe(cv.parentNode); else window.addEventListener('resize', resize);
      St.on('change', function () { if (sel && !getSel()) select(null); dirty = 1; });
      this.fitView(); loop();
    },
    setTool: function (t) { tool = t; if (t !== 'measure') { meas = []; St.emit('measure', null); } cv.style.cursor = t === 'pan' ? 'grab' : t === 'select' ? 'default' : 'crosshair'; dirty = 1; },
    setAddType: function (t) { addType = t; },
    setYaw: function (v) { cam.yaw = +v; viewEvt(); },
    setPitch: function (v) { cam.pitch = cl(+v, 0, 75); viewEvt(); },
    setQuality: function (h) { hq = !!h; resize(); },
    isHQ: function () { return hq; },
    setLayer: function (k, v) { layers[k] = v ? 1 : 0; dirty = 1; },
    toggleNorthUp: function () {
      var off = St.project.meta.trueNorthOffsetDeg || 0;
      cam.yaw = Math.abs(cam.yaw % 360) < .5 ? ((off % 360) + 360) % 360 : 0; viewEvt(); return Math.abs(cam.yaw) < .5;
    },
    fitView: function () {
      var fs = St.project.features;
      if (!fs.length) { cam.cx = 0; cam.cy = 0; cam.base = 3; cam.zoom = 1; viewEvt(); return; }
      var all = []; fs.forEach(function (f) { all = all.concat(f.coordsMetric); });
      var b = bb(all), w = Math.max(20, b.x1 - b.x0), d = Math.max(20, b.y1 - b.y0);
      cam.cx = (b.x0 + b.x1) / 2; cam.cy = (b.y0 + b.y1) / 2; cam.base = .85 * Math.min(W / w, H / d); cam.zoom = 1; viewEvt();
    },
    select: select, getSelected: getSel,
    deleteSelected: function () {
      var f = getSel(); if (!f) return;
      St.project.features = St.project.features.filter(function (x) { return x !== f; }); sel = null; St.emit('select', null); St.emit('change');
    },
    sizeOf: function (f) { var b = bb(f.coordsMetric); return { w: b.x1 - b.x0, d: b.y1 - b.y0 }; },
    resizeSelected: function (w, d) {
      var f = getSel(); if (!f || f.geometryType !== 'polygon' || !(w > 0) || !(d > 0)) return;
      var s = this.sizeOf(f), kx = s.w ? w / s.w : 1, ky = s.d ? d / s.d : 1, c = f.center;
      f.coordsMetric = f.coordsMetric.map(function (p) { return { x: c.x + (p.x - c.x) * kx, y: c.y + (p.y - c.y) * ky }; }); dirty = 1;
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
    getMeasure: minfo, fmt: fmt,
    render: function () { dirty = 1; }
  };
})(window.SOS);
